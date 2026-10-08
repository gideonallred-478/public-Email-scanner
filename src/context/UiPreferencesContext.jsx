import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyColorScheme,
  loadUiPreferences,
  saveUiPreferences,
} from "../scanner/uiPreferences.js";

const UiPreferencesContext = createContext(null);

export function UiPreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(() => loadUiPreferences());

  useEffect(() => {
    applyColorScheme(preferences.colorScheme);
  }, [preferences.colorScheme]);

  const setPreference = useCallback((key, value) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      saveUiPreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      setPreference,
    }),
    [preferences, setPreference]
  );

  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences() {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useUiPreferences must be used within UiPreferencesProvider"
    );
  }
  return ctx;
}
