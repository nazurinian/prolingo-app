import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createD4aConversationFixture } from './fixtures/d4a/conversation-editor-fixture.js';
import { applyTextConversationEditorCommand } from '../src/domain/text/textConversationEditorDomain.js';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import { selectTextConversationReaderPresentation as project, resolveTextConversationReaderCursor as cursor,
  createTextConversationReaderActions as actions } from '../src/domain/text/textConversationReaderDomain.js';
import { normalizeTextCardPresentationState, updateTextCardPresentationState } from '../src/domain/text/textCardPresentationStateDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { createA2V1CompatibilityParagraphFixture } from './fixtures/shared-card-a2/paragraph-reader-fixture.js';

let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { dbCalls++; throw new Error('C1 forbids IndexedDB'); } });
const results = [];
const test = (name, run) => {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
};
const edit = (snapshot, ids, type, payload) => applyTextConversationEditorCommand(snapshot, { type, payload }, { documentId: ids.documentId, now: 500 });
const freeze = obj => { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; };

test('D4 validated snapshot -> exact frozen A1 projection; no content or metadata writes', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const before = JSON.stringify(snapshot);
  const p = project(freeze(snapshot), { documentId: ids.documentId });
  assert.deepEqual(p, selectTextCardPresentation(snapshot, { documentId: ids.documentId }));
  for (const card of p.cards) {
    assert.equal(card.uid, snapshot.blocks.find(b => b.id === card.id).uid);
    for (const unit of card.units) {
      const stored = snapshot.contentUnits.find(u => u.id === unit.id);
      assert.deepEqual([unit.uid, unit.speakerId, unit.order], [stored.uid, stored.speakerId, stored.order]);
      for (const segment of unit.segments) {
        const stored = snapshot.segments.find(s => s.id === segment.id);
        assert.deepEqual([segment.uid, segment.unitId, segment.text, segment.meaning, segment.joinAfter],
          [stored.uid, stored.unitId, stored.text, stored.meaning, stored.joinAfter]);
        assert.ok(Object.isFrozen(segment));
      }
    }
  }
  assert.equal(JSON.stringify(snapshot), before);
});

test('Adjacent same-speaker Turns stay separate; multi-Sentence, empty Turn and zero-Unit Scene survive', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const p = project(snapshot, { documentId: ids.documentId });
  const units = p.cardById[ids.sceneId].units;
  assert.notEqual(units[0].viewKey, units[1].viewKey);
  assert.equal(units[0].speakerId, units[1].speakerId);
  assert.deepEqual(units[0].segments.map(s => s.id), [ids.firstSentenceId, ids.secondSentenceId]);
  assert.equal(p.unitById[ids.emptyTurnId].segments.length, 0);
  assert.equal(p.cardById[ids.zeroSceneId].units.length, 0);
});

test('Duplicate text and blank meanings stay paired by persistent Segment identity', () => {
  let { snapshot, ids } = createD4aConversationFixture();
  snapshot = edit(snapshot, ids, 'segment.update', { id: ids.secondSentenceId, text: 'Hello. Welcome.', meaning: '' }).snapshot;
  const p = project(snapshot, { documentId: ids.documentId });
  assert.equal(p.segmentById[ids.firstSentenceId].meaning, 'Halo. Selamat datang.');
  assert.equal(p.segmentById[ids.secondSentenceId].meaning, '');
  assert.equal(p.segmentById[ids.firstSentenceId].text, p.segmentById[ids.secondSentenceId].text);
});

test('Speaker rename/reassignment changes labels and registry assignment, never Turn identity', () => {
  let { snapshot, ids } = createD4aConversationFixture();
  const initial = project(snapshot, { documentId: ids.documentId });
  const bobId = initial.unitById[ids.bobTurnId].speakerId;
  snapshot = edit(snapshot, ids, 'speaker.rename', { documentId: ids.documentId, speakerId: bobId, label: 'Robert' }).snapshot;
  snapshot = edit(snapshot, ids, 'contentUnit.update', { id: ids.aliceTurnId, speakerId: bobId }).snapshot;
  const p = project(snapshot, { documentId: ids.documentId });
  assert.equal(p.unitById[ids.aliceTurnId].uid, initial.unitById[ids.aliceTurnId].uid);
  assert.equal(p.unitById[ids.aliceTurnId].speakerUid, initial.unitById[ids.bobTurnId].speakerUid);
  assert.equal(p.unitById[ids.aliceTurnId].speakerLabel, 'Robert');
  assert.ok(p.unitById[ids.aliceTurnId].segments.every(s => s.speakerId === bobId && s.speaker === 'Robert'));
});

