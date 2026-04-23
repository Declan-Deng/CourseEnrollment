import { initialState } from "../data/seed.js";
import { createAuditEvent } from "./auditService.js";
import { createRuntimeState } from "./runtimeState.js";
import { toIsoDate } from "./windowDates.js";

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createStudentProfile(seedStudent, studentId = seedStudent.id) {
  if (studentId === seedStudent.id) {
    return structuredClone(seedStudent);
  }

  const seededProfile = SEEDED_STUDENT_SCENARIOS[studentId]?.student ?? {};
  const email = studentId.includes("@") ? studentId : `${studentId}@connect.hku.hk`;
  const username = email.split("@")[0];
  const suffix = studentId.slice(-4);

  return {
    ...structuredClone(seedStudent),
    ...seededProfile,
    id: studentId,
    email: seededProfile.email ?? email,
    username: seededProfile.username ?? username,
    name: seededProfile.name ?? `Demo Student ${suffix}`,
  };
}

function buildCourseCatalog(runtimeSeed) {
  const coursesByCode = new Map();
  const departments = new Map();

  for (const offering of runtimeSeed.courses) {
    if (!coursesByCode.has(offering.code)) {
      coursesByCode.set(offering.code, {
        id: offering.code,
        code: offering.code,
        title: offering.title,
        faculty: offering.faculty,
        department: offering.department,
        listType: offering.listType,
        credits: offering.credits,
        crossFaculty: offering.crossFaculty,
        synopsis: offering.synopsis,
      });
    }

    const departmentId = slugify(`${offering.faculty}-${offering.department}`);
    if (!departments.has(departmentId)) {
      departments.set(departmentId, {
        id: departmentId,
        faculty: offering.faculty,
        name: offering.department,
      });
    }
  }

  return {
    courses: [...coursesByCode.values()],
    departments: [...departments.values()],
  };
}

function buildOfferings(runtimeSeed) {
  return runtimeSeed.courses.map((course) => ({
    id: course.id,
    courseCode: course.code,
    semester: course.semester,
    subclass: course.subclass,
    allocationPolicy: course.allocationPolicy,
    requestWindow: {
      isOpen: course.requestOpen,
      closesOn: toIsoDate(runtimeSeed.semester.keyDates?.requestClose),
    },
    dropWindow: {
      isOpen: course.dropOpen,
      closesOn: toIsoDate(runtimeSeed.semester.keyDates?.addDropClose),
    },
    capacity: course.seats.capacity,
    seatsTaken: course.seats.taken,
    waitlistCount: course.seats.waitlist,
    schedule: structuredClone(course.schedule ?? []),
    prerequisites: structuredClone(course.prerequisites ?? []),
    corequisites: structuredClone(course.corequisites ?? []),
    version: 1,
  }));
}

function buildPrograms(seedStudent) {
  const programmeId = slugify(seedStudent.programme);

  return [
    {
      id: programmeId,
      name: seedStudent.programme,
      faculty: "Faculty of Engineering",
      mode: seedStudent.mode,
    },
  ];
}

function buildProgramRules(runtimeSeed) {
  return {
    id: `rules-${runtimeSeed.semester.number}`,
    programmeId: slugify(runtimeSeed.student.programme),
    semesterStudyLoadLimit: runtimeSeed.student.semesterStudyLoadLimit,
    semesterStudyLoadLabel: runtimeSeed.student.semesterStudyLoadLabel,
    listCreditLimits: structuredClone(runtimeSeed.student.listCreditLimits ?? {}),
    crossFacultyCreditLimit: runtimeSeed.student.crossFacultyCreditLimit,
    keyDates: structuredClone(runtimeSeed.semester.keyDates ?? {}),
  };
}

