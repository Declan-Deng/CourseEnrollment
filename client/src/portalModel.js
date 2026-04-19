export const navItems = [
  { id: "add", label: "Course Center" },
  { id: "announcement", label: "Announcement" },
  { id: "results", label: "View Enrolment Results" },
  { id: "cancel", label: "Cancel Enrolment Request" },
];

export const topLinks = [
  {
    id: "regulations",
    label: "Regulations & Syllabuses",
    href: "https://engg.hku.hk/Teaching-Learning/MSc/Regulations-and-Syllabuses",
    external: true,
  },
  { id: "enrolment", label: "Online Enrolment", pageId: "online" },
  { id: "timetable", label: "Timetable", pageId: "timetable" },
  { id: "contact", label: "Contact Us", pageId: "contact" },
  { id: "password", label: "Change Password", pageId: "password" },
  { id: "logout", label: "Logout", pageId: "logout" },
];

const PAGE_LABELS = Object.fromEntries([
  ...navItems.map((item) => [item.id, item.label]),
  ...topLinks.filter((item) => item.pageId).map((item) => [item.pageId, item.label]),
]);

const ACTIVE_REQUEST_KINDS = new Set(["lotteryQueued", "pendingReview", "waitlist"]);
const REQUESTABLE_KINDS = new Set(["requestable", "lotteryAvailable", "reviewAvailable", "waitlistAvailable"]);
const RECORD_TONE_MAP = {
  approved: "success",
  lotteryQueued: "info",
  pendingReview: "info",
  waitlist: "warn",
  cancelled: "muted",
  dropped: "warn",
};
const LIST_TYPE_CLASS_MAP = {
  dscpa: "soft-tag soft-tag--listtype soft-tag--dscpa",
  dscpb: "soft-tag soft-tag--listtype soft-tag--dscpb",
  diss: "soft-tag soft-tag--listtype soft-tag--diss",
  elective: "soft-tag soft-tag--listtype soft-tag--elective",
  electxc: "soft-tag soft-tag--listtype soft-tag--electxc",
};
const SUBCLASS_CLASS_MAP = {
  a: "soft-tag soft-tag--subclass soft-tag--subclass-a",
  b: "soft-tag soft-tag--subclass soft-tag--subclass-b",
  c: "soft-tag soft-tag--subclass soft-tag--subclass-c",
};
const ROW_CLASS_BY_STATE = {
  approved: "portal-row--approved",
  lotteryQueued: "portal-row--lottery",
  pendingReview: "portal-row--review",
  waitlist: "portal-row--waitlist",
};
const COURSE_GROUPS = [
  { id: "enrolled", label: "Enrolled", description: "Already admitted to your plan", defaultExpanded: true },
  { id: "requestable", label: "Requestable", description: "Offerings you can act on now", defaultExpanded: true },
  { id: "active", label: "Active Requests", description: "Requests still being processed", defaultExpanded: true },
  { id: "blocked", label: "Blocked / Closed", description: "Unavailable under the current plan or window", defaultExpanded: false },
];
const POLICY_DISPLAY_MAP = {
  firstComeFirstServed: { label: "FCFS", note: "Open online", variant: "fcfs" },
  lottery: { label: "Lottery", note: "Open pool", variant: "lottery" },
  priorityReview: { label: "Review", note: "Faculty review", variant: "review" },
  locked: { label: "Closed", note: "Manual route", variant: "closed" },
};
const COURSE_CODE_PATTERN = /\b[A-Z]{4}\d{4}\b/g;
const DAY_ORDER = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
const RULE_SORT_ORDER = {
  success: 0,
  lottery: 1,
  review: 2,
  waitlist: 3,
  enrolled: 4,
  plan: 5,
  quota: 6,
  limit: 7,
  duplicate: 8,
  closed: 9,
  blocked: 10,
};
const DEFAULT_GROUP_VIEW_CONTROLS = Object.freeze({
  sortBy: "default",
  sortDirection: "asc",
  scheduleFilter: "all",
  facultyFilter: "all",
  typeFilter: "all",
  capacityFilter: "all",
  policyFilter: "all",
  ruleFilter: "all",
});
const CAPACITY_METRICS_CACHE = new WeakMap();
const POLICY_META_CACHE = new WeakMap();
const RULE_SUMMARY_CACHE = new WeakMap();
const SCHEDULE_LABEL_CACHE = new WeakMap();

