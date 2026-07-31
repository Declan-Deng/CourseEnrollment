import { initialState } from "../data/seed.js";
import { createAuditEvent } from "./auditService.js";
import { createRuntimeState } from "./runtimeState.js";
import { getSimulatedStudentName } from "./simulatedIdentity.js";
import { createSeedStaffUsers } from "./staffAuthService.js";
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

  void suffix;

  return {
    ...structuredClone(seedStudent),
    ...seededProfile,
    id: studentId,
    email: seededProfile.email ?? email,
    username: seededProfile.username ?? username,
    // Deterministic identity: the same id shows the same name everywhere
    // (seat rosters, override previews, portal bootstrap).
    name: seededProfile.name ?? getSimulatedStudentName(studentId),
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

// A cohort of fully simulated students that back part of the shared seat and
// queue counters with complete, inspectable records: their enrollments appear
// as tracked rows in staff seat rosters, their requests populate the staff
// review queue, and their ids resolve everywhere (portal, override tooling).
// Offerings intentionally left cohort-free because tests pin their exact
// tracked counts: IDAT7212-A-S2, MEST7414-A-S2, COMP7906-B-S2.
const REVIEW_QUEUED_MESSAGE = "Queued for faculty review. Outcome will be confirmed after the programme panel meets.";
const LOTTERY_QUEUED_MESSAGE = "Queued for lottery allocation. Outcome will be published after the draw window closes.";

const SIMULATED_COHORT = [
  { id: "3036781204", enrollments: [["COMP7503-C-S2", "2026-01-15 09:20"], ["COMP7506-B-S2", "2026-01-16 10:40"]] },
  {
    id: "3036712845",
    enrollments: [["COMP7503-C-S2", "2026-01-15 10:05"], ["MECH6034-C-S2", "2026-01-16 14:30"]],
    requests: [{ offeringId: "IDAT7211-B-S2", status: "lotteryQueued", active: true, submittedAt: "2026-01-19 13:20", message: LOTTERY_QUEUED_MESSAGE }],
  },
  {
    id: "3036790362",
    enrollments: [["COMP7503-C-S2", "2026-01-15 11:15"], ["IDAT7213-B-S2", "2026-01-16 09:45"]],
    requests: [
      {
        offeringId: "LATX7517-A-S2",
        status: "rejected",
        active: false,
        submittedAt: "2026-01-17 10:30",
        message: "Not drawn in the lottery round; no seat was allocated.",
        resolution: "Lottery round completed without a seat.",
      },
    ],
  },
  { id: "3036745981", enrollments: [["COMP7503-C-S2", "2026-01-15 13:40"], ["IDAT7215-B-S2", "2026-01-16 15:00"]] },
  {
    id: "3036702417",
    enrollments: [["COMP7503-C-S2", "2026-01-15 14:20"]],
    requests: [{ offeringId: "MEST7414-A-S2", status: "cancelled", active: false, submittedAt: "2026-01-16 16:50", message: "Request cancelled by student." }],
  },
  {
    id: "3036768523",
    enrollments: [["COMP7503-C-S2", "2026-01-15 16:05"], ["LATX7516-A-S2", "2026-01-17 09:30"]],
    requests: [
      {
        offeringId: "MEBS7013-A-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-18 11:15",
        message: "Moved to the waitlist while the office reviews seat availability.",
        resolution: "Held on the waitlist by the faculty office.",
      },
    ],
  },
  { id: "3036723094", enrollments: [["COMP7506-B-S2", "2026-01-16 09:15"], ["MECH6034-C-S2", "2026-01-16 15:45"]] },
  {
    id: "3036757618",
    enrollments: [["COMP7506-B-S2", "2026-01-16 11:25"], ["IDAT7215-B-S2", "2026-01-15 15:10"]],
    requests: [
      {
        offeringId: "MECH7011-A-S2",
        status: "manuallyResolved",
        active: false,
        submittedAt: "2026-01-17 12:40",
        message: "Closed after office follow-up with the student.",
        resolution: "Manually closed by the programme office.",
      },
    ],
  },
  {
    id: "3036734176",
    enrollments: [["COMP7506-B-S2", "2026-01-16 13:50"], ["MEBS6016-A-S2", "2026-01-17 10:10"]],
    requests: [{ offeringId: "IDAT7211-B-S2", status: "lotteryQueued", active: true, submittedAt: "2026-01-19 17:45", message: LOTTERY_QUEUED_MESSAGE }],
  },
  { id: "3036796250", enrollments: [["COMP7506-B-S2", "2026-01-16 17:30"], ["MECH7014-C-S2", "2026-01-17 11:05"]] },
  { id: "3036718609", enrollments: [["MECH6034-C-S2", "2026-01-16 10:20"], ["MEST7413-A-S2", "2026-01-17 14:15"]] },
  { id: "3036762385", enrollments: [["MECH6034-C-S2", "2026-01-17 09:05"], ["STAT7601-A-S2", "2026-01-17 16:20"]] },
  {
    id: "3036741027",
    enrollments: [["IDAT7213-B-S2", "2026-01-16 11:35"], ["TDLL6024-C-S2", "2026-01-17 13:25"]],
    requests: [{ offeringId: "IDAT7211-B-S2", status: "lotteryQueued", active: true, submittedAt: "2026-01-20 08:30", message: LOTTERY_QUEUED_MESSAGE }],
  },
  { id: "3036775840", enrollments: [["IDAT7213-B-S2", "2026-01-16 14:55"], ["MECH7020-A-S2", "2026-01-17 15:35"]] },
  {
    id: "3036709153",
    enrollments: [["IDAT7215-B-S2", "2026-01-15 16:40"]],
    requests: [
      {
        offeringId: "MECH6034-C-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-16 10:05",
        message: "Course is full; joined the waitlist queue.",
      },
    ],
  },
  {
    id: "3036752396",
    enrollments: [["IDAT7215-B-S2", "2026-01-16 08:50"]],
    requests: [{ offeringId: "TDLL6024-C-S2", status: "pendingReview", active: true, submittedAt: "2026-01-19 10:20", message: REVIEW_QUEUED_MESSAGE }],
  },
  {
    id: "3036787514",
    enrollments: [["MECH6026-A-S2", "2026-01-17 09:40"]],
    requests: [
      {
        offeringId: "COMP7506-B-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-17 09:10",
        message: "Course is full; joined the waitlist queue.",
      },
    ],
  },
  {
    id: "3036720968",
    enrollments: [["MECH6026-A-S2", "2026-01-17 10:55"]],
    requests: [{ offeringId: "MEBS6003-A-S2", status: "pendingReview", active: true, submittedAt: "2026-01-18 16:45", message: REVIEW_QUEUED_MESSAGE }],
  },
  { id: "3036766031", enrollments: [["LATX7516-A-S2", "2026-01-17 11:45"], ["TDLL6024-C-S2", "2026-01-16 18:35"]] },
  { id: "3036739472", enrollments: [["LATX7516-A-S2", "2026-01-17 13:15"], ["MECH7020-A-S2", "2026-01-18 09:25"]] },
  {
    id: "3036714786",
    enrollments: [["MEBS6016-A-S2", "2026-01-17 14:35"], ["MECH6026-A-S2", "2026-01-18 10:15"]],
    requests: [{ offeringId: "MEST7421-A-S2", status: "pendingReview", active: true, submittedAt: "2026-01-19 09:55", message: REVIEW_QUEUED_MESSAGE }],
  },
  {
    id: "3036758240",
    enrollments: [["MECH7014-C-S2", "2026-01-17 16:10"]],
    requests: [{ offeringId: "TDLL6024-C-S2", status: "pendingReview", active: true, submittedAt: "2026-01-19 14:05", message: REVIEW_QUEUED_MESSAGE }],
  },
  {
    id: "3036783659",
    enrollments: [["MEST7413-A-S2", "2026-01-17 17:25"]],
    requests: [
      {
        offeringId: "COMP7506-B-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-17 15:40",
        message: "Course is full; joined the waitlist queue.",
      },
    ],
  },
  {
    id: "3036727301",
    enrollments: [["STAT7601-A-S2", "2026-01-18 09:35"]],
    requests: [
      {
        offeringId: "MECH6034-C-S2",
        status: "waitlist",
        active: true,
        submittedAt: "2026-01-17 11:30",
        message: "Course is full; joined the waitlist queue.",
      },
    ],
  },
];

for (const member of SIMULATED_COHORT) {
  SEEDED_STUDENT_SCENARIOS[member.id] = {
    student: {},
    enrollments: member.enrollments.map(([offeringId, createdAt]) => ({
      id: `enr-${member.id}-${offeringId}`,
      studentId: member.id,
      offeringId,
      status: "approved",
      source: "seed",
      createdAt,
    })),
    requests: (member.requests ?? []).map((request, index) => ({
      id: `req-${member.id}-${index + 1}`,
      studentId: member.id,
      resolution: null,
      ...request,
    })),
    overrides: [],
  };
}

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
  staffUsers: createSeedStaffUsers(),
  seedStudentIds,
  seedOverrides: seedStudentIds.flatMap((studentId) => buildSeedOverrides(runtimeSeed, studentId)),
  auditEvents: buildSeedAuditEvents(),
};

