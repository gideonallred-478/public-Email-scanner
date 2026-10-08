export function AlertBulkActionsBar({
  visibleCount,
  selectedCount,
  allVisibleSelected,
  onToggleSelectAll,
  onResolveSelected,
  onExportJson,
  onExportCsv,
  disabled,
}) {
  if (visibleCount === 0) return null;

  return (
    <section className="card alert-bulk-actions" aria-label="Bulk alert actions">
      <label className="alert-bulk-actions__select">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={(event) => onToggleSelectAll(event.target.checked)}
          disabled={disabled}
        />
        <span>
          Select all visible ({visibleCount})
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
        </span>
      </label>

      <div className="alert-bulk-actions__buttons">
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={onResolveSelected}
          disabled={disabled || selectedCount === 0}
        >
          Resolve selected
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={onExportJson}
          disabled={disabled || visibleCount === 0}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={onExportCsv}
          disabled={disabled || visibleCount === 0}
        >
          Export CSV
        </button>
      </div>
    </section>
  );
}
