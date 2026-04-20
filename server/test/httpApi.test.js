import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/index.js";

const serverHandle = await startServer({
  port: 0,
  storageOptions: { storageMode: "memory" },
  attachSignalHandlers: false,
});
serverHandle.server.unref?.();
const address = serverHandle.server.address();
const port = typeof address === "object" && address ? address.port : 4000;
const baseUrl = `http://127.0.0.1:${port}`;

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test.beforeEach(async () => {
  await requestJson("/api/reset?scope=all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
});

test.after(async () => {
  await serverHandle?.shutdown?.();
});

test("health endpoint exposes role-ready storage metadata", async () => {
  const { response, body } = await requestJson("/api/health");

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.storage.roleReady, true);
  assert.equal(body.storage.adminApiReady, true);
  assert.equal(body.storage.sharedSupplyMode, "offering-entities");
});

test("bootstrap stays backward compatible and includes announcement content", async () => {
  const { response, body } = await requestJson("/api/bootstrap");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.courses));
  assert.ok(Array.isArray(body.approvedCourses));
  assert.ok(Array.isArray(body.requestRecords));
  assert.ok(Array.isArray(body.timetable));
  assert.ok(Array.isArray(body.announcementContent?.selectionSchedule));
  assert.equal(typeof body.meta?.fetchedAt, "string");
  assert.ok(Array.isArray(body.announcementContent?.addDropSchedule));
  assert.ok(Array.isArray(body.announcementContent?.highlights));
  assert.ok(Array.isArray(body.announcementContent?.nominalStudyLoad));
  assert.ok(Array.isArray(body.announcementContent?.guidelineBlocks));
  assert.equal(typeof body.announcementContent?.maintenanceNotice, "string");
  assert.equal(typeof body.announcementContent?.keyDates?.requestClose, "string");
  assert.equal(typeof body.summary?.windowSummary?.requestClose, "string");
  assert.equal(typeof body.summary?.windowSummary?.addDropClose, "string");
  assert.equal(typeof body.summary?.windowSummary?.resultCheckWindow, "string");
  assert.equal(typeof body.summary?.windowSummary?.supportContact, "string");
  assert.equal(typeof body.summary?.studentActionSummary?.enrolledCount, "number");
  assert.ok(Array.isArray(body.summary?.studentActionSummary?.urgentActions));
  assert.equal(typeof body.summary?.studentActionSummary?.primaryAction?.label, "string");
  assert.equal(typeof body.summary?.studentActionSummary?.primaryAction?.page, "string");
  assert.ok(Array.isArray(body.requestStatusView?.currentEnrolment));
  assert.ok(Array.isArray(body.requestStatusView?.activeRequests));
  assert.ok(Array.isArray(body.requestStatusView?.archivedChanges));
});

test("invalid admin offering patch returns a non-500 validation response", async () => {
  const { response, body } = await requestJson("/api/admin/offerings/LATX7516-A-S2", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-001",
    },
    body: JSON.stringify({ capacity: 8 }),
  });

  assert.equal(response.status, 409);
  assert.equal(body.ok, false);
  assert.match(body.headline, /invalid offering state/i);
  assert.match(body.message, /capacity cannot be lower than seatsTaken/i);
});

test("admin offering preview returns impact summary without mutating state", async () => {
  await requestJson("/api/enrollment/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-student-id": "4000000001",
    },
    body: JSON.stringify({ courseId: "IDAT7212-A-S2" }),
  });

  const preview = await requestJson("/api/admin/offerings/IDAT7212-A-S2/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-preview-offering-001",
    },
    body: JSON.stringify({
      capacity: 12,
      seatsTaken: 2,
      waitlistCount: 0,
      allocationPolicy: "firstComeFirstServed",
      requestWindow: { isOpen: true, closesOn: "31 January 2026" },
      dropWindow: { isOpen: true, closesOn: "31 January 2026" },
    }),
  });

  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.ok, true);
  assert.equal(typeof preview.body.summary.capacityChange, "number");
  assert.ok(Array.isArray(preview.body.seatOccupants));
  assert.equal(preview.body.seatOccupants[0]?.studentId, "4000000001");
  assert.equal(preview.body.seatOccupants[0]?.source, "student-request");
  assert.equal(preview.body.seatOccupantSummary.totalCount, 29);
  assert.equal(preview.body.seatOccupantSummary.trackedCount, 1);
  assert.equal(preview.body.seatOccupantSummary.generatedCount, 28);
  assert.equal(preview.body.seatOccupants.at(-1)?.source, "faculty-record");

  const bootstrap = await requestJson("/api/bootstrap");
  const offering = bootstrap.body.courses.find((course) => course.id === "IDAT7212-A-S2");
  assert.equal(offering.capacityView.primary, "7 seat(s) left");
});