function buildSeedEnrollments(runtimeSeed, studentId) {
  const seededEnrollments = SEEDED_STUDENT_SCENARIOS[studentId]?.enrollments;

  if (seededEnrollments) {
    return structuredClone(seededEnrollments);
  }

  if (studentId === runtimeSeed.student.id) {
    return runtimeSeed.approvedCourseIds.map((offeringId) => ({
      id: `enr-${studentId}-${offeringId}`,
      studentId,
      offeringId,
      status: "approved",
      source: "seed",
      createdAt: "2026-01-19 09:00",
    }));
  }

  return [];
}

function buildSeedRequests(runtimeSeed, studentId) {
  const seededRequests = SEEDED_STUDENT_SCENARIOS[studentId]?.requests;

  if (seededRequests) {
    return structuredClone(seededRequests);
  }

  if (studentId === runtimeSeed.student.id) {
    return runtimeSeed.requestRecords.map((record, index) => ({
      id: `req-${studentId}-${index + 1}`,
      studentId,
      offeringId: record.courseId,
      status: record.status,
      active: record.active,
      submittedAt: record.submittedAt,
      message: record.message,
      resolution: null,
    }));
  }

  return [];
}

function buildSeedOverrides(_runtimeSeed, studentId) {
  return structuredClone(SEEDED_STUDENT_SCENARIOS[studentId]?.overrides ?? []);
}

const SEEDED_STUDENT_SCENARIOS = {
  "4000000001": {
    student: {
      name: "Leung Hoi Yan",
      email: "u4000000001@connect.hku.hk",
      username: "u4000000001",
    },
    enrollments: [],
    requests: [
      {
        id: "req-4000000001-1",
        studentId: "4000000001",
        offeringId: "MEBS6003-A-S2",
        status: "pendingReview",
        active: true,
        submittedAt: "2026-01-18 10:20",
        message: "Queued for faculty review. Outcome will be published after programme approval.",
        resolution: null,
      },
      {
        id: "req-4000000001-2",
        studentId: "4000000001",
        offeringId: "MEST7414-A-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-18 14:10",
        message: "Moved to the waitlist while the office reviews seat availability.",
        resolution: "Held on waitlist by the faculty office.",
      },
      {
        id: "req-4000000001-3",
        studentId: "4000000001",
        offeringId: "LATX7517-A-S2",
        status: "rejected",
        active: false,
        submittedAt: "2026-01-16 09:15",
        message: "Rejected after faculty review because the elective quota was already full.",
        resolution: "Rejected after faculty review.",
      },
    ],
    overrides: [
      {
        id: "ovr-seed-4000000001-stat7601-coreq",
        studentId: "4000000001",
        offeringId: "STAT7601-A-S2",
        constraintTypes: ["corequisite"],
        note: "Temporary corequisite waiver approved for the pending statistics request.",
        createdBy: "staff-office-002",
        createdAt: "2026-01-16 11:20",
        active: true,
      },
    ],
  },
  "4000000002": {
    student: {
      name: "Chan Tsz Lok",
      email: "u4000000002@connect.hku.hk",
      username: "u4000000002",
    },
    enrollments: [],
    requests: [
      {
        id: "req-4000000002-1",
        studentId: "4000000002",
        offeringId: "TDLL6024-C-S2",
        status: "pendingReview",
        active: true,
        submittedAt: "2026-01-19 11:45",
        message: "Queued for faculty review. Outcome will be confirmed after the programme panel meets.",
        resolution: null,
      },
      {
        id: "req-4000000002-2",
        studentId: "4000000002",
        offeringId: "IDAT7211-B-S2",
        status: "lotteryQueued",
        active: true,
        submittedAt: "2026-01-19 12:15",
        message: "Queued for lottery allocation. Outcome will be published after the draw window closes.",
        resolution: null,
      },
      {
        id: "req-4000000002-3",
        studentId: "4000000002",
        offeringId: "IDAT7212-A-S2",
        status: "manuallyResolved",
        active: false,
        submittedAt: "2026-01-17 16:40",
        message: "Closed after office follow-up with the student.",
        resolution: "Manually closed after the student confirmed a timetable change.",
      },
    ],
    overrides: [
      {
        id: "ovr-seed-4000000002-mech7020-clash",
        studentId: "4000000002",
        offeringId: "MECH7020-A-S2",
        constraintTypes: ["timetableClash"],
        note: "Approved timetable overlap for the drone lab pilot cohort.",
        createdBy: "staff-office-003",
        createdAt: "2026-01-17 14:05",
        active: true,
      },
    ],
  },
  "4000000003": {
    student: {
      name: "Wong Ka Hei",
      email: "u4000000003@connect.hku.hk",
      username: "u4000000003",
    },
    enrollments: [],
    requests: [
      {
        id: "req-4000000003-1",
        studentId: "4000000003",
        offeringId: "MECH7023-A-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-18 18:25",
        message: "Held on the waitlist pending final seat release from the department.",
        resolution: "Waitlist hold confirmed by the faculty office.",
      },
      {
        id: "req-4000000003-2",
        studentId: "4000000003",
        offeringId: "STAT7601-A-S2",
        status: "pendingReview",
        active: true,
        submittedAt: "2026-01-19 08:40",
        message: "Queued for faculty review. Outcome will be confirmed after the programme panel meets.",
        resolution: null,
      },
    ],
    overrides: [
      {
        id: "ovr-seed-4000000003-idat7215-creditlimit",
        studentId: "4000000003",
        offeringId: "IDAT7215-B-S2",
        constraintTypes: ["creditLimit"],
        note: "Previously approved overload request that has now been closed.",
        createdBy: "staff-office-001",
        createdAt: "2026-01-15 16:10",
        active: false,
      },
    ],
  },
};

