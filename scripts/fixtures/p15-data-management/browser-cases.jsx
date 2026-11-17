import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createTextDataManagementSession } from '../../../src/services/textDataManagementSession.js';
import SharedMixedWorkspaceReader from '../../../src/components/text/presentation/SharedMixedWorkspaceReader.jsx';
import { createP15Fixture } from './fixture.js';

const root = createRoot(document.getElementById('root'));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async predicate => { const end = performance.now() + 5000; while (performance.now() < end) { if (predicate()) return; await frame(); } throw Error('Committed UI condition timed out'); };
const assert = (ok, message) => { if (!ok) throw Error(message); };
const q = selector => document.querySelector(selector);
export const runP15BrowserCases = async () => {
  const f = createP15Fixture(), { ids } = f, original = JSON.stringify(f.snapshot), results = [];
  const transport = { mode: 'accept', release: null, calls: 0 };
  const key = { workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' };
  const session = createTextDataManagementSession({ snapshot: f.snapshot, boundary: 'disposable', permissions: ['catalog', 'content'],
    sourceAttachments: f.sourceAttachments, execute: (_, { preparedOutcome }) => {
      transport.calls++;
      if (transport.mode === 'defer') return new Promise(resolve => { transport.release = () => resolve(preparedOutcome); });
      if (transport.mode === 'reject') return { ok: false, error: { code: 'QA_REJECTED', message: 'Retry the draft' } };
      return preparedOutcome;
    } });
  function Harness() {
    const state = useSyncExternalStore(session.subscribe, session.getState);
    const docs = [...(state.view?.catalog.rootDocuments || []), ...(state.view?.catalog.collections.flatMap(c => c.documents) || [])];
    return <main>
      <nav aria-label="Fixture library">
        <button onClick={() => session.navigate({})}>Library</button>
        {state.view?.catalog.collections.map(c => <button key={c.id} data-collection={c.id} onClick={() => session.navigate({ collectionId: c.id })}>{c.title}</button>)}
        {docs.map(d => <button key={d.id} data-workspace={d.id} onClick={() => session.navigate({ workspaceId: d.id })}>{d.title}</button>)}
      </nav>
      <output data-selection>{JSON.stringify(state.view?.selection)}</output>
      <output role="status">{state.pending ? 'Pending' : 'Idle'}</output>
      {state.error && <p role="alert">{state.error.code}: {state.error.message}</p>}
      {state.view?.workspace?.unsupportedReason && <p data-unsupported>{state.view.workspace.unsupportedReason}</p>}
      <input aria-label="Sentence draft" value={session.getDraft(key) ?? ''} onChange={e => session.setDraft(key, e.target.value)} />
      <button data-save disabled={state.pending} onClick={() => session.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: session.getDraft(key) } })}>Save draft</button>
      {state.view?.workspace?.presentation && <output data-projection>{JSON.stringify(state.view.workspace.presentation)}</output>}
      {state.view?.workspace?.document.documentType === 'mixed' && <SharedMixedWorkspaceReader snapshot={session.getSnapshot()}
        documentId={state.view.workspace.document.id} isBusy={state.pending} />}
    </main>;
  }
  root.render(<Harness />);
  const run = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } };
  const nav = async id => { q('[data-workspace="' + id + '"]').click(); await until(() => session.getState().view?.selection.workspaceId === id && q('[data-selection]')?.textContent.includes(id)); };
  await until(() => q('[data-save]'));
  await run('Real React catalog navigation across Collection, Paragraph, Mixed and unsupported Legacy', async () => {
    q('[data-collection="' + ids.collectionId + '"]').click(); await until(() => q('[data-selection]').textContent.includes(ids.collectionId));
    await nav(ids.paragraphId); assert(q('[data-projection]').textContent.includes(ids.paragraphSegmentId), 'Paragraph identity');
    await nav(ids.legacyId); await until(() => q('[data-unsupported]')); assert(!q('[data-projection]'), 'No stale projection');
    await nav(ids.documentId); await until(() => q('[data-shared-mixed-reader]'));
  });
  await run('EN/ID, empty Units/Cards, same-speaker Turns and exact IDs in the shared Reader projection', async () => {
    const p = session.getState().view.workspace.presentation;
    assert(p.cards.map(c => c.id).join() === f.cardOrder.join(), 'Global order');
    assert(p.cards.some(c => !c.units.length) && p.cards.flatMap(c => c.units).some(u => !u.segments.length), 'Empty identities');
    const segment = p.segmentById[ids.firstSentenceId], raw = f.snapshot.segments.find(s => s.id === segment.id);
    assert(segment.uid === raw.uid && segment.meaning === raw.meaning, 'Paired Segment');
    assert(q('[data-shared-mixed-reader]').dataset.readerCursorPrecision === 'none', 'No invented cursor/audio host');
    const audio = session.getState().view.workspace.audio.variants;
    const ownIds = new Set(session.getState().view.workspace.documentTree.blocks.flatMap(c => c.segments.map(s => s.id)));
    assert(audio.length > 0 && audio.every(a => ownIds.has(a.segmentId)), 'Scoped AudioVariant associations');
  });
  await run('Controlled draft input survives rejected command and retry updates existing Shared Reader', async () => {
    const input = q('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'P15 browser edit.');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => session.getDraft(key) === 'P15 browser edit.');
    transport.mode = 'reject'; q('[data-save]').click();
    await until(() => q('[role=alert]')?.textContent.includes('QA_REJECTED'));
    assert(input.value === 'P15 browser edit.', 'Rejected draft retained');
    transport.mode = 'accept'; q('[data-save]').click();
    await until(() => !session.getState().pending && session.getSnapshot().segments.find(s => s.id === key.entityId).text === 'P15 browser edit.');
    await until(() => q('[data-shared-mixed-reader]').textContent.includes('P15 browser edit.'));
    assert(session.getSnapshot().segments.find(s => s.id === key.entityId).uid === f.snapshot.segments.find(s => s.id === key.entityId).uid, 'Retained UID');
  });
  await run('Synchronous pending lock and navigation reject stale async success without content changes', async () => {
    const before = JSON.stringify(session.getSnapshot()), calls = transport.calls;
    transport.mode = 'defer'; q('[data-save]').click(); q('[data-save]').click();
    await until(() => q('[data-save]').disabled && q('[role=status]').textContent === 'Pending');
    assert(transport.calls === calls + 1, 'No duplicate execution');
    await nav(ids.paragraphId); transport.release();
    await until(() => q('[role=alert]')?.textContent.includes('STALE_RESULT'));
    assert(JSON.stringify(session.getSnapshot()) === before, 'Stale result discarded');
    assert(session.getDraft(key) === 'P15 browser edit.', 'Draft preserved across navigation');
  });
  await run('Cross-Workspace command rejection is visible and preserves data', async () => {
    transport.mode = 'accept'; q('[data-save]').click();
    await until(() => q('[role=alert]')?.textContent.includes('OUT_OF_SCOPE'));
    assert(!session.getState().pending, 'Recovered pending state');
  });
  await run('Source replacement, invalid snapshot recovery and original fixture immutability', async () => {
    session.replaceSource({ schemaVersion: 99 }); await until(() => q('[role=alert]')?.textContent.includes('UNSUPPORTED_SCHEMA'));
    assert(!session.getState().view && !q('[data-projection]'), 'Invalid snapshot cannot reuse projection');
    session.replaceSource(f.snapshot, { selection: { workspaceId: ids.documentId }, sourceAttachments: f.sourceAttachments });
    await until(() => q('[data-shared-mixed-reader]'));
    assert(JSON.stringify(f.snapshot) === original, 'Original untouched');
    assert(session.getState().view.workspace.audio.readiness === 'not-evaluated', 'Metadata not Ready');
  });
  session.dispose();
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results,
    indexedDbCalls: window.__p15DbCalls, storageCalls: window.__p15StorageCalls };
};
