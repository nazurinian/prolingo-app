import {
  DEFAULT_MEANING_LANGUAGE,
  DEFAULT_TEXT_DOCUMENT_TITLE,
  DEFAULT_TEXT_LANGUAGE,
  TEXT_AUDIO_CHANNELS,
  TEXT_BLOCK_TYPES,
  TEXT_DOCUMENT_TYPES,
  TEXT_ID_PREFIXES,
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../../constants/textDatabaseConstants.js';
import {
  createEmptyTextIdentityState,
  formatTextId,
  getTextIdSequence,
  normalizeTextIdentityState
} from './textIdentityDomain.js';
import { getTextStructuredAudioVariantKey } from './textStructuredAudioIdentityDomain.js';

const normalizePositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeOrder = (value, fallback = 1) => normalizePositiveInt(value, fallback);
const normalizeText = (value) => String(value ?? '').trim();
const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text || null;
};

export const createDefaultTextIdCounters = () => ({
  collection: 0,
  document: 0,
  text: 0,
  segment: 0,
  audioVariant: 0
});

export const normalizeTextIdCounters = (candidate = {}) => ({
  collection: normalizePositiveInt(candidate.collection),
  document: normalizePositiveInt(candidate.document),
  text: normalizePositiveInt(candidate.text),
  segment: normalizePositiveInt(candidate.segment),
  audioVariant: normalizePositiveInt(candidate.audioVariant)
});

