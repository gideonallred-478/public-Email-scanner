function safeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildAlertsExportPayload(alerts) {
  return (Array.isArray(alerts) ? alerts : []).map((alert) => ({
    id: alert.id,
    timestamp: alert.timestamp,
    expiresAt: alert.expiresAt,
    keptForReference: Boolean(alert.keptForReference),
    score: alert.score,
    riskLevel: alert.riskLevel,
    status: alert.status,
    alertType: alert.alertType,
    sender: alert.sender,
    subject: alert.subject,
    mainReasons: alert.mainReasons ?? [],
    actionSummary: alert.actionSummary,
    emailDedupeKey: alert.emailDedupeKey,
  }));
}

export function alertsToJson(alerts, pretty = true) {
  return JSON.stringify(buildAlertsExportPayload(alerts), null, pretty ? 2 : 0);
}

export function alertsToCsv(alerts) {
  const rows = buildAlertsExportPayload(alerts);
  const headers = [
    "id",
    "timestamp",
    "expiresAt",
    "keptForReference",
    "score",
    "riskLevel",
    "status",
    "alertType",
    "sender",
    "subject",
    "mainReasons",
    "actionSummary",
    "emailDedupeKey",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const value = row[key];
          if (Array.isArray(value)) {
            return safeCsvCell(value.join("; "));
          }
          return safeCsvCell(value);
        })
        .join(",")
    ),
  ];

  return lines.join("\n");
}

export function downloadTextFile(filename, content, mimeType = "text/plain") {
  if (typeof document === "undefined") return false;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export function exportAlertsDownload(alerts, format = "json") {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return downloadTextFile(
      `phishing-detector-alerts-${stamp}.csv`,
      alertsToCsv(alerts),
      "text/csv"
    );
  }

  return downloadTextFile(
    `phishing-detector-alerts-${stamp}.json`,
    alertsToJson(alerts),
    "application/json"
  );
}
