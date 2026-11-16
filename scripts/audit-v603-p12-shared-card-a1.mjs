import assert from 'node:assert/strict';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import { DEFAULT_TEXT_CARD_PRESENTATION_STATE, normalizeTextCardPresentationState, updateTextCardPresentationState } from '../src/domain/text/textCardPresentationStateDomain.js';
import { resolveTextCardPresentationCursor } from '../src/domain/text/textCardPresentationCursorDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { createA1PresentationFixture, createA1V1ParagraphFixture } from './fixtures/shared-card-a1/presentation-fixture.js';

let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { dbCalls++; throw Error('A1 forbids IndexedDB'); } });
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const { snapshot, ids } = createA1PresentationFixture();
const original = JSON.stringify(snapshot);
freeze(snapshot);
const select = documentId => selectTextCardPresentation(snapshot, { documentId });
const paragraph = select(ids.paragraphDocumentId);
const conversation = select(ids.documentId);

test('Persistent Sections and paired raw Segment fields retain exact identity, text, meaning, joinAfter and order', () => {
  const card = paragraph.cardById[ids.paragraphCardId];
  assert.deepEqual(card.units.map(unit => unit.id), [ids.firstSectionId, ids.secondSectionId, ids.emptySectionId]);
  assert.equal(card.units[0].segments.length, 2);
  for (const projected of Object.values(paragraph.segmentById)) {
    const stored = snapshot.segments.find(segment => segment.id === projected.id);
    for (const key of ['id', 'uid', 'unitId', 'order', 'text', 'meaning', 'joinAfter']) assert.equal(projected[key], stored[key]);
  }
  assert.equal(card.units[0].segments[0].text, '  Same words.  ');
  assert.equal(card.units[0].segments[1].meaning, '');
  assert.equal(card.units[1].segments[0].meaning, 'Arti ketiga.');
});
test('Multiple-Sentence Turns, distinct same-speaker Turns, empty Units and zero-Unit Cards are retained', () => {
  const scene = conversation.cardById[ids.sceneId];
  assert.equal(scene.units[0].segments.length, 2);
  assert.equal(conversation.unitById[ids.emptyTurnId].segments.length, 0);
  assert.equal(conversation.unitById[ids.emptyTurnId].speakerId, scene.units[0].speakerId);
  assert.notEqual(scene.units[0].viewKey, conversation.unitById[ids.nextAliceTurnId].viewKey);
  assert.equal(conversation.cardById[ids.zeroSceneId].units.length, 0);
  assert.equal(paragraph.cardById[ids.zeroParagraphCardId].units.length, 0);
  for (const unit of scene.units) {
    const stored = snapshot.contentUnits.find(item => item.id === unit.id);
    assert.equal(unit.uid, stored.uid); assert.equal(unit.speakerId, stored.speakerId); assert.equal(unit.speakerLabel, stored.speaker);
    const registry = snapshot.documents.find(doc => doc.id === ids.documentId).metadata.speakerRegistryV1;
    assert.equal(unit.speakerUid, (Array.isArray(registry) ? registry : registry.speakers).find(speaker => speaker.id === unit.speakerId).uid);
  }
});
test('Mixed projection preserves interleaved Card order, not only Conversation scenes', () => {
  const reordered = applyTextLibraryCommand(snapshot, { type: 'block.reorder', payload: { documentId: ids.mixedDocumentId,
    orderedIds: [ids.mixedSceneId, ids.paragraphId] } }, 710).snapshot;
  const view = selectTextCardPresentation(reordered, { documentId: ids.mixedDocumentId });
  assert.deepEqual(view.cards.map(card => card.id), [ids.mixedSceneId, ids.paragraphId]);
  assert.equal(view.cards[0].blockType, 'conversation'); assert.equal(view.cards[1].blockType, 'paragraph');
});
test('Projection is detached/frozen and never mutates source metadata, counters, audio or identities', () => {
  assert.equal(JSON.stringify(snapshot), original);
  assert.throws(() => { paragraph.segmentById[ids.firstParagraphSegmentId].meaning = 'changed'; }, TypeError);
  assert.throws(() => paragraph.cards[0].units.push({}), TypeError);
  assert.throws(() => { paragraph.locationBySegmentId[ids.firstParagraphSegmentId].unitId = 'fake'; }, TypeError);
  assert.deepEqual(select(ids.paragraphDocumentId), paragraph);
  for (const card of paragraph.cards) assert.equal(card.uid, snapshot.blocks.find(block => block.id === card.id).uid);
  assert.equal(paragraph.workspace.uid, snapshot.documents.find(doc => doc.id === ids.paragraphDocumentId).uid);
});
test('V1 Paragraph has stable virtual view keys, null persisted Unit IDs and no fake Segment links', () => {
  const v1 = createA1V1ParagraphFixture(); const before = JSON.stringify(v1.snapshot);
  const view = selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId });
  const unit = view.cardById[v1.ids.cardId].units[0];
  assert.equal(unit.viewKey, `virtual:paragraph:${v1.ids.cardId}`);
  assert.equal(unit.id, null); assert.equal(unit.uid, null); assert.equal(unit.identitySource, 'v1-paragraph-compat');
  assert.equal(unit.segments[0].unitId, null); assert.equal(Object.keys(view.unitById).length, 0);
  assert.equal(view.cardById[v1.ids.emptyCardId].units[0].segments.length, 0);
  assert.equal(JSON.stringify(v1.snapshot), before); assert.ok(!Object.hasOwn(v1.snapshot, 'contentUnits'));
  const result = resolveTextCardPresentationCursor({ presentation: view, playback: { workspaceId: view.workspace.id,
    workspaceUid: view.workspace.uid, sessionId: 1, playingContext: 'text-structured', isPlaying: true,
    playbackRepresentationMode: 'split', playingIndex: v1.ids.segmentId, speakingPart: 'text' } });
  assert.equal(result.precision, 'segment'); assert.equal(result.unitId, null);
});
test('Existing validation rejects partial v2, missing/wrong FK, mixed Unit kinds and missing UIDs without repair', () => {
  const cases = [
    state => { state.contentUnitMigration.phase = 'schema-upgraded'; },
    state => { delete state.contentUnitMigration; },
    state => { state.contentUnitMigration.materializedBlockIds = []; },
    state => { state.segments[0].unitId = 'UNIT_999999'; },
    state => { state.segments[0].unitId = ids.firstSectionId; },
    state => { state.contentUnits[0].kind = 'paragraph'; },
    state => { delete state.contentUnits[0].uid; },
    state => { state.segments[0].text = { invalid: 'body' }; }
  ];
  for (const corrupt of cases) {
    const state = structuredClone(snapshot); corrupt(state); const before = JSON.stringify(state);
    assert.throws(() => selectTextCardPresentation(state, { documentId: ids.documentId }), error => ['INVALID_SNAPSHOT', 'MIGRATION_REQUIRED'].includes(error.code));
    assert.equal(JSON.stringify(state), before);
    if (typeof state.segments[0].text === 'object') assert.equal(Object.isFrozen(state.segments[0].text), false);
  }
});
test('V1 Conversation and Legacy remain isolated; missing Workspace has a typed error', () => {
  const v1 = createA1V1ParagraphFixture();
  v1.snapshot.documents[0].documentType = 'conversation'; v1.snapshot.blocks.forEach(block => { block.blockType = 'conversation'; });
  assert.throws(() => selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId }), error => error.code === 'PERSISTENT_UNITS_REQUIRED');
  v1.snapshot.documents[0].documentType = 'paragraph'; v1.snapshot.blocks.forEach(block => { block.blockType = 'paragraph'; });
  v1.snapshot.documents[0].editorModel = 'legacy-line-v1';
  assert.throws(() => selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId }), error => error.code === 'UNSUPPORTED_WORKSPACE');
  assert.throws(() => selectTextCardPresentation(snapshot, { documentId: 'DOC_999999' }), error => error.code === 'WORKSPACE_NOT_FOUND');
});
test('View normalization/update is whitelisted, immutable and independent from audio, browse and old display preferences', () => {
  const audio = freeze({ splitMode: true, playbackRepresentationMode: 'full', displayMode: 'text-active-meaning', voice: 'unchanged' });
  assert.deepEqual(normalizeTextCardPresentationState(audio), DEFAULT_TEXT_CARD_PRESENTATION_STATE);
  const before = JSON.stringify(audio);
  const updated = updateTextCardPresentationState(DEFAULT_TEXT_CARD_PRESENTATION_STATE, { level: 'part', bilingualLayout: 'meaning-only',
    partLayout: 'horizontal-focus', playbackRepresentationMode: 'split', selectedUnitId: ids.bobTurnId });
  assert.deepEqual(updated, { level: 'part', bilingualLayout: 'meaning-only', partLayout: 'horizontal-focus' });
  assert.equal(JSON.stringify(audio), before); assert.equal(JSON.stringify(snapshot), original);
  assert.deepEqual(normalizeTextCardPresentationState({ level: 'bad', bilingualLayout: 'text-active-meaning', partLayout: 'carousel' }), DEFAULT_TEXT_CARD_PRESENTATION_STATE);
});

