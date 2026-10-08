import { useId, useMemo, useState } from "react";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getActionPlan } from "../scanner/actionEngine.js";
import { getRiskBand } from "../scanner/scanResultSummary.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";

function actionTone(score) {
  const tone = getRiskBand(score).tone;
  if (tone === "low") return "calm";
  if (tone === "moderate") return "warning";
  return "urgent";
}

function FlagRow({ label, value }) {
  const yes = Boolean(value);
  return (
    <div className="action-flag">
      <span className="action-flag__label">{label}</span>
      <span className={`action-flag__value ${yes ? "action-flag__value--yes" : ""}`}>
        {yes ? "Yes" : "No"}
      </span>
    </div>
  );
}

function DashboardAlertSimulation({ plan }) {
  const priority = plan?.simulationMeta?.dashboardPriority ?? "low";
  const subject = plan?.simulationMeta?.subjectHint ?? "this message";

  return (
    <aside
      className={`sim-card sim-card--dashboard sim-card--${priority}`}
      role="note"
      aria-label="Review alert simulation"
    >
      <div className="sim-card__banner">Simulated only — not a real IT alert queue</div>
      <h4 className="sim-card__title">Review Alert Simulation</h4>
      <p className="sim-card__meta">
        Priority: <strong>{priority}</strong> · Score {plan?.score ?? 0}/10
      </p>
      <p className="sim-card__body">
        {plan?.adminMessage ||
          "A review note would be recorded for IT (simulated)."}
      </p>
      <p className="sim-card__detail muted">Flagged message: {subject}</p>
    </aside>
  );
}

function ItAlertSimulation({ plan }) {
  return (
    <aside
      className="sim-card sim-card--it"
      role="note"
      aria-label="IT alert simulation"
    >
      <div className="sim-card__banner sim-card__banner--urgent">
        Simulated only — not a real IT notification
      </div>
      <h4 className="sim-card__title">IT Alert Simulation</h4>
      <p className="sim-card__meta">
        Urgent popup · {plan?.riskBand ?? plan?.actionLevel ?? "Alert"}
      </p>
      <p className="sim-card__body">
        {plan?.adminMessage ||
          "IT would receive an urgent alert for immediate review (simulated)."}
      </p>
      {plan?.incidentRequired && (
        <p className="sim-card__detail">
          Incident entry would be required (simulated).
        </p>
      )}
    </aside>
  );
}

export function ActionPlanPanel({ parsed, scoreResult: scoreResultProp }) {
  const actionJsonId = useId();
  const [actionJsonOpen, setActionJsonOpen] = useState(false);
  const { demoMode } = useDemoMode();
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();

  const scoreResult = useMemo(() => {
    if (scoreResultProp) return scoreResultProp;
    if (!parsed) return null;
    try {
      return scoreEmail(parsed, siteLists, scoringSettings);
    } catch {
      return { score: 0, riskLevel: "Safe", reasons: [], recommendedAction: "" };
    }
  }, [parsed, scoreResultProp, siteLists, scoringSettings]);

  const actionPlan = useMemo(() => {
    if (!scoreResult) return null;
    try {
      return getActionPlan(scoreResult, parsed);
    } catch {
      return null;
    }
  }, [scoreResult, parsed]);

  if (!parsed || !actionPlan) {
    return null;
  }

  const tone = actionTone(actionPlan.score ?? 0);

  return (
    <section
      className={`action-panel action-panel--${tone}`}
      aria-label="Action plan"
    >
      <div className="action-panel__header">
        <span className={`action-badge action-badge--${tone}`}>
          {actionPlan.badgeLabel}
        </span>
      </div>

      <dl className="action-summary">
        <dt>Risk band</dt>
        <dd>{actionPlan.riskBand ?? actionPlan.actionLevel}</dd>

        <dt>Student message</dt>
        <dd>{actionPlan.studentMessage}</dd>

        <dt>Teacher message</dt>
        <dd>{actionPlan.teacherMessage}</dd>

        {actionPlan.adminMessage ? (
          <>
            <dt>Admin / IT message</dt>
            <dd>{actionPlan.adminMessage}</dd>
          </>
        ) : null}
      </dl>

      <div className="action-next-steps">
        <h4>Next steps</h4>
        <ul>
          {(actionPlan.nextSteps ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>

      <details className="action-panel__technical-details">
        <summary>Technical response details</summary>
        <div className="action-flags">
          <FlagRow label="Review alert" value={actionPlan.dashboardAlert} />
          <FlagRow label="Urgent popup" value={actionPlan.urgentPopup} />
          <FlagRow label="Links restricted" value={actionPlan.restrictLinks} />
          <FlagRow
            label="Attachments restricted"
            value={actionPlan.restrictAttachments}
          />
          <FlagRow label="Quarantine simulation" value={actionPlan.quarantine} />
          <FlagRow label="Incident required" value={actionPlan.incidentRequired} />
        </div>

        {actionPlan.dashboardAlert && (
          <DashboardAlertSimulation plan={actionPlan} />
        )}

        {actionPlan.urgentPopup && <ItAlertSimulation plan={actionPlan} />}
      </details>

      {!demoMode ? (
        <div className="debug-json">
          <button
            type="button"
            className="debug-json__toggle"
            aria-expanded={actionJsonOpen}
            aria-controls={actionJsonId}
            onClick={() => setActionJsonOpen((open) => !open)}
          >
            {actionJsonOpen ? "▼" : "▶"} Raw action plan JSON (debug)
          </button>
          {actionJsonOpen && (
            <pre id={actionJsonId} className="debug-json__pre">
              {JSON.stringify(actionPlan, null, 2)}
            </pre>
          )}
        </div>
      ) : null}
    </section>
  );
}
