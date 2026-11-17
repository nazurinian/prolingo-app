import { createP13MixedFixture } from '../p13-mixed/mixed-workspace-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../../../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge } from '../../../src/domain/text/textSourceAttachmentDomain.js';
export const createP15Fixture = () => {
  const mixed = createP13MixedFixture();
  let snapshot = mixed.snapshot;
  const apply = (type, payload) => { const out = applyTextLibraryCommand(snapshot, { type, payload }, 15000); snapshot = out.snapshot; return out.result.id; };
  const collectionId = apply('collection.create', { title: 'P15 Collection' });
  apply('document.update', { id: mixed.ids.documentId, collectionId });
  const paragraphId = apply('document.create', { collectionId, documentType: 'paragraph', title: 'Paragraph management' });
  const paragraphCardId = apply('block.create', { documentId: paragraphId, blockType: 'paragraph' });
  const paragraphUnitId = snapshot.contentUnits.find(u => u.blockId === paragraphCardId).id;
  const paragraphSegmentId = apply('segment.create', { blockId: paragraphCardId, unitId: paragraphUnitId, text: 'Same words.', meaning: 'Arti.' });
  const legacyId = apply('document.create', { editorModel: 'legacy-line-v1', title: 'Protected Legacy' });
  const pack = createProLingoTextPack({ snapshot, scopeType: 'document', rootId: mixed.ids.documentId, now: 15001 });
  const merged = mergeProLingoTextPack({ localSnapshot: snapshot, pack, now: 15002 });
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 15002 });
  return { ...mixed, snapshot: attached.snapshot, pack, sourceAttachments: [attached.attachment],
    ids: { ...mixed.ids, collectionId, paragraphId, paragraphCardId, paragraphUnitId, paragraphSegmentId, legacyId,
      attachedId: merged.idMap.documents[mixed.ids.documentId] } };
};
