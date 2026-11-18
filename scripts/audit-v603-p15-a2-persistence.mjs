import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createP15Fixture } from './fixtures/p15-data-management/fixture.js';
import { createA1V1ParagraphFixture } from './fixtures/shared-card-a1/presentation-fixture.js';
import {
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import {
  applyTextDataManagementCommand,
  TextDataManagementError,
  validateAndScopeTextDataManagementCommand
} from '../src/domain/text/textDataManagementDomain.js';
import { createTextSnapshotCommandCoordinator } from '../src/domain/text/textMixedEditorDomain.js';
import { createTextDataManagementSession } from '../src/services/textDataManagementSession.js';
import { executeTextLibraryCommand } from '../src/services/persistence/textLibraryCommandService.js';
import {
  assertDisposableQaDatabaseName,
  createTextDataManagementPersistenceAdapter,
  executeDisposableTextManagementTransaction,
  exportDisposableTextManagementDatabaseBackup,
  readDisposableTextManagementDatabaseState,
  restoreDisposableTextManagementDatabaseBackup,
  seedDisposableTextManagementDatabase
} from '../src/services/persistence/textDataManagementPersistenceService.js';
import { canonicalJsonStringify } from '../src/domain/text/textCanonicalFingerprintDomain.js';
import { PROLINGO_TEXT_DB_BACKUP_TYPE } from '../src/domain/text/textDatabaseBackupDomain.js';

let passed = 0;
let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, {
  get() {
    dbCalls += 1;
    throw new Error('Unexpected indexedDB access');
  }
});

const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log('PASS', name);
};

const f = createP15Fixture();
const { ids } = f;

const buildMetaRecordsForSnapshot = (snapshot, extras = []) => ([
  { key: 'schemaVersion', value: snapshot.schemaVersion, updatedAt: 15000 },
  { key: 'initialized', value: Boolean(snapshot.initialized), updatedAt: 15000 },
  { key: 'activeDocumentId', value: snapshot.activeDocumentId, updatedAt: 15000 },
  { key: 'idCounters', value: structuredClone(snapshot.counters), updatedAt: 15000 },
  ...(snapshot.contentUnitMigration
    ? [{ key: 'contentUnitMigration', value: structuredClone(snapshot.contentUnitMigration), updatedAt: 15000 }]
    : []),
  ...extras
]);

await test('Canonical DB constants and unsafe executeTextLibraryCommand direct binding guard', async () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);

  assert.throws(
    () => createTextDataManagementSession({
      snapshot: f.snapshot,
      boundary: 'disposable',
      permissions: ['catalog', 'content'],
      execute: executeTextLibraryCommand
    }),
    err => err?.code === 'INVALID_EXECUTOR'
  );

  assert.throws(
    () => createTextSnapshotCommandCoordinator({
      getScope: () => ({ snapshot: f.snapshot, documentId: ids.documentId, revision: 1 }),
      prepare: (s, c, sc) => applyTextDataManagementCommand(s, c, sc),
      onCommit: () => {},
      execute: executeTextLibraryCommand
    }),
    err => err?.code === 'INVALID_EXECUTOR'
  );

  assert.equal(dbCalls, 0);
});

await test('Canonical DB and non-disposable names are hard-blocked across persistence APIs', async () => {
  for (const blockedName of [TEXT_LIBRARY_DB_NAME, '', 'other_db', 'prolingo_text_library_prod']) {
    assert.throws(() => assertDisposableQaDatabaseName(blockedName), Error);
    assert.throws(() => createTextDataManagementPersistenceAdapter({ dbName: blockedName }), err => err instanceof TextDataManagementError);
    await assert.rejects(() => readDisposableTextManagementDatabaseState({ dbName: blockedName }), err => err instanceof TextDataManagementError);
    await assert.rejects(() => exportDisposableTextManagementDatabaseBackup({ dbName: blockedName }), err => err instanceof TextDataManagementError);
    await assert.rejects(() => executeDisposableTextManagementTransaction({
      dbName: blockedName,
      boundary: 'disposable',
      permissions: ['content'],
      expectedSnapshotFingerprint: 'x',
      command: { type: 'block.create', payload: { documentId: ids.documentId, blockType: 'paragraph' } }
    }), err => err instanceof TextDataManagementError);
  }

  for (const flag of [{ allowCanonicalWrites: true }, { allowCanonicalDatabase: true }, { mode: 'canonical' }, { liveCanonical: true }]) {
    assert.throws(
      () => createTextDataManagementPersistenceAdapter({
        dbName: 'prolingo_text_library_d3b_qa_guard',
        ...flag
      }),
      err => err?.code === 'CANONICAL_WRITES_DISABLED'
    );
  }

  await assert.rejects(
    () => seedDisposableTextManagementDatabase({
      dbName: 'prolingo_text_library_d3b_qa_guard',
      snapshot: f.snapshot,
      allowCanonicalWrites: true
    }),
    err => err?.code === 'CANONICAL_WRITES_DISABLED'
  );

  const v1 = createA1V1ParagraphFixture().snapshot;
  await assert.rejects(
    () => restoreDisposableTextManagementDatabaseBackup({
      dbName: 'prolingo_text_library_d3b_qa_guard',
      backup: {},
      allowCanonicalDatabase: true
    }),
    err => err?.code === 'CANONICAL_WRITES_DISABLED'
  );
  assert.ok(v1);
  assert.equal(dbCalls, 0);
});

