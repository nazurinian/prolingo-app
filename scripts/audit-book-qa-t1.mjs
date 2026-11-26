import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { backfillTextContentUnits } from '../src/domain/text/textContentUnitDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { applyTextDataManagementCommand, validateAndScopeTextDataManagementCommand } from '../src/domain/text/textDataManagementDomain.js';
import { exportTextManagementData, inspectTextManagementTransfer } from '../src/domain/text/textDataManagementTransferDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';
import { BOOK_CARD_HEADING_KEY, BOOK_MAIN_TITLE_KEY, projectBookHeadings, resolveBookCardHeading, resolveBookMainTitle } from '../src/domain/text/textBookHeadingDomain.js';
import { buildTextStructuredAudioRequirementsForDocument } from '../src/domain/text/textStructuredAudioRequirementDomain.js';
import { buildTextStructuredFullArtifactIdentity, buildTextStructuredFullArtifactRecord, buildTextStructuredFullAudioArtifactsMetadata } from '../src/domain/text/textStructuredSplitFullDomain.js';
import { getTextStructuredSpeakerRegistry } from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import { normalizeTextMainReaderPreference } from '../src/services/persistence/textMainReaderPreferenceService.js';

const v1 = { schemaVersion: 1, initialized: true, activeDocumentId: null, counters: {}, collections: [], documents: [], blocks: [], segments: [], audioVariants: [] };
const empty = () => backfillTextContentUnits(v1, { now: 1 }).snapshot;
const access = { boundary: 'disposable', permissions: ['catalog', 'content'], bookAuthoring: true, now: 5 };
const command = (type, payload) => ({ type, payload });
const run = (snapshot, type, payload, workspaceId) => applyTextDataManagementCommand(snapshot, command(type, payload),
  { ...access, selection: workspaceId ? { workspaceId } : {} });
const create = (documentType, extra = {}) => run(empty(), 'document.create', { title: 'Workspace', documentType, ...extra });
const update = (snapshot, id, payload) => run(snapshot, 'document.update', { id, ...payload }, id);
const card = (snapshot, documentId, blockType = 'paragraph', extra = {}) => run(snapshot, 'block.create', { documentId, blockType, ...extra }, documentId);
const record = (outcome, store) => outcome.snapshot[store].find(item => item.id === outcome.result.id);

for (const kind of ['paragraph', 'conversation', 'mixed']) {
  test(kind + ' requires a Workspace Name and retains identity on linked rename', () => {
    assert.throws(() => create(kind, { title: ' \t ' }), { code: 'BOOK_WORKSPACE_NAME_REQUIRED' });
    const before = create(kind);
    const document = record(before, 'documents');
    assert.deepEqual(document.metadata[BOOK_MAIN_TITLE_KEY], { mode: 'workspace-name' });
    const after = update(before.snapshot, document.id, { title: ' Renamed ' });
    const renamed = record(after, 'documents');
    assert.equal(renamed.title, 'Renamed');
    assert.equal(renamed.documentType, kind);
    assert.equal(renamed.uid, document.uid);
    assert.deepEqual(renamed.metadata, document.metadata);
    assert.equal(resolveBookMainTitle(renamed).en, 'Renamed');
    assert.throws(() => update(after.snapshot, document.id, { title: ' ' }), { code: 'BOOK_WORKSPACE_NAME_REQUIRED' });
    assert.deepEqual(after.snapshot.blocks, []);
  });
}

test('Explicit type is required and Book policy cannot run on v1', () => {
  for (const type of [undefined, null, 'legacy', 'Paragraph']) {
    assert.throws(() => create(type), { code: 'BOOK_WORKSPACE_TYPE_REQUIRED' });
  }
  assert.throws(() => run(v1, 'document.create', { documentType: 'paragraph', title: 'Local' }), { code: 'PERSISTENT_UNITS_REQUIRED' });
  const outcome = applyTextDataManagementCommand(v1, command('document.create', { title: 'Normal' }), { ...access, bookAuthoring: false });
  assert.deepEqual(record(outcome, 'documents').metadata, {});
});

