import { TEXT_LIBRARY_SCHEMA_VERSION, TEXT_STRUCTURED_EDITOR_MODEL } from '../../constants/textDatabaseConstants.js';
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
import { getTextIdSequence } from './textIdentityDomain.js';

export const PROLINGO_TEXT_PACK_TYPE = 'prolingo-text-pack';
export const PROLINGO_TEXT_PACK_VERSION = 1;
export const PROLINGO_TEXT_PACK_IMPORT_MODE = 'merge';
export const PROLINGO_TEXT_PACK_SCOPE_TYPES = Object.freeze(['document', 'collection']);

const sortByOrderThenId = records => [...records].sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
const cloneRecord = record => ({ ...record, metadata: record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? { ...record.metadata } : {} });
const normalizePackageId = (value, fallback) => String(value || fallback).trim().replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 180);

const maxSequence = (records, kind) => records.reduce((max, record) => Math.max(max, getTextLibraryIdSequence(kind, record?.id)), 0);
const maxTextSequence = records => records.reduce((max, record) => Math.max(max, getTextIdSequence(record?.id)), 0);

const computeCounterFloor = snapshot => ({
  collection: Math.max(snapshot.counters.collection, maxSequence(snapshot.collections, 'COLLECTION')),
  document: Math.max(snapshot.counters.document, maxSequence(snapshot.documents, 'DOCUMENT')),
  text: Math.max(snapshot.counters.text, maxTextSequence(snapshot.blocks)),
  segment: Math.max(snapshot.counters.segment, maxSequence(snapshot.segments, 'SEGMENT')),
  audioVariant: Math.max(snapshot.counters.audioVariant, maxSequence(snapshot.audioVariants, 'AUDIO_VARIANT'))
});

const buildPortableSnapshot = pack => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: pack.textSchemaVersion,
  initialized: true,
  activeDocumentId: null,
  counters: {
    collection: maxSequence(pack.collections, 'COLLECTION'),
    document: maxSequence(pack.documents, 'DOCUMENT'),
    text: maxTextSequence(pack.blocks),
    segment: maxSequence(pack.segments, 'SEGMENT'),
    audioVariant: maxSequence(pack.audioVariants, 'AUDIO_VARIANT')
  },
  collections: pack.collections,
  documents: pack.documents,
  blocks: pack.blocks,
  segments: pack.segments,
  audioVariants: pack.audioVariants
});

const requireStructuredDocuments = documents => {
  const incompatible = documents.find(document => document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL);
  if (incompatible) throw new Error(`Text Pack JSON only supports structured-v1 documents; ${incompatible.id} is ${incompatible.editorModel || 'unknown'}`);
};

export const validateProLingoTextPack = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Text Pack JSON root must be an object');
  if (candidate.packageType !== PROLINGO_TEXT_PACK_TYPE) throw new Error(`Unsupported Text Pack type: ${candidate.packageType || 'missing'}`);
  if (candidate.packageVersion !== PROLINGO_TEXT_PACK_VERSION) throw new Error(`Unsupported Text Pack version: ${candidate.packageVersion}`);
  if (candidate.textSchemaVersion !== TEXT_LIBRARY_SCHEMA_VERSION) throw new Error(`Text Pack schema ${candidate.textSchemaVersion} is incompatible with Text schema ${TEXT_LIBRARY_SCHEMA_VERSION}`);
  const scopeType = candidate.scope?.type;
  if (!PROLINGO_TEXT_PACK_SCOPE_TYPES.includes(scopeType)) throw new Error(`Invalid Text Pack scope: ${scopeType || 'missing'}`);

  const pack = {
    ...candidate,
    packageId: String(candidate.packageId || '').trim(),
    collections: Array.isArray(candidate.collections) ? candidate.collections.map(cloneRecord) : [],
    documents: Array.isArray(candidate.documents) ? candidate.documents.map(cloneRecord) : [],
    blocks: Array.isArray(candidate.blocks) ? candidate.blocks.map(cloneRecord) : [],
    segments: Array.isArray(candidate.segments) ? candidate.segments.map(cloneRecord) : [],
    audioVariants: Array.isArray(candidate.audioVariants) ? candidate.audioVariants.map(cloneRecord) : []
  };
  if (!pack.packageId) throw new Error('Text Pack packageId is required');
  if (!pack.documents.length) throw new Error('Text Pack must contain at least one structured Document');
  requireStructuredDocuments(pack.documents);

  if (scopeType === 'document') {
    if (pack.documents.length !== 1) throw new Error('Document Text Pack must contain exactly one Document');
    if (pack.collections.length !== 0) throw new Error('Document Text Pack must be standalone and contain no Collection record');
    if (pack.documents[0].collectionId) throw new Error('Document Text Pack Document must have collectionId=null');
    if (candidate.scope?.rootId !== pack.documents[0].id) throw new Error('Document Text Pack scope.rootId must match its DOC_ID');
  } else {
    if (pack.collections.length !== 1) throw new Error('Collection Text Pack must contain exactly one Collection');
    if (candidate.scope?.rootId !== pack.collections[0].id) throw new Error('Collection Text Pack scope.rootId must match its COLLECTION_ID');
    if (!pack.documents.length) throw new Error('Collection Text Pack must contain at least one Document');
    pack.documents.forEach(document => {
      if (document.collectionId !== pack.collections[0].id) throw new Error(`Collection Text Pack Document ${document.id} has an invalid collection relationship`);
    });
  }

  const snapshot = buildPortableSnapshot(pack);
  return { pack, snapshot };
};

