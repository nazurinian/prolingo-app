import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  createTextContentUnitRecord,
  isContentUnitSnapshot
} from './textContentUnitDomain.js';
import {
  TEXT_CONTENT_UNIT_COMMAND_TYPES,
  applySpeakerIdToSegmentMetadata,
  createContentUnitCommand,
  deleteContentUnitCommand,
  mergeContentUnitsCommand,
  moveSegmentToUnitCommand,
  reorderContentUnitsCommand,
  reorderContentUnitSegmentsCommand,
  splitContentUnitCommand,
  syncCardUnitsAndSegmentsOrder,
  updateContentUnitCommand,
  updateMaterializedBlockIds
} from './textContentUnitCommandDomain.js';
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
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { getTextIdSequence } from './textIdentityDomain.js';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from './textGlobalIdentityDomain.js';
import {
  buildTextParagraphSentenceAudioInvalidationMetadata,
  buildTextParagraphSentenceMutationMetadata,
  joinTextParagraphSentenceSegments,
  normalizeTextParagraphSentenceMutationParts
} from './textParagraphSentenceAuthoringDomain.js';
import {
  buildTextStructuredRemoveSpeakerRegistryMetadata,
  buildTextStructuredSegmentSpeakerIdentityMetadata,
  buildTextStructuredUpsertSpeakerRegistryMetadata,
  deriveTextStructuredSpeakerId,
  getTextStructuredSegmentSpeakerId,
  getTextStructuredSpeakerRegistry
} from './textStructuredSpeakerIdentityDomain.js';
import {
  buildTextStructuredFullAudioArtifactsMetadata,
  normalizeTextStructuredFullArtifactRecord
} from './textStructuredSplitFullDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextBlockAudioMetadata,
  buildResetTextSegmentAudioMetadata,
  buildResetTextSpeakerAudioMetadata,
  buildResetTextWorkspaceAudioMetadata,
  buildResetTextWorkspaceBrowserTtsMetadata,
  buildResetTextWorkspaceEdgePresetMetadata
} from './textStructuredResetDomain.js';

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
  SEGMENT_MOVE: TEXT_CONTENT_UNIT_COMMAND_TYPES.SEGMENT_MOVE,
  CONTENT_UNIT_CREATE: TEXT_CONTENT_UNIT_COMMAND_TYPES.CREATE,
  CONTENT_UNIT_UPDATE: TEXT_CONTENT_UNIT_COMMAND_TYPES.UPDATE,
  CONTENT_UNIT_REORDER: TEXT_CONTENT_UNIT_COMMAND_TYPES.REORDER,
  CONTENT_UNIT_REORDER_SEGMENTS: TEXT_CONTENT_UNIT_COMMAND_TYPES.REORDER_SEGMENTS,
  CONTENT_UNIT_SPLIT: TEXT_CONTENT_UNIT_COMMAND_TYPES.SPLIT,
  CONTENT_UNIT_MERGE: TEXT_CONTENT_UNIT_COMMAND_TYPES.MERGE,
  CONTENT_UNIT_DELETE: TEXT_CONTENT_UNIT_COMMAND_TYPES.DELETE,
  SPLIT_PARAGRAPH_SEGMENT: 'paragraphSegment.split',
  MERGE_PARAGRAPH_SEGMENTS: 'paragraphSegments.merge',
  SPLIT_CONVERSATION_SEGMENT: 'conversationSegment.split',
  MERGE_CONVERSATION_SEGMENTS: 'conversationSegments.merge',
  UPSERT_AUDIO_VARIANT: 'audioVariant.upsert',
  DELETE_AUDIO_VARIANT: 'audioVariant.delete',
  UPSERT_FULL_AUDIO_ARTIFACT: 'fullAudioArtifact.upsert',
  DELETE_FULL_AUDIO_ARTIFACT: 'fullAudioArtifact.delete',
  REGISTER_SPEAKER: 'speaker.register',
  RENAME_SPEAKER: 'speaker.rename',
  REMOVE_SPEAKER: 'speaker.remove',
  RESET_AUDIO_PREFERENCES: 'audioPreferences.reset'
});

export const TEXT_LIBRARY_COMMAND_TYPES = COMMAND_TYPES;

const counterKeyByKind = Object.freeze({
  COLLECTION: 'collection',
  DOCUMENT: 'document',
  BLOCK: 'text',
  CONTENT_UNIT: 'contentUnit',
  SEGMENT: 'segment',
  AUDIO_VARIANT: 'audioVariant'
});

