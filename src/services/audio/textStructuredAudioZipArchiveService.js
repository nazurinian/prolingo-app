import { parseTextStructuredGeneratedFilename } from '../../domain/text/textStructuredAudioGenerationDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../../domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { TEXT_AUDIO_MANIFEST_FILENAME, parseProLingoTextAudioManifestJson } from '../../domain/text/textAudioManifestDomain.js';
import { parseCanonicalTextFullArtifactFilename } from '../../domain/text/textFilenameDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullRepresentation
} from '../../domain/text/textStructuredSplitFullDomain.js';
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

const readZipEntryBlobFromFile = async ({ file, entry, mimeType = null }) => {
  if (!file || !entry) throw new Error('Text ZIP entry is missing its archive reference.');
  if ((entry.flags & 0x0001) !== 0) throw new Error('Encrypted ZIP entry is not supported.');
  const headerBytes = await readBlobBytes(file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30));
  if (headerBytes.length < 30) throw new Error('ZIP local header is truncated.');
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  if (view.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error('ZIP local header signature is invalid.');
  const filenameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > file.size) throw new Error('ZIP entry is out of bounds.');
  const compressed = file.slice(dataStart, dataEnd);
  const mime = mimeType || mimeFromFilename(entry.filename);
  if (entry.compressionMethod === 0) return compressed.slice(0, compressed.size, mime);
  if (entry.compressionMethod === 8) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read deflated Text ZIP entries directly.');
    const stream = compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const blob = await new Response(stream).blob();
    return blob.slice(0, blob.size, mime);
  }
  throw new Error(`ZIP compression method ${entry.compressionMethod} is not supported.`);
};

const archiveIdFor = (file, index) => [clean(file?.name) || `text-audio-${index + 1}.zip`, Number(file?.size || 0), Number(file?.lastModified || 0)].join(':');

