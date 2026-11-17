import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createP13MixedFixture } from './fixtures/p13-mixed/mixed-workspace-fixture.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan as plan } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { resolveTextStructuredEffectivePlaybackRate } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';
import { buildTextStructuredVoiceOverrideMetadata } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { executeBrowserTtsPlaybackService } from '../src/services/audio/audioPlaybackSideEffectService.js';

// Resolve the same extensionless legacy imports as Vite; keep React external so
// server rendering and the hook share the real React dispatcher.
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/text/conversation/useConversationAudioPlayback.js', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const hookModule = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), hookModule, hookModule.exports);
const { useConversationAudioPlayback } = hookModule.exports;

let passed = 0, failed = 0, storageCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { storageCalls++; throw Error('No canonical storage'); } });
globalThis.SpeechSynthesisUtterance = class {};
const test = async (name, fn) => { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.error('FAIL', name, e.stack); } };
const until = async predicate => { const end = Date.now() + 3000; while (Date.now() < end) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Playback did not settle'); };
const f = createP13MixedFixture({ runtimeBindings: true }), tree = resolveTextLibraryDocumentTree(f.snapshot, f.ids.documentId);
const originalSnapshot = JSON.stringify(f.snapshot);
const paragraph = tree.blocks.find(b => b.id === f.ids.afterCardId);
const opts = { documentTree: tree, block: paragraph, preferences: f.preferences, audioVariants: f.snapshot.audioVariants, runtimeAudioUrls: f.runtimeAudioUrls };

// Server rendering instantiates the actual React hook for pure runtime callbacks;
// browser tests below separately verify render/effect/session cursor behavior.
const runHost = async ({ blockId, segmentId, representation = 'split', rate = 1, fixture = f, channel = 'text-only', bindings = fixture.runtimeAudioUrls, fullBindings = {}, failFull = false }) => {
  const events = [], statuses = [], logs = []; let host;
  function Probe() {
    host = useConversationAudioPlayback({ snapshot: fixture.snapshot,
      documentTree: resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId), runtimeAudioUrls: bindings, runtimeFullAudio: fullBindings,
      availableBrowserVoices: [], audioConfig: { preferences: fixture.preferences, playbackRepresentationMode: representation, playbackChannelMode: channel, globalPlaybackRate: rate },
      audioRuntimeHooks: { speechSynth: { speak() {}, cancel() {}, getVoices: () => [] }, onLog: entry => logs.push(entry), onPlaybackStep: status => statuses.push(status),
        executeBrowserTts: async args => { events.push({ kind: 'tts', ...args }); },
        executeRuntimeAudio: async args => { events.push({ kind: 'local', ...args }); return { status: failFull && args.step.type === 'full-local' ? 'error' : 'played' }; } }
    });
    return null;
  }
  renderToString(React.createElement(Probe));
  if (segmentId) host.playSentence(segmentId); else host.playScene(blockId);
  await until(() => logs.some(l => l.message === 'Structured Text playback finished.'));
  return { events, statuses, logs };
};

