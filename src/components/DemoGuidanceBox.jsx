import { CollapsibleSection } from "./CollapsibleSection.jsx";

const GUIDANCE_POINTS = [
  {
    title: "Score",
    text: "0–3 is Safe, 4–7 is Suspicious, and 8–10 is Dangerous. The number adds up warning signs.",
  },
  {
    title: "Reasons",
    text: "Each reason shows what raised the score, so you can explain the decision instead of just showing a label.",
  },
  {
    title: "Positive signs",
    text: "Score credits that reduced points, plus normal patterns shown only on Safe-band scans.",
  },
  {
    title: "Next steps",
    text: "Open “What you should do next” for simple safety advice based on the risk band.",
  },
];

export function DemoGuidanceBox({ compact = false }) {
  if (compact) {
    return (
      <aside className="demo-guidance demo-guidance--compact" role="note">
        <strong>Demo tip:</strong> Start with the score and summary, then open{" "}
        <em>Why the score increased</em> to explain each signal.
      </aside>
    );
  }

  return (
    <aside className="demo-guidance" aria-label="Demo presentation guidance">
      <CollapsibleSection
        title="How to read these results"
        defaultOpen={false}
        preview="Score bands, reasons, positive signs, and next steps — quick presenter guide"
      >
        <ul className="demo-guidance__list">
          {GUIDANCE_POINTS.map((point) => (
            <li key={point.title}>
              <strong>{point.title}:</strong> {point.text}
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </aside>
  );
}
