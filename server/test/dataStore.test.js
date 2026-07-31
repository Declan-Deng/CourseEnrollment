import test from "node:test";
import assert from "node:assert/strict";
import { createSeedDomainSnapshot } from "../src/domainSeed.js";
import { previewEnrollmentDecision } from "../src/enrollmentDecisionService.js";
import {
  closeDataStore,
  cancelRequest,
  createAdminCourse,
  createAdminOffering,
  createAdminOverride,
  deleteAdminOverride,
  dropCourse,
  getAuditTrail,
  getBootstrap,
  getDomainSnapshot,
  listAdminOverrideView,
  listAdminOfferingView,
  listAdminCourseView,
  listAdminRequestView,
  initDataStore,
  previewAdminOfferingImpact,
  previewAdminOverrideImpact,
  previewRequest,
  resetDemo,
  resolveAdminRequest,
  submitRequest,
  updateAdminOffering,
} from "../src/dataStore.js";

const EXPECTED_COURSE_KEYS = [
  "allocationPolicy",
  "capacityView",
  "code",
  "credits",
  "crossFaculty",
  "currentState",
  "department",
  "dropNote",
  "dropOpen",
  "faculty",
  "id",
  "listType",
  "policyLabel",
  "preview",
  "requestNote",
  "requestOpen",
  "schedule",
  "seats",
  "semester",
  "subclass",
  "title",
];

test.before(async () => {
  await initDataStore({ storageMode: "memory" });
});

test.beforeEach(async () => {
  await resetDemo({ scope: "all" });
});

test.after(async () => {
  await resetDemo({ scope: "all" });
  await closeDataStore();
});

test("bootstrap course payload excludes seed-only internal fields", async () => {
  const bootstrap = await getBootstrap();
  const course = bootstrap.courses[0];

  assert.deepEqual(Object.keys(course).sort(), EXPECTED_COURSE_KEYS);
  assert.equal("synopsis" in course, false);
  assert.equal("prerequisites" in course, false);
  assert.deepEqual(Object.keys(course.seats).sort(), ["capacity", "remaining", "taken", "waitlist"]);
  assert.equal(typeof course.seats.capacity, "number");
  assert.equal(typeof course.seats.taken, "number");
  assert.equal(typeof course.seats.waitlist, "number");
  assert.equal(course.seats.remaining, Math.max(course.seats.capacity - course.seats.taken, 0));
  assert.ok(Array.isArray(bootstrap.announcementContent?.selectionSchedule));
  assert.equal(typeof bootstrap.meta?.fetchedAt, "string");
  assert.ok(Array.isArray(bootstrap.announcementContent?.addDropSchedule));
  assert.ok(Array.isArray(bootstrap.announcementContent?.highlights));
  assert.ok(Array.isArray(bootstrap.announcementContent?.nominalStudyLoad));
  assert.ok(Array.isArray(bootstrap.announcementContent?.guidelineBlocks));
  assert.equal(typeof bootstrap.announcementContent?.keyDates?.requestClose, "string");
  assert.equal(typeof bootstrap.announcementContent?.maintenanceNotice, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.requestClose, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.addDropClose, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.resultCheckWindow, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.supportContact, "string");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.enrolledCount, "number");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.activeRequestCount, "number");
  assert.ok(Array.isArray(bootstrap.summary?.studentActionSummary?.urgentActions));
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.primaryAction?.label, "string");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.primaryAction?.page, "string");
  assert.ok(Array.isArray(bootstrap.requestStatusView?.currentEnrolment));
  assert.ok(Array.isArray(bootstrap.requestStatusView?.activeRequests));
  assert.ok(Array.isArray(bootstrap.requestStatusView?.archivedChanges));
});

test("active request preview uses readable wording instead of internal status enums", async () => {
  const decision = await previewRequest("COMP7906-B-S2");
  const course = (await getBootstrap()).courses.find((item) => item.id === "COMP7906-B-S2");

  assert.equal(decision.uiVariant, "lottery");
  assert.match(decision.reasons[0], /lottery queued request/i);
  assert.doesNotMatch(decision.reasons[0], /lotteryQueued/);
  assert.deepEqual(course.currentState, {
    kind: "lotteryQueued",
    label: "Lottery queued",
  });
});

test("blocked states remain differentiated between closed, blocked, and limit", async () => {
  const initial = await getBootstrap();

  assert.deepEqual(
    initial.courses.find((course) => course.id === "IDAT7100-A-S2")?.currentState,
    { kind: "closed", label: "Closed" },
  );
  assert.deepEqual(
    initial.courses.find((course) => course.id === "MECH6034-B-S2")?.currentState,
    { kind: "blocked", label: "Blocked" },
  );

  await submitRequest("TDLL6024-C-S2");
  const afterReviewRequest = await getBootstrap();

  assert.deepEqual(
    afterReviewRequest.courses.find((course) => course.id === "STAT7601-A-S2")?.currentState,
    { kind: "limit", label: "Limit reached" },
  );
});

