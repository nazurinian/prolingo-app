import { TEXT_LIBRARY_V2_SCHEMA_VERSION, TEXT_STRUCTURED_EDITOR_MODEL } from '../../constants/textDatabaseConstants.js';
import { normalizeTextLibraryRuntimeSnapshot, resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { inspectTextContentUnitMigrationState, TEXT_CONTENT_UNIT_MIGRATION_STATUS } from './textContentUnitDomain.js';
import { collectTextGlobalUidDiagnostics } from './textGlobalIdentityDomain.js';
import { applyTextLibraryCommand } from './textLibraryCommandDomain.js';
import { getTextStructuredSegmentSpeakerId, getTextStructuredSpeakerRegistry, TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY } from './textStructuredSpeakerIdentityDomain.js';

export const TEXT_CONVERSATION_EDITOR_VERSION = 1;

// Native commands, restricted to the fields supported by this editor contract.
export const TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS = Object.freeze(Object.fromEntries(Object.entries({
  'block.create': ['documentId', 'blockType', 'title', 'metadata'],
  'block.update': ['id', 'blockType', 'title', 'metadata'],
  'block.delete': ['id'],
  'block.reorder': ['documentId', 'orderedIds'],
  'contentUnit.create': ['blockId', 'kind', 'order', 'afterUnitId', 'speaker', 'speakerId', 'text', 'meaning', 'joinAfter', 'metadata'],
  'contentUnit.update': ['id', 'speaker', 'speakerId', 'resetSpeaker', 'metadata'],
  'contentUnit.delete': ['id'],
  'contentUnit.split': ['id', 'beforeSegmentId', 'afterSegmentId', 'splitAtIndex'],
  'contentUnit.merge': ['ids'],
  'contentUnit.reorder': ['blockId', 'orderedIds'],
  'contentUnit.reorderSegments': ['id', 'orderedIds'],
  'segment.create': ['blockId', 'unitId', 'text', 'meaning', 'joinAfter', 'metadata'],
  'segment.update': ['id', 'text', 'meaning', 'joinAfter', 'metadata'],
  'segment.delete': ['id'],
  'segment.move': ['segmentId', 'targetUnitId', 'beforeSegmentId', 'afterSegmentId', 'orderInUnit'],
  'conversationSegment.split': ['id', 'parts'],
  'conversationSegments.merge': ['ids'],
  'speaker.register': ['documentId', 'speakerId', 'label'],
  'speaker.rename': ['documentId', 'speakerId', 'label'],
  'speaker.remove': ['documentId', 'speakerId']
}).map(([type, fields]) => [type, Object.freeze(fields)])));

export class TextConversationEditorError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'TextConversationEditorError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => { throw new TextConversationEditorError(code, message, details); };

const requireEditorSnapshot = candidate => {
  let snapshot;
  try { snapshot = normalizeTextLibraryRuntimeSnapshot(candidate); }
  catch (error) { fail('INVALID_SNAPSHOT', error.message); }
  const inspection = inspectTextContentUnitMigrationState(snapshot);
  if (inspection.status === TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED) {
    fail('INVALID_SNAPSHOT', 'Content Unit state is corrupted', inspection.errors);
  }
  if (snapshot.schemaVersion !== TEXT_LIBRARY_V2_SCHEMA_VERSION || inspection.status !== TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2) {
    fail('MIGRATION_REQUIRED', 'Conversation editor requires a complete isolated v2 snapshot; no migration is performed');
  }
  const uids = collectTextGlobalUidDiagnostics(snapshot);
  if (!uids.valid) fail('INVALID_SNAPSHOT', 'Conversation editor requires intact global UIDs; no identity repair is performed', uids);
  return snapshot;
};

const requireWorkspace = (snapshot, documentId) => {
  const document = snapshot.documents.find(item => item.id === (documentId ?? snapshot.activeDocumentId));
  if (!document) fail('WORKSPACE_NOT_FOUND', 'Select an existing Conversation or Mixed Workspace');
  if (document.editorModel !== TEXT_STRUCTURED_EDITOR_MODEL || !['conversation', 'mixed'].includes(document.documentType)) {
    fail('UNSUPPORTED_WORKSPACE', 'Conversation editor supports structured Conversation and Mixed Workspaces only');
  }
  return document;
};

const projectEditorState = (snapshot, document) => {
  const tree = resolveTextLibraryDocumentTree(snapshot, document.id);
  const scenes = tree.blocks.filter(block => block.blockType === 'conversation').map(block => {
    const turns = block.units.map(({ segments, ...unit }) => ({ ...unit, sentences: segments, empty: segments.length === 0, sentenceCount: segments.length }));
    const { units: _units, segments: _segments, ...scene } = block;
    return { ...scene, turns, empty: turns.length === 0, turnCount: turns.length, sentenceCount: turns.reduce((sum, turn) => sum + turn.sentenceCount, 0) };
  });
  // Detached projection: editing a UI draft cannot mutate the authoritative snapshot's metadata.
  return structuredClone({
    version: TEXT_CONVERSATION_EDITOR_VERSION,
    workspace: { id: document.id, uid: document.uid, title: document.title, documentType: document.documentType,
      textLanguage: document.textLanguage, meaningLanguage: document.meaningLanguage },
    cardOrderIds: tree.blocks.map(block => block.id),
    speakerRegistry: getTextStructuredSpeakerRegistry(document),
    scenes,
    empty: scenes.length === 0,
    counts: { scenes: scenes.length, turns: scenes.reduce((sum, scene) => sum + scene.turnCount, 0), sentences: scenes.reduce((sum, scene) => sum + scene.sentenceCount, 0) }
  });
};

/** Pure selectors. Persist only command results, never this derived editor projection. */
export const selectTextConversationEditorState = (candidate, { documentId } = {}) => {
  const snapshot = requireEditorSnapshot(candidate);
  try { return projectEditorState(snapshot, requireWorkspace(snapshot, documentId)); }
  catch (error) {
    if (error instanceof TextConversationEditorError) throw error;
    fail('INVALID_SNAPSHOT', error.message);
  }
};
export const selectTextConversationScene = (state, blockId) => state?.scenes?.find(scene => scene.id === blockId) || null;
export const selectTextConversationTurn = (state, unitId) => state?.scenes?.flatMap(scene => scene.turns).find(turn => turn.id === unitId) || null;

const scopeCommand = (snapshot, document, command) => {
  const type = command?.type;
  const fields = Object.hasOwn(TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS, type) ? TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS[type] : null;
  const payload = command?.payload ?? {};
  if (!fields || !payload || typeof payload !== 'object' || Array.isArray(payload)) fail('INVALID_COMMAND', 'Unsupported editor command or payload');
  const unknown = Object.keys(payload).filter(key => !fields.includes(key));
  if (unknown.length) fail('INVALID_COMMAND', `Unsupported ${type} fields: ${unknown.join(', ')}`);
  if (payload.metadata !== undefined && (!payload.metadata || typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(payload.metadata)))) {
    fail('INVALID_COMMAND', 'metadata must be a plain object; use {} for explicit replacement');
  }
  const scene = id => {
    const block = snapshot.blocks.find(item => item.id === id);
    if (!block || block.documentId !== document.id || block.blockType !== 'conversation') fail('OUT_OF_SCOPE', `Scene Card ${id || '(missing)'} is outside this editor Workspace`);
    return block;
  };
  const turn = id => {
    const unit = snapshot.contentUnits.find(item => item.id === id);
    if (!unit || unit.kind !== 'turn') fail('OUT_OF_SCOPE', `Turn ${id || '(missing)'} is unavailable`);
    scene(unit.blockId);
    return unit;
  };
  const sentence = id => {
    const segment = snapshot.segments.find(item => item.id === id);
    if (!segment) fail('OUT_OF_SCOPE', `Sentence ${id || '(missing)'} is unavailable`);
    turn(segment.unitId);
    return segment;
  };
  if (type.startsWith('speaker.') || type === 'block.create' || type === 'block.reorder') {
    if (payload.documentId !== document.id) fail('OUT_OF_SCOPE', 'Command documentId must match the selected Workspace');
  } else if (type.startsWith('block.')) scene(payload.id);
  else if (type === 'contentUnit.create' || type === 'contentUnit.reorder') scene(payload.blockId);
  else if (type === 'contentUnit.merge') (payload.ids || []).forEach(turn);
  else if (type.startsWith('contentUnit.')) turn(payload.id);
  else if (type === 'segment.create') {
    const parent = turn(payload.unitId);
    if (payload.blockId !== parent.blockId) fail('OUT_OF_SCOPE', 'Sentence blockId must match its explicit Turn');
  } else if (type === 'segment.move') { sentence(payload.segmentId); turn(payload.targetUnitId); }
  else if (type === 'conversationSegments.merge') (payload.ids || []).forEach(sentence);
  else {
    const current = sentence(payload.id);
    if (type === 'segment.update' && payload.metadata && TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY in payload.metadata
      && payload.metadata[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY] !== getTextStructuredSegmentSpeakerId(current)) {
      fail('INVALID_COMMAND', 'Reassign speakers with contentUnit.update, not Sentence metadata');
    }
    if (type === 'conversationSegment.split' && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        if (!part || typeof part !== 'object' || Array.isArray(part)
          || Object.keys(part).some(key => !['text', 'meaning', 'joinAfter'].includes(key))) {
          fail('INVALID_COMMAND', 'Sentence split parts support text, meaning and joinAfter only');
        }
        if (String(current.meaning || '').trim() && part.meaning === undefined) {
          fail('INVALID_COMMAND', 'Provide explicit meaning parts when splitting a translated Sentence');
        }
      }
    }
  }
  if (payload.blockType !== undefined && payload.blockType !== 'conversation') fail('INVALID_COMMAND', 'Conversation editor cannot convert Cards to Paragraphs');
  if (type === 'contentUnit.create' && payload.kind !== undefined && payload.kind !== 'turn') fail('INVALID_COMMAND', 'Conversation editor can only create Turn Units');
  if (payload.speakerId && (payload.speaker === null || payload.speaker === '' || payload.resetSpeaker === true)) fail('INVALID_COMMAND', 'Speaker selection and reset cannot be combined');
  if (type === 'contentUnit.split') {
    const boundaries = ['beforeSegmentId', 'afterSegmentId', 'splitAtIndex'].filter(key => payload[key] !== undefined);
    if (boundaries.length !== 1) fail('INVALID_COMMAND', 'Turn split requires exactly one partition boundary');
  }
  return { type, payload: { ...payload, ...(type === 'block.create' ? { blockType: 'conversation' } : {}), ...(type === 'segment.delete' ? { preserveEmptyUnit: true } : {}) } };
};

/** Pure isolated editor reducer. No persistence, migration, audio I/O, or UI imports. */
export const applyTextConversationEditorCommand = (candidate, command, { documentId, now = Date.now() } = {}) => {
  const snapshot = requireEditorSnapshot(candidate);
  const document = requireWorkspace(snapshot, documentId);
  let outcome;
  try {
    outcome = applyTextLibraryCommand(snapshot, scopeCommand(snapshot, document, command), now);
  } catch (error) {
    if (error instanceof TextConversationEditorError) throw error;
    fail('COMMAND_REJECTED', error.message);
  }
  return { ...outcome, state: selectTextConversationEditorState(outcome.snapshot, { documentId: document.id }) };
};
