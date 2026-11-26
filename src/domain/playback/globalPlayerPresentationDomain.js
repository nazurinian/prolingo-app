import { capitalizeDisplayText } from '../../utils/displayTextUtils.js';

const join = (...parts) => parts.filter(Boolean).join(' · ');
const numbers = item => Number.isInteger(item?.ordinal) && item.ordinal > 0
  ? `${item.ordinal}${Number.isInteger(item.total) && item.total >= item.ordinal ? `/${item.total}` : ''}` : null;
const numbered = (label, item) => numbers(item) ? `${label}${numbers(item)}` : null;
const representation = { split: 'Split', full: 'Full' };
const sources = { local: 'Local', 'local-rf': 'Local', 'full-artifact': 'Local', generated: 'Generated', tts: 'TTS' };
const scopes = { segment: 'Segment', unit: 'Section / Turn', card: 'Card', document: 'Workspace', item: 'Item', queue: 'Queue' };
const queueLabels = { card: 'card', segment: 'sentence', item: 'item' };
const stateLabels = { idle: 'Ready', pending: 'Starting playback…', waiting: 'Waiting for audio…', paused: 'Paused', playing: 'Playing' };

const learningPart = part => {
  const expression = /^exp([1-5])_(en|idn)$/.exec(part ?? '');
  return expression ? `Expression ${expression[1]}` : ({ word: 'Word audio', word_idn: 'Word meaning', sentence: 'Example sentence', meaning: 'Sentence meaning' })[part];
};

export const resolveGlobalPlayerTransport = ({ session, paused, audible, structuredView, savedRepresentation }) => {
  const queue = session?.nowPlayingCardOrder ?? session?.orderedList;
  return {
    phase: !session ? 'idle' : session.pending ? 'pending' : paused ? 'paused' : audible ? 'playing' : 'waiting',
    navKind: session ? (session.nowPlayingCardOrder ? 'card' : session.context === 'text-structured' ? 'segment' : 'item')
      : structuredView ? (savedRepresentation === 'full' ? 'card' : 'segment') : 'item',
    canNavigate: !session || Boolean(session.restart && queue?.length > 1)
  };
};

export const describeAuthoredPlayback = ({ card, precision, unit: activeUnit, segment: activeSegment, speaker: activeSpeaker }) => {
  const precise = precision === 'segment';
  const unit = precise ? activeUnit : null;
  const segment = precise ? activeSegment : null;
  const speaker = precise ? activeSpeaker?.name : null;
  const cardPrefix = { paragraph: 'P', conversation: 'C' }[card?.kind];
  const cardCode = cardPrefix && card.kindOrdinal ? `${cardPrefix}${card.kindOrdinal}` : null;
  const unitPrefix = unit?.kind === 'turn' || card?.kind === 'conversation' ? 'T' : 'SC';
  return {
    cardCode, cardPosition: numbered('Card ', card), unitCode: numbered(unitPrefix, unit),
    shortUnitCode: numbered(unitPrefix, { ordinal: unit?.ordinal }), segmentCode: numbered('SG', segment), speaker, segment
  };
};

export const presentGlobalPlayer = ({ nowPlaying = {}, transport }) => {
  const { workspace, card, precision, item, queue } = nowPlaying;
  const { cardCode, cardPosition, unitCode, segmentCode, speaker, segment } = describeAuthoredPlayback(nowPlaying);
  const authored = join(cardPosition, cardCode, unitCode, speaker, segmentCode, precision === 'card' && 'Full');
  const table = nowPlaying.domain === 'table';
  const itemContext = item?.displayNumber != null ? `${table ? 'Word' : 'Item'} ${item.displayNumber}` : null;
  const channel = { text: 'EN', meaning: 'ID' }[nowPlaying.channel];
  const actual = representation[nowPlaying.actualRepresentation];
  const source = sources[nowPlaying.source] ?? nowPlaying.source;
  const scope = nowPlaying.scope === 'from-here' ? `From here · Through ${scopes[nowPlaying.boundary] ?? 'unknown boundary'}` : scopes[nowPlaying.scope];
  const saved = representation[nowPlaying.savedRepresentation];
  const requested = representation[nowPlaying.requestedRepresentation];
  const command = representation[nowPlaying.commandRepresentation];
  const variation = nowPlaying.representationFallback ? 'Runtime Full → Split fallback'
    : (requested === 'Full' || saved === 'Full') && command === 'Split' ? 'Temporary Split' : null;
  const queueSummary = numbered(`${queueLabels[queue?.kind] ?? 'item'} `, queue);
  const details = [
    ['Workspace', workspace?.title], ['Card', card?.title], ['Authored position', authored], ['Speaker', speaker],
    ['Segment', nowPlaying.channel === 'meaning' ? segment?.meaning : nowPlaying.channel === 'text' ? segment?.text : null],
    ['Channel', channel], ['Scope', scope], ['Source', source], ['Provider', nowPlaying.provider], ['Voice', nowPlaying.voice],
    ['Rate', nowPlaying.rate > 0 && `${nowPlaying.rate}×`], ['Queue', queueSummary],
    ['Representation', join(saved && `Saved ${saved}`, requested && `Requested ${requested}`, command && `Command ${command}`, actual && `Actual ${actual}`, variation)]
  ].filter(([, value]) => value);
  const state = stateLabels[transport.phase];
  return {
    title: workspace?.title ?? (item?.title ? (table ? capitalizeDisplayText(item.title) : item.title) : null),
    context: authored || join(itemContext, table && learningPart(item?.part)),
    status: join(state, channel, actual, source, variation),
    compactStatus: join(state, channel, actual, source),
    details,
    timeline: nowPlaying.timeline,
    navLabel: queueLabels[transport.navKind],
    canNavigate: transport.canNavigate,
    phase: transport.phase,
    playLabel: { pending: 'Starting playback', paused: 'Resume playback', playing: 'Pause playback', waiting: 'Pause playback' }[transport.phase] ?? 'Start playback'
  };
};
