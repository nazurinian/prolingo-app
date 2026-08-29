import { getMaxAssignedNoFromRecords, parseTableRecords, serializeTableRecords, validateTableRecords } from '../../utils/csvUtils';
import { resolveSingleChangeRevertState } from '../../domain/dataset/changeRevertDomain';
import { filterStudyQueueByValidIds, resolveSnapshotValidIds } from '../../domain/dataset/datasetSnapshotRestoreDomain';
import { resolveManualVocabularySaveState } from '../../domain/dataset/manualVocabularySaveDomain';
import { resolveStructuredDeleteRecords, resolveStructuredDeleteStudyQueue, shouldClearStructuredDeleteReference } from '../../domain/dataset/structuredDeleteDomain';

export const executeUndoLastDataChange = ({
  undoStack, forceStopAll, setTableContent, setStudyQueue, setUndoStack, addLog
}) => {
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const restoredRecords = parseTableRecords(last.content);
      const validIds = resolveSnapshotValidIds(restoredRecords);
      forceStopAll();
      setTableContent(last.content);
      setStudyQueue(prev => filterStudyQueueByValidIds(prev, validIds));
      setUndoStack(prev => prev.slice(0, -1));
      addLog('Data', `Undo: ${last.label}.`);
};

export const executeApplyChangeRevert = ({
  id, type, csvBaselineContent, tableContent, pushUndoSnapshot, forceStopAll,
  setUndoStack, setStudyQueue, setTableContent, addLog
}) => {
      const baselineRecords = parseTableRecords(csvBaselineContent);
      const currentRecords = parseTableRecords(tableContent);
      const revertState = resolveSingleChangeRevertState({ baselineRecords, currentRecords, id, type });

      pushUndoSnapshot(`revert ${type} ${id}`);
      forceStopAll();
      if (revertState.status === 'conflict') {
          alert(`Tidak bisa restore ${id}: VOCAB_ID atau audio slot sudah dipakai.`);
          setUndoStack(prev => prev.slice(0, -1));
          return;
      }
      if (revertState.shouldRemoveFromStudyQueue) {
          setStudyQueue(prev => prev.filter(queueId => queueId !== id));
      }

      setTableContent(serializeTableRecords(revertState.nextRecords));
      addLog('Data', `Reverted ${type}: ${id}.`);
};

export const executeRevertAllChanges = ({
  pushUndoSnapshot, csvBaselineContent, forceStopAll, setTableContent, setStudyQueue,
  setIsRevertAllConfirmOpen, setIsChangeReviewOpen, addLog
}) => {
      pushUndoSnapshot('revert all CSV changes');
      const baselineRecords = parseTableRecords(csvBaselineContent);
      const validIds = resolveSnapshotValidIds(baselineRecords);
      forceStopAll();
      setTableContent(csvBaselineContent);
      setStudyQueue(prev => filterStudyQueueByValidIds(prev, validIds));
      setIsRevertAllConfirmOpen(false);
      setIsChangeReviewOpen(false);
      addLog('Data', 'All unsaved CSV changes reverted to last saved snapshot.');
};

export const executeSaveManualVocabulary = ({
  manualForm, tableContent, manualEditingId, sequenceHighWater, manualIdHighWater,
  pushUndoSnapshot, setTableContent, setSequenceHighWater, setManualIdHighWater,
  setLockedStates, mode, handleModeSwitch, addLog, closeManualEditor
}) => {
      if (!manualForm.word.trim()) {
          alert("WORDS wajib diisi.");
          return;
      }

      const currentRecords = parseTableRecords(tableContent);
      const saveState = resolveManualVocabularySaveState({
          manualForm,
          manualEditingId,
          currentRecords,
          sequenceHighWater,
          manualIdHighWater
      });
      const { vocabId, normalizedNo, record } = saveState;

      if (saveState.status === 'duplicate') {
          alert(`VOCAB_ID ${vocabId} sudah ada.`);
          return;
      }

      const nextRecords = saveState.nextRecords;
      const validation = validateTableRecords(nextRecords);
      if (!validation.isValid) {
          alert(`Data belum valid:

${validation.errors.slice(0, 8).join('\n')}`);
          return;
      }

      pushUndoSnapshot(`${manualEditingId ? 'edit' : 'add'} ${vocabId}`);
      setTableContent(serializeTableRecords(nextRecords));
      if (!manualEditingId) {
          setSequenceHighWater(prev => Math.max(prev, normalizedNo));
          const manualMatch = vocabId.match(/^USR_(\d+)$/i);
          if (manualMatch) setManualIdHighWater(prev => Math.max(prev, Number.parseInt(manualMatch[1], 10) || 0));
      }
      setLockedStates(prev => ({ ...prev, table: true }));
      if (mode !== 'table') handleModeSwitch('table');
      addLog("Data", `${manualEditingId ? 'Updated' : 'Added'} ${vocabId} (${record.word}).`);
      closeManualEditor();
};

