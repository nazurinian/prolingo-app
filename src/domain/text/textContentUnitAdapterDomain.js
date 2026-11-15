import {
  TEXT_BLOCK_TYPES,
  TEXT_DOCUMENT_TYPES,
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import { resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import {
  getTextStructuredSegmentSpeakerId,
  getTextStructuredSpeakerRegistry
} from './textStructuredSpeakerIdentityDomain.js';
import {
  TEXT_WORKSPACE_TYPES,
  resolveTextWorkspaceType
} from './textWorkspaceTaxonomyDomain.js';

export const TEXT_CONTENT_UNIT_ADAPTER_VERSION = 'p12d-virtual-content-unit-v1';
export const TEXT_VIRTUAL_KEY_PREFIX = 'virtual:';

export const TEXT_CONTENT_UNIT_PROJECTION_STATUS = Object.freeze({
  PROJECTED: 'projected',
  UNSUPPORTED_LEGACY: 'unsupported-legacy',
  UNSUPPORTED_EDITOR_MODEL: 'unsupported-editor-model'
});

export const TEXT_VIRTUAL_CONTENT_UNIT_KINDS = Object.freeze({
  PARAGRAPH: 'paragraph',
  TURN: 'turn'
});

/**
 * Explicit error thrown when a document tree violates Gate D2 virtual projection invariants.
 */
export class TextContentUnitAdapterError extends Error {
  constructor(message, code = 'INVALID_DOCUMENT_TREE', diagnostics = []) {
    super(message);
    this.name = 'TextContentUnitAdapterError';
    this.code = code;
    this.diagnostics = Array.isArray(diagnostics) ? diagnostics.map(item => ({ ...item })) : [];
  }
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanString = value => (typeof value === 'string' ? value.trim() : '');
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

const assertValidKeySegment = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TextContentUnitAdapterError(
      `Virtual Content Unit key requires a non-empty string ${label}.`,
      'INVALID_VIRTUAL_KEY_COMPONENT',
      [{ code: 'INVALID_VIRTUAL_KEY_COMPONENT', message: `Missing or empty ${label}`, path: label }]
    );
  }
  return value;
};

/**
 * Builds a non-persisted deterministic virtual key for a Card projection.
 */
export const buildVirtualCardKey = blockId => `${TEXT_VIRTUAL_KEY_PREFIX}card:${assertValidKeySegment(blockId, 'blockId')}`;

/**
 * Builds a non-persisted deterministic virtual key for a Paragraph Unit projection.
 */
export const buildVirtualParagraphUnitKey = blockId => `${TEXT_VIRTUAL_KEY_PREFIX}paragraph:${assertValidKeySegment(blockId, 'blockId')}`;

/**
 * Builds a non-persisted deterministic virtual key for a Conversation Turn Unit projection.
 */
export const buildVirtualTurnUnitKey = (blockId, segmentId) => (
  `${TEXT_VIRTUAL_KEY_PREFIX}turn:${assertValidKeySegment(blockId, 'blockId')}:${assertValidKeySegment(segmentId, 'segmentId')}`
);

const isHydratedOrderAscending = (previous, current) => {
  if (previous.order !== current.order) return previous.order < current.order;
  return String(previous.id).localeCompare(String(current.id)) <= 0;
};

const addDiagnostic = (diagnostics, code, message, path) => {
  diagnostics.push({ code, message, path });
};

const inspectSegments = ({
  segments,
  documentId,
  blockId,
  blockIndex,
  seenSegmentIds,
  diagnostics
}) => {
  if (!Array.isArray(segments)) {
    addDiagnostic(
      diagnostics,
      'INVALID_BLOCK_SEGMENTS',
      `Block "${blockId}" segments must be an array.`,
      `documentTree.blocks[${blockIndex}].segments`
    );
    return;
  }

  let previousSegment = null;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const segmentPath = `documentTree.blocks[${blockIndex}].segments[${segmentIndex}]`;

    if (!isPlainObject(segment)) {
      addDiagnostic(diagnostics, 'INVALID_SEGMENT_RECORD', 'Segment entry must be an object.', segmentPath);
      continue;
    }

    const segmentId = cleanString(segment.id);
    if (!segmentId) {
      addDiagnostic(diagnostics, 'MISSING_SEGMENT_ID', 'Segment entry requires a non-empty string id.', `${segmentPath}.id`);
    } else if (seenSegmentIds.has(segment.id)) {
      addDiagnostic(
        diagnostics,
        'DUPLICATE_SEGMENT_ID',
        `Duplicate Segment identity "${segment.id}" detected in document tree.`,
        `${segmentPath}.id`
      );
    } else {
      seenSegmentIds.add(segment.id);
    }

    if (cleanString(segment.documentId) !== documentId) {
      addDiagnostic(
        diagnostics,
        'SEGMENT_DOCUMENT_MISMATCH',
        `Segment "${segment.id || segmentIndex}" documentId does not match parent document "${documentId}".`,
        `${segmentPath}.documentId`
      );
    }

    if (cleanString(segment.blockId) !== blockId) {
      addDiagnostic(
        diagnostics,
        'SEGMENT_BLOCK_MISMATCH',
        `Segment "${segment.id || segmentIndex}" blockId does not match parent block "${blockId}".`,
        `${segmentPath}.blockId`
      );
    }

    if (!isFiniteNumber(segment.order)) {
      addDiagnostic(
        diagnostics,
        'INVALID_SEGMENT_ORDER',
        `Segment "${segment.id || segmentIndex}" requires a finite numeric order.`,
        `${segmentPath}.order`
      );
    } else if (previousSegment && !isHydratedOrderAscending(previousSegment, segment)) {
      addDiagnostic(
        diagnostics,
        'UNSORTED_SEGMENTS',
        `Segment "${segment.id || segmentIndex}" violates hydrated (order, id) ordering precondition in block "${blockId}".`,
        `${segmentPath}.order`
      );
    }

    if (segmentId && isFiniteNumber(segment.order)) {
      previousSegment = segment;
    }
  }
};

