export const STAFF_TABS = [
  { id: "offerings", label: "Offerings" },
  { id: "requests", label: "Requests" },
  { id: "overrides", label: "Overrides" },
  { id: "audit", label: "Audit" },
];

export const OVERRIDE_OPTIONS = [
  { id: "prerequisite", label: "Prerequisite" },
  { id: "corequisite", label: "Corequisite" },
  { id: "listQuota", label: "List quota" },
  { id: "crossFacultyQuota", label: "Cross-faculty quota" },
  { id: "creditLimit", label: "Credit limit" },
  { id: "duplicate", label: "Duplicate" },
  { id: "timetableClash", label: "Timetable clash" },
];

export const REQUEST_STATUS_OPTIONS = [
  ["approved", "Approved"],
  ["lotteryQueued", "Lottery queued"],
  ["pendingReview", "Pending review"],
  ["waitlist", "Waitlist"],
  ["cancelled", "Cancelled"],
  ["dropped", "Dropped"],
  ["rejected", "Rejected"],
  ["manuallyResolved", "Closed without outcome"],
];

export const STAFF_LIST_TYPE_OPTIONS = [
  ["DscpA", "Discipline A (DscpA)"],
  ["DscpB", "Discipline B (DscpB)"],
  ["ElectXC", "Cross-disciplinary elective (ElectXC)"],
  ["Elective", "Elective"],
  ["Diss", "Dissertation (Diss)"],
];

export const STAFF_POLICY_OPTIONS = [
  ["firstComeFirstServed", "FCFS"],
  ["lottery", "Lottery"],
  ["priorityReview", "Faculty review"],
  ["locked", "Locked"],
];

export const RESOLUTION_ACTION_OPTIONS = [
  ["approve", "Approve"],
  ["reject", "Reject"],
  ["waitlist", "Move to waitlist"],
  ["manual-close", "Close without outcome"],
];

