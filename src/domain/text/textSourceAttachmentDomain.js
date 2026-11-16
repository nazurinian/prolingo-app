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
import { validateProLingoTextPack } from './textPackJsonDomain.js';
import { getTextIdSequence } from './textIdentityDomain.js';
import { backfillTextGlobalUids } from './textGlobalIdentityDomain.js';
import {
  backfillTextContentUnits,
  createTextContentUnitRecord,
  formatTextContentUnitId,
  getTextContentUnitIdSequence,
  isUnmodifiedEmptyParagraphBackfill,
  isContentUnitSnapshot
} from './textContentUnitDomain.js';
import { TEXT_LEGACY_EDITOR_MODEL } from '../../constants/textDatabaseConstants.js';

export const TEXT_SOURCE_ATTACHMENT_VERSION = 1;
export const TEXT_SOURCE_ATTACHMENT_STATUS = Object.freeze({
  ATTACHED: 'attached',
  LOCAL_CHANGED: 'local-changed',
  CONFLICT: 'conflict'
});

const V1_ENTITY_GROUPS = Object.freeze([
  ['collections', 'collection'],
  ['documents', 'document'],
  ['blocks', 'block'],
  ['segments', 'segment'],
  ['audioVariants', 'audioVariant']
]);

const V2_ENTITY_GROUPS = Object.freeze([
  ['collections', 'collection'],
  ['documents', 'document'],
  ['blocks', 'block'],
  ['contentUnits', 'contentUnit'],
  ['segments', 'segment'],
  ['audioVariants', 'audioVariant']
]);

const activeEntityGroups = includeUnits => includeUnits ? V2_ENTITY_GROUPS : V1_ENTITY_GROUPS;

const stripRuntimeMetadata = metadata => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const next = { ...metadata };
  delete next.prolingoTextPackSource;
  return next;
};

const preserveSpeakerRegistryGlobalUids = (incomingMetadata, existingMetadata) => {
  const incoming = incomingMetadata && typeof incomingMetadata === 'object' && !Array.isArray(incomingMetadata) ? incomingMetadata : {};
  const existing = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata) ? existingMetadata : {};
  const incomingSource = incoming.speakerRegistryV1;
  const existingSource = existing.speakerRegistryV1;
  const incomingEntries = Array.isArray(incomingSource) ? incomingSource : Array.isArray(incomingSource?.speakers) ? incomingSource.speakers : null;
  const existingEntries = Array.isArray(existingSource) ? existingSource : Array.isArray(existingSource?.speakers) ? existingSource.speakers : [];
  if (!incomingEntries) return incoming;
  const existingUidById = new Map(existingEntries.filter(entry => entry?.id && entry?.uid).map(entry => [String(entry.id), entry.uid]));
  const nextEntries = incomingEntries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const preservedUid = existingUidById.get(String(entry.id));
    return preservedUid ? { ...entry, uid: preservedUid } : entry;
  });
  return {
    ...incoming,
    speakerRegistryV1: Array.isArray(incomingSource) ? nextEntries : { ...incomingSource, speakers: nextEntries }
  };
};

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stableValue(value[key]);
    return acc;
  }, {});
};