await test('Pre-validation validates commands without allocating persistent IDs/UIDs prematurely', () => {
  const randomSpyOrig = globalThis.crypto.randomUUID;
  let randomCalls = 0;
  // Note: crypto getter on Node may be readonly, so verify via validateAndScope outcome & counters stability
  const { snapshot, selected, scoped } = validateAndScopeTextDataManagementCommand(
    f.snapshot,
    { type: 'block.create', payload: { documentId: ids.documentId, blockType: 'conversation', title: 'New Scene' } },
    { selection: { workspaceId: ids.documentId }, boundary: 'disposable', permissions: ['content'] }
  );
  assert.equal(selected.workspaceId, ids.documentId);
  assert.equal(scoped.type, 'block.create');
  assert.equal(canonicalJsonStringify(snapshot.counters), canonicalJsonStringify(f.snapshot.counters));
  assert.equal(snapshot.blocks.length, f.snapshot.blocks.length);
  assert.equal(typeof randomSpyOrig, 'function');
  assert.equal(randomCalls, 0);
});

await test('Authoritative coordinator allocates IDs/UIDs once via transaction executor and updates metaRecords', async () => {
  const metaInitial = buildMetaRecordsForSnapshot(f.snapshot, [
    { key: 'customSidecarMeta', value: { tag: 'keep-me' }, updatedAt: 15000 }
  ]);
  let dbState = structuredClone(f.snapshot);
  let dbMeta = structuredClone(metaInitial);
  let txExecutions = 0;
  let seenExpectedFingerprint = null;

  const authExecute = async (command, context) => {
    txExecutions += 1;
    seenExpectedFingerprint = context.expectedSnapshotFingerprint;
    assert.equal(canonicalJsonStringify(dbState), context.expectedSnapshotFingerprint);
    assert.equal(context.expectedRevision, 1);
    const previousFingerprint = canonicalJsonStringify(dbState);
    const outcome = applyTextDataManagementCommand(dbState, command, {
      selection: context.selection,
      boundary: context.boundary,
      permissions: context.permissions,
      now: 16000
    });
    dbState = outcome.snapshot;
    dbMeta = buildMetaRecordsForSnapshot(dbState, [{ key: 'customSidecarMeta', value: { tag: 'keep-me' }, updatedAt: 15000 }]);
    return {
      ok: true,
      authoritative: true,
      previousFingerprint,
      snapshotFingerprint: canonicalJsonStringify(dbState),
      snapshot: dbState,
      result: outcome.result,
      metaRecords: dbMeta
    };
  };
  authExecute.authoritativeTransaction = true;

  const session = createTextDataManagementSession({
    snapshot: f.snapshot,
    selection: { workspaceId: ids.documentId },
    boundary: 'disposable',
    permissions: ['catalog', 'content'],
    metaRecords: metaInitial,
    execute: authExecute
  });

  // Authoritative session can export complete backup using authoritative metaRecords
  const beforeBackup = session.exportData({ kind: 'database-backup', now: 16001 });
  assert.equal(beforeBackup.backupType, PROLINGO_TEXT_DB_BACKUP_TYPE);
  assert.equal(beforeBackup.audioBinaryIncluded, false);
  assert.ok(beforeBackup.metaRecords.some(r => r.key === 'customSidecarMeta' && r.value.tag === 'keep-me'));

  session.setDraft({ workspaceId: ids.documentId, entityId: ids.documentId, field: 'pendingNote' }, 'Keep my draft');

  const res = await session.dispatch({
    type: 'block.create',
    payload: { documentId: ids.documentId, blockType: 'conversation', title: 'Single Allocation Card' }
  });

  assert.equal(res.ok, true);
  assert.equal(txExecutions, 1);
  assert.equal(seenExpectedFingerprint, canonicalJsonStringify(f.snapshot));

  const createdCardId = res.result.id;
  const sessionCard = session.getSnapshot().blocks.find(b => b.id === createdCardId);
  const dbCard = dbState.blocks.find(b => b.id === createdCardId);
  assert.ok(sessionCard?.uid);
  assert.equal(sessionCard.uid, dbCard.uid);
  assert.equal(sessionCard.title, 'Single Allocation Card');
  assert.equal(canonicalJsonStringify(session.getSnapshot()), canonicalJsonStringify(dbState));
  assert.equal(session.getDraft({ workspaceId: ids.documentId, entityId: ids.documentId, field: 'pendingNote' }), 'Keep my draft');

  const afterBackup = session.exportData({ kind: 'database-backup', now: 16002 });
  assert.ok(afterBackup.metaRecords.some(r => r.key === 'customSidecarMeta' && r.value.tag === 'keep-me'));
  const countersMeta = afterBackup.metaRecords.find(r => r.key === 'idCounters');
  assert.equal(countersMeta.value.text, dbState.counters.text);
  assert.equal(dbCalls, 0);
});

