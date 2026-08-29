import { APP_VERSION_LABEL } from '../../constants/appMetadata';
import { V510_SOURCE_LABELS } from '../../constants/datasetConstants';
import { downloadTextFile, getRecordAudioNo, sanitizeFilename } from '../../utils/audioUtils';
import { parseTableRecords, serializeTableRecords, validateTableRecords } from '../../utils/csvUtils';
import { createEmptySourcePack, mergeSourcePackBaselines, serializeSourceFromMerged } from '../../utils/multiSourceUtils';
import { resolveCsvSaveMetadata } from '../../domain/dataset/csvSaveMetadataDomain';
import { resolveExportSourceMetadata, resolveSavedSourceMetadata } from '../../domain/dataset/exportSourceMetadataDomain';

export const executeExportTableCsvService = ({
  scope = 'master',
  playlist,
  studyQueueSet,
  currentDeckName,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  addLog
}) => {
      const records = scope === 'study'
          ? playlist.filter(item => item.isStructured && studyQueueSet.has(item.id))
          : playlist.filter(item => item.isStructured);

      if (!records.length) {
          alert(scope === 'study' ? "Study Queue kosong." : "Tidak ada data untuk diekspor.");
          return;
      }

      const suffix = scope === 'study' ? 'study_queue' : 'master';
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}_${suffix}_${APP_VERSION_LABEL}.csv`;
      const exportBaseName = filename.replace(/\.csv$/i, '');
      // Keep sequence history locally without polluting the CSV schema. Re-importing this exact export
      // in the same browser restores deleted-tail/high-water information.
      localStorage.setItem(`prolingo_csv_meta:${exportBaseName}`, JSON.stringify(resolveExportSourceMetadata(
          playlist,
          sequenceHighWater,
          manualIdHighWater,
          importedRowCount
      )));
      downloadTextFile(serializeTableRecords(records), filename);
      addLog("Export", `${records.length} items exported: ${filename}`);

};

export const executeSaveUpdatedCsvService = async ({
  isMultiSourceMode,
  exportMergedDataset,
  tableContent,
  currentDeckName,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  savedDecks,
  setSavedDecks,
  setSelectedDeckId,
  setTableContent,
  setCsvBaselineContent,
  setUndoStack,
  setIsChangeReviewOpen,
  setIsRevertAllConfirmOpen,
  addLog
}) => {
      if (isMultiSourceMode) {
          exportMergedDataset();
          return;
      }
      const records = parseTableRecords(tableContent)
          .sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));
      if (!records.length) {
          alert('Tidak ada data CSV untuk disimpan.');
          return;
      }
      const validation = validateTableRecords(records);
      if (!validation.isValid) {
          alert(`CSV belum bisa disimpan karena ada masalah:

${validation.errors.slice(0, 10).join('\n')}`);
          return;
      }
      const canonicalContent = serializeTableRecords(records);
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}.csv`;
      let fileSaved = false;

      try {
          if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
              const handle = await window.showSaveFilePicker({
                  suggestedName: filename,
                  types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
              });
              const writable = await handle.createWritable();
              await writable.write(canonicalContent);
              await writable.close();
              fileSaved = true;
          } else {
              downloadTextFile(canonicalContent, filename);
              fileSaved = true;
          }
      } catch (err) {
          if (err?.name === 'AbortError') {
              addLog('Data', 'Save Updated CSV cancelled.');
              return;
          }
          console.error(err);
          alert(`Gagal menyimpan CSV: ${err.message || err}`);
          return;
      }

      if (!fileSaved) return;

      const meta = resolveCsvSaveMetadata(
          records,
          sequenceHighWater,
          manualIdHighWater,
          importedRowCount
      );
      const entry = { content: canonicalContent, baselineContent: canonicalContent, sources: createEmptySourcePack(), meta };
      const newDecks = { ...savedDecks, [currentDeckName]: entry };
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      localStorage.setItem(`prolingo_csv_meta:${currentDeckName}`, JSON.stringify(meta));
      setSelectedDeckId(currentDeckName);
      setTableContent(canonicalContent);
      setCsvBaselineContent(canonicalContent);
      setUndoStack([]);
      setIsChangeReviewOpen(false);
      setIsRevertAllConfirmOpen(false);
      addLog('Success', `Updated CSV saved: ${filename}. Change markers reset.`);
};

