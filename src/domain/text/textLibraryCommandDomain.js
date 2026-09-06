import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  createTextAudioVariantRecord,
  createTextBlockRecord,
  createTextCollectionRecord,
  createTextDocumentRecord,
  createTextSegmentRecord,
  formatTextLibraryId,
  getTextLibraryIdSequence,
  normalizeTextIdCounters,
  normalizeTextLibraryRuntimeSnapshot
} from './textLibraryDomain.js';
import { getTextStructuredAudioVariantKey } from './textStructuredAudioIdentityDomain.js';
import { getTextIdSequence } from './textIdentityDomain.js';

const COMMAND_TYPES = Object.freeze({
  CREATE_COLLECTION: 'collection.create',
  UPDATE_COLLECTION: 'collection.update',
  DELETE_COLLECTION: 'collection.delete',
  REORDER_COLLECTIONS: 'collection.reorder',
  CREATE_DOCUMENT: 'document.create',
  UPDATE_DOCUMENT: 'document.update',
  DELETE_DOCUMENT: 'document.delete',
  REORDER_DOCUMENTS: 'document.reorder',
  SET_ACTIVE_DOCUMENT: 'document.setActive',
  CREATE_BLOCK: 'block.create',
  UPDATE_BLOCK: 'block.update',
  DELETE_BLOCK: 'block.delete',
  REORDER_BLOCKS: 'block.reorder',
  CREATE_SEGMENT: 'segment.create',
  UPDATE_SEGMENT: 'segment.update',
  DELETE_SEGMENT: 'segment.delete',
  REORDER_SEGMENTS: 'segment.reorder',
  UPSERT_AUDIO_VARIANT: 'audioVariant.upsert',
  DELETE_AUDIO_VARIANT: 'audioVariant.delete'
});

export const TEXT_LIBRARY_COMMAND_TYPES = COMMAND_TYPES;

const counterKeyByKind = Object.freeze({
  COLLECTION: 'collection',
  DOCUMENT: 'document',
  BLOCK: 'text',
  SEGMENT: 'segment',
  AUDIO_VARIANT: 'audioVariant'
});

const normalizeTitle = (value, fallback) => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeNullableId = value => {
  const text = String(value ?? '').trim();
  return text || null;
};

const sortByOrderThenId = records => [...records].sort((a, b) => {
  const orderDelta = Number(a.order || 0) - Number(b.order || 0);
  return orderDelta || String(a.id).localeCompare(String(b.id));
});

const maxOrder = records => records.reduce((max, record) => Math.max(max, Number(record.order) || 0), 0);

const floorCountersFromSnapshot = snapshotCandidate => {
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate);
  const counters = normalizeTextIdCounters(snapshot.counters);
  return {
    collection: Math.max(counters.collection, ...snapshot.collections.map(item => getTextLibraryIdSequence('COLLECTION', item.id)), 0),
    document: Math.max(counters.document, ...snapshot.documents.map(item => getTextLibraryIdSequence('DOCUMENT', item.id)), 0),
    text: Math.max(counters.text, ...snapshot.blocks.map(item => getTextIdSequence(item.id)), 0),
    segment: Math.max(counters.segment, ...snapshot.segments.map(item => getTextLibraryIdSequence('SEGMENT', item.id)), 0),
    audioVariant: Math.max(counters.audioVariant, ...snapshot.audioVariants.map(item => getTextLibraryIdSequence('AUDIO_VARIANT', item.id)), 0)
  };
};

const allocateIdentity = (snapshot, kind) => {
  const key = counterKeyByKind[kind];
  if (!key) throw new Error(`Unsupported Text command identity kind: ${kind}`);
  const counters = floorCountersFromSnapshot(snapshot);
  counters[key] += 1;
  return {
    id: formatTextLibraryId(kind, counters[key]),
    counters
  };
};

const findCollection = (snapshot, id) => snapshot.collections.find(item => item.id === id) || null;
const findDocument = (snapshot, id) => snapshot.documents.find(item => item.id === id) || null;
const findBlock = (snapshot, id) => snapshot.blocks.find(item => item.id === id) || null;
const findSegment = (snapshot, id) => snapshot.segments.find(item => item.id === id) || null;
const findAudioVariant = (snapshot, id) => snapshot.audioVariants.find(item => item.id === id) || null;

