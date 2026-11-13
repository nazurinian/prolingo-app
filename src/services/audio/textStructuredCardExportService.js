import { triggerBrowserDownload } from '../../utils/audioUtils.js';
import { triggerBrowserZipDownload } from './browserZipService.js';
import { DIRECT_MP3_BATCH_LIMIT } from './audioBatchExportService.js';
import {
  buildDerivedTextFullAudioFilename,
  buildDerivedTextFullAudioWav
} from './textStructuredFullAudioExportService.js';
import {
  buildCanonicalTextCardZipFilename,
  buildCanonicalTextConsolidatedZipFilename,
  buildCanonicalTextFullArtifactFilename
} from '../../domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../../domain/text/textAudioManifestDomain.js';
import {
  buildTextAudioIndexCsv,
  TEXT_AUDIO_INDEX_FILENAME
} from '../../domain/text/textAudioIndexDomain.js';
import {
  resolveTextStructuredBatchReadyFullArtifacts,
  resolveTextStructuredCardReadyFullArtifacts
} from '../../domain/text/textStructuredBulkExportDomain.js';
import { markAudioStagingExported } from '../persistence/audioStagingIndexedDbService.js';
import { TEXT_AUDIO_STAGING_ZIP_MAX_BYTES as DEFAULT_TEXT_ZIP_MAX_BYTES } from '../persistence/textAudioStagingService.js';

export const TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS = 350;

const defaultWait = ms => new Promise(resolve => setTimeout(resolve, ms));

const defaultTriggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, filename);
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
};

const addStagingRef = (target, runtime) => {
  if (runtime?.stagingBacked && runtime?.stagingId) {
    target.add(runtime.stagingId);
  }
};

const addSplitPhysicalEntry = async ({
  physicalByKey,
  rf,
  runtime,
  filename,
  variant,
  readBlob,
  reference,
  missingBinaryMessage
}) => {
  const key = `split:${rf}`;
  let physical = physicalByKey.get(key);
  if (!physical) {
    const blob = await readBlob(runtime);
    if (!blob) throw new Error(missingBinaryMessage);
    if (!filename) throw new Error(`RF ${rf} has no canonical filename.`);
    physical = {
      representation: 'split',
      identity: rf,
      rf,
      fullArtifactFingerprint: null,
      filename,
      blob,
      mimeType: blob.type || variant?.mimeType || null,
      render: variant?.metadata?.audioRenderDescriptorV1 || null,
      stagingIds: new Set(),
      references: []
    };
    physicalByKey.set(key, physical);
  }
  addStagingRef(physical.stagingIds, runtime);
  physical.references.push(reference);
  return physical;
};

const addFullPhysicalEntry = async ({
  physicalByKey,
  fullItem,
  readBlob,
  reference
}) => {
  const fingerprint = String(fullItem?.fullArtifactFingerprint || '').toLowerCase();
  if (!fingerprint) return null;
  const key = `full:${fingerprint}`;
  let physical = physicalByKey.get(key);
  if (!physical) {
    const blob = await readBlob(fullItem.runtime);
    if (!blob) throw new Error(`Ready Full audio binary unavailable for ${fullItem.blockId}/${fullItem.channel}.`);
    const filename = fullItem.runtime?.filename
      || fullItem.artifact?.filename
      || buildCanonicalTextFullArtifactFilename({
        fullArtifactFingerprint: fingerprint,
        engine: fullItem.artifact?.descriptor?.engine || 'edge',
        voiceId: fullItem.voiceId,
        extension: 'mp3'
      });
    physical = {
      representation: 'full',
      identity: fingerprint,
      rf: null,
      fullArtifactFingerprint: fingerprint,
      filename,
      blob,
      mimeType: blob.type || fullItem.runtime?.mimeType || fullItem.artifact?.mimeType || 'audio/mpeg',
      render: fullItem.artifact?.descriptor || null,
      stagingIds: new Set(),
      references: []
    };
    physicalByKey.set(key, physical);
  }
  addStagingRef(physical.stagingIds, fullItem.runtime);
  physical.references.push(reference);
  return physical;
};