const selectDocumentRecords = (snapshot, documentIds) => {
  const documentSet = new Set(documentIds);
  const blocks = sortByOrderThenId(snapshot.blocks.filter(block => documentSet.has(block.documentId)));
  const blockSet = new Set(blocks.map(block => block.id));
  const segments = sortByOrderThenId(snapshot.segments.filter(segment => documentSet.has(segment.documentId) && blockSet.has(segment.blockId)));
  const segmentSet = new Set(segments.map(segment => segment.id));
  const audioVariants = [...snapshot.audioVariants].filter(variant => segmentSet.has(variant.segmentId)).sort((a, b) => a.id.localeCompare(b.id));
  return { blocks, segments, audioVariants };
};

export const createProLingoTextPack = ({
  snapshot: snapshotCandidate,
  scopeType = 'document',
  rootId,
  source = {},
  now = Date.now(),
  packageId = null
}) => {
  if (!PROLINGO_TEXT_PACK_SCOPE_TYPES.includes(scopeType)) throw new Error(`Unsupported Text Pack export scope: ${scopeType}`);
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate);
  let collections = [];
  let documents = [];
  let scope;

  if (scopeType === 'document') {
    const document = snapshot.documents.find(item => item.id === rootId);
    if (!document) throw new Error(`Text Pack export Document not found: ${rootId}`);
    requireStructuredDocuments([document]);
    const sourceCollection = document.collectionId ? snapshot.collections.find(item => item.id === document.collectionId) || null : null;
    documents = [{ ...cloneRecord(document), collectionId: null, order: 1 }];
    scope = {
      type: 'document',
      rootId: document.id,
      sourceCollectionId: sourceCollection?.id || null,
      sourceCollectionTitle: sourceCollection?.title || null
    };
  } else {
    const collection = snapshot.collections.find(item => item.id === rootId);
    if (!collection) throw new Error(`Text Pack export Collection not found: ${rootId}`);
    documents = sortByOrderThenId(snapshot.documents.filter(item => item.collectionId === collection.id));
    if (!documents.length) throw new Error(`Collection ${collection.id} has no Documents to export`);
    requireStructuredDocuments(documents);
    collections = [{ ...cloneRecord(collection), order: 1 }];
    documents = documents.map((document, index) => ({ ...cloneRecord(document), order: index + 1 }));
    scope = { type: 'collection', rootId: collection.id };
  }

  const portable = selectDocumentRecords(snapshot, documents.map(document => document.id));
  const exportedAt = new Date(now).toISOString();
  const fallbackId = `PTP_${now}_${scope.type}_${scope.rootId}`;
  const pack = {
    packageType: PROLINGO_TEXT_PACK_TYPE,
    packageVersion: PROLINGO_TEXT_PACK_VERSION,
    textSchemaVersion: TEXT_LIBRARY_SCHEMA_VERSION,
    packageId: normalizePackageId(packageId, fallbackId),
    exportedAt,
    importPolicy: PROLINGO_TEXT_PACK_IMPORT_MODE,
    audioBinaryIncluded: false,
    scope,
    source: {
      appVersion: source.appVersion || null,
      checkpoint: source.checkpoint || null,
      engineeringLine: source.engineeringLine || null
    },
    collections,
    documents,
    blocks: portable.blocks.map(cloneRecord),
    segments: portable.segments.map(cloneRecord),
    audioVariants: portable.audioVariants.map(cloneRecord)
  };
  validateProLingoTextPack(pack);
  return pack;
};

