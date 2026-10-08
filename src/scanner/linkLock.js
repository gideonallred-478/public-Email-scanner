/**
 * Urgent-alert link lock — defang URLs in the UI so they are not directly openable.
 */

import { getAppSettings } from "./scoringSettings.js";

const URL_REGEX =
  /\b(https?:\/\/[^\s<>"'{}|\\^`\[\]]+|www\.[^\s<>"'{}|\\^`\[\]]+)/gi;

function getLinkLockMinScore() {
  return getAppSettings().linkLockMinScore;
}

export function isUrgentRecord(record) {
  if (!record) return false;
  if (record.flags?.linksLocked) return true;
  const score = Number(record.score);
  return Number.isFinite(score) && score >= getLinkLockMinScore();
}

export function shouldLockLinks({ record, scoreResult, actionPlan } = {}) {
  if (isUrgentRecord(record)) return true;
  const minScore = getLinkLockMinScore();
  if (actionPlan?.restrictLinks) {
    const score = Number(scoreResult?.score ?? record?.score);
    if (Number.isFinite(score) && score >= minScore) return true;
  }
  const score = Number(scoreResult?.score);
  return Number.isFinite(score) && score >= minScore;
}

export function defangUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return raw;

  let defanged = raw.replace(/^https:\/\//i, "hxxps://");
  defanged = defanged.replace(/^http:\/\//i, "hxxp://");
  defanged = defanged.replace(/^www\./i, "www[.]");
  return defanged.replace(/\./g, "[.]");
}

export function defangUrlsInText(text) {
  const source = String(text ?? "");
  if (!source) return source;

  return source.replace(URL_REGEX, (match) => defangUrl(match));
}

export function formatLockedLinkDisplay(raw) {
  return defangUrl(raw);
}
