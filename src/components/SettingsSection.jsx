export function SettingsSection({ title, description, children }) {
  return (
    <section className="card settings-section">
      <header className="settings-section__header">
        <h3>{title}</h3>
        {description ? <p className="settings-section__desc">{description}</p> : null}
      </header>
      <div className="settings-section__grid">{children}</div>
    </section>
  );
}

export function SettingsNumberField({ label, helper, value, onChange }) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      {helper ? <span className="settings-field__helper">{helper}</span> : null}
      <input
        className="field__control settings-field__input"
        type="number"
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SettingsToggleField({ label, helper, checked, onChange }) {
  return (
    <label className="settings-field settings-field--toggle">
      <span className="settings-field__label">{label}</span>
      {helper ? <span className="settings-field__helper">{helper}</span> : null}
      <input
        className="settings-field__toggle"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
