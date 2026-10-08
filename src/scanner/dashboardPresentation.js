const QUEUES = [
  {
    id: "urgent",
    label: "Urgent 8–10",
    description: "Immediate investigation",
    tone: "urgent",
    summaryKey: "urgent",
  },
  {
    id: "dashboard",
    label: "Review 5–7",
    description: "Needs a decision",
    tone: "dashboard",
    summaryKey: "dashboard",
  },
  {
    id: "open",
    label: "Open incidents",
    description: "Active investigation queue",
    tone: "open",
    summaryKey: "open",
  },
  {
    id: "resolved",
    label: "Resolved",
    description: "Completed reviews",
    tone: "resolved",
    summaryKey: "resolved",
  },
];

const PRIMARY_FILTERS = [
  { id: "active", label: "All active" },
  { id: "urgent", label: "Urgent 8–10" },
  { id: "dashboard", label: "Review 5–7" },
  { id: "resolved", label: "Resolved" },
];

const SECONDARY_FILTERS = [
  { id: "safe", label: "Safe / cleared" },
  { id: "lookalikes", label: "Lookalikes" },
  { id: "trust", label: "Trust review" },
  { id: "dangerous", label: "Dangerous domains" },
];

export function getDashboardQueueCards(summary = {}) {
  return QUEUES.map((queue) => ({
    ...queue,
    value: Number(summary[queue.summaryKey]) || 0,
  }));
}

export function getDashboardFilters() {
  return {
    primary: PRIMARY_FILTERS.map((filter) => ({ ...filter })),
    secondary: SECONDARY_FILTERS.map((filter) => ({ ...filter })),
  };
}

export function shouldShowExpiredSafeCleanup(activeFilter) {
  return activeFilter === "safe";
}

export function createDashboardMutationLock() {
  let currentOperation = null;

  return {
    acquire(operation) {
      if (!operation || currentOperation) return false;
      currentOperation = operation;
      return true;
    },
    release(operation) {
      if (currentOperation === operation) currentOperation = null;
    },
    current() {
      return currentOperation;
    },
    isLocked() {
      return Boolean(currentOperation);
    },
  };
}

export function getClearAlertHistoryCopy({ useSharedData = false } = {}) {
  return {
    message: useSharedData
      ? "This deletes all shared alert history for every user, including resolved items and Safe records. Mailbox settings, site lists, and scoring settings are kept."
      : "This removes every alert, resolved item, and Safe record in this browser. Mailbox settings, site lists, and scoring settings are kept.",
  };
}

export function classifySharedAlertCreation(result) {
  const payload = result?.payload;
  if (payload?.duplicate) return { kind: "duplicate" };
  if (result?.ok && payload?.ok && payload.created) {
    return { kind: "created", record: payload.record, payload };
  }
  return {
    kind: "failure",
    error:
      payload?.error ??
      payload?.message ??
      "Could not persist the dashboard record.",
  };
}

export async function runDashboardMutationExclusive(
  lock,
  operation,
  action,
  { onStart, onFinish } = {}
) {
  if (!lock.acquire(operation)) return { started: false, reason: "busy" };
  onStart?.(operation);
  try {
    return { started: true, value: await action() };
  } finally {
    lock.release(operation);
    onFinish?.(lock.current());
  }
}
