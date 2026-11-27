import { buildCanonicalSha256Fingerprint, canonicalJsonStringify } from './textCanonicalFingerprintDomain.js';
import { applyTextLibraryCommand } from './textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import { getTextStructuredAudioVariantKey } from './textStructuredAudioIdentityDomain.js';
import { buildTextStructuredAudioRenderFingerprint, TEXT_AUDIO_CODEC_PROFILE, TEXT_AUDIO_RENDERER_PROFILE_VERSION } from './textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredFullArtifactIdentity, getTextStructuredFullAudioArtifacts } from './textStructuredSplitFullDomain.js';
import { BOOK_HEADING_AUDIO_KEY } from './textBookHeadingDomain.js';
import { buildBookAtomicAudioRequest, resolveBookAtomicHeading } from './bookQaHeadingAudioDomain.js';

export const BOOK_AUDIO_REFS = 'bookAudioRenderReferencesV1';
export const BOOK_AUDIO_BINARY = 'bookAudioBinaryV1';
export const BOOK_AUDIO_COMPOSITION = 'bookAudioTrustedCompositionV1';
export const BOOK_AUDIO_MAX_ITEMS = 32;
export const BOOK_AUDIO_MAX_BYTES = 64 * 1024 * 1024;
export const isBookBodyAudioCard = block => ['paragraph', 'conversation'].includes(block?.blockType)
  && resolveTextParagraphCardRole(block) !== 'title';
const MAX_REFERENCES = 64;
const RF = /^rf-sha256-[a-f0-9]{64}$/u;
const FULL = /^full-sha256-[a-f0-9]{64}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
export const bookAudioCommitKey = id => 'bookQaAudioCommitV1:' + id;
export const isBookAudioOperationId = id => typeof id === 'string' && UUID.test(id);
export const bookAudioError = (code, message) => Object.assign(new Error(message), { code });
const fail = (code, message) => { throw bookAudioError(code, message); };
const same = (a, b) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const fields = (value, keys) => value && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).every(key => keys.includes(key));

const isBinary = value => fields(value, ['digest', 'format', 'bytes', 'sampleRate'])
  && typeof value.digest === 'string' && DIGEST.test(value.digest)
  && ['mp3', 'wav'].includes(value.format) && Number.isSafeInteger(value.bytes)
  && value.bytes > 0 && value.bytes <= BOOK_AUDIO_MAX_BYTES
  && Number.isSafeInteger(value.sampleRate) && value.sampleRate > 0;

const renderFromSegment = (document, segment, descriptor) => buildTextStructuredAudioRenderFingerprint({
  ...descriptor, content: segment[descriptor.channel],
  language: descriptor.channel === 'text' ? document.textLanguage : document.meaningLanguage
});

const validateReferences = (map, channel = null) => {
  if (!map || Object.getPrototypeOf(map) !== Object.prototype
    || Object.keys(map).length > MAX_REFERENCES || Object.keys(map).some(rf => !RF.test(rf)
      || !fields(map[rf], ['descriptor', 'binary']) || ((map[rf].binary || channel) && (!isBinary(map[rf].binary)
        || !map[rf].descriptor || buildCanonicalSha256Fingerprint(map[rf].descriptor, 'rf-sha256') !== rf))
      || (channel && (map[rf].descriptor.channel !== channel || !isEdge(map[rf].descriptor) || map[rf].binary.format !== 'mp3')))) {
    fail('INVALID_AUDIO_REFERENCES', 'Stored RF reference map is invalid');
  }
  return map;
};

export const readBookAudioReferences = variant => {
  const metadata = variant?.metadata ?? {};
  if (Object.hasOwn(metadata, BOOK_AUDIO_REFS)) return validateReferences(metadata[BOOK_AUDIO_REFS]);
  const rf = metadata.audioRenderFingerprintV1;
  return RF.test(rf) ? { [rf]: { descriptor: metadata.audioRenderDescriptorV1 ?? null, binary: null } } : {};
};

