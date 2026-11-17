import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createP13MixedFixture } from './mixed-workspace-fixture.js';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { selectTextMixedReaderState, resolveTextMixedReaderCursor } from '../../../src/domain/text/textMixedReaderDomain.js';
import SharedMixedWorkspaceReader from '../../../src/components/text/presentation/SharedMixedWorkspaceReader.jsx';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../src/domain/text/textStructuredSplitFullDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { encodeWAV } from '../../../src/utils/audioUtils.js';

const root = createRoot(document.getElementById('root'));
const tick = () => new Promise(r => requestAnimationFrame(r));
const assert = (value, message) => { if (!value) throw Error(message); };
const until = async (predicate, label = 'condition') => { const end = performance.now() + 4000; while (performance.now() < end) { if (predicate()) return; await tick(); } throw Error('Timed out: ' + label); };
const voices = ['en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-GB-LibbyNeural', 'id-ID-GadisNeural'].map(name => ({ name, lang: name.startsWith('id-') ? 'id-ID' : 'en-GB' }));
let latest, update, generation = 0;
async function mount({ full = false, rate = 1, channel = 'text-only', setup = null, native = false, unsupported = false, speechFailure = false, nativeSpeech = false, isMobile = false } = {}) {
  const data = createP13MixedFixture({ runtimeBindings: true });
  if (setup) await setup(data);
  const source = JSON.stringify(data.snapshot), events = [], statuses = [], logs = [], elements = [];
  let cancels = 0, mounts = 0, unmounts = 0;
  const config = { preferences: data.preferences, playbackRepresentationMode: full ? 'full' : 'split', globalPlaybackRate: rate, playbackChannelMode: channel };
  const hooks = { speechSynth: { getVoices: () => voices, speak() {}, pause() {}, resume() {}, cancel() { cancels++; } },
    onPlaybackStep: status => statuses.push(status), onLog: log => logs.push(log),
    executeBrowserTts: args => new Promise(resolve => events.push({ kind: 'tts', args, finish: resolve })),
    executeRuntimeAudio: args => new Promise(resolve => events.push({ kind: 'local', args, finish: resolve })) };
  if (unsupported) { delete hooks.speechSynth.speak; delete hooks.executeBrowserTts; }
  if (speechFailure) {
    delete hooks.executeBrowserTts;
    hooks.speechSynth.speak = utterance => { events.push({ kind: 'native-tts-error', args: utterance, finish() {} }); setTimeout(() => utterance.onerror?.({ error: 'synthesis-failed' }), 0); };
  }
  if (nativeSpeech) {
    delete hooks.executeBrowserTts;
    hooks.speechSynth.speak = utterance => events.push({ kind: 'native-tts', args: utterance, finish: () => utterance.onend?.({ type: 'end' }) });
  }
  const originalAudio = window.Audio;
  if (native) {
    delete hooks.executeRuntimeAudio;
    window.Audio = function Audio(url) { const element = new originalAudio(url); elements.push(element); return element; };
  }
  const runtimeFullAudio = data.runtimeFullAudio || {};
  function Harness() {
    const [model, change] = useState({ snapshot: data.snapshot, documentId: data.ids.documentId, config });
    const [view, setView] = useState(undefined);
    const selection = useMemo(() => selectTextMixedReaderState(model.snapshot, { documentId: model.documentId }), [model.snapshot, model.documentId]);
    const audio = useConversationAudioPlayback({ snapshot: model.snapshot, documentTree: selection.documentTree, runtimeAudioUrls: data.runtimeAudioUrls,
      runtimeFullAudio, audioConfig: model.config, availableBrowserVoices: speechFailure || nativeSpeech ? [] : voices, audioRuntimeHooks: hooks, isMobile });
    useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    useEffect(() => { latest = { ...model, audio, selection, cursor: resolveTextMixedReaderCursor({ presentation: selection.presentation, audioPlayback: audio }) }; update = change; }, [model, audio, selection]);
    return <SharedMixedWorkspaceReader snapshot={model.snapshot} documentId={model.documentId} audioPlayback={audio} presentationState={view} onPresentationStateChange={setView} />;
  }
  latest = null; root.render(<React.StrictMode><Harness key={++generation} /></React.StrictMode>);
  await until(() => latest?.snapshot === data.snapshot);
  return { data, events, statuses, logs, elements, get host() { return latest; }, get cancels() { return cancels; }, get lifecycle() { return [mounts, unmounts]; }, change: fn => update(fn),
    dispose: async () => { latest.audio.stopPlayback(); events.forEach(e => e.finish({ status: 'stopped' })); root.render(null); await tick(); window.Audio = originalAudio;
      (data.urls || []).forEach(url => URL.revokeObjectURL(url)); assert(JSON.stringify(data.snapshot) === source, 'Fixture mutated'); } };
}

