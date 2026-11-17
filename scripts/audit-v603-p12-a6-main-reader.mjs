import assert from 'node:assert/strict';
import { createA2V1CompatibilityParagraphFixture, createA2ParagraphReaderFixture } from './fixtures/shared-card-a2/paragraph-reader-fixture.js';
import { selectTextMainReaderPresentation, resolveTextMainReaderCursor } from '../src/domain/text/textMainReaderDomain.js';
import { loadTextMainReaderPreference, saveTextMainReaderPreference, normalizeTextMainReaderPreference, TEXT_MAIN_READER_PREFERENCE_KEY } from '../src/services/persistence/textMainReaderPreferenceService.js';

let passed = 0;
const test = (name, fn) => { fn(); console.log('PASS', name); passed++; };
const f = createA2V1CompatibilityParagraphFixture();
const before = JSON.stringify(f.snapshot);
const { presentation } = selectTextMainReaderPresentation(f.snapshot, f.ids.documentId);
test('v1 real data preserves identity, order, Text/Meaning and virtual nonpersistent Sections', () => {
  assert.equal(presentation.workspace.id, f.ids.documentId);
  assert.deepEqual(presentation.cards.flatMap(c => c.units.flatMap(u => u.segments.map(s => [s.id, s.uid, s.text, s.meaning, s.joinAfter]))),
    f.snapshot.segments.map(s => [s.id, s.uid ?? null, s.text, s.meaning, s.joinAfter]));
  presentation.cards.forEach(c => c.units.forEach(u => {
    assert.equal(u.id, null); assert.equal(u.uid, null); assert.equal(u.identitySource, 'v1-paragraph-compat');
  }));
  assert.equal(JSON.stringify(f.snapshot), before);
  assert.equal('contentUnits' in f.snapshot, false);
});
test('persistent Paragraph projection includes empty Units and Cards', () => {
  const p = createA2ParagraphReaderFixture();
  const result = selectTextMainReaderPresentation(p.snapshot, p.ids.documentId);
  assert.ok(result.presentation.cards.some(c => c.units.length === 0));
  assert.ok(result.presentation.cards.some(c => c.units.some(u => !u.segments.length)));
});
test('Conversation, Mixed and Legacy fail closed without another Workspace projection', () => {
  for (const type of ['conversation', 'mixed', 'legacy']) {
    const snapshot = structuredClone(f.snapshot);
    snapshot.documents[0].documentType = type;
    if (type === 'legacy') snapshot.documents[0].editorModel = 'legacy-line-v1';
    const result = selectTextMainReaderPresentation(snapshot, f.ids.documentId);
    assert.equal(result.presentation, null); assert.ok(result.reason);
  }
  assert.equal(selectTextMainReaderPresentation(f.snapshot, 'missing').presentation, null);
});
test('corrupt and partially upgraded snapshots never silently repair', () => {
  const invalid = structuredClone(f.snapshot);
  invalid.segments[0].blockId = 'MISSING';
  const partial = { ...f.snapshot, contentUnits: [] };
  assert.equal(selectTextMainReaderPresentation(invalid, f.ids.documentId).presentation, null);
  assert.equal(selectTextMainReaderPresentation(partial, f.ids.documentId).presentation, null);
  assert.equal(selectTextMainReaderPresentation({ documents: {} }, f.ids.documentId).presentation, null);
  assert.equal(selectTextMainReaderPresentation({ documents: [null] }, f.ids.documentId).presentation, null);
});
const session = {
  presentation, snapshot: f.snapshot,
  provenance: { snapshot: f.snapshot, documentId: f.ids.documentId, workspaceUid: presentation.workspace.uid, sessionId: 42 },
  context: { context: 'text-structured', documentId: f.ids.documentId, sessionId: 42 },
  sessionId: 42, status: { documentId: f.ids.documentId, sessionId: 42, blockId: f.ids.cardId, segmentId: f.ids.seg1Id, channel: 'text', mode: 'tts' },
  isPlaying: true, isPaused: false, playingContext: 'text-structured', stopped: false
};
test('actual current Split evidence resolves exact persistent Sentence identity', () => {
  const cursor = resolveTextMainReaderCursor(session);
  assert.equal(cursor.precision, 'segment'); assert.equal(cursor.segmentId, f.ids.seg1Id);
  assert.equal(cursor.unitId, null); assert.equal(cursor.sessionId, 42);
});
test('Cached Full and Full TTS only expose grounded Card precision', () => {
  for (const mode of ['local', 'tts']) {
    const cursor = resolveTextMainReaderCursor({ ...session, status: { ...session.status, mode, representation: 'full', segmentId: null } });
    assert.equal(cursor.precision, 'card'); assert.equal(cursor.segmentId, null);
  }
});
test('missing/stale/foreign/snapshot-mutated/stopped evidence cannot highlight', () => {
  for (const patch of [
    { provenance: null }, { snapshot: structuredClone(f.snapshot) }, { sessionId: 43 },
    { context: { ...session.context, documentId: 'foreign' } },
    { status: { ...session.status, sessionId: 41 } }, { status: null },
    { isPlaying: false }, { stopped: true }, { playingContext: 'table' }
  ]) assert.equal(resolveTextMainReaderCursor({ ...session, ...patch }).precision, 'none');
});
test('pause keeps proven cursor and unavailable speech does not fabricate precision', () => {
  assert.equal(resolveTextMainReaderCursor({ ...session, isPaused: true }).state, 'paused');
  assert.equal(resolveTextMainReaderCursor({ ...session, status: { ...session.status, source: 'unavailable' } }).precision, 'none');
});
test('versioned preference defaults old reader; whitelists view only; invalid versions reset', () => {
  assert.equal(normalizeTextMainReaderPreference().reader, 'legacy');
  assert.equal(normalizeTextMainReaderPreference({ version: 2, reader: 'shared' }).reader, 'legacy');
  const raw = { version: 1, reader: 'shared', view: { level: 'part', bilingualLayout: 'meaning-only', partLayout: 'horizontal-focus', voice: 'ignored' }, audio: 'ignored' };
  const saved = normalizeTextMainReaderPreference(raw);
  assert.deepEqual(Object.keys(saved), ['version', 'reader', 'view']);
  assert.deepEqual(Object.keys(saved.view), ['level', 'bilingualLayout', 'partLayout']);
});
test('guarded view storage writes only the new key and tolerates denied/corrupt storage', () => {
  const writes = [];
  globalThis.window = { localStorage: { getItem: () => '{broken', setItem: (...args) => writes.push(args) } };
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  saveTextMainReaderPreference({ version: 1, reader: 'shared', view: { level: 'segment' } });
  assert.equal(writes.length, 1); assert.equal(writes[0][0], TEXT_MAIN_READER_PREFERENCE_KEY);
  globalThis.window = { get localStorage() { throw Error('denied'); } };
  assert.doesNotThrow(() => saveTextMainReaderPreference({ version: 1, reader: 'shared' }));
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  delete globalThis.window;
});
console.log(`${passed} A6 Node checks PASS`);
