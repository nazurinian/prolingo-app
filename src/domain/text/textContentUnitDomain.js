import {
  TEXT_CONTENT_UNIT_KINDS,
  TEXT_ID_PREFIXES,
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_LIBRARY_V2_DB_VERSION,
  TEXT_LIBRARY_V2_SCHEMA_VERSION,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  createTextGlobalUid,
  normalizeTextGlobalUid,
  TEXT_GLOBAL_UID_KINDS
} from './textGlobalIdentityDomain.js';
import { getTextIdSequence } from './textIdentityDomain.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import {
  getTextStructuredSegmentSpeakerId,
  getTextStructuredSpeakerRegistry
} from './textStructuredSpeakerIdentityDomain.js';

export const TEXT_CONTENT_UNIT_MIGRATION_STATUS = Object.freeze({
  UNMIGRATED_V1: 'unmigrated-v1',
  PARTIAL_UPGRADE: 'partial-upgrade',
  MIGRATED_V2: 'migrated-v2',
  CORRUPTED: 'corrupted'
});

const CONTENT_UNIT_ID_PREFIX = TEXT_ID_PREFIXES.CONTENT_UNIT;
export const TEXT_EMPTY_PARAGRAPH_BACKFILL_METADATA_KEY = 'emptyParagraphBackfillV1';

// Explicit migration provenance, rather than equality with a mutable parent Card's timestamps.
// Old snapshots without this evidence remain ambiguous and must be preserved on source removal.
export const isUnmodifiedEmptyParagraphBackfill = unit => {
  const metadata = unit?.metadata || {};
  const origin = metadata[TEXT_EMPTY_PARAGRAPH_BACKFILL_METADATA_KEY];
  return unit?.kind === 'paragraph' && unit.order === 1 && !unit.speakerId && !unit.speaker
    && origin?.version === 1
    && Number.isFinite(origin.createdAt) && Number.isFinite(origin.updatedAt)
    && origin.createdAt === unit.createdAt && origin.updatedAt === unit.updatedAt
    && Object.keys(metadata).every(key => [TEXT_EMPTY_PARAGRAPH_BACKFILL_METADATA_KEY, 'prolingoTextPackSource'].includes(key));
};
const CONTENT_UNIT_ID_PATTERN = new RegExp(`^${CONTENT_UNIT_ID_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
const DOC_ID_PATTERN = new RegExp(`^${TEXT_ID_PREFIXES.DOCUMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);

const normalizePositiveInt = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : fallback;
};

const normalizeOrder = (value, fallback = 1) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 ? num : fallback;
};

const normalizeOptionalText = value => {
  const text = String(value ?? '').trim();
  return text || null;
};

const normalizePlainMetadata = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
);

export const getTextContentUnitIdSequence = id => {
  const match = String(id || '').toUpperCase().match(CONTENT_UNIT_ID_PATTERN);
  return match ? normalizePositiveInt(match[1]) : 0;
};

export const formatTextContentUnitId = sequence => {
  const safe = Math.max(1, normalizePositiveInt(sequence, 1));
  return `${CONTENT_UNIT_ID_PREFIX}${String(safe).padStart(6, '0')}`;
};

const hasDocumentIdFormat = id => {
  const match = String(id || '').toUpperCase().match(DOC_ID_PATTERN);
  return Boolean(match && normalizePositiveInt(match[1]) > 0);
};

export const isContentUnitSnapshot = candidate => Boolean(
  candidate && typeof candidate === 'object' && (
    Array.isArray(candidate.contentUnits)
    || Number(candidate.schemaVersion) >= TEXT_LIBRARY_V2_SCHEMA_VERSION
    || Boolean(candidate.contentUnitMigration)
  )
);

/**
 * Normalizes snapshot-level Content Unit backfill metadata stored under meta[contentUnitMigration].
 * R3: materializedBlockIds tracks structured Cards already processed so intentionally emptied
 * v2 Cards (0 Units) remain empty across repeat migrations.
 */
export const normalizeTextContentUnitMigrationState = (candidate = null) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const materializedBlockIds = [...new Set(
    (Array.isArray(candidate.materializedBlockIds) ? candidate.materializedBlockIds : [])
      .map(value => String(value ?? '').trim().toUpperCase())
      .filter(value => Boolean(getTextIdSequence(value)))
  )].sort();
  return {
    version: normalizeOrder(candidate.version, 1),
    phase: ['pending', 'schema-upgraded', 'complete'].includes(candidate.phase) ? candidate.phase : 'pending',
    materializedBlockIds,
    completedAt: Number.isFinite(Number(candidate.completedAt)) ? Number(candidate.completedAt) : null
  };
};

