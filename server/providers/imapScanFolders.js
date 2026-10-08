const JUNK_FOLDER_FALLBACKS = [
  "[Gmail]/Spam",
  "Spam",
  "Junk",
  "Junk Email",
  "Bulk Mail",
];

function normalizeListedMailboxes(mailboxes) {
  if (!Array.isArray(mailboxes)) return [];
  return mailboxes.map((entry) => {
    if (typeof entry === "string") {
      return { path: entry, specialUse: null };
    }
    return {
      path: entry?.path ?? "",
      specialUse: entry?.specialUse ?? null,
    };
  });
}

/**
 * Resolve IMAP folders to scan: primary inbox plus junk/spam when present.
 * Read-only polling of Sent/Drafts/All Mail is intentionally excluded.
 */
export function resolveImapScanFolders(mailboxes, options = {}) {
  const { includeInbox = true, includeJunk = true } = options;
  const listed = normalizeListedMailboxes(mailboxes);
  const paths = new Set();
  const listedPaths = new Set(listed.map((box) => box.path).filter(Boolean));

  for (const box of listed) {
    const path = box.path;
    if (!path) continue;

    if (includeInbox && path.toUpperCase() === "INBOX") {
      paths.add("INBOX");
    }

    if (includeJunk && box.specialUse === "\\Junk") {
      paths.add(path);
    }
  }

  if (includeJunk && !Array.from(paths).some((path) => path !== "INBOX")) {
    for (const fallback of JUNK_FOLDER_FALLBACKS) {
      if (listedPaths.has(fallback)) {
        paths.add(fallback);
        break;
      }
    }
  }

  if (includeInbox) {
    paths.add("INBOX");
  }

  return Array.from(paths);
}

export function formatScanFolderLabel(folderPath) {
  if (!folderPath) return "Inbox";
  if (folderPath.toUpperCase() === "INBOX") return "Inbox";
  if (folderPath.includes("Spam") || /junk/i.test(folderPath)) return "Spam";
  return folderPath;
}