const toManifestEntry = item => ({
  representation: item.representation,
  identity: item.identity,
  rf: item.representation === 'split' ? item.rf : null,
  fullArtifactFingerprint: item.representation === 'full' ? item.fullArtifactFingerprint : null,
  filename: item.filename,
  mimeType: item.mimeType,
  size: Number(item.blob?.size || 0),
  render: item.render,
  references: item.references
});

const chunkPhysicalEntries = (physicalList, maxBytes = DEFAULT_TEXT_ZIP_MAX_BYTES) => {
  const limit = Math.max(1, Number(maxBytes || DEFAULT_TEXT_ZIP_MAX_BYTES));
  const chunks = [];
  let chunk = [];
  let chunkBytes = 0;
  for (const physical of physicalList) {
    const bytes = Number(physical.blob?.size || 0);
    if (chunk.length && chunkBytes + bytes > limit) {
      chunks.push({ physical: chunk, bytes: chunkBytes });
      chunk = [];
      chunkBytes = 0;
    }
    chunk.push(physical);
    chunkBytes += bytes;
  }
  if (chunk.length) chunks.push({ physical: chunk, bytes: chunkBytes });
  return chunks;
};

/**
 * Package one Card's Ready Split audio and/or active-profile Ready Edge Full artifacts
 * into a deduplicated ZIP with v2 manifest and AUDIO_INDEX.csv without regenerating audio.
 */
