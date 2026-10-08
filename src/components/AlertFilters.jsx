import { getDashboardFilters } from "../scanner/dashboardPresentation.js";

function FilterButton({ filter, activeFilter, onFilterChange }) {
  return (
    <button
      type="button"
      className={`alert-filter-btn${
        activeFilter === filter.id ? " alert-filter-btn--active" : ""
      }`}
      onClick={() => onFilterChange(filter.id)}
      aria-pressed={activeFilter === filter.id}
    >
      {filter.label}
    </button>
  );
}

export function AlertFilters({ activeFilter, onFilterChange }) {
  const filters = getDashboardFilters();
  const secondaryActive = filters.secondary.some(({ id }) => id === activeFilter);

  return (
    <div className="alert-filter-shell">
      <div className="alert-filters" role="toolbar" aria-label="Primary alert filters">
        {filters.primary.map((filter) => (
          <FilterButton
            key={filter.id}
            filter={filter}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ))}
      </div>
      <details className="alert-filter-more" open={secondaryActive || undefined}>
        <summary>{secondaryActive ? "Specialist view active" : "More filters"}</summary>
        <div className="alert-filters alert-filters--secondary" role="toolbar" aria-label="Specialist alert filters">
          {filters.secondary.map((filter) => (
            <FilterButton
              key={filter.id}
              filter={filter}
              activeFilter={activeFilter}
              onFilterChange={onFilterChange}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
