import assert from 'node:assert/strict';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { bindNowPlayingRuntime, readOwnedNowPlaying } from '../src/domain/playback/nowPlayingDomain.js';
import { executeMediaSessionLifecycleService } from '../src/services/playback/mediaSessionLifecycleService.js';

const fixture = createJourneyToLondonFixture();
const before = JSON.stringify(fixture.snapshot);
const documentTree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
assert.deepEqual([documentTree.blocks.length, documentTree.blocks.flatMap(block => block.units).length, documentTree.blocks.flatMap(block => block.segments).length], [4, 11, 37]);
const [p1, c1, p2, c2] = documentTree.blocks;
const ref = current => ({ current });
const refs = { playbackSessionRef: ref(0), playbackContextRef: ref(null), stopSignalRef: ref(true), pauseStateRef: ref(false) };
const handlers = {};
const positions = [];
const actions = [];
let metadataBuilds = 0;
let collectionLookups = 0;
const mediaSession = {
  setActionHandler(name, handler) { handlers[name] = handler; },
  setPositionState(position) { positions.push(position); }
};
class Metadata {
  constructor(metadata) { metadataBuilds++; Object.assign(this, metadata); }
}
const retire = () => {
  refs.playbackSessionRef.current++;
  refs.playbackContextRef.current = null;
  refs.pauseStateRef.current = false;
  refs.stopSignalRef.current = true;
  binding.sync();
};
const actionsRef = ref({
  pause: ({ source }) => { actions.push(source); refs.pauseStateRef.current = true; binding.sync(); },
  resume: () => { actions.push('resume'); refs.pauseStateRef.current = false; binding.sync(); },
  stop: () => { actions.push('stop'); retire(); }
});
const binding = executeMediaSessionLifecycleService({ refs, actionsRef, mediaSession, Metadata,
  readCollectionTitle: () => { collectionLookups++; return 'Travel collection'; } });
refs.onChange = binding.sync;

const own = target => {
  const sessionId = ++refs.playbackSessionRef.current;
  refs.stopSignalRef.current = Boolean(target.pending);
  refs.pauseStateRef.current = false;
  refs.playbackContextRef.current = { ...target, sessionId };
  binding.sync();
};
const structured = (input = {}) => own({
  context: 'text-structured', documentTree: { ...documentTree, collectionId: 'collection' }, blockId: c1.id,
  nowPlayingCardOrder: [c1.id, p2.id, c2.id, p1.id],
  orderedList: [c1, p2, c2, p1].map(card => ({ id: card.segments[0].id, blockId: card.id })),
  restart: item => actions.push(item.blockId ?? item.id), playbackRepresentationMode: 'full', ...input
});
const report = (target, evidence = { source: 'tts' }) => {
  const publish = bindNowPlayingRuntime(refs, target);
  publish(evidence);
  return publish;
};

structured({ pending: true });
handlers.play(); handlers.pause();
assert.equal(mediaSession.metadata, null);
assert.deepEqual(actions, []);
assert.equal(mediaSession.playbackState, 'none');
const pendingStop = handlers.stop;
pendingStop();
assert.deepEqual(actions.splice(0), ['stop']);
assert.equal(refs.playbackContextRef.current, null);
structured();
pendingStop();
assert.deepEqual(actions, []);

const pStep = { cardId: p1.id, segmentId: p1.units[1].segments[2].id, representation: 'split', channel: 'text' };
report(pStep);
assert.equal(mediaSession.metadata.title, 'P1 · SC2 · SG3/4');
assert.equal(mediaSession.metadata.artist, 'A Journey to London · EN');
assert.equal(mediaSession.metadata.album, 'Travel collection');
assert.equal(mediaSession.metadata.artwork[0].src, '/text-uat-icon-512.png');
const cStep = { cardId: c1.id, segmentId: c1.units[1].segments[1].id, representation: 'split', channel: 'meaning' };
const oldTts = report(cStep);
const activeModeSnapshot = mediaSession.metadata;
binding.sync();
assert.equal(mediaSession.metadata, activeModeSnapshot);
assert.equal(mediaSession.metadata.title, 'C1 · Ticket Officer · T2 · SG2/3');
assert.equal(mediaSession.metadata.artist, 'A Journey to London · ID');
assert.equal(readOwnedNowPlaying(refs, 'main').representationFallback, true);
handlers.nexttrack(); handlers.previoustrack();
assert.deepEqual(actions.splice(0), [p2.id, p1.id], 'Full fallback retains the shuffled Card traversal');
assert.deepEqual(positions.at(-1), {}, 'Native TTS publishes no timeline');
assert.equal(handlers.seekto, undefined);

