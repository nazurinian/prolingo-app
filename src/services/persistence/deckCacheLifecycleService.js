import { canonicalizeTableContent, getMaxAssignedNoFromRecords, getMaxManualIdFromRecords, parseTableRecords } from '../../utils/csvUtils';
import { createEmptySourcePack, normalizeDeckEntry, normalizeSourcePack } from '../../utils/multiSourceUtils';
import { resolveDraftCacheMetadata } from '../../domain/dataset/draftCacheMetadataDomain';

export const executeDraftAutosaveEffect = ({
  isCsvDirty,
  mode,
  currentDeckName,
  tableContent,
  csvBaselineContent,
  sourcePack,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  setSavedDecks,
  setSelectedDeckId,
  setLastDraftAutoSaveAt,
  addLog
}) => {
      if (!isCsvDirty || mode !== 'table' || !currentDeckName.trim()) return undefined;
      const timer = window.setTimeout(() => {
          const records = parseTableRecords(tableContent);
          const entry = {
              content: tableContent,
              baselineContent: csvBaselineContent,
              sources: sourcePack,
              meta: resolveDraftCacheMetadata(
                  records,
                  sequenceHighWater,
                  manualIdHighWater,
                  importedRowCount,
                  getMaxAssignedNoFromRecords,
                  getMaxManualIdFromRecords
              )
          };
          setSavedDecks(prev => {
              const next = { ...prev, [currentDeckName]: entry };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Draft cache quota exceeded:', err); addLog('Warn', 'Autosave draft could not persist because browser cache is full.'); }
              return next;
          });
          setSelectedDeckId(currentDeckName);
          setLastDraftAutoSaveAt(Date.now());
      }, 700);
      return () => window.clearTimeout(timer);
};

export const executeStartupRestoreEffect = ({
  setUserApiKey,
  setSavedDecks,
  setTableContent,
  setCsvBaselineContent,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  setTextContent,
  setLockedStates,
  addLog,
  forceStopAll
}) => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setUserApiKey(savedKey);

    const saved = localStorage.getItem('pronunciation_decks');
    if (saved) {
        setSavedDecks(JSON.parse(saved));
    }

    const demoData = `No\tWord\tSentence\tMeaning\n1\tabandon\tThe captain gave the order to abandon ship.\tKapten memberi perintah untuk meninggalkan kapal\n2\tability\tHe has the ability to learn fast.\tDia memiliki kemampuan untuk belajar dengan cepat`;
    setTableContent(demoData);
    setCsvBaselineContent(canonicalizeTableContent(demoData));
    setSequenceHighWater(2);
    setManualIdHighWater(0);
    setImportedRowCount(2);
    setTextContent("Hello world.\nThis is line number two.\nEach line is treated as an item.");
    
    if (demoData.trim().length > 0) {
      setLockedStates(prev => ({ ...prev, table: true }));
    }

    addLog("System", "Ready. ProLingo v5.11.6 (UI Navigation Shell).");

    return () => forceStopAll();
};

export const executeSaveDeckCacheService = ({
  currentDeckName,
  tableContent,
  csvBaselineContent,
  sourcePack,
  sequenceHighWater,
  manualIdHighWater,
  importedRowCount,
  savedDecks,
  csvChangeSummary,
  setSavedDecks,
  setSelectedDeckId,
  addLog
}) => {
      if(!currentDeckName) return;
      const records = parseTableRecords(tableContent);
      const entry = {
          content: tableContent,
          baselineContent: csvBaselineContent,
          sources: sourcePack,
          meta: resolveDraftCacheMetadata(
              records,
              sequenceHighWater,
              manualIdHighWater,
              importedRowCount,
              getMaxAssignedNoFromRecords,
              getMaxManualIdFromRecords
          )
      };
      const newDecks = {...savedDecks, [currentDeckName]: entry};
      setSavedDecks(newDecks);
      try {
          localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
          addLog("Success", `Draft "${currentDeckName}" saved to cache. CSV status: ${csvChangeSummary.isDirty ? 'UNSAVED CHANGES' : 'SYNCED'}.`);
      } catch (err) {
          console.warn('Draft cache quota exceeded:', err);
          addLog('Warn', 'Draft remains in this session, but browser cache is full. Delete unused cached decks or export source files.');
          alert('Browser cache penuh. Draft masih aman untuk sesi ini, tetapi belum tersimpan permanen di cache.');
      }
      setSelectedDeckId(currentDeckName);
};

export const executeLoadDeckCacheService = ({
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
  setCurrentDeckName,
  setSelectedDeckId,
  setLockedStates,
  forceStopAll,
  setPlayingIndex,
  setPlayingContext,
  setMode,
  setCurrentIndex,
  setMasterIndex,
  setStudyIndex,
  addLog
}) => {
      const deckName = e.target.value;
      if (!deckName) return;
      if (savedDecks[deckName]) {
          const entry = normalizeDeckEntry(savedDecks[deckName]);
          setSequenceHighWater(entry.meta.maxAssignedNo);
          setManualIdHighWater(entry.meta.maxManualId || 0);
          setImportedRowCount(entry.meta.importedRowCount);
          setSourcePack(normalizeSourcePack(entry.sources));
          setCsvBaselineContent(entry.baselineContent || canonicalizeTableContent(entry.content));
          setTableContent(entry.content);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          setCurrentDeckName(deckName);
          setSelectedDeckId(deckName);
          setLockedStates(prev => ({ ...prev, table: true }));
          
          forceStopAll();
          setPlayingIndex(null);
          setPlayingContext(null);

          setMode('table'); 
          setCurrentIndex(null);
          setMasterIndex(null);
          setStudyIndex(null);
          addLog("Success", `Deck "${deckName}" loaded.`);
      }
};

export const executeDeleteDeckCacheService = ({
  selectedDeckId,
  savedDecks,
  setSavedDecks,
  setSelectedDeckId,
  setCurrentDeckName,
  setTableContent,
  setCsvBaselineContent,
  setSourcePack,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  resetFullState,
  setIsDeleteDialogOpen,
  addLog
}) => {
      if (!selectedDeckId) return;
      const newDecks = { ...savedDecks };
      delete newDecks[selectedDeckId];
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId("");
      setCurrentDeckName("Untitled Sheet");
      setTableContent("");
      setCsvBaselineContent("");
      setSourcePack(createEmptySourcePack());
      setSequenceHighWater(0);
      setManualIdHighWater(0);
      setImportedRowCount(0);
      resetFullState();
      setIsDeleteDialogOpen(false);
      addLog("Info", "Deck deleted & state reset.");
};

