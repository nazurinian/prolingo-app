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

export const TEXT_SOURCE_ATTACHMENT_VERSION = 1;
export const TEXT_SOURCE_ATTACHMENT_STATUS = Object.freeze({
  ATTACHED: 'attached',
  LOCAL_CHANGED: 'local-changed',
  CONFLICT: 'conflict'
});

const ENTITY_GROUPS = Object.freeze([
  ['collections', 'collection'],
  ['documents', 'document'],
  ['blocks', 'block'],
  ['segments', 'segment'],
  ['audioVariants', 'audioVariant']
]);

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

export const fingerprintTextSourceRecord = record => {
  if (!record || typeof record !== 'object') return 'missing';
  const normalized = {
    ...record,
    createdAt: undefined,
    updatedAt: undefined,
    metadata: stripRuntimeMetadata(record.metadata)
  };
  return hashString(JSON.stringify(stableValue(normalized)));
};

const attachmentIdForPackage = packageId => `TXTSOURCE_${hashString(packageId).toUpperCase()}`;

const emptyMapGroup = () => ({ collections: {}, documents: {}, blocks: {}, segments: {}, audioVariants: {} });

export const normalizeTextSourceAttachments = candidate => {
  const list = Array.isArray(candidate) ? candidate : [];
  return list
    .filter(item => item && typeof item === 'object' && item.packageId && item.attachmentId)
    .map(item => ({
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
        ...emptyMapGroup(),
        ...(item.idMap || {})
      },
      baseline: {
        ...emptyMapGroup(),
        ...(item.baseline || {})
      },
      counts: item.counts && typeof item.counts === 'object' ? { ...item.counts } : {}
    }));
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
  const baseline = emptyMapGroup();
  ENTITY_GROUPS.forEach(([group]) => {
    const localById = recordMap(snapshot[group]);
    (pack[group] || []).forEach(sourceRecord => {
      const localId = idMap[group]?.[sourceRecord.id];
      const localRecord = localById.get(localId);
      if (!localId || !localRecord) return;
      baseline[group][sourceRecord.id] = {
        source: fingerprintTextSourceRecord(sourceRecord),
        local: fingerprintTextSourceRecord(localRecord)
      };
    });
  });
  return baseline;
};

