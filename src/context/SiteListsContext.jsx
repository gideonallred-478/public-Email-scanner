import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDomainToList,
  findDuplicateSiteListEntry,
  getDefaultSiteLists,
  SITE_LIST_CATEGORY_LABELS,
} from "../scanner/trustedLinksStore.js";
import {
  appendSiteListSuggestion,
  buildSiteListSuggestion,
  listPendingSiteListSuggestions,
  loadSiteListSuggestions,
  saveSiteListSuggestions,
  SUGGESTION_STATUS,
  updateSiteListSuggestionStatus,
} from "../scanner/siteListSuggestions.js";
import { isValidSiteListEntry, normalizeDomain } from "../scanner/domainUtils.js";
import { useAuth } from "./AuthContext.jsx";
import {
  addSharedSiteListDomain,
  createSharedSiteListSuggestion,
  fetchSharedSiteListSuggestions,
  fetchSharedSiteLists,
  reviewSharedSiteListSuggestion,
} from "../api/sharedDataApi.js";

const SITE_LISTS_STORAGE_KEY = "senior-email-scanner-site-lists";
const SHARED_SYNC_INTERVAL_MS = 15_000;

const SiteListsContext = createContext(null);

function readStoredSiteLists() {
  try {
    const raw = localStorage.getItem(SITE_LISTS_STORAGE_KEY);
    if (!raw) return getDefaultSiteLists();
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.trustedSites) &&
      Array.isArray(parsed.referenceDomains) &&
      Array.isArray(parsed.suspiciousSites) &&
      Array.isArray(parsed.dangerousSites)
    ) {
      return parsed;
    }
  } catch {
    // fall through to defaults
  }
  return getDefaultSiteLists();
}