const inspectStructuredBlocks = ({ documentTree, diagnostics }) => {
  if (!Array.isArray(documentTree.blocks)) {
    addDiagnostic(
      diagnostics,
      'INVALID_BLOCKS_COLLECTION',
      'Structured document tree requires blocks to be an array.',
      'documentTree.blocks'
    );
    return;
  }

  const seenBlockIds = new Set();
  const seenSegmentIds = new Set();
  let previousBlock = null;

  for (let blockIndex = 0; blockIndex < documentTree.blocks.length; blockIndex += 1) {
    const block = documentTree.blocks[blockIndex];
    const blockPath = `documentTree.blocks[${blockIndex}]`;

    if (!isPlainObject(block)) {
      addDiagnostic(diagnostics, 'INVALID_BLOCK_RECORD', 'Block entry must be an object.', blockPath);
      continue;
    }

    const blockId = cleanString(block.id);
    if (!blockId) {
      addDiagnostic(diagnostics, 'MISSING_BLOCK_ID', 'Block entry requires a non-empty string id.', `${blockPath}.id`);
    } else if (seenBlockIds.has(block.id)) {
      addDiagnostic(
        diagnostics,
        'DUPLICATE_BLOCK_ID',
        `Duplicate Block identity "${block.id}" detected in document tree.`,
        `${blockPath}.id`
      );
    } else {
      seenBlockIds.add(block.id);
    }

    if (cleanString(block.documentId) !== cleanString(documentTree.id)) {
      addDiagnostic(
        diagnostics,
        'BLOCK_PARENT_MISMATCH',
        `Block "${block.id || blockIndex}" documentId does not match parent document "${documentTree.id}".`,
        `${blockPath}.documentId`
      );
    }

    if (!TEXT_BLOCK_TYPES.includes(block.blockType)) {
      addDiagnostic(
        diagnostics,
        'UNKNOWN_BLOCK_TYPE',
        `Block "${block.id || blockIndex}" has unsupported blockType "${String(block.blockType ?? '')}".`,
        `${blockPath}.blockType`
      );
    } else if (
      (documentTree.documentType === 'paragraph' && block.blockType !== 'paragraph')
      || (documentTree.documentType === 'conversation' && block.blockType !== 'conversation')
    ) {
      addDiagnostic(
        diagnostics,
        'BLOCK_TYPE_MISMATCH',
        `Block "${block.id || blockIndex}" blockType "${block.blockType}" is incompatible with documentType "${documentTree.documentType}".`,
        `${blockPath}.blockType`
      );
    }

    if (!isFiniteNumber(block.order)) {
      addDiagnostic(
        diagnostics,
        'INVALID_BLOCK_ORDER',
        `Block "${block.id || blockIndex}" requires a finite numeric order.`,
        `${blockPath}.order`
      );
    } else if (previousBlock && !isHydratedOrderAscending(previousBlock, block)) {
      addDiagnostic(
        diagnostics,
        'UNSORTED_BLOCKS',
        `Block "${block.id || blockIndex}" violates hydrated (order, id) ordering precondition.`,
        `${blockPath}.order`
      );
    }

    if (blockId && isFiniteNumber(block.order)) {
      previousBlock = block;
    }

    inspectSegments({
      segments: block.segments,
      documentId: cleanString(documentTree.id),
      blockId: block.id,
      blockIndex,
      seenSegmentIds,
      diagnostics
    });
  }
};