export const executeStructuredTextCardZipExport = async ({
  documentTree,
  blockId,
  options = {},
  preferences = {},
  runtimeFullAudio = {},
  resolveManualReadySlot,
  readBlob,
  triggerZipDownload = triggerBrowserZipDownload,
  markStagingExported = markAudioStagingExported,
  addLog = null
} = {}) => {
  const block = (documentTree?.blocks || []).find(item => item.id === blockId) || null;
  if (!block) return { status: 'missing-card' };
  const selectedIds = Array.isArray(options?.segmentIds) && options.segmentIds.length ? new Set(options.segmentIds) : null;
  const selectedSegments = (block.segments || []).filter(segment => !selectedIds || selectedIds.has(segment.id));
  const slots = [];
  for (const segment of selectedSegments) {
    for (const channel of ['text', 'meaning']) {
      const content = String(channel === 'meaning' ? segment?.meaning || '' : segment?.text || '').trim();
      if (!content) continue;
      const resolved = resolveManualReadySlot?.(segment.id, channel) || null;
      slots.push({ segment, channel, resolved });
    }
  }
  const fullReady = selectedIds
    ? []
    : resolveTextStructuredCardReadyFullArtifacts({
      documentTree,
      block,
      channels: ['text', 'meaning'],
      preferences,
      runtimeFullAudio
    });
  const missing = slots.filter(item => !item.resolved);
  const fullOnlyReadyCard = fullReady.length > 0 && slots.every(item => !item.resolved);
  if (missing.length && !fullOnlyReadyCard && options?.partial !== true) {
    addLog?.('Warn', `Split ZIP blocked: ${slots.length - missing.length}/${slots.length} Ready • ${missing.length} Missing.`);
    return { status: 'incomplete', ready: slots.length - missing.length, total: slots.length, missing: missing.length, readyFull: fullReady.length };
  }
  const readySlots = slots.filter(item => item.resolved);
  if (!readySlots.length && !fullReady.length) {
    return { status: 'empty', ready: 0, total: slots.length, readyFull: 0 };
  }

  try {
    const physicalByKey = new Map();
    const voiceIds = [];
    for (const item of readySlots) {
      const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
      if (!rf) throw new Error(`Split ZIP requires RF-verified audio: ${item.segment.id}/${item.channel}.`);
      const filename = item.resolved.runtime.filename || item.resolved.coverage.filename || item.resolved.variant.filename;
      await addSplitPhysicalEntry({
        physicalByKey,
        rf,
        runtime: item.resolved.runtime,
        filename,
        variant: item.resolved.variant,
        readBlob,
        missingBinaryMessage: `Ready binary unavailable for ${item.segment.id}/${item.channel}.`,
        reference: {
          documentId: documentTree?.id || null,
          documentUid: documentTree?.uid || null,
          cardId: block.id,
          cardUid: block.uid || null,
          segmentId: item.segment.id,
          segmentUid: item.segment.uid || null,
          channel: item.channel,
          audioVariantId: item.resolved.variant.id,
          audioVariantUid: item.resolved.variant.uid || null,
          voiceId: item.resolved.coverage.requiredVoiceId || item.resolved.variant.voiceId || null,
          representation: 'split'
        }
      });
      if (item.resolved.coverage.requiredVoiceId) voiceIds.push(item.resolved.coverage.requiredVoiceId);
    }

    for (const fullItem of fullReady) {
      await addFullPhysicalEntry({
        physicalByKey,
        fullItem,
        readBlob,
        reference: {
          documentId: documentTree?.id || null,
          documentUid: documentTree?.uid || null,
          cardId: block.id,
          cardUid: block.uid || null,
          segmentId: null,
          channel: fullItem.channel,
          voiceId: fullItem.voiceId || null,
          representation: 'full'
        }
      });
      if (fullItem.voiceId) voiceIds.push(fullItem.voiceId);
    }

    const physicalList = [...physicalByKey.values()];
    const splitPhysical = physicalList.filter(item => item.representation === 'split').length;
    const fullPhysical = physicalList.filter(item => item.representation === 'full').length;
    const manifest = buildProLingoTextAudioManifest({
      entries: physicalList.map(toManifestEntry),
      source: {
        kind: selectedIds ? 'selected-card-split' : (fullPhysical ? 'card-audio' : 'card-split'),
        documentId: documentTree?.id || null,
        cardId: block.id,
        splitEntries: splitPhysical,
        fullEntries: fullPhysical
      }
    });
    const entries = physicalList.map(item => ({ filename: item.filename, blob: item.blob }));
    entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
    entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' }) });
    const zipFilename = buildCanonicalTextCardZipFilename({ documentTitle: documentTree?.title || 'Text', blockId, voiceIds });
    const result = await triggerZipDownload({ entries, filename: zipFilename });
    const stagedIds = [...new Set(physicalList.flatMap(item => [...item.stagingIds]))];
    if (stagedIds.length) await markStagingExported(stagedIds, { kind: 'zip', filename: zipFilename });
    addLog?.('Text Audio', `Card ZIP: ${readySlots.length} Split + ${fullReady.length} Full → ${physicalList.length} unique physical file(s) + manifest → ${zipFilename}.`);
    return {
      status: 'completed',
      result,
      filename: zipFilename,
      manifest,
      logical: readySlots.length + fullReady.length,
      physical: physicalList.length,
      splitPhysical,
      fullPhysical,
      total: slots.length
    };
  } catch (error) {
    addLog?.('Error', `Split ZIP export failed: ${error?.message || error}`);
    return { status: 'error', error };
  }
};

/**
 * Export Full audio for one Card channel. Prefers an existing Ready Edge Full MP3
 * matching the current content and download profile; otherwise falls back to a derived
 * client-side WAV stitched from Ready Split segments without regenerating TTS.
 */