const globalUidKindByLocalKind = Object.freeze({
  COLLECTION: TEXT_GLOBAL_UID_KINDS.COLLECTION,
  DOCUMENT: TEXT_GLOBAL_UID_KINDS.WORKSPACE,
  BLOCK: TEXT_GLOBAL_UID_KINDS.CARD,
  CONTENT_UNIT: TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT,
  SEGMENT: TEXT_GLOBAL_UID_KINDS.SEGMENT,
  AUDIO_VARIANT: TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT
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
  const hasUnits = isContentUnitSnapshot(snapshot);
  const counters = normalizeTextIdCounters(snapshot.counters, { includeContentUnit: hasUnits });
  return {
    collection: Math.max(counters.collection, ...snapshot.collections.map(item => getTextLibraryIdSequence('COLLECTION', item.id)), 0),
    document: Math.max(counters.document, ...snapshot.documents.map(item => getTextLibraryIdSequence('DOCUMENT', item.id)), 0),
    text: Math.max(counters.text, ...snapshot.blocks.map(item => getTextIdSequence(item.id)), 0),
    segment: Math.max(counters.segment, ...snapshot.segments.map(item => getTextLibraryIdSequence('SEGMENT', item.id)), 0),
    ...(hasUnits ? {
      contentUnit: Math.max(
        counters.contentUnit ?? 0,
        ...(snapshot.contentUnits || []).map(item => getTextLibraryIdSequence('CONTENT_UNIT', item.id)),
        0
      )
    } : {}),
    audioVariant: Math.max(counters.audioVariant, ...snapshot.audioVariants.map(item => getTextLibraryIdSequence('AUDIO_VARIANT', item.id)), 0)
  };
};

const allocateIdentity = (snapshot, kind) => {
  const key = counterKeyByKind[kind];
  const globalKind = globalUidKindByLocalKind[kind];
  if (!key || !globalKind) throw new Error(`Unsupported Text command identity kind: ${kind}`);
  const counters = floorCountersFromSnapshot(snapshot);
  counters[key] += 1;
  return {
    id: formatTextLibraryId(kind, counters[key]),
    uid: createTextGlobalUid(globalKind),
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
    uid: allocated.uid,
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
  const requestedEditorModel = payload?.editorModel === TEXT_LEGACY_EDITOR_MODEL
    ? TEXT_LEGACY_EDITOR_MODEL
    : TEXT_STRUCTURED_EDITOR_MODEL;
  const requestedDocumentType = requestedEditorModel === TEXT_LEGACY_EDITOR_MODEL
    ? 'mixed'
    : (payload?.documentType || 'paragraph');
  const record = createTextDocumentRecord({
    id: allocated.id,
    uid: allocated.uid,
    title: normalizeTitle(payload?.title, 'Untitled Text'),
    collectionId,
    order: maxOrder(siblings) + 1,
    documentType: requestedDocumentType,
    textLanguage: payload?.textLanguage,
    meaningLanguage: payload?.meaningLanguage,
    editorModel: requestedEditorModel,
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
    ...(isContentUnitSnapshot(snapshot) ? {
      contentUnits: (snapshot.contentUnits || []).filter(item => item.documentId !== current.id),
      contentUnitMigration: updateMaterializedBlockIds(snapshot, { remove: [...removedBlockIds] })
    } : {}),
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
    uid: allocated.uid,
    documentId: document.id,
    order: maxOrder(siblings) + 1,
    blockType,
    title: payload?.title,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });
  const hasUnitsMode = isContentUnitSnapshot(snapshot);
  let nextCounters = allocated.counters;
  let nextContentUnits = snapshot.contentUnits;
  if (hasUnitsMode && blockType === 'paragraph') {
    const unitAlloc = allocateIdentity({ ...snapshot, counters: allocated.counters }, 'CONTENT_UNIT');
    nextCounters = unitAlloc.counters;
    const initialUnit = createTextContentUnitRecord({
      id: unitAlloc.id,
      uid: unitAlloc.uid,
      documentId: document.id,
      blockId: record.id,
      kind: 'paragraph',
      order: 1,
      createdAt: now,
      updatedAt: now
    });
    nextContentUnits = [...(snapshot.contentUnits || []), initialUnit];
  }
  return finalize({
    ...snapshot,
    counters: nextCounters,
    blocks: [...snapshot.blocks, record],
    ...(hasUnitsMode ? {
      contentUnits: nextContentUnits,
      contentUnitMigration: updateMaterializedBlockIds(snapshot, { add: [record.id] })
    } : {}),
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
    ...(isContentUnitSnapshot(snapshot) ? {
      contentUnits: (snapshot.contentUnits || []).filter(item => item.blockId !== current.id),
      contentUnitMigration: updateMaterializedBlockIds(snapshot, { remove: [current.id] })
    } : {}),
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

/**
 * Resolves canonical speaker label, segment speakerIdentityV1 metadata, and updated
 * document speakerRegistryV1 metadata for Conversation segment create/update authoring.
 */
const resolveConversationAuthoringSpeaker = ({
  document,
  block,
  rawSpeaker,
  candidateMetadata,
  hasExplicitMetadata = false,
  speakerProvided = false,
  currentSegment = null
}) => {
  if (block?.blockType !== 'conversation') {
    return {
      speaker: rawSpeaker,
      segmentMetadata: candidateMetadata,
      documentMetadata: document.metadata
    };
  }

  const cleanLabel = String(rawSpeaker || '').trim();
  if (!cleanLabel) {
    return {
      speaker: rawSpeaker,
      segmentMetadata: candidateMetadata,
      documentMetadata: document.metadata
    };
  }

  const registry = getTextStructuredSpeakerRegistry({ metadata: document?.metadata });
  const normalizedLabel = normalizeTextStructuredSpeakerKey(cleanLabel);
  const currentNormalized = normalizeTextStructuredSpeakerKey(currentSegment?.speaker || '');
  const speakerChanged = Boolean(currentSegment) && speakerProvided && currentNormalized !== normalizedLabel;
  const currentSegmentSpeakerId = getTextStructuredSegmentSpeakerId(currentSegment);
  const rawExplicitSpeakerId = hasExplicitMetadata
    ? (String(candidateMetadata?.speakerIdentityV1 || '').trim() || null)
    : null;

  // Discard inherited segment speakerIdentityV1 when UPDATE_SEGMENT changes the speaker label
  // without selecting a new ID, so stale metadata cannot rename a previously bound speaker.
  const effectiveExplicitSpeakerId = (
    speakerChanged
    && rawExplicitSpeakerId
    && currentSegmentSpeakerId
    && rawExplicitSpeakerId === currentSegmentSpeakerId
  )
    ? null
    : rawExplicitSpeakerId;

  if (effectiveExplicitSpeakerId) {
    const explicitRegistered = registry.find(entry => entry.id === effectiveExplicitSpeakerId) || null;
    if (explicitRegistered && normalizeTextStructuredSpeakerKey(explicitRegistered.label) !== normalizedLabel) {
      throw new Error(
        `Speaker ID "${effectiveExplicitSpeakerId}" belongs to registered speaker "${explicitRegistered.label}" and cannot be assigned to "${cleanLabel}".`
      );
    }
  }

  const registeredByLabel = registry.find(
    entry => normalizeTextStructuredSpeakerKey(entry.label) === normalizedLabel
  ) || null;
  const speakerId = effectiveExplicitSpeakerId
    || (!speakerChanged && currentSegmentSpeakerId ? currentSegmentSpeakerId : null)
    || registeredByLabel?.id
    || deriveTextStructuredSpeakerId({ documentId: document.id, speaker: cleanLabel });

  const resolvedRegistered = registry.find(entry => entry.id === speakerId) || null;
  const matchesExistingRegistered = Boolean(
    resolvedRegistered && normalizeTextStructuredSpeakerKey(resolvedRegistered.label) === normalizedLabel
  );
  const canonicalSpeaker = matchesExistingRegistered ? resolvedRegistered.label : cleanLabel;

  return {
    speaker: canonicalSpeaker,
    segmentMetadata: buildTextStructuredSegmentSpeakerIdentityMetadata(candidateMetadata, speakerId),
    documentMetadata: matchesExistingRegistered
      ? document.metadata
      : buildTextStructuredUpsertSpeakerRegistryMetadata({
          metadata: document.metadata,
          documentId: document.id,
          speakerId,
          label: canonicalSpeaker
        })
  };
};

const createSegment = (snapshot, payload, now) => {
  const block = requireBlock(snapshot, payload?.blockId);
  const document = requireStructuredDocument(snapshot, block.documentId);
  const hasUnitsMode = isContentUnitSnapshot(snapshot);
  const allocated = allocateIdentity(snapshot, 'SEGMENT');
  const siblings = snapshot.segments.filter(item => item.blockId === block.id);

  if (!hasUnitsMode) {
    const {
      speaker,
      segmentMetadata,
      documentMetadata
    } = resolveConversationAuthoringSpeaker({
      document,
      block,
      rawSpeaker: payload?.speaker,
      candidateMetadata: payload?.metadata,
      hasExplicitMetadata: payload?.metadata !== undefined,
      speakerProvided: true,
      currentSegment: null
    });
    const record = createTextSegmentRecord({
      id: allocated.id,
      uid: allocated.uid,
      documentId: block.documentId,
      blockId: block.id,
      order: maxOrder(siblings) + 1,
      text: payload?.text,
      meaning: payload?.meaning,
      speaker,
      joinAfter: payload?.joinAfter,
      createdAt: now,
      updatedAt: now,
      metadata: segmentMetadata
    });
    return finalize({
      ...snapshot,
      counters: allocated.counters,
      segments: [...snapshot.segments, record],
      blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
      documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, metadata: documentMetadata, updatedAt: now } : item)
    }, { entity: 'segment', action: 'create', id: record.id, blockId: block.id, documentId: block.documentId });
  }

  let nextCountersSnapshot = { ...snapshot, counters: allocated.counters };
  let nextContentUnits = snapshot.contentUnits || [];
  const blockUnits = sortByOrderThenId(nextContentUnits.filter(u => u.blockId === block.id));
  const requestedUnitId = payload?.unitId ? String(payload.unitId).trim().toUpperCase() : null;
  let targetUnit = null;
  let speaker = payload?.speaker ?? null;
  let segmentMetadata = payload?.metadata;
  let documentMetadata = document.metadata;

  if (block.blockType === 'paragraph') {
    if (requestedUnitId) {
      targetUnit = blockUnits.find(u => u.id === requestedUnitId) || null;
      if (!targetUnit) throw new Error(`Content Unit ${requestedUnitId} does not belong to Card ${block.id}`);
    } else if (blockUnits.length > 0) {
      targetUnit = blockUnits[blockUnits.length - 1];
    } else {
      const unitAlloc = allocateIdentity(nextCountersSnapshot, 'CONTENT_UNIT');
      nextCountersSnapshot = { ...nextCountersSnapshot, counters: unitAlloc.counters };
      targetUnit = createTextContentUnitRecord({
        id: unitAlloc.id,
        uid: unitAlloc.uid,
        documentId: block.documentId,
        blockId: block.id,
        kind: 'paragraph',
        order: 1,
        createdAt: now,
        updatedAt: now
      });
      nextContentUnits = [...nextContentUnits, targetUnit];
    }
    const resolved = resolveConversationAuthoringSpeaker({
      document,
      block,
      rawSpeaker: payload?.speaker,
      candidateMetadata: payload?.metadata,
      hasExplicitMetadata: payload?.metadata !== undefined,
      speakerProvided: true,
      currentSegment: null
    });
    speaker = resolved.speaker;
    segmentMetadata = resolved.segmentMetadata;
    documentMetadata = resolved.documentMetadata;
  } else if (requestedUnitId) {
    targetUnit = blockUnits.find(u => u.id === requestedUnitId) || null;
    if (!targetUnit || targetUnit.kind !== 'turn') {
      throw new Error(`Turn Content Unit ${requestedUnitId} not found on Card ${block.id}`);
    }
    if (
      payload?.speaker !== undefined
      && normalizeTextStructuredSpeakerKey(payload.speaker || '') !== normalizeTextStructuredSpeakerKey(targetUnit.speaker || '')
    ) {
      throw new Error(`Segment speaker "${payload.speaker}" disagrees with target Turn ${targetUnit.id} speaker "${targetUnit.speaker || ''}".`);
    }
    speaker = targetUnit.speaker;
    segmentMetadata = applySpeakerIdToSegmentMetadata(payload?.metadata, targetUnit.speakerId);
  } else {
    const resolved = resolveConversationAuthoringSpeaker({
      document,
      block,
      rawSpeaker: payload?.speaker,
      candidateMetadata: payload?.metadata,
      hasExplicitMetadata: payload?.metadata !== undefined,
      speakerProvided: true,
      currentSegment: null
    });
    speaker = resolved.speaker;
    segmentMetadata = resolved.segmentMetadata;
    documentMetadata = resolved.documentMetadata;
    const unitAlloc = allocateIdentity(nextCountersSnapshot, 'CONTENT_UNIT');
    nextCountersSnapshot = { ...nextCountersSnapshot, counters: unitAlloc.counters };
    const resolvedSpeakerId = segmentMetadata?.speakerIdentityV1
      ? String(segmentMetadata.speakerIdentityV1).trim() || null
      : null;
    targetUnit = createTextContentUnitRecord({
      id: unitAlloc.id,
      uid: unitAlloc.uid,
      documentId: block.documentId,
      blockId: block.id,
      kind: 'turn',
      order: maxOrder(blockUnits) + 1,
      speakerId: resolvedSpeakerId,
      speaker: speaker || null,
      createdAt: now,
      updatedAt: now
    });
    nextContentUnits = [...nextContentUnits, targetUnit];
  }

  const record = createTextSegmentRecord({
    id: allocated.id,
    uid: allocated.uid,
    documentId: block.documentId,
    blockId: block.id,
    unitId: targetUnit.id,
    order: maxOrder(siblings) + 1,
    text: payload?.text,
    meaning: payload?.meaning,
    speaker,
    joinAfter: payload?.joinAfter,
    createdAt: now,
    updatedAt: now,
    metadata: segmentMetadata
  });

  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: nextContentUnits,
    segments: [...snapshot.segments, record],
    blockId: block.id,
    now
  });

  return finalize({
    ...snapshot,
    counters: nextCountersSnapshot.counters,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    contentUnitMigration: updateMaterializedBlockIds(snapshot, { add: [block.id] }),
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, metadata: documentMetadata, updatedAt: now } : item)
  }, { entity: 'segment', action: 'create', id: record.id, unitId: targetUnit.id, blockId: block.id, documentId: block.documentId });
};

