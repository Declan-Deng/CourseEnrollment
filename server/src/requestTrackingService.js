import { getRecordStatusLabel } from "./enrollmentMeta.js";

export function formatRecordTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function getRequestNextStep(status, semester, course) {
  const requestDeadline = semester.keyDates?.requestClose ?? "the request deadline";
  const resultCheckWindow = semester.keyDates?.resultCheckWindow ?? "the final records window";

  const nextStepByStatus = {
    approved: () =>
      `Course is now in your enrolled list. Check final records during ${resultCheckWindow}.`,
    lotteryQueued: () =>
      course.requestOpen
        ? `Wait for the lottery outcome after ${semester.keyDates?.lotteryPublish ?? "the draw window"} and keep an alternative ready.`
        : `This request is still being processed. The online withdrawal window has closed; check ${resultCheckWindow}.`,
    pendingReview: () => "Wait for faculty review and monitor messages before changing your plan.",
    waitlist: () =>
      course.requestOpen
        ? `Keep a backup option ready before ${requestDeadline}.`
        : `This waitlist request remains on record. Online withdrawal has closed; review it again during ${resultCheckWindow}.`,
    cancelled: () =>
      `Submit an alternative before ${requestDeadline} if you still need credits.`,
    dropped: () => "Review your current credit load and submit a replacement if needed.",
    rejected: () => "Review the reason and adjust your plan before trying again.",
    manuallyResolved: () => "The programme office updated this request. Check your latest records again.",
  };

  return nextStepByStatus[status]?.() ?? `Check ${course.code} again in View Enrolment Results.`;
}

export function createRequestRecordView(request, course, semester) {
  return {
    ...request,
    course,
    statusLabel: getRecordStatusLabel(request.status),
    withdrawable: Boolean(course.requestOpen) && request.active,
    nextStep: getRequestNextStep(request.status, semester, course),
  };
}

export function buildRequestStatusView({ approvedCourses = [], requestRecords = [], semester, creditLimit, plannedCredits }) {
  const activeRequests = requestRecords.filter((record) => record.active);
  const withdrawableRequests = activeRequests.filter((record) => record.withdrawable);
  const archivedChanges = requestRecords.filter((record) => !record.active);
  const actions = [];

  let headline = "Check this page for the latest status of every course request.";
  let detail = "Your enrolled courses, requests in progress, and archived changes are separated here so you can review everything in one place.";

  if (activeRequests.length > 0) {
    headline =
      activeRequests.length === 1
        ? "1 active request still needs attention."
        : `${activeRequests.length} active requests still need attention.`;
    if (withdrawableRequests.length > 0) {
      detail =
        activeRequests.length === 1
          ? `Review this request before ${semester?.keyDates?.requestClose ?? "the request deadline"}.`
          : `Review these requests before ${semester?.keyDates?.requestClose ?? "the request deadline"}.`;
      actions.push(
        activeRequests.length === 1
          ? "Monitor this active request before the request deadline."
          : "Monitor each active request before the request deadline.",
      );
      actions.push("Withdraw only the requests you no longer want to keep active.");
    } else {
      detail = `These requests remain in progress, but the online withdrawal window has closed. Check ${semester?.keyDates?.resultCheckWindow ?? "the final records window"} for updates instead.`;
      actions.push("Monitor these requests until the final records window.");
      actions.push("Contact the Faculty Office if a manual change is still required.");
    }
  } else if (approvedCourses.length > 0) {
    headline = "Your current enrolment is settled for now.";
    detail = `Your enrolled courses are shown below. Check the final record window during ${semester?.keyDates?.resultCheckWindow ?? "the confirmation period"} if anything still needs attention.`;
    actions.push("Check the final record window if any approved course still needs correction.");
  } else if (Number.isFinite(creditLimit) && Number.isFinite(plannedCredits) && plannedCredits < creditLimit) {
    headline = "No active request is pending right now.";
    detail = `You still have room in the current study load. Submit another request before ${semester?.keyDates?.requestClose ?? "the deadline"} if you need more credits.`;
    actions.push("Return to Course Center if you still need more credits.");
  }

  if (archivedChanges.length > 0) {
    actions.push("Archived changes stay here for reference and do not need any further action.");
  }

  return {
    currentEnrolment: approvedCourses,
    activeRequests,
    withdrawableRequests,
    archivedChanges,
    nextAction: {
      headline,
      detail,
      actions: [...new Set(actions)].slice(0, 3),
    },
  };
}
