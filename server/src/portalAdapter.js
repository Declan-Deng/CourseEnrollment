import { getPolicyLabel } from "./constraints.js";
import { getCatalogOffering, getStudentPlanningOfferings } from "./catalogService.js";
import { previewEnrollmentDecision, summarizeOfferingState } from "./enrollmentDecisionService.js";
import { buildRequestStatusView, createRequestRecordView } from "./requestTrackingService.js";

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

function getCapacityView(offering) {
  const seatsRemaining = Math.max(offering.capacity - offering.seatsTaken, 0);
  const demandBand = getDemandBand(offering);

  if (offering.allocationPolicy === "firstComeFirstServed") {
    return {
      primary: `${seatsRemaining} seat(s) left`,
      secondary: `${offering.waitlistCount} waiting`,
    };
  }

  if (offering.allocationPolicy === "lottery") {
    return {
      primary: `${demandBand} lottery pool`,
      secondary: `${offering.seatsTaken}/${offering.capacity} seats claimed before draw`,
    };
  }

  if (offering.allocationPolicy === "priorityReview") {
    return {
      primary: `${demandBand} review queue`,
      secondary: "Faculty review allocation",
    };
  }

  return {
    primary: "Managed by programme office",
    secondary: "Online changes unavailable",
  };
}

function getRequestNote(offering, semester) {
  if (offering.requestWindow?.isOpen) {
    return `Request window open until ${offering.requestWindow?.closesOn ?? semester.keyDates?.requestClose ?? "the deadline"}.`;
  }

  return `Request closed. Check final records during ${semester.keyDates?.resultCheckWindow ?? "the final record review window"}.`;
}

function getDropNote(offering, semester) {
  if (offering.dropWindow?.isOpen) {
    return `Online add/drop available until ${offering.dropWindow?.closesOn ?? semester.keyDates?.addDropClose ?? "the deadline"}.`;
  }

  return `Online add/drop is not available now. Contact ${semester.keyDates?.supportContact ?? "the programme office"}.`;
}

function buildStudentActionSummary({ approvedCourses, activeRequestRecords, plannedCredits, creditLimit, semester, requestStatusView }) {
  const nextDeadline = activeRequestRecords.length > 0
    ? semester?.keyDates?.requestClose ?? null
    : semester?.keyDates?.resultCheckWindow ?? semester?.keyDates?.requestClose ?? null;
  const primaryAction = activeRequestRecords.length > 0
    ? {
        label: "Review requests",
        page: "cancel",
      }
    : approvedCourses.length > 0
      ? {
          label: "View results",
          page: "results",
        }
      : {
          label: "Open Course Center",
          page: "add",
        };

  return {
    enrolledCount: approvedCourses.length,
    activeRequestCount: activeRequestRecords.length,
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

  if (!Array.isArray(content.highlights) || content.highlights.length === 0) {
    content.highlights = [
      { label: "Selection window", value: content.selectionSchedule?.[1]?.[0] ?? semester?.keyDates?.requestClose ?? "Selection period" },
      { label: "Add / Drop deadline", value: semester?.keyDates?.addDropClose ?? "Not available" },
      { label: "Result check", value: semester?.keyDates?.resultCheckWindow ?? "Not available" },
      { label: "Maintenance", value: content.maintenanceNotice ?? "No maintenance notice" },
    ];
  }

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
  const activeRequestRecords = requestRecords.filter((record) => record.active);
  const { approvedOfferings, activeRequestOfferings } = getStudentPlanningOfferings(snapshot);
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
    plannedCredits,
    creditLimit: snapshot.rules?.semesterStudyLoadLimit ?? snapshot.student.semesterStudyLoadLimit,
    semester: snapshot.semester,
    requestStatusView,
  });

  return {
    meta: {
      fetchedAt: new Date().toISOString(),
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
      },
      studentActionSummary,
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
