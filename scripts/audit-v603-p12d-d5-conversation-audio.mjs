import assert from 'node:assert/strict';
import { createD5AudioFixture } from './fixtures/d5/conversation-audio-fixture.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord, normalizeTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';
import { resolveStructuredTextPlaybackList } from '../src/domain/text/textStructuredPlaybackDomain.js';
import { planTextAudioStagingGarbage } from '../src/services/persistence/textAudioStagingGcService.js';
import { buildTextStructuredAudioSyncProfileMetadata } from '../src/domain/text/textStructuredAudioSyncProfileDomain.js';
import { buildTextStructuredLocalAudioProfileMetadata } from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import { buildProLingoTextAudioManifest, TEXT_AUDIO_MANIFEST_FILENAME } from '../src/domain/text/textAudioManifestDomain.js';
import { buildCanonicalTextFullArtifactFilename } from '../src/domain/text/textFilenameDomain.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';
import { scanTextStructuredAudioZipFiles } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { reconcileTextAudioStagingRuntimeBindings } from '../src/services/persistence/textAudioStagingService.js';
import { buildDerivedTextConversationFullAudioWav } from '../src/services/audio/textStructuredFullAudioExportService.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';

const plan = (fixture, options = {}) => {
  const snapshot = options.snapshot || fixture.snapshot;
  const tree = resolveTextLibraryDocumentTree(snapshot, fixture.ids.documentId);
  return buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: tree, block: tree.blocks.find(b => b.id === (options.blockId || fixture.ids.sceneId)),
    preferences: fixture.preferences, runtimeAudioUrls: fixture.runtimeAudioUrls, audioVariants: snapshot.audioVariants, ...options });
};
const edit = (fixture, type, payload) => ({ ...fixture, snapshot: applyTextLibraryCommand(fixture.snapshot, { type, payload }, 400).snapshot });
let passed = 0; let failed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); } catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); } };