export const readBookHeadingReferences = (owner, channel) => {
  const metadata = owner?.metadata;
  if (!Object.hasOwn(metadata ?? {}, BOOK_HEADING_AUDIO_KEY)) return {};
  const channels = metadata[BOOK_HEADING_AUDIO_KEY];
  if (!fields(channels, ['text', 'meaning'])) fail('INVALID_AUDIO_REFERENCES', 'Stored Heading channels are invalid');
  return Object.hasOwn(channels, channel) ? validateReferences(channels[channel], channel) : {};
};

const isEdge = descriptor => descriptor?.engine === 'edge' && descriptor.rendererVersion === TEXT_AUDIO_RENDERER_PROFILE_VERSION
  && descriptor.codecProfile === TEXT_AUDIO_CODEC_PROFILE && typeof descriptor.voiceId === 'string'
  && descriptor.voiceId.trim() === descriptor.voiceId && descriptor.voiceId.length > 0 && descriptor.voiceId.length <= 128
  && Number.isFinite(descriptor.rate) && Number.isFinite(descriptor.pitch);

const splitIdentity = (segment, descriptor) => ({ segmentId: segment.id, channel: descriptor.channel, source: 'generated',
  engine: descriptor.engine, voiceId: descriptor.voiceId });
const variantsFor = (snapshot, segment, channel) => snapshot.audioVariants.filter(item =>
  item.segmentId === segment.id && item.channel === channel);

export const collectBookHeadingAudioReferences = snapshot =>
  [...snapshot.documents, ...snapshot.blocks].flatMap(owner =>
    ['text', 'meaning'].flatMap(channel => Object.entries(readBookHeadingReferences(owner, channel))));

export const assertBookAudioCompatibleBytes = (snapshot, fingerprint, binary) => {
  const references = RF.test(fingerprint)
    ? [...snapshot.audioVariants.map(variant => readBookAudioReferences(variant)[fingerprint]?.binary),
      ...collectBookHeadingAudioReferences(snapshot).filter(([rf]) => rf === fingerprint).map(([, ref]) => ref.binary)]
    : snapshot.blocks.flatMap(block => getTextStructuredFullAudioArtifacts(block).filter(item => item.id === fingerprint)
      .map(item => item.metadata?.[BOOK_AUDIO_BINARY]));
  if (references.some(previous => previous && !same(previous, binary))) {
    fail('AUDIO_BYTE_CONFLICT', 'A committed reference already owns different bytes for this render identity');
  }
};

