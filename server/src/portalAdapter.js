import { getPolicyLabel } from "./constraints.js";
import { getCatalogOffering, getStudentPlanningOfferings } from "./catalogService.js";
import { previewEnrollmentDecision, summarizeOfferingState } from "./enrollmentDecisionService.js";
import { buildRequestStatusView, createRequestRecordView } from "./requestTrackingService.js";
import { formatIsoDate, getReferenceDate, toIsoDate } from "./windowDates.js";

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getDemandBand(offering) {
  const ratio = offering.capacity === 0 ? 0 : offering.seatsTaken / offering.capacity;

  if (ratio >= 1 || offering.waitlistCount >= 10) {
    return "High demand";
  }

  if (ratio >= 0.8 || offering.waitlistCount > 0) {
    return "Moderate demand";
  }

  return "Open availability";
}

function getCapacityClaimLabel(offering) {
  return `${offering.seatsTaken} / ${offering.capacity} claimed`;
}

function getCapacityView(offering) {
  const seatsRemaining = Math.max(offering.capacity - offering.seatsTaken, 0);
  const demandBand = getDemandBand(offering);
  const capacityLabel = getCapacityClaimLabel(offering);

  if (offering.allocationPolicy === "firstComeFirstServed") {
    return {
      primary: `${formatCountLabel(seatsRemaining, "seat")} left`,
      secondary: `${offering.waitlistCount} waiting`,
      capacityLabel,
    };
  }

  if (offering.allocationPolicy === "lottery") {
    return {
      primary: demandBand,
      secondary: `Lottery pool · ${offering.seatsTaken}/${offering.capacity} seats claimed before draw`,
      capacityLabel,
    };
  }

  if (offering.allocationPolicy === "priorityReview") {
    return {
      primary: demandBand,
      secondary: "Faculty review queue",
      capacityLabel,
    };
  }

  return {
    primary: "Managed by programme office",
    secondary: "Online changes unavailable",
    capacityLabel,
  };
}

// Notes must agree with the date-aware requestOpen/dropOpen flags computed by
// the catalog service: a window whose closesOn has passed is closed even when
// its isOpen toggle was never flipped.
function getRequestNote(offering, semester) {
  if (offering.requestOpen) {
    return `Request window open until ${formatIsoDate(offering.requestWindow?.closesOn ?? semester.keyDates?.requestClose ?? "the deadline")}.`;
  }

  if (offering.requestWindow?.isOpen && offering.requestWindow?.closesOn) {
    return `Request window closed on ${formatIsoDate(offering.requestWindow.closesOn)}. Check final records during ${semester.keyDates?.resultCheckWindow ?? "the final record review window"}.`;
  }

  return `Request closed. Check final records during ${semester.keyDates?.resultCheckWindow ?? "the final record review window"}.`;
}

function getDropNote(offering, semester) {
  if (offering.dropOpen) {
    return `Online Add / Drop available until ${formatIsoDate(offering.dropWindow?.closesOn ?? semester.keyDates?.addDropClose ?? "the deadline")}.`;
  }

  if (offering.dropWindow?.isOpen && offering.dropWindow?.closesOn) {
    return `Online Add / Drop closed on ${formatIsoDate(offering.dropWindow.closesOn)}. Contact ${semester.keyDates?.supportContact ?? "the programme office"}.`;
  }

  return `Online Add / Drop is not available now. Contact ${semester.keyDates?.supportContact ?? "the programme office"}.`;
}

function buildStudentActionSummary({
  approvedCourses,
  activeRequestRecords,
  withdrawableRequests,
  plannedCredits,
  confirmedCredits,
  creditLimit,
  semester,
  requestStatusView,
}) {
  const nextDeadline = withdrawableRequests.length > 0
    ? semester?.keyDates?.requestClose ?? null
    : semester?.keyDates?.resultCheckWindow ?? semester?.keyDates?.requestClose ?? null;
  const primaryAction = activeRequestRecords.length > 0
    ? {
        label: withdrawableRequests.length > 0 ? "Manage active requests" : "View enrolment results",
        page: withdrawableRequests.length > 0 ? "cancel" : "results",
      }
    : approvedCourses.length > 0
      ? {
          label: "View enrolment results",
          page: "results",
        }
      : {
          label: "Course Center",
          page: "add",
        };

  return {
    enrolledCount: approvedCourses.length,
    activeRequestCount: activeRequestRecords.length,
    confirmedCredits,
    activeRequestCredits: Math.max(plannedCredits - confirmedCredits, 0),
    plannedCredits,
    nextDeadline,
    urgentActions: requestStatusView?.nextAction?.actions ?? [],
    primaryAction,
  };
}

