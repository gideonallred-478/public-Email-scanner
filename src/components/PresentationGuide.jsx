import { useState } from "react";
import { DEMO_SCENARIOS, getDemoScenarioById } from "../samples/demoScenarios.js";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import { useDemoInbox } from "../context/DemoInboxContext.jsx";
import { useAlerts } from "../context/AlertsContext.jsx";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";
import { scenarioToScanInput } from "../samples/demoScenarios.js";
import { isSafeRecord } from "../scanner/alertEngine.js";

export const PRESENTATION_STEPS = [
  {
    id: "safe-school-announcement",
    type: "scenario",
    scenarioId: "safe-school-announcement",
    title: "Safe School Announcement",
    detail: "Show that normal school emails auto-clear to Safe on the dashboard.",
  },
  {
    id: "normal-teacher-email",
    type: "scenario",
    scenarioId: "normal-teacher-email",
    title: "Normal Teacher / Classroom Email",
    detail: "Show trusted school senders and routine classroom links stay calm.",
  },
  {
    id: "slightly-weird-unknown-link",
    type: "scenario",
    scenarioId: "slightly-weird-unknown-link",
    title: "Slightly Weird Unknown Link",
    detail: "Show the system warns instead of blanket blocking unknown senders.",
  },
  {
    id: "scholarship-scam",
    type: "scenario",
    scenarioId: "scholarship-scam",
    title: "Scholarship Scam",
    detail: "Show a Suspicious score with clear reasons and a dashboard alert.",
  },
  {
    id: "fake-password-reset",
    type: "scenario",
    scenarioId: "fake-password-reset",
    title: "Fake Password Reset",
    detail: "Show urgent alert behavior for login/password phishing.",
  },
  {
    id: "lookalike-domain-attack",
    type: "scenario",
    scenarioId: "lookalike-domain-attack",
    title: "Lookalike Domain Attack",
    detail: "Show fake-site detection against reference domains.",
  },
  {
    id: "trusted-link-spreading-fast",
    type: "scenario",
    scenarioId: "trusted-link-spreading-fast",
    title: "Trusted Link Spreading Too Fast",
    detail: "Show trust decay when a trusted link spreads too widely.",
  },
  {
    id: "known-dangerous-domain",
    type: "scenario",
    scenarioId: "known-dangerous-domain",
    title: "Known Dangerous Domain",
    detail: "Show blocklisted domains triggering review even at low scores.",
  },
  {
    id: "open-alerts",
    type: "alerts",
    title: "Open the Alerts tab",
    detail: "Review simulated admin/IT alert records from the demos.",
  },
];

function bandTone(band) {
  const value = String(band ?? "").toLowerCase();
  if (value.includes("dangerous")) return "critical";
  if (value.includes("suspicious")) return "moderate";
  return "low";
}

export function PresentationGuide({ onNavigateToTab }) {
  const { demoMode, completedSteps, markPresentationStepComplete } = useDemoMode();
  const { processEmailScan, activeScenarioId } = useScannerWorkflow();
  const { markProcessed } = useDemoInbox();
  const { setHighlightedRecordId } = useAlerts();
  const [runState, setRunState] = useState({ stepId: null, error: "" });

  const completedCount = completedSteps.length;
  const totalSteps = PRESENTATION_STEPS.length;

  if (!demoMode) {
    return null;
  }

  async function handleRunScenario(scenarioId, stepId) {
    if (runState.stepId) return;
    const scenario = getDemoScenarioById(scenarioId);
    if (!scenario) return;

    setRunState({ stepId, error: "" });
    const result = await processEmailScan(scenarioToScanInput(scenario), scenario);
    if (!result?.ok) {
      setRunState({ stepId: null, error: result?.error ?? "Scenario scan failed." });
      return;
    }
    markProcessed(scenarioId);
    markPresentationStepComplete(stepId);

    const record = result.recordResult?.record ?? result.recordResult?.alert;
    const filter = record && isSafeRecord(record) ? "safe" : "active";
    if (record) {
      setHighlightedRecordId(record.id);
    }
    setRunState({ stepId: null, error: "" });
    onNavigateToTab?.("alerts", filter);
  }

  function handleOpenAlerts(stepId) {
    markPresentationStepComplete(stepId);
    onNavigateToTab?.("alerts", "active");
  }

  return (
    <section className="card presentation-guide">
      <div className="presentation-guide__header">
        <div>
          <h3>Guided walkthrough</h3>
          <p className="presentation-guide__intro muted">
            Step through built-in scenarios for a principal or IT walkthrough. Each
            step auto-scans and lands on the Alerts dashboard.
          </p>
        </div>
        <p className="presentation-guide__progress" aria-live="polite">
          Progress: {completedCount} / {totalSteps}
        </p>
      </div>

      <ol className="presentation-guide__steps">
        {runState.error ? (
          <li className="alerts-report-notice" role="alert">{runState.error}</li>
        ) : null}
        {PRESENTATION_STEPS.map((step, index) => {
          const scenario =
            step.type === "scenario"
              ? DEMO_SCENARIOS.find((item) => item.id === step.scenarioId)
              : null;
          const done = completedSteps.includes(step.id);
          const active =
            step.type === "scenario" && activeScenarioId === step.scenarioId;

          return (
            <li
              key={step.id}
              className={`presentation-guide__step${
                done ? " presentation-guide__step--done" : ""
              }${active ? " presentation-guide__step--active" : ""}`}
            >
              <span className="presentation-guide__step-num">{index + 1}</span>
              <div className="presentation-guide__step-body">
                <div className="presentation-guide__step-title-row">
                  <strong>{step.title}</strong>
                  {done ? (
                    <span className="presentation-guide__done-badge">Done</span>
                  ) : null}
                </div>
                <p className="muted">{step.detail}</p>

                {scenario ? (
                  <div className="presentation-guide__meta">
                    <span
                      className={`demo-scenario-card__band demo-scenario-card__band--${bandTone(
                        scenario.expectedBand
                      )}`}
                    >
                      {scenario.expectedBand} · {scenario.expectedScoreRange}
                    </span>
                    <span className="presentation-guide__concept muted">
                      {scenario.teachesConcept}
                    </span>
                  </div>
                ) : null}

                <div className="presentation-guide__actions">
                  {step.type === "scenario" ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => handleRunScenario(step.scenarioId, step.id)}
                      disabled={Boolean(runState.stepId)}
                    >
                      {runState.stepId === step.id ? "Saving scenario…" : "Run this scenario"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => handleOpenAlerts(step.id)}
                    >
                      Open Alerts tab
                    </button>
                  )}
                  {!done ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => markPresentationStepComplete(step.id)}
                    >
                      Mark step done
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