export const formatTextLibraryId = (kind, sequence) => {
  const prefix = TEXT_ID_PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown Text identity kind: ${kind}`);
  const safe = normalizePositiveInt(sequence, 1);
  return `${prefix}${String(safe).padStart(6, '0')}`;
};

export const getTextLibraryIdSequence = (kind, id) => {
  if (kind === 'BLOCK') return getTextIdSequence(id);
  const prefix = TEXT_ID_PREFIXES[kind];
  if (!prefix) return 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(id || '').toUpperCase().match(new RegExp(`^${escaped}(\\d+)$`));
  return match ? normalizePositiveInt(match[1]) : 0;
};

export const createTextCollectionRecord = ({
  id,
  title = 'Untitled Collection',
  order = 1,
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
}) => {
  if (!getTextLibraryIdSequence('COLLECTION', id)) throw new Error(`Invalid COLLECTION_ID: ${id}`);
  return {
    id,
    order: normalizeOrder(order),
    title: normalizeText(title) || 'Untitled Collection',
    createdAt,
    updatedAt,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
};

export const createTextDocumentRecord = ({
  id,
  title = DEFAULT_TEXT_DOCUMENT_TITLE,
  collectionId = null,
  order = 1,
  documentType = 'mixed',
  textLanguage = DEFAULT_TEXT_LANGUAGE,
  meaningLanguage = DEFAULT_MEANING_LANGUAGE,
  editorModel = TEXT_LEGACY_EDITOR_MODEL,
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
}) => {
  if (!getTextLibraryIdSequence('DOCUMENT', id)) throw new Error(`Invalid DOC_ID: ${id}`);
  if (!TEXT_DOCUMENT_TYPES.includes(documentType)) throw new Error(`Invalid Text document type: ${documentType}`);
  return {
    id,
    collectionId: collectionId || null,
    order: normalizeOrder(order),
    title: normalizeText(title) || DEFAULT_TEXT_DOCUMENT_TITLE,
    documentType,
    textLanguage: normalizeText(textLanguage) || DEFAULT_TEXT_LANGUAGE,
    meaningLanguage: normalizeText(meaningLanguage) || DEFAULT_MEANING_LANGUAGE,
    editorModel,
    createdAt,
    updatedAt,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
};

export const createTextBlockRecord = ({
  id,
  documentId,
  order = 1,
  blockType = 'paragraph',
  title = null,
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
}) => {
  if (!getTextIdSequence(id)) throw new Error(`Invalid TEXT_ID: ${id}`);
  if (!getTextLibraryIdSequence('DOCUMENT', documentId)) throw new Error(`Invalid block DOC_ID: ${documentId}`);
  if (!TEXT_BLOCK_TYPES.includes(blockType)) throw new Error(`Invalid Text block type: ${blockType}`);
  return {
    id: String(id).toUpperCase(),
    documentId,
    order: normalizeOrder(order),
    blockType,
    title: normalizeOptionalText(title),
    createdAt,
    updatedAt,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
};

export const createTextSegmentRecord = ({
  id,
  documentId,
  blockId,
  order = 1,
  text = '',
  meaning = '',
  speaker = null,
  joinAfter = 'space',
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
}) => {
  if (!getTextLibraryIdSequence('SEGMENT', id)) throw new Error(`Invalid SEGMENT_ID: ${id}`);
  if (!getTextLibraryIdSequence('DOCUMENT', documentId)) throw new Error(`Invalid segment DOC_ID: ${documentId}`);
  if (!getTextIdSequence(blockId)) throw new Error(`Invalid segment TEXT_ID: ${blockId}`);
  const normalizedText = normalizeText(text);
  if (!normalizedText) throw new Error(`SEGMENT_ID ${id} requires non-empty text`);
  return {
    id,
    documentId,
    blockId: String(blockId).toUpperCase(),
    order: normalizeOrder(order),
    text: normalizedText,
    meaning: normalizeText(meaning),
    speaker: normalizeOptionalText(speaker),
    joinAfter: ['space', 'line', 'none'].includes(joinAfter) ? joinAfter : 'space',
    createdAt,
    updatedAt,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
};

export const createTextAudioVariantRecord = ({
  id,
  segmentId,
  channel = 'text',
  engine = 'local',
  voiceId = null,
  language = null,
  filename = null,
  mimeType = null,
  source = 'file',
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
}) => {
  if (!getTextLibraryIdSequence('AUDIO_VARIANT', id)) throw new Error(`Invalid Text audio variant ID: ${id}`);
  if (!getTextLibraryIdSequence('SEGMENT', segmentId)) throw new Error(`Invalid audio SEGMENT_ID: ${segmentId}`);
  if (!TEXT_AUDIO_CHANNELS.includes(channel)) throw new Error(`Invalid Text audio channel: ${channel}`);
  return {
    id,
    segmentId,
    channel,
    engine: normalizeText(engine) || 'local',
    voiceId: normalizeOptionalText(voiceId),
    language: normalizeOptionalText(language),
    filename: normalizeOptionalText(filename),
    mimeType: normalizeOptionalText(mimeType),
    source: normalizeText(source) || 'file',
    createdAt,
    updatedAt,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
};

export const createLegacyTextMigrationPlan = (legacyCandidate, now = Date.now()) => {
  const legacy = normalizeTextIdentityState(legacyCandidate, '');
  const documentId = formatTextLibraryId('DOCUMENT', 1);
  const document = createTextDocumentRecord({
    id: documentId,
    title: DEFAULT_TEXT_DOCUMENT_TITLE,
    collectionId: null,
    order: 1,
    documentType: 'mixed',
    editorModel: TEXT_LEGACY_EDITOR_MODEL,
    createdAt: now,
    updatedAt: now,
    metadata: { migratedFrom: 'prolingo_text_identity_v1' }
  });

  const blocks = [];
  const segments = [];
  let segmentHighWater = 0;
  let maxTextHighWater = Math.max(legacy.highWater, 0);

  legacy.items.forEach((item, index) => {
    maxTextHighWater = Math.max(maxTextHighWater, getTextIdSequence(item.id));
    segmentHighWater += 1;
    const block = createTextBlockRecord({
      id: item.id,
      documentId,
      order: index + 1,
      blockType: 'paragraph',
      createdAt: now,
      updatedAt: now,
      metadata: { migratedFromLegacyLine: true }
    });
    const segment = createTextSegmentRecord({
      id: formatTextLibraryId('SEGMENT', segmentHighWater),
      documentId,
      blockId: item.id,
      order: 1,
      text: item.text,
      meaning: '',
      createdAt: now,
      updatedAt: now,
      metadata: { migratedFromLegacyLine: true }
    });
    blocks.push(block);
    segments.push(segment);
  });

  const counters = {
    ...createDefaultTextIdCounters(),
    document: 1,
    text: maxTextHighWater,
    segment: segmentHighWater
  };

  return {
    schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION,
    activeDocumentId: documentId,
    counters,
    collections: [],
    documents: [document],
    blocks,
    segments,
    audioVariants: [],
    migration: {
      source: 'prolingo_text_identity_v1',
      completedAt: now,
      legacyHighWater: legacy.highWater,
      migratedBlockCount: blocks.length,
      migratedSegmentCount: segments.length
    }
  };
};

export const resolveLegacyTextIdentityProjection = ({ document, blocks = [], segments = [], highWater = 0 }) => {
  if (!document) return createEmptyTextIdentityState();
  if (document.editorModel !== TEXT_LEGACY_EDITOR_MODEL) {
    throw new Error(`Document ${document.id} is not a legacy-line compatibility document`);
  }
  const segmentsByBlock = new Map();
  segments.forEach(segment => {
    const list = segmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    segmentsByBlock.set(segment.blockId, list);
  });

  const orderedBlocks = [...blocks]
    .filter(block => block.documentId === document.id)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const items = orderedBlocks.map(block => {
    const blockSegments = (segmentsByBlock.get(block.id) || []).sort((a, b) => a.order - b.order);
    if (blockSegments.length !== 1) {
      throw new Error(`Legacy compatibility block ${block.id} must have exactly one segment`);
    }
    return { id: block.id, text: blockSegments[0].text };
  });
  const maxTextSequence = items.reduce((max, item) => Math.max(max, getTextIdSequence(item.id)), 0);
  return {
    schemaVersion: 1,
    highWater: Math.max(normalizePositiveInt(highWater), maxTextSequence),
    rawContent: items.map(item => item.text).join('\n'),
    items
  };
};

export const validateTextLibrarySnapshot = (snapshot) => {
  const errors = [];
  const collections = Array.isArray(snapshot?.collections) ? snapshot.collections : [];
  const documents = Array.isArray(snapshot?.documents) ? snapshot.documents : [];
  const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
  const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : [];
  const audioVariants = Array.isArray(snapshot?.audioVariants) ? snapshot.audioVariants : [];
  const collectionIds = new Set(collections.map(item => item.id));
  const documentIds = new Set(documents.map(item => item.id));
  const blockIds = new Set(blocks.map(item => item.id));
  const segmentIds = new Set(segments.map(item => item.id));
  const audioIds = new Set(audioVariants.map(item => item.id));

  if (collectionIds.size !== collections.length) errors.push('Duplicate COLLECTION_ID detected');
  if (documentIds.size !== documents.length) errors.push('Duplicate DOC_ID detected');
  if (blockIds.size !== blocks.length) errors.push('Duplicate TEXT_ID detected');
  if (segmentIds.size !== segments.length) errors.push('Duplicate SEGMENT_ID detected');
  if (audioIds.size !== audioVariants.length) errors.push('Duplicate Text audio variant ID detected');

  documents.forEach(document => {
    if (document.collectionId && !collectionIds.has(document.collectionId)) {
      errors.push(`Document ${document.id} references missing collection ${document.collectionId}`);
    }
    if (!TEXT_DOCUMENT_TYPES.includes(document.documentType)) {
      errors.push(`Document ${document.id} has invalid type ${document.documentType}`);
    }
  });
  blocks.forEach(block => {
    if (!documentIds.has(block.documentId)) errors.push(`Block ${block.id} references missing document ${block.documentId}`);
    if (!TEXT_BLOCK_TYPES.includes(block.blockType)) errors.push(`Block ${block.id} has invalid type ${block.blockType}`);
    const parentDocument = documents.find(document => document.id === block.documentId);
    if (parentDocument?.documentType === 'paragraph' && block.blockType !== 'paragraph') {
      errors.push(`Paragraph document ${parentDocument.id} contains non-paragraph block ${block.id}`);
    }
    if (parentDocument?.documentType === 'conversation' && block.blockType !== 'conversation') {
      errors.push(`Conversation document ${parentDocument.id} contains non-conversation block ${block.id}`);
    }
  });
  segments.forEach(segment => {
    if (!documentIds.has(segment.documentId)) errors.push(`Segment ${segment.id} references missing document ${segment.documentId}`);
    if (!blockIds.has(segment.blockId)) errors.push(`Segment ${segment.id} references missing block ${segment.blockId}`);
    const parent = blocks.find(block => block.id === segment.blockId);
    if (parent && parent.documentId !== segment.documentId) {
      errors.push(`Segment ${segment.id} document does not match parent block`);
    }
  });
  const audioVariantKeys = new Set();
  audioVariants.forEach(variant => {
    if (!segmentIds.has(variant.segmentId)) errors.push(`Audio variant ${variant.id} references missing segment ${variant.segmentId}`);
    if (!TEXT_AUDIO_CHANNELS.includes(variant.channel)) errors.push(`Audio variant ${variant.id} has invalid channel ${variant.channel}`);
    try {
      const identityKey = getTextStructuredAudioVariantKey(variant);
      if (audioVariantKeys.has(identityKey)) errors.push(`Duplicate Text audio variant identity ${identityKey}`);
      audioVariantKeys.add(identityKey);
    } catch (error) {
      errors.push(`Audio variant ${variant.id} has invalid identity: ${error.message}`);
    }
  });

  const orderGroups = new Map();
  collections.forEach(collection => {
    const key = 'collections';
    const values = orderGroups.get(key) || new Set();
    if (values.has(collection.order)) errors.push(`Duplicate collection order ${collection.order}`);
    values.add(collection.order);
    orderGroups.set(key, values);
  });
  documents.forEach(document => {
    const key = `collection:${document.collectionId || '__root__'}`;
    const values = orderGroups.get(key) || new Set();
    if (values.has(document.order)) errors.push(`Duplicate document order ${document.order} in ${document.collectionId || 'root'}`);
    values.add(document.order);
    orderGroups.set(key, values);
  });
  blocks.forEach(block => {
    const key = `doc:${block.documentId}`;
    const values = orderGroups.get(key) || new Set();
    if (values.has(block.order)) errors.push(`Duplicate block order ${block.order} in ${block.documentId}`);
    values.add(block.order);
    orderGroups.set(key, values);
  });
  segments.forEach(segment => {
    const key = `block:${segment.blockId}`;
    const values = orderGroups.get(key) || new Set();
    if (values.has(segment.order)) errors.push(`Duplicate segment order ${segment.order} in ${segment.blockId}`);
    values.add(segment.order);
    orderGroups.set(key, values);
  });

  return { valid: errors.length === 0, errors };
};

export const createLegacyCompatibilitySyncPlan = ({
  document,
  allBlocks = [],
  currentSegments = [],
  counters: countersCandidate = {},
  nextTextIdentityState,
  now = Date.now()
}) => {
  if (!document) throw new Error('Legacy compatibility sync requires a document');
  if (document.editorModel !== TEXT_LEGACY_EDITOR_MODEL) {
    throw new Error(`Legacy compatibility sync refused for structured document ${document.id}`);
  }
  const nextState = normalizeTextIdentityState(nextTextIdentityState, '');
  const blocksById = new Map(allBlocks.map(record => [record.id, record]));
  const currentBlocks = allBlocks.filter(record => record.documentId === document.id);
  const segmentsByBlock = new Map();
  currentSegments.forEach(segment => {
    const list = segmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    segmentsByBlock.set(segment.blockId, list);
  });
  for (const [blockId, blockSegments] of segmentsByBlock) {
    if (blockSegments.length > 1) {
      throw new Error(`Legacy compatibility sync refused: ${blockId} has ${blockSegments.length} segments`);
    }
  }

  let counters = bumpTextCounterFloor(countersCandidate, nextState);
  const nextIds = new Set(nextState.items.map(item => String(item.id).toUpperCase()));
  const deleteBlocks = [];
  const deleteSegments = [];
  const upsertBlocks = [];
  const upsertSegments = [];

  currentBlocks.forEach(oldBlock => {
    if (nextIds.has(oldBlock.id)) return;
    deleteBlocks.push(oldBlock.id);
    (segmentsByBlock.get(oldBlock.id) || []).forEach(segment => deleteSegments.push(segment.id));
  });

  nextState.items.forEach((item, index) => {
    const id = String(item.id).toUpperCase();
    if (!getTextIdSequence(id)) throw new Error(`Invalid legacy TEXT_ID during sync: ${id}`);
    const anyExistingBlock = blocksById.get(id);
    if (anyExistingBlock && anyExistingBlock.documentId !== document.id) {
      throw new Error(`TEXT_ID collision: ${id} belongs to another document`);
    }
    const currentBlock = anyExistingBlock || null;
    upsertBlocks.push(createTextBlockRecord({
      ...(currentBlock || {}),
      id,
      documentId: document.id,
      order: index + 1,
      blockType: currentBlock?.blockType || 'paragraph',
      createdAt: currentBlock?.createdAt || now,
      updatedAt: now,
      metadata: currentBlock?.metadata || { createdByLegacyBridge: true }
    }));

    const existingSegments = segmentsByBlock.get(id) || [];
    const existing = existingSegments[0];
    if (!existing) counters.segment += 1;
    const segmentId = existing?.id || formatTextLibraryId('SEGMENT', counters.segment);
    upsertSegments.push(createTextSegmentRecord({
      ...(existing || {}),
      id: segmentId,
      documentId: document.id,
      blockId: id,
      order: 1,
      text: item.text,
      meaning: existing?.meaning || '',
      speaker: existing?.speaker || null,
      joinAfter: existing?.joinAfter || 'space',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      metadata: existing?.metadata || { createdByLegacyBridge: true }
    }));
  });

  counters.text = Math.max(
    counters.text,
    nextState.highWater,
    ...nextState.items.map(item => getTextIdSequence(item.id))
  );

  return {
    document: { ...document, updatedAt: now },
    counters,
    deleteBlocks,
    deleteSegments,
    upsertBlocks,
    upsertSegments,
    itemCount: nextState.items.length
  };
};

export const bumpTextCounterFloor = (counters, textIdentityState) => {
  const normalized = normalizeTextIdCounters(counters);
  const state = normalizeTextIdentityState(textIdentityState, '');
  const maxItemSequence = state.items.reduce((max, item) => Math.max(max, getTextIdSequence(item.id)), 0);
  return {
    ...normalized,
    text: Math.max(normalized.text, state.highWater, maxItemSequence)
  };
};

export const createLegacyCompatibilityIdentityState = ({ items = [], highWater = 0 }) => {
  const normalizedItems = items.map(item => ({ id: item.id, text: item.text }));
  const maxId = normalizedItems.reduce((max, item) => Math.max(max, getTextIdSequence(item.id)), 0);
  return {
    schemaVersion: 1,
    highWater: Math.max(highWater, maxId),
    rawContent: normalizedItems.map(item => item.text).join('\n'),
    items: normalizedItems
  };
};

export { formatTextId };

const sortLibraryRecords = records => [...records].sort((a, b) => {
  const orderDelta = normalizeOrder(a?.order, Number.MAX_SAFE_INTEGER) - normalizeOrder(b?.order, Number.MAX_SAFE_INTEGER);
  if (orderDelta) return orderDelta;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
});

export const normalizeTextLibraryRuntimeSnapshot = (candidate = {}) => {
  const snapshot = {
    schemaVersion: normalizePositiveInt(candidate.schemaVersion, TEXT_LIBRARY_SCHEMA_VERSION),
    activeDocumentId: candidate.activeDocumentId || null,
    initialized: Boolean(candidate.initialized),
    counters: normalizeTextIdCounters(candidate.counters),
    collections: sortLibraryRecords(Array.isArray(candidate.collections) ? candidate.collections : []),
    documents: sortLibraryRecords(Array.isArray(candidate.documents) ? candidate.documents : []),
    blocks: sortLibraryRecords(Array.isArray(candidate.blocks) ? candidate.blocks : []),
    segments: sortLibraryRecords(Array.isArray(candidate.segments) ? candidate.segments : []),
    audioVariants: Array.isArray(candidate.audioVariants) ? [...candidate.audioVariants] : []
  };
  const validation = validateTextLibrarySnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(`Invalid Text Library runtime snapshot: ${validation.errors.join('; ')}`);
  }
  if (snapshot.activeDocumentId && !snapshot.documents.some(document => document.id === snapshot.activeDocumentId)) {
    throw new Error(`Active Text document ${snapshot.activeDocumentId} is missing from runtime snapshot`);
  }
  return snapshot;
};

export const resolveTextLibraryDocumentTree = (snapshotCandidate, documentId = null) => {
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate);
  const targetDocumentId = documentId || snapshot.activeDocumentId;
  const document = snapshot.documents.find(item => item.id === targetDocumentId) || null;
  if (!document) return null;

  const audioBySegment = new Map();
  snapshot.audioVariants.forEach(variant => {
    const variants = audioBySegment.get(variant.segmentId) || [];
    variants.push(variant);
    audioBySegment.set(variant.segmentId, variants);
  });

  const blocks = snapshot.blocks
    .filter(block => block.documentId === document.id)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map(block => ({
      ...block,
      segments: snapshot.segments
        .filter(segment => segment.blockId === block.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map(segment => ({
          ...segment,
          audioVariants: (audioBySegment.get(segment.id) || []).sort((a, b) => a.id.localeCompare(b.id))
        }))
    }));

  return { ...document, blocks };
};

export const resolveTextLibraryCatalog = snapshotCandidate => {
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate);
  const documentsByCollection = new Map();
  snapshot.documents.forEach(document => {
    const key = document.collectionId || '__root__';
    const list = documentsByCollection.get(key) || [];
    list.push(document);
    documentsByCollection.set(key, list);
  });
  return {
    rootDocuments: sortLibraryRecords(documentsByCollection.get('__root__') || []),
    collections: snapshot.collections.map(collection => ({
      ...collection,
      documents: sortLibraryRecords(documentsByCollection.get(collection.id) || [])
    }))
  };
};
