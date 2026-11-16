import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createD4aConversationFixture } from './fixtures/d4a/conversation-editor-fixture.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { applyTextConversationEditorCommand, selectTextConversationEditorState, selectTextConversationScene, selectTextConversationTurn, TextConversationEditorError } from '../src/domain/text/textConversationEditorDomain.js';
import { backfillTextContentUnits } from '../src/domain/text/textContentUnitDomain.js';
import { getTextStructuredSpeakerRegistry, getTextStructuredSegmentSpeakerId } from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import { createProLingoTextDatabaseBackup, validateProLingoTextDatabaseBackup } from '../src/domain/text/textDatabaseBackupDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge, planTextSourceSync, planTextSourceDetach } from '../src/domain/text/textSourceAttachmentDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';
import * as constants from '../src/constants/textDatabaseConstants.js';
import { planProLingoTextExternalInitialImport } from '../src/domain/text/textExternalJsonDomain.js';
import { planTextExternalUpdateExisting } from '../src/domain/text/textExternalReconciliationDomain.js';

const edit = (snapshot, type, payload, documentId) => applyTextConversationEditorCommand(snapshot, { type, payload }, { documentId, now: 200 });
const typedError = code => error => error instanceof TextConversationEditorError && error.code === code;
const orderedChildren = (snapshot, id) => snapshot.segments.filter(s => s.unitId === id).sort((a, b) => a.order - b.order);
const stableSegments = snapshot => snapshot.segments.map(s => [s.id, s.uid, s.unitId, s.text, s.meaning, s.speaker, getTextStructuredSegmentSpeakerId(s)]);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
};

await test('Conversation sentence split preserves its Turn and speaker', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = applyTextLibraryCommand(snapshot, { type: 'conversationSegment.split', payload: {
    id: ids.firstSentenceId, parts: [{ text: 'Hello.', meaning: 'Halo.' }, { text: 'Welcome.', meaning: 'Selamat datang.' }]
  } }, 200);
  assert.equal(outcome.snapshot.contentUnits.length, snapshot.contentUnits.length);
  assert.equal(outcome.snapshot.segments.find(s => s.id === outcome.result.createdIds[0]).unitId, ids.aliceTurnId);
  assert.equal(outcome.snapshot.segments.find(s => s.id === outcome.result.createdIds[0]).speaker, 'Alice');
});
await test('Conversation sentence merge retains first identity and same Turn', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = applyTextLibraryCommand(snapshot, { type: 'conversationSegments.merge', payload: { ids: [ids.secondSentenceId, ids.firstSentenceId] } }, 200);
  assert.equal(outcome.result.retainedId, ids.firstSentenceId);
  assert.equal(outcome.snapshot.segments.find(s => s.id === ids.firstSentenceId).speaker, 'Alice');
});
await test('Turn-local sentence reorder preserves intervening empty Turn positions', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = applyTextLibraryCommand(snapshot, { type: 'contentUnit.reorderSegments', payload: { id: ids.aliceTurnId, orderedIds: [ids.secondSentenceId, ids.firstSentenceId] } }, 200);
  assert.deepEqual(outcome.snapshot.contentUnits, snapshot.contentUnits);
  assert.equal(outcome.snapshot.segments.find(s => s.id === ids.secondSentenceId).order, 1);
});
await test('explicit last-sentence deletion can preserve an empty Turn', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = applyTextLibraryCommand(snapshot, { type: 'segment.delete', payload: { id: ids.bobSentenceId, preserveEmptyUnit: true } }, 200);
  assert.deepEqual(outcome.snapshot.contentUnits.find(u => u.id === ids.bobTurnId), snapshot.contentUnits.find(u => u.id === ids.bobTurnId));
});

