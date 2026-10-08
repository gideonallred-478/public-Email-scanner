import { useDemoMode } from "../context/DemoModeContext.jsx";

export function DemoModeToggle({ className = "" }) {
  const { demoMode, toggleDemoMode } = useDemoMode();

  return (
    <label className={`demo-mode-toggle ${className}`.trim()}>
      <input
        type="checkbox"
        checked={demoMode}
        onChange={toggleDemoMode}
        aria-label="Presentation Mode"
      />
      <span className="demo-mode-toggle__label">Presentation Mode</span>
      {demoMode ? (
        <span className="demo-mode-toggle__status">On</span>
      ) : null}
    </label>
  );
}
