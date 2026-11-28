import { bookHeadingBoundarySteps } from './bookQaHeadingAudioDomain.js';
import { resolveStructuredTextPlaybackOrder, resolveStructuredTextPlaybackScopeList } from './textStructuredPlaybackDomain.js';
import {
  resolveStructuredTextPlaybackChannelOrder, resolveStructuredTextPlaybackChannelSteps,
  resolveTextStructuredManualPlaybackProfile
} from './textStructuredPlaybackPreferenceDomain.js';

export const BOOK_TIMING_DEFAULTS = Object.freeze({
  channelDelayMs: 0, segmentDelayMs: 0, unitDelayMs: 200, cardDelayMs: 350,
  mainTitleDelayMs: 750, headingDelayMs: 400, repeatDelayMs: 500
});
const boundaries = ['unit', 'card', 'document'];
const sequences = new Set(['text-only', 'meaning-only', 'text-meaning', 'meaning-text']);
const repeatModes = new Set(['once', 'twice', 'custom', 'loop']);
const count = value => Number.isFinite(Number(value)) ? Math.max(1, Math.min(20, Math.round(Number(value)))) : 3;
const normalizeProfile = (value, fallback = 'inherit-global') => ({
  sequence: sequences.has(value?.sequence) ? value.sequence : fallback,
  repeat: repeatModes.has(value?.repeat) ? value.repeat : 'once',
  count: count(value?.count ?? 3)
});

export const normalizeBookTiming = candidate => Object.fromEntries(Object.entries(BOOK_TIMING_DEFAULTS).map(([key, defaultValue]) => {
  const value = candidate?.[key];
  return [key, value != null && value !== '' && Number.isFinite(Number(value))
    ? Math.min(5000, Math.max(0, Math.round(Number(value) / 50) * 50)) : defaultValue];
}));

export const normalizeBookInteraction = value => ({
  tap: value?.tap !== false,
  continueFromHere: value?.continueFromHere === true,
  follow: value?.follow !== false,
  boundary: boundaries.includes(value?.boundary) ? value.boundary : 'document',
  unit: normalizeProfile(value?.unit),
  from: normalizeProfile(value?.from),
  globalCustom: value?.globalCustom === true,
  globalCount: count(value?.globalCount ?? 3)
});

export const resolveBookTextClick = ({ tap, continueFromHere }) => !tap ? 'select' : continueFromHere ? 'tap-from' : 'channel';

const resolvePolicy = (command, preferences, interaction) => {
  const global = preferences.playbackChannelMode || 'text-only';
  const manual = kind => {
    const profile = resolveTextStructuredManualPlaybackProfile(preferences, kind);
    return { sequence: profile.playbackChannelMode, repeat: profile.repeatMode, count: profile.repeatCount };
  };
  const profiles = {
    document: { sequence: global, repeat: interaction.globalCustom ? 'custom' : preferences.repeatMode, count: interaction.globalCount },
    segment: manual('segment'), card: manual('card'), unit: interaction.unit, 'from-here': interaction.from
  };
  const profile = profiles[command.scope];
  if (!profile) return null;
  const oneShot = command.channel !== undefined || command.atomicOnly;
  const override = command.channel === 'text' ? 'text-only' : command.channel === 'meaning' ? 'meaning-only' : command.cardChannel;
  return {
    sequence: command.atomicOnly && sequences.has(command.playbackChannelMode) ? command.playbackChannelMode
      : sequences.has(override) ? override : (profile.sequence === 'inherit-global' ? global : profile.sequence),
    repeat: oneShot ? 'once' : profile.repeat || 'once', count: profile.count,
    order: !oneShot && command.scope === 'document' && preferences.playbackOrderMode === 'shuffle' ? 'shuffle' : 'sequential',
    firstSequence: command.tapFrom ? manual('segment').sequence : null
  };
};