export const executeConfirmDeleteStructuredItem = ({
  pendingDeleteItem, setPendingDeleteItem, pushUndoSnapshot, forceStopAll, tableContent,
  setTableContent, setStudyQueue, currentIndex, setCurrentIndex, playingIndex,
  setPlayingIndex, expandedAdvancedId, setExpandedAdvancedId, addLog
}) => {
      const item = pendingDeleteItem;
      if (!item?.isStructured) {
          setPendingDeleteItem(null);
          return;
      }

      pushUndoSnapshot(`delete ${item.vocabId || item.id}`);
      forceStopAll();
      const records = resolveStructuredDeleteRecords(parseTableRecords(tableContent), item.id);
      setTableContent(serializeTableRecords(records));
      setStudyQueue(prev => resolveStructuredDeleteStudyQueue(prev, item.id));
      if (shouldClearStructuredDeleteReference(currentIndex, item.id)) setCurrentIndex(null);
      if (shouldClearStructuredDeleteReference(playingIndex, item.id)) setPlayingIndex(null);
      if (shouldClearStructuredDeleteReference(expandedAdvancedId, item.id)) setExpandedAdvancedId(null);

      // Keep loaded audio resident during this session so Undo/Restore can reconnect instantly.
      // With no matching row it is effectively detached; a future folder scan reports disk-only files as orphan.
      setPendingDeleteItem(null);
      addLog("Data", `Deleted ${item.vocabId || item.id} (${item.word}). CSV now has unsaved changes.`);
};

export const executeBatchRangeBlur = ({
  field, batchConfig, mode, sequenceHighWater, playlist, setBatchConfig
}) => {
      let val = parseInt(batchConfig[field]);
      const max = mode === 'table'
          ? Math.max(1, sequenceHighWater, getMaxAssignedNoFromRecords(playlist))
          : (playlist.length || 1);
      
      if (isNaN(val)) val = 1;

      if (field === 'start') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val > parseInt(batchConfig.end)) val = parseInt(batchConfig.end);
      } else if (field === 'end') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val < parseInt(batchConfig.start)) val = parseInt(batchConfig.start);
      }

      setBatchConfig(prev => ({ ...prev, [field]: val }));
};

export const executeStudyRangeAdd = ({
  rangeInput, playlist, setStudyQueue, setRangeInput, addLog
}) => {
      if (!rangeInput) return;
      const parts = rangeInput.split(/[,+\s]+/);
      const newIds = new Set();

      parts.forEach(part => {
          if (part.includes('-')) {
              const [start, end] = part.split('-').map(Number);
              if (!isNaN(start) && !isNaN(end)) {
                  const min = Math.min(start, end);
                  const max = Math.max(start, end);
                  for (let i = min; i <= max; i++) {
                      const item = playlist.find(p => p.displayId === i);
                      if (item) newIds.add(item.id);
                  }
              }
          } else {
              const num = parseInt(part);
              if (!isNaN(num)) {
                  const item = playlist.find(p => p.displayId === num);
                  if (item) newIds.add(item.id);
              }
          }
      });

      setStudyQueue(prev => {
          const combined = new Set([...prev, ...newIds]);
          return Array.from(combined);
      });
      setRangeInput("");
      addLog("Study", `Added ${newIds.size} items to Queue.`);
};

export const executeToggleCellReveal = ({
  e, cellKey, isMemoryMode, revealedCells, setRevealedCells
}) => {
      if (!isMemoryMode) return;
      e.stopPropagation(); 

      if (revealedCells[cellKey]) {
          clearTimeout(revealedCells[cellKey]);
          setRevealedCells(prev => {
              const next = { ...prev };
              delete next[cellKey];
              return next;
          });
      } else {
          const timerId = setTimeout(() => {
              setRevealedCells(prev => {
                  const next = { ...prev };
                  delete next[cellKey];
                  return next;
              });
          }, 4000); 

          setRevealedCells(prev => ({ ...prev, [cellKey]: timerId }));
      }
};
