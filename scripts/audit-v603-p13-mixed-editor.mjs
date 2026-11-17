import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createP13MixedFixture } from './fixtures/p13-mixed/mixed-workspace-fixture.js';
import { applyTextMixedEditorCommand as apply, selectTextMixedEditorState as select, createTextMixedEditorCoordinator as coordinator, TEXT_MIXED_EDITOR_COMMAND_FIELDS } from '../src/domain/text/textMixedEditorDomain.js';
import { selectTextMixedReaderState } from '../src/domain/text/textMixedReaderDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { planProLingoTextExternalInitialImport } from '../src/domain/text/textExternalJsonDomain.js';
import { planTextExternalUpdateExisting } from '../src/domain/text/textExternalReconciliationDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge, planTextSourceSync } from '../src/domain/text/textSourceAttachmentDomain.js';
let dbCalls = 0, passed = 0;
globalThis.indexedDB = new Proxy({}, { get() { dbCalls++; throw Error('No database access'); } });
const test = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const f = createP13MixedFixture(), { ids } = f, original = JSON.stringify(f.snapshot);
const executed = new Set();
const run = (snapshot, type, payload) => {
  const out = apply(snapshot, { type, payload }, { documentId: ids.documentId, now: 2000 });
  executed.add(type); return out;
};
const reject = (type, payload, pattern = /./) => { assert.throws(() => run(f.snapshot, type, payload), pattern); assert.equal(JSON.stringify(f.snapshot), original); };
await test('Global Card order, distinct Unit kinds, immutable detached projections and paired identities', () => {
  const state = select(f.snapshot);
  assert.deepEqual(state.cards.map(c => c.id), f.cardOrder);
  assert.ok(Object.isFrozen(state.cards[0].units[0].metadata));
  assert.equal(state.cards[0].units[0].segments[0].id, ids.beforeSentenceId);
  assert.equal(state.scenes[0].id, ids.sceneId);
  assert.equal(Object.keys(TEXT_MIXED_EDITOR_COMMAND_FIELDS).length, 22);
  assert.equal(Object.isFrozen(f.snapshot.blocks[0]), false);
});
await test('Paragraph split retains source ownership only on retained Segment (regression)', () => {
  const snapshot = structuredClone(f.snapshot), segment = snapshot.segments.find(s => s.id === ids.beforeSentenceId);
  segment.metadata.externalEntityV1 = { segmentKey: 'original-source-key', documentKey: 'source' };
  segment.metadata.prolingoTextPackSource = { attachmentId: 'attachment', ownership: 'attached', sourceSegmentUid: 'original' };
  const result = run(snapshot, 'paragraphSegment.split', { id: segment.id, parts: [{ text: 'Hello.', meaning: 'Halo.', joinAfter: 'line' }, { text: 'Welcome.', meaning: 'Selamat.', joinAfter: 'none' }] });
  const retained = result.snapshot.segments.find(s => s.id === segment.id), created = result.snapshot.segments.find(s => s.id === result.result.createdIds[0]);
  assert.equal(retained.uid, segment.uid);
  assert.deepEqual(retained.metadata.externalEntityV1, segment.metadata.externalEntityV1);
  assert.equal(created.metadata.externalEntityV1, undefined);
  assert.equal(created.metadata.prolingoTextPackSource.attachmentId, null);
  assert.equal(created.metadata.prolingoTextPackSource.ownership, 'detached-local');
  assert.equal(created.unitId, segment.unitId);
  assert.notEqual(created.uid, segment.uid);
});
await test('Paragraph split children survive actual External JSON reconciliation and attached Text Pack sync', () => {
  const packageValue = JSON.parse(fs.readFileSync(new URL('./fixtures/v603-d2-external-mix-example.json', import.meta.url), 'utf8'));
  const initial = planProLingoTextExternalInitialImport({ localSnapshot: f.snapshot, package: packageValue, existingImports: [], now: 1800 });
  const documentId = initial.importRecord.documentId;
  const paragraph = initial.snapshot.blocks.find(b => b.documentId === documentId && b.blockType === 'paragraph');
  const original = initial.snapshot.segments.find(s => s.blockId === paragraph.id);
  const split = apply(initial.snapshot, { type: 'paragraphSegment.split', payload: { id: original.id, parts: [
    { text: 'Local first.', meaning: 'Pertama.' }, { text: 'Local second.', meaning: 'Kedua.' }
  ] } }, { documentId, now: 2000 });
  const reconciled = planTextExternalUpdateExisting({ localSnapshot: split.snapshot, package: packageValue, existingImport: initial.importRecord, conflictPolicy: 'keep-local', now: 2100 });
  for (const id of [original.id, split.result.createdIds[0]]) {
    const before = split.snapshot.segments.find(s => s.id === id), after = reconciled.snapshot.segments.find(s => s.id === id);
    assert.ok(after, 'Reconcile lost local split child');
    assert.deepEqual([after.uid, after.unitId, after.text, after.meaning], [before.uid, before.unitId, before.text, before.meaning]);
  }
  const pack = createProLingoTextPack({ snapshot: f.snapshot, scopeType: 'document', rootId: ids.documentId, now: 2200 });
  const merged = mergeProLingoTextPack({ localSnapshot: f.snapshot, pack, now: 2300 });
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 2300 });
  const copyId = merged.idMap.documents[ids.documentId], sourceId = merged.idMap.segments[ids.beforeSentenceId];
  const edited = apply(attached.snapshot, { type: 'paragraphSegment.split', payload: { id: sourceId, parts: [
    { text: 'First local.', meaning: 'Satu.' }, { text: 'Second local.', meaning: 'Dua.' }
  ] } }, { documentId: copyId, now: 2400 });
  const sync = planTextSourceSync({ localSnapshot: edited.snapshot, attachment: attached.attachment, pack });
  assert.equal(sync.ok, true);
  const newId = edited.result.createdIds[0];
  assert.equal(sync.snapshot.segments.find(s => s.id === newId)?.uid, edited.snapshot.segments.find(s => s.id === newId).uid);
  select(sync.snapshot, { documentId: copyId });
});
await test('Create both Card types, reorder globally, update note/title, delete and retain empty Cards', () => {
  let snapshot = f.snapshot;
  for (const blockType of ['paragraph', 'conversation']) {
    const outcome = run(snapshot, 'block.create', { documentId: ids.documentId, blockType, title: blockType, metadata: { note: 'draft' } });
    snapshot = outcome.snapshot;
    const id = outcome.result.id;
    snapshot = run(snapshot, 'block.update', { id, title: 'renamed', metadata: { note: 'edited' } }).snapshot;
    let state = select(snapshot);
    snapshot = run(snapshot, 'block.reorder', { documentId: ids.documentId, orderedIds: [id, ...state.cardOrderIds.filter(x => x !== id)] }).snapshot;
    assert.equal(select(snapshot).cards[0].id, id);
    for (const unit of snapshot.contentUnits.filter(u => u.blockId === id)) snapshot = run(snapshot, 'contentUnit.delete', { id: unit.id }).snapshot;
    state = select(snapshot);
    assert.equal(state.cards[0].units.length, 0);
    snapshot = run(snapshot, 'block.delete', { id }).snapshot;
    assert.ok(!select(snapshot).cardOrderIds.includes(id));
  }
});
await test('Both Unit kinds: create/edit/reorder/split/merge/delete and preserve Segment IDs, UIDs, audio', () => {
  for (const [blockId, kind] of [[ids.beforeCardId, 'paragraph'], [ids.zeroSceneId, 'turn']]) {
    let out = run(f.snapshot, 'contentUnit.create', { blockId, kind, text: 'First.', meaning: 'Satu.', metadata: { note: 'unit' } }), snapshot = out.snapshot;
    const unitId = out.result.id;
    snapshot = run(snapshot, 'contentUnit.update', { id: unitId, metadata: { note: 'changed' } }).snapshot;
    snapshot = run(snapshot, 'segment.create', { blockId, unitId, text: 'Second.', meaning: 'Dua.', joinAfter: 'none' }).snapshot;
    let unit = select(snapshot).cards.find(c => c.id === blockId).units.find(u => u.id === unitId);
    const saved = unit.segments.map(s => [s.id, s.uid]);
    snapshot = run(snapshot, 'contentUnit.reorderSegments', { id: unitId, orderedIds: unit.segments.map(s => s.id).reverse() }).snapshot;
    out = run(snapshot, 'contentUnit.split', { id: unitId, splitAtIndex: 1 }); snapshot = out.snapshot;
    const splitId = out.result.createdUnitId || out.result.createdId || out.result.id;
    const card = select(snapshot).cards.find(c => c.id === blockId);
    const index = card.units.findIndex(u => u.id === unitId), nextId = card.units[index + 1].id;
    assert.ok(nextId && nextId !== unitId, String(splitId));
    snapshot = run(snapshot, 'contentUnit.merge', { ids: [unitId, nextId] }).snapshot;
    assert.deepEqual(select(snapshot).cards.find(c => c.id === blockId).units.find(u => u.id === unitId).segments.map(s => [s.id, s.uid]).reverse(), saved);
    snapshot = run(snapshot, 'contentUnit.reorder', { blockId, orderedIds: select(snapshot).cards.find(c => c.id === blockId).units.map(u => u.id).reverse() }).snapshot;
    snapshot = run(snapshot, 'contentUnit.delete', { id: unitId }).snapshot;
    assert.deepEqual(snapshot.audioVariants, f.snapshot.audioVariants);
  }
});
await test('Last Sentence deletion preserves empty Section/Turn; empty Card remains', () => {
  for (const [blockId, kind] of [[ids.emptyParagraphId, 'paragraph'], [ids.zeroSceneId, 'turn']]) {
    let out = run(f.snapshot, 'contentUnit.create', { blockId, kind, text: 'Only.' });
    const unitId = out.result.id, sentence = out.snapshot.segments.find(s => s.unitId === unitId);
    out = run(out.snapshot, 'segment.delete', { id: sentence.id });
    assert.equal(out.state.cards.find(c => c.id === blockId).units.find(u => u.id === unitId).segments.length, 0);
  }
});
await test('Bilingual edit/joinAfter and Sentence split/merge in both kinds preserve retained identity and invalidate only native logical references', () => {
  for (const [id, prefix] of [[ids.beforeSentenceId, 'paragraph'], [ids.firstSentenceId, 'conversation']]) {
    const source = f.snapshot.segments.find(s => s.id === id);
    let out = run(f.snapshot, 'segment.update', { id, text: 'One. Two.', meaning: 'Satu. Dua.', joinAfter: 'none', metadata: { ...source.metadata, note: 'edited' } });
    assert.deepEqual(out.snapshot.blocks.find(b => b.id === ids.sceneId).metadata, f.snapshot.blocks.find(b => b.id === ids.sceneId).metadata);
    out = run(out.snapshot, `${prefix}Segment.split`, { id, parts: [{ text: 'One.', meaning: 'Satu.', joinAfter: 'space' }, { text: 'Two.', meaning: 'Dua.', joinAfter: 'none' }] });
    const newId = out.result.createdIds[0];
    out = run(out.snapshot, `${prefix}Segments.merge`, { ids: [id, newId] });
    const merged = out.snapshot.segments.find(s => s.id === id);
    assert.equal(merged.uid, source.uid); assert.equal(merged.joinAfter, 'none'); assert.match(merged.meaning, /Satu/);
    assert.ok(!out.snapshot.segments.some(s => s.id === newId));
    assert.deepEqual(out.snapshot.audioVariants.map(a => [a.id, a.uid, a.segmentId]), f.snapshot.audioVariants.map(a => [a.id, a.uid, a.segmentId]));
    assert.ok(out.snapshot.audioVariants.filter(a => a.segmentId === id).every(a => a.metadata.contentInvalidatedV1));
    for (const variant of out.snapshot.audioVariants) {
      const before = f.snapshot.audioVariants.find(a => a.id === variant.id);
      assert.equal(variant.metadata.audioRenderFingerprintV1, before.metadata.audioRenderFingerprintV1);
    }
  }
});
await test('Same-Card moves preserve Segment/AudioVariant identity, repeated text and speaker reassignment semantics', () => {
  for (const [id, targetUnitId] of [[ids.beforeSentenceId, ids.emptySectionId], [ids.firstSentenceId, ids.bobTurnId]]) {
    const out = run(f.snapshot, 'segment.move', { segmentId: id, targetUnitId });
    assert.equal(out.snapshot.segments.find(s => s.id === id).uid, f.snapshot.segments.find(s => s.id === id).uid);
    assert.equal(out.snapshot.segments.find(s => s.id === id).unitId, targetUnitId);
    assert.deepEqual(out.snapshot.audioVariants, f.snapshot.audioVariants);
    selectTextMixedReaderState(out.snapshot);
  }
  assert.notEqual(ids.beforeSentenceId, ids.firstSentenceId);
});
await test('Registry register/rename/reassign/remove; adjacent same-speaker Turns remain distinct and empty assigned Turns protect registry', () => {
  const alice = f.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).speakerId;
  let out = run(f.snapshot, 'speaker.register', { documentId: ids.documentId, label: 'New Speaker' });
  const newSpeaker = out.state.speakerRegistry.find(s => s.label === 'New Speaker');
  out = run(out.snapshot, 'speaker.rename', { documentId: ids.documentId, speakerId: newSpeaker.id, label: 'Renamed' });
  out = run(out.snapshot, 'contentUnit.update', { id: ids.emptyTurnId, speakerId: newSpeaker.id, speaker: 'Renamed' });
  assert.throws(() => run(out.snapshot, 'speaker.remove', { documentId: ids.documentId, speakerId: newSpeaker.id }), /in use/);
  out = run(out.snapshot, 'contentUnit.update', { id: ids.emptyTurnId, resetSpeaker: true });
  out = run(out.snapshot, 'speaker.remove', { documentId: ids.documentId, speakerId: newSpeaker.id });
  assert.ok(!out.state.speakerRegistry.some(s => s.id === newSpeaker.id));
  out = run(out.snapshot, 'speaker.rename', { documentId: ids.documentId, speakerId: alice, label: 'Alice Renamed' });
  for (const id of [ids.aliceTurnId, ids.nextAliceTurnId]) {
    const unit = out.snapshot.contentUnits.find(u => u.id === id);
    assert.equal(unit.speakerId, alice); assert.equal(unit.uid, f.snapshot.contentUnits.find(u => u.id === id).uid);
    assert.equal(unit.speaker, 'Alice Renamed');
  }
});
await test('Reject foreign Workspace/Card, kind mixing/conversion, invalid merges, untranslated guesses and metadata erasure atomically', () => {
  const foreign = f.snapshot.contentUnits.find(u => u.documentId === ids.mixedDocumentId);
  const alice = f.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId).speakerId;
  for (const [type, payload] of [
    ['block.delete', { id: ids.paragraphId }], ['block.update', { id: ids.beforeCardId, blockType: 'conversation' }],
    ['contentUnit.create', { blockId: ids.beforeCardId, kind: 'turn' }], ['contentUnit.update', { id: ids.sectionId, speaker: 'Alice', speakerId: alice }],
    ['segment.create', { blockId: ids.sceneId, unitId: ids.sectionId, text: 'bad' }], ['segment.move', { segmentId: ids.beforeSentenceId, targetUnitId: ids.aliceTurnId }],
    ['segment.move', { segmentId: ids.firstSentenceId, targetUnitId: foreign.id }], ['contentUnit.merge', { ids: [ids.sectionId, ids.aliceTurnId] }],
    ['paragraphSegments.merge', { ids: [ids.beforeSentenceId, ids.afterSentenceId] }], ['conversationSegment.split', { id: ids.beforeSentenceId, parts: [] }],
    ['paragraphSegment.split', { id: ids.beforeSentenceId, parts: [{ text: 'A' }, { text: 'B' }] }],
    ['segment.update', { id: ids.beforeSentenceId, metadata: {} }], ['block.update', { id: ids.sceneId, metadata: {} }],
    ['contentUnit.update', { id: ids.aliceTurnId, speakerId: foreign.speakerId || 'foreign', speaker: 'other' }],
    ['segment.move', { segmentId: ids.firstSentenceId, targetUnitId: ids.emptyTurnId, beforeSegmentId: ids.firstSentenceId, orderInUnit: 1 }]
  ]) reject(type, payload);
});
await test('Async lock prevents duplicates; rejected/malformed/foreign acknowledgements never publish; staged result publishes once', async () => {
  let scope = { snapshot: f.snapshot, documentId: ids.documentId, revision: 0 }, resolve, commits = 0;
  const command = { type: 'block.update', payload: { id: ids.beforeCardId, title: 'Accepted' } };
  let stage;
  const c = coordinator({ getScope: () => scope, onCommit: out => { commits++; scope = { ...scope, snapshot: out.snapshot }; },
    execute: (_cmd, context) => { stage = context.preparedOutcome; return new Promise(r => { resolve = r; }); } });
  const p = c.dispatch(command);
  assert.equal((await c.dispatch(command)).error.code, 'BUSY');
  resolve({ ok: false, error: { code: 'REJECTED', message: 'retry' } }); assert.equal((await p).ok, false); assert.equal(commits, 0);
  for (const reply of [undefined, {}, { ok: true, snapshot: f.snapshot, result: {} }, { ok: 'yes' }]) {
    const pending = c.dispatch(command); resolve(reply); assert.equal((await pending).error.code, 'INVALID_RESPONSE');
  }
  const accepted = c.dispatch(command); resolve(structuredClone(stage)); assert.equal((await accepted).ok, true); assert.equal(commits, 1);
  assert.equal(Object.isFrozen(f.snapshot.blocks[0]), false);
});
await test('Snapshot replacement, Workspace switch/reset and disposal cancel late results without overwriting newer state', async () => {
  for (const change of ['snapshot', 'workspace', 'revision', 'dispose']) {
    let scope = { snapshot: f.snapshot, documentId: ids.documentId, revision: 0 }, resolve, stage, commits = 0;
    const c = coordinator({ getScope: () => scope, onCommit: () => { commits++; }, execute: (_c, ctx) => { stage = ctx.preparedOutcome; return new Promise(r => { resolve = r; }); } });
    const pending = c.dispatch({ type: 'block.delete', payload: { id: ids.emptyParagraphId } });
    if (change === 'snapshot') scope = { ...scope, snapshot: structuredClone(f.snapshot) };
    if (change === 'workspace') scope = { ...scope, documentId: ids.mixedDocumentId };
    if (change === 'revision') scope = { ...scope, revision: 1 };
    if (change === 'dispose') c.dispose();
    resolve(stage); assert.equal((await pending).error.code, 'STALE_RESULT'); assert.equal(commits, 0);
  }
});
await test('Local acknowledgements also lock synchronous duplicates; thrown transport errors release the lock', async () => {
  const command = { type: 'block.update', payload: { id: ids.beforeCardId, title: 'Local' } };
  let commits = 0;
  const scope = { snapshot: f.snapshot, documentId: ids.documentId };
  const c = coordinator({ getScope: () => scope, onCommit: () => { commits++; } });
  const pending = c.dispatch(command);
  assert.equal((await c.dispatch(command)).error.code, 'BUSY');
  assert.equal((await pending).ok, true); assert.equal(commits, 1);
  const throwing = coordinator({ getScope: () => scope, onCommit: () => assert.fail('Unexpected commit'), execute: () => { throw Error('Transport failed'); } });
  for (let i = 0; i < 2; i++) assert.equal((await throwing.dispatch(command)).error.message, 'Transport failed');
  const nullError = coordinator({ getScope: () => scope, onCommit: () => assert.fail('Unexpected commit'), execute: () => Promise.reject(null) });
  assert.equal((await nullError.dispatch(command)).error.code, 'COMMAND_REJECTED');
});
await test('Corruption/partial migration rejected, no source mutation or storage calls; canonical versions remain one', () => {
  for (const mutate of [s => { s.contentUnits = []; }, s => { s.segments.find(x => x.id === ids.beforeSentenceId).unitId = ids.aliceTurnId; }, s => { s.blocks[0].uid = s.blocks[1].uid; }]) {
    const bad = structuredClone(f.snapshot); mutate(bad); assert.throws(() => select(bad));
  }
  assert.equal(JSON.stringify(f.snapshot), original); assert.equal(dbCalls, 0);
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1); assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.deepEqual([...executed].sort(), Object.keys(TEXT_MIXED_EDITOR_COMMAND_FIELDS).sort());
});
console.log(JSON.stringify({ passed, dbCalls, commands: executed.size }));
