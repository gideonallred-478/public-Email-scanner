self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  const title = String(payload.title || "Urgent security alert").slice(0, 120);
  const options = {
    body: String(
      payload.body || "A high-risk message needs immediate IT review."
    ).slice(0, 240),
    tag: String(payload.tag || "security-alert").slice(0, 160),
    renotify: true,
    requireInteraction: true,
    data: {
      alertId: String(payload.data?.alertId || "").slice(0, 160),
      url: "/alerts",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate("/alerts");
          return client.focus();
        }
      }
      return self.clients.openWindow("/alerts");
    })
  );
});
