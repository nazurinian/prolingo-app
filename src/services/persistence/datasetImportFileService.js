import { V510_SOURCE_KEYS, V510_SOURCE_LABELS } from '../../constants/datasetConstants';
import { parseTableRecords, validateTableRecords } from '../../utils/csvUtils';
import { createEmptySourcePack, detectV510SourceKey, getDuplicateSourceIds, getSourceDiagnostics, normalizeDeckEntry, parseLayerSourceRecords, readV510FileText } from '../../utils/multiSourceUtils';
import { resolveCsvImportState } from '../../domain/dataset/csvImportStateDomain';
import { resolveFullPackImportState, resolveSingleSourceImportState } from '../../domain/dataset/sourceImportStateDomain';

export const executeCsvImportFileService = ({
  e,
  savedDecks,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  setSourcePack,
  setCsvBaselineContent,
  setTableContent,
  setUndoStack,
  setMasterSearch,
  setMasterFilter,
  setExpandedAdvancedId,
  handleModeSwitch,
  setCurrentDeckName,
  setLockedStates,
  setSavedDecks,
  setSelectedDeckId,
  resetFullState,
  addLog
}) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const fileName = file.name.replace(/\.(csv|tsv|txt)$/i, '');
      const importedRecords = parseTableRecords(content);
      const previousEntry = savedDecks[fileName] ? normalizeDeckEntry(savedDecks[fileName]) : null;
      let localExportMeta = null;
      try {
          localExportMeta = JSON.parse(localStorage.getItem(`prolingo_csv_meta:${fileName}`) || 'null');
      } catch (err) {
          console.warn('Invalid ProLingo CSV meta cache:', err);
      }
      const { initialMaxNo, initialManualMax, restoredImportedCount, importedBaseline } = resolveCsvImportState({
          content,
          importedRecords,
          previousEntry,
          localExportMeta
      });
      setSequenceHighWater(initialMaxNo);
      setManualIdHighWater(initialManualMax);
      setImportedRowCount(restoredImportedCount);
      setSourcePack(createEmptySourcePack());
      setCsvBaselineContent(importedBaseline);
      setTableContent(content);
      setUndoStack([]);
      setMasterSearch('');
      setMasterFilter('all');
      setExpandedAdvancedId(null);
      handleModeSwitch('table');
      setCurrentDeckName(fileName);
      setLockedStates(prev => ({ ...prev, table: true }));
      const newDecks = {
          ...savedDecks,
          [fileName]: { content, baselineContent: importedBaseline, sources: createEmptySourcePack(), meta: { maxAssignedNo: initialMaxNo, maxManualId: initialManualMax, importedRowCount: restoredImportedCount } }
      };
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId(fileName);
      resetFullState(); 
      addLog("Info", `CSV Imported: ${fileName}.`);
    };
    reader.readAsText(file);
    e.target.value = '';
};

