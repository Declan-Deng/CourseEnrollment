import { getCatalogOffering } from "./catalogService.js";
import { createAuditEvent } from "./auditService.js";
import { clone } from "./clone.js";
import { previewEnrollmentDecision } from "./enrollmentDecisionService.js";
import { formatRecordTimestamp } from "./requestTrackingService.js";

function createActionResult({ ok, tone, headline, reasons, outcome }) {
  return { ok, tone, headline, reasons, outcome };
}

function createRejectedAction(headline, reasons) {
  return createActionResult({
    ok: false,
    tone: "error",
    headline,
    reasons,
    outcome: "rejected",
  });
}

function ensureActor(snapshot, actor = null) {
  if (actor?.type && actor?.id) {
    return actor;
  }

  return {
    type: "student",
    id: snapshot.student.id,
  };
}

function nextRecordId(snapshot) {
  snapshot.studentMeta.recordSequence = Number.isFinite(snapshot.studentMeta.recordSequence)
    ? snapshot.studentMeta.recordSequence + 1
    : 1;
  return `req-${snapshot.student.id}-${snapshot.studentMeta.recordSequence}`;
}

function createRequestRecord(snapshot, offeringId, status, message, active) {
  return {
    id: nextRecordId(snapshot),
    studentId: snapshot.student.id,
    offeringId,
    status,
    active,
    submittedAt: formatRecordTimestamp(),
    message,
    resolution: null,
  };
}

function findActiveRequest(snapshot, offeringId) {
  return snapshot.requests.find((request) => request.offeringId === offeringId && request.active) ?? null;
}

function getOfferingMutable(snapshot, offeringId) {
  return snapshot.offerings.find((offering) => offering.id === offeringId) ?? null;
}

function getSeedStudentState(seedSnapshot) {
  return {
    student: clone(seedSnapshot.student),
    enrollments: clone(seedSnapshot.enrollments ?? []),
    requests: clone(seedSnapshot.requests ?? []),
    overrides: clone(seedSnapshot.overrides ?? []),
    studentMeta: clone(seedSnapshot.studentMeta ?? {}),
  };
}

function createEnrollmentRecord(snapshot, offeringId) {
  return {
    id: `enr-${snapshot.student.id}-${offeringId}`,
    studentId: snapshot.student.id,
    offeringId,
    status: "approved",
    source: "student-request",
    createdAt: formatRecordTimestamp(),
  };
}

export function submitStudentRequest(snapshot, offeringId, { actor } = {}) {
  const nextSnapshot = clone(snapshot);
  const decision = previewEnrollmentDecision(nextSnapshot, offeringId);
  const offering = getOfferingMutable(nextSnapshot, offeringId);

  if (!offering || !decision.ok) {
    return { snapshot, decision };
  }

  const effectiveActor = ensureActor(nextSnapshot, actor);
  const beforeOffering = clone(offering);

  if (decision.outcome === "approved") {
    nextSnapshot.enrollments.push(createEnrollmentRecord(nextSnapshot, offeringId));
    offering.seatsTaken += 1;
  }

  if (decision.outcome === "waitlist") {
    offering.waitlistCount += 1;
  }

  const requestRecord = createRequestRecord(
    nextSnapshot,
    offeringId,
    decision.outcome,
    decision.outcome === "approved" ? "Approved to enrol." : decision.headline,
    decision.outcome !== "approved",
  );
  nextSnapshot.requests.unshift(requestRecord);
  nextSnapshot.auditEvents.push(
    createAuditEvent(
      {
        actor: effectiveActor,
        action: "request-submitted",
        targetType: "offering",
        targetId: offeringId,
        before: { offering: beforeOffering, decision: null },
        after: { offering: clone(offering), decision, request: requestRecord },
        subjectStudentId: nextSnapshot.student.id,
      },
    ),
  );

  return { snapshot: nextSnapshot, decision };
}

export function cancelStudentRequest(snapshot, offeringId, { actor } = {}) {
  const nextSnapshot = clone(snapshot);
  const request = findActiveRequest(nextSnapshot, offeringId);

  if (!request) {
    return {
      snapshot,
      decision: createRejectedAction("No active request found.", [
        "The selected course does not have a cancellable request.",
      ]),
    };
  }

  const offering = getOfferingMutable(nextSnapshot, offeringId);
  const effectiveActor = ensureActor(nextSnapshot, actor);
  const beforeRequest = clone(request);
  const beforeOffering = clone(offering);

  if (request.status === "waitlist" && offering?.waitlistCount > 0) {
    offering.waitlistCount -= 1;
  }

  request.active = false;
  request.status = "cancelled";
  request.submittedAt = formatRecordTimestamp();
  request.message = "Request cancelled by student.";

  nextSnapshot.auditEvents.push(
    createAuditEvent(
      {
        actor: effectiveActor,
        action: "request-cancelled",
        targetType: "request",
        targetId: request.id,
        before: { request: beforeRequest, offering: beforeOffering },
        after: { request: clone(request), offering: clone(offering) },
        subjectStudentId: nextSnapshot.student.id,
      },
    ),
  );

  return {
    snapshot: nextSnapshot,
    decision: createActionResult({
      ok: true,
      tone: "info",
      headline: "Request cancelled.",
      reasons: ["The course was removed from your pending pipeline."],
      outcome: "cancelled",
    }),
  };
}