test('D4 Turn reorder, Sentence reorder/move, Turn split/merge, Sentence split/merge/delete all project', () => {
  let { snapshot, ids } = createD4aConversationFixture();
  const initial = project(snapshot, { documentId: ids.documentId });
  const apply = (type, payload) => {
    const out = edit(snapshot, ids, type, payload);
    snapshot = out.snapshot;
    const p = project(snapshot, { documentId: ids.documentId });
    for (const card of p.cards) for (const unit of card.units) for (const seg of unit.segments) {
      assert.deepEqual(p.locationBySegmentId[seg.id], { cardId: card.id, unitId: unit.id, unitViewKey: unit.viewKey });
    }
    return out;
  };
  apply('contentUnit.reorder', { blockId: ids.sceneId, orderedIds: [ids.bobTurnId, ids.aliceTurnId, ids.emptyTurnId, ids.nextAliceTurnId] });
  apply('contentUnit.reorderSegments', { id: ids.aliceTurnId, orderedIds: [ids.secondSentenceId, ids.firstSentenceId] });
  apply('segment.move', { segmentId: ids.firstSentenceId, targetUnitId: ids.emptyTurnId });
  apply('segment.move', { segmentId: ids.firstSentenceId, targetUnitId: ids.aliceTurnId });
  const split = apply('contentUnit.split', { id: ids.aliceTurnId, beforeSegmentId: ids.firstSentenceId });
  apply('contentUnit.merge', { ids: [ids.aliceTurnId, split.result.createdId] });
  const sentences = apply('conversationSegment.split', { id: ids.firstSentenceId, parts: [{ text: 'Hello.', meaning: 'Halo.' }, { text: 'Welcome.', meaning: '' }] });
  apply('conversationSegments.merge', { ids: [ids.firstSentenceId, sentences.result.createdIds[0]] });
  apply('segment.delete', { id: ids.secondSentenceId });
  apply('segment.delete', { id: ids.firstSentenceId });
  const p = project(snapshot, { documentId: ids.documentId });
  assert.equal(p.unitById[ids.aliceTurnId].uid, initial.unitById[ids.aliceTurnId].uid);
  assert.equal(p.unitById[ids.aliceTurnId].segments.length, 0);
  assert.equal(p.unitById[ids.emptyTurnId].segments.length, 0);
  apply('contentUnit.delete', { id: ids.emptyTurnId });
  apply('block.delete', { id: ids.sceneId });
  assert.deepEqual(project(snapshot, { documentId: ids.documentId }).cards.map(c => c.id), [ids.zeroSceneId]);
});

test('Corrupt/partial/v1 inputs fail without repair; Mixed UI rejected but A1 Mixed projection retained', () => {
  const { snapshot, ids } = createD4aConversationFixture();
  for (const mutate of [s => { s.contentUnitMigration.phase = 'schema-upgraded'; },
    s => { s.segments[0].unitId = 'missing'; }, s => { delete s.contentUnits[0].uid; }]) {
    const bad = structuredClone(snapshot); mutate(bad);
    const before = JSON.stringify(bad);
    assert.throws(() => project(bad, { documentId: ids.documentId }));
    assert.equal(JSON.stringify(bad), before);
  }
  const v1 = createA2V1CompatibilityParagraphFixture();
  assert.throws(() => project(v1.snapshot, { documentId: v1.ids.documentId }));
  assert.throws(() => project(snapshot, { documentId: ids.mixedDocumentId }), /Mixed UI/);
  assert.deepEqual(selectTextCardPresentation(snapshot, { documentId: ids.mixedDocumentId }).cards.map(c => c.id), [ids.paragraphId, ids.mixedSceneId]);
});

