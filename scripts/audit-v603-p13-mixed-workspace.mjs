import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createP13MixedFixture } from './fixtures/p13-mixed/mixed-workspace-fixture.js';
import { createA1V1ParagraphFixture } from './fixtures/shared-card-a1/presentation-fixture.js';
import { createD4aConversationFixture } from './fixtures/d4a/conversation-editor-fixture.js';
import { selectTextMixedReaderState, resolveTextMixedReaderCursor, createTextMixedReaderActions } from '../src/domain/text/textMixedReaderDomain.js';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { resolveTextConversationReaderCursor, createTextConversationReaderActions } from '../src/domain/text/textConversationReaderDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { applyTextConversationEditorCommand } from '../src/domain/text/textConversationEditorDomain.js';
import { selectTextMainReaderPresentation } from '../src/domain/text/textMainReaderDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { getSharedUnitTerms, buildCardSpeakerAppearanceMap } from '../src/components/text/presentation/sharedCardPresentationUtils.js';

let storageCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { storageCalls++; throw Error('Mixed tests forbid persistence'); } });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const f = createP13MixedFixture();
const { snapshot, ids } = f;
const original = JSON.stringify(snapshot);
const state = selectTextMixedReaderState(snapshot, { documentId: ids.documentId });
const { presentation, documentTree } = state;
test('Complete persistent Mixed snapshot reuses the exact A1 projection and hydrated tree', () => {
  assert.deepEqual(presentation, selectTextCardPresentation(snapshot));
  assert.deepEqual(documentTree, resolveTextLibraryDocumentTree(snapshot, ids.documentId));
  assert.equal(presentation.workspace.documentType, 'mixed');
  assert.ok(Object.isFrozen(state) && Object.isFrozen(documentTree.blocks[0].metadata));
});
test('Paragraph → Conversation → Paragraph and every subsequent empty Card keep authored order', () => {
  assert.deepEqual(presentation.cards.map(c => c.id), f.cardOrder);
  assert.deepEqual(presentation.cards.slice(0, 3).map(c => c.blockType), ['paragraph', 'conversation', 'paragraph']);
  presentation.cards.forEach(c => c.units.forEach(u => assert.equal(u.kind, c.blockType === 'paragraph' ? 'paragraph' : 'turn')));
});
test('All Card/Unit/Segment IDs, UIDs, parent relationships and raw EN/ID/joinAfter survive exactly', () => {
  for (const card of presentation.cards) {
    const stored = snapshot.blocks.find(b => b.id === card.id);
    for (const key of ['id', 'uid', 'documentId', 'order', 'blockType']) assert.equal(card[key], stored[key]);
    for (const unit of card.units) {
      const source = snapshot.contentUnits.find(u => u.id === unit.id);
      for (const key of ['id', 'uid', 'order', 'speakerId']) assert.equal(unit[key], source[key]);
      assert.equal(unit.identitySource, 'persistent');
      for (const segment of unit.segments) {
        const original = snapshot.segments.find(s => s.id === segment.id);
        for (const key of ['id', 'uid', 'unitId', 'order', 'text', 'meaning', 'joinAfter']) assert.equal(segment[key], original[key]);
        assert.deepEqual(presentation.locationBySegmentId[segment.id], { cardId: card.id, unitId: unit.id, unitViewKey: unit.viewKey });
      }
    }
  }
});
test('Empty Section, empty Turn, zero-Turn Scene and zero-Section Paragraph are not dropped', () => {
  assert.equal(presentation.unitById[ids.emptySectionId].segments.length, 0);
  assert.equal(presentation.unitById[ids.emptyTurnId].segments.length, 0);
  assert.equal(presentation.cardById[ids.zeroSceneId].units.length, 0);
  assert.equal(presentation.cardById[ids.emptyParagraphId].units.length, 0);
});
test('Same-speaker consecutive Turns remain distinct; registry ID/UID and colour agree across Scenes', () => {
  const first = presentation.unitById[ids.aliceTurnId], next = presentation.unitById[ids.nextAliceTurnId], later = presentation.unitById[ids.laterTurnId];
  assert.equal(first.segments.length, 2);
  assert.equal(first.speakerId, next.speakerId);
  assert.equal(first.speakerUid, next.speakerUid);
  assert.equal(first.speakerId, later.speakerId);
  assert.equal(first.speakerUid, later.speakerUid);
  assert.notEqual(first.viewKey, next.viewKey);
  const a = buildCardSpeakerAppearanceMap(presentation.cardById[ids.sceneId]);
  const b = buildCardSpeakerAppearanceMap(presentation.cardById[ids.laterSceneId]);
  assert.ok(a.has('id:' + first.speakerId) && b.has('id:' + later.speakerId));
  assert.deepEqual(a.get('id:' + first.speakerId), b.get('id:' + later.speakerId));
  assert.equal(presentation.unitById[ids.unassignedTurnId].speakerId, null);
});
test('Duplicate sentence text and blank meanings remain paired solely by Segment identity', () => {
  assert.equal(presentation.segmentById[ids.beforeSentenceId].text, '  Hello. Welcome.  ');
  assert.equal(presentation.segmentById[ids.blankMeaningId].meaning, '');
  assert.equal(presentation.segmentById[ids.firstSentenceId].meaning, 'Halo. Selamat datang.');
  assert.notEqual(ids.beforeSentenceId, ids.firstSentenceId);
});
test('Nonvisual source/audio metadata, AudioVariant IDs/UIDs/RFs and Full artifacts remain exact in the detached tree', () => {
  const before = documentTree.blocks.find(b => b.id === ids.beforeCardId).segments.find(s => s.id === ids.beforeSentenceId);
  const source = snapshot.segments.find(s => s.id === ids.beforeSentenceId);
  assert.deepEqual(before.metadata, source.metadata);
  assert.deepEqual(before.audioVariants, snapshot.audioVariants.filter(v => v.segmentId === source.id));
  const scene = documentTree.blocks.find(b => b.id === ids.sceneId);
  assert.deepEqual(scene.metadata, snapshot.blocks.find(b => b.id === scene.id).metadata);
  assert.throws(() => { before.metadata.sourceTag = 'changed'; }, TypeError);
  assert.throws(() => { before.audioVariants[0].metadata.fixtureNote = 'changed'; }, TypeError);
  assert.equal(Object.isFrozen(source.metadata), false);
});
test('Projection is deeply immutable and never freezes or mutates its source snapshot', () => {
  assert.equal(JSON.stringify(snapshot), original);
  assert.equal(Object.isFrozen(snapshot), false);
  assert.throws(() => { presentation.cards.reverse(); }, TypeError);
  assert.deepEqual(selectTextMixedReaderState(freeze(structuredClone(snapshot))), state);
});
test('Card reorder preserves metadata, identities and per-Card Unit interpretation', () => {
  const changed = applyTextLibraryCommand(snapshot, { type: 'block.reorder', payload: { documentId: ids.documentId, orderedIds: [...f.cardOrder].reverse() } }, 1400).snapshot;
  const view = selectTextMixedReaderState(changed).presentation;
  assert.deepEqual(view.cards.map(c => c.id), [...f.cardOrder].reverse());
  assert.deepEqual(view.segmentById, presentation.segmentById);
  assert.deepEqual(changed.audioVariants, snapshot.audioVariants);
});
test('Speaker rename/reassignment uses existing commands while preserving interleaved Cards and Turn UIDs', () => {
  const alice = presentation.unitById[ids.aliceTurnId], bob = presentation.unitById[ids.bobTurnId];
  let next = applyTextConversationEditorCommand(snapshot, { type: 'speaker.rename',
    payload: { documentId: ids.documentId, speakerId: alice.speakerId, label: 'Alicia' } }, { documentId: ids.documentId }).snapshot;
  let p = selectTextMixedReaderState(next).presentation;
  assert.equal(p.unitById[ids.laterTurnId].speakerLabel, 'Alicia');
  assert.equal(p.unitById[ids.laterTurnId].speakerUid, alice.speakerUid);
  next = applyTextConversationEditorCommand(next, { type: 'contentUnit.update',
    payload: { id: ids.nextAliceTurnId, speakerId: bob.speakerId } }, { documentId: ids.documentId }).snapshot;
  p = selectTextMixedReaderState(next).presentation;
  assert.equal(p.unitById[ids.nextAliceTurnId].speakerId, bob.speakerId);
  assert.equal(p.unitById[ids.nextAliceTurnId].uid, presentation.unitById[ids.nextAliceTurnId].uid);
  assert.deepEqual(p.cards.map(c=>c.id), f.cardOrder);
  assert.deepEqual(next.audioVariants, snapshot.audioVariants);
});
test('Existing validators reject corruption/partial upgrades/unsupported versions without repair', () => {
  for (const corrupt of [
    s => { s.contentUnitMigration.phase = 'schema-upgraded'; },
    s => { delete s.contentUnits; },
    s => { s.contentUnits.find(u=>u.id === ids.sectionId).kind = 'turn'; },
    s => { s.segments.find(x=>x.id === ids.firstSentenceId).unitId = ids.sectionId; },
    s => { delete s.segments[0].uid; },
    s => { s.audioVariants[0].uid = s.audioVariants[1].uid; },
    s => { s.schemaVersion = 3; }
  ]) {
    const bad = structuredClone(snapshot); corrupt(bad); const before = JSON.stringify(bad);
    assert.throws(() => selectTextMixedReaderState(bad), e => ['INVALID_SNAPSHOT', 'MIGRATION_REQUIRED', 'UNSUPPORTED_SCHEMA'].includes(e.code));
    assert.equal(JSON.stringify(bad), before);
  }
});
test('Assigned speaker IDs must resolve in this Workspace registry; no label-based repair', () => {
  const bad = structuredClone(snapshot);
  bad.contentUnits.find(u=>u.id === ids.emptyTurnId).speakerId = 'SPEAKER_999999';
  // A1 permits compatibility data with an unresolved ID; Mixed requires a registry mapping.
  assert.equal(selectTextCardPresentation(bad).unitById[ids.emptyTurnId].speakerUid, null);
  assert.throws(() => selectTextMixedReaderState(bad), e => e.code === 'INVALID_SNAPSHOT');
});
test('V1 virtual Sections remain available only through the established compatibility path; Mixed requires persistent v2', () => {
  const v1 = createA1V1ParagraphFixture();
  const before = JSON.stringify(v1.snapshot);
  assert.equal(selectTextCardPresentation(v1.snapshot).cards[0].units[0].id, null);
  v1.snapshot.documents[0].documentType = 'mixed';
  assert.throws(() => selectTextMixedReaderState(v1.snapshot), e => e.code === 'PERSISTENT_UNITS_REQUIRED');
  v1.snapshot.documents[0].documentType = 'paragraph';
  assert.equal(JSON.stringify(v1.snapshot), before);
  assert.equal('contentUnits' in v1.snapshot, false);
  const conversation = createD4aConversationFixture();
  assert.throws(() => selectTextMixedReaderState(conversation.snapshot), e => e.code === 'UNSUPPORTED_WORKSPACE');
});
const scope = { current: true, workspaceId: presentation.workspace.id, workspaceUid: presentation.workspace.uid,
  sessionId: 13, playingContext: 'text-structured', isPlaying: true, isPaused: false, playbackRepresentationMode: 'split' };
