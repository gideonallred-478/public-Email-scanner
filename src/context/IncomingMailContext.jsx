import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isSafeRecord } from "../scanner/alertEngine.js";
import {
  shouldBrowserPollMailbox,
  shouldContinueMailboxDelivery,
} from "../mail/mailboxPresentation.js";
import { useScannerWorkflow } from "./ScannerWorkflowContext.jsx";
import { useAlerts } from "./AlertsContext.jsx";
import { useMailbox } from "./MailboxContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import {
  buildEmailDedupeKey,
  getActiveScanDedupeKeys,
  isEmailAlreadyScanned,
  loadScanRegistry,
} from "../scanner/scanRetention.js";

const LIVE_POLL_INTERVAL_MS = 30_000;

const IncomingMailContext = createContext(null);

export function IncomingMailProvider({ children }) {
  const { processIncomingEmailMessage } = useScannerWorkflow();
  const {
    setHighlightedRecordId,
    setDashboardFilter,
    scanDedupeKeys,
    useSharedData,
    dashboardMutationPending,
  } = useAlerts();
  const {
    connector,
    connectionState,
    statusMessage,
    isLiveConnected,
    normalizeLivePayload,
    mailboxAddress,
  } = useMailbox();
  const { isAuthenticated } = useAuth();

  const [pollingPaused, setPollingPaused] = useState(false);
  const [currentlyScanningId, setCurrentlyScanningId] = useState(null);
  const [lastArrival, setLastArrival] = useState(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [pollError, setPollError] = useState(null);

  const scanningRef = useRef(false);
  const processedIdsRef = useRef(new Set(getActiveScanDedupeKeys()));
  const pollSinceRef = useRef(null);

  useEffect(() => {
    if (useSharedData) {
      processedIdsRef.current = new Set(scanDedupeKeys);
      setProcessedCount(processedIdsRef.current.size);
      return;
    }
    loadScanRegistry();
    processedIdsRef.current = new Set(getActiveScanDedupeKeys());
    setProcessedCount(processedIdsRef.current.size);
  }, [useSharedData, scanDedupeKeys]);

  const deliverLiveMessage = useCallback(
    async (payload) => {
      if (!payload || scanningRef.current) return null;

      const dedupeKey =
        buildEmailDedupeKey(payload) ||
        payload.internetMessageId ||
        payload.messageId ||
        payload.id ||
        payload.uid;
      if (
        dedupeKey &&
        (processedIdsRef.current.has(dedupeKey) ||
          isEmailAlreadyScanned(dedupeKey))
      ) {
        processedIdsRef.current.add(dedupeKey);
        return { ok: true, duplicate: true };
      }

      scanningRef.current = true;
      setCurrentlyScanningId(dedupeKey ?? "live");

      let emailMessage;
      try {
        emailMessage = normalizeLivePayload(payload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to normalize email.";
        scanningRef.current = false;
        setCurrentlyScanningId(null);
        setPollError(message);
        return { ok: false, error: message };
      }

      let result;
      try {
        result = await processIncomingEmailMessage(emailMessage);
      } catch (error) {
        result = {
          ok: false,
          error:
            error instanceof Error ? error.message : "Failed to process incoming email.",
        };
      } finally {
        setCurrentlyScanningId(null);
        scanningRef.current = false;
      }

      if (result?.ok && dedupeKey) {
        processedIdsRef.current.add(dedupeKey);
      }

      if (!result?.ok) {
        setPollError(result?.error ?? "Failed to save the incoming email scan.");
        return result;
      }

      setPollError(null);

      const record = result.recordResult?.record ?? result.recordResult?.alert;
      setProcessedCount(processedIdsRef.current.size);
      if (record) {
        setHighlightedRecordId(record.id);
        if (!isSafeRecord(record)) {
          setDashboardFilter("active");
        }
      }
      setLastArrival({
        subject: emailMessage.subject,
        sender: emailMessage.sender,
        at: emailMessage.receivedAt,
        safe: record ? isSafeRecord(record) : false,
      });
      pollSinceRef.current = emailMessage.receivedAt;

      return result;
    },
    [
      normalizeLivePayload,
      processIncomingEmailMessage,
      setHighlightedRecordId,
      setDashboardFilter,
    ]
  );

  const pollLiveMailbox = useCallback(async () => {
    if (
      !shouldBrowserPollMailbox({
        useSharedData,
        isAuthenticated,
        isLiveConnected,
        pollingPaused,
        scanning: scanningRef.current,
        dashboardMutationPending,
      })
    ) {
      return;
    }

    const result = await connector.poll({
      since: pollSinceRef.current ?? undefined,
    });

    if (!result?.ok) {
      setPollError(result?.message ?? "Mailbox poll failed.");
      return;
    }

    for (const payload of result.messages ?? []) {
      const delivery = await deliverLiveMessage(payload);
      if (!shouldContinueMailboxDelivery(delivery)) break;
    }
  }, [
    connector,
    dashboardMutationPending,
    deliverLiveMessage,
    isAuthenticated,
    isLiveConnected,
    pollingPaused,
    useSharedData,
  ]);

  const pausePolling = useCallback(() => setPollingPaused(true), []);
  const resumePolling = useCallback(() => setPollingPaused(false), []);
  const togglePollingPause = useCallback(
    () => setPollingPaused((value) => !value),
    []
  );

  useEffect(() => {
    if (
      !shouldBrowserPollMailbox({
        useSharedData,
        isAuthenticated,
        isLiveConnected,
        pollingPaused,
        scanning: scanningRef.current,
        dashboardMutationPending,
      })
    ) {
      return;
    }

    void pollLiveMailbox();
    const intervalId = window.setInterval(pollLiveMailbox, LIVE_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    useSharedData,
    isAuthenticated,
    isLiveConnected,
    pollingPaused,
    dashboardMutationPending,
    pollLiveMailbox,
  ]);

  const value = useMemo(
    () => ({
      connectionState,
      statusMessage,
      mailboxAddress,
      pollingPaused,
      isLiveConnected,
      serverManagedScanning: useSharedData,
      currentlyScanningId,
      lastArrival,
      processedCount,
      pollError,
      dashboardMutationPending,
      pollLiveMailbox,
      pausePolling,
      resumePolling,
      togglePollingPause,
    }),
    [
      connectionState,
      statusMessage,
      mailboxAddress,
      pollingPaused,
      isLiveConnected,
      useSharedData,
      currentlyScanningId,
      lastArrival,
      processedCount,
      pollError,
      dashboardMutationPending,
      pollLiveMailbox,
      pausePolling,
      resumePolling,
      togglePollingPause,
    ]
  );

  return (
    <IncomingMailContext.Provider value={value}>
      {children}
    </IncomingMailContext.Provider>
  );
}

export function useIncomingMail() {
  const ctx = useContext(IncomingMailContext);
  if (!ctx) {
    throw new Error("useIncomingMail must be used within IncomingMailProvider");
  }
  return ctx;
}