const updateSegment = (snapshot, payload, now) => {
  const current = requireSegment(snapshot, payload?.id);
  const document = requireStructuredDocument(snapshot, current.documentId);
  const block = requireBlock(snapshot, current.blockId);
  const nextSpeaker = payload?.speaker === undefined ? current.speaker : payload.speaker;
  const candidateMetadata = payload?.metadata === undefined ? current.metadata : payload.metadata;
  const {
    speaker,
    segmentMetadata,
    documentMetadata
  } = resolveConversationAuthoringSpeaker({
    document,
    block,
    rawSpeaker: nextSpeaker,
    candidateMetadata,
    hasExplicitMetadata: payload?.metadata !== undefined,
    speakerProvided: payload?.speaker !== undefined,
    currentSegment: current
  });
  const record = createTextSegmentRecord({
    ...current,
    text: payload?.text === undefined ? current.text : payload.text,
    meaning: payload?.meaning === undefined ? current.meaning : payload.meaning,
    speaker,
    joinAfter: payload?.joinAfter === undefined ? current.joinAfter : payload.joinAfter,
    updatedAt: now,
    metadata: segmentMetadata
  });

  let nextContentUnits = snapshot.contentUnits;
  if (isContentUnitSnapshot(snapshot) && current.unitId) {
    const parentUnit = (snapshot.contentUnits || []).find(u => u.id === current.unitId) || null;
    if (parentUnit?.kind === 'turn') {
      const nextSpeakerId = getTextStructuredSegmentSpeakerId(record);
      const nextSpeakerLabel = record.speaker || null;
      const speakerChanged = nextSpeakerId !== (parentUnit.speakerId || null)
        || normalizeTextStructuredSpeakerKey(nextSpeakerLabel || '') !== normalizeTextStructuredSpeakerKey(parentUnit.speaker || '');
      if (speakerChanged) {
        const turnSegmentCount = snapshot.segments.filter(s => s.unitId === parentUnit.id).length;
        if (turnSegmentCount > 1) {
          throw new Error(
            `Cannot change speaker on single Segment ${current.id} inside multi-segment Turn ${parentUnit.id}; use contentUnit.update or segment.move.`
          );
        }
        nextContentUnits = snapshot.contentUnits.map(u => (
          u.id === parentUnit.id
            ? { ...u, speakerId: nextSpeakerId, speaker: nextSpeakerLabel, updatedAt: now }
            : u
        ));
      }
    }
  }

  const textChanged = payload?.text !== undefined && String(current.text || '') !== String(record.text || '');
  const meaningChanged = payload?.meaning !== undefined && String(current.meaning || '') !== String(record.meaning || '');
  const nextAudioVariants = snapshot.audioVariants.map(variant => {
    if (variant.segmentId !== record.id) return variant;
    const channelChanged = (variant.channel === 'text' && textChanged) || (variant.channel === 'meaning' && meaningChanged);
    if (!channelChanged) return variant;
    return {
      ...variant,
      updatedAt: now,
      metadata: buildTextParagraphSentenceAudioInvalidationMetadata({
        metadata: variant.metadata,
        reason: `segment-${variant.channel}-content-update`,
        at: now
      })
    };
  });
  return finalize({
    ...snapshot,
    ...(isContentUnitSnapshot(snapshot) ? { contentUnits: nextContentUnits } : {}),
    segments: snapshot.segments.map(item => item.id === record.id ? record : item),
    audioVariants: nextAudioVariants,
    blocks: snapshot.blocks.map(item => item.id === record.blockId ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === record.documentId ? { ...item, metadata: documentMetadata, updatedAt: now } : item)
  }, {
    entity: 'segment', action: 'update', id: record.id, blockId: record.blockId, documentId: record.documentId,
    invalidatedAudioVariantIds: nextAudioVariants.filter((variant, index) => variant !== snapshot.audioVariants[index]).map(variant => variant.id)
  });
};

