# Security policy

This project is an experimental review aid. Community testing must use synthetic messages and an isolated local inbox. It is not approved for student/staff data or unattended production use.

## Report a vulnerability privately

Use GitHub's **Security → Report a vulnerability** if private vulnerability reporting is enabled. Otherwise contact the repository owner through an existing private channel and ask for a secure reporting method. Do not open a public issue containing credentials, real messages, personal information, or exploit details. No dedicated security email address or response-time guarantee is currently configured.

Include the affected commit, reproduction steps using synthetic data, impact, and a suggested fix. Only the latest default branch is maintained; no released version has a security support commitment.

## Deployment and data handling

- Keep the development UI, mail bridge, and SMTP harness on loopback. The SMTP harness has no authentication and writes message bodies to disk.
- Hosted builds are static demo previews by default. Do not configure real mailbox hints or an API endpoint for a community demo. Explicit live mode requires server authentication, HTTPS, restricted origins, protected storage, and a separate deployment review.
- All authenticated staff share mailbox access; this is not tenant or per-mailbox isolation. Browser storage and exports can retain message content. Use a fresh browser profile and isolated server data directory for demos.
- Keep credentials in ignored server-side environment files or a secret manager. Never put secrets in `VITE_*` values: they are bundled into browser code. Protect environment files, companion JSON files, runtime state, logs, backups, and notification recipient details.
- Manual/demo inputs must not trigger outbound delivery. Leave notification delivery disabled during community testing.
- Local SMTP mail is treated as mailbox input and can create pending notification jobs even when delivery is disabled. Use an isolated data directory and discard its synthetic queue before enabling real notification transports; do not reuse a community demo database for a live pilot.

## If sensitive data entered Git history

Deleting it in a new commit does not remove older copies. Revoke or rotate exposed credentials first (OAuth refresh tokens/client secrets, app passwords, SMTP passwords, Graph secrets, session/provenance keys, VAPID private keys as applicable). Remove personal messages and identifiers from every affected ref using a separately reviewed history rewrite, or release a new sanitized repository without old history. Check forks, PR refs, artifacts, caches, deployment bundles, logs, and backups. Coordinate any rewrite with collaborators; do not force-push without explicit approval.

Never paste secret values into issues or an audit report. Record only type, path, commit, and remediation status. Automated scans cannot prove that arbitrary opaque strings are harmless.
