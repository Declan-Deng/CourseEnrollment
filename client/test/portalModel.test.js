import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGroupViewControls,
  countCourseGroups,
  createDefaultGroupViewControls,
  getCourseGroup,
  getPrimaryAction,
  getRuleSummary,
} from "../src/portalModel.js";

function makeCourse(overrides = {}) {
  return {
    id: "COMP7001-A-S2",
    code: "COMP7001",
    title: "Test course",
    faculty: "Faculty of Engineering",
    department: "Computer Science",
    listType: "Elective",
    credits: 6,
    semester: 2,
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    policyLabel: "FCFS",
    requestOpen: true,
    dropOpen: true,
    requestNote: "Open until 31 Jan 2026",
    currentState: { kind: "requestable", label: "Requestable" },
    preview: {
      ok: true,
      outcome: "approved",
      uiVariant: "success",
      headline: "Request can be approved immediately.",
      reasons: [],
      suggestedActions: [],
    },
    capacityView: {
      primary: "8 seats left",
      secondary: "1 waiting",
      capacityLabel: "28 / 36 claimed",
    },
    schedule: [{ day: "Mon", start: "09:30", end: "12:20", venue: "CPD 1.24" }],
    ...overrides,
  };
}

test("course groups and primary actions reflect visible student states", () => {
  const requestable = makeCourse();
  const active = makeCourse({ currentState: { kind: "pendingReview", label: "Pending review" } });
  const enrolled = makeCourse({ currentState: { kind: "approved", label: "Approved" } });
  const blocked = makeCourse({
    requestOpen: true,
    currentState: { kind: "blocked", label: "Blocked" },
    preview: {
      ok: false,
      headline: "Timetable clash detected.",
      reasons: ["COMP7506 overlaps with this course."],
      suggestedActions: ["Replace COMP7506 before requesting."],
    },
  });
  const closed = makeCourse({ requestOpen: false });

  assert.equal(getCourseGroup(requestable), "requestable");
  assert.equal(getCourseGroup(active), "active");
  assert.equal(getCourseGroup(enrolled), "enrolled");
  assert.equal(getCourseGroup(blocked), "blocked");

  assert.deepEqual(getPrimaryAction(requestable), { key: "request", label: "Request", disabled: false });
  assert.deepEqual(getPrimaryAction(active), { key: "cancel", label: "Withdraw", disabled: false });
  assert.deepEqual(getPrimaryAction(enrolled), { key: "drop", label: "Drop", disabled: false });
  assert.deepEqual(getPrimaryAction(blocked), { key: "request", label: "Blocked", disabled: true });
  assert.deepEqual(getPrimaryAction(closed), { key: "request", label: "Closed", disabled: true });
});

test("rule summary turns backend decisions into reason and next-step copy", () => {
  const clash = makeCourse({
    id: "MECH7013-A-S2",
    code: "MECH7013",
    currentState: { kind: "blocked", label: "Blocked" },
    preview: {
      ok: false,
      headline: "Timetable clash detected.",
      reasons: ["MECH7013 overlaps with COMP7506 subclass B."],
      suggestedActions: ["Replace COMP7506 or choose another offering."],
    },
  });
  const lottery = makeCourse({
    allocationPolicy: "lottery",
    preview: {
      ok: true,
      outcome: "lotteryQueued",
      uiVariant: "lottery",
      headline: "Request will enter the lottery pool.",
      reasons: [],
      suggestedActions: [],
    },
  });
  const review = makeCourse({
    allocationPolicy: "priorityReview",
    preview: {
      ok: true,
      outcome: "pendingReview",
      uiVariant: "review",
      headline: "Request will be reviewed under faculty policy.",
      reasons: [],
      suggestedActions: [],
    },
  });

  assert.deepEqual(getRuleSummary(clash), {
    variant: "plan",
    conclusion: "Blocked by your plan",
    reasonText: "Timetable clash with COMP7506.",
    nextText: "Replace COMP7506 or choose another offering.",
    linkedCourseCode: "COMP7506",
  });
  assert.equal(getRuleSummary(lottery).conclusion, "Lottery route");
  assert.equal(getRuleSummary(review).conclusion, "Faculty review route");
});

test("course controls filter and sort without changing button semantics", () => {
  const controls = createDefaultGroupViewControls();
  const courses = [
    makeCourse({ id: "B", code: "COMP7002", capacityView: { primary: "1 seat left", secondary: "0 waiting", capacityLabel: "29 / 30 claimed" } }),
    makeCourse({ id: "A", code: "COMP7001", capacityView: { primary: "9 seats left", secondary: "0 waiting", capacityLabel: "21 / 30 claimed" } }),
    makeCourse({
      id: "C",
      code: "COMP7003",
      currentState: { kind: "pendingReview", label: "Pending review" },
      preview: { ok: true, outcome: "pendingReview", uiVariant: "review", headline: "Faculty review", reasons: [], suggestedActions: [] },
    }),
  ];

  const sorted = applyGroupViewControls(courses, { ...controls, sortBy: "capacity", sortDirection: "asc" });
  const limited = applyGroupViewControls(courses, { ...controls, capacityFilter: "limited" });

  assert.deepEqual(sorted.map((course) => course.code), ["COMP7002", "COMP7003", "COMP7001"]);
  assert.deepEqual(limited.map((course) => course.id), ["B"]);
  assert.deepEqual(countCourseGroups(courses), { enrolled: 0, requestable: 2, active: 1, blocked: 0 });
});
