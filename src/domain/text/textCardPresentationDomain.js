import { normalizeTextLibraryRuntimeSnapshot, resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { inspectTextContentUnitMigrationState, TEXT_CONTENT_UNIT_MIGRATION_STATUS } from './textContentUnitDomain.js';
import { collectTextGlobalUidDiagnostics } from './textGlobalIdentityDomain.js';
import { buildVirtualParagraphUnitKey } from './textContentUnitAdapterDomain.js';
import { resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import { getTextStructuredSegmentSpeakerId, getTextStructuredSpeakerRegistry } from './textStructuredSpeakerIdentityDomain.js';
import { TEXT_LIBRARY_V2_SCHEMA_VERSION } from '../../constants/textDatabaseConstants.js';

export class TextCardPresentationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TextCardPresentationError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new TextCardPresentationError(code, message); };
const displayFields = record => {
  if (Object.values(record).some(value => value !== null && (typeof value === 'object' || typeof value === 'function'))) {
    fail('INVALID_SNAPSHOT', 'Display fields must be scalar values');
  }
  return record;
};
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/**
 * Detached, frozen display records from the existing validated/hydrated tree.
 * Snapshot context is required: a tree alone cannot prove migration completion.
 * This selector never allocates identities, migrates, repairs or persists data.
 */
export const selectTextCardPresentation = (candidate, { documentId } = {}) => {
  let snapshot;
  try { snapshot = normalizeTextLibraryRuntimeSnapshot(candidate); }
  catch (error) { fail('INVALID_SNAPSHOT', error.message); }
  const inspection = inspectTextContentUnitMigrationState(snapshot);
  if (inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED) fail('INVALID_SNAPSHOT', inspection.errors.join('; '));
  if (inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE) fail('MIGRATION_REQUIRED', 'Presentation requires complete Content Unit state; no migration is performed');
  const persistent = inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2;
  if (persistent && snapshot.schemaVersion !== TEXT_LIBRARY_V2_SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA', 'Unsupported presentation snapshot schema');
  if (persistent && !collectTextGlobalUidDiagnostics(snapshot).valid) fail('INVALID_SNAPSHOT', 'Persistent presentation requires intact global UIDs');

  const tree = resolveTextLibraryDocumentTree(snapshot, documentId);
  if (!tree) fail('WORKSPACE_NOT_FOUND', 'Select an existing Workspace');
  if (tree.editorModel !== 'structured-v1') fail('UNSUPPORTED_WORKSPACE', 'Legacy presentation remains isolated');
  if (!persistent && (tree.documentType === 'conversation' || tree.blocks.some(block => block.blockType === 'conversation'))) {
    fail('PERSISTENT_UNITS_REQUIRED', 'Authored Conversation Turns require persistent Content Units');
  }

  const cardById = Object.create(null);
  const unitById = Object.create(null);
  const segmentById = Object.create(null);
  const locationBySegmentId = Object.create(null);
  const speakers = new Map(getTextStructuredSpeakerRegistry(tree).map(speaker => [speaker.id, speaker]));
  const cards = tree.blocks.map(block => {
    const sourceUnits = persistent ? block.units : [{ id: null, uid: null, kind: 'paragraph', order: 1, segments: block.segments }];
    const units = sourceUnits.map(unit => {
      const viewKey = persistent ? `unit:${unit.uid}` : buildVirtualParagraphUnitKey(block.id);
      const segments = unit.segments.map(segment => {
        const projected = displayFields({
          id: segment.id, uid: segment.uid ?? null, unitId: segment.unitId ?? null,
          order: segment.order, text: segment.text, meaning: segment.meaning, joinAfter: segment.joinAfter,
          speakerId: getTextStructuredSegmentSpeakerId(segment), speaker: segment.speaker ?? null
        });
        segmentById[segment.id] = projected;
        locationBySegmentId[segment.id] = { cardId: block.id, unitId: unit.id, unitViewKey: viewKey };
        return projected;
      });
      const projected = {
        ...displayFields({ viewKey, id: unit.id, uid: unit.uid ?? null,
        identitySource: persistent ? 'persistent' : 'v1-paragraph-compat',
        kind: unit.kind, label: unit.kind === 'turn' ? 'Speaker Turn' : 'Section', order: unit.order,
        speakerId: unit.speakerId ?? null, speakerUid: speakers.get(unit.speakerId)?.uid ?? null, speakerLabel: unit.speaker ?? null }), segments
      };
      if (unit.id) unitById[unit.id] = projected;
      return projected;
    });
    const card = {
      ...displayFields({ id: block.id, uid: block.uid ?? null, documentId: block.documentId, order: block.order,
      blockType: block.blockType, title: block.title,
      paragraphRole: block.blockType === 'paragraph' ? resolveTextParagraphCardRole(block) : null }), units
    };
    cardById[block.id] = card;
    return card;
  });
  return freeze({
    workspace: displayFields({ id: tree.id, uid: tree.uid ?? null, collectionId: tree.collectionId ?? null,
      title: tree.title, documentType: tree.documentType, textLanguage: tree.textLanguage, meaningLanguage: tree.meaningLanguage }),
    cards, cardById, unitById, segmentById, locationBySegmentId
  });
};
