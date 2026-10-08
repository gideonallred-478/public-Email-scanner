import { useMemo } from "react";
import { extractSenderDomain } from "../parser/emailParser.js";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getActionPlan } from "../scanner/actionEngine.js";
import { getEffectiveDomainCategory } from "../scanner/lookalikeDomainDetector.js";
import { getResultsHighlights } from "../scanner/scanResultSummary.js";
import {
  formatLockedLinkDisplay,
  shouldLockLinks,
} from "../scanner/linkLock.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { useScan } from "../context/ScanContext.jsx";
import { RiskScorePanel } from "./RiskScorePanel.jsx";
import { ActionPlanPanel } from "./ActionPlanPanel.jsx";
import { SiteReputationPanel } from "./SiteReputationPanel.jsx";
import { TrustSpreadReviewPanel } from "./TrustSpreadReviewPanel.jsx";
import { LookalikeDomainReviewPanel } from "./LookalikeDomainReviewPanel.jsx";
import { AlertCreatedNotice } from "./AlertCreatedNotice.jsx";
import { CategoryBadge } from "./CategoryBadge.jsx";
import { CollapsibleSection } from "./CollapsibleSection.jsx";
import { DemoGuidanceBox } from "./DemoGuidanceBox.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";

function ListOrNone({ items, emptyLabel }) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => typeof item === "string")
    : [];

  if (!safeItems.length) {
    return <span className="muted">{emptyLabel}</span>;
  }
  return (
    <ul className="result-list">
      {safeItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function LinksList({ links, siteLists, lookalikeResult, linksLocked = false }) {
  const safeLinks = Array.isArray(links) ? links : [];

  if (!safeLinks.length) {
    return <span className="muted">No links detected in body</span>;
  }
  return (
    <>
      {linksLocked ? (
        <p className="link-lock-notice" role="note">
          Urgent alert — links are defanged and cannot be opened from this view.
        </p>
      ) : null}
      <ul
        className={`result-list result-list--links${
          linksLocked ? " result-list--links-locked" : ""
        }`}
      >
      {safeLinks.map((link, i) => {
        const raw = typeof link?.raw === "string" ? link.raw : String(link ?? "");
        const displayRaw = linksLocked ? formatLockedLinkDisplay(raw) : raw;
        const domain =
          typeof link?.domain === "string" && link.domain
            ? link.domain
            : "unknown";
        const protocol =
          typeof link?.protocol === "string" ? link.protocol : "";
        const isValidUrl = Boolean(link?.isValidUrl);
        const hasUserinfo = Boolean(link?.hasUserinfo);
        let category =
          domain === "unknown"
            ? "unknown"
            : getEffectiveDomainCategory(domain, siteLists, lookalikeResult);
        if (hasUserinfo && category === "trusted") {
          category = "unknown";
        }

        return (
          <li key={`${raw}-${i}`}>
            <code className="code-inline">{displayRaw}</code>
            <span className="link-meta">
              {isValidUrl ? (
                <span className="pill pill--ok">{protocol || "—"}</span>
              ) : (
                <span className="pill pill--warn">Malformed / unparsable URL</span>
              )}
              {hasUserinfo ? (
                <span className="pill pill--warn">
                  Userinfo URL — displayed host may mislead
                </span>
              ) : null}
              <span className="pill">{domain}</span>
              <CategoryBadge category={category} />
            </span>
          </li>
        );
      })}
    </ul>
    </>
  );
}

export function ParseResultsPanel({
  parsed,
  alertResult,
  onViewOnDashboard,
  scanSnapshot = null,
  embedded = false,
}) {
  const { demoMode } = useDemoMode();
  const { lastScan } = useScan();
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();

  const usingRecordSnapshot = Boolean(scanSnapshot?.parsed && scanSnapshot?.scoreResult);
  const usingScanSnapshot =
    usingRecordSnapshot ||
    Boolean(parsed && lastScan?.parsed === parsed && lastScan?.scoreResult);

  const scoreResult = useMemo(() => {
    if (usingRecordSnapshot) {
      return scanSnapshot.scoreResult;
    }
    if (usingScanSnapshot && lastScan?.scoreResult) {
      return lastScan.scoreResult;
    }
    if (!parsed) return null;
    try {
      return scoreEmail(parsed, siteLists, scoringSettings);
    } catch {
      return {
        score: 0,
        riskLevel: "Safe",
        reasons: [],
        recommendedAction: "Allow normally.",
        lookalikeResult: null,
        trustDecay: null,
      };
    }
  }, [
    parsed,
    usingRecordSnapshot,
    scanSnapshot?.scoreResult,
    usingScanSnapshot,
    lastScan?.scoreResult,
    siteLists,
    scoringSettings,
  ]);

  const actionPlan = useMemo(() => {
    if (usingRecordSnapshot && scanSnapshot?.actionPlan) {
      return scanSnapshot.actionPlan;
    }
    if (usingScanSnapshot && lastScan?.actionPlan) {
      return lastScan.actionPlan;
    }
    if (!scoreResult) return null;
    try {
      return getActionPlan(scoreResult, parsed);
    } catch {
      return null;
    }
  }, [
    usingRecordSnapshot,
    scanSnapshot?.actionPlan,
    usingScanSnapshot,
    lastScan?.actionPlan,
    scoreResult,
    parsed,
  ]);

  const highlights = useMemo(() => {
    if (!parsed || !scoreResult) return null;
    return getResultsHighlights(parsed, scoreResult, actionPlan, alertResult);
  }, [parsed, scoreResult, actionPlan, alertResult]);

  const linksLocked = useMemo(
    () =>
      shouldLockLinks({
        record: alertResult?.record ?? alertResult?.alert,
        scoreResult,
        actionPlan,
      }),
    [alertResult, scoreResult, actionPlan]
  );

  const sectionKey = `${parsed?.subject ?? "scan"}-${scoreResult?.score ?? 0}-${alertResult?.record?.id ?? alertResult?.alert?.id ?? "none"}`;

  const senderWarning = useMemo(() => {
    if (!parsed?.sender) return null;
    const { warning } = extractSenderDomain(parsed.sender);
    return warning ?? null;
  }, [parsed?.sender]);

  if (!parsed) {
    return (
      <section className="card results-panel results-panel--empty">
        <div className="results-panel__body">
          <h2>Analysis &amp; results</h2>
          <p className="muted">
            Paste a custom email and click <strong>Scan Email</strong> to see
            trust review, site reputation, risk score, and action plan.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`card results-panel${embedded ? " results-panel--embedded" : ""}`}
      aria-live="polite"
    >
      <div className="results-panel__body">
        {!embedded ? (
          <div className="card__header results-panel__header">
            <h3 className="results-panel__title">Detailed analysis</h3>
            <p className="card__sub">
              Trust review, site reputation, risk score, and action plan.
            </p>
          </div>
        ) : null}

        {!embedded ? <AlertCreatedNotice alertResult={alertResult} /> : null}

        {!embedded &&
        onViewOnDashboard &&
        alertResult?.created &&
        (alertResult.record ?? alertResult.alert) ? (
          <div className="scan-dashboard-cta">
            <button
              type="button"
              className="btn btn--primary"
              onClick={onViewOnDashboard}
            >
              View on Alerts
            </button>
          </div>
        ) : null}

        <p className="scan-settings-note muted" role="note">
          {usingRecordSnapshot || usingScanSnapshot
            ? "Results reflect settings at scan time. Change Settings or Site Lists and re-scan to update."
            : "Scoring used current Settings values."}
        </p>

        {senderWarning && (
          <div className="alert alert--warn" role="status">
            <p>{senderWarning}</p>
          </div>
        )}

        {!embedded && demoMode ? <DemoGuidanceBox /> : null}

        <RiskScorePanel parsed={parsed} scoreResult={scoreResult} />

        <div className="results-panel__collapsibles">
          {actionPlan ? (
            <CollapsibleSection
              key={`action-${sectionKey}`}
              title="Action plan (detailed)"
              preview={actionPlan.badgeLabel}
              defaultOpen={highlights?.defaultOpenSections.actionPlan}
              className="results-panel__collapsible"
            >
              {highlights?.promoteLines.actionPlan ? (
                <p className="results-panel__promote-line">
                  {highlights.promoteLines.actionPlan}
                </p>
              ) : null}
              <ActionPlanPanel parsed={parsed} scoreResult={scoreResult} />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            key={`domain-${sectionKey}`}
            title="Domain & trust review"
            preview="Site reputation, lookalike checks, and spread/trust decay"
            defaultOpen={highlights?.defaultOpenSections.domainTrust}
            className="results-panel__collapsible"
          >
            {highlights?.promoteLines.trustDecay ? (
              <p className="results-panel__promote-line">
                {highlights.promoteLines.trustDecay}
              </p>
            ) : null}
            {highlights?.promoteLines.lookalike ? (
              <p className="results-panel__promote-line">
                {highlights.promoteLines.lookalike}
              </p>
            ) : null}
            {highlights?.promoteLines.dangerousDomain ? (
              <p className="results-panel__promote-line">
                {highlights.promoteLines.dangerousDomain}
              </p>
            ) : null}

            <SiteReputationPanel
              parsed={parsed}
              siteLists={siteLists}
              lookalikeResult={scoreResult?.lookalikeResult}
            />

            <LookalikeDomainReviewPanel
              lookalikeResult={scoreResult?.lookalikeResult}
            />

            <TrustSpreadReviewPanel trustDecay={scoreResult?.trustDecay} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Parsed email details"
            preview={
              parsed.subject
                ? `Subject: ${parsed.subject}`
                : "Sender, links, phrases, and parsed fields"
            }
            className="results-panel__collapsible"
          >
            <dl className="result-grid">
              <dt>Sender</dt>
              <dd>{parsed.sender || <span className="muted">(empty)</span>}</dd>

              <dt>Sender domain</dt>
              <dd>
                {parsed.senderDomain ? (
                  <>
                    <code className="code-inline">{parsed.senderDomain}</code>
                    <CategoryBadge
                      category={getEffectiveDomainCategory(
                        parsed.senderDomain,
                        siteLists,
                        scoreResult?.lookalikeResult
                      )}
                    />
                  </>
                ) : (
                  <span className="muted">Could not derive domain</span>
                )}
              </dd>

              <dt>Subject</dt>
              <dd>{parsed.subject || <span className="muted">(empty)</span>}</dd>

              <dt>Links found</dt>
              <dd>
                <LinksList
                  links={parsed.links ?? []}
                  siteLists={siteLists}
                  lookalikeResult={scoreResult?.lookalikeResult}
                  linksLocked={linksLocked}
                />
              </dd>

              <dt>Attachment status</dt>
              <dd>
                {parsed.hasAttachment
                  ? "Has attachment (simulated)"
                  : "No attachment"}
              </dd>

              <dt>Simulated spread count</dt>
              <dd>{parsed.spreadCount ?? 1}</dd>

              <dt>Simulated student reports</dt>
              <dd>{parsed.studentReportCount ?? 0}</dd>

              <dt>Verified school account</dt>
              <dd>
                {parsed.verifiedSchoolAccount ? "Yes (simulated)" : "No"}
              </dd>

              <dt>Urgent phrases found</dt>
              <dd>
                <ListOrNone
                  items={parsed.detectedUrgentPhrases ?? []}
                  emptyLabel="None detected"
                />
              </dd>

              <dt>Sensitive requests found</dt>
              <dd>
                <ListOrNone
                  items={parsed.detectedSensitiveRequests ?? []}
                  emptyLabel="None detected"
                />
              </dd>

              <dt>Scam keywords found</dt>
              <dd>
                <ListOrNone
                  items={parsed.detectedKeywords ?? []}
                  emptyLabel="None detected"
                />
              </dd>
            </dl>
          </CollapsibleSection>
        </div>

        {!embedded && !demoMode ? (
          <CollapsibleSection
            title="Raw parsed JSON (debug)"
            className="results-panel__collapsible results-panel__collapsible--debug"
          >
            <pre className="debug-json__pre">{JSON.stringify(parsed, null, 2)}</pre>
          </CollapsibleSection>
        ) : null}
      </div>
    </section>
  );
}