/**
 * Validates and constructs a normalized persisted ContentUnit record.
 * R4: Persisted ContentUnit records never store derived segmentIds[] arrays.
 */
export const createTextContentUnitRecord = ({
  id,
  uid = null,
  documentId,
  blockId,
  kind,
  order = 1,
  speakerId = null,
  speaker = null,
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {},
  segmentIds
}) => {
  if (segmentIds !== undefined) {
    throw new Error('Persisted ContentUnit cannot store derived segmentIds[]; segment.unitId is the single source of truth.');
  }
  const normalizedId = String(id ?? '').trim().toUpperCase();
  if (!getTextContentUnitIdSequence(normalizedId)) {
    throw new Error(`Invalid CONTENT_UNIT_ID: ${id}`);
  }
  const normalizedDocumentId = String(documentId ?? '').trim().toUpperCase();
  if (!hasDocumentIdFormat(normalizedDocumentId)) {
    throw new Error(`Invalid Content Unit DOC_ID: ${documentId}`);
  }
  const normalizedBlockId = String(blockId ?? '').trim().toUpperCase();
  if (!getTextIdSequence(normalizedBlockId)) {
    throw new Error(`Invalid Content Unit TEXT_ID: ${blockId}`);
  }
  const normalizedKind = String(kind ?? '').trim().toLowerCase();
  if (!TEXT_CONTENT_UNIT_KINDS.includes(normalizedKind)) {
    throw new Error(`Invalid Content Unit kind: ${kind}`);
  }

  const normalizedSpeakerId = normalizeOptionalText(speakerId);
  const normalizedSpeaker = normalizeOptionalText(speaker);
  if (normalizedKind === 'paragraph' && (normalizedSpeakerId !== null || normalizedSpeaker !== null)) {
    throw new Error(`Paragraph Content Unit ${normalizedId} cannot carry speaker attribution.`);
  }

  const cleanMetadata = normalizePlainMetadata(metadata);
  if ('segmentIds' in cleanMetadata) {
    throw new Error('ContentUnit metadata cannot persist derived segmentIds[].');
  }

  const normalizedUid = uid ? normalizeTextGlobalUid(uid, TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT) : null;
  if (uid && !normalizedUid) {
    throw new Error(`Invalid CONTENT_UNIT UID for ${normalizedId}: ${uid}`);
  }

  const base = {
    id: normalizedId,
    documentId: normalizedDocumentId,
    blockId: normalizedBlockId,
    kind: normalizedKind,
    order: normalizeOrder(order),
    speakerId: normalizedKind === 'turn' ? normalizedSpeakerId : null,
    speaker: normalizedKind === 'turn' ? normalizedSpeaker : null,
    createdAt,
    updatedAt,
    metadata: cleanMetadata
  };

  return normalizedUid ? { ...base, uid: normalizedUid } : base;
};

const collectExistingGlobalUids = snapshot => {
  const seen = new Set();
  const add = (value, kind) => {
    const normalized = normalizeTextGlobalUid(value, kind);
    if (normalized) seen.add(normalized);
  };
  (snapshot?.collections || []).forEach(item => add(item?.uid, TEXT_GLOBAL_UID_KINDS.COLLECTION));
  (snapshot?.documents || []).forEach(doc => {
    add(doc?.uid, TEXT_GLOBAL_UID_KINDS.WORKSPACE);
    getTextStructuredSpeakerRegistry(doc).forEach(entry => add(entry?.uid, TEXT_GLOBAL_UID_KINDS.SPEAKER));
  });
  (snapshot?.blocks || []).forEach(item => add(item?.uid, TEXT_GLOBAL_UID_KINDS.CARD));
  (snapshot?.contentUnits || []).forEach(item => add(item?.uid, TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT));
  (snapshot?.segments || []).forEach(item => add(item?.uid, TEXT_GLOBAL_UID_KINDS.SEGMENT));
  (snapshot?.audioVariants || []).forEach(item => add(item?.uid, TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT));
  return seen;
};

