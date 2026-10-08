/**
 * Layer 8 — Scoring rule tuning defaults (local demo only).
 */

export const SCORING_SETTINGS_STORAGE_KEY = "senior-email-scanner-scoring-settings";

/** @typedef {ReturnType<typeof getDefaultScoringSettings>} ScoringSettings */

export function getDefaultScoringSettings() {
  return {
    sender: {
      unknownSenderDomain: 1,
      suspiciousSenderDomain: 2,
      dangerousSenderDomain: 5,
      trustedSenderBonus: -2,
      verifiedSchoolSenderBonus: -2,
    },
    links: {
      oneLinkWithSuspiciousContext: 1,
      multipleLinks: 1,
      insecureHttp: 1,
      suspiciousLinkDomain: 2,
      dangerousLinkDomain: 6,
      trustedLinkBonus: -2,
      malformedLink: 1,
    },
    language: {
      urgentPhrases: 1,
      manyUrgentPhrases: 2,
      scamKeywords: 1,
      manyScamKeywords: 2,
      sensitiveRequests: 3,
      scholarshipScamPattern: 2,
      softContextPhrase: 0.5,
    },
    attachments: {
      hasAttachment: 1,
    },
    spread: {
      spread11to30: 1,
      spread31to75: 2,
      spreadOver75: 3,
      reports1WithContext: 1,
      reports2to4: 2,
      reports5plus: 3,
    },
    lookalikes: {
      lowSeverity: 1,
      mediumSeverity: 2,
      highSeverity: 3,
    },
    context: {
      authenticationRequest: 1,
      restrainedDeadline: 1,
      replyToMismatch: 1,
      externalAuthenticationLink: 2,
      coordinatedSocialEngineering: 3,
    },
    thresholds: {
      highSpreadStart: 31,
      veryHighSpreadStart: 76,
      extremeSpreadStart: 150,
      reportsReviewStart: 2,
      reportsUrgentStart: 5,
    },
    app: {
      retentionDays: 7,
      keptRetentionDays: 90,
      linkLockMinScore: 8,
    },
  };
}

export function getAppSettings(settings = loadScoringSettings()) {
  const merged = mergeScoringSettings(settings);
  const app = merged.app ?? getDefaultScoringSettings().app;

  return {
    retentionDays: Math.max(1, Math.round(app.retentionDays)),
    keptRetentionDays: Math.max(1, Math.round(app.keptRetentionDays)),
    linkLockMinScore: Math.min(10, Math.max(0, Math.round(app.linkLockMinScore))),
  };
}

export function getRetentionDurationMs(keptForReference = false, settings) {
  const app = getAppSettings(settings);
  const days = keptForReference ? app.keptRetentionDays : app.retentionDays;
  return days * 24 * 60 * 60 * 1000;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Deep-merge partial settings onto defaults and coerce numeric fields.
 */
export function mergeScoringSettings(partial) {
  const defaults = getDefaultScoringSettings();

  function mergeSection(defaultSection, partialSection) {
    const next = { ...defaultSection };
    if (!isPlainObject(partialSection)) return next;

    for (const key of Object.keys(defaultSection)) {
      next[key] = toNumber(partialSection[key], defaultSection[key]);
    }
    return next;
  }

  if (!isPlainObject(partial)) return defaults;

  return {
    sender: mergeSection(defaults.sender, partial.sender),
    links: mergeSection(defaults.links, partial.links),
    language: mergeSection(defaults.language, partial.language),
    attachments: mergeSection(defaults.attachments, partial.attachments),
    spread: mergeSection(defaults.spread, partial.spread),
    lookalikes: mergeSection(defaults.lookalikes, partial.lookalikes),
    context: mergeSection(defaults.context, partial.context),
    thresholds: mergeSection(defaults.thresholds, partial.thresholds),
    app: mergeSection(defaults.app, partial.app),
  };
}

export function loadScoringSettings() {
  try {
    const raw = localStorage.getItem(SCORING_SETTINGS_STORAGE_KEY);
    if (!raw) return getDefaultScoringSettings();
    return mergeScoringSettings(JSON.parse(raw));
  } catch {
    return getDefaultScoringSettings();
  }
}

export function saveScoringSettings(settings) {
  try {
    localStorage.setItem(
      SCORING_SETTINGS_STORAGE_KEY,
      JSON.stringify(mergeScoringSettings(settings))
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {ScoringSettings} settings
 * @param {string} section
 * @param {string} key
 * @param {number} value
 */
export function updateScoringSetting(settings, section, key, value) {
  const normalized = mergeScoringSettings(settings);
  if (!normalized[section] || !(key in normalized[section])) return normalized;

  return {
    ...normalized,
    [section]: {
      ...normalized[section],
      [key]: toNumber(value, normalized[section][key]),
    },
  };
}

export const LOOKALIKE_SEVERITY_POINTS = {
  low: "lowSeverity",
  medium: "mediumSeverity",
  high: "highSeverity",
};
