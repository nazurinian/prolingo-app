import { getMaxAssignedNoFromRecords, getMaxManualIdFromRecords } from '../../utils/csvUtils';

export const resolveExportSourceMetadata = (
  records,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount
) => ({
  maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
  maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
  importedRowCount
});

export const resolveSavedSourceMetadata = (
  records,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount
) => ({
  maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
  maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
  importedRowCount: importedRowCount || records.length
});