const hashString = value => {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const fingerprintTextSourceRecord = (record, { ignoreUnitId = false } = {}) => {
  if (!record || typeof record !== 'object') return 'missing';
  const normalized = {
    ...record,
    ...(ignoreUnitId ? { unitId: undefined } : {}),
    createdAt: undefined,
    updatedAt: undefined,
    metadata: stripRuntimeMetadata(record.metadata)
  };
  if (ignoreUnitId) delete normalized.unitId;
  return hashString(JSON.stringify(stableValue(normalized)));
};

const attachmentIdForPackage = packageId => `TXTSOURCE_${hashString(packageId).toUpperCase()}`;

const emptyMapGroup = (includeUnits = false) => ({
  collections: {},
  documents: {},
  blocks: {},
  ...(includeUnits ? { contentUnits: {} } : {}),
  segments: {},
  audioVariants: {}
});

export const normalizeTextSourceAttachments = candidate => {
  const list = Array.isArray(candidate) ? candidate : [];
  return list
    .filter(item => item && typeof item === 'object' && item.packageId && item.attachmentId)
    .map(item => {
      const hasUnits = Boolean(item.idMap?.contentUnits || item.baseline?.contentUnits);
      return {
        version: TEXT_SOURCE_ATTACHMENT_VERSION,
        attachmentId: String(item.attachmentId),
        packageId: String(item.packageId),
        scopeType: item.scopeType === 'collection' ? 'collection' : 'document',
        sourceRootId: String(item.sourceRootId || ''),
        fileName: item.fileName ? String(item.fileName) : null,
        attachedAt: item.attachedAt || null,
        lastSyncedAt: item.lastSyncedAt || item.attachedAt || null,
        status: Object.values(TEXT_SOURCE_ATTACHMENT_STATUS).includes(item.status) ? item.status : TEXT_SOURCE_ATTACHMENT_STATUS.ATTACHED,
        idMap: {
          ...emptyMapGroup(hasUnits),
          ...(item.idMap || {})
        },
        baseline: {
          ...emptyMapGroup(hasUnits),
          ...(item.baseline || {})
        },
        counts: item.counts && typeof item.counts === 'object' ? { ...item.counts } : {}
      };
    });
};

export const findTextSourceAttachment = (attachments, packageId) =>
  normalizeTextSourceAttachments(attachments).find(item => item.packageId === String(packageId || '')) || null;

const sourceProvenance = ({ originalMetadata, pack, attachmentId, sourceId, entity, now, extra = {} }) => ({
  ...(originalMetadata && typeof originalMetadata === 'object' && !Array.isArray(originalMetadata) ? stripRuntimeMetadata(originalMetadata) : {}),
  prolingoTextPackSource: {
    packageId: pack.packageId,
    packageVersion: pack.packageVersion,
    sourceScope: pack.scope.type,
    sourceRootId: pack.scope.rootId,
    sourceEntity: entity,
    sourceId,
    attachmentId,
    ownership: 'attached',
    importedAt: new Date(now).toISOString(),
    lastSyncedAt: new Date(now).toISOString(),
    ...extra
  }
});

const detachedProvenance = ({ metadata, now }) => {
  const source = metadata?.prolingoTextPackSource;
  if (!source) return metadata && typeof metadata === 'object' ? { ...metadata } : {};
  return {
    ...stripRuntimeMetadata(metadata),
    prolingoTextPackSource: {
      ...source,
      attachmentId: null,
      ownership: 'detached-local',
      detachedAt: new Date(now).toISOString()
    }
  };
};

const recordMap = records => new Map((records || []).map(record => [record.id, record]));
const sourceRecordMap = records => new Map((records || []).map(record => [record.id, record]));

const baselineFor = ({ pack, snapshot, idMap }) => {
  const includeUnits = Array.isArray(pack.contentUnits) && isContentUnitSnapshot(snapshot);
  const groups = activeEntityGroups(includeUnits);
  const baseline = emptyMapGroup(includeUnits);
  groups.forEach(([group]) => {
    const localById = recordMap(snapshot[group]);
    (pack[group] || []).forEach(sourceRecord => {
      const localId = idMap[group]?.[sourceRecord.id];
      const localRecord = localById.get(localId);
      if (!localId || !localRecord) return;
      const ignoreUnitId = group === 'segments' && !includeUnits;
      baseline[group][sourceRecord.id] = {
        source: fingerprintTextSourceRecord(sourceRecord, { ignoreUnitId }),
        local: fingerprintTextSourceRecord(localRecord, { ignoreUnitId })
      };
    });
  });
  return baseline;
};

const patchImportedAttachmentMetadata = ({ snapshot, imported, pack, attachmentId, now }) => {
  const includeUnits = isContentUnitSnapshot(snapshot);
  const groups = activeEntityGroups(includeUnits);
  const importedSets = {
    collections: new Set(imported.collectionIds || []),
    documents: new Set(imported.documentIds || []),
    blocks: new Set(imported.blockIds || []),
    ...(includeUnits ? { contentUnits: new Set(imported.contentUnitIds || []) } : {}),
    segments: new Set(imported.segmentIds || []),
    audioVariants: new Set(imported.audioVariantIds || [])
  };
  const sourceIdsByLocal = {};
  groups.forEach(([group]) => {
    sourceIdsByLocal[group] = new Map(Object.entries(imported.idMap?.[group] || {}).map(([sourceId, localId]) => [localId, sourceId]));
  });

  const patchGroup = (group, entity) => (snapshot[group] || []).map(record => {
    if (!importedSets[group].has(record.id)) return record;
    const sourceId = sourceIdsByLocal[group].get(record.id);
    const extra = group === 'audioVariants' ? { binaryIncluded: false, reconnectRequired: true } : {};
    return {
      ...record,
      metadata: sourceProvenance({ originalMetadata: record.metadata, pack, attachmentId, sourceId, entity, now, extra })
    };
  });

  return normalizeTextLibraryRuntimeSnapshot({
    ...snapshot,
    collections: patchGroup('collections', 'collection'),
    documents: patchGroup('documents', 'document'),
    blocks: patchGroup('blocks', 'block'),
    ...(includeUnits ? { contentUnits: patchGroup('contentUnits', 'contentUnit') } : {}),
    segments: patchGroup('segments', 'segment'),
    audioVariants: patchGroup('audioVariants', 'audioVariant')
  });
};

export const createTextSourceAttachmentFromMerge = ({ pack: packCandidate, merged, fileName = null, now = Date.now() }) => {
  const { pack } = validateProLingoTextPack(packCandidate);
  const attachmentId = attachmentIdForPackage(pack.packageId);
  const imported = { ...merged.imported, idMap: merged.idMap };
  const snapshot = patchImportedAttachmentMetadata({ snapshot: merged.snapshot, imported, pack, attachmentId, now });
  const attachment = {
    version: TEXT_SOURCE_ATTACHMENT_VERSION,
    attachmentId,
    packageId: pack.packageId,
    scopeType: pack.scope.type,
    sourceRootId: pack.scope.rootId,
    fileName: fileName || null,
    attachedAt: new Date(now).toISOString(),
    lastSyncedAt: new Date(now).toISOString(),
    status: TEXT_SOURCE_ATTACHMENT_STATUS.ATTACHED,
    idMap: merged.idMap,
    baseline: baselineFor({ pack, snapshot, idMap: merged.idMap }),
    counts: { ...merged.counts }
  };
  return { snapshot, attachment, imported: merged.imported, idMap: merged.idMap, counts: merged.counts };
};

const maxSequence = (records, kind) => records.reduce((max, record) => Math.max(max, getTextLibraryIdSequence(kind, record?.id)), 0);
const maxTextSequence = records => records.reduce((max, record) => Math.max(max, getTextIdSequence(record?.id)), 0);
const maxUnitSequence = records => (records || []).reduce((max, record) => Math.max(max, getTextContentUnitIdSequence(record?.id)), 0);
const counterFloor = (snapshot, { includeContentUnit = false } = {}) => ({
  collection: Math.max(snapshot.counters.collection, maxSequence(snapshot.collections, 'COLLECTION')),
  document: Math.max(snapshot.counters.document, maxSequence(snapshot.documents, 'DOCUMENT')),
  text: Math.max(snapshot.counters.text, maxTextSequence(snapshot.blocks)),
  ...(includeContentUnit
    ? { contentUnit: Math.max(snapshot.counters.contentUnit || 0, maxUnitSequence(snapshot.contentUnits)) }
    : {}),
  segment: Math.max(snapshot.counters.segment, maxSequence(snapshot.segments, 'SEGMENT')),
  audioVariant: Math.max(snapshot.counters.audioVariant, maxSequence(snapshot.audioVariants, 'AUDIO_VARIANT'))
});

const allocateId = ({ kind, textKind = false, unitKind = false, occupied, highWater }) => {
  let next = highWater;
  let id;
  do {
    next += 1;
    id = textKind
      ? `TEXT_${String(next).padStart(6, '0')}`
      : unitKind
        ? formatTextContentUnitId(next)
        : formatTextLibraryId(kind, next);
  } while (occupied.has(id));
  occupied.add(id);
  return { id, highWater: next };
};

const buildWorkingIdMap = ({ local, pack, attachment, includeUnits = false }) => {
  const idMap = {
    collections: { ...(attachment.idMap?.collections || {}) },
    documents: { ...(attachment.idMap?.documents || {}) },
    blocks: { ...(attachment.idMap?.blocks || {}) },
    ...(includeUnits ? { contentUnits: Object.fromEntries(
      Object.entries(attachment.idMap?.contentUnits || {})
        .filter(([sourceId]) => attachment.baseline?.contentUnits?.[sourceId])
    ) } : {}),
    segments: { ...(attachment.idMap?.segments || {}) },
    audioVariants: { ...(attachment.idMap?.audioVariants || {}) }
  };
  const includeCountersContentUnit = isContentUnitSnapshot(local) || includeUnits;
  const floor = counterFloor(local, { includeContentUnit: includeCountersContentUnit });
  const occupied = {
    collections: new Set(local.collections.map(record => record.id)),
    documents: new Set(local.documents.map(record => record.id)),
    blocks: new Set(local.blocks.map(record => record.id)),
    ...(includeUnits ? { contentUnits: new Set((local.contentUnits || []).map(record => record.id)) } : {}),
    segments: new Set(local.segments.map(record => record.id)),
    audioVariants: new Set(local.audioVariants.map(record => record.id))
  };
  const counters = { ...floor };

  const ensure = (group, records, kind, counterKey, { textKind = false, unitKind = false } = {}) => {
    (records || []).forEach(record => {
      if (idMap[group][record.id]) return;
      const allocated = allocateId({ kind, textKind, unitKind, occupied: occupied[group], highWater: counters[counterKey] });
      counters[counterKey] = allocated.highWater;
      idMap[group][record.id] = allocated.id;
    });
  };

  ensure('collections', pack.collections, 'COLLECTION', 'collection');
  ensure('documents', pack.documents, 'DOCUMENT', 'document');
  ensure('blocks', pack.blocks, 'BLOCK', 'text', { textKind: true });
  if (includeUnits) {
    ensure('contentUnits', pack.contentUnits, 'CONTENT_UNIT', 'contentUnit', { unitKind: true });
  }
  ensure('segments', pack.segments, 'SEGMENT', 'segment');
  ensure('audioVariants', pack.audioVariants, 'AUDIO_VARIANT', 'audioVariant');
  return { idMap, counters: normalizeTextIdCounters(counters, { includeContentUnit: includeCountersContentUnit }) };
};

const mappedRecord = ({ group, sourceRecord, localId, idMap, pack, attachmentId, existing, now }) => {
  const sourceMetadata = preserveSpeakerRegistryGlobalUids(sourceRecord.metadata, existing?.metadata);
  const entityName =
    group === 'audioVariants'
      ? 'audioVariant'
      : group === 'contentUnits'
        ? 'contentUnit'
        : group.slice(0, -1);
  const base = {
    ...sourceRecord,
    id: localId,
    uid: existing?.uid || sourceRecord.uid,
    createdAt: existing?.createdAt ?? sourceRecord.createdAt ?? now,
    updatedAt: now,
    metadata: sourceProvenance({
      originalMetadata: sourceMetadata,
      pack,
      attachmentId,
      sourceId: sourceRecord.id,
      entity: entityName,
      now,
      extra: group === 'audioVariants' ? { binaryIncluded: false, reconnectRequired: true } : {}
    })
  };
  if (group === 'documents') base.collectionId = sourceRecord.collectionId ? idMap.collections[sourceRecord.collectionId] : null;
  if (group === 'blocks') base.documentId = idMap.documents[sourceRecord.documentId];
  if (group === 'contentUnits') {
    base.documentId = idMap.documents[sourceRecord.documentId];
    base.blockId = idMap.blocks[sourceRecord.blockId];
  }
  if (group === 'segments') {
    base.documentId = idMap.documents[sourceRecord.documentId];
    base.blockId = idMap.blocks[sourceRecord.blockId];
    base.unitId = sourceRecord.unitId
      ? (idMap.contentUnits?.[sourceRecord.unitId] || existing?.unitId || null)
      : (existing?.unitId || null);
  }
  if (group === 'audioVariants') base.segmentId = idMap.segments[sourceRecord.segmentId];

  if (group === 'collections') return createTextCollectionRecord(base);
  if (group === 'documents') return createTextDocumentRecord(base);
  if (group === 'blocks') return createTextBlockRecord(base);
  if (group === 'contentUnits') return createTextContentUnitRecord(base);
  if (group === 'segments') return createTextSegmentRecord(base);
  return createTextAudioVariantRecord(base);
};

const foreignChildConflicts = ({ local, attachment, removedLocalIds }) => {
  const mapped = {
    documents: new Set(Object.values(attachment.idMap?.documents || {})),
    blocks: new Set(Object.values(attachment.idMap?.blocks || {})),
    // A v1 Pack imported into v2 can have synthetic Unit mappings without source baselines.
    // Those mappings alone do not prove that the source owns the current Unit contents.
    contentUnits: new Set(Object.entries(attachment.idMap?.contentUnits || {})
      .filter(([sourceId]) => attachment.baseline?.contentUnits?.[sourceId])
      .map(([, localId]) => localId)),
    segments: new Set(Object.values(attachment.idMap?.segments || {})),
    audioVariants: new Set(Object.values(attachment.idMap?.audioVariants || {}))
  };
  const blocksById = recordMap(local.blocks);
  const segsByUnitId = new Map();
  const mappedSegCountByBlockId = new Map();
  (local.segments || []).forEach(seg => {
    if (seg.unitId) {
      const list = segsByUnitId.get(seg.unitId) || [];
      list.push(seg);
      segsByUnitId.set(seg.unitId, list);
    }
    if (mapped.segments.has(seg.id)) {
      mappedSegCountByBlockId.set(seg.blockId, (mappedSegCountByBlockId.get(seg.blockId) || 0) + 1);
    }
  });

  const issues = [];
  for (const collectionId of removedLocalIds.collections || []) {
    const foreign = local.documents.filter(record => record.collectionId === collectionId && !mapped.documents.has(record.id));
    if (foreign.length) issues.push(`Collection ${collectionId} has ${foreign.length} local-only Document(s)`);
  }
  for (const documentId of removedLocalIds.documents || []) {
    const foreign = local.blocks.filter(record => record.documentId === documentId && !mapped.blocks.has(record.id));
    if (foreign.length) issues.push(`Document ${documentId} has ${foreign.length} local-only Card(s)`);
  }
  for (const blockId of removedLocalIds.blocks || []) {
    if (Array.isArray(local.contentUnits)) {
      const unitsInBlock = local.contentUnits.filter(record => record.blockId === blockId);
      let foreignUnits;
      if (mapped.contentUnits.size > 0) {
        foreignUnits = unitsInBlock.filter(record => !mapped.contentUnits.has(record.id));
      } else {
        // Migrated v1 attachments have no contentUnits ID map: protect any unit containing
        // local-only segments OR any intentionally empty local Content Unit not solely
        // produced by migration backfill of an unedited empty v1 Paragraph Card.
        const block = blocksById.get(blockId) || null;
        const blockHasMappedSegments = (mappedSegCountByBlockId.get(blockId) || 0) > 0;
        foreignUnits = unitsInBlock.filter(unit => {
          const childSegs = segsByUnitId.get(unit.id) || [];
          if (childSegs.some(seg => !mapped.segments.has(seg.id))) return true;
          // v1 sources have no Unit metadata baseline; annotations cannot be source-owned.
          if (childSegs.length > 0 && Object.keys(stripRuntimeMetadata(unit.metadata)).length > 0) return true;
          if (childSegs.length === 0) {
            if (block?.blockType !== 'paragraph') return true;
            if (blockHasMappedSegments) return true;
            if (unitsInBlock.length > 1) return true;
            if (!isUnmodifiedEmptyParagraphBackfill(unit)) return true;
          }
          return false;
        });
      }
      if (foreignUnits.length) issues.push(`Card ${blockId} has ${foreignUnits.length} local-only Content Unit(s)`);
    }
    const foreign = local.segments.filter(record => record.blockId === blockId && !mapped.segments.has(record.id));
    if (foreign.length) issues.push(`Card ${blockId} has ${foreign.length} local-only Segment(s)`);
  }
  for (const unitId of removedLocalIds.contentUnits || []) {
    const foreign = local.segments.filter(record => record.unitId === unitId && !mapped.segments.has(record.id));
    if (foreign.length) issues.push(`Content Unit ${unitId} has ${foreign.length} local-only Segment(s)`);
  }
  for (const segmentId of removedLocalIds.segments || []) {
    const foreign = local.audioVariants.filter(record => record.segmentId === segmentId && !mapped.audioVariants.has(record.id));
    if (foreign.length) issues.push(`Segment ${segmentId} has ${foreign.length} local-only audio variant(s)`);
  }
  return issues;
};

const reindexV2SnapshotOrdersAndMaterializedBlocks = ({ snapshot, now }) => {
  if (!isContentUnitSnapshot(snapshot)) return snapshot;
  let working = snapshot;
  const docById = new Map((working.documents || []).map(doc => [doc.id, doc]));
  const structuredBlockIds = new Set(
    (working.blocks || [])
      .filter(block => docById.get(block.documentId)?.editorModel !== TEXT_LEGACY_EDITOR_MODEL)
      .map(block => block.id)
  );
  const needsBackfill = (working.segments || []).some(
    seg => structuredBlockIds.has(seg.blockId) && !seg.unitId
  );
  if (needsBackfill) {
    working = backfillTextContentUnits(working, { now }).snapshot;
  }

  const unitsByBlock = new Map();
  (working.contentUnits || []).forEach(unit => {
    const list = unitsByBlock.get(unit.blockId) || [];
    list.push(unit);
    unitsByBlock.set(unit.blockId, list);
  });

  const unitOrderById = new Map();
  const nextUnits = [];
  for (const [, units] of unitsByBlock.entries()) {
    const sorted = [...units].sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
    sorted.forEach((unit, idx) => {
      const nextOrder = idx + 1;
      unitOrderById.set(unit.id, nextOrder);
      nextUnits.push(unit.order === nextOrder ? unit : { ...unit, order: nextOrder });
    });
  }

  const segmentsByBlock = new Map();
  (working.segments || []).forEach(seg => {
    const list = segmentsByBlock.get(seg.blockId) || [];
    list.push(seg);
    segmentsByBlock.set(seg.blockId, list);
  });

  const nextSegments = [];
  for (const [, segs] of segmentsByBlock.entries()) {
    const sorted = [...segs].sort((a, b) => {
      const uA = a.unitId ? (unitOrderById.get(a.unitId) ?? 0) : 0;
      const uB = b.unitId ? (unitOrderById.get(b.unitId) ?? 0) : 0;
      if (uA !== uB) return uA - uB;
      return (a.order - b.order) || String(a.id).localeCompare(String(b.id));
    });
    sorted.forEach((seg, idx) => {
      const nextOrder = idx + 1;
      nextSegments.push(seg.order === nextOrder ? seg : { ...seg, order: nextOrder });
    });
  }

  const nextMaterializedBlockIds = [...new Set([
    ...((working.contentUnitMigration?.materializedBlockIds || []).filter(id => structuredBlockIds.has(id))),
    ...structuredBlockIds
  ])].sort();

  return {
    ...working,
    contentUnits: nextUnits,
    segments: nextSegments,
    contentUnitMigration: {
      version: 1,
      phase: 'complete',
      materializedBlockIds: nextMaterializedBlockIds,
      completedAt: working.contentUnitMigration?.completedAt ?? now
    }
  };
};

export const planTextSourceSync = ({ localSnapshot: localCandidate, pack: packCandidate, attachment: attachmentCandidate, fileName = null, now = Date.now() }) => {
  const local = normalizeTextLibraryRuntimeSnapshot(localCandidate);
  const { pack } = validateProLingoTextPack(packCandidate);
  const localIsV2 = isContentUnitSnapshot(local);
  const packHasUnits = Array.isArray(pack.contentUnits);
  if (packHasUnits && !localIsV2) {
    throw new Error('Cannot sync a v2 Text Pack with persistent Content Units into an unmigrated v1 Text snapshot');
  }
  const attachment = normalizeTextSourceAttachments([attachmentCandidate])[0];
  if (!attachment) throw new Error('Text source attachment metadata is missing');
  if (attachment.packageId !== pack.packageId) throw new Error(`Text source package mismatch: expected ${attachment.packageId}, received ${pack.packageId}`);
  if (attachment.scopeType !== pack.scope.type || attachment.sourceRootId !== pack.scope.rootId) throw new Error('Text source scope/root changed; attach it as a new source or import as copy');

  const includeUnits = packHasUnits && localIsV2;
  const groups = activeEntityGroups(includeUnits);
  const attachmentHasUnitsBaseline = Object.keys(attachment.baseline?.contentUnits || {}).length > 0;
  const ignoreSegmentUnitId = !includeUnits && !attachmentHasUnitsBaseline;

  const { idMap, counters } = buildWorkingIdMap({ local, pack, attachment, includeUnits });
  const nextGroups = {
    collections: [...local.collections],
    documents: [...local.documents],
    blocks: [...local.blocks],
    ...(localIsV2 ? { contentUnits: [...(local.contentUnits || [])] } : {}),
    segments: [...local.segments],
    audioVariants: [...local.audioVariants]
  };
  const upsert = emptyMapGroup(includeUnits);
  const remove = emptyMapGroup(includeUnits);
  const conflicts = [];
  const localChanged = [];
  const stats = { created: 0, updated: 0, unchanged: 0, preservedLocal: 0, deleted: 0 };

  const sourceMaps = {};
  const localMaps = {};
  groups.forEach(([group]) => {
    sourceMaps[group] = sourceRecordMap(pack[group]);
    localMaps[group] = recordMap(nextGroups[group]);
  });

  groups.forEach(([group]) => {
    const baselineGroup = attachment.baseline?.[group] || {};
    const ignoreUnitId = group === 'segments' && ignoreSegmentUnitId;
    for (const sourceRecord of pack[group] || []) {
      const sourceId = sourceRecord.id;
      const localId = idMap[group][sourceId];
      const existing = localMaps[group].get(localId) || null;
      const baseline = baselineGroup[sourceId] || null;
      if (baseline && !existing) {
        conflicts.push(`${group}:${sourceId} mapped local record ${localId} is missing`);
        continue;
      }
      if (!baseline) {
        const created = mappedRecord({ group, sourceRecord, localId, idMap, pack, attachmentId: attachment.attachmentId, existing: null, now });
        localMaps[group].set(localId, created);
        upsert[group][localId] = created;
        stats.created += 1;
        continue;
      }
      const currentLocalFingerprint = fingerprintTextSourceRecord(existing, { ignoreUnitId });
      const currentSourceFingerprint = fingerprintTextSourceRecord(sourceRecord, { ignoreUnitId });
      const didLocalChange = currentLocalFingerprint !== baseline.local;
      const didSourceChange = currentSourceFingerprint !== baseline.source;
      if (didLocalChange && didSourceChange) {
        conflicts.push(`${group}:${sourceId} changed both locally and in source`);
        continue;
      }
      if (didLocalChange) {
        localChanged.push(`${group}:${sourceId}`);
        stats.preservedLocal += 1;
        continue;
      }
      if (didSourceChange) {
        const updated = mappedRecord({ group, sourceRecord, localId, idMap, pack, attachmentId: attachment.attachmentId, existing, now });
        localMaps[group].set(localId, updated);
        upsert[group][localId] = updated;
        stats.updated += 1;
      } else {
        stats.unchanged += 1;
      }
    }
  });

  const removedLocalIds = {
    collections: new Set(),
    documents: new Set(),
    blocks: new Set(),
    contentUnits: new Set(),
    segments: new Set(),
    audioVariants: new Set()
  };
  groups.forEach(([group]) => {
    const currentSourceIds = sourceMaps[group];
    const baselineGroup = attachment.baseline?.[group] || {};
    const ignoreUnitId = group === 'segments' && ignoreSegmentUnitId;
    Object.keys(baselineGroup).forEach(sourceId => {
      if (currentSourceIds.has(sourceId)) return;
      const localId = attachment.idMap?.[group]?.[sourceId];
      if (!localId) return;
      const localRecord = localMaps[group].get(localId);
      if (!localRecord) return;
      if (fingerprintTextSourceRecord(localRecord, { ignoreUnitId }) !== baselineGroup[sourceId].local) {
        conflicts.push(`${group}:${sourceId} was removed from source but changed locally`);
        return;
      }
      removedLocalIds[group].add(localId);
    });
  });
  conflicts.push(...foreignChildConflicts({ local, attachment, removedLocalIds }));
  if (conflicts.length) {
    return {
      ok: false,
      conflict: true,
      conflicts,
      localChanged,
      attachment: { ...attachment, status: TEXT_SOURCE_ATTACHMENT_STATUS.CONFLICT },
      stats
    };
  }

  // Safe source-owned removals are applied deepest-first.
  const deleteGroup = group => {
    if (!localMaps[group]) return;
    removedLocalIds[group].forEach(localId => {
      if (remove[group]) remove[group][localId] = true;
      localMaps[group].delete(localId);
      stats.deleted += 1;
    });
  };
  deleteGroup('audioVariants');
  deleteGroup('segments');
  if (includeUnits) deleteGroup('contentUnits');
  deleteGroup('blocks');
  deleteGroup('documents');
  deleteGroup('collections');

  groups.forEach(([group]) => {
    nextGroups[group] = [...localMaps[group].values()];
  });
  if (localIsV2 && !includeUnits) {
    nextGroups.contentUnits = (nextGroups.contentUnits || []).filter(
      unit => !removedLocalIds.blocks.has(unit.blockId) && !removedLocalIds.documents.has(unit.documentId)
    );
  }

  const nextIdMap = {
    collections: { ...idMap.collections },
    documents: { ...idMap.documents },
    blocks: { ...idMap.blocks },
    ...(includeUnits ? { contentUnits: { ...idMap.contentUnits } } : {}),
    segments: { ...idMap.segments },
    audioVariants: { ...idMap.audioVariants }
  };
  groups.forEach(([group]) => {
    Object.keys(nextIdMap[group]).forEach(sourceId => {
      if (!sourceMaps[group].has(sourceId)) delete nextIdMap[group][sourceId];
    });
  });

  let activeDocumentId = local.activeDocumentId;
  if (activeDocumentId && !nextGroups.documents.some(record => record.id === activeDocumentId)) {
    activeDocumentId = [...nextGroups.documents].sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))[0]?.id || null;
  }
  const preliminarySnapshot = reindexV2SnapshotOrdersAndMaterializedBlocks({
    snapshot: { ...local, ...nextGroups, counters, activeDocumentId },
    now
  });
  const globalUidBackfill = backfillTextGlobalUids(preliminarySnapshot);
  const snapshot = normalizeTextLibraryRuntimeSnapshot(globalUidBackfill.snapshot);
  groups.forEach(([group]) => {
    const finalById = recordMap(snapshot[group]);
    Object.keys(upsert[group]).forEach(localId => {
      const record = finalById.get(localId);
      if (record) upsert[group][localId] = record;
    });
  });

  const previousBaseline = attachment.baseline || emptyMapGroup(includeUnits);
  const nextBaseline = emptyMapGroup(includeUnits);
  groups.forEach(([group]) => {
    const localById = recordMap(snapshot[group]);
    const ignoreUnitId = group === 'segments' && ignoreSegmentUnitId;
    for (const sourceRecord of pack[group] || []) {
      const sourceId = sourceRecord.id;
      const localId = nextIdMap[group][sourceId];
      const localRecord = localById.get(localId);
      if (!localRecord) continue;
      const wasLocallyChanged = localChanged.includes(`${group}:${sourceId}`);
      nextBaseline[group][sourceId] = wasLocallyChanged && previousBaseline[group]?.[sourceId]
        ? previousBaseline[group][sourceId]
        : {
            source: fingerprintTextSourceRecord(sourceRecord, { ignoreUnitId }),
            local: fingerprintTextSourceRecord(localRecord, { ignoreUnitId })
          };
    }
  });

  const nextAttachment = {
    ...attachment,
    fileName: fileName || attachment.fileName || null,
    lastSyncedAt: new Date(now).toISOString(),
    status: localChanged.length ? TEXT_SOURCE_ATTACHMENT_STATUS.LOCAL_CHANGED : TEXT_SOURCE_ATTACHMENT_STATUS.ATTACHED,
    idMap: nextIdMap,
    baseline: nextBaseline,
    counts: {
      collections: pack.collections.length,
      documents: pack.documents.length,
      blocks: pack.blocks.length,
      ...(includeUnits ? { contentUnits: (pack.contentUnits || []).length } : {}),
      segments: pack.segments.length,
      audioVariants: pack.audioVariants.length
    }
  };
  return { ok: true, conflict: false, snapshot, attachment: nextAttachment, upsert, remove, stats, localChanged, globalUidBackfill: globalUidBackfill.counts };
};

