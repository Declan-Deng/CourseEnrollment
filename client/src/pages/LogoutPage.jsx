export function LogoutPage({ onReturnToPortal, onResetDemo, resetBusy = false }) {
  return (
    <div className="legacy-page legacy-page--logout">
      <section className="logout-card">
        <h3>Signed out</h3>
        <p>Your demo session view has been closed.</p>
        <p>
          Your enrolment data was kept exactly as you left it. If you want a clean starting state
          instead, reset the demo data below.
        </p>
        <div className="logout-card__actions">
          <button type="button" className="legacy-confirm-button" onClick={onReturnToPortal}>
            Return to Course Center
          </button>
          {onResetDemo ? (
            <button type="button" className="legacy-secondary-button" onClick={onResetDemo} disabled={resetBusy}>
              {resetBusy ? "Resetting…" : "Reset demo data"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
export function LogoutPage({ onReturnToPortal }) {
  return (
    <div className="legacy-page legacy-page--logout">
      <section className="logout-card">
        <h3>Signed out</h3>
        <p>Your session has been closed successfully.</p>
        <p>A clean starting state is ready when you return to Course Center.</p>
        <div className="logout-card__actions">
          <button type="button" className="legacy-confirm-button" onClick={onReturnToPortal}>
            Return to Course Center
          </button>
        </div>
      </section>
    </div>
  );
}
