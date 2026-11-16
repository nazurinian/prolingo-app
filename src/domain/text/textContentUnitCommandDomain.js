import {
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import {
  buildTextStructuredUpsertSpeakerRegistryMetadata,
  deriveTextStructuredSpeakerId,
  getTextStructuredSpeakerRegistry,
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY
} from './textStructuredSpeakerIdentityDomain.js';
import {
  isContentUnitSnapshot,
  normalizeTextContentUnitMigrationState,
  createTextContentUnitRecord
} from './textContentUnitDomain.js';
import { createTextSegmentRecord } from './textLibraryDomain.js';

export const TEXT_CONTENT_UNIT_COMMAND_TYPES = Object.freeze({
  CREATE: 'contentUnit.create',
  UPDATE: 'contentUnit.update',
  REORDER: 'contentUnit.reorder',
  REORDER_SEGMENTS: 'contentUnit.reorderSegments',
  SPLIT: 'contentUnit.split',
  MERGE: 'contentUnit.merge',
  DELETE: 'contentUnit.delete',
  SEGMENT_MOVE: 'segment.move'
});

const normalizeNullableText = value => {
  const clean = String(value ?? '').trim();
  return clean || null;
};

const normalizePositiveIndex = value => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 ? num : null;
};

const sortByOrderThenId = records => [...records].sort((a, b) => (
  (Number(a?.order || 0) - Number(b?.order || 0)) || String(a?.id || '').localeCompare(String(b?.id || ''))
));

export const requireContentUnitSnapshotEnabled = (snapshot, commandName) => {
  if (!isContentUnitSnapshot(snapshot)) {
    throw new Error(`Command ${commandName} requires a Content-Unit-enabled snapshot (schema v2 / contentUnits initialized).`);
  }
};

export const applySpeakerIdToSegmentMetadata = (metadata, speakerId) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  const cleanId = normalizeNullableText(speakerId);
  if (cleanId) {
    base[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY] = cleanId;
  } else {
    delete base[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY];
  }
  return base;
};

export const updateMaterializedBlockIds = (snapshot, { add = [], remove = [] } = {}) => {
  if (!isContentUnitSnapshot(snapshot)) return snapshot.contentUnitMigration;
  const current = normalizeTextContentUnitMigrationState(snapshot.contentUnitMigration) || {
    version: 1,
    phase: 'complete',
    materializedBlockIds: [],
    completedAt: null
  };
  const set = new Set(current.materializedBlockIds);
  add.forEach(id => {
    const clean = normalizeNullableText(id)?.toUpperCase();
    if (clean) set.add(clean);
  });
  remove.forEach(id => {
    const clean = normalizeNullableText(id)?.toUpperCase();
    if (clean) set.delete(clean);
  });
  return {
    ...current,
    materializedBlockIds: [...set].sort()
  };
};

/**
 * Recomputes contiguous unit.order (1..U) and Card-monotonic segment.order (1..S) on a single Card.
 */
export const syncCardUnitsAndSegmentsOrder = ({
  contentUnits,
  segments,
  blockId,
  orderedUnitIds = null,
  segmentOrderOverrideByUnitId = null,
  now
}) => {
  const siblingUnits = sortByOrderThenId(contentUnits.filter(u => u.blockId === blockId));
  const unitSequence = orderedUnitIds
    ? orderedUnitIds.map(id => siblingUnits.find(u => u.id === id)).filter(Boolean)
    : siblingUnits;

  const unitOrderById = new Map(unitSequence.map((unit, idx) => [unit.id, idx + 1]));
  const nextUnits = contentUnits.map(unit => {
    const nextOrder = unitOrderById.get(unit.id);
    if (!nextOrder || unit.order === nextOrder) return unit;
    return { ...unit, order: nextOrder, updatedAt: now };
  });

  const blockSegments = segments.filter(s => s.blockId === blockId);
  const segById = new Map(blockSegments.map(s => [s.id, s]));
  const orderedBlockSegments = [];
  const placedSegmentIds = new Set();

  unitSequence.forEach(unit => {
    const overrideIds = segmentOrderOverrideByUnitId?.get(unit.id);
    const unitSegments = overrideIds
      ? overrideIds.map(id => segById.get(id)).filter(Boolean)
      : sortByOrderThenId(blockSegments.filter(s => s.unitId === unit.id));
    unitSegments.forEach(seg => {
      orderedBlockSegments.push(seg);
      placedSegmentIds.add(seg.id);
    });
  });

  sortByOrderThenId(blockSegments.filter(s => !placedSegmentIds.has(s.id)))
    .forEach(seg => orderedBlockSegments.push(seg));

  const segOrderById = new Map(orderedBlockSegments.map((seg, idx) => [seg.id, idx + 1]));
  const nextSegments = segments.map(segment => {
    const nextOrder = segOrderById.get(segment.id);
    if (!nextOrder || segment.order === nextOrder) return segment;
    return { ...segment, order: nextOrder, updatedAt: now };
  });

  return { contentUnits: nextUnits, segments: nextSegments };
};

