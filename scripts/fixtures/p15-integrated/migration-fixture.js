import { createA1V1ParagraphFixture } from '../shared-card-a1/presentation-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../../../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge } from '../../../src/domain/text/textSourceAttachmentDomain.js';
export const createMigrationFixture = () => {
  const base = createA1V1ParagraphFixture(); let snapshot = base.snapshot;
  const apply = (type, payload) => { const out = applyTextLibraryCommand(snapshot, { type, payload }, 20000); snapshot = out.snapshot; return out.result.id; };
  const collectionId = apply('collection.create', { title: 'Migration Book' });
  apply('document.update', { id: base.ids.documentId, collectionId, metadata: { externalSourceV1: { externalSourceKey: 'fixture-source' } } });
  const mixedId = apply('document.create', { documentType: 'mixed', title: 'V1 Mixed conversion' });
  const paragraph = apply('block.create', { documentId: mixedId, blockType: 'paragraph' });
  apply('segment.create', { blockId: paragraph, text: 'Introduction.', meaning: 'Pengantar.' });
  const scene = apply('block.create', { documentId: mixedId, blockType: 'conversation', metadata: { fullAudioArtifactsV1: { fixtureOpaque: true } } });
  apply('segment.create', { blockId: scene, text: 'Hello.', meaning: 'Halo.', speaker: 'Alice' });
  apply('segment.create', { blockId: scene, text: 'Again.', meaning: '', speaker: 'Alice' });
  apply('segment.create', { blockId: scene, text: 'Welcome.', meaning: 'Selamat.', speaker: 'Bob' });
  const legacyId = apply('document.create', { documentType: 'paragraph', title: 'Restored Legacy remains isolated' });
  const legacyCard = apply('block.create', { documentId: legacyId, blockType: 'paragraph' });
  apply('segment.create', { blockId: legacyCard, text: 'Legacy row.', meaning: 'Baris lama.' });
  // Restored fixture boundary, not a command or a live Legacy write.
  snapshot = { ...snapshot, documents: snapshot.documents.map(d => d.id === legacyId ? { ...d, editorModel: 'legacy-line-v1', documentType: 'mixed' } : d) };
  apply('audioVariant.upsert', { segmentId: base.ids.segmentId, engine: 'edge', source: 'generated', channel: 'text', voiceId: 'en-GB-LibbyNeural',
    metadata: { audioRenderFingerprintV1: 'unchanged-fixture-rf', staging: { reference: 'logical-only' } }, filename: 'fixture.mp3' });
  const pack = createProLingoTextPack({ snapshot, scopeType: 'document', rootId: base.ids.documentId, now: 20000 });
  const merged = mergeProLingoTextPack({ localSnapshot: snapshot, pack, now: 20000 });
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 20000 });
  snapshot = attached.snapshot;
  const metaRecords = Object.entries({ schemaVersion: 1, initialized: true, activeDocumentId: snapshot.activeDocumentId, idCounters: snapshot.counters,
    sourceAttachments: [attached.attachment], externalSourceImports: [{ externalSourceKey: 'fixture-source', documentId: base.ids.documentId }],
    legacyMigration: { retained: true }, unknownFutureKey: { preserve: [1, 2] } }).map(([key, value]) => ({ key, value, updatedAt: 20000 }));
  return { snapshot, metaRecords, ids: { ...base.ids, mixedId, scene, legacyId } };
};
