const QUICK_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatQuickTimestamp(value) {
  if (!value) {
    return "Not synced yet";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not synced yet";
  }

  return `Updated ${QUICK_TIME_FORMATTER.format(parsed)}`;
}

function resolvePrimaryAction(activePage, summary, activeRequests) {
  const actionSummary = summary?.studentActionSummary ?? {};
  const configuredAction = actionSummary.primaryAction;

  if (activePage === "results" || activePage === "cancel") {
    return {
      label: "Back to Course Center",
      page: "add",
    };
  }

  if (configuredAction?.label && configuredAction?.page) {
    return configuredAction;
  }

  return activeRequests.length > 0
    ? {
        label: "Manage active requests",
        page: "cancel",
      }
    : {
        label: "View enrolment results",
        page: "results",
      };
}

export function QuickGlanceDock({ activeRequests, summary, systemMeta, onNavigate, activePage }) {
  const actionSummary = summary?.studentActionSummary ?? {};
  const nextDeadline = actionSummary.nextDeadline ?? "No active deadline";
  const primaryAction = resolvePrimaryAction(activePage, summary, activeRequests);
  const activeRequestLabel =
    activeRequests.length === 1 ? "1 active request" : `${activeRequests.length} active requests`;
  const deadlineLabel = nextDeadline === "No active deadline" ? nextDeadline : `Next deadline: ${nextDeadline}`;

  return (
    <div className="quick-dock-wrap">
      <section className="quick-dock" aria-label="Current enrolment quick glance">
        <div className="quick-dock__header">
          <strong>Quick Glance</strong>
          <span>{systemMeta?.isSyncing ? systemMeta.syncLabel || "Syncing…" : formatQuickTimestamp(systemMeta?.lastUpdatedAt)}</span>
        </div>
        <div className="quick-dock__metrics">
          <span className="quick-pill quick-pill--warn">{activeRequestLabel}</span>
          <span className="quick-pill quick-pill--neutral">{deadlineLabel}</span>
        </div>

        <div className="quick-dock__actions">
          <button
            type="button"
            className="quick-link quick-link--primary"
            onClick={() => onNavigate(primaryAction.page)}
          >
            {primaryAction.label}
          </button>
        </div>
      </section>
    </div>
  );
}
