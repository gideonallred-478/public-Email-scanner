import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  canEditSiteLists,
  canReviewSiteListSuggestions,
  canSuggestSiteLists,
} from "../auth/rolePermissions.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { findDuplicateSiteListEntry } from "../scanner/trustedLinksStore.js";
import {
  findPendingSuggestionDuplicate,
  SUGGESTION_CATEGORIES,
} from "../scanner/siteListSuggestions.js";

function SiteListCard({ label, sites, category, note }) {
  return (
    <section className={`card site-list-card site-list-card--${category}`}>
      <h3>{label}</h3>
      {note ? <p className="site-list-card__note">{note}</p> : null}
      <p className="site-list-card__count">{sites.length} domain(s)</p>
      <ul className="site-list-card__items">
        {sites.length === 0 ? (
          <li className="muted">No domains listed yet.</li>
        ) : (
          sites.map((site) => (
            <li key={site}>
              <code>{site}</code>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function formatSuggestionTime(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "";
  }
}

export function SiteListsPage() {
  const { user } = useAuth();
  const editable = canEditSiteLists(user?.role);
  const canSuggest = canSuggestSiteLists(user?.role);
  const canReview = canReviewSiteListSuggestions(user?.role);
  const {
    lists,
    suggestions,
    pendingSuggestions,
    addDomain,
    suggestDomain,
    approveSuggestion,
    dismissSuggestion,
    syncError,
    syncing,
    useSharedData,
  } = useSiteLists();

  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("trusted");
  const [addFeedback, setAddFeedback] = useState(null);

  const [suggestDomainValue, setSuggestDomainValue] = useState("");
  const [suggestCategory, setSuggestCategory] = useState("suspicious");
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestFeedback, setSuggestFeedback] = useState(null);
  const [reviewFeedback, setReviewFeedback] = useState("");

  const duplicateHint = useMemo(() => {
    if (!editable || !domain.trim()) return null;
    return findDuplicateSiteListEntry(lists, category, domain);
  }, [editable, lists, category, domain]);

  const suggestDuplicateHint = useMemo(() => {
    if (!canSuggest || !suggestDomainValue.trim()) return null;

    const onList = findDuplicateSiteListEntry(
      lists,
      suggestCategory,
      suggestDomainValue
    );
    if (onList) return onList;

    const pending = findPendingSuggestionDuplicate(
      suggestions,
      suggestCategory,
      suggestDomainValue
    );
    if (pending) {
      return {
        message: `${pending.domain} is already pending review for this category.`,
      };
    }

    return null;
  }, [canSuggest, lists, suggestions, suggestCategory, suggestDomainValue]);

  useEffect(() => {
    setAddFeedback(null);
  }, [domain, category]);

  useEffect(() => {
    setSuggestFeedback(null);
  }, [suggestDomainValue, suggestCategory, suggestNote]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!editable || duplicateHint) return;

    const trimmed = domain.trim();
    if (!trimmed) return;

    const result = await addDomain(category, trimmed);
    setAddFeedback(result);
    if (result.ok) {
      setDomain("");
    }
  }

  async function handleSuggest(e) {
    e.preventDefault();
    if (!canSuggest || suggestDuplicateHint) return;

    const trimmed = suggestDomainValue.trim();
    if (!trimmed) return;

    const result = await suggestDomain(suggestCategory, trimmed, {
      suggestedBy: user?.displayName ?? user?.username ?? "User",
      note: suggestNote,
    });
    setSuggestFeedback(result);
    if (result.ok) {
      setSuggestDomainValue("");
      setSuggestNote("");
    }
  }

  async function handleApprove(suggestionId) {
    const result = await approveSuggestion(suggestionId);
    setReviewFeedback(result.message ?? "");
    window.setTimeout(() => setReviewFeedback(""), 4000);
  }

  async function handleDismiss(suggestionId) {
    const result = await dismissSuggestion(suggestionId);
    setReviewFeedback(result.message ?? "");
    window.setTimeout(() => setReviewFeedback(""), 4000);
  }

  return (
    <div className="page page--site-lists">
      <header className="page-header">
        <h2>Site Lists</h2>
        <p className="page-header__sub">
          {editable
            ? useSharedData
              ? "Add or update trusted, reference, suspicious, and dangerous domains. Changes sync to all signed-in devices through the mail bridge."
              : "Add or update trusted, reference, suspicious, and dangerous domains. Changes apply immediately and are saved in this browser for demo sessions."
            : canSuggest
              ? "View the school lists and suggest suspicious or dangerous domains for IT review. Suggestions are not applied until an admin or IT approves them."
              : "View-only for your role. Ask IT or an admin to add or change trusted, suspicious, or dangerous domains."}
        </p>
        {useSharedData ? (
          <p className="muted" role="status">
            {syncError
              ? syncError
              : syncing
                ? "Syncing shared site lists…"
                : "Shared across devices · auto-refresh every 15s"}
          </p>
        ) : null}
      </header>

      {editable ? (
        <section className="card site-lists-add">
          <h3>Add domain</h3>
          <form className="site-lists-add__form" onSubmit={handleAdd}>
            <label className="field site-lists-add__field">
              <span className="field__label">Domain</span>
              <input
                className="field__control"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                spellCheck={false}
                aria-invalid={duplicateHint ? "true" : undefined}
                aria-describedby={
                  duplicateHint ? "site-list-duplicate-hint" : undefined
                }
              />
            </label>

            <label className="field site-lists-add__field">
              <span className="field__label">Category</span>
              <select
                className="field__control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="trusted">Trusted / Approved</option>
                <option value="reference">Reference (lookalike)</option>
                <option value="suspicious">Suspicious</option>
                <option value="dangerous">Dangerous</option>
              </select>
            </label>

            <button
              type="submit"
              className="btn btn--primary site-lists-add__btn"
              disabled={Boolean(duplicateHint)}
            >
              Add
            </button>
          </form>

          {duplicateHint ? (
            <p
              id="site-list-duplicate-hint"
              className="site-lists-add__feedback site-lists-add__feedback--warn"
              role="status"
            >
              {duplicateHint.message}
            </p>
          ) : null}

          {addFeedback ? (
            <p
              className={`site-lists-add__feedback${
                addFeedback.ok
                  ? " site-lists-add__feedback--ok"
                  : addFeedback.reason === "duplicate"
                    ? " site-lists-add__feedback--warn"
                    : " site-lists-add__feedback--error"
              }`}
              role="status"
            >
              {addFeedback.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {canSuggest && !editable ? (
        <section className="card site-lists-suggest">
          <h3>Suggest a domain for review</h3>
          <p className="muted site-lists-suggest__intro">
            Submit suspicious or dangerous domains for IT approval. Nothing is
            added to the live lists until an admin or IT approves your suggestion.
          </p>
          <form className="site-lists-add__form" onSubmit={handleSuggest}>
            <label className="field site-lists-add__field">
              <span className="field__label">Domain</span>
              <input
                className="field__control"
                type="text"
                value={suggestDomainValue}
                onChange={(e) => setSuggestDomainValue(e.target.value)}
                placeholder="fake-login.example.com"
                spellCheck={false}
                aria-invalid={suggestDuplicateHint ? "true" : undefined}
              />
            </label>

            <label className="field site-lists-add__field">
              <span className="field__label">Category</span>
              <select
                className="field__control"
                value={suggestCategory}
                onChange={(e) => setSuggestCategory(e.target.value)}
              >
                {SUGGESTION_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value === "suspicious" ? "Suspicious" : "Dangerous"}
                  </option>
                ))}
              </select>
            </label>

            <label className="field site-lists-add__field site-lists-add__field--full">
              <span className="field__label">
                Why? <span className="field__hint">(optional)</span>
              </span>
              <input
                className="field__control"
                type="text"
                value={suggestNote}
                onChange={(e) => setSuggestNote(e.target.value)}
                placeholder="Seen in a phishing email targeting students"
                maxLength={240}
              />
            </label>

            <button
              type="submit"
              className="btn btn--secondary site-lists-add__btn"
              disabled={Boolean(suggestDuplicateHint)}
            >
              Submit suggestion
            </button>
          </form>

          {suggestDuplicateHint ? (
            <p
              className="site-lists-add__feedback site-lists-add__feedback--warn"
              role="status"
            >
              {suggestDuplicateHint.message}
            </p>
          ) : null}

          {suggestFeedback ? (
            <p
              className={`site-lists-add__feedback${
                suggestFeedback.ok
                  ? " site-lists-add__feedback--ok"
                  : " site-lists-add__feedback--error"
              }`}
              role="status"
            >
              {suggestFeedback.message}
            </p>
          ) : null}
        </section>
      ) : !editable && !canSuggest ? (
        <p className="settings-note card" role="note">
          You can review these lists while triaging alerts, but only admin, IT,
          and teacher accounts can edit them directly.
        </p>
      ) : null}

      {canReview ? (
        <section className="card site-lists-review">
          <div className="site-lists-review__header">
            <h3>Pending suggestions</h3>
            <span className="muted">{pendingSuggestions.length} waiting</span>
          </div>

          {reviewFeedback ? (
            <p className="site-lists-add__feedback site-lists-add__feedback--ok" role="status">
              {reviewFeedback}
            </p>
          ) : null}

          {pendingSuggestions.length === 0 ? (
            <p className="muted">No pending suggestions right now.</p>
          ) : (
            <ul className="site-lists-review__list">
              {pendingSuggestions.map((entry) => (
                <li key={entry.id} className="site-lists-review__item">
                  <div className="site-lists-review__meta">
                    <strong>
                      <code>{entry.domain}</code>
                    </strong>
                    <span
                      className={`site-lists-review__badge site-lists-review__badge--${entry.category}`}
                    >
                      {entry.category}
                    </span>
                    <span className="muted">
                      from {entry.suggestedBy} · {formatSuggestionTime(entry.suggestedAt)}
                    </span>
                    {entry.note ? (
                      <p className="site-lists-review__note">{entry.note}</p>
                    ) : null}
                  </div>
                  <div className="site-lists-review__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => handleApprove(entry.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => handleDismiss(entry.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="site-lists-page-grid">
        <SiteListCard
          label="Trusted / Approved Sites"
          sites={lists.trustedSites ?? []}
          category="trusted"
          note="School-approved domains that can reduce risk when matched exactly or as subdomains."
        />
        <SiteListCard
          label="Lookalike Reference Domains"
          sites={lists.referenceDomains ?? []}
          category="reference"
          note="These domains are used to detect lookalikes. They do not automatically make a site trusted."
        />
        <SiteListCard
          label="Suspicious Sites"
          sites={lists.suspiciousSites ?? []}
          category="suspicious"
        />
        <SiteListCard
          label="Dangerous Sites"
          sites={lists.dangerousSites ?? []}
          category="dangerous"
        />
      </div>
    </div>
  );
}
