import { LookalikeBadge } from "./LookalikeBadge.jsx";



export function LookalikeDomainReviewPanel({ lookalikeResult }) {

  const matches = Array.isArray(lookalikeResult?.matches)

    ? lookalikeResult.matches

    : [];



  return (

    <section className="lookalike-review" aria-label="Lookalike domain review">

      <div className="lookalike-review__header">

        <h3 className="results-section-title results-section-title--inline">

          Lookalike Domain Review

        </h3>

        <LookalikeBadge

          status={lookalikeResult?.hasLookalikes ? "detected" : "none"}

          severity={matches[0]?.severity}

        />

      </div>



      {!lookalikeResult?.hasLookalikes ? (

        <p className="muted">

          No lookalike domains detected. Exact matches and valid subdomains of

          reference domains were not flagged.

        </p>

      ) : (

        <ul className="lookalike-match-list">

          {matches.map((match) => {

            const referenceDomain =

              match.resemblesReferenceDomain ?? match.resemblesTrustedDomain;

            return (

              <li key={`${match.domain}-${referenceDomain}`}>

                <div className="lookalike-match__top">

                  <code className="code-inline">{match.domain}</code>

                  <LookalikeBadge status="detected" severity={match.severity} />

                  <span className="lookalike-match__points">+{match.points}</span>

                </div>

                <p className="lookalike-match__trusted">

                  Resembles reference domain:{" "}

                  <code className="code-inline">{referenceDomain}</code>

                </p>

                <p className="lookalike-match__reason">{match.reason}</p>

              </li>

            );

          })}

        </ul>

      )}

    </section>

  );

}

