import { APP_NAME } from "../appBrand.js";
import { APP_TABS } from "../auth/rolePermissions.js";

const TAB_LABELS = Object.fromEntries(
  APP_TABS.map((tab) => [tab.id, tab.label])
);

export function buildDocumentTitle(sectionLabel) {
  return `${sectionLabel} · ${APP_NAME}`;
}

export function getDocumentTitleForTab(tabId) {
  return buildDocumentTitle(TAB_LABELS[tabId] ?? "Alerts");
}

export function applyDocumentTitle(sectionLabel) {
  if (typeof document === "undefined") return;
  document.title = buildDocumentTitle(sectionLabel);
}
