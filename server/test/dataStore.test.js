import test from "node:test";
import assert from "node:assert/strict";
import { createSeedDomainSnapshot } from "../src/domainSeed.js";
import {
  closeDataStore,
  cancelRequest,
  createAdminOverride,
  deleteAdminOverride,
  dropCourse,
  getAuditTrail,
  getBootstrap,
  getDomainSnapshot,
  listAdminOverrideView,
  listAdminOfferingView,
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

  assert.equal(beforeCourse?.capacityView.primary, "8 seat(s) left");
  assert.equal(updatedCourse?.capacityView.primary, "7 seat(s) left");

  await resetDemo({ studentId: "4000000001" });

  const restoredSnapshot = await getBootstrap();
  const restoredCourse = restoredSnapshot.courses.find((course) => course.id === "IDAT7212-A-S2");

  assert.equal(restoredCourse?.capacityView.primary, "8 seat(s) left");
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

test("admin offering preview exposes tracked approved students across the shared offering", async () => {
  await submitRequest("IDAT7212-A-S2", { studentId: "4000000001" });

  const preview = await previewAdminOfferingImpact("IDAT7212-A-S2", {
    capacity: 36,
    seatsTaken: 29,
    waitlistCount: 1,
    allocationPolicy: "firstComeFirstServed",
    requestWindow: { isOpen: true, closesOn: "31 January 2026" },
    dropWindow: { isOpen: true, closesOn: "31 January 2026" },
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
  const existingRequest = activeRequests.find((request) => request.offeringId === "COMP7906-B-S2");

  assert.ok(existingRequest);

  await resolveAdminRequest(
    existingRequest.id,
    { status: "manuallyResolved", note: "Resolved by faculty admin." },
    { actor: { type: "staff", id: "staff-001" } },
  );

  const refreshedRequests = await getBootstrap();
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

test("admin rejection closes a request without creating an enrollment and writes staff audit context", async () => {
  const request = (await listAdminRequestView({ filters: { active: true, studentId: "3036605296" } }))
    .find((item) => item.offeringId === "COMP7906-B-S2");

  assert.ok(request);

  await resolveAdminRequest(
    request.id,
    { action: "reject", note: "Rejected after manual review." },
    { actor: { type: "staff", id: "staff-reject-001" } },
  );

  const defaultSnapshot = await getBootstrap();
  const resolvedRecord = defaultSnapshot.requestRecords.find((record) => record.id === request.id);
  const auditTrail = await getAuditTrail({
    filters: {
      actorType: "staff",
      actorId: "staff-reject-001",
      targetType: "request",
      subjectStudentId: "3036605296",
    },
  });

  assert.equal(resolvedRecord?.status, "rejected");
  assert.equal(resolvedRecord?.active, false);
  assert.equal(defaultSnapshot.approvedCourses.some((course) => course.id === "COMP7906-B-S2"), false);
  assert.ok(auditTrail.some((event) => event.action === "request-resolved"));
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
