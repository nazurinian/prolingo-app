import assert from 'node:assert/strict';
import { createJourneyToLondonFixture, createJourneyToLondonStressFixtures } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { resolveStructuredTextPlaybackCommand as command } from '../src/domain/text/textStructuredPlaybackDomain.js';
import { executeStructuredTextPlaybackSessionService as execute } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import { bindNowPlayingRuntime, readOwnedNowPlaying } from '../src/domain/playback/nowPlayingDomain.js';

const london = createJourneyToLondonFixture();
const before = JSON.stringify(london.snapshot);
const tree = resolveTextLibraryDocumentTree(london.snapshot, london.ids.documentId);
const [p1, c1, p2, c2] = tree.blocks;
const [turn, nextTurn] = c1.units;
const [a, b] = turn.segments;
const base = { documentTree: tree, workspaceId: tree.id, workspaceUid: tree.uid, playbackChannelMode: 'text-meaning', playbackRepresentationMode: 'full' };
const pick = options => command({ ...base, ...options });
const segments = options => pick(options)?.scopedList.map(item => item.id);
const ids = rows => rows.map(row => row.id);
const runFrom = (boundary, id, parent = {}) => ({ scope: 'from-here', boundary, startSegmentId: id, ...parent });

assert.equal(tree.blocks.length, 4);
assert.equal(tree.blocks.flatMap(block => block.units).length, 11);
assert.equal(tree.blocks.flatMap(block => block.segments).length, 37);
assert.deepEqual(segments({ scope: 'segment', startSegmentId: b.id }), [b.id]);
assert.deepEqual(segments({ scope: 'unit', blockId: c1.id, unitId: turn.id }), ids(turn.segments));
assert.deepEqual(segments({ scope: 'card', blockId: c1.id }), ids(c1.segments));
assert.deepEqual(segments({ scope: 'document' }), london.ids.segmentIds);
assert.deepEqual(segments(runFrom('unit', b.id)), ids(turn.segments.slice(1)));
assert.deepEqual(segments(runFrom('card', b.id)), ids(c1.segments.slice(1)));
assert.deepEqual(segments(runFrom('document', b.id)), ids([...c1.segments.slice(1), ...p2.segments, ...c2.segments]));
assert.equal(pick(runFrom('card', b.id)).commandRepresentation, 'split');
assert.equal(pick(runFrom('card', a.id)).commandRepresentation, 'full');
assert.equal(pick(runFrom('document', b.id)).partialCardIds.has(c1.id), true);
assert.equal(pick(runFrom('document', b.id)).partialCardIds.has(c2.id), false);
assert.equal(pick({ scope: 'segment', startSegmentId: a.id, channel: 'text' }).playbackChannelMode, 'text-only');
assert.equal(pick({ scope: 'segment', startSegmentId: a.id, channel: 'meaning' }).playbackChannelMode, 'meaning-only');

const malformed = [
  { scope: 'unknown' }, { scope: 'segment' }, { scope: 'segment', startSegmentId: 'missing' },
  { scope: 'segment', startSegmentId: a.id, blockId: p1.id },
  { scope: 'segment', startSegmentId: a.id, unitId: nextTurn.id },
  { scope: 'segment', startSegmentId: a.id, workspaceUid: 'foreign' },
  { scope: 'segment', startSegmentId: a.id, workspaceId: 'foreign' },
  { scope: 'segment', startSegmentId: a.id, channel: 'other' },
  { scope: 'card', blockId: 'missing' }, { scope: 'card', blockId: c1.id, cursorSegmentId: p1.segments[0].id },
  { scope: 'unit', blockId: c1.id, unitId: p1.units[0].id }, { scope: 'unit', blockId: p1.id, virtualUnit: true },
  { scope: 'unit', blockId: p1.id }, { scope: 'from-here', boundary: 'card' },
  runFrom('nope', a.id), runFrom('unit', a.id, { unitId: nextTurn.id }),
  runFrom('card', a.id, { cursorSegmentId: p2.segments[0].id })
];
for (const input of malformed) assert.equal(pick(input), null, JSON.stringify(input));
assert.equal(pick({ scope: 'from-here', startSegmentId: a.id }), null, 'new commands require a boundary');

const stress = createJourneyToLondonStressFixtures();
const stressTree = resolveTextLibraryDocumentTree(stress.snapshot, stress.ids.documentId);
const emptyBlock = stressTree.blocks.find(block => block.units.some(unit => !unit.segments.length));
const emptyUnit = emptyBlock.units.find(unit => !unit.segments.length);
assert.equal(command({ documentTree: stressTree, scope: 'unit', unitId: emptyUnit.id }), null);
const missingMeaning = { ...tree, blocks: tree.blocks.map(block => ({
  ...block, segments: block.segments.map(segment => segment.id === a.id ? { ...segment, meaning: '' } : segment)
})) };
assert.equal(pick({ documentTree: missingMeaning, scope: 'segment', startSegmentId: a.id, channel: 'meaning' }), null);
assert.equal(pick({ documentTree: missingMeaning, ...runFrom('card', a.id), playbackChannelMode: 'meaning-only' }), null);
const v1Block = { ...p1, units: undefined, segments: p1.segments.map(segment => ({ ...segment, unitId: null })) };
const v1Tree = { ...tree, documentType: 'paragraph', blocks: [v1Block] };
assert.deepEqual(command({ documentTree: v1Tree, scope: 'unit', blockId: p1.id, virtualUnit: true }).scopedList.map(item => item.id), ids(p1.segments));
assert.equal(command({ documentTree: v1Tree, scope: 'unit', blockId: p1.id, unitId: 'virtual-key' }), null);
assert.equal(JSON.stringify(london.snapshot), before);
console.log('PASS 4E1-A London scopes, exact channels, continuation, parent rejection, empty Units and v1 compatibility');

