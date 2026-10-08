import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import {
  buildDevServiceConfig,
  isMatchingScannerBridgeStatus,
  isScannerSmtpGreeting,
  shouldManageLocalSmtp,
} from "./dev-service-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localEnv = resolve(root, ".env.local");
const defaultEnv = resolve(root, ".env");

if (existsSync(localEnv)) dotenv.config({ path: localEnv });
else if (existsSync(defaultEnv)) dotenv.config({ path: defaultEnv });

const config = buildDevServiceConfig(process.env);
const viteCli = resolve(root, "node_modules", "vite", "bin", "vite.js");
let generatedDevPassword = "";
let sharedAuthUsers = process.env.SHARED_AUTH_USERS_JSON;
if (!sharedAuthUsers) {
  generatedDevPassword = randomBytes(18).toString("base64url");
  sharedAuthUsers = JSON.stringify([
    { username: "demo-admin", password: generatedDevPassword, role: "admin", displayName: "demo-admin" },
    { username: "teacher", password: generatedDevPassword, role: "teacher", displayName: "Demo Teacher" },
    { username: "it", password: generatedDevPassword, role: "it", displayName: "Demo IT" },
    { username: "student", password: generatedDevPassword, role: "student", displayName: "Demo Student" },
  ]);
}
const childEnv = {
  ...process.env,
  SHARED_AUTH_USERS_JSON: sharedAuthUsers,
  MAIL_BRIDGE_HOST: config.bridgeHost,
  MAIL_BRIDGE_PORT: String(config.bridgePort),
  VITE_API_BASE: config.frontendApiBase,
};

let shuttingDown = false;
const children = new Map();

function isPortOpen(host, port) {
  return new Promise((resolveConnection) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveConnection(open);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function fetchBridgeStatus() {
  try {
    const [account] = JSON.parse(sharedAuthUsers);
    const loginResponse = await fetch(
      `http://${config.bridgeProbeHost}:${config.bridgePort}/api/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account.username, password: account.password }),
        signal: AbortSignal.timeout(1500),
      }
    );
    if (!loginResponse.ok) return null;
    const login = await loginResponse.json();
    const response = await fetch(config.bridgeStatusUrl, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function readSmtpGreeting(host, port) {
  return new Promise((resolveConnection) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (greeting) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveConnection(greeting);
    };
    socket.setTimeout(1500);
    socket.once("data", (chunk) => finish(chunk.toString("utf8")));
    socket.once("timeout", () => finish(""));
    socket.once("error", () => finish(""));
    socket.once("end", () => finish(""));
  });
}

function spawnService(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: childEnv,
  });
  children.set(name, child);

  child.on("error", (error) => {
    if (children.get(name) === child) children.delete(name);
    if (shuttingDown) return;
    console.error(`${name} failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code) => {
    if (children.get(name) === child) children.delete(name);
    if (shuttingDown) return;
    console.error(`${name} exited unexpectedly (${code ?? "unknown"}).`);
    shutdown(code || 1);
  });

  return child;
}

function startService(name) {
  if (name === "SMTP harness") {
    return spawnService(name, process.execPath, [
      "scripts/smtp-harness.mjs",
      "--host",
      config.smtpHost,
      "--port",
      String(config.smtpPort),
      "--inbox",
      config.smtpInbox,
    ]);
  }
  if (name === "Mail bridge") {
    return spawnService(name, process.execPath, ["server/index.js"]);
  }
  if (name === "Vite UI") {
    return spawnService(name, process.execPath, [viteCli]);
  }
  throw new Error(`Unknown development service: ${name}`);
}

async function ensureSmtp() {
  if (!shouldManageLocalSmtp(process.env)) {
    console.log("SMTP harness not needed for the configured mailbox provider.");
    return;
  }
  const greeting = await readSmtpGreeting(config.smtpHost, config.smtpPort);
  if (isScannerSmtpGreeting(greeting)) {
    console.log(`SMTP already listening on ${config.smtpHost}:${config.smtpPort}`);
    return;
  }
  if (greeting) {
    throw new Error(
      `Port ${config.smtpPort} is occupied by a different service. Stop it or change SMTP_PORT before running npm run dev.`
    );
  }
  if (await isPortOpen(config.smtpHost, config.smtpPort)) {
    throw new Error(
      `Port ${config.smtpPort} is occupied by an unrecognized service. Stop it or change SMTP_PORT before running npm run dev.`
    );
  }
  startService("SMTP harness");
}

async function ensureBridge() {
  const status = await fetchBridgeStatus();
  if (isMatchingScannerBridgeStatus(status, config)) {
    console.log(
      `Mail bridge already connected (${status.mailbox}) on http://127.0.0.1:${config.bridgePort}`
    );
    return;
  }
  if (status) {
    throw new Error(
      `Port ${config.bridgePort} is occupied by a different or mismatched service. Stop it or change MAIL_BRIDGE_PORT before running npm run dev.`
    );
  }
  if (await isPortOpen(config.bridgeProbeHost, config.bridgePort)) {
    throw new Error(
      `Port ${config.bridgePort} is occupied by an unrecognized service. Stop it or change MAIL_BRIDGE_PORT before running npm run dev.`
    );
  }
  startService("Mail bridge");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill();
  children.clear();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  if (generatedDevPassword) {
    console.log(
      `Ephemeral local login: use demo-admin, teacher, it, or student with password ${generatedDevPassword}`
    );
  }
  await ensureSmtp();
  await ensureBridge();
  startService("Vite UI");
  console.log(
    `Development stack: UI http://localhost:5173 · bridge http://127.0.0.1:${config.bridgePort} · SMTP ${config.smtpHost}:${config.smtpPort}`
  );
} catch (error) {
  console.error(error?.message ?? error);
  shutdown(1);
}