await test('A4-FULL-01: actual D5 host executes a Paragraph whole-Card Full TTS step without a fabricated Sentence', async () => {
  const p = plan({ ...opts, representationMode: 'full' });
  assert.equal(p.steps[0].type, 'full-tts'); assert.equal(p.steps[0].segmentId, null);
  const result = await runHost({ blockId: paragraph.id, representation: 'full' });
  assert.equal(result.events.length, 1, 'Nonempty Full Card must invoke audio');
  assert.equal(result.events[0].textToRead, p.fullRepresentation.content);
  assert.equal(result.statuses[0].segmentId, null);
  const block = tree.blocks.find(b => b.id === f.ids.beforeCardId);
  const whole = await runHost({ blockId: block.id, representation: 'full', bindings: {} });
  const expected = plan({ ...opts, block, representationMode: 'full', runtimeAudioUrls: {} });
  assert.equal(whole.events.length, 1); assert.equal(whole.events[0].textToRead, expected.fullRepresentation.content);
  assert.equal(whole.statuses[0].segmentId, null);
});
await test('A4-RATE-01: actual D5 Paragraph Split local playback applies 1.5x', async () => {
  const result = await runHost({ segmentId: f.ids.beforeSentenceId, rate: 1.5 });
  assert.equal(result.events[0].kind, 'local'); assert.equal(result.events[0].playbackRate, 1.5);
  const manual = await runHost({ segmentId: f.ids.beforeSentenceId, representation: 'full', rate: 1.5 });
  assert.equal(manual.events.length, 1); assert.equal(manual.events[0].step.representation, 'split');
  assert.equal(manual.statuses[0].segmentId, f.ids.beforeSentenceId);
});
await test('A4-RATE-01: planner carries the existing P9 effective rate for local and TTS steps', () => {
  const block = tree.blocks.find(b => b.id === f.ids.beforeCardId);
  const p = plan({ ...opts, block, globalPlaybackRate: 1.5 });
  for (const step of p.steps) assert.equal(step.playbackRate, resolveTextStructuredEffectivePlaybackRate({ documentTree: tree, block, segment: block.segments.find(s => s.id === step.segmentId), globalRate: 1.5 }));
});
await test('Persistent Mixed Paragraph rejects wrong physical RF binding and other voice/generation-rate profiles', () => {
  const block = tree.blocks.find(b => b.id === f.ids.beforeCardId);
  const args = { ...opts, block };
  assert.equal(plan(args).localCount, 1);
  const wrong = { ...f.runtimeAudioUrls, [f.ids.paragraphAudioId]: { url: 'blob:wrong', renderFingerprint: 'rf-sha256-' + '0'.repeat(64) } };
  assert.equal(plan({ ...args, runtimeAudioUrls: wrong }).localCount, 0, 'Wrong physical RF must not play');
  assert.equal(plan({ ...args, preferences: { ...f.preferences, edgeTextVoiceId: 'en-GB-SoniaNeural' } }).localCount, 0, 'Other voice must not play');
  assert.equal(plan({ ...args, preferences: { ...f.preferences, edgeRate: 10 } }).localCount, 0, 'Other render rate must not play');
});
const edit = (fixture, type, payload) => ({ ...fixture, snapshot: applyTextLibraryCommand(fixture.snapshot, { type, payload }, 2500).snapshot });
const withFull = (fixture, blockId, { composed = false, rate = 1 } = {}) => {
  const documentTree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId), block = documentTree.blocks.find(b => b.id === blockId);
  const p = plan({ documentTree, block, preferences: fixture.preferences, globalPlaybackRate: rate });
  const artifact = buildTextStructuredFullArtifactRecord({ block, channel: 'text', language: documentTree.textLanguage,
    voiceId: fixture.preferences.edgeTextVoiceId, ...(composed ? { composition: p.composition } : {}) });
  return { ...edit(fixture, 'fullAudioArtifact.upsert', { blockId, artifact }), artifact };
};
await test('Raw P9 Full reuses verified cache at effective rate; failed cache recovers in planned local/TTS order', async () => {
  const fixture = withFull(f, f.ids.beforeCardId), fullBindings = { [fixture.artifact.id]: { url: 'blob:full-qa', fullArtifactFingerprint: fixture.artifact.id } };
  let result = await runHost({ fixture, blockId: f.ids.beforeCardId, representation: 'full', rate: 1.5, fullBindings });
  assert.equal(result.events.length, 1); assert.equal(result.events[0].kind, 'local'); assert.equal(result.events[0].playbackRate, 1.5);
  result = await runHost({ fixture, blockId: f.ids.beforeCardId, representation: 'full', rate: 1.5, fullBindings, failFull: true });
  assert.deepEqual(result.events.map(e => e.kind), ['local', 'local', 'tts', 'tts']);
  assert.deepEqual(result.statuses.slice(1).map(e => e.segmentId), tree.blocks.find(b => b.id === f.ids.beforeCardId).segments.map(s => s.id));
  assert.ok(result.events.every(e => e.playbackRate === 1.5));
  assert.equal(result.statuses[0].segmentId, null);
});
await test('Composed Conversation Full plays at 1x even with 1.5x baked inputs; changed schedule rejects cache', async () => {
  const fixture = withFull(f, f.ids.sceneId, { composed: true, rate: 1.5 });
  const fullBindings = { [fixture.artifact.id]: { url: 'blob:composed-qa', fullArtifactFingerprint: fixture.artifact.id } };
  const result = await runHost({ fixture, blockId: f.ids.sceneId, representation: 'full', rate: 1.5, fullBindings });
  assert.equal(result.events.length, 1); assert.equal(result.events[0].step.type, 'full-local'); assert.equal(result.events[0].playbackRate, 1);
  const documentTree = resolveTextLibraryDocumentTree(fixture.snapshot, f.ids.documentId);
  assert.notEqual(plan({ ...opts, documentTree, block: documentTree.blocks.find(b => b.id === f.ids.sceneId), representationMode: 'full', globalPlaybackRate: 1.2, runtimeFullAudio: fullBindings }).route, 'full-local');
});
await test('Full metadata-only, wrong binding, voice, render rate, content/order all reject cache without rewriting artifacts', () => {
  const fixture = withFull(f, f.ids.beforeCardId), documentTree = resolveTextLibraryDocumentTree(fixture.snapshot, f.ids.documentId), block = documentTree.blocks.find(b => b.id === f.ids.beforeCardId);
  const args = { ...opts, documentTree, block, representationMode: 'full' }, artifact = fixture.artifact;
  assert.notEqual(plan(args).route, 'full-local');
  const runtimeFullAudio = { [artifact.id]: { url: 'blob:qa', fullArtifactFingerprint: artifact.id } };
  assert.equal(plan({ ...args, runtimeFullAudio }).route, 'full-local');
  assert.notEqual(plan({ ...args, runtimeFullAudio: { [artifact.id]: { url: 'blob:wrong', fullArtifactFingerprint: 'wrong' } } }).route, 'full-local');
  for (const preferences of [{ ...f.preferences, edgeTextVoiceId: 'en-GB-SoniaNeural' }, { ...f.preferences, edgeRate: 20 }]) assert.notEqual(plan({ ...args, runtimeFullAudio, preferences }).route, 'full-local');
  const changed = { ...block, segments: block.segments.map((s, i) => i === 0 ? { ...s, text: 'Changed.' } : s) };
  assert.notEqual(plan({ ...args, block: changed, runtimeFullAudio }).route, 'full-local');
  const reversed = { ...block, segments: [...block.segments].reverse().map((s, i) => ({ ...s, order: i + 1 })) };
  assert.notEqual(plan({ ...args, block: reversed, runtimeFullAudio }).route, 'full-local');
  assert.deepEqual(fixture.snapshot.blocks.find(b => b.id === block.id).metadata, block.metadata);
});
await test('P9 rate precedence: Card channel > Workspace channel > global; Segment rate overrides are unsupported', async () => {
  const fixture = structuredClone(f), doc = fixture.snapshot.documents.find(d => d.id === f.ids.documentId), card = fixture.snapshot.blocks.find(b => b.id === f.ids.afterCardId);
  doc.metadata.audioPlaybackRateProfileV1 = { channels: { text: 1.2, meaning: 0.8 } };
  card.metadata.audioPlaybackRateProfileV1 = { channels: { text: 1.7, meaning: 1.3 } };
  fixture.snapshot.segments.find(s => s.id === f.ids.afterSentenceId).metadata.audioPlaybackRateProfileV1 = { channels: { text: 2, meaning: 2 } };
  const result = await runHost({ fixture, blockId: card.id, rate: 1.5, channel: 'text-meaning' });
  assert.deepEqual(result.events.map(e => e.playbackRate), [1.7, 1.3]);
  delete card.metadata.audioPlaybackRateProfileV1;
  const documentRates = await runHost({ fixture, blockId: card.id, rate: 1.5, channel: 'text-meaning' });
  assert.deepEqual(documentRates.events.map(e => e.playbackRate), [1.2, 0.8]);
  delete doc.metadata.audioPlaybackRateProfileV1;
  fixture.preferences = { ...fixture.preferences, browserTextRate: 1.4, browserMeaningRate: 0.7, browserRatesLinked: false };
  const channelRates = await runHost({ fixture, blockId: card.id, rate: null, channel: 'text-meaning' });
  assert.deepEqual(channelRates.events.map(e => e.playbackRate), [1.4, 0.7]);
});
await test('Full Paragraph voice ignores Sentence override; Split keeps it and EN/ID stay paired', async () => {
  const fixture = structuredClone(f), block = fixture.snapshot.blocks.find(b => b.id === f.ids.afterCardId), segment = fixture.snapshot.segments.find(s => s.id === f.ids.afterSentenceId);
  block.metadata = buildTextStructuredVoiceOverrideMetadata({ metadata: block.metadata, channel: 'text', voiceName: 'en-GB-LibbyNeural' });
  segment.metadata = buildTextStructuredVoiceOverrideMetadata({ metadata: segment.metadata, channel: 'text', voiceName: 'en-GB-RyanNeural' });
  const split = await runHost({ fixture, blockId: block.id });
  const full = await runHost({ fixture, blockId: block.id, representation: 'full' });
  assert.equal(split.events[0].voiceResolution.requestedVoiceName, 'en-GB-RyanNeural');
  assert.equal(full.events[0].voiceResolution.requestedVoiceName, 'en-GB-LibbyNeural');
  const meaning = await runHost({ fixture, blockId: block.id, representation: 'full', channel: 'meaning-only' });
  assert.equal(meaning.events[0].textToRead, segment.meaning); assert.equal(meaning.statuses[0].channel, 'meaning');
});
await test('Conversation speaker rates/voices remain resolved independently of Paragraph changes', async () => {
  const fixture = structuredClone(f), block = fixture.snapshot.blocks.find(b => b.id === f.ids.sceneId), alice = fixture.snapshot.contentUnits.find(u => u.id === f.ids.aliceTurnId).speakerId;
  block.metadata.audioPlaybackRateProfileV1 = { channels: { text: 1.6 }, speakerIds: { text: { [alice]: 1.3 } } };
  const result = await runHost({ fixture, blockId: block.id, rate: 1.5 });
  assert.deepEqual(result.events.map(e => e.playbackRate), [1.3, 1.3, 1.3, 1.6]);
  assert.deepEqual(result.statuses.map(e => e.effectiveVoice), ['en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-SoniaNeural']);
});
await test('Native speech error observer ignores late events from an already completed utterance', async () => {
  const utterances = [], errors = [];
  const pending = executeBrowserTtsPlaybackService({ textToRead: 'One.', synth: { cancel() {}, speak: u => utterances.push(u) },
    stopSignalRef: { current: false }, pauseStateRef: { current: false }, currentUtteranceRef: { current: null },
    ttsReplayRef: { current: null }, playbackResolveRef: { current: null }, rate: 1.5, onError: error => errors.push(error) });
  await until(() => utterances.length === 1);
  utterances[0].onend({ type: 'end' }); await pending;
  utterances[0].onerror({ type: 'error', error: 'cancelled-after-completion' });
  assert.deepEqual(errors, [], 'Old native event must not overwrite the next Sentence status');
});
assert.equal(storageCalls, 0);
assert.equal(JSON.stringify(f.snapshot), originalSnapshot);
assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
console.log(JSON.stringify({ passed, failed, storageCalls }));
if (failed) process.exitCode = 1;
