import {
  clearAudioStagingForMode,
  clearAudioStagingRuntimeCacheForIds,
  clearAudioStagingRuntimeCacheForMode,
  deleteAudioStagingRecordsByIds,
  getAudioStagingBlob,
  getAudioStagingObjectUrl,
  getAudioStagingSnapshotBySpec,
  listAudioStagingMetadata,
  markAudioStagingExported,
  putAudioStagingBlob,
  releaseAudioStagingBlobs,
  restoreAudioStagingSnapshotRecords
} from './audioStagingIndexedDbService.js';
import { triggerBrowserZipDownload } from '../audio/browserZipService.js';
import { buildCanonicalTextDocumentZipFilename } from '../../domain/text/textFilenameDomain.js';
import { buildProLingoTextAudioManifest, TEXT_AUDIO_MANIFEST_FILENAME } from '../../domain/text/textAudioManifestDomain.js';
import { buildTextAudioIndexCsv, TEXT_AUDIO_INDEX_FILENAME } from '../../domain/text/textAudioIndexDomain.js';
import { getTextStructuredFullAudioArtifacts } from '../../domain/text/textStructuredSplitFullDomain.js';

export const TEXT_AUDIO_STAGING_MODE = 'text';
export const TEXT_AUDIO_STAGING_ZIP_MAX_BYTES = 64 * 1024 * 1024;

const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();
const segmentNo = value => {
  const match = upper(value).match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
};

const buildTextSplitStagingSpec = ({
  audioVariantId = null,
  renderFingerprint = null,
  documentId = null,
  engine = 'edge',
  voiceId = null
} = {}) => ({
  mode: TEXT_AUDIO_STAGING_MODE,
  mapKey: clean(renderFingerprint).toLowerCase() || upper(audioVariantId),
  engine: clean(engine).toLowerCase() || 'edge',
  voiceId: clean(voiceId) || null,
  bookId: upper(documentId) || null
});

const buildTextFullStagingSpec = ({
  fullArtifactFingerprint,
  documentId = null,
  engine = 'edge',
  voiceId = null
} = {}) => {
  const fingerprint = clean(fullArtifactFingerprint).toLowerCase();
  if (!fingerprint.startsWith('full-sha256-')) throw new Error('Full Text Staging requires a valid Full Artifact fingerprint.');
  return {
    mode: TEXT_AUDIO_STAGING_MODE,
    mapKey: fingerprint,
    engine: clean(engine).toLowerCase() || 'edge',
    voiceId: clean(voiceId) || null,
    bookId: upper(documentId) || null
  };
};

export const getTextAudioStagingSnapshot = args => getAudioStagingSnapshotBySpec(buildTextSplitStagingSpec(args));

export const getTextFullAudioStagingSnapshot = args => getAudioStagingSnapshotBySpec(buildTextFullStagingSpec(args));

export const rollbackTextAudioStagingBatch = async ({ createdIds = [], previousSnapshots = [] } = {}) => {
  const restored = await restoreAudioStagingSnapshotRecords(previousSnapshots);
  const deleted = await deleteAudioStagingRecordsByIds(createdIds);
  return { restored, deleted };
};

export const putTextAudioStagingBlob = async ({
  audioVariantId,
  renderFingerprint = null,
  documentId = null,
  segmentId,
  channel,
  engine,
  voiceId,
  filename,
  mimeType = null,
  blob,
  metadata = null
}) => {
  const spec = buildTextSplitStagingSpec({ audioVariantId, renderFingerprint, documentId, engine, voiceId });
  const record = await putAudioStagingBlob({
    ...spec,
    part: clean(channel).toLowerCase() || 'text',
    filename: clean(filename) || null,
    mimeType: mimeType || blob?.type || null,
    blob,
    stableId: upper(segmentId),
    displayId: segmentNo(segmentId),
    metadata: {
      audioVariantId: upper(audioVariantId),
      renderFingerprint: clean(renderFingerprint).toLowerCase() || null,
      documentId: upper(documentId) || null,
      segmentId: upper(segmentId),
      channel: clean(channel).toLowerCase() || 'text',
      ...(metadata || {})
    }
  });
  // A regeneration of the same physical RF overwrites the staged Blob.
  // Revoke only that Text cache entry so playback can never reuse the old Blob.
  clearAudioStagingRuntimeCacheForIds(record?.id);
  return record;
};


