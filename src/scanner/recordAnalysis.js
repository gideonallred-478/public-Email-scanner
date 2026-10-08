import { parseEmail } from "../parser/emailParser.js";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getActionPlan } from "../scanner/actionEngine.js";
import { getDemoScenarioById } from "../samples/demoScenarios.js";
import { scenarioToScanInput } from "../samples/demoScenarios.js";
import {
  createIncomingEmailMessage,
  incomingEmailToScanInput,
} from "../mail/incomingEmail.js";
import {
  DEFAULT_MAILBOX_ADDRESS,
} from "../mail/mailboxConfig.js";

export function buildScanSnapshot(parsed, scoreResult, actionPlan, meta = {}) {
  return {
    parsed,
    scoreResult,
    actionPlan,
    trustDecay: scoreResult?.trustDecay ?? null,
    lookalikeResult: scoreResult?.lookalikeResult ?? null,
    scannedAt: new Date().toISOString(),
    scenarioId: meta.scenarioId ?? null,
  };
}

function legacyEmailFromRecord(record) {
  if (record?.email) return record.email;
  if (!record?.scanInput && !record?.scenarioId) return null;

  const input =
    record.scanInput ??
    (record.scenarioId
      ? scenarioToScanInput(getDemoScenarioById(record.scenarioId))
      : null);

  if (!input) return null;

  return createIncomingEmailMessage(input, {
    scenarioId: record.scenarioId,
    receivedAt: record.timestamp,
  });
}

/**
 * Use stored snapshot when present; otherwise rebuild from scan input (legacy records).
 */
export function getRecordScanSnapshot(record, { siteLists, scoringSettings } = {}) {
  if (!record) return null;

  if (record.scanSnapshot?.parsed && record.scanSnapshot?.scoreResult) {
    return record.scanSnapshot;
  }

  const input =
    record.scanInput ??
    (record.scenarioId
      ? scenarioToScanInput(getDemoScenarioById(record.scenarioId))
      : null);

  if (!input) return null;

  try {
    const parsed = parseEmail(input);
    const scoreResult = scoreEmail(parsed, siteLists, scoringSettings);
    const actionPlan = getActionPlan(scoreResult, parsed);
    return buildScanSnapshot(parsed, scoreResult, actionPlan, {
      scenarioId: record.scenarioId,
    });
  } catch {
    return null;
  }
}

export function getRecordEmailMessage(record) {
  return legacyEmailFromRecord(record);
}

export { DEFAULT_MAILBOX_ADDRESS };
