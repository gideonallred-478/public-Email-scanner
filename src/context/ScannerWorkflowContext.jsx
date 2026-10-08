import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { parseEmail } from "../parser/emailParser.js";
import { getActionPlan } from "../scanner/actionEngine.js";
import { scenarioToScanInput } from "../samples/demoScenarios.js";
import { getDemoScenarioById } from "../samples/demoScenarios.js";
import { useScan } from "./ScanContext.jsx";
import { useAlerts } from "./AlertsContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import { useSiteLists } from "./SiteListsContext.jsx";
import { useScoringSettings } from "./ScoringSettingsContext.jsx";
import { incomingEmailToScanInput } from "../mail/incomingEmail.js";
import {
  runIncomingEmailScan,
} from "../mail/processIncomingEmail.js";
import { applyDashboardRecordRescan } from "../scanner/alertEngine.js";
import {
  buildScanInputFromRecord,
  incrementStudentReports,
} from "../scanner/recordRescan.js";
import {
  hasUserReportedAlert,
  markUserReportedAlert,
} from "../scanner/userReports.js";

const ScannerWorkflowContext = createContext(null);

function emptyFormState() {
  return {
    sender: "",
    subject: "",
    body: "",
    hasAttachment: false,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  };
}

export function ScannerWorkflowProvider({ children }) {
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();
  const { setLastScan, clearLastScan } = useScan();
  const {
    alerts,
    addDashboardRecordFromScan,
    updateDashboardRecord,
    runDashboardMutation,
  } = useAlerts();
  const { user } = useAuth();

  const [form, setForm] = useState(emptyFormState);
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [recordResult, setRecordResult] = useState(null);
  const [scanSource, setScanSource] = useState("custom");
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [activeScenarioTitle, setActiveScenarioTitle] = useState(null);

  const markCustomSource = useCallback(() => {
    setScanSource("custom");
    setActiveScenarioId(null);
    setActiveScenarioTitle(null);
  }, []);

  const updateField = useCallback(
    (field, value) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      markCustomSource();
    },
    [markCustomSource]
  );

  const loadScenario = useCallback(
    (scenario) => {
      if (!scenario) return;
      setForm(scenarioToScanInput(scenario));
      setScanSource("demo");
      setActiveScenarioId(scenario.id);
      setActiveScenarioTitle(scenario.title);
      setParsed(null);
      setParseError(null);
      setRecordResult(null);
      clearLastScan();
    },
    [clearLastScan]
  );

  const clearWorkflow = useCallback(() => {
    setForm(emptyFormState());
    setParsed(null);
    setParseError(null);
    setRecordResult(null);
    setScanSource("custom");
    setActiveScenarioId(null);
    setActiveScenarioTitle(null);
    clearLastScan();
  }, [clearLastScan]);

  const processEmailScan = useCallback(
    async (input, scenarioMeta, options = {}) => {
      const { skipDashboard = false, incomingEmail: providedEmail = null } =
        options;
      setParseError(null);

      if (scenarioMeta) {
        setScanSource("demo");
        setActiveScenarioId(scenarioMeta.id ?? null);
        setActiveScenarioTitle(scenarioMeta.title ?? null);
        setForm(scenarioToScanInput(scenarioMeta));
      }

      try {
        const scan = runIncomingEmailScan(
          input,
          { siteLists, scoringSettings },
          {
            scenarioId: scenarioMeta?.id ?? null,
            incomingEmail: providedEmail,
          }
        );

        const {
          parsed: result,
          scoreResult,
          actionPlan,
          incomingEmail,
          scanSnapshot,
        } = scan;

        setParsed(result);

        setLastScan({
          parsed: result,
          scoreResult,
          actionPlan,
          trustDecay: scoreResult.trustDecay,
          lookalikeResult: scoreResult.lookalikeResult,
          scannedAt: scanSnapshot.scannedAt,
          scanSource: scenarioMeta ? "demo" : scanSource,
          scenarioTitle: scenarioMeta?.title ?? activeScenarioTitle,
          scenarioId: scenarioMeta?.id ?? null,
          email: incomingEmail,
        });

        let created = { created: false, record: null, duplicate: false };
        if (!skipDashboard) {
          const persistence = await runDashboardMutation(
            `scan:${incomingEmail?.id ?? incomingEmail?.messageId ?? "manual"}`,
            () =>
              addDashboardRecordFromScan({
                parsed: result,
                scoreResult,
                actionPlan,
                trustDecay: scoreResult.trustDecay,
                lookalikeResult: scoreResult.lookalikeResult,
                siteLists,
                scenarioId: scenarioMeta?.id ?? null,
                email: incomingEmail,
                scanSnapshot,
              })
          );
          if (!persistence.started) {
            throw new Error("Dashboard update in progress. Try the scan again.");
          }
          created = persistence.value;
          if (created?.ok === false) {
            throw new Error(created.error || "Could not persist the dashboard record.");
          }
        }
        setRecordResult(created);

        return {
          ok: true,
          parsed: result,
          scoreResult,
          actionPlan,
          incomingEmail,
          recordResult: created,
        };
      } catch (err) {
        setParsed(null);
        setRecordResult(null);
        clearLastScan();
        const message =
          err instanceof Error ? err.message : "Failed to scan email.";
        setParseError(message);
        return { ok: false, error: message };
      }
    },
    [
      siteLists,
      scoringSettings,
      setLastScan,
      addDashboardRecordFromScan,
      runDashboardMutation,
      clearLastScan,
      scanSource,
      activeScenarioTitle,
    ]
  );

  const processIncomingEmailMessage = useCallback(
    async (emailMessage, options = {}) => {
      if (!emailMessage) {
        return { ok: false, error: "No email message provided." };
      }

      const input = incomingEmailToScanInput(emailMessage);
      if (!input) {
        return { ok: false, error: "Incoming email message is missing scan fields." };
      }

      return processEmailScan(input, null, {
        ...options,
        incomingEmail: emailMessage,
      });
    },
    [processEmailScan]
  );

  const reportSuspiciousRecord = useCallback(
    async (alertId) => {
      const record = alerts.find((entry) => entry.id === alertId);
      if (!record) {
        return { ok: false, error: "Alert not found." };
      }

      if (hasUserReportedAlert(alertId)) {
        return { ok: false, error: "You already reported this message.", alreadyReported: true };
      }

      const baseInput = buildScanInputFromRecord(record);
      if (!baseInput) {
        return { ok: false, error: "Cannot report this message — scan data is missing." };
      }

      const input = incrementStudentReports(baseInput, 1);

      try {
        const emailMessage = record.email
          ? {
              ...record.email,
              studentReportCount: input.studentReportCount,
            }
          : null;

        const scan = runIncomingEmailScan(
          input,
          { siteLists, scoringSettings },
          {
            scenarioId: record.scenarioId ?? null,
            incomingEmail: emailMessage,
          }
        );

        const updatedRecord = applyDashboardRecordRescan(record, {
          parsed: scan.parsed,
          scoreResult: scan.scoreResult,
          actionPlan: scan.actionPlan,
          trustDecay: scan.scoreResult.trustDecay,
          lookalikeResult: scan.scoreResult.lookalikeResult,
          scanSnapshot: scan.scanSnapshot,
          siteLists,
          email: scan.incomingEmail,
          scenarioId: record.scenarioId ?? null,
          reporterName: user?.displayName ?? user?.username ?? "User",
        });

        if (!updatedRecord) {
          return { ok: false, error: "Failed to update alert after report." };
        }

        const result = await updateDashboardRecord(alertId, updatedRecord);
        if (!result.ok) {
          return result;
        }

        markUserReportedAlert(alertId);
        return { ok: true, record: updatedRecord };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Report failed.",
        };
      }
    },
    [alerts, siteLists, scoringSettings, updateDashboardRecord, user]
  );

  const runScan = useCallback(
    (inputOverride, scenarioMeta, options) => {
      const input =
        inputOverride ??
        {
          sender: form.sender,
          subject: form.subject,
          body: form.body,
          hasAttachment: form.hasAttachment,
          spreadCount:
            form.spreadCount === "" ? 1 : Number(form.spreadCount),
          studentReportCount:
            form.studentReportCount === "" ? 0 : Number(form.studentReportCount),
          verifiedSchoolAccount: form.verifiedSchoolAccount,
        };

      return processEmailScan(input, scenarioMeta, options);
    },
    [form, processEmailScan]
  );

  const loadAnalysisFromRecord = useCallback(
    (record) => {
      if (!record) return { ok: false, error: "No record provided." };

      const scenario = record.scenarioId
        ? getDemoScenarioById(record.scenarioId)
        : null;
      const input = record.scanInput ?? (scenario ? scenarioToScanInput(scenario) : null);

      if (!input) {
        return { ok: false, error: "Cannot reopen analysis for this record." };
      }

      return processEmailScan(input, scenario, { skipDashboard: true });
    },
    [processEmailScan]
  );

  const value = useMemo(
    () => ({
      form,
      parsed,
      parseError,
      alertResult: recordResult,
      recordResult,
      scanSource,
      activeScenarioId,
      activeScenarioTitle,
      updateField,
      loadScenario,
      clearWorkflow,
      runScan,
      processEmailScan,
      processIncomingEmailMessage,
      loadAnalysisFromRecord,
      reportSuspiciousRecord,
      markCustomSource,
    }),
    [
      form,
      parsed,
      parseError,
      recordResult,
      scanSource,
      activeScenarioId,
      activeScenarioTitle,
      updateField,
      loadScenario,
      clearWorkflow,
      runScan,
      processEmailScan,
      processIncomingEmailMessage,
      loadAnalysisFromRecord,
      reportSuspiciousRecord,
      markCustomSource,
    ]
  );

  return (
    <ScannerWorkflowContext.Provider value={value}>
      {children}
    </ScannerWorkflowContext.Provider>
  );
}

export function useScannerWorkflow() {
  const ctx = useContext(ScannerWorkflowContext);
  if (!ctx) {
    throw new Error(
      "useScannerWorkflow must be used within ScannerWorkflowProvider"
    );
  }
  return ctx;
}