const deleteSegment = (snapshot, payload, now) => {
  const current = requireSegment(snapshot, payload?.id);
  requireStructuredDocument(snapshot, current.documentId);
  const remainingSegments = compactOrderGroup(
    snapshot.segments.filter(item => item.id !== current.id),
    item => item.blockId === current.blockId,
    now
  );
  let nextContentUnits = snapshot.contentUnits;
  if (isContentUnitSnapshot(snapshot) && current.unitId) {
    const parentUnit = (snapshot.contentUnits || []).find(u => u.id === current.unitId) || null;
    const unitStillHasSegments = remainingSegments.some(s => s.unitId === current.unitId);
    if (parentUnit?.kind === 'turn' && !unitStillHasSegments && payload?.preserveEmptyUnit !== true) {
      const remainingUnits = snapshot.contentUnits.filter(u => u.id !== parentUnit.id);
      nextContentUnits = compactOrderGroup(remainingUnits, u => u.blockId === current.blockId, now);
    }
  }
  return finalize({
    ...snapshot,
    ...(isContentUnitSnapshot(snapshot) ? { contentUnits: nextContentUnits } : {}),
    segments: remainingSegments,
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

  if (!isContentUnitSnapshot(snapshot)) {
    return finalize({
      ...snapshot,
      segments: applyContiguousOrder(snapshot.segments, ids, now),
      blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
      documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
    }, { entity: 'segment', action: 'reorder', blockId: block.id, documentId: block.documentId, orderedIds: ids });
  }

  const segById = new Map(siblings.map(item => [item.id, item]));
  const orderedUnitIdsFromSegs = [];
  const closedUnitIds = new Set();
  let activeUnitId = null;

  for (const id of ids) {
    const unitId = segById.get(id)?.unitId || null;
    if (!unitId) continue;
    if (unitId !== activeUnitId) {
      if (closedUnitIds.has(unitId)) {
        throw new Error(`Segment reorder violates Content Unit contiguity on Card ${block.id}; use contentUnit.reorder or segment.move.`);
      }
      if (activeUnitId) closedUnitIds.add(activeUnitId);
      activeUnitId = unitId;
      orderedUnitIdsFromSegs.push(unitId);
    }
  }

  const placedUnitSet = new Set(orderedUnitIdsFromSegs);
  const trailingEmptyUnitIds = sortByOrderThenId((snapshot.contentUnits || []).filter(u => u.blockId === block.id))
    .filter(u => !placedUnitSet.has(u.id))
    .map(u => u.id);
  const nextUnits = applyContiguousOrder(snapshot.contentUnits || [], [...orderedUnitIdsFromSegs, ...trailingEmptyUnitIds], now);

  return finalize({
    ...snapshot,
    contentUnits: nextUnits,
    segments: applyContiguousOrder(snapshot.segments, ids, now),
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
  }, { entity: 'segment', action: 'reorder', blockId: block.id, documentId: block.documentId, orderedIds: ids });
};


const requireSentenceSegment = (snapshot, segmentId, blockType) => {
  const segment = requireSegment(snapshot, segmentId);
  requireStructuredDocument(snapshot, segment.documentId);
  const block = requireBlock(snapshot, segment.blockId);
  const label = blockType === 'conversation' ? 'Conversation sentence' : 'Paragraph sentence';
  if (block.blockType !== blockType) {
    throw new Error(`${label} mutation refused for ${block.blockType} Card ${block.id}`);
  }
  if (blockType === 'conversation' && !(snapshot.contentUnits || []).some(unit => unit.id === segment.unitId && unit.kind === 'turn')) {
    throw new Error('Conversation sentence mutation requires a persistent Turn Content Unit');
  }
  return { segment, block };
};

const invalidateSegmentAudioVariants = (audioVariants, segmentId, reason, now) => audioVariants.map(variant =>
  variant.segmentId === segmentId
    ? {
        ...variant,
        updatedAt: now,
        metadata: buildTextParagraphSentenceAudioInvalidationMetadata({ metadata: variant.metadata, reason, at: now })
      }
    : variant
);

const splitSentenceSegment = (snapshot, payload, now, blockType) => {
  const { segment: current, block } = requireSentenceSegment(snapshot, payload?.id, blockType);
  const label = blockType === 'conversation' ? 'Conversation sentence' : 'Paragraph sentence';
  const parts = normalizeTextParagraphSentenceMutationParts(payload?.parts, current.joinAfter, label);
  const createdMetadata = { ...current.metadata };
  if (blockType === 'conversation') {
    // Only the retained Sentence owns the original external key. Copying it causes
    // reconciliation's source-key map to overwrite one of the split Sentences.
    delete createdMetadata.externalEntityV1;
    if (createdMetadata.prolingoTextPackSource) {
      createdMetadata.prolingoTextPackSource = { ...createdMetadata.prolingoTextPackSource, attachmentId: null, ownership: 'detached-local' };
    }
  }
  let countersSnapshot = snapshot;
  const created = [];
  for (let index = 1; index < parts.length; index += 1) {
    const allocated = allocateIdentity(countersSnapshot, 'SEGMENT');
    countersSnapshot = { ...countersSnapshot, counters: allocated.counters };
    created.push(createTextSegmentRecord({
      id: allocated.id,
      uid: allocated.uid,
      documentId: current.documentId,
      blockId: current.blockId,
      ...(current.unitId ? { unitId: current.unitId } : {}),
      text: parts[index].text,
      meaning: parts[index].meaning,
      speaker: blockType === 'conversation' ? current.speaker : null,
      joinAfter: parts[index].joinAfter,
      createdAt: now,
      updatedAt: now,
      metadata: buildTextParagraphSentenceMutationMetadata({
        metadata: createdMetadata,
        operation: 'split-created',
        sourceSegmentIds: [current.id],
        at: now
      })
    }));
  }

  const retained = createTextSegmentRecord({
    ...current,
    text: parts[0].text,
    meaning: parts[0].meaning,
    speaker: blockType === 'conversation' ? current.speaker : null,
    joinAfter: parts[0].joinAfter,
    updatedAt: now,
    metadata: buildTextParagraphSentenceMutationMetadata({
      metadata: current.metadata,
      operation: 'split-retained',
      sourceSegmentIds: [current.id],
      at: now
    })
  });

  const siblings = sortByOrderThenId(snapshot.segments.filter(item => item.blockId === block.id));
  const orderedIds = siblings.flatMap(item => item.id === current.id ? [retained.id, ...created.map(record => record.id)] : [item.id]);
  const withoutCurrent = snapshot.segments.filter(item => item.id !== current.id);
  const nextSegments = applyContiguousOrder([...withoutCurrent, retained, ...created], orderedIds, now);
  const invalidatedAudio = invalidateSegmentAudioVariants(snapshot.audioVariants, current.id, `${blockType}-sentence-split`, now);
  return finalize({
    ...snapshot,
    counters: countersSnapshot.counters,
    segments: nextSegments,
    audioVariants: invalidatedAudio,
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === current.documentId ? { ...item, updatedAt: now } : item)
  }, {
    entity: blockType === 'conversation' ? 'conversationSegment' : 'paragraphSegment',
    action: 'split',
    retainedId: retained.id,
    createdIds: created.map(record => record.id),
    blockId: block.id,
    documentId: current.documentId,
    invalidatedAudioVariantIds: invalidatedAudio.filter((variant, index) => variant !== snapshot.audioVariants[index]).map(variant => variant.id)
  });
};

const mergeSentenceSegments = (snapshot, payload, now, blockType) => {
  const label = blockType === 'conversation' ? 'Conversation sentence' : 'Paragraph sentence';
  const requestedIds = [...new Set((Array.isArray(payload?.ids) ? payload.ids : []).map(value => String(value || '').toUpperCase()).filter(Boolean))];
  if (requestedIds.length < 2) throw new Error(`${label} merge requires at least two unique Segment IDs`);
  const first = requireSentenceSegment(snapshot, requestedIds[0], blockType);
  const block = first.block;
  const siblings = sortByOrderThenId(snapshot.segments.filter(item => item.blockId === block.id));
  const selected = siblings.filter(item => requestedIds.includes(item.id));
  if (selected.length !== requestedIds.length) throw new Error(`${label} merge contains a Segment outside the target Card`);
  if (selected.some(item => item.documentId !== first.segment.documentId)) throw new Error(`${label} merge cannot cross Workspaces`);
  const positions = selected.map(item => siblings.findIndex(candidate => candidate.id === item.id));
  const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
  if (!contiguous) throw new Error(`${label} merge requires adjacent Segments`);
  if (isContentUnitSnapshot(snapshot) && new Set(selected.map(item => item.unitId)).size > 1) {
    throw new Error(`${label} merge cannot cross Content Unit boundaries; use contentUnit.merge first.`);
  }

  const retainedSource = selected[0];
  const removedIds = selected.slice(1).map(item => item.id);
  const merged = joinTextParagraphSentenceSegments(selected, label);
  const retained = createTextSegmentRecord({
    ...retainedSource,
    text: merged.text,
    meaning: merged.meaning,
    speaker: blockType === 'conversation' ? retainedSource.speaker : null,
    joinAfter: merged.joinAfter,
    updatedAt: now,
    metadata: buildTextParagraphSentenceMutationMetadata({
      metadata: retainedSource.metadata,
      operation: 'merge-retained',
      sourceSegmentIds: selected.map(item => item.id),
      at: now
    })
  });

  const orderedIds = siblings.filter(item => !removedIds.includes(item.id)).map(item => item.id);
  const selectedSet = new Set(selected.map(item => item.id));
  const baseSegments = snapshot.segments.filter(item => !selectedSet.has(item.id));
  const nextSegments = applyContiguousOrder([...baseSegments, retained], orderedIds, now);
  const retainedInvalidated = invalidateSegmentAudioVariants(snapshot.audioVariants, retained.id, `${blockType}-sentence-merge`, now);
  const nextAudioVariants = retainedInvalidated.filter(variant => !removedIds.includes(variant.segmentId));
  return finalize({
    ...snapshot,
    segments: nextSegments,
    audioVariants: nextAudioVariants,
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === retained.documentId ? { ...item, updatedAt: now } : item)
  }, {
    entity: blockType === 'conversation' ? 'conversationSegments' : 'paragraphSegments',
    action: 'merge',
    retainedId: retained.id,
    removedIds,
    blockId: block.id,
    documentId: retained.documentId,
    invalidatedAudioVariantIds: nextAudioVariants.filter(variant => variant.segmentId === retained.id && variant.metadata?.contentInvalidatedV1).map(variant => variant.id)
  });
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
    uid: allocated.uid,
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


const upsertFullAudioArtifact = (snapshot, payload, now) => {
  const block = requireBlock(snapshot, payload?.blockId);
  requireStructuredDocument(snapshot, block.documentId);
  const artifact = normalizeTextStructuredFullArtifactRecord(payload?.artifact);
  if (!artifact) throw new Error('Full Audio Artifact upsert requires a valid artifact record.');
  const normalizedArtifact = {
    ...artifact,
    createdAt: artifact.createdAt || now,
    updatedAt: now
  };
  const nextMetadata = buildTextStructuredFullAudioArtifactsMetadata({
    metadata: block.metadata,
    artifact: normalizedArtifact
  });
  return finalize({
    ...snapshot,
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, metadata: nextMetadata, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
  }, {
    entity: 'fullAudioArtifact',
    action: 'upsert',
    id: normalizedArtifact.fullArtifactFingerprint,
    blockId: block.id,
    documentId: block.documentId
  });
};

const deleteFullAudioArtifact = (snapshot, payload, now) => {
  const block = requireBlock(snapshot, payload?.blockId);
  requireStructuredDocument(snapshot, block.documentId);
  const fingerprint = String(payload?.fullArtifactFingerprint || payload?.id || '').trim();
  if (!fingerprint) throw new Error('Full Audio Artifact delete requires a fingerprint.');
  const nextMetadata = buildTextStructuredFullAudioArtifactsMetadata({
    metadata: block.metadata,
    removeFingerprint: fingerprint
  });
  return finalize({
    ...snapshot,
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, metadata: nextMetadata, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === block.documentId ? { ...item, updatedAt: now } : item)
  }, {
    entity: 'fullAudioArtifact',
    action: 'delete',
    id: fingerprint,
    blockId: block.id,
    documentId: block.documentId
  });
};

