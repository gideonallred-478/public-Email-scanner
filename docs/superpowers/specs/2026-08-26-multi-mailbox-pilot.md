# Multi-Mailbox Pilot Spec

## Goal

Extend the server-owned scanner from one configured mailbox to a small pilot registry of independently scanned mailboxes without weakening existing authentication, provenance, retention, notification, or full-email investigation behavior.

## Pilot scope

- Support 1–10 configured mailboxes.
- Keep the existing single-mailbox environment variables working when no multi-mailbox registry is configured.
- Configure multi-mailbox mode with server-only `MAILBOXES_JSON`; credentials never enter browser code or source control.
- Give each mailbox a stable opaque `id`, optional display `label`, provider, mailbox address, and provider-specific connection configuration.
- Require unique mailbox IDs and unique mailbox addresses.
- Each mailbox scans independently on server startup and every 30 seconds.
- A slow or failed mailbox must not stop other mailbox workers.
- Each mailbox owns its own poll cursor.
- Persist `mailboxId` and mailbox address on normalized live email/dashboard records.
- Dedupe live mail within mailbox scope so the same Internet Message-ID delivered to two pilot students creates two records, while repeated polling of one student's copy does not.
- Keep the complete original email context in the stored record for investigation.
- Keep notification routing server-owned and unchanged.
- Expose aggregate mailbox status and per-mailbox redacted status to authenticated staff; never expose credentials.
- Keep `/api/mail/poll` as a diagnostic route and allow selecting a configured mailbox by opaque mailbox ID.
- Preserve single-mailbox behavior for existing local/demo tests and setup.

## Configuration shape

`MAILBOXES_JSON` is a JSON array. Each entry follows the existing provider config shape and adds a stable `id` and optional `label`.

Example shape (values are illustrative only):

```json
[
  {
    "id": "pilot-01",
    "label": "Pilot Student 01",
    "provider": "imap",
    "mailbox": "pilot01@example.invalid",
    "imap": {
      "host": "imap.example.invalid",
      "port": 993,
      "user": "pilot01@example.invalid",
      "password": "server-only-secret",
      "tls": true
    }
  }
]
```

## Non-goals

- No self-service student mailbox enrollment.
- No arbitrary number of institutional mailboxes.
- No hosted/cloud deployment in this change.
- No changes to who can view full original email content in this change.
- No new notification channels.