function getSeededRecordSequence(studentId, requests, baseSequence = 0) {
  const idPrefix = `req-${studentId}-`;

  return requests.reduce((maxSequence, request) => {
    if (typeof request.id !== "string" || !request.id.startsWith(idPrefix)) {
      return maxSequence;
    }

    const sequence = Number(request.id.slice(idPrefix.length));
    return Number.isFinite(sequence) ? Math.max(maxSequence, sequence) : maxSequence;
  }, baseSequence);
}

export function createSeedStudentState(studentId = domainSeed.defaultStudentId) {
  const requests = buildSeedRequests(runtimeSeed, studentId);

  return {
    student: createStudentProfile(domainSeed.baseStudent, studentId),
    enrollments: buildSeedEnrollments(runtimeSeed, studentId),
    requests,
    overrides: buildSeedOverrides(runtimeSeed, studentId),
    studentMeta: {
      studentId,
      // The sequence must clear every seeded request id, otherwise the first
      // new request would reuse an existing id (and corrupt Mongo persistence).
      recordSequence: getSeededRecordSequence(
        studentId,
        requests,
        studentId === domainSeed.defaultStudentId ? runtimeSeed.recordSequence ?? 0 : 0,
      ),
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
import { initialState } from "../data/seed.js";
import { createAuditEvent } from "./auditService.js";
import { createRuntimeState } from "./runtimeState.js";
import { createSeedStaffUsers } from "./staffAuthService.js";
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
  staffUsers: createSeedStaffUsers(),
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