test('Custom Title, switching modes, optional Indonesian and whitespace validation', () => {
  for (const mainTitle of [{ mode: 'custom', en: ' ' }, { mode: 'custom', en: 10 },
    { mode: 'workspace-name', en: 'Duplicate' }, { mode: 'workspace-name', id: 10 }, { mode: 'other' }, null]) {
    assert.throws(() => create('mixed', { mainTitle }), { code: 'BOOK_MAIN_TITLE_INVALID' });
  }
  const custom = create('mixed', { mainTitle: { mode: 'custom', en: ' Custom ', id: ' Judul ' } });
  const first = record(custom, 'documents');
  assert.deepEqual(first.metadata[BOOK_MAIN_TITLE_KEY], { mode: 'custom', en: 'Custom', id: 'Judul' });
  const renamed = update(custom.snapshot, first.id, { title: 'Catalogue name' });
  assert.deepEqual(record(renamed, 'documents').metadata, first.metadata);
  const linked = update(renamed.snapshot, first.id, { mainTitle: { mode: 'workspace-name' } });
  assert.deepEqual(record(linked, 'documents').metadata[BOOK_MAIN_TITLE_KEY], { mode: 'workspace-name', id: 'Judul' });
  const back = update(linked.snapshot, first.id, { mainTitle: { mode: 'custom', en: 'Another' } });
  assert.deepEqual(record(back, 'documents').metadata[BOOK_MAIN_TITLE_KEY], { mode: 'custom', en: 'Another', id: 'Judul' });
  const cleared = record(update(back.snapshot, first.id, { mainTitle: { mode: 'custom', en: 'Another', id: '' } }), 'documents');
  assert.equal(cleared.uid, first.uid);
  assert.deepEqual(cleared.metadata[BOOK_MAIN_TITLE_KEY], { mode: 'custom', en: 'Another' });
});

test('Optional bilingual Headings, type-local labels and independent UID-scoped Reader preferences', () => {
  const start = create('mixed');
  const id = start.result.id;
  let { snapshot } = start;
  assert.throws(() => card(snapshot, id, 'paragraph', { heading: { id: 'ID only' } }), { code: 'BOOK_CARD_HEADING_INVALID' });
  assert.throws(() => card(snapshot, id, 'paragraph', { title: 'EN', heading: { en: 'Other EN' } }), { code: 'BOOK_CARD_HEADING_INVALID' });
  const first = card(snapshot, id);
  assert.equal(record(first, 'blocks').title, null);
  assert.equal(first.snapshot.segments.length, 0);
  assert.equal(getTextStructuredSpeakerRegistry(start.snapshot.documents[0]).length, 0);
  snapshot = first.snapshot;
  for (const label of ['Alice', 'Bob']) snapshot = run(snapshot, 'speaker.register', { documentId: id, label }, id).snapshot;
  const second = card(snapshot, id, 'conversation', { heading: { en: 'The train', id: 'Kereta' } });
  const third = card(second.snapshot, id, 'paragraph', { heading: { en: 'EN only' } });
  const fourth = card(third.snapshot, id, 'conversation', { heading: {} });
  const tree = resolveTextLibraryDocumentTree(fourth.snapshot, id);
  const projected = projectBookHeadings(tree);
  assert.deepEqual(Object.values(projected.cards).map(item => item.fallback), ['Paragraph 1', 'Scene 1', 'Paragraph 2', 'Scene 2']);
  assert.equal(projected.cards[second.result.id].id, 'Kereta');
  assert.equal(projected.cards[third.result.id].id, '');
  assert.equal(tree.blocks[3].title, null);
  assert.equal(Object.hasOwn(tree.blocks[3].metadata, BOOK_CARD_HEADING_KEY), false);
  const pref = normalizeTextMainReaderPreference({ version: 1, workspaceHeadingVisibility: {
    [tree.uid]: { mainTitle: false, scene: false, readScene: true, paragraph: true },
    other: { paragraph: false }
  } });
  assert.deepEqual(pref.workspaceHeadingVisibility[tree.uid], { mainTitle: false, scene: false, paragraph: true });
  const hidden = projectBookHeadings(tree, pref.workspaceHeadingVisibility[tree.uid]);
  assert.equal(hidden.mainTitle, null);
  assert.equal(hidden.cards[first.result.id].visible, true);
  assert.equal(hidden.cards[second.result.id].visible, false);
  assert.deepEqual(pref.workspaceHeadingVisibility.other, { paragraph: false });
});