const requireCollection = (snapshot, id) => {
  const record = findCollection(snapshot, id);
  if (!record) throw new Error(`Text collection not found: ${id}`);
  return record;
};

const requireDocument = (snapshot, id) => {
  const record = findDocument(snapshot, id);
  if (!record) throw new Error(`Text document not found: ${id}`);
  return record;
};

const requireBlock = (snapshot, id) => {
  const record = findBlock(snapshot, id);
  if (!record) throw new Error(`Text block not found: ${id}`);
  return record;
};

const requireSegment = (snapshot, id) => {
  const record = findSegment(snapshot, id);
  if (!record) throw new Error(`Text segment not found: ${id}`);
  return record;
};

const requireAudioVariant = (snapshot, id) => {
  const record = findAudioVariant(snapshot, id);
  if (!record) throw new Error(`Text audio variant not found: ${id}`);
  return record;
};

const requireStructuredDocument = (snapshot, documentId) => {
  const document = requireDocument(snapshot, documentId);
  if (document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
    throw new Error(`Structured command refused for legacy Text document ${documentId}`);
  }
  return document;
};

const normalizeExactOrderIds = (records, orderedIds, label) => {
  const currentIds = sortByOrderThenId(records).map(item => item.id);
  const nextIds = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  if (nextIds.length !== currentIds.length || new Set(nextIds).size !== nextIds.length) {
    throw new Error(`${label} reorder requires every sibling identity exactly once`);
  }
  const currentSet = new Set(currentIds);
  if (nextIds.some(id => !currentSet.has(id))) {
    throw new Error(`${label} reorder contains an identity outside the sibling group`);
  }
  return nextIds;
};

const applyContiguousOrder = (records, orderedIds, now) => {
  const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]));
  return records.map(record => orderById.has(record.id)
    ? { ...record, order: orderById.get(record.id), updatedAt: now }
    : record);
};

const compactOrderGroup = (allRecords, predicate, now) => {
  const ordered = sortByOrderThenId(allRecords.filter(predicate));
  const orderById = new Map(ordered.map((record, index) => [record.id, index + 1]));
  return allRecords.map(record => orderById.has(record.id) && record.order !== orderById.get(record.id)
    ? { ...record, order: orderById.get(record.id), updatedAt: now }
    : record);
};

const assertBlockTypeAllowed = (document, blockType) => {
  if (document.documentType === 'paragraph' && blockType !== 'paragraph') {
    throw new Error(`Paragraph document ${document.id} cannot contain ${blockType} block`);
  }
  if (document.documentType === 'conversation' && blockType !== 'conversation') {
    throw new Error(`Conversation document ${document.id} cannot contain ${blockType} block`);
  }
};

const resolveDocumentSiblings = (snapshot, collectionId) => snapshot.documents.filter(item => (item.collectionId || null) === (collectionId || null));

const resolveNextActiveDocumentId = (documents, removedId, currentActiveId) => {
  if (currentActiveId !== removedId) return currentActiveId || null;
  return sortByOrderThenId(documents.filter(item => item.id !== removedId))[0]?.id || null;
};

const finalize = (snapshot, result) => {
  const normalized = normalizeTextLibraryRuntimeSnapshot(snapshot);
  return { snapshot: normalized, result };
};