const inspectDocumentTree = documentTree => {
  const diagnostics = [];

  if (!isPlainObject(documentTree)) {
    addDiagnostic(diagnostics, 'INVALID_DOCUMENT_TREE', 'Expected hydrated documentTree object.', 'documentTree');
    return {
      valid: false,
      projectable: false,
      status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_EDITOR_MODEL,
      workspaceType: null,
      diagnostics
    };
  }

  if (!cleanString(documentTree.id)) {
    addDiagnostic(diagnostics, 'MISSING_DOCUMENT_ID', 'Document tree requires a non-empty string id.', 'documentTree.id');
  }

  const editorModel = typeof documentTree.editorModel === 'string' ? documentTree.editorModel.trim() : '';
  if (!editorModel) {
    addDiagnostic(
      diagnostics,
      'MISSING_EDITOR_MODEL',
      'Document tree requires a non-empty editorModel.',
      'documentTree.editorModel'
    );
    return {
      valid: false,
      projectable: false,
      status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_EDITOR_MODEL,
      workspaceType: null,
      diagnostics
    };
  }

  // Gate strictly by editorModel first so Legacy workspaces with documentType === 'mixed' never enter Structured Mixed.
  const workspaceType = resolveTextWorkspaceType(documentTree);
  if (editorModel === TEXT_LEGACY_EDITOR_MODEL) {
    return {
      valid: diagnostics.length === 0,
      projectable: false,
      status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_LEGACY,
      workspaceType: workspaceType || TEXT_WORKSPACE_TYPES.LEGACY,
      diagnostics
    };
  }

  if (editorModel !== TEXT_STRUCTURED_EDITOR_MODEL) {
    addDiagnostic(
      diagnostics,
      'UNSUPPORTED_EDITOR_MODEL',
      `Editor model "${editorModel}" is unsupported by the virtual Content Unit adapter.`,
      'documentTree.editorModel'
    );
    return {
      valid: diagnostics.length === 1 && Boolean(cleanString(documentTree.id)),
      projectable: false,
      status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_EDITOR_MODEL,
      workspaceType: null,
      diagnostics
    };
  }

  if (!TEXT_DOCUMENT_TYPES.includes(documentTree.documentType)) {
    addDiagnostic(
      diagnostics,
      'INVALID_DOCUMENT_TYPE',
      `Structured document requires valid documentType; received "${String(documentTree.documentType ?? '')}".`,
      'documentTree.documentType'
    );
  }

  if (diagnostics.length === 0) {
    inspectStructuredBlocks({ documentTree, diagnostics });
  }

  return {
    valid: diagnostics.length === 0,
    projectable: diagnostics.length === 0,
    status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.PROJECTED,
    workspaceType,
    diagnostics
  };
};

