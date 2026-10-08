import { useCallback, useEffect, useState } from "react";
import {
  fetchAlertNotifyStatus,
  getUrgentPushSubscriptionState,
  revokeUrgentPushDevice,
  subscribeToUrgentPush,
  unsubscribeFromUrgentPush,
} from "../notifications/alertNotifications.js";

export function AlertNotifySettingsPanel() {
  const [status, setStatus] = useState(null);
  const [pushState, setPushState] = useState({ supported: false, subscribed: false });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const [result, browserPush] = await Promise.all([
      fetchAlertNotifyStatus(),
      getUrgentPushSubscriptionState(),
    ]);
    setStatus(result);
    setPushState(browserPush);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const enablePush = async () => {
    setActionMessage("Enabling urgent browser push…");
    const result = await subscribeToUrgentPush(status?.webPush?.publicKey);
    setActionMessage(result.ok ? "Urgent browser push enabled on this device." : result.message);
    await loadStatus();
  };

  const disablePush = async () => {
    setActionMessage("Disabling urgent browser push…");
    const result = await unsubscribeFromUrgentPush();
    setActionMessage(result.ok ? "Urgent browser push disabled on this device." : result.message);
    await loadStatus();
  };

  const revokeDevice = async (endpointHash) => {
    setActionMessage("Revoking subscribed browser…");
    const result = await revokeUrgentPushDevice(endpointHash);
    setActionMessage(
      result.ok ? "Subscribed browser revoked." : result.message
    );
    await loadStatus();
  };

  const counts = status?.counts ?? {};
  const devices = Array.isArray(status?.devices) ? status.devices : [];

  return (
    <section className="card settings-section alert-notify-settings">
      <header className="settings-section__header">
        <h3>IT notification routing</h3>
        <p className="settings-section__desc">
          Scores 5–7 create a durable review email. Scores 8–10 create a direct,
          high-priority Web Push alert for subscribed IT browsers. Scores 0–4 do
          not send an outbound alert.
        </p>
      </header>

      {loading ? (
        <p className="muted">Checking notification routing…</p>
      ) : !status?.ok ? (
        <p className="settings-note" role="status">
          {status?.message ?? "Notification routing status is unavailable."}
        </p>
      ) : (
        <>
          <ul className="alert-notify-settings__list muted">
            <li>Review email: {status.email?.configured ? "configured" : "not configured"}</li>
            <li>Urgent Web Push: {status.webPush?.configured ? "configured" : "not configured"}</li>
            <li>Subscribed IT browsers: {status.pushSubscriptions ?? 0}</li>
            <li>
              Queue: {counts.pending ?? 0} pending, {counts.retry_scheduled ?? 0} retrying,{" "}
              {counts.dead ?? 0} dead-letter
            </li>
            {status.oldestOutstandingAgeMs != null ? (
              <li>
                Oldest outstanding delivery: {Math.max(0, Math.round(status.oldestOutstandingAgeMs / 60000))} minutes
              </li>
            ) : null}
            {Object.keys(status.deadErrorCodes ?? {}).length ? (
              <li>
                Dead-letter codes: {Object.entries(status.deadErrorCodes)
                  .map(([code, count]) => `${code} (${count})`)
                  .join(", ")}
              </li>
            ) : null}
            <li>SMS and third-party adapters: scaffolded, disabled until a provider is selected</li>
          </ul>

          {devices.length ? (
            <div className="settings-note">
              <strong>Subscribed browsers</strong>
              <ul className="alert-notify-settings__list">
                {devices.map((device) => (
                  <li key={device.endpointHash}>
                    {device.userId} · {device.endpointHash.slice(0, 10)}…{" "}
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => revokeDevice(device.endpointHash)}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="settings-actions">
            {pushState.subscribed ? (
              <button type="button" className="btn btn--secondary btn--small" onClick={disablePush}>
                Disable urgent push on this device
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={enablePush}
                disabled={!pushState.supported || !status.webPush?.configured}
              >
                Enable urgent push on this device
              </button>
            )}
            <button type="button" className="btn btn--secondary btn--small" onClick={loadStatus}>
              Refresh status
            </button>
          </div>
          {actionMessage ? <p className="settings-note" role="status">{actionMessage}</p> : null}
          {!pushState.supported ? (
            <p className="muted">Web Push requires HTTPS (or localhost) and a supported browser.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
