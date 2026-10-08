import { getDemoScenarioById, scenarioToScanInput } from "../samples/demoScenarios.js";

export function buildScanInputFromRecord(record) {
  if (!record) return null;

  if (record.scanInput) {
    return { ...record.scanInput };
  }

  if (record.scenarioId) {
    const scenario = getDemoScenarioById(record.scenarioId);
    if (scenario) return scenarioToScanInput(scenario);
  }

  return null;
}

export function incrementStudentReports(input, amount = 1) {
  const base = input ?? {};
  const current = Number(base.studentReportCount);
  const next = Number.isFinite(current) && current >= 0 ? current + amount : amount;

  return {
    ...base,
    studentReportCount: next,
  };
}
