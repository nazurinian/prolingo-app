import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createTextDataManagementSession } from '../../../src/services/textDataManagementSession.js';
import SharedMixedWorkspaceReader from '../../../src/components/text/presentation/SharedMixedWorkspaceReader.jsx';
import TextDataManagementQaPreview from '../../../src/components/text/management/TextDataManagementQaPreview.jsx';
import { createP15ExtendedQaFixtures, createP15Fixture } from './fixture.js';

const root = createRoot(document.getElementById('root'));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async (predicate, label = 'Committed UI condition timed out') => {
  const end = performance.now() + 6000;
  while (performance.now() < end) {
    if (predicate()) return;
    await frame();
  }
  throw Error(label);
};
const assert = (ok, message) => { if (!ok) throw Error(message); };
const q = (selector, scope = document) => scope.querySelector(selector);

let vpReqSeq = 0;
const setViewport = (width, height) => new Promise(resolve => {
  const id = ++vpReqSeq;
  window.__p15InputPending[id] = resolve;
  window.p15BrowserControl(JSON.stringify({ type: 'viewport', id, width, height }));
});
const captureShot = name => new Promise(resolve => {
  const id = ++vpReqSeq;
  window.__p15InputPending[id] = resolve;
  window.p15BrowserControl(JSON.stringify({ type: 'screenshot', id, name }));
});

const setInputValue = async (el, value) => {
  assert(el, 'Missing form control for input');
  const proto = el.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await frame();
};

const clickEl = async el => {
  assert(el && !el.disabled, `Missing or disabled button: ${el?.outerHTML?.slice(0, 120) || 'null'}`);
  el.click();
  await frame();
};

const runOriginalA1BrowserCases = async results => {
  const f = createP15Fixture(), { ids } = f, original = JSON.stringify(f.snapshot);
  const transport = { mode: 'accept', release: null, calls: 0 };
  const key = { workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' };
  const session = createTextDataManagementSession({
    snapshot: f.snapshot,
    boundary: 'disposable',
    permissions: ['catalog', 'content'],
    sourceAttachments: f.sourceAttachments,
    execute: (_, { preparedOutcome }) => {
      transport.calls++;
      if (transport.mode === 'defer') return new Promise(resolve => { transport.release = () => resolve(preparedOutcome); });
      if (transport.mode === 'reject') return { ok: false, error: { code: 'QA_REJECTED', message: 'Retry the draft' } };
      return preparedOutcome;
    }
  });
  function Harness() {
    const state = useSyncExternalStore(session.subscribe, session.getState);
    const docs = [...(state.view?.catalog.rootDocuments || []), ...(state.view?.catalog.collections.flatMap(c => c.documents) || [])];
    return (
      <main>
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
        {state.view?.workspace?.document.documentType === 'mixed' && <SharedMixedWorkspaceReader snapshot={session.getSnapshot()} documentId={state.view.workspace.document.id} isBusy={state.pending} />}
      </main>
    );
  }
  root.render(<Harness />);
  const run = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.message }); }
  };
  const nav = async id => {
    q('[data-workspace="' + id + '"]').click();
    await until(() => session.getState().view?.selection.workspaceId === id && q('[data-selection]')?.textContent.includes(id));
  };
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
  root.render(null);
  await frame();
};

