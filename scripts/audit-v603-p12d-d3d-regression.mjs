import assert from 'node:assert/strict';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { backfillTextContentUnits } from '../src/domain/text/textContentUnitDomain.js';
import { backfillTextGlobalUids } from '../src/domain/text/textGlobalIdentityDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge, planTextSourceSync, planTextSourceDetach } from '../src/domain/text/textSourceAttachmentDomain.js';
import { createProLingoTextDatabaseBackup } from '../src/domain/text/textDatabaseBackupDomain.js';
import { executeProLingoTextDatabaseReplaceRestore } from '../src/services/persistence/textDatabaseBackupService.js';

const empty = () => ({ schemaVersion: 1, initialized: true, activeDocumentId: null, counters: {}, collections: [], documents: [], blocks: [], segments: [], audioVariants: [] });
const command = (snapshot, type, payload, now = 100) => applyTextLibraryCommand(snapshot, { type, payload }, now).snapshot;
const migrate = snapshot => backfillTextContentUnits(snapshot, { now: 200 }).snapshot;
const source = (withText = false) => {
  let snapshot = command(empty(), 'document.create', { title: 'D3D', documentType: 'paragraph' });
  const documentId = snapshot.documents[0].id;
  snapshot = command(snapshot, 'block.create', { documentId, blockType: 'paragraph' });
  if (withText) snapshot = command(snapshot, 'segment.create', { blockId: snapshot.blocks[0].id, text: 'Source sentence.' });
  return backfillTextGlobalUids(snapshot).snapshot;
};
const attach = (alreadyV2 = false, withText = false) => {
  const snapshot = source(withText);
  const pack = createProLingoTextPack({ snapshot, scopeType: 'document', rootId: snapshot.documents[0].id, packageId: 'd3d-empty', now: 100 });
  const merged = mergeProLingoTextPack({ localSnapshot: alreadyV2 ? migrate(empty()) : empty(), pack, now: 100 });
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 100 });
  return { ...attached, pack, snapshot: alreadyV2 ? attached.snapshot : migrate(attached.snapshot) };
};
let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
};

for (const alreadyV2 of [false, true]) {
  await test(`nonempty Unit metadata survives removal (attach into v${alreadyV2 ? 2 : 1})`, () => {
    const attached = attach(alreadyV2, true);
    const local = command(attached.snapshot, 'contentUnit.update', { id: attached.snapshot.contentUnits[0].id, metadata: { note: 'Keep this Unit annotation' } }, 300);
    assert.equal(planTextSourceSync({ localSnapshot: local, pack: { ...attached.pack, blocks: [], segments: [] }, attachment: attached.attachment }).ok, false);
    assert.equal(planTextSourceDetach({ localSnapshot: local, attachment: attached.attachment, removeData: true }).ok, false);
  });
  await test(`proven untouched migration Unit permits clean deletion (attach into v${alreadyV2 ? 2 : 1})`, () => {
    const attached = attach(alreadyV2);
    const plan = planTextSourceSync({ localSnapshot: attached.snapshot, pack: { ...attached.pack, blocks: [] }, attachment: attached.attachment, now: 400 });
    assert.equal(plan.ok, true);
    assert.equal(plan.snapshot.contentUnits.length, 0);
    assert.equal(planTextSourceDetach({ localSnapshot: attached.snapshot, attachment: attached.attachment, removeData: true }).ok, true);
  });
  await test(`empty Unit metadata survives source deletion (attach into v${alreadyV2 ? 2 : 1})`, () => {
    const attached = attach(alreadyV2);
    const unit = attached.snapshot.contentUnits[0];
    const local = command(attached.snapshot, 'contentUnit.update', { id: unit.id, metadata: { note: 'Keep this deliberate empty paragraph' } }, 300);
    assert.equal(local.contentUnits[0].createdAt, local.blocks[0].createdAt);
    assert.equal(local.contentUnits[0].updatedAt, local.blocks[0].updatedAt);
    const plan = planTextSourceSync({ localSnapshot: local, pack: { ...attached.pack, blocks: [] }, attachment: attached.attachment, now: 400 });
    assert.equal(plan.ok, false, 'source deletion must conflict rather than silently discard edited empty Unit');
  });
  await test(`empty Unit metadata survives detach removal (attach into v${alreadyV2 ? 2 : 1})`, () => {
    const attached = attach(alreadyV2);
    const local = command(attached.snapshot, 'contentUnit.update', { id: attached.snapshot.contentUnits[0].id, metadata: { note: 'Keep' } }, 300);
    assert.equal(planTextSourceDetach({ localSnapshot: local, attachment: attached.attachment, removeData: true, now: 400 }).ok, false);
  });
}