const patchImportedAttachmentMetadata = ({ snapshot, imported, pack, attachmentId, now }) => {
  const importedSets = {
    collections: new Set(imported.collectionIds || []),
    documents: new Set(imported.documentIds || []),
    blocks: new Set(imported.blockIds || []),
    segments: new Set(imported.segmentIds || []),
    audioVariants: new Set(imported.audioVariantIds || [])
  };
  const sourceIdsByLocal = {};
  ENTITY_GROUPS.forEach(([group]) => {
    sourceIdsByLocal[group] = new Map(Object.entries(imported.idMap?.[group] || {}).map(([sourceId, localId]) => [localId, sourceId]));
  });

  const patchGroup = (group, entity) => snapshot[group].map(record => {
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
const counterFloor = snapshot => ({
  collection: Math.max(snapshot.counters.collection, maxSequence(snapshot.collections, 'COLLECTION')),
  document: Math.max(snapshot.counters.document, maxSequence(snapshot.documents, 'DOCUMENT')),
  text: Math.max(snapshot.counters.text, maxTextSequence(snapshot.blocks)),
  segment: Math.max(snapshot.counters.segment, maxSequence(snapshot.segments, 'SEGMENT')),
  audioVariant: Math.max(snapshot.counters.audioVariant, maxSequence(snapshot.audioVariants, 'AUDIO_VARIANT'))
});

const allocateId = ({ kind, textKind = false, occupied, highWater }) => {
  let next = highWater;
  let id;
  do {
    next += 1;
    id = textKind ? `TEXT_${String(next).padStart(6, '0')}` : formatTextLibraryId(kind, next);
  } while (occupied.has(id));
  occupied.add(id);
  return { id, highWater: next };
};

const buildWorkingIdMap = ({ local, pack, attachment }) => {
  const idMap = {
    collections: { ...(attachment.idMap?.collections || {}) },
    documents: { ...(attachment.idMap?.documents || {}) },
    blocks: { ...(attachment.idMap?.blocks || {}) },
    segments: { ...(attachment.idMap?.segments || {}) },
    audioVariants: { ...(attachment.idMap?.audioVariants || {}) }
  };
  const floor = counterFloor(local);
  const occupied = {
    collections: new Set(local.collections.map(record => record.id)),
    documents: new Set(local.documents.map(record => record.id)),
    blocks: new Set(local.blocks.map(record => record.id)),
    segments: new Set(local.segments.map(record => record.id)),
    audioVariants: new Set(local.audioVariants.map(record => record.id))
  };
  const counters = { ...floor };

  const ensure = (group, records, kind, counterKey, textKind = false) => {
    (records || []).forEach(record => {
      if (idMap[group][record.id]) return;
      const allocated = allocateId({ kind, textKind, occupied: occupied[group], highWater: counters[counterKey] });
      counters[counterKey] = allocated.highWater;
      idMap[group][record.id] = allocated.id;
    });
  };

  ensure('collections', pack.collections, 'COLLECTION', 'collection');
  ensure('documents', pack.documents, 'DOCUMENT', 'document');
  ensure('blocks', pack.blocks, 'BLOCK', 'text', true);
  ensure('segments', pack.segments, 'SEGMENT', 'segment');
  ensure('audioVariants', pack.audioVariants, 'AUDIO_VARIANT', 'audioVariant');
  return { idMap, counters: normalizeTextIdCounters(counters) };
};

const mappedRecord = ({ group, sourceRecord, localId, idMap, pack, attachmentId, existing, now }) => {
  const sourceMetadata = preserveSpeakerRegistryGlobalUids(sourceRecord.metadata, existing?.metadata);
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
      entity: group === 'audioVariants' ? 'audioVariant' : group.slice(0, -1),
      now,
      extra: group === 'audioVariants' ? { binaryIncluded: false, reconnectRequired: true } : {}
    })
  };
  if (group === 'documents') base.collectionId = sourceRecord.collectionId ? idMap.collections[sourceRecord.collectionId] : null;
  if (group === 'blocks') base.documentId = idMap.documents[sourceRecord.documentId];
  if (group === 'segments') {
    base.documentId = idMap.documents[sourceRecord.documentId];
    base.blockId = idMap.blocks[sourceRecord.blockId];
  }
  if (group === 'audioVariants') base.segmentId = idMap.segments[sourceRecord.segmentId];

  if (group === 'collections') return createTextCollectionRecord(base);
  if (group === 'documents') return createTextDocumentRecord(base);
  if (group === 'blocks') return createTextBlockRecord(base);
  if (group === 'segments') return createTextSegmentRecord(base);
  return createTextAudioVariantRecord(base);
};

const foreignChildConflicts = ({ local, attachment, removedLocalIds }) => {
  const mapped = {
    documents: new Set(Object.values(attachment.idMap?.documents || {})),
    blocks: new Set(Object.values(attachment.idMap?.blocks || {})),
    segments: new Set(Object.values(attachment.idMap?.segments || {})),
    audioVariants: new Set(Object.values(attachment.idMap?.audioVariants || {}))
  };
  const issues = [];
  for (const collectionId of removedLocalIds.collections) {
    const foreign = local.documents.filter(record => record.collectionId === collectionId && !mapped.documents.has(record.id));
    if (foreign.length) issues.push(`Collection ${collectionId} has ${foreign.length} local-only Document(s)`);
  }
  for (const documentId of removedLocalIds.documents) {
    const foreign = local.blocks.filter(record => record.documentId === documentId && !mapped.blocks.has(record.id));
    if (foreign.length) issues.push(`Document ${documentId} has ${foreign.length} local-only Card(s)`);
  }
  for (const blockId of removedLocalIds.blocks) {
    const foreign = local.segments.filter(record => record.blockId === blockId && !mapped.segments.has(record.id));
    if (foreign.length) issues.push(`Card ${blockId} has ${foreign.length} local-only Segment(s)`);
  }
  for (const segmentId of removedLocalIds.segments) {
    const foreign = local.audioVariants.filter(record => record.segmentId === segmentId && !mapped.audioVariants.has(record.id));
    if (foreign.length) issues.push(`Segment ${segmentId} has ${foreign.length} local-only audio variant(s)`);
  }
  return issues;
};

