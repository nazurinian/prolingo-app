import { V510_SOURCE_KEYS } from '../../constants/datasetConstants';
import { getMaxAssignedNoFromRecords, getMaxManualIdFromRecords, serializeTableRecords } from '../../utils/csvUtils';
import { createEmptySourcePack, mergeSourcePackBaselines } from '../../utils/multiSourceUtils';

export const resolveFullPackImportState = (staged) => {
  const nextPack = createEmptySourcePack();
  V510_SOURCE_KEYS.forEach(key => { if (staged[key]) nextPack[key] = staged[key]; });
  const mergedRecords = mergeSourcePackBaselines(nextPack);
  if (!mergedRecords.length) return { nextPack, mergedRecords };

  const mergedContent = serializeTableRecords(mergedRecords);
  const maxNo = getMaxAssignedNoFromRecords(mergedRecords);
  const manualMax = getMaxManualIdFromRecords(mergedRecords);
  const deckName = staged.main.filename.replace(/\.(csv|tsv|txt)$/i, '').replace(/(?:[_-]?MAIN|[_-]?CORE)$/i, '') || staged.main.filename.replace(/\.(csv|tsv|txt)$/i, '');
  const meta = { maxAssignedNo: maxNo, maxManualId: manualMax, importedRowCount: mergedRecords.length };

  return { nextPack, mergedRecords, mergedContent, maxNo, manualMax, deckName, meta };
};

export const resolveSingleSourceImportState = ({ sourcePack, key, fileName, content, loadedAt, currentDeckName }) => {
  const nextPack = { ...sourcePack, [key]: { filename: fileName, baselineContent: content, loadedAt } };
  const mergedRecords = mergeSourcePackBaselines(nextPack);
  if (!mergedRecords.length) return { nextPack, mergedRecords };

  const mergedContent = serializeTableRecords(mergedRecords);
  const maxNo = getMaxAssignedNoFromRecords(mergedRecords);
  const manualMax = getMaxManualIdFromRecords(mergedRecords);
  const deckName = key === 'main' ? fileName.replace(/\.(csv|tsv|txt)$/i, '') : currentDeckName;
  const meta = { maxAssignedNo: maxNo, maxManualId: manualMax, importedRowCount: mergedRecords.length };

  return { nextPack, mergedRecords, mergedContent, maxNo, manualMax, deckName, meta };
};
