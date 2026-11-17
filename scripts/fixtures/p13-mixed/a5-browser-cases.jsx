import { mountP13AudioAudit, addP13FullFixture, prepareP13WavFixture } from './audio-browser-cases.jsx';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { executeBrowserTtsPlaybackService } from '../../../src/services/audio/audioPlaybackSideEffectService.js';
import { executePausePlayback, executeResumePlayback } from '../../../src/services/playback/playbackRuntimeControlService.js';

const tick = () => new Promise(r => requestAnimationFrame(r));
const assert = (value, message) => { if (!value) throw Error(message); };
const until = async (predicate, label = 'condition') => { const deadline = performance.now() + 4000; while (performance.now() < deadline) { if (predicate()) return; await tick(); } throw Error('A5 timed out: ' + label); };

export async function runP13BrowserCases() {
  const results = [], evidence = []; let h;
  const run = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.stack }); } finally { if (h) { await h.dispose(); h = null; } } };
  for (const full of [true, false]) await run(`D5 ${full ? 'whole-Card Full' : 'Sentence Split'} survives late Android cancellation before and after replay`, async () => {
    h = await mountP13AudioAudit({ full, rate: 1.5, nativeSpeech: true, isMobile: true, setup: data => { data.runtimeAudioUrls = {}; } });
    const id = full ? h.data.ids.afterCardId : h.data.ids.firstSentenceId;
    if (full) h.host.audio.playScene(id); else h.host.audio.playSentence(id);
    await until(() => h.events.length === 1 && h.host.cursor.precision === (full ? 'card' : 'segment'));
    const session = h.host.audio.readPresentationPlaybackScope().sessionId, old = h.events[0].args;
    h.host.audio.pausePlayback(); await until(() => h.host.audio.isPaused);
    old.onerror({ type: 'error', error: 'interrupted' });
    h.host.audio.resumePlayback(); old.onerror({ type: 'error', error: 'late-interruption-before-replacement' });
    await until(() => h.events.length === 2 || h.logs.some(l => l.message === 'Structured Text playback finished.'), 'Replacement or premature completion');
    assert(h.events.length === 2, 'Old Android cancellation completed the resumed logical Sentence');
    const fresh = h.events[1].args;
    old.onend({ type: 'end' }); old.onerror({ type: 'error', error: 'late-interruption-after-replacement' });
    await tick(); await tick();
    assert(h.host.audio.isPlaying && h.host.audio.readPresentationPlaybackScope().sessionId === session, 'Old native event ended the active replay');
    assert(fresh.text === old.text && fresh.rate === 1.5, 'Replay changed content or rate');
    assert(h.host.cursor.precision === (full ? 'card' : 'segment'), 'Replay invented or lost cursor precision');
    assert(!h.logs.some(l => l.tag === 'Error'), 'Old cancellation incorrectly reported a current speech error');
    if (full) fresh.onend({ type: 'end' }); else fresh.onerror({ type: 'error', error: 'current-synthesis-failed' });
    await until(() => !h.host.audio.isPlaying);
    assert(h.host.cursor.precision === 'none', 'Completed or unavailable speech stayed audible');
    if (!full) assert(h.host.audio.playbackSourceStatus.source === 'unavailable' && h.logs.some(l => l.tag === 'Error'), 'Current speech error was suppressed');
    evidence.push({ full, nativeUtterances: h.events.length, rate: fresh.rate, finalPrecision: h.host.cursor.precision });
  });
  await run('Shared Browser TTS legacy caller without onError retains Android replay and default voice', async () => {
    const utterances = [], refs = { stopSignalRef: { current: false }, pauseStateRef: { current: false }, currentAudioObjRef: { current: null },
      currentUtteranceRef: { current: null }, playbackResolveRef: { current: null }, ttsReplayRef: { current: null }, silentAudioRef: { current: null } };
    const synth = { speaking: true, paused: false, speak: u => utterances.push(u), cancel() {}, pause() {}, resume() {} };
    const promise = executeBrowserTtsPlaybackService({ ...refs, synth, textToRead: 'Legacy same part.', rate: 1.2, pitch: 1 });
    try {
      await until(() => utterances.length === 1);
      const controls = { ...refs, synth, isPlaying: true, setIsPaused() {}, addLog() {} };
      executePausePlayback({ ...controls, isMobile: true }); executeResumePlayback(controls);
      utterances[0].onerror({ type: 'error', error: 'late-cancel' });
      await until(() => utterances.length === 2 || !refs.playbackResolveRef.current);
      assert(utterances.length === 2 && refs.playbackResolveRef.current, 'Legacy replay was completed by the old utterance');
      assert(utterances[1].voice === null && utterances[1].voice === utterances[0].voice
        && utterances[1].rate === utterances[0].rate && Math.abs(utterances[1].rate - 1.2) < 1e-6, 'Legacy speech defaults changed');
      evidence.push({ legacy: true, firstRate: utterances[0].rate, replayRate: utterances[1].rate, voice: utterances[1].voice });
      utterances[1].onend({ type: 'end' }); await promise;
    } finally { refs.playbackResolveRef.current?.(); await promise; }
  });
  await run('Raw Full rejects changed codec/renderer while retaining the exact artifact and binary metadata', async () => {
    h = await mountP13AudioAudit({ full: true, native: true, setup: async data => { const url = await prepareP13WavFixture(data); addP13FullFixture(data, data.ids.afterCardId, { url }); } });
    const documentTree = h.host.selection.documentTree, block = documentTree.blocks.find(b => b.id === h.data.ids.afterCardId);
    const args = { documentTree, block, language: documentTree.textLanguage, preferences: h.data.preferences, representationMode: 'full', runtimeFullAudio: h.data.runtimeFullAudio };
    assert(buildTextStructuredBlockRuntimePlaybackPlan(args).route === 'full-local', 'Baseline raw Full is not ready');
    for (const [field, value] of [['codecProfile', 'a5-new-codec'], ['rendererVersion', 'a5-new-renderer']]) assert(buildTextStructuredBlockRuntimePlaybackPlan({ ...args, [field]: value }).route !== 'full-local', 'Raw Full ignored ' + field);
  });
  return { results, evidence, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length,
    indexedDbCalls: window.__p13DbCalls, storageCalls: window.__p13StorageCalls };
}
export const runP13AudioDiagnostics = async () => ({ suite: 'P13-A5 independent lifecycle and render-configuration regressions' });