await test('historical ambiguous empty Units remain protected after backup round-trip', () => {
  const attached = attach();
  const historical = { ...attached.snapshot, contentUnits: attached.snapshot.contentUnits.map(unit => ({ ...unit, metadata: {} })) };
  const backup = createProLingoTextDatabaseBackup({ stores: historical, metaRecords: [
    { key: 'initialized', value: true }, { key: 'schemaVersion', value: 2 },
    { key: 'activeDocumentId', value: historical.documents[0].id }, { key: 'idCounters', value: historical.counters },
    { key: 'contentUnitMigration', value: historical.contentUnitMigration },
    { key: 'sourceAttachments', value: [attached.attachment] }
  ] });
  const restored = { ...historical, contentUnits: backup.stores.contentUnits };
  const attachment = backup.metaRecords.find(record => record.key === 'sourceAttachments').value[0];
  assert.equal(planTextSourceDetach({ localSnapshot: restored, attachment, removeData: true }).ok, false);
  assert.equal(planTextSourceSync({ localSnapshot: restored, attachment, pack: { ...attached.pack, blocks: [] } }).ok, false);
});

await test('intentional empty replacement with identical timestamps is never migration-owned', () => {
  const attached = attach();
  const deleted = command(attached.snapshot, 'contentUnit.delete', { id: attached.snapshot.contentUnits[0].id }, 100);
  const replacement = command(deleted, 'contentUnit.create', { blockId: deleted.blocks[0].id }, 100);
  assert.equal(replacement.contentUnits[0].createdAt, replacement.blocks[0].createdAt);
  assert.equal(planTextSourceDetach({ localSnapshot: replacement, attachment: attached.attachment, removeData: true }).ok, false);
});

await test('canonical v1 restore rejects v2 before opening any database', async () => {
  const snapshot = migrate(source());
  const backup = createProLingoTextDatabaseBackup({
    metaRecords: [
      { key: 'initialized', value: true }, { key: 'schemaVersion', value: 2 },
      { key: 'activeDocumentId', value: snapshot.activeDocumentId },
      { key: 'idCounters', value: snapshot.counters },
      { key: 'contentUnitMigration', value: snapshot.contentUnitMigration }
    ], stores: snapshot, now: 500
  });
  const previous = globalThis.indexedDB;
  let opens = 0;
  globalThis.indexedDB = { open() { opens++; throw new Error('D3D sentinel: canonical open attempted'); } };
  try {
    await assert.rejects(executeProLingoTextDatabaseReplaceRestore({ backup }), /v2.*(restore|schema|disabled)|v1.*(restore|schema)/i);
    assert.equal(opens, 0);
  } finally { globalThis.indexedDB = previous; }
});

await test('source v1-to-v2 schema promotion cannot overwrite a synthetic local Unit by ID coincidence', () => {
  const attached = attach(true);
  const localUnit = attached.snapshot.contentUnits[0];
  const local = command(attached.snapshot, 'contentUnit.update', { id: localUnit.id, metadata: { note: 'Local deliberate empty Unit' } }, 300);
  const promotedSource = migrate(source());
  const promotedPack = createProLingoTextPack({ snapshot: promotedSource, scopeType: 'document', rootId: promotedSource.documents[0].id, packageId: attached.pack.packageId, now: 400 });
  // Keep the original source identities; only promote its Unit layer.
  promotedPack.documents = attached.pack.documents;
  promotedPack.blocks = attached.pack.blocks;
  const plan = planTextSourceSync({ localSnapshot: local, pack: promotedPack, attachment: attached.attachment, now: 500 });
  if (plan.ok) {
    const preserved = plan.snapshot.contentUnits.find(unit => unit.id === localUnit.id);
    assert.equal(preserved?.uid, localUnit.uid);
    assert.equal(preserved?.metadata.note, 'Local deliberate empty Unit');
  } else assert.equal(plan.conflict, true);
});

console.log(`D3D REGRESSION: ${passed} PASS, ${failed} FAIL`);
if (failed) process.exitCode = 1;
