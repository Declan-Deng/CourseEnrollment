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

export function QuickGlanceDock({ activeRequests, summary, onNavigate, activePage }) {
  const actionSummary = summary?.studentActionSummary ?? {};
  const primaryAction = resolvePrimaryAction(activePage, summary, activeRequests);
  const activeRequestLabel =
    activeRequests.length === 0
      ? "No active request"
      : activeRequests.length === 1
        ? "1 active request"
        : `${activeRequests.length} active requests`;
  const urgencyLabel = actionSummary.urgentActions?.[0] ?? null;
  const primaryActionLabel =
    primaryAction.label === "Manage active requests" && activeRequests.length === 1
      ? "Manage request"
      : primaryAction.label;

  return (
    <div className="quick-dock-wrap">
      <section className="quick-dock" aria-label="Current enrolment quick action">
        <div className="quick-dock__header">
          <strong>Quick action</strong>
        </div>
        <div className="quick-dock__metrics">
          <span className="quick-pill quick-pill--warn">{activeRequestLabel}</span>
          {urgencyLabel ? <span className="quick-pill quick-pill--neutral">{urgencyLabel}</span> : null}
        </div>

        <div className="quick-dock__actions">
          <button
            type="button"
            className="quick-link quick-link--primary"
            onClick={() => onNavigate(primaryAction.page)}
          >
            {primaryActionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