test('Strict Speaker registration, empty Turns and both removal guards', () => {
  const start = create('conversation');
  const id = start.result.id;
  let { snapshot } = start;
  assert.throws(() => card(snapshot, id, 'conversation'), { code: 'BOOK_SPEAKER_THRESHOLD' });
  const register = (label, speakerId) => {
    const result = run(snapshot, 'speaker.register', { documentId: id, label, ...(speakerId ? { speakerId } : {}) }, id);
    snapshot = result.snapshot;
    return result.result.id;
  };
  const alice = register('Alice');
  assert.equal(register('ALICE'), alice);
  assert.equal(getTextStructuredSpeakerRegistry(snapshot.documents[0])[0].label, 'Alice');
  assert.throws(() => register('Someone else', alice), { code: 'BOOK_SPEAKER_IDENTITY_CONFLICT' });
  assert.throws(() => card(snapshot, id, 'conversation'), { code: 'BOOK_SPEAKER_THRESHOLD' });
  const bob = register('Bob');
  const scene = card(snapshot, id, 'conversation');
  snapshot = scene.snapshot;
  const turn = payload => run(snapshot, 'contentUnit.create', { blockId: scene.result.id, ...payload }, id);
  assert.throws(() => turn({}), { code: 'BOOK_TURN_SPEAKER_REQUIRED' });
  assert.throws(() => turn({ speaker: 'Alice' }), { code: 'BOOK_TURN_SPEAKER_REQUIRED' });
  assert.throws(() => turn({ speakerId: 'SPK_UNKNOWN' }), { code: 'OUT_OF_SCOPE' });
  assert.throws(() => turn({ speakerId: alice, speaker: 'Bob' }), { code: 'COMMAND_REJECTED' });
  const assigned = turn({ speakerId: alice });
  snapshot = assigned.snapshot;
  assert.equal(record(assigned, 'contentUnits').speakerId, alice);
  assert.equal(snapshot.segments.length, 0);
  const remove = speakerId => run(snapshot, 'speaker.remove', { documentId: id, speakerId }, id);
  assert.throws(() => remove(bob), { code: 'BOOK_SPEAKER_THRESHOLD' });
  register('Carol');
  assert.throws(() => remove(alice), { code: 'COMMAND_REJECTED', message: /in use/i });
  assert.equal(getTextStructuredSpeakerRegistry(remove(bob).snapshot.documents[0]).length, 2);
});

