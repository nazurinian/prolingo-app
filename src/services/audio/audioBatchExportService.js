import { sanitizeFilename, triggerBrowserDownload } from '../../utils/audioUtils.js';
import { triggerBrowserZipDownload } from './browserZipService.js';
import {
  getAudioStagingBlob,
  markAudioStagingExported,
  patchAudioStagingMetadata
} from '../persistence/audioStagingIndexedDbService.js';
import {
  groupStagedAudioForZipExport,
  resolveStagedGroupRange,
  splitStagedAudioGroupByBytes
} from '../../domain/audio/audioStagingDomain.js';

export const DEFAULT_AUDIO_ZIP_MAX_BYTES = 256 * 1024 * 1024;
export const DIRECT_MP3_BATCH_LIMIT = 10;

const padRange = value => Number.isFinite(Number(value)) ? String(Number(value)).padStart(4, '0') : 'NA';
const compactVoiceFilenameLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Voice';
  const tail = raw.split('-').pop() || raw;
  return sanitizeFilename(tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw);
};

export const buildTableAudioZipFilename = ({ bookId, voiceId, part, partNo = null, records = [] }) => {
  const range = resolveStagedGroupRange(records);
  const base = [sanitizeFilename(bookId || 'TABLE'), compactVoiceFilenameLabel(voiceId), sanitizeFilename(String(part || 'audio').toUpperCase())];
  if (partNo) base.push(`PART_${String(partNo).padStart(2, '0')}`);
  if (range.start !== null && range.end !== null) base.push(`${padRange(range.start)}-${padRange(range.end)}`);
  return `${base.join('__')}.zip`;
};

export const exportTableAudioRecordZipGroups = async ({
  records,
  readBlob,
  sessionId = null,
  maxBytes = DEFAULT_AUDIO_ZIP_MAX_BYTES,
  onProgress = null,
  onChunkExported = null
}) => {
  if (typeof readBlob !== 'function') throw new Error('ZIP export requires a readBlob(record) function.');
  // The grouping domain only needs metadata + size. `hasBlob` here means the
  // logical record is currently readable from a verified local source; the
  // actual binary may live in IndexedDB, Folder, or an attached ZIP.
  const readableRecords = (Array.isArray(records) ? records : []).filter(Boolean).map(record => ({ ...record, hasBlob: true }));
  const groups = groupStagedAudioForZipExport(readableRecords);
  const results = [];
  for (const group of groups) {
    const chunks = splitStagedAudioGroupByBytes(group, maxBytes);
    for (const chunk of chunks) {
      const entries = [];
      const exportedRecords = [];
      for (let index = 0; index < chunk.records.length; index += 1) {
        const record = chunk.records[index];
        onProgress?.({ phase: 'read', group, chunk, index: index + 1, total: chunk.records.length, record });
        const blob = await readBlob(record);
        if (!blob) continue;
        entries.push({ filename: record.filename || `${record.mapKey}.mp3`, blob });
        exportedRecords.push({ ...record, size: Number(blob.size || record.size || 0) });
      }
      if (!entries.length) continue;
      const filename = buildTableAudioZipFilename({ ...chunk, records: exportedRecords });
      onProgress?.({ phase: 'zip', group, chunk, total: entries.length, filename });
      const result = await triggerBrowserZipDownload({ entries, filename });
      await onChunkExported?.({ records: exportedRecords, filename, sessionId, group, chunk, result });
      results.push({ ...result, records: exportedRecords, ids: exportedRecords.map(record => record.id).filter(Boolean), groupKey: group.key, partNo: chunk.partNo, range: resolveStagedGroupRange(exportedRecords) });
    }
  }
  return results;
};

export const exportStagedAudioZipGroups = async ({
  records,
  sessionId = null,
  maxBytes = DEFAULT_AUDIO_ZIP_MAX_BYTES,
  onProgress = null
}) => exportTableAudioRecordZipGroups({
  records,
  sessionId,
  maxBytes,
  onProgress,
  readBlob: record => getAudioStagingBlob(record.id),
  onChunkExported: async ({ records: exportedRecords, filename, chunk }) => {
    const ids = exportedRecords.map(record => record.id).filter(Boolean);
    await markAudioStagingExported(ids, { kind: 'zip', sessionId, filename });
    for (const record of exportedRecords) {
      await patchAudioStagingMetadata(record.id, { metadata: { lastZipRange: resolveStagedGroupRange(exportedRecords), lastZipPart: chunk.partNo } });
    }
  }
});

export const exportStagedAudioMp3 = async ({ record, sessionId = null }) => {
  if (!record?.id) return { status: 'missing-record' };
  const blob = await getAudioStagingBlob(record.id);
  if (!blob) return { status: 'missing-blob', record };
  const url = URL.createObjectURL(blob);
  const filename = sanitizeFilename(record.filename || `${record.mapKey}.mp3`);
  triggerBrowserDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  await markAudioStagingExported(record.id, { kind: 'mp3', sessionId, filename });
  return { status: 'download-triggered', filename, size: blob.size, id: record.id };
};

export const exportSmallStagedMp3Batch = async ({ records, sessionId = null, limit = DIRECT_MP3_BATCH_LIMIT, onProgress = null }) => {
  const selected = (Array.isArray(records) ? records : []).filter(record => record?.hasBlob);
  const waveSize = Math.max(1, Number(limit || DIRECT_MP3_BATCH_LIMIT));
  const results = [];
  for (let index = 0; index < selected.length; index += 1) {
    const wave = Math.floor(index / waveSize) + 1;
    const waves = Math.max(1, Math.ceil(selected.length / waveSize));
    onProgress?.({ index: index + 1, total: selected.length, wave, waves, waveSize, record: selected[index] });
    results.push(await exportStagedAudioMp3({ record: selected[index], sessionId }));
    const hasMore = index + 1 < selected.length;
    if (hasMore && (index + 1) % waveSize === 0) await new Promise(resolve => window.setTimeout(resolve, 650));
    else if (hasMore) await new Promise(resolve => window.setTimeout(resolve, 60));
  }
  return results;
};