/**
 * Validates a hydrated document tree without mutating data or throwing.
 */
export const validateTextDocumentTreeForVirtualContentUnits = documentTree => inspectDocumentTree(documentTree);

const buildSpeakerRegistrySnapshot = documentTree => (
  getTextStructuredSpeakerRegistry(documentTree).map(entry => ({ ...entry }))
);

const projectParagraphUnits = ({ block, blockIndex, seenVirtualUnitKeys }) => {
  const virtualUnitKey = buildVirtualParagraphUnitKey(block.id);
  if (seenVirtualUnitKeys.has(virtualUnitKey)) {
    throw new TextContentUnitAdapterError(
      `Duplicate virtual unit key "${virtualUnitKey}" generated during projection.`,
      'DUPLICATE_VIRTUAL_UNIT_KEY',
      [{ code: 'DUPLICATE_VIRTUAL_UNIT_KEY', message: virtualUnitKey, path: `documentTree.blocks[${blockIndex}]` }]
    );
  }
  seenVirtualUnitKeys.add(virtualUnitKey);

  const paragraphRole = resolveTextParagraphCardRole(block);
  // New array of shared read-only Segment references from documentTree; callers must never mutate Segment objects.
  const segments = [...block.segments];
  return [{
    virtualUnitKey,
    unitKind: TEXT_VIRTUAL_CONTENT_UNIT_KINDS.PARAGRAPH,
    unitId: null,
    unitUid: null,
    unitOrder: 1,
    cardId: block.id,
    blockId: block.id,
    blockIndex,
    cardType: block.blockType,
    paragraphRole,
    speakerId: null,
    speakerLabel: null,
    speakerRegistryEntry: null,
    empty: segments.length === 0,
    segmentCount: segments.length,
    segmentIds: segments.map(segment => segment.id),
    segments
  }];
};

const projectConversationUnits = ({ block, blockIndex, speakerById, seenVirtualUnitKeys }) => (
  block.segments.map((segment, segmentIndex) => {
    const virtualUnitKey = buildVirtualTurnUnitKey(block.id, segment.id);
    if (seenVirtualUnitKeys.has(virtualUnitKey)) {
      throw new TextContentUnitAdapterError(
        `Duplicate virtual unit key "${virtualUnitKey}" generated during projection.`,
        'DUPLICATE_VIRTUAL_UNIT_KEY',
        [{
          code: 'DUPLICATE_VIRTUAL_UNIT_KEY',
          message: virtualUnitKey,
          path: `documentTree.blocks[${blockIndex}].segments[${segmentIndex}]`
        }]
      );
    }
    seenVirtualUnitKeys.add(virtualUnitKey);

    // Copy speakerIdentityV1 only when already present; never derive or generate missing IDs.
    const speakerId = getTextStructuredSegmentSpeakerId(segment);
    const matchedEntry = speakerId ? (speakerById.get(speakerId) || null) : null;

    return {
      virtualUnitKey,
      unitKind: TEXT_VIRTUAL_CONTENT_UNIT_KINDS.TURN,
      unitId: null,
      unitUid: null,
      unitOrder: segmentIndex + 1,
      cardId: block.id,
      blockId: block.id,
      blockIndex,
      segmentIndex,
      cardType: block.blockType,
      paragraphRole: null,
      segmentId: segment.id,
      segmentUid: segment.uid ?? null,
      speakerId,
      speakerLabel: segment.speaker ?? null,
      speakerRegistryEntry: matchedEntry ? { ...matchedEntry } : null,
      empty: false,
      segmentCount: 1,
      segmentIds: [segment.id],
      // Shared read-only Segment reference from documentTree; callers must never mutate Segment objects.
      segments: [segment]
    };
  })
);

