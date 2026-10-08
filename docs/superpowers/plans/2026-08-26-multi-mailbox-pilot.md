# Multi-Mailbox Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the server-owned email scanner from one live mailbox to a bounded 1–10 mailbox pilot with isolated workers, mailbox-scoped dedupe, and staff-visible mailbox status.

**Architecture:** Keep the current single-mailbox configuration as a compatibility fallback. Add a validated server-only mailbox registry from `MAILBOXES_JSON`; start one independent scan loop per configured mailbox so every mailbox has its own cursor and failure boundary. Carry stable `mailboxId` identity through normalized live email and dashboard records, and make dedupe keys mailbox-scoped.

**Tech Stack:** Node.js 20, React/Vite, existing IMAP/Microsoft Graph/local SMTP providers, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-26-multi-mailbox-pilot.md`

## Global Constraints

- Support at most 10 configured pilot mailboxes.
- Preserve all legacy single-mailbox environment configuration when `MAILBOXES_JSON` is absent.
- Keep credentials server-only.
- Keep complete original email content in stored live-email records.
- Keep current notification routing and provenance requirements unchanged.
- One mailbox failure must not stop other mailbox loops.
- Dedupe must distinguish the same Internet Message-ID delivered to different mailboxes.
- All new behavior requires regression tests plus `npm test` and `npm run build` verification.

---

### Task 1: Validated mailbox registry

**Files:**
- Modify: `server/config.js`
- Modify: `scripts/test/mailbox.test.mjs`

**Interfaces:**
- Produces: `getServerMailboxConfigs(): Array<MailboxConfig>`
- Preserves: `getServerMailboxConfig(): MailboxConfig` returning the first configured registry mailbox or the legacy single-mailbox config.
- Each registry mailbox includes `id`, `label`, `provider`, `mailbox`, `configured`, `lookbackHours`, and provider-specific nested config.

- [ ] **Step 1: Write failing tests**

Add tests that set `MAILBOXES_JSON` to two configured mailboxes and assert:

```js
const configs = getServerMailboxConfigs();
assert.equal(configs.length, 2);
assert.deepEqual(configs.map((entry) => entry.id), ["pilot-01", "pilot-02"]);
assert.equal(getServerMailboxConfig().id, "pilot-01");
```

Add rejection tests for duplicate IDs, duplicate mailbox addresses, malformed IDs, unsupported providers, invalid JSON, and more than 10 entries.

- [ ] **Step 2: Run the focused mailbox tests and confirm failure**

Run the repository test workflow after committing only the failing test change. Expected failure: `getServerMailboxConfigs` is missing.

- [ ] **Step 3: Implement registry parsing and validation**

In `server/config.js`, extract the existing legacy config builder into a helper. Add `getServerMailboxConfigs()` which:

```js
const raw = readSecret("MAILBOXES_JSON").trim();
if (!raw) return [buildLegacyMailboxConfig()];
```

Parse a JSON array, enforce 1–10 entries, normalize every entry into the existing provider configuration shape, require IDs matching `/^[a-z0-9][a-z0-9_-]{0,63}$/`, require unique lower-cased mailbox addresses and IDs, calculate `configured` through `isMailboxConfigured`, and reject unsupported provider names or unconfigured entries.

`getServerMailboxConfig()` returns the first registry entry to preserve legacy callers.

- [ ] **Step 4: Run mailbox tests and confirm pass**

Run the full Node test suite. Expected: all existing tests plus registry tests pass.

---

### Task 2: Mailbox identity and mailbox-scoped dedupe

**Files:**
- Modify: `src/mail/incomingEmail.js`
- Modify: `src/scanner/scanRetention.js`
- Modify: `scripts/test/mailbox.test.mjs`
- Modify: `scripts/test/scan-retention.test.mjs`

**Interfaces:**
- `createIncomingEmailMessage(input, meta)` accepts `meta.mailboxId`.
- `normalizeLiveEmailMessage(payload, config)` copies `config.mailboxId` or `config.id` into `email.mailboxId`.
- `buildEmailDedupeKey(source)` scopes stable IDs by mailbox when mailbox identity is present.

- [ ] **Step 1: Write failing identity/dedupe tests**

Assert normalization preserves `mailboxId`. Assert two messages with identical `messageId` but different mailbox IDs produce different dedupe keys, while repeated copies for the same mailbox produce the same key.

Example expectation:

```js
assert.equal(
  buildEmailDedupeKey({ mailboxId: "pilot-01", messageId: "<same@example>" }),
  "pilot-01|<same@example>"
);
```

Preserve the legacy unscoped key when no mailbox identity exists so demo/local records remain compatible.

- [ ] **Step 2: Run tests and confirm failure**

Expected: mailbox identity is absent and identical Message-IDs collide.

- [ ] **Step 3: Implement identity propagation and scoped key construction**

Add `mailboxId` to normalized incoming email. Update `buildEmailDedupeKey` so mailbox identity prefixes `messageId`, external ID, and fallback composite keys when available.

- [ ] **Step 4: Run the full test suite and confirm pass**

Expected: old single-mailbox tests remain green and new multi-mailbox dedupe tests pass.

---

### Task 3: Independent multi-mailbox scan manager

**Files:**
- Modify: `server/mailboxScanWorker.js`
- Modify: `scripts/test/mailbox-scan-worker.test.mjs`

**Interfaces:**
- Existing: `startMailboxScanLoop({ getConfig, ... })`
- Produces: `startMailboxScanManager({ getConfigs, ... })`
- Manager returns `{ runNow, whenIdle, stop, size }`.

- [ ] **Step 1: Write failing manager tests**

Create two mailbox configs and injected `runOnce` behavior. Assert:

```js
assert.equal(manager.size, 2);
```

Then prove each mailbox receives its own `since` cursor. Simulate mailbox A throwing and assert mailbox B continues to be invoked on later ticks. Also prove a slow tick for A does not suppress B's independent loop.

- [ ] **Step 2: Run tests and confirm failure**

Expected: `startMailboxScanManager` does not exist.

- [ ] **Step 3: Implement the manager as one scan loop per mailbox**

Use `startMailboxScanLoop` internally for each validated config, with `getConfig: () => config`. Do not share cursor state between loops. Aggregate `runNow`, `whenIdle`, and `stop` across child loops.

- [ ] **Step 4: Pass mailbox ID into normalized live email**

Inside `runMailboxScanWorkerOnce`, call:

```js
normalizeLiveEmailMessage(payload, {
  mailbox: payload?.mailbox ?? config.mailbox,
  mailboxId: config.id,
});
```

The resulting record naturally keeps `email.mailboxId` and mailbox-scoped dedupe.

- [ ] **Step 5: Run the full test suite and confirm pass**

Expected: worker and all prior tests pass.

---

### Task 4: Server startup, status, and diagnostic polling

**Files:**
- Modify: `server/index.js`
- Add/modify: server integration tests under `scripts/test/`

**Interfaces:**
- Server background scanning uses `getServerMailboxConfigs()` + `startMailboxScanManager()`.
- `/api/mail/status` returns an aggregate summary plus `mailboxes` array containing only `{ id, label, provider, mailbox, configured, connected, message }`.
- `/api/mail/poll?mailboxId=<id>` selects that mailbox; omitting `mailboxId` preserves first-mailbox compatibility.

- [ ] **Step 1: Write failing end-to-end multi-mailbox test**

Launch the real server process using `MAILBOXES_JSON` with two separate local SMTP inbox directories. Put one `.eml` into each inbox and assert two persisted records appear with distinct `email.mailboxId` values even when both messages deliberately share one Internet Message-ID.

- [ ] **Step 2: Confirm the integration test fails**

Expected: current startup scans only the first legacy mailbox and/or dedupes the second shared Message-ID.

- [ ] **Step 3: Replace single startup loop with multi-mailbox manager**

Build connection status as a `Map` keyed by mailbox ID. Refresh each mailbox independently with `verifyMailboxConnection`. Log per-mailbox connection failures without changing other mailboxes' state.

- [ ] **Step 4: Update authenticated status and diagnostic poll routes**

Return redacted per-mailbox status. Select diagnostics by opaque mailbox ID; unknown IDs return a clear `unknown_mailbox` response and never fall back silently.

- [ ] **Step 5: Run integration and full tests**

Expected: two synthetic inboxes are scanned without a browser and each creates a distinct record.

---

### Task 5: Pilot documentation and verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Verify: `.github/workflows/test.yml` already runs both tests and build.

**Interfaces:**
- Documents `MAILBOXES_JSON` as server-only pilot configuration and the 10-mailbox cap.
- Documents legacy fallback and host-on requirement.

- [ ] **Step 1: Add safe configuration documentation**

Include a synthetic `MAILBOXES_JSON` example using `example.invalid`; do not add usable credentials.

- [ ] **Step 2: Update operational description**

Document independent per-mailbox scanning, mailbox-scoped dedupe, and per-mailbox status. State that credentials remain server-side and that the host process must remain running.

- [ ] **Step 3: Run final verification**

Run CI on the final branch and require both `npm test` and `npm run build` to succeed.

- [ ] **Step 4: Review branch diff**

Compare against `feat/server-mailbox-scanner`; confirm only multi-mailbox work, tests, and docs are included.

- [ ] **Step 5: Open a draft stacked PR**

Base: `feat/server-mailbox-scanner`
Head: `feat/multi-mailbox-pilot`

Keep it draft and unmerged until the server-scanning PR lands.
