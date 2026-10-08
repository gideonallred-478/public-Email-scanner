import { useMemo, useState } from "react";
import { scoreEmail } from "../scanner/scoringEngine.js";
import {
  buildCopyableSummary,
  buildScanSummary,
  buildStaffEmailTemplate,
  buildWhatToDoNext,
  buildWhyThisMatters,
  derivePositiveSigns,
  formatReasonLabel,
  getRiskBand,
  getScoreBandLegend,
  splitReasons,
} from "../scanner/scanResultSummary.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import {
  CollapsibleSection,
  truncatePreview,
} from "./CollapsibleSection.jsx";

function ReasonsList({ reasons, emptyLabel, variant = "risk" }) {
  const safeReasons = Array.isArray(reasons) ? reasons : [];

  if (!safeReasons.length) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <ul className={`score-reasons score-reasons--${variant}`}>
      {safeReasons.map((reason, index) => {
        const points = reason?.points ?? 0;
        const pointsLabel =
          typeof points === "number" && points !== 0
            ? points > 0
              ? `+${points}`
              : String(points)
            : null;

        return (
          <li
            key={`${reason?.label ?? "reason"}-${index}`}
            className={`score-reason score-reason--${variant}`}
          >
            <div className="score-reason__header">
              <span className="score-reason__label">
                {formatReasonLabel(reason?.label ?? "Signal")}
              </span>
              {pointsLabel ? (
                <span
                  className={`score-reason__points${
                    points < 0 ? " score-reason__points--credit" : ""
                  }`}
                >
                  {pointsLabel}
                </span>
              ) : null}
            </div>
            <p className="score-reason__detail">{reason?.detail ?? ""}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function RiskScorePanel({ parsed, scoreResult: scoreResultProp }) {
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [staffCopyFeedback, setStaffCopyFeedback] = useState(null);
  const { demoMode, audienceView } = useDemoMode();
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();

  const scoreResult = useMemo(() => {
    if (scoreResultProp) return scoreResultProp;
    if (!parsed) return null;
    try {
      return scoreEmail(parsed, siteLists, scoringSettings);
    } catch {
      return {
        score: 0,
        riskLevel: "Safe",
        reasons: [],
        recommendedAction: "Allow normally.",
      };
    }
  }, [parsed, scoreResultProp, siteLists, scoringSettings]);

  const presentation = useMemo(() => {
    if (!scoreResult) return null;
    const band = getRiskBand(scoreResult.score ?? 0);
    const { increases } = splitReasons(scoreResult.reasons);
    const positiveSigns = derivePositiveSigns(parsed, scoreResult);

    return {
      band,
      increases,
      topReasons: increases.slice(0, 3),
      remainingReasons: increases.slice(3),
      positiveSigns,
      summary: buildScanSummary(parsed, scoreResult),
      whyThisMatters: buildWhyThisMatters(parsed, scoreResult),
      nextSteps: buildWhatToDoNext(band.key),
      nextStepPrimary: buildWhatToDoNext(band.key)[0] ?? "",
      copyText: buildCopyableSummary(parsed, scoreResult),
      staffEmailText: buildStaffEmailTemplate(parsed, scoreResult),
    };
  }, [parsed, scoreResult]);

  async function handleCopy(text, setFeedback) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("copied");
      window.setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback("failed");
    }
  }

  if (!parsed || !scoreResult || !presentation) {
    return null;
  }

  const {
    band,
    increases,
    topReasons,
    remainingReasons,
    positiveSigns,
    summary,
    whyThisMatters,
    nextSteps,
    nextStepPrimary,
    copyText,
    staffEmailText,
  } = presentation;

  const copyButton = (
    <button
      type="button"
      className="btn btn--secondary btn--small"
      onClick={() => handleCopy(copyText, setCopyFeedback)}
    >
      {copyFeedback === "copied" ? "Copied!" : "Copy summary"}
    </button>
  );

  return (
    <section
      className={`risk-panel risk-panel--${band.tone}${
        audienceView === "it" ? " risk-panel--it" : " risk-panel--principal"
      }`}
      aria-label="Risk score"
    >
      <div className="risk-panel__hero">
        <div className="risk-panel__score-block">
          <span className="risk-panel__score-label">Risk score</span>
          <div className="risk-panel__score">
            <span className="risk-panel__score-value">{scoreResult.score}</span>
            <span className="risk-panel__score-max">/ 10</span>
          </div>
          <p className="risk-panel__band-hint muted">{getScoreBandLegend()}</p>
        </div>
        <div className="risk-panel__summary">
          <span className={`risk-badge risk-badge--${band.tone}`}>
            {band.label}
          </span>
        </div>
      </div>

      <div className="risk-panel__summary-text">
        <h3>What this means</h3>
        <p>{summary}</p>
      </div>

      {topReasons.length > 0 ? (
        <div className="risk-panel__hero-reasons">
          <h3>Top signals</h3>
          <ReasonsList
            reasons={topReasons}
            emptyLabel="No risk-increasing signals were detected for this scan."
            variant="risk"
          />
        </div>
      ) : null}

      {nextStepPrimary ? (
        <aside className="risk-panel__next-step-card" aria-label="What to do next">
          <span className="risk-panel__next-step-label">What to do next</span>
          <p>{nextStepPrimary}</p>
        </aside>
      ) : null}

      <div className="risk-panel__sections">
        {copyFeedback === "failed" ? (
          <p className="risk-panel__copy-error" role="alert">
            Copy failed. You can manually select and copy the summary.
          </p>
        ) : null}

        {remainingReasons.length > 0 ? (
          <CollapsibleSection
            title={`Show all signals (${increases.length})`}
            preview={`${remainingReasons.length} more signal${
              remainingReasons.length === 1 ? "" : "s"
            } not shown above`}
          >
            <ReasonsList
              reasons={remainingReasons}
              emptyLabel=""
              variant="risk"
            />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Why this matters"
          preview={whyThisMatters[0]}
          defaultOpen={audienceView === "it"}
        >
          <ul className="risk-panel__demo-list">
            {whyThisMatters.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection
          title="Full next steps"
          preview={nextSteps[1] ?? nextSteps[0]}
        >
          <ul className="risk-panel__demo-list">
            {nextSteps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="Positive signs" defaultOpen={band.key === "safe"}>
          <ReasonsList
            reasons={positiveSigns}
            emptyLabel="No reassuring signals were identified."
            variant="positive"
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Presentation summary"
          preview={truncatePreview(copyText)}
          actions={copyButton}
        >
          <p className="risk-panel__copy-text">{copyText}</p>
        </CollapsibleSection>

        {staffEmailText ? (
          <CollapsibleSection
            title="Email to staff (demo template)"
            preview={truncatePreview(staffEmailText, 80)}
            actions={
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => handleCopy(staffEmailText, setStaffCopyFeedback)}
              >
                {staffCopyFeedback === "copied" ? "Copied!" : "Copy staff email"}
              </button>
            }
          >
            <pre className="risk-panel__staff-email">{staffEmailText}</pre>
          </CollapsibleSection>
        ) : null}

        {!demoMode ? (
          <CollapsibleSection title="Raw score JSON (debug)">
            <pre className="debug-json__pre">
              {JSON.stringify(scoreResult, null, 2)}
            </pre>
          </CollapsibleSection>
        ) : null}
      </div>
    </section>
  );
}
