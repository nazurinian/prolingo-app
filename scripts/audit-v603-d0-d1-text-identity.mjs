import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  backfillTextGlobalUids,
  collectTextGlobalUidDiagnostics,
  isTextGlobalUid,
  TEXT_GLOBAL_UID_KINDS
} from '../src/domain/text/textGlobalIdentityDomain.js';
import {
  createTextAudioVariantRecord,
  createTextBlockRecord,
  createTextCollectionRecord,
  createTextDocumentRecord,
  createTextSegmentRecord,
  normalizeTextLibraryRuntimeSnapshot
} from '../src/domain/text/textLibraryDomain.js';
import { applyTextLibraryCommand, TEXT_LIBRARY_COMMAND_TYPES } from '../src/domain/text/textLibraryCommandDomain.js';
import {
  createProLingoTextPack,
  mergeProLingoTextPack,
  PROLINGO_TEXT_PACK_UID_MODE_NEW_COPY,
  PROLINGO_TEXT_PACK_UID_MODE_PRESERVE
} from '../src/domain/text/textPackJsonDomain.js';
import { createProLingoTextDatabaseBackup, validateProLingoTextDatabaseBackup } from '../src/domain/text/textDatabaseBackupDomain.js';
import { createTextSourceAttachmentFromMerge, planTextSourceSync } from '../src/domain/text/textSourceAttachmentDomain.js';
import { buildCanonicalTextAudioFilename } from '../src/domain/text/textFilenameDomain.js';
import { TEXT_LIBRARY_META_KEYS } from '../src/constants/textDatabaseConstants.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const EXPECTED_TABLE_COMPONENTS_SHA256 = '024aa45bdda4028723a08b91f0a259e5f7e4efe21b9c4ebcb1b7b0003352b767';

const treeHash = directory => {
  const rootDir = path.resolve(directory);
  const files = [];
  const walk = current => {
    for (const name of fs.readdirSync(current).sort()) {
      const target = path.join(current, name);
      const stat = fs.statSync(target);
      if (stat.isDirectory()) walk(target);
      else files.push(target);
    }
  };
  walk(rootDir);
  const h = crypto.createHash('sha256');
  for (const file of files) {
    const rel = path.relative(rootDir, file).replaceAll(path.sep, '/');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest();
    h.update(rel); h.update('\0'); h.update(digest);
  }
  return h.digest('hex');
};

const emptySnapshot = () => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1,
  initialized: true,
  activeDocumentId: null,
  counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
  collections: [], documents: [], blocks: [], segments: [], audioVariants: []
});

const legacyCompatibleSnapshot = documentType => {
  const collection = createTextCollectionRecord({ id: 'COLL_000001', title: 'Book', order: 1 });
  const document = createTextDocumentRecord({
    id: 'DOC_000001', collectionId: collection.id, order: 1, title: `Fixture ${documentType}`,
    documentType, editorModel: 'structured-v1',
    metadata: documentType === 'conversation' || documentType === 'mixed'
      ? { speakerRegistryV1: [{ id: 'SPK_TEST_A', label: 'A' }, { id: 'SPK_TEST_B', label: 'B' }] }
      : {}
  });
  const paragraph = documentType !== 'conversation'
    ? createTextBlockRecord({ id: 'TEXT_000001', documentId: document.id, order: 1, blockType: 'paragraph' })
    : null;
  const conversation = documentType !== 'paragraph'
    ? createTextBlockRecord({ id: paragraph ? 'TEXT_000002' : 'TEXT_000001', documentId: document.id, order: paragraph ? 2 : 1, blockType: 'conversation' })
    : null;
  const blocks = [paragraph, conversation].filter(Boolean);
  const segments = [];
  let seq = 0;
  if (paragraph) {
    seq += 1;
    segments.push(createTextSegmentRecord({ id: `SEGMENT_${String(seq).padStart(6, '0')}`, documentId: document.id, blockId: paragraph.id, order: 1, text: 'Hello world.' }));
  }
  if (conversation) {
    seq += 1;
    segments.push(createTextSegmentRecord({ id: `SEGMENT_${String(seq).padStart(6, '0')}`, documentId: document.id, blockId: conversation.id, order: 1, text: 'Good morning.', speaker: 'A', metadata: { speakerIdentityV1: 'SPK_TEST_A' } }));
  }
  const audioVariants = segments.length ? [createTextAudioVariantRecord({
    id: 'TXTAUDIO_000001', segmentId: segments[0].id, channel: 'text', engine: 'edge', voiceId: 'en-GB-RyanNeural'
  })] : [];
  return normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1, initialized: true, activeDocumentId: document.id,
    counters: { collection: 1, document: 1, text: blocks.length, segment: segments.length, audioVariant: audioVariants.length },
    collections: [collection], documents: [document], blocks, segments, audioVariants
  });
};

