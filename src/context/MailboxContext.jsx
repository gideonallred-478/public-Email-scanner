import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getMailboxConfig,
  getMailboxStatusLabel,
} from "../mail/mailboxConfig.js";
import { createMailboxConnector } from "../mail/mailboxConnector.js";
import { normalizeLiveEmailMessage } from "../mail/incomingEmail.js";

const MailboxContext = createContext(null);

export function MailboxProvider({ children }) {
  const config = useMemo(() => getMailboxConfig(), []);
  const connector = useMemo(() => createMailboxConnector(config), [config]);

  const [connectionState, setConnectionState] = useState("checking");
  const [statusMessage, setStatusMessage] = useState(
    getMailboxStatusLabel(config)
  );
  const [mailboxAddress, setMailboxAddress] = useState(config.mailbox);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const result = await connector.connect();
      if (cancelled) return;

      if (result.ok && result.mode === "demo") {
        setConnectionState("demo");
        setStatusMessage(
          import.meta.env?.PROD
            ? "Web preview — open the Demo tab to run sample emails through the scanner."
            : "Demo feed active — use the Demo tab to simulate incoming mail."
        );
        return;
      }

      if (result.ok) {
        setConnectionState("connected");
        setMailboxAddress(result.mailbox ?? config.mailbox);
        setStatusMessage(`Live mailbox connected — ${result.mailbox ?? config.mailbox}`);
        return;
      }

      if (result.reason === "not_configured") {
        setConnectionState("unconfigured");
        setStatusMessage(
          result.message ??
            "Copy .env.example to .env.local and add your mailbox credentials."
        );
        return;
      }

      if (result.reason === "bridge_unreachable") {
        setConnectionState("bridge-down");
        setStatusMessage(result.message ?? "Mail bridge is not running.");
        return;
      }

      setConnectionState("disconnected");
      setStatusMessage(result.message ?? "Mailbox configured but not connected.");
    }

    bootstrap();
    const intervalId = window.setInterval(bootstrap, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      connector.disconnect?.();
    };
  }, [config, connector]);

  const normalizeLivePayload = useCallback(
    (payload) => normalizeLiveEmailMessage(payload, { mailbox: mailboxAddress }),
    [mailboxAddress]
  );

  const value = useMemo(
    () => ({
      config,
      connector,
      connectionState,
      statusMessage,
      mailboxAddress,
      isDemoMode: connectionState === "demo",
      isWebDemo: connectionState === "demo" && Boolean(import.meta.env?.PROD),
      isLiveConnected: connectionState === "connected",
      isLiveReady: config.liveEnabled,
      normalizeLivePayload,
    }),
    [
      config,
      connector,
      connectionState,
      statusMessage,
      mailboxAddress,
      normalizeLivePayload,
    ]
  );

  return (
    <MailboxContext.Provider value={value}>{children}</MailboxContext.Provider>
  );
}

export function useMailbox() {
  const ctx = useContext(MailboxContext);
  if (!ctx) {
    throw new Error("useMailbox must be used within MailboxProvider");
  }
  return ctx;
}