const createUniqueContentUnitUid = seenUids => {
  let uid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
  while (seenUids.has(uid)) {
    uid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
  }
  seenUids.add(uid);
  return uid;
};

const floorContentUnitCounter = (counters, contentUnits = []) => {
  const maxUnitSeq = (Array.isArray(contentUnits) ? contentUnits : [])
    .reduce((max, item) => Math.max(max, getTextContentUnitIdSequence(item?.id)), 0);
  return Math.max(normalizePositiveInt(counters?.contentUnit), maxUnitSeq);
};

const isMigratedSnapshotComplete = snapshot => (
  Number(snapshot?.schemaVersion) >= TEXT_LIBRARY_V2_SCHEMA_VERSION
  && normalizeTextContentUnitMigrationState(snapshot?.contentUnitMigration)?.phase === 'complete'
);

const validateContentUnitOrders = ({ contentUnits, blocksById, errors }) => {
  const unitsByBlock = new Map();
  contentUnits.forEach(unit => {
    const list = unitsByBlock.get(unit.blockId) || [];
    list.push(unit);
    unitsByBlock.set(unit.blockId, list);
  });

  unitsByBlock.forEach((units, blockId) => {
    const seenOrders = new Set();
    const sorted = [...units].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
    sorted.forEach((unit, idx) => {
      if (!Number.isInteger(unit.order) || unit.order < 1) {
        errors.push(`Content Unit ${unit.id} has invalid order ${unit.order} in Card ${blockId}`);
      } else if (seenOrders.has(unit.order)) {
        errors.push(`Duplicate Content Unit order ${unit.order} in Card ${blockId}`);
      }
      seenOrders.add(unit.order);
      if (unit.order !== idx + 1 && blocksById.has(blockId)) {
        errors.push(`Non-contiguous Content Unit order ${unit.order} in Card ${blockId} (expected ${idx + 1})`);
      }
    });
  });
};

const validateSegmentUnitLinksAndOrder = ({
  segments,
  blocksById,
  docsById,
  unitsById,
  requireMigrated,
  errors
}) => {
  const segmentsByBlock = new Map();
  segments.forEach(segment => {
    const list = segmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    segmentsByBlock.set(segment.blockId, list);
  });

  segmentsByBlock.forEach((blockSegments, blockId) => {
    const block = blocksById.get(blockId);
    const parentDoc = docsById.get(block?.documentId);
    const isLegacyDoc = parentDoc?.editorModel === TEXT_LEGACY_EDITOR_MODEL;
    const sortedSegs = [...blockSegments].sort((a, b) => (
      Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id))
    ));
    const hasLinkedSegment = sortedSegs.some(seg => seg?.unitId != null && String(seg.unitId).trim() !== '');
    const enforceContiguousSegOrder = !isLegacyDoc && (requireMigrated || hasLinkedSegment);
    const seenSegOrders = new Set();
    let lastUnitOrder = 0;

    sortedSegs.forEach((segment, segIndex) => {
      if (enforceContiguousSegOrder) {
        if (!Number.isInteger(segment.order) || segment.order < 1) {
          errors.push(`Segment ${segment.id} has invalid order ${segment.order} in Card ${blockId} (expected positive integer)`);
        } else if (seenSegOrders.has(segment.order)) {
          errors.push(`Duplicate Segment order ${segment.order} in Card ${blockId}`);
        } else if (segment.order !== segIndex + 1) {
          errors.push(`Non-contiguous Segment order ${segment.order} in Card ${blockId} (expected ${segIndex + 1})`);
        }
        seenSegOrders.add(segment.order);
      }

      const unitId = segment?.unitId ? String(segment.unitId).trim().toUpperCase() : null;
      if (isLegacyDoc) {
        if (unitId) {
          errors.push(`Legacy Segment ${segment.id} cannot reference Content Unit ${unitId}`);
        }
        return;
      }

      if (!unitId) {
        if (requireMigrated && parentDoc?.editorModel === TEXT_STRUCTURED_EDITOR_MODEL) {
          errors.push(`Structured Segment ${segment.id} is missing required unitId in migrated snapshot`);
        }
        return;
      }

      if (!getTextContentUnitIdSequence(unitId)) {
        errors.push(`Segment ${segment.id} has invalid unitId format: ${segment.unitId}`);
        return;
      }
      const unit = unitsById.get(unitId);
      if (!unit) {
        errors.push(`Segment ${segment.id} references missing Content Unit ${unitId}`);
        return;
      }
      if (unit.blockId !== segment.blockId) {
        errors.push(`Segment ${segment.id} unitId ${unitId} belongs to Card ${unit.blockId}, not ${segment.blockId}`);
        return;
      }
      if (unit.documentId !== segment.documentId) {
        errors.push(`Segment ${segment.id} unitId ${unitId} belongs to Workspace ${unit.documentId}, not ${segment.documentId}`);
      }

      if (unit.order < lastUnitOrder) {
        errors.push(
          `Segment ${segment.id} (order ${segment.order}, Unit order ${unit.order}) violates Card-monotonic Unit order on ${blockId}`
        );
      }
      lastUnitOrder = Math.max(lastUnitOrder, unit.order);

      if (unit.kind === 'turn') {
        const unitSpeakerId = normalizeOptionalText(unit.speakerId);
        const segSpeakerId = getTextStructuredSegmentSpeakerId(segment);
        const unitLabelKey = normalizeTextStructuredSpeakerKey(unit.speaker || '');
        const segLabelKey = normalizeTextStructuredSpeakerKey(segment.speaker || '');
        if (unitSpeakerId !== segSpeakerId) {
          errors.push(
            `Turn ${unit.id} speakerId (${unitSpeakerId || 'null'}) disagrees with child Segment ${segment.id} speakerIdentityV1 (${segSpeakerId || 'null'})`
          );
        }
        if (unitLabelKey !== segLabelKey) {
          errors.push(
            `Turn ${unit.id} speaker ("${unit.speaker || ''}") disagrees with child Segment ${segment.id} speaker ("${segment.speaker || ''}")`
          );
        }
      }
    });
  });
};