test('Older Workspaces stay readable and require an explicit valid saved Title before adding Body Cards', () => {
  const old = applyTextLibraryCommand(empty(), command('document.create', { title: 'Old', documentType: 'mixed' }), 1);
  const id = old.result.id;
  const prior = record(old, 'documents');
  assert.deepEqual(resolveBookMainTitle(prior), { saved: false, en: 'Old', id: '', mode: 'workspace-name', diagnostic: 'BOOK_MAIN_TITLE_REQUIRED' });
  assert.throws(() => card(old.snapshot, id), { code: 'BOOK_MAIN_TITLE_REQUIRED' });
  const oldRename = update(old.snapshot, id, { title: 'Old renamed' });
  assert.equal(Object.hasOwn(record(oldRename, 'documents').metadata, BOOK_MAIN_TITLE_KEY), false);
  const invalid = applyTextLibraryCommand(old.snapshot, command('document.update', { id,
    metadata: { [BOOK_MAIN_TITLE_KEY]: { mode: 'wrong', id: 'Judul lama' }, source: { keep: 'intact' } } }), 1);
  assert.equal(resolveBookMainTitle(record(invalid, 'documents')).diagnostic, 'BOOK_MAIN_TITLE_INVALID');
  assert.throws(() => update(invalid.snapshot, id, { title: 'Attempt' }), { code: 'BOOK_MAIN_TITLE_INVALID' });
  assert.throws(() => card(invalid.snapshot, id), { code: 'BOOK_MAIN_TITLE_INVALID' });
  const repaired = update(invalid.snapshot, id, { mainTitle: { mode: 'workspace-name' } });
  assert.deepEqual(record(repaired, 'documents').metadata, {
    [BOOK_MAIN_TITLE_KEY]: { mode: 'workspace-name', id: 'Judul lama' }, source: { keep: 'intact' }
  });
  assert.ok(card(repaired.snapshot, id).result.id);
  const scene = applyTextLibraryCommand(old.snapshot, command('block.create', { documentId: id, blockType: 'conversation',
    metadata: { [BOOK_CARD_HEADING_KEY]: { id: 'Historical ID only' } } }), 1);
  const unassigned = applyTextLibraryCommand(scene.snapshot, command('contentUnit.create', { blockId: scene.result.id }), 1);
  assert.equal(record(unassigned, 'contentUnits').speakerId, null);
  assert.equal(resolveBookCardHeading(record(scene, 'blocks')).diagnostic, 'BOOK_CARD_HEADING_INVALID');
  const titled = update(unassigned.snapshot, id, { mainTitle: { mode: 'workspace-name' } });
  assert.deepEqual(titled.snapshot.blocks, unassigned.snapshot.blocks);
  assert.deepEqual(titled.snapshot.contentUnits, unassigned.snapshot.contentUnits);
  const headingRepair = run(titled.snapshot, 'block.update', { id: scene.result.id, heading: { en: 'Restored Heading' } }, id);
  assert.deepEqual(resolveBookCardHeading(record(headingRepair, 'blocks')), { en: 'Restored Heading', id: 'Historical ID only', diagnostic: null });
  assert.deepEqual(headingRepair.snapshot.contentUnits, unassigned.snapshot.contentUnits);
});

for (const count of [0, 1, 2]) {
  test('Preserves ' + count + ' historical Title Cards and their authored order', () => {
    const old = applyTextLibraryCommand(empty(), command('document.create', { title: 'Legacy', documentType: 'paragraph' }), 1);
    const id = old.result.id;
    let { snapshot } = old;
    const titles = [];
    for (let n = 0; n < count; n++) {
      const legacy = applyTextLibraryCommand(snapshot, command('block.create', {
        documentId: id, blockType: 'paragraph', title: 'Legacy Title ' + n,
        metadata: { paragraphRoleV1: 'title', source: 'source-' + n, fullAudioArtifactsV1: { record: n } }
      }), 1);
      snapshot = legacy.snapshot;
      titles.push(legacy.result.id);
    }
    if (count > 0) {
      const blockId = titles[0];
      const unitId = snapshot.contentUnits.find(unit => unit.blockId === blockId).id;
      snapshot = applyTextLibraryCommand(snapshot, command('segment.create', { blockId, unitId, text: 'Legacy title body' }), 1).snapshot;
    }
    const repaired = update(snapshot, id, { mainTitle: { mode: 'workspace-name' } });
    for (const store of ['blocks', 'segments', 'contentUnits', 'audioVariants']) assert.deepEqual(repaired.snapshot[store], snapshot[store]);
    const withBody = card(repaired.snapshot, id);
    const projection = projectBookHeadings(resolveTextLibraryDocumentTree(withBody.snapshot, id));
    assert.deepEqual(Object.keys(projection.cards), [withBody.result.id]);
    assert.equal(projection.cards[withBody.result.id].fallback, 'Paragraph 1');
    assert.deepEqual(withBody.snapshot.blocks.slice(0, count).map(block => block.id), titles);
    if (count) {
      assert.throws(() => run(withBody.snapshot, 'block.update', { id: titles[0], heading: { en: 'Replacement' } }, id),
        { code: 'BOOK_LEGACY_TITLE_PROTECTED' });
    }
  });
}