test("request, drop, and cancel keep the shared snapshot in sync", async () => {
  await submitRequest("IDAT7212-A-S2");
  await dropCourse("COMP7503-C-S2");
  await cancelRequest("COMP7906-B-S2");

  const snapshot = await getBootstrap();
  const approvedCodes = snapshot.approvedCourses.map((course) => course.code);
  const latestRecords = snapshot.requestRecords.slice(0, 4);
  const cancelledRecord = latestRecords.find((record) => record.status === "cancelled");

  assert.deepEqual(approvedCodes, ["COMP7506", "MECH6034", "IDAT7212"]);
  assert.equal(snapshot.activeRequestRecords.length, 0);
  assert.equal(snapshot.requestStatusView.activeRequests.length, 0);
  assert.equal(snapshot.requestStatusView.currentEnrolment.length, snapshot.approvedCourses.length);
  assert.equal(snapshot.requestStatusView.archivedChanges.length, snapshot.requestRecords.length);
  assert.ok(cancelledRecord);
  assert.notEqual(cancelledRecord.submittedAt, "2026-01-19 21:06");
  assert.match(cancelledRecord.submittedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("canonical request status view stays aligned with legacy bootstrap arrays", async () => {
  const bootstrap = await getBootstrap();

  assert.deepEqual(
    bootstrap.requestStatusView.currentEnrolment.map((course) => course.id),
    bootstrap.approvedCourses.map((course) => course.id),
  );
  assert.deepEqual(
    bootstrap.requestStatusView.activeRequests.map((record) => record.id),
    bootstrap.activeRequestRecords.map((record) => record.id),
  );
  assert.deepEqual(
    bootstrap.requestStatusView.archivedChanges.map((record) => record.id).sort(),
    bootstrap.requestRecords.filter((record) => !record.active).map((record) => record.id).sort(),
  );
  assert.equal(typeof bootstrap.requestStatusView.nextAction?.headline, "string");
  assert.equal(typeof bootstrap.requestStatusView.nextAction?.detail, "string");
  assert.ok(Array.isArray(bootstrap.requestStatusView.nextAction?.actions));
});

test("student snapshots stay isolated when a different studentId is used", async () => {
  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const defaultSnapshot = await getBootstrap();
  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const seededOtherStudent = createSeedDomainSnapshot("4000000001").student;

  assert.equal(defaultSnapshot.student.id, "3036605296");
  assert.equal(otherStudentSnapshot.student.id, "4000000001");
  assert.equal(otherStudentSnapshot.student.username, seededOtherStudent.username);
  assert.deepEqual(
    otherStudentSnapshot.approvedCourses.map((course) => course.code),
    ["IDAT7212"],
  );
  assert.equal(
    defaultSnapshot.approvedCourses.some((course) => course.code === "IDAT7212"),
    false,
  );
  assert.equal(
    otherStudentSnapshot.approvedCourses.some((course) => course.code === "IDAT7212"),
    true,
  );
});

test("course capacity is shared across different student snapshots", async () => {
  const before = await getBootstrap();
  const beforeCourse = before.courses.find((course) => course.id === "IDAT7212-A-S2");

  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const defaultSnapshotAfter = await getBootstrap();
  const updatedCourse = defaultSnapshotAfter.courses.find((course) => course.id === "IDAT7212-A-S2");

  assert.equal(beforeCourse?.capacityView.primary, "8 seats left");
  assert.equal(updatedCourse?.capacityView.primary, "7 seats left");

  await resetDemo({ studentId: "4000000001" });

  const restoredSnapshot = await getBootstrap();
  const restoredCourse = restoredSnapshot.courses.find((course) => course.id === "IDAT7212-A-S2");

  assert.equal(restoredCourse?.capacityView.primary, "8 seats left");
});

test("audit trail records student actions with actor context", async () => {
  await submitRequest("IDAT7212-A-S2");
  await cancelRequest("COMP7906-B-S2");
  await dropCourse("COMP7503-C-S2");

  const auditTrail = await getAuditTrail();
  const actions = auditTrail.map((event) => event.action);

  assert.ok(actions.includes("request-submitted"));
  assert.ok(actions.includes("request-cancelled"));
  assert.ok(actions.includes("enrollment-dropped"));
  assert.ok(auditTrail.every((event) => event.actorType));
  assert.ok(auditTrail.every((event) => event.timestamp));
});

test("admin views can inspect shared offerings and cross-student request queues", async () => {
  await submitRequest("MEBS6003-A-S2", { studentId: "4000000001" });

  const offerings = await listAdminOfferingView();
  const requests = await listAdminRequestView({ filters: { active: true } });

  assert.ok(offerings.some((offering) => offering.id === "MEBS6003-A-S2"));
  assert.ok(requests.some((request) => request.student.id === "4000000001" && request.offeringId === "MEBS6003-A-S2"));
  assert.ok(requests.some((request) => request.student.id === "3036605296" && request.offeringId === "COMP7906-B-S2"));
});

test("admin can create a new course and offering that immediately appear in staff and student views", async () => {
  const createdCourse = await createAdminCourse({
    code: "COMP7999",
    title: "Advanced enrollment operations",
    faculty: "Faculty of Engineering",
    department: "Computer Science",
    listType: "Elective",
    credits: 6,
    crossFaculty: false,
    synopsis: "Administrative testing course.",
  });

  assert.equal(createdCourse.ok, true);

  const createdOffering = await createAdminOffering({
    courseCode: "COMP7999",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 25,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Fri", start: "10:30", end: "12:20", venue: "HYC 101" }],
    prerequisites: [],
    corequisites: [],
  });

  assert.equal(createdOffering.ok, true);
  assert.equal(createdOffering.offering.id, "COMP7999-A-S2");
  assert.equal(createdOffering.offering.title, "Advanced enrollment operations");

  const adminCourses = await listAdminCourseView();
  const adminOfferings = await listAdminOfferingView();
  const bootstrap = await getBootstrap();
  const auditTrail = await getAuditTrail();

  assert.ok(adminCourses.some((course) => course.code === "COMP7999" && course.offeringCount === 1));
  assert.ok(adminOfferings.some((offering) => offering.id === "COMP7999-A-S2" && offering.title === "Advanced enrollment operations"));
  assert.ok(bootstrap.courses.some((course) => course.id === "COMP7999-A-S2" && course.title === "Advanced enrollment operations"));
  assert.ok(auditTrail.some((event) => event.action === "course-created" && event.targetId === "COMP7999"));
  assert.ok(auditTrail.some((event) => event.action === "offering-created" && event.targetId === "COMP7999-A-S2"));
});

test("admin offering preview exposes tracked approved students across the shared offering", async () => {
  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const preview = await previewAdminOfferingImpact("IDAT7212-A-S2", {
    capacity: 36,
    seatsTaken: 29,
    waitlistCount: 1,
    allocationPolicy: "firstComeFirstServed",
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
  });

  assert.equal(preview.ok, true);
  assert.ok(Array.isArray(preview.seatOccupants));
  assert.equal(preview.seatOccupants.length, 29);
  assert.equal(preview.seatOccupants[0].studentId, "4000000001");
  assert.equal(preview.seatOccupants[0].source, "student-request");
  assert.match(preview.seatOccupants[0].enrolledAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(preview.seatOccupantSummary.totalCount, 29);
  assert.equal(preview.seatOccupantSummary.trackedCount, 1);
  assert.equal(preview.seatOccupantSummary.generatedCount, 28);
  assert.equal(preview.seatOccupants.at(-1)?.source, "faculty-record");
});

test("admin updates can change offering windows and manually resolve requests", async () => {
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { requestWindow: { isOpen: false } },
    { actor: { type: "staff", id: "staff-001" } },
  );

  const previewAfterLock = await previewRequest("IDAT7212-A-S2");
  assert.equal(previewAfterLock.uiVariant, "closed");

  const activeRequests = await listAdminRequestView({ filters: { active: true } });
  const existingRequest = activeRequests.find((request) => request.offeringId === "MEBS6003-A-S2");

  assert.ok(existingRequest);

  await resolveAdminRequest(
    existingRequest.id,
    { status: "manuallyResolved", note: "Resolved by faculty admin." },
    { actor: { type: "staff", id: "staff-001" } },
  );

  const refreshedRequests = await getBootstrap({ studentId: existingRequest.studentId });
  const resolvedRecord = refreshedRequests.requestRecords.find((record) => record.id === existingRequest.id);

  assert.equal(resolvedRecord?.status, "manuallyResolved");
  assert.equal(resolvedRecord?.active, false);
});

test("admin offering updates reject invalid capacity and policy combinations", async () => {
  await assert.rejects(
    updateAdminOffering(
      "LATX7516-A-S2",
      { capacity: 8 },
      { actor: { type: "staff", id: "staff-invalid-001" } },
    ),
    /capacity cannot be lower than seatsTaken/i,
  );

  await assert.rejects(
    updateAdminOffering(
      "LATX7516-A-S2",
      { allocationPolicy: "randomPolicy" },
      { actor: { type: "staff", id: "staff-invalid-001" } },
    ),
    /unsupported allocation policy/i,
  );
});

test("admin approval promotes a request into enrollment and consumes shared capacity", async () => {
  await submitRequest("MEBS6003-A-S2", { studentId: "4000000001" });

  const request = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEBS6003-A-S2");
  const beforeOffering = (await getDomainSnapshot()).offerings.find((item) => item.id === "MEBS6003-A-S2");

  assert.ok(request);

  await resolveAdminRequest(
    request.id,
    { action: "approve", note: "Approved by faculty admin." },
    { actor: { type: "staff", id: "staff-approve-001" } },
  );

  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const resolvedRecord = otherStudentSnapshot.requestRecords.find((record) => record.id === request.id);
  const afterOffering = (await getDomainSnapshot()).offerings.find((item) => item.id === "MEBS6003-A-S2");

  assert.equal(resolvedRecord?.status, "approved");
  assert.equal(resolvedRecord?.active, false);
  assert.ok(otherStudentSnapshot.approvedCourses.some((course) => course.id === "MEBS6003-A-S2"));
  assert.equal(afterOffering?.seatsTaken, (beforeOffering?.seatsTaken ?? 0) + 1);
});

test("admin rejection closes a review request without creating an enrollment and writes staff audit context", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEBS6003-A-S2");

  assert.ok(request);

  await resolveAdminRequest(
    request.id,
    { action: "reject", note: "Rejected after manual review." },
    { actor: { type: "staff", id: "staff-reject-001" } },
  );

  const defaultSnapshot = await getBootstrap({ studentId: "4000000001" });
  const resolvedRecord = defaultSnapshot.requestRecords.find((record) => record.id === request.id);
  const auditTrail = await getAuditTrail({
    filters: {
      actorType: "staff",
      actorId: "staff-reject-001",
      targetType: "request",
      subjectStudentId: "4000000001",
    },
  });

  assert.equal(resolvedRecord?.status, "rejected");
  assert.equal(resolvedRecord?.active, false);
  assert.equal(defaultSnapshot.approvedCourses.some((course) => course.id === "MEBS6003-A-S2"), false);
  assert.ok(auditTrail.some((event) => event.action === "request-resolved"));
});

test("admin can resolve lottery pool requests manually", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "3036605296" } }))
    .find((item) => item.offeringId === "COMP7906-B-S2");

  assert.ok(request);
  assert.deepEqual(request.allowedResolutions, ["approve", "reject", "waitlist", "manual-close"]);

  const resolution = await resolveAdminRequest(
    request.id,
    { action: "reject", note: "Lottery pool resolved manually; not drawn this round." },
    { actor: { type: "staff", id: "staff-reject-lottery-001" } },
  );

  assert.equal(resolution.ok, true);
  assert.equal(resolution.request.status, "rejected");
  assert.equal(resolution.request.active, false);

  const studentView = await getBootstrap();
  const record = studentView.requestRecords.find((item) => item.offeringId === "COMP7906-B-S2");
  assert.equal(record.status, "rejected");

  await assert.rejects(
    resolveAdminRequest(
      request.id,
      { action: "manual-close", note: "Closed again after the lottery outcome." },
      { actor: { type: "staff", id: "staff-close-lottery-001" } },
    ),
    /no longer active/i,
  );
});