function buildAnnouncementContent(semester) {
  const content = semester?.announcementContent
    ? {
        ...semester.announcementContent,
        keyDates: {
          ...(semester.announcementContent?.keyDates ?? {}),
          ...(semester.keyDates ?? {}),
        },
      }
    : null;

  if (!content) {
    return null;
  }

  const now = getReferenceDate(semester?.currentDate);
  const requestClose = semester?.keyDates?.requestClose ?? null;
  const addDropClose = semester?.keyDates?.addDropClose ?? null;
  const resultCheckWindow = semester?.keyDates?.resultCheckWindow ?? null;
  const requestClosed =
    Boolean(requestClose) && new Date(`${toIsoDate(requestClose)}T23:59:59`).getTime() < now.getTime();
  const addDropClosed =
    Boolean(addDropClose) && new Date(`${toIsoDate(addDropClose)}T23:59:59`).getTime() < now.getTime();

  content.highlights = [
    {
      label: "Current cycle",
      value: requestClosed && addDropClosed ? "Semester 2 online enrolment cycle completed" : "Semester 2 online enrolment currently active",
    },
    { label: "Request deadline", value: requestClose ?? "Not available" },
    { label: "Add / Drop deadline", value: addDropClose ?? "Not available" },
    { label: "Record check", value: resultCheckWindow ?? "Not available" },
  ];

  return content;
}

function toPortalCourse(snapshot, offering) {
  const preview = previewEnrollmentDecision(snapshot, offering.id);
  const capacity = offering.seats?.capacity ?? offering.capacity ?? null;
  const taken = offering.seats?.taken ?? offering.seatsTaken ?? null;

  return {
    id: offering.id,
    code: offering.code,
    title: offering.title,
    faculty: offering.faculty,
    department: offering.department,
    semester: offering.semester,
    subclass: offering.subclass,
    credits: offering.credits,
    listType: offering.listType,
    allocationPolicy: offering.allocationPolicy,
    crossFaculty: offering.crossFaculty,
    requestOpen: offering.requestOpen,
    dropOpen: offering.dropOpen,
    schedule: offering.schedule,
    policyLabel: getPolicyLabel(offering.allocationPolicy),
    seats: {
      capacity,
      taken,
      remaining:
        Number.isFinite(capacity) && Number.isFinite(taken) ? Math.max(capacity - taken, 0) : null,
      waitlist: offering.seats?.waitlist ?? offering.waitlistCount ?? 0,
    },
    capacityView: getCapacityView(offering),
    requestNote: getRequestNote(offering, snapshot.semester),
    dropNote: getDropNote(offering, snapshot.semester),
    currentState: summarizeOfferingState(snapshot, offering.id, preview),
    preview,
  };
}