mediaSession.playbackState = 'paused';
handlers.play(); handlers.play();
assert.deepEqual(actions, [], 'System state alone cannot turn Play into Pause or Resume');
handlers.pause(); handlers.pause();
assert.equal(mediaSession.playbackState, 'paused');
assert.equal(mediaSession.metadata, activeModeSnapshot);
handlers.play(); handlers.play();
assert.deepEqual(actions.splice(0), ['mediaSession', 'resume']);
const obsoletePlay = handlers.play;
const obsoleteStop = handlers.stop;
const obsoleteNext = handlers.nexttrack;
structured({ nowPlayingCardOrder: null, playbackRepresentationMode: 'split', requestedRepresentation: 'full', scope: 'from-here', boundary: 'unit',
  cursorSegmentId: cStep.segmentId, orderedList: c1.units[1].segments.slice(1).map(segment => ({ id: segment.id })) });
report(cStep);
assert.equal(readOwnedNowPlaying(refs, 'main').representationFallback, false);
handlers.nexttrack(); handlers.previoustrack();
assert.deepEqual(actions.splice(0), [c1.units[1].segments.at(-1).id, c1.units[1].segments.at(-1).id], 'Bounded Split remains inside its Unit');
oldTts(null); obsoletePlay(); obsoleteStop(); obsoleteNext();
assert.equal(mediaSession.metadata.title, 'C1 · Ticket Officer · T2 · SG2/3');
assert.deepEqual(actions, []);

structured();
report({ ...cStep, representation: 'full' });
assert.equal(mediaSession.metadata.title, 'C1 · Full');
const item = { id: 'W1', word: 'abandon', displayId: 12 };
own({ context: 'master', orderedList: [item, { id: 'W2' }], queueIndex: 0, restart: target => actions.push(target.id) });
const parts = [
  ['word', 'abandon', 'Abandon'], ['word_idn', 'meninggalkan', 'Arti kata: meninggalkan'],
  ['sentence', 'We abandon it.', 'We abandon it.'], ['meaning', 'Kami meninggalkannya.', 'Terjemahan kalimat: Kami meninggalkannya.'],
  ...Array.from({ length: 5 }, (_, index) => index + 1).flatMap(no => [
    [`exp${no}_en`, 'Authored English', `EXP${no}: Authored English`], [`exp${no}_idn`, 'Authored Indonesian', `EXP${no} IDN: Authored Indonesian`]
  ])
];
for (const [part, playedText, title] of parts) {
  report({ item, part, playedText });
  assert.equal(mediaSession.metadata.title, title);
  assert.match(mediaSession.metadata.artist, / · (EN|ID)$/u);
  assert.equal(mediaSession.metadata.album, 'ProLingo');
}
handlers.nexttrack(); assert.deepEqual(actions.splice(0), ['W2']);
own({ context: 'text' });
report({ item: { id: 'L1', text: 'Legacy item.' }, part: 'full', playedText: 'Legacy item.' });
assert.equal(mediaSession.metadata.title, 'Legacy item.');
console.log('PASS authored Paragraph/Conversation/Mixed, EN/ID, Full precision, Table/Legacy parts, explicit transport, stale handlers and bounded queues');

class ControlledMedia extends EventTarget {
  duration = 30;
  currentTime = 7;
  playbackRate = 1.25;
  lastFastSeek = null;
  ranges = [[2, 10], [14, 30]];
  listeners = new Map();