// Checks the exact native owners and descriptors both before staging and inside the Text transaction.
export const resolveBookAudioTarget = (snapshot, entry) => {
  if (!entry || typeof entry !== 'object') fail('INVALID_AUDIO_REQUEST', 'Audio target must be an object');
  const { kind, target, fingerprint, descriptor } = entry;
  const atomic = kind === 'heading';
  const requiresCard = !atomic || target?.slot === 'heading';
  const ownerFields = ['documentId', 'documentUid', ...(requiresCard ? ['cardId', 'cardUid'] : []),
    ...(kind === 'split' ? ['segmentId', 'segmentUid'] : [])];
  if (!fields(entry, ['kind', 'target', 'fingerprint', 'descriptor', 'binary', 'trustedComposition'])
    || !fields(target, [...ownerFields, ...(atomic ? ['slot'] : [])])
    || ownerFields.some(key => typeof target[key] !== 'string' || !target[key].trim())
    || (atomic && !['mainTitle', 'heading'].includes(target.slot))
    || typeof fingerprint !== 'string' || !['split', 'full', 'heading'].includes(kind)
    || (kind === 'full' ? !FULL.test(fingerprint) : !RF.test(fingerprint))
    || !['text', 'meaning'].includes(descriptor?.channel)
    || (entry.binary !== undefined && !isBinary(entry.binary))) fail('INVALID_AUDIO_REQUEST', 'Invalid typed audio target or identity');
  const document = resolveTextLibraryDocumentTree(snapshot, target.documentId);
  const block = document?.blocks.find(card => card.id === target.cardId);
  if (snapshot.schemaVersion !== 2 || document?.editorModel !== 'structured-v1'
    || !['paragraph', 'conversation', 'mixed'].includes(document.documentType)
    || !document.uid || document.uid !== target.documentUid || (requiresCard && (!block?.uid || block.uid !== target.cardUid))) {
    fail('AUDIO_TARGET_CHANGED', 'Workspace or Card identity does not match the captured target');
  }
  const language = descriptor.channel === 'text' ? document.textLanguage : document.meaningLanguage;
  if (atomic) {
    if (!isEdge(descriptor)) fail('INVALID_AUDIO_PROFILE', 'Heading requires the existing Edge render profile');
    const heading = resolveBookAtomicHeading(document, block, target.slot, descriptor.channel);
    const expected = buildBookAtomicAudioRequest(document, block, target.slot, descriptor.channel, descriptor);
    if (!heading || expected?.fingerprint !== fingerprint || !same(expected.descriptor, descriptor)) {
      fail('AUDIO_CONTENT_CHANGED', 'RF does not describe the current authored Heading and channel');
    }
    return { document, block, heading, record: block ?? document, format: 'mp3', content: heading.content };
  }
  if (kind === 'split') {
    const segment = block.segments.find(item => item.id === target.segmentId);
    if (!segment?.uid || segment.uid !== target.segmentUid) fail('AUDIO_TARGET_CHANGED', 'Segment no longer belongs to the captured Card');
    if (!isEdge(descriptor)) fail('INVALID_AUDIO_PROFILE', 'Split requires the existing Edge render profile');
    const expected = renderFromSegment(document, segment, descriptor);
    if (!segment[descriptor.channel]?.trim() || expected.renderFingerprint !== fingerprint || !same(expected.descriptor, descriptor)) {
      fail('AUDIO_CONTENT_CHANGED', 'Split fingerprint does not describe this Segment and channel');
    }
    const identity = splitIdentity(segment, descriptor);
    const variant = variantsFor(snapshot, segment, descriptor.channel).find(item =>
      getTextStructuredAudioVariantKey(item) === getTextStructuredAudioVariantKey(identity));
    return { document, block, segment, variant, identity, format: 'mp3' };
  }

  const derived = descriptor.engine === 'derived';
  const dependencies = [];
  if (derived) {
    if (block.blockType !== 'conversation' || !Array.isArray(descriptor.composition)) {
      fail('INVALID_AUDIO_PROFILE', 'Derived Full requires a Conversation Card and an ordered composition');
    }
    const audible = block.segments.filter(segment => segment[descriptor.channel]?.trim());
    if (audible.length !== descriptor.composition.length || audible.some((segment, index) => {
      const input = descriptor.composition[index];
      const matched = input?.playbackRate === 1 && variantsFor(snapshot, segment, descriptor.channel).find(variant => {
        const ref = readBookAudioReferences(variant)[input?.renderFingerprint];
        return ref?.binary && ref.descriptor && renderFromSegment(document, segment, ref.descriptor).renderFingerprint === input.renderFingerprint;
      });
      if (!matched) return true;
      dependencies.push({ fingerprint: input.renderFingerprint, binary: readBookAudioReferences(matched)[input.renderFingerprint].binary });
      return false;
    })) fail('INVALID_AUDIO_COMPOSITION', 'Derived Full requires every current, verified Split reference in authored order at 1×');
  } else if (block.blockType !== 'paragraph' || !isEdge(descriptor) || descriptor.language !== language) {
    fail('INVALID_AUDIO_PROFILE', 'Rendered Full requires the existing Edge Paragraph profile');
  }
  let expected;
  try { expected = buildTextStructuredFullArtifactIdentity({ ...descriptor, block }); }
  catch { fail('INVALID_AUDIO_COMPOSITION', 'Full identity cannot be constructed for the captured Card'); }
  if (expected.fullArtifactFingerprint !== fingerprint || !same(expected.descriptor, descriptor)) {
    fail('AUDIO_CONTENT_CHANGED', 'Full fingerprint does not describe this Card and channel');
  }
  return { document, block, expected, dependencies, format: derived ? 'wav' : 'mp3' };
};

