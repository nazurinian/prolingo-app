export const resolveDraftCacheMetadata = (
  records,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  getMaxAssignedNoFromRecords,
  getMaxManualIdFromRecords
) => ({
  maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
  maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
  importedRowCount: importedRowCount || records.filter(item => !String(item.vocabId || '').startsWith('USR_')).length
});
