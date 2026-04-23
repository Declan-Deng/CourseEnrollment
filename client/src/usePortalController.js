import { useEffect, useRef, useState } from "react";
import {
  cancelRequest,
  dropCourse,
  fetchBootstrap,
  previewDecision,
  resetDemo,
  submitRequest,
} from "./api";
import {
  applySnapshot,
  buildInfoDialog,
  buildLockedDropDialog,
  buildRecordDialog,
  countCourseGroups,
  getCourseGroup,
  getPrimaryAction,
} from "./portalModel";

export function usePortalController() {
  const toastIdRef = useRef(0);
  const [data, setData] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ active: false, label: "" });
  const [activePage, setActivePage] = useState("add");
  const [addCoursePreset, setAddCoursePreset] = useState("all");
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [busyCourseId, setBusyCourseId] = useState(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(null);
  const [statusToast, setStatusToast] = useState(null);
  const [recentCourseUpdate, setRecentCourseUpdate] = useState(null);
  const [infoDialog, setInfoDialog] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  function applyDataSnapshot(snapshot, nextSelectedCourseId = null) {
    applySnapshot(snapshot, nextSelectedCourseId, {
      setData,
      setSelectedCourseId,
    });
    setLastUpdatedAt(snapshot?.meta?.fetchedAt ?? new Date().toISOString());
    setError("");
  }

  function showFailureBanner(title, failure) {
    const detail = failure instanceof Error ? failure.message : String(failure);
    setError(detail);
    setBanner({
      tone: "error",
      title,
      detail,
    });
  }

  async function runBusyTask(busyId, task, failureTitle) {
    setBusyCourseId(busyId);

    try {
      return await task();
    } catch (failure) {
      showFailureBanner(failureTitle, failure);
      return null;
    } finally {
      setBusyCourseId(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        setSyncStatus({
          active: true,
          label: "Loading the latest enrolment data…",
        });
        applyDataSnapshot(await fetchBootstrap());
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setSyncStatus({
          active: false,
          label: "",
        });
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!statusToast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setStatusToast(null);
    }, 10050);

    return () => window.clearTimeout(timer);
  }, [statusToast]);

  useEffect(() => {
    if (!recentCourseUpdate) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRecentCourseUpdate(null);
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [recentCourseUpdate]);

  useEffect(() => {
    if (!data?.student?.id) {
      return undefined;
    }

    if (!["add", "results", "cancel"].includes(activePage)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (busyCourseId || confirmAction || infoDialog || syncStatus.active) {
        return;
      }

      refresh(selectedCourseId, "Checking for updates…").catch(() => {
        // Auto-refresh should stay quiet; explicit refresh/action paths already surface failures.
      });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [
    activePage,
    busyCourseId,
    confirmAction,
    data?.student?.id,
    infoDialog,
    selectedCourseId,
    syncStatus.active,
  ]);

  function setSelection(course) {
    setSelectedCourseId(course.id);
  }

  function handleSelectCourse(courseId) {
    const course = data?.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    setSelection(course);
  }

  async function refresh(nextSelectedCourseId = selectedCourseId, syncLabel = "Refreshing the latest state…") {
    setSyncStatus({
      active: true,
      label: syncLabel,
    });

    try {
      const snapshot = await fetchBootstrap({ studentId: data?.student?.id });
      applyDataSnapshot(snapshot, nextSelectedCourseId);
      return snapshot;
    } finally {
      setSyncStatus({
        active: false,
        label: "",
      });
    }
  }

  function showStatusToast(toast) {
    toastIdRef.current += 1;
    setStatusToast({
      id: toastIdRef.current,
      ...toast,
    });
  }

  function buildAvailabilityToast(actionKey, course, nextSnapshot) {
    const beforeCounts = countCourseGroups(data?.courses ?? []);
    const afterCounts = countCourseGroups(nextSnapshot?.courses ?? []);

    if (actionKey === "request" && beforeCounts.requestable > 0 && afterCounts.requestable === 0) {
      return {
        tone: "warn",
        title: "No requestable courses left.",
        detail:
          "Your plan was re-checked after this request. Remaining offerings have moved into Enrolled, Active Requests, or Blocked / Closed.",
      };
    }

    if ((actionKey === "cancel" || actionKey === "drop") && afterCounts.requestable > beforeCounts.requestable) {
      return {
        tone: "success",
        title: "More courses are requestable now.",
        detail: `Requestable offerings increased from ${beforeCounts.requestable} to ${afterCounts.requestable} after updating ${course.code}.`,
      };
    }

    if (actionKey === "request" && afterCounts.enrolled > beforeCounts.enrolled) {
      return {
        tone: "success",
        title: `${course.code} moved into Enrolled.`,
        detail: `Your plan updated immediately. Requestable offerings are now ${afterCounts.requestable}.`,
      };
    }

    if (actionKey === "request" && afterCounts.active > beforeCounts.active) {
      return {
        tone: "info",
        title: `${course.code} moved into Active Requests.`,
        detail: `Track it in the Active Requests group. Requestable offerings are now ${afterCounts.requestable}.`,
      };
    }

    if (
      beforeCounts.requestable !== afterCounts.requestable ||
      beforeCounts.blocked !== afterCounts.blocked
    ) {
      return {
        tone: "info",
        title: "Course availability updated.",
        detail: `Requestable: ${beforeCounts.requestable} -> ${afterCounts.requestable}. Blocked / Closed: ${beforeCounts.blocked} -> ${afterCounts.blocked}.`,
      };
    }

    return null;
  }

  function buildCourseUpdate(actionKey, course, nextSnapshot) {
    const nextCourse = nextSnapshot?.courses?.find((item) => item.id === course.id);
    const nextGroup = nextCourse ? getCourseGroup(nextCourse) : null;

    if (actionKey === "request") {
      if (nextGroup === "enrolled") {
        return {
          courseId: course.id,
          tone: "success",
          title: "Approved immediately",
          detail: `${course.code} moved into Current Enrolment.`,
        };
      }

      if (nextGroup === "active") {
        return {
          courseId: course.id,
          tone: "info",
          title: "Moved to Active Requests",
          detail: `${course.code} is now tracked in Active Requests.`,
        };
      }

      return {
        courseId: course.id,
        tone: "warn",
        title: "Plan updated",
        detail: `${course.code} was rechecked under your current plan.`,
      };
    }

    if (actionKey === "cancel") {
      return {
        courseId: course.id,
        tone: "warn",
        title: "Request withdrawn",
        detail:
          nextGroup === "requestable"
            ? `${course.code} can be requested again from Course Center.`
            : `${course.code} left the active request pipeline.`,
      };
    }

    return {
      courseId: course.id,
      tone: "warn",
      title: "Dropped from Current Enrolment",
        detail:
        nextGroup === "requestable"
          ? `${course.code} was removed and is now available to request again.`
          : `${course.code} was removed and related rule checks were refreshed.`,
    };
  }

  async function handlePreview(courseId) {
    const currentStudentId = data?.student?.id;

    await runBusyTask(
      courseId,
      async () => {
        const result = await previewDecision(courseId, { studentId: currentStudentId });
        const course = data?.courses.find((item) => item.id === courseId);

        if (!course) {
          return;
        }

        setSelection(course);
        setInfoDialog(buildInfoDialog(result, course));
        setError("");
      },
      "Preview failed.",
    );
  }

  async function runPrimaryAction(course) {
    const action = getPrimaryAction(course);
    const beforeCounts = countCourseGroups(data?.courses ?? []);
    const currentStudentId = data?.student?.id;
    const result = await runBusyTask(
      course.id,
      async () => {
        let result;

        if (action.key === "request") {
          result = await submitRequest(course.id, { studentId: currentStudentId });
        } else if (action.key === "cancel") {
          result = await cancelRequest(course.id, { studentId: currentStudentId });
        } else {
          result = await dropCourse(course.id, { studentId: currentStudentId });
        }

        const snapshot = await refresh(course.id, `Updating ${course.code}…`);
        return { decision: result, snapshot };
      },
      "Action failed.",
    );

    if (!result) {
      return;
    }

    setInfoDialog(null);
    setRecentCourseUpdate(buildCourseUpdate(action.key, course, result.snapshot));
    const availabilityToast = buildAvailabilityToast(action.key, course, result.snapshot);
    const afterCounts = countCourseGroups(result.snapshot?.courses ?? []);

    showStatusToast(
      availabilityToast ?? {
        tone: result.decision.tone === "error" ? "error" : beforeCounts.requestable === afterCounts.requestable ? "success" : "info",
        title: result.decision.headline,
        detail: result.decision.reasons?.[0] ?? `${course.code} was updated.`,
      },
    );
  }

  function handlePrimaryAction(course) {
    const action = getPrimaryAction(course);

    if (action.disabled) {
      setInfoDialog(
        action.key === "drop" && !course.dropOpen
          ? buildLockedDropDialog(course)
          : buildInfoDialog(course.preview, course),
      );
      return;
    }

    if (action.key === "drop") {
      setConfirmAction({
        course,
        title: `Drop ${course.code}?`,
        detail: "This will remove the approved course from your current plan and refresh all related rule checks.",
      });
      return;
    }

    if (action.key === "cancel") {
      setConfirmAction({
        course,
        title: `Withdraw request for ${course.code}?`,
        detail: "This will withdraw the course from your active request pipeline.",
      });
      return;
    }

    runPrimaryAction(course);
  }

  function openAddPage(preset = "all") {
    setAddCoursePreset(preset);
    setActivePage("add");
  }

  function handleTopLinkClick(link) {
    if (link.id === "regulations") {
      window.open(link.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (link.id === "enrolment") {
      setBanner(null);
      setActivePage("online");
      return;
    }

    if (link.id === "timetable") {
      setBanner(null);
      setActivePage("timetable");
      return;
    }

    if (link.id === "contact") {
      setBanner(null);
      setActivePage("contact");
      return;
    }

    if (link.id === "password") {
      setBanner(null);
      setActivePage("password");
      return;
    }

    runBusyTask(
      "logout",
      async () => {
        const snapshot = await resetDemo(data?.student?.id ? { studentId: data.student.id } : null);
        applyDataSnapshot(snapshot);
        setBanner(null);
        setInfoDialog(null);
        setConfirmAction(null);
        setActivePage("logout");
        showStatusToast({
          tone: "success",
          title: "Signed out successfully.",
          detail: "The session was restored to its default starting state.",
        });
      },
      "Logout failed.",
    );
  }

  function handleNavigation(target) {
    const navigation =
      typeof target === "string"
        ? { page: target }
        : target && typeof target === "object"
          ? target
          : { page: "add" };
    const { page, courseId } = navigation;

    if (page === "enrolled") {
      openAddPage("enrolled");
      setBanner({
        tone: "success",
        title: "Drop view moved into Add Course.",
        detail: "You are now seeing only enrolled offerings. Use the Drop action on any approved row.",
      });
      return;
    }

    if (page === "add") {
      if (courseId) {
        setSelectedCourseId(courseId);
      }
      openAddPage();
      return;
    }

    if (courseId) {
      setSelectedCourseId(courseId);
    }

    setActivePage(page);
  }

  async function handleReset() {
    const snapshot = await runBusyTask(
      "reset",
      async () => {
        setSyncStatus({
          active: true,
          label: "Restoring the current state…",
        });
        try {
          return await resetDemo(data?.student?.id ? { studentId: data.student.id } : null);
        } finally {
          setSyncStatus({
            active: false,
            label: "",
          });
        }
      },
      "Reset failed.",
    );

    if (!snapshot) {
      return;
    }

    applyDataSnapshot(snapshot);
    setInfoDialog(null);
    setBanner({
      tone: "success",
      title: "Session reset.",
      detail: "All enrolment, cancellation, and drop changes were restored to the default starting state.",
    });
    showStatusToast({
      tone: "info",
      title: "State restored.",
      detail: "Requestable, active, and blocked groups were recalculated from the clean starting state.",
    });
  }

  function handleRecordPreview(record) {
    setSelection(record.course);
    setInfoDialog(buildRecordDialog(record));
  }

  return {
    data,
    systemMeta: {
      lastUpdatedAt,
      isSyncing: syncStatus.active,
      syncLabel: syncStatus.label,
    },
    activePage,
    addCoursePreset,
    busyCourseId,
    error,
    banner,
    statusToast,
    recentCourseUpdate,
    infoDialog,
    confirmAction,
    selectedCourse: data?.courses.find((course) => course.id === selectedCourseId) ?? null,
    activeRequests: data
      ? data.requestStatusView?.activeRequests ?? data.activeRequestRecords ?? data.requestRecords
      : [],
    handleTopLinkClick,
    handleNavigation,
    handleReset,
    handleRefresh: async () => {
      const snapshot = await runBusyTask(
        "refresh",
        async () => refresh(selectedCourseId, "Refreshing the latest state…"),
        "Refresh failed.",
      );

      if (!snapshot) {
        return;
      }

      setBanner({
        tone: "success",
        title: "State refreshed.",
        detail: "The latest enrolment data and course availability are now in view.",
      });
    },
    handleSelectCourse,
    handlePreview,
    handlePrimaryAction,
    handleRecordPreview,
    closeBanner: () => setBanner(null),
    closeStatusToast: () => setStatusToast(null),
    closeInfoDialog: () => setInfoDialog(null),
    closeConfirmAction: () => setConfirmAction(null),
    confirmPendingAction: async () => {
      if (!confirmAction) {
        return;
      }

      const course = confirmAction.course;
      setConfirmAction(null);
      await runPrimaryAction(course);
    },
  };
}