await test('selector uses persistent multi-sentence Turns, includes empty states, and detaches drafts', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  freeze(snapshot);
  const state = selectTextConversationEditorState(snapshot);
  assert.deepEqual(state.counts, { scenes: 2, turns: 4, sentences: 4 });
  assert.equal(selectTextConversationScene(state, ids.zeroSceneId).empty, true);
  const turn = selectTextConversationTurn(state, ids.aliceTurnId);
  assert.equal(turn.uid, snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).uid);
  assert.deepEqual(turn.sentences.map(s => s.id), [ids.firstSentenceId, ids.secondSentenceId]);
  assert.equal(selectTextConversationTurn(state, ids.emptyTurnId).empty, true);
  turn.metadata.note = 'UI draft';
  turn.sentences[0].metadata.sourceTag = 'Draft';
  assert.equal(snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).metadata.note, 'Retain this Turn');
  assert.equal(snapshot.segments.find(s => s.id === ids.firstSentenceId).metadata.sourceTag, 'D4A');
  assert.equal(selectTextConversationTurn(state, 'missing'), null);
  assert.equal(selectTextConversationScene(state, 'missing'), null);
});

await test('create Scene, empty Turn and two sentences without implicit grouping', () => {
  let { snapshot, ids } = createD4aConversationFixture();
  const scene = edit(snapshot, 'block.create', { documentId: ids.documentId, title: 'Second scene' });
  assert.equal(selectTextConversationScene(scene.state, scene.result.id).turnCount, 0);
  const turn = edit(scene.snapshot, 'contentUnit.create', { blockId: scene.result.id, speaker: 'Alice' });
  const first = edit(turn.snapshot, 'segment.create', { blockId: scene.result.id, unitId: turn.result.id, text: 'One.' });
  const second = edit(first.snapshot, 'segment.create', { blockId: scene.result.id, unitId: turn.result.id, text: 'Two.' });
  assert.equal(selectTextConversationTurn(second.state, turn.result.id).sentenceCount, 2);
  assert.equal(second.snapshot.contentUnits.length, snapshot.contentUnits.length + 1);
  assert.equal(new Set(second.snapshot.segments.map(s => s.id)).size, second.snapshot.segments.length);
  assert.equal(new Set(second.snapshot.segments.map(s => s.uid)).size, second.snapshot.segments.length);
  assert.equal(orderedChildren(second.snapshot, turn.result.id).every(s => s.speaker === 'Alice'), true);
  assert.throws(() => edit(first.snapshot, 'segment.create', { blockId: scene.result.id, text: 'No Turn.' }), typedError('OUT_OF_SCOPE'));
});

await test('text edits preserve identities and RF metadata, invalidate only the edited audio channel', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  freeze(snapshot);
  const outcome = edit(snapshot, 'segment.update', { id: ids.firstSentenceId, text: 'New text.' });
  const before = snapshot.segments.find(s => s.id === ids.firstSentenceId);
  const after = outcome.snapshot.segments.find(s => s.id === ids.firstSentenceId);
  assert.deepEqual([after.id, after.uid, after.unitId, after.speaker], [before.id, before.uid, before.unitId, before.speaker]);
  for (const variant of snapshot.audioVariants) {
    const next = outcome.snapshot.audioVariants.find(v => v.id === variant.id);
    assert.equal(next.uid, variant.uid);
    assert.equal(next.metadata.audioRenderFingerprintV1, variant.metadata.audioRenderFingerprintV1);
    if (variant.segmentId === before.id && variant.channel === 'text') assert.ok(next.metadata.contentInvalidatedV1);
    else assert.deepEqual(next, variant);
  }
});

await test('editor deletion retains the final empty Turn and registry reference', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = edit(snapshot, 'segment.delete', { id: ids.bobSentenceId });
  assert.equal(selectTextConversationTurn(outcome.state, ids.bobTurnId).empty, true);
  assert.deepEqual(outcome.snapshot.contentUnits, snapshot.contentUnits);
  assert.equal(outcome.snapshot.audioVariants.some(v => v.segmentId === ids.bobSentenceId), false);
  const speakerId = snapshot.contentUnits.find(u => u.id === ids.bobTurnId).speakerId;
  assert.throws(() => edit(outcome.snapshot, 'speaker.remove', { documentId: ids.documentId, speakerId }), typedError('COMMAND_REJECTED'));
  // The legacy command contract remains unchanged for callers that do not opt in.
  const native = applyTextLibraryCommand(snapshot, { type: 'segment.delete', payload: { id: ids.bobSentenceId } }, 200);
  assert.equal(native.snapshot.contentUnits.some(u => u.id === ids.bobTurnId), false);
});