export const resolveBookPlaybackIntent = ({ documentTree, preferences, interaction: settings, command, random }) => {
  const interaction = normalizeBookInteraction(settings);
  const { scope, atomicOnly = false } = command;
  if (!documentTree?.uid || (command.workspaceId != null && command.workspaceId !== documentTree.id)
    || (command.workspaceUid != null && command.workspaceUid !== documentTree.uid)
    || (command.channel !== undefined && (scope !== 'segment' || !['text', 'meaning'].includes(command.channel)))
    || (atomicOnly && !['card', 'document'].includes(scope))) return null;
  const policy = resolvePolicy(command, preferences, interaction);
  if (!policy) return null;
  const target = {
    scope, boundary: scope === 'from-here' ? command.boundary ?? interaction.boundary : null,
    blockId: command.blockId ?? null, unitId: command.unitId ?? null, virtualUnit: command.virtualUnit === true,
    segmentId: command.startSegmentId ?? null, channel: command.channel ?? null, cardChannel: command.cardChannel ?? null
  };
  const resolved = resolveStructuredTextPlaybackScopeList({
    documentTree, workspaceId: command.workspaceId, workspaceUid: command.workspaceUid, scope,
    boundary: target.boundary, startSegmentId: target.segmentId, blockId: target.blockId,
    unitId: target.unitId, virtualUnit: target.virtualUnit, allowEmpty: scope === 'document' || scope === 'card'
  });
  if (resolved.startIndex < 0 && !resolved.emptyScope) return null;
  const channels = resolveStructuredTextPlaybackChannelOrder(policy.sequence);
  const entries = [];
  const headings = (block, explicit = false) => bookHeadingBoundarySteps(documentTree, block, channels, { explicit })
    .forEach(heading => entries.push({ kind: 'heading', cardId: heading.blockId, channel: heading.channel, heading }));
  const requestedRepresentation = preferences.playbackRepresentationMode === 'full' ? 'full' : 'split';
  const skipStartCard = scope === 'from-here' ? resolved.playbackList[0]?.blockId : null;
  const byCard = new Map(documentTree.blocks.map(block => [block.id, []]));
  for (const item of resolved.playbackList) byCard.get(item.blockId)?.push(item);
  const authoredCards = documentTree.blocks.map(block => block.id);
  const cardOrder = scope === 'document'
    ? resolveStructuredTextPlaybackOrder({ list: authoredCards.map(id => ({ id, blockId: id })), orderMode: policy.order, random }).map(card => card.id)
    : scope === 'from-here' && target.boundary === 'document' ? authoredCards.slice(authoredCards.indexOf(skipStartCard))
      : scope === 'card' ? [target.blockId] : [...new Set(resolved.playbackList.map(item => item.blockId))];
  const ordered = cardOrder.flatMap(cardId => byCard.get(cardId) ?? []);
  if (scope === 'document') headings(null, atomicOnly);
  if (atomicOnly && scope === 'card') headings(documentTree.blocks.find(block => block.id === target.blockId), true);
  if (!atomicOnly) {
    for (const cardId of cardOrder) {
      const block = documentTree.blocks.find(row => row.id === cardId);
      const items = byCard.get(cardId);
      if (scope === 'document' || scope === 'card' || (scope === 'from-here' && cardId !== skipStartCard)) headings(block);
      const full = requestedRepresentation === 'full' && items.length
        && ['document', 'card', 'from-here'].includes(scope)
        && items.length === resolved.fullList.filter(item => item.blockId === cardId).length
        && !(scope === 'from-here' && (target.boundary === 'unit' || (cardId === skipStartCard && policy.firstSequence)));
      if (full) {
        for (const channel of channels) {
          if (items.some(item => String(item[channel] ?? '').trim())) entries.push({ kind: 'full', cardId, channel, items, block });
        }
      } else {
        for (const item of items) {
          const sequence = item.id === target.segmentId && policy.firstSequence ? policy.firstSequence : policy.sequence;
          for (const { content, channel } of resolveStructuredTextPlaybackChannelSteps(item, sequence)) {
            entries.push({ kind: 'split', cardId, channel, item, content });
          }
        }
      }
    }
  }
  if (!entries.length) return null;
  const repeatLimit = policy.repeat === 'loop' ? Infinity : policy.repeat === 'custom' ? policy.count : policy.repeat === 'twice' ? 2 : 1;
  return Object.freeze({
    entries: Object.freeze(entries.map(entry => Object.freeze(entry))),
    ordered: Object.freeze(ordered), cardOrder: Object.freeze(cardOrder),
    scope: atomicOnly ? 'heading' : scope, target: atomicOnly ? null : Object.freeze(target), policy: Object.freeze(policy), repeatLimit,
    requestedRepresentation, timing: Object.freeze(normalizeBookTiming(preferences)), workspaceId: documentTree.id, workspaceUid: documentTree.uid
  });
};

export const bookStepIdentity = step => step.kind === 'heading'
  ? `heading:${step.heading.slot}:${step.cardId ?? ''}`
  : step.kind === 'full' ? `full:${step.cardId}` : `split:${step.item.id}`;

export const resolveBookStepDelay = (previous, next, timing, repeat = false) => {
  if (!previous || !next) return 0;
  if (repeat) return timing.repeatDelayMs;
  if (bookStepIdentity(previous) === bookStepIdentity(next)) return timing.channelDelayMs;
  if (previous.kind === 'heading') return previous.heading.slot === 'mainTitle' ? timing.mainTitleDelayMs : timing.headingDelayMs;
  if (previous.cardId !== next.cardId) return timing.cardDelayMs;
  if (previous.item?.unitId !== next.item?.unitId) return timing.unitDelayMs;
  return timing.segmentDelayMs;
};

// Content revision deliberately ignores Collection position and byte-availability
// churn. Playback rechecks the live proof independently before each local start.
export const getBookContentStamp = (snapshot, workspaceId) => {
  const doc = snapshot?.documents.find(row => row.id === workspaceId);
  if (!doc) return null;
  const select = (store, fields) => (snapshot[store] ?? []).filter(row => row.documentId === workspaceId)
    .map(row => fields.map(field => row[field]));
  return JSON.stringify([
    doc.uid, doc.title, doc.textLanguage, doc.meaningLanguage, doc.metadata?.bookMainTitleV1, doc.metadata?.bookHeadingReadV1,
    select('blocks', ['id', 'uid', 'order', 'blockType', 'title']),
    snapshot.blocks.filter(row => row.documentId === workspaceId).map(row => row.metadata?.bookHeadingV1 ?? null),
    select('contentUnits', ['id', 'uid', 'blockId', 'order', 'speakerId', 'speaker']),
    select('segments', ['id', 'uid', 'blockId', 'unitId', 'order', 'text', 'meaning', 'joinAfter'])
  ]);
};