export const planTextSourceSync = ({ localSnapshot: localCandidate, pack: packCandidate, attachment: attachmentCandidate, fileName = null, now = Date.now() }) => {
  const local = normalizeTextLibraryRuntimeSnapshot(localCandidate);
  const { pack } = validateProLingoTextPack(packCandidate);
  const attachment = normalizeTextSourceAttachments([attachmentCandidate])[0];
  if (!attachment) throw new Error('Text source attachment metadata is missing');
  if (attachment.packageId !== pack.packageId) throw new Error(`Text source package mismatch: expected ${attachment.packageId}, received ${pack.packageId}`);
  if (attachment.scopeType !== pack.scope.type || attachment.sourceRootId !== pack.scope.rootId) throw new Error('Text source scope/root changed; attach it as a new source or import as copy');

  const { idMap, counters } = buildWorkingIdMap({ local, pack, attachment });
  const nextGroups = {
    collections: [...local.collections],
    documents: [...local.documents],
    blocks: [...local.blocks],
    segments: [...local.segments],
    audioVariants: [...local.audioVariants]
  };
  const upsert = emptyMapGroup();
  const remove = emptyMapGroup();
  const conflicts = [];
  const localChanged = [];
  const stats = { created: 0, updated: 0, unchanged: 0, preservedLocal: 0, deleted: 0 };

  const sourceMaps = {};
  const localMaps = {};
  ENTITY_GROUPS.forEach(([group]) => {
    sourceMaps[group] = sourceRecordMap(pack[group]);
    localMaps[group] = recordMap(nextGroups[group]);
  });

  ENTITY_GROUPS.forEach(([group]) => {
    const baselineGroup = attachment.baseline?.[group] || {};
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
      const currentLocalFingerprint = fingerprintTextSourceRecord(existing);
      const currentSourceFingerprint = fingerprintTextSourceRecord(sourceRecord);
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

  const removedLocalIds = { collections: new Set(), documents: new Set(), blocks: new Set(), segments: new Set(), audioVariants: new Set() };
  ENTITY_GROUPS.forEach(([group]) => {
    const currentSourceIds = sourceMaps[group];
    const baselineGroup = attachment.baseline?.[group] || {};
    Object.keys(baselineGroup).forEach(sourceId => {
      if (currentSourceIds.has(sourceId)) return;
      const localId = attachment.idMap?.[group]?.[sourceId];
      if (!localId) return;
      const localRecord = localMaps[group].get(localId);
      if (!localRecord) return;
      if (fingerprintTextSourceRecord(localRecord) !== baselineGroup[sourceId].local) {
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
    removedLocalIds[group].forEach(localId => {
      remove[group][localId] = true;
      localMaps[group].delete(localId);
      stats.deleted += 1;
    });
  };
  deleteGroup('audioVariants');
  deleteGroup('segments');
  deleteGroup('blocks');
  deleteGroup('documents');
  deleteGroup('collections');

  ENTITY_GROUPS.forEach(([group]) => {
    nextGroups[group] = [...localMaps[group].values()];
  });

  const nextIdMap = {
    collections: { ...idMap.collections },
    documents: { ...idMap.documents },
    blocks: { ...idMap.blocks },
    segments: { ...idMap.segments },
    audioVariants: { ...idMap.audioVariants }
  };
  ENTITY_GROUPS.forEach(([group]) => {
    Object.keys(nextIdMap[group]).forEach(sourceId => {
      if (!sourceMaps[group].has(sourceId)) delete nextIdMap[group][sourceId];
    });
  });

  let activeDocumentId = local.activeDocumentId;
  if (activeDocumentId && !nextGroups.documents.some(record => record.id === activeDocumentId)) {
    activeDocumentId = [...nextGroups.documents].sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))[0]?.id || null;
  }
  const preliminarySnapshot = { ...local, ...nextGroups, counters, activeDocumentId };
  const globalUidBackfill = backfillTextGlobalUids(preliminarySnapshot);
  const snapshot = normalizeTextLibraryRuntimeSnapshot(globalUidBackfill.snapshot);
  ENTITY_GROUPS.forEach(([group]) => {
    const finalById = recordMap(snapshot[group]);
    Object.keys(upsert[group]).forEach(localId => {
      const record = finalById.get(localId);
      if (record) upsert[group][localId] = record;
    });
  });

  const previousBaseline = attachment.baseline || emptyMapGroup();
  const nextBaseline = emptyMapGroup();
  ENTITY_GROUPS.forEach(([group]) => {
    const localById = recordMap(snapshot[group]);
    for (const sourceRecord of pack[group] || []) {
      const sourceId = sourceRecord.id;
      const localId = nextIdMap[group][sourceId];
      const localRecord = localById.get(localId);
      if (!localRecord) continue;
      const wasLocallyChanged = localChanged.includes(`${group}:${sourceId}`);
      nextBaseline[group][sourceId] = wasLocallyChanged && previousBaseline[group]?.[sourceId]
        ? previousBaseline[group][sourceId]
        : { source: fingerprintTextSourceRecord(sourceRecord), local: fingerprintTextSourceRecord(localRecord) };
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
      segments: pack.segments.length,
      audioVariants: pack.audioVariants.length
    }
  };
  return { ok: true, conflict: false, snapshot, attachment: nextAttachment, upsert, remove, stats, localChanged, globalUidBackfill: globalUidBackfill.counts };
};

const assertAttachmentCleanForRemoval = ({ local, attachment }) => {
  const issues = [];
  const mappedLocalIds = { collections: new Set(), documents: new Set(), blocks: new Set(), segments: new Set(), audioVariants: new Set() };
  ENTITY_GROUPS.forEach(([group]) => Object.values(attachment.idMap?.[group] || {}).forEach(id => mappedLocalIds[group].add(id)));
  ENTITY_GROUPS.forEach(([group]) => {
    const localById = recordMap(local[group]);
    const baselineGroup = attachment.baseline?.[group] || {};
    Object.entries(attachment.idMap?.[group] || {}).forEach(([sourceId, localId]) => {
      const record = localById.get(localId);
      if (!record) return;
      const baseline = baselineGroup[sourceId];
      if (baseline && fingerprintTextSourceRecord(record) !== baseline.local) issues.push(`${group}:${sourceId} has local changes`);
    });
  });
  const foreign = foreignChildConflicts({ local, attachment, removedLocalIds: mappedLocalIds });
  return [...issues, ...foreign];
};

export const planTextSourceDetach = ({ localSnapshot: localCandidate, attachment: attachmentCandidate, removeData = false, now = Date.now() }) => {
  const local = normalizeTextLibraryRuntimeSnapshot(localCandidate);
  const attachment = normalizeTextSourceAttachments([attachmentCandidate])[0];
  if (!attachment) throw new Error('Text source attachment metadata is missing');
  const upsert = emptyMapGroup();
  const remove = emptyMapGroup();

  if (!removeData) {
    const nextGroups = {};
    ENTITY_GROUPS.forEach(([group]) => {
      const mappedIds = new Set(Object.values(attachment.idMap?.[group] || {}));
      nextGroups[group] = local[group].map(record => {
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
  ENTITY_GROUPS.forEach(([group]) => {
    removeSets[group] = new Set(Object.values(attachment.idMap?.[group] || {}));
    removeSets[group].forEach(id => { remove[group][id] = true; });
  });
  const nextGroups = {};
  ENTITY_GROUPS.forEach(([group]) => { nextGroups[group] = local[group].filter(record => !removeSets[group].has(record.id)); });
  let activeDocumentId = local.activeDocumentId;
  if (activeDocumentId && removeSets.documents.has(activeDocumentId)) {
    activeDocumentId = [...nextGroups.documents].sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))[0]?.id || null;
  }
  return {
    ok: true,
    removeData: true,
    snapshot: normalizeTextLibraryRuntimeSnapshot({ ...local, ...nextGroups, activeDocumentId }),
    upsert,
    remove,
    counts: { keptLocal: 0, removed: Object.values(removeSets).reduce((sum, set) => sum + set.size, 0) }
  };
};