const metadataSignature = metadata => JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {});

const getDocumentConversationBlockIds = (snapshot, documentId) => new Set(
  snapshot.blocks
    .filter(item => item.documentId === documentId && item.blockType === 'conversation')
    .map(item => item.id)
);

const registerSpeaker = (snapshot, payload, now) => {
  const document = requireStructuredDocument(snapshot, payload?.documentId || payload?.id);
  const cleanLabel = String(payload?.label || '').trim();
  if (!cleanLabel) throw new Error('Speaker registry requires a non-empty label');
  const normalizedLabel = normalizeTextStructuredSpeakerKey(cleanLabel);
  const currentRegistry = getTextStructuredSpeakerRegistry({ metadata: document.metadata });
  const existingByLabel = currentRegistry.find(entry => normalizeTextStructuredSpeakerKey(entry.label) === normalizedLabel) || null;
  if (payload?.requireNew && existingByLabel) {
    throw new Error(`Speaker label “${cleanLabel}” is already registered`);
  }
  const requestedSpeakerId = String(payload?.speakerId || '').trim();
  const resolvedSpeakerId = requestedSpeakerId
    || existingByLabel?.id
    || deriveTextStructuredSpeakerId({ documentId: document.id, speaker: cleanLabel });

  const nextDocMetadata = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: document.metadata,
    documentId: document.id,
    speakerId: resolvedSpeakerId,
    label: cleanLabel
  });

  const conversationBlockIds = getDocumentConversationBlockIds(snapshot, document.id);
  const requestedSegmentIds = new Set(
    (Array.isArray(payload?.segmentIds) ? payload.segmentIds : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  );

  const changedSegmentIds = [];
  const nextSegments = snapshot.segments.map(item => {
    if (item.documentId !== document.id || !conversationBlockIds.has(item.blockId)) return item;
    const currentSpeakerId = getTextStructuredSegmentSpeakerId(item);
    const shouldBind = (requestedSegmentIds.has(item.id) && (!currentSpeakerId || currentSpeakerId === resolvedSpeakerId))
      || (!currentSpeakerId && normalizeTextStructuredSpeakerKey(item.speaker) === normalizedLabel);
    if (!shouldBind) return item;
    const nextSegMetadata = buildTextStructuredSegmentSpeakerIdentityMetadata(item.metadata, resolvedSpeakerId);
    if (metadataSignature(item.metadata) === metadataSignature(nextSegMetadata)) return item;
    changedSegmentIds.push(item.id);
    return { ...item, metadata: nextSegMetadata, updatedAt: now };
  });

  const changedSegmentSet = new Set(changedSegmentIds);
  const nextContentUnits = isContentUnitSnapshot(snapshot)
    ? (snapshot.contentUnits || []).map(unit => {
        if (unit.documentId !== document.id || unit.kind !== 'turn') return unit;
        const unitSegs = nextSegments.filter(s => s.unitId === unit.id);
        const touched = unitSegs.some(s => changedSegmentSet.has(s.id))
          || (!unit.speakerId && normalizeTextStructuredSpeakerKey(unit.speaker) === normalizedLabel);
        if (!touched) return unit;
        const nextSpeaker = unit.speaker || cleanLabel;
        if (unit.speakerId === resolvedSpeakerId && unit.speaker === nextSpeaker) return unit;
        return { ...unit, speakerId: resolvedSpeakerId, speaker: nextSpeaker, updatedAt: now };
      })
    : snapshot.contentUnits;

  const docMetadataChanged = metadataSignature(document.metadata) !== metadataSignature(nextDocMetadata);
  const hasChanges = docMetadataChanged || changedSegmentIds.length > 0;
  const nextDocuments = hasChanges
    ? snapshot.documents.map(item => item.id === document.id ? { ...item, metadata: nextDocMetadata, updatedAt: now } : item)
    : snapshot.documents;

  return finalize({
    ...snapshot,
    documents: nextDocuments,
    ...(isContentUnitSnapshot(snapshot) ? { contentUnits: nextContentUnits } : {}),
    segments: nextSegments
  }, {
    entity: 'speaker',
    action: 'register',
    id: resolvedSpeakerId,
    documentId: document.id,
    changedSegmentIds
  });
};