export const scanTextStructuredAudioZipFiles = async ({
  files,
  audioVariants = [],
  segments = [],
  requirements = [],
  blocks = [],
  documents = []
} = {}) => {
  const selected = [...(files || [])].filter(file => /\.zip$/i.test(file?.name || '') || file?.type === 'application/zip' || file?.type === 'application/x-zip-compressed');
  const index = buildTextStructuredExternalAudioIdentityIndex({ audioVariants, segments, requirements });
  const matches = [];
  const fullMatches = [];
  const orphans = [];
  const legacy = [];
  const archives = [];
  let unsupportedCount = 0;

  const segmentsByBlock = new Map();
  (segments || []).forEach(segment => {
    const blockId = String(segment?.blockId || '').toUpperCase();
    if (!blockId) return;
    const list = segmentsByBlock.get(blockId) || [];
    list.push(segment);
    segmentsByBlock.set(blockId, list);
  });
  const documentsById = new Map((documents || []).map(document => [String(document?.id || '').toUpperCase(), document]));
  const blockTrees = (blocks || []).map(block => ({
    ...block,
    segments: [...(segmentsByBlock.get(String(block?.id || '').toUpperCase()) || [])].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
  }));

  const resolveSplitManifestRequirements = ({ manifestEntry, renderFingerprint }) => {
    const descriptor = manifestEntry?.render && typeof manifestEntry.render === 'object' ? manifestEntry.render : null;
    const fingerprint = String(renderFingerprint || manifestEntry?.rf || manifestEntry?.identity || '').toLowerCase();
    if (!descriptor || !fingerprint.startsWith('rf-sha256-') || !descriptor.voiceId || !descriptor.contentFingerprint) return [];
    const channel = String(descriptor.channel || '').toLowerCase() === 'meaning' ? 'meaning' : 'text';
    const results = [];
    for (const segment of (segments || [])) {
      const content = channel === 'meaning' ? clean(segment?.meaning) : clean(segment?.text);
      if (!content) continue;
      try {
        const expected = buildTextStructuredAudioRenderFingerprint({
          channel,
          content,
          language: descriptor.language,
          engine: descriptor.engine,
          voiceId: descriptor.voiceId,
          rate: descriptor.rate,
          pitch: descriptor.pitch,
          rendererVersion: descriptor.rendererVersion,
          codecProfile: descriptor.codecProfile
        });
        if (expected.renderFingerprint !== fingerprint || expected.descriptor.contentFingerprint !== descriptor.contentFingerprint) continue;
        results.push({
          documentId: segment?.documentId || null,
          blockId: segment?.blockId || null,
          segmentId: segment?.id,
          channel,
          content,
          language: expected.descriptor.language,
          engine: expected.descriptor.engine,
          voiceId: expected.descriptor.voiceId,
          rate: expected.descriptor.rate,
          pitch: expected.descriptor.pitch,
          renderFingerprint: expected.renderFingerprint,
          contentFingerprintV2: expected.contentFingerprintV2,
          renderDescriptor: expected.descriptor,
          portableZipDerived: true
        });
      } catch {
        // Invalid descriptor or Segment content is not a match.
      }
    }
    return results;
  };

  const resolveFullMatches = ({ manifestEntry, parsed, common }) => {
    const fingerprint = String(manifestEntry?.fullArtifactFingerprint || manifestEntry?.identity || parsed?.fullArtifactFingerprint || '').toLowerCase();
    const descriptor = manifestEntry?.render && typeof manifestEntry.render === 'object' ? manifestEntry.render : null;
    if (!fingerprint.startsWith('full-sha256-') || !descriptor) return { matches: [], reason: 'full-metadata-required' };
    // Manifest references are explanatory/logical provenance, not an exclusive
    // binding key. Full physical identity is content/profile-addressed, so the
    // same portable Full Artifact may fan out to every current Card whose
    // derived Full content produces the exact fingerprint (same principle as
    // Split RF sharing across identical Segments).
    const candidates = blockTrees;
    const resolved = [];
    for (const block of candidates) {
      const representation = buildTextStructuredFullRepresentation({ block, channel: descriptor.channel });
      if (!representation.content || representation.contentFingerprint !== descriptor.contentFingerprint) continue;
      try {
        const artifact = buildTextStructuredFullArtifactRecord({
          block,
          channel: descriptor.channel,
          language: descriptor.language,
          engine: descriptor.engine,
          voiceId: descriptor.voiceId,
          rate: descriptor.rate,
          pitch: descriptor.pitch,
          rendererVersion: descriptor.rendererVersion,
          codecProfile: descriptor.codecProfile,
          derivationVersion: descriptor.derivationVersion,
          filename: common.filename,
          mimeType: common.mimeType,
          source: 'zip',
          metadata: { importedFromPortableZip: true, archiveId: common.archiveId }
        });
        if (artifact.fullArtifactFingerprint !== fingerprint) continue;
        const document = documentsById.get(String(block?.documentId || '').toUpperCase()) || null;
        resolved.push({
          ...common,
          representation: 'full',
          fullArtifactFingerprint: fingerprint,
          block,
          document,
          artifact,
          manifestEntry
        });
      } catch {
        // Ignore invalid candidate; another block may still match exactly.
      }
    }
    return { matches: resolved, reason: resolved.length ? null : 'full-no-current-content-match' };
  };

  for (let archiveIndex = 0; archiveIndex < selected.length; archiveIndex += 1) {
    const file = selected[archiveIndex];
    const archiveId = archiveIdFor(file, archiveIndex);
    const entries = await parseTextStructuredAudioZipCentralDirectory(file);
    let manifest = null;
    let manifestError = null;
    const manifestZipEntry = entries.find(entry => basename(entry.filename).toLowerCase() === TEXT_AUDIO_MANIFEST_FILENAME.toLowerCase()) || null;
    if (manifestZipEntry && (manifestZipEntry.flags & 0x0001) === 0 && [0, 8].includes(manifestZipEntry.compressionMethod)) {
      try {
        const manifestBlob = await readZipEntryBlobFromFile({ file, entry: manifestZipEntry, mimeType: 'application/json' });
        manifest = parseProLingoTextAudioManifestJson(await manifestBlob.text());
      } catch (error) { manifestError = error?.message || String(error); }
    }
    const manifestByFilename = new Map((manifest?.entries || []).flatMap(entry => [[String(entry.filename || '').toLowerCase(), entry], [basename(entry.filename).toLowerCase(), entry]]));
    let matchedCount = 0;
    let splitMatchedCount = 0;
    let fullMatchedCount = 0;
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
      const manifestEntry = manifestByFilename.get(String(entry.filename || '').toLowerCase()) || manifestByFilename.get(filename.toLowerCase()) || null;
      const fullParsed = manifestEntry?.representation === 'full'
        ? { representation: 'full', fullArtifactFingerprint: manifestEntry.fullArtifactFingerprint || manifestEntry.identity, manifestBacked: true }
        : parseCanonicalTextFullArtifactFilename(filename);
      const common = {
        archiveId,
        archiveName: file.name,
        archiveFile: file,
        entryId: `${archiveId}:${entry.localHeaderOffset}:${entryIndex}`,
        entry,
        filename,
        manifestBacked: Boolean(manifestEntry),
        mimeType: mimeFromFilename(filename)
      };

      if (manifestEntry?.size && Number(entry.uncompressedSize || 0) !== Number(manifestEntry.size)) {
        orphans.push({ ...common, parsed: fullParsed, reason: 'manifest-size-mismatch', identity: manifestEntry.identity || manifestEntry.rf || manifestEntry.fullArtifactFingerprint || null });
        orphanCount += 1;
        return;
      }

      if (fullParsed) {
        const resolvedFull = resolveFullMatches({ manifestEntry, parsed: fullParsed, common });
        if (!resolvedFull.matches.length) {
          orphans.push({ ...common, parsed: fullParsed, reason: resolvedFull.reason, fullArtifactFingerprint: fullParsed.fullArtifactFingerprint || manifestEntry?.fullArtifactFingerprint || null });
          orphanCount += 1;
          return;
        }
        fullMatches.push(...resolvedFull.matches);
        matchedCount += resolvedFull.matches.length;
        fullMatchedCount += resolvedFull.matches.length;
        return;
      }

      const parsed = manifestEntry
        ? { version: 2, renderFingerprint: manifestEntry.rf || manifestEntry.identity, extension: filename.split('.').pop()?.toLowerCase() || null, manifestBacked: true }
        : parseTextStructuredGeneratedFilename(filename);
      if (!parsed) {
        const legacyParsed = parseTextStructuredLegacyAudioFilename(filename);
        if (legacyParsed) {
          legacy.push({ ...common, parsed: legacyParsed, reason: 'legacy-unresolved' });
          legacyCount += 1;
        }
        return;
      }
      const resolved = resolveTextStructuredExternalAudioVariant({ filename, parsed, index });
      const resolvedVariants = Array.isArray(resolved.variants) && resolved.variants.length ? resolved.variants : resolved.variant ? [resolved.variant] : [];
      const dynamicRequirements = manifestEntry
        ? resolveSplitManifestRequirements({ manifestEntry, renderFingerprint: parsed?.renderFingerprint || manifestEntry?.rf || manifestEntry?.identity })
        : [];
      const requirementMap = new Map();
      [...(Array.isArray(resolved.requirements) ? resolved.requirements : []), ...dynamicRequirements].forEach(requirement => {
        const key = `${String(requirement?.segmentId || '').toUpperCase()}|${String(requirement?.channel || '').toLowerCase()}|${String(requirement?.renderFingerprint || '').toLowerCase()}`;
        if (!key.startsWith('||')) requirementMap.set(key, requirement);
      });
      // Existing exact-RF variants already represent their own logical slots; do
      // not duplicate them as requirement-only matches. Portable ZIP descriptor
      // requirements intentionally ignore the current download-voice preference,
      // allowing Libby.zip then Maisie.zip to merge into the same Segment library.
      const resolvedRequirements = [...requirementMap.values()].filter(requirement => !resolvedVariants.some(variant =>
        String(variant?.segmentId || '').toUpperCase() === String(requirement?.segmentId || '').toUpperCase()
        && String(variant?.channel || '').toLowerCase() === String(requirement?.channel || '').toLowerCase()
        && String(variant?.metadata?.audioRenderFingerprintV1 || '').toLowerCase() === String(requirement?.renderFingerprint || '').toLowerCase()
      ));
      const accepted = ['matched', 'matched-rf', 'matched-requirement'].includes(resolved.status) || resolvedRequirements.length > 0;
      if (!accepted || (!resolvedVariants.length && !resolvedRequirements.length)) {
        orphans.push({ ...common, parsed, reason: manifestEntry ? 'unmatched-current-content' : resolved.status, renderFingerprint: parsed?.renderFingerprint || null });
        orphanCount += 1;
        return;
      }
      if (resolved.aliasMatched) aliasMatchedCount += 1;
      const splitCommon = { ...common, parsed, representation: 'split', aliasMatched: resolved.aliasMatched, rfMatched: Boolean(resolved.rfMatched || resolvedRequirements.length), renderFingerprint: parsed?.renderFingerprint || manifestEntry?.rf || manifestEntry?.identity || null };
      resolvedVariants.forEach(variant => matches.push({ ...splitCommon, variant, requirement: null, renderFingerprint: splitCommon.renderFingerprint || variant?.metadata?.audioRenderFingerprintV1 || null }));
      resolvedRequirements.forEach(requirement => matches.push({ ...splitCommon, variant: null, requirement, renderFingerprint: splitCommon.renderFingerprint || requirement.renderFingerprint }));
      const logicalCount = resolvedVariants.length + resolvedRequirements.length;
      matchedCount += logicalCount;
      splitMatchedCount += logicalCount;
    });

    archives.push({
      id: archiveId,
      name: file.name,
      size: file.size,
      archiveFile: file,
      entryCount: entries.length,
      audioFileCount,
      matchedCount,
      splitMatchedCount,
      fullMatchedCount,
      orphanCount,
      legacyCount,
      aliasMatchedCount,
      unsupportedCount: unsupported,
      manifestPresent: Boolean(manifest),
      manifestVersion: manifest?.packageVersion || null,
      manifestError
    });
  }

  return {
    archives,
    matches,
    fullMatches,
    orphans,
    legacy,
    archiveCount: archives.length,
    matchedCount: matches.length + fullMatches.length,
    splitMatchedCount: matches.length,
    fullMatchedCount: fullMatches.length,
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
  const entry = runtime?.zipEntry || runtime?.entry;
  if (!file || !entry) throw new Error('Text ZIP audio entry is missing its archive reference.');
  return readZipEntryBlobFromFile({ file, entry, mimeType: runtime?.mimeType || mimeFromFilename(runtime?.filename || entry.filename) });
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