export const assertBookAudioReferenceCapacity = (snapshot, entries, { bodyOnly = false } = {}) => {
  const groups = new Map();
  for (const entry of entries) {
    const owner = resolveBookAudioTarget(snapshot, entry);
    if (bodyOnly && entry.kind !== 'heading' && !isBookBodyAudioCard(owner.block)) fail('INVALID_AUDIO_TARGET', 'Book QA generation supports Body Cards and authored Headings');
    if (entry.kind === 'full') continue;
    const key = owner.heading?.id ?? getTextStructuredAudioVariantKey(owner.identity);
    const refs = owner.heading ? readBookHeadingReferences(owner.record, entry.descriptor.channel) : readBookAudioReferences(owner.variant);
    const current = groups.get(key) || new Set(Object.keys(refs));
    current.add(entry.fingerprint);
    if (current.size > MAX_REFERENCES) fail('AUDIO_REFERENCE_LIMIT', 'RF reference limit reached; existing profiles were preserved');
    groups.set(key, current);
  }
};

export const applyBookQaAudioOperation = (snapshot, entries, now) => {
  if (!Array.isArray(entries) || !entries.length || entries.length > BOOK_AUDIO_MAX_ITEMS) fail('INVALID_AUDIO_REQUEST', 'Invalid audio operation size');
  assertBookAudioReferenceCapacity(snapshot, entries.filter(entry => entry?.kind === 'heading'));
  let next = snapshot;
  const results = [];
  for (const entry of entries) {
    const { fingerprint, descriptor, binary, kind } = entry;
    const owner = resolveBookAudioTarget(next, entry);
    if (!isBinary(binary) || binary.format !== owner.format || (descriptor.sampleRate && binary.sampleRate !== descriptor.sampleRate)) {
      fail('INVALID_AUDIO_BINARY', 'Verified bytes do not match the expected format');
    }
    assertBookAudioCompatibleBytes(next, fingerprint, binary);
    let command;
    if (kind === 'heading') {
      const { channel } = descriptor;
      const metadata = { ...owner.record.metadata };
      metadata[BOOK_HEADING_AUDIO_KEY] = { ...metadata[BOOK_HEADING_AUDIO_KEY],
        [channel]: { ...readBookHeadingReferences(owner.record, channel), [fingerprint]: { descriptor, binary } }
      };
      command = { type: owner.block ? 'block.update' : 'document.update', payload: { id: owner.record.id, metadata } };
    } else if (kind === 'split') {
      const metadata = { ...owner.variant?.metadata };
      const refs = readBookAudioReferences(owner.variant);
      if (metadata.audioRenderFingerprintV1 && !RF.test(metadata.audioRenderFingerprintV1)) {
        fail('INVALID_AUDIO_REFERENCES', 'Malformed legacy RF requires explicit repair');
      }
      const previous = refs[fingerprint];
      if (previous?.binary && !same(previous.binary, binary)) fail('AUDIO_BYTE_CONFLICT', 'Accepted reference has different bytes');
      if (!previous && Object.keys(refs).length >= MAX_REFERENCES) fail('AUDIO_REFERENCE_LIMIT', 'RF reference limit reached; existing profiles were preserved');
      for (const key of ['audioRenderFingerprintV1', 'audioRenderDescriptorV1', 'contentFingerprintV2', 'stagingId']) delete metadata[key];
      metadata[BOOK_AUDIO_REFS] = { ...refs, [fingerprint]: { descriptor, binary } };
      command = { type: 'audioVariant.upsert', payload: { ...owner.identity, language: descriptor.language, metadata } };
    } else {
      const previous = getTextStructuredFullAudioArtifacts(owner.block).find(item => item.id === fingerprint);
      if (previous?.metadata?.[BOOK_AUDIO_BINARY] && !same(previous.metadata[BOOK_AUDIO_BINARY], binary)) {
        fail('AUDIO_BYTE_CONFLICT', 'Accepted Full reference has different bytes');
      }
      command = { type: 'fullAudioArtifact.upsert', payload: { blockId: owner.block.id, artifact: {
        ...previous, id: fingerprint, fullArtifactFingerprint: fingerprint, descriptor,
        segmentCount: owner.expected.fullRepresentation.segmentCount,
        mimeType: binary.format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
        metadata: { ...previous?.metadata, [BOOK_AUDIO_BINARY]: binary,
          ...(entry.trustedComposition === true && descriptor.engine === 'derived' ? { [BOOK_AUDIO_COMPOSITION]: true } : {}) }
      } } };
    }
    const outcome = applyTextLibraryCommand(next, command, now);
    next = outcome.snapshot;
    results.push({ kind, fingerprint, id: owner.heading?.id ?? outcome.result.id });
  }
  return { snapshot: next, result: results };
};