const runFullPageH1Cases = async results => {
  window.confirm = () => true;
  const fixtures = createP15ExtendedQaFixtures();
  const { ids } = fixtures.base;
  const originalBase = JSON.stringify(fixtures.base.snapshot);

  const run = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e?.stack || e?.message || String(e) }); }
  };

  root.render(<React.StrictMode><TextDataManagementQaPreview /></React.StrictMode>);
  await until(() => q('[data-dm-page="ready"]') && q('[data-dm-qa-preview="true"]'), 'QA Preview did not reach ready state');

  await run('H1-1: Default Read-Only mode shows disabled reasons and switches cleanly to Isolated Disposable Edit Mode', async () => {
    assert(q('[data-dm-mode-badge="read-only"]'), 'Must default to Read-Only mode');
    assert(q('[data-dm-toggle-create-collection]').disabled, 'Collection create disabled in read-only mode');
    assert(q('[data-dm-toggle-create-workspace]').disabled, 'Workspace create disabled in read-only mode');
    assert(q('[data-dm-capability-hint="collection.create"]').textContent.includes('READ_ONLY'), 'Must show READ_ONLY reason');
    await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
    await until(() => q('[data-dm-mode-badge="disposable"]'), 'Must switch to Disposable mode');
    await until(() => !q('[data-dm-toggle-create-collection]').disabled, 'Create Collection enabled in disposable mode at {}');
  });

  await run('H1-2: Library Explorer navigates Whole Library, Root, Collection, Legacy unsupported state, and full catalog CRUD', async () => {
    await clickEl(q(`[data-dm-workspace="${ids.legacyId}"]`));
    await until(() => q('[data-dm-unsupported-workspace="UNSUPPORTED_WORKSPACE"]'), 'Legacy must show UNSUPPORTED_WORKSPACE banner');
    assert(!q('[data-dm-structured-editor]'), 'Legacy cannot mount Structured Editor');
    assert(q(`[data-dm-workspace-save="${ids.legacyId}"]`).disabled, 'Legacy Workspace save must stay disabled');

    await clickEl(q('[data-dm-nav-root]'));
    await until(() => q('[data-dm-reorder-blocked-reason="UNSUPPORTED_WORKSPACE"]'), 'Root with Legacy must disable reorder');

    await clickEl(q('[data-dm-nav-library]'));
    await until(() => !q('[data-dm-toggle-create-collection]').disabled, 'Create Collection enabled in Whole Library {}');
    await clickEl(q('[data-dm-toggle-create-collection]'));
    await setInputValue(q('[aria-label="New Collection title"]'), 'H1 Temp Collection');
    await setInputValue(q('[aria-label="New Collection note"]'), 'Temp note');
    await clickEl(q('[data-dm-submit-create-collection]'));

    await until(() => [...document.querySelectorAll('[data-dm-collection]')].some(el => el.textContent.includes('H1 Temp Collection')));
    const tempColBtn = [...document.querySelectorAll('[data-dm-collection]')].find(el => el.textContent.includes('H1 Temp Collection'));
    const tempColId = tempColBtn.dataset.dmCollection;
    await clickEl(tempColBtn);
    await until(() => q('[data-dm-current-selection]')?.textContent.includes(tempColId));

    // Create Workspace inside temp Collection
    await clickEl(q('[data-dm-toggle-create-workspace]'));
    await setInputValue(q('[aria-label="New Workspace title"]'), 'H1 Scene Doc');
    await setInputValue(q('[aria-label="New Workspace type"]'), 'conversation');
    await clickEl(q('[data-dm-submit-create-workspace]'));
    await until(() => [...document.querySelectorAll('[data-dm-workspace]')].some(el => el.textContent.includes('H1 Scene Doc')));

    // Native non-empty Collection deletion rejection
    await clickEl(q(`[data-dm-collection-delete="${tempColId}"]`));
    await until(() => q('[data-dm-page-error]'), 'Non-empty Collection deletion must show error alert');
    assert(q(`[data-dm-collection="${tempColId}"]`), 'Collection must remain intact after non-empty delete rejection');

    // Rename & move Workspace to Root, then delete it
    const tempDocBtn = [...document.querySelectorAll('[data-dm-workspace]')].find(el => el.textContent.includes('H1 Scene Doc'));
    const tempDocId = tempDocBtn.dataset.dmWorkspace;
    await clickEl(tempDocBtn);
    await until(() => q(`[data-dm-workspace-save="${tempDocId}"]`));
    await setInputValue(q('[aria-label="Workspace Title"]'), 'H1 Scene Moved');
    await setInputValue(q('[aria-label="Workspace Collection"]'), '__root__');
    await clickEl(q(`[data-dm-workspace-save="${tempDocId}"]`));
    await until(() => q('[data-dm-current-selection]') && document.querySelector(`[data-dm-workspace="${tempDocId}"]`)?.textContent.includes('H1 Scene Moved'));
    await clickEl(q(`[data-dm-workspace-delete="${tempDocId}"]`));
    await until(() => !q(`[data-dm-workspace="${tempDocId}"]`), 'Deleted Workspace removed from catalog');

    // Reorder Collections in Whole Library {} and delete empty Collection
    await clickEl(q('[data-dm-nav-library]'));
    await until(() => !q(`[data-dm-collection-reorder-up="${tempColId}"]`).disabled);
    await clickEl(q(`[data-dm-collection-reorder-up="${tempColId}"]`));
    await clickEl(q(`[data-dm-collection="${tempColId}"]`));
    await until(() => q(`[data-dm-collection-edit-toggle="${tempColId}"]`));
    await clickEl(q(`[data-dm-collection-edit-toggle="${tempColId}"]`));
    await setInputValue(q(`[aria-label="Collection title ${tempColId}"]`), 'H1 Renamed Col');
    await clickEl(q(`[data-dm-collection-save="${tempColId}"]`));
    await until(() => q(`[data-dm-collection="${tempColId}"]`).textContent.includes('H1 Renamed Col'));
    await clickEl(q(`[data-dm-collection-delete="${tempColId}"]`));
    await until(() => !q(`[data-dm-collection="${tempColId}"]`), 'Empty Collection deletes cleanly');
  });

  await run('H1-3: Structured Editor covers Card create/reorder/edit, Paragraph Sections, Conversation Empty Turns, Split/Merge, Move & live Shared Reader sync', async () => {
    await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
    await until(() => q('[data-shared-mixed-reader]') && q(`[data-dm-structured-editor="${ids.documentId}"]`));

    // Create Paragraph Card
    await setInputValue(q('[aria-label="New Card kind"]'), 'paragraph');
    await setInputValue(q('[aria-label="New Card title"]'), 'H1 Added Paragraph');
    await clickEl(q('[data-dm-create-card-submit]'));
    await until(() => [...document.querySelectorAll('[data-dm-card-id]')].some(el => el.textContent.includes('H1 Added Paragraph')));
    const paraCardEl = [...document.querySelectorAll('[data-dm-card-id]')].find(el => el.textContent.includes('H1 Added Paragraph'));
    const paraCardId = paraCardEl.dataset.dmCardId;

    // Create a second Section in Paragraph Card so move/merge work
    await clickEl(q(`[data-dm-open-create-unit="${paraCardId}"]`));
    await setInputValue(q(`[aria-label="New Unit first text ${paraCardId}"]`), 'Section two line.');
    await setInputValue(q(`[aria-label="New Unit first meaning ${paraCardId}"]`), 'Baris dua.');
    await clickEl(q(`[data-dm-create-unit-submit="${paraCardId}"]`));
    await until(() => q(`[data-dm-card-id="${paraCardId}"]`).querySelectorAll('[data-dm-unit-id]').length >= 2);

    const firstSectionEl = q(`[data-dm-card-id="${paraCardId}"]`).querySelectorAll('[data-dm-unit-id]')[0];
    const firstSectionId = firstSectionEl.dataset.dmUnitId;
    await setInputValue(q(`[aria-label="Add Sentence text ${firstSectionId}"]`), 'Alpha start.');
    await setInputValue(q(`[aria-label="Add Sentence meaning ${firstSectionId}"]`), 'Mulai alfa.');
    await clickEl(q(`[data-dm-add-sentence-submit="${firstSectionId}"]`));
    await until(() => q(`[data-dm-unit-id="${firstSectionId}"] [data-dm-segment-id]`));

    const segId = q(`[data-dm-unit-id="${firstSectionId}"] [data-dm-segment-id]`).dataset.dmSegmentId;
    await clickEl(q(`[data-dm-segment-move-toggle="${segId}"]`));
    await clickEl(q(`[data-dm-segment-move-submit="${segId}"]`));
    await until(() => q(`[data-dm-unit-id="${firstSectionId}"] [data-dm-empty-unit="${firstSectionId}"]`), 'Moving only Sentence retains empty Section');

    // Merge Sections in Paragraph Card
    await clickEl(q(`[data-dm-unit-merge-next="${firstSectionId}"]`));
    await until(() => q(`[data-dm-card-id="${paraCardId}"]`).querySelectorAll('[data-dm-unit-id]').length === 1);

    // Create Conversation Scene Card & Empty Turn + Bilingual Split
    await setInputValue(q('[aria-label="New Card kind"]'), 'conversation');
    await setInputValue(q('[aria-label="New Card title"]'), 'H1 Added Scene');
    await clickEl(q('[data-dm-create-card-submit]'));
    await until(() => [...document.querySelectorAll('[data-dm-card-id]')].some(el => el.textContent.includes('H1 Added Scene')));
    const sceneEl = [...document.querySelectorAll('[data-dm-card-id]')].find(el => el.textContent.includes('H1 Added Scene'));
    const sceneId = sceneEl.dataset.dmCardId;

    // Move Scene Card up in global order
    await clickEl(q(`[data-dm-card-up="${sceneId}"]`));

    // Create Empty Turn first
    await clickEl(q(`[data-dm-open-create-unit="${sceneId}"]`));
    await setInputValue(q(`[aria-label="New Turn speaker ${sceneId}"]`), '__none__');
    await clickEl(q(`[data-dm-create-unit-submit="${sceneId}"]`));
    await until(() => q(`[data-dm-card-id="${sceneId}"] [data-dm-unit-id] [data-dm-empty-unit]`), 'Empty Turn preserved');

    const emptyTurnId = q(`[data-dm-card-id="${sceneId}"] [data-dm-unit-id]`).dataset.dmUnitId;
    await setInputValue(q(`[aria-label="Add Sentence text ${emptyTurnId}"]`), 'First part. Second part.');
    await setInputValue(q(`[aria-label="Add Sentence meaning ${emptyTurnId}"]`), 'Bagian satu. Bagian dua.');
    await clickEl(q(`[data-dm-add-sentence-submit="${emptyTurnId}"]`));
    await until(() => q(`[data-dm-unit-id="${emptyTurnId}"] [data-dm-segment-id]`));

    const splitSegId = q(`[data-dm-unit-id="${emptyTurnId}"] [data-dm-segment-id]`).dataset.dmSegmentId;
    await clickEl(q(`[data-dm-segment-split-toggle="${splitSegId}"]`));
    await until(() => q(`[data-dm-segment-id="${splitSegId}"] [data-conversation-sentence-split]`));
    const autoSplitBtn = [...q(`[data-dm-segment-id="${splitSegId}"]`).querySelectorAll('button')].find(b => b.textContent.includes('Apply Auto Split'));
    await clickEl(autoSplitBtn);
    await until(() => q(`[data-dm-unit-id="${emptyTurnId}"]`).querySelectorAll('[data-dm-segment-id]').length === 2, 'Bilingual split created 2 sentences');
    assert(q('[data-shared-mixed-reader]').textContent.includes('First part.'), 'Shared Reader live synced split text');

    // Clean up test cards via Delete Card so subsequent fixture tests stay crisp
    await clickEl(q(`[data-dm-card-delete="${sceneId}"]`));
    await clickEl(q(`[data-dm-card-delete="${paraCardId}"]`));
    await until(() => !q(`[data-dm-card-id="${sceneId}"]`) && !q(`[data-dm-card-id="${paraCardId}"]`));
  });

  await run('H1-4: Session drafts survive QA_REJECTED, Pending/STALE_RESULT, and Schema 99 error recovery', async () => {
    await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
    await until(() => q(`[data-dm-segment-id="${ids.firstSentenceId}"]`));

    const textInput = q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`);
    await setInputValue(textInput, 'H1 Preserved Draft.');

    // Reject path preserves draft
    await setInputValue(q('[data-dm-qa-transport-select]'), 'reject');
    await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
    await until(() => q('[data-dm-page-error="QA_REJECTED"]'));
    assert(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'H1 Preserved Draft.', 'Draft preserved after rejection');

    // Defer + Navigate -> STALE_RESULT preserves draft
    await setInputValue(q('[data-dm-qa-transport-select]'), 'defer');
    await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
    await until(() => q('[data-dm-pending-status="pending"]'));
    assert(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`).disabled, 'Pending disables save submit');
    await clickEl(q(`[data-dm-workspace="${ids.paragraphId}"]`));
    await clickEl(q('[data-dm-qa-release-deferred]'));
    await until(() => q('[data-dm-page-error="STALE_RESULT"]'));

    // Inject Schema 99 -> invalid snapshot recovery screen shows retained draft, Reload recovers
    await clickEl(q('[data-dm-qa-inject-invalid]'));
    await until(() => q('[data-dm-invalid-snapshot="true"]') && q('[data-dm-retained-drafts]'));
    assert(q('[role="alert"]').textContent.includes('UNSUPPORTED_SCHEMA'), 'Invalid snapshot shows UNSUPPORTED_SCHEMA');
    assert(q('[data-dm-retained-drafts]').textContent.includes('H1 Preserved Draft.'), 'Retained draft recovered while view is null');

    await clickEl(q('[data-dm-reload-valid-source]'));
    await until(() => q('[data-dm-page="ready"]'));
    await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
    await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'H1 Preserved Draft.');
    await setInputValue(q('[data-dm-qa-transport-select]'), 'accept');
    await clickEl(q(`[data-dm-segment-clear-draft="${ids.firstSentenceId}"]`));
  });

  await run('H1-5: Disposable v1 Paragraph keeps virtual Sections read-only and authors Segments via segment.create/segment.reorder without unitId', async () => {
    await setInputValue(q('[data-dm-qa-preset-select]'), 'v1-paragraph');
    await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
    await until(() => q('[data-dm-workspace]'));
    const v1DocBtn = q('[data-dm-workspace]');
    const v1DocId = v1DocBtn.dataset.dmWorkspace;
    await clickEl(v1DocBtn);
    await until(() => q(`[data-dm-workspace-inspector="${v1DocId}"]`) && q('[data-dm-virtual-unit]') && q('[data-dm-v1-unit-disabled]'));
    assert(q('[data-dm-virtual-unit]').textContent.includes('id: null'), 'v1 Section shows id: null');
    assert(q('[data-dm-v1-unit-disabled]').textContent.includes('PERSISTENT_UNITS_REQUIRED'), 'v1 Section disabled hint shown');
    const v1CardId = q('[data-dm-card-id]').dataset.dmCardId;
    assert(q(`[data-dm-unit-edit-toggle]`).disabled, 'v1 virtual Unit edit stays disabled');
    await setInputValue(q(`[aria-label="Add Sentence text ${v1CardId}"]`), 'V1 third sentence.');
    await clickEl(q(`[data-dm-add-sentence-submit="${v1CardId}"]`));
    await until(() => document.querySelectorAll(`[data-dm-card-id="${v1CardId}"] [data-dm-segment-id]`).length === 3);
    const v1SegIds = [...document.querySelectorAll(`[data-dm-card-id="${v1CardId}"] [data-dm-segment-id]`)].map(el => el.dataset.dmSegmentId);
    await clickEl(q(`[data-dm-segment-up="${v1SegIds[2]}"]`));
    await until(() => {
      const next = [...document.querySelectorAll(`[data-dm-card-id="${v1CardId}"] [data-dm-segment-id]`)].map(el => el.dataset.dmSegmentId);
      return next[1] === v1SegIds[2];
    }, 'v1 segment.reorder must reorder without contentUnits');
  });

  await run('H1-6: Speakers, Audio coverage honesty, multi/single Source previews & Transfer Exports/Inspects/Diagnostics', async () => {
    await setInputValue(q('[data-dm-qa-preset-select]'), 'v2-external-sources');
    await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
    await until(() => q('[data-dm-page="ready"]') && q('[data-dm-diagnostics]'));

    const extPreset = fixtures.presets['v2-external-sources'];
    const attachedId = extPreset.ids.attachedId;
    const extDocId = extPreset.ids.externalDocumentId;

    // Navigate to Mixed doc: verify Speakers & Audio evaluation transition
    await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
    await until(() => q('[data-dm-speaker-management]') && q('[data-dm-audio-inspector]'));
    await clickEl(q('[data-conversation-speaker-registry] button'));
    await setInputValue(q('[aria-label="New speaker label"]'), 'Moderator');
    const regBtn = [...q('[data-conversation-speaker-registry]').querySelectorAll('button')].find(b => b.textContent.includes('Register'));
    await clickEl(regBtn);
    await until(() => q('[data-dm-speaker-uid-list]')?.textContent?.includes('Moderator'), 'Speaker Moderator did not appear');

    assert(q('[data-dm-audio-readiness]')?.dataset.dmAudioReadiness === 'not-evaluated', 'Default readiness not-evaluated');
    assert(q('[data-dm-full-artifacts]')?.textContent?.includes('Metadata Only — Not Physical Ready'), 'Full metadata never Ready');
    await setInputValue(q('[data-dm-qa-audio-select]'), 'lazy-markers-only');
    await until(() => q('[data-dm-audio-readiness]')?.dataset.dmAudioReadiness === 'evaluated-with-supplied-bindings', 'Audio readiness did not evaluate for lazy markers');
    assert(q('[data-dm-audio-coverage]')?.textContent?.includes('Ready: 0/'), 'Folder markers cannot yield Ready');
    await setInputValue(q('[data-dm-qa-audio-select]'), 'verified-url-bindings');
    await until(() => q('[data-dm-audio-readiness]')?.dataset.dmAudioReadiness === 'evaluated-with-supplied-bindings' && q('[data-dm-audio-coverage]') && !q('[data-dm-audio-coverage]').textContent.includes('Ready: 0/'), 'Verified concrete URLs evaluate Ready');

    // Multi-Workspace source disabled check on attachedId if it owns 2 docs, or check multiAttachmentId
    const multiDocId = extPreset.ids.multiWorkspaceDocIds.find(id => id !== attachedId) || attachedId;
    await clickEl(q(`[data-dm-workspace="${multiDocId}"]`));
    await until(() => q(`[data-dm-multi-workspace-source-disabled]`), 'Multi-Workspace source disabled marker missing');
    assert(q('[data-dm-source-inspector]')?.textContent?.includes('COLLECTION_SOURCE_SCOPE_REQUIRED'), 'Multi-Workspace attachment blocked cleanly');

    // Single-Workspace attachedId sync/detach preview
    await clickEl(q(`[data-dm-workspace="${attachedId}"]`));
    await until(() => q('[data-dm-preview-source-sync]'), 'Single-Workspace source sync button missing');
    await clickEl(q('[data-dm-preview-source-sync]'));
    await until(() => q('[data-dm-source-preview-result="source-sync"]'), 'source-sync preview result missing');
    await clickEl(q('[data-dm-preview-source-detach]'));
    await until(() => q('[data-dm-source-preview-result="source-detach"]')?.textContent?.includes('applyEnabled: false'), 'source-detach preview result missing');

    // External JSON Reconciliation preview
    await clickEl(q(`[data-dm-workspace="${extDocId}"]`));
    await until(() => q('[data-dm-preview-external-reconcile]'), 'External reconcile preview button missing');
    await clickEl(q('[data-dm-preview-external-reconcile]'));
    await until(() => q('[data-dm-source-preview-result="external-json-inspect"]')?.textContent?.includes('applyEnabled: false'), 'external-json-inspect preview result missing');

    // Transfers & Diagnostics
    await clickEl(q('[data-dm-tab="transfers"]'));
    await until(() => q('[data-dm-export-text-pack]'), 'Export Text Pack button missing');
    await clickEl(q('[data-dm-export-text-pack]'));
    await until(() => q('[data-dm-export-output="text-pack"]'), 'Export Text Pack output missing');
    await clickEl(q('[data-dm-export-backup-missing-meta]'));
    await until(() => q('[data-dm-transfer-error]')?.textContent?.includes('METADATA_REQUIRED'), 'METADATA_REQUIRED error missing');
    await clickEl(q('[data-dm-export-backup]'));
    await until(() => q('[data-dm-export-output="database-backup"]')?.textContent?.includes('audioBinaryIncluded: false'), 'Export Database Backup output missing');
    await clickEl(q('[data-dm-run-inspect-transfer]'));
    await until(() => q('[data-dm-inspect-result="database-backup"]')?.textContent?.includes('applyEnabled: false'), 'Inspect database-backup result missing');

    await clickEl(q('[data-dm-load-malformed-json]'));
    await clickEl(q('[data-dm-run-inspect-transfer]'));
    await until(() => q('[data-dm-transfer-error]')?.textContent?.includes('INVALID_TRANSFER'), 'INVALID_TRANSFER error missing');

    // Return to Whole Library {} to preview copy/import
    await clickEl(q('[data-dm-nav-library]'));
    await until(() => q('[data-dm-load-sample-pack]'), 'Load sample pack button missing');
    await clickEl(q('[data-dm-load-sample-pack]'));
    await clickEl(q('[data-dm-preview-pack-copy]'));
    await until(() => q('[data-dm-transfer-preview-result="text-pack-copy"]')?.textContent?.includes('applyEnabled: false'), 'text-pack-copy preview missing');
    await clickEl(q('[data-dm-load-sample-external]'));
    // In v2-external-sources, P15_EXTERNAL_SAMPLE_PACKAGE is already imported -> native rejection
    await clickEl(q('[data-dm-preview-external-import]'));
    await until(() => q('[data-dm-transfer-error]')?.textContent?.includes('already imported'), 'Already-imported external JSON must reject duplicate initial import');

    // Switch to v2-complete where P15_EXTERNAL_SAMPLE_PACKAGE is not yet imported -> pure initial import preview succeeds
    await setInputValue(q('[data-dm-qa-preset-select]'), 'v2-complete');
    await until(() => q('[data-dm-page="ready"]') && q('[data-dm-load-sample-external]'));
    await clickEl(q('[data-dm-load-sample-external]'));
    await clickEl(q('[data-dm-preview-external-import]'));
    await until(() => q('[data-dm-transfer-preview-result="external-json-import"]')?.textContent?.includes('applyEnabled: false'), 'external-json-import preview missing on clean library');
    assert(q('[data-dm-diagnostics]')?.textContent?.includes('canonicalWrites: false'), 'Diagnostics shows canonicalWrites: false');
  });

  await run('H1-7: Responsive 1280px/375px/320px viewports, keyboard tablist, Dark Mode and optional screenshots with zero horizontal overflow', async () => {
    await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
    await clickEl(q('[data-dm-tab="all"]'));
    await until(() => q('[data-dm-structured-editor]'));

    // Keyboard tab navigation test
    const firstTab = q('[data-dm-tab="all"]');
    firstTab.focus();
    firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await until(() => q('[data-dm-tab="editor"][aria-selected="true"]'));
    q('[data-dm-tab="editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await until(() => q('[data-dm-tab="all"][aria-selected="true"]'));

    await setViewport(1280, 900);
    await until(() => window.innerWidth === 1280);
    await captureShot('p15-h1-desktop-full');
    assert(document.documentElement.scrollWidth <= window.innerWidth, `Desktop overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

    await setViewport(375, 812);
    await until(() => window.innerWidth === 375);
    await captureShot('p15-h1-mobile-375');
    assert(document.documentElement.scrollWidth <= window.innerWidth, `375px overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

    await clickEl(q('[data-dm-mobile-explorer-toggle]'));
    await clickEl(q('[data-dm-qa-dark-toggle]'));
    await setViewport(320, 740);
    await until(() => window.innerWidth === 320);
    await captureShot('p15-h1-mobile-320-dark');
    assert(document.documentElement.scrollWidth <= window.innerWidth, `320px overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

    await clickEl(q('[data-dm-qa-dark-toggle]'));
    await setViewport(1280, 800);
  });

  root.render(null);
  await frame();
  assert(JSON.stringify(fixtures.base.snapshot) === originalBase, 'Base fixture snapshot mutated');
};

export const runP15BrowserCases = async () => {
  const results = [];
  await runOriginalA1BrowserCases(results);
  await runFullPageH1Cases(results);
  return {
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
    indexedDbCalls: window.__p15DbCalls,
    storageCalls: window.__p15StorageCalls
  };
};