const createIdAssignment = ({ kind, incomingRecords, localRecords, counter, textKind = false }) => {
  const localIds = new Set(localRecords.map(record => record.id));
  const incomingIds = incomingRecords.map(record => record.id);
  const preserved = new Set(incomingIds.filter(id => !localIds.has(id)));
  const occupied = new Set([...localIds, ...preserved]);
  const map = new Map();
  let highWater = counter;

  for (const id of preserved) {
    const sequence = textKind ? getTextIdSequence(id) : getTextLibraryIdSequence(kind, id);
    highWater = Math.max(highWater, sequence);
    map.set(id, id);
  }
  for (const id of incomingIds) {
    if (map.has(id)) continue;
    let nextId;
    do {
      highWater += 1;
      nextId = textKind ? `TEXT_${String(highWater).padStart(6, '0')}` : formatTextLibraryId(kind, highWater);
    } while (occupied.has(nextId));
    occupied.add(nextId);
    map.set(id, nextId);
  }
  return { map, highWater };
};

const sourceMetadata = ({ originalMetadata, pack, sourceId, entity, now, extra = {} }) => ({
  ...(originalMetadata && typeof originalMetadata === 'object' && !Array.isArray(originalMetadata) ? originalMetadata : {}),
  prolingoTextPackSource: {
    packageId: pack.packageId,
    packageVersion: pack.packageVersion,
    sourceScope: pack.scope.type,
    sourceRootId: pack.scope.rootId,
    sourceEntity: entity,
    sourceId,
    importedAt: new Date(now).toISOString(),
    ...extra
  }
});

const mapToObject = map => Object.fromEntries([...map.entries()]);

