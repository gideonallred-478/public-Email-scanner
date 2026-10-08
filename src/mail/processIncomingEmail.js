import { parseEmail } from "../parser/emailParser.js";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getActionPlan } from "../scanner/actionEngine.js";
import {
  createIncomingEmailMessage,
  incomingEmailToScanInput,
  EMAIL_SOURCE,
} from "../mail/incomingEmail.js";
import { buildScanSnapshot } from "../scanner/recordAnalysis.js";

/**
 * Shared scan pipeline for demo and live incoming mail.
 */
export function runIncomingEmailScan(input, deps, meta = {}) {
  const { siteLists, scoringSettings } = deps;
  const parsed = parseEmail(input);
  const scoreResult = scoreEmail(parsed, siteLists, scoringSettings);
  const actionPlan = getActionPlan(scoreResult, parsed);

  const incomingEmail =
    meta.incomingEmail ??
    createIncomingEmailMessage(input, {
      scenarioId: meta.scenarioId ?? null,
      source: meta.source ?? EMAIL_SOURCE.DEMO,
      messageId: meta.messageId,
      externalId: meta.externalId,
      mailbox: meta.mailbox,
      receivedAt: meta.receivedAt,
    });

  const scanSnapshot = buildScanSnapshot(parsed, scoreResult, actionPlan, {
    scenarioId: meta.scenarioId ?? incomingEmail.scenarioId ?? null,
  });

  return {
    parsed,
    scoreResult,
    actionPlan,
    incomingEmail,
    scanSnapshot,
  };
}

/**
 * Entry point for a normalized live/demo message object.
 */
export function runScanForIncomingEmailMessage(emailMessage, deps) {
  const input = incomingEmailToScanInput(emailMessage);
  if (!input) {
    throw new Error("Incoming email message is missing scan fields.");
  }

  return runIncomingEmailScan(input, deps, {
    incomingEmail: emailMessage,
    scenarioId: emailMessage.scenarioId ?? null,
    source: emailMessage.source ?? EMAIL_SOURCE.DEMO,
  });
}
