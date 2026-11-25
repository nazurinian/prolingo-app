import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { createP13MixedFixture } from './fixtures/p13-mixed/mixed-workspace-fixture.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { bindNowPlayingRuntime, readOwnedNowPlaying } from '../src/domain/playback/nowPlayingDomain.js';
import { executeAudioSourcePlaybackService, executeBrowserTtsPlaybackService } from '../src/services/audio/audioPlaybackSideEffectService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from '../src/services/playback/textStructuredAudioRuntimeService.js';

const noop = () => {};
const ref = current => ({ current });
const refs = () => ({
  playbackSessionRef: ref(1), playbackContextRef: ref(null),
  stopSignalRef: ref(false), pauseStateRef: ref(false),
  currentAudioObjRef: ref(null), playbackResolveRef: ref(null)
});
const until = async predicate => {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Runtime did not reach the expected step');
};

const { snapshot, ids } = createJourneyToLondonFixture();
const before = JSON.stringify(snapshot);
const tree = resolveTextLibraryDocumentTree(snapshot, ids.documentId);
const owner = refs();
const read = () => readOwnedNowPlaying(owner, 'main', { isPlaying: true });
const [p1, c1, , c2] = tree.blocks;
const first = c1.units[0].segments[0], second = c1.units[1].segments[0];
// A repeated line and the same binary within different turns must still
// resolve the current authored speaker. Only the test tree is derived.
const repeatedTree = {
  ...tree,
  blocks: tree.blocks.map(card => card.id === c1.id ? {
    ...card,
    segments: card.segments.map(segment => segment.id === first.id ? { ...segment, text: second.text } : segment)
  } : card)
};
const reusedBinary = { duration: 2, currentTime: 0, playbackRate: 1.25 };
owner.playbackContextRef.current = {
  sessionId: 1, context: 'text-structured', scope: 'document', documentTree: repeatedTree, playbackRepresentationMode: 'split',
  orderedList: [second, first]
};
const old = bindNowPlayingRuntime(owner, { cardId: c1.id, segmentId: second.id, channel: 'text', representation: 'split' });
assert.equal(read().precision, 'none', 'the request has no audible evidence yet');
old({ source: 'local-rf', voice: 'recorded voice', media: reusedBinary });
const heard = read();
assert.equal(heard.workspace.id, tree.id);
assert.deepEqual([heard.card.ordinal, heard.card.total, heard.unit.ordinal, heard.unit.total], [2, 4, 2, 4]);
assert.deepEqual([heard.segment.ordinal, heard.segment.total, heard.segment.id], [1, 3, second.id]);
assert.deepEqual(heard.queue, { kind: 'segment', ordinal: 1, total: 2 });
assert.equal(heard.speaker.name, c1.units[1].speaker);
assert.ok(Object.isFrozen(heard) && Object.isFrozen(heard.queue) && Object.isFrozen(heard.segment));
const next = bindNowPlayingRuntime(owner, { cardId: c1.id, segmentId: first.id, channel: 'meaning', representation: 'split' });
next({ source: 'local-rf', voice: 'recorded voice', media: reusedBinary });
assert.equal(read().segment.text, heard.segment.text);
assert.notEqual(read().speaker.id, heard.speaker.id);
next({ source: 'tts', provider: 'browser-tts' });
assert.equal(read().channel, 'meaning');
assert.equal(read().speaker.name, c1.units[0].speaker);
assert.equal(read().voice, null);
assert.equal(read().timeline, null);
old(null);
old({ source: 'generated', rate: 2 });
assert.equal(read().source, 'tts', 'late events from another step are ignored');
owner.pauseStateRef.current = true;
assert.equal(read().state, 'paused');
assert.equal(read().precision, 'segment');
owner.pauseStateRef.current = false;

owner.playbackContextRef.current = {
  sessionId: 2, context: 'text-structured', scope: 'document', documentTree: tree,
  playbackRepresentationMode: 'full', nowPlayingCardOrder: [c2.id, p1.id, c1.id]
};
owner.playbackSessionRef.current = 2;
const full = bindNowPlayingRuntime(owner, {
  cardId: p1.id, segmentId: p1.segments[0].id, channel: 'text', representation: 'full'
});
const media = { duration: 35, currentTime: 4, playbackRate: 1.5, seekable: { length: 1 } };
full({ source: 'full-artifact', media });
assert.equal(read().precision, 'card');
assert.equal(read().card.ordinal, 1);
assert.equal(read().queue.ordinal, 2);
assert.deepEqual([read().unit, read().speaker, read().segment], [null, null, null]);
assert.deepEqual(read().timeline, { durationSeconds: 35, elapsedSeconds: 4, seekable: true });
media.currentTime = 7;
assert.equal(read().timeline.elapsedSeconds, 7);
owner.playbackContextRef.current = { ...owner.playbackContextRef.current };
full(null);
assert.equal(read().precision, 'none', 'natural source completion clears audible identity');
owner.stopSignalRef.current = true;
assert.equal(read().state, 'idle');
assert.equal(read().queue, null);
assert.equal(read().sessionId, null);
console.log('PASS authored hierarchy, card precision, queue identity, pause and stop');