await test('Turn split and same-speaker merge preserve Segment and audio identities', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const split = edit(snapshot, 'contentUnit.split', { id: ids.aliceTurnId, beforeSegmentId: ids.secondSentenceId });
  assert.equal(split.snapshot.contentUnits.find(u => u.id === split.result.createdId).speakerId, snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).speakerId);
  const merged = edit(split.snapshot, 'contentUnit.merge', { ids: [split.result.createdId, ids.aliceTurnId] });
  assert.equal(merged.result.retainedId, ids.aliceTurnId);
  assert.deepEqual(stableSegments(merged.snapshot), stableSegments(snapshot));
  assert.deepEqual(merged.snapshot.audioVariants, snapshot.audioVariants);
  assert.equal(merged.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).uid, snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).uid);
  assert.throws(() => edit(snapshot, 'contentUnit.merge', { ids: [ids.aliceTurnId, ids.nextAliceTurnId] }), typedError('COMMAND_REJECTED'));
  assert.throws(() => edit(snapshot, 'contentUnit.merge', { ids: [ids.nextAliceTurnId, ids.bobTurnId] }), typedError('COMMAND_REJECTED'));
});

await test('Turn reorder preserves empty Turns, speakers, Split audio, and stored Full fingerprints', () => {
  let { snapshot, ids } = createD4aConversationFixture();
  const scene = selectTextConversationScene(selectTextConversationEditorState(snapshot), ids.sceneId);
  const artifact = buildTextStructuredFullArtifactRecord({ block: { ...scene, segments: snapshot.segments.filter(s => s.blockId === scene.id) }, voiceId: 'en-GB-RyanNeural' });
  snapshot = applyTextLibraryCommand(snapshot, { type: 'fullAudioArtifact.upsert', payload: { blockId: scene.id, artifact } }, 100).snapshot;
  const outcome = edit(snapshot, 'contentUnit.reorder', { blockId: scene.id, orderedIds: [ids.bobTurnId, ids.emptyTurnId, ids.aliceTurnId, ids.nextAliceTurnId] });
  assert.deepEqual(selectTextConversationScene(outcome.state, scene.id).turns.map(t => t.id), [ids.bobTurnId, ids.emptyTurnId, ids.aliceTurnId, ids.nextAliceTurnId]);
  assert.deepEqual(outcome.snapshot.audioVariants, snapshot.audioVariants);
  assert.deepEqual(outcome.snapshot.blocks.find(b => b.id === scene.id).metadata, snapshot.blocks.find(b => b.id === scene.id).metadata);
  for (const before of snapshot.segments) {
    const after = outcome.snapshot.segments.find(s => s.id === before.id);
    assert.deepEqual([after.uid, after.unitId, after.speaker, after.metadata], [before.uid, before.unitId, before.speaker, before.metadata]);
  }
});

await test('Turn-local reorder validates exact sibling IDs and does not move empty Turns', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const reordered = edit(snapshot, 'contentUnit.reorderSegments', { id: ids.aliceTurnId, orderedIds: [ids.secondSentenceId, ids.firstSentenceId] });
  assert.deepEqual(reordered.snapshot.contentUnits, snapshot.contentUnits);
  assert.deepEqual(reordered.snapshot.audioVariants, snapshot.audioVariants);
  for (const orderedIds of [[ids.firstSentenceId], [ids.firstSentenceId, ids.firstSentenceId], [ids.firstSentenceId, ids.bobSentenceId]]) {
    assert.throws(() => edit(snapshot, 'contentUnit.reorderSegments', { id: ids.aliceTurnId, orderedIds }), typedError('COMMAND_REJECTED'));
  }
  assert.deepEqual(edit(snapshot, 'contentUnit.reorderSegments', { id: ids.emptyTurnId, orderedIds: [] }).snapshot.contentUnits, snapshot.contentUnits);
});

