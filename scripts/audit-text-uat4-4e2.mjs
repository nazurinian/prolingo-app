import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { bindNowPlayingRuntime, matchesStructuredPlaybackControl, readOwnedNowPlaying } from '../src/domain/playback/nowPlayingDomain.js';
import { executeStructuredTextPlaybackSessionService as structured } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from '../src/services/playback/textStructuredAudioRuntimeService.js';
import { executeAudioSourcePlaybackService, executeBrowserTtsPlaybackService } from '../src/services/audio/audioPlaybackSideEffectService.js';
import {
  executePausePlayback, executeResumePlayback, executeSafePlayTransition, executeSettlePlaybackPromise,
  executeWaitWhilePaused, navigateOwnedPlayback, readOwnedPlaybackSession
} from '../src/services/playback/playbackRuntimeControlService.js';

// The browser-facing Table service uses extensionless imports.
const bundle = await build({ entryPoints: ['src/services/playback/globalPlaybackSessionService.js', 'src/services/playback/playbackInteractionService.js'],
  bundle: true, platform: 'node', format: 'esm', outdir: 'virtual-audit-output', write: false });
const importOutput = async name => {
  const output = bundle.outputFiles.find(file => file.path.endsWith(`${name}.js`));
  return import(`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`);
};
const { executeGlobalPlaybackSessionService: globalPlay } = await importOutput('globalPlaybackSessionService');
const { executeForceStopPlaybackService, executeIndependentPlaybackInteraction } = await importOutput('playbackInteractionService');

