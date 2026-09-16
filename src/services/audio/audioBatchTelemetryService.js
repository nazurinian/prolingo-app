const EMPTY_TELEMETRY = Object.freeze({
  sessionId: null,
  status: 'idle',
  mode: 'table',
  total: 0,
  processed: 0,
  generated: 0,
  skippedReady: 0,
  failed: 0,
  remaining: 0,
  readyEstimate: 0,
  missingEstimate: 0,
  currentDisplayId: null,
  currentLabel: null,
  updatedAt: 0,
  reconciled: false
});

let snapshot = EMPTY_TELEMETRY;
const listeners = new Set();

export const getTableBatchTelemetrySnapshot = () => snapshot;

export const subscribeTableBatchTelemetry = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishTableBatchTelemetry = patch => {
  snapshot = { ...snapshot, ...(patch || {}), mode: 'table', updatedAt: Date.now() };
  listeners.forEach(listener => {
    try { listener(); } catch { /* telemetry must never break batch */ }
  });
  return snapshot;
};

export const resetTableBatchTelemetry = patch => {
  snapshot = { ...EMPTY_TELEMETRY, ...(patch || {}), mode: 'table', updatedAt: Date.now() };
  listeners.forEach(listener => {
    try { listener(); } catch { /* telemetry must never break batch */ }
  });
  return snapshot;
};
