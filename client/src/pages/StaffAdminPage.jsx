import { useEffect, useMemo, useState } from "react";
import {
  createAdminCourse,
  createAdminOffering,
  createAdminOverride,
  fetchAdminCourses,
  DEFAULT_STAFF_ACTOR_ID,
  deleteAdminOverride,
  fetchAdminAudit,
  fetchAdminOfferings,
  fetchAdminOverrides,
  fetchAdminRequests,
  previewAdminOfferingImpact,
  previewAdminRequestResolution,
  previewAdminOverrideImpact,
  previewDecision,
  resetDemo,
  resolveAdminRequest,
  updateAdminOffering,
} from "../api";
import { Banner, ConfirmDialog, ToastNotice } from "../components/PortalFeedback";
import {
  buildBatchResolveDetail,
  buildDefaultCourseForm,
  buildDefaultOverrideForm,
  buildDefaultOfferingCreateForm,
  buildAuditEventChange,
  buildAuditEventSummary,
  buildAuditPayloadRows,
  buildOfferingForm,
  createEmptyScheduleSlot,
  buildOfferingPreviewDetail,
  buildOverrideImpactNote,
  buildRequestPreviewDetail,
  formatCompactId,
  formatDecisionTone,
  formatProgrammeShortName,
  formatAuditActionLabel,
  formatAuditActorLabel,
  formatAuditTargetLabel,
  formatPolicyLabel,
  formatRequestListId,
  formatRequestStatusLabel,
  formatResolutionActionLabel,
  formatSeatCount,
  formatStaffDateTime,
  formatSeatOccupantTimestamp,
  formatStaffTimestamp,
  formatWindow,
  getSuggestedOverrideConstraintIds,
  getRequestWorkflow,
  hasOverrideImpactChange,
  includesText,
  isResolutionActionAllowed,
  matchesOfferingWindow,
  normalizeCodeList,
  OVERRIDE_OPTIONS,
  parseNonNegativeInteger,
  RESOLUTION_ACTION_OPTIONS,
  STAFF_DAY_OPTIONS,
  STAFF_FACULTY_OPTIONS,
  STAFF_LIST_TYPE_OPTIONS,
  STAFF_POLICY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  STAFF_TABS,
  normalizeCourseCode,
  normalizeSubclass,
  toErrorHeadline,
  toFriendlyError,
} from "../staffConsoleModel";

const STAFF_MONTH_OPTIONS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "May"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Aug"],
  ["09", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];

const STAFF_DATE_YEARS = ["2025", "2026", "2027"];

const RESOLUTION_PAST_TENSE = {
  approve: "approved",
  waitlist: "waitlisted",
  reject: "rejected",
  "manual-close": "closed without outcome",
};

const AUDIT_SORT_OPTIONS = [
  ["timestamp", "Timestamp"],
  ["actor", "Actor"],
  ["action", "Action"],
  ["target", "Target"],
  ["summary", "Summary"],
];

function formatRequestCount(count) {
  return count === 1 ? "1 request" : `${count} requests`;
}

function formatResolutionPastTense(action) {
  return RESOLUTION_PAST_TENSE[action] ?? formatResolutionActionLabel(action).toLowerCase();
}