const renameSpeaker = (snapshot, payload, now) => {
  const document = requireStructuredDocument(snapshot, payload?.documentId || payload?.id);
  const speakerId = String(payload?.speakerId || '').trim();
  if (!speakerId) throw new Error('Speaker rename requires a speaker ID.');
  const cleanLabel = String(payload?.label || '').trim();
  if (!cleanLabel) throw new Error('Speaker label cannot be empty.');
  const normalizedLabel = normalizeTextStructuredSpeakerKey(cleanLabel);

  const currentRegistry = getTextStructuredSpeakerRegistry({ metadata: document.metadata });
  const existingEntry = currentRegistry.find(entry => entry.id === speakerId) || null;
  const conversationBlockIds = getDocumentConversationBlockIds(snapshot, document.id);
  const requestedSegmentIds = new Set(
    (Array.isArray(payload?.segmentIds) ? payload.segmentIds : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  );

  // Check registered label collisions first via canonical registry validation, then check unregistered detected speakers.
  const nextDocMetadata = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: document.metadata,
    documentId: document.id,
    speakerId,
    label: cleanLabel
  });

  const belongsToTargetSpeaker = segment => {
    const currentSegSpeakerId = getTextStructuredSegmentSpeakerId(segment);
    if (currentSegSpeakerId) return currentSegSpeakerId === speakerId;
    if (requestedSegmentIds.has(segment.id)) return true;
    if (existingEntry && normalizeTextStructuredSpeakerKey(segment.speaker) === normalizeTextStructuredSpeakerKey(existingEntry.label)) return true;
    const segmentLabel = String(segment.speaker || '').trim();
    return Boolean(segmentLabel) && deriveTextStructuredSpeakerId({ documentId: document.id, speaker: segmentLabel }) === speakerId;
  };

  for (const segment of snapshot.segments) {
    if (segment.documentId !== document.id || !conversationBlockIds.has(segment.blockId)) continue;
    if (belongsToTargetSpeaker(segment)) continue;
    if (normalizeTextStructuredSpeakerKey(segment.speaker) === normalizedLabel) {
      throw new Error(`Speaker label “${cleanLabel}” is already used in this document`);
    }
  }

  const changedSegmentIds = [];
  const nextSegments = snapshot.segments.map(item => {
    if (item.documentId !== document.id || !conversationBlockIds.has(item.blockId)) return item;
    if (!belongsToTargetSpeaker(item)) return item;
    const nextSegMetadata = buildTextStructuredSegmentSpeakerIdentityMetadata(item.metadata, speakerId);
    const labelChanged = String(item.speaker || '') !== cleanLabel;
    const metadataChanged = metadataSignature(item.metadata) !== metadataSignature(nextSegMetadata);
    if (!labelChanged && !metadataChanged) return item;
    changedSegmentIds.push(item.id);
    return { ...item, speaker: cleanLabel, metadata: nextSegMetadata, updatedAt: now };
  });

  const changedSegmentSet = new Set(changedSegmentIds);
  const nextContentUnits = isContentUnitSnapshot(snapshot)
    ? (snapshot.contentUnits || []).map(unit => {
        if (unit.documentId !== document.id || unit.kind !== 'turn') return unit;
        const unitLabelMatch = !unit.speakerId && (
          (existingEntry && normalizeTextStructuredSpeakerKey(unit.speaker) === normalizeTextStructuredSpeakerKey(existingEntry.label))
          || (Boolean(unit.speaker) && deriveTextStructuredSpeakerId({ documentId: document.id, speaker: unit.speaker }) === speakerId)
        );
        const segLinkedMatch = snapshot.segments.some(s => s.unitId === unit.id && changedSegmentSet.has(s.id));
        if (unit.speakerId !== speakerId && !unitLabelMatch && !segLinkedMatch) return unit;
        if (unit.speaker === cleanLabel && unit.speakerId === speakerId) return unit;
        return { ...unit, speaker: cleanLabel, speakerId, updatedAt: now };
      })
    : snapshot.contentUnits;

  const docMetadataChanged = metadataSignature(document.metadata) !== metadataSignature(nextDocMetadata);
  const hasChanges = docMetadataChanged || changedSegmentIds.length > 0;
  const nextDocuments = hasChanges
    ? snapshot.documents.map(item => item.id === document.id ? { ...item, metadata: nextDocMetadata, updatedAt: now } : item)
    : snapshot.documents;

  return finalize({
    ...snapshot,
    documents: nextDocuments,
    ...(isContentUnitSnapshot(snapshot) ? { contentUnits: nextContentUnits } : {}),
    segments: nextSegments
  }, {
    entity: 'speaker',
    action: 'rename',
    id: speakerId,
    documentId: document.id,
    changedSegmentIds
  });
};