const buildUnsupportedProjection = ({ documentTree, inspection }) => ({
  adapterVersion: TEXT_CONTENT_UNIT_ADAPTER_VERSION,
  projectionOnly: true,
  persisted: false,
  supported: false,
  status: inspection.status,
  workspaceType: inspection.workspaceType,
  editorModel: documentTree.editorModel,
  documentId: documentTree.id,
  documentUid: documentTree.uid ?? null,
  documentTitle: documentTree.title ?? null,
  documentType: documentTree.documentType ?? null,
  textLanguage: documentTree.textLanguage ?? null,
  meaningLanguage: documentTree.meaningLanguage ?? null,
  speakerRegistry: [],
  cards: [],
  unitCount: 0,
  segmentCount: 0,
  virtualKeys: [],
  diagnostics: inspection.diagnostics.map(item => ({ ...item }))
});

/**
 * Pure, read-only compatibility adapter projecting a hydrated structured-v1 document tree
 * into ephemeral virtual Card -> Content Unit -> Segment containers without mutating inputs
 * or allocating persisted UNIT_/UNITUID_/SPK_ records.
 *
 * Read-only ownership note: container arrays and projection objects are freshly allocated, while
 * projected `Segment` objects inside `cards[].units[].segments[]` (as well as `card.metadata` and
 * `card.fullAudioArtifacts`) are shared references with the source `documentTree` and MUST be
 * treated as strictly read-only by callers.
 */
export const projectTextDocumentToVirtualContentUnits = documentTree => {
  const inspection = inspectDocumentTree(documentTree);
  if (!inspection.valid) {
    const primary = inspection.diagnostics[0] || {
      code: 'INVALID_DOCUMENT_TREE',
      message: 'Malformed document tree supplied to virtual Content Unit adapter.'
    };
    throw new TextContentUnitAdapterError(primary.message, primary.code, inspection.diagnostics);
  }

  if (!inspection.projectable) {
    return buildUnsupportedProjection({ documentTree, inspection });
  }

  const speakerRegistry = buildSpeakerRegistrySnapshot(documentTree);
  const speakerById = new Map(speakerRegistry.map(entry => [entry.id, entry]));
  const seenVirtualUnitKeys = new Set();
  const virtualKeys = [];
  let unitCount = 0;
  let segmentCount = 0;

  const cards = documentTree.blocks.map((block, blockIndex) => {
    const virtualCardKey = buildVirtualCardKey(block.id);
    const paragraphRole = block.blockType === 'paragraph' ? resolveTextParagraphCardRole(block) : null;
    const units = block.blockType === 'paragraph'
      ? projectParagraphUnits({ block, blockIndex, seenVirtualUnitKeys })
      : projectConversationUnits({ block, blockIndex, speakerById, seenVirtualUnitKeys });

    units.forEach(unit => virtualKeys.push(unit.virtualUnitKey));
    unitCount += units.length;
    segmentCount += block.segments.length;

    return {
      virtualCardKey,
      cardId: block.id,
      cardUid: block.uid ?? null,
      blockId: block.id,
      blockIndex,
      order: block.order,
      cardType: block.blockType,
      blockType: block.blockType,
      // Never promote Paragraph TITLE segment text into card.title metadata.
      title: block.title ?? null,
      paragraphRole,
      documentId: block.documentId,
      createdAt: block.createdAt ?? null,
      updatedAt: block.updatedAt ?? null,
      metadata: block.metadata ?? null,
      fullAudioArtifacts: block.metadata?.fullAudioArtifactsV1 ?? null,
      segmentCount: block.segments.length,
      unitCount: units.length,
      units
    };
  });

  return {
    adapterVersion: TEXT_CONTENT_UNIT_ADAPTER_VERSION,
    projectionOnly: true,
    persisted: false,
    supported: true,
    status: TEXT_CONTENT_UNIT_PROJECTION_STATUS.PROJECTED,
    workspaceType: inspection.workspaceType,
    editorModel: documentTree.editorModel,
    documentId: documentTree.id,
    documentUid: documentTree.uid ?? null,
    documentTitle: documentTree.title ?? null,
    documentType: documentTree.documentType,
    textLanguage: documentTree.textLanguage ?? null,
    meaningLanguage: documentTree.meaningLanguage ?? null,
    speakerRegistry,
    cards,
    unitCount,
    segmentCount,
    virtualKeys,
    diagnostics: []
  };
};