const requireStructuredCardAndDoc = (snapshot, blockId) => {
  const block = snapshot.blocks.find(item => item.id === blockId) || null;
  if (!block) throw new Error(`Text block not found: ${blockId}`);
  const document = snapshot.documents.find(item => item.id === block.documentId) || null;
  if (!document) throw new Error(`Text document not found: ${block.documentId}`);
  if (document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
    throw new Error(`Structured command refused for legacy Text document ${document.id}`);
  }
  return { block, document };
};

const requireContentUnit = (snapshot, unitId) => {
  const cleanId = normalizeNullableText(unitId)?.toUpperCase();
  const unit = (snapshot.contentUnits || []).find(item => item.id === cleanId) || null;
  if (!unit) throw new Error(`Content Unit not found: ${unitId}`);
  return unit;
};

const resolveTurnSpeakerInput = ({ document, speaker, speakerId, resetSpeaker = false, currentUnit = null }) => {
  if (resetSpeaker === true || speaker === null || speaker === '') {
    return { speakerId: null, speaker: null, documentMetadata: document.metadata };
  }

  const registry = getTextStructuredSpeakerRegistry({ metadata: document.metadata });
  const requestedSpeakerId = normalizeNullableText(speakerId);
  const cleanLabel = normalizeNullableText(speaker);

  if (!cleanLabel && !requestedSpeakerId) {
    return { speakerId: null, speaker: null, documentMetadata: document.metadata };
  }

  if (requestedSpeakerId && !cleanLabel) {
    const existing = registry.find(entry => entry.id === requestedSpeakerId) || null;
    if (!existing) {
      throw new Error(`Speaker ID "${requestedSpeakerId}" is not registered in document ${document.id}; provide speaker label.`);
    }
    return { speakerId: existing.id, speaker: existing.label, documentMetadata: document.metadata };
  }

  const normalizedLabel = normalizeTextStructuredSpeakerKey(cleanLabel);
  if (requestedSpeakerId) {
    const registered = registry.find(entry => entry.id === requestedSpeakerId) || null;
    if (registered && normalizeTextStructuredSpeakerKey(registered.label) !== normalizedLabel) {
      throw new Error(`Speaker ID "${requestedSpeakerId}" belongs to "${registered.label}" and cannot be assigned to "${cleanLabel}".`);
    }
  }

  const registeredByLabel = registry.find(entry => normalizeTextStructuredSpeakerKey(entry.label) === normalizedLabel) || null;
  const keepCurrentId = currentUnit?.speakerId
    && normalizeTextStructuredSpeakerKey(currentUnit.speaker || '') === normalizedLabel
    ? currentUnit.speakerId
    : null;

  const resolvedSpeakerId = requestedSpeakerId
    || keepCurrentId
    || registeredByLabel?.id
    || deriveTextStructuredSpeakerId({ documentId: document.id, speaker: cleanLabel });

  const matchedEntry = registry.find(entry => entry.id === resolvedSpeakerId) || null;
  const canonicalLabel = matchedEntry && normalizeTextStructuredSpeakerKey(matchedEntry.label) === normalizedLabel
    ? matchedEntry.label
    : cleanLabel;

  const documentMetadata = matchedEntry && matchedEntry.label === canonicalLabel
    ? document.metadata
    : buildTextStructuredUpsertSpeakerRegistryMetadata({
        metadata: document.metadata,
        documentId: document.id,
        speakerId: resolvedSpeakerId,
        label: canonicalLabel
      });

  return { speakerId: resolvedSpeakerId, speaker: canonicalLabel, documentMetadata };
};