export function buildBootstrapResponse(snapshot) {
  const catalogOfferings = snapshot.offerings
    .map((offering) => getCatalogOffering(snapshot, offering.id))
    .filter(Boolean)
    .map((offering) => toPortalCourse(snapshot, offering));

  const courseById = new Map(catalogOfferings.map((course) => [course.id, course]));
  const approvedCourses = snapshot.enrollments
    .filter((enrollment) => enrollment.status === "approved")
    .map((enrollment) => courseById.get(enrollment.offeringId))
    .filter(Boolean);
  const requestRecords = snapshot.requests
    .map((request) => {
      const course = courseById.get(request.offeringId);

      if (!course) {
        return null;
      }

      return createRequestRecordView(
        {
          ...request,
          courseId: request.offeringId,
        },
        course,
        snapshot.semester,
      );
    })
    .filter(Boolean);
  const { approvedOfferings, activeRequestOfferings } = getStudentPlanningOfferings(snapshot);
  const activeRequestRecords = requestRecords.filter((record) => record.active);
  const confirmedCredits = approvedOfferings
    .filter((course) => course.credits > 0 && course.listType !== "Diss")
    .reduce((total, course) => total + course.credits, 0);
  const plannedCredits = [...approvedOfferings, ...activeRequestOfferings]
    .filter((course) => course.credits > 0 && course.listType !== "Diss")
    .reduce((total, course) => total + course.credits, 0);
  const requestStatusView = buildRequestStatusView({
    approvedCourses,
    requestRecords,
    semester: snapshot.semester,
    creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    plannedCredits,
  });
  const announcementContent = buildAnnouncementContent(snapshot.semester);
  const studentActionSummary = buildStudentActionSummary({
    approvedCourses,
    activeRequestRecords,
    withdrawableRequests: requestStatusView.withdrawableRequests,
    plannedCredits,
    confirmedCredits,
    creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    semester: snapshot.semester,
    requestStatusView,
  });

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      currentDate: snapshot.semester?.currentDate ?? null,
    },
    semester: snapshot.semester,
    student: snapshot.student,
    announcementContent,
    summary: {
      plannedCredits,
      creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
      requestStatusSummary: {
        enrolled: approvedCourses.length,
        active: activeRequestRecords.length,
        archived: requestRecords.length - activeRequestRecords.length,
      },
      windowSummary: {
        requestClose: snapshot.semester.keyDates?.requestClose ?? null,
        addDropClose: snapshot.semester.keyDates?.addDropClose ?? null,
        resultCheckWindow: snapshot.semester.keyDates?.resultCheckWindow ?? null,
        lotteryPublish: snapshot.semester.keyDates?.lotteryPublish ?? null,
        supportContact: snapshot.semester.keyDates?.supportContact ?? null,
        supportEmail: snapshot.semester.keyDates?.supportEmail ?? null,
      },
      studentActionSummary,
      confirmedCredits,
    },
    courses: catalogOfferings,
    approvedCourses,
    requestRecords,
    activeRequestRecords,
    requestStatusView,
    timetable: [
      ...approvedOfferings.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        subclass: course.subclass,
        credits: course.credits,
        schedule: course.schedule,
        tone: "approved",
        department: course.department,
      })),
      ...activeRequestOfferings.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        subclass: course.subclass,
        credits: course.credits,
        schedule: course.schedule,
        tone: "pipeline",
        department: course.department,
      })),
    ],
    adminFlags: {
      roleReady: true,
      sharedCourseSupply: true,
      constraintOverrideReady: true,
    },
  };
}
import { getPolicyLabel } from "./constraints.js";
import { getCatalogOffering, getStudentPlanningOfferings } from "./catalogService.js";
import { previewEnrollmentDecision, summarizeOfferingState } from "./enrollmentDecisionService.js";
import { buildRequestStatusView, createRequestRecordView } from "./requestTrackingService.js";
import { formatIsoDate, getReferenceDate, toIsoDate } from "./windowDates.js";

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getDemandBand(offering) {
  const ratio = offering.capacity === 0 ? 0 : offering.seatsTaken / offering.capacity;

  if (ratio >= 1 || offering.waitlistCount >= 10) {
    return "High demand";
  }

  if (ratio >= 0.8 || offering.waitlistCount > 0) {
    return "Moderate demand";
  }

  return "Open availability";
}

function getCapacityClaimLabel(offering) {
  return `${offering.seatsTaken} / ${offering.capacity} claimed`;
}

function getCapacityView(offering) {
  const seatsRemaining = Math.max(offering.capacity - offering.seatsTaken, 0);
  const demandBand = getDemandBand(offering);
  const capacityLabel = getCapacityClaimLabel(offering);

  if (offering.allocationPolicy === "firstComeFirstServed") {
    return {
      primary: `${formatCountLabel(seatsRemaining, "seat")} left`,
      secondary: `${offering.waitlistCount} waiting`,
      capacityLabel,
    };
  }

  if (offering.allocationPolicy === "lottery") {
    return {
      primary: demandBand,
      secondary: `Lottery pool · ${offering.seatsTaken}/${offering.capacity} seats claimed before draw`,
      capacityLabel,
    };
  }

  if (offering.allocationPolicy === "priorityReview") {
    return {
      primary: demandBand,
      secondary: "Faculty review queue",
      capacityLabel,
    };
  }

  return {
    primary: "Managed by programme office",
    secondary: "Online changes unavailable",
    capacityLabel,
  };
}