function buildSeedAuditEvents() {
  return [
    createAuditEvent({
      id: "audit-seed-request-4000000001-1",
      timestamp: "2026-01-18 10:20",
      actor: { type: "student", id: "4000000001" },
      action: "request-submitted",
      targetType: "request",
      targetId: "req-4000000001-1",
      subjectStudentId: "4000000001",
      before: null,
      after: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000001"].requests[0]),
    }),
    createAuditEvent({
      id: "audit-seed-request-4000000002-1",
      timestamp: "2026-01-19 11:45",
      actor: { type: "student", id: "4000000002" },
      action: "request-submitted",
      targetType: "request",
      targetId: "req-4000000002-1",
      subjectStudentId: "4000000002",
      before: null,
      after: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000002"].requests[0]),
    }),
    createAuditEvent({
      id: "audit-seed-request-resolved-4000000001-3",
      timestamp: "2026-01-16 11:05",
      actor: { type: "staff", id: "staff-office-002" },
      action: "request-resolved",
      targetType: "request",
      targetId: "req-4000000001-3",
      subjectStudentId: "4000000001",
      before: {
        request: {
          ...structuredClone(SEEDED_STUDENT_SCENARIOS["4000000001"].requests[2]),
          status: "pendingReview",
          active: true,
          message: "Queued for faculty review. Outcome pending programme approval.",
          resolution: null,
        },
      },
      after: {
        request: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000001"].requests[2]),
      },
    }),
    createAuditEvent({
      id: "audit-seed-request-resolved-4000000002-3",
      timestamp: "2026-01-17 17:00",
      actor: { type: "staff", id: "staff-office-001" },
      action: "request-resolved",
      targetType: "request",
      targetId: "req-4000000002-3",
      subjectStudentId: "4000000002",
      before: {
        request: {
          ...structuredClone(SEEDED_STUDENT_SCENARIOS["4000000002"].requests[2]),
          status: "pendingReview",
          active: true,
          message: "Queued for faculty review. Outcome pending student confirmation.",
          resolution: null,
        },
      },
      after: {
        request: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000002"].requests[2]),
      },
    }),
    createAuditEvent({
      id: "audit-seed-offering-updated-mebs6003",
      timestamp: "2026-01-17 09:40",
      actor: { type: "staff", id: "staff-office-002" },
      action: "offering-updated",
      targetType: "offering",
      targetId: "MEBS6003-A-S2",
      before: {
        capacity: 28,
        seatsTaken: 23,
        waitlistCount: 3,
        requestWindow: { isOpen: true, closesOn: "2026-01-31" },
      },
      after: {
        capacity: 30,
        seatsTaken: 23,
        waitlistCount: 4,
        requestWindow: { isOpen: true, closesOn: "2026-01-31" },
      },
    }),
    createAuditEvent({
      id: "audit-seed-override-created-4000000001",
      timestamp: "2026-01-16 11:20",
      actor: { type: "staff", id: "staff-office-002" },
      action: "override-created",
      targetType: "constraintOverride",
      targetId: "ovr-seed-4000000001-stat7601-coreq",
      subjectStudentId: "4000000001",
      before: null,
      after: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000001"].overrides[0]),
    }),
    createAuditEvent({
      id: "audit-seed-override-created-4000000002",
      timestamp: "2026-01-17 14:05",
      actor: { type: "staff", id: "staff-office-003" },
      action: "override-created",
      targetType: "constraintOverride",
      targetId: "ovr-seed-4000000002-mech7020-clash",
      subjectStudentId: "4000000002",
      before: null,
      after: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000002"].overrides[0]),
    }),
    createAuditEvent({
      id: "audit-seed-override-deactivated-4000000003",
      timestamp: "2026-01-15 16:10",
      actor: { type: "staff", id: "staff-office-001" },
      action: "override-deactivated",
      targetType: "constraintOverride",
      targetId: "ovr-seed-4000000003-idat7215-creditlimit",
      subjectStudentId: "4000000003",
      before: {
        ...structuredClone(SEEDED_STUDENT_SCENARIOS["4000000003"].overrides[0]),
        active: true,
      },
      after: structuredClone(SEEDED_STUDENT_SCENARIOS["4000000003"].overrides[0]),
    }),
  ];
}