export const createContentUnitCommand = ({ snapshot, payload, now, allocateIdentity, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.CREATE);
  const { block, document } = requireStructuredCardAndDoc(snapshot, payload?.blockId);
  const expectedKind = block.blockType === 'conversation' ? 'turn' : 'paragraph';

  if (payload?.kind !== undefined && String(payload.kind).trim().toLowerCase() !== expectedKind) {
    throw new Error(`Card ${block.id} (${block.blockType}) cannot create Content Unit of kind "${payload.kind}".`);
  }

  const requestedSpeaker = payload?.speaker ?? payload?.segment?.speaker;
  const requestedSpeakerId = payload?.speakerId;
  if (expectedKind === 'paragraph' && (normalizeNullableText(requestedSpeaker) || normalizeNullableText(requestedSpeakerId))) {
    throw new Error(`Paragraph Content Unit on Card ${block.id} cannot have speaker attribution.`);
  }

  const speakerResolution = expectedKind === 'turn'
    ? resolveTurnSpeakerInput({ document, speaker: requestedSpeaker, speakerId: requestedSpeakerId })
    : { speakerId: null, speaker: null, documentMetadata: document.metadata };

  let nextCountersSnapshot = snapshot;
  const unitAlloc = allocateIdentity(nextCountersSnapshot, 'CONTENT_UNIT');
  nextCountersSnapshot = { ...nextCountersSnapshot, counters: unitAlloc.counters };

  const siblings = sortByOrderThenId((snapshot.contentUnits || []).filter(u => u.blockId === block.id));
  let insertIndex = siblings.length;
  if (payload?.afterUnitId) {
    const afterId = String(payload.afterUnitId).trim().toUpperCase();
    const foundIdx = siblings.findIndex(u => u.id === afterId);
    if (foundIdx < 0) throw new Error(`afterUnitId ${payload.afterUnitId} does not belong to Card ${block.id}`);
    insertIndex = foundIdx + 1;
  } else if (payload?.order !== undefined) {
    const desiredOrder = normalizePositiveIndex(payload.order) ?? siblings.length + 1;
    insertIndex = Math.max(0, Math.min(siblings.length, desiredOrder - 1));
  }

  const unitRecord = createTextContentUnitRecord({
    id: unitAlloc.id,
    uid: unitAlloc.uid,
    documentId: document.id,
    blockId: block.id,
    kind: expectedKind,
    order: insertIndex + 1,
    speakerId: speakerResolution.speakerId,
    speaker: speakerResolution.speaker,
    createdAt: now,
    updatedAt: now,
    metadata: payload?.metadata
  });

  const orderedSiblingIds = [...siblings.map(u => u.id)];
  orderedSiblingIds.splice(insertIndex, 0, unitRecord.id);

  let nextSegments = snapshot.segments;
  let createdSegmentId = null;
  const initialText = payload?.text ?? payload?.segment?.text;
  if (normalizeNullableText(initialText)) {
    const segAlloc = allocateIdentity(nextCountersSnapshot, 'SEGMENT');
    nextCountersSnapshot = { ...nextCountersSnapshot, counters: segAlloc.counters };
    const segmentMeta = expectedKind === 'turn'
      ? applySpeakerIdToSegmentMetadata(payload?.segment?.metadata, unitRecord.speakerId)
      : (payload?.segment?.metadata || {});
    const segRecord = createTextSegmentRecord({
      id: segAlloc.id,
      uid: segAlloc.uid,
      documentId: document.id,
      blockId: block.id,
      unitId: unitRecord.id,
      order: 1,
      text: initialText,
      meaning: payload?.meaning ?? payload?.segment?.meaning ?? '',
      speaker: expectedKind === 'turn' ? unitRecord.speaker : null,
      joinAfter: payload?.joinAfter ?? payload?.segment?.joinAfter,
      createdAt: now,
      updatedAt: now,
      metadata: segmentMeta
    });
    createdSegmentId = segRecord.id;
    nextSegments = [...snapshot.segments, segRecord];
  }

  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: [...(snapshot.contentUnits || []), unitRecord],
    segments: nextSegments,
    blockId: block.id,
    orderedUnitIds: orderedSiblingIds,
    now
  });

  return finalize({
    ...snapshot,
    counters: nextCountersSnapshot.counters,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    contentUnitMigration: updateMaterializedBlockIds(snapshot, { add: [block.id] }),
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => (
      item.id === document.id ? { ...item, metadata: speakerResolution.documentMetadata, updatedAt: now } : item
    ))
  }, {
    entity: 'contentUnit',
    action: 'create',
    id: unitRecord.id,
    blockId: block.id,
    documentId: document.id,
    createdSegmentId
  });
};

