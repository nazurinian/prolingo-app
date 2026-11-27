import { BOOK_AUDIO_BINARY, readBookAudioReferences, readBookHeadingReferences, resolveBookAudioTarget, isBookBodyAudioCard, bookAudioError } from './bookQaAudioDomain.js';
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

const targetProfiles = (target, preferences) => {
  const { doc, block, segment, native, representation } = target;
  const kind = BOOK_PORTABLE_KINDS[representation];
  return channels.flatMap(channel => (kind === 'heading'
    ? [planBookAtomicGeneration(doc, block, native.slot, channel, preferences)]
    : getBookBodyGenerationRequests(doc, block, channel, { segment, full: kind === 'full', options: { preferences, globalRate: 1 } })).filter(Boolean));
};
export const currentBookPortableFingerprints = (targets, preferences) => new Map(targets.map(target =>
  [JSON.stringify(target.native), new Set(targetProfiles(target, preferences).map(entry => entry.fingerprint))]));

const targetContentFingerprint = (target, channel) => {
  const kind = BOOK_PORTABLE_KINDS[target.representation];
  if (kind === 'full') return buildTextStructuredFullRepresentation({ block: target.block, channel }).contentFingerprint;
  const content = kind === 'split' ? target.segment[channel]
    : resolveBookAtomicHeading(target.doc, target.block, target.native.slot, channel)?.content;
  return content?.trim() ? buildTextStructuredAudioContentFingerprintV2({ channel, content }) : null;
};

export const collectBookPortableReferences = (snapshot, targets, preferences = {}) => {
  const variants = new Map();
  for (const variant of snapshot.audioVariants) {
    const list = variants.get(variant.segmentId) ?? [];
    list.push(variant);
    variants.set(variant.segmentId, list);
  }
  return targets.flatMap(target => {
    const { doc, block, segment, owner, representation, order } = target;
    const kind = BOOK_PORTABLE_KINDS[representation];
    const expected = new Set(targetProfiles(target, preferences).map(entry => entry.fingerprint));
    const refs = kind === 'split'
      ? (variants.get(segment.id) ?? []).flatMap(variant => Object.entries(readBookAudioReferences(variant)))
      : kind === 'heading'
        ? channels.flatMap(channel => Object.entries(readBookHeadingReferences(owner, channel)))
        : getTextStructuredFullAudioArtifacts(block).map(artifact => [artifact.fullArtifactFingerprint, {
          descriptor: artifact.descriptor, binary: artifact.metadata?.[BOOK_AUDIO_BINARY]
        }]);
    return refs.map(([fingerprint, { descriptor, binary }]) => {
      const ref = { fingerprint, representation, workspaceUid: doc.uid, ownerUid: owner.uid, channel: descriptor?.channel ?? null, order };
      const entry = requestFor(target, fingerprint, descriptor);
      const proof = binary ? 'verified' : 'legacy-unverified';
      const state = !portablePhysicalType(fingerprint, descriptor) ? 'unsupported'
        : validates(snapshot, entry) ? 'stale' : expected.has(fingerprint) ? 'current' : 'other-profile';
      return { entry, ref, binary, proof, state };
    });
  });
};

export const resolveBookPortableReference = (snapshot, targets, ref, asset) => {
  const choices = targets.filter(target => target.representation === ref.representation);
  const exact = ref.ownerUid && choices.find(target => target.owner.uid === ref.ownerUid);
  if (exact) {
    const entry = requestFor(exact, asset.fingerprint, asset.descriptor);
    const invalid = validates(snapshot, entry);
    return invalid ? { status: invalid === 'INVALID_AUDIO_COMPOSITION' ? 'unverified-composition' : 'stale' } : { status: 'matched', entry };
  }
  const copies = ref.ownerUid ? choices.filter(target =>
    target.owner.metadata?.prolingoTextPackSource?.sourceUid === ref.ownerUid
    && (target.doc.uid === ref.workspaceUid || target.doc.metadata?.prolingoTextPackSource?.sourceUid === ref.workspaceUid)) : [];
  if (copies.length) {
    const candidates = copies.map(target => requestFor(target, asset.fingerprint, asset.descriptor));
    const checked = candidates.map(entry => ({ entry, error: validates(snapshot, entry) }));
    const matching = checked.filter(row => !row.error);
    if (matching.length === 1) return { status: 'matched', entry: matching[0].entry };
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
    if (!error) matched.push(entry);
    else if (error === 'INVALID_AUDIO_COMPOSITION') compositionUnavailable = true;
    if (matched.length > 1) return { status: 'ambiguous' };
  }
  return matched.length ? { status: 'matched', entry: matched[0] }
    : { status: compositionUnavailable ? 'unverified-composition' : 'unmatched' };
};

export const bookPortableLegacyRequirements = (snapshot, targets, preferences) => {
  const known = new Map();
  for (const { entry, state } of collectBookPortableReferences(snapshot, targets, preferences)) {
    if (['current', 'other-profile'].includes(state)) known.set(entry.fingerprint, entry.descriptor);
  }
  for (const { doc, block, segment, representation } of targets) {
    if (representation !== 'split' && representation !== 'full-paragraph') continue;
    for (const channel of channels) {
      const [entry] = getBookBodyGenerationRequests(doc, block, channel, {
        segment, full: representation === 'full-paragraph', options: { preferences, globalRate: 1 }
      });
      if (entry) known.set(entry.fingerprint, entry.descriptor);
    }
  }
  return known;
};

export const uniqueBookPortableReferences = rows => [...new Map(rows.map(row => [portableReferenceKey(row.ref), row])).values()];
