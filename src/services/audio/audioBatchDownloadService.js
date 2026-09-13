import { getAdvancedExpressionPairs, getStableAudioIdentity, getVocabIdentity, isIndonesianAudioPart } from '../../utils/audioUtils';
import { getMaxAssignedNoFromRecords } from '../../utils/csvUtils';
import { buildTableAudioCoverageScopeKey, shouldDownloadTableCoverageSlot } from '../../domain/audio/audioDownloadCoverageDomain.js';
import { resolveTableAudioBookId } from '../../domain/audio/audioStagingDomain.js';
import {
  getAudioOriginStorageEstimate,
  listAudioStagingMetadata,
  releaseAudioStagingBlobs,
  saveAudioBatchSession
} from '../persistence/audioStagingIndexedDbService.js';
import { exportStagedAudioZipGroups } from './audioBatchExportService.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const STORAGE_SAFETY_RESERVE_BYTES = 128 * 1024 * 1024;
const STORAGE_PRESSURE_RATIO = 0.92;

const getExpressionSelection = (batchConfig, lang) => {
  const key = lang === 'idn' ? 'expIdn' : 'expEn';
  if (Array.isArray(batchConfig?.[key]) && batchConfig[key].length === 5) return batchConfig[key];
  const legacyEnabled = lang === 'idn'
    ? Boolean(batchConfig?.doExpressions && batchConfig?.doExpressionTranslations)
    : Boolean(batchConfig?.doExpressions);
  return Array(5).fill(legacyEnabled);
};

const buildSelectedParts = ({ item, batchConfig, generatorEngine }) => {
  const result = [];
  const expEn = getExpressionSelection(batchConfig, 'en');
  const expIdn = getExpressionSelection(batchConfig, 'idn');
  if (batchConfig.doWord) result.push(['word', 'Word', 250]);
  if (batchConfig.doWordTranslation && generatorEngine === 'edge' && item.meaningWord) result.push(['word_idn', 'Word IDN', 200]);
  if (batchConfig.doSentence) result.push(['sentence', 'Sent', 250]);
  if (batchConfig.doMeaning && generatorEngine === 'edge' && item.meaning) result.push(['meaning', 'Meaning', 250]);
  getAdvancedExpressionPairs(item).forEach(pair => {
    const idx = pair.number - 1;
    if (expEn[idx] && pair.en) result.push([`exp${pair.number}_en`, `EXP${pair.number} EN`, 200]);
    if (generatorEngine === 'edge' && expIdn[idx] && pair.idn) result.push([`exp${pair.number}_idn`, `EXP${pair.number} IDN`, 200]);
  });
  return result;
};