export const executeFullPackImportService = async ({
  e,
  isCsvDirty,
  setSourcePack,
  setTableContent,
  setCsvBaselineContent,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  setUndoStack,
  setMasterSearch,
  setMasterFilter,
  setExpandedAdvancedId,
  setCurrentDeckName,
  setSelectedDeckId,
  setLockedStates,
  handleModeSwitch,
  setSavedDecks,
  addLog
}) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      e.target.value = '';
      if (isCsvDirty) {
          alert('Load Full Pack dibatalkan karena masih ada perubahan yang belum disimpan/revert.');
          return;
      }

      try {
          const staged = {};
          const unknown = [];
          const duplicateSourceFiles = [];
          for (const file of files) {
              const content = await readV510FileText(file);
              const key = detectV510SourceKey(file.name, content);
              if (!key) { unknown.push(file.name); continue; }
              if (staged[key]) { duplicateSourceFiles.push(`${V510_SOURCE_LABELS[key]}: ${staged[key].filename} + ${file.name}`); continue; }
              const parsed = key === 'main' ? parseTableRecords(content) : parseLayerSourceRecords(content, key);
              if (!parsed.length) throw new Error(`${V510_SOURCE_LABELS[key]} (${file.name}) tidak memiliki record yang bisa dibaca.`);
              const duplicateIds = getDuplicateSourceIds(parsed);
              if (duplicateIds.length) throw new Error(`${V510_SOURCE_LABELS[key]} memiliki duplicate VOCAB_ID: ${duplicateIds.slice(0,10).join(', ')}`);
              if (key === 'main') {
                  const validation = validateTableRecords(parsed);
                  if (!validation.isValid) throw new Error(`MAIN tidak valid: ${validation.errors.slice(0,10).join(' | ')}`);
              }
              staged[key] = { filename: file.name, baselineContent: content, loadedAt: Date.now() };
          }
          if (duplicateSourceFiles.length) throw new Error(`Ada lebih dari satu file untuk source yang sama:\n${duplicateSourceFiles.join('\n')}`);
          if (!staged.main) throw new Error('MAIN tidak ditemukan. Sertakan file MAIN/CORE yang berisi VOCAB_ID, NO, WORDS dan MEANING.');

          const fullPackState = resolveFullPackImportState(staged);
          const { nextPack, mergedRecords } = fullPackState;
          if (!mergedRecords.length) throw new Error('Full Pack gagal menghasilkan merged dataset.');
          const { mergedContent, maxNo, manualMax, deckName, meta } = fullPackState;

          setSourcePack(nextPack);
          setTableContent(mergedContent);
          setCsvBaselineContent(mergedContent);
          setSequenceHighWater(maxNo);
          setManualIdHighWater(manualMax);
          setImportedRowCount(mergedRecords.length);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          setCurrentDeckName(deckName);
          setSelectedDeckId(deckName);
          setLockedStates(prev => ({ ...prev, table: true }));
          handleModeSwitch('table');

          setSavedDecks(prev => {
              const next = { ...prev, [deckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Full Pack cache quota exceeded:', err); addLog('Warn', 'Full Pack loaded, tetapi cache browser penuh.'); }
              return next;
          });

          const diagnostics = getSourceDiagnostics(nextPack);
          const loaded = V510_SOURCE_KEYS.filter(key => diagnostics[key].loaded);
          const missing = V510_SOURCE_KEYS.filter(key => !diagnostics[key].loaded);
          const issues = loaded.reduce((sum, key) => sum + diagnostics[key].orphan + diagnostics[key].duplicates.length, 0);
          const report = [
              `FULL PACK LOADED • ${mergedRecords.length} vocabulary`,
              ...loaded.map(key => `${V510_SOURCE_LABELS[key]}: ${diagnostics[key].rows} rows${key === 'main' ? '' : ` • ${diagnostics[key].matched} matched • ${diagnostics[key].missing} missing • ${diagnostics[key].orphan} orphan`}`),
              missing.length ? `Not found: ${missing.map(key => V510_SOURCE_LABELS[key]).join(', ')}` : 'All 7 sources found.',
              unknown.length ? `Skipped unknown: ${unknown.join(', ')}` : '',
              `Issues: ${issues}`
          ].filter(Boolean).join('\n');
          addLog('Source', report.replace(/\n/g, ' | '));
          alert(report);
      } catch (err) {
          console.error(err);
          addLog('Error', `Full Pack: ${err.message || err}`);
          alert(`Load Full Pack gagal:\n${err.message || err}`);
      }
};

export const executeSourceLayerImportService = ({
  e,
  sourceUploadKeyRef,
  sourceUploadKey,
  sourcePack,
  currentDeckName,
  setSourcePack,
  setTableContent,
  setCsvBaselineContent,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  setUndoStack,
  setMasterSearch,
  setMasterFilter,
  setExpandedAdvancedId,
  setCurrentDeckName,
  setLockedStates,
  handleModeSwitch,
  setSavedDecks,
  setSelectedDeckId,
  addLog
}) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const key = sourceUploadKeyRef.current || sourceUploadKey;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const content = String(evt.target?.result || '');
          const parsed = key === 'main' ? parseTableRecords(content) : parseLayerSourceRecords(content, key);
          if (!parsed.length) {
              alert(`${V510_SOURCE_LABELS[key]} tidak berisi record yang bisa dibaca.`);
              return;
          }
          const duplicates = getDuplicateSourceIds(parsed);
          if (duplicates.length) {
              alert(`${V510_SOURCE_LABELS[key]} memiliki duplicate VOCAB_ID:\n${duplicates.slice(0,10).join('\n')}`);
              return;
          }
          if (key === 'main') {
              const validation = validateTableRecords(parsed);
              if (!validation.isValid) {
                  alert(`MAIN tidak valid:\n${validation.errors.slice(0,10).join('\n')}`);
                  return;
              }
          }
          const loadedAt = Date.now();
          const sourceImportState = resolveSingleSourceImportState({ sourcePack, key, fileName: file.name, content, loadedAt, currentDeckName });
          const { nextPack, mergedRecords } = sourceImportState;
          if (!mergedRecords.length) {
              alert('MAIN belum tersedia atau gagal dibaca.');
              return;
          }
          const { mergedContent, maxNo, manualMax, deckName, meta } = sourceImportState;
          setSourcePack(nextPack);
          setTableContent(mergedContent);
          setCsvBaselineContent(mergedContent);
          setSequenceHighWater(prev => key === 'main' ? maxNo : Math.max(prev, maxNo));
          setManualIdHighWater(prev => key === 'main' ? manualMax : Math.max(prev, manualMax));
          setImportedRowCount(mergedRecords.length);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          if (key === 'main') {
              setCurrentDeckName(deckName);
              setLockedStates(prev => ({ ...prev, table: true }));
              handleModeSwitch('table');
          }
          setSavedDecks(prev => {
              const next = { ...prev, [deckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Source pack cache quota exceeded:', err); addLog('Warn', 'Source pack loaded, but browser cache quota was exceeded. Use Save Draft after reducing cached decks.'); }
              return next;
          });
          setSelectedDeckId(deckName);
          addLog('Source', `${V510_SOURCE_LABELS[key]} loaded: ${parsed.length} rows. Joined by VOCAB_ID.`);
      };
      reader.readAsText(file);
      e.target.value = '';
};