const host = { workspaceId: conversation.workspace.id, workspaceUid: conversation.workspace.uid, sessionId: 11,
  playingContext: 'text-structured', isPlaying: true, isPaused: false, playbackRepresentationMode: 'split',
  playingIndex: ids.secondSentenceId, currentIndex: ids.firstSentenceId, activeBlockId: ids.sceneId, speakingPart: 'meaning' };
const cursor = patch => resolveTextCardPresentationCursor({ presentation: conversation, playback: { ...host, ...patch } });
test('Split audible cursor resolves Segment -> persistent Unit -> Card, retaining session and channel', () => {
  assert.deepEqual(cursor({}), { workspaceId: host.workspaceId, workspaceUid: host.workspaceUid, sessionId: 11, state: 'playing',
    cardId: ids.sceneId, unitId: ids.aliceTurnId, segmentId: ids.secondSentenceId, channel: 'meaning', precision: 'segment' });
  assert.equal(cursor({ isPaused: true }).state, 'paused');
});
test('Full per-Sentence telemetry outranks Card anchor; cached Full reports Card precision only', () => {
  const status = { sessionId: 11, documentId: ids.documentId, blockId: ids.sceneId, channel: 'text', representation: 'full',
    segmentId: ids.bobSentenceId, unitId: 'untrusted', mode: 'tts', source: 'tts' };
  const known = cursor({ playbackRepresentationMode: 'full', playingIndex: null, playbackSourceStatus: status });
  assert.equal(known.segmentId, ids.bobSentenceId); assert.equal(known.unitId, ids.bobTurnId);
  const cached = cursor({ playbackSourceStatus: { ...status, segmentId: null, mode: 'full-local' } });
  assert.equal(cached.precision, 'card'); assert.equal(cached.segmentId, null); assert.equal(cached.unitId, null);
  const anchored = cursor({ playbackRepresentationMode: 'full', playingIndex: null });
  assert.equal(anchored.precision, 'card'); assert.equal(anchored.segmentId, null);
});
test('Stale/foreign/reset/stopped scopes fail closed; stale status cannot nominate a Segment', () => {
  assert.equal(resolveTextCardPresentationCursor({ presentation: conversation, playback: null }).precision, 'none');
  for (const patch of [{ workspaceId: ids.mixedDocumentId }, { workspaceUid: 'old-uid' }, { sessionId: null }, { playingContext: 'table' },
    { isPlaying: false, isPaused: false }]) assert.equal(cursor(patch).precision, 'none');
  for (const source of [{ sessionId: 10, documentId: ids.documentId }, { sessionId: 11, documentId: ids.mixedDocumentId }]) {
    const result = cursor({ playbackRepresentationMode: 'full', playingIndex: null, playbackSourceStatus: { ...source, segmentId: ids.bobSentenceId } });
    assert.equal(result.precision, 'card'); assert.equal(result.segmentId, null);
  }
  assert.equal(cursor({ playbackSourceStatus: { sessionId: 11, documentId: ids.documentId, segmentId: 'SEGMENT_999999' } }).precision, 'none');
});
test('Unavailable speech and malformed parent telemetry do not fabricate an audible position; browse selection is ignored', () => {
  const status = { sessionId: 11, documentId: ids.documentId, segmentId: ids.bobSentenceId, blockId: ids.zeroSceneId };
  assert.equal(cursor({ playbackSourceStatus: status }).precision, 'none');
  assert.equal(cursor({ playbackSourceStatus: { ...status, source: 'unavailable' } }).precision, 'none');
  assert.equal(cursor({ selectedUnitId: ids.bobTurnId, selectedSegmentId: ids.bobSentenceId }).segmentId, ids.secondSentenceId);
});
test('Canonical versions stay 1 and no database access occurred', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1); assert.equal(dbCalls, 0);
  assert.equal(JSON.stringify(snapshot), original);
});
console.log(`A1 FOUNDATION: ${passed} PASS, 0 FAIL; IndexedDB calls: ${dbCalls}`);