const createBatchSessionId = () => `BATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const collectRequestedSlotSpecs = ({ targets, batchConfig, generatorEngine, edgeVoice, edgeIndonesianVoice }) => {
  const specs = [];
  targets.forEach(item => {
    buildSelectedParts({ item, batchConfig, generatorEngine }).forEach(([part]) => {
      specs.push({
        mapKey: `${getStableAudioIdentity(item)}_${part}`,
        displayId: item.displayId,
        vocabId: getVocabIdentity(item),
        part,
        bookId: resolveTableAudioBookId(item),
        voiceId: generatorEngine === 'edge' ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice) : null
      });
    });
  });
  return specs;
};

const matchesRequestedSpec = (record, specs) => specs.some(spec => {
  if (record?.mapKey !== spec.mapKey) return false;
  const recordVocab = String(record?.vocabId || '').trim().toUpperCase();
  const specVocab = String(spec?.vocabId || '').trim().toUpperCase();
  if (recordVocab && specVocab && recordVocab !== specVocab) return false;
  const recordBook = String(record?.bookId || '').trim().toUpperCase();
  const specBook = String(spec?.bookId || '').trim().toUpperCase();
  if (!recordVocab && !specVocab && recordBook && specBook && recordBook !== specBook) return false;
  if (!spec.voiceId) return true;
  return String(record?.voiceId || '').toLowerCase() === String(spec.voiceId).toLowerCase();
});

export const executeAudioBatchDownloadService = async ({
  isBatchDownloading,
  batchStopSignalRef,
  generationAbortControllerRef,
  setIsBatchStopping,
  setBatchStatusText,
  addLog,
  batchConfig,
  mode,
  playlist,
  generatorEngine,
  edgeVoice = null,
  edgeIndonesianVoice = null,
  setIsBatchDownloading,
  generateAIAudio,
  coverageByMapKey = null,
  coverageByScopedKey = null,
  missingOnly = true,
  onBatchDelivered = null,
  onBatchSessionsChanged = null,
  onStagingChanged = null
}) => {
  if (isBatchDownloading) {
    batchStopSignalRef.current = true;
    generationAbortControllerRef.current?.abort();
    setIsBatchStopping(true);
    setBatchStatusText('Stopping...');
    addLog('Batch', 'Stopping batch generation...');
    return { status: 'stopping' };
  }

  batchStopSignalRef.current = false;
  setIsBatchStopping(false);

  const startIdx = parseInt(batchConfig.start, 10);
  const endIdx = parseInt(batchConfig.end, 10);
  const maxRangeNo = mode === 'table'
    ? Math.max(1, getMaxAssignedNoFromRecords(playlist))
    : Math.max(1, playlist.length);

  if (Number.isNaN(startIdx) || Number.isNaN(endIdx) || startIdx < 1 || endIdx > maxRangeNo || startIdx > endIdx) {
    alert(`Range tidak valid. Maksimum saat ini: ${maxRangeNo}.`);
    return { status: 'invalid-range' };
  }

  const targets = mode === 'table'
    ? playlist.filter(p => p.displayId >= startIdx && p.displayId <= endIdx)
    : playlist.filter((_, idx) => (idx + 1) >= startIdx && (idx + 1) <= endIdx);
  if (!targets.length) {
    alert('Tidak ada item dalam range tersebut.');
    return { status: 'empty-range' };
  }

  const expEn = getExpressionSelection(batchConfig, 'en');
  const expIdn = getExpressionSelection(batchConfig, 'idn');
  const hasTableSelection = mode !== 'table' || Boolean(
    batchConfig.doWord || batchConfig.doSentence ||
    (generatorEngine === 'edge' && (batchConfig.doWordTranslation || batchConfig.doMeaning)) ||
    expEn.some(Boolean) || (generatorEngine === 'edge' && expIdn.some(Boolean))
  );
  if (!hasTableSelection) {
    alert('Pilih minimal satu bagian audio untuk Batch Download.');
    return { status: 'no-selection' };
  }

  // R2 staging/session flow is intentionally Table-first while Structured Text remains paused.
  if (mode !== 'table') {
    alert('R2 Audio Staging batch saat ini difokuskan untuk Table. Structured Text tetap memakai flow C3.4.2 sampai checkpoint Text berikutnya.');
    return { status: 'table-only-r2' };
  }

  const sessionId = createBatchSessionId();
  const autoExportZip = batchConfig?.autoExportZip !== false;
  const requestedSpecs = collectRequestedSlotSpecs({ targets, batchConfig, generatorEngine, edgeVoice, edgeIndonesianVoice });
  let session = await saveAudioBatchSession({
    id: sessionId,
    mode: 'table',
    status: 'running',
    generatorEngine,
    start: startIdx,
    end: endIdx,
    requestedCount: requestedSpecs.length,
    requestedSpecs,
    autoExportZip,
    generatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    exportedZipCount: 0,
    safetyExportCount: 0,
    audioIds: []
  });
  await onBatchSessionsChanged?.();

  setIsBatchDownloading(true);
  let generatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const safetyFlushedIds = new Set();
  const deliveredRecords = [];
  let processedSinceStorageCheck = 0;
  addLog('Info', `Starting R2 batch (${targets.length} items) via ${generatorEngine.toUpperCase()} • ${missingOnly ? 'missing only' : 'redownload all'} • Auto ZIP ${autoExportZip ? 'ON' : 'OFF'}...`);

  const refreshSessionSnapshot = async (extra = {}) => {
    const allMeta = await listAudioStagingMetadata({ mode: 'table', includeReleased: true });
    const relevant = allMeta.filter(record => matchesRequestedSpec(record, requestedSpecs));
    session = await saveAudioBatchSession({
      ...session,
      generatedCount,
      skippedCount,
      failedCount,
      stagedCount: relevant.filter(record => record.hasBlob).length,
      stagedBytes: relevant.filter(record => record.hasBlob).reduce((sum, record) => sum + Number(record.size || 0), 0),
      audioIds: relevant.map(record => record.id),
      ...extra
    });
    await onBatchSessionsChanged?.();
    await onStagingChanged?.();
    return relevant;
  };

  const safetyFlushIfNeeded = async () => {
    processedSinceStorageCheck += 1;
    if (processedSinceStorageCheck < 20) return false;
    processedSinceStorageCheck = 0;
    const estimate = await getAudioOriginStorageEstimate();
    if (!estimate?.quota) return false;
    const pressure = estimate.available < STORAGE_SAFETY_RESERVE_BYTES || estimate.ratio >= STORAGE_PRESSURE_RATIO;
    if (!pressure) return false;
    const relevant = (await refreshSessionSnapshot()).filter(record => record.hasBlob && !safetyFlushedIds.has(record.id));
    if (!relevant.length) return false;
    if (!autoExportZip) {
      session = await saveAudioBatchSession({ ...session, status: 'paused-storage-pressure', storageEstimate: estimate });
      batchStopSignalRef.current = true;
      setBatchStatusText('Storage pressure — stopped safely');
      addLog('Warn', 'Audio Staging mendekati batas origin storage. Auto Export ZIP OFF, batch dihentikan tanpa menghapus staged audio.');
      return true;
    }
    setBatchStatusText(`Safety export • ${relevant.length} staged`);
    const exportResults = await exportStagedAudioZipGroups({ records: relevant, sessionId, onProgress: info => {
      if (info.phase === 'zip') setBatchStatusText(`Safety ZIP • ${info.filename}`);
    }});
    const exportedIds = [...new Set(exportResults.flatMap(result => result.ids || []))];
    exportedIds.forEach(id => safetyFlushedIds.add(id));
    deliveredRecords.push(...relevant.filter(record => exportedIds.includes(record.id)).map(record => ({
      mode: 'table', mapKey: record.mapKey, part: record.part, engine: record.engine, voice: record.voiceId,
      vocabId: record.vocabId || null, bookId: record.bookId || null, displayId: record.displayId ?? null,
      filename: record.filename, delivery: 'browser-zip'
    })));
    await releaseAudioStagingBlobs(exportedIds, { reason: 'storage-pressure-exported' });
    session = await saveAudioBatchSession({
      ...session,
      safetyExportCount: Number(session.safetyExportCount || 0) + exportResults.length,
      exportedZipCount: Number(session.exportedZipCount || 0) + exportResults.length,
      status: 'running-after-safety-export',
      storageEstimate: estimate
    });
    await onBatchDelivered?.(deliveredRecords, { status: 'storage-pressure-safety-export', exports: exportResults });
    deliveredRecords.length = 0;
    await onBatchSessionsChanged?.();
    await onStagingChanged?.();
    addLog('Batch', `Storage-pressure safety export: ${exportResults.length} ZIP, ${exportedIds.length} staged binaries released.`);
    return true;
  };

  try {
    for (const item of targets) {
      if (batchStopSignalRef.current) break;
      const parts = buildSelectedParts({ item, batchConfig, generatorEngine });
      for (const [part, label, waitMs] of parts) {
        if (batchStopSignalRef.current) break;
        const stableId = getStableAudioIdentity(item);
        const mapKey = `${stableId}_${part}`;
        const coverageKey = buildTableAudioCoverageScopeKey({
          mapKey,
          vocabId: getVocabIdentity(item),
          bookId: resolveTableAudioBookId(item)
        });
        const coverageSlot = coverageByScopedKey?.[coverageKey] || coverageByMapKey?.[mapKey];
        if (missingOnly && !shouldDownloadTableCoverageSlot(coverageSlot)) {
          skippedCount += 1;
          continue;
        }
        setBatchStatusText(`${item.displayId} ${label} • staging`);
        const result = await generateAIAudio(item, part, {
          skipReplaceConfirm: true,
          deferBrowserDownload: true,
          suppressFailureAlert: true,
          batchSessionId: sessionId
        });
        if (result?.status === 'success' && result?.stagingRecord) generatedCount += 1;
        else if (result?.status === 'error') failedCount += 1;
        else if (result?.status === 'cancelled' && !batchStopSignalRef.current) failedCount += 1;

        if ((generatedCount + failedCount) % 10 === 0) await refreshSessionSnapshot();
        await safetyFlushIfNeeded();
        if (!batchStopSignalRef.current && waitMs) await delay(waitMs);
      }
    }

    let exportResults = [];
    const relevant = await refreshSessionSnapshot();
    if (autoExportZip && !batchStopSignalRef.current) {
      const exportable = relevant.filter(record => record.hasBlob && !safetyFlushedIds.has(record.id));
      if (exportable.length) {
        setBatchStatusText(`Export ZIP • ${exportable.length} staged`);
        exportResults = await exportStagedAudioZipGroups({
          records: exportable,
          sessionId,
          onProgress: info => {
            if (info.phase === 'zip') setBatchStatusText(`ZIP • ${info.filename}`);
          }
        });
        const exportedIds = [...new Set(exportResults.flatMap(result => result.ids || []))];
        deliveredRecords.push(...exportable.filter(record => exportedIds.includes(record.id)).map(record => ({
          mode: 'table', mapKey: record.mapKey, part: record.part, engine: record.engine, voice: record.voiceId,
          vocabId: record.vocabId || null, bookId: record.bookId || null, displayId: record.displayId ?? null,
          filename: record.filename, delivery: 'browser-zip'
        })));
        if (deliveredRecords.length) await onBatchDelivered?.(deliveredRecords, { status: 'batch-export', exports: exportResults });
      }
    }

    const stopped = batchStopSignalRef.current;
    const status = stopped ? (session.status === 'paused-storage-pressure' ? 'paused-storage-pressure' : 'cancelled') : failedCount ? 'completed-with-errors' : generatedCount ? 'completed' : 'up-to-date';
    session = await saveAudioBatchSession({
      ...session,
      status,
      generatedCount,
      skippedCount,
      failedCount,
      exportedZipCount: Number(session.exportedZipCount || 0) + exportResults.length,
      completedAt: stopped ? null : Date.now(),
      stoppedAt: stopped ? Date.now() : null
    });
    await refreshSessionSnapshot({ status: session.status, completedAt: session.completedAt, stoppedAt: session.stoppedAt, exportedZipCount: session.exportedZipCount });
    addLog('Batch', `${status}: staged ${generatedCount}, skipped covered ${skippedCount}, failed ${failedCount}, ZIP ${session.exportedZipCount || 0}.`);
    return { status, session, generatedCount, skippedCount, failedCount, exportResults };
  } finally {
    setIsBatchDownloading(false);
    setBatchStatusText('');
    setIsBatchStopping(false);
    batchStopSignalRef.current = false;
    await onBatchSessionsChanged?.();
    await onStagingChanged?.();
  }
};
