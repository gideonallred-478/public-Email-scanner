import { runScanForIncomingEmailMessage } from "../src/mail/processIncomingEmail.js";
import { createDashboardRecordFromScan } from "../src/scanner/alertEngine.js";
import { getDefaultScoringSettings } from "../src/scanner/scoringSettings.js";
import { getSiteLists } from "./siteListsService.js";
import {
  getNotificationSourceDigest,
  verifyNotificationProvenance,
} from "./notificationProvenance.js";

function withoutInvalidProvenance(record) {
  const {
    notificationSourceDigest: _sourceDigest,
    notificationVerifiedAt: _verifiedAt,
    ...safeRecord
  } = record ?? {};
  if (!safeRecord.email || typeof safeRecord.email !== "object") return safeRecord;
  const { notificationProvenance: _ignored, ...email } = safeRecord.email;
  return { ...safeRecord, email };
}

export async function canonicalizeNotificationAlert(
  record,
  { existingRecord = null } = {}
) {
  if (!record || typeof record !== "object") {
    return { record, notificationRecord: null };
  }

  const freshProof = verifyNotificationProvenance(record.email);
  const sourceDigest = getNotificationSourceDigest(record.email);
  const storedProof =
    record.email?.source === "live" &&
    /^[a-f0-9]{64}$/.test(String(existingRecord?.notificationSourceDigest ?? "")) &&
    existingRecord.notificationSourceDigest === sourceDigest;

  if (!freshProof && !storedProof) {
    if (record.email?.source === "live" || existingRecord?.notificationSourceDigest) {
      return {
        error: "The live-mailbox notification provenance does not match the stored alert.",
      };
    }
    return { record: withoutInvalidProvenance(record), notificationRecord: null };
  }

  const { lists } = await getSiteLists();
  const scan = runScanForIncomingEmailMessage(record.email, {
    siteLists: lists,
    scoringSettings: getDefaultScoringSettings(),
  });
  const generated = createDashboardRecordFromScan(
    scan.parsed,
    scan.scoreResult,
    scan.actionPlan,
    scan.scoreResult.trustDecay,
    scan.scoreResult.lookalikeResult,
    lists,
    {
      email: record.email,
      scanSnapshot: scan.scanSnapshot,
    }
  );
  if (!generated) {
    return { record: withoutInvalidProvenance(record), notificationRecord: null };
  }
  const canonicalRecord = {
    ...record,
    ...generated,
    id: record.id,
    email: record.email,
    notificationSourceDigest: sourceDigest,
    notificationVerifiedAt: new Date().toISOString(),
  };
  return { record: canonicalRecord, notificationRecord: canonicalRecord };
}
