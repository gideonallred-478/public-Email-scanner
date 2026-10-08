import { DEMO_SCENARIOS, getDemoScenarioById } from "./demoScenarios.js";

/** Walkthrough order: safe mail first, then escalating risk. */
export const DEMO_MAIL_FEED_ORDER = [
  "safe-school-announcement",
  "normal-teacher-email",
  "slightly-weird-unknown-link",
  "scholarship-scam",
  "fake-password-reset",
  "lookalike-domain-attack",
  "trusted-link-spreading-fast",
  "known-dangerous-domain",
];

export const DEMO_MAIL_FEED_TOTAL = DEMO_MAIL_FEED_ORDER.length;

export function getNextFeedScenario(processedIds) {
  const processed = Array.isArray(processedIds) ? processedIds : [];
  for (const scenarioId of DEMO_MAIL_FEED_ORDER) {
    if (!processed.includes(scenarioId)) {
      return getDemoScenarioById(scenarioId);
    }
  }
  return null;
}

export function countPendingFeedMail(processedIds) {
  const processed = Array.isArray(processedIds) ? processedIds : [];
  return DEMO_MAIL_FEED_ORDER.filter((id) => !processed.includes(id)).length;
}

export function getFeedScenarioById(scenarioId) {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? null;
}