test("admin override lifecycle works over HTTP and changes student preview", async () => {
  const blockedPreview = await requestJson("/api/enrollment/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: "MECH7013-A-S2" }),
  });

  assert.equal(blockedPreview.response.status, 200);
  assert.equal(blockedPreview.body.ok, false);
  assert.match(blockedPreview.body.headline, /timetable clash/i);

  const created = await requestJson("/api/admin/overrides", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-override-001",
    },
    body: JSON.stringify({
      studentId: "3036605296",
      offeringId: "MECH7013-A-S2",
      constraintTypes: ["timetableClash"],
      note: "HTTP override test.",
    }),
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.override.active, true);
  assert.match(created.body.override.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  const allowedPreview = await requestJson("/api/enrollment/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: "MECH7013-A-S2" }),
  });

  assert.equal(allowedPreview.response.status, 200);
  assert.equal(allowedPreview.body.ok, true);

  const deleted = await requestJson(`/api/admin/overrides/${created.body.override.id}`, {
    method: "DELETE",
    headers: {
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-override-001",
    },
  });

  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.ok, true);

  const revertedPreview = await requestJson("/api/enrollment/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: "MECH7013-A-S2" }),
  });

  assert.equal(revertedPreview.response.status, 200);
  assert.equal(revertedPreview.body.ok, false);
  assert.match(revertedPreview.body.headline, /timetable clash/i);
});

test("admin override preview reports current and hypothetical decision states", async () => {
  const { response, body } = await requestJson("/api/admin/overrides/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-preview-001",
    },
    body: JSON.stringify({
      studentId: "3036605296",
      offeringId: "MECH7013-A-S2",
      constraintTypes: ["timetableClash"],
      note: "Preview only",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.currentDecision.ok, false);
  assert.match(body.currentDecision.headline, /timetable clash/i);
  assert.equal(body.overrideDecision.ok, true);
  assert.equal(body.overrideDecision.outcome, "lotteryQueued");
});

test("student request flow keeps bootstrap request status groups aligned", async () => {
  const requested = await requestJson("/api/enrollment/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: "MEBS6003-A-S2" }),
  });

  assert.equal(requested.response.status, 200);
  assert.equal(requested.body.ok, true);

  const afterRequest = await requestJson("/api/bootstrap");
  const activeRecord = afterRequest.body.requestStatusView.activeRequests.find(
    (record) => record.course.id === "MEBS6003-A-S2",
  );

  assert.ok(activeRecord);
  assert.equal(
    afterRequest.body.requestStatusView.activeRequests.length,
    afterRequest.body.activeRequestRecords.length,
  );

  const cancelled = await requestJson(`/api/enrollment/request/${encodeURIComponent("MEBS6003-A-S2")}`, {
    method: "DELETE",
  });

  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.ok, true);

  const afterCancel = await requestJson("/api/bootstrap");
  assert.equal(
    afterCancel.body.requestStatusView.activeRequests.some(
      (record) => record.course.id === "MEBS6003-A-S2",
    ),
    false,
  );
  assert.ok(
    afterCancel.body.requestStatusView.archivedChanges.some(
      (record) => record.course.id === "MEBS6003-A-S2" && record.status === "cancelled",
    ),
  );
});

test("admin request resolution preview returns a read-only impact summary", async () => {
  const requests = await requestJson("/api/admin/requests?active=true", {
    headers: {
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-request-preview-001",
    },
  });
  const requestId = requests.body.find((item) => item.offeringId === "COMP7906-B-S2")?.id;

  assert.ok(requestId);

  const preview = await requestJson(`/api/admin/requests/${encodeURIComponent(requestId)}/preview-resolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-request-preview-001",
    },
    body: JSON.stringify({
      action: "manual-close",
      note: "Preview close.",
    }),
  });

  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.ok, true);
  assert.equal(preview.body.summary.statusBefore, "lotteryQueued");
  assert.equal(preview.body.summary.statusAfter, "manuallyResolved");

  const bootstrap = await requestJson("/api/bootstrap");
  assert.ok(
    bootstrap.body.requestStatusView.activeRequests.some((record) => record.course.id === "COMP7906-B-S2"),
  );
});

test("admin request resolution preview can describe an invalid approval without returning 409", async () => {
  const requests = await requestJson("/api/admin/requests?active=true", {
    headers: {
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-request-preview-invalid-001",
    },
  });
  const requestId = requests.body.find((item) => item.offeringId === "COMP7906-B-S2")?.id;

  assert.ok(requestId);

  const preview = await requestJson(`/api/admin/requests/${encodeURIComponent(requestId)}/preview-resolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "staff",
      "x-actor-id": "staff-http-request-preview-invalid-001",
    },
    body: JSON.stringify({
      action: "approve",
      note: "Preview only",
    }),
  });

  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.ok, false);
  assert.equal(preview.body.requestId, requestId);
  assert.equal(preview.body.current.request.id, requestId);
  assert.match(preview.body.headline, /offering/i);
});