/**
 * Validates normalized Content Unit entities, FKs, R4/R6/R10 invariants, and Card-monotonic Segment ordering.
 */
export const validateTextContentUnitsState = (snapshot, options = {}) => {
  const errors = [];
  const documents = Array.isArray(snapshot?.documents) ? snapshot.documents : [];
  const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
  const contentUnits = Array.isArray(snapshot?.contentUnits) ? snapshot.contentUnits : [];
  const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : [];
  const requireMigrated = options.requireMigrated ?? isMigratedSnapshotComplete(snapshot);

  const docsById = new Map(documents.map(doc => [doc.id, doc]));
  const blocksById = new Map(blocks.map(block => [block.id, block]));
  const unitsById = new Map();
  const seenUnitUids = new Set();

  contentUnits.forEach(unit => {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
      errors.push('Content Unit record must be a plain object');
      return;
    }
    if ('segmentIds' in unit || (unit.metadata && 'segmentIds' in unit.metadata)) {
      errors.push(`Content Unit ${unit.id || '(unknown)'} must not persist derived segmentIds[]`);
    }
    if (!getTextContentUnitIdSequence(unit.id)) {
      errors.push(`Invalid CONTENT_UNIT_ID: ${unit.id}`);
    } else if (unitsById.has(unit.id)) {
      errors.push(`Duplicate CONTENT_UNIT_ID detected: ${unit.id}`);
    } else {
      unitsById.set(unit.id, unit);
    }

    if (unit.uid) {
      const normalizedUid = normalizeTextGlobalUid(unit.uid, TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
      if (!normalizedUid) {
        errors.push(`Content Unit ${unit.id} has invalid UNITUID: ${unit.uid}`);
      } else if (seenUnitUids.has(normalizedUid)) {
        errors.push(`Duplicate CONTENT_UNIT UID detected: ${normalizedUid}`);
      } else {
        seenUnitUids.add(normalizedUid);
      }
    }

    const parentDoc = docsById.get(unit.documentId);
    const parentBlock = blocksById.get(unit.blockId);
    if (!parentDoc) {
      errors.push(`Content Unit ${unit.id} references missing document ${unit.documentId}`);
    } else if (parentDoc.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
      errors.push(`Legacy document ${parentDoc.id} (${parentDoc.editorModel}) cannot own Content Unit ${unit.id}`);
    }
    if (!parentBlock) {
      errors.push(`Content Unit ${unit.id} references missing block ${unit.blockId}`);
    } else if (parentBlock.documentId !== unit.documentId) {
      errors.push(`Content Unit ${unit.id} document ${unit.documentId} does not match parent block document ${parentBlock.documentId}`);
    }

    if (!TEXT_CONTENT_UNIT_KINDS.includes(unit.kind)) {
      errors.push(`Content Unit ${unit.id} has invalid kind ${unit.kind}`);
    } else if (parentBlock) {
      const expectedKind = parentBlock.blockType === 'conversation' ? 'turn' : 'paragraph';
      if (unit.kind !== expectedKind) {
        errors.push(`Card ${parentBlock.id} (${parentBlock.blockType}) cannot contain ${unit.kind} Content Unit ${unit.id}`);
      }
    }

    if (unit.kind === 'paragraph' && (normalizeOptionalText(unit.speakerId) || normalizeOptionalText(unit.speaker))) {
      errors.push(`Paragraph Content Unit ${unit.id} cannot carry speaker attribution`);
    }

    if (unit.kind === 'turn' && unit.speakerId && parentDoc) {
      const registry = getTextStructuredSpeakerRegistry(parentDoc);
      const entry = registry.find(item => item.id === unit.speakerId) || null;
      if (entry && normalizeTextStructuredSpeakerKey(entry.label) !== normalizeTextStructuredSpeakerKey(unit.speaker || '')) {
        errors.push(
          `Turn ${unit.id} speaker "${unit.speaker || ''}" disagrees with registry entry ${entry.id} ("${entry.label}")`
        );
      }
    }
  });

  if (options.checkCounterFloor) {
    const maxSeq = contentUnits.reduce((max, item) => Math.max(max, getTextContentUnitIdSequence(item?.id)), 0);
    const declaredCounter = snapshot?.counters?.contentUnit;
    if (declaredCounter === undefined || Number(declaredCounter) < maxSeq) {
      errors.push(`Content Unit counter floor underflow: counter=${declaredCounter ?? '(missing)'} < maxSeq=${maxSeq}`);
    }
  }

  validateContentUnitOrders({ contentUnits, blocksById, errors });
  validateSegmentUnitLinksAndOrder({
    segments,
    blocksById,
    docsById,
    unitsById,
    requireMigrated,
    errors
  });

  return { valid: errors.length === 0, errors };
};

