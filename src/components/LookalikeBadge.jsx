export function LookalikeBadge({ status, severity }) {
  if (status === "none" || !status) {
    return (
      <span className="lookalike-badge lookalike-badge--none">
        No lookalike detected
      </span>
    );
  }

  if (severity === "high") {
    return (
      <span className="lookalike-badge lookalike-badge--high">
        High-risk lookalike
      </span>
    );
  }

  return (
    <span className="lookalike-badge lookalike-badge--possible">
      Possible lookalike
    </span>
  );
}
