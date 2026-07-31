import { useState } from "react";
import { loginStaff } from "../api";
import { Banner } from "../components/PortalFeedback";

export function StaffLoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const session = await loginStaff({ username, password });
      onLogin?.(session.staff);
    } catch (failure) {
      setError({
        title: failure.headline ?? "Staff login failed.",
        detail: failure.detail ?? failure.message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal portal--staff-login">
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

      <main className="staff-login-shell">
        <form className="page-panel staff-login-card" onSubmit={handleSubmit}>
          <h3>Staff sign in</h3>
          <div className="staff-login-card__body">
            <p className="staff-login-card__intro">
              Sign in before opening the administration workspace. Staff actions will use this account id in the API
              headers and audit trail.
            </p>

            {error ? <Banner tone="error" title={error.title} detail={error.detail} onClose={() => setError(null)} /> : null}

            <label className="staff-login-field">
              <span>Staff account</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="staff-login-field">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>

            <div className="staff-login-actions">
              <button type="submit" className="mini-button mini-button--primary" disabled={busy}>
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
