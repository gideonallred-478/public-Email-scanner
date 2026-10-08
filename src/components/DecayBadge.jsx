const LABELS = {
  "Normal behavior": "Stable",
  Stable: "Stable",
  Watch: "Watch",
  "Trust reduced": "Trust Reduced",
  "Review needed": "Review Needed",
};

export function DecayBadge({ level }) {
  const label = LABELS[level] ? level : "Normal behavior";
  const slug = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <span className={`decay-badge decay-badge--${slug}`}>{LABELS[label]}</span>
  );
}