/**
 * Inspects snapshot + optional physical IDB version to detect R1 migration readiness state.
 */
export const inspectTextContentUnitMigrationState = (snapshotCandidate, { idbVersion = null } = {}) => {
  const snapshot = snapshotCandidate && typeof snapshotCandidate === 'object' ? snapshotCandidate : {};
  const schemaVersion = Number(snapshot.schemaVersion || 1);
  const migration = normalizeTextContentUnitMigrationState(snapshot.contentUnitMigration);
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const segments = Array.isArray(snapshot.segments) ? snapshot.segments : [];
  const hasUnitsArray = Array.isArray(snapshot.contentUnits);
  const units = hasUnitsArray ? snapshot.contentUnits : [];

  const structuredDocIds = new Set(
    documents.filter(doc => doc.editorModel === TEXT_STRUCTURED_EDITOR_MODEL).map(doc => doc.id)
  );
  const structuredBlocks = blocks.filter(block => structuredDocIds.has(block.documentId));
  const structuredSegments = segments.filter(segment => structuredDocIds.has(segment.documentId));
  const anySegmentHasUnitId = segments.some(segment => segment?.unitId != null && String(segment.unitId).trim() !== '');

  // Pure pre-v2 snapshot before Phase 1 upgrade
  if (!hasUnitsArray && schemaVersion < TEXT_LIBRARY_V2_SCHEMA_VERSION && !migration && (idbVersion === null || Number(idbVersion) < TEXT_LIBRARY_V2_DB_VERSION)) {
    if (anySegmentHasUnitId) {
      return {
        status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED,
        errors: ['Snapshot contains segment.unitId references without contentUnits collection.']
      };
    }
    return {
      status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.UNMIGRATED_V1,
      errors: []
    };
  }

  // Structural check against currently persisted Units without requiring unmigrated segments to be linked yet.
  const partialValidation = validateTextContentUnitsState(snapshot, {
    requireMigrated: false,
    checkCounterFloor: Boolean(hasUnitsArray && units.length > 0 && snapshot?.counters?.contentUnit !== undefined)
  });
  if (!partialValidation.valid) {
    return {
      status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED,
      errors: partialValidation.errors
    };
  }

  const materializedSet = new Set(migration?.materializedBlockIds || []);
  const unmaterializedStructuredBlock = structuredBlocks.some(block => !materializedSet.has(block.id));
  const unlinkedStructuredSegment = structuredSegments.some(segment => !segment.unitId);
  const migrationIncomplete = !migration || migration.phase !== 'complete';
  const versionBehind = schemaVersion < TEXT_LIBRARY_V2_SCHEMA_VERSION;
  const physicalV2Behind = idbVersion !== null && Number(idbVersion) >= TEXT_LIBRARY_V2_DB_VERSION && (
    versionBehind || migrationIncomplete || unmaterializedStructuredBlock || unlinkedStructuredSegment
  );

  if (physicalV2Behind || migrationIncomplete || versionBehind || unmaterializedStructuredBlock || unlinkedStructuredSegment || !hasUnitsArray) {
    return {
      status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE,
      errors: []
    };
  }

  const strictValidation = validateTextContentUnitsState(snapshot, { requireMigrated: true, checkCounterFloor: false });
  if (!strictValidation.valid) {
    return {
      status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED,
      errors: strictValidation.errors
    };
  }

  return {
    status: TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2,
    errors: []
  };
};