await test('moving sentences reassigns speaker through target Turn and retains empty source Turns', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const first = edit(snapshot, 'segment.move', { segmentId: ids.firstSentenceId, targetUnitId: ids.bobTurnId, beforeSegmentId: ids.bobSentenceId });
  const moved = first.snapshot.segments.find(s => s.id === ids.firstSentenceId);
  assert.equal(moved.speaker, 'Bob');
  assert.equal(moved.uid, snapshot.segments.find(s => s.id === moved.id).uid);
  assert.equal(getTextStructuredSegmentSpeakerId(moved), snapshot.contentUnits.find(u => u.id === ids.bobTurnId).speakerId);
  const second = edit(first.snapshot, 'segment.move', { segmentId: ids.secondSentenceId, targetUnitId: ids.bobTurnId });
  assert.equal(selectTextConversationTurn(second.state, ids.aliceTurnId).empty, true);
  assert.deepEqual(second.snapshot.audioVariants, snapshot.audioVariants);
  const otherCardTurn = edit(snapshot, 'contentUnit.create', { blockId: ids.zeroSceneId, speaker: 'Bob' });
  assert.throws(() => edit(otherCardTurn.snapshot, 'segment.move', { segmentId: ids.firstSentenceId, targetUnitId: otherCardTurn.result.id }), typedError('COMMAND_REJECTED'));
});

await test('speaker reassignment, rename and reset synchronize all child sentences and empty Turns', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const bobId = snapshot.contentUnits.find(u => u.id === ids.bobTurnId).speakerId;
  const registryUid = getTextStructuredSpeakerRegistry(snapshot.documents.find(d => d.id === ids.documentId)).find(s => s.id === bobId).uid;
  const reassigned = edit(snapshot, 'contentUnit.update', { id: ids.aliceTurnId, speakerId: bobId });
  assert.equal(orderedChildren(reassigned.snapshot, ids.aliceTurnId).every(s => s.speaker === 'Bob' && getTextStructuredSegmentSpeakerId(s) === bobId), true);
  const empty = edit(reassigned.snapshot, 'contentUnit.update', { id: ids.emptyTurnId, speakerId: bobId });
  const renamed = edit(empty.snapshot, 'speaker.rename', { documentId: ids.documentId, speakerId: bobId, label: 'Robert' });
  assert.equal(selectTextConversationTurn(renamed.state, ids.emptyTurnId).speaker, 'Robert');
  assert.equal(renamed.state.speakerRegistry.find(s => s.id === bobId).uid, registryUid);
  const reset = edit(renamed.snapshot, 'contentUnit.update', { id: ids.aliceTurnId, resetSpeaker: true });
  assert.equal(orderedChildren(reset.snapshot, ids.aliceTurnId).every(s => s.speaker === null && getTextStructuredSegmentSpeakerId(s) === null), true);
  assert.deepEqual(reset.snapshot.audioVariants, snapshot.audioVariants);
  const registered = edit(reset.snapshot, 'speaker.register', { documentId: ids.documentId, label: 'Unused guest' });
  assert.ok(registered.state.speakerRegistry.find(s => s.id === registered.result.id).uid);
  const removed = edit(registered.snapshot, 'speaker.remove', { documentId: ids.documentId, speakerId: registered.result.id });
  assert.equal(removed.state.speakerRegistry.some(s => s.id === registered.result.id), false);
});