const audioCalls = [];
const utterances = [];
globalThis.Audio = class {
  constructor(url) { this.url = url; audioCalls.push(this); }
  play() { return Promise.resolve(); }
};
globalThis.SpeechSynthesisUtterance = class {};
const speech = {
  cancel: noop,
  speak(utterance) { utterances.push(utterance); }
};
const table = refs();
const vocab = { id: 'BOOK_0019', vocabId: 'BOOK_0019', displayId: 19, word: 'Station', isStructured: true };
table.playbackContextRef.current = { sessionId: 1, context: 'study', kind: 'global', orderedList: [vocab, vocab] };
const readTable = () => readOwnedNowPlaying(table, 'main', { isPlaying: true });
const observe = bindNowPlayingRuntime(table, { item: vocab, part: 'exp2_idn', queueIndex: 1 });
const playTTS = (textToRead, overrideVoice, onNowPlaying) => executeBrowserTtsPlaybackService({
  ...table, textToRead, overrideVoice, onNowPlaying, synth: speech, currentUtteranceRef: ref(null), rate: 1.4
});
const localThenTts = executeAudioSourcePlaybackService({
  ...table, item: vocab, part: 'exp2_idn', textToRead: 'Stasiun',
  preferLocalAudio: true,
  getLocalAudioUrl: (_item, _part, onVariant) => {
    onVariant({ source: 'generated', provider: 'edge', voice: 'Recorded' });
    return 'blob:test';
  },
  rate: 1.2, onNowPlaying: observe,
  shouldIgnoreLocalAudioFailure: settled => settled,
  shouldResolveLocalAudioFailure: stopped => stopped,
  resolveAudioFallbackVoice: () => ({ name: 'Installed ID' }),
  selectedIndonesianVoiceRef: ref(null), playTTS, addLog: noop
});
await until(() => audioCalls[0]?.onplaying);
assert.equal(readTable().source, null);
const local = audioCalls[0];
const lateStart = local.onplaying;
local.onplaying();
assert.equal(readTable().provider, 'edge');
assert.equal(readTable().precision, 'word');
assert.equal(readTable().item.displayNumber, 19);
assert.equal(readTable().queue.ordinal, 2, 'actual repeated queue occurrence');
assert.equal(readTable().channel, 'meaning');
assert.equal(readTable().card, null);
local.onerror();
await until(() => utterances.length === 1);
assert.equal(readTable().source, null, 'failed source clears before native TTS starts');
utterances[0].onstart();
assert.equal(readTable().provider, 'browser-tts');
assert.equal(readTable().voice, 'Installed ID');
assert.equal(readTable().rate, 1.4);
lateStart();
assert.equal(readTable().provider, 'browser-tts');
utterances[0].onend({ type: 'end' });
await localThenTts;
assert.equal(readTable().precision, 'none');
assert.equal(audioCalls.length, 1);
assert.equal(utterances.length, 1);

const legacyItem = { id: 'legacy-1', displayId: 4, text: 'Legacy title' };
table.playbackSessionRef.current = 2;
table.playbackContextRef.current = { sessionId: 2, context: 'text', kind: 'independent', orderedList: [legacyItem] };
const readLegacy = () => readOwnedNowPlaying(table, 'main');
const readLegacyStart = bindNowPlayingRuntime(table, { item: legacyItem, part: 'full' });
const legacyPlayback = executeStructuredTextRuntimeAudioPlaybackService({
  ...table, url: 'blob:test-legacy', playbackRate: 1,
  onNowPlaying: readLegacyStart, sourceEvidence: { source: 'local' }
});
audioCalls[1].onplaying();
assert.equal(readLegacy().domain, 'legacy-text');
assert.equal(readLegacy().item.title, 'Legacy title');
assert.equal(readLegacy().precision, 'item');
assert.deepEqual([readLegacy().channel, readLegacy().workspace, readLegacy().card, readLegacy().segment], [null, null, null, null]);
observe({ source: 'foreign', rate: 3 });
assert.equal(readLegacy().source, 'local');
audioCalls[1].onended();
await legacyPlayback;
assert.equal(readLegacy().state, 'idle');
console.log('PASS actual local start, native provider fallback, Table and Legacy semantics, and stale events');

