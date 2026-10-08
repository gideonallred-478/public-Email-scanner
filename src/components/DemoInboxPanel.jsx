import { DEMO_SCENARIOS } from "../samples/demoScenarios.js";
import { useDemoInbox } from "../context/DemoInboxContext.jsx";

function previewBody(body) {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(empty body)";
  return text.length > 90 ? `${text.slice(0, 89).trim()}…` : text;
}

export function DemoInboxPanel() {
  const { isProcessed } = useDemoInbox();
  const processedCount = DEMO_SCENARIOS.filter((scenario) =>
    isProcessed(scenario.id)
  ).length;

  return (
    <section className="card demo-inbox-panel">
      <div className="demo-inbox-panel__header">
        <div>
          <h3>Scenario queue</h3>
          <p className="muted">
            Run scenarios from the cards or guided walkthrough below. A scenario is
            marked scanned only after its dashboard record is saved successfully.
          </p>
        </div>
      </div>

      <p className="demo-inbox-panel__feed-note muted" role="status">
        {processedCount} of {DEMO_SCENARIOS.length} scenarios scanned.
      </p>

      <ul className="demo-inbox-list">
        {DEMO_SCENARIOS.map((scenario) => {
          const processed = isProcessed(scenario.id);
          return (
            <li
              key={scenario.id}
              className={`demo-inbox-item${
                processed ? " demo-inbox-item--processed" : ""
              }`}
            >
              <div className="demo-inbox-item__main">
                <div className="demo-inbox-item__title-row">
                  <strong>{scenario.title}</strong>
                  {processed ? (
                    <span className="demo-inbox-item__badge demo-inbox-item__badge--processed">
                      Scanned
                    </span>
                  ) : (
                    <span className="demo-inbox-item__badge">Ready</span>
                  )}
                </div>
                <p className="demo-inbox-item__meta muted">
                  <code>{scenario.sender}</code> · {scenario.subject}
                </p>
                <p className="demo-inbox-item__preview muted">
                  {previewBody(scenario.body)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