await test('sentence split/merge retain first IDs/UIDs, source metadata and speaker mapping', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const original = snapshot.segments.find(s => s.id === ids.firstSentenceId);
  const split = edit(snapshot, 'conversationSegment.split', { id: original.id, parts: [{ text: 'Hello.', meaning: 'Halo.' }, { text: 'Welcome.', meaning: 'Selamat datang.' }] });
  assert.equal(split.snapshot.segments.find(s => s.id === original.id).uid, original.uid);
  const created = split.snapshot.segments.find(s => s.id === split.result.createdIds[0]);
  assert.equal(created.unitId, original.unitId);
  assert.equal(created.metadata.sourceTag, original.metadata.sourceTag);
  assert.equal(getTextStructuredSegmentSpeakerId(created), getTextStructuredSegmentSpeakerId(original));
  assert.equal(created.joinAfter, original.joinAfter);
  assert.equal(split.snapshot.audioVariants.some(v => v.segmentId === created.id), false);
  const merged = edit(split.snapshot, 'conversationSegments.merge', { ids: [created.id, original.id] });
  const restored = merged.snapshot.segments.find(s => s.id === original.id);
  assert.deepEqual([restored.text, restored.meaning, restored.joinAfter, restored.uid], [original.text, original.meaning, original.joinAfter, original.uid]);
  for (const variant of snapshot.audioVariants) {
    const after = merged.snapshot.audioVariants.find(v => v.id === variant.id);
    assert.equal(after.metadata.audioRenderFingerprintV1, variant.metadata.audioRenderFingerprintV1);
  }
  const nextAliceSegment = snapshot.segments.find(s => s.unitId === ids.nextAliceTurnId);
  assert.throws(() => edit(snapshot, 'conversationSegments.merge', { ids: [ids.secondSentenceId, nextAliceSegment.id] }), typedError('COMMAND_REJECTED'));
});

await test('sentence merge removes only explicitly merged-away Segment metadata references', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const outcome = edit(snapshot, 'conversationSegments.merge', { ids: [ids.firstSentenceId, ids.secondSentenceId] });
  assert.equal(outcome.snapshot.segments.some(s => s.id === ids.secondSentenceId), false);
  assert.equal(outcome.snapshot.audioVariants.some(v => v.segmentId === ids.secondSentenceId), false);
  assert.deepEqual(outcome.snapshot.audioVariants.filter(v => v.segmentId === ids.bobSentenceId), snapshot.audioVariants.filter(v => v.segmentId === ids.bobSentenceId));
  assert.equal(outcome.snapshot.contentUnits.length, snapshot.contentUnits.length);
});

await test('deleting Turn or Scene is explicit and zero-Unit Cards do not resurrect', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const deleted = edit(snapshot, 'contentUnit.delete', { id: ids.bobTurnId });
  assert.equal(deleted.snapshot.segments.some(s => s.unitId === ids.bobTurnId), false);
  let state = snapshot;
  for (const unit of snapshot.contentUnits.filter(u => u.blockId === ids.sceneId)) state = edit(state, 'contentUnit.delete', { id: unit.id }).snapshot;
  assert.equal(selectTextConversationScene(selectTextConversationEditorState(state), ids.sceneId).empty, true);
  assert.equal(backfillTextContentUnits(state, { now: 300 }).snapshot.contentUnits.some(u => u.blockId === ids.sceneId), false);
  const removedScene = edit(snapshot, 'block.delete', { id: ids.sceneId });
  assert.equal(removedScene.snapshot.contentUnits.some(u => u.blockId === ids.sceneId), false);
  assert.equal(removedScene.snapshot.audioVariants.length, 0);
});