// Mount the real isolated host hook with deterministic execution boundaries.
// React server rendering initializes the hook and its actual owned-session refs.
const bundled = await build({
  stdin: {
    contents: `
      export { useConversationAudioPlayback } from './src/components/text/conversation/useConversationAudioPlayback.js';
      export { executeGlobalPlaybackSessionService } from './src/services/playback/globalPlaybackSessionService.js';
    `,
    resolveDir: process.cwd()
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false
});
const hookModule = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), hookModule, hookModule.exports);
const fixture = createP13MixedFixture({ runtimeBindings: true });
const fixtureBefore = JSON.stringify(fixture.snapshot);
const isolatedTree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
let host;
const observations = [];
const logs = [];
function Probe() {
  host = hookModule.exports.useConversationAudioPlayback({
    snapshot: fixture.snapshot, documentTree: isolatedTree,
    runtimeAudioUrls: fixture.runtimeAudioUrls,
    audioConfig: { preferences: fixture.preferences, playbackRepresentationMode: 'full', playbackChannelMode: 'text-meaning' },
    audioRuntimeHooks: {
      speechSynth: { speak: noop, cancel: noop, getVoices: () => [] },
      onLog: entry => logs.push(entry.message),
      executeBrowserTts: () => { observations.push(host.readNowPlaying()); },
      executeRuntimeAudio: () => { observations.push(host.readNowPlaying()); return { status: 'played' }; }
    }
  });
  return null;
}
renderToString(React.createElement(Probe));
host.playWorkspace();
await until(() => logs.includes('Structured Text playback finished.'));
const paragraph = observations.find(entry => entry.actualRepresentation === 'full');
const conversation = observations.find(entry => entry.speaker?.id);
assert.equal(paragraph?.precision, 'card');
assert.equal(paragraph?.segment, null);
assert.equal(conversation?.precision, 'segment');
assert.equal(conversation?.requestedRepresentation, 'full');
assert.equal(conversation?.actualRepresentation, 'split');
assert.equal(conversation?.queue.kind, 'card');
assert.equal(conversation?.owner, 'isolated-uat');
assert.ok(observations.some(entry => entry.channel === 'text') && observations.some(entry => entry.channel === 'meaning'));
assert.equal(host.readNowPlaying().state, 'idle');
assert.equal(JSON.stringify(snapshot), before);
assert.equal(JSON.stringify(fixture.snapshot), fixtureBefore);
console.log('PASS real isolated session, Mixed Full and Split fallback, channels, and natural completion');

const shuffled = refs();
const authored = [vocab, { ...vocab, id: 'BOOK_0007', vocabId: 'BOOK_0007', displayId: 7 }];
const traversed = [];
const playbackModeRef = ref('sequence');
let finished;
const done = new Promise(resolve => { finished = resolve; });
hookModule.exports.executeGlobalPlaybackSessionService({
  ...shuffled, forcedContext: 'master', mode: 'table', tableViewModeRef: ref('master'),
  options: { baseListOverride: authored, orderedListOverride: [...authored].reverse() },
  safePlayTransition: run => run(),
  setPlayingContext: noop, setIsPlaying: noop, setIsPaused: noop, setPlayingIndex: noop,
  setMasterIndex: noop, setStudyIndex: noop, setSavedIndices: noop, setCurrentIndex: noop, setSpeakingPart: noop,
  addLog: noop, vocabularyPlayOrderRef: ref('shuffle'), silentAudioRef: ref(null), waitWhilePaused: noop,
  playbackModeRef, playbackSequenceRef: ref([{ key: 'word_en', enabled: true }]),
  playbackDelaysRef: ref({ partDelayMs: 0, repeatDelayMs: 0 }),
  playSource: (_text, item, part, { queueIndex }) => {
    const observe = bindNowPlayingRuntime(shuffled, { item, part, queueIndex });
    observe({ source: 'tts' });
    traversed.push(readOwnedNowPlaying(shuffled, 'main'));
    observe(null);
    if (traversed.length === authored.length) playbackModeRef.current = 'once';
  },
  forceStopAll: () => {
    shuffled.playbackSessionRef.current++;
    shuffled.playbackContextRef.current = null;
    finished();
  }
});
await done;
assert.deepEqual(traversed.map(entry => [entry.item.displayNumber, entry.queue.ordinal, entry.channel]), [[7, 1, 'text'], [19, 2, 'text']]);
assert.equal(readOwnedNowPlaying(shuffled, 'main').state, 'idle');
console.log('PASS real global shuffle traversal keeps authored labels separate from queue position');
