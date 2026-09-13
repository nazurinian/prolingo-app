import { getAdvancedExpressionPairs, getStableAudioIdentity, isIndonesianAudioPart } from '../../utils/audioUtils.js';

export const AUDIO_DOWNLOAD_COVERAGE_STATUS = Object.freeze({
  READY: 'ready',
  DOWNLOADED: 'downloaded',
  OTHER_VOICE: 'other-voice',
  MISSING: 'missing'
});

const clean = value => String(value ?? '').trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

const getExpressionSelection = (batchConfig, lang) => {
  const key = lang === 'idn' ? 'expIdn' : 'expEn';
  if (Array.isArray(batchConfig?.[key]) && batchConfig[key].length === 5) return batchConfig[key];
  return Array(5).fill(false);
};

export const buildTableAudioBatchSlots = ({ playlist, batchConfig, generatorEngine = 'edge', edgeVoice, edgeIndonesianVoice }) => {
  const start = Number.parseInt(batchConfig?.start, 10);
  const end = Number.parseInt(batchConfig?.end, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const expEn = getExpressionSelection(batchConfig, 'en');
  const expIdn = getExpressionSelection(batchConfig, 'idn');
  const slots = [];
  const add = (item, part) => {
    const textExists = (() => {
      if (part === 'word') return Boolean(clean(item.word));
      if (part === 'word_idn') return Boolean(clean(item.meaningWord));
      if (part === 'sentence') return Boolean(clean(item.sentence));
      if (part === 'meaning') return Boolean(clean(item.meaning));
      const match = part.match(/^exp([1-5])_(en|idn)$/i);
      return match ? Boolean(clean(item[`exp${match[1]}${match[2].toLowerCase() === 'en' ? 'En' : 'Idn'}`])) : false;
    })();
    if (!textExists) return;
    const stableId = getStableAudioIdentity(item);
    slots.push({
      stableId,
      mapKey: `${stableId}_${part}`,
      itemId: item.id,
      displayId: item.displayId,
      part,
      engine: generatorEngine,
      requiredVoiceId: generatorEngine === 'edge' ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice) : null
    });
  };
  (Array.isArray(playlist) ? playlist : []).filter(item => item?.displayId >= start && item?.displayId <= end).forEach(item => {
    if (batchConfig?.doWord) add(item, 'word');
    if (batchConfig?.doWordTranslation && generatorEngine === 'edge') add(item, 'word_idn');
    if (batchConfig?.doSentence) add(item, 'sentence');
    if (batchConfig?.doMeaning && generatorEngine === 'edge') add(item, 'meaning');
    getAdvancedExpressionPairs(item).forEach(pair => {
      const idx = pair.number - 1;
      if (expEn[idx]) add(item, `exp${pair.number}_en`);
      if (generatorEngine === 'edge' && expIdn[idx]) add(item, `exp${pair.number}_idn`);
    });
  });
  return slots;
};