export function createDefaultGroupViewControls() {
  return { ...DEFAULT_GROUP_VIEW_CONTROLS };
}

function extractMentionedCourseCode(text, currentCourseCode) {
  const matches = text.match(COURSE_CODE_PATTERN) ?? [];
  return matches.find((match) => match !== currentCourseCode) ?? matches[0] ?? null;
}

function getCapacityMetrics(course) {
  if (CAPACITY_METRICS_CACHE.has(course)) {
    return CAPACITY_METRICS_CACHE.get(course);
  }

  const primary = course.capacityView?.primary ?? "";
  const secondary = course.capacityView?.secondary ?? "";
  const seatsRemaining = Number(primary.match(/^(\d+)\sseat/)?.[1] ?? NaN);
  const waitlist = Number(secondary.match(/^(\d+)\swaiting/)?.[1] ?? NaN);
  const claimedMatch = secondary.match(/(\d+)\/(\d+)\sseats claimed/);
  const taken = Number(claimedMatch?.[1] ?? NaN);
  const capacity = Number(claimedMatch?.[2] ?? NaN);

  let demandRank = 0;
  if (primary.startsWith("High demand")) {
    demandRank = 3;
  } else if (primary.startsWith("Moderate demand")) {
    demandRank = 2;
  } else if (primary.startsWith("Open availability")) {
    demandRank = 1;
  }

  const metrics = {
    seatsRemaining: Number.isFinite(seatsRemaining) ? seatsRemaining : null,
    waitlist: Number.isFinite(waitlist) ? waitlist : 0,
    taken: Number.isFinite(taken) ? taken : null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    demandRank,
  };

  CAPACITY_METRICS_CACHE.set(course, metrics);
  return metrics;
}

function matchesScheduleFilter(course, scheduleFilter) {
  if (!scheduleFilter || scheduleFilter === "all") {
    return true;
  }

  if (scheduleFilter === "scheduled") {
    return (course.schedule ?? []).length > 0;
  }

  if (scheduleFilter === "unscheduled") {
    return (course.schedule ?? []).length === 0;
  }

  if (scheduleFilter.startsWith("day:")) {
    const day = scheduleFilter.slice(4);
    return (course.schedule ?? []).some((slot) => slot.day === day);
  }

  return true;
}

function matchesCapacityFilter(course, capacityFilter) {
  if (!capacityFilter || capacityFilter === "all") {
    return true;
  }

  const metrics = getCapacityMetrics(course);

  if (capacityFilter === "seats-open") {
    return metrics.seatsRemaining !== null ? metrics.seatsRemaining > 0 : metrics.demandRank <= 1;
  }

  if (capacityFilter === "limited") {
    return metrics.seatsRemaining !== null ? metrics.seatsRemaining > 0 && metrics.seatsRemaining <= 3 : metrics.demandRank >= 2;
  }

  if (capacityFilter === "high-demand") {
    return metrics.demandRank >= 2 || metrics.seatsRemaining === 0;
  }

  if (capacityFilter === "waiting") {
    return metrics.waitlist > 0;
  }

  return true;
}

function matchesRuleFilter(course, ruleFilter) {
  if (!ruleFilter || ruleFilter === "all") {
    return true;
  }

  const summary = getRuleSummary(course);
  const stateKind = course.currentState.kind;

  if (ruleFilter === "can-request") {
    return course.preview.ok && stateKind !== "approved" && !isActiveRequestKind(stateKind);
  }

  if (ruleFilter === "in-progress") {
    return isActiveRequestKind(stateKind);
  }

  if (ruleFilter === "enrolled") {
    return stateKind === "approved";
  }

  if (ruleFilter === "blocked-plan") {
    return summary.variant === "plan";
  }

  if (ruleFilter === "quota") {
    return summary.variant === "quota" || summary.variant === "limit";
  }

  if (ruleFilter === "duplicate") {
    return summary.variant === "duplicate";
  }

  if (ruleFilter === "closed") {
    return summary.variant === "closed";
  }

  if (ruleFilter === "cannot-request") {
    return summary.variant === "blocked";
  }

  return true;
}

