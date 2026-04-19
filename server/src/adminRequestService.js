import { createAuditEvent } from "./auditService.js";
import { ensureStaffActor } from "./actors.js";
import { clone } from "./clone.js";
import { conflict, notFound } from "./domainErrors.js";

export function listAdminRequests(snapshot, filters = {}) {
  return snapshot.requests.filter((request) => {
    if (filters.active === true && !request.active) {
      return false;
    }

    if (filters.status && request.status !== filters.status) {
      return false;
    }

    if (filters.studentId && request.studentId !== filters.studentId) {
      return false;
    }

    if (filters.offeringId && request.offeringId !== filters.offeringId) {
      return false;
    }

    return true;
  });
}

function getOffering(snapshot, offeringId) {
  return snapshot.offerings.find((item) => item.id === offeringId) ?? null;
}

function closeRequest(request, status, note) {
  request.active = false;
  request.status = status;
  request.resolution = note ?? request.resolution ?? null;
  request.message = note ?? request.message;
}

function adjustWaitlistForRequestResolution(offering, request, nextAction) {
  const currentlyActiveWaitlist = request.status === "waitlist" && request.active;

  if (currentlyActiveWaitlist && nextAction !== "waitlist" && offering.waitlistCount > 0) {
    offering.waitlistCount -= 1;
  }

  if (!currentlyActiveWaitlist && nextAction === "waitlist") {
    offering.waitlistCount += 1;
  }
}

export function resolveRequestForAdmin(
  snapshot,
  requestId,
  resolution,
  actor = { type: "staff", id: "staff-office-001" },
) {
  const nextSnapshot = clone(snapshot);
  const request = nextSnapshot.requests.find((item) => item.id === requestId);

  if (!request) {
    throw notFound("Request not found.", `Request ${requestId} was not found.`);
  }

  const effectiveActor = ensureStaffActor(actor);
  const before = clone(request);
  const offering = getOffering(nextSnapshot, request.offeringId);
  const beforeOffering = clone(offering);
  const resolutionType =
    resolution?.action ??
    (resolution?.status === "approved"
      ? "approve"
      : resolution?.status === "rejected"
        ? "reject"
        : resolution?.status === "waitlist"
          ? "waitlist"
          : "manual-close");
  const note = resolution?.note ?? "Resolved by the programme office.";
  let enrollment = null;

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${request.offeringId} was not found.`);
  }

  if (resolutionType === "approve") {
    const existingEnrollment = nextSnapshot.enrollments.find(
      (item) => item.studentId === request.studentId && item.offeringId === request.offeringId && item.status === "approved",
    );

    if (!existingEnrollment && offering.seatsTaken >= offering.capacity) {
      throw conflict("Offering is full.", `Offering ${offering.id} has no available seats for approval.`);
    }

    adjustWaitlistForRequestResolution(offering, request, "approve");

    if (!existingEnrollment) {
      offering.seatsTaken += 1;
    }
    closeRequest(request, "approved", note);
    enrollment = existingEnrollment ?? {
      id: `enr-${request.studentId}-${request.offeringId}`,
      studentId: request.studentId,
      offeringId: request.offeringId,
      status: "approved",
      source: "staff-resolution",
      createdAt: request.submittedAt,
    };

    if (!existingEnrollment) {
      nextSnapshot.enrollments.push(enrollment);
    }
  } else if (resolutionType === "reject") {
    adjustWaitlistForRequestResolution(offering, request, "reject");
    closeRequest(request, "rejected", note);
  } else if (resolutionType === "waitlist") {
    adjustWaitlistForRequestResolution(offering, request, "waitlist");
    request.active = true;
    request.status = "waitlist";
    request.resolution = note;
    request.message = note;
  } else {
    adjustWaitlistForRequestResolution(offering, request, "manual-close");
    closeRequest(request, "manuallyResolved", note);
  }

  nextSnapshot.auditEvents.push(
    createAuditEvent({
      actor: effectiveActor,
      action: "request-resolved",
      targetType: "request",
      targetId: requestId,
      before: { request: before, offering: beforeOffering, enrollment: null, resolutionType },
      after: {
        request: clone(request),
        offering: clone(offering),
        enrollment,
        resolutionType,
      },
      subjectStudentId: request.studentId,
    }),
  );

  return nextSnapshot;
}

export function previewRequestResolution(snapshot, requestId, resolution) {
  const request = snapshot.requests.find((item) => item.id === requestId);

  if (!request) {
    throw notFound("Request not found.", `Request ${requestId} was not found.`);
  }

  const currentOffering = getOffering(snapshot, request.offeringId);
  const currentEnrollment = snapshot.enrollments.find(
    (item) => item.studentId === request.studentId && item.offeringId === request.offeringId && item.status === "approved",
  ) ?? null;

  try {
    const nextSnapshot = resolveRequestForAdmin(snapshot, requestId, resolution, { type: "system", id: "preview" });
    nextSnapshot.auditEvents = snapshot.auditEvents;
    const nextRequest = nextSnapshot.requests.find((item) => item.id === requestId) ?? null;
    const nextOffering = getOffering(nextSnapshot, request.offeringId);
    const nextEnrollment = nextSnapshot.enrollments.find(
      (item) => item.studentId === request.studentId && item.offeringId === request.offeringId && item.status === "approved",
    ) ?? null;

    return {
      ok: true,
      headline: "Request resolution preview ready.",
      requestId,
      current: {
        request,
        offering: currentOffering,
        enrollment: currentEnrollment,
      },
      next: {
        request: nextRequest,
        offering: nextOffering,
        enrollment: nextEnrollment,
      },
      summary: {
        statusBefore: request.status,
        statusAfter: nextRequest?.status ?? request.status,
        activeBefore: request.active,
        activeAfter: nextRequest?.active ?? request.active,
        seatsTakenDelta: (nextOffering?.seatsTaken ?? 0) - (currentOffering?.seatsTaken ?? 0),
        waitlistDelta: (nextOffering?.waitlistCount ?? 0) - (currentOffering?.waitlistCount ?? 0),
        enrollmentCreated: !currentEnrollment && Boolean(nextEnrollment),
      },
    };
  } catch (error) {
    return {
      ok: false,
      headline: error?.headline ?? "Resolution preview unavailable.",
      message: error?.message ?? "This resolution cannot be applied under the current offering state.",
      requestId,
      current: {
        request,
        offering: currentOffering,
        enrollment: currentEnrollment,
      },
      next: null,
      summary: null,
    };
  }
}
