import { createAuditEvent } from "./auditService.js";
import { ensureStaffActor } from "./actors.js";
import { clone } from "./clone.js";
import { badRequest, conflict, notFound } from "./domainErrors.js";
import { formatRecordTimestamp } from "./requestTrackingService.js";

const RESOLUTION_TYPES = new Set(["approve", "reject", "waitlist", "manual-close"]);

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

export function getAllowedResolutionActions(offering, request) {
  if (!offering || !request?.active) {
    return [];
  }

  let allowed;

  if (offering.allocationPolicy === "locked") {
    allowed = ["manual-close"];
  } else if (offering.allocationPolicy === "lottery" || request.status === "lotteryQueued") {
    allowed = ["approve", "reject", "waitlist", "manual-close"];
  } else if (offering.allocationPolicy === "firstComeFirstServed") {
    allowed = request.status === "waitlist" ? ["approve", "reject", "manual-close"] : ["manual-close"];
  } else {
    allowed = ["approve", "reject", "waitlist", "manual-close"];
  }

  if (request.status === "waitlist") {
    allowed = allowed.filter((action) => action !== "waitlist");
  }

  return allowed;
}

function assertPolicyAllowsResolution(offering, request, resolutionType) {
  if (!RESOLUTION_TYPES.has(resolutionType)) {
    throw badRequest(
      "Unsupported request resolution.",
      "Use approve, reject, waitlist, or manual-close.",
    );
  }

  if (!request.active) {
    throw conflict(
      "Request is already closed.",
      `Request ${request.id} is no longer active and cannot be resolved again.`,
    );
  }

  if (getAllowedResolutionActions(offering, request).includes(resolutionType)) {
    return;
  }

  if (request.status === "waitlist" && resolutionType === "waitlist") {
    throw conflict(
      "Waitlist request requires waitlist handling.",
      "A waitlisted request can be approved, rejected, or closed without outcome; it cannot be moved to waitlist again.",
    );
  }

  if (offering.allocationPolicy === "firstComeFirstServed") {
    throw conflict(
      "FCFS request is handled automatically.",
      "Routine FCFS requests cannot be manually approved, rejected, or waitlisted from the staff review queue.",
    );
  }

  if (offering.allocationPolicy === "locked") {
    throw conflict(
      "Locked offering cannot use ordinary resolution.",
      "Locked offering requests can only be closed without outcome from the staff console.",
    );
  }

  throw conflict(
    "Resolution not allowed for this request.",
    `The ${resolutionType} action is not available for request ${request.id} under the current offering policy.`,
  );
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

  assertPolicyAllowsResolution(offering, request, resolutionType);

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

// Known prototype limitation: promotion trusts the constraint check performed
// when the request joined the waitlist. Active waitlist requests already count
// toward the student's planned load and clash checks on later submissions, so
// a conflicting plan normally cannot form, but a staff override created in the
// meantime is not re-validated here.
export function promoteWaitlistedRequest(
  snapshot,
  requestId,
  actor = { type: "system", id: "system-waitlist" },
) {
  const nextSnapshot = clone(snapshot);
  const request = nextSnapshot.requests.find((item) => item.id === requestId);

  if (!request || !request.active || request.status !== "waitlist") {
    throw conflict(
      "Request cannot be promoted.",
      `Request ${requestId} is not an active waitlist request.`,
    );
  }

  const offering = getOffering(nextSnapshot, request.offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${request.offeringId} was not found.`);
  }

  if (offering.seatsTaken >= offering.capacity) {
    throw conflict("Offering is full.", `Offering ${offering.id} has no available seats for promotion.`);
  }

  const before = clone(request);
  const beforeOffering = clone(offering);
  const note = "Promoted from the waitlist after a seat became available.";

  if (offering.waitlistCount > 0) {
    offering.waitlistCount -= 1;
  }

  const existingEnrollment = nextSnapshot.enrollments.find(
    (item) => item.studentId === request.studentId && item.offeringId === request.offeringId && item.status === "approved",
  );
  let enrollment = existingEnrollment ?? null;

  if (!existingEnrollment) {
    offering.seatsTaken += 1;
    enrollment = {
      id: `enr-${request.studentId}-${request.offeringId}`,
      studentId: request.studentId,
      offeringId: request.offeringId,
      status: "approved",
      source: "waitlist-promotion",
      createdAt: formatRecordTimestamp(),
    };
    nextSnapshot.enrollments.push(enrollment);
  }

  closeRequest(request, "approved", note);
  nextSnapshot.auditEvents.push(
    createAuditEvent({
      actor,
      action: "waitlist-promoted",
      targetType: "request",
      targetId: requestId,
      before: { request: before, offering: beforeOffering, enrollment: existingEnrollment ?? null },
      after: { request: clone(request), offering: clone(offering), enrollment },
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
import { createAuditEvent } from "./auditService.js";
import { ensureStaffActor } from "./actors.js";
import { clone } from "./clone.js";
import { badRequest, conflict, notFound } from "./domainErrors.js";

const RESOLUTION_TYPES = new Set(["approve", "reject", "waitlist", "manual-close"]);

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

function assertPolicyAllowsResolution(offering, request, resolutionType) {
  if (!RESOLUTION_TYPES.has(resolutionType)) {
    throw badRequest(
      "Unsupported request resolution.",
      "Use approve, reject, waitlist, or manual-close.",
    );
  }

  if (!request.active) {
    throw conflict(
      "Request is already closed.",
      `Request ${request.id} is no longer active and cannot be resolved again.`,
    );
  }

  if (offering.allocationPolicy === "lottery" || request.status === "lotteryQueued") {
    throw conflict(
      "Lottery request requires lottery workflow.",
      "Lottery pool requests cannot be approved, rejected, waitlisted, or closed from the ordinary staff review queue.",
    );
  }

  if (request.status === "waitlist" && !["approve", "reject", "manual-close"].includes(resolutionType)) {
    throw conflict(
      "Waitlist request requires waitlist handling.",
      "A waitlisted request can be approved, rejected, or closed without outcome; it cannot be moved to waitlist again.",
    );
  }

  if (offering.allocationPolicy === "firstComeFirstServed" && request.status !== "waitlist" && resolutionType !== "manual-close") {
    throw conflict(
      "FCFS request is handled automatically.",
      "Routine FCFS requests cannot be manually approved, rejected, or waitlisted from the staff review queue.",
    );
  }

  if (offering.allocationPolicy === "locked" && resolutionType !== "manual-close") {
    throw conflict(
      "Locked offering cannot use ordinary resolution.",
      "Locked offering requests can only be closed without outcome from the staff console.",
    );
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

  assertPolicyAllowsResolution(offering, request, resolutionType);

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
