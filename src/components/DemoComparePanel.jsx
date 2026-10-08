import { useMemo, useState } from "react";
import { parseEmail } from "../parser/emailParser.js";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getDemoScenarioById } from "../samples/demoScenarios.js";
import { scenarioToScanInput } from "../samples/demoScenarios.js";
import { getRiskBand } from "../scanner/scanResultSummary.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { splitReasons } from "../scanner/scanResultSummary.js";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";
import { useDemoInbox } from "../context/DemoInboxContext.jsx";
import { useAlerts } from "../context/AlertsContext.jsx";

const SAFE_ID = "safe-school-announcement";
const SCAM_ID = "scholarship-scam";

export function DemoComparePanel({ onNavigateToTab, onRunScenario }) {
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();
  const { processEmailScan } = useScannerWorkflow();
  const { markProcessed } = useDemoInbox();
  const { setHighlightedRecordId } = useAlerts();
  const [compareResult, setCompareResult] = useState(null);
  const [sendState, setSendState] = useState({ pending: false, error: "" });

  const safeScenario = useMemo(() => getDemoScenarioById(SAFE_ID), []);
  const scamScenario = useMemo(() => getDemoScenarioById(SCAM_ID), []);

  function runComparison() {
    const safeParsed = parseEmail(scenarioToScanInput(safeScenario));
    const scamParsed = parseEmail(scenarioToScanInput(scamScenario));
    const safeScore = scoreEmail(safeParsed, siteLists, scoringSettings);
    const scamScore = scoreEmail(scamParsed, siteLists, scoringSettings);

    setCompareResult({
      safe: {
        title: safeScenario.title,
        score: safeScore.score,
        band: getRiskBand(safeScore.score).label,
        reasonCount: splitReasons(safeScore.reasons).increases.length,
      },
      scam: {
        title: scamScenario.title,
        score: scamScore.score,
        band: getRiskBand(scamScore.score).label,
        reasonCount: splitReasons(scamScore.reasons).increases.length,
      },
    });
  }

  async function sendBothToDashboard() {
    if (sendState.pending) return;
    setSendState({ pending: true, error: "" });
    let lastRecord = null;

    for (const scenario of [safeScenario, scamScenario]) {
      const result = await processEmailScan(scenarioToScanInput(scenario), scenario);
      if (!result?.ok) {
        setSendState({
          pending: false,
          error: result?.error ?? `Could not save ${scenario.title}.`,
        });
        return;
      }
      markProcessed(scenario.id);
      lastRecord = result.recordResult?.record ?? result.recordResult?.alert;
    }

    if (lastRecord) {
      setHighlightedRecordId(lastRecord.id);
    }
    setSendState({ pending: false, error: "" });
    onNavigateToTab?.("alerts", "active");
  }

  if (!safeScenario || !scamScenario) return null;

  return (
    <section className="card demo-compare-panel">
      <h3>Safe vs scam — one glance</h3>
      <p className="muted">
        Compare routine school mail with a scholarship scam. Same scanner, very
        different story.
      </p>

      <div className="demo-compare-panel__cards">
        <article className="demo-compare-panel__card demo-compare-panel__card--safe">
          <span className="demo-compare-panel__label">Safe example</span>
          <strong>{safeScenario.title}</strong>
          <p className="muted">{safeScenario.summary}</p>
        </article>
        <article className="demo-compare-panel__card demo-compare-panel__card--scam">
          <span className="demo-compare-panel__label">Scam example</span>
          <strong>{scamScenario.title}</strong>
          <p className="muted">{scamScenario.summary}</p>
        </article>
      </div>

      <div className="demo-compare-panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={runComparison}
        >
          Run comparison
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={sendBothToDashboard}
          disabled={sendState.pending}
        >
          {sendState.pending ? "Saving scenarios…" : "Send both to dashboard"}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onRunScenario?.(safeScenario)}
        >
          Run safe scan
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onRunScenario?.(scamScenario)}
        >
          Run scam scan
        </button>
      </div>

      {sendState.error ? (
        <p className="alerts-report-notice" role="alert">
          {sendState.error}
        </p>
      ) : null}

      {compareResult ? (
        <div className="demo-compare-panel__results" aria-live="polite">
          <div className="demo-compare-panel__metric">
            <span className="muted">Safe score</span>
            <strong>
              {compareResult.safe.score}/10 · {compareResult.safe.band}
            </strong>
            <span className="muted">
              {compareResult.safe.reasonCount} risk signal
              {compareResult.safe.reasonCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="demo-compare-panel__metric demo-compare-panel__metric--delta">
            <span className="muted">Score difference</span>
            <strong>
              +{compareResult.scam.score - compareResult.safe.score} points
            </strong>
          </div>
          <div className="demo-compare-panel__metric">
            <span className="muted">Scam score</span>
            <strong>
              {compareResult.scam.score}/10 · {compareResult.scam.band}
            </strong>
            <span className="muted">
              {compareResult.scam.reasonCount} risk signal
              {compareResult.scam.reasonCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
