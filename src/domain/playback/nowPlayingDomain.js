import { getTextStructuredSegmentSpeakerId } from '../text/textStructuredSpeakerIdentityDomain.js';

const RUNTIME = Symbol('owned playback evidence');
const STRUCTURED = 'text-structured';
const IDLE = Object.freeze({
  owner: null, domain: null, sessionId: null, state: 'idle', precision: 'none',
  workspace: null, card: null, unit: null, segment: null, speaker: null, item: null,
  channel: null, requestedRepresentation: null, actualRepresentation: null,
  source: null, provider: null, voice: null, rate: null, scope: null, queue: null, timeline: null
});

const ownedContext = ({ playbackContextRef, playbackSessionRef, stopSignalRef }, sessionId) => {
  const context = playbackContextRef?.current;
  return sessionId != null && context?.sessionId === sessionId
    && playbackSessionRef?.current === sessionId && !stopSignalRef?.current ? context : null;
};

/**
 * Bind an existing execution call to the current owner. The evidence lives on
 * that owner's existing context. No new session, queue or playback cursor.
 * Only execution boundaries report a started source or clear it on settlement.
 */
export const bindNowPlayingRuntime = (refs, target, sessionId = refs.playbackSessionRef.current) => {
  const context = ownedContext(refs, sessionId);
  if (!context) return undefined;
  const observation = { target, runtime: null };
  context[RUNTIME] = observation;
  return runtime => {
    const current = ownedContext(refs, sessionId);
    if (current?.[RUNTIME] === observation) observation.runtime = runtime;
  };
};

const value = input => typeof input === 'string' && input.trim() ? input : null;
const indexed = (list, index) => index >= 0 ? { ordinal: index + 1, total: list.length } : {};
const identity = record => ({ id: record.id, uid: record.uid ?? null, title: value(record.title) });

const readStructuredIdentity = (tree, target) => {
  if (!tree) return {};
  const workspace = Object.freeze({ ...identity(tree), collectionId: tree.collectionId ?? null });
  const blocks = tree.blocks || [];
  const index = blocks.findIndex(card => card.id === target?.cardId);
  if (index < 0) return { workspace };
  const block = blocks[index];
  const card = Object.freeze({ ...identity(block), ...indexed(blocks, index), kind: block.blockType ?? null });
  // Full artifacts/utterances carry no sentence timing in the audited paths.
  if (target.representation === 'full') return { workspace, card, precision: 'card' };
  const segments = block.segments || [];
  const segment = segments.find(candidate => candidate.id === target.segmentId);
  if (!segment) return { workspace, card };
  const units = block.units || [];
  const unitIndex = segment.unitId ? units.findIndex(candidate => candidate.id === segment.unitId) : -1;
  const unit = units[unitIndex];
  const siblings = unit ? (unit.segments || segments.filter(candidate => candidate.unitId === unit.id)) : segments;
  const speakerId = unit?.speakerId || getTextStructuredSegmentSpeakerId(segment);
  const speakerName = value(unit?.speaker) || value(segment.speaker);
  return {
    workspace, card, precision: 'segment',
    unit: unit ? Object.freeze({ ...identity(unit), ...indexed(units, unitIndex), kind: unit.kind ?? null }) : null,
    segment: Object.freeze({
      id: segment.id, uid: segment.uid ?? null,
      ...indexed(siblings, siblings.findIndex(candidate => candidate.id === segment.id)),
      text: value(segment.text), meaning: value(segment.meaning)
    }),
    speaker: speakerId || speakerName ? Object.freeze({ id: speakerId ?? null, name: speakerName }) : null
  };
};

const readQueue = (context, target) => {
  if (Array.isArray(context.nowPlayingCardOrder)) {
    const index = context.nowPlayingCardOrder.indexOf(target.cardId);
    return index >= 0 ? Object.freeze({ kind: 'card', ...indexed(context.nowPlayingCardOrder, index) }) : null;
  }
  const list = context.orderedList;
  if (!Array.isArray(list)) return null;
  const isStructured = context.context === STRUCTURED;
  const id = isStructured ? target.segmentId : target.item?.id;
  if (id == null) return null;
  const index = Number.isInteger(target.queueIndex) ? target.queueIndex : list.findIndex(item => item.id === id);
  return list[index]?.id === id
    ? Object.freeze({ kind: isStructured ? 'segment' : 'item', ...indexed(list, index) })
    : null;
};

const tableChannel = part => {
  if (part === 'word' || part === 'sentence' || /_en$/u.test(part ?? '')) return 'text';
  if (part === 'meaning' || /_idn$/u.test(part ?? '')) return 'meaning';
  return null;
};

const readItem = (item, part, domain) => item ? Object.freeze({
  id: item.id ?? null,
  vocabId: domain === 'table' ? item.vocabId ?? null : null,
  // The authored label may be non-numeric. Never derive it from queue position.
  displayNumber: item.displayId ?? null,
  title: value(domain === 'table' ? item.word : item.text),
  part: value(part)
}) : null;

const readTimeline = media => {
  if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return null;
  const elapsed = media.currentTime;
  return Object.freeze({
    elapsedSeconds: Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= media.duration ? elapsed : null,
    durationSeconds: media.duration,
    seekable: media.seekable ? media.seekable.length > 0 : null
  });
};

/**
 * Read at consumption time. Attachment/browse state is not an input, and
 * timing is sampled from the observed media element, never a scheduled timer.
 */
export const readOwnedNowPlaying = (refs, owner, { isPlaying = false, current = true } = {}) => {
  if (!current) return IDLE;
  const sessionId = refs.playbackSessionRef.current;
  const context = ownedContext(refs, sessionId);
  const evidence = context?.[RUNTIME];
  const runtime = evidence?.runtime;
  if (!context || !runtime && (context.kind === 'independent' || !isPlaying)) return IDLE;
  const domain = context.context === STRUCTURED ? 'structured-text'
    : context.context === 'text' ? 'legacy-text'
    : ['master', 'study'].includes(context.context) ? 'table' : null;
  if (!domain) return IDLE;
  const target = runtime ? evidence.target : null;
  const structure = domain === 'structured-text' ? readStructuredIdentity(context.documentTree, target) : {};
  const item = readItem(target?.item, target?.part, domain);
  const rate = runtime?.media?.playbackRate ?? runtime?.rate;
  return Object.freeze({
    ...IDLE, owner, domain, sessionId, state: refs.pauseStateRef?.current ? 'paused' : 'playing',
    precision: item ? (domain === 'table' ? 'word' : 'item') : 'none',
    ...structure, item,
    channel: domain === 'structured-text' ? target?.channel ?? null : domain === 'table' ? tableChannel(target?.part) : null,
    requestedRepresentation: domain === 'structured-text' ? context.playbackRepresentationMode ?? null : null,
    actualRepresentation: target?.representation ?? null,
    source: runtime?.source ?? null, provider: runtime?.provider ?? null, voice: runtime?.voice ?? null,
    rate: Number.isFinite(rate) && rate > 0 ? rate : null,
    scope: context.scope ?? (context.kind === 'independent' ? 'item' : 'queue'),
    queue: target ? readQueue(context, target) : null,
    timeline: readTimeline(runtime?.media)
  });
};
