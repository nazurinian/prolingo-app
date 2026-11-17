import assert from 'node:assert/strict';
import { executeBrowserTtsPlaybackService } from '../src/services/audio/audioPlaybackSideEffectService.js';
import { executePausePlayback, executeResumePlayback } from '../src/services/playback/playbackRuntimeControlService.js';
import { createP13MixedFixture } from './fixtures/p13-mixed/mixed-workspace-fixture.js';
import { selectTextMixedReaderState } from '../src/domain/text/textMixedReaderDomain.js';
import { applyTextMixedEditorCommand } from '../src/domain/text/textMixedEditorDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';

let passed = 0, failed = 0, storageCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { storageCalls++; throw Error('A5 forbids canonical storage'); } });
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const test = async (name, fn) => { try { await fn(); passed++; console.log('PASS', name); } catch (error) { failed++; console.error('FAIL', name, error.stack); } };
const until = async predicate => { const deadline = Date.now() + 2000; while (Date.now() < deadline) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); } throw Error('A5 condition did not complete'); };

const speech = ({ observer = false, rateRef = null, useSelectedVoice = false } = {}) => {
  const utterances = [], errors = [], calls = [];
  const refs = { stopSignalRef: { current: false }, pauseStateRef: { current: false }, currentAudioObjRef: { current: null },
    currentUtteranceRef: { current: null }, playbackResolveRef: { current: null }, ttsReplayRef: { current: null }, silentAudioRef: { current: null } };
  const synth = { paused: false, speaking: true, speak: u => utterances.push(u), cancel: () => calls.push('cancel'), pause: () => calls.push('pause'), resume: () => calls.push('resume') };
  const voice = { name: 'unchanged-test-voice' };
  const pending = executeBrowserTtsPlaybackService({ ...refs, synth, textToRead: 'Same persistent Sentence.', overrideVoice: useSelectedVoice ? null : voice, selectedVoiceRef: { current: voice }, rateRef,
    rate: 1.5, pitch: 1.1, ...(observer ? { onError: e => errors.push(e) } : {}) });
  const controls = { ...refs, synth, isPlaying: true, setIsPaused() {}, addLog() {} };
  return { ...refs, synth, voice, utterances, errors, calls, pending,
    pause: mobile => executePausePlayback({ ...controls, isMobile: mobile }), resume: () => executeResumePlayback(controls) };
};

for (const observer of [false, true]) await test(`Android replay ignores old cancellation events before and after replacement (onError=${observer})`, async () => {
  const s = speech({ observer });
  try {
    await until(() => s.utterances.length === 1);
    for (let cycle = 0; cycle < 2; cycle++) {
      const old = s.utterances.at(-1), count = s.utterances.length;
      s.pause(true); old.onerror({ type: 'error', error: 'interrupted' });
      assert.ok(s.ttsReplayRef.current?.suspended, 'Pause prematurely completed the logical Sentence');
      s.resume();
      old.onerror({ type: 'error', error: 'late-cancellation-before-replacement' });
      assert.ok(s.playbackResolveRef.current, 'Old cancellation completed the resumed Sentence before replacement started');
      await until(() => s.utterances.length === count + 1);
      old.onend({ type: 'end' }); old.onerror({ type: 'error', error: 'late-cancellation-after-replacement' });
      assert.ok(s.playbackResolveRef.current, 'Old event completed the active replacement');
      assert.equal(s.currentUtteranceRef.current, s.utterances.at(-1));
      assert.equal(s.utterances.at(-1).voice, s.voice); assert.equal(s.utterances.at(-1).rate, 1.5);
    }
    s.utterances.at(-1).onend({ type: 'end' }); await s.pending;
    assert.deepEqual(s.errors, []);
  } finally { s.playbackResolveRef.current?.(); await s.pending; }
});

await test('Desktop pause/resume and legacy callers without onError keep one utterance and settle normally', async () => {
  const s = speech();
  try {
    await until(() => s.utterances.length === 1); s.pause(false); s.resume();
    assert.equal(s.utterances.length, 1); assert.ok(s.calls.includes('pause') && s.calls.includes('resume'));
    s.utterances[0].onerror({ type: 'error', error: 'synthesis-failed' }); await s.pending;
    assert.equal(s.playbackResolveRef.current, null); assert.deepEqual(s.errors, []);
  } finally { s.playbackResolveRef.current?.(); }
});
await test('Explicit cancellation invalidates deferred speech startup before the same refs are reused', async () => {
  const s = speech({ observer: true }); s.stopSignalRef.current = true; s.playbackResolveRef.current?.();
  s.stopSignalRef.current = false; await s.pending;
  await new Promise(r => setTimeout(r, 30)); // Negative control: startup deferral must never speak.
  assert.equal(s.utterances.length, 0); assert.deepEqual(s.errors, []);
});
await test('Legacy selected voice and live rateRef precedence survive Android replay without onError', async () => {
  const rateRef = { current: 0.8 }, s = speech({ rateRef, useSelectedVoice: true });
  try {
    await until(() => s.utterances.length === 1); assert.equal(s.utterances[0].rate, 0.8);
    s.pause(true); rateRef.current = 1.7; s.resume(); await until(() => s.utterances.length === 2);
    assert.equal(s.utterances[1].voice, s.voice); assert.equal(s.utterances[1].rate, 1.7); assert.equal(s.utterances[1].pitch, 1.1);
    s.utterances[0].onend({ type: 'end' }); assert.ok(s.playbackResolveRef.current);
    s.utterances[1].onend({ type: 'end' }); await s.pending;
  } finally { s.playbackResolveRef.current?.(); await s.pending; }
});

