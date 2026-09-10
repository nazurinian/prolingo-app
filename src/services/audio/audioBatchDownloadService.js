import { getAdvancedExpressionPairs, getStableAudioIdentity } from '../../utils/audioUtils';
import { getMaxAssignedNoFromRecords } from '../../utils/csvUtils';
import { shouldDownloadTableCoverageSlot } from '../../domain/audio/audioDownloadCoverageDomain.js';
import { triggerBrowserZipDownload } from './browserZipService.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

export const executeAudioBatchDownloadService = async ({
  isBatchDownloading,
  batchStopSignalRef,
  generationAbortControllerRef,
  setIsBatchStopping,
  setBatchStatusText,
  addLog,
  batchConfig,
  mode,
  sequenceHighWater,
  playlist,
  generatorEngine,
  setIsBatchDownloading,
  generateAIAudio,
  coverageByMapKey = null,
  missingOnly = true,
  onBatchDelivered = null
}) => {
  if (isBatchDownloading) {
    batchStopSignalRef.current = true;
    generationAbortControllerRef.current?.abort();
    setIsBatchStopping(true);
    setBatchStatusText('Stopping...');
    addLog('Batch', 'Stopping batch download...');
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

  setIsBatchDownloading(true);
  const packageEntries = [];
  const deliveredRecords = [];
  let generatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  addLog('Info', `Starting BATCH DL (${targets.length} items) via ${generatorEngine.toUpperCase()} • ${missingOnly ? 'missing only' : 'redownload all'}...`);

  try {
    for (const item of targets) {
      if (batchStopSignalRef.current) break;
      const parts = mode === 'table' ? buildSelectedParts({ item, batchConfig, generatorEngine }) : [['full', 'Full', 250]];
      for (const [part, label, waitMs] of parts) {
        if (batchStopSignalRef.current) break;
        const stableId = getStableAudioIdentity(item);
        const mapKey = `${stableId}_${part}`;
        if (mode === 'table' && missingOnly && !shouldDownloadTableCoverageSlot(coverageByMapKey?.[mapKey])) {
          skippedCount += 1;
          continue;
        }
        setBatchStatusText(`${item.displayId} ${label}`);
        const result = await generateAIAudio(item, part, { skipReplaceConfirm: true, deferBrowserDownload: true });
        if (result?.status === 'success' && result?.blob) {
          generatedCount += 1;
          packageEntries.push({ filename: result.filename, blob: result.blob });
          deliveredRecords.push({
            mode,
            mapKey: result.mapKey || mapKey,
            part,
            engine: result.engine || generatorEngine,
            voice: result.voice || null,
            filename: result.filename,
            delivery: 'browser-zip'
          });
        } else if (result?.status && !['skipped-empty', 'locked-language'].includes(result.status)) {
          failedCount += 1;
        }
        if (!batchStopSignalRef.current && waitMs) await delay(waitMs);
      }
    }

    let packageResult = null;
    if (packageEntries.length) {
      packageResult = await triggerBrowserZipDownload({
        entries: packageEntries,
        filename: `ProLingo_${mode === 'table' ? 'Table' : 'Text'}_Audio_${startIdx}-${endIdx}_${Date.now()}.zip`
      });
      await onBatchDelivered?.(deliveredRecords, packageResult);
      addLog('Batch', `Package ready: ${packageResult.fileCount} audio → ${packageResult.filename}.`);
    }
    const stopped = batchStopSignalRef.current;
    const status = stopped ? 'cancelled' : failedCount ? 'completed-with-errors' : generatedCount ? 'completed' : 'up-to-date';
    addLog('Batch', `${status}: generated ${generatedCount}, skipped covered ${skippedCount}, failed ${failedCount}.`);
    return { status, generatedCount, skippedCount, failedCount, packageResult };
  } finally {
    setIsBatchDownloading(false);
    setBatchStatusText('');
    setIsBatchStopping(false);
    batchStopSignalRef.current = false;
  }
};
