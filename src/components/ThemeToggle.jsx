import { useUiPreferences } from "../context/UiPreferencesContext.jsx";

export function ThemeToggle({ className = "" }) {
  const { preferences, setPreference } = useUiPreferences();
  const isLight = preferences.colorScheme === "light";

  function handleToggle() {
    setPreference("colorScheme", isLight ? "dark" : "light");
  }

  return (
    <button
      type="button"
      className={`btn btn--secondary btn--small theme-toggle ${className}`.trim()}
      onClick={handleToggle}
      aria-pressed={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isLight ? "☀" : "☾"}
      </span>
      <span className="theme-toggle__label">{isLight ? "Light" : "Dark"}</span>
    </button>
  );
}
