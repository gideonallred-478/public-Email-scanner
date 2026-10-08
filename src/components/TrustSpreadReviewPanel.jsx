import { DecayBadge } from "./DecayBadge.jsx";

export function TrustSpreadReviewPanel({ trustDecay }) {
  if (!trustDecay) return null;

  const reasons = Array.isArray(trustDecay.reasons) ? trustDecay.reasons : [];
  const affected = Array.isArray(trustDecay.affectedDomains)
    ? trustDecay.affectedDomains
    : [];

  return (
    <section className="trust-spread-review" aria-label="Trust and spread review">
      <div className="trust-spread-review__header">
        <h3 className="results-section-title results-section-title--inline">
          Trust &amp; Spread Review
        </h3>
        <DecayBadge level={trustDecay.decayLevel} />
      </div>

      <dl className="reputation-grid">
        <dt>Simulated spread count</dt>
        <dd>{trustDecay.spreadCount ?? 1}</dd>

        <dt>Simulated student reports</dt>
        <dd>{trustDecay.studentReportCount ?? 0}</dd>

        <dt>Verified school account</dt>
        <dd>
          {trustDecay.verifiedSchoolAccount ? "Yes (simulated)" : "No"}
        </dd>

        <dt>Trust decay applied</dt>
        <dd>{trustDecay.trustDecayApplied ? "Yes" : "No"}</dd>

        <dt>Review recommended</dt>
        <dd>{trustDecay.reviewNeeded ? "Yes" : "No"}</dd>
      </dl>

      {affected.length > 0 && (
        <div className="trust-spread-review__domains">
          <h4>Affected domains (this scan only)</h4>
          <ul className="trust-affected-list">
            {affected.map((item) => (
              <li key={`${item.domain}-${item.adjustedTrust}`}>
                <code className="code-inline">{item.domain}</code>
                <span className="muted">was {item.originalCategory}</span>
                <DecayBadge level={item.adjustedTrust} />
                <p className="trust-affected-list__reason">{item.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reasons.length > 0 && (
        <div className="trust-spread-review__reasons">
          <h4>Trust decay reasons</h4>
          <ul className="score-reasons score-reasons--trust">
            {reasons.map((reason, index) => {
              const points = reason?.points ?? 0;
              const pointsLabel = points > 0 ? `+${points}` : String(points);
              return (
                <li
                  key={`${reason?.label ?? "reason"}-${index}`}
                  className="score-reason"
                >
                  <div className="score-reason__header">
                    <span className="score-reason__label">
                      {reason?.label ?? "Signal"}
                    </span>
                    <span className="score-reason__points">{pointsLabel}</span>
                  </div>
                  <p className="score-reason__detail">{reason?.detail ?? ""}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!trustDecay.trustDecayApplied && (
        <p className="muted trust-spread-review__stable">
          Normal behavior — trusted domains keep their usual bonus for this scan.
        </p>
      )}
    </section>
  );
}
