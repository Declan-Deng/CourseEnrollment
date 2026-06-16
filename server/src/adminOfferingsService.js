import { createAuditEvent } from "./auditService.js";
import { clone } from "./clone.js";
import { badRequest, notFound, conflict } from "./domainErrors.js";
import { toIsoDate } from "./windowDates.js";

const ALLOWED_PATCH_KEYS = new Set([
  "capacity",
  "seatsTaken",
  "waitlistCount",
  "allocationPolicy",
  "requestWindow",
  "dropWindow",
  "schedule",
]);
const ALLOWED_POLICIES = new Set([
  "firstComeFirstServed",
  "lottery",
  "priorityReview",
  "locked",
]);
const ALLOWED_LIST_TYPES = new Set([
  "DscpA",
  "DscpB",
  "ElectXC",
  "Elective",
  "Diss",
]);
const ALLOWED_SCHEDULE_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCourseCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeSubclass(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePlainText(value) {
  return String(value ?? "").trim();
}

function normalizeCodeList(values) {
  if (Array.isArray(values)) {
    return [...new Set(values.map(normalizeCourseCode).filter(Boolean))];
  }

  if (typeof values === "string") {
    return [...new Set(values.split(",").map(normalizeCourseCode).filter(Boolean))];
  }

  return [];
}

function buildPrerequisiteGraph(snapshot) {
  return snapshot.offerings.reduce((graph, offering) => {
    const courseCode = normalizeCourseCode(offering.courseCode);
    const prerequisites = normalizeCodeList(offering.prerequisites);

    if (!courseCode) {
      return graph;
    }

    graph.set(courseCode, [...new Set([...(graph.get(courseCode) ?? []), ...prerequisites])]);
    return graph;
  }, new Map());
}

function hasPrerequisitePath(graph, fromCode, targetCode, visited = new Set()) {
  const normalizedFrom = normalizeCourseCode(fromCode);
  const normalizedTarget = normalizeCourseCode(targetCode);

  if (!normalizedFrom || !normalizedTarget || visited.has(normalizedFrom)) {
    return false;
  }

  visited.add(normalizedFrom);

  for (const prerequisite of graph.get(normalizedFrom) ?? []) {
    if (prerequisite === normalizedTarget || hasPrerequisitePath(graph, prerequisite, normalizedTarget, visited)) {
      return true;
    }
  }

  return false;
}

function validateOfferingConstraintCodes(snapshot, courseCode, prerequisites = [], corequisites = []) {
  const normalizedCourseCode = normalizeCourseCode(courseCode);
  const prerequisiteSet = new Set(prerequisites);
  const courseCodes = new Set(snapshot.courses.map((course) => normalizeCourseCode(course.code)));
  const offeredCourseCodes = new Set(snapshot.offerings.map((offering) => normalizeCourseCode(offering.courseCode)));

  for (const code of [...prerequisites, ...corequisites]) {
    if (code === normalizedCourseCode) {
      throw badRequest(
        "Invalid offering constraints.",
        `${code} cannot be listed as a prerequisite or co-requisite of itself.`,
      );
    }

    if (!courseCodes.has(code)) {
      throw badRequest("Invalid offering constraints.", `${code} does not exist in the course catalog.`);
    }

    if (!offeredCourseCodes.has(code)) {
      throw badRequest("Invalid offering constraints.", `${code} does not have an existing offering in this demo schedule.`);
    }
  }

  for (const code of corequisites) {
    if (prerequisiteSet.has(code)) {
      throw badRequest(
        "Invalid offering constraints.",
        `${code} cannot be both a prerequisite and a co-requisite for the same offering.`,
      );
    }
  }

  const graph = buildPrerequisiteGraph(snapshot);
  graph.set(normalizedCourseCode, prerequisites);

  for (const prerequisite of prerequisites) {
    if (hasPrerequisitePath(graph, prerequisite, normalizedCourseCode)) {
      throw badRequest(
        "Invalid offering constraints.",
        `Prerequisite cycle detected between ${normalizedCourseCode} and ${prerequisite}.`,
      );
    }
  }
}

function validateTimeLabel(value, fieldLabel) {
  if (!/^\d{2}:\d{2}$/.test(String(value ?? ""))) {
    throw badRequest("Invalid offering payload.", `${fieldLabel} must use HH:MM format.`);
  }
}

function validateCoursePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Invalid course payload.", "Course payload must be an object.");
  }

  const code = normalizeCourseCode(payload.code);
  if (!code) {
    throw badRequest("Invalid course payload.", "Course code is required.");
  }

  const title = normalizePlainText(payload.title);
  const faculty = normalizePlainText(payload.faculty);
  const department = normalizePlainText(payload.department);
  if (!title || !faculty || !department) {
    throw badRequest("Invalid course payload.", "Title, faculty, and department are required.");
  }

  if (!ALLOWED_LIST_TYPES.has(payload.listType)) {
    throw badRequest("Invalid course payload.", `Unsupported list type: ${payload.listType}`);
  }

  if (!Number.isInteger(payload.credits) || payload.credits < 0) {
    throw badRequest("Invalid course payload.", "credits must be a non-negative integer.");
  }

  if (payload.crossFaculty !== undefined && typeof payload.crossFaculty !== "boolean") {
    throw badRequest("Invalid course payload.", "crossFaculty must be a boolean.");
  }
}