await test('multi-Sentence Turns and multiple Speakers use current profiles in both Split and Full', () => {
  const fixture = createD5AudioFixture();
  for (const representationMode of ['split', 'full']) {
    const output = plan(fixture, { representationMode });
    assert.equal(output.steps.length, 4);
    assert.deepEqual(output.steps.map(s => s.unitId), [fixture.ids.aliceTurnId, fixture.ids.aliceTurnId, fixture.ids.nextAliceTurnId, fixture.ids.bobTurnId]);
    assert.deepEqual(output.steps.map(s => s.voiceId), ['en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-SoniaNeural']);
    assert.equal(output.completeLocal, true);
  }
});
await test('Full TTS-only never collapses multiple Speakers into one utterance', () => {
  const fixture = createD5AudioFixture();
  const output = plan(fixture, { representationMode: 'full', globalTtsOnly: true });
  assert.equal(output.steps.length, 4);
  assert.equal(output.steps.every(s => s.type === 'split-tts'), true);
  assert.equal(output.entries.every(e => e.status === 'ready'), true, 'TTS-only routing must not erase physical availability');
  assert.equal(output.steps.at(-1).ttsVoiceName, 'en-GB-SoniaNeural');
});
await test('stale RF and metadata-only bindings cannot play', () => {
  const fixture = createD5AudioFixture();
  const noBinary = plan(fixture, { runtimeAudioUrls: {} });
  assert.equal(noBinary.localCount, 0);
  assert.equal(noBinary.entries.every(e => e.status === 'metadata-only'), true);
  assert.equal(plan(fixture, { preferences: { ...fixture.preferences, edgePitch: 12 } }).localCount, 0);
  assert.equal(plan(fixture, { rendererVersion: 'future-renderer' }).localCount, 0);
  assert.equal(plan(fixture, { codecProfile: 'other-codec' }).localCount, 0);
  const rfOnly = fixture.snapshot.audioVariants.map(variant => ({ ...variant, metadata: { ...variant.metadata, audioRenderDescriptorV1: undefined } }));
  assert.equal(plan(fixture, { audioVariants: rfOnly }).localCount, 4, 'Exact RF pins rendering configuration without optional legacy descriptors');
});
await test('Full identity changes for voice schedule, playback rate, content and order but not labels/Unit grouping', () => {
  const fixture = createD5AudioFixture();
  const base = plan(fixture).fullArtifactRequirement.fullArtifactFingerprint;
  const alice = fixture.snapshot.contentUnits.find(u => u.id === fixture.ids.aliceTurnId);
  const renamed = edit(fixture, 'speaker.rename', { documentId: fixture.ids.documentId, speakerId: alice.speakerId, label: 'Dr Alice' });
  assert.equal(plan(renamed).fullArtifactRequirement.fullArtifactFingerprint, base);
  const split = edit(fixture, 'contentUnit.split', { id: alice.id, beforeSegmentId: fixture.ids.secondSentenceId });
  assert.equal(plan(split).fullArtifactRequirement.fullArtifactFingerprint, base);
  const bob = fixture.snapshot.contentUnits.find(u => u.id === fixture.ids.bobTurnId);
  assert.notEqual(plan(edit(fixture, 'contentUnit.update', { id: alice.id, speakerId: bob.speakerId })).fullArtifactRequirement.fullArtifactFingerprint, base);
  assert.notEqual(plan(fixture, { globalPlaybackRate: 1.25 }).fullArtifactRequirement.fullArtifactFingerprint, base);
  assert.notEqual(plan(edit(fixture, 'segment.update', { id: fixture.ids.firstSentenceId, text: 'Changed.' })).fullArtifactRequirement.fullArtifactFingerprint, base);
  assert.notEqual(plan(edit(fixture, 'contentUnit.reorder', { blockId: fixture.ids.sceneId, orderedIds: [bob.id, fixture.ids.emptyTurnId, alice.id, fixture.ids.nextAliceTurnId] })).fullArtifactRequirement.fullArtifactFingerprint, base);
});
await test('composed Full metadata is portable and is not physical readiness', () => {
  let fixture = createD5AudioFixture();
  const initial = plan(fixture);
  const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const artifact = buildTextStructuredFullArtifactRecord({ block: tree.blocks.find(b => b.id === fixture.ids.sceneId), composition: initial.composition });
  assert.equal(artifact.descriptor.schemaVersion, 2);
  assert.ok(normalizeTextStructuredFullArtifactRecord(JSON.parse(JSON.stringify(artifact))));
  assert.equal(normalizeTextStructuredFullArtifactRecord({ ...artifact, segmentCount: 1 }), null);
  assert.equal(normalizeTextStructuredFullArtifactRecord({ ...artifact, descriptor: { ...artifact.descriptor, sampleRate: 44100 } }), null);
  fixture = edit(fixture, 'fullAudioArtifact.upsert', { blockId: fixture.ids.sceneId, artifact });
  const metadataOnly = plan(fixture, { representationMode: 'full', runtimeFullAudio: { [artifact.id]: { binaryReady: true } } });
  assert.equal(metadataOnly.fullReadiness.status, 'metadata-only');
  const ready = plan(fixture, { representationMode: 'full', runtimeFullAudio: { [artifact.id]: { url: 'blob:d5-full' } } });
  assert.equal(ready.route, 'full-local');
  assert.equal(ready.steps.length, 1);
  assert.equal(plan(fixture, { runtimeFullAudio: { [artifact.id]: { url: 'blob:wrong', fullArtifactFingerprint: 'full-sha256-' + '0'.repeat(64) } } }).fullReadiness.ready, false);
  assert.equal(plan(fixture, { globalPlaybackRate: 1.1 }).fullReadiness.ready, false);
});
await test('edit/undo exact RF reuse remains referenced by GC and does not rewrite identity', () => {
  const fixture = createD5AudioFixture();
  const original = fixture.snapshot.segments.find(s => s.id === fixture.ids.firstSentenceId);
  const changed = edit(fixture, 'segment.update', { id: original.id, text: 'Changed.' });
  assert.equal(plan(changed).entries.find(e => e.segmentId === original.id).status, 'stale');
  const undone = edit(changed, 'segment.update', { id: original.id, text: original.text });
  const output = plan(undone);
  assert.equal(output.entries.find(e => e.segmentId === original.id).status, 'ready');
  const variant = undone.snapshot.audioVariants.find(v => v.segmentId === original.id && v.channel === 'text');
  const record = { id: 'QA_STAGING', hasBlob: true, mode: 'text', mapKey: variant.metadata.audioRenderFingerprintV1 };
  assert.equal(planTextAudioStagingGarbage({ snapshot: undone.snapshot, records: [record] }).orphanCount, 0);
  assert.equal(variant.uid, fixture.snapshot.audioVariants.find(v => v.id === variant.id).uid);
});
await test('empty Turns/Scenes, scoped playback and cursor Unit identity', () => {
  const fixture = createD5AudioFixture();
  assert.equal(plan(fixture, { blockId: fixture.ids.zeroSceneId }).total, 0);
  assert.equal(plan(fixture).entries.some(e => e.unitId === fixture.ids.emptyTurnId), false);
  const scoped = plan(fixture, { representationMode: 'full', segmentIds: [fixture.ids.secondSentenceId] });
  assert.deepEqual(scoped.steps.map(s => s.segmentId), [fixture.ids.secondSentenceId]);
  assert.equal(scoped.fullArtifactRequirement, null);
  assert.equal(scoped.readyToCompose, false);
  const list = resolveStructuredTextPlaybackList(resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId));
  assert.equal(list[0].unitId, fixture.ids.aliceTurnId);
  assert.ok(list[0].unitUid && list[0].segmentUid && list[0].speakerId);
});