const addFull = (data, blockId, { composed = false, rate = 1, url } = {}) => {
  const { documentTree } = selectTextMixedReaderState(data.snapshot, { documentId: data.ids.documentId });
  const block = documentTree.blocks.find(b => b.id === blockId);
  const p = buildTextStructuredBlockRuntimePlaybackPlan({ documentTree, block, preferences: data.preferences, globalPlaybackRate: rate });
  const artifact = buildTextStructuredFullArtifactRecord({ block, voiceId: data.preferences.edgeTextVoiceId, language: documentTree.textLanguage,
    ...(composed ? { composition: p.composition } : {}) });
  data.snapshot = applyTextLibraryCommand(data.snapshot, { type: 'fullAudioArtifact.upsert', payload: { blockId, artifact } }, 2700).snapshot;
  data.runtimeFullAudio = { [artifact.id]: { url, fullArtifactFingerprint: artifact.id } };
};
const wavFixture = async data => {
  // Real Web Audio render -> existing WAV encoder -> real HTMLAudioElement.
  const context = new OfflineAudioContext(1, 48000, 48000), oscillator = context.createOscillator(), gain = context.createGain();
  gain.gain.value = 0.01; oscillator.frequency.value = 220;
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(1);
  const buffer = await context.startRendering();
  const samples = Int16Array.from(buffer.getChannelData(0), v => Math.round(v * 32767));
  const blob = new Blob([encodeWAV(samples, buffer.sampleRate)], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob); data.urls = [url]; data.wavInfo = { sampleRate: buffer.sampleRate, frames: buffer.length, bytes: blob.size };
  for (const id of Object.keys(data.runtimeAudioUrls)) data.runtimeAudioUrls[id] = { ...data.runtimeAudioUrls[id], url };
  return url;
};
const drain = async h => {
  let completed = 0;
  while (!h.logs.some(l => l.message === 'Structured Text playback finished.')) {
    await until(() => h.events.length > completed || h.logs.some(l => l.message === 'Structured Text playback finished.'), 'Next playback step or completion');
    if (h.events.length <= completed) break;
    const event = h.events[completed], step = event.args.step, segmentId = step?.segmentId || null;
    await until(() => h.host.cursor.precision === (segmentId ? 'segment' : 'card') && h.host.cursor.cardId === step.blockId
      && h.host.cursor.segmentId === segmentId && h.host.cursor.channel === step.channel, `Authoritative cursor commit ${step.blockId}/${segmentId}/${step.channel}`);
    assert(h.host.cursor.segmentId === segmentId, 'Incorrect audible identity');
    if (segmentId) assert(h.host.cursor.unitId === h.host.selection.presentation.segmentById[segmentId].unitId, 'Wrong Section/Turn cursor');
    event.finish({ status: 'played' }); completed++;
    assert(completed < 200, 'Unexpected playback loop');
  }
  await until(() => !h.host.audio.isPlaying);
  return h.events;
};

