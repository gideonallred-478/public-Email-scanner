import { useState } from "react";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import { useAlerts } from "../context/AlertsContext.jsx";
import { isSafeRecord } from "../scanner/alertEngine.js";
import { ParseResultsPanel } from "../components/ParseResultsPanel.jsx";

export function ScannerPage({ onNavigateToTab }) {
  const {
    form,
    parsed,
    parseError,
    alertResult,
    scanSource,
    activeScenarioTitle,
    updateField,
    clearWorkflow,
    runScan,
  } = useScannerWorkflow();

  const { setHighlightedRecordId } = useAlerts();
  const { demoMode, audienceView } = useDemoMode();
  const [showAdvancedSimulation, setShowAdvancedSimulation] = useState(false);
  const hideAdvancedFields =
    demoMode && audienceView === "principal" && !showAdvancedSimulation;

  const sourceLabel =
    scanSource === "demo" && activeScenarioTitle
      ? `Demo Scenario — ${activeScenarioTitle}`
      : scanSource === "demo"
        ? "Demo Scenario"
        : "Custom";

  function handleViewOnDashboard() {
    const record = alertResult?.record ?? alertResult?.alert;
    if (!record) return;
    const filter = isSafeRecord(record) ? "safe" : "active";
    setHighlightedRecordId(record.id);
    onNavigateToTab?.("alerts", filter);
  }

  return (
    <div className="scanner-page">
      <div className="scanner-page__column scanner-page__column--form">
        <section className="card scanner-form">
          <div className="card__header">
            <h2>Email input</h2>
            <p className="card__sub">
              Manual testing — demo walkthrough uses the Demo inbox. Paste any
              email below to scan for suspicious signals, trust decay, site
              reputation, risk score, and simulated actions.
            </p>
            <p className="scanner-source-badge" role="status">
              Current scan source: <strong>{sourceLabel}</strong>
            </p>
          </div>

          <div className="form-grid">
            <label className="field field--full">
              <span className="field__label">Sender email</span>
              <input
                className="field__control"
                type="email"
                autoComplete="off"
                value={form.sender}
                onChange={(e) => updateField("sender", e.target.value)}
                placeholder="sender@example.com"
              />
            </label>

            <label className="field field--full">
              <span className="field__label">Subject</span>
              <input
                className="field__control"
                type="text"
                value={form.subject}
                onChange={(e) => updateField("subject", e.target.value)}
                placeholder="Paste the email subject here"
              />
            </label>

            <label className="field field--full field--body">
              <span className="field__label">Email body</span>
              <textarea
                className="field__control field__control--tall"
                value={form.body}
                onChange={(e) => updateField("body", e.target.value)}
                rows={10}
                spellCheck="false"
                placeholder="Paste the email body here"
              />
            </label>

            <div className="form-options-row">
              <label className="field field--inline form-options-row__attachment">
                <input
                  type="checkbox"
                  checked={form.hasAttachment}
                  onChange={(e) =>
                    updateField("hasAttachment", e.target.checked)
                  }
                />
                <span>Has attachment (simulated)</span>
              </label>
            </div>

            {demoMode && audienceView === "principal" ? (
              <button
                type="button"
                className="btn btn--ghost scanner-form__advanced-toggle"
                onClick={() => setShowAdvancedSimulation((open) => !open)}
                aria-expanded={showAdvancedSimulation}
              >
                {showAdvancedSimulation
                  ? "Hide advanced simulation"
                  : "Show advanced simulation (spread, reports, verified sender)"}
              </button>
            ) : null}

            {!hideAdvancedFields ? (
              <>
                <div className="form-options-row">
                  <label className="field form-options-row__spread">
                    <span className="field__label">
                      Simulated spread count
                      {audienceView === "it" ? (
                        <span className="field__hint muted">
                          {" "}
                          — how widely the message spread
                        </span>
                      ) : null}
                    </span>
                    <input
                      className="field__control field__control--narrow"
                      type="number"
                      min={1}
                      step={1}
                      value={form.spreadCount}
                      onChange={(e) =>
                        updateField(
                          "spreadCount",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </label>

                  <label className="field form-options-row__spread">
                    <span className="field__label">
                      Simulated student reports
                      {audienceView === "it" ? (
                        <span className="field__hint muted">
                          {" "}
                          — student safety reports
                        </span>
                      ) : null}
                    </span>
                    <input
                      className="field__control field__control--narrow"
                      type="number"
                      min={0}
                      step={1}
                      value={form.studentReportCount}
                      onChange={(e) =>
                        updateField(
                          "studentReportCount",
                          e.target.value === "" ? 0 : Number(e.target.value)
                        )
                      }
                    />
                  </label>
                </div>

                <label className="field field--inline form-options-row__verified">
                  <input
                    type="checkbox"
                    checked={form.verifiedSchoolAccount}
                    onChange={(e) =>
                      updateField("verifiedSchoolAccount", e.target.checked)
                    }
                  />
                  <span>Sender is verified school account (simulated)</span>
                </label>
              </>
            ) : null}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => runScan()}
              >
                Scan Email
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={clearWorkflow}
              >
                Clear Email
              </button>
            </div>

            {parseError && (
              <div className="alert alert--warn" role="alert">
                <p>{parseError}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="scanner-page__column scanner-page__column--results">
        <section className="scanner-results-heading">
          <h2 className="scanner-results-heading__title">Scan results</h2>
          <p className="scanner-results-heading__sub muted">
            Risk score, action plan, site reputation, and dashboard record
            simulation.
          </p>
        </section>

        <ParseResultsPanel
          parsed={parsed}
          alertResult={alertResult}
          onViewOnDashboard={handleViewOnDashboard}
        />
      </div>
    </div>
  );
}