export const mergeProLingoTextPack = ({ localSnapshot: localCandidate, pack: packCandidate, now = Date.now() }) => {
  const local = normalizeTextLibraryRuntimeSnapshot(localCandidate);
  const { pack, snapshot: portable } = validateProLingoTextPack(packCandidate);
  const floor = computeCounterFloor(local);

  const collectionAssignment = createIdAssignment({ kind: 'COLLECTION', incomingRecords: portable.collections, localRecords: local.collections, counter: floor.collection });
  const documentAssignment = createIdAssignment({ kind: 'DOCUMENT', incomingRecords: portable.documents, localRecords: local.documents, counter: floor.document });
  const blockAssignment = createIdAssignment({ kind: 'BLOCK', incomingRecords: portable.blocks, localRecords: local.blocks, counter: floor.text, textKind: true });
  const segmentAssignment = createIdAssignment({ kind: 'SEGMENT', incomingRecords: portable.segments, localRecords: local.segments, counter: floor.segment });
  const audioAssignment = createIdAssignment({ kind: 'AUDIO_VARIANT', incomingRecords: portable.audioVariants, localRecords: local.audioVariants, counter: floor.audioVariant });

  const localCollectionMaxOrder = local.collections.reduce((max, record) => Math.max(max, record.order || 0), 0);
  const localRootDocumentMaxOrder = local.documents.filter(document => !document.collectionId).reduce((max, record) => Math.max(max, record.order || 0), 0);

  const importedCollections = sortByOrderThenId(portable.collections).map((record, index) => createTextCollectionRecord({
    ...record,
    id: collectionAssignment.map.get(record.id),
    order: localCollectionMaxOrder + index + 1,
    metadata: sourceMetadata({ originalMetadata: record.metadata, pack, sourceId: record.id, entity: 'collection', now })
  }));

  const docsByCollection = new Map();
  sortByOrderThenId(portable.documents).forEach(document => {
    const key = document.collectionId || '__root__';
    const list = docsByCollection.get(key) || [];
    list.push(document);
    docsByCollection.set(key, list);
  });
  const importedDocuments = [];
  for (const [sourceCollectionId, documents] of docsByCollection) {
    documents.forEach((record, index) => {
      const mappedCollectionId = sourceCollectionId === '__root__' ? null : collectionAssignment.map.get(sourceCollectionId);
      importedDocuments.push(createTextDocumentRecord({
        ...record,
        id: documentAssignment.map.get(record.id),
        collectionId: mappedCollectionId,
        order: mappedCollectionId ? index + 1 : localRootDocumentMaxOrder + index + 1,
        metadata: sourceMetadata({
          originalMetadata: record.metadata,
          pack,
          sourceId: record.id,
          entity: 'document',
          now,
          extra: pack.scope.type === 'document' ? {
            sourceCollectionId: pack.scope.sourceCollectionId || null,
            sourceCollectionTitle: pack.scope.sourceCollectionTitle || null
          } : {}
        })
      }));
    });
  }

  const blocksByDocument = new Map();
  sortByOrderThenId(portable.blocks).forEach(block => {
    const list = blocksByDocument.get(block.documentId) || [];
    list.push(block);
    blocksByDocument.set(block.documentId, list);
  });
  const importedBlocks = [];
  for (const [sourceDocumentId, blocks] of blocksByDocument) {
    blocks.forEach((record, index) => importedBlocks.push(createTextBlockRecord({
      ...record,
      id: blockAssignment.map.get(record.id),
      documentId: documentAssignment.map.get(sourceDocumentId),
      order: index + 1,
      metadata: sourceMetadata({ originalMetadata: record.metadata, pack, sourceId: record.id, entity: 'block', now })
    })));
  }

  const segmentsByBlock = new Map();
  sortByOrderThenId(portable.segments).forEach(segment => {
    const list = segmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    segmentsByBlock.set(segment.blockId, list);
  });
  const importedSegments = [];
  for (const [sourceBlockId, segments] of segmentsByBlock) {
    segments.forEach((record, index) => importedSegments.push(createTextSegmentRecord({
      ...record,
      id: segmentAssignment.map.get(record.id),
      documentId: documentAssignment.map.get(record.documentId),
      blockId: blockAssignment.map.get(sourceBlockId),
      order: index + 1,
      metadata: sourceMetadata({ originalMetadata: record.metadata, pack, sourceId: record.id, entity: 'segment', now })
    })));
  }

  const importedAudioVariants = [...portable.audioVariants].sort((a, b) => a.id.localeCompare(b.id)).map(record => createTextAudioVariantRecord({
    ...record,
    id: audioAssignment.map.get(record.id),
    segmentId: segmentAssignment.map.get(record.segmentId),
    metadata: sourceMetadata({
      originalMetadata: record.metadata,
      pack,
      sourceId: record.id,
      entity: 'audioVariant',
      now,
      extra: { binaryIncluded: false, reconnectRequired: true }
    })
  }));

  const counters = normalizeTextIdCounters({
    collection: collectionAssignment.highWater,
    document: documentAssignment.highWater,
    text: blockAssignment.highWater,
    segment: segmentAssignment.highWater,
    audioVariant: audioAssignment.highWater
  });

  const snapshot = normalizeTextLibraryRuntimeSnapshot({
    ...local,
    counters,
    collections: [...local.collections, ...importedCollections],
    documents: [...local.documents, ...importedDocuments],
    blocks: [...local.blocks, ...importedBlocks],
    segments: [...local.segments, ...importedSegments],
    audioVariants: [...local.audioVariants, ...importedAudioVariants]
  });

  return {
    snapshot,
    imported: {
      collectionIds: importedCollections.map(record => record.id),
      documentIds: importedDocuments.map(record => record.id),
      blockIds: importedBlocks.map(record => record.id),
      segmentIds: importedSegments.map(record => record.id),
      audioVariantIds: importedAudioVariants.map(record => record.id)
    },
    idMap: {
      collections: mapToObject(collectionAssignment.map),
      documents: mapToObject(documentAssignment.map),
      blocks: mapToObject(blockAssignment.map),
      segments: mapToObject(segmentAssignment.map),
      audioVariants: mapToObject(audioAssignment.map)
    },
    counts: {
      collections: importedCollections.length,
      documents: importedDocuments.length,
      blocks: importedBlocks.length,
      segments: importedSegments.length,
      audioVariants: importedAudioVariants.length
    },
    packageId: pack.packageId,
    importMode: PROLINGO_TEXT_PACK_IMPORT_MODE
  };
};