export const STAFF_DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STAFF_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const STAFF_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STAFF_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toIsoDate(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return "";
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function formatIsoDate(value) {
  const isoDate = toIsoDate(value);
  if (!isoDate) {
    return value ? String(value) : "No close date";
  }

  const parsed = new Date(`${isoDate}T00:00:00Z`);
  return STAFF_DATE_FORMATTER.format(parsed);
}

export function buildOfferingForm(offering) {
  return {
    capacity: String(offering?.capacity ?? ""),
    allocationPolicy: offering?.allocationPolicy ?? "firstComeFirstServed",
    requestWindowOpen: Boolean(offering?.requestWindow?.isOpen),
    requestWindowClosesOn: toIsoDate(offering?.requestWindow?.closesOn),
    dropWindowOpen: Boolean(offering?.dropWindow?.isOpen),
    dropWindowClosesOn: toIsoDate(offering?.dropWindow?.closesOn),
  };
}

export function buildDefaultCourseForm() {
  return {
    code: "",
    title: "",
    faculty: "Faculty of Engineering",
    department: "",
    listType: "Elective",
    credits: "6",
    crossFaculty: false,
    synopsis: "",
  };
}

export function buildDefaultOfferingCreateForm(courseCode = "") {
  return {
    courseCode,
    semester: "2",
    subclass: "A",
    allocationPolicy: "firstComeFirstServed",
    capacity: "30",
    requestWindowOpen: true,
    requestWindowClosesOn: "2026-01-31",
    dropWindowOpen: true,
    dropWindowClosesOn: "2026-01-31",
    scheduleDay: "Mon",
    scheduleStart: "09:30",
    scheduleEnd: "12:20",
    venue: "",
    prerequisites: "",
    corequisites: "",
  };
}

export function buildDefaultOverrideForm(offeringId = "") {
  return {
    studentId: "3036605296",
    offeringId,
    note: "Staff override created in the admin console.",
    constraintTypes: [],
  };
}

export function formatWindow(windowValue) {
  if (!windowValue) {
    return "Not configured";
  }

  return `${windowValue.isOpen ? "Open" : "Closed"} · ${formatIsoDate(windowValue.closesOn)}`;
}

export function formatStaffTimestamp(value) {
  if (!value) {
    return "Not synced yet";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not synced yet";
  }

  return `Updated ${STAFF_TIME_FORMATTER.format(parsed)}`;
}

export function formatStaffDateTime(value) {
  if (!value) {
    return "Time unavailable";
  }

  const parsed = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return STAFF_DATE_TIME_FORMATTER.format(parsed);
}

export function formatSeatOccupantTimestamp(value) {
  if (!value) {
    return "Time unavailable";
  }

  return `Confirmed ${formatStaffDateTime(value)}`;
}

export function formatSeatCount(count, suffix = "") {
  const numericCount = Number(count);
  const safeCount = Number.isFinite(numericCount) ? numericCount : 0;
  const noun = safeCount === 1 ? "seat" : "seats";
  return `${safeCount} ${noun}${suffix ? ` ${suffix}` : ""}`;
}

export function formatCompactId(value, maxLength = 22) {
  const text = String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  const headLength = Math.max(8, Math.floor((maxLength - 1) * 0.55));
  const tailLength = Math.max(5, maxLength - headLength - 1);
  return `${text.slice(0, headLength)}…${text.slice(-tailLength)}`;
}

export function compactJson(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function toFriendlyError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function toErrorHeadline(error, fallback = "Staff action failed.") {
  if (error && typeof error === "object" && "headline" in error && typeof error.headline === "string" && error.headline) {
    return error.headline;
  }

  return fallback;
}

export function includesText(value, needle) {
  return String(value ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

export function matchesOfferingWindow(offering, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "request-open") {
    return Boolean(offering.requestWindow?.isOpen);
  }

  if (filter === "request-closed") {
    return !offering.requestWindow?.isOpen;
  }

  if (filter === "drop-open") {
    return Boolean(offering.dropWindow?.isOpen);
  }

  if (filter === "drop-closed") {
    return !offering.dropWindow?.isOpen;
  }

  if (filter === "fully-closed") {
    return !offering.requestWindow?.isOpen && !offering.dropWindow?.isOpen;
  }

  return true;
}

export function parseNonNegativeInteger(value) {
  if (value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeCourseCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeSubclass(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function formatPolicyLabel(policy) {
  switch (policy) {
    case "firstComeFirstServed":
      return "FCFS";
    case "priorityReview":
      return "Faculty review";
    case "lottery":
      return "Lottery";
    case "locked":
      return "Locked";
    default:
      return policy;
  }
}

export function formatRequestStatusLabel(status) {
  return REQUEST_STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status;
}

export function formatDecisionTone(decision) {
  if (!decision) {
    return "neutral";
  }

  if (decision.ok) {
    return decision.outcome === "approved" ? "success" : decision.outcome === "waitlist" ? "warn" : "info";
  }

  return decision.uiVariant === "closed" ? "warn" : "error";
}

export function buildOfferingPreviewDetail(offering, impact) {
  if (!offering || !impact?.summary) {
    return "Review the impact preview before saving this offering update.";
  }

  const summary = impact.summary;
  const seatLine =
    summary.availableSeatsBefore === summary.availableSeatsAfter
      ? `${formatSeatCount(summary.availableSeatsAfter, "available")}; no availability change.`
      : `Available seats ${summary.availableSeatsBefore} → ${summary.availableSeatsAfter} (${summary.seatsDelta >= 0 ? "+" : ""}${summary.seatsDelta}).`;
  const requestLine = `${summary.affectedActiveRequests} active request(s) currently depend on this offering.`;
  const windowLine = summary.requestWindowClosingNow
    ? "This update closes the request window immediately."
    : summary.dropWindowClosingNow
      ? "This update closes the drop window immediately."
      : "No request or drop window closes immediately.";

  return `${seatLine} ${requestLine} ${windowLine}`;
}

export function buildRequestPreviewDetail(request, action, previewImpact) {
  if (!request || !previewImpact?.summary) {
    return `Preview ${request?.id ?? "this request"} with ${formatResolutionActionLabel(action)}.`;
  }

  const summary = previewImpact.summary;
  return `Status ${formatRequestStatusLabel(summary.statusBefore)} → ${formatRequestStatusLabel(summary.statusAfter)}. Seats ${summary.seatsTakenDelta >= 0 ? "+" : ""}${summary.seatsTakenDelta}; waitlist ${summary.waitlistDelta >= 0 ? "+" : ""}${summary.waitlistDelta}. ${summary.enrollmentCreated ? "A new enrolment will be created." : "No new enrolment will be created."}`;
}

export function formatResolutionActionLabel(action) {
  return RESOLUTION_ACTION_OPTIONS.find(([value]) => value === action)?.[1] ?? action;
}

export function getRequestWorkflow(request, offering) {
  if (!request) {
    return {
      mode: "none",
      label: "No request selected",
      description: "Select a request to see the available staff workflow.",
      allowedActions: [],
      warning: "",
    };
  }

  if (!request.active) {
    return {
      mode: "closed",
      label: "Closed record",
      description: "This request is already closed. It is kept for tracking only.",
      allowedActions: [],
      warning: "Closed requests cannot be resolved again.",
    };
  }

  const policy = offering?.allocationPolicy;

  if (policy === "lottery" || request.status === "lotteryQueued") {
    return {
      mode: "lottery",
      label: "Lottery pool",
      description:
        "This request is waiting in a lottery pool. Do not approve, reject, or waitlist it manually from the ordinary review queue.",
      allowedActions: ["manual-close"],
      warning: "Close the request window from Offerings, run allocation, then publish results through the lottery workflow.",
    };
  }

  if (request.status === "waitlist") {
    return {
      mode: "waitlist",
      label: "Waitlist handling",
      description: "This request is already on the waiting list. Use staff actions only when processing seat availability.",
      allowedActions: ["approve", "reject", "manual-close"],
      warning: "",
    };
  }

  if (policy === "priorityReview" || request.status === "pendingReview") {
    return {
      mode: "review",
      label: "Faculty review",
      description: "This request is in the staff review queue and can be approved, rejected, waitlisted, or closed.",
      allowedActions: ["approve", "reject", "waitlist", "manual-close"],
      warning: "",
    };
  }

  if (policy === "firstComeFirstServed") {
    return {
      mode: "fcfs",
      label: "FCFS exception",
      description: "FCFS requests are normally handled automatically. Use staff actions only for exceptional cleanup.",
      allowedActions: ["manual-close"],
      warning: "Routine FCFS approval should not be processed from the staff review queue.",
    };
  }

  return {
    mode: "manual",
    label: "Manual handling",
    description: "This request can be closed by staff if the office needs to resolve an exception.",
    allowedActions: ["manual-close"],
    warning: "",
  };
}

export function isResolutionActionAllowed(request, offering, action) {
  return getRequestWorkflow(request, offering).allowedActions.includes(action);
}

export function formatEnrollmentSource(source) {
  switch (source) {
    case "student-request":
      return "Student request";
    case "staff-resolution":
      return "Staff approval";
    case "seed":
      return "Seeded enrolment";
    case "faculty-record":
      return "Faculty record";
    default:
      return source ?? "Unknown";
  }
}

export function buildBatchResolveDetail(action, preview) {
  const label = formatResolutionActionLabel(action);

  return [
    `${label} ${preview.eligibleCount} policy-eligible request(s) from the current selection.`,
    `Selected: ${preview.selectedCount}. Skipped: ${preview.skippedCount}.`,
    `Lottery pool: ${preview.lotteryCount}. Faculty review: ${preview.reviewCount}. Waitlist: ${preview.waitlistCount}.`,
    action === "approve"
      ? "Lottery and routine FCFS records are skipped. Full offerings are reported after the batch completes."
      : action === "waitlist"
        ? "Only policy-eligible review requests will remain active and move into waitlist."
        : action === "manual-close"
          ? "Close without outcome is available for active exception records, including lottery records that must be closed individually."
          : "Inactive or policy-ineligible requests remain untouched.",
  ].join(" ");
}

export function hasOverrideImpactChange(overrideImpact) {
  if (!overrideImpact?.currentDecision || !overrideImpact?.overrideDecision) {
    return false;
  }

  const current = overrideImpact.currentDecision;
  const next = overrideImpact.overrideDecision;

  return (
    current.ok !== next.ok ||
    current.outcome !== next.outcome ||
    current.headline !== next.headline ||
    JSON.stringify(current.reasons ?? []) !== JSON.stringify(next.reasons ?? []) ||
    JSON.stringify(current.suggestedActions ?? []) !== JSON.stringify(next.suggestedActions ?? [])
  );
}

export function buildOverrideImpactNote(overrideImpact) {
  if (!overrideImpact?.currentDecision || !overrideImpact?.overrideDecision) {
    return "Select a student, offering, and at least one constraint type to preview the override impact.";
  }

  if (hasOverrideImpactChange(overrideImpact)) {
    return overrideImpact.activeOverrides?.length
      ? `${overrideImpact.activeOverrides.length} active override(s) already exist for this student and offering.`
      : "This override changes the current decision for the selected student and offering.";
  }

  return "The selected override does not change the current decision. Choose the actual blocking constraint shown above before creating it.";
}

function formatAuditActorType(type) {
  switch (type) {
    case "student":
      return "Student";
    case "staff":
      return "Staff";
    case "system":
      return "System";
    default:
      return type ?? "Unknown";
  }
}

function readAuditRequest(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.request && typeof payload.request === "object") {
    return payload.request;
  }

  if ("offeringId" in payload && "status" in payload) {
    return payload;
  }

  return null;
}

function readAuditOverride(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("constraintTypes" in payload && "offeringId" in payload) {
    return payload;
  }

  return null;
}

function looksLikeOfferingPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return ["capacity", "seatsTaken", "waitlistCount", "requestWindow", "dropWindow", "allocationPolicy"].some((key) => key in payload);
}

function formatConstraintTypeList(constraintTypes = []) {
  const labels = constraintTypes
    .map((constraintType) => OVERRIDE_OPTIONS.find((item) => item.id === constraintType)?.label ?? constraintType)
    .filter(Boolean);

  return labels.length ? labels.join(", ") : "No constraint types";
}

function formatAuditValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    if ("isOpen" in value || "closesOn" in value) {
      return formatWindow(value);
    }

    return compactJson(value);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.test(value)) {
    return formatStaffDateTime(value);
  }

  return String(value);
}

function buildRequestRows(request) {
  if (!request) {
    return [];
  }

  return [
    ["Request ID", request.id],
    ["Offering", request.offeringId],
    ["Student", request.studentId],
    ["Status", formatRequestStatusLabel(request.status)],
    ["Active", request.active],
    ["Submitted", request.submittedAt],
    ["Message", request.message],
    ["Resolution", request.resolution],
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: formatAuditValue(value) }));
}