await test('Mixed supports Scene operations while Paragraph authoring remains isolated and compatible', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const state = selectTextConversationEditorState(snapshot, { documentId: ids.mixedDocumentId });
  assert.deepEqual(state.cardOrderIds, [ids.paragraphId, ids.mixedSceneId]);
  assert.deepEqual(state.scenes.map(s => s.id), [ids.mixedSceneId]);
  assert.throws(() => edit(snapshot, 'block.update', { id: ids.paragraphId, title: 'Wrong editor' }, ids.mixedDocumentId), typedError('OUT_OF_SCOPE'));
  const created = edit(snapshot, 'block.create', { documentId: ids.mixedDocumentId }, ids.mixedDocumentId);
  assert.equal(created.snapshot.blocks.find(b => b.id === created.result.id).blockType, 'conversation');
  const reordered = edit(snapshot, 'block.reorder', { documentId: ids.mixedDocumentId, orderedIds: [ids.mixedSceneId, ids.paragraphId] }, ids.mixedDocumentId);
  assert.deepEqual(reordered.snapshot.contentUnits, snapshot.contentUnits);
  const para = applyTextLibraryCommand(snapshot, { type: 'segment.create', payload: { blockId: ids.paragraphId, text: 'First. Second.' } }, 200);
  const split = applyTextLibraryCommand(para.snapshot, { type: 'paragraphSegment.split', payload: { id: para.result.id, parts: [{ text: 'First.' }, { text: 'Second.' }] } }, 200);
  const merged = applyTextLibraryCommand(split.snapshot, { type: 'paragraphSegments.merge', payload: { ids: [para.result.id, split.result.createdIds[0]] } }, 200);
  assert.equal(merged.snapshot.segments.find(s => s.id === para.result.id).text, 'First. Second.');
  assert.equal(merged.snapshot.segments.find(s => s.id === para.result.id).speaker, null);
});

await test('typed validation fails closed on malformed commands, stale IDs, unsupported scope and ambiguity', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const cases = [
    ['INVALID_COMMAND', 'document.delete', { id: ids.documentId }],
    ['INVALID_COMMAND', 'toString', {}],
    ['INVALID_COMMAND', 'segment.reorder', { blockId: ids.sceneId, orderedIds: [] }],
    ['INVALID_COMMAND', 'segment.update', { id: ids.firstSentenceId, speaker: 'Bob' }],
    ['INVALID_COMMAND', 'segment.update', { id: ids.firstSentenceId, metadata: [] }],
    ['INVALID_COMMAND', 'segment.update', { id: ids.firstSentenceId, metadata: { speakerIdentityV1: 'wrong' } }],
    ['INVALID_COMMAND', 'contentUnit.split', { id: ids.aliceTurnId, splitAtIndex: 1, beforeSegmentId: ids.secondSentenceId }],
    ['INVALID_COMMAND', 'contentUnit.update', { id: ids.aliceTurnId, speakerId: 'something', resetSpeaker: true }],
    ['OUT_OF_SCOPE', 'contentUnit.update', { id: 'UNIT_999999', speaker: 'Bob' }],
    ['OUT_OF_SCOPE', 'block.delete', { id: ids.mixedSceneId }],
    ['OUT_OF_SCOPE', 'speaker.register', { documentId: ids.mixedDocumentId, label: 'Wrong scope' }],
    ['INVALID_COMMAND', 'conversationSegment.split', { id: ids.firstSentenceId, parts: [{ text: 'Hello.' }, { text: 'Welcome.' }] }],
    ['INVALID_COMMAND', 'conversationSegment.split', { id: ids.firstSentenceId, parts: [{ text: 'Hello.', meaning: 'Halo.', speaker: 'Bob' }, { text: 'Welcome.', meaning: 'Selamat datang.' }] }],
    ['COMMAND_REJECTED', 'conversationSegment.split', { id: ids.firstSentenceId, parts: [{ text: '', meaning: '' }, { text: 'Second', meaning: '' }] }],
    ['COMMAND_REJECTED', 'contentUnit.split', { id: ids.bobTurnId, splitAtIndex: 1 }]
  ];
  freeze(snapshot);
  const before = JSON.stringify(snapshot);
  for (const [code, type, payload] of cases) assert.throws(() => edit(snapshot, type, payload), typedError(code), type);
  assert.equal(JSON.stringify(snapshot), before);
});

