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
