const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void }} [options]
 */
export function createFocusTrap(container, options = {}) {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      options.onEscape?.();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", handleKeyDown);

  const focusable = getFocusableElements(container);
  (focusable[0] ?? container).focus();

  return () => {
    container.removeEventListener("keydown", handleKeyDown);
    previouslyFocused?.focus?.();
  };
}