const removeSpeaker = (snapshot, payload, now) => {
  const document = requireStructuredDocument(snapshot, payload?.documentId || payload?.id);
  const speakerId = String(payload?.speakerId || '').trim();
  if (!speakerId) throw new Error('Speaker removal requires a speaker ID.');
  const currentRegistry = getTextStructuredSpeakerRegistry({ metadata: document.metadata });
  const existingEntry = currentRegistry.find(entry => entry.id === speakerId) || null;
  if (!existingEntry) {
    return finalize(snapshot, { entity: 'speaker', action: 'remove', id: speakerId, documentId: document.id, unchanged: true });
  }
  const conversationBlockIds = getDocumentConversationBlockIds(snapshot, document.id);
  const existingNormalizedLabel = normalizeTextStructuredSpeakerKey(existingEntry.label);
  const isUsedInSegments = snapshot.segments.some(segment => {
    if (segment.documentId !== document.id || !conversationBlockIds.has(segment.blockId)) return false;
    const segSpeakerId = getTextStructuredSegmentSpeakerId(segment);
    if (segSpeakerId) return segSpeakerId === speakerId;
    return Boolean(existingNormalizedLabel) && normalizeTextStructuredSpeakerKey(segment.speaker) === existingNormalizedLabel;
  });
  const isUsedInUnits = isContentUnitSnapshot(snapshot) && (snapshot.contentUnits || []).some(unit => {
    if (unit.documentId !== document.id || unit.kind !== 'turn') return false;
    if (unit.speakerId) return unit.speakerId === speakerId;
    return Boolean(existingNormalizedLabel) && normalizeTextStructuredSpeakerKey(unit.speaker) === existingNormalizedLabel;
  });
  if (isUsedInSegments || isUsedInUnits) {
    throw new Error(`Speaker “${existingEntry.label}” is in use and cannot be removed`);
  }
  const nextDocMetadata = buildTextStructuredRemoveSpeakerRegistryMetadata({
    metadata: document.metadata,
    speakerId
  });
  const docMetadataChanged = metadataSignature(document.metadata) !== metadataSignature(nextDocMetadata);
  const nextDocuments = docMetadataChanged
    ? snapshot.documents.map(item => item.id === document.id ? { ...item, metadata: nextDocMetadata, updatedAt: now } : item)
    : snapshot.documents;
  return finalize({
    ...snapshot,
    documents: nextDocuments
  }, {
    entity: 'speaker',
    action: 'remove',
    id: speakerId,
    documentId: document.id
  });
};

