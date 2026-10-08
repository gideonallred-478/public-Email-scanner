import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import { useUiPreferences } from "../context/UiPreferencesContext.jsx";
import { AlertNotifySettingsPanel } from "../components/AlertNotifySettingsPanel.jsx";
import {
  SettingsNumberField,
  SettingsSection,
  SettingsToggleField,
} from "../components/SettingsSection.jsx";

export function SettingsPage() {
  const { settings, updateSetting, saveSettings, resetSettings, saveMessage } =
    useScoringSettings();
  const { preferences, setPreference } = useUiPreferences();

  return (
    <div className="page page--settings">
      <header className="page-header page-header--settings">
        <div>
          <h2>Settings</h2>
          <p className="page-header__sub">
            Tune scoring weights and thresholds for this local demo scanner.
          </p>
        </div>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={resetSettings}
          >
            Reset to Defaults
          </button>
          <button type="button" className="btn btn--primary" onClick={saveSettings}>
            Save Settings
          </button>
        </div>
      </header>

      <p className="settings-note card">
        These settings are local demo settings and do not affect real school
        systems. Negative numbers reduce risk. Positive numbers increase risk.
        Final scores are clamped from 0–10.
      </p>

      {saveMessage ? (
        <p className="settings-save-message" role="status">
          {saveMessage}
        </p>
      ) : null}

      <div className="settings-sections">
        <SettingsSection
          title="Display"
          description="Layout options for the Alerts dashboard and header."
        >
          <SettingsToggleField
            label="Show incoming mail panel on Alerts"
            helper="When off, scan count and status stay in the header. Turn on for poll controls and setup notes."
            checked={preferences.showIncomingMailPanelOnAlerts}
            onChange={(value) =>
              setPreference("showIncomingMailPanelOnAlerts", value)
            }
          />
          <SettingsToggleField
            label="Light mode"
            helper="Switch the interface to a light background. Your choice is saved in this browser."
            checked={preferences.colorScheme === "light"}
            onChange={(value) =>
              setPreference("colorScheme", value ? "light" : "dark")
            }
          />
        </SettingsSection>

        <AlertNotifySettingsPanel />

        <SettingsSection
          title="Alerts & Retention"
          description="Dashboard housekeeping and link-lock behavior for this browser."
        >
          <SettingsNumberField
            label="Default retention (days)"
            helper="Auto-removed from Alerts after this many days unless kept for reference."
            value={settings.app.retentionDays}
            onChange={(v) => updateSetting("app", "retentionDays", v)}
          />
          <SettingsNumberField
            label="Keep-for-reference retention (days)"
            value={settings.app.keptRetentionDays}
            onChange={(v) => updateSetting("app", "keptRetentionDays", v)}
          />
          <SettingsNumberField
            label="Link lock minimum score"
            helper="Defang links in analysis at this score and above (0–10)."
            value={settings.app.linkLockMinScore}
            onChange={(v) => updateSetting("app", "linkLockMinScore", v)}
          />
        </SettingsSection>

        <SettingsSection
          title="Sender Rules"
          description="Adjust how sender domains affect the score."
        >
          <SettingsNumberField
            label="Unknown sender domain penalty"
            value={settings.sender.unknownSenderDomain}
            onChange={(v) => updateSetting("sender", "unknownSenderDomain", v)}
          />
          <SettingsNumberField
            label="Suspicious sender penalty (site list)"
            value={settings.sender.suspiciousSenderDomain}
            onChange={(v) => updateSetting("sender", "suspiciousSenderDomain", v)}
          />
          <SettingsNumberField
            label="Dangerous sender penalty"
            value={settings.sender.dangerousSenderDomain}
            onChange={(v) => updateSetting("sender", "dangerousSenderDomain", v)}
          />
          <SettingsNumberField
            label="Trusted sender bonus"
            helper="Negative values reduce risk."
            value={settings.sender.trustedSenderBonus}
            onChange={(v) => updateSetting("sender", "trustedSenderBonus", v)}
          />
          <SettingsNumberField
            label="Verified school sender bonus"
            helper="Negative values reduce risk."
            value={settings.sender.verifiedSchoolSenderBonus}
            onChange={(v) =>
              updateSetting("sender", "verifiedSchoolSenderBonus", v)
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Link Rules"
          description="Adjust link count, protocol, and domain reputation scoring."
        >
          <SettingsNumberField
            label="HTTP link penalty"
            value={settings.links.insecureHttp}
            onChange={(v) => updateSetting("links", "insecureHttp", v)}
          />
          <SettingsNumberField
            label="Multiple links penalty"
            value={settings.links.multipleLinks}
            onChange={(v) => updateSetting("links", "multipleLinks", v)}
          />
          <SettingsNumberField
            label="Single link with suspicious context penalty"
            value={settings.links.oneLinkWithSuspiciousContext}
            onChange={(v) =>
              updateSetting("links", "oneLinkWithSuspiciousContext", v)
            }
          />
          <SettingsNumberField
            label="Suspicious link domain penalty"
            value={settings.links.suspiciousLinkDomain}
            onChange={(v) => updateSetting("links", "suspiciousLinkDomain", v)}
          />
          <SettingsNumberField
            label="Dangerous link domain penalty"
            value={settings.links.dangerousLinkDomain}
            onChange={(v) => updateSetting("links", "dangerousLinkDomain", v)}
          />
          <SettingsNumberField
            label="Trusted link bonus"
            helper="Negative values reduce risk."
            value={settings.links.trustedLinkBonus}
            onChange={(v) => updateSetting("links", "trustedLinkBonus", v)}
          />
          <SettingsNumberField
            label="Malformed link penalty"
            value={settings.links.malformedLink}
            onChange={(v) => updateSetting("links", "malformedLink", v)}
          />
        </SettingsSection>

        <SettingsSection
          title="Language Rules"
          description="Adjust urgent language, scam keywords, and sensitive requests."
        >
          <SettingsNumberField
            label="Urgent phrase penalty"
            value={settings.language.urgentPhrases}
            onChange={(v) => updateSetting("language", "urgentPhrases", v)}
          />
          <SettingsNumberField
            label="Many urgent phrases penalty"
            value={settings.language.manyUrgentPhrases}
            onChange={(v) => updateSetting("language", "manyUrgentPhrases", v)}
          />
          <SettingsNumberField
            label="Sensitive request penalty"
            value={settings.language.sensitiveRequests}
            onChange={(v) => updateSetting("language", "sensitiveRequests", v)}
          />
          <SettingsNumberField
            label="Scam keyword penalty"
            value={settings.language.scamKeywords}
            onChange={(v) => updateSetting("language", "scamKeywords", v)}
          />
          <SettingsNumberField
            label="Many scam keywords penalty"
            value={settings.language.manyScamKeywords}
            onChange={(v) => updateSetting("language", "manyScamKeywords", v)}
          />
          <SettingsNumberField
            label="Scholarship scam pattern penalty"
            value={settings.language.scholarshipScamPattern}
            onChange={(v) => updateSetting("language", "scholarshipScamPattern", v)}
          />
          <SettingsNumberField
            label="Soft context phrase penalty"
            helper="Weak signal for phrases like limited slots in school mail."
            value={settings.language.softContextPhrase}
            onChange={(v) => updateSetting("language", "softContextPhrase", v)}
          />
        </SettingsSection>

        <SettingsSection title="Attachment Rules">
          <SettingsNumberField
            label="Attachment penalty"
            value={settings.attachments.hasAttachment}
            onChange={(v) => updateSetting("attachments", "hasAttachment", v)}
          />
        </SettingsSection>

        <SettingsSection
          title="Spread / Report Rules"
          description="Used by scoring and trust decay review signals."
        >
          <SettingsNumberField
            label="Spread 11–30 penalty"
            value={settings.spread.spread11to30}
            onChange={(v) => updateSetting("spread", "spread11to30", v)}
          />
          <SettingsNumberField
            label="Spread 31–75 penalty"
            value={settings.spread.spread31to75}
            onChange={(v) => updateSetting("spread", "spread31to75", v)}
          />
          <SettingsNumberField
            label="Spread over 75 penalty"
            value={settings.spread.spreadOver75}
            onChange={(v) => updateSetting("spread", "spreadOver75", v)}
          />
          <SettingsNumberField
            label="1 report with context penalty"
            value={settings.spread.reports1WithContext}
            onChange={(v) => updateSetting("spread", "reports1WithContext", v)}
          />
          <SettingsNumberField
            label="2–4 reports penalty"
            value={settings.spread.reports2to4}
            onChange={(v) => updateSetting("spread", "reports2to4", v)}
          />
          <SettingsNumberField
            label="5+ reports penalty"
            value={settings.spread.reports5plus}
            onChange={(v) => updateSetting("spread", "reports5plus", v)}
          />
        </SettingsSection>

        <SettingsSection
          title="Lookalike Rules"
          description="Points added when a domain resembles a reference domain."
        >
          <SettingsNumberField
            label="Low severity lookalike penalty"
            value={settings.lookalikes.lowSeverity}
            onChange={(v) => updateSetting("lookalikes", "lowSeverity", v)}
          />
          <SettingsNumberField
            label="Medium severity lookalike penalty"
            value={settings.lookalikes.mediumSeverity}
            onChange={(v) => updateSetting("lookalikes", "mediumSeverity", v)}
          />
          <SettingsNumberField
            label="High severity lookalike penalty"
            value={settings.lookalikes.highSeverity}
            onChange={(v) => updateSetting("lookalikes", "highSeverity", v)}
          />
        </SettingsSection>

        <SettingsSection
          title="Thresholds"
          description="When spread and report counts trigger stronger review logic."
        >
          <SettingsNumberField
            label="High spread start"
            value={settings.thresholds.highSpreadStart}
            onChange={(v) => updateSetting("thresholds", "highSpreadStart", v)}
          />
          <SettingsNumberField
            label="Very high spread start"
            value={settings.thresholds.veryHighSpreadStart}
            onChange={(v) =>
              updateSetting("thresholds", "veryHighSpreadStart", v)
            }
          />
          <SettingsNumberField
            label="Extreme spread start"
            value={settings.thresholds.extremeSpreadStart}
            onChange={(v) =>
              updateSetting("thresholds", "extremeSpreadStart", v)
            }
          />
          <SettingsNumberField
            label="Reports review start"
            value={settings.thresholds.reportsReviewStart}
            onChange={(v) => updateSetting("thresholds", "reportsReviewStart", v)}
          />
          <SettingsNumberField
            label="Reports urgent start"
            value={settings.thresholds.reportsUrgentStart}
            onChange={(v) => updateSetting("thresholds", "reportsUrgentStart", v)}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
