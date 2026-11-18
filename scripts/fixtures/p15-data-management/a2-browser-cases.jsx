import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_STORES
} from '../../../src/constants/textDatabaseConstants.js';
import { createTextDataManagementSession } from '../../../src/services/textDataManagementSession.js';
import {
  createTextDataManagementPersistenceAdapter,
  executeDisposableTextManagementTransaction,
  exportDisposableTextManagementDatabaseBackup,
  readDisposableTextManagementDatabaseState,
  restoreDisposableTextManagementDatabaseBackup,
  seedDisposableTextManagementDatabase
} from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import { executeTextLibraryCommand } from '../../../src/services/persistence/textLibraryCommandService.js';
import { canonicalJsonStringify } from '../../../src/domain/text/textCanonicalFingerprintDomain.js';
import TextDataManagementPage from '../../../src/components/text/management/TextDataManagementPage.jsx';
import { createP15ExtendedQaFixtures } from './fixture.js';

const containerEl = document.getElementById('root');
const mountHarness = element => {
  const host = document.createElement('div');
  containerEl.replaceChildren(host);
  const r = createRoot(host);
  r.render(element);
  return () => r.unmount();
};
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async (predicate, label = 'Condition timed out') => {
  const end = performance.now() + 8000;
  while (performance.now() < end) {
    if (predicate()) return;
    await frame();
  }
  throw new Error(label);
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const q = (selector, scope = document) => scope.querySelector(selector);

const setInputValue = async (el, value) => {
  assert(el, 'Missing form element for setInputValue');
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
  assert(el && !el.disabled, `Missing or disabled element: ${el?.outerHTML?.slice(0, 120) || 'null'}`);
  el.click();
  await frame();
};

const expectRejects = async (promiseOrFn, codeOrRegex, label) => {
  let caught = null;
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    caught = error;
  }
  assert(caught, `Expected failure for: ${label}`);
  if (typeof codeOrRegex === 'string') {
    assert(caught.code === codeOrRegex, `${label}: expected code ${codeOrRegex}, got ${caught.code || caught.message}`);
  } else if (codeOrRegex instanceof RegExp) {
    assert(codeOrRegex.test(caught.message || ''), `${label}: unexpected message "${caught.message}"`);
  }
  return caught;
};

const rawDeleteMetaKey = (dbName, keyToDelete) => new Promise((resolve, reject) => {
  const req = indexedDB.open(dbName);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readwrite');
    tx.objectStore(TEXT_LIBRARY_STORES.META).delete(keyToDelete);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Aborted')); };
  };
  req.onerror = () => reject(req.error);
});

const rawPutMetaRecord = (dbName, record) => new Promise((resolve, reject) => {
  const req = indexedDB.open(dbName);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(TEXT_LIBRARY_STORES.META, 'readwrite');
    tx.objectStore(TEXT_LIBRARY_STORES.META).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Aborted')); };
  };
  req.onerror = () => reject(req.error);
});

