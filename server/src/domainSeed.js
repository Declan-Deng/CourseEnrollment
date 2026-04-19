import { initialState } from "../data/seed.js";
import { createRuntimeState } from "./runtimeState.js";

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

  const email = studentId.includes("@") ? studentId : `${studentId}@connect.hku.hk`;
  const username = email.split("@")[0];
  const suffix = studentId.slice(-4);

  return {
    ...structuredClone(seedStudent),
    id: studentId,
    email,
    username,
    name: `Demo Student ${suffix}`,
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
      closesOn: runtimeSeed.semester.keyDates?.requestClose ?? null,
    },
    dropWindow: {
      isOpen: course.dropOpen,
      closesOn: runtimeSeed.semester.keyDates?.addDropClose ?? null,
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
  if (studentId !== runtimeSeed.student.id) {
    return [];
  }

  return runtimeSeed.approvedCourseIds.map((offeringId) => ({
    id: `enr-${studentId}-${offeringId}`,
    studentId,
    offeringId,
    status: "approved",
    source: "seed",
    createdAt: "2026-01-19 09:00",
  }));
}

function buildSeedRequests(runtimeSeed, studentId) {
  if (studentId !== runtimeSeed.student.id) {
    return [];
  }

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

function buildSeedOverrides(_runtimeSeed, _studentId) {
  return [];
}

const runtimeSeed = createRuntimeState(initialState);
const catalogSeed = buildCourseCatalog(runtimeSeed);

export const domainSeed = {
  semester: structuredClone(runtimeSeed.semester),
  programs: buildPrograms(runtimeSeed.student),
  departments: catalogSeed.departments,
  courses: catalogSeed.courses,
  offerings: buildOfferings(runtimeSeed),
  rules: buildProgramRules(runtimeSeed),
  defaultStudentId: runtimeSeed.student.id,
  baseStudent: structuredClone(runtimeSeed.student),
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
    auditEvents: [],
  };
}
