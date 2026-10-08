import { getDashboardQueueCards } from "../scanner/dashboardPresentation.js";

export function AlertSummaryCards({ summary, activeFilter, onSelect }) {
  const cards = getDashboardQueueCards(summary);

  return (
    <section className="alert-summary-grid" aria-label="Investigation queues">
      {cards.map((card) => (
        <button
          type="button"
          key={card.id}
          className={`alert-summary-card alert-summary-card--${card.tone}${
            activeFilter === card.id ? " alert-summary-card--active" : ""
          }`}
          onClick={() => onSelect?.(card.id)}
          aria-pressed={activeFilter === card.id}
        >
          <span className="alert-summary-card__topline">
            <span className="alert-summary-card__label">{card.label}</span>
            <span className="alert-summary-card__value">{card.value}</span>
          </span>
          <span className="alert-summary-card__description">{card.description}</span>
        </button>
      ))}
    </section>
  );
}