export function dropStudentEnrollment(snapshot, offeringId, { actor } = {}) {
  const nextSnapshot = clone(snapshot);
  const enrollmentIndex = nextSnapshot.enrollments.findIndex(
    (enrollment) => enrollment.offeringId === offeringId && enrollment.status === "approved",
  );

  if (enrollmentIndex === -1) {
    return {
      snapshot,
      decision: createRejectedAction("Course is not in the approved plan.", [
        "Only approved courses can be dropped.",
      ]),
    };
  }

  const offering = getOfferingMutable(nextSnapshot, offeringId);

  if (!offering?.dropWindow?.isOpen) {
    const isManualLock = offering?.allocationPolicy === "locked";

    return {
      snapshot,
      decision: createRejectedAction(
        isManualLock ? "Manual drop route required for this course." : "Drop period closed for this course.",
        isManualLock
          ? [
              "The programme office locked this record for manual handling.",
              `Next relevant date: ${nextSnapshot.semester.keyDates?.resultCheckWindow ?? "record review window"}.`,
            ]
          : [
              `Online add/drop closed on ${nextSnapshot.semester.keyDates?.addDropClose ?? "the add/drop deadline"}.`,
              `Contact ${nextSnapshot.semester.keyDates?.supportContact ?? "the programme office"} if an exceptional manual change is needed.`,
            ],
      ),
    };
  }

  const effectiveActor = ensureActor(nextSnapshot, actor);
  const beforeOffering = clone(offering);
  const removedEnrollment = nextSnapshot.enrollments.splice(enrollmentIndex, 1)[0];

  if (offering.seatsTaken > 0) {
    offering.seatsTaken -= 1;
  }

  const droppedRecord = createRequestRecord(
    nextSnapshot,
    offeringId,
    "dropped",
    "Approved course dropped by student.",
    false,
  );
  nextSnapshot.requests.unshift(droppedRecord);
  nextSnapshot.auditEvents.push(
    createAuditEvent(
      {
        actor: effectiveActor,
        action: "enrollment-dropped",
        targetType: "enrollment",
        targetId: removedEnrollment.id,
        before: { enrollment: removedEnrollment, offering: beforeOffering },
        after: { enrollment: null, offering: clone(offering), request: droppedRecord },
        subjectStudentId: nextSnapshot.student.id,
      },
    ),
  );

  return {
    snapshot: nextSnapshot,
    decision: createActionResult({
      ok: true,
      tone: "warn",
      headline: "Course dropped.",
      reasons: [`${getCatalogOffering(nextSnapshot, offeringId)?.code ?? offeringId} subclass ${offering.subclass} has been removed from your current plan.`],
      outcome: "dropped",
    }),
  };
}

export function resetStudentState(snapshot, seedSnapshot, { actor } = {}) {
  const nextSnapshot = clone(snapshot);
  const seedState = getSeedStudentState(seedSnapshot);
  const effectiveActor = ensureActor(nextSnapshot, actor ?? { type: "system", id: "system-reset" });

  const currentEnrollmentIds = new Set(nextSnapshot.enrollments.map((enrollment) => enrollment.offeringId));
  const seedEnrollmentIds = new Set(seedState.enrollments.map((enrollment) => enrollment.offeringId));
  const currentWaitlistIds = new Set(
    nextSnapshot.requests.filter((request) => request.active && request.status === "waitlist").map((request) => request.offeringId),
  );
  const seedWaitlistIds = new Set(
    seedState.requests.filter((request) => request.active && request.status === "waitlist").map((request) => request.offeringId),
  );

  for (const offering of nextSnapshot.offerings) {
    const before = clone(offering);

    if (currentEnrollmentIds.has(offering.id) && !seedEnrollmentIds.has(offering.id) && offering.seatsTaken > 0) {
      offering.seatsTaken -= 1;
    }
    if (!currentEnrollmentIds.has(offering.id) && seedEnrollmentIds.has(offering.id)) {
      offering.seatsTaken += 1;
    }
    if (currentWaitlistIds.has(offering.id) && !seedWaitlistIds.has(offering.id) && offering.waitlistCount > 0) {
      offering.waitlistCount -= 1;
    }
    if (!currentWaitlistIds.has(offering.id) && seedWaitlistIds.has(offering.id)) {
      offering.waitlistCount += 1;
    }

    if (
      before.seatsTaken !== offering.seatsTaken ||
      before.waitlistCount !== offering.waitlistCount
    ) {
      nextSnapshot.auditEvents.push(
        createAuditEvent(
          {
            actor: effectiveActor,
            action: "offering-rebalanced",
            targetType: "offering",
            targetId: offering.id,
            before,
            after: clone(offering),
            subjectStudentId: nextSnapshot.student.id,
          },
        ),
      );
    }
  }

  nextSnapshot.student = seedState.student;
  nextSnapshot.enrollments = seedState.enrollments;
  nextSnapshot.requests = seedState.requests;
  nextSnapshot.overrides = seedState.overrides;
  nextSnapshot.studentMeta = seedState.studentMeta;
  nextSnapshot.auditEvents = nextSnapshot.auditEvents.filter(
    (event) => event.subjectStudentId !== nextSnapshot.student.id && event.actorId !== nextSnapshot.student.id,
  );
  nextSnapshot.auditEvents.push(
    createAuditEvent(
      {
        actor: effectiveActor,
        action: "student-reset",
        targetType: "student",
        targetId: seedState.student.id,
        before: { reset: true },
        after: { reset: true },
        subjectStudentId: seedState.student.id,
      },
    ),
  );

  return nextSnapshot;
}