export const executeRemoveSourceLayerService = ({
  key,
  isCsvDirty,
  sourcePack,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  currentDeckName,
  setSourcePack,
  setTableContent,
  setCsvBaselineContent,
  setUndoStack,
  setSavedDecks,
  addLog
}) => {
      if (key === 'main') {
          alert('MAIN tidak bisa dilepas sendiri karena menjadi root dataset. Gunakan Import CSV Flat atau load MAIN baru.');
          return;
      }
      if (isCsvDirty) {
          alert('Simpan/Revert perubahan dulu sebelum melepas source.');
          return;
      }
      const nextPack = { ...sourcePack, [key]: null };
      const mergedRecords = mergeSourcePackBaselines(nextPack);
      const mergedContent = serializeTableRecords(mergedRecords);
      setSourcePack(nextPack);
      setTableContent(mergedContent);
      setCsvBaselineContent(mergedContent);
      setUndoStack([]);
      const records = parseTableRecords(mergedContent);
      const meta = resolveExportSourceMetadata(records, sequenceHighWater, manualIdHighWater, importedRowCount);
      setSavedDecks(prev => {
          const next = { ...prev, [currentDeckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
          try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); } catch (err) { console.warn('Deck cache quota:', err); }
          return next;
      });
      addLog('Source', `${V510_SOURCE_LABELS[key]} detached.`);
};

export const executeSaveUpdatedSourceService = async ({
  key,
  sourcePack,
  tableContent,
  currentDeckName,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  setSourcePack,
  setCsvBaselineContent,
  setSavedDecks,
  setSelectedDeckId,
  addLog
}) => {
      const entry = sourcePack[key];
      if (!entry?.baselineContent) return;
      const records = parseTableRecords(tableContent).sort((a,b) => (getRecordAudioNo(a)||0) - (getRecordAudioNo(b)||0));
      if (key === 'main') {
          const validation = validateTableRecords(records);
          if (!validation.isValid) {
              alert(`MAIN belum bisa disimpan:\n${validation.errors.slice(0,10).join('\n')}`);
              return;
          }
      }
      const content = serializeSourceFromMerged(records, key, sourcePack);
      const suggestedName = entry.filename || `${sanitizeFilename(currentDeckName || 'ProLingo')}_${V510_SOURCE_LABELS[key]}.csv`;
      try {
          if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
              const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }] });
              const writable = await handle.createWritable();
              await writable.write(content);
              await writable.close();
          } else {
              downloadTextFile(content, suggestedName);
          }
      } catch (err) {
          if (err?.name === 'AbortError') return;
          alert(`Gagal menyimpan ${V510_SOURCE_LABELS[key]}: ${err.message || err}`);
          return;
      }
      const nextPack = { ...sourcePack, [key]: { ...entry, baselineContent: content, filename: suggestedName, loadedAt: Date.now() } };
      const mergedBaselineRecords = mergeSourcePackBaselines(nextPack);
      const mergedBaselineContent = serializeTableRecords(mergedBaselineRecords);
      setSourcePack(nextPack);
      setCsvBaselineContent(mergedBaselineContent);
      const meta = resolveSavedSourceMetadata(records, sequenceHighWater, manualIdHighWater, importedRowCount);
      const deckEntry = { content: tableContent, baselineContent: mergedBaselineContent, sources: nextPack, meta };
      setSavedDecks(prev => {
          const next = { ...prev, [currentDeckName]: deckEntry };
          try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
          catch (err) { console.warn('Source save cache quota exceeded:', err); addLog('Warn', 'Source file saved, but the full source pack could not be cached locally.'); }
          return next;
      });
      setSelectedDeckId(currentDeckName);
      addLog('Success', `${V510_SOURCE_LABELS[key]} saved. Only this source baseline was updated.`);
};

export const executeExportMergedDatasetService = ({
  tableContent,
  currentDeckName,
  addLog
}) => {
      const records = parseTableRecords(tableContent);
      if (!records.length) return;
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}_MERGED_${APP_VERSION_LABEL}.csv`;
      downloadTextFile(serializeTableRecords(records), filename);
      addLog('Export', `Merged dataset exported: ${filename}. Source baselines unchanged.`);
};

