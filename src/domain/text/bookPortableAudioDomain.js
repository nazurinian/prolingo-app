import { BOOK_AUDIO_BINARY, BOOK_AUDIO_COMPOSITION, readBookAudioReferences, readBookHeadingReferences, resolveBookAudioTarget, isBookBodyAudioCard, bookAudioError } from './bookQaAudioDomain.js';
import { resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { resolveBookAtomicHeading, planBookAtomicGeneration } from './bookQaHeadingAudioDomain.js';
import { getBookBodyGenerationRequests } from './bookQaBodyAudioDomain.js';
import { buildTextStructuredFullRepresentation, getTextStructuredFullAudioArtifacts } from './textStructuredSplitFullDomain.js';
import { buildTextStructuredAudioContentFingerprintV2 } from './textStructuredAudioRenderFingerprintDomain.js';
import { BOOK_PORTABLE_KINDS, portablePhysicalType, portableReferenceKey } from './bookPortableAudioManifestDomain.js';

const channels = ['text', 'meaning'];
const ordinal = record => Math.max(0, Math.trunc(Number(record?.order) || 0));
const asScope = (snapshot, workspaceId) => {
  const documents = snapshot.documents.filter(doc => doc.editorModel === 'structured-v1'
    && ['paragraph', 'conversation', 'mixed'].includes(doc.documentType));
  if (workspaceId != null && !documents.some(doc => doc.id === workspaceId)) throw bookAudioError('INVALID_PORTABLE_SCOPE', 'The selected Book Workspace is unavailable');
  return documents.filter(doc => workspaceId == null || doc.id === workspaceId);
};

export const listBookPortableTargets = (snapshot, workspaceId) => {
  const targets = [];
  for (const record of asScope(snapshot, workspaceId)) {
    const doc = resolveTextLibraryDocumentTree(snapshot, record.id);
    if (!doc.uid) continue;
    const base = { documentId: doc.id, documentUid: doc.uid };
    const add = (representation, native, block = null, segment = null) => targets.push({
      representation, native, doc, block, segment, owner: segment ?? block ?? doc,
      order: [ordinal(doc), ordinal(block), ordinal(block?.units?.find(unit => unit.id === segment?.unitId)), ordinal(segment)]
    });
    add('main-title', { ...base, slot: 'mainTitle' });
    for (const block of doc.blocks.filter(isBookBodyAudioCard)) {
      if (!block.uid) continue;
      const card = { ...base, cardId: block.id, cardUid: block.uid };
      const paragraph = block.blockType === 'paragraph';
      add(paragraph ? 'paragraph-heading' : 'scene-heading', { ...card, slot: 'heading' }, block);
      add(paragraph ? 'full-paragraph' : 'full-conversation', card, block);
      for (const segment of block.segments) if (segment.uid) {
        add('split', { ...card, segmentId: segment.id, segmentUid: segment.uid }, block, segment);
      }
    }
  }
  return targets;
};

const requestFor = (target, fingerprint, descriptor) => ({
  kind: BOOK_PORTABLE_KINDS[target.representation], target: target.native, fingerprint, descriptor
});
const validates = (snapshot, entry) => {
  try { resolveBookAudioTarget(snapshot, entry); return null; }
  catch (error) { if (error.code) return error.code; throw error; }
};

const targetProfile = (target, channel, preferences) => {
  const { doc, block, segment, native, representation } = target;
  const kind = BOOK_PORTABLE_KINDS[representation];
  return kind === 'heading' ? planBookAtomicGeneration(doc, block, native.slot, channel, preferences)
    : getBookBodyGenerationRequests(doc, block, channel, { segment, full: kind === 'full', options: { preferences, globalRate: 1 } })[0];
};
const refFor = (target, fingerprint, channel) => ({
  fingerprint, representation: target.representation, workspaceUid: target.doc.uid,
  ownerUid: target.owner.uid, channel, order: target.order
});

// An authored channel can require audio even when the snapshot has no stored reference.
export const listBookPortableRequirements = (targets, preferences = {}) => targets.flatMap(target =>
  channels.flatMap(channel => {
    const entry = targetProfile(target, channel, preferences);
    if (entry) return [{ entry, ref: refFor(target, entry.fingerprint, channel) }];
    if (target.representation === 'full-conversation' && target.block.segments.some(segment => segment[channel]?.trim())) {
      return [{ entry: null, ref: refFor(target, null, channel), status: 'unsupported-composition' }];
    }
    return [];
  }));

export const currentBookPortableFingerprints = (targets, preferences) => new Map(targets.map(target =>
  [JSON.stringify(target.native), new Set(channels.map(channel => targetProfile(target, channel, preferences ?? {})?.fingerprint).filter(Boolean))]));

const targetContentFingerprint = (target, channel) => {
  const kind = BOOK_PORTABLE_KINDS[target.representation];
  if (kind === 'full') return buildTextStructuredFullRepresentation({ block: target.block, channel }).contentFingerprint;
  const content = kind === 'split' ? target.segment[channel]
    : resolveBookAtomicHeading(target.doc, target.block, target.native.slot, channel)?.content;
  return content?.trim() ? buildTextStructuredAudioContentFingerprintV2({ channel, content }) : null;
};

export const collectBookPortableReferences = (snapshot, targets, preferences = {}) => {
  const current = currentBookPortableFingerprints(targets, preferences);
  const variants = new Map();
  for (const variant of snapshot.audioVariants) {
    const list = variants.get(variant.segmentId) ?? [];
    list.push(variant);
    variants.set(variant.segmentId, list);
  }
  return targets.flatMap(target => {
    const { block, segment, owner, representation, native } = target;
    const kind = BOOK_PORTABLE_KINDS[representation];
    const expected = current.get(JSON.stringify(native));
    const refs = kind === 'split'
      ? (variants.get(segment.id) ?? []).flatMap(variant => Object.entries(readBookAudioReferences(variant)).map(([fingerprint, row]) =>
        [fingerprint, { ...row, channel: variant.channel }]))
      : kind === 'heading'
        ? channels.flatMap(channel => Object.entries(readBookHeadingReferences(owner, channel)))
        : getTextStructuredFullAudioArtifacts(block).map(artifact => [artifact.fullArtifactFingerprint, {
          descriptor: artifact.descriptor, binary: artifact.metadata?.[BOOK_AUDIO_BINARY],
          trustedComposition: artifact.metadata?.[BOOK_AUDIO_COMPOSITION] === true
        }]);
    return refs.map(([fingerprint, { descriptor, binary, channel, trustedComposition }]) => {
      const ref = refFor(target, fingerprint, descriptor?.channel ?? channel ?? null);
      const entry = requestFor(target, fingerprint, descriptor);
      let state = 'unsupported';
      if (portablePhysicalType(fingerprint, descriptor)) {
        const error = validates(snapshot, entry);
        state = error === 'INVALID_AUDIO_COMPOSITION' && targetContentFingerprint(target, ref.channel) === descriptor.contentFingerprint
          ? 'missing-composition-input' : error ? 'stale' : expected.has(fingerprint) ? 'current' : 'other-profile';
      }
      return { entry, ref, binary, state, trustedComposition };
    });
  });
};

export const resolveBookPortableReference = (snapshot, targets, ref, asset) => {
  // 'rf' is an internal compatibility marker for a file without logical ownership.
  const choices = targets.filter(target => ref.representation === 'rf'
    ? BOOK_PORTABLE_KINDS[target.representation] !== 'full' : target.representation === ref.representation);
  const matchedTarget = target => ({
    status: 'matched', entry: requestFor(target, asset.fingerprint, asset.descriptor), representation: target.representation
  });
  const exact = ref.ownerUid && choices.find(target => target.owner.uid === ref.ownerUid);
  if (exact) {
    const entry = requestFor(exact, asset.fingerprint, asset.descriptor);
    const invalid = validates(snapshot, entry);
    return invalid ? { status: invalid === 'INVALID_AUDIO_COMPOSITION' ? 'unverified-composition' : 'stale' } : matchedTarget(exact);
  }
  const copies = ref.ownerUid ? choices.filter(target =>
    target.owner.metadata?.prolingoTextPackSource?.sourceUid === ref.ownerUid
    && (target.doc.uid === ref.workspaceUid || target.doc.metadata?.prolingoTextPackSource?.sourceUid === ref.workspaceUid)) : [];
  if (copies.length) {
    const checked = copies.map(target => ({ target, error: validates(snapshot, requestFor(target, asset.fingerprint, asset.descriptor)) }));
    const matching = checked.filter(row => !row.error);
    if (matching.length === 1) return matchedTarget(matching[0].target);
    return { status: matching.length > 1 ? 'ambiguous'
      : checked.some(row => row.error === 'INVALID_AUDIO_COMPOSITION') ? 'unverified-composition' : 'stale' };
  }
  if (ref.workspaceUid && targets.some(target => target.doc.uid === ref.workspaceUid)) return { status: 'unmatched' };
  const matched = [];
  let compositionUnavailable = false;
  for (const target of choices) {
    if (targetContentFingerprint(target, asset.descriptor.channel) !== asset.descriptor.contentFingerprint) continue;
    const entry = requestFor(target, asset.fingerprint, asset.descriptor);
    const error = validates(snapshot, entry);
    if (!error) matched.push(target);
    else if (error === 'INVALID_AUDIO_COMPOSITION') compositionUnavailable = true;
    if (matched.length > 1) return { status: 'ambiguous' };
  }
  return matched.length ? matchedTarget(matched[0])
    : { status: compositionUnavailable ? 'unverified-composition' : 'unmatched' };
};

export const bookPortableLegacyRequirements = (snapshot, targets, preferences = {}) => {
  const known = new Map();
  for (const { entry, state } of collectBookPortableReferences(snapshot, targets, preferences)) {
    if (['current', 'other-profile'].includes(state)) known.set(entry.fingerprint, entry.descriptor);
  }
  for (const { entry, ref } of listBookPortableRequirements(targets, preferences)) {
    if (entry && ref.representation !== 'full-conversation') known.set(entry.fingerprint, entry.descriptor);
  }
  return known;
};

export const uniqueBookPortableReferences = rows => [...new Map(rows.map(row => [portableReferenceKey(row.ref), row])).values()];
