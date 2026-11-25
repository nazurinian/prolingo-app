import assert from 'node:assert/strict';
import { createA2V1CompatibilityParagraphFixture, createA2ParagraphReaderFixture } from './fixtures/shared-card-a2/paragraph-reader-fixture.js';
import { selectTextMainReaderPresentation, resolveTextMainReaderCursor } from '../src/domain/text/textMainReaderDomain.js';
import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  isTextWorkspaceStyleDirty,
  normalizeTextWorkspaceStyleState
} from '../src/domain/text/textCardPresentationStateDomain.js';
import {
  DEFAULT_SHARED_CARD_VISIBILITY,
  DEFAULT_TEXT_MAIN_READER_MODE,
  MAX_WORKSPACE_OVERRIDE_ENTRIES,
  TEXT_MAIN_READER_PREFERENCE_KEY,
  TEXT_WORKSPACE_STYLE_SCOPES,
  inspectTextMainReaderOverrideCapacity,
  loadTextMainReaderPreference,
  normalizeTextMainReaderPreference,
  resetTextMainReaderWorkspaceStyle,
  resolveTextMainReaderPreferenceStorageKey,
  resolveTextMainReaderWorkspaceStyle,
  saveTextMainReaderPreference,
  updateTextMainReaderWorkspaceStyle
} from '../src/services/persistence/textMainReaderPreferenceService.js';
import {
  TEXT_CARD_EXPANSION_MODES,
  resolveActiveCardIdFromCursor,
  resolveSharedReaderExpandedCardIds
} from '../src/domain/text/textStructuredCardExpansionDomain.js';

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
  assert.equal(normalizeTextMainReaderPreference().readerMode, DEFAULT_TEXT_MAIN_READER_MODE);
  assert.equal(normalizeTextMainReaderPreference().cardVisibility, DEFAULT_SHARED_CARD_VISIBILITY);
  assert.deepEqual(DEFAULT_TEXT_WORKSPACE_STYLE_STATE, {
    textAlign: 'justify',
    paragraphIndent: true,
    speakerLayout: 'aligned',
    showAccents: true
  });
  assert.equal(normalizeTextMainReaderPreference({ version: 2, reader: 'shared', workspaceStyle: { textAlign: 'left' } }).reader, 'legacy');
  assert.deepEqual(normalizeTextMainReaderPreference({ version: 2, workspaceStyle: { textAlign: 'left' } }).workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  const raw = {
    version: 1,
    reader: 'shared',
    view: { level: 'part', bilingualLayout: 'meaning-only', partLayout: 'horizontal-focus', voice: 'ignored' },
    audio: 'ignored'
  };
  const saved = normalizeTextMainReaderPreference(raw);
  assert.deepEqual(Object.keys(saved), ['version', 'reader', 'readerMode', 'cardVisibility', 'view', 'workspaceStyle', 'workspaceStyleOverrides']);
  assert.deepEqual(Object.keys(saved.view), ['level', 'bilingualLayout', 'partLayout']);
  assert.deepEqual(saved.workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  assert.deepEqual(saved.workspaceStyleOverrides, {});
  assert.ok(Object.isFrozen(saved) && Object.isFrozen(saved.view) && Object.isFrozen(saved.workspaceStyle));
});
test('Workspace Style normalization, inheritance, safe workspace identity, LRU cap, host isolation and scoped reset stay independent', () => {
  const dirtyStyle = normalizeTextWorkspaceStyleState({ textAlign: 'left', paragraphIndent: 'yes', speakerLayout: 'invalid', showAccents: false, voice: 'ignored' });
  assert.deepEqual(dirtyStyle, { textAlign: 'left', paragraphIndent: true, speakerLayout: 'aligned', showAccents: false });
  assert.equal(isTextWorkspaceStyleDirty(DEFAULT_TEXT_WORKSPACE_STYLE_STATE), false);
  assert.equal(isTextWorkspaceStyleDirty(dirtyStyle), true);

  let pref = normalizeTextMainReaderPreference({
    version: 1,
    reader: 'shared',
    readerMode: 'card',
    cardVisibility: 'custom',
    view: { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' }
  });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, false);

  pref = updateTextMainReaderWorkspaceStyle(pref, { textAlign: 'left', paragraphIndent: false }, { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, true);
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });
  assert.equal(pref.reader, 'shared');
  assert.equal(pref.readerMode, 'card');
  assert.equal(pref.cardVisibility, 'custom');

  // Guard: invalid or missing workspace key when workspace scope is intended MUST NOT mutate shared defaults
  const sharedBeforeInvalid = pref.workspaceStyle;
  for (const badTarget of [
    { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: null },
    { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: '' },
    { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: '   ' },
    { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: '__proto__' },
    { workspaceKey: 'constructor' },
    { workspaceKey: '' }
  ]) {
    const resolvedBad = resolveTextMainReaderWorkspaceStyle(pref, badTarget);
    assert.equal(resolvedBad.invalidWorkspaceKey, true);
    assert.equal(resolvedBad.canOverrideWorkspace, false);
    const afterUpdate = updateTextMainReaderWorkspaceStyle(pref, { textAlign: 'justify', showAccents: false }, badTarget);
    assert.deepEqual(afterUpdate.workspaceStyle, sharedBeforeInvalid);
    assert.deepEqual(afterUpdate.workspaceStyleOverrides, pref.workspaceStyleOverrides);
    const afterReset = resetTextMainReaderWorkspaceStyle(pref, badTarget);
    assert.deepEqual(afterReset.workspaceStyle, sharedBeforeInvalid);
  }

  // Workspace-specific override inherits unspecified keys from Shared defaults and stays isolated per Workspace
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'stacked' }, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_ALPHA' });
  const alpha = resolveTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_ALPHA' });
  const beta = resolveTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_BETA' });
  assert.deepEqual(alpha.effectiveStyle, { textAlign: 'left', paragraphIndent: false, speakerLayout: 'stacked', showAccents: true });
  assert.equal(alpha.hasWorkspaceOverride, true);
  assert.equal(alpha.isDirty, true);
  assert.deepEqual(beta.effectiveStyle, pref.workspaceStyle);
  assert.equal(beta.hasWorkspaceOverride, false);
  assert.equal(beta.isDirty, false);

  // Returning override to match shared default prunes override and clears dirty state
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'aligned' }, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_ALPHA' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').hasWorkspaceOverride, false);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').isDirty, false);

  // Workspace override reset clears only target Workspace; shared reset clears only shared Workspace Style
  pref = updateTextMainReaderWorkspaceStyle(pref, { speakerLayout: 'inline' }, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_ALPHA' });
  pref = updateTextMainReaderWorkspaceStyle(pref, { showAccents: false }, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_BETA' });
  pref = resetTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: 'WS_ALPHA' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_ALPHA').hasWorkspaceOverride, false);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_BETA').effectiveStyle.showAccents, false);
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });

  pref = resetTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED });
  assert.deepEqual(pref.workspaceStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref).isDirty, false);
  assert.equal(pref.reader, 'shared');
  assert.equal(pref.readerMode, 'card');
  assert.equal(pref.cardVisibility, 'custom');
  assert.deepEqual(pref.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });
  assert.equal(resolveTextMainReaderWorkspaceStyle(pref, 'WS_BETA').effectiveStyle.showAccents, false);

  // Safe LRU override capacity retains newest and touched workspaces instead of dropping recent edits
  let lruPref = normalizeTextMainReaderPreference({ version: 1, reader: 'shared' });
  for (let i = 1; i <= MAX_WORKSPACE_OVERRIDE_ENTRIES + 10; i += 1) {
    lruPref = updateTextMainReaderWorkspaceStyle(lruPref, { textAlign: 'left' }, {
      scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE,
      workspaceKey: `WS_${String(i).padStart(4, '0')}`
    });
  }
  const cap = inspectTextMainReaderOverrideCapacity(lruPref);
  assert.equal(cap.count, MAX_WORKSPACE_OVERRIDE_ENTRIES);
  assert.equal(cap.atCapacity, true);
  assert.equal(cap.evictionPolicy, 'lru-oldest-on-overflow');
  assert.equal(Object.hasOwn(lruPref.workspaceStyleOverrides, 'WS_0001'), false, 'Oldest evicted');
  assert.equal(Object.hasOwn(lruPref.workspaceStyleOverrides, `WS_${String(MAX_WORKSPACE_OVERRIDE_ENTRIES + 10).padStart(4, '0')}`), true, 'Newest retained');

  // Prototype pollution keys are stripped cleanly
  const unsafe = normalizeTextMainReaderPreference({
    version: 1,
    workspaceStyleOverrides: JSON.parse('{"__proto__":{"textAlign":"left"},"constructor":{"textAlign":"left"},"WS_SAFE":{"textAlign":"left"}}')
  });
  assert.deepEqual(Object.keys(unsafe.workspaceStyleOverrides), ['WS_SAFE']);

  // Host-specific storage key isolation
  assert.equal(resolveTextMainReaderPreferenceStorageKey(), TEXT_MAIN_READER_PREFERENCE_KEY);
  assert.notEqual(resolveTextMainReaderPreferenceStorageKey({ hostId: 'structured-uat' }), TEXT_MAIN_READER_PREFERENCE_KEY);
});
test('Shared Card Visibility supports Follow Playback, Expand All and Custom without mutating playback', () => {
  const cards = [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }];
  assert.equal(resolveActiveCardIdFromCursor({ cards, playbackCursor: { state: 'playing', cardId: 'C2' } }), 'C2');
  assert.equal(resolveActiveCardIdFromCursor({ cards, playbackCursor: { state: 'idle', cardId: 'C2' } }), null);
  assert.deepEqual([...resolveSharedReaderExpandedCardIds({ mode: TEXT_CARD_EXPANSION_MODES.ALL, cards })], ['C1', 'C2', 'C3']);
  assert.deepEqual([...resolveSharedReaderExpandedCardIds({ mode: TEXT_CARD_EXPANSION_MODES.FOLLOW, cards, activeCardId: 'C2' })], ['C2']);
  assert.deepEqual([...resolveSharedReaderExpandedCardIds({ mode: TEXT_CARD_EXPANSION_MODES.FOLLOW, cards, activeCardId: null, lastActiveCardId: null })], ['C1']);
  assert.deepEqual([...resolveSharedReaderExpandedCardIds({ mode: TEXT_CARD_EXPANSION_MODES.CUSTOM, cards, customExpandedIds: new Set(['C1', 'C3']) })], ['C1', 'C3']);
});
test('guarded view storage writes only the new key, handles quota fallback, and tolerates denied/corrupt storage', () => {
  const writes = [];
  globalThis.window = { localStorage: { getItem: () => '{broken', setItem: (...args) => writes.push(args) } };
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  saveTextMainReaderPreference({ version: 1, reader: 'shared', view: { level: 'segment' } });
  assert.equal(writes.length, 1); assert.equal(writes[0][0], TEXT_MAIN_READER_PREFERENCE_KEY);
  saveTextMainReaderPreference({ version: 1, reader: 'shared' }, { hostId: 'structured-uat' });
  assert.equal(writes.length, 2); assert.equal(writes[1][0], resolveTextMainReaderPreferenceStorageKey({ hostId: 'structured-uat' }));

  // QuotaExceeded fallback preserves Shared defaults and trims oldest overrides cleanly
  let quotaAttempts = 0;
  let storedQuotaPayload = null;
  const quotaStorage = {
    getItem: () => storedQuotaPayload,
    setItem: (_k, value) => {
      quotaAttempts += 1;
      if (quotaAttempts === 1) throw new Error('QuotaExceededError');
      storedQuotaPayload = value;
    }
  };
  let bigPref = normalizeTextMainReaderPreference({ version: 1, reader: 'shared', workspaceStyle: { textAlign: 'left' } });
  for (let i = 1; i <= 20; i += 1) {
    bigPref = updateTextMainReaderWorkspaceStyle(bigPref, { speakerLayout: 'inline' }, { scope: 'workspace', workspaceKey: `W_${i}` });
  }
  const savedAfterQuota = saveTextMainReaderPreference(bigPref, { storage: quotaStorage });
  assert.equal(quotaAttempts, 2);
  assert.equal(savedAfterQuota.workspaceStyle.textAlign, 'left');
  assert.ok(Object.keys(savedAfterQuota.workspaceStyleOverrides).length < 20);
  assert.equal(Object.hasOwn(savedAfterQuota.workspaceStyleOverrides, 'W_20'), true);

  globalThis.window = { get localStorage() { throw Error('denied'); } };
  assert.doesNotThrow(() => saveTextMainReaderPreference({ version: 1, reader: 'shared' }));
  assert.equal(loadTextMainReaderPreference().reader, 'legacy');
  delete globalThis.window;
});
console.log(`${passed} A6 Node checks PASS`);