test("lottery approval consumes a shared seat once capacity allows it", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "3036605296" } }))
    .find((item) => item.offeringId === "COMP7906-B-S2");

  assert.ok(request);

  await assert.rejects(
    resolveAdminRequest(
      request.id,
      { action: "approve", note: "Lottery winner drawn by the programme office." },
      { actor: { type: "staff", id: "staff-lottery-approve-001" } },
    ),
    /no available seats/i,
  );

  await updateAdminOffering(
    "COMP7906-B-S2",
    { capacity: 61 },
    { actor: { type: "staff", id: "staff-lottery-approve-001" } },
  );

  const resolution = await resolveAdminRequest(
    request.id,
    { action: "approve", note: "Lottery winner drawn by the programme office." },
    { actor: { type: "staff", id: "staff-lottery-approve-001" } },
  );

  assert.equal(resolution.ok, true);
  assert.equal(resolution.request.status, "approved");

  const offerings = await listAdminOfferingView();
  const offering = offerings.find((item) => item.id === "COMP7906-B-S2");
  assert.equal(offering.seatsTaken, 61);

  const studentView = await getBootstrap();
  assert.ok(studentView.approvedCourses.some((course) => course.id === "COMP7906-B-S2"));
});

test("students can withdraw a lottery entry even after the request window closes", async () => {
  await updateAdminOffering(
    "COMP7906-B-S2",
    { requestWindow: { isOpen: true, closesOn: "2026-01-20" } },
    { actor: { type: "staff", id: "staff-window-001" } },
  );

  const bootstrap = await getBootstrap();
  const record = bootstrap.requestRecords.find((item) => item.offeringId === "COMP7906-B-S2");
  assert.equal(record.status, "lotteryQueued");
  assert.equal(record.withdrawable, true, "lottery entries stay withdrawable while pending");

  const decision = await cancelRequest("COMP7906-B-S2");
  assert.equal(decision.ok, true);

  const nextBootstrap = await getBootstrap();
  const cancelled = nextBootstrap.requestRecords.find((item) => item.offeringId === "COMP7906-B-S2");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.active, false);
});

test("admin offering creation rejects unsafe prerequisite and corequisite constraints", async () => {
  const baseOffering = {
    courseCode: "COMP7503",
    semester: 2,
    subclass: "Z",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Mon", start: "09:30", end: "12:20", venue: "HYC 201" }],
    prerequisites: [],
    corequisites: [],
  };

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "Y",
      prerequisites: ["COMP7503"],
    }),
    /itself/i,
  );

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "X",
      prerequisites: ["COMP7506"],
      corequisites: ["COMP7506"],
    }),
    /both a prerequisite and a co-requisite/i,
  );

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "W",
      prerequisites: ["NOPE9999"],
    }),
    /course catalog/i,
  );

  await createAdminCourse({
    code: "COMP8998",
    title: "Unscheduled dependency course",
    faculty: "Faculty of Engineering",
    department: "Computer Science",
    listType: "Elective",
    credits: 6,
    crossFaculty: false,
    synopsis: "Created without an offering for validation testing.",
  });

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "V",
      prerequisites: ["COMP8998"],
    }),
    /existing offering/i,
  );
});

test("admin offering creation rejects prerequisite cycles", async () => {
  const coursePayloads = [
    ["COMP8996", "Cycle test foundation"],
    ["COMP8997", "Cycle test advanced"],
  ];

  for (const [code, title] of coursePayloads) {
    await createAdminCourse({
      code,
      title,
      faculty: "Faculty of Engineering",
      department: "Computer Science",
      listType: "Elective",
      credits: 6,
      crossFaculty: false,
      synopsis: "Created for prerequisite-cycle validation.",
    });
  }

  await createAdminOffering({
    courseCode: "COMP8996",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Tue", start: "09:30", end: "12:20", venue: "HYC 202" }],
    prerequisites: [],
    corequisites: [],
  });

  await createAdminOffering({
    courseCode: "COMP8997",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Wed", start: "09:30", end: "12:20", venue: "HYC 203" }],
    prerequisites: ["COMP8996"],
    corequisites: [],
  });

  await assert.rejects(
    createAdminOffering({
      courseCode: "COMP8996",
      semester: 2,
      subclass: "B",
      allocationPolicy: "firstComeFirstServed",
      capacity: 20,
      requestWindow: { isOpen: true, closesOn: "2026-01-31" },
      dropWindow: { isOpen: true, closesOn: "2026-01-31" },
      schedule: [{ day: "Thu", start: "09:30", end: "12:20", venue: "HYC 204" }],
      prerequisites: ["COMP8997"],
      corequisites: [],
    }),
    /prerequisite cycle/i,
  );
});

test("admin resolution rejects closed requests and duplicate waitlist moves", async () => {
  const closedRequest = (await listAdminRequestView({ filters: { studentId: "4000000001" } }))
    .find((item) => item.offeringId === "LATX7517-A-S2");
  const waitlistRequest = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEST7414-A-S2");

  assert.ok(closedRequest);
  assert.ok(waitlistRequest);

  await assert.rejects(
    resolveAdminRequest(
      closedRequest.id,
      { action: "manual-close", note: "Close again." },
      { actor: { type: "staff", id: "staff-closed-guard-001" } },
    ),
    /no longer active/i,
  );

  await assert.rejects(
    resolveAdminRequest(
      waitlistRequest.id,
      { action: "waitlist", note: "Move to waitlist again." },
      { actor: { type: "staff", id: "staff-waitlist-guard-001" } },
    ),
    /cannot be moved to waitlist again/i,
  );
});

test("global reset restores shared offerings, clears audit history, and rebuilds demo students from seed", async () => {
  const baselineSnapshot = createSeedDomainSnapshot();
  const baselineOffering = baselineSnapshot.offerings.find((item) => item.id === "IDAT7212-A-S2");

  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { requestWindow: { isOpen: false } },
    { actor: { type: "staff", id: "staff-reset-001" } },
  );

  await resetDemo({ scope: "all" });

  const defaultSnapshot = await getBootstrap();
  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const offering = (await getDomainSnapshot()).offerings.find((item) => item.id === "IDAT7212-A-S2");
  const auditTrail = await getAuditTrail();

  assert.equal(offering?.requestWindow?.isOpen, true);
  assert.equal(offering?.seatsTaken, baselineOffering?.seatsTaken);
  assert.equal(offering?.waitlistCount, baselineOffering?.waitlistCount);
  assert.ok(defaultSnapshot.activeRequestRecords.some((record) => record.offeringId === "COMP7906-B-S2"));
  assert.equal(otherStudentSnapshot.approvedCourses.length, 0);
  assert.equal(auditTrail.length, baselineSnapshot.auditEvents.length);
});