const backfillUnitsForParagraphBlock = ({
  block,
  blockSegments,
  existingBlockUnits,
  materializedSet,
  allocateUnit,
  now,
  nextUnits,
  updatedSegmentMap
}) => {
  const sortedSegs = [...blockSegments].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
  const unlinkedSegs = sortedSegs.filter(seg => !seg.unitId);
  let createdCount = 0;
  let linkedCount = 0;

  if (sortedSegs.length === 0) {
    if (!materializedSet.has(block.id) && existingBlockUnits.length === 0) {
      nextUnits.push(allocateUnit({
        documentId: block.documentId,
        blockId: block.id,
        kind: 'paragraph',
        order: 1,
        speakerId: null,
        speaker: null,
        createdAt: block.createdAt || now,
        updatedAt: block.updatedAt || now,
        metadata: {
          [TEXT_EMPTY_PARAGRAPH_BACKFILL_METADATA_KEY]: {
            version: 1, createdAt: block.createdAt || now, updatedAt: block.updatedAt || now
          }
        }
      }));
      createdCount += 1;
    }
    materializedSet.add(block.id);
    return { createdCount, linkedCount };
  }

  if (unlinkedSegs.length > 0) {
    let targetUnit = existingBlockUnits[0] || null;
    if (!targetUnit) {
      targetUnit = allocateUnit({
        documentId: block.documentId,
        blockId: block.id,
        kind: 'paragraph',
        order: 1,
        speakerId: null,
        speaker: null,
        createdAt: block.createdAt || now,
        updatedAt: block.updatedAt || now
      });
      nextUnits.push(targetUnit);
      createdCount += 1;
    }
    unlinkedSegs.forEach(segment => {
      updatedSegmentMap.set(segment.id, { ...segment, unitId: targetUnit.id });
      linkedCount += 1;
    });
  }

  materializedSet.add(block.id);
  return { createdCount, linkedCount };
};

