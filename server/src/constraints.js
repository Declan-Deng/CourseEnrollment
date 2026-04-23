import { getStateStatusLabel } from "./enrollmentMeta.js";

const policyCopy = {
  firstComeFirstServed: "FCFS",
  lottery: "Lottery",
  priorityReview: "Faculty review",
  locked: "Locked",
};
const PREVIEW_STATE_COPY = {
  approved: { kind: "requestable", label: "Can request" },
  waitlist: { kind: "waitlistAvailable", label: "Join waitlist" },
  pendingReview: { kind: "reviewAvailable", label: "Faculty review" },
  lotteryQueued: { kind: "lotteryAvailable", label: "Lottery path" },
  rejected: { kind: "blocked", label: "Blocked" },
};
const COURSE_INDEX_CACHE = new WeakMap();
export const CONSTRAINT_OVERRIDE_TYPES = {
  prerequisite: "prerequisite",
  corequisite: "corequisite",
  listQuota: "listQuota",
  crossFacultyQuota: "crossFacultyQuota",
  creditLimit: "creditLimit",
  duplicate: "duplicate",
  timetableClash: "timetableClash",
};

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getCourseIndex(state) {
  if (!COURSE_INDEX_CACHE.has(state)) {
    COURSE_INDEX_CACHE.set(state, new Map(state.courses.map((course) => [course.id, course])));
  }

  return COURSE_INDEX_CACHE.get(state);
}

function getCourse(state, courseId) {
  return getCourseIndex(state).get(courseId);
}

function isCurrentSemesterCourse(state, course) {
  return !Number.isFinite(state.semester?.number) || course.semester === state.semester.number;
}

function countsTowardSemesterLoad(course) {
  return course.credits > 0 && course.listType !== "Diss";
}

function creditsOf(courses) {
  return courses.reduce((total, course) => total + course.credits, 0);
}

function findActiveRecord(state, courseId) {
  return state.requestRecords.find((record) => record.courseId === courseId && record.active) ?? null;
}

function hasActiveConstraintOverride(state, courseId, constraintType) {
  return (state.overrides ?? []).some(
    (override) =>
      override.active &&
      override.offeringId === courseId &&
      Array.isArray(override.constraintTypes) &&
      override.constraintTypes.includes(constraintType),
  );
}

function hasTimeClash(currentCourse, existingCourse) {
  return currentCourse.schedule.some((slot) =>
    existingCourse.schedule.some((existingSlot) => {
      if (slot.day !== existingSlot.day) {
        return false;
      }

      const startsBeforeEnd = toMinutes(slot.start) < toMinutes(existingSlot.end);
      const endsAfterStart = toMinutes(slot.end) > toMinutes(existingSlot.start);

      return startsBeforeEnd && endsAfterStart;
    }),
  );
}

function createDecision({ ok, outcome, tone, headline, reasons, suggestedActions = [], uiVariant }) {
  return {
    ok,
    outcome,
    tone,
    headline,
    reasons,
    suggestedActions,
    uiVariant,
  };
}

function createRejection(headline, reasons, suggestedActions = [], uiVariant = "blocked") {
  return createDecision({
    ok: false,
    outcome: "rejected",
    tone: "error",
    headline,
    reasons,
    suggestedActions,
    uiVariant,
  });
}

function createAccepted(headline, outcome, reasons, suggestedActions = [], uiVariant = outcome) {
  const tone =
    outcome === "approved"
      ? "success"
      : outcome === "waitlist"
        ? "warn"
        : "info";

  return createDecision({
    ok: true,
    outcome,
    tone,
    headline,
    reasons,
    suggestedActions,
    uiVariant,
  });
}

export function getPolicyLabel(policy) {
  return policyCopy[policy] ?? policy;
}

