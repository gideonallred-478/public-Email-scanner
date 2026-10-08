import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";
import {
  addDomainToList,
  findDuplicateSiteListEntry,
  getDefaultSiteLists,
  SITE_LIST_CATEGORY_LABELS,
} from "../src/scanner/trustedLinksStore.js";
import { isValidSiteListEntry, normalizeDomain } from "../src/scanner/domainUtils.js";

const DEFAULT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "site-lists.json"
);

function getSiteListsPath() {
  return process.env.SITE_LISTS_DATA_PATH ?? DEFAULT_PATH;
}

function normalizeLists(value) {
  const defaults = getDefaultSiteLists();
  if (
    !value ||
    !Array.isArray(value.trustedSites) ||
    !Array.isArray(value.referenceDomains) ||
    !Array.isArray(value.suspiciousSites) ||
    !Array.isArray(value.dangerousSites)
  ) {
    return defaults;
  }
  return {
    trustedSites: value.trustedSites,
    referenceDomains: value.referenceDomains,
    suspiciousSites: value.suspiciousSites,
    dangerousSites: value.dangerousSites,
  };
}

export async function getSiteLists() {
  const lists = normalizeLists(await readJsonFile(getSiteListsPath(), null));
  return { ok: true, lists };
}

export async function saveSiteLists(lists) {
  await writeJsonFile(getSiteListsPath(), normalizeLists(lists));
  return { ok: true, lists: normalizeLists(lists) };
}

export async function addSiteListDomain(category, domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { ok: false, message: "Enter a domain name to add." };
  }
  if (!isValidSiteListEntry(normalized)) {
    return {
      ok: false,
      reason: "invalid",
      message:
        "Use a full domain like school.edu — bare TLDs such as com or edu are not allowed.",
    };
  }

  const current = normalizeLists(await readJsonFile(getSiteListsPath(), null));
  const duplicate = findDuplicateSiteListEntry(current, category, normalized);
  if (duplicate) {
    return {
      ok: false,
      reason: "duplicate",
      message: duplicate.message,
    };
  }

  const next = addDomainToList(current, category, domain);
  if (next === current) {
    return {
      ok: false,
      reason: "duplicate",
      message: `${normalized} is already on the ${SITE_LIST_CATEGORY_LABELS[category] ?? category} list.`,
    };
  }

  await writeJsonFile(getSiteListsPath(), next);
  return {
    ok: true,
    lists: next,
    message: `${normalized} added to ${SITE_LIST_CATEGORY_LABELS[category] ?? category} list.`,
  };
}
