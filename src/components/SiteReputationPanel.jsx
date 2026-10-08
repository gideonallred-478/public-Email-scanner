import { useMemo } from "react";
import {
  getDomainCategory,
} from "../scanner/trustedLinksStore.js";
import {
  getEffectiveDomainCategory,
} from "../scanner/lookalikeDomainDetector.js";
import { CategoryBadge } from "./CategoryBadge.jsx";

export function SiteReputationPanel({ parsed, siteLists, lookalikeResult }) {
  const reputation = useMemo(() => {
    if (!parsed) return null;

    const senderDomain = parsed.senderDomain || "";
    const senderCategory = senderDomain
      ? getEffectiveDomainCategory(senderDomain, siteLists, lookalikeResult)
      : "unknown";

    const links = Array.isArray(parsed.links) ? parsed.links : [];
    const linkChecks = links.map((link) => {
      const domain =
        typeof link?.domain === "string" && link.domain ? link.domain : "unknown";
      return {
        raw: typeof link?.raw === "string" ? link.raw : String(link ?? ""),
        domain,
        category:
          domain === "unknown"
            ? "unknown"
            : getEffectiveDomainCategory(domain, siteLists, lookalikeResult),
        listCategory:
          domain === "unknown"
            ? "unknown"
            : getDomainCategory(domain, siteLists),
      };
    });

    return { senderDomain, senderCategory, linkChecks };
  }, [parsed, siteLists, lookalikeResult]);

  if (!reputation) return null;

  return (
    <section className="site-reputation" aria-label="Site reputation">
      <h3 className="results-section-title results-section-title--inline">
        Site reputation
      </h3>

      <dl className="reputation-grid">
        <dt>Sender domain</dt>
        <dd>
          <code className="code-inline">
            {reputation.senderDomain || "unknown"}
          </code>
          <CategoryBadge category={reputation.senderCategory} />
        </dd>

        <dt>Link domains</dt>
        <dd>
          {!reputation.linkChecks.length ? (
            <span className="muted">No links to check</span>
          ) : (
            <ul className="reputation-links">
              {reputation.linkChecks.map((link, index) => (
                <li key={`${link.raw}-${index}`}>
                  <code className="code-inline">{link.domain}</code>
                  <CategoryBadge category={link.category} />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </section>
  );
}