export const putTextFullAudioStagingBlob = async ({
  fullArtifactFingerprint,
  documentId = null,
  blockId,
  channel,
  engine,
  voiceId,
  filename,
  mimeType = null,
  blob,
  descriptor = null,
  metadata = null
}) => {
  const spec = buildTextFullStagingSpec({ fullArtifactFingerprint, documentId, engine, voiceId });
  const record = await putAudioStagingBlob({
    ...spec,
    part: clean(channel).toLowerCase() || 'text',
    filename: clean(filename) || null,
    mimeType: mimeType || blob?.type || null,
    blob,
    stableId: upper(blockId),
    displayId: null,
    metadata: {
      representation: 'full',
      fullArtifactFingerprint: spec.mapKey,
      documentId: upper(documentId) || null,
      blockId: upper(blockId),
      channel: clean(channel).toLowerCase() || 'text',
      fullArtifactDescriptorV1: descriptor && typeof descriptor === 'object' ? { ...descriptor } : null,
      ...(metadata || {})
    }
  });
  clearAudioStagingRuntimeCacheForIds(record?.id);
  return record;
};

export const resolveTextAudioStagingPhysicalIdentity = record => {
  const full = clean(record?.metadata?.fullArtifactFingerprint || '').toLowerCase();
  if (full.startsWith('full-sha256-')) return { representation: 'full', identity: full };
  const split = clean(record?.metadata?.renderFingerprint || record?.mapKey || '').toLowerCase();
  if (split.startsWith('rf-sha256-')) return { representation: 'split', identity: split };
  return { representation: 'legacy', identity: clean(record?.mapKey || record?.id).toLowerCase() || null };
};

export const listTextAudioStagingMetadata = async ({ includeReleased = false } = {}) =>
  listAudioStagingMetadata({ mode: TEXT_AUDIO_STAGING_MODE, includeReleased });

export const getTextAudioStagingBlob = recordOrId => getAudioStagingBlob(typeof recordOrId === 'string' ? recordOrId : recordOrId?.id);
export const getTextAudioStagingObjectUrl = recordOrId => getAudioStagingObjectUrl(recordOrId);
export const clearTextAudioStagingRuntimeCache = () => clearAudioStagingRuntimeCacheForMode(TEXT_AUDIO_STAGING_MODE);

export const releaseTextAudioStaging = async ({ clearHistory = false } = {}) =>
  clearAudioStagingForMode(TEXT_AUDIO_STAGING_MODE, { clearHistory });

export const releaseTextAudioStagingRecords = async (records, reason = 'text-staging-release') =>
  releaseAudioStagingBlobs((Array.isArray(records) ? records : []).map(record => record?.id).filter(Boolean), { reason });

export const summarizeTextAudioStaging = records => {
  const active = (Array.isArray(records) ? records : []).filter(record => record?.hasBlob);
  return {
    count: active.length,
    bytes: active.reduce((sum, record) => sum + Number(record?.size || 0), 0),
    voices: active.reduce((acc, record) => {
      const voice = clean(record?.voiceId) || 'Unknown';
      acc[voice] = (acc[voice] || 0) + 1;
      return acc;
    }, {})
  };
};

const splitByBytes = (records, maxBytes = TEXT_AUDIO_STAGING_ZIP_MAX_BYTES) => {
  const chunks = [];
  let current = [];
  let bytes = 0;
  const seenPhysical = new Set();
  const uniqueRecords = (Array.isArray(records) ? records : []).filter(record => {
    if (!record?.hasBlob) return false;
    const key = resolveTextAudioStagingPhysicalIdentity(record).identity || clean(record?.id).toLowerCase();
    if (!key || seenPhysical.has(key)) return false;
    seenPhysical.add(key);
    return true;
  });
  for (const record of uniqueRecords) {
    const size = Math.max(0, Number(record?.size || 0));
    if (current.length && bytes + size > maxBytes) {
      chunks.push({ records: current, bytes });
      current = [];
      bytes = 0;
    }
    current.push(record);
    bytes += size;
  }
  if (current.length) chunks.push({ records: current, bytes });
  return chunks;
};

