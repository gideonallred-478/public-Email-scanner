import { useState } from "react";
import { APP_NAME } from "../appBrand.js";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import { buildDocumentTitle } from "../utils/documentTitle.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useAuth } from "../context/AuthContext.jsx";

export function LoginPage() {
  const { login, loginError, clearLoginError } = useAuth();
  useDocumentTitle(buildDocumentTitle("Sign in"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    clearLoginError();
    await login(username, password);
    setSubmitting(false);
  }

  return (
    <div className="login-page">
      <div className="login-page__theme">
        <ThemeToggle />
      </div>
      <div className="login-page__card card">
        <div className="login-page__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6.5 12 3l8 3.5v11L12 21l-8-3.5v-11Z"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="m9 12 2 2 4-4"
              stroke="#ffffff"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <header className="login-page__header">
          <h1>{APP_NAME}</h1>
          <p className="muted">
            Local development sign-in. Site lists sync across devices when the
            mail bridge is running with shared data enabled. Dev accounts:{" "}
            <strong>demo-admin</strong> (admin), <strong>it</strong>,{" "}
            <strong>teacher</strong>, or <strong>student</strong> (site lists
            only) — same password.
          </p>
        </header>

        <form className="login-page__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="field__control"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__control"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {loginError ? (
            <p className="login-page__error" role="alert">
              {loginError}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn--primary login-page__submit"
            disabled={submitting}
          >
            Sign in
          </button>
        </form>

        <p className="login-page__note muted">
          Future roles (teacher, IT, principal) will gate tabs and actions per
          school account.
        </p>
      </div>
    </div>
  );
}