const assertUidSnapshot = snapshot => {
  const diagnostics = collectTextGlobalUidDiagnostics(snapshot);
  assert.equal(diagnostics.valid, true, JSON.stringify(diagnostics));
  snapshot.collections.forEach(r => assert(isTextGlobalUid(r.uid, TEXT_GLOBAL_UID_KINDS.COLLECTION)));
  snapshot.documents.forEach(r => assert(isTextGlobalUid(r.uid, TEXT_GLOBAL_UID_KINDS.WORKSPACE)));
  snapshot.blocks.forEach(r => assert(isTextGlobalUid(r.uid, TEXT_GLOBAL_UID_KINDS.CARD)));
  snapshot.segments.forEach(r => assert(isTextGlobalUid(r.uid, TEXT_GLOBAL_UID_KINDS.SEGMENT)));
  snapshot.audioVariants.forEach(r => assert(isTextGlobalUid(r.uid, TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT)));
};

let checks = 0;
const pass = fn => { fn(); checks += 1; };

const contractFixtures = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/v603-d0-data-audio-contract-fixtures.json'), 'utf8'));
pass(() => assert.deepEqual(Object.keys(contractFixtures.workspaceFamilies).sort(), ['conversation', 'legacy', 'mix', 'paragraph']));
pass(() => assert.deepEqual(Object.keys(contractFixtures.externalImportCases).sort(), ['base', 'conflict', 'exactDuplicate', 'newCopy', 'update']));
pass(() => assert.equal(contractFixtures.browserPortability.browserB.renderRequestMustMatchBrowserA, true));

for (const type of ['paragraph', 'conversation', 'mixed']) {
  const oldSnapshot = legacyCompatibleSnapshot(type);
  const first = backfillTextGlobalUids(oldSnapshot);
  pass(() => assert.equal(first.changed, true));
  pass(() => assertUidSnapshot(first.snapshot));
  const second = backfillTextGlobalUids(first.snapshot);
  pass(() => assert.equal(second.changed, false));
  pass(() => assert.deepEqual(second.snapshot, first.snapshot));
}

// Legacy-family compatibility is represented by the same Collection/Document/Block/Segment
// stores; its local sequential IDs remain valid aliases while global UIDs are additive.
{
  const old = legacyCompatibleSnapshot('paragraph');
  old.documents[0] = { ...old.documents[0], documentType: 'mixed', editorModel: 'legacy-line-v1' };
  const first = backfillTextGlobalUids(old);
  pass(() => assertUidSnapshot(first.snapshot));
}

let snapshot = backfillTextGlobalUids(legacyCompatibleSnapshot('mixed')).snapshot;
const originalDocumentUid = snapshot.documents[0].uid;
const originalSegmentUid = snapshot.segments[0].uid;

let result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT, payload: { id: 'DOC_000001', title: 'Renamed' } }, 1000);
snapshot = result.snapshot;
pass(() => assert.equal(snapshot.documents[0].uid, originalDocumentUid));

result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK, payload: { documentId: 'DOC_000001', blockType: 'paragraph', title: 'New Card' } }, 1001);
snapshot = result.snapshot;
const createdBlock = snapshot.blocks.find(r => r.id === result.result.id);
pass(() => assert(isTextGlobalUid(createdBlock.uid, TEXT_GLOBAL_UID_KINDS.CARD)));

result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT, payload: { blockId: createdBlock.id, text: 'One. Two.', meaning: 'Satu. Dua.' } }, 1002);
snapshot = result.snapshot;
const createdSegment = snapshot.segments.find(r => r.id === result.result.id);
pass(() => assert(isTextGlobalUid(createdSegment.uid, TEXT_GLOBAL_UID_KINDS.SEGMENT)));

result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.SPLIT_PARAGRAPH_SEGMENT, payload: { id: createdSegment.id, parts: [
  { text: 'One.', meaning: 'Satu.', joinAfter: 'space' },
  { text: 'Two.', meaning: 'Dua.', joinAfter: 'space' }
] } }, 1003);
snapshot = result.snapshot;
const splitRetained = snapshot.segments.find(r => r.id === createdSegment.id);
const splitCreated = snapshot.segments.find(r => r.id === result.result.createdIds[0]);
pass(() => assert.equal(splitRetained.uid, createdSegment.uid));
pass(() => assert(isTextGlobalUid(splitCreated.uid, TEXT_GLOBAL_UID_KINDS.SEGMENT)));
pass(() => assert.notEqual(splitCreated.uid, splitRetained.uid));

result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.MERGE_PARAGRAPH_SEGMENTS, payload: { ids: [splitRetained.id, splitCreated.id] } }, 1004);
snapshot = result.snapshot;
pass(() => assert.equal(snapshot.segments.find(r => r.id === splitRetained.id).uid, splitRetained.uid));

result = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT, payload: { segmentId: splitRetained.id, channel: 'text', engine: 'edge', source: 'generated', voiceId: 'en-GB-RyanNeural' } }, 1005);
snapshot = result.snapshot;
pass(() => assert(isTextGlobalUid(snapshot.audioVariants.find(r => r.id === result.result.id).uid, TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT)));

// ProLingo-originated attach preserves portable UIDs in a fresh database.
const pack = createProLingoTextPack({ snapshot, scopeType: 'document', rootId: 'DOC_000001', now: 2000 });
const sourceDocUid = pack.documents[0].uid;
const preserveMerge = mergeProLingoTextPack({ localSnapshot: emptySnapshot(), pack, now: 2001, uidMode: PROLINGO_TEXT_PACK_UID_MODE_PRESERVE });
pass(() => assert.equal(preserveMerge.snapshot.documents[0].uid, sourceDocUid));
pass(() => assertUidSnapshot(preserveMerge.snapshot));

// A rare incoming UID collision must never rewrite the established local entity UID.
const collisionMerge = mergeProLingoTextPack({ localSnapshot: snapshot, pack, now: 20015, uidMode: PROLINGO_TEXT_PACK_UID_MODE_PRESERVE });
const collisionImportedDocument = collisionMerge.snapshot.documents.find(r => collisionMerge.imported.documentIds.includes(r.id));
pass(() => assert.equal(collisionMerge.snapshot.documents.find(r => r.id === 'DOC_000001').uid, sourceDocUid));
pass(() => assert.notEqual(collisionImportedDocument.uid, sourceDocUid));

// Attached-source Sync preserves established internal UIDs while content changes in place.
const attached = createTextSourceAttachmentFromMerge({ pack, merged: preserveMerge, fileName: 'fixture.json', now: 20016 });
const updatedPack = structuredClone(pack);
updatedPack.segments[0].text = `${updatedPack.segments[0].text} Updated`;
const syncPlan = planTextSourceSync({ localSnapshot: attached.snapshot, pack: updatedPack, attachment: attached.attachment, fileName: 'fixture.json', now: 20017 });
const mappedDocumentId = attached.attachment.idMap.documents[pack.documents[0].id];
const mappedSegmentId = attached.attachment.idMap.segments[pack.segments[0].id];
pass(() => assert.equal(syncPlan.ok, true));
pass(() => assert.equal(syncPlan.snapshot.documents.find(r => r.id === mappedDocumentId).uid, attached.snapshot.documents.find(r => r.id === mappedDocumentId).uid));
pass(() => assert.equal(syncPlan.snapshot.segments.find(r => r.id === mappedSegmentId).uid, attached.snapshot.segments.find(r => r.id === mappedSegmentId).uid));

// Import-as-Copy is intentionally a new logical entity and therefore gets new UIDs.
const copyMerge = mergeProLingoTextPack({ localSnapshot: snapshot, pack, now: 2002, uidMode: PROLINGO_TEXT_PACK_UID_MODE_NEW_COPY });
const importedDocument = copyMerge.snapshot.documents.find(r => copyMerge.imported.documentIds.includes(r.id));
pass(() => assert.notEqual(importedDocument.uid, sourceDocUid));
pass(() => assertUidSnapshot(copyMerge.snapshot));

// Backup v1 remains wire-compatible and preserves new additive UID fields.
const metaRecords = [
  { key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: 1 },
  { key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true },
  { key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: snapshot.activeDocumentId },
  { key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: snapshot.counters }
];
const backup = createProLingoTextDatabaseBackup({
  metaRecords,
  stores: { collections: snapshot.collections, documents: snapshot.documents, blocks: snapshot.blocks, segments: snapshot.segments, audioVariants: snapshot.audioVariants },
  now: 3000
});
const restored = validateProLingoTextDatabaseBackup(backup).snapshot;
pass(() => assert.equal(restored.documents[0].uid, snapshot.documents[0].uid));
pass(() => assert.equal(restored.segments.find(r => r.id === 'SEGMENT_000001')?.uid, originalSegmentUid));
pass(() => assertUidSnapshot(restored));

// Existing v1 filename remains unchanged in D1.
pass(() => assert.equal(
  buildCanonicalTextAudioFilename({ audioVariantId: 'TXTAUDIO_000001', segmentId: 'SEGMENT_000001', channel: 'text', engine: 'edge', voiceId: 'en-GB-RyanNeural' }),
  'SEGMENT_000001__TEXT__EDGE__Ryan__TXTAUDIO_000001.mp3'
));

pass(() => assert.equal(treeHash(path.join(root, 'src/components/table')), EXPECTED_TABLE_COMPONENTS_SHA256));

console.log(`PASS D0/D1 Text identity audit: ${checks} checks`);
console.log(`Table components SHA-256: ${EXPECTED_TABLE_COMPONENTS_SHA256}`);