const assertAttachmentCleanForRemoval = ({ local, attachment }) => {
  const issues = [];
  const includeUnits = isContentUnitSnapshot(local) && Boolean(attachment.idMap?.contentUnits);
  const groups = activeEntityGroups(includeUnits);
  const attachmentHasUnitsBaseline = Object.keys(attachment.baseline?.contentUnits || {}).length > 0;
  const ignoreSegmentUnitId = !includeUnits && !attachmentHasUnitsBaseline;

  const mappedLocalIds = {
    collections: new Set(),
    documents: new Set(),
    blocks: new Set(),
    contentUnits: new Set(),
    segments: new Set(),
    audioVariants: new Set()
  };
  groups.forEach(([group]) => Object.values(attachment.idMap?.[group] || {}).forEach(id => mappedLocalIds[group].add(id)));
  groups.forEach(([group]) => {
    const localById = recordMap(local[group]);
    const baselineGroup = attachment.baseline?.[group] || {};
    const ignoreUnitId = group === 'segments' && ignoreSegmentUnitId;
    Object.entries(attachment.idMap?.[group] || {}).forEach(([sourceId, localId]) => {
      const record = localById.get(localId);
      if (!record) return;
      const baseline = baselineGroup[sourceId];
      if (baseline && fingerprintTextSourceRecord(record, { ignoreUnitId }) !== baseline.local) {
        issues.push(`${group}:${sourceId} has local changes`);
      }
    });
  });
  const foreign = foreignChildConflicts({ local, attachment, removedLocalIds: mappedLocalIds });
  return [...issues, ...foreign];
};

