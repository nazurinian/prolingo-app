import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createJourneyToLondonFixture, createJourneyToLondonStressFixtures } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import {
  BOOK_TIMING_DEFAULTS, bookStepIdentity, getBookContentStamp, normalizeBookTiming,
  resolveBookPlaybackIntent, resolveBookStepDelay, resolveBookTextClick
} from '../src/domain/text/bookPlaybackDomain.js';
import {
  executeStructuredTextPlaybackSessionService, readBookTransportTarget
} from '../src/services/playback/textStructuredPlaybackSessionService.js';

const london = createJourneyToLondonFixture();
const tree = resolveTextLibraryDocumentTree(london.snapshot, london.ids.documentId);
const [p1, c1, p2, c2] = tree.blocks;
const start = p1.units[0].segments[2];
const explicit = (command, prefs = {}, interaction = {}, doc = tree, random = () => 0) =>
  resolveBookPlaybackIntent({ documentTree: doc, command, random,
    preferences: { playbackChannelMode: 'text-meaning', ...prefs }, interaction });
const ids = entries => [...new Set(entries.filter(step => step.kind === 'split').map(step => step.item.id))];
const segment = (item, channel = 'text') => ({ kind: 'split', cardId: item.blockId, item, channel });
const allSegments = block => block.units.flatMap(unit => unit.segments);

for (const [boundary, expected] of [
  ['unit', p1.units[0].segments.slice(2)],
  ['card', allSegments(p1).slice(2)],
  ['document', [...allSegments(p1).slice(2), ...allSegments(c1), ...allSegments(p2), ...allSegments(c2)]]
]) {
  const plan = explicit({ scope: 'from-here', startSegmentId: start.id, boundary },
    { playbackOrderMode: 'shuffle' }, { from: { repeat: 'custom', count: 3 } });
  assert.deepEqual(ids(plan.entries), expected.map(item => item.id));
  assert.equal(plan.repeatLimit, 3);
  assert.equal(plan.policy.order, 'sequential');
  assert.equal(plan.entries.some(step => step.kind === 'heading' && step.cardId === p1.id), false);
  assert(Object.isFrozen(plan.entries));
}
const full = explicit({ scope: 'from-here', startSegmentId: start.id }, { playbackRepresentationMode: 'full' });
assert.equal(full.requestedRepresentation, 'full');
assert.equal(full.entries[0].kind, 'split');
assert(full.entries.some(step => step.kind === 'full' && step.cardId === c1.id));
assert.equal(explicit({ scope: 'unit', blockId: p1.id, unitId: c1.units[0].id }), null);
assert.equal(explicit({ scope: 'document', workspaceUid: 'foreign' }), null);
assert.equal(explicit({ scope: 'segment', startSegmentId: start.id, channel: 'meaning' }, { repeatMode: 'loop' }).repeatLimit, 1);
const unit = explicit({ scope: 'unit', blockId: p1.id, unitId: p1.units[1].id }, {}, { unit: { sequence: 'meaning-only', repeat: 'twice' } });
assert(unit.entries.every(item => item.kind === 'split' && item.channel === 'meaning'));
assert.equal(unit.repeatLimit, 2);
const tapFrom = explicit({ scope: 'from-here', startSegmentId: start.id, tapFrom: true },
  { manualSegmentPlaybackChannelMode: 'meaning-text' }, { from: { sequence: 'text-only' } });
assert.deepEqual(tapFrom.entries.slice(0, 3).map(item => item.channel), ['meaning', 'text', 'text']);
const shuffled = explicit({ scope: 'document' }, { playbackOrderMode: 'shuffle' });
assert.deepEqual(shuffled.cardOrder, [c1.id, p2.id, c2.id, p1.id]);
for (const block of tree.blocks) assert.deepEqual(shuffled.ordered.filter(item => item.blockId === block.id).map(item => item.id),
  allSegments(block).map(item => item.id));
assert.notDeepEqual(shuffled.cardOrder, explicit({ scope: 'document' }, { playbackOrderMode: 'shuffle' }, {}, tree, () => 0.99).cardOrder);
console.log('PASS G-P1 London scopes, heading ownership, manual profiles, partial Full, exact EN/ID and Card-only shuffle');