const runtimeSeed = createRuntimeState(initialState);
const catalogSeed = buildCourseCatalog(runtimeSeed);
const seedStudentIds = [runtimeSeed.student.id, ...Object.keys(SEEDED_STUDENT_SCENARIOS)];

export const domainSeed = {
  semester: structuredClone(runtimeSeed.semester),
  programs: buildPrograms(runtimeSeed.student),
  departments: catalogSeed.departments,
  courses: catalogSeed.courses,
  offerings: buildOfferings(runtimeSeed),
  rules: buildProgramRules(runtimeSeed),
  defaultStudentId: runtimeSeed.student.id,
  baseStudent: structuredClone(runtimeSeed.student),
  seedStudentIds,
  seedOverrides: seedStudentIds.flatMap((studentId) => buildSeedOverrides(runtimeSeed, studentId)),
  auditEvents: buildSeedAuditEvents(),
};

export function createSeedStudentState(studentId = domainSeed.defaultStudentId) {
  return {
    student: createStudentProfile(domainSeed.baseStudent, studentId),
    enrollments: buildSeedEnrollments(runtimeSeed, studentId),
    requests: buildSeedRequests(runtimeSeed, studentId),
    overrides: buildSeedOverrides(runtimeSeed, studentId),
    studentMeta: {
      studentId,
      recordSequence: studentId === domainSeed.defaultStudentId ? runtimeSeed.recordSequence ?? 0 : 0,
      stateRevision: 0,
    },
  };
}

export function createSeedDomainSnapshot(studentId = domainSeed.defaultStudentId) {
  const studentState = createSeedStudentState(studentId);

  return {
    semester: structuredClone(domainSeed.semester),
    programs: structuredClone(domainSeed.programs),
    departments: structuredClone(domainSeed.departments),
    courses: structuredClone(domainSeed.courses),
    offerings: structuredClone(domainSeed.offerings),
    rules: structuredClone(domainSeed.rules),
    student: studentState.student,
    enrollments: studentState.enrollments,
    requests: studentState.requests,
    overrides: studentState.overrides,
    studentMeta: studentState.studentMeta,
    auditEvents: structuredClone(domainSeed.auditEvents),
  };
}
