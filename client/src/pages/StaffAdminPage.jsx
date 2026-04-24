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
  resetDemo,
  resolveAdminRequest,
  updateAdminOffering,
} from "../api";
import { Banner, ConfirmDialog } from "../components/PortalFeedback";
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
  formatAuditActionLabel,
  formatAuditActorLabel,
  formatAuditTargetLabel,
  formatPolicyLabel,
  formatRequestStatusLabel,
  formatResolutionActionLabel,
  formatSeatCount,
  formatStaffDateTime,
  formatSeatOccupantTimestamp,
  formatStaffTimestamp,
  formatWindow,
  getRequestWorkflow,
  hasOverrideImpactChange,
  includesText,
  isResolutionActionAllowed,
  matchesOfferingWindow,
  OVERRIDE_OPTIONS,
  parseNonNegativeInteger,
  RESOLUTION_ACTION_OPTIONS,
  STAFF_DAY_OPTIONS,
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

function formatRequestCount(count) {
  return count === 1 ? "1 request" : `${count} requests`;
}

function formatResolutionPastTense(action) {
  return RESOLUTION_PAST_TENSE[action] ?? formatResolutionActionLabel(action).toLowerCase();
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

export function StaffAdminPage({ onReturnToPortal }) {
  const [activeTab, setActiveTab] = useState("offerings");
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [actorId, setActorId] = useState(DEFAULT_STAFF_ACTOR_ID);
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
  const [requestResolutionNote, setRequestResolutionNote] = useState("Resolved in staff console.");
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
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("all");
  const [auditActorIdFilter, setAuditActorIdFilter] = useState("");
  const [auditTargetFilter, setAuditTargetFilter] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [banner, setBanner] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

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

    return { valid: true, detail: "" };
  }, [offeringForm, selectedOffering]);
  const requestResolutionDisabled = !selectedRequest?.active || !selectedRequestActionAllowed;
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
  const visibleAuditEvents = useMemo(
    () =>
      auditEvents.filter((item) => {
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

        return true;
      }),
    [auditActionFilter, auditActorFilter, auditActorIdFilter, auditEvents, auditTargetFilter, auditTargetTypeFilter],
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
  const offeringCreateValidation = useMemo(() => {
    const courseCode = normalizeCourseCode(offeringCreateForm.courseCode);
    const capacity = parseNonNegativeInteger(offeringCreateForm.capacity);

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

    return { valid: true, detail: "" };
  }, [
    courseCodeOptions,
    courses,
    offeringCreateForm.capacity,
    offeringCreateForm.courseCode,
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
      if (!visibleOfferings.length) {
        setOfferingForm(null);
        return "";
      }

      const nextOffering = visibleOfferings.find((item) => item.id === current) ?? visibleOfferings[0];
      setOfferingForm(buildOfferingForm(nextOffering));
      return nextOffering.id;
    });
  }, [visibleOfferings]);

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
            note: requestResolutionNote.trim() || "Resolved in staff console.",
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

  function getSelectableRowClass(isSelected) {
    return isSelected
      ? "portal-row portal-row--staff-selectable portal-row--selected portal-row--staff-selected"
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

  function toggleRequestSelection(requestId) {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function selectAllVisibleRequests() {
    setSelectedRequestIds(visibleRequests.map((item) => item.id));
  }

  function selectActiveVisibleRequests() {
    setSelectedRequestIds(visibleRequests.filter((item) => item.active).map((item) => item.id));
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
    };

    await runAction(
      `offering:${selectedOffering.id}`,
      () => updateAdminOffering(selectedOffering.id, patch, actorId),
      `Offering ${selectedOffering.courseCode} updated.`,
    );
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
      showBanner("success", `${created.course.code} created.`, "The new course is now available for offering setup.");
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
      setOfferingCreateForm((current) => ({
        ...buildDefaultOfferingCreateForm(current.courseCode),
        courseCode: current.courseCode,
      }));
      showBanner("success", `${created.offering.id} created.`, "The new offering is ready for review and further edits.");
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
            note: requestResolutionNote.trim() || "Resolved in staff console.",
          },
          actorId,
        ),
      `Request ${selectedRequest.id} ${formatResolutionPastTense(action)}.`,
    );
  }

  function handleConfirmResolveRequest(action) {
    if (!selectedRequest || !isResolutionActionAllowed(selectedRequest, selectedRequestOffering, action)) {
      return;
    }

    setConfirmAction({
      title: `${formatResolutionActionLabel(action)} for ${selectedRequest.id}?`,
      detail: buildRequestPreviewDetail(selectedRequest, action, requestPreviewImpact),
      onConfirm: () => handleResolveRequest(action),
    });
  }

  async function handleBatchResolve(action) {
    const resolvable = selectedVisibleRequests.filter((request) =>
      request.active && isResolutionActionAllowed(request, offeringById.get(request.offeringId), action),
    );

    if (!resolvable.length) {
      showBanner(
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
              note: requestResolutionNote.trim() || "Resolved in staff console.",
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
    <div className="portal">
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
          <label className="staff-toolbar__field">
            <span>Actor</span>
            <input value={actorId} onChange={(event) => setActorId(event.target.value)} />
          </label>
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
        </div>
      </div>

      <main className="portal-main portal-main--staff">
        <div className="page-header">
          <h2>Staff Administration</h2>
        </div>

        {banner ? <Banner tone={banner.tone} title={banner.title} detail={banner.detail} onClose={() => setBanner(null)} /> : null}

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
          <div className="staff-create-grid">
            <section className="page-panel">
              <h3>Create new course</h3>
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
                  <input value={courseForm.faculty} onChange={(event) => updateCourseForm("faculty", event.target.value)} />
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

            <section className="page-panel">
              <h3>Create new offering</h3>
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
                  <div className="staff-inline-actions">
                    <input type="time" value={offeringCreateForm.scheduleStart} onChange={(event) => updateOfferingCreateForm("scheduleStart", event.target.value)} />
                    <input type="time" value={offeringCreateForm.scheduleEnd} onChange={(event) => updateOfferingCreateForm("scheduleEnd", event.target.value)} />
                  </div>
                </div>
                <div className="staff-form-row">
                  <label>Venue</label>
                  <input value={offeringCreateForm.venue} onChange={(event) => updateOfferingCreateForm("venue", event.target.value)} placeholder="MWT 1 / Zoom" />
                </div>
                <div className="staff-form-row">
                  <label>Prerequisites</label>
                  <input value={offeringCreateForm.prerequisites} onChange={(event) => updateOfferingCreateForm("prerequisites", event.target.value)} placeholder="COMP7503, COMP7506" />
                </div>
                <div className="staff-form-row">
                  <label>Corequisites</label>
                  <input value={offeringCreateForm.corequisites} onChange={(event) => updateOfferingCreateForm("corequisites", event.target.value)} placeholder="STAT7601" />
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
          <div className="staff-grid">
            <section className="page-panel">
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
                            {offering.id === selectedOfferingId ? <span className="staff-selected-chip">Selected</span> : null}
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
                        <td colSpan={7}>No offerings match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel page-panel--focus">
              <h3>{selectedOffering ? `Editing existing offering · ${selectedOffering.courseCode}` : "Offering Editor"}</h3>
              {selectedOffering ? (
                <div className="staff-selection-banner" aria-live="polite">
                  <div className="staff-selection-banner__eyebrow">Selected offering</div>
                  <div className="staff-selection-banner__main">
                    <strong>{selectedOffering.courseCode}</strong>
                    <span className="staff-selection-banner__id">{selectedOffering.id}</span>
                  </div>
                  {selectedOffering.title ? <div className="staff-selection-banner__note">{selectedOffering.title}</div> : null}
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
                    <div className="staff-readonly-value">
                      <strong>{selectedOffering.seatsTaken}</strong>
                      <span>Derived from the current occupied seat roster.</span>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Waitlist Count</label>
                    <div className="staff-readonly-value">
                      <strong>{selectedOffering.waitlistCount}</strong>
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
          </>
        ) : null}

        {!loading && activeTab === "requests" ? (
          <div className="staff-grid">
            <section className="page-panel">
              <h3>Requests</h3>
              <div className="staff-summary-bar">
                <span>{requestSummary.total} total</span>
                <span>{requestSummary.active} active</span>
                <span>{requestSummary.queued} queued</span>
                <span>{requestSummary.waitlist} waitlist</span>
                <span>{requestSummary.visible} visible</span>
                <span>{requestSummary.selected} selected</span>
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
                <button type="button" className="mini-button" onClick={selectAllVisibleRequests} disabled={!visibleRequests.length}>
                  Select visible rows
                </button>
                <button type="button" className="mini-button" onClick={selectActiveVisibleRequests} disabled={!visibleRequests.some((item) => item.active)}>
                  Select active requests
                </button>
                <button type="button" className="mini-button" onClick={clearSelectedRequests} disabled={!selectedRequestIds.length}>
                  Clear
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Approve selected requests?",
                      detail: buildBatchResolveDetail("approve", requestBatchPreviews.approve),
                      onConfirm: () => handleBatchResolve("approve"),
                    })
                  }
                  disabled={!requestBatchPreviews.approve.eligibleCount}
                >
                  Batch Approve
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Waitlist selected requests?",
                      detail: buildBatchResolveDetail("waitlist", requestBatchPreviews.waitlist),
                      onConfirm: () => handleBatchResolve("waitlist"),
                    })
                  }
                  disabled={!requestBatchPreviews.waitlist.eligibleCount}
                >
                  Batch Waitlist
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Reject selected requests?",
                      detail: buildBatchResolveDetail("reject", requestBatchPreviews.reject),
                      onConfirm: () => handleBatchResolve("reject"),
                    })
                  }
                  disabled={!requestBatchPreviews.reject.eligibleCount}
                >
                  Batch Reject
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Close selected requests without outcome?",
                      detail: buildBatchResolveDetail("manual-close", requestBatchPreviews["manual-close"]),
                      onConfirm: () => handleBatchResolve("manual-close"),
                    })
                  }
                  disabled={!requestBatchPreviews["manual-close"].eligibleCount}
                >
                  Batch Close
                </button>
              </div>
              {selectedRequestCount ? (
                <div className="staff-impact-grid staff-impact-grid--compact" aria-live="polite">
                  <div className="staff-decision-card staff-decision-card--info">
                    <span className="staff-decision-card__label">Batch selection</span>
                    <strong>{formatRequestCount(selectedRequestCount)} selected</strong>
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
                      <th>Select</th>
                      <th>Request</th>
                      <th>Student</th>
                      <th>Offering</th>
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
                          className={getSelectableRowClass(request.id === selectedRequestId)}
                          onClick={() => setSelectedRequestId(request.id)}
                          onKeyDown={(event) => handleSelectableRowKeyDown(event, () => setSelectedRequestId(request.id))}
                          tabIndex={0}
                          aria-selected={request.id === selectedRequestId}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRequestIdSet.has(request.id)}
                              onChange={() => toggleRequestSelection(request.id)}
                              aria-label={`Select ${request.id}`}
                            />
                          </td>
                          <td>
                            <span className="staff-mono-cell" title={request.id}>{formatCompactId(request.id)}</span>
                          </td>
                          <td>{request.studentId}</td>
                          <td>{request.offeringId}</td>
                          <td>
                            <div className={`staff-workflow-pill staff-workflow-pill--${workflow.mode}`}>
                              <strong>{workflow.label}</strong>
                              <span>{request.active ? "Active" : "Closed"}</span>
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
                        <td colSpan={7}>No requests match the current filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-panel">
              <h3>Request Resolution</h3>
              {selectedRequest ? (
                <div className="staff-form-grid">
                  <div className="staff-selection-banner" aria-live="polite">
                    <div className="staff-selection-banner__eyebrow">Selected request</div>
                    <div className="staff-selection-banner__main">
                      <strong>{selectedRequest.id}</strong>
                      <span>{selectedRequest.offeringId}</span>
                    </div>
                    <div className="staff-selection-banner__note">
                      {selectedRequest.student?.name ?? selectedRequest.studentId} · {formatRequestStatusLabel(selectedRequest.status)}
                    </div>
                  </div>
                  <div className="staff-context-grid">
                    <div className={`staff-context-card staff-context-card--workflow staff-context-card--${selectedRequestWorkflow.mode}`}>
                      <span className="staff-context-card__label">Policy-aware workflow</span>
                      <strong className="staff-context-card__value">{selectedRequestWorkflow.label}</strong>
                      <div className="staff-context-list">
                        <span>{selectedRequestWorkflow.description}</span>
                        {selectedRequestWorkflow.warning ? <span>{selectedRequestWorkflow.warning}</span> : null}
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Student context</span>
                      <strong className="staff-context-card__value">
                        {selectedRequest.student?.name ?? selectedRequest.studentId}
                      </strong>
                      <div className="staff-context-list">
                        <span>{selectedRequest.student?.programme ?? "Programme unavailable"}</span>
                        <span>{selectedRequest.student?.email ?? "Email unavailable"}</span>
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Request timing</span>
                      <strong className="staff-context-card__value">{formatStaffDateTime(selectedRequest.submittedAt)}</strong>
                      <div className="staff-context-list">
                        <span>{selectedRequest.active ? "Active request" : "Closed request"}</span>
                        <span>{formatRequestStatusLabel(selectedRequest.status)}</span>
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Student-facing message</span>
                      <strong className="staff-context-card__value">
                        {selectedRequest.message ? "Message shown to student" : "No current message"}
                      </strong>
                      <div className="staff-context-list">
                        <span>{selectedRequest.message ?? "No student-facing message recorded."}</span>
                      </div>
                    </div>
                    <div className="staff-context-card">
                      <span className="staff-context-card__label">Resolution note</span>
                      <strong className="staff-context-card__value">
                        {selectedRequest.resolution ? "Office note recorded" : "No office note yet"}
                      </strong>
                      <div className="staff-context-list">
                        <span>{selectedRequest.resolution ?? "This request has not been resolved by the office."}</span>
                      </div>
                    </div>
                  </div>
                  <div className="staff-form-row">
                    <label>Preview action</label>
                    {allowedRequestActions.length ? (
                      <select value={requestPreviewAction} onChange={(event) => setRequestPreviewAction(event.target.value)}>
                        {RESOLUTION_ACTION_OPTIONS
                          .filter(([value]) => allowedRequestActions.includes(value))
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <div className="staff-readonly-value">
                        <strong>No action available</strong>
                        <span>{selectedRequestWorkflow.warning || "This request cannot be resolved again."}</span>
                      </div>
                    )}
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Resolution Note</label>
                    <textarea
                      className="staff-note-input"
                      value={requestResolutionNote}
                      onChange={(event) => setRequestResolutionNote(event.target.value)}
                    />
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
                          <span className="staff-decision-card__label">Status</span>
                          <strong>
                            {formatRequestStatusLabel(requestPreviewImpact.summary.statusBefore)} →{" "}
                            {formatRequestStatusLabel(requestPreviewImpact.summary.statusAfter)}
                          </strong>
                          <p>
                            {requestPreviewImpact.summary.activeAfter
                              ? "The request remains active after this action."
                              : "The request will be closed after this action."}
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
                          <p>{selectedRequest.offeringId}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="staff-inline-note">
                        {allowedRequestActions.length
                          ? "Choose an allowed action to inspect its impact before resolving the request."
                          : "This request is not eligible for staff resolution under its current workflow."}
                      </p>
                    )}
                  </div>
                  <div className="staff-inline-actions">
                    {RESOLUTION_ACTION_OPTIONS
                      .filter(([value]) => allowedRequestActions.includes(value))
                      .map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={value === "approve" ? "mini-button mini-button--primary" : "mini-button"}
                          onClick={() => handleConfirmResolveRequest(value)}
                          disabled={!selectedRequest?.active}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                  {requestResolutionDisabled ? (
                    <p className="staff-inline-note">
                      {selectedRequest?.active
                        ? "The selected preview action is not allowed for this workflow."
                        : "Only active requests can be resolved. Change the filters or select an active record."}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p>Select a request to resolve it.</p>
              )}
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "overrides" ? (
          <div className="staff-grid">
            <section className="page-panel">
              <h3>{overrideForm.studentId.trim() ? `Create override for student ${overrideForm.studentId.trim()}` : "Create Override"}</h3>
              <div className="staff-form-grid">
                <div className="staff-form-row">
                  <label>Student ID</label>
                  <input
                    value={overrideForm.studentId}
                    onChange={(event) => setOverrideForm((current) => ({ ...current, studentId: event.target.value }))}
                  />
                </div>
                <div className="staff-form-row">
                  <label>Offering</label>
                  <select
                    value={overrideForm.offeringId}
                    onChange={(event) =>
                      setOverrideForm((current) => ({
                        ...current,
                        offeringId: event.target.value,
                        constraintTypes: [],
                      }))}
                  >
                    <option value="">Select an offering</option>
                    {offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {offering.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-row staff-form-row--stacked">
                  <label>Constraint Types</label>
                  <div className="override-chip-grid" role="group" aria-label="Constraint types to bypass">
                    {OVERRIDE_OPTIONS.map((option) => {
                      const active = overrideForm.constraintTypes.includes(option.id);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={active ? "override-chip override-chip--active" : "override-chip"}
                          aria-pressed={active}
                          onClick={() => toggleOverrideConstraint(option.id)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="staff-form-row staff-form-row--stacked">
                  <label>Note</label>
                  <textarea
                    className="staff-note-input"
                    value={overrideForm.note}
                    onChange={(event) => setOverrideForm((current) => ({ ...current, note: event.target.value }))}
                  />
                </div>
                <div className="staff-inline-actions">
                  <button
                    type="button"
                    className="mini-button mini-button--primary"
                    onClick={handleCreateOverride}
                    disabled={!overrideValidation.valid || busyKey === "override:create"}
                  >
                    Create Override
                  </button>
                </div>
                {!overrideValidation.valid ? <p className="staff-inline-note">{overrideValidation.detail}</p> : null}
                <div className="staff-form-row staff-form-row--stacked">
                  <label>Override Impact Preview</label>
                  {overridePreviewBusy ? (
                    <div className="staff-decision-preview">
                      <p className="staff-inline-note">Checking how this override would affect the selected student and offering…</p>
                    </div>
                  ) : overrideImpact?.error ? (
                    <div className="staff-decision-preview">
                      <div className="staff-decision-card staff-decision-card--error">
                        <strong>{overrideImpact.error.headline}</strong>
                        <p>{overrideImpact.error.detail}</p>
                      </div>
                    </div>
                  ) : overrideImpact ? (
                    <div className="staff-decision-preview">
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.currentDecision)}`}>
                        <span className="staff-decision-card__label">Current decision</span>
                        <strong>{overrideImpact.currentDecision.headline}</strong>
                        {overrideImpact.currentDecision.reasons?.length ? <p>{overrideImpact.currentDecision.reasons[0]}</p> : null}
                      </div>
                      <div className={`staff-decision-card staff-decision-card--${formatDecisionTone(overrideImpact.overrideDecision)}`}>
                        <span className="staff-decision-card__label">With override</span>
                        <strong>{overrideImpact.overrideDecision.headline}</strong>
                        {overrideImpact.overrideDecision.reasons?.length ? <p>{overrideImpact.overrideDecision.reasons[0]}</p> : null}
                      </div>
                      <div className="staff-inline-note">
                        {buildOverrideImpactNote(overrideImpact)}
                      </div>
                      {!hasOverrideImpactChange(overrideImpact) ? (
                        <div className="staff-inline-note">
                          The current blocker may be different from the chip selection above. Re-check the current decision before saving the override.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="staff-decision-preview">
                      <p className="staff-inline-note">Select a student, offering, and at least one constraint type to preview the override impact.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="page-panel">
              <h3>Active Overrides</h3>
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
                <h4>Override Detail</h4>
                {selectedOverride ? (
                  <div className="staff-form-grid staff-form-grid--compact">
                    <div className="staff-selection-banner">
                      <div className="staff-selection-banner__eyebrow">Selected override</div>
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
                        <div className="staff-context-list">
                          <span>Override applies only to this offering.</span>
                        </div>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Created by</span>
                        <strong className="staff-context-card__value">{selectedOverride.createdBy ?? "Unknown actor"}</strong>
                        <div className="staff-context-list">
                          <span>{formatStaffDateTime(selectedOverride.createdAt)}</span>
                        </div>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Constraint types</span>
                        <strong className="staff-context-card__value">
                          {selectedOverride.constraintTypes?.length ?? 0} selected
                        </strong>
                        <div className="staff-chip-list">
                          {(selectedOverride.constraintTypes ?? []).map((constraintType) => {
                            const option = OVERRIDE_OPTIONS.find((item) => item.id === constraintType);
                            return (
                              <span key={constraintType} className="staff-chip">
                                {option?.label ?? constraintType}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="staff-context-card">
                        <span className="staff-context-card__label">Office note</span>
                        <strong className="staff-context-card__value">
                          {selectedOverride.note ? "Note attached" : "No note attached"}
                        </strong>
                        <div className="staff-context-list">
                          <span>{selectedOverride.note || "No note was recorded for this override."}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="staff-inline-note">Select an override to inspect its exact scope, note, and constraint types.</p>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && activeTab === "audit" ? (
          <div className="page-stack">
            <section className="page-panel">
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
                  className={!auditActionFilter ? "mini-button mini-button--active" : "mini-button"}
                  onClick={() => setAuditActionFilter("")}
                >
                  Clear
                </button>
              </div>
              <div className="staff-table-controls">
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
              </div>
            </section>
            <section className="page-panel">
              <h3>Audit Trail</h3>
              <div className="table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Subject Student</th>
                      <th>Summary</th>
                      <th>State change</th>
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
                          <td>{formatAuditTargetLabel(event)}</td>
                          <td>{event.subjectStudentId ?? "—"}</td>
                          <td>
                            <div className="staff-audit-cell">
                              <strong>{buildAuditEventSummary(event)}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="staff-audit-cell staff-audit-cell--muted">
                              <span>{buildAuditEventChange(event)}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>No audit events match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="page-panel">
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
                      <span className="staff-mono-cell" title={selectedAuditEvent.id}>{formatCompactId(selectedAuditEvent.id)}</span>
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