const fixture = createJourneyToLondonFixture();
const initialSnapshot = JSON.stringify(fixture.snapshot);
const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
const [p1, c1, p2] = tree.blocks;
const [turn1, turn2] = c1.units;
const [a, b, c] = turn1.segments;
const ref = current => ({ current });
const noop = () => {};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async condition => {
  for (let i = 0; i < 250; i++) {
    if (condition()) return;
    await delay(5);
  }
  assert.fail('Expected a real transition before the audit deadline');
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function createRuntime() {
  const refs = {
    playbackSessionRef: ref(0), playbackContextRef: ref(null), stopSignalRef: ref(true), pauseStateRef: ref(false),
    currentAudioObjRef: ref(null), currentUtteranceRef: ref(null), playbackResolveRef: ref(null), ttsReplayRef: ref(null), silentAudioRef: ref(null)
  };
  const events = [];
  const tasks = [];
  const resume = [];
  let isPlaying = false;
  let currentIndex = null;
  const setIsPlaying = value => { isPlaying = value; };
  const setCurrentIndex = id => { currentIndex = id; };
  const synth = { cancel: noop, pause: noop, resume: noop, speak: noop };
  const common = { ...refs, synth, setIsPlaying, setIsPaused: noop, setSpeakingPart: noop, setIndependentPlayingId: noop, addLog: noop };
  const forceStopAll = () => executeForceStopPlaybackService({ ...common,
    settlePlaybackPromise: () => executeSettlePlaybackPromise(refs) });
  const safePlayTransition = (actionCallback, pendingSession) => {
    tasks.push(executeSafePlayTransition({ ...refs, forceStopAll, actionCallback, pendingSession }));
  };
  const owned = () => readOwnedPlaybackSession(refs);
  const now = () => readOwnedNowPlaying(refs, 'main', { isPlaying });
  const step = (target, source) => {
    const work = deferred();
    const publish = bindNowPlayingRuntime(refs, target);
    publish({ source });
    events.push({ target, session: owned()?.sessionId, publish, end: work.resolve, fail: work.reject });
    return work.promise.finally(() => publish(null));
  };
  return {
    refs, events, tasks, owned, now, resume, index: () => currentIndex, stop: forceStopAll,
    next: (direction = 'next') => navigateOwnedPlayback(owned(), direction),
    pause: () => executePausePlayback({ ...common, isPlaying }),
    unpause: () => executeResumePlayback({ ...common, isPlaying }),
    structured: options => structured({ ...common, documentTree: tree, forceStopAll, safePlayTransition,
      setPlayingIndex: noop, setPlayingContext: noop, setCurrentIndex, waitWhilePaused: () => executeWaitWhilePaused(refs),
      onPlaybackCursor: ({ segmentId }) => resume.push(['cursor', segmentId]),
      onPlaybackCompleted: ({ segmentId }) => resume.push(['completed', segmentId]),
      playStructuredChannel: (_, item, channel) => step({ representation: 'split', cardId: item.blockId, segmentId: item.id, channel }, 'tts'),
      ...options
    }),
    global: (table, options) => globalPlay({ ...common, forceStopAll, safePlayTransition, mode: 'text', playingIndex: null,
      getBasePlaybackListForContext: () => table, resolveVocabularyPlaybackList: list => list,
      vocabularyPlayOrderRef: ref('sequential'), playbackModeRef: ref('sequence'), playbackSequenceRef: ref([{ key: 'word_en', enabled: true }]),
      playbackDelaysRef: ref({}), tableViewModeRef: ref('study'), isVisibleContext: () => false,
      waitWhilePaused: () => executeWaitWhilePaused(refs), setPlayingContext: noop, setPlayingIndex: noop,
      setMasterIndex: noop, setStudyIndex: noop, setSavedIndices: noop, setCurrentIndex,
      playSource: (_, item, part, { queueIndex }) => step({ item, part, queueIndex }, 'local'), ...options
    }),
    invalidIndependent: () => executeIndependentPlaybackInteraction({ ...common, item: { id: 'missing' }, part: 'word',
      safePlayTransition, forceStopAll, setActiveMenuId: noop, uiId: 'independent' }),
    settled: async () => Promise.all(tasks)
  };
}

{
  const rt = createRuntime();
  const table = ['row-1', 'row-2', 'row-3'].map(id => ({ id, word: 'duplicate word', isStructured: true }));
  const en = { scope: 'segment', segmentId: a.id, channel: 'text' };
  assert.equal(rt.structured({ scope: 'segment', startSegmentId: a.id, channel: 'text', repeatMode: 'loop' }), true);
  await until(() => rt.events.length === 1);
  const first = rt.events[0];
  assert.equal(matchesStructuredPlaybackControl(rt.now(), en), true);
  assert.equal(matchesStructuredPlaybackControl(rt.now(), { ...en, channel: 'meaning' }), false);
  assert.equal(rt.structured({ scope: 'segment', startSegmentId: 'invalid' }), false);
  rt.global(table, { forcedContext: 'study', startItemId: 'invalid' });
  rt.invalidIndependent();
  assert.equal(rt.now().sessionId, first.session);
  const tableSequence = ref([{ key: 'word_en', enabled: true }]);
  rt.global([{ id: 'empty', isStructured: true }, ...table], { forcedContext: 'study', startItemId: 'empty',
    playbackSequenceRef: tableSequence, options: { orderedListOverride: [table[0], table[2], table[1]], resumeHint: true } });
  await until(() => rt.events.length === 2);
  assert.equal(rt.now().domain, 'table');
  assert.equal(rt.now().item.id, table[0].id);
  tableSequence.current = [{ key: 'word_idn', enabled: true }];
  rt.next();
  rt.next();
  rt.next('prev');
  await until(() => rt.events.length === 3);
  assert.equal(rt.now().item.id, table[2].id);
  assert.equal(rt.now().item.part, 'word', 'Owned navigation keeps the accepted sequence');
  assert.deepEqual(rt.now().queue, { kind: 'item', ordinal: 2, total: 3 });
  rt.global([{ id: 'legacy-1', text: 'Legacy content' }], { forcedContext: 'text', startItemId: 'legacy-1' });
  await until(() => rt.events.length === 4);
  assert.equal(rt.now().domain, 'legacy-text');
  rt.stop();
  rt.structured({ scope: 'segment', startSegmentId: a.id, channel: 'meaning', repeatMode: 'loop' });
  await until(() => rt.events.length === 5);
  first.publish({ source: 'stale' });
  first.fail(new Error('Retired session rejected after replacement'));
  for (const event of rt.events.slice(1, -1)) event.end();
  rt.pause();
  assert.equal(rt.now().state, 'paused');
  assert.equal(rt.now().channel, 'meaning');
  assert.equal(rt.now().precision, 'segment');
  assert.notEqual(rt.now().sessionId, first.session);
  rt.unpause();
  assert.equal(rt.now().state, 'playing');
  assert.equal(rt.events.length, 5);
  rt.events.at(-1).end();
  await rt.settled();
  assert.equal(rt.now().state, 'idle');
  assert.equal(rt.events.length, 5, 'Exact channel remains Single even with a saved loop');
  rt.structured({ scope: 'segment', startSegmentId: a.id, channel: 'text' });
  await until(() => rt.events.length === 6);
  rt.events.at(-1).fail(new Error('Current session failed'));
  await rt.settled();
  assert.equal(rt.owned(), null);
  assert.equal(rt.now().state, 'idle');
  console.log('PASS cross-domain token replacement, invalid commands, rapid Table traversal and exact-channel Pause/Resume/Stop');
}

{
  const rt = createRuntime();
  rt.structured({ scope: 'from-here', boundary: 'unit', startSegmentId: b.id, playbackRepresentationMode: 'full', playbackChannelMode: 'text-meaning' });
  assert.deepEqual(rt.owned().orderedList.map(item => item.id), [b.id, c.id]);
  rt.next();
  rt.next();
  rt.next();
  await until(() => rt.events.length === 1);
  assert.equal(rt.now().segment.id, c.id);
  assert.equal(rt.now().commandRepresentation, 'split');
  assert.equal(rt.now().representationFallback, false);
  assert.equal(matchesStructuredPlaybackControl(rt.now(), { scope: 'from-here', boundary: 'unit', segmentId: b.id }), true);
  rt.events[0].end();
  await until(() => rt.events.length === 2);
  assert.equal(rt.now().channel, 'meaning');
  rt.events[1].end();
  await rt.settled();
  assert.deepEqual(rt.resume.at(-1), ['cursor', c.id]);
  assert.equal(rt.index(), c.id);
  assert.equal(rt.now().state, 'idle');

  const card = createRuntime();
  const last = c1.segments.at(-1);
  card.structured({ scope: 'from-here', boundary: 'card', startSegmentId: last.id });
  await until(() => card.events.length === 1);
  assert.equal(card.next(), true);
  assert.equal(card.events.length, 1);
  card.events[0].end();
  await card.settled();
  assert.deepEqual(card.resume.at(-1), ['cursor', last.id]);

  const repeat = createRuntime();
  repeat.structured({ scope: 'segment', startSegmentId: c.id, playbackChannelMode: 'text-meaning', repeatMode: 'twice' });
  for (let i = 0; i < 4; i++) {
    await until(() => repeat.events.length === i + 1);
    assert.equal(repeat.now().channel, i % 2 ? 'meaning' : 'text');
    repeat.events[i].end();
  }
  await repeat.settled();
  assert.deepEqual(repeat.resume.at(-1), ['cursor', c.id]);
  const workspace = createRuntime();
  workspace.structured({ scope: 'from-here', boundary: 'document', startSegmentId: c.id });
  assert.equal(workspace.owned().orderedList.findIndex(item => item.id === turn2.segments[0].id), 1);
  workspace.next();
  assert.equal(workspace.owned().cursorSegmentId, turn2.segments[0].id);
  for (const item of c1.segments.slice(c1.segments.findIndex(segment => segment.id === c.id) + 2)) {
    workspace.next();
    assert.equal(workspace.owned().cursorSegmentId, item.id);
  }
  workspace.next();
  assert.equal(workspace.owned().cursorSegmentId, p2.segments[0].id);
  workspace.stop();
  await workspace.settled();
  assert.equal(workspace.events.length, 0, 'Only the latest pending traversal can start');
  console.log('PASS bounded Unit/Card navigation and completion, temporary Split, configured bilingual sequence and repeat');
}

{
  const rt = createRuntime();
  const order = [c1, p2, p1, tree.blocks[3]].flatMap(block => block.segments);
  rt.structured({ scope: 'document', cursorSegmentId: a.id, playbackRepresentationMode: 'full', playbackOrderMode: 'shuffle',
    orderedListOverride: order, playbackChannelMode: 'text-only',
    resolveBlockChannelPlaybackPlan: ({ block }) => ({ steps: block.id === c1.id
      ? block.segments.map(segment => ({ type: 'split-tts', segmentId: segment.id, content: segment.text, channel: 'text' }))
      : [{ type: 'full-local', content: 'full', channel: 'text' }] }),
    playStructuredFullStep: noop
  });
  await until(() => rt.events.length === 1);
  assert.equal(rt.now().representationFallback, true);
  assert.equal(rt.now().queue.kind, 'card');
  assert.equal(rt.owned().orderedList.find(item => item.id === turn2.segments[0].id).blockId, c1.id);
  rt.next();
  assert.equal(rt.owned().blockId, p2.id);
  rt.next();
  assert.equal(rt.owned().blockId, p1.id);
  rt.next('prev');
  assert.equal(rt.owned().blockId, p2.id);
  assert.deepEqual(rt.owned().nowPlayingCardOrder, [c1.id, p2.id, p1.id, tree.blocks[3].id]);
  rt.events[0].end();
  await rt.settled();
  assert.deepEqual(rt.resume.at(-1), ['completed', p1.segments[0].id]);
  const noFullRuntime = createRuntime();
  noFullRuntime.structured({ scope: 'document', cursorSegmentId: b.id, playbackRepresentationMode: 'full' });
  await until(() => noFullRuntime.events.length === 1);
  assert.equal(noFullRuntime.now().segment.id, a.id);
  assert.equal(noFullRuntime.now().representationFallback, true);
  assert.equal(noFullRuntime.now().queue.kind, 'card');
  noFullRuntime.next();
  assert.equal(noFullRuntime.owned().blockId, p2.id);
  noFullRuntime.stop();
  noFullRuntime.events[0].end();
  await noFullRuntime.settled();
  console.log('PASS Full traversal keeps the actual shuffled Card queue during runtime Split fallback and global completion resets historically');
}

{
  const token = ref(1);
  const stopSignalRef = ref(false);
  const currentAudioObjRef = ref(null);
  const playbackResolveRef = ref(null);
  const refs = { playbackSessionRef: token, stopSignalRef, currentAudioObjRef, playbackResolveRef };
  const play = deferred();
  const pendingUrl = deferred();
  const lateTts = [];
  const media = [];
  globalThis.Audio = class {
    constructor(url) { this.url = url; media.push(this); }
    play() { return play.promise; }
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(content) { this.content = content; } };
  const oldLookup = executeAudioSourcePlaybackService({ ...refs, preferLocalAudio: true, getLocalAudioUrl: () => pendingUrl.promise,
    textToRead: 'old Table', part: 'word', selectedIndonesianVoiceRef: ref(null), resolveAudioFallbackVoice: () => null, playTTS: () => lateTts.push(true) });
  token.current++;
  pendingUrl.resolve('obsolete');
  await oldLookup;
  assert.deepEqual(media, []);
  const pauseGate = deferred();
  const pausedLoad = executeStructuredTextRuntimeAudioPlaybackService({ ...refs, url: 'paused-media', waitWhilePaused: () => pauseGate.promise });
  assert.deepEqual(media, [], 'Resolved media waits while paused');
  token.current++;
  pauseGate.resolve();
  assert.equal((await pausedLoad).status, 'stopped');
  assert.deepEqual(media, [], 'Resuming the new owner cannot start the old paused media');
  const notes = [];
  const oldMedia = executeStructuredTextRuntimeAudioPlaybackService({ ...refs, url: 'old-media', addLog: (_, note) => notes.push(note) });
  token.current++;
  const currentUtteranceRef = ref(null);
  const spoken = [];
  const synth = { speak: utterance => spoken.push(utterance), cancel: noop };
  const tts = content => executeBrowserTtsPlaybackService({ ...refs, textToRead: content, currentUtteranceRef, synth,
    ttsReplayRef: ref(null), pauseStateRef: ref(false), onError: reason => lateTts.push(reason) });
  const oldSpeech = tts('old speech');
  await until(() => spoken.length === 1);
  token.current++;
  const newSpeech = tts('new speech');
  await until(() => spoken.length === 2);
  spoken[0].onerror({ type: 'error', error: 'late native error' });
  play.reject(new Error('late media rejection'));
  await oldSpeech;
  assert.equal((await oldMedia).status, 'stopped');
  assert.equal(currentUtteranceRef.current, spoken[1]);
  assert.equal(typeof playbackResolveRef.current, 'function');
  assert.deepEqual(lateTts, []);
  assert.deepEqual(notes, []);
  spoken[1].onend({ type: 'end' });
  await newSpeech;
  assert.equal(playbackResolveRef.current, null);
  delete globalThis.Audio;
  delete globalThis.SpeechSynthesisUtterance;
  console.log('PASS deliberately delayed URL/media rejection and native TTS error cannot re-enter or clear a newer owner');
}

assert.equal(JSON.stringify(fixture.snapshot), initialSnapshot);