function getRequestNote(offering, semester) {
  if (offering.requestWindow?.isOpen) {
    return `Request window open until ${formatIsoDate(offering.requestWindow?.closesOn ?? semester.keyDates?.requestClose ?? "the deadline")}.`;
  }

  return `Request closed. Check final records during ${semester.keyDates?.resultCheckWindow ?? "the final record review window"}.`;
}

function getDropNote(offering, semester) {
  if (offering.dropWindow?.isOpen) {
    return `Online Add / Drop available until ${formatIsoDate(offering.dropWindow?.closesOn ?? semester.keyDates?.addDropClose ?? "the deadline")}.`;
  }

  return `Online Add / Drop is not available now. Contact ${semester.keyDates?.supportContact ?? "the programme office"}.`;
}

function buildStudentActionSummary({
  approvedCourses,
  activeRequestRecords,
  withdrawableRequests,
  plannedCredits,
  confirmedCredits,
  creditLimit,
  semester,
  requestStatusView,
}) {
  const nextDeadline = withdrawableRequests.length > 0
    ? semester?.keyDates?.requestClose ?? null
    : semester?.keyDates?.resultCheckWindow ?? semester?.keyDates?.requestClose ?? null;
  const primaryAction = activeRequestRecords.length > 0
    ? {
        label: withdrawableRequests.length > 0 ? "Manage active requests" : "View enrolment results",
        page: withdrawableRequests.length > 0 ? "cancel" : "results",
      }
    : approvedCourses.length > 0
      ? {
          label: "View enrolment results",
          page: "results",
        }
      : {
          label: "Course Center",
          page: "add",
        };

  return {
    enrolledCount: approvedCourses.length,
    activeRequestCount: activeRequestRecords.length,
    confirmedCredits,
    activeRequestCredits: Math.max(plannedCredits - confirmedCredits, 0),
    plannedCredits,
    nextDeadline,
    urgentActions: requestStatusView?.nextAction?.actions ?? [],
    primaryAction,
  };
}

function buildAnnouncementContent(semester) {
  const content = semester?.announcementContent
    ? {
        ...semester.announcementContent,
        keyDates: {
          ...(semester.announcementContent?.keyDates ?? {}),
          ...(semester.keyDates ?? {}),
        },
      }
    : null;

  if (!content) {
    return null;
  }

  const now = getReferenceDate(semester?.currentDate);
  const requestClose = semester?.keyDates?.requestClose ?? null;
  const addDropClose = semester?.keyDates?.addDropClose ?? null;
  const resultCheckWindow = semester?.keyDates?.resultCheckWindow ?? null;
  const requestClosed =
    Boolean(requestClose) && new Date(`${toIsoDate(requestClose)}T23:59:59`).getTime() < now.getTime();
  const addDropClosed =
    Boolean(addDropClose) && new Date(`${toIsoDate(addDropClose)}T23:59:59`).getTime() < now.getTime();

  content.highlights = [
    {
      label: "Current cycle",
      value: requestClosed && addDropClosed ? "Semester 2 online enrolment cycle completed" : "Semester 2 online enrolment currently active",
    },
    { label: "Request deadline", value: requestClose ?? "Not available" },
    { label: "Add / Drop deadline", value: addDropClose ?? "Not available" },
    { label: "Record check", value: resultCheckWindow ?? "Not available" },
  ];

  return content;
}

