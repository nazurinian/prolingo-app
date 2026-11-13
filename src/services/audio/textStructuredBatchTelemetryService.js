const EMPTY = Object.freeze({
  sessionId: null,
  status: 'idle',
  mode: 'text',
  total: 0,
  processed: 0,
  generated: 0,
  generatedPhysical: 0,
  reusedPhysical: 0,
  skippedReady: 0,
  skippedStale: 0,
  failed: 0,
  remaining: 0,
  readyEstimate: 0,
  missingEstimate: 0,
  staleEstimate: 0,
  logicalRequirements: 0,
  uniquePhysicalRequirements: 0,
  selectedLogicalRequirements: 0,
  selectedUniquePhysicalRequirements: 0,
  selectionMode: null,
  currentSegmentId: null,
  currentBlockId: null,
  currentChannel: null,
  currentVoiceId: null,
  currentRepresentation: null,
  updatedAt: 0,
  reconciled: false
});

let snapshot = EMPTY;
let lastEmittedAt = 0;
const listeners = new Set();

export const getTextStructuredBatchTelemetrySnapshot = () => snapshot;
export const subscribeTextStructuredBatchTelemetry = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => {
  lastEmittedAt = Date.now();
  listeners.forEach(listener => {
    try { listener(); } catch { /* telemetry must never break Text Batch */ }
  });
};
export const publishTextStructuredBatchTelemetry = patch => {
  snapshot = { ...snapshot, ...(patch || {}), mode: 'text', updatedAt: Date.now() };
  emit();
  return snapshot;
};
export const publishTextStructuredBatchTelemetryThrottled = (
  patch,
  { minIntervalMs = 80, force = false } = {}
) => {
  const prevFailed = Number(snapshot?.failed || 0);
  const nextFailed = patch && patch.failed != null ? Number(patch.failed) : prevFailed;
  const nextStatus = patch?.status ?? snapshot?.status;
  const isTerminalOrErrorChange = nextFailed > prevFailed
    || (nextStatus && nextStatus !== snapshot?.status && ['cancelled', 'completed', 'completed-with-errors'].includes(nextStatus));
  const now = Date.now();
  snapshot = { ...snapshot, ...(patch || {}), mode: 'text', updatedAt: now };
  if (force || isTerminalOrErrorChange || lastEmittedAt === 0 || (now - lastEmittedAt) >= minIntervalMs) {
    emit();
  }
  return snapshot;
};
export const resetTextStructuredBatchTelemetry = patch => {
  lastEmittedAt = 0;
  snapshot = { ...EMPTY, ...(patch || {}), mode: 'text', updatedAt: Date.now() };
  emit();
  return snapshot;
};
