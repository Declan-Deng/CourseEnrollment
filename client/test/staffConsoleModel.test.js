import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditEventChange,
  buildAuditEventSummary,
  buildOfferingForm,
  buildRequestPreviewDetail,
  formatRequestListId,
  getRequestWorkflow,
  getSuggestedOverrideConstraintIds,
  isResolutionActionAllowed,
} from "../src/staffConsoleModel.js";

function makeRequest(overrides = {}) {
  return {
    id: "req-3036605296-1",
    studentId: "3036605296",
    offeringId: "MEBS6003-A-S2",
    status: "pendingReview",
    active: true,
    message: "Queued for faculty review.",
    ...overrides,
  };
}

function makeOffering(overrides = {}) {
  return {
    id: "MEBS6003-A-S2",
    allocationPolicy: "priorityReview",
    capacity: 30,
    seatsTaken: 23,
    waitlistCount: 4,
    ...overrides,
  };
}

test("staff request workflow exposes only policy-eligible actions", () => {
  const review = makeRequest();
  const lottery = makeRequest({ status: "lotteryQueued", offeringId: "COMP7906-B-S2" });
  const waitlist = makeRequest({ status: "waitlist" });
  const closed = makeRequest({ active: false, status: "approved" });

  assert.deepEqual(getRequestWorkflow(review, makeOffering()).allowedActions, [
    "approve",
    "reject",
    "waitlist",
    "manual-close",
  ]);
  // Lottery pools are resolved manually by staff in this prototype.
  assert.deepEqual(getRequestWorkflow(lottery, makeOffering({ allocationPolicy: "lottery" })).allowedActions, [
    "approve",
    "reject",
    "waitlist",
    "manual-close",
  ]);
  assert.deepEqual(getRequestWorkflow(waitlist, makeOffering()).allowedActions, ["approve", "reject", "manual-close"]);
  assert.deepEqual(getRequestWorkflow(closed, makeOffering()).allowedActions, []);
  assert.equal(isResolutionActionAllowed(review, makeOffering(), "approve"), true);
  assert.equal(isResolutionActionAllowed(lottery, makeOffering({ allocationPolicy: "lottery" }), "approve"), true);
});

test("server-published allowedResolutions override the local policy map", () => {
  const request = makeRequest({ allowedResolutions: ["manual-close"] });

  assert.deepEqual(getRequestWorkflow(request, makeOffering()).allowedActions, ["manual-close"]);
  assert.equal(isResolutionActionAllowed(request, makeOffering(), "approve"), false);
  assert.equal(isResolutionActionAllowed(request, makeOffering(), "manual-close"), true);
});

test("offering form keeps every teaching slot instead of flattening to the first", () => {
  const multiSlot = buildOfferingForm({
    capacity: 30,
    allocationPolicy: "firstComeFirstServed",
    schedule: [
      { day: "Mon", start: "09:30", end: "12:20", venue: "CPD-1.24" },
      { day: "Thu", start: "14:30", end: "16:20", venue: "HWB-4.01" },
    ],
    requestWindow: { isOpen: true, closesOn: "2026-01-31" },
    dropWindow: { isOpen: true, closesOn: "2026-01-31" },
  });

  assert.equal(multiSlot.scheduleSlots.length, 2);
  assert.deepEqual(multiSlot.scheduleSlots[1], { day: "Thu", start: "14:30", end: "16:20", venue: "HWB-4.01" });

  const noSlots = buildOfferingForm({
    capacity: 999,
    allocationPolicy: "locked",
    schedule: [],
    requestWindow: { isOpen: false, closesOn: "2026-01-31" },
    dropWindow: { isOpen: false, closesOn: "2026-01-31" },
  });

  assert.deepEqual(noSlots.scheduleSlots, [], "offerings without slots must not gain a fabricated one");
});

test("staff preview text describes student outcome, supply impact, and audit effect", () => {
  const detail = buildRequestPreviewDetail(makeRequest(), "approve", {
    summary: {
      statusBefore: "pendingReview",
      statusAfter: "approved",
      activeAfter: false,
      enrollmentCreated: true,
      seatsTakenDelta: 1,
      waitlistDelta: 0,
    },
  });

  assert.match(detail, /Pending review → Approved/);
  assert.match(detail, /Seats \+1; waitlist \+0/);
  assert.match(detail, /audit event is written/);
  assert.match(detail, /new enrolment will be created/i);
});

test("override suggestions are derived from the actual blocker text", () => {
  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Timetable clash detected.",
      reasons: ["MECH7013 overlaps with COMP7506 subclass B."],
      suggestedActions: ["Review conflict day/time."],
    }),
    ["timetableClash"],
  );

  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Cross-faculty quota would be exceeded.",
      reasons: ["The cross-faculty quota is full."],
      suggestedActions: [],
    }),
    ["crossFacultyQuota"],
  );

  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Co-requisite not satisfied.",
      reasons: ["TDLL6024 must be taken together."],
      suggestedActions: [],
    }),
    ["corequisite"],
  );
});

