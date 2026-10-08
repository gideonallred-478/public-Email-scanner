import { useCallback, useEffect, useState } from "react";
import { formatRoleLabel } from "../auth/authConfig.js";
import { fetchSignInLog } from "../auth/signInLogApi.js";

function formatEventTime(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "";
  }
}

function formatEventLabel(event) {
  return event === "sign_out" ? "Sign out" : "Sign in";
}

export function TrackerPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLog = useCallback(async () => {
    setLoading(true);
    const result = await fetchSignInLog();
    if (!result?.ok) {
      setEntries([]);
      setError(result?.message ?? "Could not load sign-in log.");
      setLoading(false);
      return;
    }

    setEntries(result.entries ?? []);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  return (
    <div className="page page--tracker">
      <header className="page-header page-header--tracker">
        <div>
          <h2>Sign-in tracker</h2>
          <p className="page-header__sub">
            Local dev audit log for who signed in or out and when. Stored on
            this machine by the mail bridge — not synced to Vercel previews.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={loadLog}
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      {error ? (
        <p className="tracker-page__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card tracker-log">
        <div className="tracker-log__header">
          <h3>Recent activity</h3>
          <span className="muted">{entries.length} event(s)</span>
        </div>

        {loading ? (
          <p className="muted">Loading sign-in log…</p>
        ) : entries.length === 0 ? (
          <p className="muted">
            No sign-ins recorded yet. Events appear when someone logs in on this
            dev setup.
          </p>
        ) : (
          <div className="tracker-log__table-wrap">
            <table className="tracker-log__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Event</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatEventTime(entry.at)}</td>
                    <td>
                      <strong>{entry.displayName ?? entry.username}</strong>
                      {entry.displayName &&
                      entry.displayName !== entry.username ? (
                        <span className="muted tracker-log__username">
                          {" "}
                          ({entry.username})
                        </span>
                      ) : null}
                    </td>
                    <td>{formatRoleLabel(entry.role)}</td>
                    <td>
                      <span
                        className={`tracker-log__event tracker-log__event--${
                          entry.event === "sign_out" ? "out" : "in"
                        }`}
                      >
                        {formatEventLabel(entry.event)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