export function matchesGroupViewFilters(course, controls) {
  const facultyFilter = controls?.facultyFilter ?? "all";
  const typeFilter = controls?.typeFilter ?? "all";
  const policyFilter = controls?.policyFilter ?? "all";

  const matchesFaculty = facultyFilter === "all" || course.faculty === facultyFilter;
  const matchesType =
    typeFilter === "all" ||
    course.listType === typeFilter ||
    (typeFilter === "crossFaculty" && course.crossFaculty);
  const matchesPolicy = policyFilter === "all" || getPolicyCompactMeta(course).label === policyFilter;

  return (
    matchesFaculty &&
    matchesType &&
    matchesPolicy &&
    matchesScheduleFilter(course, controls?.scheduleFilter) &&
    matchesCapacityFilter(course, controls?.capacityFilter) &&
    matchesRuleFilter(course, controls?.ruleFilter)
  );
}

function compareText(leftValue, rightValue) {
  return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, { sensitivity: "base" });
}

function compareValues(leftValue, rightValue) {
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  return compareText(leftValue, rightValue);
}

function compareTuples(leftValues, rightValues) {
  const length = Math.max(leftValues.length, rightValues.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = compareValues(leftValues[index], rightValues[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function getScheduleSortTuple(course) {
  let firstSlot = null;

  for (const slot of course.schedule ?? []) {
    if (!firstSlot) {
      firstSlot = slot;
      continue;
    }

    const slotMinutes = (DAY_ORDER[slot.day] ?? 99) * 1440 + toMinutes(slot.start);
    const currentMinutes = (DAY_ORDER[firstSlot.day] ?? 99) * 1440 + toMinutes(firstSlot.start);

    if (slotMinutes < currentMinutes) {
      firstSlot = slot;
    }
  }

  if (!firstSlot) {
    return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, course.code];
  }

  return [DAY_ORDER[firstSlot.day] ?? 99, toMinutes(firstSlot.start), course.code];
}

function getFacultySortTuple(course) {
  return [course.faculty, course.department, course.listType, course.subclass, course.code];
}

function getCapacitySortTuple(course) {
  const metrics = getCapacityMetrics(course);

  if (course.allocationPolicy === "firstComeFirstServed") {
    return [metrics.seatsRemaining ?? Number.POSITIVE_INFINITY, -(metrics.waitlist ?? 0), course.code];
  }

  return [4 - metrics.demandRank, -(metrics.waitlist ?? 0), -(metrics.taken ?? 0), course.code];
}

function getPolicySortTuple(course) {
  const meta = getPolicyCompactMeta(course);
  const sortOrder = {
    FCFS: 0,
    Lottery: 1,
    Review: 2,
    Closed: 3,
  };

  return [sortOrder[meta.label] ?? 99, meta.note, course.code];
}

function getRuleSortTuple(course) {
  const summary = getRuleSummary(course);
  return [RULE_SORT_ORDER[summary.variant] ?? 99, summary.conclusion, summary.reasonText ?? "", course.code];
}

function getSortTuple(course, sortBy, originalOrderById) {
  if (sortBy === "schedule") {
    return getScheduleSortTuple(course);
  }

  if (sortBy === "faculty") {
    return getFacultySortTuple(course);
  }

  if (sortBy === "capacity") {
    return getCapacitySortTuple(course);
  }

  if (sortBy === "policy") {
    return getPolicySortTuple(course);
  }

  if (sortBy === "rule") {
    return getRuleSortTuple(course);
  }

  return [originalOrderById.get(course.id) ?? Number.POSITIVE_INFINITY];
}

export function applyGroupViewControls(courses, controls, originalOrderById = new Map()) {
  const visibleCourses = courses.filter((course) => matchesGroupViewFilters(course, controls));
  const sortBy = controls?.sortBy ?? "default";
  const sortDirection = controls?.sortDirection ?? "asc";

  return visibleCourses
    .map((course) => ({
      course,
      sortTuple: getSortTuple(course, sortBy, originalOrderById),
      originalIndex: originalOrderById.get(course.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((leftEntry, rightEntry) => {
      const comparison = compareTuples(leftEntry.sortTuple, rightEntry.sortTuple);

      if (comparison === 0) {
        return compareValues(leftEntry.originalIndex, rightEntry.originalIndex);
      }

      return sortDirection === "desc" ? comparison * -1 : comparison;
    })
    .map((entry) => entry.course);
}

function getRelatedCourseCode(course) {
  const texts = [...(course.preview.reasons ?? []), ...(course.preview.suggestedActions ?? [])];

  for (const text of texts) {
    const code = extractMentionedCourseCode(text, course.code);
    if (code) {
      return code;
    }
  }

  return null;
}

export function formatSchedule(course) {
  if (SCHEDULE_LABEL_CACHE.has(course)) {
    return SCHEDULE_LABEL_CACHE.get(course);
  }

  const label = !course.schedule?.length
    ? "No fixed meeting slot"
    : course.schedule.map((slot) => `${slot.day} ${slot.start}-${slot.end}`).join(" · ");

  SCHEDULE_LABEL_CACHE.set(course, label);
  return label;
}

export function getPageLabel(pageId) {
  return PAGE_LABELS[pageId] ?? "";
}

function isActiveRequestKind(kind) {
  return ACTIVE_REQUEST_KINDS.has(kind);
}

export function getCourseGroups() {
  return COURSE_GROUPS;
}

export function createGroupedCourses(courses) {
  const groups = Object.fromEntries(COURSE_GROUPS.map((group) => [group.id, []]));

  courses.forEach((course) => {
    groups[getCourseGroup(course)].push(course);
  });

  return groups;
}

export function countCourseGroups(courses) {
  return courses.reduce(
    (counts, course) => {
      counts[getCourseGroup(course)] += 1;
      return counts;
    },
    {
      enrolled: 0,
      requestable: 0,
      active: 0,
      blocked: 0,
    },
  );
}

export function getCourseGroup(course) {
  const stateKind = course.currentState.kind;

  if (stateKind === "approved") {
    return "enrolled";
  }

  if (isActiveRequestKind(stateKind)) {
    return "active";
  }

  if (REQUESTABLE_KINDS.has(stateKind)) {
    return "requestable";
  }

  return "blocked";
}

export function getPrimaryAction(course) {
  if (course.currentState.kind === "approved") {
    return { key: "drop", label: course.dropOpen ? "Drop" : "Locked", disabled: !course.dropOpen };
  }

  if (isActiveRequestKind(course.currentState.kind)) {
    return { key: "cancel", label: "Cancel", disabled: false };
  }

  if (course.currentState.kind === "waitlistAvailable" || course.preview.outcome === "waitlist") {
    return { key: "request", label: "Waitlist", disabled: false };
  }

  if (!course.requestOpen) {
    return { key: "request", label: "Closed", disabled: true };
  }

  if (!course.preview.ok) {
    return { key: "request", label: "Blocked", disabled: true };
  }

  return { key: "request", label: "Request", disabled: false };
}

export function getRecordTone(status) {
  return RECORD_TONE_MAP[status] ?? "warn";
}

export function getListTypeClass(listType) {
  return LIST_TYPE_CLASS_MAP[(listType ?? "").toLowerCase()] ?? "soft-tag";
}

export function getSubclassClass(subclass) {
  return SUBCLASS_CLASS_MAP[(subclass ?? "").toLowerCase()] ?? "soft-tag soft-tag--subclass";
}

export function getCourseRowClass(course, isSelected) {
  const classes = ["portal-row"];
  const stateKind = course.currentState.kind;
  const rowStateClass = ROW_CLASS_BY_STATE[stateKind];

  if (rowStateClass) {
    classes.push(rowStateClass);
  }

  if (course.requestOpen && !course.preview.ok && stateKind !== "approved" && !isActiveRequestKind(stateKind)) {
    classes.push("portal-row--blocked");
  }

  if (isSelected) {
    classes.push("portal-row--selected");
  }

  return classes.join(" ");
}

export function getPolicyCompactMeta(course) {
  if (POLICY_META_CACHE.has(course)) {
    return POLICY_META_CACHE.get(course);
  }

  const meta = !course.requestOpen
    ? {
        label: "Closed",
        note: course.allocationPolicy === "locked" ? "Manual route" : "Closed now",
        title: `${course.policyLabel}. ${course.requestNote}`,
        variant: "closed",
      }
    : {
        ...(POLICY_DISPLAY_MAP[course.allocationPolicy] ?? {
          label: "Open",
          note: "Online route",
          variant: "fcfs",
        }),
        title: `${course.policyLabel}. ${course.requestNote}`,
      };

  POLICY_META_CACHE.set(course, meta);
  return meta;
}

export function getRuleSummary(course) {
  if (RULE_SUMMARY_CACHE.has(course)) {
    return RULE_SUMMARY_CACHE.get(course);
  }

  const stateKind = course.currentState.kind;
  const headline = course.preview.headline ?? "";
  const firstReason = course.preview.reasons?.[0] ?? "";
  const firstAction = course.preview.suggestedActions?.[0] ?? "";
  const linkedCourseCode = getRelatedCourseCode(course);
  let summary;

  if (stateKind === "approved") {
    summary = {
      variant: "enrolled",
      conclusion: "Already enrolled",
      reasonText: "",
      nextText: "",
      linkedCourseCode: null,
    };
  } else if (stateKind === "lotteryQueued") {
    summary = {
      variant: "lottery",
      conclusion: "Request in progress",
      reasonText: "This course is already in your lottery pipeline.",
      nextText: "Use Cancel if you want to withdraw this lottery request.",
      linkedCourseCode: null,
    };
  } else if (stateKind === "pendingReview") {
    summary = {
      variant: "review",
      conclusion: "Request in progress",
      reasonText: "This course is already in faculty review.",
      nextText: "Use Cancel if you want to withdraw this review request.",
      linkedCourseCode: null,
    };
  } else if (stateKind === "waitlist") {
    summary = {
      variant: "waitlist",
      conclusion: "Request in progress",
      reasonText: "This course is already in your waitlist pipeline.",
      nextText: "Use Cancel if you want to withdraw this waitlist request.",
      linkedCourseCode: null,
    };
  } else if (course.preview.ok) {
    if (course.preview.uiVariant === "lottery") {
      summary = {
        variant: "lottery",
        conclusion: "Join lottery",
        reasonText: "This offering uses lottery allocation.",
        nextText: "Submit request to join the lottery pool.",
        linkedCourseCode: null,
      };
    } else if (course.preview.uiVariant === "review") {
      summary = {
        variant: "review",
        conclusion: "Send for review",
        reasonText: "This offering uses faculty review instead of instant approval.",
        nextText: "Submit request to enter the review queue.",
        linkedCourseCode: null,
      };
    } else if (course.preview.uiVariant === "waitlist") {
      summary = {
        variant: "waitlist",
        conclusion: "Join waitlist",
        reasonText: "Seats are full, but the waitlist is still open.",
        nextText: "Submit request to join the waitlist.",
        linkedCourseCode: null,
      };
    } else {
      summary = {
        variant: "success",
        conclusion: "Request now",
        reasonText: "No timetable, prerequisite, co-requisite, quota, credit-limit, or duplicate issue was found.",
        nextText: "Submit request now.",
        linkedCourseCode: null,
      };
    }
  } else if (course.preview.uiVariant === "closed" || !course.requestOpen) {
    summary = {
      variant: "closed",
      conclusion: "Closed by system",
      reasonText: firstReason || "This offering is outside the active online request window.",
      nextText: firstAction || course.requestNote,
      linkedCourseCode: null,
    };
  } else if (headline.includes("Duplicate course code")) {
    summary = {
      variant: "duplicate",
      conclusion: "Duplicate course",
      reasonText: "This course code is already in your current plan.",
      nextText: firstAction || "Keep the current subclass or drop it before requesting another one.",
      linkedCourseCode: course.code,
    };
  } else if (headline.includes("quota would be exceeded")) {
    summary = {
      variant: "quota",
      conclusion: "Quota exceeded",
      reasonText: firstReason || "Your visible course-type quota is already full.",
      nextText: firstAction || "Free space in the same list type before requesting this course.",
      linkedCourseCode: null,
    };
  } else if (headline.includes("Credit limit would be exceeded")) {
    summary = {
      variant: "plan",
      conclusion: "Blocked by your plan",
      reasonText: "Adding this course would exceed your current credit limit.",
      nextText: "Drop another course before requesting this one.",
      linkedCourseCode: null,
    };
  } else if (headline.includes("Timetable clash detected")) {
    summary = {
      variant: "plan",
      conclusion: "Blocked by your plan",
      reasonText: linkedCourseCode ? `Timetable clash with ${linkedCourseCode}.` : firstReason,
      nextText: firstAction || "Replace the conflicting course or choose another offering.",
      linkedCourseCode,
    };
  } else if (headline.includes("Prerequisite not satisfied")) {
    summary = {
      variant: "plan",
      conclusion: "Blocked by your plan",
      reasonText: firstReason || "A required prerequisite has not been satisfied.",
      nextText: firstAction || "Choose another course or complete the prerequisite first.",
      linkedCourseCode: null,
    };
  } else if (headline.includes("Co-requisite not satisfied")) {
    summary = {
      variant: "plan",
      conclusion: "Blocked by your plan",
      reasonText: firstReason || "A required co-requisite is missing from your plan.",
      nextText: firstAction || "Add the required co-requisite before requesting this course.",
      linkedCourseCode,
    };
  } else {
    summary = {
      variant: "blocked",
      conclusion: "Cannot request",
      reasonText: firstReason || headline,
      nextText: firstAction || "Review the course details before trying again.",
      linkedCourseCode,
    };
  }

  RULE_SUMMARY_CACHE.set(course, summary);
  return summary;
}

export function applySnapshot(snapshot, nextSelectedCourseId, setters) {
  const fallbackCourse = snapshot.courses.find((course) => course.id === nextSelectedCourseId) ?? null;

  setters.setData(snapshot);
  setters.setSelectedCourseId(fallbackCourse?.id ?? null);
}

function buildCourseMeta(course, includeCapacity = true) {
  const baseMeta = [course.faculty, course.listType, course.policyLabel];

  if (includeCapacity) {
    return [...baseMeta, course.capacityView.primary, course.capacityView.secondary, formatSchedule(course)];
  }

  return [...baseMeta, formatSchedule(course)];
}

export function buildInfoDialog(result, course) {
  return {
    title: `${course.code} - ${course.title}`,
    headline: result.headline,
    meta: buildCourseMeta(course),
    windowNote: course.requestNote,
    reasons: result.reasons ?? [],
    suggestedAction: result.suggestedActions?.[0] ?? null,
  };
}

export function buildLockedDropDialog(course) {
  return {
    title: `${course.code} - ${course.title}`,
    headline: "Drop is not available online for this course.",
    meta: [course.faculty, course.listType, course.policyLabel, course.dropNote],
    windowNote: course.dropNote,
    reasons: [
      "This approved course is locked for manual handling by the programme office.",
      course.dropNote,
    ],
    suggestedAction: "Use the displayed support route instead of the online drop flow.",
  };
}

export function buildRecordDialog(record) {
  return {
    title: `${record.course.code} - ${record.course.title}`,
    headline: record.statusLabel,
    meta: buildCourseMeta(record.course, false),
    windowNote: record.nextStep,
    reasons: [record.message],
    suggestedAction: record.nextStep,
  };
}

export function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
