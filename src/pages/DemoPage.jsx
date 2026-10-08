import { useState } from "react";
import { DEMO_SCENARIOS, scenarioToScanInput } from "../samples/demoScenarios.js";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";
import { useAlerts } from "../context/AlertsContext.jsx";
import { isSafeRecord } from "../scanner/alertEngine.js";
import { PresentationGuide } from "../components/PresentationGuide.jsx";
import { DemoControls } from "../components/DemoControls.jsx";
import { DemoScenarioCard } from "../components/DemoScenarioCard.jsx";
import { DemoComparePanel } from "../components/DemoComparePanel.jsx";
import { DemoInboxPanel } from "../components/DemoInboxPanel.jsx";
import { useDemoInbox } from "../context/DemoInboxContext.jsx";

export function DemoPage({ onNavigateToTab }) {
  const { loadScenario, processEmailScan } = useScannerWorkflow();
  const { setHighlightedRecordId } = useAlerts();
  const { markProcessed } = useDemoInbox();
  const [runState, setRunState] = useState({ pending: false, error: "" });

  function handleLoad(scenario) {
    loadScenario(scenario);
    onNavigateToTab("scanner");
  }

  async function handleRunDemo(scenario) {
    if (runState.pending) return { ok: false, error: "A demo scan is already running." };
    setRunState({ pending: true, error: "" });
    const result = await processEmailScan(scenarioToScanInput(scenario), scenario);
    if (!result?.ok) {
      setRunState({ pending: false, error: result?.error ?? "Demo scan failed." });
      return result;
    }
    markProcessed(scenario.id);
    const record = result.recordResult?.record ?? result.recordResult?.alert;
    const filter = record && isSafeRecord(record) ? "safe" : "active";
    if (record) {
      setHighlightedRecordId(record.id);
    }
    setRunState({ pending: false, error: "" });
    onNavigateToTab("alerts", filter);
    return result;
  }
  return (
    <div className="page page--demo">
      <header className="page-header">
        <h2>Demo Scenarios</h2>
        <p className="page-header__sub">
          Reference scenarios and walkthrough tools. Incoming mail auto-scans on
          the Alerts tab — no manual Process step required.
        </p>
      </header>

      {runState.pending ? <p role="status">Saving demo scan…</p> : null}
      {runState.error ? <p className="alerts-report-notice" role="alert">{runState.error}</p> : null}

      <PresentationGuide onNavigateToTab={onNavigateToTab} />
      <DemoInboxPanel />
      <DemoComparePanel onNavigateToTab={onNavigateToTab} onRunScenario={handleRunDemo} />
      <DemoControls />

      <p className="demo-scenario-note muted" role="note">
        Preview scores use the same active scoring settings and site lists as the demo scan.
      </p>

      <section className="demo-scenario-grid" aria-label="Demo scenarios">
        {DEMO_SCENARIOS.map((scenario) => (
          <DemoScenarioCard
            key={scenario.id}
            scenario={scenario}
            onLoad={handleLoad}
            onRunDemo={handleRunDemo}
          />
        ))}
      </section>
    </div>
  );
}