await test('v1, partial, corrupt, missing UID, Paragraph and Legacy state cannot enter the editor', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const partial = { ...snapshot, contentUnitMigration: { ...snapshot.contentUnitMigration, phase: 'pending' } };
  assert.throws(() => selectTextConversationEditorState(partial), typedError('MIGRATION_REQUIRED'));
  const corrupt = { ...snapshot, segments: snapshot.segments.map(s => s.id === ids.firstSentenceId ? { ...s, unitId: 'UNIT_999999' } : s) };
  assert.throws(() => selectTextConversationEditorState(corrupt), typedError('INVALID_SNAPSHOT'));
  const missingUid = { ...snapshot, contentUnits: snapshot.contentUnits.map(u => u.id === ids.emptyTurnId ? { ...u, uid: null } : u) };
  assert.throws(() => selectTextConversationEditorState(missingUid), typedError('INVALID_SNAPSHOT'));
  assert.throws(() => selectTextConversationEditorState(snapshot, { documentId: 'missing' }), typedError('WORKSPACE_NOT_FOUND'));
  assert.throws(() => selectTextConversationEditorState({ schemaVersion: 1, initialized: true }), typedError('MIGRATION_REQUIRED'));
  for (const payload of [{ documentType: 'paragraph' }, { documentType: 'mixed', editorModel: 'legacy-line-v1' }]) {
    const added = applyTextLibraryCommand(snapshot, { type: 'document.create', payload }, 200);
    assert.throws(() => selectTextConversationEditorState(added.snapshot, { documentId: added.result.id }), typedError('UNSUPPORTED_WORKSPACE'));
  }
});

await test('backup and Pack/source boundaries preserve editor grouping, empties and UID semantics', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const changed = edit(snapshot, 'contentUnit.split', { id: ids.aliceTurnId, afterSegmentId: ids.firstSentenceId }).snapshot;
  const backup = createProLingoTextDatabaseBackup({ stores: changed, metaRecords: [
    { key: 'schemaVersion', value: 2 }, { key: 'initialized', value: true }, { key: 'activeDocumentId', value: ids.documentId },
    { key: 'idCounters', value: changed.counters }, { key: 'contentUnitMigration', value: changed.contentUnitMigration }
  ] });
  const restored = validateProLingoTextDatabaseBackup(backup).snapshot;
  assert.deepEqual(selectTextConversationEditorState(restored), selectTextConversationEditorState(changed));
  const pack = createProLingoTextPack({ snapshot: changed, scopeType: 'document', rootId: ids.documentId, now: 300 });
  const empty = backfillTextContentUnits({ schemaVersion: 1, initialized: true, counters: {}, collections: [], documents: [], blocks: [], segments: [], audioVariants: [] }).snapshot;
  const merged = mergeProLingoTextPack({ localSnapshot: empty, pack, now: 300 });
  const copyDocId = merged.idMap.documents[ids.documentId];
  const state = selectTextConversationEditorState(merged.snapshot, { documentId: copyDocId });
  assert.equal(selectTextConversationTurn(state, merged.idMap.contentUnits[ids.emptyTurnId]).empty, true);
  assert.equal(selectTextConversationScene(state, merged.idMap.blocks[ids.zeroSceneId]).turnCount, 0);
  for (const original of changed.contentUnits.filter(u => u.documentId === ids.documentId)) {
    const copied = merged.snapshot.contentUnits.find(u => u.id === merged.idMap.contentUnits[original.id]);
    assert.notEqual(copied.uid, original.uid);
  }
  for (const segment of pack.segments) assert.equal(merged.snapshot.segments.find(s => s.id === merged.idMap.segments[segment.id]).unitId, merged.idMap.contentUnits[segment.unitId]);
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 300 });
  const attachedSplit = edit(attached.snapshot, 'conversationSegment.split', {
    id: merged.idMap.segments[ids.firstSentenceId], parts: [{ text: 'Local first.', meaning: 'Pertama.' }, { text: 'Local tail.', meaning: 'Kedua.' }]
  }, copyDocId);
  const localChild = attachedSplit.snapshot.segments.find(s => s.id === attachedSplit.result.createdIds[0]);
  assert.equal(localChild.metadata.prolingoTextPackSource.ownership, 'detached-local');
  assert.equal(localChild.metadata.prolingoTextPackSource.attachmentId, null);
  const splitSync = planTextSourceSync({ localSnapshot: attachedSplit.snapshot, attachment: attached.attachment, pack });
  assert.equal(splitSync.ok, true);
  assert.ok(splitSync.snapshot.segments.some(s => s.id === localChild.id && s.uid === localChild.uid));
  assert.equal(planTextSourceDetach({ localSnapshot: attachedSplit.snapshot, attachment: attached.attachment, removeData: true }).ok, false);
  const local = edit(attached.snapshot, 'contentUnit.update', { id: merged.idMap.contentUnits[ids.emptyTurnId], metadata: { note: 'Local empty Turn' } }, copyDocId);
  assert.equal(planTextSourceDetach({ localSnapshot: local.snapshot, attachment: attached.attachment, removeData: true }).ok, false);
  const sync = planTextSourceSync({ localSnapshot: local.snapshot, attachment: attached.attachment, pack });
  assert.equal(sync.ok, true);
  assert.equal(selectTextConversationTurn(selectTextConversationEditorState(sync.snapshot, { documentId: copyDocId }), merged.idMap.contentUnits[ids.emptyTurnId]).metadata.note, 'Local empty Turn');
});