function normalizeCoursePayload(payload) {
  return {
    id: normalizeCourseCode(payload.code),
    code: normalizeCourseCode(payload.code),
    title: normalizePlainText(payload.title),
    faculty: normalizePlainText(payload.faculty),
    department: normalizePlainText(payload.department),
    listType: payload.listType,
    credits: payload.credits,
    crossFaculty: Boolean(payload.crossFaculty),
    synopsis: normalizePlainText(payload.synopsis),
  };
}

function buildDepartmentRecord(course) {
  return {
    id: slugify(`${course.faculty}-${course.department}`),
    faculty: course.faculty,
    name: course.department,
  };
}

function validateSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw badRequest("Invalid offering payload.", "At least one teaching slot is required.");
  }

  for (const [index, slot] of schedule.entries()) {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      throw badRequest("Invalid offering payload.", `Schedule slot ${index + 1} must be an object.`);
    }

    if (!ALLOWED_SCHEDULE_DAYS.has(slot.day)) {
      throw badRequest("Invalid offering payload.", `Schedule slot ${index + 1} must use a supported day.`);
    }

    validateTimeLabel(slot.start, `Schedule slot ${index + 1} start`);
    validateTimeLabel(slot.end, `Schedule slot ${index + 1} end`);
  }
}

function normalizeWindowForCreate(windowValue, defaultDate) {
  return {
    isOpen: windowValue?.isOpen ?? true,
    closesOn: toIsoDate(windowValue?.closesOn) ?? defaultDate,
  };
}

function buildOfferingId(courseCode, subclass, semester) {
  return `${courseCode}-${subclass}-S${semester}`;
}

function validateOfferingCreatePayload(snapshot, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Invalid offering payload.", "Offering payload must be an object.");
  }

  const courseCode = normalizeCourseCode(payload.courseCode);
  if (!courseCode) {
    throw badRequest("Invalid offering payload.", "courseCode is required.");
  }

  if (!snapshot.courses.some((course) => course.code === courseCode)) {
    throw notFound("Course not found.", `Course ${courseCode} was not found.`);
  }

  if (!Number.isInteger(payload.semester) || payload.semester < 1) {
    throw badRequest("Invalid offering payload.", "semester must be a positive integer.");
  }

  const subclass = normalizeSubclass(payload.subclass);
  if (!subclass) {
    throw badRequest("Invalid offering payload.", "subclass is required.");
  }

  if (!ALLOWED_POLICIES.has(payload.allocationPolicy)) {
    throw badRequest("Invalid offering payload.", `Unsupported allocation policy: ${payload.allocationPolicy}`);
  }

  if (!Number.isInteger(payload.capacity) || payload.capacity < 0) {
    throw badRequest("Invalid offering payload.", "capacity must be a non-negative integer.");
  }

  validateOfferingConstraintCodes(
    snapshot,
    courseCode,
    normalizeCodeList(payload.prerequisites),
    normalizeCodeList(payload.corequisites),
  );

  validateSchedule(payload.schedule);

  for (const windowField of ["requestWindow", "dropWindow"]) {
    const windowValue = payload[windowField];
    if (windowValue !== undefined && (typeof windowValue !== "object" || Array.isArray(windowValue))) {
      throw badRequest("Invalid offering payload.", `${windowField} must be an object.`);
    }

    if (windowValue?.isOpen !== undefined && typeof windowValue.isOpen !== "boolean") {
      throw badRequest("Invalid offering payload.", `${windowField}.isOpen must be a boolean.`);
    }

    if (windowValue?.closesOn !== undefined && windowValue.closesOn !== null && !toIsoDate(windowValue.closesOn)) {
      throw badRequest("Invalid offering payload.", `${windowField}.closesOn must be a valid date.`);
    }
  }
}