export async function runP15A2BrowserCases() {
  const results = [];
  const createdDbs = [];
  const trackDb = name => { createdDbs.push(name); return name; };
  const run = async (name, fn) => {
    await fn();
    results.push({ name, status: 'PASS' });
  };

  const fixtures = createP15ExtendedQaFixtures();
  const extPreset = fixtures.presets['v2-external-sources'];
  const v1Preset = fixtures.presets['v1-paragraph'];
  const { ids } = fixtures.base;

  // Add fullAudioArtifactsV1 + legacyMigration + custom unknown meta records to rich v2 fixture
  const seedSnapshot = structuredClone(extPreset.snapshot);
  const firstScene = seedSnapshot.blocks.find(b => b.id === ids.sceneId);
  firstScene.metadata = {
    ...(firstScene.metadata || {}),
    fullAudioArtifactsV1: { version: 1, status: 'metadata-only', hash: 'sha-scene-1' }
  };
  const extraMetas = [
    { key: 'legacyMigration', value: { completed: true, sourceCount: 1 }, updatedAt: 15050 },
    { key: 'customSidecarMeta', value: { note: 'unknown-record-must-survive', tags: ['a', 'b'] }, updatedAt: 15051 }
  ];

  const dbMain = trackDb('prolingo_text_library_d3b_qa_p15_a2_main');
  const dbConcurrent = trackDb('prolingo_text_library_d3b_qa_p15_a2_conc');
  const dbV1 = trackDb('prolingo_text_library_d3b_qa_p15_a2_v1');
  const dbCorrupt = trackDb('prolingo_text_library_d3b_qa_p15_a2_corrupt');
  const dbRestore = trackDb('prolingo_text_library_d3b_qa_p15_a2_restore');
  const dbDirectUi = trackDb('prolingo_text_library_d3b_qa_p15_a2_ui');

  try {
    await run('A2-T1: Seed disposable v2 DB, single consistent read, authoritative single-allocation commands & metadata preservation', async () => {
      await seedDisposableTextManagementDatabase({
        dbName: dbMain,
        snapshot: seedSnapshot,
        sourceAttachments: extPreset.sourceAttachments,
        externalImports: extPreset.externalImports,
        extraMetaRecords: extraMetas,
        now: 15100
      });

      const initialState = await readDisposableTextManagementDatabaseState({ dbName: dbMain });
      assert(initialState.schemaVersion === 2, 'Expected schemaVersion 2');
      assert(initialState.sourceAttachments.length === extPreset.sourceAttachments.length, 'Expected sourceAttachments preserved');
      assert(initialState.externalImports.length === extPreset.externalImports.length, 'Expected externalImports preserved');
      assert(initialState.extraMetaRecords.some(r => r.key === 'legacyMigration'), 'Expected legacyMigration meta');
      assert(initialState.extraMetaRecords.some(r => r.key === 'customSidecarMeta'), 'Expected unknown customSidecarMeta');

      // Direct executeTextLibraryCommand binding must fail loudly
      let execErr = null;
      try {
        createTextDataManagementSession({
          snapshot: initialState.snapshot,
          boundary: 'disposable',
          permissions: ['catalog', 'content'],
          execute: executeTextLibraryCommand
        });
      } catch (e) { execErr = e; }
      assert(execErr?.code === 'INVALID_EXECUTOR', 'Direct executeTextLibraryCommand must reject with INVALID_EXECUTOR');

      const adapter = createTextDataManagementPersistenceAdapter({
        dbName: dbMain,
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        now: () => 15200
      });
      assert(adapter.canonicalWritesEnabled === false, 'Canonical writes disabled by default');

      const session = createTextDataManagementSession({
        snapshot: initialState.snapshot,
        selection: { workspaceId: ids.documentId },
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        sourceAttachments: initialState.sourceAttachments,
        externalImports: initialState.externalImports,
        metaRecords: initialState.metaRecords,
        execute: adapter.execute
      });
      session.setDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }, 'Unrelated UI draft');

      // Create Conversation Card -> then create a Turn Unit inside ONE DB transaction each
      const createCardRes = await session.dispatch({
        type: 'block.create',
        payload: { documentId: ids.documentId, blockType: 'conversation', title: 'Transactional Turn Scene' }
      });
      assert(createCardRes.ok, `block.create failed: ${createCardRes.error?.message}`);
      const newCardId = createCardRes.result.id;

      const createUnitRes = await session.dispatch({
        type: 'contentUnit.create',
        payload: { blockId: newCardId, kind: 'turn', speaker: 'Moderator' }
      });
      assert(createUnitRes.ok, `contentUnit.create failed: ${createUnitRes.error?.message}`);
      const newUnitId = createUnitRes.result.id;

      // Read DB state directly via fresh readonly tx & verify byte-for-byte identity / single allocation
      const afterCreateState = await adapter.loadState();
      const sessionCard = session.getSnapshot().blocks.find(b => b.id === newCardId);
      const dbCard = afterCreateState.snapshot.blocks.find(b => b.id === newCardId);
      const sessionUnit = session.getSnapshot().contentUnits.find(u => u.id === newUnitId);
      const dbUnit = afterCreateState.snapshot.contentUnits.find(u => u.id === newUnitId);
      assert(sessionCard?.uid && sessionCard.uid === dbCard?.uid, 'Card UID allocated once and matches DB');
      assert(sessionUnit?.uid && sessionUnit.uid === dbUnit?.uid, 'Unit UID allocated once and matches DB');
      assert(canonicalJsonStringify(session.getSnapshot()) === afterCreateState.snapshotFingerprint, 'Session matches DB snapshot');

      // Add Sentence to Unit, then delete it leaving empty Unit intentionally
      const addSegRes = await session.dispatch({
        type: 'segment.create',
        payload: { blockId: newCardId, unitId: newUnitId, text: 'Authoritative sentence.', meaning: 'Kalimat resmi.' }
      });
      assert(addSegRes.ok, 'segment.create succeeded');
      const segId = addSegRes.result.id;
      assert(addSegRes.snapshot.segments.find(s => s.id === segId)?.uid?.startsWith('SEGUID_'), 'Segment UID assigned');

      const delSegRes = await session.dispatch({
        type: 'segment.delete',
        payload: { id: segId }
      });
      assert(delSegRes.ok, 'segment.delete succeeded');

      const finalState = await readDisposableTextManagementDatabaseState({ dbName: dbMain });
      assert(finalState.snapshot.contentUnits.some(u => u.id === newUnitId), 'Empty Content Unit preserved');
      assert(!finalState.snapshot.segments.some(s => s.id === segId), 'Deleted segment removed');
      assert(finalState.snapshot.audioVariants.length === seedSnapshot.audioVariants.length, 'AudioVariants preserved');
      const restoredScene = finalState.snapshot.blocks.find(b => b.id === ids.sceneId);
      assert(restoredScene.metadata.fullAudioArtifactsV1?.hash === 'sha-scene-1', 'Full audio artifact metadata preserved');
      assert(finalState.sourceAttachments.length === extPreset.sourceAttachments.length, 'Source attachments preserved');
      assert(finalState.externalImports.length === extPreset.externalImports.length, 'External imports preserved');
      assert(finalState.extraMetaRecords.some(r => r.key === 'legacyMigration' && r.value.completed), 'legacyMigration preserved');
      assert(finalState.extraMetaRecords.some(r => r.key === 'customSidecarMeta' && r.value.note === 'unknown-record-must-survive'), 'Unknown meta preserved');
      assert(session.getDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }) === 'Unrelated UI draft', 'Draft preserved');
      session.dispose();
    });

    await run('A2-T2: Stale concurrent DB writer rejection, BUSY lock, and mid-transaction abort rollback', async () => {
      await seedDisposableTextManagementDatabase({
        dbName: dbConcurrent,
        snapshot: seedSnapshot,
        sourceAttachments: extPreset.sourceAttachments,
        externalImports: extPreset.externalImports,
        extraMetaRecords: extraMetas,
        now: 16000
      });
      const baseline = await readDisposableTextManagementDatabaseState({ dbName: dbConcurrent });

      // 1. Mid-transaction abort rollback (no partial writes or counter advancement!)
      await expectRejects(
        () => executeDisposableTextManagementTransaction({
          dbName: dbConcurrent,
          selection: { workspaceId: ids.documentId },
          boundary: 'disposable',
          permissions: ['content'],
          expectedSnapshotFingerprint: baseline.snapshotFingerprint,
          command: { type: 'block.create', payload: { documentId: ids.documentId, blockType: 'paragraph', title: 'Should Rollback' } },
          now: 16010,
          onBeforeCommit: ({ tx }) => { tx.abort(); }
        }),
        /abort|transaction/i,
        'Mid-transaction abort'
      );
      const afterAbort = await readDisposableTextManagementDatabaseState({ dbName: dbConcurrent });
      assert(afterAbort.snapshotFingerprint === baseline.snapshotFingerprint, 'Mid-transaction abort left DB unchanged');

      // 2. Throw before commit also rolls back cleanly
      await expectRejects(
        () => executeDisposableTextManagementTransaction({
          dbName: dbConcurrent,
          selection: { workspaceId: ids.documentId },
          boundary: 'disposable',
          permissions: ['content'],
          expectedSnapshotFingerprint: baseline.snapshotFingerprint,
          command: { type: 'block.create', payload: { documentId: ids.documentId, blockType: 'paragraph', title: 'Should Rollback 2' } },
          now: 16011,
          onBeforeCommit: () => { throw new Error('Simulated crash before commit'); }
        }),
        /Simulated crash/i,
        'Pre-commit throw rollback'
      );
      const afterThrow = await readDisposableTextManagementDatabaseState({ dbName: dbConcurrent });
      assert(afterThrow.snapshotFingerprint === baseline.snapshotFingerprint, 'Pre-commit error rolled back cleanly');

      // 3. Stale concurrent edit rejection
      const adapter = createTextDataManagementPersistenceAdapter({
        dbName: dbConcurrent,
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        now: () => 16020
      });
      const session = createTextDataManagementSession({
        snapshot: baseline.snapshot,
        selection: { workspaceId: ids.documentId },
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        execute: adapter.execute
      });
      session.setDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }, 'Stale session draft');

      // External concurrent writer commits first!
      const extCommit = await executeDisposableTextManagementTransaction({
        dbName: dbConcurrent,
        selection: { workspaceId: ids.documentId },
        boundary: 'disposable',
        permissions: ['content'],
        expectedSnapshotFingerprint: baseline.snapshotFingerprint,
        command: { type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Winner Writer.' } },
        now: 16030
      });
      assert(extCommit.ok, 'External concurrent commit succeeded');

      // Now stale session attempts to write -> rejected BEFORE DB write/allocation
      const staleRes = await session.dispatch({
        type: 'block.create',
        payload: { documentId: ids.documentId, blockType: 'paragraph', title: 'Stale Loser' }
      });
      assert(!staleRes.ok && staleRes.error.code === 'STALE_RESULT', `Expected STALE_RESULT, got ${JSON.stringify(staleRes.error)}`);

      const afterConcurrent = await readDisposableTextManagementDatabaseState({ dbName: dbConcurrent });
      assert(afterConcurrent.snapshotFingerprint === extCommit.snapshotFingerprint, 'Winner DB state untouched');
      assert(afterConcurrent.snapshot.counters.text === baseline.snapshot.counters.text, 'Counters not incremented on stale reject');
      assert(session.getDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }) === 'Stale session draft', 'Draft survives stale rejection');

      // 4. Overlapping in-process write rejection (BUSY)
      const p1 = executeDisposableTextManagementTransaction({
        dbName: dbConcurrent,
        selection: { workspaceId: ids.documentId },
        boundary: 'disposable',
        permissions: ['content'],
        expectedSnapshotFingerprint: afterConcurrent.snapshotFingerprint,
        command: { type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Lock First.' } },
        now: 16040
      });
      const p2 = expectRejects(
        () => executeDisposableTextManagementTransaction({
          dbName: dbConcurrent,
          selection: { workspaceId: ids.documentId },
          boundary: 'disposable',
          permissions: ['content'],
          expectedSnapshotFingerprint: afterConcurrent.snapshotFingerprint,
          command: { type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Lock Second.' } },
          now: 16041
        }),
        'BUSY',
        'Concurrent overlapping transaction'
      );
      const [r1] = await Promise.all([p1, p2]);
      assert(r1.ok, 'First transaction succeeded while overlapping second was BUSY');
      session.dispose();
    });

    await run('A2-T3: v1 safe boundary preservation and partial-upgrade fail-closed check', async () => {
      await seedDisposableTextManagementDatabase({
        dbName: dbV1,
        snapshot: v1Preset.snapshot,
        version: 1,
        extraMetaRecords: [{ key: 'legacyMigration', value: { v1Only: true }, updatedAt: 16500 }],
        now: 16500
      });
      const v1State = await readDisposableTextManagementDatabaseState({ dbName: dbV1 });
      assert(v1State.dbVersion === 1 && v1State.schemaVersion === 1, 'v1 DB stayed v1');
      assert(v1State.snapshot.contentUnits === undefined, 'v1 snapshot has no contentUnits');

      const v1Seg = v1State.snapshot.segments[0];
      const v1Adapter = createTextDataManagementPersistenceAdapter({
        dbName: dbV1,
        boundary: 'disposable',
        permissions: ['content'],
        now: () => 16510
      });
      const v1Session = createTextDataManagementSession({
        snapshot: v1State.snapshot,
        selection: { workspaceId: v1State.snapshot.documents[0].id },
        boundary: 'disposable',
        permissions: ['content'],
        execute: v1Adapter.execute
      });
      const safeV1Edit = await v1Session.dispatch({
        type: 'segment.update',
        payload: { id: v1Seg.id, text: 'Safe v1 persistent edit.' }
      });
      assert(safeV1Edit.ok, 'Safe v1 edit succeeded');
      const v1After = await readDisposableTextManagementDatabaseState({ dbName: dbV1 });
      assert(v1After.dbVersion === 1 && v1After.snapshot.contentUnits === undefined, 'v1 DB did not silently upgrade to v2');
      assert(v1After.extraMetaRecords.some(r => r.key === 'legacyMigration' && r.value.v1Only), 'v1 extra metadata preserved');
      v1Session.dispose();

      // Corrupt v2 DB by deleting contentUnitMigration -> MIGRATION_REQUIRED (no auto repair)
      await seedDisposableTextManagementDatabase({
        dbName: dbCorrupt,
        snapshot: seedSnapshot,
        now: 16600
      });
      await rawDeleteMetaKey(dbCorrupt, 'contentUnitMigration');
      await expectRejects(() => readDisposableTextManagementDatabaseState({ dbName: dbCorrupt }), 'MIGRATION_REQUIRED', 'Missing contentUnitMigration');
      await expectRejects(() => exportDisposableTextManagementDatabaseBackup({ dbName: dbCorrupt }), 'MIGRATION_REQUIRED', 'Backup rejects partial upgrade');
    });

    await run('A2-B: Single readonly backup integrity, missing/mismatched metadata rejection, and atomic replace-restore', async () => {
      const stateBefore = await readDisposableTextManagementDatabaseState({ dbName: dbMain });
      const exportedBackup = await exportDisposableTextManagementDatabaseBackup({ dbName: dbMain, now: 17000 });
      assert(exportedBackup.audioBinaryIncluded === false, 'No physical audio binaries in DB backup');
      assert(exportedBackup.metaRecords.some(r => r.key === 'customSidecarMeta'), 'Backup includes unknown metadata');
      assert(exportedBackup.metaRecords.some(r => r.key === 'sourceAttachments'), 'Backup includes sourceAttachments');
      assert(exportedBackup.metaRecords.some(r => r.key === 'externalSourceImports'), 'Backup includes externalSourceImports');
      assert(exportedBackup.metaRecords.some(r => r.key === 'legacyMigration'), 'Backup includes legacyMigration');

      // Seed destination DB with stale records AND stale metadata keys
      await seedDisposableTextManagementDatabase({
        dbName: dbRestore,
        snapshot: seedSnapshot,
        extraMetaRecords: [{ key: 'staleDestinationMeta', value: { stale: true }, updatedAt: 16900 }],
        now: 16900
      });

      // Mid-restore abort must keep destination untouched
      const destBefore = await readDisposableTextManagementDatabaseState({ dbName: dbRestore });
      await expectRejects(
        () => restoreDisposableTextManagementDatabaseBackup({
          dbName: dbRestore,
          backup: exportedBackup,
          now: 17010,
          onBeforeCommit: ({ tx }) => { tx.abort(); }
        }),
        /abort|transaction/i,
        'Mid-restore abort rollback'
      );
      const destAfterAbort = await readDisposableTextManagementDatabaseState({ dbName: dbRestore });
      assert(destAfterAbort.snapshotFingerprint === destBefore.snapshotFingerprint, 'Restore abort preserved destination');
      assert(destAfterAbort.extraMetaRecords.some(r => r.key === 'staleDestinationMeta'), 'Stale destination meta preserved on abort');

      // Malformed restore rejected cleanly
      const invalidBackup = structuredClone(exportedBackup);
      invalidBackup.audioBinaryIncluded = true;
      await expectRejects(
        () => restoreDisposableTextManagementDatabaseBackup({ dbName: dbRestore, backup: invalidBackup }),
        'INVALID_TRANSFER',
        'Audio binary embedded backup rejected'
      );

      const missingCountersBackup = structuredClone(exportedBackup);
      missingCountersBackup.metaRecords = missingCountersBackup.metaRecords.filter(r => r.key !== 'idCounters');
      await expectRejects(
        () => restoreDisposableTextManagementDatabaseBackup({ dbName: dbRestore, backup: missingCountersBackup }),
        'METADATA_REQUIRED',
        'Missing idCounters in backup rejected'
      );

      // True atomic replace-policy restore purges stale meta & restores exact snapshot + unknown metadata
      await restoreDisposableTextManagementDatabaseBackup({ dbName: dbRestore, backup: exportedBackup, now: 17020 });
      const restoredState = await readDisposableTextManagementDatabaseState({ dbName: dbRestore });
      assert(!restoredState.extraMetaRecords.some(r => r.key === 'staleDestinationMeta'), 'Stale destination meta purged');
      assert(restoredState.extraMetaRecords.some(r => r.key === 'customSidecarMeta' && r.value.note === 'unknown-record-must-survive'), 'Unknown meta restored');
      assert(restoredState.snapshotFingerprint === stateBefore.snapshotFingerprint, 'Lossless snapshot roundtrip');

      // Missing core metadata in DB fails closed (never synthesized)
      await rawDeleteMetaKey(dbRestore, 'idCounters');
      await expectRejects(() => readDisposableTextManagementDatabaseState({ dbName: dbRestore }), 'METADATA_REQUIRED', 'Missing idCounters in DB');
      await expectRejects(() => exportDisposableTextManagementDatabaseBackup({ dbName: dbRestore }), 'METADATA_REQUIRED', 'Backup blocks missing idCounters');

      // Mismatched core metadata in DB fails closed
      await restoreDisposableTextManagementDatabaseBackup({ dbName: dbRestore, backup: exportedBackup, now: 17030 });
      await rawPutMetaRecord(dbRestore, { key: 'idCounters', value: { ...stateBefore.snapshot.counters, collection: 0 }, updatedAt: 17040 });
      await expectRejects(() => readDisposableTextManagementDatabaseState({ dbName: dbRestore }), 'METADATA_MISMATCH', 'Stale collection counter mismatch rejected');
      await rawPutMetaRecord(dbRestore, { key: 'idCounters', value: { ...stateBefore.snapshot.counters, contentUnit: 0 }, updatedAt: 17041 });
      await expectRejects(() => readDisposableTextManagementDatabaseState({ dbName: dbRestore }), 'INVALID_SNAPSHOT', 'Lowered contentUnit counter rejected');
    });

    await run('A2-S: Direct-host TextDataManagementPage without externalSession keeps rev=1 across mount/rerenders, persists DB commands, preserves drafts, and fences stale async responses', async () => {
      await seedDisposableTextManagementDatabase({
        dbName: dbDirectUi,
        snapshot: seedSnapshot,
        sourceAttachments: extPreset.sourceAttachments,
        externalImports: extPreset.externalImports,
        extraMetaRecords: extraMetas,
        now: 18000
      });
      const dbUiInitial = await readDisposableTextManagementDatabaseState({ dbName: dbDirectUi });
      const uiAdapter = createTextDataManagementPersistenceAdapter({
        dbName: dbDirectUi,
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        now: () => 18100
      });

      const hostControls = {};
      function DirectHostHarness() {
        const [parentTick, setParentTick] = useState(0);
        const [propSnapshot, setPropSnapshot] = useState(dbUiInitial.snapshot);
        const [customExecute, setCustomExecute] = useState(null);
        const [boundaryMode, setBoundaryMode] = useState('disposable');
        useEffect(() => {
          hostControls.rerender = () => setParentTick(n => n + 1);
          hostControls.replacePropSnapshot = nextSnap => setPropSnapshot(nextSnap);
          hostControls.setCustomExecute = fn => setCustomExecute(() => fn);
          hostControls.setBoundary = b => setBoundaryMode(b);
        }, []);

        // Intentionally omit initialSelection, sourceAttachments, externalImports, extraMetaRecords in default tick 0..2
        // until explicitly testing replacement, and NEVER pass an external `session` prop!
        return (
          <div data-direct-host-tick={parentTick}>
            <TextDataManagementPage
              snapshot={propSnapshot}
              initialSelection={parentTick === -1 ? {} : { workspaceId: ids.documentId }}
              boundary={boundaryMode}
              permissions={['catalog', 'content']}
              persistenceAdapter={customExecute ? null : uiAdapter}
              execute={customExecute}
              metaRecords={dbUiInitial.metaRecords}
            />
          </div>
        );
      }

      // Mount inside StrictMode to catch double-effect lifecycle regressions too!
      const unmountS1 = mountHarness(<StrictMode><DirectHostHarness /></StrictMode>);
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-revision]'), 'Direct host page did not mount');
      assert(q('[data-dm-revision]').dataset.dmRevision === '1', `Expected initial direct-host revision "1", got "${q('[data-dm-revision]').dataset.dmRevision}"`);
      assert(q(`[data-dm-segment-id="${ids.firstSentenceId}"]`), 'Expected initialSelection workspace rendered');

      // Force multiple parent rerenders -> revision MUST remain 1!
      hostControls.rerender();
      await frame();
      hostControls.rerender();
      await until(() => q('[data-direct-host-tick="2"]'));
      assert(q('[data-dm-revision]').dataset.dmRevision === '1', `Parent rerenders must not bump revision: got "${q('[data-dm-revision]').dataset.dmRevision}"`);

      // Set an unrelated draft on second sentence AND save an acknowledged edit on first sentence -> persists to real DB
      const secondSentence = dbUiInitial.snapshot.segments.find(s => s.documentId === ids.documentId && s.id !== ids.firstSentenceId);
      assert(secondSentence, 'Expected second sentence in mixed workspace');
      await setInputValue(q(`[aria-label="Sentence text ${secondSentence.id}"]`), 'Keep Unrelated Direct-Host Draft.');
      assert(q('[data-dm-draft-count]').dataset.dmDraftCount === '1', 'Draft count updated to 1');

      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'Direct-Host Committed DB Edit.');
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-revision]').dataset.dmRevision === '2', 'Direct-host acknowledged DB commit advances revision to 2');

      const dbUiAfterEdit = await readDisposableTextManagementDatabaseState({ dbName: dbDirectUi });
      assert(
        dbUiAfterEdit.snapshot.segments.find(s => s.id === ids.firstSentenceId)?.text === 'Direct-Host Committed DB Edit.',
        'Direct-host edit persisted to IndexedDB'
      );

      // Re-render parent AGAIN with the original propSnapshot reference -> committed edit and draft MUST survive!
      hostControls.rerender();
      await until(() => q('[data-direct-host-tick="3"]'));
      await frame();
      assert(q('[data-dm-revision]').dataset.dmRevision === '2', 'Parent rerender must NOT call replaceSource or overwrite committed edit');
      assert(q(`[aria-label="Sentence text ${secondSentence.id}"]`).value === 'Keep Unrelated Direct-Host Draft.', 'Unrelated draft survived commit + rerender');
      assert(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'Direct-Host Committed DB Edit.', 'Committed DB edit survived parent rerender');

      // Genuine propSnapshot replacement updates the UI once
      const updatedFromOutside = structuredClone(dbUiAfterEdit.snapshot);
      updatedFromOutside.segments.find(s => s.id === ids.firstSentenceId).text = 'External Prop Reload.';
      hostControls.replacePropSnapshot(updatedFromOutside);
      await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`)?.value === 'External Prop Reload.');

      // Deferred stale async executor in direct-host UI -> navigate away while pending -> STALE_RESULT
      let releaseDeferred = null;
      const deferredExecute = (cmd, { preparedOutcome }) => new Promise(resolve => {
        releaseDeferred = () => resolve(preparedOutcome);
      });
      // Executor and permission changes reconfigure the same session. Previously this
      // test forced destructive session recreation and expected revision to reset to 1.
      const revisionBeforeConfigure = Number(q('[data-dm-revision]').dataset.dmRevision);
      hostControls.setCustomExecute(deferredExecute);
      hostControls.setBoundary('read-only');
      await until(() => q('[data-dm-mode-badge="read-only"]'));
      assert(q(`[aria-label="Sentence text ${secondSentence.id}"]`).value === 'Keep Unrelated Direct-Host Draft.', 'Boundary change must preserve unrelated draft');
      hostControls.setBoundary('disposable');
      await until(() => q('[data-dm-mode-badge="disposable"]') && Number(q('[data-dm-revision]').dataset.dmRevision) > revisionBeforeConfigure);
      assert(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'External Prop Reload.', 'Configuration change must preserve current source');

      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'Deferred Direct-Host Draft.');
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-pending-status="pending"]'));

      // Navigate to Paragraph workspace while pending
      await clickEl(q(`[data-dm-workspace="${ids.paragraphId}"]`));
      await until(() => q(`[data-dm-workspace-inspector="${ids.paragraphId}"]`));
      releaseDeferred();
      await until(() => q('[data-dm-page-error="STALE_RESULT"]'), 'Expected STALE_RESULT when deferred response arrives after navigation');
      assert(q(`[data-dm-workspace-inspector="${ids.paragraphId}"]`), 'Newer workspace selection preserved');

      unmountS1();
    });

    // Verify default omitted props mount cleanly without throwing or incrementing revision
    await run('A2-S2: Direct-host TextDataManagementPage with all optional props omitted keeps revision="1"', async () => {
      const hostApi = {};
      function MinimalHost() {
        const [tick, setTick] = useState(0);
        useEffect(() => {
          hostApi.rerender = () => setTick(n => n + 1);
        }, []);
        return (
          <div data-minimal-tick={tick}>
            <TextDataManagementPage snapshot={seedSnapshot} />
          </div>
        );
      }
      const unmountS2 = mountHarness(<StrictMode><MinimalHost /></StrictMode>);
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-revision]'));
      assert(q('[data-dm-revision]').dataset.dmRevision === '1', 'Expected revision "1" with omitted optional props');
      assert(q('[data-dm-mode-badge="read-only"]'), 'Default boundary is read-only');
      hostApi.rerender();
      await until(() => q('[data-minimal-tick="1"]'));
      hostApi.rerender();
      await until(() => q('[data-minimal-tick="2"]'));
      assert(q('[data-dm-revision]').dataset.dmRevision === '1', 'Revision stays "1" after omitted-prop rerenders');
      unmountS2();
    });
  } finally {
    for (const dbName of createdDbs) {
      await deleteDisposableTextLibraryDatabase({ dbName }).catch(() => {});
    }
  }

  const remainingDbs = typeof indexedDB?.databases === 'function' ? await indexedDB.databases() : [];
  const hasCanonicalDb = remainingDbs.some(d => d?.name === TEXT_LIBRARY_DB_NAME);

  return {
    passed: results.length,
    failed: 0,
    results,
    canonicalDbTouches: window.__p15A2CanonicalDbTouches || 0,
    hasCanonicalDb,
    remainingDisposableDbs: remainingDbs.filter(d => d?.name?.startsWith('prolingo_text_library_d3b_qa_')).length
  };
}