export const updateContentUnitCommand = ({ snapshot, payload, now, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.UPDATE);
  const current = requireContentUnit(snapshot, payload?.id);
  const { block, document } = requireStructuredCardAndDoc(snapshot, current.blockId);

  if (payload?.metadata?.segmentIds !== undefined || payload?.segmentIds !== undefined) {
    throw new Error('Content Unit update cannot persist derived segmentIds[].');
  }

  if (current.kind === 'paragraph') {
    if (normalizeNullableText(payload?.speaker) || normalizeNullableText(payload?.speakerId)) {
      throw new Error(`Paragraph Content Unit ${current.id} cannot carry speaker attribution.`);
    }
    const updatedUnit = createTextContentUnitRecord({
      ...current,
      updatedAt: now,
      metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
    });
    return finalize({
      ...snapshot,
      contentUnits: snapshot.contentUnits.map(u => u.id === updatedUnit.id ? updatedUnit : u),
      blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
      documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
    }, { entity: 'contentUnit', action: 'update', id: updatedUnit.id, blockId: block.id, documentId: document.id });
  }

  const speakerProvided = payload?.speaker !== undefined || payload?.speakerId !== undefined || payload?.resetSpeaker === true;
  const resolution = speakerProvided
    ? resolveTurnSpeakerInput({
        document,
        speaker: payload?.speaker,
        speakerId: payload?.speakerId,
        resetSpeaker: payload?.resetSpeaker === true,
        currentUnit: current
      })
    : { speakerId: current.speakerId, speaker: current.speaker, documentMetadata: document.metadata };

  const updatedUnit = createTextContentUnitRecord({
    ...current,
    speakerId: resolution.speakerId,
    speaker: resolution.speaker,
    updatedAt: now,
    metadata: payload?.metadata === undefined ? current.metadata : payload.metadata
  });

  const nextSegments = speakerProvided
    ? snapshot.segments.map(segment => {
        if (segment.unitId !== current.id) return segment;
        return {
          ...segment,
          speaker: resolution.speaker,
          metadata: applySpeakerIdToSegmentMetadata(segment.metadata, resolution.speakerId),
          updatedAt: now
        };
      })
    : snapshot.segments;

  return finalize({
    ...snapshot,
    contentUnits: snapshot.contentUnits.map(u => u.id === updatedUnit.id ? updatedUnit : u),
    segments: nextSegments,
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => (
      d.id === document.id ? { ...d, metadata: resolution.documentMetadata, updatedAt: now } : d
    ))
  }, { entity: 'contentUnit', action: 'update', id: updatedUnit.id, blockId: block.id, documentId: document.id });
};

export const reorderContentUnitsCommand = ({ snapshot, payload, now, normalizeExactOrderIds, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.REORDER);
  const { block, document } = requireStructuredCardAndDoc(snapshot, payload?.blockId);
  const siblings = (snapshot.contentUnits || []).filter(u => u.blockId === block.id);
  const ids = normalizeExactOrderIds(siblings, payload?.orderedIds, 'Content Unit');

  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: snapshot.contentUnits,
    segments: snapshot.segments,
    blockId: block.id,
    orderedUnitIds: ids,
    now
  });

  return finalize({
    ...snapshot,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
  }, { entity: 'contentUnit', action: 'reorder', blockId: block.id, documentId: document.id, orderedIds: ids });
};

