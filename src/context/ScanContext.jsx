import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ScanContext = createContext(null);

export function ScanProvider({ children }) {
  const [lastScan, setLastScanState] = useState(null);

  const setLastScan = useCallback((scan) => {
    setLastScanState(scan);
  }, []);

  const clearLastScan = useCallback(() => {
    setLastScanState(null);
  }, []);

  const value = useMemo(
    () => ({
      lastScan,
      setLastScan,
      clearLastScan,
    }),
    [lastScan, setLastScan, clearLastScan]
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error("useScan must be used within ScanProvider");
  }
  return ctx;
}