await test('Mixed Paragraph behavior stays P9 and Meaning/Legacy remain isolated', () => {
  const fixture = createD5AudioFixture();
  const meaning = plan(fixture, { channel: 'meaning', representationMode: 'full' });
  assert.equal(meaning.entries.length, 2);
  assert.equal(meaning.entries.every(e => e.runtimeAudio.variant.voiceId === 'id-ID-GadisNeural'), true);
  let state = applyTextLibraryCommand(fixture.snapshot, { type: 'segment.create', payload: { blockId: fixture.ids.paragraphId, text: 'Paragraph unchanged.' } }, 400).snapshot;
  state = applyTextLibraryCommand(state, { type: 'contentUnit.create', payload: { blockId: fixture.ids.mixedSceneId, speaker: 'Mixed speaker', text: 'Mixed Conversation.' } }, 400).snapshot;
  const mixed = resolveTextLibraryDocumentTree(state, fixture.ids.mixedDocumentId);
  const paragraph = buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: mixed, block: mixed.blocks.find(b => b.id === fixture.ids.paragraphId), representationMode: 'full', fallbackVoiceId: 'en-GB-RyanNeural' });
  assert.equal(paragraph.route, 'full-tts-fallback');
  assert.equal(paragraph.steps[0].type, 'full-tts');
  const scenePlan = buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: mixed, block: mixed.blocks.find(b => b.id === fixture.ids.mixedSceneId), preferences: fixture.preferences });
  assert.equal(scenePlan.entries.length, 1);
  assert.equal(scenePlan.entries[0].content, 'Mixed Conversation.');
  assert.equal(resolveStructuredTextPlaybackList({ ...mixed, editorModel: 'legacy-line-v1' }).length, 0);
});