export const reorderContentUnitSegmentsCommand = ({ snapshot, payload, now, normalizeExactOrderIds, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.REORDER_SEGMENTS);
  const unit = requireContentUnit(snapshot, payload?.id);
  const { block, document } = requireStructuredCardAndDoc(snapshot, unit.blockId);
  const children = snapshot.segments.filter(segment => segment.unitId === unit.id);
  const ids = normalizeExactOrderIds(children, payload?.orderedIds, 'Content Unit Segment');
  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: snapshot.contentUnits,
    segments: snapshot.segments,
    blockId: block.id,
    segmentOrderOverrideByUnitId: new Map([[unit.id, ids]]),
    now
  });
  return finalize({
    ...snapshot,
    segments: synced.segments,
    blocks: snapshot.blocks.map(item => item.id === block.id ? { ...item, updatedAt: now } : item),
    documents: snapshot.documents.map(item => item.id === document.id ? { ...item, updatedAt: now } : item)
  }, { entity: 'contentUnit', action: 'reorderSegments', id: unit.id, blockId: block.id, documentId: document.id, orderedIds: ids });
};

export const splitContentUnitCommand = ({ snapshot, payload, now, allocateIdentity, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.SPLIT);
  const current = requireContentUnit(snapshot, payload?.id);
  const { block, document } = requireStructuredCardAndDoc(snapshot, current.blockId);

  const unitSegments = sortByOrderThenId(snapshot.segments.filter(s => s.unitId === current.id));
  if (unitSegments.length < 2) {
    throw new Error(`Content Unit ${current.id} split requires at least two child Segments.`);
  }

  let splitIndex = -1;
  if (payload?.beforeSegmentId) {
    const targetId = String(payload.beforeSegmentId).trim().toUpperCase();
    splitIndex = unitSegments.findIndex(s => s.id === targetId);
  } else if (payload?.afterSegmentId) {
    const targetId = String(payload.afterSegmentId).trim().toUpperCase();
    const found = unitSegments.findIndex(s => s.id === targetId);
    splitIndex = found >= 0 ? found + 1 : -1;
  } else if (payload?.splitAtIndex !== undefined) {
    const idx = Number(payload.splitAtIndex);
    splitIndex = Number.isInteger(idx) ? idx : -1;
  }

  if (splitIndex < 1 || splitIndex >= unitSegments.length) {
    throw new Error(`Content Unit ${current.id} split requires valid partition boundary (1..${unitSegments.length - 1}).`);
  }

  const allocated = allocateIdentity(snapshot, 'CONTENT_UNIT');
  const createdUnit = createTextContentUnitRecord({
    id: allocated.id,
    uid: allocated.uid,
    documentId: document.id,
    blockId: block.id,
    kind: current.kind,
    order: current.order + 1,
    speakerId: current.speakerId,
    speaker: current.speaker,
    createdAt: now,
    updatedAt: now
  });

  const movedSegmentIds = new Set(unitSegments.slice(splitIndex).map(s => s.id));
  const nextSegments = snapshot.segments.map(s => (
    movedSegmentIds.has(s.id) ? { ...s, unitId: createdUnit.id, updatedAt: now } : s
  ));

  const orderedSiblingIds = sortByOrderThenId(snapshot.contentUnits.filter(u => u.blockId === block.id))
    .flatMap(u => (u.id === current.id ? [current.id, createdUnit.id] : [u.id]));

  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: [...snapshot.contentUnits, createdUnit],
    segments: nextSegments,
    blockId: block.id,
    orderedUnitIds: orderedSiblingIds,
    now
  });

  return finalize({
    ...snapshot,
    counters: allocated.counters,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
  }, {
    entity: 'contentUnit',
    action: 'split',
    retainedId: current.id,
    createdId: createdUnit.id,
    movedSegmentIds: [...movedSegmentIds],
    blockId: block.id,
    documentId: document.id
  });
};

