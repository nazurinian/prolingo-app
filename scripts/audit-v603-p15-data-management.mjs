import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createP15Fixture } from './fixtures/p15-data-management/fixture.js';
import { createA1V1ParagraphFixture } from './fixtures/shared-card-a1/presentation-fixture.js';
import { selectTextDataManagementState as select, applyTextDataManagementCommand as apply, TEXT_DATA_MANAGEMENT_COMMAND_FIELDS } from '../src/domain/text/textDataManagementDomain.js';
import { createTextDataManagementSession as session } from '../src/services/textDataManagementSession.js';
import { exportTextManagementData, inspectTextManagementTransfer, previewTextManagementTransfer } from '../src/domain/text/textDataManagementTransferDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
let passed = 0, dbCalls = 0;
globalThis.indexedDB = new Proxy({}, { get() { dbCalls++; throw Error('No database access'); } });
const test = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const f = createP15Fixture(), { ids } = f, original = JSON.stringify(f.snapshot);
const access = { boundary: 'disposable', permissions: ['catalog', 'content'] };
const run = (source, type, payload, selection = { workspaceId: ids.documentId }) => apply(source, { type, payload }, { ...access, selection, now: 15500 });
const reject = (type, payload, code, selection) => {
  assert.throws(() => run(f.snapshot, type, payload, selection), e => e.code === code, code);
  assert.equal(JSON.stringify(f.snapshot), original);
};
await test('Detached catalog, exact global Card/Unit/Segment IDs and EN/ID pairing', () => {
  const state = select(f.snapshot, { selection: { workspaceId: ids.documentId }, sourceAttachments: f.sourceAttachments });
  assert.ok(Object.isFrozen(state.workspace.documentTree.blocks[0].metadata));
  assert.equal(Object.isFrozen(f.snapshot.blocks[0]), false);
  assert.deepEqual(state.workspace.presentation.cards.map(c => c.id), f.cardOrder);
  for (const s of Object.values(state.workspace.presentation.segmentById)) {
    const raw = f.snapshot.segments.find(r => r.id === s.id);
    assert.deepEqual([s.uid, s.text, s.meaning, s.joinAfter, s.unitId], [raw.uid, raw.text, raw.meaning, raw.joinAfter, raw.unitId]);
  }
  assert.ok(state.workspace.presentation.cards.some(c => !c.units.length));
  assert.ok(state.workspace.presentation.cards.flatMap(c => c.units).some(u => !u.segments.length));
  const turns = state.workspace.presentation.cards.find(c => c.id === ids.sceneId).units;
  assert.equal(turns[0].speakerId, turns[1].speakerId); assert.notEqual(turns[0].id, turns[1].id);
  assert.equal(state.selection.collectionId, ids.collectionId);
});
await test('Collection/Workspace navigation retains Root grouping and denies false ancestry', () => {
  const root = select(f.snapshot);
  assert.ok(root.catalog.rootDocuments.some(d => d.id === ids.legacyId && !d.supported));
  assert.ok(root.catalog.collections.find(c => c.id === ids.collectionId).documents.some(d => d.id === ids.paragraphId));
  assert.throws(() => select(f.snapshot, { selection: { collectionId: null, workspaceId: ids.documentId } }), /outside/);
  assert.throws(() => select(f.snapshot, { selection: { workspaceId: ids.paragraphId, segmentId: ids.firstSentenceId } }), /outside/);
});
await test('Default read-only, explicit permission scopes and unsupported command denylist', () => {
  assert.throws(() => apply(f.snapshot, { type: 'document.delete', payload: { id: ids.documentId } }, { selection: { workspaceId: ids.documentId } }), e => e.code === 'READ_ONLY');
  assert.throws(() => apply(f.snapshot, { type: 'block.delete', payload: { id: ids.sceneId } }, { boundary: 'disposable', selection: { workspaceId: ids.documentId } }), e => e.code === 'PERMISSION_DENIED');
  for (const type of ['document.setActive', 'audioVariant.delete', 'fullAudioArtifact.upsert', 'audioPreferences.reset']) reject(type, {}, 'INVALID_COMMAND');
  assert.equal(Object.keys(TEXT_DATA_MANAGEMENT_COMMAND_FIELDS).length, 31);
});
await test('Native catalog create/update/move/reorder/delete; nonempty Collection rejects', () => {
  let out = run(f.snapshot, 'collection.create', { title: 'New' }, {}), source = out.snapshot, collectionId = out.result.id;
  out = run(source, 'document.create', { collectionId, documentType: 'conversation', title: 'New scene' }, { collectionId });
  source = out.snapshot; const docId = out.result.id;
  source = run(source, 'document.update', { id: docId, title: 'Renamed', metadata: { note: 'safe' } }, { workspaceId: docId }).snapshot;
  assert.equal(source.documents.find(d => d.id === docId).title, 'Renamed');
  source = run(source, 'document.reorder', { collectionId, orderedIds: [docId] }, { collectionId }).snapshot;
  assert.throws(() => run(source, 'collection.delete', { id: collectionId }, { collectionId }), /not empty/);
  source = run(source, 'document.update', { id: docId, collectionId: null }, { workspaceId: docId }).snapshot;
  assert.equal(source.documents.find(d => d.id === docId).collectionId, null);
  source = run(source, 'document.delete', { id: docId }, { workspaceId: docId }).snapshot;
  source = run(source, 'collection.update', { id: collectionId, title: 'Empty' }, { collectionId }).snapshot;
  source = run(source, 'collection.reorder', { orderedIds: source.collections.map(c => c.id).reverse() }, {}).snapshot;
  source = run(source, 'collection.delete', { id: collectionId }, { collectionId }).snapshot;
  assert.ok(!source.collections.some(c => c.id === collectionId));
});
await test('Cross-Workspace, Collection, Card-kind and metadata injection rejection', () => {
  reject('document.delete', { id: ids.paragraphId }, 'OUT_OF_SCOPE');
  reject('block.delete', { id: ids.paragraphCardId }, 'OUT_OF_SCOPE');
  reject('segment.update', { id: ids.paragraphSegmentId, text: 'wrong' }, 'OUT_OF_SCOPE');
  reject('document.create', { collectionId: ids.collectionId }, 'OUT_OF_SCOPE', {});
  reject('collection.delete', { id: 'COLL_999999' }, 'OUT_OF_SCOPE', { collectionId: ids.collectionId });
  reject('block.create', { documentId: ids.paragraphId, blockType: 'conversation' }, 'INVALID_COMMAND', { workspaceId: ids.paragraphId });
  reject('contentUnit.create', { blockId: ids.beforeCardId, kind: 'turn' }, 'INVALID_COMMAND');
  reject('document.update', { id: ids.documentId, metadata: {} }, 'PROTECTED_METADATA');
  reject('block.update', { id: ids.sceneId, metadata: {} }, 'INVALID_COMMAND');
});
await test('Native Section/Turn and bilingual edit/split/merge preserve identity and empty Units', () => {
  let out = run(f.snapshot, 'segment.update', { id: ids.beforeSentenceId, text: 'Changed.', meaning: 'Berubah.', joinAfter: 'line' });
  const retained = out.snapshot.segments.find(s => s.id === ids.beforeSentenceId), raw = f.snapshot.segments.find(s => s.id === ids.beforeSentenceId);
  assert.equal(retained.uid, raw.uid); assert.equal(retained.unitId, raw.unitId);
  out = run(out.snapshot, 'paragraphSegment.split', { id: retained.id, parts: [{ text: 'One.', meaning: 'Satu.' }, { text: 'Two.', meaning: 'Dua.' }] });
  out = run(out.snapshot, 'paragraphSegments.merge', { ids: [retained.id, out.result.createdIds[0]] });
  out = run(out.snapshot, 'contentUnit.create', { blockId: ids.sceneId, kind: 'turn' });
  const emptyId = out.result.id;
  assert.ok(select(out.snapshot, { selection: { workspaceId: ids.documentId } }).workspace.presentation.unitById[emptyId]);
  out = run(out.snapshot, 'contentUnit.delete', { id: emptyId });
  assert.ok(!out.snapshot.contentUnits.some(u => u.id === emptyId));
});
await test('Speaker rename/reassignment preserves distinct Turns and registry identity', () => {
  const view = select(f.snapshot, { selection: { workspaceId: ids.documentId } }), alice = view.workspace.speakers.find(s => s.label === 'Alice') || view.workspace.speakers[0];
  let out = run(f.snapshot, 'speaker.rename', { documentId: ids.documentId, speakerId: alice.id, label: 'Renamed' });
  const renamed = select(out.snapshot, { selection: { workspaceId: ids.documentId } }).workspace.speakers.find(s => s.id === alice.id);
  assert.equal(renamed.uid, alice.uid);
  const bob = view.workspace.speakers.find(s => s.id !== alice.id);
  out = run(out.snapshot, 'contentUnit.update', { id: ids.aliceTurnId, speakerId: bob.id });
  assert.equal(out.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).uid, f.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).uid);
});
await test('Audio/source associations preserved for unrelated edits; readiness requires bindings', () => {
  const metadata = f.snapshot.documents.find(d => d.id === ids.attachedId).metadata;
  const out = run(f.snapshot, 'document.update', { id: ids.attachedId, title: 'Local title', metadata: { ...metadata, note: 'Hello' } }, { workspaceId: ids.attachedId });
  assert.deepEqual(out.snapshot.audioVariants, f.snapshot.audioVariants);
  assert.deepEqual(out.snapshot.blocks, f.snapshot.blocks);
  assert.deepEqual(out.snapshot.segments, f.snapshot.segments);
  const view = select(out.snapshot, { selection: { workspaceId: ids.attachedId }, sourceAttachments: f.sourceAttachments });
  assert.equal(view.workspace.sources.attachments.length, 1);
  assert.equal(view.workspace.audio.readiness, 'not-evaluated');
  const originalAudio = select(f.snapshot, { selection: { workspaceId: ids.documentId } }).workspace.audio.variants;
  const segmentIds = new Set(f.snapshot.segments.filter(s => s.documentId === ids.documentId).map(s => s.id));
  const expected = f.snapshot.audioVariants.filter(a => segmentIds.has(a.segmentId));
  assert.ok(expected.length > 0);
  assert.deepEqual(originalAudio, expected, 'AudioVariant ownership follows Segment, not a nonexistent documentId field');
  const checked = select(f.snapshot, { selection: { workspaceId: ids.documentId }, audio: { preferences: f.preferences, runtimeAudioUrls: Object.fromEntries(f.snapshot.audioVariants.map(a => [a.id, { folderBacked: true }])) } });
  assert.ok(Object.values(checked.workspace.audio.coverage).every(s => s.status !== 'ready'));
});
await test('v1 virtual Sections stay null; safe Card/Segment native edits never create Units', () => {
  const v1 = createA1V1ParagraphFixture(), view = select(v1.snapshot, { selection: { workspaceId: v1.ids.documentId } });
  assert.equal(view.workspace.presentation.cards[0].units[0].id, null);
  const options = { ...access, selection: { workspaceId: v1.ids.documentId } };
  let out = apply(v1.snapshot, { type: 'segment.create', payload: { blockId: v1.ids.cardId, text: 'Third.', meaning: '' } }, options);
  out = apply(out.snapshot, { type: 'segment.reorder', payload: { blockId: v1.ids.cardId, orderedIds: out.snapshot.segments.filter(s => s.blockId === v1.ids.cardId).map(s => s.id).reverse() } }, options);
  assert.equal(out.snapshot.contentUnits, undefined); assert.ok(out.snapshot.segments.every(s => s.unitId === undefined));
  assert.throws(() => apply(v1.snapshot, { type: 'contentUnit.create', payload: { blockId: v1.ids.cardId } }, options), e => e.code === 'PERSISTENT_UNITS_REQUIRED');
  assert.throws(() => apply(v1.snapshot, { type: 'document.create', payload: { documentType: 'mixed' } }, { ...access, selection: {} }), /complete v2/);
});
await test('Unsupported/partial/corrupt/future snapshots fail safely; Legacy read-only', () => {
  assert.equal(select(f.snapshot, { selection: { workspaceId: ids.legacyId } }).workspace.unsupportedReason, 'UNSUPPORTED_WORKSPACE');
  reject('document.delete', { id: ids.legacyId }, 'UNSUPPORTED_WORKSPACE', { workspaceId: ids.legacyId });
  for (const bad of [{}, { ...f.snapshot, schemaVersion: 3 }, { ...f.snapshot, contentUnits: undefined },
    { ...f.snapshot, segments: f.snapshot.segments.map((s, i) => i ? s : { ...s, unitId: 'UNIT_999999' }) },
    { ...f.snapshot, segments: f.snapshot.segments.map((s, i, a) => i === 1 ? { ...s, uid: a[0].uid } : s) }]) {
    const s = session({ snapshot: bad }); assert.equal(s.getState().view, null); assert.ok(s.getState().error); s.dispose();
  }
});
await test('Pure backup and Text Pack roundtrip include metadata and sidecar registries, no binaries', () => {
  assert.throws(() => inspectTextManagementTransfer({ kind: 'text-pack', data: '{bad JSON' }), e => e.code === 'INVALID_TRANSFER');
  assert.throws(() => exportTextManagementData(f.snapshot, { kind: 'database-backup' }), e => e.code === 'METADATA_REQUIRED');
  const metaRecords = Object.entries({ schemaVersion: f.snapshot.schemaVersion, initialized: f.snapshot.initialized,
    activeDocumentId: f.snapshot.activeDocumentId, idCounters: f.snapshot.counters, contentUnitMigration: f.snapshot.contentUnitMigration,
    sourceAttachments: f.sourceAttachments, externalSourceImports: [], retainedOpaqueMeta: { important: true } }).map(([key, value]) => ({ key, value }));
  const backup = exportTextManagementData(f.snapshot, { kind: 'database-backup', metaRecords, now: 15600 });
  const inspected = inspectTextManagementTransfer({ kind: 'database-backup', data: JSON.stringify(backup) });
  assert.equal(backup.audioBinaryIncluded, false);
  assert.equal(inspected.applyEnabled, false); assert.deepEqual(inspected.snapshot.audioVariants, f.snapshot.audioVariants);
  assert.deepEqual(backup.metaRecords.find(m => m.key === 'sourceAttachments').value, f.sourceAttachments);
  assert.deepEqual(backup.metaRecords.find(m => m.key === 'retainedOpaqueMeta').value, { important: true });
  const pack = exportTextManagementData(f.snapshot, { kind: 'text-pack', selection: { workspaceId: ids.documentId }, now: 15600 });
  assert.equal(inspectTextManagementTransfer({ kind: 'text-pack', data: pack }).applyEnabled, false);
  const preview = previewTextManagementTransfer(f.snapshot, { operation: 'text-pack-copy', data: pack });
  assert.equal(preview.applyEnabled, false); assert.ok(preview.plan.snapshot.documents.length > f.snapshot.documents.length);
});
await test('Source ownership scope and native sync/detach previews cannot apply or remove data', () => {
  const preview = previewTextManagementTransfer(f.snapshot, { operation: 'source-sync', data: f.pack, sourceAttachments: f.sourceAttachments, attachmentId: f.sourceAttachments[0].attachmentId, selection: { workspaceId: ids.attachedId }, now: 15700 });
  assert.equal(preview.applyEnabled, false); assert.equal(preview.plan.ok, true);
  const detached = previewTextManagementTransfer(f.snapshot, { operation: 'source-detach', sourceAttachments: f.sourceAttachments, attachmentId: f.sourceAttachments[0].attachmentId, selection: { workspaceId: ids.attachedId }, now: 15700 });
  assert.equal(detached.plan.snapshot.segments.length, f.snapshot.segments.length);
  assert.throws(() => previewTextManagementTransfer(f.snapshot, { operation: 'source-sync', data: f.pack, sourceAttachments: f.sourceAttachments, attachmentId: f.sourceAttachments[0].attachmentId, selection: { workspaceId: ids.paragraphId } }), e => e.code === 'OUT_OF_SCOPE');
});
await test('External JSON import/reconciliation inspect previews preserve exact owner', () => {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures/v603-d2-external-mix-example.json', import.meta.url), 'utf8'));
  const preview = previewTextManagementTransfer(f.snapshot, { operation: 'external-json-import', data, now: 15700 });
  const record = preview.plan.importRecord;
  const inspection = previewTextManagementTransfer(preview.plan.snapshot, { operation: 'external-json-inspect', data, selection: { workspaceId: record.documentId }, externalImports: [record] });
  assert.equal(inspection.applyEnabled, false);
  assert.throws(() => previewTextManagementTransfer(preview.plan.snapshot, { operation: 'external-json-inspect', data, selection: { workspaceId: ids.paragraphId }, externalImports: [record] }), e => e.code === 'OUT_OF_SCOPE');
});
const key = { workspaceId: ids.documentId, entityId: ids.firstSentenceId, field: 'text' };
await test('Pending lock, failure preserves draft; exact staged acknowledgement succeeds once', async () => {
  let resolve, calls = 0;
  const s = session({ snapshot: f.snapshot, selection: { workspaceId: ids.documentId }, ...access, execute: (_, { preparedOutcome }) => { calls++; return new Promise(r => { resolve = () => r(preparedOutcome); }); } });
  s.setDraft(key, 'My draft');
  s.setDraft({ catalog: true, field: 'newCollectionTitle' }, 'Unsubmitted collection');
  const pending = s.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Accepted.' } });
  assert.equal(s.getState().pending, true);
  assert.equal((await s.dispatch({ type: 'segment.delete', payload: { id: ids.firstSentenceId } })).error.code, 'BUSY');
  resolve(); assert.equal((await pending).ok, true); assert.equal(calls, 1); assert.equal(s.getDraft(key), 'My draft');
  assert.equal(s.getSnapshot().segments.find(r => r.id === ids.firstSentenceId).text, 'Accepted.');
  const rejected = await s.dispatch({ type: 'segment.update', payload: { id: ids.paragraphSegmentId, text: 'foreign' } });
  assert.equal(rejected.error.code, 'OUT_OF_SCOPE'); assert.equal(s.getDraft(key), 'My draft'); s.dispose();
  assert.equal(s.getDraft({ catalog: true, field: 'newCollectionTitle' }), 'Unsubmitted collection');
});
await test('Navigation/source replacement/disposal fence async results and malformed replies', async () => {
  for (const scenario of ['navigate', 'replace', 'dispose', 'malformed', 'reject']) {
    let resolve;
    const s = session({ snapshot: f.snapshot, selection: { workspaceId: ids.documentId }, ...access, execute: (_, { preparedOutcome }) => new Promise(r => { resolve = () => r(scenario === 'malformed' ? {} : scenario === 'reject' ? { ok: false, error: { code: 'DENIED', message: 'retry' } } : preparedOutcome); }) });
    s.setDraft(key, 'Preserved');
    const pending = s.dispatch({ type: 'segment.update', payload: { id: ids.firstSentenceId, text: 'Late' } });
    if (scenario === 'navigate') s.navigate({ workspaceId: ids.paragraphId });
    if (scenario === 'replace') s.replaceSource(f.snapshot);
    if (scenario === 'dispose') s.dispose();
    resolve(); const out = await pending;
    assert.equal(out.ok, false); assert.equal(out.error.code, scenario === 'malformed' ? 'INVALID_RESPONSE' : scenario === 'reject' ? 'DENIED' : 'STALE_RESULT');
    assert.equal(s.getDraft(key), 'Preserved'); assert.equal(JSON.stringify(s.getSnapshot()), JSON.stringify(selectCanonical(f.snapshot))); s.dispose();
  }
});
function selectCanonical(snapshot) {
  const s = session({ snapshot }); const result = s.getSnapshot(); s.dispose(); return result;
}
await test('Delete selected entities reconciles navigation; view changes do not write content', async () => {
  const s = session({ snapshot: f.snapshot, selection: { workspaceId: ids.documentId, segmentId: ids.firstSentenceId }, ...access });
  assert.equal((await s.dispatch({ type: 'segment.delete', payload: { id: ids.firstSentenceId } })).ok, true);
  assert.equal(s.getState().view.selection.segmentId, undefined);
  const before = JSON.stringify(s.getSnapshot());
  s.navigate({ workspaceId: ids.paragraphId });
  assert.equal(JSON.stringify(s.getSnapshot()), before);
  s.dispose();
});
await test('Invalid source replacement preserves readable recovery drafts without a valid snapshot', () => {
  const s = session({ snapshot: f.snapshot });
  s.setDraft(key, 'Recover this draft');
  s.replaceSource({ schemaVersion: 99 });
  assert.equal(s.getState().view, null);
  assert.equal(s.getDraft(key), 'Recover this draft');
  s.clearDraft(key); assert.equal(s.getDraft(key), undefined); s.dispose();
});
await test('Canonical v1 constants, no storage/audio calls, source snapshot unchanged', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(dbCalls, 0); assert.equal(JSON.stringify(f.snapshot), original);
});
console.log(JSON.stringify({ passed, failed: 0, dbCalls }));