const backfillUnitsForConversationBlock = ({
  block,
  blockSegments,
  existingBlockUnits,
  materializedSet,
  allocateUnit,
  now,
  nextUnits,
  updatedSegmentMap
}) => {
  const sortedSegs = [...blockSegments].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
  const unitById = new Map(existingBlockUnits.map(u => [u.id, u]));
  let createdCount = 0;
  let linkedCount = 0;
  let nextOrder = existingBlockUnits.reduce((max, u) => Math.max(max, Number(u.order || 0)), 0);
  const blockCreatedTurns = [];

  sortedSegs.forEach(segment => {
    if (segment.unitId && unitById.has(segment.unitId)) return;
    nextOrder += 1;
    // R6: copy speakerIdentityV1 ONLY when already present; keep missing ID as null + label intact.
    const speakerId = getTextStructuredSegmentSpeakerId(segment);
    const speaker = normalizeOptionalText(segment.speaker);
    const turn = allocateUnit({
      documentId: block.documentId,
      blockId: block.id,
      kind: 'turn',
      order: nextOrder,
      speakerId,
      speaker,
      createdAt: segment.createdAt || block.createdAt || now,
      updatedAt: segment.updatedAt || block.updatedAt || now
    });
    blockCreatedTurns.push(turn);
    nextUnits.push(turn);
    updatedSegmentMap.set(segment.id, { ...segment, unitId: turn.id });
    createdCount += 1;
    linkedCount += 1;
  });

  // If newly backfilled Turns were interleaved before existing partial-upgrade Turns, normalize Turn orders Card-monotonically.
  if (blockCreatedTurns.length > 0 && existingBlockUnits.length > 0) {
    const earliestSegOrderByUnit = new Map();
    sortedSegs.forEach(seg => {
      const effectiveSeg = updatedSegmentMap.get(seg.id) || seg;
      const prev = earliestSegOrderByUnit.get(effectiveSeg.unitId);
      if (prev === undefined || seg.order < prev) {
        earliestSegOrderByUnit.set(effectiveSeg.unitId, seg.order);
      }
    });
    const combined = [...existingBlockUnits, ...blockCreatedTurns].sort((a, b) => {
      const aSegOrder = earliestSegOrderByUnit.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bSegOrder = earliestSegOrderByUnit.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return (aSegOrder - bSegOrder) || (Number(a.order || 0) - Number(b.order || 0)) || String(a.id).localeCompare(String(b.id));
    });
    const orderByUnitId = new Map(combined.map((u, idx) => [u.id, idx + 1]));
    for (let index = 0; index < nextUnits.length; index += 1) {
      if (nextUnits[index].blockId !== block.id) continue;
      const targetOrder = orderByUnitId.get(nextUnits[index].id);
      if (targetOrder && nextUnits[index].order !== targetOrder) {
        nextUnits[index] = { ...nextUnits[index], order: targetOrder };
      }
    }
  }

  materializedSet.add(block.id);
  return { createdCount, linkedCount };
};

/**
 * Pure, deterministic, idempotent backfill from v1 Cards/Segments into persistent v2 ContentUnits.
 * Preserves all existing Card/Segment/Speaker/Audio IDs, UIDs, text, metadata, and R3 empty-Card state.
 */
