const tokenCache = new Map();

function tokenCacheKey(config) {
  const { tenantId, clientId } = config?.microsoftGraph ?? {};
  return `${tenantId ?? ""}|${clientId ?? ""}`;
}

async function fetchGraphToken(config) {
  const now = Date.now();
  const key = tokenCacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const { tenantId, clientId, clientSecret } = config.microsoftGraph;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft Graph auth failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  tokenCache.set(key, {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

function formatGraphAddress(from) {
  if (!from?.emailAddress) return "";
  const { name, address } = from.emailAddress;
  if (name && address) return `${name} <${address}>`;
  return address ?? name ?? "";
}

function formatGraphReplyTo(replyTo) {
  if (!Array.isArray(replyTo) || replyTo.length === 0) return "";
  return replyTo.map(formatGraphAddress).filter(Boolean).join(", ");
}

export function normalizeGraphMessage(item, mailbox) {
  return {
    id: item.id,
    internetMessageId: item.internetMessageId ?? `<graph-${item.id}>`,
    from: formatGraphAddress(item.from),
    replyTo: formatGraphReplyTo(item.replyTo),
    subject: item.subject ?? "",
    body: item.body?.content?.trim() || item.bodyPreview?.trim() || "",
    receivedDateTime: item.receivedDateTime ?? new Date().toISOString(),
    hasAttachments: Boolean(item.hasAttachments),
    mailbox,
  };
}

export async function pollGraphMailbox(config, { since } = {}) {
  const token = await fetchGraphToken(config);
  const mailbox = config.microsoftGraph.mailbox;
  const params = new URLSearchParams({
    $top: "25",
    $orderby: "receivedDateTime asc",
    $select:
      "id,internetMessageId,from,replyTo,subject,receivedDateTime,hasAttachments,bodyPreview,body",
  });

  if (since) {
    params.set("$filter", `receivedDateTime ge ${since}`);
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft Graph poll failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload.value) ? payload.value : [];

  return items.map((item) => normalizeGraphMessage(item, mailbox));
}

export async function verifyGraphConnection(config) {
  try {
    const token = await fetchGraphToken(config);
    const mailbox = config.microsoftGraph.mailbox;
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}?$select=mail,userPrincipalName`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Microsoft Graph mailbox check failed (${response.status}): ${detail}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Microsoft Graph connection failed.",
    };
  }
}