function buildOverrideRows(override) {
  if (!override) {
    return [];
  }

  return [
    ["Override ID", override.id],
    ["Offering", override.offeringId],
    ["Student", override.studentId],
    ["Constraint types", formatConstraintTypeList(override.constraintTypes)],
    ["Created by", override.createdBy],
    ["Created at", override.createdAt],
    ["Active", override.active],
    ["Note", override.note],
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: formatAuditValue(value) }));
}

function buildOfferingRows(offering) {
  if (!looksLikeOfferingPayload(offering)) {
    return [];
  }

  return [
    ["Capacity", offering.capacity],
    ["Seats taken", offering.seatsTaken],
    ["Waitlist", offering.waitlistCount],
    ["Policy", offering.allocationPolicy ? formatPolicyLabel(offering.allocationPolicy) : null],
    ["Request window", offering.requestWindow],
    ["Drop window", offering.dropWindow],
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: formatAuditValue(value) }));
}

function buildGenericRows(payload) {
  if (payload === null || payload === undefined) {
    return [];
  }

  if (typeof payload !== "object") {
    return [{ label: "Value", value: formatAuditValue(payload) }];
  }

  return Object.entries(payload).map(([label, value]) => ({
    label,
    value: formatAuditValue(value),
  }));
}

function diffOffering(before, after) {
  const parts = [];

  if (before?.capacity !== after?.capacity) {
    parts.push(`Capacity ${before?.capacity ?? "—"} → ${after?.capacity ?? "—"}`);
  }

  if (before?.seatsTaken !== after?.seatsTaken) {
    parts.push(`Seats ${before?.seatsTaken ?? "—"} → ${after?.seatsTaken ?? "—"}`);
  }

  if (before?.waitlistCount !== after?.waitlistCount) {
    parts.push(`Waitlist ${before?.waitlistCount ?? "—"} → ${after?.waitlistCount ?? "—"}`);
  }

  if (before?.allocationPolicy !== after?.allocationPolicy) {
    parts.push(`Policy ${formatPolicyLabel(before?.allocationPolicy)} → ${formatPolicyLabel(after?.allocationPolicy)}`);
  }

  if (JSON.stringify(before?.requestWindow ?? null) !== JSON.stringify(after?.requestWindow ?? null)) {
    parts.push(`Request ${formatWindow(before?.requestWindow)} → ${formatWindow(after?.requestWindow)}`);
  }

  if (JSON.stringify(before?.dropWindow ?? null) !== JSON.stringify(after?.dropWindow ?? null)) {
    parts.push(`Drop ${formatWindow(before?.dropWindow)} → ${formatWindow(after?.dropWindow)}`);
  }

  return parts;
}