test('Reserved metadata, role injection and untrusted policy flags cannot bypass command validation', () => {
  const before = create('paragraph');
  const id = before.result.id;
  const snapshot = before.snapshot;
  const original = structuredClone(snapshot);
  assert.throws(() => create('paragraph', { bookAuthoring: true }), { code: 'INVALID_COMMAND' });
  assert.throws(() => applyTextDataManagementCommand(snapshot,
    { ...command('document.update', { id, mainTitle: { mode: 'custom', en: 'Injected' } }), bookAuthoring: true },
    { ...access, bookAuthoring: false, selection: { workspaceId: id } }), { code: 'INVALID_COMMAND' });
  assert.throws(() => update(snapshot, id, { metadata: {} }), { code: 'PROTECTED_METADATA' });
  assert.throws(() => update(snapshot, id, { metadata: { [BOOK_MAIN_TITLE_KEY]: { mode: 'custom', en: 'Injected' } } }), { code: 'PROTECTED_METADATA' });
  assert.throws(() => card(snapshot, id, 'paragraph', { metadata: { paragraphRoleV1: 'title' } }), { code: 'INVALID_COMMAND' });
  assert.throws(() => card(snapshot, id, 'paragraph', { metadata: { [BOOK_CARD_HEADING_KEY]: undefined } }), { code: 'PROTECTED_METADATA' });
  const body = card(snapshot, id);
  assert.throws(() => run(body.snapshot, 'block.update', { id: body.result.id, metadata: { paragraphRoleV1: 'title' } }, id), { code: 'INVALID_COMMAND' });
  assert.deepEqual(snapshot, original);
  const prepared = validateAndScopeTextDataManagementCommand(snapshot, command('block.create', {
    documentId: id, blockType: 'paragraph', heading: { en: 'Heading', id: 'Judul' }
  }), { ...access, selection: { workspaceId: id } });
  assert.deepEqual(prepared.scoped.payload.metadata, { [BOOK_CARD_HEADING_KEY]: { id: 'Judul' } });
  assert.deepEqual(snapshot, original);
});

const londonIdentity = (snapshot, documentId) => {
  const tree = resolveTextLibraryDocumentTree(snapshot, documentId);
  const rf = buildTextStructuredAudioRequirementsForDocument({ documentTree: tree });
  const full = tree.blocks.flatMap(block => ['text', 'meaning'].map(channel => buildTextStructuredFullArtifactIdentity({
    block, channel, voiceId: channel === 'text' ? 'en-GB-LibbyNeural' : 'id-ID-GadisNeural',
    ...(block.blockType === 'conversation' ? { composition: rf.filter(item => item.blockId === block.id && item.channel === channel)
      .map(item => ({ renderFingerprint: item.renderFingerprint, playbackRate: 1 })) } : {})
  })));
  return {
    document: { id: tree.id, uid: tree.uid, documentType: tree.documentType, collectionId: tree.collectionId, order: tree.order },
    cards: tree.blocks.map(({ id, uid, documentId: parent, blockType, order, units, segments, metadata }) => {
      const protectedFields = { ...metadata };
      delete protectedFields[BOOK_CARD_HEADING_KEY];
      return { id, uid, parent, blockType, order, units, segments, metadata: protectedFields };
    }),
    variants: snapshot.audioVariants,
    rf,
    full
  };
};