const stress = createJourneyToLondonStressFixtures();
const fixtureDocs = stress.snapshot.documents.map(document => resolveTextLibraryDocumentTree(stress.snapshot, document.id));
assert(fixtureDocs.length > 0);
for (const doc of fixtureDocs) {
  const plan = explicit({ scope: 'document' }, {}, {}, doc);
  if (!plan) continue;
  assert(plan.ordered.length > 0);
  assert(plan.entries.filter(item => item.kind === 'split').every(item => item.content.trim()));
}
console.log('PASS G-P1 stress fixture skips blank optional channels');

const [first, second] = p1.units[0].segments;
const crease = p1.units[1].segments[0];
const scene = c1.units[0].segments[0];
const title = { kind: 'heading', heading: { slot: 'mainTitle' }, channel: 'text', cardId: null };
const heading = { kind: 'heading', heading: { slot: 'heading' }, channel: 'text', cardId: c1.id };
const timing = normalizeBookTiming({ channelDelayMs: 127, segmentDelayMs: 55 });
assert.deepEqual(normalizeBookTiming({}), BOOK_TIMING_DEFAULTS);
assert.equal(timing.channelDelayMs, 150);
assert.equal(timing.segmentDelayMs, 50);
assert.equal(normalizeBookTiming({ repeatDelayMs: 6000 }).repeatDelayMs, 5000);
assert.equal(normalizeBookTiming({ unitDelayMs: null }).unitDelayMs, 200);
for (const [before, next, delay] of [
  [title, { ...title, channel: 'meaning' }, 150], [title, segment(first), 750],
  [segment(first), segment(first, 'meaning'), 150], [segment(first), segment(second), 50],
  [segment(first), segment(crease), 200], [segment(crease), heading, 350], [heading, segment(scene), 400],
  [heading, { ...heading, channel: 'meaning' }, 150], [heading, null, 0],
  [{ kind: 'full', cardId: p1.id }, { kind: 'full', cardId: c1.id }, 350]
]) assert.equal(resolveBookStepDelay(before, next, timing), delay);
assert.equal(resolveBookStepDelay(heading, segment(scene), timing, true), 500);
assert.deepEqual([false, true].flatMap(tap => [false, true].map(continueFromHere => resolveBookTextClick({ tap, continueFromHere }))),
  ['select', 'select', 'channel', 'tap-from']);
console.log('PASS G-P3 selection intent truth table and G-P4 normalized timing and single-edge precedence');

const navPlan = explicit({ scope: 'from-here', startSegmentId: start.id, boundary: 'unit' }, {}, { from: { repeat: 'twice' } });
const book = { plan: navPlan, expanded: new Map(), cursor: { pass: 0, index: 0, step: navPlan.entries[0] } };
assert.equal(readBookTransportTarget(book, 'prev'), null);
assert.equal(readBookTransportTarget(book, 'next').step.item.id, p1.units[0].segments[3].id);
book.cursor = { pass: 0, index: navPlan.entries.length - 1, step: navPlan.entries.at(-1) };
assert.equal(readBookTransportTarget(book, 'next').pass, 1);
book.cursor.pass = 1;
assert.equal(readBookTransportTarget(book, 'next'), null);
assert.equal(readBookTransportTarget({ ...book, plan: { ...navPlan, repeatLimit: Infinity } }, 'next').pass, 2);
const syntheticFull = full.entries.find(candidate => candidate.kind === 'full');
const substitute = syntheticFull.items.slice(0, 2).map(item => segment(item, syntheticFull.channel));
assert.equal(readBookTransportTarget({ plan: { ...full, entries: [syntheticFull] }, expanded: new Map([[0, substitute]]),
  cursor: { pass: 0, index: 0, step: substitute[0] } }, 'next').step.item.id, substitute[1].item.id);