export const planTextSourceDetach = ({ localSnapshot: localCandidate, attachment: attachmentCandidate, removeData = false, now = Date.now() }) => {
  const local = normalizeTextLibraryRuntimeSnapshot(localCandidate);
  const attachment = normalizeTextSourceAttachments([attachmentCandidate])[0];
  if (!attachment) throw new Error('Text source attachment metadata is missing');
  const includeUnits = isContentUnitSnapshot(local) && Boolean(attachment.idMap?.contentUnits);
  const groups = activeEntityGroups(includeUnits);
  const upsert = emptyMapGroup(includeUnits);
  const remove = emptyMapGroup(includeUnits);

  if (!removeData) {
    const nextGroups = {};
    groups.forEach(([group]) => {
      const mappedIds = new Set(Object.values(attachment.idMap?.[group] || {}));
      nextGroups[group] = (local[group] || []).map(record => {
        if (!mappedIds.has(record.id)) return record;
        const patched = { ...record, metadata: detachedProvenance({ metadata: record.metadata, now }), updatedAt: now };
        upsert[group][record.id] = patched;
        return patched;
      });
    });
    return {
      ok: true,
      removeData: false,
      snapshot: normalizeTextLibraryRuntimeSnapshot({ ...local, ...nextGroups }),
      upsert,
      remove,
      counts: { keptLocal: Object.values(attachment.idMap || {}).reduce((sum, map) => sum + Object.keys(map || {}).length, 0), removed: 0 }
    };
  }

  const conflicts = assertAttachmentCleanForRemoval({ local, attachment });
  if (conflicts.length) return { ok: false, conflict: true, conflicts };
  const removeSets = {};
  groups.forEach(([group]) => {
    removeSets[group] = new Set(Object.values(attachment.idMap?.[group] || {}));
    removeSets[group].forEach(id => { remove[group][id] = true; });
  });
  const nextGroups = {};
  groups.forEach(([group]) => { nextGroups[group] = (local[group] || []).filter(record => !removeSets[group].has(record.id)); });
  if (isContentUnitSnapshot(local) && !includeUnits) {
    nextGroups.contentUnits = (local.contentUnits || []).filter(
      unit => !removeSets.blocks.has(unit.blockId) && !removeSets.documents.has(unit.documentId)
    );
  }
  let activeDocumentId = local.activeDocumentId;
  if (activeDocumentId && removeSets.documents.has(activeDocumentId)) {
    activeDocumentId = [...nextGroups.documents].sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))[0]?.id || null;
  }
  const preliminarySnapshot = reindexV2SnapshotOrdersAndMaterializedBlocks({
    snapshot: { ...local, ...nextGroups, activeDocumentId },
    now
  });
  return {
    ok: true,
    removeData: true,
    snapshot: normalizeTextLibraryRuntimeSnapshot(preliminarySnapshot),
    upsert,
    remove,
    counts: { keptLocal: 0, removed: Object.values(removeSets).reduce((sum, set) => sum + set.size, 0) }
  };
};
