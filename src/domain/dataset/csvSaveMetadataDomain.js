import { getMaxAssignedNoFromRecords, getMaxManualIdFromRecords } from '../../utils/csvUtils';

export const resolveCsvSaveMetadata = (
  records,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount
) => ({
  maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
  maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
  importedRowCount: importedRowCount || records.filter(item => !String(item.vocabId || '').startsWith('USR_')).length
});
