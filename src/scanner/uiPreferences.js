export const UI_PREFERENCES_STORAGE_KEY = "senior-email-scanner-ui-preferences";

/** @typedef {ReturnType<typeof getDefaultUiPreferences>} UiPreferences */

export function getDefaultUiPreferences() {
  return {
    showIncomingMailPanelOnAlerts: false,
    colorScheme: "dark",
  };
}

function mergeUiPreferences(partial) {
  const defaults = getDefaultUiPreferences();
  if (!partial || typeof partial !== "object") return defaults;

  return {
    showIncomingMailPanelOnAlerts:
      typeof partial.showIncomingMailPanelOnAlerts === "boolean"
        ? partial.showIncomingMailPanelOnAlerts
        : defaults.showIncomingMailPanelOnAlerts,
    colorScheme:
      partial.colorScheme === "light" || partial.colorScheme === "dark"
        ? partial.colorScheme
        : defaults.colorScheme,
  };
}

export function loadUiPreferences() {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return getDefaultUiPreferences();
    return mergeUiPreferences(JSON.parse(raw));
  } catch {
    return getDefaultUiPreferences();
  }
}

export function saveUiPreferences(preferences) {
  try {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify(mergeUiPreferences(preferences))
    );
    return true;
  } catch {
    return false;
  }
}

/** @param {"dark" | "light"} colorScheme */
export function applyColorScheme(colorScheme) {
  if (typeof document === "undefined") return;

  if (colorScheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