test("admin overrides can temporarily bypass timetable clash rules and revert cleanly", async () => {
  const blockedDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(blockedDecision.ok, false);
  assert.equal(blockedDecision.headline, "Timetable clash detected.");

  const created = await createAdminOverride(
    {
      studentId: "3036605296",
      offeringId: "MECH7013-A-S2",
      constraintTypes: ["timetableClash"],
      note: "Approved for timetable overlap testing.",
    },
    { actor: { type: "staff", id: "staff-override-001" } },
  );

  assert.equal(created.override.active, true);

  const overrideDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(overrideDecision.ok, true);
  assert.equal(overrideDecision.outcome, "lotteryQueued");

  const listedOverrides = await listAdminOverrideView({
    filters: { active: true, studentId: "3036605296", offeringId: "MECH7013-A-S2" },
  });
  assert.equal(listedOverrides.length, 1);

  await deleteAdminOverride(created.override.id, { actor: { type: "staff", id: "staff-override-001" } });

  const revertedDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(revertedDecision.ok, false);
  assert.equal(revertedDecision.headline, "Timetable clash detected.");
});

test("concurrent student requests do not oversell the same offering", async () => {
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { capacity: 1, seatsTaken: 0, waitlistCount: 0, requestWindow: { isOpen: true }, allocationPolicy: "firstComeFirstServed" },
    { actor: { type: "staff", id: "staff-concurrency-001" } },
  );

  const [firstDecision, secondDecision] = await Promise.all([
    submitRequest("IDAT7212-A-S2", { studentId: "4000000001" }),
    submitRequest("IDAT7212-A-S2", { studentId: "4000000002" }),
  ]);

  const offering = (await getDomainSnapshot()).offerings.find((item) => item.id === "IDAT7212-A-S2");
  const studentA = await getBootstrap({ studentId: "4000000001" });
  const studentB = await getBootstrap({ studentId: "4000000002" });
  const approvedCount = [studentA, studentB].filter((snapshot) =>
    snapshot.approvedCourses.some((course) => course.id === "IDAT7212-A-S2"),
  ).length;
  const waitlistCount = [studentA, studentB].filter((snapshot) =>
    snapshot.activeRequestRecords.some((record) => record.offeringId === "IDAT7212-A-S2" && record.status === "waitlist"),
  ).length;

  assert.ok([firstDecision.outcome, secondDecision.outcome].includes("approved"));
  assert.ok([firstDecision.outcome, secondDecision.outcome].includes("waitlist"));
  assert.equal(approvedCount, 1);
  assert.equal(waitlistCount, 1);
  assert.equal(offering?.seatsTaken, 1);
  assert.equal(offering?.waitlistCount, 1);
});

test("audit trail can be filtered by action for staff-facing review", async () => {
  const created = await createAdminOverride(
    {
      studentId: "3036605296",
      offeringId: "STAT7601-A-S2",
      constraintTypes: ["corequisite"],
      note: "Temporary override for audit filtering.",
    },
    { actor: { type: "staff", id: "staff-audit-filter-001" } },
  );

  const filtered = await getAuditTrail({
    filters: {
      action: "override-created",
      actorType: "staff",
      actorId: "staff-audit-filter-001",
    },
  });

  assert.ok(filtered.some((event) => event.targetId === created.override.id));
});

test("FCFS requests join the waitlist behind an existing queue even when seats are free", async () => {
  // COMP7506-B-S2 is seeded full (40/40) with 4 waiting; free one seat by
  // raising capacity without draining the queue first.
  const beforePatch = await updateAdminOffering(
    "COMP7506-B-S2",
    { capacity: 41 },
    { actor: { type: "staff", id: "staff-fcfs-queue-001" } },
  );

  // Seeded waitlist entries are untracked, so the rebalance consumes the new
  // seat for the queue head instead of leaving it open to newcomers.
  assert.equal(beforePatch.offering.seatsTaken, 41);
  assert.equal(beforePatch.offering.waitlistCount, 3);

  const preview = await previewRequest("MECH6034-C-S2", { studentId: "4000000001" });
  assert.equal(preview.outcome, "waitlist", "full FCFS offering still routes to waitlist");

  const decision = await submitRequest("MECH6034-C-S2", { studentId: "4000000001" });
  assert.equal(decision.outcome, "waitlist");

  const offerings = await listAdminOfferingView();
  const offering = offerings.find((item) => item.id === "MECH6034-C-S2");
  assert.equal(offering.waitlistCount, 4, "seeded 3 waiting plus the new tracked request");
});

test("dropping an FCFS course promotes the earliest waitlisted student instead of freeing the seat", async () => {
  // Fill MECH6034-C-S2's queue with a tracked request first (3 seeded waiters ahead).
  const submitDecision = await submitRequest("MECH6034-C-S2", { studentId: "4000000001" });
  assert.equal(submitDecision.outcome, "waitlist");

  const offeringsBefore = await listAdminOfferingView();
  const before = offeringsBefore.find((item) => item.id === "MECH6034-C-S2");
  assert.equal(before.seatsTaken, 36);
  assert.equal(before.waitlistCount, 4);

  // The default student is enrolled in MECH6034-C-S2 and drops it.
  const dropDecision = await dropCourse("MECH6034-C-S2");
  assert.equal(dropDecision.ok, true);

  const offeringsAfter = await listAdminOfferingView();
  const after = offeringsAfter.find((item) => item.id === "MECH6034-C-S2");
  assert.equal(after.seatsTaken, 36, "the freed seat is consumed by the waiting queue");
  assert.equal(after.waitlistCount, 3, "the queue advances by one");

  const auditEvents = await getAuditTrail({ filters: { action: "waitlist-promoted" } });
  assert.ok(auditEvents.length >= 1, "promotion is written to the audit trail");

  // The 3 untracked seeded entries queued before the tracked request, so the
  // freed seat goes to the seeded head of the queue and the tracked request
  // deterministically stays on the waitlist.
  const requests = await listAdminRequestView({ filters: { studentId: "4000000001", offeringId: "MECH6034-C-S2" } });
  assert.deepEqual(
    requests.map((item) => item.status),
    ["waitlist"],
    "the tracked request keeps its place behind the seeded queue",
  );
});

test("student reset never oversells a seat that the waiting queue already took", async () => {
  // COMP7506-B-S2 is seeded full (40/40, waitlist 4) with the default student enrolled.
  const dropDecision = await dropCourse("COMP7506-B-S2");
  assert.equal(dropDecision.ok, true);

  const offeringsAfterDrop = await listAdminOfferingView();
  const afterDrop = offeringsAfterDrop.find((item) => item.id === "COMP7506-B-S2");
  assert.equal(afterDrop.seatsTaken, 40, "the freed seat went to the waiting queue");
  assert.equal(afterDrop.waitlistCount, 3);

  // Resetting the student cannot give the seat back: they rejoin the queue.
  const bootstrap = await resetDemo();

  const offeringsAfterReset = await listAdminOfferingView();
  const afterReset = offeringsAfterReset.find((item) => item.id === "COMP7506-B-S2");
  assert.ok(afterReset.seatsTaken <= afterReset.capacity, "reset must not oversell the offering");
  assert.equal(afterReset.seatsTaken, 40);
  assert.equal(afterReset.waitlistCount, 4, "the reset student rejoined the waitlist");

  assert.equal(
    bootstrap.approvedCourses.some((course) => course.id === "COMP7506-B-S2"),
    false,
    "the enrollment is not restored while the offering is full",
  );
  const waitlistRecord = bootstrap.requestRecords.find(
    (record) => record.offeringId === "COMP7506-B-S2" && record.active && record.status === "waitlist",
  );
  assert.ok(waitlistRecord, "the reset student holds an active waitlist request instead of the seat");
});

test("FCFS preview routes to the waitlist when free seats are reserved for an existing queue", async () => {
  // The API rebalances free seats into the queue immediately, so exercise the
  // pure decision engine directly with a transient free-seats+queue state.
  const snapshot = createSeedDomainSnapshot();
  const offering = snapshot.offerings.find((item) => item.id === "IDAT7212-A-S2");
  assert.equal(offering.allocationPolicy, "firstComeFirstServed");
  assert.ok(offering.capacity - offering.seatsTaken > 0, "IDAT7212-A-S2 must have free seats in seed");
  offering.waitlistCount = 2;

  const decision = previewEnrollmentDecision(snapshot, "IDAT7212-A-S2");

  assert.equal(decision.ok, true);
  assert.equal(decision.outcome, "waitlist");
  assert.match(decision.headline, /waitlisted students have priority/i);
  assert.match(decision.reasons[1], /2 students are already waiting ahead of new requests/i);
});