const sessionRun = async (plan, resume = null, actualTiming = false) => {
  const context = { current: null };
  const token = { current: 1 };
  const stop = { current: false };
  const played = [];
  let execution;
  const actual = () => {
    context.current.acceptStarted();
    const { pass, step } = context.current.book.cursor;
    played.push([pass, bookStepIdentity(step), step.channel]);
  };
  const nop = () => {};
  const done = executeStructuredTextPlaybackSessionService({
    documentTree: tree, bookPlan: actualTiming ? plan : { ...plan, timing: Object.fromEntries(Object.keys(BOOK_TIMING_DEFAULTS).map(key => [key, 0])) },
    bookStart: resume, bookContentStamp: 'snapshot', readBookContentStamp: () => 'snapshot',
    safePlayTransition: (action, session) => { context.current = session; execution = action(); },
    playbackContextRef: context, playbackSessionRef: token, stopSignalRef: stop,
    pauseStateRef: { current: false }, silentAudioRef: {}, waitWhilePaused: nop,
    setIsPlaying: nop, setIsPaused: nop, setPlayingContext: nop,
    setPlayingIndex: nop, setCurrentIndex: nop, setSpeakingPart: nop,
    playStructuredChannel: actual, playHeadingStep: actual, forceStopAll: () => { stop.current = true; }
  });
  assert.equal(done, true);
  await execution;
  assert.equal(stop.current, true);
  return played;
};
const repeatOutput = await sessionRun(navPlan);
assert.deepEqual(repeatOutput.filter(row => row[0] === 0).map(row => row.slice(1)), repeatOutput.filter(row => row[0] === 1).map(row => row.slice(1)));
const stoppedOnId = { pass: 1, index: 1, step: navPlan.entries[1] };
assert.equal(stoppedOnId.step.channel, 'meaning');
const resumed = await sessionRun(navPlan, stoppedOnId);
assert.deepEqual(resumed[0], [1, bookStepIdentity(stoppedOnId.step), 'meaning']);
assert(resumed.every(step => step[0] === 1));
const titled = { ...tree, metadata: { ...tree.metadata, bookMainTitleV1: { mode: 'custom', en: 'Journey', id: 'Perjalanan' } } };
const titledShuffle = explicit({ scope: 'document' }, { playbackOrderMode: 'shuffle', repeatMode: 'twice' }, {}, titled);
assert.equal(titledShuffle.entries[0].heading.slot, 'mainTitle');
assert.equal(titledShuffle.entries[1].channel, 'meaning');
assert.equal(titledShuffle.entries.find(step => step.cardId)?.cardId, titledShuffle.cardOrder[0]);
const shuffledPasses = await sessionRun(titledShuffle);
assert.deepEqual(shuffledPasses.filter(row => row[0] === 0).map(row => row.slice(1)), shuffledPasses.filter(row => row[0] === 1).map(row => row.slice(1)));

const waits = [];
const timers = mock.method(globalThis, 'setTimeout', (finish, duration) => { waits.push(duration); queueMicrotask(finish); });
try {
  await sessionRun(titledShuffle, null, true);
} finally { timers.mock.restore(); }
const onePassDelay = titledShuffle.entries.reduce((total, step, index) =>
  total + resolveBookStepDelay(titledShuffle.entries[index - 1], step, titledShuffle.timing), 0);
assert.equal(waits.reduce((total, duration) => total + duration, 0), 2 * onePassDelay + titledShuffle.timing.repeatDelayMs);
const stamp = getBookContentStamp(london.snapshot, tree.id);
const copy = structuredClone(london.snapshot);
copy.segments.find(item => item.id === start.id).text += ' Edited.';
assert.notEqual(getBookContentStamp(copy, tree.id), stamp);
assert.equal(executeStructuredTextPlaybackSessionService({ bookPlan: navPlan, bookContentStamp: stamp,
  readBookContentStamp: () => getBookContentStamp(copy, tree.id) }), false);
console.log('PASS G-P2 bounded transport, finite/Loop navigation, actual Split fallback and exact ID/pass resume with stale edit rejection');
console.log('PASS G-P2/G-P4 actual executor freezes shuffled repeats, replays titles and schedules only configured edges without a final delay');
