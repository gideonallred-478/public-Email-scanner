const LABELS = {
  trusted: "Trusted",
  suspicious: "Suspicious",
  dangerous: "Dangerous",
  unknown: "Unknown",
  lookalike: "Possible Lookalike",
};

export function CategoryBadge({ category }) {
  const safe = LABELS[category] ? category : "unknown";
  return (
    <span className={`rep-badge rep-badge--${safe}`}>{LABELS[safe]}</span>
  );
}