function normalizeSchedule(schedule) {
  return schedule.map((slot) => ({
    day: slot.day,
    start: slot.start,
    end: slot.end,
    venue: normalizePlainText(slot.venue),
  }));
}

function normalizeOfferingPayload(snapshot, payload) {
  const courseCode = normalizeCourseCode(payload.courseCode);
  const subclass = normalizeSubclass(payload.subclass);
  const semester = payload.semester;
  const offeringId = normalizePlainText(payload.id) || buildOfferingId(courseCode, subclass, semester);

  return {
    id: offeringId,
    courseCode,
    semester,
    subclass,
    allocationPolicy: payload.allocationPolicy,
    requestWindow: normalizeWindowForCreate(payload.requestWindow, toIsoDate(snapshot.semester.keyDates?.requestClose)),
    dropWindow: normalizeWindowForCreate(payload.dropWindow, toIsoDate(snapshot.semester.keyDates?.addDropClose)),
    capacity: payload.capacity,
    seatsTaken: 0,
    waitlistCount: 0,
    schedule: normalizeSchedule(payload.schedule),
    prerequisites: normalizeCodeList(payload.prerequisites),
    corequisites: normalizeCodeList(payload.corequisites),
    version: 1,
  };
}

function validateOfferingPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw badRequest("Invalid offering patch.", "Offering patch must be an object.");
  }

  for (const key of Object.keys(patch)) {
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      throw badRequest("Invalid offering patch.", `Unsupported offering patch field: ${key}`);
    }
  }

  for (const numericField of ["capacity", "seatsTaken", "waitlistCount"]) {
    if (patch[numericField] !== undefined && (!Number.isInteger(patch[numericField]) || patch[numericField] < 0)) {
      throw badRequest("Invalid offering patch.", `${numericField} must be a non-negative integer.`);
    }
  }

  for (const windowField of ["requestWindow", "dropWindow"]) {
    if (patch[windowField] !== undefined && (typeof patch[windowField] !== "object" || Array.isArray(patch[windowField]))) {
      throw badRequest("Invalid offering patch.", `${windowField} must be an object.`);
    }

    if (patch[windowField]?.isOpen !== undefined && typeof patch[windowField].isOpen !== "boolean") {
      throw badRequest("Invalid offering patch.", `${windowField}.isOpen must be a boolean.`);
    }

    if (patch[windowField]?.closesOn !== undefined) {
      const closesOn = patch[windowField].closesOn;
      if (closesOn !== null && typeof closesOn !== "string") {
        throw badRequest("Invalid offering patch.", `${windowField}.closesOn must be a date string or null.`);
      }

      if (typeof closesOn === "string" && closesOn.trim() !== "" && !toIsoDate(closesOn)) {
        throw badRequest("Invalid offering patch.", `${windowField}.closesOn must be a valid date.`);
      }
    }
  }

  if (patch.allocationPolicy !== undefined && !ALLOWED_POLICIES.has(patch.allocationPolicy)) {
    throw badRequest("Invalid offering patch.", `Unsupported allocation policy: ${patch.allocationPolicy}`);
  }

  if (patch.schedule !== undefined) {
    validateSchedule(patch.schedule);
  }
}

function normalizeWindowPatch(windowPatch) {
  if (!windowPatch) {
    return windowPatch;
  }

  return {
    ...windowPatch,
    ...(windowPatch.closesOn !== undefined ? { closesOn: toIsoDate(windowPatch.closesOn) } : {}),
  };
}

function normalizeOfferingPatch(patch) {
  return {
    ...patch,
    ...(patch.schedule !== undefined ? { schedule: normalizeSchedule(patch.schedule) } : {}),
    ...(patch.requestWindow !== undefined ? { requestWindow: normalizeWindowPatch(patch.requestWindow) } : {}),
    ...(patch.dropWindow !== undefined ? { dropWindow: normalizeWindowPatch(patch.dropWindow) } : {}),
  };
}

