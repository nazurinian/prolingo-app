import { APP_READY_LOG } from '../../constants/appMetadata';
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
  setSavedDecks,
  setTableContent,
  setCsvBaselineContent,
  setSequenceHighWater,
  setManualIdHighWater,
  setImportedRowCount,
  setLockedStates,
  addLog,
  forceStopAll
}) => {
    // E security migration: remove legacy plaintext client credentials.
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('prolingo_gemini_byok_key_v1');

    const saved = localStorage.getItem('pronunciation_decks');
    if (saved) {
        setSavedDecks(JSON.parse(saved));
    }

    const demoData = `VOCAB_ID,NO,WORDS,PART OF SPEECH,MEANING,INFO,EN,IDN,EXP1_EN,EXP1_IDN,EXP2_EN,EXP2_IDN,EXP3_EN,EXP3_IDN,EXP4_EN,EXP4_IDN,EXP5_EN,EXP5_IDN
MASTER_0001,1,abandon,verb,meninggalkan,,The captain gave the order to abandon the sinking ship immediately.,Kapten memberi perintah untuk meninggalkan kapal yang tenggelam itu segera.,Please don't abandon me here.,Tolong jangan tinggalkan aku di sini.,We had to abandon the old project due to lack of funding.,Kami terpaksa membatalkan proyek lama itu karena kurangnya dana.,The town was completely abandoned decades ago.,Kota itu benar-benar ditinggalkan puluhan tahun yang lalu.,He abandoned his broken car by the side of the highway.,Dia meninggalkan mobilnya yang mogok di pinggir jalan tol.,"Never abandon your dreams, no matter how hard it gets.","Jangan pernah melepaskan mimpimu, seberat apa pun tantangannya."
MASTER_0002,2,able,adjective,"sanggup, mampu ",,"With enough practice, she will be able to play the piano beautifully.","Dengan latihan yang cukup, dia akan sanggup bermain piano dengan indah.",Are you able to finish this by tomorrow?,Apakah kamu sanggup menyelesaikan ini besok?,I haven't been able to sleep well lately.,Akhir-akhir ini aku tidak bisa tidur nyenyak.,She is easily able to carry that heavy box.,Dia dengan mudah mampu mengangkat kotak berat itu.,We will be able to travel again next year.,Kita akan bisa bepergian lagi tahun depan.,He is barely able to walk after the marathon.,Dia hampir tidak kuat berjalan setelah lari maraton.
MASTER_0003,3,ability,noun,"kemampuan, bakat, kecakapan ",,His ability to solve complex math problems amazed the teacher.,Kemampuan-nya untuk memecahkan masalah matematika yang rumit membuat guru kagum.,Her singing ability is truly world-class.,Kemampuan menyanyinya benar-benar kelas dunia.,I doubt his ability to lead the team effectively.,Aku meragukan kecakapannya memimpin tim dengan efektif.,This job requires the ability to work under pressure.,Pekerjaan ini menuntut kemampuan bekerja di bawah tekanan.,They tested my physical abilities during the exam.,Mereka menguji kemampuan fisikku selama ujian.,You should never underestimate your own abilities.,Kamu tidak boleh meremehkan bakatmu sendiri.
MASTER_0004,4,abnormal,adjective,"aneh, luar biasa, abnormal ",,The doctor noticed an abnormal heartbeat during the check-up.,Dokter memperhatikan detak jantung yang tidak normal/aneh selama pemeriksaan.,It's highly abnormal for it to snow in this region.,Sangatlah tidak wajar jika turun salju di wilayah ini.,The blood test showed some abnormal results.,Tes darah menunjukkan beberapa hasil yang abnormal.,His behavior has been quite abnormal lately.,Tingkah lakunya cukup aneh akhir-akhir ini.,The machine is making an abnormal buzzing sound.,Mesin itu mengeluarkan suara dengung yang tidak biasa.,Experiencing a bit of anxiety before a speech isn't abnormal.,Merasa sedikit cemas sebelum pidato bukanlah hal yang aneh.
MASTER_0005,5,abolish,verb,"menghapuskan, meniadakan, mengakhiri ",,The government decided to abolish the old tax law next year.,Pemerintah memutuskan untuk menghapuskan undang-undang pajak lama tahun depan.,The government plans to abolish the old tax law.,Pemerintah berencana menghapuskan undang-undang pajak yang lama.,Slavery was abolished in that country centuries ago.,Perbudakan telah dihapuskan di negara itu berabad-abad yang lalu.,They are campaigning to abolish single-use plastics.,Mereka berkampanye untuk meniadakan plastik sekali pakai.,Some argue we should abolish homework for primary students.,Beberapa orang berpendapat kita harus mengakhiri PR untuk siswa SD.,Abolishing the rule caused a lot of confusion.,Menghapus aturan tersebut menyebabkan banyak kebingungan.`;
    setTableContent(demoData);
    setCsvBaselineContent(canonicalizeTableContent(demoData));
    setSequenceHighWater(5);
    setManualIdHighWater(0);
    setImportedRowCount(5);
    
    if (demoData.trim().length > 0) {
      setLockedStates(prev => ({ ...prev, table: true }));
    }

    addLog("System", APP_READY_LOG);

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