const assertTurnSpeakersMatchForMerge = selected => {
  const withIds = selected.filter(u => Boolean(normalizeNullableText(u.speakerId)));
  if (withIds.length > 0) {
    const firstId = withIds[0].speakerId;
    const allSameId = selected.every(u => u.speakerId === firstId);
    if (!allSameId) {
      throw new Error('Turn merge refused: all merged Turns must belong to the same canonical speakerId (R7).');
    }
  }
  const firstLabelKey = normalizeTextStructuredSpeakerKey(selected[0].speaker || '');
  const allSameLabel = selected.every(u => normalizeTextStructuredSpeakerKey(u.speaker || '') === firstLabelKey);
  if (!allSameLabel) {
    throw new Error('Turn merge refused: merged Turns have mismatched speakers (R7).');
  }
};

export const mergeContentUnitsCommand = ({ snapshot, payload, now, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.MERGE);
  const requestedIds = [...new Set(
    (Array.isArray(payload?.ids) ? payload.ids : [])
      .map(id => String(id ?? '').trim().toUpperCase())
      .filter(Boolean)
  )];
  if (requestedIds.length < 2) {
    throw new Error('Content Unit merge requires at least two unique Content Unit IDs.');
  }

  const firstUnit = requireContentUnit(snapshot, requestedIds[0]);
  const { block, document } = requireStructuredCardAndDoc(snapshot, firstUnit.blockId);
  const siblings = sortByOrderThenId(snapshot.contentUnits.filter(u => u.blockId === block.id));
  const selected = requestedIds.map(id => {
    const found = siblings.find(u => u.id === id);
    if (!found) throw new Error(`Content Unit ${id} does not belong to Card ${block.id}`);
    return found;
  });

  const positions = selected
    .map(unit => siblings.findIndex(candidate => candidate.id === unit.id))
    .sort((a, b) => a - b);
  const contiguous = positions.every((pos, idx) => idx === 0 || pos === positions[idx - 1] + 1);
  if (!contiguous) {
    throw new Error(`Content Unit merge requires adjacent sibling Units in Card ${block.id}.`);
  }

  const selectedInCardOrder = positions.map(pos => siblings[pos]);
  if (selectedInCardOrder[0].kind === 'turn') {
    assertTurnSpeakersMatchForMerge(selectedInCardOrder);
  }

  const retained = selectedInCardOrder[0];
  const removedIds = new Set(selectedInCardOrder.slice(1).map(u => u.id));
  const mergedChildOrder = selectedInCardOrder.flatMap(unit => (
    sortByOrderThenId(snapshot.segments.filter(s => s.unitId === unit.id)).map(s => s.id)
  ));

  const nextUnits = snapshot.contentUnits
    .filter(u => !removedIds.has(u.id))
    .map(u => (u.id === retained.id ? { ...u, updatedAt: now } : u));
  const nextSegments = snapshot.segments.map(s => (
    removedIds.has(s.unitId) ? { ...s, unitId: retained.id, updatedAt: now } : s
  ));

  const orderedRemainingUnitIds = siblings.filter(u => !removedIds.has(u.id)).map(u => u.id);
  const overrideMap = new Map([[retained.id, mergedChildOrder]]);
  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: nextUnits,
    segments: nextSegments,
    blockId: block.id,
    orderedUnitIds: orderedRemainingUnitIds,
    segmentOrderOverrideByUnitId: overrideMap,
    now
  });

  return finalize({
    ...snapshot,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
  }, {
    entity: 'contentUnit',
    action: 'merge',
    retainedId: retained.id,
    removedIds: [...removedIds],
    blockId: block.id,
    documentId: document.id
  });
};

export const deleteContentUnitCommand = ({ snapshot, payload, now, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.DELETE);
  const current = requireContentUnit(snapshot, payload?.id);
  const { block, document } = requireStructuredCardAndDoc(snapshot, current.blockId);

  const removedSegmentIds = new Set(
    snapshot.segments.filter(s => s.unitId === current.id).map(s => s.id)
  );
  const remainingUnits = snapshot.contentUnits.filter(u => u.id !== current.id);
  const remainingSegments = snapshot.segments.filter(s => !removedSegmentIds.has(s.id));

  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: remainingUnits,
    segments: remainingSegments,
    blockId: block.id,
    now
  });

  // R3: explicitly keep block.id inside materializedBlockIds so an emptied Card keeps 0 Units.
  return finalize({
    ...snapshot,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    audioVariants: snapshot.audioVariants.filter(v => !removedSegmentIds.has(v.segmentId)),
    contentUnitMigration: updateMaterializedBlockIds(snapshot, { add: [block.id] }),
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
  }, {
    entity: 'contentUnit',
    action: 'delete',
    id: current.id,
    removedSegmentIds: [...removedSegmentIds],
    blockId: block.id,
    documentId: document.id
  });
};

