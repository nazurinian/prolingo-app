import {
  clearAudioStagingForMode,
  clearAudioStagingRuntimeCacheForIds,
  clearAudioStagingRuntimeCacheForMode,
  getAudioStagingBlob,
  getAudioStagingObjectUrl,
  listAudioStagingMetadata,
  markAudioStagingExported,
  putAudioStagingBlob,
  releaseAudioStagingBlobs
} from './audioStagingIndexedDbService.js';
import { triggerBrowserZipDownload } from '../audio/browserZipService.js';
import { buildCanonicalTextDocumentZipFilename } from '../../domain/text/textFilenameDomain.js';

export const TEXT_AUDIO_STAGING_MODE = 'text';
export const TEXT_AUDIO_STAGING_ZIP_MAX_BYTES = 64 * 1024 * 1024;

const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();
const segmentNo = value => {
  const match = upper(value).match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
};

export const putTextAudioStagingBlob = async ({
  audioVariantId,
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
  const record = await putAudioStagingBlob({
    mode: TEXT_AUDIO_STAGING_MODE,
    mapKey: upper(audioVariantId),
    part: clean(channel).toLowerCase() || 'text',
    engine: clean(engine).toLowerCase() || 'edge',
    voiceId: clean(voiceId) || null,
    filename: clean(filename) || null,
    mimeType: mimeType || blob?.type || null,
    blob,
    stableId: upper(segmentId),
    displayId: segmentNo(segmentId),
    bookId: upper(documentId) || null,
    metadata: {
      audioVariantId: upper(audioVariantId),
      documentId: upper(documentId) || null,
      segmentId: upper(segmentId),
      channel: clean(channel).toLowerCase() || 'text',
      ...(metadata || {})
    }
  });
  // A regeneration of the same TXTAUDIO variant overwrites the staged Blob.
  // Revoke only that Text cache entry so playback can never reuse the old Blob.
  clearAudioStagingRuntimeCacheForIds(record?.id);
  return record;
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
  for (const record of (Array.isArray(records) ? records : []).filter(record => record?.hasBlob)) {
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