const resetAudioPreferences = (snapshot, payload, now) => {
  const scope = String(payload?.scope || '').trim();
  const docPatchById = new Map();
  const blockPatchById = new Map();
  const segmentPatchById = new Map();
  let targetId = null;
  let documentId = null;

  if (scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE) {
    const document = requireStructuredDocument(snapshot, payload?.documentId);
    targetId = document.id;
    documentId = document.id;
    const includeSpeakers = Boolean(payload?.includeSpeakers);
    docPatchById.set(document.id, buildResetTextWorkspaceAudioMetadata(document.metadata, { includeSpeakers }));
    if (payload?.includeCardsAndSegments === true) {
      snapshot.blocks
        .filter(item => item.documentId === document.id)
        .forEach(item => blockPatchById.set(item.id, buildResetTextBlockAudioMetadata(item.metadata, { includeSpeakers })));
      snapshot.segments
        .filter(item => item.documentId === document.id)
        .forEach(item => segmentPatchById.set(item.id, buildResetTextSegmentAudioMetadata(item.metadata)));
    }
  } else if (
    scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS
    || scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_EDGE_PRESET
  ) {
    const document = requireStructuredDocument(snapshot, payload?.documentId);
    targetId = document.id;
    documentId = document.id;
    docPatchById.set(document.id,
      scope === TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE_BROWSER_TTS
        ? buildResetTextWorkspaceBrowserTtsMetadata(document.metadata)
        : buildResetTextWorkspaceEdgePresetMetadata(document.metadata)
    );
  } else if (scope === TEXT_STRUCTURED_RESET_SCOPES.SPEAKERS) {
    const document = requireStructuredDocument(snapshot, payload?.documentId);
    targetId = payload?.speakerId || payload?.speaker || document.id;
    documentId = document.id;
    const speakerOptions = {
      speakerId: payload?.speakerId || null,
      speaker: payload?.speaker || null,
      includeSync: payload?.includeSync !== false
    };
    docPatchById.set(document.id, buildResetTextSpeakerAudioMetadata(document.metadata, { ...speakerOptions, isDocument: true }));
    snapshot.blocks
      .filter(item => item.documentId === document.id)
      .forEach(item => blockPatchById.set(item.id, buildResetTextSpeakerAudioMetadata(item.metadata, {
        speakerId: speakerOptions.speakerId,
        speaker: speakerOptions.speaker,
        includeSync: false,
        isDocument: false
      })));
  } else if (scope === TEXT_STRUCTURED_RESET_SCOPES.CARD) {
    const block = requireBlock(snapshot, payload?.blockId);
    requireStructuredDocument(snapshot, block.documentId);
    targetId = block.id;
    documentId = block.documentId;
    blockPatchById.set(block.id, buildResetTextBlockAudioMetadata(block.metadata, {
      includeSpeakers: payload?.includeSpeakers !== false
    }));
    if (payload?.includeSegments !== false) {
      snapshot.segments
        .filter(item => item.blockId === block.id)
        .forEach(item => segmentPatchById.set(item.id, buildResetTextSegmentAudioMetadata(item.metadata)));
    }
  } else if (scope === TEXT_STRUCTURED_RESET_SCOPES.SEGMENT) {
    const segment = requireSegment(snapshot, payload?.segmentId);
    requireStructuredDocument(snapshot, segment.documentId);
    targetId = segment.id;
    documentId = segment.documentId;
    segmentPatchById.set(segment.id, buildResetTextSegmentAudioMetadata(segment.metadata));
  } else {
    throw new Error(`Unsupported Text audio preference reset scope: ${scope || '(missing)'}`);
  }

  const changedDocumentIds = [];
  const changedBlockIds = [];
  const changedSegmentIds = [];

  const nextBlocks = snapshot.blocks.map(item => {
    if (!blockPatchById.has(item.id)) return item;
    const nextMetadata = blockPatchById.get(item.id);
    if (metadataSignature(item.metadata) === metadataSignature(nextMetadata)) return item;
    changedBlockIds.push(item.id);
    return { ...item, metadata: nextMetadata, updatedAt: now };
  });

  const nextSegments = snapshot.segments.map(item => {
    if (!segmentPatchById.has(item.id)) return item;
    const nextMetadata = segmentPatchById.get(item.id);
    if (metadataSignature(item.metadata) === metadataSignature(nextMetadata)) return item;
    changedSegmentIds.push(item.id);
    return { ...item, metadata: nextMetadata, updatedAt: now };
  });

  const hasChildChanges = changedBlockIds.length > 0 || changedSegmentIds.length > 0;
  const nextDocuments = snapshot.documents.map(item => {
    if (item.id !== documentId && !docPatchById.has(item.id)) return item;
    const patchedMetadata = docPatchById.has(item.id) ? docPatchById.get(item.id) : item.metadata;
    const docMetadataChanged = docPatchById.has(item.id) && metadataSignature(item.metadata) !== metadataSignature(patchedMetadata);
    if (!docMetadataChanged && !hasChildChanges) return item;
    if (docMetadataChanged) changedDocumentIds.push(item.id);
    return { ...item, metadata: patchedMetadata, updatedAt: now };
  });

  return finalize({
    ...snapshot,
    documents: nextDocuments,
    blocks: nextBlocks,
    segments: nextSegments
  }, {
    entity: 'audioPreferences',
    action: 'reset',
    scope,
    id: targetId,
    documentId,
    changedCount: changedDocumentIds.length + changedBlockIds.length + changedSegmentIds.length,
    changedDocumentIds,
    changedBlockIds,
    changedSegmentIds
  });
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
    case COMMAND_TYPES.SEGMENT_MOVE: return moveSegmentToUnitCommand({ snapshot, payload, now, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_CREATE: return createContentUnitCommand({ snapshot, payload, now, allocateIdentity, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_UPDATE: return updateContentUnitCommand({ snapshot, payload, now, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_REORDER: return reorderContentUnitsCommand({ snapshot, payload, now, normalizeExactOrderIds, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_REORDER_SEGMENTS: return reorderContentUnitSegmentsCommand({ snapshot, payload, now, normalizeExactOrderIds, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_SPLIT: return splitContentUnitCommand({ snapshot, payload, now, allocateIdentity, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_MERGE: return mergeContentUnitsCommand({ snapshot, payload, now, finalize });
    case COMMAND_TYPES.CONTENT_UNIT_DELETE: return deleteContentUnitCommand({ snapshot, payload, now, finalize });
    case COMMAND_TYPES.SPLIT_PARAGRAPH_SEGMENT: return splitSentenceSegment(snapshot, payload, now, 'paragraph');
    case COMMAND_TYPES.MERGE_PARAGRAPH_SEGMENTS: return mergeSentenceSegments(snapshot, payload, now, 'paragraph');
    case COMMAND_TYPES.SPLIT_CONVERSATION_SEGMENT: return splitSentenceSegment(snapshot, payload, now, 'conversation');
    case COMMAND_TYPES.MERGE_CONVERSATION_SEGMENTS: return mergeSentenceSegments(snapshot, payload, now, 'conversation');
    case COMMAND_TYPES.UPSERT_AUDIO_VARIANT: return upsertAudioVariant(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_AUDIO_VARIANT: return deleteAudioVariant(snapshot, payload, now);
    case COMMAND_TYPES.UPSERT_FULL_AUDIO_ARTIFACT: return upsertFullAudioArtifact(snapshot, payload, now);
    case COMMAND_TYPES.DELETE_FULL_AUDIO_ARTIFACT: return deleteFullAudioArtifact(snapshot, payload, now);
    case COMMAND_TYPES.REGISTER_SPEAKER: return registerSpeaker(snapshot, payload, now);
    case COMMAND_TYPES.RENAME_SPEAKER: return renameSpeaker(snapshot, payload, now);
    case COMMAND_TYPES.REMOVE_SPEAKER: return removeSpeaker(snapshot, payload, now);
    case COMMAND_TYPES.RESET_AUDIO_PREFERENCES: return resetAudioPreferences(snapshot, payload, now);
    default: throw new Error(`Unknown Text Library command: ${type || '(missing)'}`);
  }
};
