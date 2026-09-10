import { parseTextStructuredGeneratedFilename } from '../../domain/text/textStructuredAudioGenerationDomain.js';
import {
  buildTextStructuredExternalAudioIdentityIndex,
  parseTextStructuredLegacyAudioFilename,
  resolveTextStructuredExternalAudioVariant
} from './textStructuredAudioExternalIdentityService.js';

const decoder = new TextDecoder('utf-8');
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_16 = 0xffff;
const ZIP64_32 = 0xffffffff;
const MAX_EOCD_SEARCH = 22 + 0xffff;
const ZIP_OBJECT_URL_CACHE_LIMIT = 18;

const clean = value => String(value ?? '').trim();
const basename = value => String(value || '').split('/').filter(Boolean).pop() || '';
const isAudioFilename = value => /\.(wav|mp3|ogg|webm)$/i.test(String(value || ''));
const readBlobBytes = async blob => new Uint8Array(await blob.arrayBuffer());

const mimeFromFilename = filename => {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
};

const findEocd = bytes => {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (offset + 22 > bytes.length) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    if (view.getUint32(0, true) === EOCD_SIGNATURE) return { offset, view };
  }
  return null;
};

export const parseTextStructuredAudioZipCentralDirectory = async file => {
  if (!file || typeof file.slice !== 'function') throw new Error('ZIP file is invalid.');
  const tailStart = Math.max(0, file.size - MAX_EOCD_SEARCH);
  const tailBytes = await readBlobBytes(file.slice(tailStart, file.size));
  const eocd = findEocd(tailBytes);
  if (!eocd) throw new Error(`${file.name || 'ZIP'}: end-of-central-directory not found.`);

  const totalEntries = eocd.view.getUint16(10, true);
  const centralSize = eocd.view.getUint32(12, true);
  const centralOffset = eocd.view.getUint32(16, true);
  if (totalEntries === ZIP64_16 || centralSize === ZIP64_32 || centralOffset === ZIP64_32) {
    throw new Error(`${file.name || 'ZIP'}: ZIP64 is not supported in the Text archive reader yet.`);
  }
  if (centralOffset + centralSize > file.size) throw new Error(`${file.name || 'ZIP'}: central directory is out of bounds.`);

  const bytes = await readBlobBytes(file.slice(centralOffset, centralOffset + centralSize));
  const entries = [];
  let offset = 0;
  while (offset + 46 <= bytes.length && entries.length < totalEntries) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    if (view.getUint32(0, true) !== CENTRAL_SIGNATURE) throw new Error(`${file.name || 'ZIP'}: invalid central-directory entry.`);
    const flags = view.getUint16(8, true);
    const compressionMethod = view.getUint16(10, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const filenameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const localHeaderOffset = view.getUint32(42, true);
    const totalLength = 46 + filenameLength + extraLength + commentLength;
    if (offset + totalLength > bytes.length) throw new Error(`${file.name || 'ZIP'}: truncated central-directory entry.`);
    const filename = decoder.decode(bytes.slice(offset + 46, offset + 46 + filenameLength));
    entries.push({ filename, flags, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += totalLength;
  }
  return entries;
};

const archiveIdFor = (file, index) => [clean(file?.name) || `text-audio-${index + 1}.zip`, Number(file?.size || 0), Number(file?.lastModified || 0)].join(':');

export const scanTextStructuredAudioZipFiles = async ({ files, audioVariants = [], segments = [] } = {}) => {
  const selected = [...(files || [])].filter(file => /\.zip$/i.test(file?.name || '') || file?.type === 'application/zip' || file?.type === 'application/x-zip-compressed');
  const index = buildTextStructuredExternalAudioIdentityIndex({ audioVariants, segments });
  const matches = [];
  const orphans = [];
  const legacy = [];
  const archives = [];
  let unsupportedCount = 0;

  for (let archiveIndex = 0; archiveIndex < selected.length; archiveIndex += 1) {
    const file = selected[archiveIndex];
    const archiveId = archiveIdFor(file, archiveIndex);
    const entries = await parseTextStructuredAudioZipCentralDirectory(file);
    let matchedCount = 0;
    let audioFileCount = 0;
    let legacyCount = 0;
    let orphanCount = 0;
    let aliasMatchedCount = 0;
    let unsupported = 0;

    entries.forEach((entry, entryIndex) => {
      if (!isAudioFilename(entry.filename)) return;
      audioFileCount += 1;
      if ((entry.flags & 0x0001) !== 0 || ![0, 8].includes(entry.compressionMethod)) {
        unsupported += 1;
        unsupportedCount += 1;
        return;
      }
      const filename = basename(entry.filename);
      const parsed = parseTextStructuredGeneratedFilename(filename);
      if (!parsed) {
        const legacyParsed = parseTextStructuredLegacyAudioFilename(filename);
        if (legacyParsed) {
          legacy.push({ archiveId, archiveName: file.name, archiveFile: file, entry, entryIndex, filename, parsed: legacyParsed, reason: 'legacy-unresolved' });
          legacyCount += 1;
        }
        return;
      }
      const resolved = resolveTextStructuredExternalAudioVariant({ filename, parsed, index });
      if (resolved.status !== 'matched' || !resolved.variant) {
        orphans.push({ archiveId, archiveName: file.name, filename, parsed, reason: resolved.status });
        orphanCount += 1;
        return;
      }
      if (resolved.aliasMatched) aliasMatchedCount += 1;
      matches.push({
        archiveId,
        archiveName: file.name,
        archiveFile: file,
        entryId: `${archiveId}:${entry.localHeaderOffset}:${entryIndex}`,
        entry,
        filename,
        parsed,
        variant: resolved.variant,
        aliasMatched: resolved.aliasMatched,
        mimeType: mimeFromFilename(filename)
      });
      matchedCount += 1;
    });

    archives.push({ id: archiveId, name: file.name, size: file.size, entryCount: entries.length, audioFileCount, matchedCount, orphanCount, legacyCount, aliasMatchedCount, unsupportedCount: unsupported });
  }

  return {
    archives,
    matches,
    orphans,
    legacy,
    archiveCount: archives.length,
    matchedCount: matches.length,
    orphanCount: orphans.length,
    legacyCount: legacy.length,
    aliasMatchedCount: matches.filter(match => match.aliasMatched).length,
    unsupportedCount
  };
};

const objectUrlCache = new Map();
const cacheKeyForRuntime = runtime => clean(runtime?.entryId) || [clean(runtime?.archiveId), Number(runtime?.zipEntry?.localHeaderOffset || 0)].join(':');
const touchCache = key => { const current = objectUrlCache.get(key); if (!current) return; objectUrlCache.delete(key); objectUrlCache.set(key, current); };
const trimCache = () => {
  while (objectUrlCache.size > ZIP_OBJECT_URL_CACHE_LIMIT) {
    const [key, value] = objectUrlCache.entries().next().value || [];
    if (!key) break;
    try { URL.revokeObjectURL(value.url); } catch {}
    objectUrlCache.delete(key);
  }
};

export const clearTextStructuredAudioZipRuntimeCache = () => {
  objectUrlCache.forEach(value => { try { URL.revokeObjectURL(value.url); } catch {} });
  objectUrlCache.clear();
};

export const readTextStructuredAudioZipRuntimeBlob = async runtime => {
  const file = runtime?.archiveFile;
  const entry = runtime?.zipEntry;
  if (!file || !entry) throw new Error('Text ZIP audio entry is missing its archive reference.');
  if ((entry.flags & 0x0001) !== 0) throw new Error('Encrypted ZIP audio is not supported.');

  const headerBytes = await readBlobBytes(file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30));
  if (headerBytes.length < 30) throw new Error('ZIP local header is truncated.');
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  if (view.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error('ZIP local header signature is invalid.');
  const filenameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > file.size) throw new Error('ZIP audio entry is out of bounds.');
  const compressed = file.slice(dataStart, dataEnd);
  const mime = runtime?.mimeType || mimeFromFilename(runtime?.filename || entry.filename);

  if (entry.compressionMethod === 0) return compressed.slice(0, compressed.size, mime);
  if (entry.compressionMethod === 8) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read deflated Text ZIP audio directly. Use a ProLingo stored ZIP or Audio Folder.');
    const stream = compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const blob = await new Response(stream).blob();
    return blob.slice(0, blob.size, mime);
  }
  throw new Error(`ZIP compression method ${entry.compressionMethod} is not supported.`);
};

export const getTextStructuredAudioZipRuntimeObjectUrl = async runtime => {
  const key = cacheKeyForRuntime(runtime);
  const cached = objectUrlCache.get(key);
  if (cached?.url) { touchCache(key); return cached.url; }
  const blob = await readTextStructuredAudioZipRuntimeBlob(runtime);
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(key, { url, createdAt: Date.now() });
  trimCache();
  return url;
};