export async function runP13BrowserCases() {
  const results = [], binaryEvidence = []; let h;
  const run = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.stack }); } finally { if (h) { await h.dispose(); h = null; } } };
  await run('A4-FULL-01: real D5 host executes Paragraph Full TTS at truthful Card precision', async () => {
    h = await mount({ full: true }); h.host.audio.playScene(h.data.ids.afterCardId);
    await until(() => h.events.length > 0 || h.logs.some(l => l.message === 'Structured Text playback finished.'), 'Full invocation or explicit completion');
    assert(h.events.length === 1, `Nonempty Paragraph Full produced ${h.events.length} audio invocations`);
    await until(() => h.host.cursor.precision === 'card');
    assert(h.host.cursor.segmentId === null && h.host.cursor.unitId === null && h.host.cursor.cardId === h.data.ids.afterCardId, 'Fabricated Full Sentence cursor');
    assert(h.events[0].args.textToRead === 'The conversation ended quietly.', 'Wrong Full content');
  });
  await run('A4-RATE-01: real D5 host applies 1.5x to Paragraph Split local audio', async () => {
    h = await mount({ rate: 1.5 }); h.host.audio.playSentence(h.data.ids.beforeSentenceId); await until(() => h.events.length === 1);
    assert(h.events[0].kind === 'local' && h.events[0].args.playbackRate === 1.5, `Requested 1.5; observed ${h.events[0].args.playbackRate}`);
  });
  await run('Unavailable speech API reports an explicit unavailable source, not an audible cursor', async () => {
    h = await mount({ full: true, unsupported: true }); h.host.audio.playScene(h.data.ids.afterCardId);
    await until(() => h.logs.some(l => l.message === 'Structured Text playback finished.'));
    await until(() => h.host.audio.playbackSourceStatus !== null);
    assert(h.events.length === 0 && h.host.audio.playbackSourceStatus.source === 'unavailable', 'Missing API did not report unavailable');
    assert(h.host.cursor.precision === 'none' && h.logs.some(l => l.tag === 'Warn'), 'Unavailable source highlighted or silent');
  });
  await run('Native speech synthesis failure reports unavailable/error and clears audible precision', async () => {
    h = await mount({ full: true, speechFailure: true }); h.host.audio.playScene(h.data.ids.afterCardId);
    await until(() => h.logs.some(l => l.message === 'Structured Text playback finished.'));
    await until(() => h.host.audio.playbackSourceStatus !== null);
    await until(() => !h.host.audio.isPlaying, 'Failed utterance completion committed');
    assert(h.events.length === 1 && h.host.audio.playbackSourceStatus.source === 'unavailable', 'Failed native utterance was reported as playable');
    assert(h.logs.some(l => l.tag === 'Error'), 'No explicit speech failure');
  });
  await run('Paragraph → Scene → Paragraph → Scene traversal across Split/Full and all four EN/ID channel orders', async () => {
    for (const full of [false, true]) for (const channel of ['text-only', 'meaning-only', 'text-meaning', 'meaning-text']) {
      h = await mount({ full, rate: 1.5, channel }); h.host.audio.playWorkspace();
      const events = await drain(h), steps = events.map(e => e.args.step), cards = h.host.selection.documentTree.blocks.filter(b => b.segments.some(s => s.text.trim()));
      const cardOrder = steps.map(s => s.blockId).filter((id, i, list) => i === 0 || list[i - 1] !== id);
      assert(JSON.stringify(cardOrder) === JSON.stringify(cards.map(b => b.id)), 'Interleaved global order changed');
      const channels = channel === 'text-only' ? ['text'] : channel === 'meaning-only' ? ['meaning'] : channel === 'meaning-text' ? ['meaning', 'text'] : ['text', 'meaning'];
      for (const card of cards) {
        const actual = steps.filter(s => s.blockId === card.id);
        if (!full) {
          const expected = card.segments.flatMap(s => channels.filter(ch => s[ch].trim()).map(ch => [s.id, ch]));
          assert(JSON.stringify(actual.map(s => [s.segmentId, s.channel])) === JSON.stringify(expected), 'Split Sentence/channel sequence');
        } else {
          assert(JSON.stringify(actual.map(s => s.channel).filter((ch, i, list) => i === 0 || ch !== list[i - 1])) === JSON.stringify(channels), 'Full Card/channel sequence');
          for (const ch of channels) {
            const group = actual.filter(s => s.channel === ch);
            if (group.some(s => !s.segmentId)) assert(group.length === 1 && group[0].type === 'full-tts', 'Whole-Card Full duplicated');
            else assert(JSON.stringify(group.map(s => s.segmentId)) === JSON.stringify(card.segments.filter(s => s[ch].trim()).map(s => s.id)), 'Full fallback Sentence sequence');
          }
        }
      }
      for (const event of events) {
        const step = event.args.step;
        assert(event.args.playbackRate === 1.5, 'Rate lost during traversal');
        if (step.channel === 'text' && step.speakerId) {
          const expected = step.speaker === 'Bob' ? 'en-GB-SoniaNeural' : 'en-GB-RyanNeural';
          const voice = event.kind === 'local' ? step.runtimeAudio.variant.voiceId : event.args.targetVoiceName;
          assert(voice === expected, 'Speaker voice lost in Mixed traversal');
        }
      }
      assert(h.host.cursor.precision === 'none', 'Completed session still audible');
      await h.dispose(); h = null;
    }
  });
  await run('Pause/resume/stop/restart and passive reading changes preserve one session and never duplicate completed Sentences', async () => {
    h = await mount({ full: true }); h.host.audio.playScene(h.data.ids.beforeCardId); await until(() => h.events.length === 1);
    const session = h.host.audio.readPresentationPlaybackScope().sessionId, cancels = h.cancels, lifecycle = JSON.stringify(h.lifecycle);
    for (const level of ['part', 'segment', 'full']) {
      document.querySelector(`[data-shared-card-level-option="${level}"]`).click(); await tick();
      assert(h.host.audio.readPresentationPlaybackScope().sessionId === session && h.cancels === cancels && JSON.stringify(h.lifecycle) === lifecycle, 'Reading change remounted or cancelled host');
    }
    h.host.audio.pausePlayback(); await until(() => h.host.audio.isPaused); h.events[0].finish({ status: 'played' });
    await new Promise(r => setTimeout(r, 160)); assert(h.events.length === 1, 'Advanced while paused');
    h.host.audio.resumePlayback(); await until(() => h.events.length === 2);
    assert(h.events[1].args.step.segmentId !== h.events[0].args.step.segmentId, 'Completed Sentence replayed');
    h.host.audio.stopPlayback(); await until(() => h.host.cursor.precision === 'none');
    h.host.audio.playScene(h.data.ids.afterCardId); await until(() => h.events.length === 3);
    h.events[1].finish({ status: 'played' }); await tick(); await tick();
    assert(h.events.length === 3 && h.host.cursor.cardId === h.data.ids.afterCardId, 'Old recovery escaped after restart');
  });
  await run('Workspace, snapshot, representation and rate changes cancel stale callbacks without remounting the host', async () => {
    for (const change of ['workspace', 'edit', 'reorder', 'representation', 'rate', 'channel-rate-inheritance']) {
      h = await mount({ full: true, setup: data => { data.preferences = { ...data.preferences, browserTextRate: 1.4, browserMeaningRate: 0.8, browserRatesLinked: false }; } });
      h.host.audio.playScene(h.data.ids.afterCardId); await until(() => h.events.length === 1);
      const lifecycle = JSON.stringify(h.lifecycle), old = h.events[0];
      h.change(model => {
        if (change === 'workspace') return { ...model, documentId: h.data.ids.mixedDocumentId };
        if (change === 'representation') return { ...model, config: { ...model.config, playbackRepresentationMode: 'split' } };
        if (change === 'rate') return { ...model, config: { ...model.config, globalPlaybackRate: 1.5 } };
        if (change === 'channel-rate-inheritance') return { ...model, config: { ...model.config, globalPlaybackRate: null } };
        const command = change === 'edit' ? { type: 'segment.update', payload: { id: h.data.ids.beforeSentenceId, text: 'Invalidates old rendering.' } }
          : { type: 'block.reorder', payload: { documentId: model.documentId, orderedIds: [...h.data.cardOrder].reverse() } };
        return { ...model, snapshot: applyTextLibraryCommand(model.snapshot, command, 2800).snapshot };
      });
      await until(() => !h.host.audio.isPlaying && h.host.cursor.precision === 'none'); old.finish({ status: 'played' }); await tick(); await tick();
      assert(h.events.length === 1 && JSON.stringify(h.lifecycle) === lifecycle, 'Stale work escaped or host remounted');
      if (change === 'edit') {
        h.host.audio.playSentence(h.data.ids.beforeSentenceId); await until(() => h.events.length === 2);
        assert(h.events[1].kind === 'tts', 'Edited Sentence reused old RF');
      }
      if (change === 'reorder') {
        h.host.audio.playWorkspace(); await until(() => h.events.length === 2);
        assert(h.events[1].args.step.blockId === h.data.ids.laterSceneId, 'Restart ignored the accepted Card reorder');
      }
      await h.dispose(); h = null;
    }
  });
  await run('Real Web Audio WAV -> native Split HTMLAudioElement applies 1.5x and true pause/resume', async () => {
    h = await mount({ native: true, rate: 1.5, setup: wavFixture }); h.host.audio.playSentence(h.data.ids.beforeSentenceId);
    await until(() => h.elements[0]?.currentTime > 0 && !h.elements[0].paused, 'Native local binary starts');
    const element = h.elements[0]; assert(element instanceof HTMLAudioElement && element.playbackRate === 1.5, 'Native rate was not applied');
    h.host.audio.pausePlayback(); await until(() => element.paused); const position = element.currentTime;
    await new Promise(r => setTimeout(r, 120)); assert(Math.abs(element.currentTime - position) < 0.02, 'Native audio advanced while paused');
    h.host.audio.resumePlayback(); await until(() => element.currentTime > position + 0.02); await until(() => element.ended && !h.host.audio.isPlaying);
    assert(h.elements.length === 1 && h.events.length === 0, 'Native Split duplicated or fell back');
    binaryEvidence.push({ kind: 'split', ...h.data.wavInfo, duration: element.duration, playbackRate: element.playbackRate, ended: element.ended });
  });
  await run('Native raw Full cache uses physical 1.5x; composed Full with baked 1.5x inputs uses physical 1x', async () => {
    for (const composed of [false, true]) {
      h = await mount({ native: true, full: true, rate: 1.5, setup: async data => { const url = await wavFixture(data); addFull(data, composed ? data.ids.sceneId : data.ids.afterCardId, { composed, rate: 1.5, url }); } });
      const id = composed ? h.data.ids.sceneId : h.data.ids.afterCardId;
      h.host.audio.playScene(id); await until(() => h.elements[0]?.currentTime > 0 && h.host.cursor.precision === 'card');
      const element = h.elements[0]; assert(element.playbackRate === (composed ? 1 : 1.5), 'Cached Full rate applied twice or lost');
      assert(h.host.cursor.cardId === id && h.host.cursor.segmentId === null, 'Cached Full invented Sentence timing');
      await until(() => element.ended && !h.host.audio.isPlaying);
      assert(h.elements.length === 1 && h.events.length === 0, 'Verified Full was not reused');
      binaryEvidence.push({ kind: composed ? 'composed-full' : 'raw-full', ...h.data.wavInfo, duration: element.duration, playbackRate: element.playbackRate, ended: element.ended });
      await h.dispose(); h = null;
    }
  });
  await run('Physically unusable cached Full decodes to error then recovers local Split/TTS in order without metadata writes', async () => {
    h = await mount({ native: true, full: true, rate: 1.5, setup: async data => {
      await wavFixture(data); const bad = URL.createObjectURL(new Blob(['invalid-audio-binary'], { type: 'audio/wav' })); data.urls.push(bad);
      addFull(data, data.ids.beforeCardId, { url: bad });
    } });
    h.host.audio.playScene(h.data.ids.beforeCardId); await until(() => h.elements.length === 2 && h.elements[1].currentTime > 0);
    assert(h.elements[0].error && h.host.cursor.precision === 'segment', 'Native Full error did not enter truthful recovery');
    await until(() => h.events.length === 1); h.events[0].finish({ status: 'played' }); await until(() => h.events.length === 2); h.events[1].finish({ status: 'played' });
    await until(() => !h.host.audio.isPlaying);
    assert(h.elements.length === 2 && h.events.every(e => e.kind === 'tts' && e.args.playbackRate === 1.5), 'Recovery duplicated native or lost rate');
    assert(h.events[0].args.step.segmentId === h.data.ids.blankMeaningId, 'Recovery order skipped or replayed first local Sentence');
    binaryEvidence.push({ kind: 'corrupt-full-recovery', errorCode: h.elements[0].error.code, localEnded: h.elements[1].ended, ttsCount: h.events.length });
  });
  return { results, binaryEvidence, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, indexedDbCalls: window.__p13DbCalls, storageCalls: window.__p13StorageCalls };
}
export const runP13AudioDiagnostics = async () => ({ suite: 'P13-A4 explicit assertion regressions' });
export { mount as mountP13AudioAudit, addFull as addP13FullFixture, wavFixture as prepareP13WavFixture };