function toPortalCourse(snapshot, offering) {
  const preview = previewEnrollmentDecision(snapshot, offering.id);

  return {
    id: offering.id,
    code: offering.code,
    title: offering.title,
    faculty: offering.faculty,
    department: offering.department,
    semester: offering.semester,
    subclass: offering.subclass,
    credits: offering.credits,
    listType: offering.listType,
    allocationPolicy: offering.allocationPolicy,
    crossFaculty: offering.crossFaculty,
    requestOpen: offering.requestOpen,
    dropOpen: offering.dropOpen,
    schedule: offering.schedule,
    policyLabel: getPolicyLabel(offering.allocationPolicy),
    capacityView: getCapacityView(offering),
    requestNote: getRequestNote(offering, snapshot.semester),
    dropNote: getDropNote(offering, snapshot.semester),
    currentState: summarizeOfferingState(snapshot, offering.id, preview),
    preview,
  };
}

export function buildBootstrapResponse(snapshot) {
  const catalogOfferings = snapshot.offerings
    .map((offering) => getCatalogOffering(snapshot, offering.id))
    .filter(Boolean)
    .map((offering) => toPortalCourse(snapshot, offering));

  const courseById = new Map(catalogOfferings.map((course) => [course.id, course]));
  const approvedCourses = snapshot.enrollments
    .filter((enrollment) => enrollment.status === "approved")
    .map((enrollment) => courseById.get(enrollment.offeringId))
    .filter(Boolean);
  const requestRecords = snapshot.requests
    .map((request) => {
      const course = courseById.get(request.offeringId);

      if (!course) {
        return null;
      }

      return createRequestRecordView(
        {
          ...request,
          courseId: request.offeringId,
        },
        course,
        snapshot.semester,
      );
    })
    .filter(Boolean);
  const { approvedOfferings, activeRequestOfferings } = getStudentPlanningOfferings(snapshot);
  const activeRequestRecords = requestRecords.filter((record) => record.active);
  const confirmedCredits = approvedOfferings
    .filter((course) => course.credits > 0 && course.listType !== "Diss")
    .reduce((total, course) => total + course.credits, 0);
  const plannedCredits = [...approvedOfferings, ...activeRequestOfferings]
    .filter((course) => course.credits > 0 && course.listType !== "Diss")
    .reduce((total, course) => total + course.credits, 0);
  const requestStatusView = buildRequestStatusView({
    approvedCourses,
    requestRecords,
    semester: snapshot.semester,
    creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    plannedCredits,
  });
  const announcementContent = buildAnnouncementContent(snapshot.semester);
  const studentActionSummary = buildStudentActionSummary({
    approvedCourses,
    activeRequestRecords,
    withdrawableRequests: requestStatusView.withdrawableRequests,
    plannedCredits,
    confirmedCredits,
    creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    semester: snapshot.semester,
    requestStatusView,
  });

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      currentDate: snapshot.semester?.currentDate ?? null,
    },
    semester: snapshot.semester,
    student: snapshot.student,
    announcementContent,
    summary: {
      plannedCredits,
      creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
      requestStatusSummary: {
        enrolled: approvedCourses.length,
        active: activeRequestRecords.length,
        archived: requestRecords.length - activeRequestRecords.length,
      },
      windowSummary: {
        requestClose: snapshot.semester.keyDates?.requestClose ?? null,
        addDropClose: snapshot.semester.keyDates?.addDropClose ?? null,
        resultCheckWindow: snapshot.semester.keyDates?.resultCheckWindow ?? null,
        lotteryPublish: snapshot.semester.keyDates?.lotteryPublish ?? null,
        supportContact: snapshot.semester.keyDates?.supportContact ?? null,
        supportEmail: snapshot.semester.keyDates?.supportEmail ?? null,
      },
      studentActionSummary,
      confirmedCredits,
    },
    courses: catalogOfferings,
    approvedCourses,
    requestRecords,
    activeRequestRecords,
    requestStatusView,
    timetable: [
      ...approvedOfferings.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        subclass: course.subclass,
        credits: course.credits,
        schedule: course.schedule,
        tone: "approved",
        department: course.department,
      })),
      ...activeRequestOfferings.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        subclass: course.subclass,
        credits: course.credits,
        schedule: course.schedule,
        tone: "pipeline",
        department: course.department,
      })),
    ],
    adminFlags: {
      roleReady: true,
      sharedCourseSupply: true,
      constraintOverrideReady: true,
    },
  };
}
