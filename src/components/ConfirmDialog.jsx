import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { createFocusTrap } from "../utils/focusTrap.js";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;

    const releaseFocus = createFocusTrap(dialogRef.current, {
      onEscape: () => {
        if (!cancelDisabled) onCancel();
      },
    });

    return releaseFocus;
  }, [open, onCancel, cancelDisabled]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      onClick={() => {
        if (!cancelDisabled) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="confirm-dialog__header">
          <h3 id={titleId}>{title}</h3>
          <p id={descriptionId} className="confirm-dialog__message">
            {message}
          </p>
        </header>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={cancelDisabled}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? "btn--danger" : "btn--primary"}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