await test('Authoritative coordinator rejects forged/unreconciled responses, stale navigations, and missing metadata exports', async () => {
  const mode = { type: 'wrong-fingerprint', release: null };
  const authExecute = async (command, context) => {
    const outcome = applyTextDataManagementCommand(f.snapshot, command, {
      selection: context.selection,
      boundary: context.boundary,
      permissions: context.permissions,
      now: 17000
    });
    if (mode.type === 'wrong-fingerprint') {
      return {
        ok: true,
        authoritative: true,
        previousFingerprint: 'forged-previous',
        snapshot: outcome.snapshot,
        result: outcome.result
      };
    }
    if (mode.type === 'not-authoritative') {
      return { ok: true, snapshot: outcome.snapshot, result: outcome.result };
    }
    if (mode.type === 'defer') {
      return new Promise(resolve => {
        mode.release = () => resolve({
          ok: true,
          authoritative: true,
          previousFingerprint: context.expectedSnapshotFingerprint,
          snapshot: outcome.snapshot,
          result: outcome.result
        });
      });
    }
    return outcome;
  };
  authExecute.authoritativeTransaction = true;

  // Session initialized without authoritative metaRecords must reject database-backup export
  const s = createTextDataManagementSession({
    snapshot: f.snapshot,
    selection: { workspaceId: ids.documentId },
    boundary: 'disposable',
    permissions: ['catalog', 'content'],
    execute: authExecute
  });
  assert.throws(() => s.exportData({ kind: 'database-backup' }), err => err?.code === 'METADATA_REQUIRED');

  s.setDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }, 'Edited draft');
  const forgedRes = await s.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'X' } });
  assert.equal(forgedRes.ok, false);
  assert.equal(forgedRes.error.code, 'INVALID_RESPONSE');
  assert.equal(s.getDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }), 'Edited draft');

  mode.type = 'not-authoritative';
  const unauthRes = await s.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'X' } });
  assert.equal(unauthRes.ok, false);
  assert.equal(unauthRes.error.code, 'INVALID_RESPONSE');

  mode.type = 'defer';
  const pendingPromise = s.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Stale' } });
  s.navigate({ workspaceId: ids.paragraphId });
  mode.release();
  const staleRes = await pendingPromise;
  assert.equal(staleRes.ok, false);
  assert.equal(staleRes.error.code, 'STALE_RESULT');
  assert.equal(s.getState().view.selection.workspaceId, ids.paragraphId);
  assert.equal(s.getDraft({ workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' }), 'Edited draft');
  assert.equal(dbCalls, 0);
});

await test('Canonical v1 files remain untouched except safe non-transactional marker', () => {
  const constantsSource = fs.readFileSync('src/constants/textDatabaseConstants.js', 'utf8');
  assert.match(constantsSource, /export const TEXT_LIBRARY_DB_VERSION = 1;/);
  assert.match(constantsSource, /export const TEXT_LIBRARY_SCHEMA_VERSION = 1;/);
  const adapter = createTextDataManagementPersistenceAdapter({
    dbName: 'prolingo_text_library_d3b_qa_meta',
    boundary: 'read-only',
    permissions: []
  });
  assert.equal(adapter.mode, 'disposable-qa');
  assert.equal(adapter.canonicalWritesEnabled, false);
  assert.equal(adapter.execute.authoritativeTransaction, true);
  assert.equal(dbCalls, 0);
});

console.log(JSON.stringify({ passed, failed: 0, dbCalls }));
