import { useState } from "react";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { getDemoScenarioPreview } from "../samples/demoScenarios.js";

function bandTone(band) {
  const value = String(band ?? "").toLowerCase();
  if (value.includes("dangerous")) return "critical";
  if (value.includes("suspicious")) return "moderate";
  return "low";
}

export function DemoScenarioCard({ scenario, onLoad, onRunDemo }) {
  const { demoMode } = useDemoMode();
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();
  const [showOutcome, setShowOutcome] = useState(false);
  const [showPresenterNote, setShowPresenterNote] = useState(false);
  const preview = getDemoScenarioPreview(
    scenario,
    siteLists,
    scoringSettings
  );
  const bandLabel = `${preview.riskLevel} · ${preview.score}/10`;

  const isTrustDecayScenario = scenario.id === "trusted-link-spreading-fast";

  function handleRunTrustBaseline() {
    onRunDemo({
      ...scenario,
      spreadCount: 1,
      studentReportCount: 0,
    });
  }

  function handleRunTrustElevated() {
    onRunDemo(scenario);
  }

  return (
    <article className="card demo-scenario-card">
      <header className="demo-scenario-card__header">
        <h3>{scenario.title}</h3>
        {demoMode ? (
          <span
            className={`demo-scenario-card__band demo-scenario-card__band--${bandTone(
              preview.riskLevel
            )}`}
          >
            {bandLabel}
          </span>
        ) : (
          <span className="demo-scenario-card__range">
            Current score: {preview.score}/10 · {preview.riskLevel}
          </span>
        )}
      </header>

      {demoMode && scenario.teachesConcept ? (
        <p className="demo-scenario-card__concept">
          <strong>Demonstrates:</strong> {scenario.teachesConcept}
        </p>
      ) : null}

      <p className="demo-scenario-card__summary">{scenario.summary}</p>

      {isTrustDecayScenario ? (
        <p className="demo-scenario-card__trust-story">
          Same trusted Google link — score rises when spread hits{" "}
          {scenario.spreadCount ?? 85} and {scenario.studentReportCount ?? 3}{" "}
          student reports.
        </p>
      ) : null}

      <dl className="demo-scenario-card__meta">
        <div>
          <dt>Sender</dt>
          <dd>
            <code>{scenario.sender}</code>
          </dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{scenario.subject}</dd>
        </div>
        <div>
          <dt>Spread / reports</dt>
          <dd>
            {scenario.spreadCount ?? 1} spread ·{" "}
            {scenario.studentReportCount ?? 0} reports
          </dd>
        </div>
      </dl>

      {showOutcome ? (
        <div className="demo-scenario-card__outcome">
          <strong>Expected outcome</strong>
          <p>{scenario.expectedBehavior}</p>
        </div>
      ) : null}

      {demoMode && scenario.presenterNote && showPresenterNote ? (
        <div className="demo-scenario-card__presenter-note">
          <strong>Presenter note</strong>
          <p>{scenario.presenterNote}</p>
        </div>
      ) : null}

      <div className="demo-scenario-card__actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onLoad(scenario)}
        >
          Load into Scanner
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onRunDemo(scenario)}
        >
          Run Demo Scan
        </button>
        {isTrustDecayScenario && demoMode ? (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleRunTrustBaseline}
            >
              Run with low spread (1)
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleRunTrustElevated}
            >
              Run with elevated spread
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setShowOutcome((open) => !open)}
        >
          {showOutcome ? "Hide Expected Outcome" : "View Expected Outcome"}
        </button>
        {demoMode && scenario.presenterNote ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowPresenterNote((open) => !open)}
          >
            {showPresenterNote ? "Hide Presenter Note" : "Presenter Note"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