function getAuditTimestampValue(event) {
  const parsed = Date.parse(String(event.timestamp ?? "").replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getAuditSearchText(event) {
  return [
    event.id,
    event.actorType,
    event.actorId,
    event.action,
    formatAuditActionLabel(event.action),
    event.targetType,
    event.targetId,
    event.subjectStudentId,
    formatAuditActorLabel(event),
    formatAuditTargetLabel(event),
    buildAuditEventSummary(event),
    buildAuditEventChange(event),
  ]
    .filter(Boolean)
    .join(" ");
}

function getAuditSortValue(event, sortKey) {
  if (sortKey === "timestamp") {
    return getAuditTimestampValue(event);
  }

  if (sortKey === "actor") {
    return formatAuditActorLabel(event);
  }

  if (sortKey === "action") {
    return formatAuditActionLabel(event.action);
  }

  if (sortKey === "target") {
    return formatAuditTargetLabel(event);
  }

  return buildAuditEventSummary(event);
}

function compareAuditEvents(left, right, sortKey, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const leftValue = getAuditSortValue(left, sortKey);
  const rightValue = getAuditSortValue(right, sortKey);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * direction;
  }

  const result = String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (result !== 0) {
    return result * direction;
  }

  return (getAuditTimestampValue(left) - getAuditTimestampValue(right)) * -1;
}

function isAuditColumnControlActive(columnId, controls) {
  if (controls.auditSortKey === columnId) {
    return true;
  }

  if (columnId === "actor") {
    return controls.auditActorFilter !== "all" || Boolean(controls.auditActorIdFilter.trim());
  }

  if (columnId === "action") {
    return Boolean(controls.auditActionFilter);
  }

  if (columnId === "target") {
    return controls.auditTargetTypeFilter !== "all" || Boolean(controls.auditTargetFilter.trim());
  }

  if (columnId === "summary") {
    return Boolean(controls.auditSearchFilter.trim());
  }

  return false;
}

function AuditColumnHeaderControl({
  label,
  columnId,
  controls,
  menuOpen,
  onToggleMenu,
  onClose,
  onReset,
  onChange,
  menuAlign = "right",
  actionOptions,
  targetTypeOptions,
}) {
  const active = isAuditColumnControlActive(columnId, controls);
  const sorted = controls.auditSortKey === columnId;

  function renderColumnFields() {
    if (columnId === "actor") {
      return (
        <>
          <label className="column-menu__field">
            <span>Actor type</span>
            <select value={controls.auditActorFilter} onChange={(event) => onChange("auditActorFilter", event.target.value)}>
              <option value="all">All</option>
              <option value="student">Student</option>
              <option value="staff">Staff</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="column-menu__field">
            <span>Actor ID</span>
            <input value={controls.auditActorIdFilter} onChange={(event) => onChange("auditActorIdFilter", event.target.value)} />
          </label>
        </>
      );
    }

    if (columnId === "action") {
      return (
        <label className="column-menu__field">
          <span>Action</span>
          <select value={controls.auditActionFilter} onChange={(event) => onChange("auditActionFilter", event.target.value)}>
            <option value="">All</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {formatAuditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (columnId === "target") {
      return (
        <>
          <label className="column-menu__field">
            <span>Target type</span>
            <select value={controls.auditTargetTypeFilter} onChange={(event) => onChange("auditTargetTypeFilter", event.target.value)}>
              <option value="all">All</option>
              {targetTypeOptions.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {targetType === "constraintOverride" ? "Override" : targetType === "request" ? "Request" : targetType === "offering" ? "Offering" : targetType}
                </option>
              ))}
            </select>
          </label>
          <label className="column-menu__field">
            <span>Target / student</span>
            <input value={controls.auditTargetFilter} onChange={(event) => onChange("auditTargetFilter", event.target.value)} />
          </label>
        </>
      );
    }

    if (columnId === "summary") {
      return (
        <label className="column-menu__field">
          <span>Search summary</span>
          <input value={controls.auditSearchFilter} onChange={(event) => onChange("auditSearchFilter", event.target.value)} />
        </label>
      );
    }

    return null;
  }

  return (
    <div className="column-control">
      <div className="column-control__label-row">
        <span>{label}</span>
        <button
          type="button"
          className={active ? "column-control__button column-control__button--active" : "column-control__button"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          aria-expanded={menuOpen}
          aria-label={`${label} sort and filter`}
        >
          ▾
        </button>
      </div>
      {menuOpen ? (
        <div
          className={menuAlign === "left" ? "column-menu column-menu--align-left" : "column-menu"}
          onClick={(event) => event.stopPropagation()}
        >
          <label className="column-menu__field">
            <span>Sort</span>
            <select
              value={sorted ? controls.auditSortDirection : "none"}
              onChange={(event) => {
                if (event.target.value === "none") {
                  onChange("auditSortKey", "timestamp");
                  onChange("auditSortDirection", "desc");
                  return;
                }

                onChange("auditSortKey", columnId);
                onChange("auditSortDirection", event.target.value);
              }}
            >
              <option value="none">No sort</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          {renderColumnFields()}
          <div className="column-menu__actions">
            <button type="button" className="mini-button" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="mini-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readIsoDateParts(value) {
  const [year = "2026", month = "01", day = "31"] = String(value || "2026-01-31").split("-");
  return {
    year,
    month: month.padStart(2, "0"),
    day: day.padStart(2, "0"),
  };
}

function buildIsoDate(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function StaffDateField({ value, onChange, label }) {
  const parts = readIsoDateParts(value);

  function updatePart(key, nextValue) {
    onChange(buildIsoDate({ ...parts, [key]: nextValue }));
  }

  return (
    <div className="staff-date-field" aria-label={label}>
      <select value={parts.day} onChange={(event) => updatePart("day", event.target.value)} aria-label={`${label} day`}>
        {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => (
          <option key={day} value={day}>
            {Number.parseInt(day, 10)}
          </option>
        ))}
      </select>
      <select value={parts.month} onChange={(event) => updatePart("month", event.target.value)} aria-label={`${label} month`}>
        {STAFF_MONTH_OPTIONS.map(([monthValue, monthLabel]) => (
          <option key={monthValue} value={monthValue}>
            {monthLabel}
          </option>
        ))}
      </select>
      <select value={parts.year} onChange={(event) => updatePart("year", event.target.value)} aria-label={`${label} year`}>
        {STAFF_DATE_YEARS.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StaffAdminPage({ session, onStaffLogout, onReturnToPortal }) {
  const [activeTab, setActiveTab] = useState("offerings");
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [offeringSetupMode, setOfferingSetupMode] = useState("course");
  const [actorId, setActorId] = useState(session?.id ?? DEFAULT_STAFF_ACTOR_ID);
  const [courses, setCourses] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [courseForm, setCourseForm] = useState(buildDefaultCourseForm());
  const [offeringForm, setOfferingForm] = useState(null);
  const [offeringCreateForm, setOfferingCreateForm] = useState(buildDefaultOfferingCreateForm());
  const [overrideForm, setOverrideForm] = useState(buildDefaultOverrideForm());
  const [requestResolutionNote, setRequestResolutionNote] = useState("");
  const [offeringSearch, setOfferingSearch] = useState("");
  const [offeringPolicyFilter, setOfferingPolicyFilter] = useState("all");
  const [offeringWindowFilter, setOfferingWindowFilter] = useState("all");
  const [offeringAvailabilityFilter, setOfferingAvailabilityFilter] = useState("all");
  const [offeringSortKey, setOfferingSortKey] = useState("courseCode");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const [overrideSearch, setOverrideSearch] = useState("");
  const [overrideActiveFilter, setOverrideActiveFilter] = useState("active");
  const [selectedOverrideId, setSelectedOverrideId] = useState("");
  const [overrideCurrentDecision, setOverrideCurrentDecision] = useState(null);
  const [overrideCurrentDecisionBusy, setOverrideCurrentDecisionBusy] = useState(false);
  const [overrideOfferingCandidates, setOverrideOfferingCandidates] = useState([]);
  const [overrideOfferingCandidatesBusy, setOverrideOfferingCandidatesBusy] = useState(false);
  const [overrideImpact, setOverrideImpact] = useState(null);
  const [overridePreviewBusy, setOverridePreviewBusy] = useState(false);
  const [offeringImpact, setOfferingImpact] = useState(null);
  const [offeringImpactDetail, setOfferingImpactDetail] = useState("");
  const [offeringSeatSearch, setOfferingSeatSearch] = useState("");
  const [offeringSeatSortKey, setOfferingSeatSortKey] = useState("timeDesc");
  const [offeringPreviewBusy, setOfferingPreviewBusy] = useState(false);
  const [requestPreviewAction, setRequestPreviewAction] = useState("approve");
  const [requestPreviewImpact, setRequestPreviewImpact] = useState(null);
  const [requestPreviewBusy, setRequestPreviewBusy] = useState(false);
  const [auditSearchFilter, setAuditSearchFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("all");
  const [auditActorIdFilter, setAuditActorIdFilter] = useState("");
  const [auditTargetFilter, setAuditTargetFilter] = useState("");
  const [auditSortKey, setAuditSortKey] = useState("timestamp");
  const [auditSortDirection, setAuditSortDirection] = useState("desc");
  const [openAuditColumnMenu, setOpenAuditColumnMenu] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    if (session?.id && session.id !== actorId) {
      setActorId(session.id);
    }
  }, [actorId, session?.id]);

  async function loadAll(nextActorId = actorId, preferredSelections = {}) {
    const [nextCourses, nextOfferings, nextRequests, nextOverrides, nextAuditEvents] = await Promise.all([
      fetchAdminCourses(nextActorId),
      fetchAdminOfferings(nextActorId),
      fetchAdminRequests({}, nextActorId),
      fetchAdminOverrides({}, nextActorId),
      fetchAdminAudit({}, nextActorId),
    ]);

    setCourses(nextCourses);
    setOfferings(nextOfferings);
    setRequests(nextRequests);
    setOverrides(nextOverrides);
    setAuditEvents(nextAuditEvents);
    setLastLoadedAt(new Date().toISOString());

    const resolvedOffering =
      nextOfferings.find((item) => item.id === (preferredSelections.offeringId ?? selectedOfferingId)) ??
      nextOfferings[0] ??
      null;

    if (resolvedOffering) {
      setSelectedOfferingId(resolvedOffering.id);
      setOfferingForm(buildOfferingForm(resolvedOffering));
    } else {
      setSelectedOfferingId("");
      setOfferingForm(null);
    }

    const preferredRequests = activeOnly ? nextRequests.filter((item) => item.active) : nextRequests;
    const resolvedRequest =
      preferredRequests.find((item) => item.id === (preferredSelections.requestId ?? selectedRequestId)) ??
      preferredRequests[0] ??
      nextRequests[0] ??
      null;

    setSelectedRequestId(resolvedRequest?.id ?? "");
    return {
      courses: nextCourses,
      offerings: nextOfferings,
      requests: nextRequests,
      overrides: nextOverrides,
      auditEvents: nextAuditEvents,
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAll(actorId);
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            title: "Staff console failed to load.",
            detail: toFriendlyError(error),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOffering = offerings.find((item) => item.id === selectedOfferingId) ?? null;
  const visibleOfferings = useMemo(
    () =>
      offerings
        .filter((offering) => {
        if (offeringPolicyFilter !== "all" && offering.allocationPolicy !== offeringPolicyFilter) {
          return false;
        }

        if (!matchesOfferingWindow(offering, offeringWindowFilter)) {
          return false;
        }

        const availableSeats = offering.capacity - offering.seatsTaken;

        if (offeringAvailabilityFilter === "available" && availableSeats <= 0) {
          return false;
        }

        if (offeringAvailabilityFilter === "low-seat" && availableSeats > 3) {
          return false;
        }

        if (offeringAvailabilityFilter === "full" && availableSeats > 0) {
          return false;
        }

        if (offeringAvailabilityFilter === "waitlist" && offering.waitlistCount <= 0) {
          return false;
        }

        if (offeringSearch) {
          const haystack = [
            offering.courseCode,
            offering.id,
            offering.title,
            offering.faculty,
            offering.department,
            offering.allocationPolicy,
            offering.requestWindow?.closesOn,
            offering.dropWindow?.closesOn,
          ].join(" ");

          if (!includesText(haystack, offeringSearch)) {
            return false;
          }
        }

        return true;
      })
        .sort((left, right) => {
          if (offeringSortKey === "availableSeatsAsc") {
            return left.capacity - left.seatsTaken - (right.capacity - right.seatsTaken);
          }

          if (offeringSortKey === "availableSeatsDesc") {
            return right.capacity - right.seatsTaken - (left.capacity - left.seatsTaken);
          }

          if (offeringSortKey === "waitlistDesc") {
            return right.waitlistCount - left.waitlistCount;
          }

          if (offeringSortKey === "requestCloseAsc") {
            return String(left.requestWindow?.closesOn ?? "").localeCompare(String(right.requestWindow?.closesOn ?? ""));
          }

          if (offeringSortKey === "policy") {
            return formatPolicyLabel(left.allocationPolicy).localeCompare(formatPolicyLabel(right.allocationPolicy));
          }

          return `${left.courseCode} ${left.id}`.localeCompare(`${right.courseCode} ${right.id}`);
        }),
    [offeringAvailabilityFilter, offeringPolicyFilter, offeringSearch, offeringSortKey, offeringWindowFilter, offerings],
  );
  const offeringFiltersActive =
    Boolean(offeringSearch.trim()) ||
    offeringPolicyFilter !== "all" ||
    offeringWindowFilter !== "all" ||
    offeringAvailabilityFilter !== "all" ||
    offeringSortKey !== "courseCode";
  const selectedOfferingHiddenByFilters = Boolean(
    selectedOffering && !visibleOfferings.some((offering) => offering.id === selectedOffering.id),
  );
  const visibleRequests = useMemo(
    () =>
      requests.filter((item) => {
        if (activeOnly && !item.active) {
          return false;
        }

        if (requestStatusFilter !== "all" && item.status !== requestStatusFilter) {
          return false;
        }

        if (requestSearch) {
          const haystack = [item.id, item.studentId, item.offeringId, item.status, item.message].join(" ");
          if (!includesText(haystack, requestSearch)) {
            return false;
          }
        }

        return true;
      }),
    [activeOnly, requestSearch, requestStatusFilter, requests],
  );
  const selectedRequest = visibleRequests.find((item) => item.id === selectedRequestId) ?? null;
  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );
  const selectedRequestOffering = selectedRequest ? offeringById.get(selectedRequest.offeringId) ?? null : null;
  const selectedRequestWorkflow = useMemo(
    () => getRequestWorkflow(selectedRequest, selectedRequestOffering),
    [selectedRequest, selectedRequestOffering],
  );
  const allowedRequestActions = selectedRequestWorkflow.allowedActions;
  const requestResolutionNoteText = requestResolutionNote.trim();
  const requestResolutionNoteValid = requestResolutionNoteText.length >= 12;
  const requestResolutionNoteProgress = Math.min(requestResolutionNoteText.length, 12);
  const selectedRequestActionAllowed =
    Boolean(requestPreviewAction) && allowedRequestActions.includes(requestPreviewAction);
  const visibleSeatOccupants = useMemo(() => {
    const occupants = offeringImpact?.seatOccupants ?? [];
    const filtered = !offeringSeatSearch.trim()
      ? occupants
      : occupants.filter((occupant) =>
          includesText(
            [occupant.studentId, occupant.studentName, occupant.enrolledAt, occupant.enrollmentId].join(" "),
            offeringSeatSearch,
          ),
        );

    return [...filtered].sort((left, right) => {
      if (offeringSeatSortKey === "studentAsc") {
        return String(left.studentId).localeCompare(String(right.studentId));
      }

      if (offeringSeatSortKey === "studentDesc") {
        return String(right.studentId).localeCompare(String(left.studentId));
      }

      if (offeringSeatSortKey === "timeAsc") {
        return String(left.enrolledAt ?? "").localeCompare(String(right.enrolledAt ?? ""));
      }

      return String(right.enrolledAt ?? "").localeCompare(String(left.enrolledAt ?? ""));
    });
  }, [offeringImpact?.seatOccupants, offeringSeatSearch, offeringSeatSortKey]);
  const selectedRequestIdSet = useMemo(() => new Set(selectedRequestIds), [selectedRequestIds]);
  const selectedVisibleRequests = useMemo(
    () => visibleRequests.filter((item) => selectedRequestIdSet.has(item.id)),
    [selectedRequestIdSet, visibleRequests],
  );
  const selectedActiveRequestCount = useMemo(
    () => selectedVisibleRequests.filter((request) => request.active).length,
    [selectedVisibleRequests],
  );
  const selectedRequestCount = selectedVisibleRequests.length;
  const offeringValidation = useMemo(() => {
    if (!selectedOffering || !offeringForm) {
      return { valid: false, detail: "Select an offering before editing its shared state." };
    }

    const capacity = parseNonNegativeInteger(offeringForm.capacity);

    if (capacity === null) {
      return { valid: false, detail: "Capacity must be a non-negative integer." };
    }

    if (selectedOffering && capacity < selectedOffering.seatsTaken) {
      return { valid: false, detail: "Capacity cannot be lower than the current seats taken count." };
    }

    if ((selectedOffering.schedule ?? []).length > 0 && offeringForm.scheduleSlots.length === 0) {
      return { valid: false, detail: "At least one teaching slot is required for this offering." };
    }

    for (const [slotIndex, slot] of offeringForm.scheduleSlots.entries()) {
      if (!slot.day || !slot.start || !slot.end) {
        return { valid: false, detail: `Teaching slot ${slotIndex + 1} needs a day, start time, and end time.` };
      }
    }

    return { valid: true, detail: "" };
  }, [offeringForm, selectedOffering]);
  const requestResolutionDisabled = !selectedRequest?.active || !selectedRequestActionAllowed || !requestResolutionNoteValid;
  const requestResolutionLockLabel = !selectedRequest?.active
    ? "Locked · inactive request"
    : !requestResolutionNoteValid
      ? `Locked · note ${requestResolutionNoteProgress}/12`
      : !selectedRequestActionAllowed
        ? "Locked · action not allowed"
        : `Ready · note ${requestResolutionNoteProgress}/12`;
  const visibleOverrides = useMemo(
    () =>
      overrides.filter((override) => {
        if (overrideActiveFilter === "active" && !override.active) {
          return false;
        }

        if (overrideActiveFilter === "inactive" && override.active) {
          return false;
        }

        if (overrideSearch) {
          const haystack = [
            override.id,
            override.studentId,
            override.offeringId,
            override.createdBy,
            ...(override.constraintTypes ?? []),
            override.note,
          ].join(" ");

          if (!includesText(haystack, overrideSearch)) {
            return false;
          }
        }

        return true;
      }),
    [overrideActiveFilter, overrideSearch, overrides],
  );
  const selectedOverride = visibleOverrides.find((item) => item.id === selectedOverrideId) ?? null;
  const overrideOfferingCandidateById = useMemo(
    () => new Map(overrideOfferingCandidates.map((candidate) => [candidate.offering.id, candidate])),
    [overrideOfferingCandidates],
  );
  const visibleAuditEvents = useMemo(
    () => {
      const filtered = auditEvents.filter((item) => {
        if (auditActorFilter !== "all" && item.actorType !== auditActorFilter) {
          return false;
        }

        if (auditTargetTypeFilter !== "all" && item.targetType !== auditTargetTypeFilter) {
          return false;
        }

        if (auditActionFilter && item.action !== auditActionFilter) {
          return false;
        }

        if (auditActorIdFilter && !includesText(item.actorId, auditActorIdFilter)) {
          return false;
        }

        if (auditTargetFilter) {
          const haystack = [item.targetType, item.targetId, item.subjectStudentId].join(" ");
          if (!includesText(haystack, auditTargetFilter)) {
            return false;
          }
        }

        if (auditSearchFilter && !includesText(getAuditSearchText(item), auditSearchFilter)) {
          return false;
        }

        return true;
      });

      return [...filtered].sort((left, right) => compareAuditEvents(left, right, auditSortKey, auditSortDirection));
    },
    [
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditEvents,
      auditSearchFilter,
      auditSortDirection,
      auditSortKey,
      auditTargetFilter,
      auditTargetTypeFilter,
    ],
  );
  const selectedAuditEvent = visibleAuditEvents.find((item) => item.id === selectedAuditId) ?? null;
  const selectedAuditBeforeRows = useMemo(
    () => buildAuditPayloadRows(selectedAuditEvent?.before),
    [selectedAuditEvent?.before],
  );
  const selectedAuditAfterRows = useMemo(
    () => buildAuditPayloadRows(selectedAuditEvent?.after),
    [selectedAuditEvent?.after],
  );
  const auditSummary = useMemo(
    () => ({
      total: auditEvents.length,
      visible: visibleAuditEvents.length,
      staff: auditEvents.filter((item) => item.actorType === "staff").length,
      student: auditEvents.filter((item) => item.actorType === "student").length,
      overrides: auditEvents.filter((item) => item.targetType === "constraintOverride").length,
    }),
    [auditEvents, visibleAuditEvents.length],
  );
  const auditActionOptions = useMemo(
    () => [...new Set(auditEvents.map((item) => item.action))].sort((left, right) => left.localeCompare(right)),
    [auditEvents],
  );
  const auditTargetTypeOptions = useMemo(
    () => [...new Set(auditEvents.map((item) => item.targetType))].sort((left, right) => left.localeCompare(right)),
    [auditEvents],
  );
  const auditControls = useMemo(
    () => ({
      auditSearchFilter,
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditTargetTypeFilter,
      auditTargetFilter,
      auditSortKey,
      auditSortDirection,
    }),
    [
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditSearchFilter,
      auditSortDirection,
      auditSortKey,
      auditTargetFilter,
      auditTargetTypeFilter,
    ],
  );
  const auditSortLabel = AUDIT_SORT_OPTIONS.find(([value]) => value === auditSortKey)?.[1] ?? "Timestamp";
  const auditFiltersActive =
    Boolean(auditSearchFilter.trim()) ||
    Boolean(auditActionFilter) ||
    auditActorFilter !== "all" ||
    Boolean(auditActorIdFilter.trim()) ||
    auditTargetTypeFilter !== "all" ||
    Boolean(auditTargetFilter.trim()) ||
    auditSortKey !== "timestamp" ||
    auditSortDirection !== "desc";
  const courseCodeOptions = useMemo(
    () => [...courses].sort((left, right) => left.code.localeCompare(right.code)),
    [courses],
  );
  const pendingOfferingId = useMemo(() => {
    const courseCode = normalizeCourseCode(offeringCreateForm.courseCode);
    const subclass = normalizeSubclass(offeringCreateForm.subclass);
    const semester = Number.parseInt(offeringCreateForm.semester, 10);

    if (!courseCode || !subclass || !Number.isInteger(semester) || semester < 1) {
      return "";
    }

    return `${courseCode}-${subclass}-S${semester}`;
  }, [offeringCreateForm.courseCode, offeringCreateForm.semester, offeringCreateForm.subclass]);
  const courseValidation = useMemo(() => {
    const missingFields = [];
    const code = normalizeCourseCode(courseForm.code);
    if (!code) {
      missingFields.push("course code");
    }
    if (!courseForm.title.trim()) {
      missingFields.push("title");
    }
    if (!courseForm.faculty.trim()) {
      missingFields.push("faculty");
    }
    if (!courseForm.department.trim()) {
      missingFields.push("department");
    }

    if (missingFields.length) {
      return { valid: false, detail: `Required before creating: ${missingFields.join(", ")}.` };
    }

    const credits = parseNonNegativeInteger(courseForm.credits);
    if (credits === null) {
      return { valid: false, detail: "Credits must be a non-negative integer." };
    }

    if (courses.some((course) => course.code === code)) {
      return { valid: false, detail: `Course ${code} already exists.` };
    }

    return { valid: true, detail: "" };
  }, [courseForm.code, courseForm.credits, courseForm.department, courseForm.faculty, courseForm.title, courses]);
  const overrideValidation = useMemo(() => {
    const missingFields = [];

    if (!overrideForm.studentId.trim()) {
      missingFields.push("student ID");
    }
    if (!overrideForm.offeringId) {
      missingFields.push("offering");
    }
    if (!overrideForm.constraintTypes.length) {
      missingFields.push("constraint type");
    }

    if (missingFields.length) {
      return { valid: false, detail: `Required before creating: ${missingFields.join(", ")}.` };
    }

    return { valid: true, detail: "" };
  }, [overrideForm.constraintTypes.length, overrideForm.offeringId, overrideForm.studentId]);
  const overrideCurrentDecisionForDisplay = overrideImpact?.currentDecision ?? (overrideCurrentDecision?.error ? null : overrideCurrentDecision);
  const suggestedOverrideConstraintIds = useMemo(
    () => getSuggestedOverrideConstraintIds(overrideCurrentDecisionForDisplay),
    [overrideCurrentDecisionForDisplay],
  );
  const overrideOfferingSelectDisabled =
    !overrideForm.studentId.trim() || overrideOfferingCandidatesBusy || !overrideOfferingCandidates.length;
  const overrideOfferingSelectLabel = overrideOfferingCandidatesBusy
    ? "Checking current blockers"
    : overrideOfferingCandidates.length
      ? "Select a blocked offering"
      : overrideForm.studentId.trim()
        ? "No current blockers"
        : "Enter a student first";
  const overrideHasNoDecisionChange = Boolean(
    overrideImpact?.currentDecision &&
      overrideImpact?.overrideDecision &&
      !hasOverrideImpactChange(overrideImpact),
  );
  const overrideCreateDisabled = Boolean(
    !overrideValidation.valid ||
      busyKey === "override:create" ||
      overridePreviewBusy ||
      overrideImpact?.error ||
      overrideHasNoDecisionChange,
  );
  const offeringCreateValidation = useMemo(() => {
    const courseCode = normalizeCourseCode(offeringCreateForm.courseCode);
    const capacity = parseNonNegativeInteger(offeringCreateForm.capacity);
    const prerequisites = normalizeCodeList(offeringCreateForm.prerequisites);
    const corequisites = normalizeCodeList(offeringCreateForm.corequisites);
    const knownCourseCodes = new Set(courseCodeOptions.map((course) => course.code));
    const offeredCourseCodes = new Set(offerings.map((offering) => offering.courseCode));

    if (!courseCode || !courses.some((course) => course.code === courseCode)) {
      return { valid: false, detail: "Choose an existing course before creating an offering." };
    }

    if (!normalizeSubclass(offeringCreateForm.subclass)) {
      return { valid: false, detail: "Subclass is required." };
    }

    if (!Number.isInteger(Number.parseInt(offeringCreateForm.semester, 10)) || Number.parseInt(offeringCreateForm.semester, 10) < 1) {
      return { valid: false, detail: "Semester must be a positive integer." };
    }

    if (capacity === null) {
      return { valid: false, detail: "Capacity must be a non-negative integer." };
    }

    if (!offeringCreateForm.scheduleDay || !offeringCreateForm.scheduleStart || !offeringCreateForm.scheduleEnd) {
      return { valid: false, detail: "A teaching day, start time, and end time are required." };
    }

    if (pendingOfferingId && offerings.some((offering) => offering.id === pendingOfferingId)) {
      return { valid: false, detail: `Offering ${pendingOfferingId} already exists.` };
    }

    for (const code of [...prerequisites, ...corequisites]) {
      if (code === courseCode) {
        return { valid: false, detail: `${code} cannot be its own prerequisite or co-requisite.` };
      }

      if (!knownCourseCodes.has(code)) {
        return { valid: false, detail: `${code} does not exist in the course catalog.` };
      }

      if (!offeredCourseCodes.has(code)) {
        return { valid: false, detail: `${code} does not have an existing offering in this schedule.` };
      }
    }

    const prerequisiteSet = new Set(prerequisites);
    const overlappingConstraint = corequisites.find((code) => prerequisiteSet.has(code));
    if (overlappingConstraint) {
      return { valid: false, detail: `${overlappingConstraint} cannot be both prerequisite and co-requisite.` };
    }

    return { valid: true, detail: "" };
  }, [
    courseCodeOptions,
    courses,
    offeringCreateForm.capacity,
    offeringCreateForm.courseCode,
    offeringCreateForm.corequisites,
    offeringCreateForm.prerequisites,
    offeringCreateForm.scheduleDay,
    offeringCreateForm.scheduleEnd,
    offeringCreateForm.scheduleStart,
    offeringCreateForm.semester,
    offeringCreateForm.subclass,
    offerings,
    pendingOfferingId,
  ]);

  useEffect(() => {
    setSelectedOfferingId((current) => {
      if (!offerings.length) {
        setOfferingForm(null);
        return "";
      }

      const currentOffering = offerings.find((item) => item.id === current);
      const nextOffering = visibleOfferings.find((item) => item.id === current) ?? currentOffering ?? visibleOfferings[0] ?? offerings[0];
      setOfferingForm(buildOfferingForm(nextOffering));
      return nextOffering.id;
    });
  }, [offerings, visibleOfferings]);

  useEffect(() => {
    setSelectedRequestId((current) => {
      if (!visibleRequests.length) {
        return "";
      }

      return visibleRequests.some((item) => item.id === current) ? current : visibleRequests[0].id;
    });
  }, [visibleRequests]);

  useEffect(() => {
    setRequestPreviewAction((current) =>
      allowedRequestActions.includes(current) ? current : allowedRequestActions[0] ?? "",
    );
  }, [allowedRequestActions]);

  useEffect(() => {
    setSelectedRequestIds((current) => current.filter((id) => visibleRequests.some((item) => item.id === id)));
  }, [visibleRequests]);

  useEffect(() => {
    setSelectedOverrideId((current) => {
      if (!visibleOverrides.length) {
        return "";
      }

      return visibleOverrides.some((item) => item.id === current) ? current : visibleOverrides[0].id;
    });
  }, [visibleOverrides]);

  useEffect(() => {
    setSelectedAuditId((current) => {
      if (!visibleAuditEvents.length) {
        return "";
      }

      return visibleAuditEvents.some((item) => item.id === current) ? current : visibleAuditEvents[0].id;
    });
  }, [visibleAuditEvents]);

  useEffect(() => {
    if (!courseCodeOptions.length) {
      return;
    }

    setOfferingCreateForm((current) =>
      current.courseCode
        ? current
        : {
            ...current,
            courseCode: courseCodeOptions[0].code,
      },
    );
  }, [courseCodeOptions]);

  useEffect(() => {
    let cancelled = false;
    const studentId = overrideForm.studentId.trim();

    if (!studentId || studentId.length < 6 || !offerings.length) {
      setOverrideOfferingCandidates([]);
      setOverrideOfferingCandidatesBusy(false);
      setOverrideForm((current) =>
        current.offeringId || current.constraintTypes.length
          ? { ...current, offeringId: "", constraintTypes: [] }
          : current,
      );
      return () => {
        cancelled = true;
      };
    }

    setOverrideOfferingCandidatesBusy(true);

    const timeoutId = setTimeout(async () => {
      try {
        const results = await Promise.allSettled(
          offerings.map(async (offering) => {
            const decision = await previewDecision(offering.id, { studentId });
            const suggestedConstraintIds = getSuggestedOverrideConstraintIds(decision);

            if (!suggestedConstraintIds.length) {
              return null;
            }

            return {
              offering,
              decision,
              suggestedConstraintIds,
            };
          }),
        );

        if (cancelled) {
          return;
        }

        const candidates = results
          .filter((result) => result.status === "fulfilled" && result.value)
          .map((result) => result.value)
          .sort((left, right) => left.offering.id.localeCompare(right.offering.id));

        setOverrideOfferingCandidates(candidates);
        setOverrideForm((current) => {
          if (!current.offeringId || candidates.some((candidate) => candidate.offering.id === current.offeringId)) {
            return current;
          }

          return {
            ...current,
            offeringId: "",
            constraintTypes: [],
          };
        });
      } catch {
        if (!cancelled) {
          setOverrideOfferingCandidates([]);
        }
      } finally {
        if (!cancelled) {
          setOverrideOfferingCandidatesBusy(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [offerings, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentOverrideDecision() {
      const studentId = overrideForm.studentId.trim();

      if (!studentId || !overrideForm.offeringId) {
        setOverrideCurrentDecision(null);
        setOverrideCurrentDecisionBusy(false);
        return;
      }

      setOverrideCurrentDecisionBusy(true);

      try {
        const decision = await previewDecision(overrideForm.offeringId, { studentId });

        if (!cancelled) {
          setOverrideCurrentDecision(decision);
        }
      } catch (error) {
        if (!cancelled) {
          setOverrideCurrentDecision({
            error: {
              headline: toErrorHeadline(error, "Current rule check unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOverrideCurrentDecisionBusy(false);
        }
      }
    }

    loadCurrentOverrideDecision();

    return () => {
      cancelled = true;
    };
  }, [overrideForm.offeringId, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOverridePreview() {
      const studentId = overrideForm.studentId.trim();

      if (!studentId || !overrideForm.offeringId || !overrideForm.constraintTypes.length) {
        setOverrideImpact(null);
        setOverridePreviewBusy(false);
        return;
      }

      setOverridePreviewBusy(true);

      try {
        const preview = await previewAdminOverrideImpact(
          {
            studentId,
            offeringId: overrideForm.offeringId,
            constraintTypes: overrideForm.constraintTypes,
          },
          actorId,
        );

        if (!cancelled) {
          setOverrideImpact(preview);
        }
      } catch (error) {
        if (!cancelled) {
          setOverrideImpact({
            error: {
              headline: toErrorHeadline(error, "Override preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOverridePreviewBusy(false);
        }
      }
    }

    loadOverridePreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, overrideForm.constraintTypes, overrideForm.offeringId, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOfferingPreview() {
      if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
        setOfferingImpact(null);
        setOfferingPreviewBusy(false);
        return;
      }

      setOfferingPreviewBusy(true);

      try {
        const preview = await previewAdminOfferingImpact(
          selectedOffering.id,
          {
            capacity: Number.parseInt(offeringForm.capacity, 10),
            seatsTaken: selectedOffering.seatsTaken,
            waitlistCount: selectedOffering.waitlistCount,
            allocationPolicy: offeringForm.allocationPolicy,
            requestWindow: {
              isOpen: offeringForm.requestWindowOpen,
              closesOn: offeringForm.requestWindowClosesOn,
            },
            dropWindow: {
              isOpen: offeringForm.dropWindowOpen,
              closesOn: offeringForm.dropWindowClosesOn,
            },
          },
          actorId,
        );

        if (!cancelled) {
          setOfferingImpact(preview);
        }
      } catch (error) {
        if (!cancelled) {
          setOfferingImpact({
            error: {
              headline: toErrorHeadline(error, "Offering preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOfferingPreviewBusy(false);
        }
      }
    }

    loadOfferingPreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, offeringForm, offeringValidation.valid, selectedOffering]);

  useEffect(() => {
    let cancelled = false;

    async function loadRequestPreview() {
      if (!selectedRequest || !requestPreviewAction || !selectedRequestActionAllowed) {
        setRequestPreviewImpact(null);
        setRequestPreviewBusy(false);
        return;
      }

      setRequestPreviewBusy(true);

      try {
        const preview = await previewAdminRequestResolution(
          selectedRequest.id,
          {
            action: requestPreviewAction,
            note: requestResolutionNoteText || "Preview only; final action requires an office note.",
          },
          actorId,
        );

        if (!cancelled) {
          setRequestPreviewImpact(
            preview?.ok === false
              ? {
                  error: {
                    headline: preview.headline ?? "Resolution preview unavailable.",
                    detail: preview.message ?? "This resolution cannot be applied under the current offering state.",
                  },
                }
              : preview,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setRequestPreviewImpact({
            error: {
              headline: toErrorHeadline(error, "Resolution preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setRequestPreviewBusy(false);
        }
      }
    }

    loadRequestPreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, requestPreviewAction, requestResolutionNote, selectedRequest, selectedRequestActionAllowed]);

  function showBanner(tone, title, detail) {
    setBanner({ tone, title, detail });
  }

  function showToast(tone, title, detail) {
    setToast({ id: `${Date.now()}-${title}`, tone, title, detail });
  }

  function closeToast() {
    setToast(null);
  }

  function getSelectableRowClass(isSelected, selectedMode = "selected") {
    const selectedClass = selectedMode === "viewing" ? "portal-row--staff-viewing" : "portal-row--selected portal-row--staff-selected";

    return isSelected
      ? `portal-row portal-row--staff-selectable ${selectedClass}`
      : "portal-row portal-row--staff-selectable";
  }

  function handleSelectableRowKeyDown(event, callback) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback();
    }
  }

  function selectOffering(offering) {
    setSelectedOfferingId(offering.id);
    setOfferingForm(buildOfferingForm(offering));
    setOfferingImpactDetail("");
    setOfferingSeatSearch("");
    setOfferingSeatSortKey("timeDesc");
    setOfferingSetupMode("management");
  }

  function clearOfferingFilters() {
    setOfferingSearch("");
    setOfferingPolicyFilter("all");
    setOfferingWindowFilter("all");
    setOfferingAvailabilityFilter("all");
    setOfferingSortKey("courseCode");
  }

  function updateAuditControl(field, value) {
    const setters = {
      auditSearchFilter: setAuditSearchFilter,
      auditActionFilter: setAuditActionFilter,
      auditActorFilter: setAuditActorFilter,
      auditActorIdFilter: setAuditActorIdFilter,
      auditTargetTypeFilter: setAuditTargetTypeFilter,
      auditTargetFilter: setAuditTargetFilter,
      auditSortKey: setAuditSortKey,
      auditSortDirection: setAuditSortDirection,
    };

    setters[field]?.(value);
  }

  function clearAuditFilters() {
    setAuditSearchFilter("");
    setAuditActionFilter("");
    setAuditActorFilter("all");
    setAuditActorIdFilter("");
    setAuditTargetTypeFilter("all");
    setAuditTargetFilter("");
    setAuditSortKey("timestamp");
    setAuditSortDirection("desc");
    setOpenAuditColumnMenu("");
  }

  function resetAuditColumn(columnId) {
    if (auditSortKey === columnId) {
      setAuditSortKey("timestamp");
      setAuditSortDirection("desc");
    }

    if (columnId === "actor") {
      setAuditActorFilter("all");
      setAuditActorIdFilter("");
    }

    if (columnId === "action") {
      setAuditActionFilter("");
    }

    if (columnId === "target") {
      setAuditTargetTypeFilter("all");
      setAuditTargetFilter("");
    }

    if (columnId === "summary") {
      setAuditSearchFilter("");
    }

    if (columnId === "timestamp") {
      setAuditSortKey("timestamp");
      setAuditSortDirection("desc");
    }

    setOpenAuditColumnMenu("");
  }

  function renderAuditColumnHeader(columnId, label) {
    return (
      <AuditColumnHeaderControl
        label={label}
        columnId={columnId}
        controls={auditControls}
        menuOpen={openAuditColumnMenu === columnId}
        onToggleMenu={() => setOpenAuditColumnMenu((current) => (current === columnId ? "" : columnId))}
        onClose={() => setOpenAuditColumnMenu("")}
        onReset={() => resetAuditColumn(columnId)}
        onChange={updateAuditControl}
        menuAlign={columnId === "timestamp" || columnId === "actor" ? "left" : "right"}
        actionOptions={auditActionOptions}
        targetTypeOptions={auditTargetTypeOptions}
      />
    );
  }

  function updateCourseForm(field, value) {
    setCourseForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateOfferingCreateForm(field, value) {
    setOfferingCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleOverrideConstraint(constraintId) {
    setOverrideForm((current) => ({
      ...current,
      constraintTypes: current.constraintTypes.includes(constraintId)
        ? current.constraintTypes.filter((item) => item !== constraintId)
        : [...current.constraintTypes, constraintId],
    }));
  }

  function selectOverrideOffering(offeringId) {
    const candidate = overrideOfferingCandidateById.get(offeringId);

    setOverrideForm((current) => ({
      ...current,
      offeringId,
      constraintTypes: candidate?.suggestedConstraintIds ?? [],
    }));
  }

  function toggleRequestSelection(requestId) {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function selectAllVisibleRequests() {
    setSelectedRequestIds(visibleRequests.map((item) => item.id));
  }

  function selectActiveVisibleRequests() {
    setSelectedRequestIds(
      visibleRequests
        .filter((item) => item.active && getRequestWorkflow(item, offeringById.get(item.offeringId)).allowedActions.length > 0)
        .map((item) => item.id),
    );
  }

  function clearSelectedRequests() {
    setSelectedRequestIds([]);
  }

  async function runAction(key, action, successTitle) {
    setBusyKey(key);

    try {
      await action();
      await loadAll(actorId);
      showBanner("success", successTitle, "The shared state has been refreshed.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  function updateOfferingScheduleSlot(slotIndex, field, value) {
    setOfferingForm((current) => ({
      ...current,
      scheduleSlots: current.scheduleSlots.map((slot, index) =>
        index === slotIndex ? { ...slot, [field]: value } : slot,
      ),
    }));
  }

  function addOfferingScheduleSlot() {
    setOfferingForm((current) => ({
      ...current,
      scheduleSlots: [...current.scheduleSlots, createEmptyScheduleSlot()],
    }));
  }

  function removeOfferingScheduleSlot(slotIndex) {
    setOfferingForm((current) => ({
      ...current,
      scheduleSlots: current.scheduleSlots.filter((_, index) => index !== slotIndex),
    }));
  }

  async function handleSaveOffering() {
    if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
      return;
    }

    const patch = {
      capacity: Number.parseInt(offeringForm.capacity, 10),
      allocationPolicy: offeringForm.allocationPolicy,
      requestWindow: {
        isOpen: offeringForm.requestWindowOpen,
        closesOn: offeringForm.requestWindowClosesOn,
      },
      dropWindow: {
        isOpen: offeringForm.dropWindowOpen,
        closesOn: offeringForm.dropWindowClosesOn,
      },
      // The API rejects empty schedules, so an offering without teaching
      // slots (e.g. dissertation records) keeps its stored schedule untouched.
      ...(offeringForm.scheduleSlots.length > 0
        ? {
            schedule: offeringForm.scheduleSlots.map((slot) => ({
              day: slot.day,
              start: slot.start,
              end: slot.end,
              venue: slot.venue.trim(),
            })),
          }
        : {}),
    };

    await runAction(
      `offering:${selectedOffering.id}`,
      () => updateAdminOffering(selectedOffering.id, patch, actorId),
      `Offering ${selectedOffering.courseCode} updated.`,
    );
    setOfferingSetupMode("management");
    scrollOfferingsPart("management");
  }

  function handleConfirmSaveOffering() {
    if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
      return;
    }

    setConfirmAction({
      title: `Save changes to ${selectedOffering.id}?`,
      detail: buildOfferingPreviewDetail(selectedOffering, offeringImpact),
      onConfirm: handleSaveOffering,
    });
  }

  async function handleCreateCourse() {
    if (!courseValidation.valid) {
      showBanner("error", "Course form is incomplete.", courseValidation.detail);
      return;
    }

    setBusyKey("course:create");

    try {
      const created = await createAdminCourse(
        {
          code: normalizeCourseCode(courseForm.code),
          title: courseForm.title.trim(),
          faculty: courseForm.faculty.trim(),
          department: courseForm.department.trim(),
          listType: courseForm.listType,
          credits: Number.parseInt(courseForm.credits, 10),
          crossFaculty: courseForm.crossFaculty,
          synopsis: courseForm.synopsis.trim(),
        },
        actorId,
      );
      await loadAll(actorId);
      setCourseForm(buildDefaultCourseForm());
      setOfferingCreateForm((current) => ({
        ...current,
        courseCode: created.course.code,
      }));
      setOfferingSetupMode("offering");
      scrollOfferingsPart("offering");
      showBanner("success", `${created.course.code} created.`, "Next, create the semester offering for this course.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  function handleConfirmCreateCourse() {
    if (!courseValidation.valid) {
      showBanner("error", "Course form is incomplete.", courseValidation.detail);
      return;
    }

    const code = normalizeCourseCode(courseForm.code);
    setConfirmAction({
      title: `Create course ${code}?`,
      detail: `This will add ${code} to the shared course catalog.`,
      onConfirm: handleCreateCourse,
    });
  }

  async function handleCreateOffering() {
    if (!offeringCreateValidation.valid) {
      return;
    }

    setBusyKey("offering:create");

    try {
      const created = await createAdminOffering(
        {
          courseCode: normalizeCourseCode(offeringCreateForm.courseCode),
          semester: Number.parseInt(offeringCreateForm.semester, 10),
          subclass: normalizeSubclass(offeringCreateForm.subclass),
          allocationPolicy: offeringCreateForm.allocationPolicy,
          capacity: Number.parseInt(offeringCreateForm.capacity, 10),
          requestWindow: {
            isOpen: offeringCreateForm.requestWindowOpen,
            closesOn: offeringCreateForm.requestWindowClosesOn,
          },
          dropWindow: {
            isOpen: offeringCreateForm.dropWindowOpen,
            closesOn: offeringCreateForm.dropWindowClosesOn,
          },
          schedule: [
            {
              day: offeringCreateForm.scheduleDay,
              start: offeringCreateForm.scheduleStart,
              end: offeringCreateForm.scheduleEnd,
              venue: offeringCreateForm.venue.trim(),
            },
          ],
          prerequisites: offeringCreateForm.prerequisites,
          corequisites: offeringCreateForm.corequisites,
        },
        actorId,
      );
      await loadAll(actorId, { offeringId: created.offering.id });
      setSelectedOfferingId(created.offering.id);
      setOfferingSearch(created.offering.courseCode);
      setOfferingPolicyFilter("all");
      setOfferingWindowFilter("all");
      setOfferingAvailabilityFilter("all");
      setOfferingSortKey("courseCode");
      setOfferingCreateForm((current) => ({
        ...buildDefaultOfferingCreateForm(current.courseCode),
        courseCode: current.courseCode,
      }));
      setOfferingSetupMode("management");
      scrollOfferingsPart("management");
      showBanner("success", `${created.offering.id} created.`, "The list is filtered to the new offering. Review and edit live settings on the right.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  function handleConfirmCreateOffering() {
    if (!offeringCreateValidation.valid) {
      return;
    }

    setConfirmAction({
      title: `Create offering ${pendingOfferingId}?`,
      detail: `This will add a new ${formatPolicyLabel(offeringCreateForm.allocationPolicy)} offering for ${normalizeCourseCode(offeringCreateForm.courseCode)}.`,
      onConfirm: handleCreateOffering,
    });
  }

  async function handleResolveRequest(action) {
    if (!selectedRequest) {
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Resolution note required.",
        "Enter a specific office note of at least 12 characters before resolving a request.",
      );
      return;
    }

    if (!isResolutionActionAllowed(selectedRequest, selectedRequestOffering, action)) {
      showBanner(
        "error",
        "Action blocked by workflow.",
        "This request type does not support the selected staff resolution action.",
      );
      return;
    }

    await runAction(
      `request:${selectedRequest.id}:${action}`,
      () =>
        resolveAdminRequest(
          selectedRequest.id,
          {
            action,
            note: requestResolutionNoteText,
          },
          actorId,
        ),
      `Request ${selectedRequest.id} ${formatResolutionPastTense(action)}.`,
    );
  }

  function handleConfirmResolveRequest(action) {
    if (!selectedRequest) {
      showToast("error", "No request selected.", "Select one request before running a resolution action.");
      return;
    }

    if (!selectedRequest.active) {
      showToast("error", "Request is already closed.", "Only active requests can be resolved from this panel.");
      return;
    }

    if (!isResolutionActionAllowed(selectedRequest, selectedRequestOffering, action)) {
      showToast("error", "Action blocked by workflow.", "This request type does not support the selected staff action.");
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Resolution note required.",
        `Write at least 12 characters before ${formatResolutionActionLabel(action).toLowerCase()}.`,
      );
      return;
    }

    setConfirmAction({
      title: `${formatResolutionActionLabel(action)} for ${selectedRequest.id}?`,
      detail: buildRequestPreviewDetail(selectedRequest, action, requestPreviewImpact),
      onConfirm: () => handleResolveRequest(action),
    });
  }

  function handleConfirmBatchResolve(action, preview) {
    if (!preview.eligibleCount && !requestResolutionNoteValid) {
      showToast("error", "Batch action not ready.", "Select eligible rows and write at least 12 characters in the note.");
      return;
    }

    if (!preview.eligibleCount) {
      showToast("error", "No eligible requests selected.", "Select active rows that support this batch action.");
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Batch note required.",
        `Write at least 12 characters before ${formatResolutionActionLabel(action).toLowerCase()} for selected requests.`,
      );
      return;
    }

    const titles = {
      approve: "Approve selected requests?",
      waitlist: "Waitlist selected requests?",
      reject: "Reject selected requests?",
      "manual-close": "Close selected requests without outcome?",
    };

    setConfirmAction({
      title: titles[action] ?? `${formatResolutionActionLabel(action)} selected requests?`,
      detail: buildBatchResolveDetail(action, preview),
      onConfirm: () => handleBatchResolve(action),
    });
  }

  async function handleBatchResolve(action) {
    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Batch note required.",
        "Enter a specific office note before running a batch action; it will be written to every resolved request.",
      );
      return;
    }

    const resolvable = selectedVisibleRequests.filter((request) =>
      request.active && isResolutionActionAllowed(request, offeringById.get(request.offeringId), action),
    );

    if (!resolvable.length) {
      showToast(
        "error",
        "No eligible requests selected.",
        "Select active requests that support this action under their allocation policy.",
      );
      return;
    }

    setBusyKey(`batch:${action}`);

    try {
      const succeeded = [];
      const failed = [];

      for (const request of resolvable) {
        try {
          await resolveAdminRequest(
            request.id,
            {
              action,
              note: requestResolutionNoteText,
            },
            actorId,
          );
          succeeded.push(request.id);
        } catch (error) {
          failed.push({
            id: request.id,
            error,
          });
        }
      }

      await loadAll(actorId);
      clearSelectedRequests();

      if (succeeded.length && failed.length) {
        const firstFailure = failed[0];
        showBanner(
          "warn",
          `${formatRequestCount(succeeded.length)} ${formatResolutionPastTense(action)}; ${formatRequestCount(failed.length)} failed.`,
          `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`,
        );
        return;
      }

      if (failed.length) {
        const firstFailure = failed[0];
        showBanner("error", toErrorHeadline(firstFailure.error), `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`);
        return;
      }

      showBanner(
        "success",
        `${formatRequestCount(succeeded.length)} ${formatResolutionPastTense(action)}.`,
        "The shared state has been refreshed.",
      );
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreateOverride() {
    if (!overrideValidation.valid) {
      showBanner("error", "Override form is incomplete.", overrideValidation.detail);
      return;
    }
    if (overridePreviewBusy) {
      showBanner("warn", "Override impact is still checking.", "Wait for the preview before creating the override.");
      return;
    }
    if (overrideImpact?.error) {
      showBanner("error", overrideImpact.error.headline, overrideImpact.error.detail);
      return;
    }
    if (overrideHasNoDecisionChange) {
      showBanner("warn", "No decision change.", buildOverrideImpactNote(overrideImpact));
      return;
    }

    await runAction(
      "override:create",
      () =>
        createAdminOverride(
          {
            studentId: overrideForm.studentId.trim(),
            offeringId: overrideForm.offeringId,
            note: overrideForm.note.trim(),
            constraintTypes: overrideForm.constraintTypes,
          },
          actorId,
        ),
      "Constraint override created.",
    );

    setOverrideForm((current) => ({
      ...buildDefaultOverrideForm(),
      studentId: current.studentId.trim() || "3036605296",
      note: current.note,
    }));
  }

  async function handleDeleteOverride(overrideId) {
    await runAction(
      `override:${overrideId}:delete`,
      () => deleteAdminOverride(overrideId, actorId),
      `Constraint override ${overrideId} removed.`,
    );
  }

  async function handleRefresh() {
    await runAction("refresh", () => loadAll(actorId), "Staff data refreshed.");
  }

  async function handleResetAll() {
    await runAction(
      "reset-all",
      async () => {
        await resetDemo({ scope: "all" });
        await loadAll(actorId);
      },
      "All records reset.",
    );
  }

  function scrollOfferingsPart(part) {
    window.requestAnimationFrame(() => {
      document.getElementById(`staff-offerings-${part}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function jumpToOfferingsPart(part) {
    setOfferingSetupMode(part);
    scrollOfferingsPart(part);
  }

  const offeringSummary = useMemo(
    () => ({
      total: offerings.length,
      requestOpen: offerings.filter((item) => item.requestWindow?.isOpen).length,
      dropOpen: offerings.filter((item) => item.dropWindow?.isOpen).length,
      locked: offerings.filter((item) => item.allocationPolicy === "locked").length,
      lowSeat: offerings.filter((item) => item.capacity - item.seatsTaken <= 3).length,
    }),
    [offerings],
  );

  const requestSummary = useMemo(
    () => ({
      total: requests.length,
      active: requests.filter((item) => item.active).length,
      queued: requests.filter((item) => item.status === "lotteryQueued" || item.status === "pendingReview").length,
      waitlist: requests.filter((item) => item.status === "waitlist" && item.active).length,
      visible: visibleRequests.length,
      selected: selectedRequestCount,
    }),
    [requests, selectedRequestCount, visibleRequests.length],
  );
  const requestBatchPreviews = useMemo(() => {
    const selectedCount = selectedVisibleRequests.length;
    const lotteryCount = selectedVisibleRequests.filter((request) => {
      const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));
      return workflow.mode === "lottery";
    }).length;
    const reviewCount = selectedVisibleRequests.filter((request) => {
      const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));
      return workflow.mode === "review";
    }).length;
    const waitlistCount = selectedVisibleRequests.filter((request) => request.status === "waitlist" && request.active).length;

    return Object.fromEntries(
      RESOLUTION_ACTION_OPTIONS.map(([action]) => {
        const eligibleCount = selectedVisibleRequests.filter((request) =>
          request.active && isResolutionActionAllowed(request, offeringById.get(request.offeringId), action),
        ).length;

        return [
          action,
          {
            selectedCount,
            eligibleCount,
            skippedCount: Math.max(selectedCount - eligibleCount, 0),
            lotteryCount,
            reviewCount,
            waitlistCount,
          },
        ];
      }),
    );
  }, [offeringById, selectedVisibleRequests]);

  return (
    <div className="portal portal--staff">
      <header className="portal-header">
        <div className="portal-brand">
          <img src="/hkulogo.jpg" alt="The University of Hong Kong crest" className="portal-crest-image" />
          <div>
            <h1>Faculty of Engineering</h1>
            <p>The University of Hong Kong</p>
          </div>
        </div>
        <div className="portal-mark">Staff Console</div>
      </header>

      <div className="portal-links portal-links--staff">
        <div className="portal-links__menu staff-tabs" role="tablist" aria-label="Staff console sections">
          {STAFF_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={activeTab === tab.id ? "top-link top-link--active" : "top-link"}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="portal-links__meta staff-toolbar">
          <div className="staff-session-chip" aria-label={`Signed in as ${session?.displayName ?? "Staff"}`}>
            <span>Account</span>
            <strong>{session?.displayName ?? "Staff"}</strong>
          </div>
          <div className="staff-toolbar__status" role="status" aria-live="polite">
            {busyKey ? "Syncing staff data…" : formatStaffTimestamp(lastLoadedAt)}
          </div>
          <button type="button" className="portal-reset" onClick={handleRefresh} disabled={busyKey === "refresh"}>
            {busyKey === "refresh" ? "Syncing…" : "Refresh"}
          </button>
          <button
            type="button"
            className={dangerExpanded ? "portal-reset portal-reset--danger" : "portal-reset portal-reset--secondary"}
            onClick={() => setDangerExpanded((current) => !current)}
            aria-expanded={dangerExpanded}
            aria-controls="staff-danger-zone"
          >
            Reset demo data
          </button>
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onReturnToPortal}>
            Student Portal
          </button>
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onStaffLogout}>
            Sign out
          </button>
        </div>
      </div>

      <main className="portal-main portal-main--staff">
        <div className="page-header">
          <h2>Staff Administration</h2>
        </div>

        {banner ? <Banner tone={banner.tone} title={banner.title} detail={banner.detail} onClose={() => setBanner(null)} /> : null}
        {toast ? (
          <ToastNotice
            key={toast.id}
            tone={toast.tone}
            title={toast.title}
            detail={toast.detail}
            onClose={closeToast}
          />
        ) : null}

        {!loading && dangerExpanded ? (
          <section id="staff-danger-zone" className="page-panel page-panel--danger">
            <h3>Reset demo data</h3>
              <div className="danger-zone danger-zone--actions">
                <div className="danger-zone__summary">
                  <strong>Reset all records</strong>
                  <p>This should only be used when you need to restore every student and shared offering to the original seed baseline.</p>
                </div>
                <button
                  type="button"
                  className="mini-button mini-button--danger"
                  onClick={() =>
                    setConfirmAction({
                      title: "Reset all records?",
                      detail: "This will reset every student, request, override, and shared offering to the seed baseline.",
                      onConfirm: handleResetAll,
                    })
                  }
                  disabled={busyKey === "reset-all"}
                >
                  Reset all records
                </button>
              </div>
          </section>
        ) : null}

        {loading ? (
          <div className="page-panel">
            <p>Loading staff data…</p>
          </div>
        ) : null}

        {!loading && activeTab === "offerings" ? (
          <>
          <div className="staff-offerings-workspace">
          <section className="page-panel staff-workflow-panel">
            <h3>Offerings workflow</h3>
            <div className="staff-mode-switch" role="tablist" aria-label="Creation form">
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "course"}
                className={offeringSetupMode === "course" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("course")}
              >
                Create course
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "offering"}
                className={offeringSetupMode === "offering" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("offering")}
              >
                Create offering
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "management"}
                className={offeringSetupMode === "management" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("management")}
              >
                Manage existing
              </button>
            </div>
          </section>

          <div className="staff-create-grid staff-create-grid--single">
            <section
              id="staff-offerings-course"
              className={offeringSetupMode === "course" ? "page-panel staff-panel--course" : "page-panel staff-panel--course staff-create-panel--hidden"}
            >
              <h3>Create new course</h3>
              <div className="staff-mode-banner">
                <strong>Create mode</strong>
                <span>Adds a static course identity only. It does not edit the selected offering below.</span>
              </div>
              <div className="staff-form-grid">
                <div className="staff-form-row">
                  <label>Course Code</label>
                  <input value={courseForm.code} onChange={(event) => updateCourseForm("code", event.target.value)} placeholder="COMP7999" />
                </div>
                <div className="staff-form-row">
                  <label>Title</label>
                  <input value={courseForm.title} onChange={(event) => updateCourseForm("title", event.target.value)} placeholder="Special Topics in Engineering" />
                </div>
                <div className="staff-form-row">
                  <label>Faculty</label>
                  <select value={courseForm.faculty} onChange={(event) => updateCourseForm("faculty", event.target.value)}>
                    {STAFF_FACULTY_OPTIONS.map((faculty) => (
                      <option key={faculty} value={faculty}>
                        {faculty}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Department</label>
                  <input value={courseForm.department} onChange={(event) => updateCourseForm("department", event.target.value)} placeholder="Computer Science" />
                </div>
                <div className="staff-form-row">
                  <label>List Type</label>
                  <select value={courseForm.listType} onChange={(event) => updateCourseForm("listType", event.target.value)}>
                    {STAFF_LIST_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Credits</label>
                  <input value={courseForm.credits} onChange={(event) => updateCourseForm("credits", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Cross-faculty offering</label>
                  <label className="staff-switch">
                    <input
                      type="checkbox"
                      checked={courseForm.crossFaculty}
                      onChange={(event) => updateCourseForm("crossFaculty", event.target.checked)}
                    />
                    <span className="staff-switch__track" aria-hidden="true" />
                    <span>{courseForm.crossFaculty ? "On" : "Off"}</span>
                  </label>
                </div>
                <div className="staff-form-row staff-form-row--stacked">
                  <label>Synopsis</label>
                  <textarea
                    className="staff-note-input"
                    value={courseForm.synopsis}
                    onChange={(event) => updateCourseForm("synopsis", event.target.value)}
                    placeholder="Short internal synopsis shown in the student detail dialog."
                  />
                </div>
                <div className="staff-inline-actions">
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={handleConfirmCreateCourse}
                    disabled={busyKey === "course:create"}
                  >
                    Create Course
                  </button>
                </div>
                {!courseValidation.valid ? <p className="staff-inline-note">{courseValidation.detail}</p> : null}
              </div>
            </section>

            <section
              id="staff-offerings-offering"
              className={offeringSetupMode === "offering" ? "page-panel staff-panel--offering" : "page-panel staff-panel--offering staff-create-panel--hidden"}
            >
              <h3>Create new offering</h3>
              <div className="staff-mode-banner">
                <strong>Create mode</strong>
                <span>Creates {pendingOfferingId || "a new offering"} from this form. The editor below remains tied to the selected existing row.</span>
              </div>
              <div className="staff-form-grid">
                <div className="staff-form-row">
                  <label>Course</label>
                  <select
                    value={offeringCreateForm.courseCode}
                    onChange={(event) => updateOfferingCreateForm("courseCode", event.target.value)}
                  >
                    <option value="">Select course</option>
                    {courseCodeOptions.map((course) => (
                      <option key={course.code} value={course.code}>
                        {course.code} · {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Offering ID</label>
                  <div className="staff-readonly-value">
                    <strong>{pendingOfferingId || "Waiting for course / subclass / semester"}</strong>
                    <span>Generated from course code, subclass, and semester.</span>
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Semester</label>
                  <input value={offeringCreateForm.semester} onChange={(event) => updateOfferingCreateForm("semester", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Subclass</label>
                  <input value={offeringCreateForm.subclass} onChange={(event) => updateOfferingCreateForm("subclass", event.target.value)} placeholder="A" />
                </div>
                <div className="staff-form-row">
                  <label>Policy</label>
                  <select value={offeringCreateForm.allocationPolicy} onChange={(event) => updateOfferingCreateForm("allocationPolicy", event.target.value)}>
                    {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Capacity</label>
                  <input value={offeringCreateForm.capacity} onChange={(event) => updateOfferingCreateForm("capacity", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Request Window</label>
                  <div className="staff-window-grid">
                    <label className="staff-checkbox">
                      <input
                        type="checkbox"
                        checked={offeringCreateForm.requestWindowOpen}
                        onChange={(event) => updateOfferingCreateForm("requestWindowOpen", event.target.checked)}
                      />
                      Open
                    </label>
                    <StaffDateField
                      label="Request window close date"
                      value={offeringCreateForm.requestWindowClosesOn}
                      onChange={(value) => updateOfferingCreateForm("requestWindowClosesOn", value)}
                    />
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Drop Window</label>
                  <div className="staff-window-grid">
                    <label className="staff-checkbox">
                      <input
                        type="checkbox"
                        checked={offeringCreateForm.dropWindowOpen}
                        onChange={(event) => updateOfferingCreateForm("dropWindowOpen", event.target.checked)}
                      />
                      Open
                    </label>
                    <StaffDateField
                      label="Drop window close date"
                      value={offeringCreateForm.dropWindowClosesOn}
                      onChange={(value) => updateOfferingCreateForm("dropWindowClosesOn", value)}
                    />
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Teaching Day</label>
                  <select value={offeringCreateForm.scheduleDay} onChange={(event) => updateOfferingCreateForm("scheduleDay", event.target.value)}>
                    {STAFF_DAY_OPTIONS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Start / End</label>
                  <div className="staff-time-grid">
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        value={offeringCreateForm.scheduleStart}
                        onChange={(event) => updateOfferingCreateForm("scheduleStart", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        value={offeringCreateForm.scheduleEnd}
                        onChange={(event) => updateOfferingCreateForm("scheduleEnd", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Venue</label>
                  <input value={offeringCreateForm.venue} onChange={(event) => updateOfferingCreateForm("venue", event.target.value)} placeholder="MWT 1 / Zoom" />
                </div>
                <div className="staff-form-row">
                  <label>Prerequisites</label>
                  <input value={offeringCreateForm.prerequisites} onChange={(event) => updateOfferingCreateForm("prerequisites", event.target.value)} placeholder="COMP7103, STAT7600" />
                </div>
                <div className="staff-form-row">
                  <label>Corequisites</label>
                  <input value={offeringCreateForm.corequisites} onChange={(event) => updateOfferingCreateForm("corequisites", event.target.value)} placeholder="TDLL6024" />
                </div>
                <div className="staff-inline-actions">
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={handleConfirmCreateOffering}
                    disabled={!offeringCreateValidation.valid || busyKey === "offering:create"}
                  >
                    Create Offering
                  </button>
                </div>
                {!offeringCreateValidation.valid ? <p className="staff-inline-note">{offeringCreateValidation.detail}</p> : null}
              </div>
            </section>
          </div>

          <div id="staff-offerings-management" className="staff-section-heading">
            <div>
              <strong>Manage existing shared offerings</strong>
              <span>Select one row on the left, then update the live offering settings on the right.</span>
            </div>
          </div>

          <div className="staff-grid staff-grid--offerings">
            <section className="page-panel staff-panel--shared">
              <h3>Shared Offerings</h3>
              <div className="staff-summary-bar">
                <span>{offeringSummary.total} offerings</span>
                <span>{offeringSummary.requestOpen} request open</span>
                <span>{offeringSummary.dropOpen} drop open</span>
                <span>{offeringSummary.locked} locked</span>
                <span>{offeringSummary.lowSeat} low-seat</span>
              </div>
              <div className="staff-table-controls">
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={offeringSearch} onChange={(event) => setOfferingSearch(event.target.value)} />
                </label>
                <label className="staff-toolbar__field">
                  <span>Policy</span>
                  <select
                    value={offeringPolicyFilter}
                    onChange={(event) => setOfferingPolicyFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Window</span>
                  <select
                    value={offeringWindowFilter}
                    onChange={(event) => setOfferingWindowFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="request-open">Request open</option>
                    <option value="request-closed">Request closed</option>
                    <option value="drop-open">Drop open</option>
                    <option value="drop-closed">Drop closed</option>
                    <option value="fully-closed">Fully closed</option>
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Availability</span>
                  <select
                    value={offeringAvailabilityFilter}
                    onChange={(event) => setOfferingAvailabilityFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="available">Available seats</option>
                    <option value="low-seat">Low seat (≤ 3)</option>
                    <option value="full">Full</option>
                    <option value="waitlist">Waitlist &gt; 0</option>
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Sort</span>
                  <select value={offeringSortKey} onChange={(event) => setOfferingSortKey(event.target.value)}>
                    <option value="courseCode">Course code</option>
                    <option value="availableSeatsAsc">Available seats ↑</option>
                    <option value="availableSeatsDesc">Available seats ↓</option>
                    <option value="waitlistDesc">Waitlist ↓</option>
                    <option value="requestCloseAsc">Request close date</option>
                    <option value="policy">Policy</option>
                  </select>
                </label>
                <div className="staff-toolbar__field staff-toolbar__field--action">
                  <span>Filters</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={clearOfferingFilters}
                    disabled={!offeringFiltersActive}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-offerings">
                  <thead>
                    <tr>
                      <th>Offering</th>
                      <th>Policy</th>
                      <th>Capacity</th>
                      <th>Seats Taken</th>
                      <th>Waitlist</th>
                      <th>Request Window</th>
                      <th>Drop Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOfferings.length ? (
                      visibleOfferings.map((offering) => (
                      <tr
                        key={offering.id}
                        className={getSelectableRowClass(offering.id === selectedOfferingId)}
                        onClick={() => selectOffering(offering)}
                        onKeyDown={(event) => handleSelectableRowKeyDown(event, () => selectOffering(offering))}
                        tabIndex={0}
                        aria-selected={offering.id === selectedOfferingId}
                      >
                        <td>
                          <div className="staff-row-title">
                            <strong>{offering.courseCode}</strong>
                          </div>
                          <div>{offering.id}</div>
                        </td>
                        <td>{formatPolicyLabel(offering.allocationPolicy)}</td>
                        <td>{offering.capacity}</td>
                        <td>{offering.seatsTaken}</td>
                        <td>{offering.waitlistCount}</td>
                        <td>{formatWindow(offering.requestWindow)}</td>
                        <td>{formatWindow(offering.dropWindow)}</td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>
                          <div className="staff-empty-state">
                            <strong>No offerings match the current filters.</strong>
                            <span>The editor keeps the last available selection so you do not lose context.</span>
                            <button
                              type="button"
                              className="mini-button"
                              onClick={clearOfferingFilters}
                              disabled={!offeringFiltersActive}
                            >
                              Clear filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel page-panel--focus staff-panel--editor">
              <h3>{selectedOffering ? `Editing existing offering · ${selectedOffering.courseCode}` : "Offering Editor"}</h3>
              {selectedOffering ? (
                <div className="staff-selection-banner" aria-live="polite">
                  <div className="staff-selection-banner__eyebrow">Editing selected existing offering</div>
                  <div className="staff-selection-banner__main">
                    <strong>{selectedOffering.courseCode}</strong>
                    <span className="staff-selection-banner__id">{selectedOffering.id}</span>
                  </div>
                  {selectedOffering.title ? <div className="staff-selection-banner__note">{selectedOffering.title}</div> : null}
                </div>
              ) : null}
              {selectedOfferingHiddenByFilters ? (
                <div className="staff-filter-note" role="status">
                  <span>This selected offering is hidden by the current table filters.</span>
                  <button type="button" className="mini-button" onClick={clearOfferingFilters}>
                    Clear filters
                  </button>
                </div>
              ) : null}
              {selectedOffering && offeringForm ? (
                <div className="staff-form-grid">
                  <div className="staff-context-grid">
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Availability</span>
                      <strong className="staff-context-card__value">
                        {formatSeatCount(Math.max(0, selectedOffering.capacity - selectedOffering.seatsTaken), "open")}
                      </strong>
                      <span className="staff-context-card__meta">
                        {selectedOffering.seatsTaken} taken · {selectedOffering.waitlistCount} waitlist
                      </span>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Teaching slot</span>
                      <strong className="staff-context-card__value">
                        {selectedOffering.schedule?.length ? `${selectedOffering.schedule.length} meeting${selectedOffering.schedule.length === 1 ? "" : "s"}` : "No slot recorded"}
                      </strong>
                      <div className="staff-context-list">
                        {selectedOffering.schedule?.length ? (
                          selectedOffering.schedule.map((slot) => (
                            <span key={`${slot.day}-${slot.start}-${slot.end}-${slot.venue}`}>
                              {slot.day} {slot.start}-{slot.end}{slot.venue ? ` · ${slot.venue}` : ""}
                            </span>
                          ))
                        ) : (
                          <span>No schedule data on this offering.</span>
                        )}
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Requirements</span>
                      <strong className="staff-context-card__value">
                        {selectedOffering.prerequisites?.length || selectedOffering.corequisites?.length ? "Constraint-based" : "Open course"}
                      </strong>
                      <div className="staff-context-list">
                        <span>
                          Prereq: {selectedOffering.prerequisites?.length ? selectedOffering.prerequisites.join(", ") : "None"}
                        </span>
                        <span>
                          Coreq: {selectedOffering.corequisites?.length ? selectedOffering.corequisites.join(", ") : "None"}
                        </span>
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Window and policy</span>
                      <strong className="staff-context-card__value">{formatPolicyLabel(selectedOffering.allocationPolicy)}</strong>
                      <div className="staff-context-list">
                        <span>Request: {formatWindow(selectedOffering.requestWindow)}</span>
                        <span>Drop: {formatWindow(selectedOffering.dropWindow)}</span>
                        <span>Version {selectedOffering.version ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Offering</label>
                    <div>{selectedOffering.id}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Capacity</label>
                    <input
                      value={offeringForm.capacity}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, capacity: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Seats Taken</label>
                    <div className="staff-readonly-value staff-readonly-value--metric">
                      <div className="staff-readonly-value__header">
                        <strong>{selectedOffering.seatsTaken}</strong>
                        <span className="staff-readonly-chip">Read-only</span>
                      </div>
                      <span>Derived from the current occupied seat roster.</span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Waitlist Count</label>
                    <div className="staff-readonly-value staff-readonly-value--metric">
                      <div className="staff-readonly-value__header">
                        <strong>{selectedOffering.waitlistCount}</strong>
                        <span className="staff-readonly-chip">Read-only</span>
                      </div>
                      <span>Read-only count from the current waiting queue.</span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Allocation Policy</label>
                    <select
                      value={offeringForm.allocationPolicy}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, allocationPolicy: event.target.value }))}
                    >
                      {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="staff-form-row">
                    <label>Teaching Slots</label>
                    <div className="staff-schedule-slots">
                      {offeringForm.scheduleSlots.length === 0 ? (
                        <p className="staff-schedule-slots__empty">
                          No teaching slot is configured for this offering.
                        </p>
                      ) : null}
                      {offeringForm.scheduleSlots.map((slot, slotIndex) => (
                        <div key={slotIndex} className="staff-schedule-slot">
                          <select
                            value={slot.day}
                            aria-label={`Teaching slot ${slotIndex + 1} day`}
                            onChange={(event) => updateOfferingScheduleSlot(slotIndex, "day", event.target.value)}
                          >
                            {STAFF_DAY_OPTIONS.map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={slot.start}
                            aria-label={`Teaching slot ${slotIndex + 1} start`}
                            onChange={(event) => updateOfferingScheduleSlot(slotIndex, "start", event.target.value)}
                          />
                          <input
                            type="time"
                            value={slot.end}
                            aria-label={`Teaching slot ${slotIndex + 1} end`}
                            onChange={(event) => updateOfferingScheduleSlot(slotIndex, "end", event.target.value)}
                          />
                          <input
                            value={slot.venue}
                            aria-label={`Teaching slot ${slotIndex + 1} venue`}
                            placeholder="MWT 1 / Zoom"
                            onChange={(event) => updateOfferingScheduleSlot(slotIndex, "venue", event.target.value)}
                          />
                          <button
                            type="button"
                            className="staff-slot-remove"
                            onClick={() => removeOfferingScheduleSlot(slotIndex)}
                            disabled={offeringForm.scheduleSlots.length === 1 && (selectedOffering.schedule ?? []).length > 0}
                            title="Remove this teaching slot"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button type="button" className="staff-slot-add" onClick={addOfferingScheduleSlot}>
                        Add teaching slot
                      </button>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Request Window</label>
                    <div className="staff-window-grid">
                      <label className="staff-checkbox">
                        <input
                          type="checkbox"
                          checked={offeringForm.requestWindowOpen}
                          onChange={(event) =>
                            setOfferingForm((current) => ({ ...current, requestWindowOpen: event.target.checked }))
                          }
                        />
                        Open
                      </label>
                      <StaffDateField
                        label="Request window close date"
                        value={offeringForm.requestWindowClosesOn}
                        onChange={(value) =>
                          setOfferingForm((current) => ({ ...current, requestWindowClosesOn: value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Drop Window</label>
                    <div className="staff-window-grid">
                      <label className="staff-checkbox">
                        <input
                          type="checkbox"
                          checked={offeringForm.dropWindowOpen}
                          onChange={(event) =>
                            setOfferingForm((current) => ({ ...current, dropWindowOpen: event.target.checked }))
                          }
                        />
                        Open
                      </label>
                      <StaffDateField
                        label="Drop window close date"
                        value={offeringForm.dropWindowClosesOn}
                        onChange={(value) =>
                          setOfferingForm((current) => ({ ...current, dropWindowClosesOn: value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Impact Preview</label>
                    {offeringPreviewBusy ? (
                      <p className="staff-inline-note">Checking how this offering change would affect seats, windows, and active requests…</p>
                    ) : offeringImpact?.error ? (
                      <div className="staff-decision-card staff-decision-card--error">
                        <strong>{offeringImpact.error.headline}</strong>
                        <p>{offeringImpact.error.detail}</p>
                      </div>
                    ) : offeringImpact?.summary ? (
                      <>
                      <div className="staff-impact-grid">
                        <button
                          type="button"
                          className={
                            offeringImpactDetail === "seats"
                              ? "staff-decision-card staff-decision-card--info staff-decision-card--interactive staff-decision-card--active"
                              : "staff-decision-card staff-decision-card--info staff-decision-card--interactive"
                          }
                          onClick={() => setOfferingImpactDetail((current) => (current === "seats" ? "" : "seats"))}
                          aria-expanded={offeringImpactDetail === "seats"}
                        >
                          <span className="staff-decision-card__label">Available seats</span>
                          <strong>
                            {offeringImpact.summary.availableSeatsBefore === offeringImpact.summary.availableSeatsAfter
                              ? formatSeatCount(offeringImpact.summary.availableSeatsAfter, "available")
                              : `${offeringImpact.summary.availableSeatsBefore} → ${formatSeatCount(offeringImpact.summary.availableSeatsAfter, "available")}`}
                          </strong>
                          <p>
                            Seats taken: {offeringImpact.before?.seatsTaken ?? selectedOffering?.seatsTaken ?? "—"} /{" "}
                            {offeringImpact.before?.capacity ?? selectedOffering?.capacity ?? "—"}.
                            {" "}{offeringImpact.summary.seatsDelta === 0 ? "No availability change." : `Availability delta: ${offeringImpact.summary.seatsDelta}.`}
                          </p>
                          <span className="staff-decision-card__hint">
                            {offeringImpactDetail === "seats" ? "Hide tracked approved students" : "Show tracked approved students"}
                          </span>
                        </button>
                        <div className="staff-decision-card staff-decision-card--warn">
                          <span className="staff-decision-card__label">Affected requests</span>
                          <strong>{offeringImpact.summary.affectedActiveRequests}</strong>
                          <p>Active requests currently attached to this offering.</p>
                        </div>
                        <div className="staff-decision-card staff-decision-card--neutral">
                          <span className="staff-decision-card__label">Window change</span>
                          <strong>
                            {offeringImpact.summary.requestWindowClosingNow || offeringImpact.summary.dropWindowClosingNow
                              ? "Window closes now"
                              : "No immediate closure"}
                          </strong>
                          <p>
                            {offeringImpact.summary.requestWindowClosingNow
                              ? "Request window closes immediately with this update."
                              : offeringImpact.summary.dropWindowClosingNow
                                ? "Drop window closes immediately with this update."
                                : "Request and drop windows remain as configured."}
                          </p>
                        </div>
                      </div>
                      {offeringImpactDetail === "seats" ? (
                        <div className="staff-impact-detail" aria-live="polite">
                          <div className="staff-impact-detail__header">
                            <strong>Approved seat holders</strong>
                            <span>{offeringImpact.seatOccupantSummary?.totalCount ?? offeringImpact.seatOccupants?.length ?? 0} confirmed students</span>
                          </div>
                          <div className="staff-impact-detail__toolbar">
                            <label className="staff-impact-detail__search">
                              <span>Search</span>
                              <input
                                type="search"
                                value={offeringSeatSearch}
                                onChange={(event) => setOfferingSeatSearch(event.target.value)}
                                placeholder="Search by student ID"
                              />
                            </label>
                            <div className="staff-impact-detail__toolbar-actions">
                              <label className="staff-impact-detail__sort">
                                <span>Sort</span>
                                <select
                                  value={offeringSeatSortKey}
                                  onChange={(event) => setOfferingSeatSortKey(event.target.value)}
                                >
                                  <option value="timeDesc">Newest first</option>
                                  <option value="timeAsc">Oldest first</option>
                                  <option value="studentAsc">Student ID ↑</option>
                                  <option value="studentDesc">Student ID ↓</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                className="staff-impact-detail__clear"
                                onClick={() => setOfferingSeatSearch("")}
                                disabled={!offeringSeatSearch.trim()}
                              >
                                Clear
                              </button>
                              <span className="staff-impact-detail__count">{visibleSeatOccupants.length} visible</span>
                            </div>
                          </div>
                          <p className="staff-inline-note">
                            This roster shows the occupied seats currently recorded for this offering.
                          </p>
                          {visibleSeatOccupants.length ? (
                            <div className="staff-impact-list">
                              {visibleSeatOccupants.map((occupant) => (
                                <div key={occupant.enrollmentId} className="staff-impact-list__row">
                                  <div className="staff-impact-list__main">
                                    <strong>{occupant.studentId}</strong>
                                    {occupant.studentName ? (
                                      <span className="staff-impact-list__name">{occupant.studentName}</span>
                                    ) : null}
                                  </div>
                                  <div className="staff-impact-list__meta">
                                    {formatSeatOccupantTimestamp(occupant.enrolledAt)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="staff-inline-note">
                              {offeringImpact.seatOccupants?.length
                                ? "No approved seat holders match the current search."
                                : "No approved seat holders are recorded for this offering yet."}
                            </p>
                          )}
                        </div>
                      ) : null}
                      </>
                    ) : (
                      <p className="staff-inline-note">Select an offering and edit its values to preview the effect before saving.</p>
                    )}
                  </div>
                  <div className="staff-inline-actions">
                    <button
                      type="button"
                      className="mini-button mini-button--primary"
                      onClick={handleConfirmSaveOffering}
                      disabled={!offeringValidation.valid || busyKey === `offering:${selectedOffering.id}`}
                    >
                      Save Offering
                    </button>
                  </div>
                  {!offeringValidation.valid ? <p className="staff-inline-note">{offeringValidation.detail}</p> : null}
                </div>
              ) : (
                <p>Select an offering to edit its shared configuration.</p>
              )}
            </section>
          </div>
          </div>
          </>
        ) : null}

        {!loading && activeTab === "requests" ? (
          <div className="staff-grid">
            <section className="page-panel staff-panel--request-list">
              <h3>Requests</h3>
              <div className="staff-summary-bar">
                <span>{requestSummary.total} total</span>
                <span>{requestSummary.active} active</span>
                <span>{requestSummary.queued} queued</span>
                <span>{requestSummary.waitlist} waitlist</span>
                <span>{requestSummary.visible} visible</span>
                <span>{requestSummary.selected} batch selected</span>
              </div>
              <div className="staff-table-controls">
                <label className="staff-checkbox">
                  <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
                  Active only
                </label>
                <label className="staff-toolbar__field">
                  <span>Status</span>
                  <select
                    value={requestStatusFilter}
                    onChange={(event) => setRequestStatusFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {REQUEST_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} />
                </label>
                <div className="staff-toolbar-group staff-toolbar-group--selection">
                  <span className="staff-toolbar-group__label">Selection</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={selectAllVisibleRequests}
                    disabled={!visibleRequests.length}
                    title="Select every row currently shown by the filters, including rows that batch actions may later skip."
                  >
                    Select shown rows
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={selectActiveVisibleRequests}
                    disabled={!visibleRequests.some((item) => item.active && getRequestWorkflow(item, offeringById.get(item.offeringId)).allowedActions.length > 0)}
                    title="Select only active visible requests that ordinary staff batch actions can resolve."
                  >
                    Select action-ready rows
                  </button>
                  <button type="button" className="mini-button" onClick={clearSelectedRequests} disabled={!selectedRequestIds.length}>
                    Clear batch
                  </button>
                </div>
                <div className="staff-toolbar-group staff-toolbar-group--actions">
                  <span className="staff-toolbar-group__label">Actions</span>
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={() => handleConfirmBatchResolve("approve", requestBatchPreviews.approve)}
                  >
                    Batch Approve
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => handleConfirmBatchResolve("waitlist", requestBatchPreviews.waitlist)}
                  >
                    Batch Waitlist
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--danger"
                    onClick={() => handleConfirmBatchResolve("reject", requestBatchPreviews.reject)}
                  >
                    Batch Reject
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--danger"
                    onClick={() => handleConfirmBatchResolve("manual-close", requestBatchPreviews["manual-close"])}
                  >
                    Batch Close
                  </button>
                </div>
              </div>
              <div className="staff-batch-readiness" role="status" aria-live="polite">
                <span className={selectedRequestCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Selected {selectedRequestCount}
                </span>
                <span className={requestResolutionNoteValid ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill staff-batch-readiness__pill--warn"}>
                  Note {requestResolutionNoteProgress}/12
                </span>
                <span className={requestBatchPreviews.approve.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Approve {requestBatchPreviews.approve.eligibleCount}
                </span>
                <span className={requestBatchPreviews.waitlist.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Waitlist {requestBatchPreviews.waitlist.eligibleCount}
                </span>
                <span className={requestBatchPreviews.reject.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Reject {requestBatchPreviews.reject.eligibleCount}
                </span>
                <span className={requestBatchPreviews["manual-close"].eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Close {requestBatchPreviews["manual-close"].eligibleCount}
                </span>
              </div>
              {selectedRequestCount ? (
                <div className="staff-impact-grid staff-impact-grid--compact" aria-live="polite">
                  <div className="staff-decision-card staff-decision-card--info">
                    <span className="staff-decision-card__label">Batch selection</span>
                    <strong>{formatRequestCount(selectedRequestCount)} batch selected</strong>
                    <p>
                      {requestBatchPreviews.approve.reviewCount} faculty review, {requestBatchPreviews.approve.lotteryCount} lottery pool,
                      and {formatRequestCount(requestBatchPreviews.approve.waitlistCount)} in waitlist handling.
                    </p>
                  </div>
                  <div className="staff-decision-card staff-decision-card--success">
                    <span className="staff-decision-card__label">Review eligible</span>
                    <strong>{requestBatchPreviews.approve.eligibleCount} approval-ready</strong>
                    <p>Lottery records are excluded from ordinary approval.</p>
                  </div>
                  <div className={requestBatchPreviews.approve.skippedCount ? "staff-decision-card staff-decision-card--warn" : "staff-decision-card staff-decision-card--neutral"}>
                    <span className="staff-decision-card__label">Policy skipped</span>
                    <strong>{formatRequestCount(requestBatchPreviews.approve.skippedCount)}</strong>
                    <p>
                      {requestBatchPreviews.approve.skippedCount
                        ? "Inactive, lottery, or routine FCFS records are protected from this batch action."
                        : "Every selected request is eligible for approval."}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-requests">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Request</th>
                      <th>Student</th>
                      <th>Offering</th>
                      <th>Submitted</th>
                      <th>Workflow</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.length ? (
                      visibleRequests.map((request) => {
                        const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));

                        return (
                        <tr
                          key={request.id}
                          className={getSelectableRowClass(request.id === selectedRequestId, "viewing")}
                          onClick={() => setSelectedRequestId(request.id)}
                          onKeyDown={(event) => handleSelectableRowKeyDown(event, () => setSelectedRequestId(request.id))}
                          tabIndex={0}
                          aria-current={request.id === selectedRequestId ? "true" : undefined}
                          aria-selected={selectedRequestIdSet.has(request.id)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRequestIdSet.has(request.id)}
                              onChange={() => toggleRequestSelection(request.id)}
                              aria-label={`Batch select ${request.id}`}
                            />
                          </td>
                          <td>
                            <span className="staff-mono-cell" title={request.id}>{formatRequestListId(request.id)}</span>
                          </td>
                          <td>
                            <div className="staff-student-cell">
                              <strong>{request.student?.name ?? request.studentId}</strong>
                              <span>
                                {request.studentId} · {formatProgrammeShortName(request.student?.programme)}
                              </span>
                            </div>
                          </td>
                          <td>{request.offeringId}</td>
                          <td>{formatStaffDateTime(request.submittedAt)}</td>
                          <td>
                            <div className={`staff-workflow-pill staff-workflow-pill--${workflow.mode}`}>
                              <strong>{workflow.label}</strong>
                              {!request.active ? <span>Closed</span> : null}
                            </div>
                          </td>
                          <td>{formatRequestStatusLabel(request.status)}</td>
                          <td>
                            <span className="staff-message-cell" title={request.message ?? ""}>{request.message ?? "—"}</span>
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8}>No requests match the current filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel staff-panel--request-detail">
              <h3>Request Resolution</h3>
              {selectedRequest ? (
                <div className="staff-form-grid">
                  {selectedRequestCount > 0 && !selectedRequestIdSet.has(selectedRequest.id) ? (
                    <div className="staff-detail-batch-note" role="status">
                      Open in detail only; batch actions will not include this request.
                    </div>
                  ) : null}
                  <div className="staff-form-row staff-form-row--stacked">
                    <div className="staff-form-label-row">
                      <label>{allowedRequestActions.length ? "Resolution Note" : "Batch / audit note"}</label>
                      <span
                        className={
                          requestResolutionNoteValid
                            ? "staff-note-counter staff-note-counter--ready"
                            : "staff-note-counter staff-note-counter--warn"
                        }
                      >
                        Note {requestResolutionNoteProgress}/12
                      </span>
                    </div>
                    <textarea
                      className="staff-note-input"
                      value={requestResolutionNote}
                      onChange={(event) => setRequestResolutionNote(event.target.value)}
                      placeholder="Record the office reason and student-facing consequence before resolving."
                    />
                    <p className="staff-inline-note">Required for actions · saved to audit log</p>
                  </div>
                  {allowedRequestActions.length ? (
                    <>
                      <div className="staff-form-row">
                        <label>Preview action</label>
                        <select value={requestPreviewAction} onChange={(event) => setRequestPreviewAction(event.target.value)}>
                          {RESOLUTION_ACTION_OPTIONS
                            .filter(([value]) => allowedRequestActions.includes(value))
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="staff-form-row staff-form-row--stacked">
                        <label>Resolution impact preview</label>
                        {requestPreviewBusy ? (
                          <p className="staff-inline-note">Checking how this resolution would change the request and shared offering…</p>
                        ) : requestPreviewImpact?.error ? (
                          <div className="staff-decision-card staff-decision-card--error">
                            <strong>{requestPreviewImpact.error.headline}</strong>
                            <p>{requestPreviewImpact.error.detail}</p>
                          </div>
                        ) : requestPreviewImpact?.summary ? (
                          <div className="staff-impact-grid">
                            <div className="staff-decision-card staff-decision-card--info">
                              <span className="staff-decision-card__label">Student outcome</span>
                              <strong>
                                {formatRequestStatusLabel(requestPreviewImpact.summary.statusBefore)} →{" "}
                                {formatRequestStatusLabel(requestPreviewImpact.summary.statusAfter)}
                              </strong>
                              <p>
                                {requestPreviewImpact.summary.activeAfter
                                  ? "The request remains active after this action."
                                  : "The request closes, the note becomes the student-facing message, and an audit event is written."}
                              </p>
                            </div>
                            <div className="staff-decision-card staff-decision-card--warn">
                              <span className="staff-decision-card__label">Supply impact</span>
                              <strong>
                                Seats {requestPreviewImpact.summary.seatsTakenDelta >= 0 ? "+" : ""}
                                {requestPreviewImpact.summary.seatsTakenDelta}, waitlist {requestPreviewImpact.summary.waitlistDelta >= 0 ? "+" : ""}
                                {requestPreviewImpact.summary.waitlistDelta}
                              </strong>
                              <p>Shared offering counts after this resolution.</p>
                            </div>
                            <div className={`staff-decision-card ${requestPreviewImpact.summary.enrollmentCreated ? "staff-decision-card--success" : "staff-decision-card--neutral"}`}>
                              <span className="staff-decision-card__label">Enrolment</span>
                              <strong>{requestPreviewImpact.summary.enrollmentCreated ? "Enrolment will be created" : "No new enrolment"}</strong>
                              <p>{requestPreviewImpact.summary.enrollmentCreated ? "The student receives an approved enrolment record." : "No seat is awarded by this action."}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="staff-inline-note">Choose an allowed action to inspect its impact before resolving the request.</p>
                        )}
                      </div>
                      <div
                        className={
                          requestResolutionDisabled
                            ? "staff-action-lock staff-action-lock--warn"
                            : "staff-action-lock staff-action-lock--ready"
                        }
                        role="status"
                      >
                        {requestResolutionLockLabel}
                      </div>
                      <div className="staff-inline-actions">
                        {RESOLUTION_ACTION_OPTIONS
                          .filter(([value]) => allowedRequestActions.includes(value))
                          .map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={value === "approve" ? "mini-button mini-button--primary" : value === "reject" || value === "manual-close" ? "mini-button mini-button--danger" : "mini-button"}
                              onClick={() => handleConfirmResolveRequest(value)}
                              title={requestResolutionLockLabel}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    </>
                  ) : (
                    <div className="staff-decision-card staff-decision-card--warn">
                      <span className="staff-decision-card__label">Ordinary resolution locked</span>
                      <strong>No manual action is available here</strong>
                      <p>{selectedRequestWorkflow.warning || "This workflow must be completed outside the ordinary request resolution queue."}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p>Select a request to resolve it.</p>
              )}
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "overrides" ? (
          <div className="staff-grid staff-grid--overrides">
            <section className="page-panel staff-override-create staff-panel--override-create">
              <h3>Create Override</h3>
              <div className="staff-override-scope" aria-label="Override scope">
                <div className={overrideForm.studentId.trim() ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Student</span>
                  <strong>{overrideForm.studentId.trim() || "—"}</strong>
                </div>
                <div className={overrideForm.offeringId ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Offering</span>
                  <strong>{overrideForm.offeringId || (overrideOfferingCandidatesBusy ? "Checking…" : "—")}</strong>
                </div>
                <div className={overrideForm.constraintTypes.length ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Constraints</span>
                  <strong>{overrideForm.constraintTypes.length || "—"}</strong>
                </div>
              </div>
              <div className="staff-form-grid staff-form-grid--override">
                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Scope</div>
                  <div className="staff-form-row">
                    <label>Student ID</label>
                    <input
                      value={overrideForm.studentId}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, studentId: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Blocked offering</label>
                    <select
                      value={overrideForm.offeringId}
                      disabled={overrideOfferingSelectDisabled}
                      onChange={(event) => selectOverrideOffering(event.target.value)}
                    >
                      <option value="">{overrideOfferingSelectLabel}</option>
                      {overrideOfferingCandidates.map((candidate) => {
                        const constraintLabels = OVERRIDE_OPTIONS.filter((option) =>
                          candidate.suggestedConstraintIds.includes(option.id),
                        ).map((option) => option.label);

                        return (
                          <option key={candidate.offering.id} value={candidate.offering.id}>
                            {constraintLabels.length
                              ? `${candidate.offering.id} · ${constraintLabels.join(", ")}`
                              : candidate.offering.id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Constraint Resolution</div>
                  <div className="override-chip-grid" role="group" aria-label="Constraint types to bypass">
                    {OVERRIDE_OPTIONS.map((option) => {
                      const active = overrideForm.constraintTypes.includes(option.id);
                      const suggested = suggestedOverrideConstraintIds.includes(option.id);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={[
                            "override-chip",
                            active ? "override-chip--active" : "",
                            suggested ? "override-chip--suggested" : "",
                          ].filter(Boolean).join(" ")}
                          aria-pressed={active}
                          onClick={() => toggleOverrideConstraint(option.id)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Preview</div>
                  {overridePreviewBusy ? (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">…</div>
                    </div>
                  ) : overrideImpact?.error ? (
                    <div className="staff-decision-preview">
                      <div className="staff-decision-card staff-decision-card--error">
                        <span className="staff-decision-card__label">Error</span>
                        <strong>{overrideImpact.error.headline}</strong>
                        <p>{overrideImpact.error.detail}</p>
                      </div>
                    </div>
                  ) : overrideImpact ? (
                    <div className="staff-decision-preview staff-decision-preview--flow">
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.currentDecision)}`}>
                        <span className="staff-decision-card__label">Current</span>
                        <strong>{overrideImpact.currentDecision.headline}</strong>
                        {overrideImpact.currentDecision.reasons?.length ? <p>{overrideImpact.currentDecision.reasons[0]}</p> : null}
                      </div>
                      <div className="staff-preview-arrow" aria-hidden="true">→</div>
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.overrideDecision)}`}>
                        <span className="staff-decision-card__label">Override</span>
                        <strong>{overrideImpact.overrideDecision.headline}</strong>
                        {overrideImpact.overrideDecision.reasons?.length ? <p>{overrideImpact.overrideDecision.reasons[0]}</p> : null}
                      </div>
                      <div className={hasOverrideImpactChange(overrideImpact) ? "staff-impact-status staff-impact-status--good" : "staff-impact-status staff-impact-status--warn"}>
                        {hasOverrideImpactChange(overrideImpact) ? buildOverrideImpactNote(overrideImpact) : "No decision change"}
                      </div>
                    </div>
                  ) : overrideCurrentDecisionBusy ? (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">…</div>
                    </div>
                  ) : overrideCurrentDecision?.error ? (
                    <div className="staff-decision-preview">
                      <div className="staff-decision-card staff-decision-card--error">
                        <span className="staff-decision-card__label">Current</span>
                        <strong>{overrideCurrentDecision.error.headline}</strong>
                        <p>{overrideCurrentDecision.error.detail}</p>
                      </div>
                    </div>
                  ) : overrideCurrentDecisionForDisplay ? (
                    <div className="staff-decision-preview">
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideCurrentDecisionForDisplay)}`}>
                        <span className="staff-decision-card__label">
                          {overrideCurrentDecisionForDisplay.ok ? "Current decision" : "Current blocker"}
                        </span>
                        <strong>{overrideCurrentDecisionForDisplay.headline}</strong>
                        {overrideCurrentDecisionForDisplay.reasons?.length ? <p>{overrideCurrentDecisionForDisplay.reasons[0]}</p> : null}
                      </div>
                      {suggestedOverrideConstraintIds.length ? (
                        <div className="staff-impact-status staff-impact-status--info">
                          Rule: {OVERRIDE_OPTIONS.filter((option) => suggestedOverrideConstraintIds.includes(option.id)).map((option) => option.label).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">—</div>
                    </div>
                  )}
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Action</div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Note</label>
                    <textarea
                      className="staff-note-input"
                      value={overrideForm.note}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, note: event.target.value }))}
                    />
                  </div>
                  <div className="staff-inline-actions staff-inline-actions--split">
                    <button
                      type="button"
                      className="mini-button mini-button--primary"
                      onClick={handleCreateOverride}
                      disabled={overrideCreateDisabled}
                    >
                      Create Override
                    </button>
                    {!overrideValidation.valid ? <span className="staff-action-status">Missing: {overrideValidation.detail.replace("Required before creating: ", "").replace(".", "")}</span> : null}
                    {overrideValidation.valid && overridePreviewBusy ? <span className="staff-action-status">Checking impact</span> : null}
                    {overrideValidation.valid && overrideImpact?.error ? <span className="staff-action-status">Preview unavailable</span> : null}
                    {overrideValidation.valid && overrideHasNoDecisionChange ? <span className="staff-action-status">No decision change</span> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="page-panel staff-override-manage staff-panel--override-manage">
              <h3>Overrides</h3>
              <div className="staff-table-controls">
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={overrideSearch} onChange={(event) => setOverrideSearch(event.target.value)} />
                </label>
                <label className="staff-toolbar__field">
                  <span>Status</span>
                  <select value={overrideActiveFilter} onChange={(event) => setOverrideActiveFilter(event.target.value)}>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-overrides">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Student</th>
                      <th>Offering</th>
                      <th>Constraint Types</th>
                      <th>Created By</th>
                      <th>Active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOverrides.length ? (
                      visibleOverrides.map((override) => (
                        <tr
                          key={override.id}
                          className={getSelectableRowClass(override.id === selectedOverrideId)}
                          onClick={() => setSelectedOverrideId(override.id)}
                          onKeyDown={(event) => handleSelectableRowKeyDown(event, () => setSelectedOverrideId(override.id))}
                          tabIndex={0}
                          aria-selected={override.id === selectedOverrideId}
                        >
                          <td>
                            <span className="staff-mono-cell" title={override.id}>{formatCompactId(override.id)}</span>
                          </td>
                          <td>{override.studentId}</td>
                          <td>{override.offeringId}</td>
                          <td>
                            <div className="staff-chip-list">
                              {(override.constraintTypes ?? []).map((constraintType) => {
                                const option = OVERRIDE_OPTIONS.find((item) => item.id === constraintType);
                                return (
                                  <span key={constraintType} className="staff-chip">
                                    {option?.label ?? constraintType}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <span className="staff-mono-cell" title={override.createdBy ?? ""}>{override.createdBy}</span>
                          </td>
                          <td>{override.active ? "Yes" : "No"}</td>
                          <td>
                            {override.active ? (
                              <button
                                type="button"
                                className="mini-button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: `Deactivate ${override.id}?`,
                                    detail: "This will remove the targeted constraint override for the selected student and offering.",
                                    onConfirm: () => handleDeleteOverride(override.id),
                                  })
                                }
                              >
                                Remove
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>No overrides match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="staff-detail-panel">
                <h4>Detail</h4>
                {selectedOverride ? (
                  <div className="staff-form-grid staff-form-grid--compact">
                    <div className="staff-selection-banner">
                      <div className="staff-selection-banner__eyebrow">Override</div>
                      <div className="staff-selection-banner__main">
                        <strong title={selectedOverride.id}>{formatCompactId(selectedOverride.id)}</strong>
                        <span>{selectedOverride.offeringId}</span>
                      </div>
                      <div className="staff-selection-banner__note">
                        {selectedOverride.studentId} · {selectedOverride.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="staff-context-grid">
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Student</span>
                        <strong className="staff-context-card__value">{selectedOverride.studentId}</strong>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Offering</span>
                        <strong className="staff-context-card__value">{selectedOverride.offeringId}</strong>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Created by</span>
                        <strong className="staff-context-card__value">{selectedOverride.createdBy ?? "Unknown actor"}</strong>
                        <div className="staff-context-list">
                          <span>{formatStaffDateTime(selectedOverride.createdAt)}</span>
                        </div>
                      </div>
                      <div className="staff-context-card staff-context-card--constraint">
                        <span className="staff-context-card__label">Constraint resolved</span>
                        <div className="staff-chip-list staff-chip-list--primary">
                          {(selectedOverride.constraintTypes ?? []).map((constraintType) => {
                            const option = OVERRIDE_OPTIONS.find((item) => item.id === constraintType);
                            return (
                              <span key={constraintType} className="staff-chip">
                                {option?.label ?? constraintType}
                              </span>
                            );
                          })}
                        </div>
                        <span className="staff-context-card__meta">
                          {selectedOverride.constraintTypes?.length ?? 0} selected
                        </span>
                      </div>
                      {selectedOverride.note ? (
                        <div className="staff-context-card staff-context-card--note">
                          <span className="staff-context-card__label">Office note</span>
                          <span className="staff-context-note">{selectedOverride.note}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="staff-preview-placeholder">—</div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "audit" ? (
          <div className="staff-grid staff-grid--audit">
            <div className="page-stack staff-audit-column">
              <section className="page-panel staff-panel--audit-filters">
                <h3>Audit Trail Filters</h3>
                <div className="staff-summary-bar">
                  <span>{auditSummary.total} total</span>
                  <span>{auditSummary.visible} visible</span>
                  <span>{auditSummary.staff} staff</span>
                  <span>{auditSummary.student} student</span>
                  <span>{auditSummary.overrides} override events</span>
                </div>
                <div className="staff-inline-actions staff-inline-actions--quick-filters">
                  <button
                    type="button"
                    className={auditActionFilter === "request-resolved" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("request-resolved")}
                  >
                    Request resolved
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "offering-updated" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("offering-updated")}
                  >
                    Offering updated
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "override-created" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("override-created")}
                  >
                    Override created
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "override-deactivated" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("override-deactivated")}
                  >
                    Override removed
                  </button>
                  <button
                    type="button"
                    className={auditFiltersActive ? "mini-button" : "mini-button mini-button--active"}
                    onClick={clearAuditFilters}
                  >
                    Clear all
                  </button>
                </div>
                <div className="staff-table-controls">
                  <label className="staff-toolbar__field staff-toolbar__field--wide">
                    <span>Search all</span>
                    <input value={auditSearchFilter} onChange={(event) => setAuditSearchFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Actor Type</span>
                    <select value={auditActorFilter} onChange={(event) => setAuditActorFilter(event.target.value)}>
                      <option value="all">All</option>
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="system">System</option>
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Action</span>
                    <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                      <option value="">All</option>
                      {auditActionOptions.map((action) => (
                        <option key={action} value={action}>
                          {formatAuditActionLabel(action)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Actor ID</span>
                    <input value={auditActorIdFilter} onChange={(event) => setAuditActorIdFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Target Type</span>
                    <select value={auditTargetTypeFilter} onChange={(event) => setAuditTargetTypeFilter(event.target.value)}>
                      <option value="all">All</option>
                      {auditTargetTypeOptions.map((targetType) => (
                        <option key={targetType} value={targetType}>
                          {targetType === "constraintOverride" ? "Override" : targetType === "request" ? "Request" : targetType === "offering" ? "Offering" : targetType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Target / Student</span>
                    <input value={auditTargetFilter} onChange={(event) => setAuditTargetFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Sort by</span>
                    <select value={auditSortKey} onChange={(event) => setAuditSortKey(event.target.value)}>
                      {AUDIT_SORT_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Direction</span>
                    <select value={auditSortDirection} onChange={(event) => setAuditSortDirection(event.target.value)}>
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </label>
                </div>
              </section>
              <section className="page-panel staff-panel--audit-list">
                <h3>Audit Trail · {auditSortLabel} {auditSortDirection === "asc" ? "ascending" : "descending"}</h3>
                <div className="table-wrap">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>{renderAuditColumnHeader("timestamp", "Timestamp")}</th>
                        <th>{renderAuditColumnHeader("actor", "Actor")}</th>
                        <th>{renderAuditColumnHeader("action", "Action")}</th>
                        <th>{renderAuditColumnHeader("target", "Target")}</th>
                        <th>{renderAuditColumnHeader("summary", "Summary")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAuditEvents.length ? (
                        visibleAuditEvents.map((event) => (
                          <tr
                            key={event.id}
                            className={getSelectableRowClass(event.id === selectedAuditId)}
                            onClick={() => setSelectedAuditId(event.id)}
                            onKeyDown={(keyboardEvent) => handleSelectableRowKeyDown(keyboardEvent, () => setSelectedAuditId(event.id))}
                            tabIndex={0}
                            aria-selected={event.id === selectedAuditId}
                          >
                            <td>{formatStaffDateTime(event.timestamp)}</td>
                            <td>{formatAuditActorLabel(event)}</td>
                            <td>{formatAuditActionLabel(event.action)}</td>
                            <td>
                              <div className="staff-audit-cell staff-audit-cell--target">
                                <strong>{formatAuditTargetLabel(event)}</strong>
                                {event.subjectStudentId ? <span>Student {event.subjectStudentId}</span> : null}
                              </div>
                            </td>
                            <td>
                              <div className="staff-audit-cell">
                                <strong>{buildAuditEventSummary(event)}</strong>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No audit events match the current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <section className="page-panel staff-panel--audit-detail">
              <h3>Audit Event Detail</h3>
              {selectedAuditEvent ? (
                <div className="staff-form-grid">
                  <div className="staff-selection-banner">
                    <div className="staff-selection-banner__eyebrow">Selected audit event</div>
                    <div className="staff-selection-banner__main">
                      <strong>{formatAuditActionLabel(selectedAuditEvent.action)}</strong>
                      <span>{formatAuditTargetLabel(selectedAuditEvent)}</span>
                    </div>
                    <div className="staff-selection-banner__note">{buildAuditEventSummary(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Event ID</label>
                    <div>
                      <span className="staff-mono-cell staff-audit-event-id" title={selectedAuditEvent.id}>
                        {formatCompactId(selectedAuditEvent.id)}
                      </span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Timestamp</label>
                    <div>{formatStaffDateTime(selectedAuditEvent.timestamp)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Actor</label>
                    <div>{formatAuditActorLabel(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Action</label>
                    <div>{formatAuditActionLabel(selectedAuditEvent.action)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Target</label>
                    <div>{formatAuditTargetLabel(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Student</label>
                    <div>{selectedAuditEvent.subjectStudentId ?? "—"}</div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>State change</label>
                    <div className="staff-audit-summary-card">
                      <strong>{buildAuditEventChange(selectedAuditEvent)}</strong>
                    </div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Before</label>
                    {selectedAuditBeforeRows.length ? (
                      <div className="staff-audit-detail-list">
                        {selectedAuditBeforeRows.map((row) => (
                          <div className="staff-audit-detail-list__row" key={`before-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="staff-audit-empty">No previous value was recorded for this event.</div>
                    )}
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>After</label>
                    {selectedAuditAfterRows.length ? (
                      <div className="staff-audit-detail-list">
                        {selectedAuditAfterRows.map((row) => (
                          <div className="staff-audit-detail-list__row" key={`after-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="staff-audit-empty">No updated value was recorded for this event.</div>
                    )}
                  </div>
                </div>
              ) : (
                <p>Select an audit event to inspect its full before/after payload.</p>
              )}
            </section>
          </div>
        ) : null}
      </main>

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.title}
          detail={confirmAction.detail}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            const action = confirmAction.onConfirm;
            setConfirmAction(null);
            await action();
          }}
        />
      ) : null}
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import {
  createAdminCourse,
  createAdminOffering,
  createAdminOverride,
  fetchAdminCourses,
  DEFAULT_STAFF_ACTOR_ID,
  deleteAdminOverride,
  fetchAdminAudit,
  fetchAdminOfferings,
  fetchAdminOverrides,
  fetchAdminRequests,
  previewAdminOfferingImpact,
  previewAdminRequestResolution,
  previewAdminOverrideImpact,
  previewDecision,
  resetDemo,
  resolveAdminRequest,
  updateAdminOffering,
} from "../api";
import { Banner, ConfirmDialog, ToastNotice } from "../components/PortalFeedback";
import {
  buildBatchResolveDetail,
  buildDefaultCourseForm,
  buildDefaultOverrideForm,
  buildDefaultOfferingCreateForm,
  buildAuditEventChange,
  buildAuditEventSummary,
  buildAuditPayloadRows,
  buildOfferingForm,
  buildOfferingPreviewDetail,
  buildOverrideImpactNote,
  buildRequestPreviewDetail,
  formatCompactId,
  formatDecisionTone,
  formatProgrammeShortName,
  formatAuditActionLabel,
  formatAuditActorLabel,
  formatAuditTargetLabel,
  formatPolicyLabel,
  formatRequestListId,
  formatRequestStatusLabel,
  formatResolutionActionLabel,
  formatSeatCount,
  formatStaffDateTime,
  formatSeatOccupantTimestamp,
  formatStaffTimestamp,
  formatWindow,
  getSuggestedOverrideConstraintIds,
  getRequestWorkflow,
  hasOverrideImpactChange,
  includesText,
  isResolutionActionAllowed,
  matchesOfferingWindow,
  normalizeCodeList,
  OVERRIDE_OPTIONS,
  parseNonNegativeInteger,
  RESOLUTION_ACTION_OPTIONS,
  STAFF_DAY_OPTIONS,
  STAFF_FACULTY_OPTIONS,
  STAFF_LIST_TYPE_OPTIONS,
  STAFF_POLICY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  STAFF_TABS,
  normalizeCourseCode,
  normalizeSubclass,
  toErrorHeadline,
  toFriendlyError,
} from "../staffConsoleModel";

const STAFF_MONTH_OPTIONS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "May"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Aug"],
  ["09", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];

const STAFF_DATE_YEARS = ["2025", "2026", "2027"];

const RESOLUTION_PAST_TENSE = {
  approve: "approved",
  waitlist: "waitlisted",
  reject: "rejected",
  "manual-close": "closed without outcome",
};

const AUDIT_SORT_OPTIONS = [
  ["timestamp", "Timestamp"],
  ["actor", "Actor"],
  ["action", "Action"],
  ["target", "Target"],
  ["summary", "Summary"],
];

function formatRequestCount(count) {
  return count === 1 ? "1 request" : `${count} requests`;
}

function formatResolutionPastTense(action) {
  return RESOLUTION_PAST_TENSE[action] ?? formatResolutionActionLabel(action).toLowerCase();
}

function getAuditTimestampValue(event) {
  const parsed = Date.parse(String(event.timestamp ?? "").replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getAuditSearchText(event) {
  return [
    event.id,
    event.actorType,
    event.actorId,
    event.action,
    formatAuditActionLabel(event.action),
    event.targetType,
    event.targetId,
    event.subjectStudentId,
    formatAuditActorLabel(event),
    formatAuditTargetLabel(event),
    buildAuditEventSummary(event),
    buildAuditEventChange(event),
  ]
    .filter(Boolean)
    .join(" ");
}

function getAuditSortValue(event, sortKey) {
  if (sortKey === "timestamp") {
    return getAuditTimestampValue(event);
  }

  if (sortKey === "actor") {
    return formatAuditActorLabel(event);
  }

  if (sortKey === "action") {
    return formatAuditActionLabel(event.action);
  }

  if (sortKey === "target") {
    return formatAuditTargetLabel(event);
  }

  return buildAuditEventSummary(event);
}

function compareAuditEvents(left, right, sortKey, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const leftValue = getAuditSortValue(left, sortKey);
  const rightValue = getAuditSortValue(right, sortKey);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * direction;
  }

  const result = String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (result !== 0) {
    return result * direction;
  }

  return (getAuditTimestampValue(left) - getAuditTimestampValue(right)) * -1;
}

function isAuditColumnControlActive(columnId, controls) {
  if (controls.auditSortKey === columnId) {
    return true;
  }

  if (columnId === "actor") {
    return controls.auditActorFilter !== "all" || Boolean(controls.auditActorIdFilter.trim());
  }

  if (columnId === "action") {
    return Boolean(controls.auditActionFilter);
  }

  if (columnId === "target") {
    return controls.auditTargetTypeFilter !== "all" || Boolean(controls.auditTargetFilter.trim());
  }

  if (columnId === "summary") {
    return Boolean(controls.auditSearchFilter.trim());
  }

  return false;
}

function AuditColumnHeaderControl({
  label,
  columnId,
  controls,
  menuOpen,
  onToggleMenu,
  onClose,
  onReset,
  onChange,
  menuAlign = "right",
  actionOptions,
  targetTypeOptions,
}) {
  const active = isAuditColumnControlActive(columnId, controls);
  const sorted = controls.auditSortKey === columnId;

  function renderColumnFields() {
    if (columnId === "actor") {
      return (
        <>
          <label className="column-menu__field">
            <span>Actor type</span>
            <select value={controls.auditActorFilter} onChange={(event) => onChange("auditActorFilter", event.target.value)}>
              <option value="all">All</option>
              <option value="student">Student</option>
              <option value="staff">Staff</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="column-menu__field">
            <span>Actor ID</span>
            <input value={controls.auditActorIdFilter} onChange={(event) => onChange("auditActorIdFilter", event.target.value)} />
          </label>
        </>
      );
    }

    if (columnId === "action") {
      return (
        <label className="column-menu__field">
          <span>Action</span>
          <select value={controls.auditActionFilter} onChange={(event) => onChange("auditActionFilter", event.target.value)}>
            <option value="">All</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {formatAuditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (columnId === "target") {
      return (
        <>
          <label className="column-menu__field">
            <span>Target type</span>
            <select value={controls.auditTargetTypeFilter} onChange={(event) => onChange("auditTargetTypeFilter", event.target.value)}>
              <option value="all">All</option>
              {targetTypeOptions.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {targetType === "constraintOverride" ? "Override" : targetType === "request" ? "Request" : targetType === "offering" ? "Offering" : targetType}
                </option>
              ))}
            </select>
          </label>
          <label className="column-menu__field">
            <span>Target / student</span>
            <input value={controls.auditTargetFilter} onChange={(event) => onChange("auditTargetFilter", event.target.value)} />
          </label>
        </>
      );
    }

    if (columnId === "summary") {
      return (
        <label className="column-menu__field">
          <span>Search summary</span>
          <input value={controls.auditSearchFilter} onChange={(event) => onChange("auditSearchFilter", event.target.value)} />
        </label>
      );
    }

    return null;
  }

  return (
    <div className="column-control">
      <div className="column-control__label-row">
        <span>{label}</span>
        <button
          type="button"
          className={active ? "column-control__button column-control__button--active" : "column-control__button"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          aria-expanded={menuOpen}
          aria-label={`${label} sort and filter`}
        >
          ▾
        </button>
      </div>
      {menuOpen ? (
        <div
          className={menuAlign === "left" ? "column-menu column-menu--align-left" : "column-menu"}
          onClick={(event) => event.stopPropagation()}
        >
          <label className="column-menu__field">
            <span>Sort</span>
            <select
              value={sorted ? controls.auditSortDirection : "none"}
              onChange={(event) => {
                if (event.target.value === "none") {
                  onChange("auditSortKey", "timestamp");
                  onChange("auditSortDirection", "desc");
                  return;
                }

                onChange("auditSortKey", columnId);
                onChange("auditSortDirection", event.target.value);
              }}
            >
              <option value="none">No sort</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          {renderColumnFields()}
          <div className="column-menu__actions">
            <button type="button" className="mini-button" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="mini-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readIsoDateParts(value) {
  const [year = "2026", month = "01", day = "31"] = String(value || "2026-01-31").split("-");
  return {
    year,
    month: month.padStart(2, "0"),
    day: day.padStart(2, "0"),
  };
}

function buildIsoDate(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function StaffDateField({ value, onChange, label }) {
  const parts = readIsoDateParts(value);

  function updatePart(key, nextValue) {
    onChange(buildIsoDate({ ...parts, [key]: nextValue }));
  }

  return (
    <div className="staff-date-field" aria-label={label}>
      <select value={parts.day} onChange={(event) => updatePart("day", event.target.value)} aria-label={`${label} day`}>
        {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => (
          <option key={day} value={day}>
            {Number.parseInt(day, 10)}
          </option>
        ))}
      </select>
      <select value={parts.month} onChange={(event) => updatePart("month", event.target.value)} aria-label={`${label} month`}>
        {STAFF_MONTH_OPTIONS.map(([monthValue, monthLabel]) => (
          <option key={monthValue} value={monthValue}>
            {monthLabel}
          </option>
        ))}
      </select>
      <select value={parts.year} onChange={(event) => updatePart("year", event.target.value)} aria-label={`${label} year`}>
        {STAFF_DATE_YEARS.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StaffAdminPage({ session, onStaffLogout, onReturnToPortal }) {
  const [activeTab, setActiveTab] = useState("offerings");
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [offeringSetupMode, setOfferingSetupMode] = useState("course");
  const [actorId, setActorId] = useState(session?.id ?? DEFAULT_STAFF_ACTOR_ID);
  const [courses, setCourses] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [courseForm, setCourseForm] = useState(buildDefaultCourseForm());
  const [offeringForm, setOfferingForm] = useState(null);
  const [offeringCreateForm, setOfferingCreateForm] = useState(buildDefaultOfferingCreateForm());
  const [overrideForm, setOverrideForm] = useState(buildDefaultOverrideForm());
  const [requestResolutionNote, setRequestResolutionNote] = useState("");
  const [offeringSearch, setOfferingSearch] = useState("");
  const [offeringPolicyFilter, setOfferingPolicyFilter] = useState("all");
  const [offeringWindowFilter, setOfferingWindowFilter] = useState("all");
  const [offeringAvailabilityFilter, setOfferingAvailabilityFilter] = useState("all");
  const [offeringSortKey, setOfferingSortKey] = useState("courseCode");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const [overrideSearch, setOverrideSearch] = useState("");
  const [overrideActiveFilter, setOverrideActiveFilter] = useState("active");
  const [selectedOverrideId, setSelectedOverrideId] = useState("");
  const [overrideCurrentDecision, setOverrideCurrentDecision] = useState(null);
  const [overrideCurrentDecisionBusy, setOverrideCurrentDecisionBusy] = useState(false);
  const [overrideOfferingCandidates, setOverrideOfferingCandidates] = useState([]);
  const [overrideOfferingCandidatesBusy, setOverrideOfferingCandidatesBusy] = useState(false);
  const [overrideImpact, setOverrideImpact] = useState(null);
  const [overridePreviewBusy, setOverridePreviewBusy] = useState(false);
  const [offeringImpact, setOfferingImpact] = useState(null);
  const [offeringImpactDetail, setOfferingImpactDetail] = useState("");
  const [offeringSeatSearch, setOfferingSeatSearch] = useState("");
  const [offeringSeatSortKey, setOfferingSeatSortKey] = useState("timeDesc");
  const [offeringPreviewBusy, setOfferingPreviewBusy] = useState(false);
  const [requestPreviewAction, setRequestPreviewAction] = useState("approve");
  const [requestPreviewImpact, setRequestPreviewImpact] = useState(null);
  const [requestPreviewBusy, setRequestPreviewBusy] = useState(false);
  const [auditSearchFilter, setAuditSearchFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("all");
  const [auditActorIdFilter, setAuditActorIdFilter] = useState("");
  const [auditTargetFilter, setAuditTargetFilter] = useState("");
  const [auditSortKey, setAuditSortKey] = useState("timestamp");
  const [auditSortDirection, setAuditSortDirection] = useState("desc");
  const [openAuditColumnMenu, setOpenAuditColumnMenu] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    if (session?.id && session.id !== actorId) {
      setActorId(session.id);
    }
  }, [actorId, session?.id]);

  async function loadAll(nextActorId = actorId, preferredSelections = {}) {
    const [nextCourses, nextOfferings, nextRequests, nextOverrides, nextAuditEvents] = await Promise.all([
      fetchAdminCourses(nextActorId),
      fetchAdminOfferings(nextActorId),
      fetchAdminRequests({}, nextActorId),
      fetchAdminOverrides({}, nextActorId),
      fetchAdminAudit({}, nextActorId),
    ]);

    setCourses(nextCourses);
    setOfferings(nextOfferings);
    setRequests(nextRequests);
    setOverrides(nextOverrides);
    setAuditEvents(nextAuditEvents);
    setLastLoadedAt(new Date().toISOString());

    const resolvedOffering =
      nextOfferings.find((item) => item.id === (preferredSelections.offeringId ?? selectedOfferingId)) ??
      nextOfferings[0] ??
      null;

    if (resolvedOffering) {
      setSelectedOfferingId(resolvedOffering.id);
      setOfferingForm(buildOfferingForm(resolvedOffering));
    } else {
      setSelectedOfferingId("");
      setOfferingForm(null);
    }

    const preferredRequests = activeOnly ? nextRequests.filter((item) => item.active) : nextRequests;
    const resolvedRequest =
      preferredRequests.find((item) => item.id === (preferredSelections.requestId ?? selectedRequestId)) ??
      preferredRequests[0] ??
      nextRequests[0] ??
      null;

    setSelectedRequestId(resolvedRequest?.id ?? "");
    return {
      courses: nextCourses,
      offerings: nextOfferings,
      requests: nextRequests,
      overrides: nextOverrides,
      auditEvents: nextAuditEvents,
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAll(actorId);
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            title: "Staff console failed to load.",
            detail: toFriendlyError(error),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOffering = offerings.find((item) => item.id === selectedOfferingId) ?? null;
  const visibleOfferings = useMemo(
    () =>
      offerings
        .filter((offering) => {
        if (offeringPolicyFilter !== "all" && offering.allocationPolicy !== offeringPolicyFilter) {
          return false;
        }

        if (!matchesOfferingWindow(offering, offeringWindowFilter)) {
          return false;
        }

        const availableSeats = offering.capacity - offering.seatsTaken;

        if (offeringAvailabilityFilter === "available" && availableSeats <= 0) {
          return false;
        }

        if (offeringAvailabilityFilter === "low-seat" && availableSeats > 3) {
          return false;
        }

        if (offeringAvailabilityFilter === "full" && availableSeats > 0) {
          return false;
        }

        if (offeringAvailabilityFilter === "waitlist" && offering.waitlistCount <= 0) {
          return false;
        }

        if (offeringSearch) {
          const haystack = [
            offering.courseCode,
            offering.id,
            offering.title,
            offering.faculty,
            offering.department,
            offering.allocationPolicy,
            offering.requestWindow?.closesOn,
            offering.dropWindow?.closesOn,
          ].join(" ");

          if (!includesText(haystack, offeringSearch)) {
            return false;
          }
        }

        return true;
      })
        .sort((left, right) => {
          if (offeringSortKey === "availableSeatsAsc") {
            return left.capacity - left.seatsTaken - (right.capacity - right.seatsTaken);
          }

          if (offeringSortKey === "availableSeatsDesc") {
            return right.capacity - right.seatsTaken - (left.capacity - left.seatsTaken);
          }

          if (offeringSortKey === "waitlistDesc") {
            return right.waitlistCount - left.waitlistCount;
          }

          if (offeringSortKey === "requestCloseAsc") {
            return String(left.requestWindow?.closesOn ?? "").localeCompare(String(right.requestWindow?.closesOn ?? ""));
          }

          if (offeringSortKey === "policy") {
            return formatPolicyLabel(left.allocationPolicy).localeCompare(formatPolicyLabel(right.allocationPolicy));
          }

          return `${left.courseCode} ${left.id}`.localeCompare(`${right.courseCode} ${right.id}`);
        }),
    [offeringAvailabilityFilter, offeringPolicyFilter, offeringSearch, offeringSortKey, offeringWindowFilter, offerings],
  );
  const offeringFiltersActive =
    Boolean(offeringSearch.trim()) ||
    offeringPolicyFilter !== "all" ||
    offeringWindowFilter !== "all" ||
    offeringAvailabilityFilter !== "all" ||
    offeringSortKey !== "courseCode";
  const selectedOfferingHiddenByFilters = Boolean(
    selectedOffering && !visibleOfferings.some((offering) => offering.id === selectedOffering.id),
  );
  const visibleRequests = useMemo(
    () =>
      requests.filter((item) => {
        if (activeOnly && !item.active) {
          return false;
        }

        if (requestStatusFilter !== "all" && item.status !== requestStatusFilter) {
          return false;
        }

        if (requestSearch) {
          const haystack = [item.id, item.studentId, item.offeringId, item.status, item.message].join(" ");
          if (!includesText(haystack, requestSearch)) {
            return false;
          }
        }

        return true;
      }),
    [activeOnly, requestSearch, requestStatusFilter, requests],
  );
  const selectedRequest = visibleRequests.find((item) => item.id === selectedRequestId) ?? null;
  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );
  const selectedRequestOffering = selectedRequest ? offeringById.get(selectedRequest.offeringId) ?? null : null;
  const selectedRequestWorkflow = useMemo(
    () => getRequestWorkflow(selectedRequest, selectedRequestOffering),
    [selectedRequest, selectedRequestOffering],
  );
  const allowedRequestActions = selectedRequestWorkflow.allowedActions;
  const requestResolutionNoteText = requestResolutionNote.trim();
  const requestResolutionNoteValid = requestResolutionNoteText.length >= 12;
  const requestResolutionNoteProgress = Math.min(requestResolutionNoteText.length, 12);
  const selectedRequestActionAllowed =
    Boolean(requestPreviewAction) && allowedRequestActions.includes(requestPreviewAction);
  const visibleSeatOccupants = useMemo(() => {
    const occupants = offeringImpact?.seatOccupants ?? [];
    const filtered = !offeringSeatSearch.trim()
      ? occupants
      : occupants.filter((occupant) =>
          includesText([occupant.studentId, occupant.enrolledAt, occupant.enrollmentId].join(" "), offeringSeatSearch),
        );

    return [...filtered].sort((left, right) => {
      if (offeringSeatSortKey === "studentAsc") {
        return String(left.studentId).localeCompare(String(right.studentId));
      }

      if (offeringSeatSortKey === "studentDesc") {
        return String(right.studentId).localeCompare(String(left.studentId));
      }

      if (offeringSeatSortKey === "timeAsc") {
        return String(left.enrolledAt ?? "").localeCompare(String(right.enrolledAt ?? ""));
      }

      return String(right.enrolledAt ?? "").localeCompare(String(left.enrolledAt ?? ""));
    });
  }, [offeringImpact?.seatOccupants, offeringSeatSearch, offeringSeatSortKey]);
  const selectedRequestIdSet = useMemo(() => new Set(selectedRequestIds), [selectedRequestIds]);
  const selectedVisibleRequests = useMemo(
    () => visibleRequests.filter((item) => selectedRequestIdSet.has(item.id)),
    [selectedRequestIdSet, visibleRequests],
  );
  const selectedActiveRequestCount = useMemo(
    () => selectedVisibleRequests.filter((request) => request.active).length,
    [selectedVisibleRequests],
  );
  const selectedRequestCount = selectedVisibleRequests.length;
  const offeringValidation = useMemo(() => {
    if (!selectedOffering || !offeringForm) {
      return { valid: false, detail: "Select an offering before editing its shared state." };
    }

    const capacity = parseNonNegativeInteger(offeringForm.capacity);

    if (capacity === null) {
      return { valid: false, detail: "Capacity must be a non-negative integer." };
    }

    if (selectedOffering && capacity < selectedOffering.seatsTaken) {
      return { valid: false, detail: "Capacity cannot be lower than the current seats taken count." };
    }

    if (!offeringForm.scheduleDay || !offeringForm.scheduleStart || !offeringForm.scheduleEnd) {
      return { valid: false, detail: "A teaching day, start time, and end time are required." };
    }

    return { valid: true, detail: "" };
  }, [offeringForm, selectedOffering]);
  const requestResolutionDisabled = !selectedRequest?.active || !selectedRequestActionAllowed || !requestResolutionNoteValid;
  const requestResolutionLockLabel = !selectedRequest?.active
    ? "Locked · inactive request"
    : !requestResolutionNoteValid
      ? `Locked · note ${requestResolutionNoteProgress}/12`
      : !selectedRequestActionAllowed
        ? "Locked · action not allowed"
        : `Ready · note ${requestResolutionNoteProgress}/12`;
  const visibleOverrides = useMemo(
    () =>
      overrides.filter((override) => {
        if (overrideActiveFilter === "active" && !override.active) {
          return false;
        }

        if (overrideActiveFilter === "inactive" && override.active) {
          return false;
        }

        if (overrideSearch) {
          const haystack = [
            override.id,
            override.studentId,
            override.offeringId,
            override.createdBy,
            ...(override.constraintTypes ?? []),
            override.note,
          ].join(" ");

          if (!includesText(haystack, overrideSearch)) {
            return false;
          }
        }

        return true;
      }),
    [overrideActiveFilter, overrideSearch, overrides],
  );
  const selectedOverride = visibleOverrides.find((item) => item.id === selectedOverrideId) ?? null;
  const overrideOfferingCandidateById = useMemo(
    () => new Map(overrideOfferingCandidates.map((candidate) => [candidate.offering.id, candidate])),
    [overrideOfferingCandidates],
  );
  const visibleAuditEvents = useMemo(
    () => {
      const filtered = auditEvents.filter((item) => {
        if (auditActorFilter !== "all" && item.actorType !== auditActorFilter) {
          return false;
        }

        if (auditTargetTypeFilter !== "all" && item.targetType !== auditTargetTypeFilter) {
          return false;
        }

        if (auditActionFilter && item.action !== auditActionFilter) {
          return false;
        }

        if (auditActorIdFilter && !includesText(item.actorId, auditActorIdFilter)) {
          return false;
        }

        if (auditTargetFilter) {
          const haystack = [item.targetType, item.targetId, item.subjectStudentId].join(" ");
          if (!includesText(haystack, auditTargetFilter)) {
            return false;
          }
        }

        if (auditSearchFilter && !includesText(getAuditSearchText(item), auditSearchFilter)) {
          return false;
        }

        return true;
      });

      return [...filtered].sort((left, right) => compareAuditEvents(left, right, auditSortKey, auditSortDirection));
    },
    [
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditEvents,
      auditSearchFilter,
      auditSortDirection,
      auditSortKey,
      auditTargetFilter,
      auditTargetTypeFilter,
    ],
  );
  const selectedAuditEvent = visibleAuditEvents.find((item) => item.id === selectedAuditId) ?? null;
  const selectedAuditBeforeRows = useMemo(
    () => buildAuditPayloadRows(selectedAuditEvent?.before),
    [selectedAuditEvent?.before],
  );
  const selectedAuditAfterRows = useMemo(
    () => buildAuditPayloadRows(selectedAuditEvent?.after),
    [selectedAuditEvent?.after],
  );
  const auditSummary = useMemo(
    () => ({
      total: auditEvents.length,
      visible: visibleAuditEvents.length,
      staff: auditEvents.filter((item) => item.actorType === "staff").length,
      student: auditEvents.filter((item) => item.actorType === "student").length,
      overrides: auditEvents.filter((item) => item.targetType === "constraintOverride").length,
    }),
    [auditEvents, visibleAuditEvents.length],
  );
  const auditActionOptions = useMemo(
    () => [...new Set(auditEvents.map((item) => item.action))].sort((left, right) => left.localeCompare(right)),
    [auditEvents],
  );
  const auditTargetTypeOptions = useMemo(
    () => [...new Set(auditEvents.map((item) => item.targetType))].sort((left, right) => left.localeCompare(right)),
    [auditEvents],
  );
  const auditControls = useMemo(
    () => ({
      auditSearchFilter,
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditTargetTypeFilter,
      auditTargetFilter,
      auditSortKey,
      auditSortDirection,
    }),
    [
      auditActionFilter,
      auditActorFilter,
      auditActorIdFilter,
      auditSearchFilter,
      auditSortDirection,
      auditSortKey,
      auditTargetFilter,
      auditTargetTypeFilter,
    ],
  );
  const auditSortLabel = AUDIT_SORT_OPTIONS.find(([value]) => value === auditSortKey)?.[1] ?? "Timestamp";
  const auditFiltersActive =
    Boolean(auditSearchFilter.trim()) ||
    Boolean(auditActionFilter) ||
    auditActorFilter !== "all" ||
    Boolean(auditActorIdFilter.trim()) ||
    auditTargetTypeFilter !== "all" ||
    Boolean(auditTargetFilter.trim()) ||
    auditSortKey !== "timestamp" ||
    auditSortDirection !== "desc";
  const courseCodeOptions = useMemo(
    () => [...courses].sort((left, right) => left.code.localeCompare(right.code)),
    [courses],
  );
  const pendingOfferingId = useMemo(() => {
    const courseCode = normalizeCourseCode(offeringCreateForm.courseCode);
    const subclass = normalizeSubclass(offeringCreateForm.subclass);
    const semester = Number.parseInt(offeringCreateForm.semester, 10);

    if (!courseCode || !subclass || !Number.isInteger(semester) || semester < 1) {
      return "";
    }

    return `${courseCode}-${subclass}-S${semester}`;
  }, [offeringCreateForm.courseCode, offeringCreateForm.semester, offeringCreateForm.subclass]);
  const courseValidation = useMemo(() => {
    const missingFields = [];
    const code = normalizeCourseCode(courseForm.code);
    if (!code) {
      missingFields.push("course code");
    }
    if (!courseForm.title.trim()) {
      missingFields.push("title");
    }
    if (!courseForm.faculty.trim()) {
      missingFields.push("faculty");
    }
    if (!courseForm.department.trim()) {
      missingFields.push("department");
    }

    if (missingFields.length) {
      return { valid: false, detail: `Required before creating: ${missingFields.join(", ")}.` };
    }

    const credits = parseNonNegativeInteger(courseForm.credits);
    if (credits === null) {
      return { valid: false, detail: "Credits must be a non-negative integer." };
    }

    if (courses.some((course) => course.code === code)) {
      return { valid: false, detail: `Course ${code} already exists.` };
    }

    return { valid: true, detail: "" };
  }, [courseForm.code, courseForm.credits, courseForm.department, courseForm.faculty, courseForm.title, courses]);
  const overrideValidation = useMemo(() => {
    const missingFields = [];

    if (!overrideForm.studentId.trim()) {
      missingFields.push("student ID");
    }
    if (!overrideForm.offeringId) {
      missingFields.push("offering");
    }
    if (!overrideForm.constraintTypes.length) {
      missingFields.push("constraint type");
    }

    if (missingFields.length) {
      return { valid: false, detail: `Required before creating: ${missingFields.join(", ")}.` };
    }

    return { valid: true, detail: "" };
  }, [overrideForm.constraintTypes.length, overrideForm.offeringId, overrideForm.studentId]);
  const overrideCurrentDecisionForDisplay = overrideImpact?.currentDecision ?? (overrideCurrentDecision?.error ? null : overrideCurrentDecision);
  const suggestedOverrideConstraintIds = useMemo(
    () => getSuggestedOverrideConstraintIds(overrideCurrentDecisionForDisplay),
    [overrideCurrentDecisionForDisplay],
  );
  const overrideOfferingSelectDisabled =
    !overrideForm.studentId.trim() || overrideOfferingCandidatesBusy || !overrideOfferingCandidates.length;
  const overrideOfferingSelectLabel = overrideOfferingCandidatesBusy
    ? "Checking current blockers"
    : overrideOfferingCandidates.length
      ? "Select a blocked offering"
      : overrideForm.studentId.trim()
        ? "No current blockers"
        : "Enter a student first";
  const overrideHasNoDecisionChange = Boolean(
    overrideImpact?.currentDecision &&
      overrideImpact?.overrideDecision &&
      !hasOverrideImpactChange(overrideImpact),
  );
  const overrideCreateDisabled = Boolean(
    !overrideValidation.valid ||
      busyKey === "override:create" ||
      overridePreviewBusy ||
      overrideImpact?.error ||
      overrideHasNoDecisionChange,
  );
  const offeringCreateValidation = useMemo(() => {
    const courseCode = normalizeCourseCode(offeringCreateForm.courseCode);
    const capacity = parseNonNegativeInteger(offeringCreateForm.capacity);
    const prerequisites = normalizeCodeList(offeringCreateForm.prerequisites);
    const corequisites = normalizeCodeList(offeringCreateForm.corequisites);
    const knownCourseCodes = new Set(courseCodeOptions.map((course) => course.code));
    const offeredCourseCodes = new Set(offerings.map((offering) => offering.courseCode));

    if (!courseCode || !courses.some((course) => course.code === courseCode)) {
      return { valid: false, detail: "Choose an existing course before creating an offering." };
    }

    if (!normalizeSubclass(offeringCreateForm.subclass)) {
      return { valid: false, detail: "Subclass is required." };
    }

    if (!Number.isInteger(Number.parseInt(offeringCreateForm.semester, 10)) || Number.parseInt(offeringCreateForm.semester, 10) < 1) {
      return { valid: false, detail: "Semester must be a positive integer." };
    }

    if (capacity === null) {
      return { valid: false, detail: "Capacity must be a non-negative integer." };
    }

    if (!offeringCreateForm.scheduleDay || !offeringCreateForm.scheduleStart || !offeringCreateForm.scheduleEnd) {
      return { valid: false, detail: "A teaching day, start time, and end time are required." };
    }

    if (pendingOfferingId && offerings.some((offering) => offering.id === pendingOfferingId)) {
      return { valid: false, detail: `Offering ${pendingOfferingId} already exists.` };
    }

    for (const code of [...prerequisites, ...corequisites]) {
      if (code === courseCode) {
        return { valid: false, detail: `${code} cannot be its own prerequisite or co-requisite.` };
      }

      if (!knownCourseCodes.has(code)) {
        return { valid: false, detail: `${code} does not exist in the course catalog.` };
      }

      if (!offeredCourseCodes.has(code)) {
        return { valid: false, detail: `${code} does not have an existing offering in this schedule.` };
      }
    }

    const prerequisiteSet = new Set(prerequisites);
    const overlappingConstraint = corequisites.find((code) => prerequisiteSet.has(code));
    if (overlappingConstraint) {
      return { valid: false, detail: `${overlappingConstraint} cannot be both prerequisite and co-requisite.` };
    }

    return { valid: true, detail: "" };
  }, [
    courseCodeOptions,
    courses,
    offeringCreateForm.capacity,
    offeringCreateForm.courseCode,
    offeringCreateForm.corequisites,
    offeringCreateForm.prerequisites,
    offeringCreateForm.scheduleDay,
    offeringCreateForm.scheduleEnd,
    offeringCreateForm.scheduleStart,
    offeringCreateForm.semester,
    offeringCreateForm.subclass,
    offerings,
    pendingOfferingId,
  ]);

  useEffect(() => {
    setSelectedOfferingId((current) => {
      if (!offerings.length) {
        setOfferingForm(null);
        return "";
      }

      const currentOffering = offerings.find((item) => item.id === current);
      const nextOffering = visibleOfferings.find((item) => item.id === current) ?? currentOffering ?? visibleOfferings[0] ?? offerings[0];
      setOfferingForm(buildOfferingForm(nextOffering));
      return nextOffering.id;
    });
  }, [offerings, visibleOfferings]);

  useEffect(() => {
    setSelectedRequestId((current) => {
      if (!visibleRequests.length) {
        return "";
      }

      return visibleRequests.some((item) => item.id === current) ? current : visibleRequests[0].id;
    });
  }, [visibleRequests]);

  useEffect(() => {
    setRequestPreviewAction((current) =>
      allowedRequestActions.includes(current) ? current : allowedRequestActions[0] ?? "",
    );
  }, [allowedRequestActions]);

  useEffect(() => {
    setSelectedRequestIds((current) => current.filter((id) => visibleRequests.some((item) => item.id === id)));
  }, [visibleRequests]);

  useEffect(() => {
    setSelectedOverrideId((current) => {
      if (!visibleOverrides.length) {
        return "";
      }

      return visibleOverrides.some((item) => item.id === current) ? current : visibleOverrides[0].id;
    });
  }, [visibleOverrides]);

  useEffect(() => {
    setSelectedAuditId((current) => {
      if (!visibleAuditEvents.length) {
        return "";
      }

      return visibleAuditEvents.some((item) => item.id === current) ? current : visibleAuditEvents[0].id;
    });
  }, [visibleAuditEvents]);

  useEffect(() => {
    if (!courseCodeOptions.length) {
      return;
    }

    setOfferingCreateForm((current) =>
      current.courseCode
        ? current
        : {
            ...current,
            courseCode: courseCodeOptions[0].code,
      },
    );
  }, [courseCodeOptions]);

  useEffect(() => {
    let cancelled = false;
    const studentId = overrideForm.studentId.trim();

    if (!studentId || studentId.length < 6 || !offerings.length) {
      setOverrideOfferingCandidates([]);
      setOverrideOfferingCandidatesBusy(false);
      setOverrideForm((current) =>
        current.offeringId || current.constraintTypes.length
          ? { ...current, offeringId: "", constraintTypes: [] }
          : current,
      );
      return () => {
        cancelled = true;
      };
    }

    setOverrideOfferingCandidatesBusy(true);

    const timeoutId = setTimeout(async () => {
      try {
        const results = await Promise.allSettled(
          offerings.map(async (offering) => {
            const decision = await previewDecision(offering.id, { studentId });
            const suggestedConstraintIds = getSuggestedOverrideConstraintIds(decision);

            if (!suggestedConstraintIds.length) {
              return null;
            }

            return {
              offering,
              decision,
              suggestedConstraintIds,
            };
          }),
        );

        if (cancelled) {
          return;
        }

        const candidates = results
          .filter((result) => result.status === "fulfilled" && result.value)
          .map((result) => result.value)
          .sort((left, right) => left.offering.id.localeCompare(right.offering.id));

        setOverrideOfferingCandidates(candidates);
        setOverrideForm((current) => {
          if (!current.offeringId || candidates.some((candidate) => candidate.offering.id === current.offeringId)) {
            return current;
          }

          return {
            ...current,
            offeringId: "",
            constraintTypes: [],
          };
        });
      } catch {
        if (!cancelled) {
          setOverrideOfferingCandidates([]);
        }
      } finally {
        if (!cancelled) {
          setOverrideOfferingCandidatesBusy(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [offerings, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentOverrideDecision() {
      const studentId = overrideForm.studentId.trim();

      if (!studentId || !overrideForm.offeringId) {
        setOverrideCurrentDecision(null);
        setOverrideCurrentDecisionBusy(false);
        return;
      }

      setOverrideCurrentDecisionBusy(true);

      try {
        const decision = await previewDecision(overrideForm.offeringId, { studentId });

        if (!cancelled) {
          setOverrideCurrentDecision(decision);
        }
      } catch (error) {
        if (!cancelled) {
          setOverrideCurrentDecision({
            error: {
              headline: toErrorHeadline(error, "Current rule check unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOverrideCurrentDecisionBusy(false);
        }
      }
    }

    loadCurrentOverrideDecision();

    return () => {
      cancelled = true;
    };
  }, [overrideForm.offeringId, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOverridePreview() {
      const studentId = overrideForm.studentId.trim();

      if (!studentId || !overrideForm.offeringId || !overrideForm.constraintTypes.length) {
        setOverrideImpact(null);
        setOverridePreviewBusy(false);
        return;
      }

      setOverridePreviewBusy(true);

      try {
        const preview = await previewAdminOverrideImpact(
          {
            studentId,
            offeringId: overrideForm.offeringId,
            constraintTypes: overrideForm.constraintTypes,
          },
          actorId,
        );

        if (!cancelled) {
          setOverrideImpact(preview);
        }
      } catch (error) {
        if (!cancelled) {
          setOverrideImpact({
            error: {
              headline: toErrorHeadline(error, "Override preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOverridePreviewBusy(false);
        }
      }
    }

    loadOverridePreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, overrideForm.constraintTypes, overrideForm.offeringId, overrideForm.studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOfferingPreview() {
      if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
        setOfferingImpact(null);
        setOfferingPreviewBusy(false);
        return;
      }

      setOfferingPreviewBusy(true);

      try {
        const preview = await previewAdminOfferingImpact(
          selectedOffering.id,
          {
            capacity: Number.parseInt(offeringForm.capacity, 10),
            seatsTaken: selectedOffering.seatsTaken,
            waitlistCount: selectedOffering.waitlistCount,
            allocationPolicy: offeringForm.allocationPolicy,
            requestWindow: {
              isOpen: offeringForm.requestWindowOpen,
              closesOn: offeringForm.requestWindowClosesOn,
            },
            dropWindow: {
              isOpen: offeringForm.dropWindowOpen,
              closesOn: offeringForm.dropWindowClosesOn,
            },
          },
          actorId,
        );

        if (!cancelled) {
          setOfferingImpact(preview);
        }
      } catch (error) {
        if (!cancelled) {
          setOfferingImpact({
            error: {
              headline: toErrorHeadline(error, "Offering preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setOfferingPreviewBusy(false);
        }
      }
    }

    loadOfferingPreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, offeringForm, offeringValidation.valid, selectedOffering]);

  useEffect(() => {
    let cancelled = false;

    async function loadRequestPreview() {
      if (!selectedRequest || !requestPreviewAction || !selectedRequestActionAllowed) {
        setRequestPreviewImpact(null);
        setRequestPreviewBusy(false);
        return;
      }

      setRequestPreviewBusy(true);

      try {
        const preview = await previewAdminRequestResolution(
          selectedRequest.id,
          {
            action: requestPreviewAction,
            note: requestResolutionNoteText || "Preview only; final action requires an office note.",
          },
          actorId,
        );

        if (!cancelled) {
          setRequestPreviewImpact(
            preview?.ok === false
              ? {
                  error: {
                    headline: preview.headline ?? "Resolution preview unavailable.",
                    detail: preview.message ?? "This resolution cannot be applied under the current offering state.",
                  },
                }
              : preview,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setRequestPreviewImpact({
            error: {
              headline: toErrorHeadline(error, "Resolution preview unavailable."),
              detail: toFriendlyError(error),
            },
          });
        }
      } finally {
        if (!cancelled) {
          setRequestPreviewBusy(false);
        }
      }
    }

    loadRequestPreview();

    return () => {
      cancelled = true;
    };
  }, [actorId, requestPreviewAction, requestResolutionNote, selectedRequest, selectedRequestActionAllowed]);

  function showBanner(tone, title, detail) {
    setBanner({ tone, title, detail });
  }

  function showToast(tone, title, detail) {
    setToast({ id: `${Date.now()}-${title}`, tone, title, detail });
  }

  function closeToast() {
    setToast(null);
  }

  function getSelectableRowClass(isSelected, selectedMode = "selected") {
    const selectedClass = selectedMode === "viewing" ? "portal-row--staff-viewing" : "portal-row--selected portal-row--staff-selected";

    return isSelected
      ? `portal-row portal-row--staff-selectable ${selectedClass}`
      : "portal-row portal-row--staff-selectable";
  }

  function handleSelectableRowKeyDown(event, callback) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback();
    }
  }

  function selectOffering(offering) {
    setSelectedOfferingId(offering.id);
    setOfferingForm(buildOfferingForm(offering));
    setOfferingImpactDetail("");
    setOfferingSeatSearch("");
    setOfferingSeatSortKey("timeDesc");
    setOfferingSetupMode("management");
  }

  function clearOfferingFilters() {
    setOfferingSearch("");
    setOfferingPolicyFilter("all");
    setOfferingWindowFilter("all");
    setOfferingAvailabilityFilter("all");
    setOfferingSortKey("courseCode");
  }

  function updateAuditControl(field, value) {
    const setters = {
      auditSearchFilter: setAuditSearchFilter,
      auditActionFilter: setAuditActionFilter,
      auditActorFilter: setAuditActorFilter,
      auditActorIdFilter: setAuditActorIdFilter,
      auditTargetTypeFilter: setAuditTargetTypeFilter,
      auditTargetFilter: setAuditTargetFilter,
      auditSortKey: setAuditSortKey,
      auditSortDirection: setAuditSortDirection,
    };

    setters[field]?.(value);
  }

  function clearAuditFilters() {
    setAuditSearchFilter("");
    setAuditActionFilter("");
    setAuditActorFilter("all");
    setAuditActorIdFilter("");
    setAuditTargetTypeFilter("all");
    setAuditTargetFilter("");
    setAuditSortKey("timestamp");
    setAuditSortDirection("desc");
    setOpenAuditColumnMenu("");
  }

  function resetAuditColumn(columnId) {
    if (auditSortKey === columnId) {
      setAuditSortKey("timestamp");
      setAuditSortDirection("desc");
    }

    if (columnId === "actor") {
      setAuditActorFilter("all");
      setAuditActorIdFilter("");
    }

    if (columnId === "action") {
      setAuditActionFilter("");
    }

    if (columnId === "target") {
      setAuditTargetTypeFilter("all");
      setAuditTargetFilter("");
    }

    if (columnId === "summary") {
      setAuditSearchFilter("");
    }

    if (columnId === "timestamp") {
      setAuditSortKey("timestamp");
      setAuditSortDirection("desc");
    }

    setOpenAuditColumnMenu("");
  }

  function renderAuditColumnHeader(columnId, label) {
    return (
      <AuditColumnHeaderControl
        label={label}
        columnId={columnId}
        controls={auditControls}
        menuOpen={openAuditColumnMenu === columnId}
        onToggleMenu={() => setOpenAuditColumnMenu((current) => (current === columnId ? "" : columnId))}
        onClose={() => setOpenAuditColumnMenu("")}
        onReset={() => resetAuditColumn(columnId)}
        onChange={updateAuditControl}
        menuAlign={columnId === "timestamp" || columnId === "actor" ? "left" : "right"}
        actionOptions={auditActionOptions}
        targetTypeOptions={auditTargetTypeOptions}
      />
    );
  }

  function updateCourseForm(field, value) {
    setCourseForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateOfferingCreateForm(field, value) {
    setOfferingCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleOverrideConstraint(constraintId) {
    setOverrideForm((current) => ({
      ...current,
      constraintTypes: current.constraintTypes.includes(constraintId)
        ? current.constraintTypes.filter((item) => item !== constraintId)
        : [...current.constraintTypes, constraintId],
    }));
  }

  function selectOverrideOffering(offeringId) {
    const candidate = overrideOfferingCandidateById.get(offeringId);

    setOverrideForm((current) => ({
      ...current,
      offeringId,
      constraintTypes: candidate?.suggestedConstraintIds ?? [],
    }));
  }

  function toggleRequestSelection(requestId) {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function selectAllVisibleRequests() {
    setSelectedRequestIds(visibleRequests.map((item) => item.id));
  }

  function selectActiveVisibleRequests() {
    setSelectedRequestIds(
      visibleRequests
        .filter((item) => item.active && getRequestWorkflow(item, offeringById.get(item.offeringId)).allowedActions.length > 0)
        .map((item) => item.id),
    );
  }

  function clearSelectedRequests() {
    setSelectedRequestIds([]);
  }

  async function runAction(key, action, successTitle) {
    setBusyKey(key);

    try {
      await action();
      await loadAll(actorId);
      showBanner("success", successTitle, "The shared state has been refreshed.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleSaveOffering() {
    if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
      return;
    }

    const patch = {
      capacity: Number.parseInt(offeringForm.capacity, 10),
      allocationPolicy: offeringForm.allocationPolicy,
      requestWindow: {
        isOpen: offeringForm.requestWindowOpen,
        closesOn: offeringForm.requestWindowClosesOn,
      },
      dropWindow: {
        isOpen: offeringForm.dropWindowOpen,
        closesOn: offeringForm.dropWindowClosesOn,
      },
      schedule: [
        {
          day: offeringForm.scheduleDay,
          start: offeringForm.scheduleStart,
          end: offeringForm.scheduleEnd,
          venue: offeringForm.venue.trim(),
        },
      ],
    };

    await runAction(
      `offering:${selectedOffering.id}`,
      () => updateAdminOffering(selectedOffering.id, patch, actorId),
      `Offering ${selectedOffering.courseCode} updated.`,
    );
    setOfferingSetupMode("management");
    scrollOfferingsPart("management");
  }

  function handleConfirmSaveOffering() {
    if (!selectedOffering || !offeringForm || !offeringValidation.valid) {
      return;
    }

    setConfirmAction({
      title: `Save changes to ${selectedOffering.id}?`,
      detail: buildOfferingPreviewDetail(selectedOffering, offeringImpact),
      onConfirm: handleSaveOffering,
    });
  }

  async function handleCreateCourse() {
    if (!courseValidation.valid) {
      showBanner("error", "Course form is incomplete.", courseValidation.detail);
      return;
    }

    setBusyKey("course:create");

    try {
      const created = await createAdminCourse(
        {
          code: normalizeCourseCode(courseForm.code),
          title: courseForm.title.trim(),
          faculty: courseForm.faculty.trim(),
          department: courseForm.department.trim(),
          listType: courseForm.listType,
          credits: Number.parseInt(courseForm.credits, 10),
          crossFaculty: courseForm.crossFaculty,
          synopsis: courseForm.synopsis.trim(),
        },
        actorId,
      );
      await loadAll(actorId);
      setCourseForm(buildDefaultCourseForm());
      setOfferingCreateForm((current) => ({
        ...current,
        courseCode: created.course.code,
      }));
      setOfferingSetupMode("offering");
      scrollOfferingsPart("offering");
      showBanner("success", `${created.course.code} created.`, "Next, create the semester offering for this course.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  function handleConfirmCreateCourse() {
    if (!courseValidation.valid) {
      showBanner("error", "Course form is incomplete.", courseValidation.detail);
      return;
    }

    const code = normalizeCourseCode(courseForm.code);
    setConfirmAction({
      title: `Create course ${code}?`,
      detail: `This will add ${code} to the shared course catalog.`,
      onConfirm: handleCreateCourse,
    });
  }

  async function handleCreateOffering() {
    if (!offeringCreateValidation.valid) {
      return;
    }

    setBusyKey("offering:create");

    try {
      const created = await createAdminOffering(
        {
          courseCode: normalizeCourseCode(offeringCreateForm.courseCode),
          semester: Number.parseInt(offeringCreateForm.semester, 10),
          subclass: normalizeSubclass(offeringCreateForm.subclass),
          allocationPolicy: offeringCreateForm.allocationPolicy,
          capacity: Number.parseInt(offeringCreateForm.capacity, 10),
          requestWindow: {
            isOpen: offeringCreateForm.requestWindowOpen,
            closesOn: offeringCreateForm.requestWindowClosesOn,
          },
          dropWindow: {
            isOpen: offeringCreateForm.dropWindowOpen,
            closesOn: offeringCreateForm.dropWindowClosesOn,
          },
          schedule: [
            {
              day: offeringCreateForm.scheduleDay,
              start: offeringCreateForm.scheduleStart,
              end: offeringCreateForm.scheduleEnd,
              venue: offeringCreateForm.venue.trim(),
            },
          ],
          prerequisites: offeringCreateForm.prerequisites,
          corequisites: offeringCreateForm.corequisites,
        },
        actorId,
      );
      await loadAll(actorId, { offeringId: created.offering.id });
      setSelectedOfferingId(created.offering.id);
      setOfferingSearch(created.offering.courseCode);
      setOfferingPolicyFilter("all");
      setOfferingWindowFilter("all");
      setOfferingAvailabilityFilter("all");
      setOfferingSortKey("courseCode");
      setOfferingCreateForm((current) => ({
        ...buildDefaultOfferingCreateForm(current.courseCode),
        courseCode: current.courseCode,
      }));
      setOfferingSetupMode("management");
      scrollOfferingsPart("management");
      showBanner("success", `${created.offering.id} created.`, "The list is filtered to the new offering. Review and edit live settings on the right.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  function handleConfirmCreateOffering() {
    if (!offeringCreateValidation.valid) {
      return;
    }

    setConfirmAction({
      title: `Create offering ${pendingOfferingId}?`,
      detail: `This will add a new ${formatPolicyLabel(offeringCreateForm.allocationPolicy)} offering for ${normalizeCourseCode(offeringCreateForm.courseCode)}.`,
      onConfirm: handleCreateOffering,
    });
  }

  async function handleResolveRequest(action) {
    if (!selectedRequest) {
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Resolution note required.",
        "Enter a specific office note of at least 12 characters before resolving a request.",
      );
      return;
    }

    if (!isResolutionActionAllowed(selectedRequest, selectedRequestOffering, action)) {
      showBanner(
        "error",
        "Action blocked by workflow.",
        "This request type does not support the selected staff resolution action.",
      );
      return;
    }

    await runAction(
      `request:${selectedRequest.id}:${action}`,
      () =>
        resolveAdminRequest(
          selectedRequest.id,
          {
            action,
            note: requestResolutionNoteText,
          },
          actorId,
        ),
      `Request ${selectedRequest.id} ${formatResolutionPastTense(action)}.`,
    );
  }

  function handleConfirmResolveRequest(action) {
    if (!selectedRequest) {
      showToast("error", "No request selected.", "Select one request before running a resolution action.");
      return;
    }

    if (!selectedRequest.active) {
      showToast("error", "Request is already closed.", "Only active requests can be resolved from this panel.");
      return;
    }

    if (!isResolutionActionAllowed(selectedRequest, selectedRequestOffering, action)) {
      showToast("error", "Action blocked by workflow.", "This request type does not support the selected staff action.");
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Resolution note required.",
        `Write at least 12 characters before ${formatResolutionActionLabel(action).toLowerCase()}.`,
      );
      return;
    }

    setConfirmAction({
      title: `${formatResolutionActionLabel(action)} for ${selectedRequest.id}?`,
      detail: buildRequestPreviewDetail(selectedRequest, action, requestPreviewImpact),
      onConfirm: () => handleResolveRequest(action),
    });
  }

  function handleConfirmBatchResolve(action, preview) {
    if (!preview.eligibleCount && !requestResolutionNoteValid) {
      showToast("error", "Batch action not ready.", "Select eligible rows and write at least 12 characters in the note.");
      return;
    }

    if (!preview.eligibleCount) {
      showToast("error", "No eligible requests selected.", "Select active rows that support this batch action.");
      return;
    }

    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Batch note required.",
        `Write at least 12 characters before ${formatResolutionActionLabel(action).toLowerCase()} for selected requests.`,
      );
      return;
    }

    const titles = {
      approve: "Approve selected requests?",
      waitlist: "Waitlist selected requests?",
      reject: "Reject selected requests?",
      "manual-close": "Close selected requests without outcome?",
    };

    setConfirmAction({
      title: titles[action] ?? `${formatResolutionActionLabel(action)} selected requests?`,
      detail: buildBatchResolveDetail(action, preview),
      onConfirm: () => handleBatchResolve(action),
    });
  }

  async function handleBatchResolve(action) {
    if (!requestResolutionNoteValid) {
      showToast(
        "error",
        "Batch note required.",
        "Enter a specific office note before running a batch action; it will be written to every resolved request.",
      );
      return;
    }

    const resolvable = selectedVisibleRequests.filter((request) =>
      request.active && isResolutionActionAllowed(request, offeringById.get(request.offeringId), action),
    );

    if (!resolvable.length) {
      showToast(
        "error",
        "No eligible requests selected.",
        "Select active requests that support this action under their allocation policy.",
      );
      return;
    }

    setBusyKey(`batch:${action}`);

    try {
      const succeeded = [];
      const failed = [];

      for (const request of resolvable) {
        try {
          await resolveAdminRequest(
            request.id,
            {
              action,
              note: requestResolutionNoteText,
            },
            actorId,
          );
          succeeded.push(request.id);
        } catch (error) {
          failed.push({
            id: request.id,
            error,
          });
        }
      }

      await loadAll(actorId);
      clearSelectedRequests();

      if (succeeded.length && failed.length) {
        const firstFailure = failed[0];
        showBanner(
          "warn",
          `${formatRequestCount(succeeded.length)} ${formatResolutionPastTense(action)}; ${formatRequestCount(failed.length)} failed.`,
          `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`,
        );
        return;
      }

      if (failed.length) {
        const firstFailure = failed[0];
        showBanner("error", toErrorHeadline(firstFailure.error), `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`);
        return;
      }

      showBanner(
        "success",
        `${formatRequestCount(succeeded.length)} ${formatResolutionPastTense(action)}.`,
        "The shared state has been refreshed.",
      );
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreateOverride() {
    if (!overrideValidation.valid) {
      showBanner("error", "Override form is incomplete.", overrideValidation.detail);
      return;
    }
    if (overridePreviewBusy) {
      showBanner("warn", "Override impact is still checking.", "Wait for the preview before creating the override.");
      return;
    }
    if (overrideImpact?.error) {
      showBanner("error", overrideImpact.error.headline, overrideImpact.error.detail);
      return;
    }
    if (overrideHasNoDecisionChange) {
      showBanner("warn", "No decision change.", buildOverrideImpactNote(overrideImpact));
      return;
    }

    await runAction(
      "override:create",
      () =>
        createAdminOverride(
          {
            studentId: overrideForm.studentId.trim(),
            offeringId: overrideForm.offeringId,
            note: overrideForm.note.trim(),
            constraintTypes: overrideForm.constraintTypes,
          },
          actorId,
        ),
      "Constraint override created.",
    );

    setOverrideForm((current) => ({
      ...buildDefaultOverrideForm(),
      studentId: current.studentId.trim() || "3036605296",
      note: current.note,
    }));
  }

  async function handleDeleteOverride(overrideId) {
    await runAction(
      `override:${overrideId}:delete`,
      () => deleteAdminOverride(overrideId, actorId),
      `Constraint override ${overrideId} removed.`,
    );
  }

  async function handleRefresh() {
    await runAction("refresh", () => loadAll(actorId), "Staff data refreshed.");
  }

  async function handleResetAll() {
    await runAction(
      "reset-all",
      async () => {
        await resetDemo({ scope: "all" });
        await loadAll(actorId);
      },
      "All records reset.",
    );
  }

  function scrollOfferingsPart(part) {
    window.requestAnimationFrame(() => {
      document.getElementById(`staff-offerings-${part}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function jumpToOfferingsPart(part) {
    setOfferingSetupMode(part);
    scrollOfferingsPart(part);
  }

  const offeringSummary = useMemo(
    () => ({
      total: offerings.length,
      requestOpen: offerings.filter((item) => item.requestWindow?.isOpen).length,
      dropOpen: offerings.filter((item) => item.dropWindow?.isOpen).length,
      locked: offerings.filter((item) => item.allocationPolicy === "locked").length,
      lowSeat: offerings.filter((item) => item.capacity - item.seatsTaken <= 3).length,
    }),
    [offerings],
  );

  const requestSummary = useMemo(
    () => ({
      total: requests.length,
      active: requests.filter((item) => item.active).length,
      queued: requests.filter((item) => item.status === "lotteryQueued" || item.status === "pendingReview").length,
      waitlist: requests.filter((item) => item.status === "waitlist" && item.active).length,
      visible: visibleRequests.length,
      selected: selectedRequestCount,
    }),
    [requests, selectedRequestCount, visibleRequests.length],
  );
  const requestBatchPreviews = useMemo(() => {
    const selectedCount = selectedVisibleRequests.length;
    const lotteryCount = selectedVisibleRequests.filter((request) => {
      const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));
      return workflow.mode === "lottery";
    }).length;
    const reviewCount = selectedVisibleRequests.filter((request) => {
      const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));
      return workflow.mode === "review";
    }).length;
    const waitlistCount = selectedVisibleRequests.filter((request) => request.status === "waitlist" && request.active).length;

    return Object.fromEntries(
      RESOLUTION_ACTION_OPTIONS.map(([action]) => {
        const eligibleCount = selectedVisibleRequests.filter((request) =>
          request.active && isResolutionActionAllowed(request, offeringById.get(request.offeringId), action),
        ).length;

        return [
          action,
          {
            selectedCount,
            eligibleCount,
            skippedCount: Math.max(selectedCount - eligibleCount, 0),
            lotteryCount,
            reviewCount,
            waitlistCount,
          },
        ];
      }),
    );
  }, [offeringById, selectedVisibleRequests]);

  return (
    <div className="portal portal--staff">
      <header className="portal-header">
        <div className="portal-brand">
          <img src="/hkulogo.jpg" alt="The University of Hong Kong crest" className="portal-crest-image" />
          <div>
            <h1>Faculty of Engineering</h1>
            <p>The University of Hong Kong</p>
          </div>
        </div>
        <div className="portal-mark">Staff Console</div>
      </header>

      <div className="portal-links portal-links--staff">
        <div className="portal-links__menu staff-tabs" role="tablist" aria-label="Staff console sections">
          {STAFF_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={activeTab === tab.id ? "top-link top-link--active" : "top-link"}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="portal-links__meta staff-toolbar">
          <div className="staff-session-chip" aria-label={`Signed in as ${session?.displayName ?? "Staff"}`}>
            <span>Account</span>
            <strong>{session?.displayName ?? "Staff"}</strong>
          </div>
          <div className="staff-toolbar__status" role="status" aria-live="polite">
            {busyKey ? "Syncing staff data…" : formatStaffTimestamp(lastLoadedAt)}
          </div>
          <button type="button" className="portal-reset" onClick={handleRefresh} disabled={busyKey === "refresh"}>
            {busyKey === "refresh" ? "Syncing…" : "Refresh"}
          </button>
          <button
            type="button"
            className={dangerExpanded ? "portal-reset portal-reset--danger" : "portal-reset portal-reset--secondary"}
            onClick={() => setDangerExpanded((current) => !current)}
            aria-expanded={dangerExpanded}
            aria-controls="staff-danger-zone"
          >
            Reset demo data
          </button>
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onReturnToPortal}>
            Student Portal
          </button>
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onStaffLogout}>
            Sign out
          </button>
        </div>
      </div>

      <main className="portal-main portal-main--staff">
        <div className="page-header">
          <h2>Staff Administration</h2>
        </div>

        {banner ? <Banner tone={banner.tone} title={banner.title} detail={banner.detail} onClose={() => setBanner(null)} /> : null}
        {toast ? (
          <ToastNotice
            key={toast.id}
            tone={toast.tone}
            title={toast.title}
            detail={toast.detail}
            onClose={closeToast}
          />
        ) : null}

        {!loading && dangerExpanded ? (
          <section id="staff-danger-zone" className="page-panel page-panel--danger">
            <h3>Reset demo data</h3>
              <div className="danger-zone danger-zone--actions">
                <div className="danger-zone__summary">
                  <strong>Reset all records</strong>
                  <p>This should only be used when you need to restore every student and shared offering to the original seed baseline.</p>
                </div>
                <button
                  type="button"
                  className="mini-button mini-button--danger"
                  onClick={() =>
                    setConfirmAction({
                      title: "Reset all records?",
                      detail: "This will reset every student, request, override, and shared offering to the seed baseline.",
                      onConfirm: handleResetAll,
                    })
                  }
                  disabled={busyKey === "reset-all"}
                >
                  Reset all records
                </button>
              </div>
          </section>
        ) : null}

        {loading ? (
          <div className="page-panel">
            <p>Loading staff data…</p>
          </div>
        ) : null}

        {!loading && activeTab === "offerings" ? (
          <>
          <div className="staff-offerings-workspace">
          <section className="page-panel staff-workflow-panel">
            <h3>Offerings workflow</h3>
            <div className="staff-mode-switch" role="tablist" aria-label="Creation form">
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "course"}
                className={offeringSetupMode === "course" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("course")}
              >
                Create course
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "offering"}
                className={offeringSetupMode === "offering" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("offering")}
              >
                Create offering
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={offeringSetupMode === "management"}
                className={offeringSetupMode === "management" ? "staff-mode-switch__button staff-mode-switch__button--active" : "staff-mode-switch__button"}
                onClick={() => jumpToOfferingsPart("management")}
              >
                Manage existing
              </button>
            </div>
          </section>

          <div className="staff-create-grid staff-create-grid--single">
            <section
              id="staff-offerings-course"
              className={offeringSetupMode === "course" ? "page-panel staff-panel--course" : "page-panel staff-panel--course staff-create-panel--hidden"}
            >
              <h3>Create new course</h3>
              <div className="staff-mode-banner">
                <strong>Create mode</strong>
                <span>Adds a static course identity only. It does not edit the selected offering below.</span>
              </div>
              <div className="staff-form-grid">
                <div className="staff-form-row">
                  <label>Course Code</label>
                  <input value={courseForm.code} onChange={(event) => updateCourseForm("code", event.target.value)} placeholder="COMP7999" />
                </div>
                <div className="staff-form-row">
                  <label>Title</label>
                  <input value={courseForm.title} onChange={(event) => updateCourseForm("title", event.target.value)} placeholder="Special Topics in Engineering" />
                </div>
                <div className="staff-form-row">
                  <label>Faculty</label>
                  <select value={courseForm.faculty} onChange={(event) => updateCourseForm("faculty", event.target.value)}>
                    {STAFF_FACULTY_OPTIONS.map((faculty) => (
                      <option key={faculty} value={faculty}>
                        {faculty}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Department</label>
                  <input value={courseForm.department} onChange={(event) => updateCourseForm("department", event.target.value)} placeholder="Computer Science" />
                </div>
                <div className="staff-form-row">
                  <label>List Type</label>
                  <select value={courseForm.listType} onChange={(event) => updateCourseForm("listType", event.target.value)}>
                    {STAFF_LIST_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Credits</label>
                  <input value={courseForm.credits} onChange={(event) => updateCourseForm("credits", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Cross-faculty offering</label>
                  <label className="staff-switch">
                    <input
                      type="checkbox"
                      checked={courseForm.crossFaculty}
                      onChange={(event) => updateCourseForm("crossFaculty", event.target.checked)}
                    />
                    <span className="staff-switch__track" aria-hidden="true" />
                    <span>{courseForm.crossFaculty ? "On" : "Off"}</span>
                  </label>
                </div>
                <div className="staff-form-row staff-form-row--stacked">
                  <label>Synopsis</label>
                  <textarea
                    className="staff-note-input"
                    value={courseForm.synopsis}
                    onChange={(event) => updateCourseForm("synopsis", event.target.value)}
                    placeholder="Short internal synopsis shown in the student detail dialog."
                  />
                </div>
                <div className="staff-inline-actions">
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={handleConfirmCreateCourse}
                    disabled={busyKey === "course:create"}
                  >
                    Create Course
                  </button>
                </div>
                {!courseValidation.valid ? <p className="staff-inline-note">{courseValidation.detail}</p> : null}
              </div>
            </section>

            <section
              id="staff-offerings-offering"
              className={offeringSetupMode === "offering" ? "page-panel staff-panel--offering" : "page-panel staff-panel--offering staff-create-panel--hidden"}
            >
              <h3>Create new offering</h3>
              <div className="staff-mode-banner">
                <strong>Create mode</strong>
                <span>Creates {pendingOfferingId || "a new offering"} from this form. The editor below remains tied to the selected existing row.</span>
              </div>
              <div className="staff-form-grid">
                <div className="staff-form-row">
                  <label>Course</label>
                  <select
                    value={offeringCreateForm.courseCode}
                    onChange={(event) => updateOfferingCreateForm("courseCode", event.target.value)}
                  >
                    <option value="">Select course</option>
                    {courseCodeOptions.map((course) => (
                      <option key={course.code} value={course.code}>
                        {course.code} · {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Offering ID</label>
                  <div className="staff-readonly-value">
                    <strong>{pendingOfferingId || "Waiting for course / subclass / semester"}</strong>
                    <span>Generated from course code, subclass, and semester.</span>
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Semester</label>
                  <input value={offeringCreateForm.semester} onChange={(event) => updateOfferingCreateForm("semester", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Subclass</label>
                  <input value={offeringCreateForm.subclass} onChange={(event) => updateOfferingCreateForm("subclass", event.target.value)} placeholder="A" />
                </div>
                <div className="staff-form-row">
                  <label>Policy</label>
                  <select value={offeringCreateForm.allocationPolicy} onChange={(event) => updateOfferingCreateForm("allocationPolicy", event.target.value)}>
                    {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Capacity</label>
                  <input value={offeringCreateForm.capacity} onChange={(event) => updateOfferingCreateForm("capacity", event.target.value)} inputMode="numeric" />
                </div>
                <div className="staff-form-row">
                  <label>Request Window</label>
                  <div className="staff-window-grid">
                    <label className="staff-checkbox">
                      <input
                        type="checkbox"
                        checked={offeringCreateForm.requestWindowOpen}
                        onChange={(event) => updateOfferingCreateForm("requestWindowOpen", event.target.checked)}
                      />
                      Open
                    </label>
                    <StaffDateField
                      label="Request window close date"
                      value={offeringCreateForm.requestWindowClosesOn}
                      onChange={(value) => updateOfferingCreateForm("requestWindowClosesOn", value)}
                    />
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Drop Window</label>
                  <div className="staff-window-grid">
                    <label className="staff-checkbox">
                      <input
                        type="checkbox"
                        checked={offeringCreateForm.dropWindowOpen}
                        onChange={(event) => updateOfferingCreateForm("dropWindowOpen", event.target.checked)}
                      />
                      Open
                    </label>
                    <StaffDateField
                      label="Drop window close date"
                      value={offeringCreateForm.dropWindowClosesOn}
                      onChange={(value) => updateOfferingCreateForm("dropWindowClosesOn", value)}
                    />
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Teaching Day</label>
                  <select value={offeringCreateForm.scheduleDay} onChange={(event) => updateOfferingCreateForm("scheduleDay", event.target.value)}>
                    {STAFF_DAY_OPTIONS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row">
                  <label>Start / End</label>
                  <div className="staff-time-grid">
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        value={offeringCreateForm.scheduleStart}
                        onChange={(event) => updateOfferingCreateForm("scheduleStart", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        value={offeringCreateForm.scheduleEnd}
                        onChange={(event) => updateOfferingCreateForm("scheduleEnd", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Venue</label>
                  <input value={offeringCreateForm.venue} onChange={(event) => updateOfferingCreateForm("venue", event.target.value)} placeholder="MWT 1 / Zoom" />
                </div>
                <div className="staff-form-row">
                  <label>Prerequisites</label>
                  <input value={offeringCreateForm.prerequisites} onChange={(event) => updateOfferingCreateForm("prerequisites", event.target.value)} placeholder="COMP7103, STAT7600" />
                </div>
                <div className="staff-form-row">
                  <label>Corequisites</label>
                  <input value={offeringCreateForm.corequisites} onChange={(event) => updateOfferingCreateForm("corequisites", event.target.value)} placeholder="TDLL6024" />
                </div>
                <div className="staff-inline-actions">
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={handleConfirmCreateOffering}
                    disabled={!offeringCreateValidation.valid || busyKey === "offering:create"}
                  >
                    Create Offering
                  </button>
                </div>
                {!offeringCreateValidation.valid ? <p className="staff-inline-note">{offeringCreateValidation.detail}</p> : null}
              </div>
            </section>
          </div>

          <div id="staff-offerings-management" className="staff-section-heading">
            <div>
              <strong>Manage existing shared offerings</strong>
              <span>Select one row on the left, then update the live offering settings on the right.</span>
            </div>
          </div>

          <div className="staff-grid staff-grid--offerings">
            <section className="page-panel staff-panel--shared">
              <h3>Shared Offerings</h3>
              <div className="staff-summary-bar">
                <span>{offeringSummary.total} offerings</span>
                <span>{offeringSummary.requestOpen} request open</span>
                <span>{offeringSummary.dropOpen} drop open</span>
                <span>{offeringSummary.locked} locked</span>
                <span>{offeringSummary.lowSeat} low-seat</span>
              </div>
              <div className="staff-table-controls">
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={offeringSearch} onChange={(event) => setOfferingSearch(event.target.value)} />
                </label>
                <label className="staff-toolbar__field">
                  <span>Policy</span>
                  <select
                    value={offeringPolicyFilter}
                    onChange={(event) => setOfferingPolicyFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Window</span>
                  <select
                    value={offeringWindowFilter}
                    onChange={(event) => setOfferingWindowFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="request-open">Request open</option>
                    <option value="request-closed">Request closed</option>
                    <option value="drop-open">Drop open</option>
                    <option value="drop-closed">Drop closed</option>
                    <option value="fully-closed">Fully closed</option>
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Availability</span>
                  <select
                    value={offeringAvailabilityFilter}
                    onChange={(event) => setOfferingAvailabilityFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="available">Available seats</option>
                    <option value="low-seat">Low seat (≤ 3)</option>
                    <option value="full">Full</option>
                    <option value="waitlist">Waitlist &gt; 0</option>
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Sort</span>
                  <select value={offeringSortKey} onChange={(event) => setOfferingSortKey(event.target.value)}>
                    <option value="courseCode">Course code</option>
                    <option value="availableSeatsAsc">Available seats ↑</option>
                    <option value="availableSeatsDesc">Available seats ↓</option>
                    <option value="waitlistDesc">Waitlist ↓</option>
                    <option value="requestCloseAsc">Request close date</option>
                    <option value="policy">Policy</option>
                  </select>
                </label>
                <div className="staff-toolbar__field staff-toolbar__field--action">
                  <span>Filters</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={clearOfferingFilters}
                    disabled={!offeringFiltersActive}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-offerings">
                  <thead>
                    <tr>
                      <th>Offering</th>
                      <th>Policy</th>
                      <th>Capacity</th>
                      <th>Seats Taken</th>
                      <th>Waitlist</th>
                      <th>Request Window</th>
                      <th>Drop Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOfferings.length ? (
                      visibleOfferings.map((offering) => (
                      <tr
                        key={offering.id}
                        className={getSelectableRowClass(offering.id === selectedOfferingId)}
                        onClick={() => selectOffering(offering)}
                        onKeyDown={(event) => handleSelectableRowKeyDown(event, () => selectOffering(offering))}
                        tabIndex={0}
                        aria-selected={offering.id === selectedOfferingId}
                      >
                        <td>
                          <div className="staff-row-title">
                            <strong>{offering.courseCode}</strong>
                          </div>
                          <div>{offering.id}</div>
                        </td>
                        <td>{formatPolicyLabel(offering.allocationPolicy)}</td>
                        <td>{offering.capacity}</td>
                        <td>{offering.seatsTaken}</td>
                        <td>{offering.waitlistCount}</td>
                        <td>{formatWindow(offering.requestWindow)}</td>
                        <td>{formatWindow(offering.dropWindow)}</td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>
                          <div className="staff-empty-state">
                            <strong>No offerings match the current filters.</strong>
                            <span>The editor keeps the last available selection so you do not lose context.</span>
                            <button
                              type="button"
                              className="mini-button"
                              onClick={clearOfferingFilters}
                              disabled={!offeringFiltersActive}
                            >
                              Clear filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel page-panel--focus staff-panel--editor">
              <h3>{selectedOffering ? `Editing existing offering · ${selectedOffering.courseCode}` : "Offering Editor"}</h3>
              {selectedOffering ? (
                <div className="staff-selection-banner" aria-live="polite">
                  <div className="staff-selection-banner__eyebrow">Editing selected existing offering</div>
                  <div className="staff-selection-banner__main">
                    <strong>{selectedOffering.courseCode}</strong>
                    <span className="staff-selection-banner__id">{selectedOffering.id}</span>
                  </div>
                  {selectedOffering.title ? <div className="staff-selection-banner__note">{selectedOffering.title}</div> : null}
                </div>
              ) : null}
              {selectedOfferingHiddenByFilters ? (
                <div className="staff-filter-note" role="status">
                  <span>This selected offering is hidden by the current table filters.</span>
                  <button type="button" className="mini-button" onClick={clearOfferingFilters}>
                    Clear filters
                  </button>
                </div>
              ) : null}
              {selectedOffering && offeringForm ? (
                <div className="staff-form-grid">
                  <div className="staff-context-grid">
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Availability</span>
                      <strong className="staff-context-card__value">
                        {formatSeatCount(Math.max(0, selectedOffering.capacity - selectedOffering.seatsTaken), "open")}
                      </strong>
                      <span className="staff-context-card__meta">
                        {selectedOffering.seatsTaken} taken · {selectedOffering.waitlistCount} waitlist
                      </span>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Teaching slot</span>
                      <strong className="staff-context-card__value">
                        {selectedOffering.schedule?.length ? `${selectedOffering.schedule.length} meeting${selectedOffering.schedule.length === 1 ? "" : "s"}` : "No slot recorded"}
                      </strong>
                      <div className="staff-context-list">
                        {selectedOffering.schedule?.length ? (
                          selectedOffering.schedule.map((slot) => (
                            <span key={`${slot.day}-${slot.start}-${slot.end}-${slot.venue}`}>
                              {slot.day} {slot.start}-{slot.end}{slot.venue ? ` · ${slot.venue}` : ""}
                            </span>
                          ))
                        ) : (
                          <span>No schedule data on this offering.</span>
                        )}
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Requirements</span>
                      <strong className="staff-context-card__value">
                        {selectedOffering.prerequisites?.length || selectedOffering.corequisites?.length ? "Constraint-based" : "Open course"}
                      </strong>
                      <div className="staff-context-list">
                        <span>
                          Prereq: {selectedOffering.prerequisites?.length ? selectedOffering.prerequisites.join(", ") : "None"}
                        </span>
                        <span>
                          Coreq: {selectedOffering.corequisites?.length ? selectedOffering.corequisites.join(", ") : "None"}
                        </span>
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Window and policy</span>
                      <strong className="staff-context-card__value">{formatPolicyLabel(selectedOffering.allocationPolicy)}</strong>
                      <div className="staff-context-list">
                        <span>Request: {formatWindow(selectedOffering.requestWindow)}</span>
                        <span>Drop: {formatWindow(selectedOffering.dropWindow)}</span>
                        <span>Version {selectedOffering.version ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Offering</label>
                    <div>{selectedOffering.id}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Capacity</label>
                    <input
                      value={offeringForm.capacity}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, capacity: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Seats Taken</label>
                    <div className="staff-readonly-value staff-readonly-value--metric">
                      <div className="staff-readonly-value__header">
                        <strong>{selectedOffering.seatsTaken}</strong>
                        <span className="staff-readonly-chip">Read-only</span>
                      </div>
                      <span>Derived from the current occupied seat roster.</span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Waitlist Count</label>
                    <div className="staff-readonly-value staff-readonly-value--metric">
                      <div className="staff-readonly-value__header">
                        <strong>{selectedOffering.waitlistCount}</strong>
                        <span className="staff-readonly-chip">Read-only</span>
                      </div>
                      <span>Read-only count from the current waiting queue.</span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Allocation Policy</label>
                    <select
                      value={offeringForm.allocationPolicy}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, allocationPolicy: event.target.value }))}
                    >
                      {STAFF_POLICY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="staff-form-row">
                    <label>Teaching Day</label>
                    <select
                      value={offeringForm.scheduleDay}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, scheduleDay: event.target.value }))}
                    >
                      {STAFF_DAY_OPTIONS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="staff-form-row">
                    <label>Start / End</label>
                    <div className="staff-time-grid">
                      <label>
                        <span>Start</span>
                        <input
                          type="time"
                          value={offeringForm.scheduleStart}
                          onChange={(event) => setOfferingForm((current) => ({ ...current, scheduleStart: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span>End</span>
                        <input
                          type="time"
                          value={offeringForm.scheduleEnd}
                          onChange={(event) => setOfferingForm((current) => ({ ...current, scheduleEnd: event.target.value }))}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Venue</label>
                    <input
                      value={offeringForm.venue}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, venue: event.target.value }))}
                      placeholder="MWT 1 / Zoom"
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Request Window</label>
                    <div className="staff-window-grid">
                      <label className="staff-checkbox">
                        <input
                          type="checkbox"
                          checked={offeringForm.requestWindowOpen}
                          onChange={(event) =>
                            setOfferingForm((current) => ({ ...current, requestWindowOpen: event.target.checked }))
                          }
                        />
                        Open
                      </label>
                      <StaffDateField
                        label="Request window close date"
                        value={offeringForm.requestWindowClosesOn}
                        onChange={(value) =>
                          setOfferingForm((current) => ({ ...current, requestWindowClosesOn: value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Drop Window</label>
                    <div className="staff-window-grid">
                      <label className="staff-checkbox">
                        <input
                          type="checkbox"
                          checked={offeringForm.dropWindowOpen}
                          onChange={(event) =>
                            setOfferingForm((current) => ({ ...current, dropWindowOpen: event.target.checked }))
                          }
                        />
                        Open
                      </label>
                      <StaffDateField
                        label="Drop window close date"
                        value={offeringForm.dropWindowClosesOn}
                        onChange={(value) =>
                          setOfferingForm((current) => ({ ...current, dropWindowClosesOn: value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Impact Preview</label>
                    {offeringPreviewBusy ? (
                      <p className="staff-inline-note">Checking how this offering change would affect seats, windows, and active requests…</p>
                    ) : offeringImpact?.error ? (
                      <div className="staff-decision-card staff-decision-card--error">
                        <strong>{offeringImpact.error.headline}</strong>
                        <p>{offeringImpact.error.detail}</p>
                      </div>
                    ) : offeringImpact?.summary ? (
                      <>
                      <div className="staff-impact-grid">
                        <button
                          type="button"
                          className={
                            offeringImpactDetail === "seats"
                              ? "staff-decision-card staff-decision-card--info staff-decision-card--interactive staff-decision-card--active"
                              : "staff-decision-card staff-decision-card--info staff-decision-card--interactive"
                          }
                          onClick={() => setOfferingImpactDetail((current) => (current === "seats" ? "" : "seats"))}
                          aria-expanded={offeringImpactDetail === "seats"}
                        >
                          <span className="staff-decision-card__label">Available seats</span>
                          <strong>
                            {offeringImpact.summary.availableSeatsBefore === offeringImpact.summary.availableSeatsAfter
                              ? formatSeatCount(offeringImpact.summary.availableSeatsAfter, "available")
                              : `${offeringImpact.summary.availableSeatsBefore} → ${formatSeatCount(offeringImpact.summary.availableSeatsAfter, "available")}`}
                          </strong>
                          <p>
                            Seats taken: {offeringImpact.before?.seatsTaken ?? selectedOffering?.seatsTaken ?? "—"} /{" "}
                            {offeringImpact.before?.capacity ?? selectedOffering?.capacity ?? "—"}.
                            {" "}{offeringImpact.summary.seatsDelta === 0 ? "No availability change." : `Availability delta: ${offeringImpact.summary.seatsDelta}.`}
                          </p>
                          <span className="staff-decision-card__hint">
                            {offeringImpactDetail === "seats" ? "Hide tracked approved students" : "Show tracked approved students"}
                          </span>
                        </button>
                        <div className="staff-decision-card staff-decision-card--warn">
                          <span className="staff-decision-card__label">Affected requests</span>
                          <strong>{offeringImpact.summary.affectedActiveRequests}</strong>
                          <p>Active requests currently attached to this offering.</p>
                        </div>
                        <div className="staff-decision-card staff-decision-card--neutral">
                          <span className="staff-decision-card__label">Window change</span>
                          <strong>
                            {offeringImpact.summary.requestWindowClosingNow || offeringImpact.summary.dropWindowClosingNow
                              ? "Window closes now"
                              : "No immediate closure"}
                          </strong>
                          <p>
                            {offeringImpact.summary.requestWindowClosingNow
                              ? "Request window closes immediately with this update."
                              : offeringImpact.summary.dropWindowClosingNow
                                ? "Drop window closes immediately with this update."
                                : "Request and drop windows remain as configured."}
                          </p>
                        </div>
                      </div>
                      {offeringImpactDetail === "seats" ? (
                        <div className="staff-impact-detail" aria-live="polite">
                          <div className="staff-impact-detail__header">
                            <strong>Approved seat holders</strong>
                            <span>{offeringImpact.seatOccupantSummary?.totalCount ?? offeringImpact.seatOccupants?.length ?? 0} confirmed students</span>
                          </div>
                          <div className="staff-impact-detail__toolbar">
                            <label className="staff-impact-detail__search">
                              <span>Search</span>
                              <input
                                type="search"
                                value={offeringSeatSearch}
                                onChange={(event) => setOfferingSeatSearch(event.target.value)}
                                placeholder="Search by student ID"
                              />
                            </label>
                            <div className="staff-impact-detail__toolbar-actions">
                              <label className="staff-impact-detail__sort">
                                <span>Sort</span>
                                <select
                                  value={offeringSeatSortKey}
                                  onChange={(event) => setOfferingSeatSortKey(event.target.value)}
                                >
                                  <option value="timeDesc">Newest first</option>
                                  <option value="timeAsc">Oldest first</option>
                                  <option value="studentAsc">Student ID ↑</option>
                                  <option value="studentDesc">Student ID ↓</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                className="staff-impact-detail__clear"
                                onClick={() => setOfferingSeatSearch("")}
                                disabled={!offeringSeatSearch.trim()}
                              >
                                Clear
                              </button>
                              <span className="staff-impact-detail__count">{visibleSeatOccupants.length} visible</span>
                            </div>
                          </div>
                          <p className="staff-inline-note">
                            This roster shows the occupied seats currently recorded for this offering.
                          </p>
                          {visibleSeatOccupants.length ? (
                            <div className="staff-impact-list">
                              {visibleSeatOccupants.map((occupant) => (
                                <div key={occupant.enrollmentId} className="staff-impact-list__row">
                                  <div className="staff-impact-list__main">
                                    <strong>{occupant.studentId}</strong>
                                  </div>
                                  <div className="staff-impact-list__meta">
                                    {formatSeatOccupantTimestamp(occupant.enrolledAt)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="staff-inline-note">
                              {offeringImpact.seatOccupants?.length
                                ? "No approved seat holders match the current search."
                                : "No approved seat holders are recorded for this offering yet."}
                            </p>
                          )}
                        </div>
                      ) : null}
                      </>
                    ) : (
                      <p className="staff-inline-note">Select an offering and edit its values to preview the effect before saving.</p>
                    )}
                  </div>
                  <div className="staff-inline-actions">
                    <button
                      type="button"
                      className="mini-button mini-button--primary"
                      onClick={handleConfirmSaveOffering}
                      disabled={!offeringValidation.valid || busyKey === `offering:${selectedOffering.id}`}
                    >
                      Save Offering
                    </button>
                  </div>
                  {!offeringValidation.valid ? <p className="staff-inline-note">{offeringValidation.detail}</p> : null}
                </div>
              ) : (
                <p>Select an offering to edit its shared configuration.</p>
              )}
            </section>
          </div>
          </div>
          </>
        ) : null}

        {!loading && activeTab === "requests" ? (
          <div className="staff-grid">
            <section className="page-panel staff-panel--request-list">
              <h3>Requests</h3>
              <div className="staff-summary-bar">
                <span>{requestSummary.total} total</span>
                <span>{requestSummary.active} active</span>
                <span>{requestSummary.queued} queued</span>
                <span>{requestSummary.waitlist} waitlist</span>
                <span>{requestSummary.visible} visible</span>
                <span>{requestSummary.selected} batch selected</span>
              </div>
              <div className="staff-table-controls">
                <label className="staff-checkbox">
                  <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
                  Active only
                </label>
                <label className="staff-toolbar__field">
                  <span>Status</span>
                  <select
                    value={requestStatusFilter}
                    onChange={(event) => setRequestStatusFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {REQUEST_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} />
                </label>
                <div className="staff-toolbar-group staff-toolbar-group--selection">
                  <span className="staff-toolbar-group__label">Selection</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={selectAllVisibleRequests}
                    disabled={!visibleRequests.length}
                    title="Select every row currently shown by the filters, including rows that batch actions may later skip."
                  >
                    Select shown rows
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={selectActiveVisibleRequests}
                    disabled={!visibleRequests.some((item) => item.active && getRequestWorkflow(item, offeringById.get(item.offeringId)).allowedActions.length > 0)}
                    title="Select only active visible requests that ordinary staff batch actions can resolve."
                  >
                    Select action-ready rows
                  </button>
                  <button type="button" className="mini-button" onClick={clearSelectedRequests} disabled={!selectedRequestIds.length}>
                    Clear batch
                  </button>
                </div>
                <div className="staff-toolbar-group staff-toolbar-group--actions">
                  <span className="staff-toolbar-group__label">Actions</span>
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={() => handleConfirmBatchResolve("approve", requestBatchPreviews.approve)}
                  >
                    Batch Approve
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => handleConfirmBatchResolve("waitlist", requestBatchPreviews.waitlist)}
                  >
                    Batch Waitlist
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--danger"
                    onClick={() => handleConfirmBatchResolve("reject", requestBatchPreviews.reject)}
                  >
                    Batch Reject
                  </button>
                  <button
                    type="button"
                    className="mini-button mini-button--danger"
                    onClick={() => handleConfirmBatchResolve("manual-close", requestBatchPreviews["manual-close"])}
                  >
                    Batch Close
                  </button>
                </div>
              </div>
              <div className="staff-batch-readiness" role="status" aria-live="polite">
                <span className={selectedRequestCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Selected {selectedRequestCount}
                </span>
                <span className={requestResolutionNoteValid ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill staff-batch-readiness__pill--warn"}>
                  Note {requestResolutionNoteProgress}/12
                </span>
                <span className={requestBatchPreviews.approve.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Approve {requestBatchPreviews.approve.eligibleCount}
                </span>
                <span className={requestBatchPreviews.waitlist.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Waitlist {requestBatchPreviews.waitlist.eligibleCount}
                </span>
                <span className={requestBatchPreviews.reject.eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Reject {requestBatchPreviews.reject.eligibleCount}
                </span>
                <span className={requestBatchPreviews["manual-close"].eligibleCount ? "staff-batch-readiness__pill staff-batch-readiness__pill--ready" : "staff-batch-readiness__pill"}>
                  Close {requestBatchPreviews["manual-close"].eligibleCount}
                </span>
              </div>
              {selectedRequestCount ? (
                <div className="staff-impact-grid staff-impact-grid--compact" aria-live="polite">
                  <div className="staff-decision-card staff-decision-card--info">
                    <span className="staff-decision-card__label">Batch selection</span>
                    <strong>{formatRequestCount(selectedRequestCount)} batch selected</strong>
                    <p>
                      {requestBatchPreviews.approve.reviewCount} faculty review, {requestBatchPreviews.approve.lotteryCount} lottery pool,
                      and {formatRequestCount(requestBatchPreviews.approve.waitlistCount)} in waitlist handling.
                    </p>
                  </div>
                  <div className="staff-decision-card staff-decision-card--success">
                    <span className="staff-decision-card__label">Review eligible</span>
                    <strong>{requestBatchPreviews.approve.eligibleCount} approval-ready</strong>
                    <p>Lottery records are excluded from ordinary approval.</p>
                  </div>
                  <div className={requestBatchPreviews.approve.skippedCount ? "staff-decision-card staff-decision-card--warn" : "staff-decision-card staff-decision-card--neutral"}>
                    <span className="staff-decision-card__label">Policy skipped</span>
                    <strong>{formatRequestCount(requestBatchPreviews.approve.skippedCount)}</strong>
                    <p>
                      {requestBatchPreviews.approve.skippedCount
                        ? "Inactive, lottery, or routine FCFS records are protected from this batch action."
                        : "Every selected request is eligible for approval."}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-requests">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Request</th>
                      <th>Student</th>
                      <th>Offering</th>
                      <th>Submitted</th>
                      <th>Workflow</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.length ? (
                      visibleRequests.map((request) => {
                        const workflow = getRequestWorkflow(request, offeringById.get(request.offeringId));

                        return (
                        <tr
                          key={request.id}
                          className={getSelectableRowClass(request.id === selectedRequestId, "viewing")}
                          onClick={() => setSelectedRequestId(request.id)}
                          onKeyDown={(event) => handleSelectableRowKeyDown(event, () => setSelectedRequestId(request.id))}
                          tabIndex={0}
                          aria-current={request.id === selectedRequestId ? "true" : undefined}
                          aria-selected={selectedRequestIdSet.has(request.id)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRequestIdSet.has(request.id)}
                              onChange={() => toggleRequestSelection(request.id)}
                              aria-label={`Batch select ${request.id}`}
                            />
                          </td>
                          <td>
                            <span className="staff-mono-cell" title={request.id}>{formatRequestListId(request.id)}</span>
                          </td>
                          <td>
                            <div className="staff-student-cell">
                              <strong>{request.student?.name ?? request.studentId}</strong>
                              <span>
                                {request.studentId} · {formatProgrammeShortName(request.student?.programme)}
                              </span>
                            </div>
                          </td>
                          <td>{request.offeringId}</td>
                          <td>{formatStaffDateTime(request.submittedAt)}</td>
                          <td>
                            <div className={`staff-workflow-pill staff-workflow-pill--${workflow.mode}`}>
                              <strong>{workflow.label}</strong>
                              {!request.active ? <span>Closed</span> : null}
                            </div>
                          </td>
                          <td>{formatRequestStatusLabel(request.status)}</td>
                          <td>
                            <span className="staff-message-cell" title={request.message ?? ""}>{request.message ?? "—"}</span>
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8}>No requests match the current filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel staff-panel--request-detail">
              <h3>Request Resolution</h3>
              {selectedRequest ? (
                <div className="staff-form-grid">
                  {selectedRequestCount > 0 && !selectedRequestIdSet.has(selectedRequest.id) ? (
                    <div className="staff-detail-batch-note" role="status">
                      Open in detail only; batch actions will not include this request.
                    </div>
                  ) : null}
                  <div className="staff-form-row staff-form-row--stacked">
                    <div className="staff-form-label-row">
                      <label>{allowedRequestActions.length ? "Resolution Note" : "Batch / audit note"}</label>
                      <span
                        className={
                          requestResolutionNoteValid
                            ? "staff-note-counter staff-note-counter--ready"
                            : "staff-note-counter staff-note-counter--warn"
                        }
                      >
                        Note {requestResolutionNoteProgress}/12
                      </span>
                    </div>
                    <textarea
                      className="staff-note-input"
                      value={requestResolutionNote}
                      onChange={(event) => setRequestResolutionNote(event.target.value)}
                      placeholder="Record the office reason and student-facing consequence before resolving."
                    />
                    <p className="staff-inline-note">Required for actions · saved to audit log</p>
                  </div>
                  {allowedRequestActions.length ? (
                    <>
                      <div className="staff-form-row">
                        <label>Preview action</label>
                        <select value={requestPreviewAction} onChange={(event) => setRequestPreviewAction(event.target.value)}>
                          {RESOLUTION_ACTION_OPTIONS
                            .filter(([value]) => allowedRequestActions.includes(value))
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="staff-form-row staff-form-row--stacked">
                        <label>Resolution impact preview</label>
                        {requestPreviewBusy ? (
                          <p className="staff-inline-note">Checking how this resolution would change the request and shared offering…</p>
                        ) : requestPreviewImpact?.error ? (
                          <div className="staff-decision-card staff-decision-card--error">
                            <strong>{requestPreviewImpact.error.headline}</strong>
                            <p>{requestPreviewImpact.error.detail}</p>
                          </div>
                        ) : requestPreviewImpact?.summary ? (
                          <div className="staff-impact-grid">
                            <div className="staff-decision-card staff-decision-card--info">
                              <span className="staff-decision-card__label">Student outcome</span>
                              <strong>
                                {formatRequestStatusLabel(requestPreviewImpact.summary.statusBefore)} →{" "}
                                {formatRequestStatusLabel(requestPreviewImpact.summary.statusAfter)}
                              </strong>
                              <p>
                                {requestPreviewImpact.summary.activeAfter
                                  ? "The request remains active after this action."
                                  : "The request closes, the note becomes the student-facing message, and an audit event is written."}
                              </p>
                            </div>
                            <div className="staff-decision-card staff-decision-card--warn">
                              <span className="staff-decision-card__label">Supply impact</span>
                              <strong>
                                Seats {requestPreviewImpact.summary.seatsTakenDelta >= 0 ? "+" : ""}
                                {requestPreviewImpact.summary.seatsTakenDelta}, waitlist {requestPreviewImpact.summary.waitlistDelta >= 0 ? "+" : ""}
                                {requestPreviewImpact.summary.waitlistDelta}
                              </strong>
                              <p>Shared offering counts after this resolution.</p>
                            </div>
                            <div className={`staff-decision-card ${requestPreviewImpact.summary.enrollmentCreated ? "staff-decision-card--success" : "staff-decision-card--neutral"}`}>
                              <span className="staff-decision-card__label">Enrolment</span>
                              <strong>{requestPreviewImpact.summary.enrollmentCreated ? "Enrolment will be created" : "No new enrolment"}</strong>
                              <p>{requestPreviewImpact.summary.enrollmentCreated ? "The student receives an approved enrolment record." : "No seat is awarded by this action."}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="staff-inline-note">Choose an allowed action to inspect its impact before resolving the request.</p>
                        )}
                      </div>
                      <div
                        className={
                          requestResolutionDisabled
                            ? "staff-action-lock staff-action-lock--warn"
                            : "staff-action-lock staff-action-lock--ready"
                        }
                        role="status"
                      >
                        {requestResolutionLockLabel}
                      </div>
                      <div className="staff-inline-actions">
                        {RESOLUTION_ACTION_OPTIONS
                          .filter(([value]) => allowedRequestActions.includes(value))
                          .map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={value === "approve" ? "mini-button mini-button--primary" : value === "reject" || value === "manual-close" ? "mini-button mini-button--danger" : "mini-button"}
                              onClick={() => handleConfirmResolveRequest(value)}
                              title={requestResolutionLockLabel}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    </>
                  ) : (
                    <div className="staff-decision-card staff-decision-card--warn">
                      <span className="staff-decision-card__label">Ordinary resolution locked</span>
                      <strong>No manual action is available here</strong>
                      <p>{selectedRequestWorkflow.warning || "This workflow must be completed outside the ordinary request resolution queue."}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p>Select a request to resolve it.</p>
              )}
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "overrides" ? (
          <div className="staff-grid staff-grid--overrides">
            <section className="page-panel staff-override-create staff-panel--override-create">
              <h3>Create Override</h3>
              <div className="staff-override-scope" aria-label="Override scope">
                <div className={overrideForm.studentId.trim() ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Student</span>
                  <strong>{overrideForm.studentId.trim() || "—"}</strong>
                </div>
                <div className={overrideForm.offeringId ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Offering</span>
                  <strong>{overrideForm.offeringId || (overrideOfferingCandidatesBusy ? "Checking…" : "—")}</strong>
                </div>
                <div className={overrideForm.constraintTypes.length ? "staff-step-card staff-step-card--ready" : "staff-step-card"}>
                  <span>Constraints</span>
                  <strong>{overrideForm.constraintTypes.length || "—"}</strong>
                </div>
              </div>
              <div className="staff-form-grid staff-form-grid--override">
                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Scope</div>
                  <div className="staff-form-row">
                    <label>Student ID</label>
                    <input
                      value={overrideForm.studentId}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, studentId: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Blocked offering</label>
                    <select
                      value={overrideForm.offeringId}
                      disabled={overrideOfferingSelectDisabled}
                      onChange={(event) => selectOverrideOffering(event.target.value)}
                    >
                      <option value="">{overrideOfferingSelectLabel}</option>
                      {overrideOfferingCandidates.map((candidate) => {
                        const constraintLabels = OVERRIDE_OPTIONS.filter((option) =>
                          candidate.suggestedConstraintIds.includes(option.id),
                        ).map((option) => option.label);

                        return (
                          <option key={candidate.offering.id} value={candidate.offering.id}>
                            {constraintLabels.length
                              ? `${candidate.offering.id} · ${constraintLabels.join(", ")}`
                              : candidate.offering.id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Constraint Resolution</div>
                  <div className="override-chip-grid" role="group" aria-label="Constraint types to bypass">
                    {OVERRIDE_OPTIONS.map((option) => {
                      const active = overrideForm.constraintTypes.includes(option.id);
                      const suggested = suggestedOverrideConstraintIds.includes(option.id);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={[
                            "override-chip",
                            active ? "override-chip--active" : "",
                            suggested ? "override-chip--suggested" : "",
                          ].filter(Boolean).join(" ")}
                          aria-pressed={active}
                          onClick={() => toggleOverrideConstraint(option.id)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Preview</div>
                  {overridePreviewBusy ? (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">…</div>
                    </div>
                  ) : overrideImpact?.error ? (
                    <div className="staff-decision-preview">
                      <div className="staff-decision-card staff-decision-card--error">
                        <span className="staff-decision-card__label">Error</span>
                        <strong>{overrideImpact.error.headline}</strong>
                        <p>{overrideImpact.error.detail}</p>
                      </div>
                    </div>
                  ) : overrideImpact ? (
                    <div className="staff-decision-preview staff-decision-preview--flow">
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.currentDecision)}`}>
                        <span className="staff-decision-card__label">Current</span>
                        <strong>{overrideImpact.currentDecision.headline}</strong>
                        {overrideImpact.currentDecision.reasons?.length ? <p>{overrideImpact.currentDecision.reasons[0]}</p> : null}
                      </div>
                      <div className="staff-preview-arrow" aria-hidden="true">→</div>
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.overrideDecision)}`}>
                        <span className="staff-decision-card__label">Override</span>
                        <strong>{overrideImpact.overrideDecision.headline}</strong>
                        {overrideImpact.overrideDecision.reasons?.length ? <p>{overrideImpact.overrideDecision.reasons[0]}</p> : null}
                      </div>
                      <div className={hasOverrideImpactChange(overrideImpact) ? "staff-impact-status staff-impact-status--good" : "staff-impact-status staff-impact-status--warn"}>
                        {hasOverrideImpactChange(overrideImpact) ? buildOverrideImpactNote(overrideImpact) : "No decision change"}
                      </div>
                    </div>
                  ) : overrideCurrentDecisionBusy ? (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">…</div>
                    </div>
                  ) : overrideCurrentDecision?.error ? (
                    <div className="staff-decision-preview">
                      <div className="staff-decision-card staff-decision-card--error">
                        <span className="staff-decision-card__label">Current</span>
                        <strong>{overrideCurrentDecision.error.headline}</strong>
                        <p>{overrideCurrentDecision.error.detail}</p>
                      </div>
                    </div>
                  ) : overrideCurrentDecisionForDisplay ? (
                    <div className="staff-decision-preview">
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideCurrentDecisionForDisplay)}`}>
                        <span className="staff-decision-card__label">
                          {overrideCurrentDecisionForDisplay.ok ? "Current decision" : "Current blocker"}
                        </span>
                        <strong>{overrideCurrentDecisionForDisplay.headline}</strong>
                        {overrideCurrentDecisionForDisplay.reasons?.length ? <p>{overrideCurrentDecisionForDisplay.reasons[0]}</p> : null}
                      </div>
                      {suggestedOverrideConstraintIds.length ? (
                        <div className="staff-impact-status staff-impact-status--info">
                          Rule: {OVERRIDE_OPTIONS.filter((option) => suggestedOverrideConstraintIds.includes(option.id)).map((option) => option.label).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="staff-decision-preview staff-decision-preview--empty">
                      <div className="staff-preview-placeholder">—</div>
                    </div>
                  )}
                </div>

                <div className="staff-fieldset">
                  <div className="staff-fieldset__title">Action</div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Note</label>
                    <textarea
                      className="staff-note-input"
                      value={overrideForm.note}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, note: event.target.value }))}
                    />
                  </div>
                  <div className="staff-inline-actions staff-inline-actions--split">
                    <button
                      type="button"
                      className="mini-button mini-button--primary"
                      onClick={handleCreateOverride}
                      disabled={overrideCreateDisabled}
                    >
                      Create Override
                    </button>
                    {!overrideValidation.valid ? <span className="staff-action-status">Missing: {overrideValidation.detail.replace("Required before creating: ", "").replace(".", "")}</span> : null}
                    {overrideValidation.valid && overridePreviewBusy ? <span className="staff-action-status">Checking impact</span> : null}
                    {overrideValidation.valid && overrideImpact?.error ? <span className="staff-action-status">Preview unavailable</span> : null}
                    {overrideValidation.valid && overrideHasNoDecisionChange ? <span className="staff-action-status">No decision change</span> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="page-panel staff-override-manage staff-panel--override-manage">
              <h3>Overrides</h3>
              <div className="staff-table-controls">
                <label className="staff-toolbar__field">
                  <span>Search</span>
                  <input value={overrideSearch} onChange={(event) => setOverrideSearch(event.target.value)} />
                </label>
                <label className="staff-toolbar__field">
                  <span>Status</span>
                  <select value={overrideActiveFilter} onChange={(event) => setOverrideActiveFilter(event.target.value)}>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <table className="portal-table portal-table--staff-overrides">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Student</th>
                      <th>Offering</th>
                      <th>Constraint Types</th>
                      <th>Created By</th>
                      <th>Active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOverrides.length ? (
                      visibleOverrides.map((override) => (
                        <tr
                          key={override.id}
                          className={getSelectableRowClass(override.id === selectedOverrideId)}
                          onClick={() => setSelectedOverrideId(override.id)}
                          onKeyDown={(event) => handleSelectableRowKeyDown(event, () => setSelectedOverrideId(override.id))}
                          tabIndex={0}
                          aria-selected={override.id === selectedOverrideId}
                        >
                          <td>
                            <span className="staff-mono-cell" title={override.id}>{formatCompactId(override.id)}</span>
                          </td>
                          <td>{override.studentId}</td>
                          <td>{override.offeringId}</td>
                          <td>
                            <div className="staff-chip-list">
                              {(override.constraintTypes ?? []).map((constraintType) => {
                                const option = OVERRIDE_OPTIONS.find((item) => item.id === constraintType);
                                return (
                                  <span key={constraintType} className="staff-chip">
                                    {option?.label ?? constraintType}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <span className="staff-mono-cell" title={override.createdBy ?? ""}>{override.createdBy}</span>
                          </td>
                          <td>{override.active ? "Yes" : "No"}</td>
                          <td>
                            {override.active ? (
                              <button
                                type="button"
                                className="mini-button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: `Deactivate ${override.id}?`,
                                    detail: "This will remove the targeted constraint override for the selected student and offering.",
                                    onConfirm: () => handleDeleteOverride(override.id),
                                  })
                                }
                              >
                                Remove
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>No overrides match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="staff-detail-panel">
                <h4>Detail</h4>
                {selectedOverride ? (
                  <div className="staff-form-grid staff-form-grid--compact">
                    <div className="staff-selection-banner">
                      <div className="staff-selection-banner__eyebrow">Override</div>
                      <div className="staff-selection-banner__main">
                        <strong title={selectedOverride.id}>{formatCompactId(selectedOverride.id)}</strong>
                        <span>{selectedOverride.offeringId}</span>
                      </div>
                      <div className="staff-selection-banner__note">
                        {selectedOverride.studentId} · {selectedOverride.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="staff-context-grid">
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Student</span>
                        <strong className="staff-context-card__value">{selectedOverride.studentId}</strong>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Offering</span>
                        <strong className="staff-context-card__value">{selectedOverride.offeringId}</strong>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Created by</span>
                        <strong className="staff-context-card__value">{selectedOverride.createdBy ?? "Unknown actor"}</strong>
                        <div className="staff-context-list">
                          <span>{formatStaffDateTime(selectedOverride.createdAt)}</span>
                        </div>
                      </div>
                      <div className="staff-context-card staff-context-card--constraint">
                        <span className="staff-context-card__label">Constraint resolved</span>
                        <div className="staff-chip-list staff-chip-list--primary">
                          {(selectedOverride.constraintTypes ?? []).map((constraintType) => {
                            const option = OVERRIDE_OPTIONS.find((item) => item.id === constraintType);
                            return (
                              <span key={constraintType} className="staff-chip">
                                {option?.label ?? constraintType}
                              </span>
                            );
                          })}
                        </div>
                        <span className="staff-context-card__meta">
                          {selectedOverride.constraintTypes?.length ?? 0} selected
                        </span>
                      </div>
                      {selectedOverride.note ? (
                        <div className="staff-context-card staff-context-card--note">
                          <span className="staff-context-card__label">Office note</span>
                          <span className="staff-context-note">{selectedOverride.note}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="staff-preview-placeholder">—</div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "audit" ? (
          <div className="staff-grid staff-grid--audit">
            <div className="page-stack staff-audit-column">
              <section className="page-panel staff-panel--audit-filters">
                <h3>Audit Trail Filters</h3>
                <div className="staff-summary-bar">
                  <span>{auditSummary.total} total</span>
                  <span>{auditSummary.visible} visible</span>
                  <span>{auditSummary.staff} staff</span>
                  <span>{auditSummary.student} student</span>
                  <span>{auditSummary.overrides} override events</span>
                </div>
                <div className="staff-inline-actions staff-inline-actions--quick-filters">
                  <button
                    type="button"
                    className={auditActionFilter === "request-resolved" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("request-resolved")}
                  >
                    Request resolved
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "offering-updated" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("offering-updated")}
                  >
                    Offering updated
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "override-created" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("override-created")}
                  >
                    Override created
                  </button>
                  <button
                    type="button"
                    className={auditActionFilter === "override-deactivated" ? "mini-button mini-button--active" : "mini-button"}
                    onClick={() => setAuditActionFilter("override-deactivated")}
                  >
                    Override removed
                  </button>
                  <button
                    type="button"
                    className={auditFiltersActive ? "mini-button" : "mini-button mini-button--active"}
                    onClick={clearAuditFilters}
                  >
                    Clear all
                  </button>
                </div>
                <div className="staff-table-controls">
                  <label className="staff-toolbar__field staff-toolbar__field--wide">
                    <span>Search all</span>
                    <input value={auditSearchFilter} onChange={(event) => setAuditSearchFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Actor Type</span>
                    <select value={auditActorFilter} onChange={(event) => setAuditActorFilter(event.target.value)}>
                      <option value="all">All</option>
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="system">System</option>
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Action</span>
                    <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                      <option value="">All</option>
                      {auditActionOptions.map((action) => (
                        <option key={action} value={action}>
                          {formatAuditActionLabel(action)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Actor ID</span>
                    <input value={auditActorIdFilter} onChange={(event) => setAuditActorIdFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Target Type</span>
                    <select value={auditTargetTypeFilter} onChange={(event) => setAuditTargetTypeFilter(event.target.value)}>
                      <option value="all">All</option>
                      {auditTargetTypeOptions.map((targetType) => (
                        <option key={targetType} value={targetType}>
                          {targetType === "constraintOverride" ? "Override" : targetType === "request" ? "Request" : targetType === "offering" ? "Offering" : targetType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Target / Student</span>
                    <input value={auditTargetFilter} onChange={(event) => setAuditTargetFilter(event.target.value)} />
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Sort by</span>
                    <select value={auditSortKey} onChange={(event) => setAuditSortKey(event.target.value)}>
                      {AUDIT_SORT_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="staff-toolbar__field">
                    <span>Direction</span>
                    <select value={auditSortDirection} onChange={(event) => setAuditSortDirection(event.target.value)}>
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </label>
                </div>
              </section>
              <section className="page-panel staff-panel--audit-list">
                <h3>Audit Trail · {auditSortLabel} {auditSortDirection === "asc" ? "ascending" : "descending"}</h3>
                <div className="table-wrap">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>{renderAuditColumnHeader("timestamp", "Timestamp")}</th>
                        <th>{renderAuditColumnHeader("actor", "Actor")}</th>
                        <th>{renderAuditColumnHeader("action", "Action")}</th>
                        <th>{renderAuditColumnHeader("target", "Target")}</th>
                        <th>{renderAuditColumnHeader("summary", "Summary")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAuditEvents.length ? (
                        visibleAuditEvents.map((event) => (
                          <tr
                            key={event.id}
                            className={getSelectableRowClass(event.id === selectedAuditId)}
                            onClick={() => setSelectedAuditId(event.id)}
                            onKeyDown={(keyboardEvent) => handleSelectableRowKeyDown(keyboardEvent, () => setSelectedAuditId(event.id))}
                            tabIndex={0}
                            aria-selected={event.id === selectedAuditId}
                          >
                            <td>{formatStaffDateTime(event.timestamp)}</td>
                            <td>{formatAuditActorLabel(event)}</td>
                            <td>{formatAuditActionLabel(event.action)}</td>
                            <td>
                              <div className="staff-audit-cell staff-audit-cell--target">
                                <strong>{formatAuditTargetLabel(event)}</strong>
                                {event.subjectStudentId ? <span>Student {event.subjectStudentId}</span> : null}
                              </div>
                            </td>
                            <td>
                              <div className="staff-audit-cell">
                                <strong>{buildAuditEventSummary(event)}</strong>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No audit events match the current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <section className="page-panel staff-panel--audit-detail">
              <h3>Audit Event Detail</h3>
              {selectedAuditEvent ? (
                <div className="staff-form-grid">
                  <div className="staff-selection-banner">
                    <div className="staff-selection-banner__eyebrow">Selected audit event</div>
                    <div className="staff-selection-banner__main">
                      <strong>{formatAuditActionLabel(selectedAuditEvent.action)}</strong>
                      <span>{formatAuditTargetLabel(selectedAuditEvent)}</span>
                    </div>
                    <div className="staff-selection-banner__note">{buildAuditEventSummary(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Event ID</label>
                    <div>
                      <span className="staff-mono-cell staff-audit-event-id" title={selectedAuditEvent.id}>
                        {formatCompactId(selectedAuditEvent.id)}
                      </span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Timestamp</label>
                    <div>{formatStaffDateTime(selectedAuditEvent.timestamp)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Actor</label>
                    <div>{formatAuditActorLabel(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Action</label>
                    <div>{formatAuditActionLabel(selectedAuditEvent.action)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Target</label>
                    <div>{formatAuditTargetLabel(selectedAuditEvent)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Student</label>
                    <div>{selectedAuditEvent.subjectStudentId ?? "—"}</div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>State change</label>
                    <div className="staff-audit-summary-card">
                      <strong>{buildAuditEventChange(selectedAuditEvent)}</strong>
                    </div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Before</label>
                    {selectedAuditBeforeRows.length ? (
                      <div className="staff-audit-detail-list">
                        {selectedAuditBeforeRows.map((row) => (
                          <div className="staff-audit-detail-list__row" key={`before-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="staff-audit-empty">No previous value was recorded for this event.</div>
                    )}
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>After</label>
                    {selectedAuditAfterRows.length ? (
                      <div className="staff-audit-detail-list">
                        {selectedAuditAfterRows.map((row) => (
                          <div className="staff-audit-detail-list__row" key={`after-${row.label}`}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="staff-audit-empty">No updated value was recorded for this event.</div>
                    )}
                  </div>
                </div>
              ) : (
                <p>Select an audit event to inspect its full before/after payload.</p>
              )}
            </section>
          </div>
        ) : null}
      </main>

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.title}
          detail={confirmAction.detail}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            const action = confirmAction.onConfirm;
            setConfirmAction(null);
            await action();
          }}
        />
      ) : null}
    </div>
  );
}