export const resolveTableAudioCoverageSlot = ({ slot, localAudioMapTable, generatedAudioMeta, tableAudioVariantInventory, downloadHistory, stagingRecords = [] }) => {
  const variants = (tableAudioVariantInventory?.[slot.mapKey] || []).filter(Boolean);
  const verifiedVariants = variants.filter(variant => variant?.verified !== false || ['folder', 'zip'].includes(variant?.sourceType));
  const matchingVerified = slot.requiredVoiceId
    ? verifiedVariants.find(variant => variant?.voiceId && same(variant.voiceId, slot.requiredVoiceId))
    : verifiedVariants[0];
  if (matchingVerified) {
    return {
      ...slot,
      status: AUDIO_DOWNLOAD_COVERAGE_STATUS.READY,
      verified: true,
      filename: matchingVerified.filename || null,
      voiceId: matchingVerified.voiceId || null,
      sourceType: matchingVerified.sourceType || null
    };
  }
  if (verifiedVariants.length) {
    const other = verifiedVariants.find(variant => variant?.voiceId) || verifiedVariants[0];
    return {
      ...slot,
      status: AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE,
      verified: true,
      filename: other?.filename || null,
      voiceId: other?.voiceId || null,
      sourceType: other?.sourceType || null
    };
  }

  // R2 durable export ledger: released staging metadata survives refresh/OOM and
  // is voice-specific. This is completion history only; it never makes playback Ready.
  const stagedExportHistory = (Array.isArray(stagingRecords) ? stagingRecords : []).filter(record =>
    record?.mapKey === slot.mapKey && (record?.mp3ExportedAt || record?.zipExportedAt)
  );
  const matchingExported = slot.requiredVoiceId
    ? stagedExportHistory.find(record => record?.voiceId && same(record.voiceId, slot.requiredVoiceId))
    : stagedExportHistory[0];
  if (matchingExported) {
    return {
      ...slot,
      status: AUDIO_DOWNLOAD_COVERAGE_STATUS.DOWNLOADED,
      verified: false,
      filename: matchingExported.filename || matchingExported.lastExportFilename || null,
      voiceId: matchingExported.voiceId || null,
      sourceType: 'staging-export-history'
    };
  }
  if (stagedExportHistory.length) {
    const other = stagedExportHistory.find(record => record?.voiceId) || stagedExportHistory[0];
    return {
      ...slot,
      status: AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE,
      verified: false,
      filename: other?.filename || other?.lastExportFilename || null,
      voiceId: other?.voiceId || null,
      sourceType: 'staging-export-history'
    };
  }

  // Legacy compatibility for old one-URL-per-slot state when no C3.4.1
  // variant metadata exists yet.
  const meta = generatedAudioMeta?.[`table:${slot.mapKey}`] || null;
  const loaded = Boolean(localAudioMapTable?.[slot.mapKey]);
  const history = downloadHistory?.[`table:${slot.mapKey}`] || null;
  if (loaded && meta?.verified) {
    if (!slot.requiredVoiceId || !meta?.voice || same(meta.voice, slot.requiredVoiceId)) return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.READY, verified: true, filename: meta?.filename || null, voiceId: meta?.voice || null };
    return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE, verified: true, filename: meta?.filename || null, voiceId: meta.voice };
  }
  if (history) {
    if (!slot.requiredVoiceId || !history.voice || same(history.voice, slot.requiredVoiceId)) return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.DOWNLOADED, verified: false, filename: history.filename || null, voiceId: history.voice || null };
    return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE, verified: false, filename: history.filename || null, voiceId: history.voice || null };
  }
  if (loaded && meta && ['browser-direct-triggered', 'browser-package-triggered'].includes(meta.deliveryStatus)) {
    if (!slot.requiredVoiceId || !meta.voice || same(meta.voice, slot.requiredVoiceId)) return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.DOWNLOADED, verified: false, filename: meta.filename || null, voiceId: meta.voice || null };
    return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE, verified: false, filename: meta.filename || null, voiceId: meta.voice || null };
  }
  return { ...slot, status: AUDIO_DOWNLOAD_COVERAGE_STATUS.MISSING, verified: false, filename: null, voiceId: null };
};

export const buildTableAudioBatchCoverage = args => {
  const slots = buildTableAudioBatchSlots(args).map(slot => resolveTableAudioCoverageSlot({ ...args, slot }));
  const counts = { total: slots.length, ready: 0, downloaded: 0, otherVoice: 0, missing: 0, needDownload: 0, covered: 0 };
  slots.forEach(slot => {
    if (slot.status === AUDIO_DOWNLOAD_COVERAGE_STATUS.READY) counts.ready += 1;
    else if (slot.status === AUDIO_DOWNLOAD_COVERAGE_STATUS.DOWNLOADED) counts.downloaded += 1;
    else if (slot.status === AUDIO_DOWNLOAD_COVERAGE_STATUS.OTHER_VOICE) counts.otherVoice += 1;
    else counts.missing += 1;
  });
  counts.needDownload = counts.otherVoice + counts.missing;
  counts.covered = counts.ready + counts.downloaded;
  return { slots, counts, byMapKey: Object.fromEntries(slots.map(slot => [slot.mapKey, slot])) };
};

export const shouldDownloadTableCoverageSlot = slot => !slot || ![AUDIO_DOWNLOAD_COVERAGE_STATUS.READY, AUDIO_DOWNLOAD_COVERAGE_STATUS.DOWNLOADED].includes(slot.status);