export function evaluateEnrollment(state, courseId) {
  const course = getCourse(state, courseId);

  if (!course) {
    return createRejection("Course not found.", [
      "The selected course could not be found in the current course catalog.",
    ], [], "closed");
  }

  if (state.approvedCourseIds.includes(courseId)) {
    return createRejection("Already enrolled.", [
      `You are already enrolled in ${course.code} subclass ${course.subclass}.`,
    ], [], "enrolled");
  }

  const existingRecord = findActiveRecord(state, courseId);
  if (existingRecord) {
    return createRejection("Request already active.", [
      `A ${getStateStatusLabel(existingRecord.status).toLowerCase()} request already exists for this course.`,
    ], [], existingRecord.status === "pendingReview" ? "review" : existingRecord.status === "lotteryQueued" ? "lottery" : "waitlist");
  }

  const currentSemesterPlannedCourses = [
    ...new Set([
      ...state.approvedCourseIds,
      ...state.requestRecords.filter((record) => record.active).map((record) => record.courseId),
    ]),
  ]
    .map((plannedCourseId) => getCourse(state, plannedCourseId))
    .filter((plannedCourse) => plannedCourse && isCurrentSemesterCourse(state, plannedCourse));

  const duplicateByCode = currentSemesterPlannedCourses.find(
    (plannedCourse) => plannedCourse.code === course.code,
  );

  if (duplicateByCode && !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.duplicate)) {
    return createRejection("Duplicate course code detected.", [
      `${course.code} is already in your plan as subclass ${duplicateByCode.subclass}.`,
    ], [], "blocked");
  }

  if (!course.requestOpen) {
    return createRejection(
      "Enrolment window closed for this offering.",
      [
        `${course.code} is currently locked by the programme office or outside the active request window.`,
        `Next relevant date: verify final enrolment records during ${state.semester.keyDates?.resultCheckWindow ?? "the final record review window"}.`,
        `Policy: ${getPolicyLabel(course.allocationPolicy)}.`,
      ],
      [`Contact the ${state.semester.keyDates?.supportContact ?? "programme office"} if a manual change is still required.`],
      "closed",
    );
  }

  const missingPrerequisites = course.prerequisites.filter(
    (item) => !state.student.completedCourses.includes(item),
  );

  if (
    missingPrerequisites.length > 0 &&
    !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.prerequisite)
  ) {
    return createRejection("Prerequisite not satisfied.", [
      `Missing prerequisite(s): ${missingPrerequisites.join(", ")}.`,
    ], [], "blocked");
  }

  const plannedCourses = currentSemesterPlannedCourses.filter((plannedCourse) => plannedCourse.id !== course.id);
  const plannedCodes = new Set(plannedCourses.map((plannedCourse) => plannedCourse.code));
  const missingCorequisites = (course.corequisites ?? []).filter(
    (item) => !plannedCodes.has(item) && !state.student.completedCourses.includes(item),
  );

  if (
    missingCorequisites.length > 0 &&
    !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.corequisite)
  ) {
    return createRejection(
      "Co-requisite not satisfied.",
      [
        `${course.code} must be taken together with: ${missingCorequisites.join(", ")}.`,
      ],
      [`Add ${missingCorequisites[0]} to your active plan before requesting ${course.code}.`],
      "blocked",
    );
  }

  const listCreditLimit = state.student.listCreditLimits?.[course.listType];
  if (Number.isFinite(listCreditLimit)) {
    const currentListCredits = creditsOf(
      plannedCourses.filter((plannedCourse) => plannedCourse.listType === course.listType),
    );

    if (
      currentListCredits + course.credits > listCreditLimit &&
      !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.listQuota)
    ) {
      return createRejection(
        `${course.listType} quota would be exceeded.`,
        [
          `Current ${course.listType} load in plan: ${currentListCredits} credits.`,
          `Adding ${course.code} would exceed the visible ${course.listType} quota of ${listCreditLimit} credits.`,
        ],
        ["Cancel or drop another course in the same list before submitting this request."],
        "limit",
      );
    }
  }

  if (course.crossFaculty && Number.isFinite(state.student.crossFacultyCreditLimit)) {
    const currentCrossFacultyCredits = creditsOf(
      plannedCourses.filter((plannedCourse) => plannedCourse.crossFaculty),
    );

    if (
      currentCrossFacultyCredits + course.credits > state.student.crossFacultyCreditLimit &&
      !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.crossFacultyQuota)
    ) {
      return createRejection(
        "Cross-faculty quota would be exceeded.",
        [
          `Current cross-faculty load in plan: ${currentCrossFacultyCredits} credits.`,
          `Adding ${course.code} would exceed the cross-faculty quota of ${state.student.crossFacultyCreditLimit} credits.`,
        ],
        ["Replace another cross-faculty request or seek programme approval before proceeding."],
        "limit",
      );
    }
  }

  const conflictCourse = plannedCourses.find((plannedCourse) => hasTimeClash(course, plannedCourse));

  if (
    conflictCourse &&
    !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.timetableClash)
  ) {
    return createRejection("Timetable clash detected.", [
      `${course.code} overlaps with ${conflictCourse.code} subclass ${conflictCourse.subclass}.`,
      `Conflict day/time: ${course.schedule[0].day} ${course.schedule[0].start}-${course.schedule[0].end}.`,
    ], [`Drop or replace ${conflictCourse.code} before requesting ${course.code}.`], "blocked");
  }

  const currentSemesterLoad = creditsOf(currentSemesterPlannedCourses.filter(countsTowardSemesterLoad));
  const semesterStudyLoadLimit = state.student.semesterStudyLoadLimit;

  if (
    Number.isFinite(semesterStudyLoadLimit) &&
    countsTowardSemesterLoad(course) &&
    currentSemesterLoad + course.credits > semesterStudyLoadLimit &&
    !hasActiveConstraintOverride(state, courseId, CONSTRAINT_OVERRIDE_TYPES.creditLimit)
  ) {
    return createRejection("Credit limit would be exceeded.", [
      `Current semester study load: ${currentSemesterLoad} credits.`,
      `Adding ${course.credits} credits would exceed the nominal semester study load limit of ${semesterStudyLoadLimit} credits.`,
    ], [
      "Drop or cancel another current-semester course first, or seek programme approval for an overload.",
    ], "limit");
  }

  const seatsRemaining = Math.max(course.seats.capacity - course.seats.taken, 0);

  if (course.allocationPolicy === "firstComeFirstServed") {
    if (seatsRemaining > 0) {
      return createAccepted(
        "Request can be approved immediately.",
        "approved",
        [
          "No timetable, prerequisite, co-requisite, quota, credit-limit, or duplicate issue was found.",
          `${formatCountLabel(seatsRemaining, "seat")} ${seatsRemaining === 1 ? "is" : "are"} currently available.`,
          "The allocation policy is FCFS.",
        ],
        [],
        "success",
      );
    }

    return createAccepted(
      "Course is full, but you can join the waitlist.",
      "waitlist",
        [
          "No rule conflict was found, but all seats are currently taken.",
          `${formatCountLabel(course.seats.waitlist, "student")} ${course.seats.waitlist === 1 ? "is" : "are"} already waiting.`,
        ],
        [],
        "waitlist",
      );
  }

  if (course.allocationPolicy === "lottery") {
    return createAccepted(
      "Request will enter the lottery pool.",
      "lotteryQueued",
      [
        "This course is not allocated by response speed.",
        `${course.seats.capacity - seatsRemaining}/${course.seats.capacity} seats are currently claimed, and demand is higher than supply.`,
      ],
      [],
      "lottery",
    );
  }

  if (course.allocationPolicy === "priorityReview") {
    return createAccepted(
      "Request will be reviewed under faculty policy.",
      "pendingReview",
      [
        "This offering uses programme or faculty-based review rather than instant approval.",
        "The request is still worth submitting because the course is open and your current profile passes the visible rule checks.",
      ],
      [],
      "review",
    );
  }

  return createRejection("This course is not requestable right now.", [
    `Policy: ${getPolicyLabel(course.allocationPolicy)}.`,
  ], [], "closed");
}

export function summarizeCourseState(state, courseId, previewDecision = null) {
  if (state.approvedCourseIds.includes(courseId)) {
    return { kind: "approved", label: "Enrolled" };
  }

  const existingRecord = findActiveRecord(state, courseId);
  if (existingRecord) {
    return { kind: existingRecord.status, label: getStateStatusLabel(existingRecord.status) };
  }

  const preview = previewDecision ?? evaluateEnrollment(state, courseId);

  if (preview.outcome === "rejected" && preview.uiVariant) {
    const blockedStateLabelMap = {
      blocked: "Blocked",
      closed: "Closed",
      limit: "Limit reached",
      enrolled: "Enrolled",
    };

    return {
      kind: preview.uiVariant,
      label: blockedStateLabelMap[preview.uiVariant] ?? preview.headline,
    };
  }

  return PREVIEW_STATE_COPY[preview.outcome] ?? { kind: preview.outcome, label: preview.outcome };
}
