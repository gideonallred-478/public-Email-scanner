import { useId, useState } from "react";

/**
 * Reusable collapsible section for scan results and analysis panels.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  preview,
  actions,
  children,
  className = "",
}) {
  const sectionId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = typeof controlledOpen === "boolean";
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  function setOpen(next) {
    if (isControlled) {
      onOpenChange?.(next);
      return;
    }
    setUncontrolledOpen(next);
  }

  function toggleOpen() {
    setOpen(!open);
  }

  return (
    <div className={`collapsible-section ${className}`.trim()}>
      <div className="collapsible-section__header">
        <button
          type="button"
          className="collapsible-section__toggle"
          aria-expanded={open}
          aria-controls={sectionId}
          onClick={toggleOpen}
        >
          <span className="collapsible-section__chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="collapsible-section__title">{title}</span>
        </button>
        {actions ? (
          <div className="collapsible-section__actions">{actions}</div>
        ) : null}
      </div>

      {!open && preview ? (
        <p className="collapsible-section__preview muted">{preview}</p>
      ) : null}

      {open ? (
        <div id={sectionId} className="collapsible-section__body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * @param {string} text
 * @param {number} max
 */
export function truncatePreview(text, max = 120) {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}