await test('editor calls never access persistence and leave canonical versions unchanged', () => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = { open() { throw new Error('Forbidden database access'); }, deleteDatabase() { throw new Error('Forbidden deletion'); } };
  try {
    const { snapshot, ids } = createD4aConversationFixture();
    const result = edit(snapshot, 'block.update', { id: ids.sceneId, title: 'In memory only' });
    assert.equal(selectTextConversationScene(result.state, ids.sceneId).title, 'In memory only');
    assert.equal(constants.TEXT_LIBRARY_DB_VERSION, 1);
    assert.equal(constants.TEXT_LIBRARY_SCHEMA_VERSION, 1);
  } finally { globalThis.indexedDB = previous; }
});

await test('splitting an External JSON Sentence cannot duplicate source identity or disappear on reconcile', () => {
  const { snapshot } = createD4aConversationFixture();
  const packageValue = JSON.parse(fs.readFileSync(new URL('./fixtures/p12a/P12_Conversation_Only_Additional_Test_v1.json', import.meta.url), 'utf8'));
  const initial = planProLingoTextExternalInitialImport({ localSnapshot: snapshot, package: packageValue, existingImports: [], now: 300 });
  const documentId = initial.importRecord.documentId;
  const original = initial.snapshot.segments.find(s => s.documentId === documentId);
  const split = edit(initial.snapshot, 'conversationSegment.split', { id: original.id, parts: [
    { text: 'Edited first.', meaning: 'Pertama.' }, { text: 'Edited tail.', meaning: 'Kedua.' }
  ] }, documentId);
  const createdId = split.result.createdIds[0];
  const reconciled = planTextExternalUpdateExisting({ localSnapshot: split.snapshot, package: packageValue, existingImport: initial.importRecord, conflictPolicy: 'keep-local', now: 400 });
  for (const id of [original.id, createdId]) {
    const before = split.snapshot.segments.find(s => s.id === id);
    const after = reconciled.snapshot.segments.find(s => s.id === id);
    assert.ok(after, `Reconciliation lost split Sentence ${id}`);
    assert.deepEqual([after.uid, after.unitId, after.text], [before.uid, before.unitId, before.text]);
  }
  assert.equal(split.snapshot.segments.find(s => s.id === createdId).metadata.externalEntityV1, undefined);
  assert.deepEqual(split.snapshot.segments.find(s => s.id === original.id).metadata.externalEntityV1, original.metadata.externalEntityV1);
});

console.log(`D4A EDITOR: ${passed} PASS, ${failed} FAIL`);
if (failed) process.exitCode = 1;