export const backfillTextContentUnits = (snapshotCandidate, options = {}) => {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const targetSchemaVersion = normalizeOrder(options.targetSchemaVersion, TEXT_LIBRARY_V2_SCHEMA_VERSION);
  const snapshot = snapshotCandidate && typeof snapshotCandidate === 'object' ? snapshotCandidate : {};

  const preValidation = validateTextContentUnitsState(snapshot, { requireMigrated: false });
  if (!preValidation.valid) {
    throw new Error(`Cannot backfill Content Units over corrupted state: ${preValidation.errors.join('; ')}`);
  }

  const documents = Array.isArray(snapshot.documents) ? [...snapshot.documents] : [];
  const blocks = Array.isArray(snapshot.blocks) ? [...snapshot.blocks] : [];
  const segments = Array.isArray(snapshot.segments) ? [...snapshot.segments] : [];
  const existingUnits = Array.isArray(snapshot.contentUnits) ? snapshot.contentUnits : [];
  const prevMigration = normalizeTextContentUnitMigrationState(snapshot.contentUnitMigration);

  const structuredDocs = new Set(
    documents.filter(doc => doc.editorModel === TEXT_STRUCTURED_EDITOR_MODEL).map(doc => doc.id)
  );
  const structuredBlockIds = new Set(
    blocks.filter(block => structuredDocs.has(block.documentId)).map(block => block.id)
  );
  const materializedSet = new Set(
    (prevMigration?.materializedBlockIds || []).filter(blockId => structuredBlockIds.has(blockId))
  );

  const seenUids = collectExistingGlobalUids(snapshot);
  let nextUnitSeq = floorContentUnitCounter(snapshot.counters, existingUnits);
  let uidBackfilledCount = 0;

  const nextUnits = existingUnits.map(unit => {
    const normalizedUid = normalizeTextGlobalUid(unit.uid, TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
    if (normalizedUid) return unit;
    uidBackfilledCount += 1;
    return { ...unit, uid: createUniqueContentUnitUid(seenUids) };
  });

  const allocateUnit = ({ documentId, blockId, kind, order, speakerId, speaker, createdAt, updatedAt, metadata }) => {
    nextUnitSeq += 1;
    return createTextContentUnitRecord({
      id: formatTextContentUnitId(nextUnitSeq),
      uid: createUniqueContentUnitUid(seenUids),
      documentId,
      blockId,
      kind,
      order,
      speakerId,
      speaker,
      createdAt,
      updatedAt,
      metadata
    });
  };

  const unitsByBlock = new Map();
  nextUnits.forEach(unit => {
    const list = unitsByBlock.get(unit.blockId) || [];
    list.push(unit);
    unitsByBlock.set(unit.blockId, list);
  });

  const segmentsByBlock = new Map();
  segments.forEach(segment => {
    const list = segmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    segmentsByBlock.set(segment.blockId, list);
  });

  const sortedStructuredBlocks = blocks
    .filter(block => structuredBlockIds.has(block.id))
    .sort((a, b) => String(a.documentId).localeCompare(String(b.documentId)) || (Number(a.order || 0) - Number(b.order || 0)) || String(a.id).localeCompare(String(b.id)));

  let createdUnitCount = 0;
  let linkedSegmentCount = 0;
  const updatedSegmentMap = new Map();

  sortedStructuredBlocks.forEach(block => {
    const existingBlockUnits = [...(unitsByBlock.get(block.id) || [])]
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
    const blockSegments = [...(segmentsByBlock.get(block.id) || [])]
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
    const normalizedBlockSegments = blockSegments.map((seg, idx) => {
      if (seg.order === idx + 1) return seg;
      const compacted = { ...seg, order: idx + 1 };
      updatedSegmentMap.set(seg.id, compacted);
      return compacted;
    });
    const counts = block.blockType === 'conversation'
      ? backfillUnitsForConversationBlock({
          block,
          blockSegments: normalizedBlockSegments,
          existingBlockUnits,
          materializedSet,
          allocateUnit,
          now,
          nextUnits,
          updatedSegmentMap
        })
      : backfillUnitsForParagraphBlock({
          block,
          blockSegments: normalizedBlockSegments,
          existingBlockUnits,
          materializedSet,
          allocateUnit,
          now,
          nextUnits,
          updatedSegmentMap
        });
    createdUnitCount += counts.createdCount;
    linkedSegmentCount += counts.linkedCount;
  });

  const nextSegments = updatedSegmentMap.size > 0
    ? segments.map(segment => updatedSegmentMap.get(segment.id) || segment)
    : segments;

  const sortedUnits = [...nextUnits].sort((a, b) => (
    Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id))
  ));
  const nextMaterializedBlockIds = [...materializedSet].sort();
  const prevMaterializedKey = JSON.stringify(prevMigration?.materializedBlockIds || []);
  const nextMaterializedKey = JSON.stringify(nextMaterializedBlockIds);

  const counterChanged = snapshot?.counters?.contentUnit === undefined || Number(snapshot.counters.contentUnit) !== nextUnitSeq;
  const changed = Boolean(
    Number(snapshot.schemaVersion || 1) !== targetSchemaVersion
    || !Array.isArray(snapshot.contentUnits)
    || createdUnitCount > 0
    || linkedSegmentCount > 0
    || uidBackfilledCount > 0
    || counterChanged
    || prevMigration?.phase !== 'complete'
    || prevMaterializedKey !== nextMaterializedKey
  );

  const completedAt = (!changed && prevMigration?.completedAt != null)
    ? prevMigration.completedAt
    : (prevMigration?.phase === 'complete' && !changed ? prevMigration.completedAt : now);

  const nextSnapshot = {
    ...snapshot,
    schemaVersion: targetSchemaVersion,
    counters: {
      ...(snapshot.counters || {}),
      contentUnit: nextUnitSeq
    },
    contentUnits: sortedUnits,
    segments: nextSegments,
    contentUnitMigration: {
      version: 1,
      phase: 'complete',
      materializedBlockIds: nextMaterializedBlockIds,
      completedAt
    }
  };

  const postValidation = validateTextContentUnitsState(nextSnapshot, { requireMigrated: true, checkCounterFloor: true });
  if (!postValidation.valid) {
    throw new Error(`Backfill produced invalid Content Unit state: ${postValidation.errors.join('; ')}`);
  }

  return {
    changed,
    createdUnitCount,
    linkedSegmentCount,
    uidBackfilledCount,
    snapshot: nextSnapshot
  };
};