test("audit labels summarize state changes without exposing full internal payloads in the table", () => {
  const submitted = {
    action: "request-submitted",
    targetId: "MEBS6003-A-S2",
    after: {
      request: {
        id: "req-4000000001-1",
        offeringId: "MEBS6003-A-S2",
        studentId: "4000000001",
        status: "pendingReview",
        active: true,
      },
    },
  };
  const resolved = {
    action: "request-resolved",
    targetId: "req-4000000001-1",
    before: { request: { status: "pendingReview", active: true, offeringId: "MEBS6003-A-S2" } },
    after: { request: { status: "approved", active: false, offeringId: "MEBS6003-A-S2", resolution: "Approved." } },
  };

  assert.equal(formatRequestListId("req-3036605296-12"), "…5296-12");
  assert.equal(buildAuditEventSummary(submitted), "New request for MEBS6003-A-S2");
  assert.equal(buildAuditEventChange(submitted), "Request created in Pending review status · currently active");
  assert.equal(buildAuditEventSummary(resolved), "MEBS6003-A-S2 was processed by staff.");
  assert.equal(buildAuditEventChange(resolved), "Status: Pending review → Approved; Active: Yes → No");
});
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditEventChange,
  buildAuditEventSummary,
  buildRequestPreviewDetail,
  formatRequestListId,
  getRequestWorkflow,
  getSuggestedOverrideConstraintIds,
  isResolutionActionAllowed,
} from "../src/staffConsoleModel.js";

function makeRequest(overrides = {}) {
  return {
    id: "req-3036605296-1",
    studentId: "3036605296",
    offeringId: "MEBS6003-A-S2",
    status: "pendingReview",
    active: true,
    message: "Queued for faculty review.",
    ...overrides,
  };
}

function makeOffering(overrides = {}) {
  return {
    id: "MEBS6003-A-S2",
    allocationPolicy: "priorityReview",
    capacity: 30,
    seatsTaken: 23,
    waitlistCount: 4,
    ...overrides,
  };
}

test("staff request workflow exposes only policy-eligible actions", () => {
  const review = makeRequest();
  const lottery = makeRequest({ status: "lotteryQueued", offeringId: "COMP7906-B-S2" });
  const waitlist = makeRequest({ status: "waitlist" });
  const closed = makeRequest({ active: false, status: "approved" });

  assert.deepEqual(getRequestWorkflow(review, makeOffering()).allowedActions, [
    "approve",
    "reject",
    "waitlist",
    "manual-close",
  ]);
  assert.deepEqual(getRequestWorkflow(lottery, makeOffering({ allocationPolicy: "lottery" })).allowedActions, []);
  assert.deepEqual(getRequestWorkflow(waitlist, makeOffering()).allowedActions, ["approve", "reject", "manual-close"]);
  assert.deepEqual(getRequestWorkflow(closed, makeOffering()).allowedActions, []);
  assert.equal(isResolutionActionAllowed(review, makeOffering(), "approve"), true);
  assert.equal(isResolutionActionAllowed(lottery, makeOffering({ allocationPolicy: "lottery" }), "approve"), false);
});

test("staff preview text describes student outcome, supply impact, and audit effect", () => {
  const detail = buildRequestPreviewDetail(makeRequest(), "approve", {
    summary: {
      statusBefore: "pendingReview",
      statusAfter: "approved",
      activeAfter: false,
      enrollmentCreated: true,
      seatsTakenDelta: 1,
      waitlistDelta: 0,
    },
  });

  assert.match(detail, /Pending review → Approved/);
  assert.match(detail, /Seats \+1; waitlist \+0/);
  assert.match(detail, /audit event is written/);
  assert.match(detail, /new enrolment will be created/i);
});

test("override suggestions are derived from the actual blocker text", () => {
  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Timetable clash detected.",
      reasons: ["MECH7013 overlaps with COMP7506 subclass B."],
      suggestedActions: ["Review conflict day/time."],
    }),
    ["timetableClash"],
  );

  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Cross-faculty quota would be exceeded.",
      reasons: ["The cross-faculty quota is full."],
      suggestedActions: [],
    }),
    ["crossFacultyQuota"],
  );

  assert.deepEqual(
    getSuggestedOverrideConstraintIds({
      ok: false,
      headline: "Co-requisite not satisfied.",
      reasons: ["TDLL6024 must be taken together."],
      suggestedActions: [],
    }),
    ["corequisite"],
  );
});

test("audit labels summarize state changes without exposing full internal payloads in the table", () => {
  const submitted = {
    action: "request-submitted",
    targetId: "MEBS6003-A-S2",
    after: {
      request: {
        id: "req-4000000001-1",
        offeringId: "MEBS6003-A-S2",
        studentId: "4000000001",
        status: "pendingReview",
        active: true,
      },
    },
  };
  const resolved = {
    action: "request-resolved",
    targetId: "req-4000000001-1",
    before: { request: { status: "pendingReview", active: true, offeringId: "MEBS6003-A-S2" } },
    after: { request: { status: "approved", active: false, offeringId: "MEBS6003-A-S2", resolution: "Approved." } },
  };

  assert.equal(formatRequestListId("req-3036605296-12"), "…5296-12");
  assert.equal(buildAuditEventSummary(submitted), "New request for MEBS6003-A-S2");
  assert.equal(buildAuditEventChange(submitted), "Request created in Pending review status · currently active");
  assert.equal(buildAuditEventSummary(resolved), "MEBS6003-A-S2 was processed by staff.");
  assert.equal(buildAuditEventChange(resolved), "Status: Pending review → Approved; Active: Yes → No");
});