const playbackFixture = () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const presentation = project(snapshot, { documentId: ids.documentId });
  const scope = { current: true, workspaceId: ids.documentId, workspaceUid: presentation.workspace.uid, sessionId: 7,
    playingContext: 'text-structured', isPlaying: true, isPaused: false, playbackRepresentationMode: 'split' };
  const status = { sessionId: 7, documentId: ids.documentId, blockId: ids.sceneId, segmentId: ids.secondSentenceId,
    unitId: 'untrusted-unit', channel: 'meaning', mode: 'split-local', representation: 'split' };
  return { ids, presentation, scope, audioPlayback: { readPresentationPlaybackScope: () => scope, playbackSourceStatus: status } };
};
test('Split and per-Sentence Full fallback resolve parent Turn from Segment; cached Full only Card precision', () => {
  const { ids, presentation, scope, audioPlayback } = playbackFixture();
  const c = cursor({ presentation, audioPlayback });
  assert.deepEqual([c.precision, c.segmentId, c.unitId, c.channel], ['segment', ids.secondSentenceId, ids.aliceTurnId, 'meaning']);
  scope.playbackRepresentationMode = 'full';
  audioPlayback.playbackSourceStatus.representation = 'full';
  assert.equal(cursor({ presentation, audioPlayback }).precision, 'segment');
  audioPlayback.playbackSourceStatus.mode = 'full-local';
  audioPlayback.playingIndex = ids.secondSentenceId;
  const full = cursor({ presentation, audioPlayback });
  assert.deepEqual([full.precision, full.cardId, full.segmentId, full.unitId], ['card', ids.sceneId, null, null]);
});
test('Missing host scope, stopped/stale/foreign Workspace/session, wrong Card never yield audible highlights', () => {
  for (const mutate of [f => { delete f.audioPlayback.readPresentationPlaybackScope; }, f => { f.scope.current = false; },
    f => { f.scope.workspaceUid = 'reset-uid'; }, f => { f.scope.workspaceId = 'foreign'; }, f => { f.scope.sessionId++; },
    f => { f.audioPlayback.playbackSourceStatus.documentId = 'foreign'; }, f => { f.scope.isPlaying = false; },
    f => { f.audioPlayback.playbackSourceStatus = null; }, f => { f.audioPlayback.playbackSourceStatus.blockId = f.ids.zeroSceneId; }]) {
    const f = playbackFixture(); mutate(f);
    assert.equal(cursor(f).precision, 'none');
  }
});
test('Pause preserves verified identity; no browse selection becomes audible evidence', () => {
  const f = playbackFixture();
  f.scope.isPlaying = false; f.scope.isPaused = true;
  f.audioPlayback.currentIndex = f.ids.bobSentenceId;
  const c = cursor(f);
  assert.equal(c.state, 'paused'); assert.equal(c.segmentId, f.ids.secondSentenceId);
  f.audioPlayback.playbackSourceStatus.source = 'unavailable';
  assert.equal(cursor(f).precision, 'none');
});
test('Explicit actions preserve D5 signatures/IDs; view/browse do not call host; invalid/busy actions ignored', () => {
  const f = playbackFixture(); const calls = [];
  f.audioPlayback.playSentence = (...args) => calls.push(['sentence', ...args]);
  f.audioPlayback.playScene = (...args) => calls.push(['scene', ...args]);
  const a = actions(f);
  let view = normalizeTextCardPresentationState();
  for (const level of ['full', 'part', 'segment']) view = updateTextCardPresentationState(view, { level, bilingualLayout: 'meaning-only' });
  assert.equal(calls.length, 0); assert.equal(cursor(f).segmentId, f.ids.secondSentenceId);
  a.onPlaySegment(f.ids.secondSentenceId); a.onPlayCard(f.ids.sceneId);
  a.onPlayCard(f.ids.sceneId, { playbackChannelMode: 'meaning-only', playbackRepresentationMode: 'full' });
  a.onPlaySegment('foreign'); a.onPlayCard('foreign');
  actions({ ...f, disabled: true }).onPlayCard(f.ids.sceneId);
  assert.deepEqual(calls, [['sentence', f.ids.secondSentenceId], ['scene', f.ids.sceneId], ['scene', f.ids.sceneId, { playbackChannelMode: 'meaning-only' }]]);
});
test('Production boundary: canonical versions stay 1, no reader audio hook, storage or command ownership', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  const source = fs.readFileSync('src/components/text/presentation/SharedConversationReader.jsx', 'utf8');
  assert.doesNotMatch(source, /useConversationAudioPlayback|applyText\w*Command|indexedDB|localStorage/);
  assert.equal(dbCalls, 0);
});
console.log(JSON.stringify({ results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, dbCalls }, null, 2));
if (results.some(r => !r.ok)) process.exitCode = 1;
