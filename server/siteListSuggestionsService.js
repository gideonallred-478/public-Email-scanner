import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";
import {
  appendSiteListSuggestion,
  buildSiteListSuggestion,
  listPendingSiteListSuggestions,
  SUGGESTION_STATUS,
  updateSiteListSuggestionStatus,
} from "../src/scanner/siteListSuggestions.js";
import { addSiteListDomain, getSiteLists, saveSiteLists } from "./siteListsService.js";
import { SITE_LIST_CATEGORY_LABELS, addDomainToList } from "../src/scanner/trustedLinksStore.js";

const DEFAULT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "site-list-suggestions.json"
);

function getSuggestionsPath() {
  return process.env.SITE_LIST_SUGGESTIONS_DATA_PATH ?? DEFAULT_PATH;
}

function sanitizeSuggestions(value) {
  return Array.isArray(value) ? value : [];
}

export async function getSiteListSuggestions() {
  const suggestions = sanitizeSuggestions(
    await readJsonFile(getSuggestionsPath(), [])
  );
  return { ok: true, suggestions };
}

export async function createSiteListSuggestion(category, domain, meta = {}) {
  const { lists } = await getSiteLists();
  const { suggestions } = await getSiteListSuggestions();
  const result = buildSiteListSuggestion(lists, suggestions, category, domain, meta);

  if (!result.ok || !result.entry) {
    return result;
  }

  const next = appendSiteListSuggestion(suggestions, result.entry);
  await writeJsonFile(getSuggestionsPath(), next);

  return {
    ...result,
    suggestions: next,
  };
}

export async function reviewSiteListSuggestion(suggestionId, action) {
  const { suggestions } = await getSiteListSuggestions();
  const suggestion = suggestions.find((entry) => entry.id === suggestionId);

  if (!suggestion || suggestion.status !== SUGGESTION_STATUS.PENDING) {
    return { ok: false, message: "Suggestion not found or already reviewed." };
  }

  if (action === "dismiss") {
    const next = updateSiteListSuggestionStatus(
      suggestions,
      suggestionId,
      SUGGESTION_STATUS.DISMISSED
    );
    await writeJsonFile(getSuggestionsPath(), next);
    return {
      ok: true,
      suggestions: next,
      message: `Dismissed suggestion for ${suggestion.domain}.`,
    };
  }

  if (action !== "approve") {
    return { ok: false, message: "Invalid review action." };
  }

  const { lists } = await getSiteLists();
  const nextLists = addDomainToList(lists, suggestion.category, suggestion.domain);
  if (nextLists === lists) {
    return {
      ok: false,
      reason: "duplicate",
      message: `${suggestion.domain} is already on the ${SITE_LIST_CATEGORY_LABELS[suggestion.category]} list.`,
    };
  }

  await saveSiteLists(nextLists);
  const nextSuggestions = updateSiteListSuggestionStatus(
    suggestions,
    suggestionId,
    SUGGESTION_STATUS.APPROVED
  );
  await writeJsonFile(getSuggestionsPath(), nextSuggestions);

  return {
    ok: true,
    lists: nextLists,
    suggestions: nextSuggestions,
    message: `${suggestion.domain} approved and added to ${SITE_LIST_CATEGORY_LABELS[suggestion.category]}.`,
  };
}

export async function getPendingSiteListSuggestionCount() {
  const { suggestions } = await getSiteListSuggestions();
  return listPendingSiteListSuggestions(suggestions).length;
}