export const executeStructuredTextFullCardAudioExport = async ({
  documentTree,
  blockId,
  channel = 'text',
  preferences = {},
  runtimeFullAudio = {},
  resolveManualReadySlot,
  readBlob,
  buildDerivedWav = buildDerivedTextFullAudioWav,
  triggerFileDownload = defaultTriggerBlobDownload,
  markStagingExported = markAudioStagingExported,
  addLog = null
} = {}) => {
  const block = (documentTree?.blocks || []).find(item => item.id === blockId) || null;
  if (!block) return { status: 'missing-card' };
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const segments = (block.segments || []).filter(segment => String(normalizedChannel === 'meaning' ? segment?.meaning || '' : segment?.text || '').trim());
  if (!segments.length) return { status: 'empty' };

  const readyFull = resolveTextStructuredCardReadyFullArtifacts({
    documentTree,
    block,
    channels: [normalizedChannel],
    preferences,
    runtimeFullAudio
  })[0] || null;

  if (readyFull) {
    try {
      const blob = await readBlob(readyFull.runtime);
      if (!blob) throw new Error(`Ready Full audio binary unavailable for ${blockId}/${normalizedChannel}.`);
      const filename = readyFull.runtime?.filename
        || readyFull.artifact?.filename
        || buildCanonicalTextFullArtifactFilename({
          fullArtifactFingerprint: readyFull.fullArtifactFingerprint,
          engine: readyFull.artifact?.descriptor?.engine || 'edge',
          voiceId: readyFull.voiceId,
          extension: 'mp3'
        });
      triggerFileDownload(blob, filename);
      if (readyFull.runtime?.stagingBacked && readyFull.runtime?.stagingId) {
        await markStagingExported(readyFull.runtime.stagingId, { kind: 'mp3', filename });
      }
      addLog?.('Text Audio', `Full Edge ${normalizedChannel === 'meaning' ? 'ID' : 'EN'}: reused Ready Full MP3 (${readyFull.voiceId}) → ${filename}.`);
      return {
        status: 'download-triggered',
        source: 'ready-full-edge',
        representation: 'full',
        fullArtifactFingerprint: readyFull.fullArtifactFingerprint,
        voiceId: readyFull.voiceId,
        filename,
        size: Number(blob.size || 0)
      };
    } catch (error) {
      addLog?.('Error', `Full Edge audio export failed: ${error?.message || error}`);
      return { status: 'error', error };
    }
  }

  const resolved = segments.map(segment => ({ segment, slot: resolveManualReadySlot?.(segment.id, normalizedChannel) || null }));
  const missing = resolved.filter(item => !item.slot);
  if (missing.length) {
    addLog?.('Warn', `Full ${normalizedChannel === 'meaning' ? 'ID' : 'EN'} blocked: ${segments.length - missing.length}/${segments.length} Sentence audio Ready.`);
    return { status: 'incomplete', ready: segments.length - missing.length, total: segments.length };
  }
  try {
    const blobs = [];
    for (const item of resolved) {
      const blob = await readBlob(item.slot.runtime);
      if (!blob) throw new Error(`Binary unavailable for ${item.segment.id}/${normalizedChannel}.`);
      blobs.push(blob);
    }
    const derived = await buildDerivedWav({ blobs });
    const filename = buildDerivedTextFullAudioFilename({ documentTitle: documentTree?.title || 'Text', blockId, channel: normalizedChannel });
    triggerFileDownload(derived.blob, filename);
    addLog?.('Text Audio', `Full derived ${normalizedChannel === 'meaning' ? 'ID' : 'EN'}: ${derived.segmentCount} Segment audio → ${filename}; no new AudioVariant.`);
    return { status: 'download-triggered', source: 'derived-split-wav', representation: 'derived-wav', filename, ...derived };
  } catch (error) {
    addLog?.('Error', `Full derived audio failed: ${error?.message || error}`);
    return { status: 'error', error };
  }
};

/**
 * Download unique Ready Split and Ready Edge Full MP3s across the active Batch scope
 * in paced waves without duplicating shared-fingerprint physical binaries.
 */