function validateOfferingState(offering) {
  if (offering.seatsTaken > offering.capacity) {
    throw conflict("Invalid offering state.", "capacity cannot be lower than seatsTaken.");
  }

  if (offering.waitlistCount < 0) {
    throw badRequest("Invalid offering state.", "waitlistCount cannot be negative.");
  }
}

function hashOfferingId(value) {
  return [...String(value ?? "")].reduce((total, char, index) => total + char.charCodeAt(0) * (index + 17), 0);
}

function buildGeneratedSeatOccupants(offeringId, count, trackedCount) {
  const seed = hashOfferingId(offeringId);

  return Array.from({ length: count }, (_, index) => {
    const position = trackedCount + index + 1;
    const studentSuffix = String((seed * 97 + position * 137) % 1_000_000).padStart(6, "0");
    const day = String(((seed + position * 3) % 19) + 1).padStart(2, "0");
    const hour = String(9 + ((seed + position) % 9)).padStart(2, "0");
    const minute = ((seed + position) % 2) * 30;

    return {
      studentId: `3036${studentSuffix}`,
      enrolledAt: `2026-01-${day} ${hour}:${String(minute).padStart(2, "0")}`,
      source: "faculty-record",
      enrollmentId: `demo-enr-${offeringId}-${position}`,
      synthetic: true,
    };
  });
}

function buildSeatOccupants(snapshot, offering) {
  const trackedOccupants = snapshot.enrollments
    .filter((enrollment) => enrollment.offeringId === offering.id && enrollment.status === "approved")
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")) || left.studentId.localeCompare(right.studentId))
    .map((enrollment) => ({
      studentId: enrollment.studentId,
      enrolledAt: enrollment.createdAt ?? null,
      source: enrollment.source ?? "unknown",
      enrollmentId: enrollment.id,
      synthetic: false,
    }));

  const generatedCount = Math.max((offering?.seatsTaken ?? 0) - trackedOccupants.length, 0);

  return {
    occupants: [...trackedOccupants, ...buildGeneratedSeatOccupants(offering.id, generatedCount, trackedOccupants.length)],
    trackedCount: trackedOccupants.length,
    generatedCount,
  };
}