const createCollection = (snapshot, payload, now) => {
  const allocated = allocateIdentity(snapshot, 'COLLECTION');
  const record = createTextCollectionRecord({
    id: allocated.id,
    title: normalizeTitle(payload?.title, 'Untitled Collection'),
    order: maxOrder(snapshot.collections) + 1,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  return finalize({
    ...snapshot,
    counters: allocated.counters,
    collections: [...snapshot.collections, record]
  }, { entity: 'collection', action: 'create', id: record.id });
};

const updateCollection = (snapshot, payload, now) => {
  const current = requireCollection(snapshot, payload?.id);
  const record = createTextCollectionRecord({
    ...current,
    title: payload?.title === undefined ? current.title : payload.title,
    updatedAt: now,
    metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
  });
  return finalize({
    ...snapshot,
    collections: snapshot.collections.map(item => item.id === record.id ? record : item)
  }, { entity: 'collection', action: 'update', id: record.id });
};

const deleteCollection = (snapshot, payload, now) => {
  const current = requireCollection(snapshot, payload?.id);
  const childDocuments = snapshot.documents.filter(item => item.collectionId === current.id);
  if (childDocuments.length) {
    throw new Error(`Collection ${current.id} is not empty; move or delete its documents first`);
  }
  const remainingCollections = snapshot.collections.filter(item => item.id !== current.id);
  return finalize({
    ...snapshot,
    collections: compactOrderGroup(remainingCollections, () => true, now)
  }, { entity: 'collection', action: 'delete', id: current.id });
};

const reorderCollections = (snapshot, payload, now) => {
  const ids = normalizeExactOrderIds(snapshot.collections, payload?.orderedIds, 'Collection');
  return finalize({
    ...snapshot,
    collections: applyContiguousOrder(snapshot.collections, ids, now)
  }, { entity: 'collection', action: 'reorder', orderedIds: ids });
};

const createDocument = (snapshot, payload, now) => {
  const collectionId = normalizeNullableId(payload?.collectionId);
  if (collectionId) requireCollection(snapshot, collectionId);
  const allocated = allocateIdentity(snapshot, 'DOCUMENT');
  const siblings = resolveDocumentSiblings(snapshot, collectionId);
  const record = createTextDocumentRecord({
    id: allocated.id,
    title: normalizeTitle(payload?.title, 'Untitled Text'),
    collectionId,
    order: maxOrder(siblings) + 1,
    documentType: payload?.documentType || 'mixed',
    textLanguage: payload?.textLanguage,
    meaningLanguage: payload?.meaningLanguage,
    editorModel: TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  const makeActive = payload?.makeActive === true || !snapshot.activeDocumentId;
  return finalize({
    ...snapshot,
    counters: allocated.counters,
    activeDocumentId: makeActive ? record.id : snapshot.activeDocumentId,
    documents: [...snapshot.documents, record]
  }, { entity: 'document', action: 'create', id: record.id, activeDocumentId: makeActive ? record.id : snapshot.activeDocumentId });
};

const updateDocument = (snapshot, payload, now) => {
  const current = requireDocument(snapshot, payload?.id);
  const requestedCollectionId = payload?.collectionId === undefined ? current.collectionId : normalizeNullableId(payload.collectionId);
  if (requestedCollectionId) requireCollection(snapshot, requestedCollectionId);
  const collectionChanged = requestedCollectionId !== (current.collectionId || null);
  const siblings = resolveDocumentSiblings(snapshot, requestedCollectionId).filter(item => item.id !== current.id);
  const record = createTextDocumentRecord({
    ...current,
    title: payload?.title === undefined ? current.title : payload.title,
    collectionId: requestedCollectionId,
    order: collectionChanged ? maxOrder(siblings) + 1 : current.order,
    documentType: payload?.documentType === undefined ? current.documentType : payload.documentType,
    textLanguage: payload?.textLanguage === undefined ? current.textLanguage : payload.textLanguage,
    meaningLanguage: payload?.meaningLanguage === undefined ? current.meaningLanguage : payload.meaningLanguage,
    editorModel: current.editorModel,
    updatedAt: now,
    metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
  });
  let documents = snapshot.documents.map(item => item.id === record.id ? record : item);
  if (collectionChanged) {
    documents = compactOrderGroup(documents, item => (item.collectionId || null) === (current.collectionId || null), now);
  }
  return finalize({
    ...snapshot,
    documents
  }, { entity: 'document', action: 'update', id: record.id });
};

const deleteDocument = (snapshot, payload, now) => {
  const current = requireDocument(snapshot, payload?.id);
  if (current.editorModel === TEXT_LEGACY_EDITOR_MODEL) {
    throw new Error(`Legacy compatibility document ${current.id} cannot be deleted by the structured command API`);
  }
  const removedBlockIds = new Set(snapshot.blocks.filter(item => item.documentId === current.id).map(item => item.id));
  const removedSegmentIds = new Set(snapshot.segments.filter(item => item.documentId === current.id).map(item => item.id));
  const activeDocumentId = resolveNextActiveDocumentId(snapshot.documents, current.id, snapshot.activeDocumentId);
  const remainingDocuments = compactOrderGroup(
    snapshot.documents.filter(item => item.id !== current.id),
    item => (item.collectionId || null) === (current.collectionId || null),
    now
  );
  return finalize({
    ...snapshot,
    activeDocumentId,
    documents: remainingDocuments,
    blocks: snapshot.blocks.filter(item => !removedBlockIds.has(item.id)),
    segments: snapshot.segments.filter(item => !removedSegmentIds.has(item.id)),
    audioVariants: snapshot.audioVariants.filter(item => !removedSegmentIds.has(item.segmentId))
  }, { entity: 'document', action: 'delete', id: current.id, activeDocumentId });
};

const reorderDocuments = (snapshot, payload, now) => {
  const collectionId = normalizeNullableId(payload?.collectionId);
  if (collectionId) requireCollection(snapshot, collectionId);
  const siblings = resolveDocumentSiblings(snapshot, collectionId);
  const ids = normalizeExactOrderIds(siblings, payload?.orderedIds, 'Document');
  return finalize({
    ...snapshot,
    documents: applyContiguousOrder(snapshot.documents, ids, now)
  }, { entity: 'document', action: 'reorder', collectionId, orderedIds: ids });
};

const setActiveDocument = (snapshot, payload) => {
  const document = requireDocument(snapshot, payload?.id);
  return finalize({ ...snapshot, activeDocumentId: document.id }, {
    entity: 'document', action: 'setActive', id: document.id, editorModel: document.editorModel
  });
};

const createBlock = (snapshot, payload, now) => {
  const document = requireStructuredDocument(snapshot, payload?.documentId);
  const allocated = allocateIdentity(snapshot, 'BLOCK');
  const siblings = snapshot.blocks.filter(item => item.documentId === document.id);
  const blockType = payload?.blockType || (document.documentType === 'conversation' ? 'conversation' : 'paragraph');
  assertBlockTypeAllowed(document, blockType);
  const record = createTextBlockRecord({
    id: allocated.id,
    documentId: document.id,
    order: maxOrder(siblings) + 1,
    blockType,
    title: payload?.title,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  return finalize({
    ...snapshot,
    counters: allocated.counters,
    blocks: [...snapshot.blocks, record],
    documents: snapshot.documents.map(item => item.id === document.id ? { ...item, updatedAt: now } : item)
  }, { entity: 'block', action: 'create', id: record.id, documentId: document.id });
};

const updateBlock = (snapshot, payload, now) => {
  const current = requireBlock(snapshot, payload?.id);
  const document = requireStructuredDocument(snapshot, current.documentId);
  const nextBlockType = payload?.blockType === undefined ? current.blockType : payload.blockType;
  assertBlockTypeAllowed(document, nextBlockType);
  const record = createTextBlockRecord({
    ...current,
    blockType: nextBlockType,
    title: payload?.title === undefined ? current.title : payload.title,
    updatedAt: now,
    metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
  });
  return finalize({
    ...snapshot,
    blocks: snapshot.blocks.map(item => item.id === record.id ? record : item),
    documents: snapshot.documents.map(item => item.id === record.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'block', action: 'update', id: record.id, documentId: record.documentId });
};

const deleteBlock = (snapshot, payload, now) => {
  const current = requireBlock(snapshot, payload?.id);
  requireStructuredDocument(snapshot, current.documentId);
  const removedSegments = new Set(snapshot.segments.filter(item => item.blockId === current.id).map(item => item.id));
  return finalize({
    ...snapshot,
    blocks: compactOrderGroup(
      snapshot.blocks.filter(item => item.id !== current.id),
      item => item.documentId === current.documentId,
      now
    ),
    segments: snapshot.segments.filter(item => !removedSegments.has(item.id)),
    audioVariants: snapshot.audioVariants.filter(item => !removedSegments.has(item.segmentId)),
    documents: snapshot.documents.map(item => item.id === current.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'block', action: 'delete', id: current.id, documentId: current.documentId });
};

const reorderBlocks = (snapshot, payload, now) => {
  const document = requireStructuredDocument(snapshot, payload?.documentId);
  const siblings = snapshot.blocks.filter(item => item.documentId === document.id);
  const ids = normalizeExactOrderIds(siblings, payload?.orderedIds, 'Block');
  return finalize({
    ...snapshot,
    blocks: applyContiguousOrder(snapshot.blocks, ids, now),
    documents: snapshot.documents.map(item => item.id === document.id ? { ...item, updatedAt: now } : item)
  }, { entity: 'block', action: 'reorder', documentId: document.id, orderedIds: ids });
};

const createSegment = (snapshot, payload, now) => {
  const block = requireBlock(snapshot, payload?.blockId);
  requireStructuredDocument(snapshot, block.documentId);
  const allocated = allocateIdentity(snapshot, 'SEGMENT');
  const siblings = snapshot.segments.filter(item => item.blockId === block.id);
  const record = createTextSegmentRecord({
    id: allocated.id,
    documentId: block.documentId,
    blockId: block.id,
    order: maxOrder(siblings) + 1,
    text: payload?.text,
    meaning: payload?.meaning,
    speaker: payload?.speaker,
    joinAfter: payload?.joinAfter,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  return finalize({
    ...snapshot,
    counters: allocated.counters,
    segments: [...snapshot.segments, record],
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'segment', action: 'create', id: record.id, blockId: block.id, documentId: block.documentId });
};

const updateSegment = (snapshot, payload, now) => {
  const current = requireSegment(snapshot, payload?.id);
  requireStructuredDocument(snapshot, current.documentId);
  const record = createTextSegmentRecord({
    ...current,
    text: payload?.text === undefined ? current.text : payload.text,
    meaning: payload?.meaning === undefined ? current.meaning : payload.meaning,
    speaker: payload?.speaker === undefined ? current.speaker : payload.speaker,
    joinAfter: payload?.joinAfter === undefined ? current.joinAfter : payload.joinAfter,
    updatedAt: now,
    metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
  });
  return finalize({
    ...snapshot,
    segments: snapshot.segments.map(item => item.id === record.id ? record : item),
    blocks: snapshot.blocks.map(item => item.id === record.blockId ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === record.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'segment', action: 'update', id: record.id, blockId: record.blockId, documentId: record.documentId });
};

const deleteSegment = (snapshot, payload, now) => {
  const current = requireSegment(snapshot, payload?.id);
  requireStructuredDocument(snapshot, current.documentId);
  return finalize({
    ...snapshot,
    segments: compactOrderGroup(
      snapshot.segments.filter(item => item.id !== current.id),
      item => item.blockId === current.blockId,
      now
    ),
    audioVariants: snapshot.audioVariants.filter(item => item.segmentId !== current.id),
    blocks: snapshot.blocks.map(item => item.id === current.blockId ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === current.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'segment', action: 'delete', id: current.id, blockId: current.blockId, documentId: current.documentId });
};

const reorderSegments = (snapshot, payload, now) => {
  const block = requireBlock(snapshot, payload?.blockId);
  requireStructuredDocument(snapshot, block.documentId);
  const siblings = snapshot.segments.filter(item => item.blockId === block.id);
  const ids = normalizeExactOrderIds(siblings, payload?.orderedIds, 'Segment');
  return finalize({
    ...snapshot,
    segments: applyContiguousOrder(snapshot.segments, ids, now),
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'segment', action: 'reorder', blockId: block.id, documentId: block.documentId, orderedIds: ids });
};

const upsertAudioVariant = (snapshot, payload, now) => {
  const segment = requireSegment(snapshot, payload?.segmentId);
  requireStructuredDocument(snapshot, segment.documentId);

  const candidateIdentity = {
    segmentId: segment.id,
    channel: payload?.channel || 'text',
    engine: payload?.engine || 'local',
    source: payload?.source || 'file',
    voiceId: payload?.voiceId ?? null
  };
  const identityKey = getTextStructuredAudioVariantKey(candidateIdentity);
  const existing = snapshot.audioVariants.find(variant => getTextStructuredAudioVariantKey(variant) === identityKey) || null;

  if (existing) {
    const record = createTextAudioVariantRecord({
      ...existing,
      ...candidateIdentity,
      language: payload?.language === undefined ? existing.language : payload.language,
      filename: payload?.filename === undefined ? existing.filename : payload.filename,
      mimeType: payload?.mimeType === undefined ? existing.mimeType : payload.mimeType,
      updatedAt: now,
      metadata: payload?.metadata === undefined ? existing.metadata : payload.metadata
    });
    return finalize({
      ...snapshot,
      audioVariants: snapshot.audioVariants.map(item => item.id === record.id ? record : item)
    }, { entity: 'audioVariant', action: 'update', id: record.id, segmentId: segment.id, identityKey });
  }

  const allocated = allocateIdentity(snapshot, 'AUDIO_VARIANT');
  const record = createTextAudioVariantRecord({
    id: allocated.id,
    ...candidateIdentity,
    language: payload?.language,
    filename: payload?.filename,
    mimeType: payload?.mimeType,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  return finalize({
    ...snapshot,
    counters: allocated.counters,
    audioVariants: [...snapshot.audioVariants, record]
  }, { entity: 'audioVariant', action: 'create', id: record.id, segmentId: segment.id, identityKey });
};

const deleteAudioVariant = (snapshot, payload) => {
  const current = requireAudioVariant(snapshot, payload?.id);
  const segment = requireSegment(snapshot, current.segmentId);
  requireStructuredDocument(snapshot, segment.documentId);
  return finalize({
    ...snapshot,
    audioVariants: snapshot.audioVariants.filter(item => item.id !== current.id)
  }, { entity: 'audioVariant', action: 'delete', id: current.id, segmentId: current.segmentId });
};

export const applyTextLibraryCommand = (snapshotCandidate, command, now = Date.now()) => {
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate);
  const type = command?.type;
  const payload = command?.payload || {};
  switch (type) {
    case COMMAND_TYPES.CREATE_COLLECTION: return createCollection(snapshot, payload, now);
    case COMMAND_TYPES.UPDATE_COLLECTION: return updateCollection(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_COLLECTION: return deleteCollection(snapshot, payload, now);
    case COMMAND_TYPES.REORDER_COLLECTIONS: return reorderCollections(snapshot, payload, now);
    case COMMAND_TYPES.CREATE_DOCUMENT: return createDocument(snapshot, payload, now);
    case COMMAND_TYPES.UPDATE_DOCUMENT: return updateDocument(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_DOCUMENT: return deleteDocument(snapshot, payload, now);
    case COMMAND_TYPES.REORDER_DOCUMENTS: return reorderDocuments(snapshot, payload, now);
    case COMMAND_TYPES.SET_ACTIVE_DOCUMENT: return setActiveDocument(snapshot, payload, now);
    case COMMAND_TYPES.CREATE_BLOCK: return createBlock(snapshot, payload, now);
    case COMMAND_TYPES.UPDATE_BLOCK: return updateBlock(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_BLOCK: return deleteBlock(snapshot, payload, now);
    case COMMAND_TYPES.REORDER_BLOCKS: return reorderBlocks(snapshot, payload, now);
    case COMMAND_TYPES.CREATE_SEGMENT: return createSegment(snapshot, payload, now);
    case COMMAND_TYPES.UPDATE_SEGMENT: return updateSegment(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_SEGMENT: return deleteSegment(snapshot, payload, now);
    case COMMAND_TYPES.REORDER_SEGMENTS: return reorderSegments(snapshot, payload, now);
    case COMMAND_TYPES.UPSERT_AUDIO_VARIANT: return upsertAudioVariant(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_AUDIO_VARIANT: return deleteAudioVariant(snapshot, payload, now);
    default: throw new Error(`Unknown Text Library command: ${type || '(missing)'}`);
  }
};