export function formatAuditActionLabel(action) {
  switch (action) {
    case "course-created":
      return "Course created";
    case "offering-created":
      return "Offering created";
    case "request-submitted":
      return "Request submitted";
    case "request-resolved":
      return "Request resolved";
    case "offering-updated":
      return "Offering updated";
    case "override-created":
      return "Override created";
    case "override-deactivated":
      return "Override removed";
    default:
      return action ?? "Unknown action";
  }
}

export function formatAuditActorLabel(event) {
  return `${formatAuditActorType(event?.actorType)} · ${event?.actorId ?? "Unknown"}`;
}

export function formatAuditTargetLabel(event) {
  const beforeRequest = readAuditRequest(event?.before);
  const afterRequest = readAuditRequest(event?.after);
  const afterOverride = readAuditOverride(event?.after);
  const beforeOverride = readAuditOverride(event?.before);

  if (event?.targetType === "request") {
    return afterRequest?.offeringId ?? beforeRequest?.offeringId ?? event?.targetId ?? "Unknown request";
  }

  if (event?.targetType === "constraintOverride") {
    return afterOverride?.offeringId ?? beforeOverride?.offeringId ?? event?.targetId ?? "Unknown override";
  }

  return event?.targetId ?? "Unknown target";
}

export function buildAuditEventSummary(event) {
  const beforeRequest = readAuditRequest(event?.before);
  const afterRequest = readAuditRequest(event?.after);
  const beforeOverride = readAuditOverride(event?.before);
  const afterOverride = readAuditOverride(event?.after);

  switch (event?.action) {
    case "course-created":
      return `New course ${event?.targetId ?? "selected course"} was added to the catalog.`;
    case "offering-created":
      return `New offering ${event?.targetId ?? "selected offering"} was added to the shared schedule.`;
    case "request-submitted":
      return `New request for ${afterRequest?.offeringId ?? event?.targetId ?? "selected offering"}`;
    case "request-resolved":
      return `${afterRequest?.offeringId ?? beforeRequest?.offeringId ?? event?.targetId ?? "Selected request"} ${afterRequest?.resolution ? "was processed by staff." : "was updated."}`;
    case "offering-updated":
      return `Shared offering ${event?.targetId ?? "selected offering"} was updated.`;
    case "override-created":
      return `Override created for ${afterOverride?.offeringId ?? event?.targetId ?? "selected offering"}.`;
    case "override-deactivated":
      return `Override removed for ${afterOverride?.offeringId ?? beforeOverride?.offeringId ?? event?.targetId ?? "selected offering"}.`;
    default:
      return `${formatAuditActionLabel(event?.action)} on ${formatAuditTargetLabel(event)}.`;
  }
}