export const exportTextAudioStagingZipChunks = async ({
  records,
  documentTitle = 'Text',
  maxBytes = TEXT_AUDIO_STAGING_ZIP_MAX_BYTES,
  onProgress = null
} = {}) => {
  const chunks = splitByBytes(records, maxBytes);
  const results = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const entries = [];
    const exported = [];
    for (let index = 0; index < chunk.records.length; index += 1) {
      const record = chunk.records[index];
      onProgress?.({ phase: 'read', chunkIndex, chunkCount: chunks.length, index, total: chunk.records.length, record });
      const blob = await getAudioStagingBlob(record.id);
      if (!blob) continue;
      entries.push({ filename: record.filename || `${record.mapKey}.mp3`, blob });
      exported.push(record);
    }
    if (!entries.length) continue;
    const manifest = buildProLingoTextAudioManifest({
      entries: exported.map(record => {
        const physical = resolveTextAudioStagingPhysicalIdentity(record);
        if (!['split', 'full'].includes(physical.representation)) return null;
        const isFull = physical.representation === 'full';
        return {
          representation: physical.representation,
          identity: physical.identity,
          rf: isFull ? null : physical.identity,
          fullArtifactFingerprint: isFull ? physical.identity : null,
          filename: record.filename || `${record.mapKey}.mp3`,
          mimeType: record.mimeType || null,
          size: Number(record.size || 0),
          render: isFull
            ? record?.metadata?.fullArtifactDescriptorV1 || null
            : record?.metadata?.audioRenderDescriptorV1 || record?.metadata?.renderDescriptor || null,
          references: [{
            documentId: record?.metadata?.documentId || record?.bookId || null,
            blockId: isFull ? (record?.metadata?.blockId || record?.stableId || null) : null,
            segmentId: isFull ? null : (record?.metadata?.segmentId || record?.stableId || null),
            audioVariantId: isFull ? null : (record?.metadata?.audioVariantId || null),
            channel: record?.metadata?.channel || record?.part || null,
            voiceId: record?.voiceId || null,
            representation: physical.representation
          }]
        };
      }).filter(Boolean),
      source: { kind: 'text-staging-export', documentTitle }
    });
    if (manifest.entries.length) {
      entries.push({
        filename: TEXT_AUDIO_MANIFEST_FILENAME,
        blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
      });
      entries.push({
        filename: TEXT_AUDIO_INDEX_FILENAME,
        blob: new Blob([buildTextAudioIndexCsv(manifest)], { type: 'text/csv;charset=utf-8' })
      });
    }
    const voiceIds = [...new Set(exported.map(record => record.voiceId).filter(Boolean))];
    const filename = buildCanonicalTextDocumentZipFilename({
      documentTitle,
      voiceIds,
      partNo: chunks.length > 1 ? chunkIndex + 1 : null
    });
    onProgress?.({ phase: 'zip', chunkIndex, chunkCount: chunks.length, total: entries.length, filename });
    const result = await triggerBrowserZipDownload({ entries, filename });
    await markAudioStagingExported(exported.map(record => record.id), { kind: 'zip', filename });
    results.push({ ...result, records: exported, ids: exported.map(record => record.id) });
  }
  return results;
};