export const moveSegmentToUnitCommand = ({ snapshot, payload, now, finalize }) => {
  requireContentUnitSnapshotEnabled(snapshot, TEXT_CONTENT_UNIT_COMMAND_TYPES.SEGMENT_MOVE);
  const segId = String(payload?.segmentId ?? payload?.id ?? '').trim().toUpperCase();
  const segment = snapshot.segments.find(item => item.id === segId) || null;
  if (!segment) throw new Error(`Text segment not found: ${payload?.segmentId || payload?.id}`);
  const { block, document } = requireStructuredCardAndDoc(snapshot, segment.blockId);
  const targetUnit = requireContentUnit(snapshot, payload?.targetUnitId);

  if (targetUnit.blockId !== segment.blockId) {
    throw new Error(
      `Cross-Card segment.move is deferred in Gate D3-B (source Card ${segment.blockId} !== target Unit Card ${targetUnit.blockId}).`
    );
  }

  const targetChildren = sortByOrderThenId(
    snapshot.segments.filter(s => s.unitId === targetUnit.id && s.id !== segment.id)
  ).map(s => s.id);

  let insertIndex = targetChildren.length;
  if (payload?.beforeSegmentId) {
    const idx = targetChildren.indexOf(String(payload.beforeSegmentId).trim().toUpperCase());
    if (idx < 0) throw new Error(`beforeSegmentId ${payload.beforeSegmentId} is not in target Unit ${targetUnit.id}`);
    insertIndex = idx;
  } else if (payload?.afterSegmentId) {
    const idx = targetChildren.indexOf(String(payload.afterSegmentId).trim().toUpperCase());
    if (idx < 0) throw new Error(`afterSegmentId ${payload.afterSegmentId} is not in target Unit ${targetUnit.id}`);
    insertIndex = idx + 1;
  } else if (payload?.orderInUnit !== undefined) {
    const idx = normalizePositiveIndex(payload.orderInUnit);
    if (idx !== null) insertIndex = Math.max(0, Math.min(targetChildren.length, idx - 1));
  }
  targetChildren.splice(insertIndex, 0, segment.id);

  // R6: Turn move synchronizes speaker + speakerIdentityV1 without dropping physical audioVariants.
  const nextSegments = snapshot.segments.map(item => {
    if (item.id !== segment.id) return item;
    if (targetUnit.kind === 'turn') {
      return {
        ...item,
        unitId: targetUnit.id,
        speaker: targetUnit.speaker || null,
        metadata: applySpeakerIdToSegmentMetadata(item.metadata, targetUnit.speakerId),
        updatedAt: now
      };
    }
    return {
      ...item,
      unitId: targetUnit.id,
      speaker: null,
      metadata: applySpeakerIdToSegmentMetadata(item.metadata, null),
      updatedAt: now
    };
  });

  const overrideMap = new Map([[targetUnit.id, targetChildren]]);
  const synced = syncCardUnitsAndSegmentsOrder({
    contentUnits: snapshot.contentUnits,
    segments: nextSegments,
    blockId: block.id,
    segmentOrderOverrideByUnitId: overrideMap,
    now
  });

  return finalize({
    ...snapshot,
    contentUnits: synced.contentUnits,
    segments: synced.segments,
    blocks: snapshot.blocks.map(b => b.id === block.id ? { ...b, updatedAt: now } : b),
    documents: snapshot.documents.map(d => d.id === document.id ? { ...d, updatedAt: now } : d)
  }, {
    entity: 'segment',
    action: 'move',
    id: segment.id,
    targetUnitId: targetUnit.id,
    blockId: block.id,
    documentId: document.id
  });
};
