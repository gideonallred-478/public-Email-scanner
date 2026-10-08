import { createContext, useCallback, useContext, useMemo, useState } from "react";

const PROCESSED_STORAGE_KEY = "senior-email-scanner-inbox-processed";

const DemoInboxContext = createContext(null);

function readProcessedIds() {
  try {
    const raw = localStorage.getItem(PROCESSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function DemoInboxProvider({ children }) {
  const [processedIds, setProcessedIds] = useState(readProcessedIds);

  const persistProcessed = useCallback((ids) => {
    try {
      localStorage.setItem(PROCESSED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignore storage failures in demo mode
    }
  }, []);

  const markProcessed = useCallback(
    (scenarioId) => {
      if (!scenarioId) return;
      setProcessedIds((prev) => {
        if (prev.includes(scenarioId)) return prev;
        const next = [...prev, scenarioId];
        persistProcessed(next);
        return next;
      });
    },
    [persistProcessed]
  );

  const resetInbox = useCallback(() => {
    setProcessedIds([]);
    persistProcessed([]);
  }, [persistProcessed]);

  const isProcessed = useCallback(
    (scenarioId) => processedIds.includes(scenarioId),
    [processedIds]
  );

  const value = useMemo(
    () => ({
      processedIds,
      markProcessed,
      resetInbox,
      isProcessed,
    }),
    [processedIds, markProcessed, resetInbox, isProcessed]
  );

  return (
    <DemoInboxContext.Provider value={value}>{children}</DemoInboxContext.Provider>
  );
}

export function useDemoInbox() {
  const ctx = useContext(DemoInboxContext);
  if (!ctx) {
    throw new Error("useDemoInbox must be used within DemoInboxProvider");
  }
  return ctx;
}