/** Reconcile Text Staging IndexedDB records against the active Text Library snapshot without destructive GC. */
export const reconcileTextAudioStagingRuntimeBindings = ({
  snapshot,
  activeRecords = [],
  prevRuntimeAudioUrls = {},
  prevRuntimeFullAudioUrls = {},
  resetExisting = false
} = {}) => {
  const active = (Array.isArray(activeRecords) ? activeRecords : []).filter(record => record?.hasBlob);
  const stagingRecordsMap = new Map(active.map(record => [record.id, record]));
  const stagingSummary = summarizeTextAudioStaging(active);
  const revokedUrls = new Set();

  const variants = Array.isArray(snapshot?.audioVariants) ? snapshot.audioVariants : [];
  const variantsById = new Map(variants.map(item => [upper(item?.id), item]));
  const variantsByRf = new Map();
  variants.forEach(variant => {
    const rf = clean(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
    if (!rf) return;
    const list = variantsByRf.get(rf) || [];
    list.push(variant);
    variantsByRf.set(rf, list);
  });

  const fullArtifactsByFingerprint = new Map();
  (Array.isArray(snapshot?.blocks) ? snapshot.blocks : []).forEach(block => {
    getTextStructuredFullAudioArtifacts(block).forEach(artifact => {
      const fingerprint = clean(artifact?.fullArtifactFingerprint || '').toLowerCase();
      if (!fingerprint) return;
      const list = fullArtifactsByFingerprint.get(fingerprint) || [];
      list.push({ block, artifact });
      fullArtifactsByFingerprint.set(fingerprint, list);
    });
  });

  const runtimeAudioUrls = {};
  Object.entries(prevRuntimeAudioUrls || {}).forEach(([variantId, entry]) => {
    if (!entry) return;
    const id = upper(variantId);
    const variant = variantsById.get(id);
    if (resetExisting || !variant) {
      if (entry?.url) revokedUrls.add(entry.url);
      if (resetExisting && entry?.zipFallback?.url) revokedUrls.add(entry.zipFallback.url);
      return;
    }
    if (!entry?.stagingBacked) {
      runtimeAudioUrls[id] = entry;
      return;
    }
    const variantRf = clean(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase();
    const stillValidStaging = stagingRecordsMap.has(entry.stagingId)
      && (!entry.renderFingerprint || !variantRf || clean(entry.renderFingerprint).toLowerCase() === variantRf);
    if (stillValidStaging) {
      runtimeAudioUrls[id] = entry;
      return;
    }
    if (entry?.url) revokedUrls.add(entry.url);
    if (entry?.zipFallback) runtimeAudioUrls[id] = entry.zipFallback;
  });

  active.forEach(record => {
    const physical = resolveTextAudioStagingPhysicalIdentity(record);
    if (physical.representation !== 'split') return;
    const recordRf = physical.identity;
    const rfVariants = recordRf?.startsWith('rf-sha256-') ? (variantsByRf.get(recordRf) || []) : [];
    const legacyVariantId = upper(record?.metadata?.audioVariantId || record?.mapKey || '');
    const candidates = rfVariants.length ? rfVariants : [variantsById.get(legacyVariantId)].filter(Boolean);
    candidates.forEach(variant => {
      const variantId = upper(variant?.id);
      if (!variantId) return;
      if (rfVariants.length) {
        if (clean(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase() !== recordRf) return;
      } else {
        const recordFingerprint = String(record?.metadata?.contentFingerprint || '');
        const variantFingerprint = String(variant?.metadata?.contentFingerprint || '');
        if (!recordFingerprint || !variantFingerprint || recordFingerprint !== variantFingerprint) return;
        if (clean(record?.voiceId).toLowerCase() !== clean(variant?.voiceId).toLowerCase()) return;
        if (clean(record?.engine).toLowerCase() !== clean(variant?.engine).toLowerCase()) return;
        if (clean(record?.part).toLowerCase() !== clean(variant?.channel).toLowerCase()) return;
      }
      const current = runtimeAudioUrls[variantId];
      if (current?.stagingBacked && current.stagingId === record.id) return;
      if (current?.url && current?.stagingBacked) revokedUrls.add(current.url);
      runtimeAudioUrls[variantId] = {
        ...(current?.zipBacked ? { zipFallback: current } : current?.zipFallback ? { zipFallback: current.zipFallback } : {}),
        stagingBacked: true,
        stagingId: record.id,
        renderFingerprint: recordRf?.startsWith('rf-sha256-') ? recordRf : null,
        filename: record.filename || current?.filename || null,
        mimeType: record.mimeType || current?.mimeType || null,
        representation: 'split'
      };
    });
  });

  const runtimeFullAudioUrls = {};
  Object.entries(prevRuntimeFullAudioUrls || {}).forEach(([fp, entry]) => {
    if (!entry) return;
    const fingerprint = clean(fp).toLowerCase();
    const stillExists = fullArtifactsByFingerprint.has(fingerprint);
    if (resetExisting || !stillExists) {
      if (entry?.url) revokedUrls.add(entry.url);
      return;
    }
    if (entry?.stagingBacked && !stagingRecordsMap.has(entry.stagingId)) {
      if (entry?.url) revokedUrls.add(entry.url);
      return;
    }
    runtimeFullAudioUrls[fingerprint] = entry;
  });

  active.forEach(record => {
    const physical = resolveTextAudioStagingPhysicalIdentity(record);
    if (physical.representation !== 'full') return;
    const consumers = fullArtifactsByFingerprint.get(physical.identity) || [];
    if (!consumers.length) return;
    const current = runtimeFullAudioUrls[physical.identity];
    if (current?.stagingBacked && current.stagingId === record.id) return;
    if (current?.url && current?.stagingBacked) revokedUrls.add(current.url);
    runtimeFullAudioUrls[physical.identity] = {
      stagingBacked: true,
      stagingId: record.id,
      fullArtifactFingerprint: physical.identity,
      filename: record.filename || consumers[0]?.artifact?.filename || null,
      mimeType: record.mimeType || consumers[0]?.artifact?.mimeType || null,
      representation: 'full',
      consumerBlockIds: consumers.map(item => item.block?.id).filter(Boolean)
    };
  });

  return {
    stagingRecordsMap,
    stagingSummary,
    runtimeAudioUrls,
    runtimeFullAudioUrls,
    revokedUrls: [...revokedUrls]
  };
};
