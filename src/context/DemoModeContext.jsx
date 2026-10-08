import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

const PRESENTATION_PROGRESS_KEY = "senior-email-scanner-presentation-progress";

const DemoModeContext = createContext(null);

function readStoredPresentationProgress() {
  try {
    const raw = localStorage.getItem(PRESENTATION_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function DemoModeProvider({ children }) {
  const demoMode = true;
  const [audienceView] = useState("it");
  const [completedSteps, setCompletedSteps] = useState(readStoredPresentationProgress);
  const navigateRef = useRef(null);

  const persistProgress = useCallback((steps) => {
    try {
      localStorage.setItem(PRESENTATION_PROGRESS_KEY, JSON.stringify(steps));
    } catch {
      // ignore storage failures in demo mode
    }
  }, []);

  const registerNavigate = useCallback((handler) => {
    navigateRef.current = typeof handler === "function" ? handler : null;
  }, []);

  const setDemoMode = useCallback((value) => {
    if (Boolean(value)) {
      navigateRef.current?.("demo");
    }
  }, []);

  const toggleDemoMode = useCallback(() => {
    navigateRef.current?.("demo");
  }, []);

  const setAudienceView = useCallback(() => {}, []);

  const markPresentationStepComplete = useCallback(
    (stepId) => {
      if (!stepId) return;
      setCompletedSteps((prev) => {
        if (prev.includes(stepId)) return prev;
        const next = [...prev, stepId];
        persistProgress(next);
        return next;
      });
    },
    [persistProgress]
  );

  const resetPresentationProgress = useCallback(() => {
    setCompletedSteps([]);
    persistProgress([]);
  }, [persistProgress]);

  const value = useMemo(
    () => ({
      demoMode,
      setDemoMode,
      toggleDemoMode,
      audienceView,
      setAudienceView,
      completedSteps,
      markPresentationStepComplete,
      resetPresentationProgress,
      registerNavigate,
    }),
    [
      demoMode,
      setDemoMode,
      toggleDemoMode,
      audienceView,
      setAudienceView,
      completedSteps,
      markPresentationStepComplete,
      resetPresentationProgress,
      registerNavigate,
    ]
  );

  return (
    <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error("useDemoMode must be used within DemoModeProvider");
  }
  return context;
}