/**
 * Flattens a supported virtual Content Unit projection back into an ordered Segment traversal
 * matching the hydrated documentTree.blocks[].segments[] order.
 * Each emitted `item.segment` shares the read-only source reference and must not be mutated.
 */
export const flattenVirtualContentUnitProjection = (projection, { playableOnly = false } = {}) => {
  if (!projection || !projection.supported || !Array.isArray(projection.cards)) {
    return [];
  }

  let displaySequence = 0;
  const flattened = [];

  projection.cards.forEach(card => {
    const units = Array.isArray(card?.units) ? card.units : [];
    let cardSegmentIndex = 0;

    units.forEach(unit => {
      const segments = Array.isArray(unit?.segments) ? unit.segments : [];
      segments.forEach(segment => {
        displaySequence += 1;
        const segmentIndex = cardSegmentIndex;
        cardSegmentIndex += 1;

        const trimmedText = cleanString(segment?.text);
        if (playableOnly && !trimmedText) return;

        flattened.push({
          id: segment.id,
          segmentId: segment.id,
          segmentUid: segment.uid ?? null,
          cardId: card.cardId,
          blockId: card.blockId,
          virtualCardKey: card.virtualCardKey,
          virtualUnitKey: unit.virtualUnitKey,
          unitKind: unit.unitKind,
          unitOrder: unit.unitOrder,
          documentId: projection.documentId,
          documentTitle: projection.documentTitle,
          documentType: projection.documentType,
          textLanguage: projection.textLanguage,
          meaningLanguage: projection.meaningLanguage,
          blockTitle: card.title,
          blockType: card.blockType,
          paragraphRole: card.paragraphRole,
          speaker: segment.speaker ?? null,
          speakerId: getTextStructuredSegmentSpeakerId(segment),
          speakerRegistryEntry: unit.unitKind === TEXT_VIRTUAL_CONTENT_UNIT_KINDS.TURN
            ? (unit.speakerRegistryEntry ? { ...unit.speakerRegistryEntry } : null)
            : null,
          text: segment.text,
          meaning: segment.meaning,
          normalizedText: trimmedText,
          normalizedMeaning: cleanString(segment?.meaning),
          joinAfter: segment.joinAfter ?? null,
          order: segment.order,
          displayId: displaySequence,
          blockIndex: card.blockIndex,
          segmentIndex,
          blockSegmentCount: card.segmentCount,
          segment
        });
      });
    });
  });

  return flattened;
};

/**
 * Pure read-only From-Here slice helper over a virtual projection for D2 equivalence tests.
 * Mirrors `resolveStructuredTextPlaybackScopeList(..., FROM_HERE)`: missing or unknown
 * `startSegmentId` falls back to index 0 (workspace start); any supplied `blockId` is ignored
 * in FROM_HERE scope. Returned `item.segment` references remain shared read-only source objects.
 */
export const sliceVirtualContentUnitProjectionFromHere = (
  projection,
  { startSegmentId = null, cursorSegmentId = null } = {}
) => {
  const fullList = flattenVirtualContentUnitProjection(projection, { playableOnly: true });
  if (!fullList.length) {
    return { fullList, playbackList: [], startIndex: -1 };
  }

  const cursorId = cursorSegmentId || startSegmentId || null;
  const requestedIndex = startSegmentId
    ? fullList.findIndex(item => item.segmentId === startSegmentId)
    : 0;
  const safeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const playbackList = fullList.slice(safeIndex);
  const cursorIndex = cursorId ? playbackList.findIndex(item => item.segmentId === cursorId) : 0;
  return {
    fullList,
    playbackList,
    startIndex: playbackList.length ? (cursorIndex >= 0 ? cursorIndex : 0) : -1
  };
};
