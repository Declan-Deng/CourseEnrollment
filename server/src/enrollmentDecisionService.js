import { evaluateEnrollment, summarizeCourseState } from "./constraints.js";
import { createCatalogIndexes, listCatalogOfferings } from "./catalogService.js";

function buildPlannerState(snapshot) {
  const { offeringsById } = createCatalogIndexes(snapshot);
  const listCreditLimits = snapshot.rules?.listCreditLimits ?? snapshot.student.listCreditLimits ?? {};

  return {
    semester: snapshot.semester,
    student: {
      ...snapshot.student,
      listCreditLimits,
      crossFacultyCreditLimit:
        snapshot.rules?.crossFacultyCreditLimit ?? snapshot.student.crossFacultyCreditLimit,
      semesterStudyLoadLimit:
        snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    },
    courses: listCatalogOfferings(snapshot),
    approvedCourseIds: snapshot.enrollments
      .filter((enrollment) => enrollment.status === "approved")
      .map((enrollment) => enrollment.offeringId)
      .filter((offeringId) => offeringsById.has(offeringId)),
    requestRecords: snapshot.requests.map((request) => ({
      id: request.id,
      courseId: request.offeringId,
      status: request.status,
      active: request.active,
      submittedAt: request.submittedAt,
      message: request.message,
    })),
    overrides: snapshot.overrides ?? [],
  };
}

export function previewEnrollmentDecision(snapshot, offeringId) {
  return evaluateEnrollment(buildPlannerState(snapshot), offeringId);
}

export function summarizeOfferingState(snapshot, offeringId, decision = null) {
  return summarizeCourseState(buildPlannerState(snapshot), offeringId, decision ?? undefined);
}