function persistLocalSiteLists(lists) {
  try {
    localStorage.setItem(SITE_LISTS_STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // ignore storage failures in demo mode
  }
}

export function SiteListsProvider({ children }) {
  const { isAuthenticated, useSharedData } = useAuth();
  const [lists, setLists] = useState(readStoredSiteLists);
  const [suggestions, setSuggestions] = useState(() => loadSiteListSuggestions());
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const syncVersionRef = useRef(0);

  const refreshFromServer = useCallback(async () => {
    if (!useSharedData || !isAuthenticated) return { ok: false };

    const version = ++syncVersionRef.current;
    setSyncing(true);

    try {
      const [listsResult, suggestionsResult] = await Promise.all([
        fetchSharedSiteLists(),
        fetchSharedSiteListSuggestions(),
      ]);

      if (version !== syncVersionRef.current) {
        return { ok: false, reason: "stale" };
      }

      if (!listsResult.ok || !suggestionsResult.ok) {
        setSyncError("Could not sync site lists from the server.");
        return { ok: false };
      }

      setLists(listsResult.payload?.lists ?? getDefaultSiteLists());
      setSuggestions(suggestionsResult.payload?.suggestions ?? []);
      setSyncError("");
      return { ok: true };
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Site list sync failed."
      );
      return { ok: false };
    } finally {
      if (version === syncVersionRef.current) {
        setSyncing(false);
      }
    }
  }, [useSharedData, isAuthenticated]);

  useEffect(() => {
    if (!useSharedData || !isAuthenticated) return;
    void refreshFromServer();
    const intervalId = window.setInterval(() => {
      void refreshFromServer();
    }, SHARED_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [useSharedData, isAuthenticated, refreshFromServer]);

  useEffect(() => {
    if (useSharedData) return;
    persistLocalSiteLists(lists);
  }, [lists, useSharedData]);

  useEffect(() => {
    if (useSharedData) return;
    saveSiteListSuggestions(suggestions);
  }, [suggestions, useSharedData]);

  const addDomain = useCallback(
    async (category, domain) => {
      const normalized = normalizeDomain(domain);
      if (!normalized) {
        return {
          ok: false,
          message: "Enter a domain name to add.",
        };
      }
      if (!isValidSiteListEntry(normalized)) {
        return {
          ok: false,
          reason: "invalid",
          message:
            "Use a full domain like school.edu — bare TLDs such as com or edu are not allowed.",
        };
      }

      const duplicate = findDuplicateSiteListEntry(lists, category, normalized);
      if (duplicate) {
        return {
          ok: false,
          reason: "duplicate",
          message: duplicate.message,
        };
      }

      if (useSharedData) {
        const result = await addSharedSiteListDomain(category, domain);
        if (!result.ok || !result.payload?.ok) {
          return (
            result.payload ?? {
              ok: false,
              message: "Could not add domain on the server.",
            }
          );
        }
        setLists(result.payload.lists ?? lists);
        return result.payload;
      }

      let accepted = false;
      setLists((prev) => {
        const next = addDomainToList(prev, category, domain);
        accepted = next !== prev;
        return next;
      });

      return accepted
        ? {
            ok: true,
            message: `${normalized} added to ${SITE_LIST_CATEGORY_LABELS[category] ?? category} list.`,
          }
        : {
            ok: false,
            reason: "duplicate",
            message: `${normalized} is already on the ${SITE_LIST_CATEGORY_LABELS[category] ?? category} list.`,
          };
    },
    [lists, useSharedData]
  );

  const suggestDomain = useCallback(
    async (category, domain, meta = {}) => {
      if (useSharedData) {
        const result = await createSharedSiteListSuggestion(
          category,
          domain,
          meta.note ?? ""
        );
        if (!result.ok || !result.payload?.ok) {
          return (
            result.payload ?? {
              ok: false,
              message: "Could not submit suggestion to the server.",
            }
          );
        }
        if (result.payload.suggestions) {
          setSuggestions(result.payload.suggestions);
        } else {
          await refreshFromServer();
        }
        return result.payload;
      }

      const built = buildSiteListSuggestion(lists, suggestions, category, domain, meta);
      if (!built.ok || !built.entry) {
        return built;
      }

      setSuggestions((prev) => appendSiteListSuggestion(prev, built.entry));
      return built;
    },
    [lists, suggestions, useSharedData, refreshFromServer]
  );

  const approveSuggestion = useCallback(
    async (suggestionId) => {
      if (useSharedData) {
        const result = await reviewSharedSiteListSuggestion(suggestionId, "approve");
        if (!result.ok || !result.payload?.ok) {
          return (
            result.payload ?? {
              ok: false,
              message: "Could not approve suggestion on the server.",
            }
          );
        }
        if (result.payload.lists) setLists(result.payload.lists);
        if (result.payload.suggestions) setSuggestions(result.payload.suggestions);
        return result.payload;
      }

      const suggestion = suggestions.find((entry) => entry.id === suggestionId);
      if (!suggestion || suggestion.status !== SUGGESTION_STATUS.PENDING) {
        return { ok: false, message: "Suggestion not found or already reviewed." };
      }

      const addResult = await addDomain(suggestion.category, suggestion.domain);
      if (!addResult.ok) {
        return addResult;
      }

      setSuggestions((prev) =>
        updateSiteListSuggestionStatus(prev, suggestionId, SUGGESTION_STATUS.APPROVED)
      );

      return {
        ok: true,
        message: `${suggestion.domain} approved and added to ${SITE_LIST_CATEGORY_LABELS[suggestion.category]}.`,
      };
    },
    [addDomain, suggestions, useSharedData]
  );

  const dismissSuggestion = useCallback(
    async (suggestionId) => {
      if (useSharedData) {
        const result = await reviewSharedSiteListSuggestion(suggestionId, "dismiss");
        if (!result.ok || !result.payload?.ok) {
          return (
            result.payload ?? {
              ok: false,
              message: "Could not dismiss suggestion on the server.",
            }
          );
        }
        if (result.payload.suggestions) setSuggestions(result.payload.suggestions);
        return result.payload;
      }

      const suggestion = suggestions.find((entry) => entry.id === suggestionId);
      if (!suggestion || suggestion.status !== SUGGESTION_STATUS.PENDING) {
        return { ok: false, message: "Suggestion not found or already reviewed." };
      }

      setSuggestions((prev) =>
        updateSiteListSuggestionStatus(prev, suggestionId, SUGGESTION_STATUS.DISMISSED)
      );

      return { ok: true, message: `Dismissed suggestion for ${suggestion.domain}.` };
    },
    [suggestions, useSharedData]
  );

  const pendingSuggestions = useMemo(
    () => listPendingSiteListSuggestions(suggestions),
    [suggestions]
  );

  const value = useMemo(
    () => ({
      lists,
      suggestions,
      pendingSuggestions,
      addDomain,
      suggestDomain,
      approveSuggestion,
      dismissSuggestion,
      syncError,
      syncing,
      useSharedData,
      refreshFromServer,
    }),
    [
      lists,
      suggestions,
      pendingSuggestions,
      addDomain,
      suggestDomain,
      approveSuggestion,
      dismissSuggestion,
      syncError,
      syncing,
      useSharedData,
      refreshFromServer,
    ]
  );

  return (
    <SiteListsContext.Provider value={value}>{children}</SiteListsContext.Provider>
  );
}

export function useSiteLists() {
  const ctx = useContext(SiteListsContext);
  if (!ctx) {
    throw new Error("useSiteLists must be used within SiteListsProvider");
  }
  return ctx;
}