const f = createP13MixedFixture({ runtimeBindings: true }), original = JSON.stringify(f.snapshot);
const selected = selectTextMixedReaderState(f.snapshot);
const block = selected.documentTree.blocks.find(b => b.id === f.ids.afterCardId);
const artifact = buildTextStructuredFullArtifactRecord({ block, language: selected.documentTree.textLanguage, voiceId: f.preferences.edgeTextVoiceId });
const withFull = applyTextLibraryCommand(f.snapshot, { type: 'fullAudioArtifact.upsert', payload: { blockId: block.id, artifact } }, 3000).snapshot;
const fullState = selectTextMixedReaderState(withFull), fullBlock = fullState.documentTree.blocks.find(b => b.id === block.id);
const args = { documentTree: fullState.documentTree, block: fullBlock, preferences: f.preferences, fallbackVoiceId: f.preferences.edgeTextVoiceId,
  language: fullState.documentTree.textLanguage, representationMode: 'full', runtimeFullAudio: { [artifact.id]: { url: 'blob:a5-disposable', fullArtifactFingerprint: artifact.id } } };
for (const [field, value] of [['codecProfile', 'a5-new-codec'], ['rendererVersion', 'a5-new-renderer']]) await test(`Raw Full cache rejects changed ${field} without rewriting stored identities`, () => {
  assert.equal(buildTextStructuredBlockRuntimePlaybackPlan(args).route, 'full-local');
  assert.notEqual(buildTextStructuredBlockRuntimePlaybackPlan({ ...args, [field]: value }).route, 'full-local');
  const matching = buildTextStructuredFullArtifactRecord({ block: fullBlock, language: args.language, voiceId: f.preferences.edgeTextVoiceId, [field]: value });
  const matchedSnapshot = applyTextLibraryCommand(withFull, { type: 'fullAudioArtifact.upsert', payload: { blockId: block.id, artifact: matching } }, 3001).snapshot;
  const matched = selectTextMixedReaderState(matchedSnapshot), matchedBlock = matched.documentTree.blocks.find(b => b.id === block.id);
  const ready = buildTextStructuredBlockRuntimePlaybackPlan({ ...args, documentTree: matched.documentTree, block: matchedBlock, [field]: value,
    runtimeFullAudio: { ...args.runtimeFullAudio, [matching.id]: { url: 'blob:a5-matching', fullArtifactFingerprint: matching.id } } });
  assert.equal(ready.route, 'full-local'); assert.equal(ready.steps[0].runtimeFull.artifact.id, matching.id);
  assert.deepEqual(withFull.blocks.find(b => b.id === block.id).metadata, fullBlock.metadata);
});

await test('Native accepted edits immediately project into Reader; text edits invalidate only text audio and preserve Full/source metadata', () => {
  const id = f.ids.firstSentenceId, before = f.snapshot.segments.find(s => s.id === id);
  const result = applyTextMixedEditorCommand(f.snapshot, { type: 'segment.update', payload: { id, text: 'Edited English only.' } }, { documentId: f.ids.documentId, now: 3100 });
  const reader = selectTextMixedReaderState(result.snapshot);
  assert.equal(reader.presentation.segmentById[id].text, 'Edited English only.');
  const after = result.snapshot.segments.find(s => s.id === id);
  assert.deepEqual([after.uid, after.unitId, after.meaning, after.joinAfter, after.metadata], [before.uid, before.unitId, before.meaning, before.joinAfter, before.metadata]);
  const retained = result.snapshot.audioVariants.filter(a => a.segmentId === id);
  assert.ok(retained.some(a => a.channel === 'text' && a.metadata.contentInvalidatedV1));
  for (const a of retained.filter(a => a.channel === 'meaning')) assert.deepEqual(a, f.snapshot.audioVariants.find(old => old.id === a.id));
  assert.deepEqual(result.snapshot.blocks.find(b => b.id === f.ids.sceneId).metadata, f.snapshot.blocks.find(b => b.id === f.ids.sceneId).metadata);
});
assert.equal(JSON.stringify(f.snapshot), original); assert.equal(storageCalls, 0);
assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
console.log(JSON.stringify({ passed, failed, storageCalls }));
if (failed) process.exitCode = 1;