await test('reorder/move/split/merge/delete keep unrelated identities, reuse only matching speaker RF', () => {
  const fixture = createD5AudioFixture();
  const before = JSON.stringify(fixture.snapshot);
  const first = fixture.ids.firstSentenceId;
  const sameSpeakerMove = edit(fixture, 'segment.move', { segmentId: first, targetUnitId: fixture.ids.emptyTurnId });
  assert.equal(plan(sameSpeakerMove).localCount, 4);
  const bobMove = edit(fixture, 'segment.move', { segmentId: first, targetUnitId: fixture.ids.bobTurnId });
  assert.notEqual(plan(bobMove).entries.find(e => e.segmentId === first).status, 'ready');
  const split = edit(fixture, 'conversationSegment.split', { id: first, parts: [{ text: 'Hello.', meaning: 'Halo.' }, { text: 'Welcome.', meaning: 'Selamat datang.' }] });
  assert.equal(plan(split).localCount, 3);
  const created = split.snapshot.segments.find(s => !fixture.snapshot.segments.some(old => old.id === s.id));
  const merged = edit(split, 'conversationSegments.merge', { ids: [first, created.id] });
  assert.equal(plan(merged).localCount, 4, 'Equivalent joined text/profile RF can be reused after merge');
  const removed = edit(fixture, 'segment.delete', { id: fixture.ids.bobSentenceId, preserveEmptyUnit: true });
  assert.equal(plan(removed).total, 3);
  assert.equal(removed.snapshot.contentUnits.some(u => u.id === fixture.ids.bobTurnId), true);
  assert.equal(JSON.stringify(fixture.snapshot), before);
});
await test('speaker sync, custom local pins and explicit global order reuse existing precedence', () => {
  let fixture = createD5AudioFixture();
  const doc = fixture.snapshot.documents.find(d => d.id === fixture.ids.documentId);
  let metadata = buildTextStructuredAudioSyncProfileMetadata({ metadata: doc.metadata, kind: 'voice', channel: 'text', enabled: true });
  metadata = buildTextStructuredLocalAudioProfileMetadata({ metadata, speakerId: fixture.snapshot.contentUnits.find(u => u.id === fixture.ids.bobTurnId).speakerId, voiceId: 'en-GB-SoniaNeural' });
  fixture = edit(fixture, 'document.update', { id: doc.id, metadata });
  assert.equal(plan(fixture).entries.every(e => e.ttsVoiceName === 'en-GB-RyanNeural'), true);
  const custom = plan(fixture, { audioSourceMode: 'custom-local' });
  assert.equal(custom.localCount, 0, 'Sync follows master pin; must not fall through to follower pin');
  const explicit = plan(fixture, { globalPlaybackOrder: { channels: { text: [{ voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 }] } } });
  assert.equal(explicit.localCount, 0);
  assert.equal(explicit.entries.every(e => e.renders[0].profile.voiceId === 'en-GB-LibbyNeural'), true);
  const alternate = plan(fixture, { globalPlaybackOrder: { channels: { text: [{ voiceId: 'en-GB-LibbyNeural' }, { voiceId: 'en-GB-RyanNeural' }] } } });
  assert.equal(alternate.entries[0].profileRank, 2);
  assert.equal(alternate.readyToCompose, false, 'Alternative local profile cannot be mislabeled as the primary Full composition');
});
await test('RF/profile binding mismatch, empty bytes, malformed graph and Legacy fail closed', () => {
  const fixture = createD5AudioFixture();
  const wrong = Object.fromEntries(Object.keys(fixture.runtimeAudioUrls).map(id => [id, { url: 'blob:wrong', renderFingerprint: 'rf-sha256-' + '0'.repeat(64) }]));
  assert.equal(plan(fixture, { runtimeAudioUrls: wrong }).localCount, 0);
  const empty = Object.fromEntries(Object.keys(fixture.runtimeAudioUrls).map(id => [id, { blob: new Blob([]), binaryReady: true }]));
  assert.equal(plan(fixture, { runtimeAudioUrls: empty }).localCount, 0);
  const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const block = tree.blocks[0];
  assert.throws(() => buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: tree, block: { ...block, units: [] } }), /Invalid Conversation/);
  assert.throws(() => buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: { ...tree, editorModel: 'legacy-line-v1' }, block }), /structured Workspace/);
});
await test('portable composed Full ZIP requires exact current schedule and supports UID remapping', async () => {
  const fixture = createD5AudioFixture();
  const output = plan(fixture); const req = output.fullArtifactRequirement;
  const filename = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: req.fullArtifactFingerprint, engine: 'derived', voiceId: 'multi-speaker', extension: 'wav' });
  const manifest = buildProLingoTextAudioManifest({ entries: [{ representation: 'full', identity: req.fullArtifactFingerprint, filename, render: req.descriptor }] });
  const zip = await buildStoredZipBlob([{ filename, blob: new Blob(['QA-only']) }, { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)]) }]);
  Object.defineProperty(zip, 'name', { value: 'd5-qa.zip' });
  const args = { files: [zip], blocks: fixture.snapshot.blocks, segments: fixture.snapshot.segments, documents: fixture.snapshot.documents };
  assert.equal((await scanTextStructuredAudioZipFiles(args)).fullMatches.length, 0);
  const match = await scanTextStructuredAudioZipFiles({ ...args, fullArtifactRequirements: [req] });
  assert.equal(match.fullMatches.length, 1);
  assert.equal(match.fullMatches[0].artifact.descriptor.schemaVersion, 2);
  const pack = createProLingoTextPack({ snapshot: fixture.snapshot, scopeType: 'document', rootId: fixture.ids.documentId });
  const copied = mergeProLingoTextPack({ localSnapshot: fixture.snapshot, pack });
  assert.notEqual(copied.idMap.documents[fixture.ids.documentId], fixture.ids.documentId);
  const copyFixture = { ...fixture, snapshot: copied.snapshot, ids: { ...fixture.ids, documentId: copied.idMap.documents[fixture.ids.documentId], sceneId: copied.idMap.blocks[fixture.ids.sceneId] } };
  assert.equal(plan(copyFixture).fullArtifactRequirement.fullArtifactFingerprint, req.fullArtifactFingerprint);
});
await test('Staging binds composed metadata without a second cache and GC retains it', () => {
  let fixture = createD5AudioFixture(); const output = plan(fixture);
  const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const artifact = buildTextStructuredFullArtifactRecord({ block: tree.blocks[0], composition: output.composition });
  fixture = edit(fixture, 'fullAudioArtifact.upsert', { blockId: fixture.ids.sceneId, artifact });
  const record = { id: 'D5_QA_FULL', mode: 'text', hasBlob: true, mapKey: artifact.id, engine: 'derived', voiceId: 'multi-speaker',
    metadata: { representation: 'full', fullArtifactFingerprint: artifact.id, fullArtifactDescriptorV1: artifact.descriptor } };
  const binding = reconcileTextAudioStagingRuntimeBindings({ snapshot: fixture.snapshot, activeRecords: [record] });
  assert.ok(binding.runtimeFullAudioUrls[artifact.id]?.stagingBacked);
  assert.equal(planTextAudioStagingGarbage({ snapshot: fixture.snapshot, records: [record] }).orphanCount, 0);
  assert.equal(plan(fixture, { representationMode: 'full', runtimeFullAudio: binding.runtimeFullAudioUrls }).route, 'full-local');
});
await test('composition rejects missing binaries and unbaked per-Sentence playback rates', async () => {
  const fixture = createD5AudioFixture();
  await assert.rejects(buildDerivedTextConversationFullAudioWav({ plan: plan(fixture), blobs: [] }), /every planned/);
  const ratePlan = plan(fixture, { globalPlaybackRate: 1.2 });
  assert.equal(ratePlan.compositionInputsReady, true);
  assert.equal(ratePlan.readyToCompose, false);
  assert.equal(ratePlan.compositionBlockReason, 'rate-aware-assembly-required');
  await assert.rejects(buildDerivedTextConversationFullAudioWav({ plan: ratePlan, blobs: ratePlan.entries.map(() => new Blob(['QA'])) }), /rate-aware/);
});
await test('global Full session uses existing stop/pause/scope execution across multi-Sentence Turns', async () => {
  const fixture = createD5AudioFixture(); const tree = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const calls = []; let pending; const stopSignalRef = { current: false }; const playbackSessionRef = { current: 1 };
  const savedNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    executeStructuredTextPlaybackSessionService({ documentTree: tree, scope: 'document', playbackChannelMode: 'text-only', playbackRepresentationMode: 'full',
      safePlayTransition: fn => { pending = fn(); }, playbackSessionRef, stopSignalRef, pauseStateRef: { current: false }, silentAudioRef: { current: null },
      playbackContextRef: { current: null }, waitWhilePaused: async () => {}, setIsPlaying() {}, setIsPaused() {}, setPlayingContext() {}, setPlayingIndex() {},
      setCurrentIndex() {}, setSpeakingPart() {}, forceStopAll() {},
      resolveBlockChannelPlaybackPlan: args => plan(fixture, { representationMode: 'full', block: args.fullBlock, segmentIds: args.segmentIds }),
      playStructuredFullStep: async () => { throw Error('No Full binary in fixture'); },
      playStructuredChannel: async (_text, item, _channel, options) => { calls.push([item.id, options.step.unitId]); if (calls.length === 2) stopSignalRef.current = true; }
    });
    await pending;
    assert.deepEqual(calls, [[fixture.ids.firstSentenceId, fixture.ids.aliceTurnId], [fixture.ids.secondSentenceId, fixture.ids.aliceTurnId]]);
  } finally { Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator }); }
});

console.log(`D5 AUDIO CORE: ${passed} PASS, ${failed} FAIL`);
if (failed) process.exitCode = 1;
