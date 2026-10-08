import { apiFetch } from "../api/apiClient.js";

const STATUS_API = "/api/notifications/status";
const SUBSCRIPTIONS_API = "/api/notifications/web-push/subscriptions";
const SERVICE_WORKER_PATH = "/push-service-worker.js";

export function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function fetchAlertNotifyStatus() {
  try {
    const result = await apiFetch(STATUS_API);
    if (!result.ok || !result.payload) {
      return {
        ok: false,
        message: result.payload?.message ?? `Notification status unavailable (${result.status}).`,
      };
    }
    return result.payload;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Notification service unreachable.",
    };
  }
}

async function getPushRegistration() {
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/" });
}

export async function subscribeToUrgentPush(publicKey) {
  if (!isWebPushSupported()) {
    return { ok: false, message: "Web Push requires a secure browser context." };
  }
  if (!publicKey) {
    return { ok: false, message: "Web Push VAPID is not configured on the server." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Browser notification permission was not granted." };
  }

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const result = await apiFetch(SUBSCRIPTIONS_API, {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
  return result.ok
    ? { ok: true, subscribed: true }
    : {
        ok: false,
        message: result.payload?.message ?? "Could not save the Web Push subscription.",
      };
}

export async function unsubscribeFromUrgentPush() {
  if (!isWebPushSupported()) {
    return { ok: false, message: "Web Push is not supported in this browser." };
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { ok: true, subscribed: false };

  const endpoint = subscription.endpoint;
  const result = await apiFetch(SUBSCRIPTIONS_API, {
    method: "DELETE",
    body: { endpoint },
  });
  if (!result.ok) {
    return {
      ok: false,
      message: result.payload?.message ?? "Could not remove the Web Push subscription.",
    };
  }
  await subscription.unsubscribe();
  return { ok: true, subscribed: false };
}

export async function revokeUrgentPushDevice(endpointHash) {
  const result = await apiFetch(SUBSCRIPTIONS_API, {
    method: "DELETE",
    body: { endpointHash },
  });
  return result.ok
    ? { ok: true, removed: result.payload?.removed ?? 0 }
    : {
        ok: false,
        message: result.payload?.message ?? "Could not revoke the Web Push device.",
      };
}

export async function getUrgentPushSubscriptionState() {
  if (!isWebPushSupported()) return { supported: false, subscribed: false };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return { supported: true, subscribed: Boolean(subscription) };
}