test("tracked waitlisted students are promoted into freed seats end to end", async () => {
  // MEST7414-A-S2 is full (24/24) with student 4000000001 tracked on the waitlist.
  // Drain the untracked queue entries first so the tracked student is at the head.
  const patched = await updateAdminOffering(
    "MEST7414-A-S2",
    { capacity: 27 },
    { actor: { type: "staff", id: "staff-fcfs-promotion-001" } },
  );

  // 3 untracked entries consume the new seats; the tracked request stays queued.
  assert.equal(patched.offering.seatsTaken, 27);
  assert.equal(patched.offering.waitlistCount, 1);

  const nextPatch = await updateAdminOffering(
    "MEST7414-A-S2",
    { capacity: 28 },
    { actor: { type: "staff", id: "staff-fcfs-promotion-001" } },
  );

  assert.equal(nextPatch.offering.seatsTaken, 28);
  assert.equal(nextPatch.offering.waitlistCount, 0);

  const bootstrap = await getBootstrap({ studentId: "4000000001" });
  assert.ok(
    bootstrap.approvedCourses.some((course) => course.id === "MEST7414-A-S2"),
    "the tracked waitlisted student is now enrolled",
  );
  const record = bootstrap.requestRecords.find((item) => item.offeringId === "MEST7414-A-S2");
  assert.equal(record.status, "approved");
  assert.equal(record.active, false);

  const auditEvents = await getAuditTrail({ filters: { action: "waitlist-promoted" } });
  assert.ok(
    auditEvents.some((event) => event.subjectStudentId === "4000000001"),
    "the tracked promotion carries the student context in the audit trail",
  );
});

test("read endpoints do not persist unknown demo students", async () => {
  const repositoryBefore = await getDomainSnapshot();
  void repositoryBefore;

  const studentIdsBefore = (await listAdminRequestView({})).map((item) => item.studentId);

  const bootstrap = await getBootstrap({ studentId: "9999990001" });
  assert.equal(bootstrap.student.id, "9999990001", "unknown students still get an ephemeral view");

  const preview = await previewRequest("COMP7503-C-S2", { studentId: "9999990002" });
  assert.equal(typeof preview.ok, "boolean");

  for (const phantomId of ["9999990001", "9999990002", "9999990003"]) {
    const overridePreview = await previewAdminOverrideImpact(
      { studentId: phantomId, offeringId: "COMP7503-C-S2", constraintTypes: ["prerequisite"] },
      { actor: { type: "staff", id: "staff-phantom-001" } },
    );
    assert.equal(overridePreview.studentKnown, false, `override preview must flag ${phantomId} as unknown`);
  }

  const studentIdsAfter = (await listAdminRequestView({})).map((item) => item.studentId);
  assert.deepEqual([...new Set(studentIdsAfter)].sort(), [...new Set(studentIdsBefore)].sort());

  for (const phantomId of ["9999990001", "9999990002", "9999990003"]) {
    assert.equal(studentIdsAfter.includes(phantomId), false, `${phantomId} must not be persisted by reads`);
  }

  // A real mutation is what registers the student.
  const decision = await submitRequest("COMP7503-C-S2", { studentId: "9999990001" });
  assert.equal(decision.ok, true);
  const overrideCheck = await previewAdminOverrideImpact(
    { studentId: "9999990001", offeringId: "COMP7503-C-S2", constraintTypes: ["prerequisite"] },
    { actor: { type: "staff", id: "staff-phantom-001" } },
  );
  assert.equal(overrideCheck.studentKnown, true, "students become known after their first mutation");
});

test("window notes agree with the date-aware request and drop flags", async () => {
  await updateAdminOffering(
    "COMP7503-C-S2",
    {
      requestWindow: { isOpen: true, closesOn: "2026-01-10" },
      dropWindow: { isOpen: true, closesOn: "2026-01-10" },
    },
    { actor: { type: "staff", id: "staff-window-notes-001" } },
  );

  const bootstrap = await getBootstrap({ studentId: "4000000001" });
  const course = bootstrap.courses.find((item) => item.id === "COMP7503-C-S2");

  assert.equal(course.requestOpen, false, "closesOn in the past closes the window");
  assert.equal(course.dropOpen, false);
  assert.match(course.requestNote, /closed on 10 Jan 2026/i, "note must not claim the window is open");
  assert.match(course.dropNote, /closed on 10 Jan 2026/i);
  assert.doesNotMatch(course.requestNote, /open until/i);
  assert.doesNotMatch(course.dropNote, /available until/i);
});

test("seeded FCFS offerings never pair free seats with a waiting queue", async () => {
  const offerings = await listAdminOfferingView();

  for (const offering of offerings) {
    if (offering.allocationPolicy !== "firstComeFirstServed") {
      continue;
    }

    if (offering.capacity - offering.seatsTaken > 0) {
      assert.equal(
        offering.waitlistCount,
        0,
        `${offering.id} has ${offering.capacity - offering.seatsTaken} free seats but ${offering.waitlistCount} waiting`,
      );
    }
  }
});

test("simulated cohort students are real records across staff and student surfaces", async () => {
  // Cohort waitlist entries appear in the staff request queue.
  const requests = await listAdminRequestView({ filters: { active: true } });
  const cohortWaitlist = requests.find(
    (request) => request.studentId === "3036787514" && request.offeringId === "COMP7506-B-S2",
  );
  assert.ok(cohortWaitlist, "cohort waitlist request must be visible in the staff queue");
  assert.equal(cohortWaitlist.status, "waitlist");
  assert.equal(typeof cohortWaitlist.student?.name, "string");

  // The same student resolves in the student portal with their enrollments.
  const bootstrap = await getBootstrap({ studentId: "3036787514" });
  assert.equal(bootstrap.student.name, cohortWaitlist.student.name, "identity must match across surfaces");
  assert.ok(
    bootstrap.approvedCourses.some((course) => course.id === "MECH6026-A-S2"),
    "cohort enrollments must show in the student portal",
  );

  // And override tooling knows them too.
  const overridePreview = await previewAdminOverrideImpact(
    { studentId: "3036787514", offeringId: "COMP7503-C-S2", constraintTypes: ["prerequisite"] },
    { actor: { type: "staff", id: "staff-cohort-check-001" } },
  );
  assert.equal(overridePreview.studentKnown, true, "cohort students are persisted, not phantoms");
});

test("seat roster rows carry consistent simulated identities", async () => {
  const preview = await previewAdminOfferingImpact("COMP7503-C-S2", {
    capacity: 45,
    seatsTaken: 43,
    waitlistCount: 0,
    allocationPolicy: "firstComeFirstServed",
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
  });

  assert.equal(preview.seatOccupantSummary.totalCount, 43);
  assert.ok(preview.seatOccupantSummary.trackedCount >= 7, "default student + 6 cohort enrollments are tracked");
  assert.ok(preview.seatOccupants.every((occupant) => typeof occupant.studentName === "string" && occupant.studentName.length > 0));

  // Any roster identity — tracked or generated — resolves to the same name
  // when the id is used elsewhere (e.g. typed into the student portal).
  const generatedOccupant = preview.seatOccupants.find((occupant) => occupant.synthetic);
  assert.ok(generatedOccupant, "large offerings still include generated faculty-record rows");
  const portalView = await getBootstrap({ studentId: generatedOccupant.studentId });
  assert.equal(portalView.student.name, generatedOccupant.studentName, "generated roster ids resolve consistently");

  const trackedCohortRow = preview.seatOccupants.find((occupant) => occupant.studentId === "3036781204");
  assert.ok(trackedCohortRow, "cohort enrollment appears as a tracked roster row");
  assert.equal(trackedCohortRow.synthetic, false);
  assert.equal(trackedCohortRow.source, "seed");
});
import test from "node:test";
import assert from "node:assert/strict";
import { createSeedDomainSnapshot } from "../src/domainSeed.js";
import {
  closeDataStore,
  cancelRequest,
  createAdminCourse,
  createAdminOffering,
  createAdminOverride,
  deleteAdminOverride,
  dropCourse,
  getAuditTrail,
  getBootstrap,
  getDomainSnapshot,
  listAdminOverrideView,
  listAdminOfferingView,
  listAdminCourseView,
  listAdminRequestView,
  initDataStore,
  previewAdminOfferingImpact,
  previewRequest,
  resetDemo,
  resolveAdminRequest,
  submitRequest,
  updateAdminOffering,
} from "../src/dataStore.js";

