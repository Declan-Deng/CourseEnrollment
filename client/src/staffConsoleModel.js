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
  ["manuallyResolved", "Manually resolved"],
];

const STAFF_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export function buildOfferingForm(offering) {
  return {
    capacity: String(offering?.capacity ?? ""),
    seatsTaken: String(offering?.seatsTaken ?? ""),
    waitlistCount: String(offering?.waitlistCount ?? ""),
    allocationPolicy: offering?.allocationPolicy ?? "firstComeFirstServed",
    requestWindowOpen: Boolean(offering?.requestWindow?.isOpen),
    requestWindowClosesOn: offering?.requestWindow?.closesOn ?? "",
    dropWindowOpen: Boolean(offering?.dropWindow?.isOpen),
    dropWindowClosesOn: offering?.dropWindow?.closesOn ?? "",
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

  return `${windowValue.isOpen ? "Open" : "Closed"} · ${windowValue.closesOn ?? "No close date"}`;
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

export function formatPolicyLabel(policy) {
  switch (policy) {
    case "firstComeFirstServed":
      return "FCFS";
    case "priorityReview":
      return "Review";
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
  const seatLine = `Available seats ${summary.availableSeatsBefore} → ${summary.availableSeatsAfter} (${summary.seatsDelta >= 0 ? "+" : ""}${summary.seatsDelta}).`;
  const requestLine = `${summary.affectedActiveRequests} active request(s) currently depend on this offering.`;
  const windowLine = summary.requestWindowClosingNow
    ? "This update closes the request window immediately."
    : summary.dropWindowClosingNow
      ? "This update closes the drop window immediately."
      : "No window closes immediately.";

  return `${seatLine} ${requestLine} ${windowLine}`;
}

export function buildRequestPreviewDetail(request, action, previewImpact) {
  if (!request || !previewImpact?.summary) {
    return `Resolve ${request?.id ?? "this request"} as ${action}.`;
  }

  const summary = previewImpact.summary;
  return `Status ${formatRequestStatusLabel(summary.statusBefore)} → ${formatRequestStatusLabel(summary.statusAfter)}. Seats ${summary.seatsTakenDelta >= 0 ? "+" : ""}${summary.seatsTakenDelta}; waitlist ${summary.waitlistDelta >= 0 ? "+" : ""}${summary.waitlistDelta}. ${summary.enrollmentCreated ? "A new enrolment will be created." : "No new enrolment will be created."}`;
}

export function formatResolutionActionLabel(action) {
  switch (action) {
    case "approve":
      return "Approve";
    case "reject":
      return "Reject";
    case "waitlist":
      return "Move to waitlist";
    case "manual-close":
      return "Manual close";
    default:
      return action;
  }
}

export function buildBatchResolveDetail(action, preview) {
  const label = formatResolutionActionLabel(action);

  return [
    `${label} ${preview.eligibleCount} active request(s) from the current selection.`,
    `Selected: ${preview.selectedCount}. Skipped: ${preview.skippedCount}.`,
    `Queued in selection: ${preview.queuedCount}. Waitlist in selection: ${preview.waitlistCount}.`,
    action === "approve"
      ? "Any request that reaches a full offering will be left unchanged and reported after the batch completes."
      : action === "waitlist"
        ? "Eligible requests will remain active and move into waitlist under the current offering."
        : "Inactive requests remain untouched.",
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