const status = { sessionId: 13, documentId: ids.documentId, blockId: ids.sceneId, segmentId: ids.secondSentenceId, channel: 'meaning', source: 'tts', mode: 'tts' };
const playback = (extraScope = {}, extraStatus = {}) => ({ readPresentationPlaybackScope: () => ({ ...scope, ...extraScope }), playbackSourceStatus: { ...status, ...extraStatus } });
test('Mixed reuses the exact D5 cursor/action bridges, without a second playback authority', () => {
  assert.equal(resolveTextMixedReaderCursor, resolveTextConversationReaderCursor);
  assert.equal(createTextMixedReaderActions, createTextConversationReaderActions);
  const cursor = resolveTextMixedReaderCursor({ presentation, audioPlayback: playback() });
  assert.equal(cursor.segmentId, ids.secondSentenceId); assert.equal(cursor.unitId, ids.aliceTurnId); assert.equal(cursor.channel, 'meaning');
  const paragraph = resolveTextMixedReaderCursor({ presentation, audioPlayback: playback({}, { blockId: ids.beforeCardId, segmentId: ids.beforeSentenceId }) });
  assert.equal(paragraph.unitId, ids.sectionId);
});
test('Cached Full is Card-only; proven per-Sentence Full fallback is Segment precision', () => {
  const cached = resolveTextMixedReaderCursor({ presentation, audioPlayback: playback({}, { mode: 'full-local', representation: 'full', segmentId: null }) });
  assert.equal(cached.precision, 'card'); assert.equal(cached.segmentId, null); assert.equal(cached.unitId, null);
  const fallback = resolveTextMixedReaderCursor({ presentation, audioPlayback: playback({}, { representation: 'full' }) });
  assert.equal(fallback.precision, 'segment');
});
test('Stale/foreign/stopped status or missing observer fails closed, including wrong parent Card', () => {
  for (const audioPlayback of [null, { playbackSourceStatus: status },
    playback({ current: false }), playback({ workspaceId: ids.mixedDocumentId }), playback({ workspaceUid: 'stale' }),
    playback({ isPlaying: false }), playback({}, { sessionId: 12 }), playback({}, { documentId: ids.mixedDocumentId }),
    playback({}, { blockId: ids.beforeCardId }), playback({}, { source: 'unavailable' })
  ]) assert.equal(resolveTextMixedReaderCursor({ presentation, audioPlayback }).precision, 'none');
});
test('Explicit actions preserve current Segment/Card IDs and only validated one-shot channel options', () => {
  const calls = [], host = { playSentence: (...a) => calls.push(['segment', ...a]), playScene: (...a) => calls.push(['card', ...a]) };
  const actions = createTextMixedReaderActions({ presentation, audioPlayback: host });
  actions.onPlaySegment(ids.beforeSentenceId); actions.onPlaySegment(ids.firstSentenceId);
  actions.onPlayCard(ids.beforeCardId, { playbackChannelMode: 'meaning-only', provider: 'ignored' });
  actions.onPlayCard(ids.sceneId, { playbackRepresentationMode: 'ignored' });
  assert.deepEqual(calls, [['segment', ids.beforeSentenceId], ['segment', ids.firstSentenceId], ['card', ids.beforeCardId, { playbackChannelMode: 'meaning-only' }], ['card', ids.sceneId]]);
  actions.onPlayCard('foreign'); actions.onPlaySegment('foreign');
  createTextMixedReaderActions({ presentation, audioPlayback: host, disabled: true }).onPlayCard(ids.sceneId);
  assert.equal(calls.length, 4);
});
test('Mixed toolbar is type-neutral while Paragraph/Scene terminology and A6 eligibility remain unchanged', () => {
  assert.equal(getSharedUnitTerms({ documentType: 'mixed' }).plural, 'sections or speaker turns');
  assert.equal(getSharedUnitTerms(presentation.cardById[ids.beforeCardId]).label, 'Section');
  assert.equal(getSharedUnitTerms(presentation.cardById[ids.sceneId]).label, 'Speaker Turn');
  assert.equal(selectTextMainReaderPresentation(snapshot, ids.documentId).presentation, null);
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(storageCalls, 0); assert.equal(JSON.stringify(snapshot), original);
});
const entry = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
assert.match(entry, /LazyMixedWorkspaceQaPreview = import\.meta\.env\.DEV \?/);
console.log(`${passed} P13 Mixed Node checks PASS; storage calls: ${storageCalls}`);