const EXPECTED_COURSE_KEYS = [
  "allocationPolicy",
  "capacityView",
  "code",
  "credits",
  "crossFaculty",
  "currentState",
  "department",
  "dropNote",
  "dropOpen",
  "faculty",
  "id",
  "listType",
  "policyLabel",
  "preview",
  "requestNote",
  "requestOpen",
  "schedule",
  "semester",
  "subclass",
  "title",
];

test.before(async () => {
  await initDataStore({ storageMode: "memory" });
});

test.beforeEach(async () => {
  await resetDemo({ scope: "all" });
});

test.after(async () => {
  await resetDemo({ scope: "all" });
  await closeDataStore();
});

test("bootstrap course payload excludes seed-only internal fields", async () => {
  const bootstrap = await getBootstrap();
  const course = bootstrap.courses[0];

  assert.deepEqual(Object.keys(course).sort(), EXPECTED_COURSE_KEYS);
  assert.equal("synopsis" in course, false);
  assert.equal("seats" in course, false);
  assert.equal("prerequisites" in course, false);
  assert.ok(Array.isArray(bootstrap.announcementContent?.selectionSchedule));
  assert.equal(typeof bootstrap.meta?.fetchedAt, "string");
  assert.ok(Array.isArray(bootstrap.announcementContent?.addDropSchedule));
  assert.ok(Array.isArray(bootstrap.announcementContent?.highlights));
  assert.ok(Array.isArray(bootstrap.announcementContent?.nominalStudyLoad));
  assert.ok(Array.isArray(bootstrap.announcementContent?.guidelineBlocks));
  assert.equal(typeof bootstrap.announcementContent?.keyDates?.requestClose, "string");
  assert.equal(typeof bootstrap.announcementContent?.maintenanceNotice, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.requestClose, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.addDropClose, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.resultCheckWindow, "string");
  assert.equal(typeof bootstrap.summary?.windowSummary?.supportContact, "string");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.enrolledCount, "number");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.activeRequestCount, "number");
  assert.ok(Array.isArray(bootstrap.summary?.studentActionSummary?.urgentActions));
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.primaryAction?.label, "string");
  assert.equal(typeof bootstrap.summary?.studentActionSummary?.primaryAction?.page, "string");
  assert.ok(Array.isArray(bootstrap.requestStatusView?.currentEnrolment));
  assert.ok(Array.isArray(bootstrap.requestStatusView?.activeRequests));
  assert.ok(Array.isArray(bootstrap.requestStatusView?.archivedChanges));
});

test("active request preview uses readable wording instead of internal status enums", async () => {
  const decision = await previewRequest("COMP7906-B-S2");
  const course = (await getBootstrap()).courses.find((item) => item.id === "COMP7906-B-S2");

  assert.equal(decision.uiVariant, "lottery");
  assert.match(decision.reasons[0], /lottery queued request/i);
  assert.doesNotMatch(decision.reasons[0], /lotteryQueued/);
  assert.deepEqual(course.currentState, {
    kind: "lotteryQueued",
    label: "Lottery queued",
  });
});

test("blocked states remain differentiated between closed, blocked, and limit", async () => {
  const initial = await getBootstrap();

  assert.deepEqual(
    initial.courses.find((course) => course.id === "IDAT7100-A-S2")?.currentState,
    { kind: "closed", label: "Closed" },
  );
  assert.deepEqual(
    initial.courses.find((course) => course.id === "MECH6034-B-S2")?.currentState,
    { kind: "blocked", label: "Blocked" },
  );

  await submitRequest("TDLL6024-C-S2");
  const afterReviewRequest = await getBootstrap();

  assert.deepEqual(
    afterReviewRequest.courses.find((course) => course.id === "STAT7601-A-S2")?.currentState,
    { kind: "limit", label: "Limit reached" },
  );
});

