import {
  canonicalizeTableContent,
  getMaxAssignedNoFromRecords,
  getMaxManualIdFromRecords,
} from '../../utils/csvUtils';

export const resolveCsvImportState = ({
  content,
  importedRecords,
  previousEntry,
  localExportMeta,
}) => {
  const initialMaxNo = Math.max(
    importedRecords.length,
    getMaxAssignedNoFromRecords(importedRecords),
    Number(previousEntry?.meta?.maxAssignedNo) || 0,
    Number(localExportMeta?.maxAssignedNo) || 0
  );
  const initialManualMax = Math.max(
    getMaxManualIdFromRecords(importedRecords),
    Number(previousEntry?.meta?.maxManualId) || 0,
    Number(localExportMeta?.maxManualId) || 0
  );
  const restoredImportedCount = Math.max(
    importedRecords.length,
    Number(previousEntry?.meta?.importedRowCount) || 0,
    Number(localExportMeta?.importedRowCount) || 0
  );
  const importedBaseline = canonicalizeTableContent(content);

  return {
    initialMaxNo,
    initialManualMax,
    restoredImportedCount,
    importedBaseline,
  };
};
