# Public Email Scanner

Security Email Scanner helps staff spot suspicious emails and review possible phishing attempts in one dashboard. It checks connected mailboxes, gives each message a risk score, and keeps the original email available for authorized staff to investigate.

When notifications are configured, messages needing review trigger an email to IT, while high-risk messages trigger urgent browser notifications. Lower-risk messages stay in the dashboard without sending an alert. Manual scans and demos stay in the dashboard too.

The scanner currently supports small pilots of up to 10 mailboxes. It checks for new mail every 30 seconds and keeps working when the dashboard is closed, as long as the computer running the scanning service stays on.

It's a tool to help people review potential threats—not a guarantee that every harmful email will be caught. Larger deployments still need production hosting, security setup, and operational support.

For local configuration, see [.env.example](.env.example). Keep real passwords and tokens out of source control, and use synthetic emails for testing.

## Community testing (safe demo)

1. Install Node.js 22.12 or newer and run `npm ci`.
2. Copy `.env.example` to `.env.local`. The example uses a **synthetic local SMTP inbox**, not a real mailbox.
3. Run `npm run dev` and follow the terminal output to sign in locally.
4. Run `npm test` for the automated checks. Use `npm run smtp:harness` separately only when intentionally testing the local SMTP harness.
5. Report bugs in GitHub Issues with reproduction steps. Do not attach real email messages, credentials, student information, or authentication logs.

**Security:** The repository is for code review and local testing. Do not expose the development server or mail bridge to the public internet. Live connections to Gmail, IMAP, or Microsoft Graph require your own credentials in an untracked `.env.local` file. Never use real student/staff mailboxes for community testing.

If you discover a security issue, contact the maintainer privately before posting exploit details or sensitive information in a public Issue.

See [SECURITY.md](SECURITY.md) for private reporting and data-handling guidance. The project is currently **unlicensed**; public visibility would not grant permission to reuse it.

## Static demo and deployment boundaries

`npm run build` produces a browser-only demo by default, even with the local SMTP provider in `.env.local`. `npm run preview` lets you inspect it locally. A synthetic Demo Reviewer can run scenarios without a backend account. This role grants no server access. An explicit `VITE_MAILBOX_LIVE=true` build requires server authentication and a separately reviewed backend deployment.

Vercel configuration builds only the static UI; it does not deploy the Node mail bridge or SMTP harness. Do not set `VITE_API_BASE`, live mailbox hints, or any credential-bearing `VITE_*` values for a community preview. Build from a clean environment and use a fresh browser profile: browser storage may retain previous scans. Demo messages are fabricated; school/service names and domain strings are test fixtures, not endorsements or destinations to visit. The scanner displays email text without rendering message HTML or making links clickable. Do not copy sample links into a browser or send sample messages to outside recipients.

The development UI and SMTP harness bind to loopback by default. Do not override this for public testing. For a private network pilot, all staff accounts currently share mailbox visibility; per-mailbox/tenant access control is not implemented. Server environment files hold plaintext provisioned passwords, sessions are in memory, and HTTPS/SSO/monitoring/backups require a separate production setup. Leave outbound notifications disabled during community testing.

## Public review scope

This repository starts with a fresh, sanitized history for code review and local synthetic testing. It contains no copied Git history, local environment files, mailbox data, credentials, logs, or runtime state. The original development repository remains private.

Automated tests and the local synthetic demo were verified before this export. Public code visibility is not a hosted application or approval for real school mailbox use. Keep live credentials private and follow SECURITY.md.