test("request, drop, and cancel keep the shared snapshot in sync", async () => {
  await submitRequest("IDAT7212-A-S2");
  await dropCourse("COMP7503-C-S2");
  await cancelRequest("COMP7906-B-S2");

  const snapshot = await getBootstrap();
  const approvedCodes = snapshot.approvedCourses.map((course) => course.code);
  const latestRecords = snapshot.requestRecords.slice(0, 4);
  const cancelledRecord = latestRecords.find((record) => record.status === "cancelled");

  assert.deepEqual(approvedCodes, ["COMP7506", "MECH6034", "IDAT7212"]);
  assert.equal(snapshot.activeRequestRecords.length, 0);
  assert.equal(snapshot.requestStatusView.activeRequests.length, 0);
  assert.equal(snapshot.requestStatusView.currentEnrolment.length, snapshot.approvedCourses.length);
  assert.equal(snapshot.requestStatusView.archivedChanges.length, snapshot.requestRecords.length);
  assert.ok(cancelledRecord);
  assert.notEqual(cancelledRecord.submittedAt, "2026-01-19 21:06");
  assert.match(cancelledRecord.submittedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("canonical request status view stays aligned with legacy bootstrap arrays", async () => {
  const bootstrap = await getBootstrap();

  assert.deepEqual(
    bootstrap.requestStatusView.currentEnrolment.map((course) => course.id),
    bootstrap.approvedCourses.map((course) => course.id),
  );
  assert.deepEqual(
    bootstrap.requestStatusView.activeRequests.map((record) => record.id),
    bootstrap.activeRequestRecords.map((record) => record.id),
  );
  assert.deepEqual(
    bootstrap.requestStatusView.archivedChanges.map((record) => record.id).sort(),
    bootstrap.requestRecords.filter((record) => !record.active).map((record) => record.id).sort(),
  );
  assert.equal(typeof bootstrap.requestStatusView.nextAction?.headline, "string");
  assert.equal(typeof bootstrap.requestStatusView.nextAction?.detail, "string");
  assert.ok(Array.isArray(bootstrap.requestStatusView.nextAction?.actions));
});

test("student snapshots stay isolated when a different studentId is used", async () => {
  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const defaultSnapshot = await getBootstrap();
  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const seededOtherStudent = createSeedDomainSnapshot("4000000001").student;

  assert.equal(defaultSnapshot.student.id, "3036605296");
  assert.equal(otherStudentSnapshot.student.id, "4000000001");
  assert.equal(otherStudentSnapshot.student.username, seededOtherStudent.username);
  assert.deepEqual(
    otherStudentSnapshot.approvedCourses.map((course) => course.code),
    ["IDAT7212"],
  );
  assert.equal(
    defaultSnapshot.approvedCourses.some((course) => course.code === "IDAT7212"),
    false,
  );
  assert.equal(
    otherStudentSnapshot.approvedCourses.some((course) => course.code === "IDAT7212"),
    true,
  );
});

test("course capacity is shared across different student snapshots", async () => {
  const before = await getBootstrap();
  const beforeCourse = before.courses.find((course) => course.id === "IDAT7212-A-S2");

  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const defaultSnapshotAfter = await getBootstrap();
  const updatedCourse = defaultSnapshotAfter.courses.find((course) => course.id === "IDAT7212-A-S2");

  assert.equal(beforeCourse?.capacityView.primary, "8 seats left");
  assert.equal(updatedCourse?.capacityView.primary, "7 seats left");

  await resetDemo({ studentId: "4000000001" });

  const restoredSnapshot = await getBootstrap();
  const restoredCourse = restoredSnapshot.courses.find((course) => course.id === "IDAT7212-A-S2");

  assert.equal(restoredCourse?.capacityView.primary, "8 seats left");
});

test("audit trail records student actions with actor context", async () => {
  await submitRequest("IDAT7212-A-S2");
  await cancelRequest("COMP7906-B-S2");
  await dropCourse("COMP7503-C-S2");

  const auditTrail = await getAuditTrail();
  const actions = auditTrail.map((event) => event.action);

  assert.ok(actions.includes("request-submitted"));
  assert.ok(actions.includes("request-cancelled"));
  assert.ok(actions.includes("enrollment-dropped"));
  assert.ok(auditTrail.every((event) => event.actorType));
  assert.ok(auditTrail.every((event) => event.timestamp));
});

test("admin views can inspect shared offerings and cross-student request queues", async () => {
  await submitRequest("MEBS6003-A-S2", { studentId: "4000000001" });

  const offerings = await listAdminOfferingView();
  const requests = await listAdminRequestView({ filters: { active: true } });

  assert.ok(offerings.some((offering) => offering.id === "MEBS6003-A-S2"));
  assert.ok(requests.some((request) => request.student.id === "4000000001" && request.offeringId === "MEBS6003-A-S2"));
  assert.ok(requests.some((request) => request.student.id === "3036605296" && request.offeringId === "COMP7906-B-S2"));
});

test("admin can create a new course and offering that immediately appear in staff and student views", async () => {
  const createdCourse = await createAdminCourse({
    code: "COMP7999",
    title: "Advanced enrollment operations",
    faculty: "Faculty of Engineering",
    department: "Computer Science",
    listType: "Elective",
    credits: 6,
    crossFaculty: false,
    synopsis: "Administrative testing course.",
  });

  assert.equal(createdCourse.ok, true);

  const createdOffering = await createAdminOffering({
    courseCode: "COMP7999",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 25,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Fri", start: "10:30", end: "12:20", venue: "HYC 101" }],
    prerequisites: [],
    corequisites: [],
  });

  assert.equal(createdOffering.ok, true);
  assert.equal(createdOffering.offering.id, "COMP7999-A-S2");
  assert.equal(createdOffering.offering.title, "Advanced enrollment operations");

  const adminCourses = await listAdminCourseView();
  const adminOfferings = await listAdminOfferingView();
  const bootstrap = await getBootstrap();
  const auditTrail = await getAuditTrail();

  assert.ok(adminCourses.some((course) => course.code === "COMP7999" && course.offeringCount === 1));
  assert.ok(adminOfferings.some((offering) => offering.id === "COMP7999-A-S2" && offering.title === "Advanced enrollment operations"));
  assert.ok(bootstrap.courses.some((course) => course.id === "COMP7999-A-S2" && course.title === "Advanced enrollment operations"));
  assert.ok(auditTrail.some((event) => event.action === "course-created" && event.targetId === "COMP7999"));
  assert.ok(auditTrail.some((event) => event.action === "offering-created" && event.targetId === "COMP7999-A-S2"));
});

test("admin offering preview exposes tracked approved students across the shared offering", async () => {
  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const preview = await previewAdminOfferingImpact("IDAT7212-A-S2", {
    capacity: 36,
    seatsTaken: 29,
    waitlistCount: 1,
    allocationPolicy: "firstComeFirstServed",
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
  });

  assert.equal(preview.ok, true);
  assert.ok(Array.isArray(preview.seatOccupants));
  assert.equal(preview.seatOccupants.length, 29);
  assert.equal(preview.seatOccupants[0].studentId, "4000000001");
  assert.equal(preview.seatOccupants[0].source, "student-request");
  assert.match(preview.seatOccupants[0].enrolledAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(preview.seatOccupantSummary.totalCount, 29);
  assert.equal(preview.seatOccupantSummary.trackedCount, 1);
  assert.equal(preview.seatOccupantSummary.generatedCount, 28);
  assert.equal(preview.seatOccupants.at(-1)?.source, "faculty-record");
});

test("admin updates can change offering windows and manually resolve requests", async () => {
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { requestWindow: { isOpen: false } },
    { actor: { type: "staff", id: "staff-001" } },
  );

  const previewAfterLock = await previewRequest("IDAT7212-A-S2");
  assert.equal(previewAfterLock.uiVariant, "closed");

  const activeRequests = await listAdminRequestView({ filters: { active: true } });
  const existingRequest = activeRequests.find((request) => request.offeringId === "MEBS6003-A-S2");

  assert.ok(existingRequest);

  await resolveAdminRequest(
    existingRequest.id,
    { status: "manuallyResolved", note: "Resolved by faculty admin." },
    { actor: { type: "staff", id: "staff-001" } },
  );

  const refreshedRequests = await getBootstrap({ studentId: existingRequest.studentId });
  const resolvedRecord = refreshedRequests.requestRecords.find((record) => record.id === existingRequest.id);

  assert.equal(resolvedRecord?.status, "manuallyResolved");
  assert.equal(resolvedRecord?.active, false);
});

test("admin offering updates reject invalid capacity and policy combinations", async () => {
  await assert.rejects(
    updateAdminOffering(
      "LATX7516-A-S2",
      { capacity: 8 },
      { actor: { type: "staff", id: "staff-invalid-001" } },
    ),
    /capacity cannot be lower than seatsTaken/i,
  );

  await assert.rejects(
    updateAdminOffering(
      "LATX7516-A-S2",
      { allocationPolicy: "randomPolicy" },
      { actor: { type: "staff", id: "staff-invalid-001" } },
    ),
    /unsupported allocation policy/i,
  );
});

test("admin approval promotes a request into enrollment and consumes shared capacity", async () => {
  await submitRequest("MEBS6003-A-S2", { studentId: "4000000001" });

  const request = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEBS6003-A-S2");
  const beforeOffering = (await getDomainSnapshot()).offerings.find((item) => item.id === "MEBS6003-A-S2");

  assert.ok(request);

  await resolveAdminRequest(
    request.id,
    { action: "approve", note: "Approved by faculty admin." },
    { actor: { type: "staff", id: "staff-approve-001" } },
  );

  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const resolvedRecord = otherStudentSnapshot.requestRecords.find((record) => record.id === request.id);
  const afterOffering = (await getDomainSnapshot()).offerings.find((item) => item.id === "MEBS6003-A-S2");

  assert.equal(resolvedRecord?.status, "approved");
  assert.equal(resolvedRecord?.active, false);
  assert.ok(otherStudentSnapshot.approvedCourses.some((course) => course.id === "MEBS6003-A-S2"));
  assert.equal(afterOffering?.seatsTaken, (beforeOffering?.seatsTaken ?? 0) + 1);
});

test("admin rejection closes a review request without creating an enrollment and writes staff audit context", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEBS6003-A-S2");

  assert.ok(request);

  await resolveAdminRequest(
    request.id,
    { action: "reject", note: "Rejected after manual review." },
    { actor: { type: "staff", id: "staff-reject-001" } },
  );

  const defaultSnapshot = await getBootstrap({ studentId: "4000000001" });
  const resolvedRecord = defaultSnapshot.requestRecords.find((record) => record.id === request.id);
  const auditTrail = await getAuditTrail({
    filters: {
      actorType: "staff",
      actorId: "staff-reject-001",
      targetType: "request",
      subjectStudentId: "4000000001",
    },
  });

  assert.equal(resolvedRecord?.status, "rejected");
  assert.equal(resolvedRecord?.active, false);
  assert.equal(defaultSnapshot.approvedCourses.some((course) => course.id === "MEBS6003-A-S2"), false);
  assert.ok(auditTrail.some((event) => event.action === "request-resolved"));
});

test("admin ordinary resolution rejects lottery pool requests", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "3036605296" } }))
    .find((item) => item.offeringId === "COMP7906-B-S2");

  assert.ok(request);

  await assert.rejects(
    resolveAdminRequest(
      request.id,
      { action: "reject", note: "Rejected after manual review." },
      { actor: { type: "staff", id: "staff-reject-lottery-001" } },
    ),
    /ordinary staff review queue/i,
  );

  await assert.rejects(
    resolveAdminRequest(
      request.id,
      { action: "manual-close", note: "Closed without outcome from ordinary staff review." },
      { actor: { type: "staff", id: "staff-close-lottery-001" } },
    ),
    /ordinary staff review queue/i,
  );
});

