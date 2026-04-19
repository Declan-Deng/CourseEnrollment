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
        label: "Review requests",
        page: "cancel",
      }
    : {
        label: "View results",
        page: "results",
      };
}

export function QuickGlanceDock({ approvedCourses, activeRequests, summary, systemMeta, onNavigate, onRefresh, activePage }) {
  const actionSummary = summary?.studentActionSummary ?? {};
  const nextDeadline = actionSummary.nextDeadline ?? "No active deadline";
  const primaryAction = resolvePrimaryAction(activePage, summary, activeRequests);

  return (
    <div className="quick-dock-wrap">
      <section className="quick-dock" aria-label="Current enrolment quick glance">
        <div className="quick-dock__header">
          <strong>Quick Glance</strong>
          <span>{systemMeta?.isSyncing ? systemMeta.syncLabel || "Syncing…" : formatQuickTimestamp(systemMeta?.lastUpdatedAt)}</span>
        </div>
        <div className="quick-dock__metrics">
          <span className="quick-pill quick-pill--neutral">Load {summary.plannedCredits}/{summary.creditLimit} cr</span>
          <span className="quick-pill">Enrolled {approvedCourses.length}</span>
          <span className="quick-pill quick-pill--warn">Active {activeRequests.length}</span>
          <span className="quick-pill quick-pill--neutral">Next {nextDeadline}</span>
        </div>

        <div className="quick-dock__actions">
          {onRefresh ? (
            <button
              type="button"
              className="quick-link"
              onClick={onRefresh}
              disabled={systemMeta?.isSyncing}
            >
              {systemMeta?.isSyncing ? "Syncing…" : "Refresh"}
            </button>
          ) : null}
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
