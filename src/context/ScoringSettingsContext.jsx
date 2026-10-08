import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  getDefaultScoringSettings,
  loadScoringSettings,
  saveScoringSettings,
  updateScoringSetting,
} from "../scanner/scoringSettings.js";

const ScoringSettingsContext = createContext(null);

export function ScoringSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => loadScoringSettings());
  const [saveMessage, setSaveMessage] = useState("");

  const updateSetting = useCallback((section, key, value) => {
    setSettings((prev) => updateScoringSetting(prev, section, key, value));
    setSaveMessage("");
  }, []);

  const saveSettings = useCallback(() => {
    const ok = saveScoringSettings(settings);
    setSaveMessage(
      ok
        ? "Settings saved to this browser."
        : "Could not save settings in this browser."
    );
  }, [settings]);

  const resetSettings = useCallback(() => {
    const defaults = getDefaultScoringSettings();
    setSettings(defaults);
    saveScoringSettings(defaults);
    setSaveMessage("Settings reset to defaults.");
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSetting,
      saveSettings,
      resetSettings,
      saveMessage,
    }),
    [settings, updateSetting, saveSettings, resetSettings, saveMessage]
  );

  return (
    <ScoringSettingsContext.Provider value={value}>
      {children}
    </ScoringSettingsContext.Provider>
  );
}

export function useScoringSettings() {
  const ctx = useContext(ScoringSettingsContext);
  if (!ctx) {
    throw new Error(
      "useScoringSettings must be used within ScoringSettingsProvider"
    );
  }
  return ctx;
}