export const executeStructuredTextBatchReadyMp3Export = async ({
  batchSelection,
  targetTrees = [],
  preferences = {},
  runtimeFullAudio = {},
  resolveBatchReadySlot,
  readBlob,
  triggerFileDownload = defaultTriggerBlobDownload,
  markStagingExported = markAudioStagingExported,
  wait = defaultWait,
  addLog = null
} = {}) => {
  const slots = batchSelection?.slots || [];
  const readyLogical = slots.map(slot => ({ slot, resolved: resolveBatchReadySlot?.(slot) || null })).filter(item => item.resolved);
  const readyFull = resolveTextStructuredBatchReadyFullArtifacts({
    documentTrees: targetTrees,
    selection: batchSelection,
    preferences,
    runtimeFullAudio
  });
  if (!readyLogical.length && !readyFull.length) {
    addLog?.('Warn', 'Text Batch MP3 export: no Ready Split or Ready Full binary in the selected scope/current exact voices.');
    return { status: 'empty', exported: 0, total: slots.length };
  }

  const physicalMap = new Map();
  readyLogical.forEach(item => {
    const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
    const physicalKey = `split:${rf || `legacy:${item.resolved.variant.id}`}`;
    if (!physicalMap.has(physicalKey)) {
      const filename = item.resolved.runtime.filename
        || item.resolved.coverage.filename
        || item.resolved.variant.filename
        || `${item.slot.segmentId}__${item.slot.channel}.mp3`;
      physicalMap.set(physicalKey, {
        representation: 'split',
        physicalKey,
        runtime: item.resolved.runtime,
        filename,
        label: `${item.slot.segmentId}/${item.slot.channel}`,
        references: [item]
      });
    } else {
      physicalMap.get(physicalKey).references.push(item);
    }
  });
  readyFull.forEach(item => {
    const physicalKey = `full:${item.fullArtifactFingerprint}`;
    if (!physicalMap.has(physicalKey)) {
      const filename = item.runtime?.filename
        || item.artifact?.filename
        || buildCanonicalTextFullArtifactFilename({
          fullArtifactFingerprint: item.fullArtifactFingerprint,
          engine: item.artifact?.descriptor?.engine || 'edge',
          voiceId: item.voiceId,
          extension: 'mp3'
        });
      physicalMap.set(physicalKey, {
        representation: 'full',
        physicalKey,
        runtime: item.runtime,
        filename,
        label: `${item.blockId}/${item.channel}/FULL`,
        references: [item]
      });
    } else {
      physicalMap.get(physicalKey).references.push(item);
    }
  });

  const physicalReady = [...physicalMap.values()];
  let exported = 0;
  let failed = 0;
  for (let offset = 0; offset < physicalReady.length; offset += DIRECT_MP3_BATCH_LIMIT) {
    const wave = physicalReady.slice(offset, offset + DIRECT_MP3_BATCH_LIMIT);
    for (const physical of wave) {
      try {
        const blob = await readBlob(physical.runtime);
        if (!blob) throw new Error('binary unavailable');
        triggerFileDownload(blob, physical.filename);
        if (physical.runtime.stagingBacked && physical.runtime.stagingId) {
          await markStagingExported(physical.runtime.stagingId, { kind: 'mp3', filename: physical.filename });
        }
        exported += 1;
      } catch (error) {
        failed += 1;
        addLog?.('Warn', `Text Batch MP3 skipped ${physical.label}: ${error?.message || error}`);
      }
    }
    if (offset + DIRECT_MP3_BATCH_LIMIT < physicalReady.length) await wait(300);
  }
  const splitPhysical = physicalReady.filter(item => item.representation === 'split').length;
  const fullPhysical = physicalReady.filter(item => item.representation === 'full').length;
  addLog?.('Text Audio', `Text Batch direct MP3: ${readyLogical.length} Split + ${readyFull.length} Full logical → ${physicalReady.length} unique physical file(s); exported ${exported}${failed ? ` • failed ${failed}` : ''}.`);
  return {
    status: failed ? 'completed-with-errors' : 'completed',
    exported,
    failed,
    logicalReady: readyLogical.length + readyFull.length,
    physicalReady: physicalReady.length,
    splitPhysical,
    fullPhysical,
    total: slots.length
  };
};

