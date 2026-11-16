import { createD4aConversationFixture } from '../d4a/conversation-editor-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';

// Disposable snapshots only. Uses existing commands; never opens a database.
export const createA1PresentationFixture = () => {
  const base = createD4aConversationFixture();
  let snapshot = base.snapshot;
  const apply = (type, payload) => {
    const result = applyTextLibraryCommand(snapshot, { type, payload }, 700);
    snapshot = result.snapshot;
    return result.result.id;
  };
  const paragraphDocumentId = apply('document.create', { title: 'A1 Sections', documentType: 'paragraph' });
  const paragraphCardId = apply('block.create', { documentId: paragraphDocumentId, blockType: 'paragraph' });
  const firstSectionId = snapshot.contentUnits.find(unit => unit.blockId === paragraphCardId)?.id
    || apply('contentUnit.create', { blockId: paragraphCardId, kind: 'paragraph' });
  const firstParagraphSegmentId = apply('segment.create', { blockId: paragraphCardId, unitId: firstSectionId,
    text: '  Same words.  ', meaning: '  Arti pertama.  ', joinAfter: 'line' });
  const secondParagraphSegmentId = apply('segment.create', { blockId: paragraphCardId, unitId: firstSectionId,
    text: 'Same words.', meaning: '', joinAfter: 'paragraph' });
  const secondSectionId = apply('contentUnit.create', { blockId: paragraphCardId, kind: 'paragraph', text: 'Third sentence.', meaning: 'Arti ketiga.' });
  const emptySectionId = apply('contentUnit.create', { blockId: paragraphCardId, kind: 'paragraph' });
  const zeroParagraphCardId = apply('block.create', { documentId: paragraphDocumentId, blockType: 'paragraph' });
  for (const unit of snapshot.contentUnits.filter(unit => unit.blockId === zeroParagraphCardId)) apply('contentUnit.delete', { id: unit.id });
  // Restored raw content may contain whitespace; command authoring trims it.
  snapshot = { ...snapshot, segments: snapshot.segments.map(segment => segment.id === firstParagraphSegmentId
    ? { ...segment, text: '  Same words.  ', meaning: '  Arti pertama.  ' } : segment) };
  return { snapshot, ids: { ...base.ids, paragraphDocumentId, paragraphCardId, zeroParagraphCardId, firstSectionId, secondSectionId,
    emptySectionId, firstParagraphSegmentId, secondParagraphSegmentId } };
};

export const createA1V1ParagraphFixture = () => {
  let snapshot = { schemaVersion: 1, initialized: true, activeDocumentId: null, counters: {},
    collections: [], documents: [], blocks: [], segments: [], audioVariants: [] };
  const apply = (type, payload) => {
    const result = applyTextLibraryCommand(snapshot, { type, payload }, 701);
    snapshot = result.snapshot;
    return result.result.id;
  };
  const documentId = apply('document.create', { documentType: 'paragraph', title: 'V1 compatibility' });
  const cardId = apply('block.create', { documentId, blockType: 'paragraph' });
  const segmentId = apply('segment.create', { blockId: cardId, text: 'V1 sentence.', meaning: 'Arti V1.' });
  const secondSegmentId = apply('segment.create', { blockId: cardId, text: 'V1 second sentence.', meaning: '' });
  const emptyCardId = apply('block.create', { documentId, blockType: 'paragraph' });
  return { snapshot, ids: { documentId, cardId, emptyCardId, segmentId, secondSegmentId } };
};
