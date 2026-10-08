import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDashboardRecordFromScan } from "../../src/scanner/alertEngine.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getActionPlan } from "../../src/scanner/actionEngine.js";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { scenarioToScanInput } from "../../src/samples/demoScenarios.js";
import { getDemoScenarioById } from "../../src/samples/demoScenarios.js";

import { loadScoringSettings } from "../../src/scanner/scoringSettings.js";

test("shared alerts persist and dedupe on the server", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-alerts-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "scan-registry.json");

  const { addSharedAlert, getSharedAlerts } = await import("../../server/alertsService.js");

  const scenario = getDemoScenarioById("scholarship-scam");
  const parsed = parseEmail(scenarioToScanInput(scenario));
  const lists = getDefaultSiteLists();
  const settings = loadScoringSettings();
  const scoreResult = scoreEmail(parsed, lists, settings);
  const actionPlan = getActionPlan(scoreResult, parsed);
  const record = createDashboardRecordFromScan(
    parsed,
    scoreResult,
    actionPlan,
    scoreResult.trustDecay,
    scoreResult.lookalikeResult,
    lists
  );

  assert.ok(record);

  const first = await addSharedAlert(record);
  assert.equal(first.ok, true);
  assert.equal(first.created, true);

  const duplicate = await addSharedAlert(record);
  assert.equal(duplicate.duplicate, true);

  const loaded = await getSharedAlerts();
  assert.equal(loaded.alerts.length, 1);
  assert.ok(Array.isArray(loaded.scanKeys));
});

test("concurrent shared alert creates do not lose records", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-alert-concurrency-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "scan-registry.json");

  const { addSharedAlert, getSharedAlerts } = await import("../../server/alertsService.js");
  const records = Array.from({ length: 20 }, (_, index) => ({
    id: `concurrent-${index}`,
    sender: `sender-${index}@example.test`,
    subject: `Concurrent message ${index}`,
    score: 5,
    status: "open",
    flags: { dashboardAlert: true },
    timestamp: new Date(Date.now() + index).toISOString(),
  }));

  const results = await Promise.all(records.map((record) => addSharedAlert(record)));
  assert.equal(results.every((result) => result.ok && result.created), true);

  const loaded = await getSharedAlerts();
  assert.equal(loaded.alerts.length, records.length);
  assert.deepEqual(
    new Set(loaded.alerts.map((record) => record.id)),
    new Set(records.map((record) => record.id))
  );
});

test("failed registry persistence rolls back alert creation and leaves the queue usable", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-alert-rollback-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  const invalidRegistryPath = join(dir, "registry-is-a-directory");
  await mkdir(invalidRegistryPath);
  process.env.SCAN_REGISTRY_DATA_PATH = invalidRegistryPath;

  const { addSharedAlert, getSharedAlerts, updateSharedAlertStatus } =
    await import("../../server/alertsService.js");
  const failedRecord = {
    id: "partial",
    emailDedupeKey: "partial-key",
    sender: "partial@example.test",
    subject: "Must roll back",
    score: 5,
    status: "open",
    flags: { dashboardAlert: true },
    timestamp: new Date().toISOString(),
  };

  await assert.rejects(addSharedAlert(failedRecord));

  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "scan-registry.json");
  const afterFailure = await getSharedAlerts();
  assert.deepEqual(afterFailure.alerts, []);
  assert.deepEqual(afterFailure.scanKeys, []);

  const recoveredRecord = {
    ...failedRecord,
    id: "after-reject",
    emailDedupeKey: "after-key",
    subject: "Queue recovered",
  };
  const recovered = await addSharedAlert(recoveredRecord);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.scanKeys, ["after-key"]);

  const statusResult = await updateSharedAlertStatus("after-reject", "resolved");
  assert.equal(statusResult.ok, true);
  assert.deepEqual(statusResult.scanKeys, ["after-key"]);
});

test("corrupt registry reads fail closed before cross-store mutations", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-registry-corrupt-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const alertsPath = join(dir, "alerts.json");
  const registryPath = join(dir, "scan-registry.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = registryPath;

  const {
    addSharedAlert,
    keepSharedAlertForReference,
    updateSharedAlertStatus,
  } = await import("../../server/alertsService.js");
  const record = {
    id: "corrupt-registry-record",
    emailDedupeKey: "corrupt-registry-key",
    sender: "corrupt@example.test",
    subject: "Registry must fail closed",
    score: 5,
    status: "open",
    flags: { dashboardAlert: true },
    timestamp: new Date().toISOString(),
    keptForReference: false,
  };

  assert.equal((await addSharedAlert(record)).ok, true);
  const validRegistry = await readFile(registryPath, "utf8");
  await writeFile(registryPath, "{not valid json", "utf8");

  await assert.rejects(keepSharedAlertForReference(record.id), SyntaxError);
  const stateAfterFailure = JSON.parse(await readFile(alertsPath, "utf8"));
  assert.equal(stateAfterFailure.alerts[0].keptForReference, false);

  await writeFile(registryPath, validRegistry, "utf8");
  const recovered = await updateSharedAlertStatus(record.id, "resolved");
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.scanKeys, ["corrupt-registry-key"]);
});