/**
 * Package unique Ready Split and Ready Edge Full renders per workspace into consolidated
 * ZIP archive(s) with v2 manifest and AUDIO_INDEX.csv, yielding between multi-part downloads.
 */
export const executeStructuredTextBatchConsolidatedZipExport = async ({
  partial = false,
  batchSelection,
  targetTrees = [],
  preferences = {},
  runtimeFullAudio = {},
  maxBytes = DEFAULT_TEXT_ZIP_MAX_BYTES,
  waveDelayMs = TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS,
  resolveBatchReadySlot,
  readBlob,
  triggerZipDownload = triggerBrowserZipDownload,
  markStagingExported = markAudioStagingExported,
  wait = defaultWait,
  addLog = null
} = {}) => {
  const slots = batchSelection?.slots || [];
  const readySplit = slots.map(slot => ({ slot, resolved: resolveBatchReadySlot?.(slot) || null })).filter(item => item.resolved);
  const readyFull = resolveTextStructuredBatchReadyFullArtifacts({
    documentTrees: targetTrees,
    selection: batchSelection,
    preferences,
    runtimeFullAudio
  });
  if (!slots.length && !readyFull.length) return { status: 'empty', ready: 0, total: 0 };
  if (!partial && readySplit.length !== slots.length) {
    addLog?.('Warn', `Text Full ZIP blocked: ${readySplit.length}/${slots.length} Ready • ${slots.length - readySplit.length} Missing/other/stale.`);
    return { status: 'incomplete', ready: readySplit.length, total: slots.length };
  }
  if (partial && !readySplit.length && !readyFull.length) return { status: 'empty', ready: 0, total: slots.length };

  const documentEntries = new Map();
  const ensureDocumentBucket = (documentId, documentTitle = null) => {
    const key = documentId || 'TEXT_DOCUMENT';
    if (!documentEntries.has(key)) {
      documentEntries.set(key, { documentId: key, fallbackTitle: documentTitle, split: [], full: [] });
    }
    return documentEntries.get(key);
  };
  readySplit.forEach(item => {
    ensureDocumentBucket(item.slot?.documentId, item.slot?.documentTitle).split.push(item);
  });
  readyFull.forEach(item => {
    ensureDocumentBucket(item.documentId, item.documentTitle).full.push(item);
  });

  const exportedChunks = [];
  let triggeredZipCount = 0;
  try {
    for (const [documentId, bucket] of documentEntries.entries()) {
      const documentReady = bucket.split;
      const documentFull = bucket.full;
      const documentDescriptor = batchSelection?.documents?.find(document => document.id === documentId);
      const documentSlots = slots.filter(slot => (slot.documentId || 'TEXT_DOCUMENT') === documentId);
      const documentComplete = documentReady.length === documentSlots.length;
      if (!partial && !documentComplete) throw new Error(`Workspace ${documentDescriptor?.title || documentId} is incomplete.`);
      const voiceIds = [...new Set([
        ...documentReady.map(item => item.resolved.coverage.requiredVoiceId),
        ...documentFull.map(item => item.voiceId)
      ].filter(Boolean))];

      const physicalByKey = new Map();
      for (const item of documentReady) {
        const rf = String(item.resolved.variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
        if (!rf) throw new Error(`Batch ZIP requires RF-verified audio: ${item.slot.segmentId}/${item.slot.channel}.`);
        const filename = item.resolved.runtime.filename || item.resolved.coverage.filename || item.resolved.variant.filename;
        await addSplitPhysicalEntry({
          physicalByKey,
          rf,
          runtime: item.resolved.runtime,
          filename,
          variant: item.resolved.variant,
          readBlob,
          missingBinaryMessage: `Ready binary unavailable for ${item.slot.segmentId}/${item.slot.channel}.`,
          reference: {
            documentId,
            documentUid: documentDescriptor?.uid || null,
            cardId: item.slot?.blockId || null,
            segmentId: item.slot?.segmentId || null,
            segmentUid: item.slot?.segmentUid || null,
            channel: item.slot?.channel || null,
            audioVariantId: item.resolved.variant.id,
            audioVariantUid: item.resolved.variant.uid || null,
            voiceId: item.resolved.coverage.requiredVoiceId || item.resolved.variant.voiceId || null,
            representation: 'split'
          }
        });
      }
      for (const fullItem of documentFull) {
        await addFullPhysicalEntry({
          physicalByKey,
          fullItem,
          readBlob,
          reference: {
            documentId,
            documentUid: documentDescriptor?.uid || fullItem.documentUid || null,
            cardId: fullItem.blockId || null,
            cardUid: fullItem.cardUid || null,
            segmentId: null,
            channel: fullItem.channel,
            voiceId: fullItem.voiceId || null,
            representation: 'full'
          }
        });
      }

      const physicalList = [...physicalByKey.values()];
      const chunks = chunkPhysicalEntries(physicalList, maxBytes);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        if (triggeredZipCount > 0 && waveDelayMs > 0) await wait(waveDelayMs);
        const current = chunks[chunkIndex];
        const entries = current.physical.map(item => ({ filename: item.filename, blob: item.blob }));
        const manifest = buildProLingoTextAudioManifest({
          entries: current.physical.map(toManifestEntry),
          source: {
            kind: partial || !documentComplete ? 'batch-partial-rf-package' : 'batch-full-rf-package',
            documentId,
            documentUid: documentDescriptor?.uid || null,
            documentTitle: documentDescriptor?.title || null,
            logicalSlots: documentReady.length + documentFull.length,
            physicalRenders: physicalList.length
          }
        });
        entries.push({ filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
        entries.push({ filename: TEXT_AUDIO_INDEX_FILENAME, blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' }) });
        const filename = buildCanonicalTextConsolidatedZipFilename({
          documentTitle: documentDescriptor?.title || bucket.fallbackTitle || 'Text',
          voiceIds,
          partial: partial || !documentComplete,
          partNo: chunks.length > 1 ? chunkIndex + 1 : null
        });
        const result = await triggerZipDownload({ entries, filename });
        triggeredZipCount += 1;
        const stagingIds = [...new Set(current.physical.flatMap(item => [...item.stagingIds]))];
        if (stagingIds.length) await markStagingExported(stagingIds, { kind: 'zip', filename });
        exportedChunks.push({
          ...result,
          documentId,
          documentTitle: documentDescriptor?.title || documentId,
          filename,
          fileCount: current.physical.length,
          manifestEntries: manifest.entries.length,
          logicalSlots: current.physical.reduce((sum, item) => sum + item.references.length, 0),
          physicalRenders: current.physical.length,
          splitPhysical: current.physical.filter(item => item.representation === 'split').length,
          fullPhysical: current.physical.filter(item => item.representation === 'full').length,
          bytes: current.bytes
        });
      }
    }
    const physicalTotal = exportedChunks.reduce((sum, chunkItem) => sum + Number(chunkItem.physicalRenders || 0), 0);
    addLog?.('Text Audio', `${partial ? 'Partial' : 'Full'} Text ZIP: ${readySplit.length} Split + ${readyFull.length} Full → ${physicalTotal} packaged render(s) across ${documentEntries.size} Workspace(s), with manifest; no TTS.`);
    return {
      status: 'completed',
      ready: readySplit.length,
      readyFull: readyFull.length,
      total: slots.length,
      physical: physicalTotal,
      chunks: exportedChunks,
      documents: documentEntries.size
    };
  } catch (error) {
    addLog?.('Error', `Text consolidated ZIP failed: ${error?.message || error}`);
    return { status: 'error', error, ready: readySplit.length, readyFull: readyFull.length, total: slots.length, chunks: exportedChunks };
  }
};
