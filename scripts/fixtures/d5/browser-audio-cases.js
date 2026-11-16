import { createD5AudioFixture } from './conversation-audio-fixture.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildDerivedTextConversationFullAudioWav } from '../../../src/services/audio/textStructuredFullAudioExportService.js';
import { executeStructuredTextPlaybackSessionService } from '../../../src/services/playback/textStructuredPlaybackSessionService.js';

const wav = amplitude => {
  const frames = 240; const buffer = new ArrayBuffer(44 + frames * 2); const view = new DataView(buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  view.setUint32(4, buffer.byteLength - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, amplitude, true);
  return new Blob([buffer], { type: 'audio/wav' });
};

export const runD5AudioBrowserCases = async () => {
  const original = window.indexedDB; let indexedDbCalls = 0;
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: new Proxy({}, { get() { indexedDbCalls++; throw Error('D5 forbids database access'); } }) });
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, error: error.stack }); } };
  const fixture = createD5AudioFixture();
  const documentTree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const block = documentTree.blocks.find(b => b.id === fixture.ids.sceneId);
  const args = { documentTree, block, preferences: fixture.preferences, audioVariants: fixture.snapshot.audioVariants, runtimeAudioUrls: fixture.runtimeAudioUrls };
  try {
    await test('real Web Audio decode composes every Sentence in Speaker order at the fingerprinted output rate', async () => {
      const plan = buildTextStructuredBlockRuntimePlaybackPlan({ ...args, representationMode: 'full' });
      const blobs = plan.entries.map(entry => wav(entry.speaker === 'Bob' ? -6000 : 6000));
      const composed = await buildDerivedTextConversationFullAudioWav({ plan, blobs });
      const bytes = new DataView(await composed.blob.arrayBuffer());
      assert(composed.segmentCount === 4 && composed.sampleRate === 48000, 'Missing input or wrong output rate');
      assert(bytes.getUint32(24, true) === 48000 && bytes.getUint32(40, true) === 4 * 240 * 2, 'Incorrect WAV layout');
      assert(bytes.getInt16(44, true) > 0 && bytes.getInt16(bytes.byteLength - 2, true) < 0, 'Speaker sequence changed during composition');
      assert(composed.fullArtifactRequirement.fullArtifactFingerprint === plan.fullArtifactRequirement.fullArtifactFingerprint, 'File is not tied to its plan');
    });
    await test('browser blobs do not make missing RF metadata or zero bytes playable', async () => {
      const runtimeAudioUrls = Object.fromEntries(Object.keys(fixture.runtimeAudioUrls).map(id => [id, { blob: wav(1000) }]));
      assert(buildTextStructuredBlockRuntimePlaybackPlan({ ...args, runtimeAudioUrls }).localCount === 4, 'Valid blob bindings not recognized');
      assert(buildTextStructuredBlockRuntimePlaybackPlan({ ...args, runtimeAudioUrls, audioVariants: [] }).localCount === 0, 'Unbound physical data implied readiness');
      const empty = Object.fromEntries(Object.keys(runtimeAudioUrls).map(id => [id, { blob: new Blob([]) }]));
      assert(buildTextStructuredBlockRuntimePlaybackPlan({ ...args, runtimeAudioUrls: empty }).localCount === 0, 'Empty blob implied readiness');
    });
    await test('existing session honors pause, stop and resume scopes across Turn boundaries', async () => {
      for (const resume of [false, true]) {
        const calls = []; let pending; let release;
        const paused = new Promise(resolve => { release = resolve; });
        const stopSignalRef = { current: false }; const playbackSessionRef = { current: 7 };
        executeStructuredTextPlaybackSessionService({ documentTree, scope: resume ? 'from-here' : 'document', startSegmentId: resume ? fixture.ids.secondSentenceId : null,
          playbackChannelMode: 'text-only', playbackRepresentationMode: 'full', safePlayTransition: fn => { pending = fn(); },
          playbackSessionRef, stopSignalRef, pauseStateRef: { current: false }, silentAudioRef: { current: null }, playbackContextRef: { current: null },
          setIsPlaying() {}, setIsPaused() {}, setPlayingContext() {}, setPlayingIndex() {}, setCurrentIndex() {}, setSpeakingPart() {}, forceStopAll() {},
          waitWhilePaused: () => paused,
          resolveBlockChannelPlaybackPlan: scope => buildTextStructuredBlockRuntimePlaybackPlan({ ...args, block: scope.fullBlock, segmentIds: scope.segmentIds, allowFullArtifact: scope.allowFullArtifact, representationMode: 'full' }),
          playStructuredFullStep: async () => { throw Error('Unexpected Full artifact'); },
          playStructuredChannel: async (_text, item) => { calls.push(item.id); if (!resume && calls.length === 2) stopSignalRef.current = true; }
        });
        await Promise.resolve(); assert(calls.length === 0, 'Pause gate was ignored'); release(); await pending;
        const expected = resume ? [fixture.ids.secondSentenceId, documentTree.blocks[0].segments[2].id, fixture.ids.bobSentenceId] : [fixture.ids.firstSentenceId, fixture.ids.secondSentenceId];
        assert(JSON.stringify(calls) === JSON.stringify(expected), 'Stop/resume scope lost or repeated a Sentence');
      }
    });
  } finally { Object.defineProperty(window, 'indexedDB', { configurable: true, value: original }); }
  return { browser: navigator.userAgent, results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, indexedDbCalls };
};
