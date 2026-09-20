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
const listeners = new Set();

export const getTextStructuredBatchTelemetrySnapshot = () => snapshot;
export const subscribeTextStructuredBatchTelemetry = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach(listener => {
  try { listener(); } catch { /* telemetry must never break Text Batch */ }
});
export const publishTextStructuredBatchTelemetry = patch => {
  snapshot = { ...snapshot, ...(patch || {}), mode: 'text', updatedAt: Date.now() };
  emit();
  return snapshot;
};
export const resetTextStructuredBatchTelemetry = patch => {
  snapshot = { ...EMPTY, ...(patch || {}), mode: 'text', updatedAt: Date.now() };
  emit();
  return snapshot;
};
