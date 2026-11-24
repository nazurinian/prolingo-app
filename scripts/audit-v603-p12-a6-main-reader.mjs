import assert from 'node:assert/strict';
import { createA2V1CompatibilityParagraphFixture, createA2ParagraphReaderFixture } from './fixtures/shared-card-a2/paragraph-reader-fixture.js';
import { selectTextMainReaderPresentation, resolveTextMainReaderCursor } from '../src/domain/text/textMainReaderDomain.js';
import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  isTextWorkspaceStyleDirty,
  normalizeTextWorkspaceStyleState
} from '../src/domain/text/textCardPresentationStateDomain.js';
import {
  loadTextMainReaderPreference,
  saveTextMainReaderPreference,
  normalizeTextMainReaderPreference,
  resolveTextMainReaderPreferenceStorageKey,
  resolveTextMainReaderWorkspaceStyle,
  updateTextMainReaderWorkspaceStyle,
  resetTextMainReaderWorkspaceStyle,
  TEXT_MAIN_READER_PREFERENCE_KEY
} from '../src/services/persistence/textMainReaderPreferenceService.js';

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
test('versioned preference defaults old reader; whitelists view and Workspace Style only; invalid versions reset', () => {
  assert.equal(normalizeTextMainReaderPreference().reader, 'legacy');
  assert.equal(normalizeTextMainReaderPreference({ version: 2, reader: 'shared', workspaceStyle: { textAlign: 'justify' } }).reader, 'legacy');
  assert.deepEqual(normalizeTextMainReaderPreference({ version: 2, workspaceStyle: { textAlign: 'justify' } }).workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  const raw = {
    version: 1,
    reader: 'shared',
    view: { level: 'part', bilingualLayout: 'meaning-only', partLayout: 'horizontal-focus', voice: 'ignored' },
    audio: 'ignored'
  };
  const saved = normalizeTextMainReaderPreference(raw);
  assert.deepEqual(Object.keys(saved), ['version', 'reader', 'view', 'workspaceStyle', 'workspaceStyleOverrides']);
  assert.deepEqual(Object.keys(saved.view), ['level', 'bilingualLayout', 'partLayout']);
  assert.deepEqual(saved.workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  assert.deepEqual(saved.workspaceStyleOverrides, {});
  assert.ok(Object.isFrozen(saved) && Object.isFrozen(saved.view) && Object.isFrozen(saved.workspaceStyle));
});
test('Workspace Style normalization, inheritance, workspace overrides, host isolation and scoped reset stay independent', () => {
  const dirtyStyle = normalizeTextWorkspaceStyleState({ textAlign: 'justify', paragraphIndent: 'yes', speakerLayout: 'invalid', showAccents: false, voice: 'ignored' });
  assert.deepEqual(dirtyStyle, { textAlign: 'justify', paragraphIndent: false, speakerLayout: 'stacked', showAccents: false });
  assert.equal(isTextWorkspaceStyleDirty(DEFAULT_TEXT_WORKSPACE_STYLE_STATE), false);
  assert.equal(isTextWorkspaceStyleDirty(dirtyStyle), true);

  let pref = normalizeTextMainReaderPreference({
    version: 1,
    reader: 'shared',
    view: { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' }
  });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, false);

  pref = updateTextMainReaderWorkspaceStyle(pref, { textAlign: 'justify', paragraphIndent: true });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, true);
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });
  assert.equal(pref.reader, 'shared');

  // Workspace-specific override inherits unspecified keys from Shared defaults and stays isolated per Workspace
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'aligned' }, { workspaceKey: 'WS_ALPHA' });
  const alpha = resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA');
  const beta = resolveTextMainReaderWorkspaceStyle(pref, 'WS_BETA');
  assert.deepEqual(alpha.effectiveStyle, { textAlign: 'justify', paragraphIndent: true, speakerLayout: 'aligned', showAccents: true });
  assert.equal(alpha.hasWorkspaceOverride, true);
  assert.equal(alpha.isDirty, true);
  assert.deepEqual(beta.effectiveStyle, pref.workspaceStyle);
  assert.equal(beta.hasWorkspaceOverride, false);
  assert.equal(beta.isDirty, false);

  // Returning override to match shared default prunes override and clears dirty state
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'stacked' }, { workspaceKey: 'WS_ALPHA' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').hasWorkspaceOverride, false);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').isDirty, false);

  // Workspace override reset clears only target Workspace; shared reset clears only shared Workspace Style
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'inline' }, { workspaceKey: 'WS_ALPHA' });
  pref = updateTextMainReaderWorkspaceStyle(pref, { showAccents: false }, { workspaceKey: 'WS_BETA' });
  pref = resetTextMainReaderWorkspaceStyle(pref, { workspaceKey: 'WS_ALPHA' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').hasWorkspaceOverride, false);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_BETA').effectiveStyle.showAccents, false);
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });

  pref = resetTextMainReaderWorkspaceStyle(pref);
  assert.deepEqual(pref.workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, false);
  assert.equal(pref.reader, 'shared');
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_BETA').effectiveStyle.showAccents, false);

  // Prototype pollution keys are stripped cleanly
  const unsafe = normalizeTextMainReaderPreference({
    version: 1,
    workspaceStyleOverrides: JSON.parse('{"__proto__":{"textAlign":"justify"},"constructor":{"textAlign":"justify"},"WS_SAFE":{"textAlign":"justify"}}')
  });
  assert.deepEqual(Object.keys(unsafe.workspaceStyleOverrides), ['WS_SAFE']);

  // Host-specific storage key isolation
  assert.equal(resolveTextMainReaderPreferenceStorageKey(), TEXT_MAIN_READER_PREFERENCE_KEY);
  assert.notEqual(resolveTextMainReaderPreferenceStorageKey({ hostId: 'uat4-qa' }), TEXT_MAIN_READER_PREFERENCE_KEY);
});
test('guarded view storage writes only the new key and tolerates denied/corrupt storage', () => {
  const writes = [];
  globalThis.window = { localStorage: { getItem: () => '{broken', setItem: (...args) => writes.push(args) } };
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  saveTextMainReaderPreference({ version: 1, reader: 'shared', view: { level: 'segment' } });
  assert.equal(writes.length, 1); assert.equal(writes[0][0], TEXT_MAIN_READER_PREFERENCE_KEY);
  saveTextMainReaderPreference({ version: 1, reader: 'shared' }, { hostId: 'isolated-host' });
  assert.equal(writes.length, 2); assert.equal(writes[1][0], resolveTextMainReaderPreferenceStorageKey({ hostId: 'isolated-host' }));
  globalThis.window = { get localStorage() { throw Error('denied'); } };
  assert.doesNotThrow(() => saveTextMainReaderPreference({ version: 1, reader: 'shared' }));
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  delete globalThis.window;
});
console.log(`${passed} A6 Node checks PASS`);
