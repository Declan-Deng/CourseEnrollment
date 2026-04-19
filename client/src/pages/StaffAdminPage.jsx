import { useEffect, useMemo, useState } from "react";
import {
  createAdminOverride,
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
  buildDefaultOverrideForm,
  buildOfferingForm,
  buildOfferingPreviewDetail,
  buildOverrideImpactNote,
  buildRequestPreviewDetail,
  compactJson,
  formatDecisionTone,
  formatPolicyLabel,
  formatRequestStatusLabel,
  formatResolutionActionLabel,
  formatStaffTimestamp,
  formatWindow,
  hasOverrideImpactChange,
  includesText,
  matchesOfferingWindow,
  OVERRIDE_OPTIONS,
  parseNonNegativeInteger,
  REQUEST_STATUS_OPTIONS,
  STAFF_TABS,
  toErrorHeadline,
  toFriendlyError,
} from "../staffConsoleModel";

export function StaffAdminPage({ onReturnToPortal }) {
  const [activeTab, setActiveTab] = useState("offerings");
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [actorId, setActorId] = useState(DEFAULT_STAFF_ACTOR_ID);
  const [offerings, setOfferings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [offeringForm, setOfferingForm] = useState(null);
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
  const [overrideImpact, setOverrideImpact] = useState(null);
  const [overridePreviewBusy, setOverridePreviewBusy] = useState(false);
  const [offeringImpact, setOfferingImpact] = useState(null);
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

  async function loadAll(nextActorId = actorId) {
    const [nextOfferings, nextRequests, nextOverrides, nextAuditEvents] = await Promise.all([
      fetchAdminOfferings(nextActorId),
      fetchAdminRequests({}, nextActorId),
      fetchAdminOverrides({}, nextActorId),
      fetchAdminAudit({}, nextActorId),
    ]);

    setOfferings(nextOfferings);
    setRequests(nextRequests);
    setOverrides(nextOverrides);
    setAuditEvents(nextAuditEvents);
    setLastLoadedAt(new Date().toISOString());

    const resolvedOffering =
      nextOfferings.find((item) => item.id === selectedOfferingId) ??
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
      preferredRequests.find((item) => item.id === selectedRequestId) ??
      preferredRequests[0] ??
      nextRequests[0] ??
      null;

    setSelectedRequestId(resolvedRequest?.id ?? "");
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
  const selectedRequestIdSet = useMemo(() => new Set(selectedRequestIds), [selectedRequestIds]);
  const selectedVisibleRequests = useMemo(
    () => visibleRequests.filter((item) => selectedRequestIdSet.has(item.id)),
    [selectedRequestIdSet, visibleRequests],
  );
  const selectedActiveRequestCount = useMemo(
    () => selectedVisibleRequests.filter((request) => request.active).length,
    [selectedVisibleRequests],
  );
  const offeringValidation = useMemo(() => {
    if (!selectedOffering || !offeringForm) {
      return { valid: false, detail: "Select an offering before editing its shared state." };
    }

    const capacity = parseNonNegativeInteger(offeringForm.capacity);
    const seatsTaken = parseNonNegativeInteger(offeringForm.seatsTaken);
    const waitlistCount = parseNonNegativeInteger(offeringForm.waitlistCount);

    if (capacity === null || seatsTaken === null || waitlistCount === null) {
      return { valid: false, detail: "Capacity, seats taken, and waitlist must all be non-negative integers." };
    }

    if (capacity < seatsTaken) {
      return { valid: false, detail: "Capacity cannot be lower than seats taken." };
    }

    return { valid: true, detail: "" };
  }, [offeringForm, selectedOffering]);
  const requestResolutionDisabled = !selectedRequest?.active;
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
    setSelectedRequestIds((current) => current.filter((id) => visibleRequests.some((item) => item.id === id)));
  }, [visibleRequests]);

  useEffect(() => {
    setSelectedAuditId((current) => {
      if (!visibleAuditEvents.length) {
        return "";
      }

      return visibleAuditEvents.some((item) => item.id === current) ? current : visibleAuditEvents[0].id;
    });
  }, [visibleAuditEvents]);

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
            seatsTaken: Number.parseInt(offeringForm.seatsTaken, 10),
            waitlistCount: Number.parseInt(offeringForm.waitlistCount, 10),
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
      if (!selectedRequest || requestResolutionDisabled) {
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
  }, [actorId, requestPreviewAction, requestResolutionDisabled, requestResolutionNote, selectedRequest]);

  function showBanner(tone, title, detail) {
    setBanner({ tone, title, detail });
  }

  function selectOffering(offering) {
    setSelectedOfferingId(offering.id);
    setOfferingForm(buildOfferingForm(offering));
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
      seatsTaken: Number.parseInt(offeringForm.seatsTaken, 10),
      waitlistCount: Number.parseInt(offeringForm.waitlistCount, 10),
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

  async function handleResolveRequest(action) {
    if (!selectedRequest) {
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
      `Request ${selectedRequest.id} resolved as ${action}.`,
    );
  }

  function handleConfirmResolveRequest(action) {
    if (!selectedRequest || requestResolutionDisabled) {
      return;
    }

    setConfirmAction({
      title: `Resolve ${selectedRequest.id} as ${action}?`,
      detail: buildRequestPreviewDetail(selectedRequest, action, requestPreviewImpact),
      onConfirm: () => handleResolveRequest(action),
    });
  }

  async function handleBatchResolve(action) {
    const resolvable = selectedVisibleRequests.filter((request) => request.active);

    if (!resolvable.length) {
      showBanner("error", "No active requests selected.", "Select one or more active requests before running a batch action.");
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
          `${succeeded.length} request(s) resolved as ${action}; ${failed.length} failed.`,
          `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`,
        );
        return;
      }

      if (failed.length) {
        const firstFailure = failed[0];
        showBanner("error", toErrorHeadline(firstFailure.error), `${firstFailure.id}: ${toFriendlyError(firstFailure.error)}`);
        return;
      }

      showBanner("success", `${succeeded.length} request(s) resolved as ${action}.`, "The shared state has been refreshed.");
    } catch (error) {
      showBanner("error", toErrorHeadline(error), toFriendlyError(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreateOverride() {
    if (!overrideForm.studentId.trim()) {
      showBanner("error", "Student ID is required.", "Enter a student ID before creating an override.");
      return;
    }

    if (!overrideForm.offeringId) {
      showBanner("error", "Offering is required.", "Choose the target offering before creating an override.");
      return;
    }

    if (!overrideForm.constraintTypes.length) {
      showBanner(
        "error",
        "Select at least one constraint.",
        "Choose the exact constraint types that should be bypassed for this student.",
      );
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
      selected: selectedActiveRequestCount,
    }),
    [requests, selectedActiveRequestCount, visibleRequests.length],
  );
  const requestBatchPreview = useMemo(() => {
    const selectedCount = selectedVisibleRequests.length;
    const eligibleCount = selectedActiveRequestCount;
    const skippedCount = Math.max(selectedCount - eligibleCount, 0);
    const queuedCount = selectedVisibleRequests.filter(
      (request) => request.status === "lotteryQueued" || request.status === "pendingReview",
    ).length;
    const waitlistCount = selectedVisibleRequests.filter((request) => request.status === "waitlist" && request.active).length;

    return {
      selectedCount,
      eligibleCount,
      skippedCount,
      queuedCount,
      waitlistCount,
    };
  }, [selectedActiveRequestCount, selectedVisibleRequests]);

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
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onReturnToPortal}>
            Student Portal
          </button>
        </div>
      </div>

      <main className="portal-main portal-main--staff">
        <div className="page-header">
          <h2>Staff Administration</h2>
          <p className="message">Manage shared offerings, resolve requests, and create targeted overrides.</p>
        </div>

        {banner ? <Banner tone={banner.tone} title={banner.title} detail={banner.detail} onClose={() => setBanner(null)} /> : null}

        {!loading ? (
          <section className="page-panel page-panel--danger">
            <h3>Danger Zone</h3>
            <div className="danger-zone danger-zone--collapsed">
              <div className="danger-zone__summary">
                <p>Reset every student, request, override, audit event, and shared offering back to the seed baseline.</p>
              </div>
              <button
                type="button"
                className={dangerExpanded ? "mini-button mini-button--danger" : "mini-button"}
                onClick={() => setDangerExpanded((current) => !current)}
                aria-expanded={dangerExpanded}
                aria-controls="staff-danger-zone"
              >
                {dangerExpanded ? "Hide danger actions" : "Show danger actions"}
              </button>
            </div>
            {dangerExpanded ? (
              <div id="staff-danger-zone" className="danger-zone danger-zone--actions">
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
            ) : null}
          </section>
        ) : null}

        {loading ? (
          <div className="page-panel">
            <p>Loading staff data…</p>
          </div>
        ) : null}

        {!loading && activeTab === "offerings" ? (
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
                    <option value="firstComeFirstServed">firstComeFirstServed</option>
                    <option value="lottery">lottery</option>
                    <option value="priorityReview">priorityReview</option>
                    <option value="locked">locked</option>
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
                <table className="portal-table">
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
                        className={offering.id === selectedOfferingId ? "portal-row portal-row--selected" : "portal-row"}
                        onClick={() => selectOffering(offering)}
                      >
                        <td>
                          <strong>{offering.courseCode}</strong>
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

            <section className="page-panel">
              <h3>Offering Editor</h3>
              {selectedOffering && offeringForm ? (
                <div className="staff-form-grid">
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
                    <input
                      value={offeringForm.seatsTaken}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, seatsTaken: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Waitlist Count</label>
                    <input
                      value={offeringForm.waitlistCount}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, waitlistCount: event.target.value }))}
                    />
                  </div>
                  <div className="staff-form-row">
                    <label>Allocation Policy</label>
                    <select
                      value={offeringForm.allocationPolicy}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, allocationPolicy: event.target.value }))}
                    >
                      <option value="firstComeFirstServed">firstComeFirstServed</option>
                      <option value="lottery">lottery</option>
                      <option value="priorityReview">priorityReview</option>
                      <option value="locked">locked</option>
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
                      <input
                        value={offeringForm.requestWindowClosesOn}
                        onChange={(event) =>
                          setOfferingForm((current) => ({ ...current, requestWindowClosesOn: event.target.value }))
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
                      <input
                        value={offeringForm.dropWindowClosesOn}
                        onChange={(event) =>
                          setOfferingForm((current) => ({ ...current, dropWindowClosesOn: event.target.value }))
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
                      <div className="staff-impact-grid">
                        <div className="staff-decision-card staff-decision-card--info">
                          <span className="staff-decision-card__label">Seats</span>
                          <strong>
                            {offeringImpact.summary.availableSeatsBefore} → {offeringImpact.summary.availableSeatsAfter}
                          </strong>
                          <p>Available seats delta: {offeringImpact.summary.seatsDelta}</p>
                        </div>
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
                              : "Window remains open"}
                          </strong>
                          <p>
                            {offeringImpact.summary.requestWindowClosingNow
                              ? "Request window closes immediately with this update."
                              : offeringImpact.summary.dropWindowClosingNow
                                ? "Drop window closes immediately with this update."
                                : "No immediate window closure."}
                          </p>
                        </div>
                      </div>
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
                <span>{requestSummary.selected} selected active</span>
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
                  Select visible
                </button>
                <button type="button" className="mini-button" onClick={selectActiveVisibleRequests} disabled={!visibleRequests.some((item) => item.active)}>
                  Select active
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
                      detail: buildBatchResolveDetail("approve", requestBatchPreview),
                      onConfirm: () => handleBatchResolve("approve"),
                    })
                  }
                  disabled={!selectedActiveRequestCount}
                >
                  Batch Approve
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Waitlist selected requests?",
                      detail: buildBatchResolveDetail("waitlist", requestBatchPreview),
                      onConfirm: () => handleBatchResolve("waitlist"),
                    })
                  }
                  disabled={!selectedActiveRequestCount}
                >
                  Batch Waitlist
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Reject selected requests?",
                      detail: buildBatchResolveDetail("reject", requestBatchPreview),
                      onConfirm: () => handleBatchResolve("reject"),
                    })
                  }
                  disabled={!selectedActiveRequestCount}
                >
                  Batch Reject
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Manual close selected requests?",
                      detail: buildBatchResolveDetail("manual-close", requestBatchPreview),
                      onConfirm: () => handleBatchResolve("manual-close"),
                    })
                  }
                  disabled={!selectedActiveRequestCount}
                >
                  Batch Close
                </button>
              </div>
              {requestBatchPreview.selectedCount ? (
                <div className="staff-impact-grid staff-impact-grid--compact" aria-live="polite">
                  <div className="staff-decision-card staff-decision-card--info">
                    <span className="staff-decision-card__label">Batch selection</span>
                    <strong>{requestBatchPreview.selectedCount} request(s) selected</strong>
                    <p>{requestBatchPreview.queuedCount} queued and {requestBatchPreview.waitlistCount} currently on waitlist.</p>
                  </div>
                  <div className="staff-decision-card staff-decision-card--success">
                    <span className="staff-decision-card__label">Eligible now</span>
                    <strong>{requestBatchPreview.eligibleCount} active request(s)</strong>
                    <p>These can be approved, rejected, waitlisted, or manually closed right away.</p>
                  </div>
                  <div className={requestBatchPreview.skippedCount ? "staff-decision-card staff-decision-card--warn" : "staff-decision-card staff-decision-card--neutral"}>
                    <span className="staff-decision-card__label">Skipped</span>
                    <strong>{requestBatchPreview.skippedCount} request(s)</strong>
                    <p>
                      {requestBatchPreview.skippedCount
                        ? "Inactive requests will be ignored by batch actions."
                        : "No skipped records in the current selection."}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Request</th>
                      <th>Student</th>
                      <th>Offering</th>
                      <th>Status</th>
                      <th>Active</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.length ? (
                      visibleRequests.map((request) => (
                        <tr
                          key={request.id}
                          className={request.id === selectedRequestId ? "portal-row portal-row--selected" : "portal-row"}
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRequestIdSet.has(request.id)}
                              onChange={() => toggleRequestSelection(request.id)}
                              aria-label={`Select ${request.id}`}
                            />
                          </td>
                          <td>{request.id}</td>
                          <td>{request.studentId}</td>
                          <td>{request.offeringId}</td>
                          <td>{formatRequestStatusLabel(request.status)}</td>
                          <td>{request.active ? "Yes" : "No"}</td>
                          <td>{request.message ?? "—"}</td>
                        </tr>
                      ))
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
                  <div className="staff-form-row">
                    <label>Request ID</label>
                    <div>{selectedRequest.id}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Student</label>
                    <div>{selectedRequest.studentId}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Offering</label>
                    <div>{selectedRequest.offeringId}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Status</label>
                    <div>{formatRequestStatusLabel(selectedRequest.status)}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Preview action</label>
                    <select value={requestPreviewAction} onChange={(event) => setRequestPreviewAction(event.target.value)}>
                      <option value="approve">Approve</option>
                      <option value="reject">Reject</option>
                      <option value="waitlist">Waitlist</option>
                      <option value="manual-close">Manual close</option>
                    </select>
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
                          <span className="staff-decision-card__label">Enrollment</span>
                          <strong>{requestPreviewImpact.summary.enrollmentCreated ? "Enrollment will be created" : "No new enrollment"}</strong>
                          <p>{selectedRequest.offeringId}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="staff-inline-note">Choose a preview action to inspect its impact before resolving the request.</p>
                    )}
                  </div>
                  <div className="staff-inline-actions">
                    <button
                      type="button"
                      className="mini-button mini-button--primary"
                      onClick={() => handleConfirmResolveRequest("approve")}
                      disabled={requestResolutionDisabled}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => handleConfirmResolveRequest("reject")}
                      disabled={requestResolutionDisabled}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => handleConfirmResolveRequest("waitlist")}
                      disabled={requestResolutionDisabled}
                    >
                      Waitlist
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => handleConfirmResolveRequest("manual-close")}
                      disabled={requestResolutionDisabled}
                    >
                      Manual Close
                    </button>
                  </div>
                  {requestResolutionDisabled ? (
                    <p className="staff-inline-note">Only active requests can be resolved. Change the filters or select an active record.</p>
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
              <h3>Create Override</h3>
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
                  <button type="button" className="mini-button mini-button--primary" onClick={handleCreateOverride}>
                    Create Override
                  </button>
                </div>
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
                <table className="portal-table">
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
                        <tr key={override.id}>
                          <td>{override.id}</td>
                          <td>{override.studentId}</td>
                          <td>{override.offeringId}</td>
                          <td>{override.constraintTypes.join(", ")}</td>
                          <td>{override.createdBy}</td>
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
                  request-resolved
                </button>
                <button
                  type="button"
                  className={auditActionFilter === "offering-updated" ? "mini-button mini-button--active" : "mini-button"}
                  onClick={() => setAuditActionFilter("offering-updated")}
                >
                  offering-updated
                </button>
                <button
                  type="button"
                  className={auditActionFilter === "override-created" ? "mini-button mini-button--active" : "mini-button"}
                  onClick={() => setAuditActionFilter("override-created")}
                >
                  override-created
                </button>
                <button
                  type="button"
                  className={auditActionFilter === "override-deactivated" ? "mini-button mini-button--active" : "mini-button"}
                  onClick={() => setAuditActionFilter("override-deactivated")}
                >
                  override-removed
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
                    <option value="student">student</option>
                    <option value="staff">staff</option>
                    <option value="system">system</option>
                  </select>
                </label>
                <label className="staff-toolbar__field">
                  <span>Action</span>
                  <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                    <option value="">All</option>
                    {auditActionOptions.map((action) => (
                      <option key={action} value={action}>
                        {action}
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
                        {targetType}
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
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAuditEvents.length ? (
                      visibleAuditEvents.map((event) => (
                        <tr
                          key={event.id}
                          className={event.id === selectedAuditId ? "portal-row portal-row--selected" : "portal-row"}
                          onClick={() => setSelectedAuditId(event.id)}
                        >
                          <td>{event.timestamp}</td>
                          <td>{event.actorType}:{event.actorId}</td>
                          <td>{event.action}</td>
                          <td>{event.targetType}:{event.targetId}</td>
                          <td>{event.subjectStudentId ?? "—"}</td>
                          <td>{compactJson(event.before)}</td>
                          <td>{compactJson(event.after)}</td>
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
                  <div className="staff-form-row">
                    <label>Actor</label>
                    <div>{selectedAuditEvent.actorType}:{selectedAuditEvent.actorId}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Action</label>
                    <div>{selectedAuditEvent.action}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Target</label>
                    <div>{selectedAuditEvent.targetType}:{selectedAuditEvent.targetId}</div>
                  </div>
                  <div className="staff-form-row">
                    <label>Student</label>
                    <div>{selectedAuditEvent.subjectStudentId ?? "—"}</div>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>Before</label>
                    <pre className="staff-json-block">{JSON.stringify(selectedAuditEvent.before, null, 2) || "—"}</pre>
                  </div>
                  <div className="staff-form-row staff-form-row--stacked">
                    <label>After</label>
                    <pre className="staff-json-block">{JSON.stringify(selectedAuditEvent.after, null, 2) || "—"}</pre>
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