test("admin offering creation rejects unsafe prerequisite and corequisite constraints", async () => {
  const baseOffering = {
    courseCode: "COMP7503",
    semester: 2,
    subclass: "Z",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Mon", start: "09:30", end: "12:20", venue: "HYC 201" }],
    prerequisites: [],
    corequisites: [],
  };

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "Y",
      prerequisites: ["COMP7503"],
    }),
    /itself/i,
  );

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "X",
      prerequisites: ["COMP7506"],
      corequisites: ["COMP7506"],
    }),
    /both a prerequisite and a co-requisite/i,
  );

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "W",
      prerequisites: ["NOPE9999"],
    }),
    /course catalog/i,
  );

  await createAdminCourse({
    code: "COMP8998",
    title: "Unscheduled dependency course",
    faculty: "Faculty of Engineering",
    department: "Computer Science",
    listType: "Elective",
    credits: 6,
    crossFaculty: false,
    synopsis: "Created without an offering for validation testing.",
  });

  await assert.rejects(
    createAdminOffering({
      ...baseOffering,
      subclass: "V",
      prerequisites: ["COMP8998"],
    }),
    /existing offering/i,
  );
});

test("admin offering creation rejects prerequisite cycles", async () => {
  const coursePayloads = [
    ["COMP8996", "Cycle test foundation"],
    ["COMP8997", "Cycle test advanced"],
  ];

  for (const [code, title] of coursePayloads) {
    await createAdminCourse({
      code,
      title,
      faculty: "Faculty of Engineering",
      department: "Computer Science",
      listType: "Elective",
      credits: 6,
      crossFaculty: false,
      synopsis: "Created for prerequisite-cycle validation.",
    });
  }

  await createAdminOffering({
    courseCode: "COMP8996",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Tue", start: "09:30", end: "12:20", venue: "HYC 202" }],
    prerequisites: [],
    corequisites: [],
  });

  await createAdminOffering({
    courseCode: "COMP8997",
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: 20,
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
    schedule: [{ day: "Wed", start: "09:30", end: "12:20", venue: "HYC 203" }],
    prerequisites: ["COMP8996"],
    corequisites: [],
  });

  await assert.rejects(
    createAdminOffering({
      courseCode: "COMP8996",
      semester: 2,
      subclass: "B",
      allocationPolicy: "firstComeFirstServed",
      capacity: 20,
      requestWindow: { isOpen: true, closesOn: "2026-01-31" },
      dropWindow: { isOpen: true, closesOn: "2026-01-31" },
      schedule: [{ day: "Thu", start: "09:30", end: "12:20", venue: "HYC 204" }],
      prerequisites: ["COMP8997"],
      corequisites: [],
    }),
    /prerequisite cycle/i,
  );
});

test("admin resolution rejects closed requests and duplicate waitlist moves", async () => {
  const closedRequest = (await listAdminRequestView({ filters: { studentId: "4000000001" } }))
    .find((item) => item.offeringId === "LATX7517-A-S2");
  const waitlistRequest = (await listAdminRequestView({ filters: { active: true, studentId: "4000000001" } }))
    .find((item) => item.offeringId === "MEST7414-A-S2");

  assert.ok(closedRequest);
  assert.ok(waitlistRequest);

  await assert.rejects(
    resolveAdminRequest(
      closedRequest.id,
      { action: "manual-close", note: "Close again." },
      { actor: { type: "staff", id: "staff-closed-guard-001" } },
    ),
    /no longer active/i,
  );

  await assert.rejects(
    resolveAdminRequest(
      waitlistRequest.id,
      { action: "waitlist", note: "Move to waitlist again." },
      { actor: { type: "staff", id: "staff-waitlist-guard-001" } },
    ),
    /cannot be moved to waitlist again/i,
  );
});

test("global reset restores shared offerings, clears audit history, and rebuilds demo students from seed", async () => {
  const baselineSnapshot = createSeedDomainSnapshot();
  const baselineOffering = baselineSnapshot.offerings.find((item) => item.id === "IDAT7212-A-S2");

  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { requestWindow: { isOpen: false } },
    { actor: { type: "staff", id: "staff-reset-001" } },
  );

  await resetDemo({ scope: "all" });

  const defaultSnapshot = await getBootstrap();
  const otherStudentSnapshot = await getBootstrap({ studentId: "4000000001" });
  const offering = (await getDomainSnapshot()).offerings.find((item) => item.id === "IDAT7212-A-S2");
  const auditTrail = await getAuditTrail();

  assert.equal(offering?.requestWindow?.isOpen, true);
  assert.equal(offering?.seatsTaken, baselineOffering?.seatsTaken);
  assert.equal(offering?.waitlistCount, baselineOffering?.waitlistCount);
  assert.ok(defaultSnapshot.activeRequestRecords.some((record) => record.offeringId === "COMP7906-B-S2"));
  assert.equal(otherStudentSnapshot.approvedCourses.length, 0);
  assert.equal(auditTrail.length, baselineSnapshot.auditEvents.length);
});

test("admin overrides can temporarily bypass timetable clash rules and revert cleanly", async () => {
  const blockedDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(blockedDecision.ok, false);
  assert.equal(blockedDecision.headline, "Timetable clash detected.");

  const created = await createAdminOverride(
    {
      studentId: "3036605296",
      offeringId: "MECH7013-A-S2",
      constraintTypes: ["timetableClash"],
      note: "Approved for timetable overlap testing.",
    },
    { actor: { type: "staff", id: "staff-override-001" } },
  );

  assert.equal(created.override.active, true);

  const overrideDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(overrideDecision.ok, true);
  assert.equal(overrideDecision.outcome, "lotteryQueued");

  const listedOverrides = await listAdminOverrideView({
    filters: { active: true, studentId: "3036605296", offeringId: "MECH7013-A-S2" },
  });
  assert.equal(listedOverrides.length, 1);

  await deleteAdminOverride(created.override.id, { actor: { type: "staff", id: "staff-override-001" } });

  const revertedDecision = await previewRequest("MECH7013-A-S2");
  assert.equal(revertedDecision.ok, false);
  assert.equal(revertedDecision.headline, "Timetable clash detected.");
});

test("concurrent student requests do not oversell the same offering", async () => {
  await updateAdminOffering(
    "IDAT7212-A-S2",
    { capacity: 1, seatsTaken: 0, waitlistCount: 0, requestWindow: { isOpen: true }, allocationPolicy: "firstComeFirstServed" },
    { actor: { type: "staff", id: "staff-concurrency-001" } },
  );

  const [firstDecision, secondDecision] = await Promise.all([
    submitRequest("IDAT7212-A-S2", { studentId: "4000000001" }),
    submitRequest("IDAT7212-A-S2", { studentId: "4000000002" }),
  ]);

  const offering = (await getDomainSnapshot()).offerings.find((item) => item.id === "IDAT7212-A-S2");
  const studentA = await getBootstrap({ studentId: "4000000001" });
  const studentB = await getBootstrap({ studentId: "4000000002" });
  const approvedCount = [studentA, studentB].filter((snapshot) =>
    snapshot.approvedCourses.some((course) => course.id === "IDAT7212-A-S2"),
  ).length;
  const waitlistCount = [studentA, studentB].filter((snapshot) =>
    snapshot.activeRequestRecords.some((record) => record.offeringId === "IDAT7212-A-S2" && record.status === "waitlist"),
  ).length;

  assert.ok([firstDecision.outcome, secondDecision.outcome].includes("approved"));
  assert.ok([firstDecision.outcome, secondDecision.outcome].includes("waitlist"));
  assert.equal(approvedCount, 1);
  assert.equal(waitlistCount, 1);
  assert.equal(offering?.seatsTaken, 1);
  assert.equal(offering?.waitlistCount, 1);
});

test("audit trail can be filtered by action for staff-facing review", async () => {
  const created = await createAdminOverride(
    {
      studentId: "3036605296",
      offeringId: "STAT7601-A-S2",
      constraintTypes: ["corequisite"],
      note: "Temporary override for audit filtering.",
    },
    { actor: { type: "staff", id: "staff-audit-filter-001" } },
  );

  const filtered = await getAuditTrail({
    filters: {
      action: "override-created",
      actorType: "staff",
      actorId: "staff-audit-filter-001",
    },
  });

  assert.ok(filtered.some((event) => event.targetId === created.override.id));
});