  get seekable() {
    return { length: this.ranges.length, start: index => this.ranges[index][0], end: index => this.ranges[index][1] };
  }
  addEventListener(event, callback) { super.addEventListener(event, callback); this.listeners.set(event, callback); }
  removeEventListener(event, callback) { super.removeEventListener(event, callback); this.listeners.delete(event); }
  fastSeek(position) { this.lastFastSeek = position; this.currentTime = position; }
}

const media = new ControlledMedia();
structured();
const local = report({ ...cStep, representation: 'full' }, { source: 'full-artifact', media });
assert.deepEqual(positions.at(-1), { duration: 30, position: 7, playbackRate: 1.25 });
const buildCount = metadataBuilds;
const lookupCount = collectionLookups;
media.currentTime = 8; media.dispatchEvent(new Event('timeupdate'));
assert.deepEqual(positions.at(-1), { duration: 30, position: 8, playbackRate: 1.25 });
assert.equal(metadataBuilds, buildCount);
assert.equal(collectionLookups, lookupCount);
handlers.seekto({ seekTime: 12, fastSeek: true });
assert.equal(media.currentTime, 10, 'Never seek into an unseekable gap');
assert.equal(media.lastFastSeek, 10);
handlers.seekbackward({});
assert.equal(media.currentTime, 2);
handlers.seekforward({ seekOffset: 50 });
assert.equal(media.currentTime, 30);
handlers.seekto({ seekTime: NaN });
handlers.seekforward({ seekOffset: -1 });
assert.equal(media.currentTime, 30);
media.playbackRate = NaN; media.dispatchEvent(new Event('ratechange'));
assert.deepEqual(positions.at(-1), {});
assert.equal(handlers.seekto, null);
media.playbackRate = 1.25; media.dispatchEvent(new Event('ratechange'));
media.ranges = []; media.dispatchEvent(new Event('progress'));
assert.equal(handlers.seekto, null);
assert.deepEqual(positions.at(-1), {});
media.ranges = [[0, 30]]; media.dispatchEvent(new Event('progress'));
const staleSeek = handlers.seekto;
const stalePosition = media.listeners.get('timeupdate');
local(null);
assert.equal(media.listeners.size, 0);
assert.deepEqual(positions.at(-1), {});
assert.equal(mediaSession.metadata, null);
const positionCount = positions.length;
staleSeek({ seekTime: 2 }); stalePosition();
assert.equal(media.currentTime, 30);
assert.equal(positions.length, positionCount);
const media2 = new ControlledMedia();
report(cStep, { source: 'local-rf', media: media2 });
staleSeek({ seekTime: 2 });
assert.equal(media2.currentTime, 7);
handlers.stop();
assert.equal(mediaSession.playbackState, 'none');
assert.equal(media2.listeners.size, 0);
assert.equal(mediaSession.metadata, null);
assert.deepEqual(positions.at(-1), {});
structured(); report(cStep);
const tornDown = handlers.stop;
binding.dispose(); tornDown();
assert.ok(Object.values(handlers).every(handler => handler == null));
assert.equal(mediaSession.metadata, null);
assert.equal(mediaSession.playbackState, 'none');
console.log('PASS real-evidence position, seek validation, no rebuild on timeupdate, source replacement, stop and teardown');

assert.equal(executeMediaSessionLifecycleService({ refs, mediaSession: null }), null);
const unsupported = {
  set playbackState(_) { throw Error('not supported'); },
  set metadata(_) { throw Error('not supported'); },
  setActionHandler() { throw Error('not supported'); },
  setPositionState() { throw Error('not supported'); }
};
assert.doesNotThrow(() => {
  const binding = executeMediaSessionLifecycleService({ refs, mediaSession: unsupported, Metadata: null });
  binding.sync(); binding.dispose();
});
assert.equal(JSON.stringify(fixture.snapshot), before);
console.log('PASS absent and unsupported Media Session APIs fail without affecting playback');