export const readBookAudioBinding = (snapshot, entry) => {
  let owner;
  try { owner = resolveBookAudioTarget(snapshot, entry); }
  catch (error) {
    if (['AUDIO_TARGET_CHANGED', 'AUDIO_CONTENT_CHANGED', 'INVALID_AUDIO_COMPOSITION'].includes(error.code)) return { status: 'stale' };
    throw error;
  }
  if (entry.kind === 'heading') {
    const refs = readBookHeadingReferences(owner.record, entry.descriptor.channel);
    const exact = refs[entry.fingerprint];
    if (exact) return { status: 'bound', binary: exact.binary, headingId: owner.heading.id };
    return { status: Object.values(refs).some(ref => ref.descriptor.contentFingerprint === entry.descriptor.contentFingerprint)
      ? 'other-profile' : Object.keys(refs).length ? 'stale' : 'missing' };
  }
  if (entry.kind === 'full') {
    const artifacts = getTextStructuredFullAudioArtifacts(owner.block).filter(item => item.descriptor.channel === entry.descriptor.channel);
    const exact = artifacts.find(item => item.id === entry.fingerprint);
    const binary = exact?.metadata?.[BOOK_AUDIO_BINARY];
    if (binary) return isBinary(binary) ? { status: 'bound', binary, trustedComposition: exact.metadata[BOOK_AUDIO_COMPOSITION] === true } : { status: 'corrupt' };
    if (exact) return { status: 'metadata-only' };
    return { status: artifacts.some(item => item.descriptor.contentFingerprint === entry.descriptor.contentFingerprint)
      ? 'other-profile' : artifacts.length ? 'stale' : 'missing' };
  }
  const exact = readBookAudioReferences(owner.variant)[entry.fingerprint];
  if (exact?.binary) return same(exact.descriptor, entry.descriptor)
    ? { status: 'bound', binary: exact.binary, variantId: owner.variant.id } : { status: 'corrupt' };
  if (exact) return { status: 'legacy-unverified' };
  const variants = variantsFor(snapshot, owner.segment, entry.descriptor.channel);
  const refs = variants.flatMap(variant => Object.values(readBookAudioReferences(variant)));
  return { status: refs.some(ref => ref.descriptor?.contentFingerprint === entry.descriptor.contentFingerprint)
    ? 'other-profile' : refs.length ? 'stale' : variants.length ? 'legacy-unverified' : 'missing' };
};
