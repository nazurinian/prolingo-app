import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StructuredTextBeta from '../../../src/components/text/management/StructuredTextBeta.jsx';
import { readDisposableTextManagementDatabaseState as read, executeDisposableTextManagementTransaction as write } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
const MAIN = 'prolingo_text_library_d3b_qa_r3_beta_main', COPY = 'prolingo_text_library_d3b_qa_r3_beta_copy';
const EMPTY = 'prolingo_text_library_d3b_qa_r3_beta_blank';
const frame = () => new Promise(r => requestAnimationFrame(r));
const assert = (ok, message) => { if (!ok) throw Error(message); };
const until = async test => { const end = performance.now() + 7000; while (performance.now() < end) { if (await test()) return; await frame(); } throw Error('Beta committed condition timed out'); };
const q = s => document.querySelector(s);
const click = text => { const button = [...document.querySelectorAll('button')].find(e => e.textContent === text); assert(button && !button.disabled, 'Unavailable: ' + text); button.click(); };
const input = async (selector, value) => {
  const el = q(selector); assert(el, selector);
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await frame();
};
let root;
export async function runBetaFirst() {
  const results = [], events = []; let exported;
  const hooks = { speechSynth: { getVoices: () => [], speak() {}, pause() {}, resume() {}, cancel() {} },
    executeBrowserTts: args => new Promise(resolve => events.push({ args, resolve })) };
  root = createRoot(document.getElementById('root'));
  root.render(<StrictMode><StructuredTextBeta initialDbName={MAIN} audioRuntimeHooks={hooks} onExport={data => { exported = data; }} /></StrictMode>);
  const test = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, error: e.message }); } };
  await until(() => q('[data-structured-text-beta]'));
  await test('No persistence access before explicit opt-in; atomic demo initialization', async () => {
    assert(window.qaOpens === 0, 'Opened a database before opt-in');
    assert([...document.querySelectorAll('button')].find(b => b.textContent === 'Initialize three-type demo').matches(':disabled'), 'Initialization active without opt-in');
    q('[aria-label="Opt in to isolated QA storage"]').click(); await frame(); click('Initialize three-type demo');
    await until(() => q('[data-structured-beta-connected]'));
    const state = await read({ dbName: MAIN }); assert(state.schemaVersion === 2, 'Not persistent v2');
  });
  await test('Three real persisted Workspace types and both reader modes', async () => {
    const select = q('[aria-label="Beta Workspace"]');
    for (const kind of ['paragraph', 'conversation', 'mixed']) {
      const id = [...select.options].find(o => o.textContent.startsWith(kind + ':')).value;
      await input('[aria-label="Beta Workspace"]', id);
      await until(() => q('[data-structured-workspace-player]')?.dataset.structuredWorkspacePlayer === id);
      click('Tampilan Lama'); await frame(); assert(q('[data-unified-reader=classic]'), kind + ' classic');
      click('Shared UI (Beta)'); await frame(); assert(q('[data-unified-reader=shared]'), kind + ' Shared');
    }
  });
  await test('Actual Data Management edit commits to the same persistent Reader snapshot', async () => {
    click('Data Management / Editor'); await frame();
    const row = q('[data-dm-segment-id]'), id = row.dataset.dmSegmentId;
    await input('[aria-label="Sentence text ' + id + '"]', 'Persisted beta acceptance sentence.');
    q('[data-dm-segment-save="' + id + '"]').click();
    await until(async () => (await read({ dbName: MAIN })).snapshot.segments.some(s => s.id === id && s.text === 'Persisted beta acceptance sentence.'));
    click('Show Reader'); await frame();
    assert(q('[data-unified-reader]').textContent.includes('Persisted beta acceptance sentence.'), 'Reader stale after accepted command');
  });
  await test('Playback across presentation switches uses the existing host and stops explicitly', async () => {
    const count = events.length; click('Play Workspace'); await until(() => events.length > count);
    const player = q('[data-structured-workspace-player]');
    click('Tampilan Lama'); await frame(); click('Shared UI (Beta)'); await frame(); click('Pause'); await frame(); click('Resume'); await frame();
    assert(q('[data-structured-workspace-player]') === player && events.length === count + 1, 'Playback host duplicated/restarted');
    click('Stop'); events.forEach(e => e.resolve({ status: 'stopped' })); await frame();
  });
  await test('Conflict reload preserves draft and authoritative concurrent edit', async () => {
    click('Data Management / Editor'); await frame();
    const id = q('[data-dm-segment-id]').dataset.dmSegmentId;
    await input('[aria-label="Sentence text ' + id + '"]', 'Keep recovery draft');
    const before = await read({ dbName: MAIN }), segment = before.snapshot.segments.find(s => s.id === id);
    await write({ dbName: MAIN, selection: { workspaceId: segment.documentId }, boundary: 'disposable', permissions: ['content'],
      expectedSnapshotFingerprint: before.snapshotFingerprint, command: { type: 'segment.update', payload: { id, text: 'Concurrent winner' } } });
    q('[data-dm-segment-save="' + id + '"]').click(); await until(() => q('[data-dm-page-error=STALE_RESULT]'));
    q('[data-dm-reload-valid-source]').click(); await until(() => !q('[data-dm-page-error]'));
    assert(q('[aria-label="Sentence text ' + id + '"]').value === 'Keep recovery draft', 'Conflict reload discarded draft');
    assert((await read({ dbName: MAIN })).snapshot.segments.find(s => s.id === id).text === 'Concurrent winner', 'Reload overwrote winner');
    // Explicitly save the retained draft after reviewing the conflict.
    q('[data-dm-segment-save="' + id + '"]').click();
    await until(async () => (await read({ dbName: MAIN })).snapshot.segments.find(s => s.id === id).text === 'Keep recovery draft');
  });
  await test('Full/rate controls retain one host and distinguish whole-Card from per-Sentence fallback', async () => {
    click('Show Reader'); await frame();
    const select = q('[aria-label="Beta Workspace"]'), mixed = [...select.options].find(o => o.textContent.startsWith('mixed:')).value;
    await input('[aria-label="Beta Workspace"]', mixed);
    const host = q('[data-structured-workspace-player]');
    await input('[aria-label="Audio representation"]', 'full'); await input('[aria-label="Audio rate"]', '1.5');
    const start = events.length; click('Play Workspace'); await until(() => events.length > start);
    await until(() => JSON.parse(q('[data-unified-source-status]').textContent)?.representation === 'full');
    assert(events[start].args.rate === 1.5, 'UI lost requested effective rate');
    assert(q('[data-unified-reader]').dataset.readerCursorPrecision === 'card', 'Paragraph whole-Card Full invented Sentence timing');
    events[start].resolve({ status: 'played' });
    await until(() => events.length > start + 1);
    await until(() => JSON.parse(q('[data-unified-source-status]').textContent)?.segmentId);
    assert(q('[data-unified-reader]').dataset.readerCursorPrecision === 'segment', 'Conversation Full fallback lost authoritative Sentence precision');
    assert(q('[data-structured-workspace-player]') === host, 'Representation/rate controls replaced host');
    click('Stop'); events.slice(start).forEach(e => e.resolve({ status: 'stopped' }));
    await input('[aria-label="Audio representation"]', 'split'); await input('[aria-label="Audio rate"]', '1');
  });
  await test('Consistent backup file verification and create-only fresh recovery copy', async () => {
    click('Export QA JSON'); await until(() => exported);
    const file = new File([JSON.stringify(exported)], 'qa.json', { type: 'application/json' }), data = new DataTransfer(); data.items.add(file);
    q('[aria-label="Verify backup JSON"]').files = data.files; q('[aria-label="Verify backup JSON"]').dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => q('[data-beta-file-verified]'));
    await input('[aria-label="Recovery QA database name"]', COPY);
    const labels = [...document.querySelectorAll('label')], label = labels.find(l => l.textContent.includes('Create a new isolated copy'));
    label.querySelector('input').click(); await frame(); click('Create verified recovery copy');
    await until(() => q('[data-structured-beta-connected]')?.dataset.structuredBetaConnected === COPY);
    assert((await read({ dbName: COPY })).snapshotFingerprint === (await read({ dbName: MAIN })).snapshotFingerprint, 'Recovered library differs');
  });
  let expected;
  try { expected = (await read({ dbName: MAIN })).snapshotFingerprint; } catch (e) { results.push({ label: 'Final persistent state', ok: false, error: e.message + ' UI: ' + document.body.textContent.slice(0, 1200) }); }
  root.unmount(); root = null;
  await test('Blank persistent library creates all Workspace types through native Data Management UI', async () => {
    root = createRoot(document.getElementById('root'));
    root.render(<StrictMode><StructuredTextBeta initialDbName={EMPTY} /></StrictMode>);
    await until(() => q('[aria-label="Opt in to isolated QA storage"]')); q('[aria-label="Opt in to isolated QA storage"]').click(); await frame();
    click('Initialize empty QA library'); await until(() => q('[data-structured-beta-connected]'));
    click('Data Management / Editor'); await frame();
    for (const kind of ['paragraph', 'conversation', 'mixed']) {
      q('[data-dm-nav-library]').click(); await frame();
      q('[data-dm-toggle-create-workspace]').click(); await frame();
      await input('[aria-label="New Workspace title"]', 'Authored ' + kind);
      await input('[aria-label="New Workspace type"]', kind);
      q('[data-dm-submit-create-workspace]').click();
      await until(async () => (await read({ dbName: EMPTY })).snapshot.documents.some(d => d.title === 'Authored ' + kind));
    }
    assert((await read({ dbName: EMPTY })).snapshot.documents.length === 3, 'Created duplicate/fixture Workspaces');
    root.unmount(); root = null;
  });
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, expected };
}
export async function verifyBetaReload(expected) {
  assert((await read({ dbName: MAIN })).snapshotFingerprint === expected, 'Restart lost persistent original');
  assert((await read({ dbName: COPY })).snapshotFingerprint === expected, 'Restart lost recovery');
  root = createRoot(document.getElementById('root'));
  root.render(<StrictMode><StructuredTextBeta initialDbName={MAIN} /></StrictMode>);
  await until(() => q('[aria-label="Opt in to isolated QA storage"]')); q('[aria-label="Opt in to isolated QA storage"]').click(); await frame(); click('Connect QA database');
  await until(() => q('[data-structured-beta-connected]'));
  assert(!q('[data-beta-error]'), 'Restart connection failed');
  root.unmount(); root = null;
  return { ok: true, dbVersion: (await read({ dbName: MAIN })).dbVersion };
}
export async function cleanupBeta() { root?.unmount(); for (const dbName of [MAIN, COPY, EMPTY]) await deleteDisposableTextLibraryDatabase({ dbName }); }