test('London Heading-only edits retain all Body IDs, known order, 4 Cards, 11 Units, 37 Segments, 74 RF slots and 8 Full identities', () => {
  const { ids, snapshot: london } = createJourneyToLondonFixture();
  const { documentId } = ids;
  const tree = resolveTextLibraryDocumentTree(london, documentId);
  const block = tree.blocks[0];
  const artifact = buildTextStructuredFullArtifactRecord({ block, voiceId: 'en-GB-LibbyNeural', createdAt: 3 });
  const rf = buildTextStructuredAudioRequirementsForDocument({ documentTree: tree })[0];
  const withVariant = applyTextLibraryCommand(london, command('audioVariant.upsert', {
    segmentId: rf.segmentId, channel: rf.channel, engine: rf.engine, source: 'generated', voiceId: rf.voiceId,
    metadata: { audioRenderFingerprintV1: rf.renderFingerprint, audioRenderDescriptorV1: rf.renderDescriptor }
  }), 3);
  const seeded = applyTextLibraryCommand(withVariant.snapshot, command('block.update', {
    id: block.id, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: { source: { key: 'source-A' } }, artifact })
  }), 3).snapshot;
  const before = londonIdentity(seeded, documentId);
  assert.deepEqual(before.cards.map(item => item.id), Object.values(ids.cards));
  assert.deepEqual(before.cards.map(item => item.blockType), ['paragraph', 'conversation', 'paragraph', 'conversation']);
  assert.deepEqual(before.cards.flatMap(item => item.units).map(item => item.id), Object.values(ids.units));
  assert.deepEqual(before.cards.flatMap(item => item.segments).map(item => item.id), ids.segmentIds);
  assert.deepEqual([seeded.blocks.length, seeded.contentUnits.length, seeded.segments.length, before.rf.length, before.full.length], [4, 11, 37, 74, 8]);
  assert.ok(before.rf.every(item => /^rf-sha256-[0-9a-f]{64}$/.test(item.renderFingerprint)));
  assert.ok(before.full.every(item => /^full-sha256-[0-9a-f]{64}$/.test(item.fullArtifactFingerprint)));
  assert.equal(before.variants.length, 1);
  assert.equal(before.cards[0].metadata.fullAudioArtifactsV1.artifacts[0].fullArtifactFingerprint, artifact.fullArtifactFingerprint);
  let snapshot = update(seeded, documentId, { mainTitle: { mode: 'custom', en: 'London', id: 'Perjalanan ke London' } }).snapshot;
  assert.deepEqual(londonIdentity(snapshot, documentId), before);
  for (const id of Object.values(ids.cards)) {
    snapshot = run(snapshot, 'block.update', { id, heading: { en: 'Heading ' + id, id: 'Judul ' + id } }, documentId).snapshot;
  }
  assert.deepEqual(londonIdentity(snapshot, documentId), before);
  const { [BOOK_CARD_HEADING_KEY]: heading, ...rest } = snapshot.blocks[0].metadata;
  assert.deepEqual(heading, { id: 'Judul ' + snapshot.blocks[0].id });
  assert.deepEqual(rest, seeded.blocks[0].metadata);
  assert.deepEqual(snapshot.counters, seeded.counters);
});

test('Text Pack copy/preserve and database Backup retain exact Title and Heading fields', () => {
  const mixed = create('mixed', { mainTitle: { mode: 'workspace-name', id: 'Judul utama' } });
  const authored = card(mixed.snapshot, mixed.result.id, 'paragraph', { heading: { en: 'First', id: 'Pertama' } });
  const custom = update(authored.snapshot, mixed.result.id, { mainTitle: { mode: 'custom', en: 'Independent Book Title' } });
  for (const { snapshot } of [authored, custom]) {
    const pack = createProLingoTextPack({ snapshot, rootId: mixed.result.id });
    for (const uidMode of ['new-copy', 'preserve']) {
      const { snapshot: copied } = mergeProLingoTextPack({ localSnapshot: empty(), pack: JSON.parse(JSON.stringify(pack)), uidMode });
      assert.deepEqual(copied.documents[0].metadata[BOOK_MAIN_TITLE_KEY], snapshot.documents[0].metadata[BOOK_MAIN_TITLE_KEY]);
      assert.equal(copied.blocks[0].title, 'First');
      assert.deepEqual(copied.blocks[0].metadata[BOOK_CARD_HEADING_KEY], { id: 'Pertama' });
      for (const store of ['documents', 'blocks', 'contentUnits']) {
        assert.equal(copied[store][0].uid === snapshot[store][0].uid, uidMode === 'preserve');
      }
    }
    const metaRecords = Object.entries({ schemaVersion: snapshot.schemaVersion, initialized: snapshot.initialized,
      activeDocumentId: snapshot.activeDocumentId, idCounters: snapshot.counters, contentUnitMigration: snapshot.contentUnitMigration })
      .map(([key, value]) => ({ key, value }));
    const backup = exportTextManagementData(snapshot, { kind: 'database-backup', metaRecords });
    const { snapshot: restored } = inspectTextManagementTransfer({ kind: 'database-backup', data: JSON.stringify(backup) });
    for (const store of ['documents', 'blocks', 'contentUnits', 'segments', 'audioVariants']) assert.deepEqual(restored[store], snapshot[store]);
  }
});