export function buildAuditEventChange(event) {
  const beforeRequest = readAuditRequest(event?.before);
  const afterRequest = readAuditRequest(event?.after);
  const beforeOverride = readAuditOverride(event?.before);
  const afterOverride = readAuditOverride(event?.after);

  switch (event?.action) {
    case "course-created":
      return "Course is now available for offering setup.";
    case "offering-created":
      return "Offering is now available to staff and students.";
    case "request-submitted":
      return `Created as ${formatRequestStatusLabel(afterRequest?.status)}; active = ${afterRequest?.active ? "Yes" : "No"}`;
    case "request-resolved":
      return [
        `Status: ${formatRequestStatusLabel(beforeRequest?.status)} → ${formatRequestStatusLabel(afterRequest?.status)}`,
        beforeRequest?.active !== afterRequest?.active
          ? `Active: ${beforeRequest?.active ? "Yes" : "No"} → ${afterRequest?.active ? "Yes" : "No"}`
          : `Active: ${afterRequest?.active ? "Yes" : "No"}`,
      ].join("; ");
    case "offering-updated": {
      const diff = diffOffering(event?.before, event?.after);
      return diff.length ? diff.join(" · ") : "Offering settings updated";
    }
    case "override-created":
      return formatConstraintTypeList(afterOverride?.constraintTypes);
    case "override-deactivated":
      return `${formatConstraintTypeList(afterOverride?.constraintTypes)} · ${beforeOverride?.active ? "Active" : "Inactive"} → ${afterOverride?.active ? "Active" : "Inactive"}`;
    default:
      return "Inspect the detail panel for the full change.";
  }
}

export function buildAuditPayloadRows(payload) {
  const request = readAuditRequest(payload);
  if (request) {
    return buildRequestRows(request);
  }

  const override = readAuditOverride(payload);
  if (override) {
    return buildOverrideRows(override);
  }

  const offeringRows = buildOfferingRows(payload);
  if (offeringRows.length) {
    return offeringRows;
  }

  return buildGenericRows(payload);
}
