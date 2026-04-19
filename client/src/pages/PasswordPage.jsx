import { useState } from "react";

function countPasswordCategories(password) {
  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9!#$%&()*+,\-.:;=?@[\]_]/.test(password),
  ];

  return checks.filter(Boolean).length;
}

function buildUsername(student) {
  if (student?.username) {
    return student.username;
  }

  if (student?.email?.includes("@")) {
    return student.email.split("@")[0];
  }

  return student?.id ?? "your username";
}

function validatePassword(password, confirmedPassword, username) {
  if (!password || !confirmedPassword) {
    return { tone: "error", message: "Please fill in both password fields before confirming." };
  }

  if (password !== confirmedPassword) {
    return { tone: "error", message: "The re-entered password does not match the new password." };
  }

  if (password.length < 8 || password.length > 20) {
    return { tone: "error", message: "Password length must be between 8 and 20 characters." };
  }

  if (countPasswordCategories(password) < 2) {
    return {
      tone: "error",
      message: "Password must contain characters from at least two of the listed character categories.",
    };
  }

  if (password.toLowerCase().includes(username.toLowerCase())) {
    return { tone: "error", message: "Password must not contain the username." };
  }

  if (new Set(password).size < 4) {
    return {
      tone: "error",
      message: "Password must contain at least 4 different characters or symbols.",
    };
  }

  return { tone: "success", message: "Password format checks passed for this account." };
}

export function PasswordPage({ student }) {
  const [password, setPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [feedback, setFeedback] = useState(null);
  const username = buildUsername(student);
  const userId = student?.id ?? "N/A";

  function handleConfirm() {
    const result = validatePassword(password, confirmedPassword, username);
    setFeedback(result);

    if (result.tone === "success") {
      setPassword("");
      setConfirmedPassword("");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    handleConfirm();
  }

  return (
    <div className="legacy-page legacy-page--password">
      <section className="legacy-password-card">
        <div className="legacy-password-card__title">Change Password</div>
        <form className="legacy-password-shell" onSubmit={handleSubmit}>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="legacy-password-hidden-username"
          />
          <div className="legacy-password-form">
            <div className="legacy-password-form__label">User ID</div>
            <div className="legacy-password-form__value legacy-password-form__value--id">{userId}</div>

            <div className="legacy-password-form__label">Password #1</div>
            <div className="legacy-password-form__fields">
              <div className="legacy-password-row">
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="New password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFeedback(null);
                  }}
                />
                <span>(New Password)</span>
              </div>
              <div className="legacy-password-row">
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="Re-enter new password"
                  value={confirmedPassword}
                  onChange={(event) => {
                    setConfirmedPassword(event.target.value);
                    setFeedback(null);
                  }}
                />
                <span>(Re-enter New Password)</span>
              </div>
            </div>
          </div>
          <div className="legacy-password-card__action">
            <span>&gt;&gt;&gt;&gt;&gt;</span>
            <button type="submit" className="legacy-confirm-button">
              Confirm
            </button>
          </div>
          {feedback ? (
            <div
              className={
                feedback.tone === "success"
                  ? "legacy-password-feedback legacy-password-feedback--success"
                  : "legacy-password-feedback legacy-password-feedback--error"
              }
            >
              {feedback.message}
            </div>
          ) : null}
        </form>
      </section>

      <section className="legacy-password-note">
        <h3>Note #1</h3>
        <p>Please note that your new Password must follow these rules:</p>
        <ol>
          <li>
            The length of the password must be at least 8 and at most 20.
            <br />
            For example,
            <br />
            <strong>1e34U</strong> is invalid.
            <br />
            <strong>1e34U6789o1e34U6789o1</strong> is invalid.
            <br />
            <strong>1e34U678</strong> is valid.
          </li>
          <li>
            The password must contains characters from two of the following three categories:
            <br />
            (i) English upper case characters (A..Z)
            <br />
            (ii) English lower case characters (a..z)
            <br />
            (iii) Base 10 digits (0..9) and Nonalphanumeric symbols (! # $ % &amp; ( ) * + , - . : ; = ? @ [ ] _)
            <br />
            <br />
            For example,
            <br />
            <strong>THURSDAY</strong> is invalid.
            <br />
            <strong>88234567</strong> is invalid.
            <br />
            <strong>Thur4567</strong> is valid.
          </li>
          <li>
            The password must not be the same of your username. It also must not contain your username.
            <br />
            For example,
            <br />
            Your username is <strong>{username}</strong>,
            <br />
            <strong>{username.toUpperCase()}</strong> is invalid.
            <br />
            <strong>{username}peter</strong> is invalid.
          </li>
          <li>
            The password must have at least 4 different alphanumeric characters or symbols.
            <br />
            For example,
            <br />
            <strong>F4f4F4f4</strong> is invalid.
            <br />
            <strong>H2Oh2oH2O</strong> is valid.
          </li>
        </ol>
      </section>
    </div>
  );
}