export function listAdminCourses(snapshot) {
  const offeringCountByCode = snapshot.offerings.reduce((counts, offering) => {
    counts.set(offering.courseCode, (counts.get(offering.courseCode) ?? 0) + 1);
    return counts;
  }, new Map());

  return [...snapshot.courses]
    .map((course) => ({
      ...course,
      offeringCount: offeringCountByCode.get(course.code) ?? 0,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export function listAdminOfferings(snapshot) {
  const coursesByCode = new Map(snapshot.courses.map((course) => [course.code, course]));

  return snapshot.offerings
    .map((offering) => {
      const course = coursesByCode.get(offering.courseCode);

      return {
        ...offering,
        title: course?.title ?? offering.courseCode,
        faculty: course?.faculty ?? "",
        department: course?.department ?? "",
        credits: course?.credits ?? 0,
        listType: course?.listType ?? "Elective",
        crossFaculty: course?.crossFaculty ?? false,
        adminFlags: {
          requestWindowClosed: !offering.requestWindow?.isOpen,
          dropWindowClosed: !offering.dropWindow?.isOpen,
          lockedByPolicy: offering.allocationPolicy === "locked",
        },
      };
    })
    .sort((left, right) => `${left.courseCode} ${left.id}`.localeCompare(`${right.courseCode} ${right.id}`));
}

export function createCourseForAdmin(snapshot, payload, actor = { type: "staff", id: "staff-office-001" }) {
  validateCoursePayload(payload);
  const course = normalizeCoursePayload(payload);

  if (snapshot.courses.some((existing) => existing.code === course.code)) {
    throw conflict("Course already exists.", `Course ${course.code} already exists.`);
  }

  const department = buildDepartmentRecord(course);
  const auditEvent = createAuditEvent({
    actor,
    action: "course-created",
    targetType: "course",
    targetId: course.code,
    before: null,
    after: clone(course),
    subjectStudentId: null,
  });

  return { course, department, auditEvent };
}

export function createOfferingForAdmin(snapshot, payload, actor = { type: "staff", id: "staff-office-001" }) {
  validateOfferingCreatePayload(snapshot, payload);
  const offering = normalizeOfferingPayload(snapshot, payload);

  if (snapshot.offerings.some((existing) => existing.id === offering.id)) {
    throw conflict("Offering already exists.", `Offering ${offering.id} already exists.`);
  }

  const auditEvent = createAuditEvent({
    actor,
    action: "offering-created",
    targetType: "offering",
    targetId: offering.id,
    before: null,
    after: clone(offering),
    subjectStudentId: null,
  });

  return { offering, auditEvent };
}

export function updateOfferingForAdmin(snapshot, offeringId, patch, actor = { type: "staff", id: "staff-office-001" }) {
  validateOfferingPatch(patch);
  const normalizedPatch = normalizeOfferingPatch(patch);
  const nextSnapshot = clone(snapshot);
  const offering = nextSnapshot.offerings.find((item) => item.id === offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${offeringId} was not found.`);
  }

  const before = clone(offering);

  if (normalizedPatch.capacity !== undefined) {
    offering.capacity = normalizedPatch.capacity;
  }
  if (normalizedPatch.requestWindow?.isOpen !== undefined || normalizedPatch.requestWindow?.closesOn !== undefined) {
    offering.requestWindow = { ...offering.requestWindow, ...normalizedPatch.requestWindow };
  }
  if (normalizedPatch.dropWindow?.isOpen !== undefined || normalizedPatch.dropWindow?.closesOn !== undefined) {
    offering.dropWindow = { ...offering.dropWindow, ...normalizedPatch.dropWindow };
  }
  if (normalizedPatch.allocationPolicy) {
    offering.allocationPolicy = normalizedPatch.allocationPolicy;
  }
  if (normalizedPatch.schedule !== undefined) {
    offering.schedule = normalizedPatch.schedule;
  }
  if (normalizedPatch.waitlistCount !== undefined) {
    offering.waitlistCount = normalizedPatch.waitlistCount;
  }
  if (normalizedPatch.seatsTaken !== undefined) {
    offering.seatsTaken = normalizedPatch.seatsTaken;
  }

  validateOfferingState(offering);

  nextSnapshot.auditEvents.push(
    createAuditEvent({
      actor,
      action: "offering-updated",
      targetType: "offering",
      targetId: offeringId,
      before,
      after: clone(offering),
      subjectStudentId: null,
    }),
  );

  return nextSnapshot;
}

export function previewOfferingUpdate(snapshot, offeringId, patch) {
  validateOfferingPatch(patch);
  const offering = snapshot.offerings.find((item) => item.id === offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${offeringId} was not found.`);
  }

  const beforeAvailable = Math.max(offering.capacity - offering.seatsTaken, 0);
  const previewSnapshot = updateOfferingForAdmin(snapshot, offeringId, patch, { type: "system", id: "preview" });
  previewSnapshot.auditEvents = snapshot.auditEvents;
  const nextOffering = previewSnapshot.offerings.find((item) => item.id === offeringId);
  const afterAvailable = Math.max(nextOffering.capacity - nextOffering.seatsTaken, 0);
  const affectedRequests = snapshot.requests.filter((request) => request.active && request.offeringId === offeringId).length;
  const seatOccupantView = buildSeatOccupants(snapshot, offering);

  return {
    ok: true,
    headline: "Offering impact preview ready.",
    offeringId,
    before: offering,
    after: nextOffering,
    summary: {
      capacityChange: nextOffering.capacity - offering.capacity,
      availableSeatsBefore: beforeAvailable,
      availableSeatsAfter: afterAvailable,
      seatsDelta: afterAvailable - beforeAvailable,
      affectedActiveRequests: affectedRequests,
      requestWindowClosingNow: Boolean(offering.requestWindow?.isOpen && !nextOffering.requestWindow?.isOpen),
      dropWindowClosingNow: Boolean(offering.dropWindow?.isOpen && !nextOffering.dropWindow?.isOpen),
    },
    seatOccupants: seatOccupantView.occupants,
    seatOccupantSummary: {
      totalCount: seatOccupantView.occupants.length,
      trackedCount: seatOccupantView.trackedCount,
      generatedCount: seatOccupantView.generatedCount,
    },
  };
}