const run = async options => {
  const noop = () => {};
  const refs = {
    playbackSessionRef: { current: 1 }, playbackContextRef: { current: null },
    stopSignalRef: { current: false }, pauseStateRef: { current: false }, silentAudioRef: { current: null }
  };
  let transitioned = 0, accepted = 0, task;
  const events = [];
  const observe = (target, source) => {
    const publish = bindNowPlayingRuntime(refs, target);
    publish({ source });
    events.push(readOwnedNowPlaying(refs, 'test', { isPlaying: true }));
    publish(null);
  };
  const started = execute({
    ...base, ...options, ...refs,
    safePlayTransition: call => { transitioned++; task = call(); },
    onPlaybackAccepted: () => { accepted++; },
    waitWhilePaused: noop,
    setPlayingContext: noop, setIsPlaying: noop, setIsPaused: noop, setPlayingIndex: noop,
    setCurrentIndex: noop, setSpeakingPart: noop,
    forceStopAll: () => { refs.playbackContextRef.current = null; },
    resolveBlockChannelPlaybackPlan: ({ block, channel, representationMode, allowFullArtifact, segmentIds }) => {
      if (!allowFullArtifact) {
        assert.equal(representationMode, 'split');
        assert.ok(segmentIds.length < block.segments.length);
        // A misbehaving Full candidate in a partial plan must never execute.
        return { steps: [{ type: 'full-tts', content: 'UNRELATED' }] };
      }
      return { steps: options.simulateFullFallback ? block.segments.map(segment => ({
        type: 'split-tts', segmentId: segment.id, content: segment[channel], channel
      })) : [{ type: 'full-local', content: block.segments.map(segment => segment[channel]).join(' '), channel }] };
    },
    playStructuredFullStep: (step, block) => observe({ representation: 'full', cardId: block.id, channel: step.channel }, 'full-artifact'),
    playStructuredChannel: (content, item, channel) => {
      assert.equal(content, item[channel]);
      observe({ representation: 'split', cardId: item.blockId, segmentId: item.id, channel }, 'tts');
    }
  });
  await task;
  return { started, transitioned, accepted, events };
};
for (const input of malformed) {
  const rejected = await run(input);
  assert.deepEqual(rejected, { started: false, transitioned: 0, accepted: 0, events: [] });
}
for (const channel of ['text', 'meaning']) {
  const exact = await run({ scope: 'segment', startSegmentId: b.id, channel, repeatMode: 'loop', repeatCount: 4 });
  assert.equal(exact.events.length, 1);
  const [step] = exact.events;
  assert.equal(step.channel, channel);
  assert.equal(step.segment.id, b.id);
  assert.deepEqual([step.savedRepresentation, step.requestedRepresentation, step.commandRepresentation, step.actualRepresentation, step.representationFallback],
    ['full', 'full', 'split', 'split', false]);
}
const unit = await run({ scope: 'unit', unitId: turn.id });
assert.deepEqual(unit.events.map(step => [step.segment.id, step.channel]), turn.segments.flatMap(s => [[s.id, 'text'], [s.id, 'meaning']]));
assert.equal(unit.events[0].unit.id, turn.id);
assert.equal(unit.events[0].queue.kind, 'segment');
assert.deepEqual((await run({ scope: 'unit', unitId: turn.id, startSegmentId: b.id })).events.map(x => x.segment.id),
  turn.segments.flatMap(s => [s.id, s.id]));
assert.deepEqual((await run(runFrom('unit', b.id))).events.map(x => x.segment.id), turn.segments.slice(1).flatMap(s => [s.id, s.id]));
assert.deepEqual((await run(runFrom('card', b.id))).events.map(x => x.segment.id), c1.segments.slice(1).flatMap(s => [s.id, s.id]));
const continued = await run(runFrom('document', b.id));
const partial = continued.events.filter(step => step.card.id === c1.id);
const complete = continued.events.filter(step => step.card.id !== c1.id);
assert.deepEqual(partial.map(x => x.segment.id), c1.segments.slice(1).flatMap(s => [s.id, s.id]));
assert.ok(partial.every(x => x.commandRepresentation === 'split' && !x.representationFallback
  && x.boundary === 'document' && x.queue.kind === 'card' && x.queue.ordinal === 1 && x.card.ordinal === 2));
assert.deepEqual(complete.map(x => x.card.id), [p2.id, p2.id, c2.id, c2.id]);
assert.ok(complete.every(x => x.precision === 'card' && x.actualRepresentation === 'full' && x.segment === null && x.speaker === null));
const fallback = await run({ scope: 'card', blockId: c1.id, simulateFullFallback: true });
assert.ok(fallback.events.length && fallback.events.every(x => x.commandRepresentation === 'full' && x.representationFallback === true));
const paired = await run({ scope: 'segment', startSegmentId: b.id, playbackChannelMode: 'meaning-text', repeatMode: 'custom', repeatCount: 2 });
assert.deepEqual(paired.events.map(x => x.channel), ['meaning', 'text', 'meaning', 'text']);
assert.equal(JSON.stringify(london.snapshot), before);
console.log('PASS 4E1-B validated executor, Single and deliberate repeat, bounded Continue, and actual Now Playing metadata');
