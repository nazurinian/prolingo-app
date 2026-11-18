import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createP15ExtendedQaFixtures } from './fixture.js';
import { createTextDataManagementSession } from '../../../src/services/textDataManagementSession.js';
import { canonicalJsonStringify as canonical } from '../../../src/domain/text/textCanonicalFingerprintDomain.js';
import { applyTextDataManagementCommand } from '../../../src/domain/text/textDataManagementDomain.js';
import { createTextDataManagementPersistenceAdapter as adapter, seedDisposableTextManagementDatabase as seed,
  readDisposableTextManagementDatabaseState as read, executeDisposableTextManagementTransaction as write,
  exportDisposableTextManagementDatabaseBackup as backup, restoreDisposableTextManagementDatabaseBackup as restore } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import TextDataManagementPage from '../../../src/components/text/management/TextDataManagementPage.jsx';
import { createTextSnapshotCommandCoordinator } from '../../../src/domain/text/textMixedEditorDomain.js';

const assert = (ok, message) => { if (!ok) throw Error(message); };
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async (predicate, message) => { const end = performance.now() + 6000; while (performance.now() < end) { if (predicate()) return; await frame(); } throw Error(message || 'Committed UI condition timed out'); };
const q = selector => document.querySelector(selector);
const input = async (id, text) => {
  const el = q('[aria-label="Sentence text ' + id + '"]');
  assert(el, 'Sentence input missing');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true })); await frame();
};
const rejected = async (fn, codes) => { let error; try { await fn(); } catch (e) { error = e; } assert(error && codes.includes(error.code), 'Expected ' + codes.join('/') + ', got ' + (error?.code || 'SUCCESS')); };
export async function runP15A2BrowserCases() {
  const fixtures = createP15ExtendedQaFixtures(), rich = fixtures.presets['v2-external-sources'], v1 = fixtures.presets['v1-paragraph'];
  const ids = fixtures.base.ids, results = [], names = [], disposers = [];
  const db = label => { const name = 'prolingo_text_library_d3b_qa_p15_independent_' + label; names.push(name); return name; };
  const run = async (name, fn) => { try { await fn(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); } };
  const access = { boundary: 'disposable', permissions: ['catalog', 'content'] };
  const command = { type: 'block.create', payload: { documentId: ids.documentId, blockType: 'conversation', title: 'Audit creation' } };
  const selection = { workspaceId: ids.documentId };
  const init = async name => { await seed({ dbName: name, snapshot: rich.snapshot, sourceAttachments: rich.sourceAttachments, externalImports: rich.externalImports }); return read({ dbName: name }); };
  const mount = element => { const el = document.createElement('div'); document.getElementById('root').replaceChildren(el); const root = createRoot(el); root.render(element); const dispose = () => root.unmount(); disposers.push(dispose); return dispose; };
  try {
    await run('AUD-01: Raw restore rejects lowered counters and malformed registries before replacing anything', async () => {
      const name = db('restore'), before = await init(name), source = await backup({ dbName: name });
      const failures = [];
      for (const mutation of ['counter', 'initialized', 'attachments', 'imports']) {
        const bad = structuredClone(source);
        if (mutation === 'counter') bad.metaRecords.find(m => m.key === 'idCounters').value.text = 0;
        if (mutation === 'initialized') bad.metaRecords.find(m => m.key === 'initialized').value = 'true';
        if (mutation === 'attachments') bad.metaRecords.find(m => m.key === 'sourceAttachments').value = { malformed: true };
        if (mutation === 'imports') bad.metaRecords.find(m => m.key === 'externalSourceImports').value = 'malformed';
        let error; try { await restore({ dbName: name, backup: bad }); } catch (e) { error = e; }
        if (!error) failures.push(mutation + ' ACCEPTED');
        await seed({ dbName: name, snapshot: before.snapshot, metaRecords: before.metaRecords });
      }
      assert(failures.length === 0, failures.join('; '));
      assert((await read({ dbName: name })).snapshotFingerprint === before.snapshotFingerprint, 'Original target changed');
    });
    await run('AUD-02: Versioned readonly access cannot upgrade an existing v1 database', async () => {
      const name = db('v1read'); await seed({ dbName: name, snapshot: v1.snapshot, version: 1 });
      await rejected(() => read({ dbName: name, version: 2 }), ['VERSION_MISMATCH']);
      assert((await read({ dbName: name })).dbVersion === 1, 'Read upgraded schema before rejecting');
    });
    await run('AUD-03: Failed v2 restore cannot leave a v1 target partially upgraded', async () => {
      const source = db('restore_source'); await init(source); const value = await backup({ dbName: source });
      const name = db('restore_v1'); await seed({ dbName: name, snapshot: v1.snapshot, version: 1 });
      const before = await read({ dbName: name });
      let error; try { await restore({ dbName: name, backup: value, onBeforeCommit: ({ tx }) => tx.abort() }); } catch (e) { error = e; }
      assert(error, 'Aborted restore succeeded');
      const after = await read({ dbName: name });
      assert(after.dbVersion === 1 && after.snapshotFingerprint === before.snapshotFingerprint, 'Abort changed the original v1 target');
    });
    await run('AUD-04: Adapter permissions and read-only boundary are ceilings, not caller overrides', async () => {
      const name = db('permissions'), before = await init(name);
      const restricted = adapter({ dbName: name });
      await rejected(() => restricted.execute(command, { ...access, selection, expectedSnapshotFingerprint: before.snapshotFingerprint }), ['READ_ONLY', 'PERMISSION_DENIED']);
      const contentOnly = adapter({ dbName: name, boundary: 'disposable', permissions: ['content'] });
      await rejected(() => contentOnly.execute({ type: 'collection.create', payload: { title: 'Escalated' } },
        { boundary: 'disposable', permissions: ['catalog'], expectedSnapshotFingerprint: before.snapshotFingerprint }), ['PERMISSION_DENIED']);
      assert((await read({ dbName: name })).snapshotFingerprint === before.snapshotFingerprint, 'Escalation wrote records');
    });
    await run('AUD-05: Authoritative coordinator rejects inconsistent next fingerprint and receipt revision', async () => {
      const failures = [];
      for (const mode of ['fingerprint', 'revision', 'command']) {
        const execute = async (cmd, ctx) => {
          const out = applyTextDataManagementCommand(rich.snapshot, cmd, { selection, ...access });
          return { ok: true, authoritative: true, ...out, previousFingerprint: ctx.expectedSnapshotFingerprint,
            snapshotFingerprint: mode === 'fingerprint' ? 'forged-next' : canonical(out.snapshot),
            expectedRevision: mode === 'revision' ? -1 : ctx.expectedRevision, commandType: mode === 'command' ? 'document.delete' : cmd.type };
        };
        execute.authoritativeTransaction = true;
        const session = createTextDataManagementSession({ snapshot: rich.snapshot, selection, ...access, execute });
        const out = await session.dispatch(command);
        if (out.ok) failures.push(mode + ' ACCEPTED');
        assert(canonical(session.getSnapshot()) === canonical(rich.snapshot) || out.ok, 'Rejected receipt mutated data'); session.dispose();
      }
      assert(failures.length === 0, failures.join('; '));
    });
    await run('AUD-06: A committed DB transaction rejected after navigation reports committed/reload-required, preserves draft, and reconciles', async () => {
      const name = db('committed_stale'), before = await init(name), persistent = adapter({ dbName: name, ...access });
      let release, committed;
      const execute = async (...args) => { committed = await persistent.execute(...args); return new Promise(resolve => { release = () => resolve(committed); }); };
      execute.authoritativeTransaction = true;
      const session = createTextDataManagementSession({ snapshot: before.snapshot, metaRecords: before.metaRecords, selection, ...access, execute });
      const key = { workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' };
      session.setDraft(key, 'Must survive conflict');
      const pending = session.dispatch(command);
      await until(() => release, 'Transaction did not finish');
      session.navigate({ workspaceId: ids.paragraphId }); release();
      const out = await pending, stored = await read({ dbName: name });
      assert(stored.snapshot.blocks.some(c => c.id === committed.result.id), 'Database did not actually commit');
      assert(!out.ok && out.error.committed === true && out.error.reloadRequired === true, 'Committed transaction reported as an ordinary failed write: ' + JSON.stringify(out.error));
      session.replaceSource(stored.snapshot, { selection: { workspaceId: ids.paragraphId }, metaRecords: stored.metaRecords, sourceAttachments: stored.sourceAttachments, externalImports: stored.externalImports });
      assert(session.getSnapshot().blocks.filter(c => c.id === committed.result.id).length === 1, 'Reload duplicated or lost creation');
      assert(session.getDraft(key) === 'Must survive conflict', 'Reload lost draft'); session.dispose();
    });
    await run('AUD-07: Direct host retains drafts, selection and accepted edits across equal prop clones and permission changes', async () => {
      const controls = {};
      function Host() {
        const [tick, setTick] = useState(0), [permissions, setPermissions] = useState(access.permissions);
        useEffect(() => { controls.tick = () => setTick(n => n + 1); controls.permissions = setPermissions; }, []);
        return <div data-audit-tick={tick}><TextDataManagementPage snapshot={tick ? structuredClone(rich.snapshot) : rich.snapshot}
          initialSelection={selection} boundary="disposable" permissions={permissions} sourceAttachments={[...rich.sourceAttachments]} externalImports={[...rich.externalImports]} /></div>;
      }
      const unmount = mount(<StrictMode><Host /></StrictMode>); await until(() => q('[data-dm-revision]'));
      await input(ids.firstSentenceId, 'Retained draft'); await input(ids.secondSentenceId, 'Accepted in memory.');
      q('[data-dm-segment-save="' + ids.secondSentenceId + '"]').click();
      await until(() => q('[data-dm-draft-count]')?.dataset.dmDraftCount === '1');
      controls.tick(); await until(() => q('[data-audit-tick="1"]')); await frame();
      assert(q('[aria-label="Sentence text ' + ids.secondSentenceId + '"]').value === 'Accepted in memory.', 'Equal prop clones reset accepted edits');
      controls.permissions(['catalog']); await until(() => q('[data-dm-segment-save="' + ids.firstSentenceId + '"]').disabled); await frame();
      assert(q('[aria-label="Sentence text ' + ids.firstSentenceId + '"]').value === 'Retained draft', 'Permission change destroyed draft');
      assert(q('[aria-label="Sentence text ' + ids.secondSentenceId + '"]').value === 'Accepted in memory.', 'Permission change reset content'); unmount();
    });
    await run('AUD-08: Switching persistence adapters writes only the newly selected disposable DB', async () => {
      const left = db('left'), right = db('right'), before = await init(left); await init(right);
      const a = adapter({ dbName: left, ...access }), b = adapter({ dbName: right, ...access }), controls = {};
      function Host() {
        const [selected, choose] = useState(a);
        useEffect(() => { controls.choose = () => choose(b); }, []);
        return <div data-audit-db={selected.dbName}><TextDataManagementPage snapshot={before.snapshot} initialSelection={selection} {...access} persistenceAdapter={selected} metaRecords={before.metaRecords} /></div>;
      }
      const unmount = mount(<StrictMode><Host /></StrictMode>); await until(() => q('[data-dm-revision]'));
      controls.choose(); await until(() => q('[data-audit-db="' + right + '"]')); await frame();
      await input(ids.firstSentenceId, 'New DB only'); q('[data-dm-segment-save="' + ids.firstSentenceId + '"]').click();
      await until(() => q('[data-dm-draft-count]')?.dataset.dmDraftCount === '0');
      const aState = await read({ dbName: left }), bState = await read({ dbName: right });
      assert(aState.snapshotFingerprint === before.snapshotFingerprint, 'Old adapter wrote to old DB after host switch');
      assert(bState.snapshot.segments.find(s => s.id === ids.firstSentenceId).text === 'New DB only', 'New adapter was ignored'); unmount();
    });
    await run('AUD-09: Real StrictMode stale transaction has a reachable reload action with drafts intact', async () => {
      const name = db('reload_ui'), before = await init(name), persistence = adapter({ dbName: name, ...access }), controls = {};
      let release;
      const execute = async (...args) => { const receipt = await persistence.execute(...args); return new Promise(resolve => { release = () => resolve(receipt); }); };
      execute.authoritativeTransaction = true;
      function Host() {
        const [source, setSource] = useState(before);
        useEffect(() => { controls.ready = true; }, []);
        return <TextDataManagementPage snapshot={source.snapshot} metaRecords={source.metaRecords} initialSelection={selection} {...access} execute={execute}
          onReloadValidSource={async () => setSource(await persistence.loadState())} />;
      }
      const unmount = mount(<StrictMode><Host /></StrictMode>); await until(() => controls.ready && q('[data-dm-revision]'));
      await input(ids.firstSentenceId, 'Committed, then navigated'); q('[data-dm-segment-save="' + ids.firstSentenceId + '"]').click();
      await until(() => release); q('[data-dm-workspace="' + ids.paragraphId + '"]').click(); await frame(); release();
      await until(() => q('[data-dm-page-error="STALE_RESULT"]'));
      assert(q('[data-dm-reload-valid-source]'), 'Conflict has no reachable reload button in ready state');
      q('[data-dm-reload-valid-source]').click();
      await until(() => !q('[data-dm-page-error]'));
      q('[data-dm-workspace="' + ids.documentId + '"]').click(); await frame();
      assert(q('[aria-label="Sentence text ' + ids.firstSentenceId + '"]').value === 'Committed, then navigated', 'Reload lost committed content/draft'); unmount();
    });
    await run('AUD-10: Two independent realms serialize stale writers before UID allocation', async () => {
      const name = db('realms'), before = await init(name);
      const iframe = document.createElement('iframe'); iframe.src = location.origin + '/peer'; document.body.append(iframe);
      await new Promise(resolve => { iframe.onload = resolve; });
      try {
        const remote = await iframe.contentWindow.eval("import('/a2-cases.js')");
        assert(remote.executeAuditPeer, 'Independent realm exporter missing');
        const options = { dbName: name, selection, ...access, expectedSnapshotFingerprint: before.snapshotFingerprint, command };
        const results = await Promise.allSettled([write(options), remote.executeAuditPeer(options)]);
        assert(results.filter(r => r.status === 'fulfilled').length === 1, 'Both cross-realm writes committed');
        const failure = results.find(r => r.status === 'rejected');
        assert(failure.reason.code === 'STALE_RESULT', 'Expected cross-tab fingerprint conflict, got ' + failure.reason.code);
        assert((await read({ dbName: name })).snapshot.counters.text === before.snapshot.counters.text + 1, 'Duplicate allocation across realms');
      } finally { iframe.remove(); }
    });
    await run('AUD-11: Session preflight allocates no UID; native transaction allocates each persistent entity exactly once', async () => {
      const name = db('uids'), before = await init(name), persistent = adapter({ dbName: name, ...access });
      const original = crypto.randomUUID;
      let calls = 0;
      crypto.randomUUID = () => { calls++; return original.call(crypto); };
      const session = createTextDataManagementSession({ snapshot: before.snapshot, selection, ...access, execute: persistent.execute });
      try {
        const card = await session.dispatch(command);
        assert(card.ok && calls === 1, 'Conversation Card required one UID, observed ' + calls);
        const turn = await session.dispatch({ type: 'contentUnit.create', payload: { blockId: card.result.id, kind: 'turn' } });
        assert(turn.ok && calls === 2, 'Turn required one further UID, observed ' + calls);
        const stored = await read({ dbName: name });
        assert(stored.snapshotFingerprint === canonical(session.getSnapshot()), 'Session differs from committed records');
        assert(stored.snapshot.counters.contentUnit === before.snapshot.counters.contentUnit + 1, 'Unit counter advanced incorrectly');
      } finally { crypto.randomUUID = original; session.dispose(); }
    });
    await run('AUD-12: Asynchronous IndexedDB constraint failure rolls back every staged record and counter', async () => {
      const name = db('constraint'), before = await init(name);
      let failure;
      try {
        await write({ dbName: name, selection, ...access, command, expectedSnapshotFingerprint: before.snapshotFingerprint,
          onBeforeCommit: ({ tx }) => tx.objectStore('segments').add(before.snapshot.segments[0]) });
      } catch (error) { failure = error; }
      assert(failure, 'Constraint error did not reject the transaction');
      const after = await read({ dbName: name });
      assert(after.snapshotFingerprint === before.snapshotFingerprint && canonical(after.metaRecords) === canonical(before.metaRecords), 'Constraint failure partly committed');
    });
    await run('AUD-13: Host loading/reload state does not dispose the session or erase recovery drafts', async () => {
      const controls = {};
      function Host() {
        const [loading, setLoading] = useState(false);
        useEffect(() => { controls.loading = setLoading; }, []);
        return <TextDataManagementPage snapshot={rich.snapshot} initialSelection={selection} {...access} loading={loading} />;
      }
      const unmount = mount(<StrictMode><Host /></StrictMode>); await until(() => q('[data-dm-revision]'));
      await input(ids.firstSentenceId, 'Keep across reload');
      controls.loading(true); await until(() => q('[data-dm-loading]'));
      controls.loading(false); await until(() => q('[data-dm-revision]'));
      assert(q('[aria-label="Sentence text ' + ids.firstSentenceId + '"]').value === 'Keep across reload', 'Loading disposed recovery drafts');
      unmount();
    });
    await run('AUD-14: Disposal, source replacement and permission changes fence already committed receipts', async () => {
      for (const mode of ['dispose', 'replace', 'permissions']) {
        const name = db('pending_' + mode), before = await init(name), persistent = adapter({ dbName: name, ...access });
        let release, receipt;
        const execute = async (...args) => { receipt = await persistent.execute(...args); return new Promise(resolve => { release = () => resolve(receipt); }); };
        execute.authoritativeTransaction = true;
        const session = createTextDataManagementSession({ snapshot: before.snapshot, selection, ...access, execute });
        const pending = session.dispatch(command); await until(() => release);
        if (mode === 'dispose') session.dispose();
        if (mode === 'replace') session.replaceSource(before.snapshot);
        if (mode === 'permissions') session.configure({ permissions: [] });
        release(); const out = await pending;
        assert(!out.ok && out.error.committed && out.error.reloadRequired, mode + ' hid committed state');
        assert((await read({ dbName: name })).snapshotFingerprint === receipt.snapshotFingerprint, 'UI rejection rolled back an already committed database'); session.dispose();
      }
    });
    await run('AUD-15: Accepted receipt refreshes source registries from the same authoritative transaction', async () => {
      const name = db('sidecars'), before = await init(name), persistent = adapter({ dbName: name, ...access });
      const first = before.sourceAttachments[0], workspaceId = Object.values(first.idMap.documents)[0];
      const session = createTextDataManagementSession({ snapshot: before.snapshot, selection: { workspaceId }, ...access,
        sourceAttachments: before.sourceAttachments, externalImports: before.externalImports, execute: persistent.execute });
      const changed = before.sourceAttachments.map(a => ({ ...a, fileName: 'Authoritative current source.json' }));
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => { const handle = request.result, tx = handle.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: 'sourceAttachments', value: changed });
          tx.oncomplete = () => { handle.close(); resolve(); }; tx.onabort = () => { handle.close(); reject(tx.error); }; };
      });
      const result = await session.dispatch({ type: 'document.update', payload: { id: workspaceId, title: 'Metadata receipt refresh' } });
      assert(result.ok, 'Unrelated metadata change prevented valid command');
      assert(session.getState().view.workspace.sources.attachments[0].fileName === 'Authoritative current source.json', 'Inspector retained stale source registry after authoritative commit'); session.dispose();
    });
    await run('AUD-16: Generic authoritative coordinator requires zero-allocation precheck instead of staging a second command', async () => {
      let prepares = 0, executions = 0;
      const execute = () => { executions++; };
      execute.authoritativeTransaction = true;
      const coordinator = createTextSnapshotCommandCoordinator({
        getScope: () => ({ snapshot: rich.snapshot, documentId: ids.documentId, revision: 1 }),
        prepare: () => { prepares++; throw Error('Allocating staged command must not be invoked'); },
        execute, onCommit: () => {}
      });
      const result = await coordinator.dispatch(command);
      assert(!result.ok && result.error.code === 'INVALID_EXECUTOR' && prepares === 0 && executions === 0, 'Authoritative fallback invoked allocating prepare: ' + prepares);
    });
  } finally {
    disposers.forEach(fn => { try { fn(); } catch { /* already unmounted */ } });
    for (const name of names) await deleteDisposableTextLibraryDatabase({ dbName: name });
  }
  return { passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results,
    canonicalDbTouches: window.__p15A2CanonicalDbTouches || 0, hasCanonicalDb: (await indexedDB.databases()).some(d => d.name === 'prolingo_text_library'),
    remainingDisposableDbs: (await indexedDB.databases()).filter(d => names.includes(d.name)).length };
}
export const executeAuditPeer = options => write(options);
