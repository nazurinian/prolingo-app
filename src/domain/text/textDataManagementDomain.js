import { normalizeTextLibraryRuntimeSnapshot, resolveTextLibraryCatalog, resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { inspectTextContentUnitMigrationState } from './textContentUnitDomain.js';
import { collectTextGlobalUidDiagnostics } from './textGlobalIdentityDomain.js';
import { selectTextCardPresentation } from './textCardPresentationDomain.js';
import { getTextStructuredSpeakerRegistry } from './textStructuredSpeakerIdentityDomain.js';
import { TEXT_MIXED_EDITOR_COMMAND_FIELDS, scopeTextStructuredEditorCommand } from './textMixedEditorDomain.js';
import { applyTextLibraryCommand } from './textLibraryCommandDomain.js';
import { canonicalJsonStringify } from './textCanonicalFingerprintDomain.js';
import { buildTextStructuredAudioCoverageMap } from './textStructuredAudioCoverageDomain.js';

export class TextDataManagementError extends Error {
  constructor(code, message) { super(message); this.name = 'TextDataManagementError'; this.code = code; }
}
const fail = (code, message) => { throw new TextDataManagementError(code, message); };
export const freezeTextManagementView = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTextManagementView); Object.freeze(value);
  }
  return value;
};
const catalogFields = {
  'collection.create': ['title', 'metadata'], 'collection.update': ['id', 'title', 'metadata'],
  'collection.delete': ['id'], 'collection.reorder': ['orderedIds'],
  'document.create': ['collectionId', 'title', 'documentType', 'textLanguage', 'meaningLanguage', 'metadata'],
  'document.update': ['id', 'title', 'collectionId', 'textLanguage', 'meaningLanguage', 'metadata'],
  'document.delete': ['id'], 'document.reorder': ['collectionId', 'orderedIds']
};
export const TEXT_DATA_MANAGEMENT_COMMAND_FIELDS = freezeTextManagementView({
  ...catalogFields, ...TEXT_MIXED_EDITOR_COMMAND_FIELDS, 'segment.reorder': ['blockId', 'orderedIds']
});
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const supported = (snapshot, doc) => doc?.editorModel === 'structured-v1'
  && ['paragraph', 'conversation', 'mixed'].includes(doc.documentType)
  && (snapshot.schemaVersion === 2 || doc.documentType === 'paragraph');

/** Read boundary only. Never migrate, repair, backfill, open a DB, or freeze caller objects. */
export const validateTextManagementSnapshot = candidate => {
  try {
    if (![1, 2].includes(candidate?.schemaVersion)) fail('UNSUPPORTED_SCHEMA', 'Only explicit schema 1 or complete schema 2 snapshots are supported');
    if (!['collections', 'documents', 'blocks', 'segments', 'audioVariants'].every(k => Array.isArray(candidate[k]))) {
      fail('INVALID_SNAPSHOT', 'A complete library snapshot is required');
    }
    const inspection = inspectTextContentUnitMigrationState(candidate);
    if (inspection.status === 'partial-upgrade') fail('MIGRATION_REQUIRED', 'Incomplete Content Unit upgrade; no automatic migration or repair');
    if (inspection.status === 'corrupted') fail('INVALID_SNAPSHOT', inspection.errors.join('; '));
    const snapshot = normalizeTextLibraryRuntimeSnapshot(structuredClone(candidate));
    if (snapshot.schemaVersion === 2 && (inspection.status !== 'migrated-v2' || !collectTextGlobalUidDiagnostics(snapshot).valid)) {
      fail('INVALID_SNAPSHOT', 'Persistent snapshots require complete Units and unique global UIDs');
    }
    return snapshot;
  } catch (error) {
    if (error instanceof TextDataManagementError) throw error;
    fail('INVALID_SNAPSHOT', error.message);
  }
};

export const resolveTextManagementSelection = (snapshot, selection = {}) => {
  if (!plain(selection) || Object.keys(selection).some(k => !['collectionId', 'workspaceId', 'cardId', 'unitId', 'segmentId'].includes(k))) fail('INVALID_SELECTION', 'Unknown navigation fields');
  const next = { ...selection };
  let doc;
  if (next.workspaceId) {
    doc = snapshot.documents.find(d => d.id === next.workspaceId);
    if (!doc) fail('OUT_OF_SCOPE', 'Workspace does not exist');
    if (next.collectionId !== undefined && next.collectionId !== doc.collectionId) fail('OUT_OF_SCOPE', 'Workspace is outside the selected Collection');
    next.collectionId = doc.collectionId;
  }
  if (next.collectionId != null && !snapshot.collections.some(c => c.id === next.collectionId)) fail('OUT_OF_SCOPE', 'Collection does not exist');
  if ((next.cardId || next.unitId || next.segmentId) && !doc) fail('OUT_OF_SCOPE', 'Select the parent Workspace first');
  const card = next.cardId && snapshot.blocks.find(c => c.id === next.cardId && c.documentId === doc.id);
  if (next.cardId && !card) fail('OUT_OF_SCOPE', 'Card is outside the selected Workspace');
  const unit = next.unitId && snapshot.contentUnits?.find(u => u.id === next.unitId && u.documentId === doc.id && (!card || u.blockId === card.id));
  if (next.unitId && !unit) fail('OUT_OF_SCOPE', 'Select a persistent Unit in this Workspace');
  const segment = next.segmentId && snapshot.segments.find(s => s.id === next.segmentId && s.documentId === doc.id
    && (!card || s.blockId === card.id) && (!unit || s.unitId === unit.id));
  if (next.segmentId && !segment) fail('OUT_OF_SCOPE', 'Segment is outside the selected parent');
  if (segment) { next.cardId = segment.blockId; if (segment.unitId) next.unitId = segment.unitId; }
  else if (unit) next.cardId = unit.blockId;
  return next;
};

export const getTextManagementCommandCapabilities = (snapshot, selection, { boundary = 'read-only', permissions = [] } = {}) => {
  const doc = snapshot.documents.find(d => d.id === selection.workspaceId);
  return Object.fromEntries(Object.keys(TEXT_DATA_MANAGEMENT_COMMAND_FIELDS).map(type => {
    const group = type.startsWith('collection.') || type.startsWith('document.') ? 'catalog' : 'content';
    let reason = boundary !== 'disposable' ? 'READ_ONLY' : !permissions.includes(group) ? 'PERMISSION_DENIED' : null;
    if (!reason && !snapshot.initialized) reason = 'UNINITIALIZED';
    if (!reason && group === 'content' && !supported(snapshot, doc)) reason = doc ? 'UNSUPPORTED_WORKSPACE' : 'SELECT_WORKSPACE';
    if (!reason && group === 'content' && snapshot.schemaVersion === 1
      && (type.startsWith('contentUnit.') || type === 'segment.move' || type.startsWith('conversation') || type.startsWith('speaker.'))) reason = 'PERSISTENT_UNITS_REQUIRED';
    if (!reason && group === 'content' && snapshot.schemaVersion === 2 && type === 'segment.reorder') reason = 'USE_UNIT_SEGMENT_ORDER';
    if (!reason && group === 'catalog') {
      if (type.startsWith('collection.') && type !== 'collection.create' && type !== 'collection.reorder' && !selection.collectionId) reason = 'SELECT_COLLECTION';
      if (['collection.create', 'collection.reorder', 'document.create', 'document.reorder'].includes(type) && doc) reason = 'SELECT_CATALOG_SCOPE';
      if (['collection.create', 'collection.reorder'].includes(type) && selection.collectionId !== undefined) reason = 'SELECT_LIBRARY_SCOPE';
      if (['document.update', 'document.delete'].includes(type) && !supported(snapshot, doc)) reason = doc ? 'UNSUPPORTED_WORKSPACE' : 'SELECT_WORKSPACE';
    }
    return [type, { enabled: !reason, reason }];
  }));
};

/** Detached hierarchy + opaque metadata for inspectors. Text/Meaning always stay on their Segment. */
export const selectTextDataManagementState = (candidate, { selection = {}, boundary, permissions, sourceAttachments = [], externalImports = [], audio = null } = {}) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const resolved = resolveTextManagementSelection(snapshot, selection);
  const document = snapshot.documents.find(d => d.id === resolved.workspaceId);
  let workspace = null;
  if (document) {
    const reason = supported(snapshot, document) ? null : 'UNSUPPORTED_WORKSPACE';
    const tree = resolveTextLibraryDocumentTree(snapshot, document.id);
    const segmentIds = new Set(tree.blocks.flatMap(c => c.segments.map(s => s.id)));
    const presentation = reason ? null : selectTextCardPresentation(snapshot, { documentId: document.id });
    const speakers = getTextStructuredSpeakerRegistry(document);
    if (presentation?.cards.some(c => c.units.some(u => u.speakerId && !speakers.some(s => s.id === u.speakerId)))) fail('INVALID_SNAPSHOT', 'Unresolved speaker reference');
    // Concrete URL bindings only; lazy location markers cannot prove physical availability.
    const runtimeAudioUrls = Object.fromEntries(Object.entries(audio?.runtimeAudioUrls || {}).filter(([, b]) => typeof b?.url === 'string' && b.url.length));
    workspace = { document, documentTree: tree, presentation, speakers, unsupportedReason: reason,
      audio: { variants: snapshot.audioVariants.filter(a => segmentIds.has(a.segmentId)),
        coverage: audio?.preferences && presentation ? buildTextStructuredAudioCoverageMap({ documentTree: tree, audioVariants: snapshot.audioVariants, runtimeAudioUrls, preferences: audio.preferences }) : null,
        readiness: audio?.preferences ? 'evaluated-with-supplied-bindings' : 'not-evaluated',
        fullArtifacts: tree.blocks.map(c => ({ cardId: c.id, metadata: c.metadata?.fullAudioArtifactsV1 ?? null })) },
      sources: { workspaceMetadata: document.metadata, attachments: sourceAttachments.filter(a => Object.values(a?.idMap?.documents || {}).includes(document.id)),
        externalImports: externalImports.filter(i => i.documentId === document.id) } };
  }
  const catalog = resolveTextLibraryCatalog(snapshot);
  const decorate = d => ({ ...d, supported: supported(snapshot, d), reason: supported(snapshot, d) ? null : 'UNSUPPORTED_WORKSPACE' });
  return freezeTextManagementView(structuredClone({ version: 1, schemaVersion: snapshot.schemaVersion,
    selection: resolved, catalog: { rootDocuments: catalog.rootDocuments.map(decorate), collections: catalog.collections.map(c => ({ ...c, documents: c.documents.map(decorate) })) },
    workspace, capabilities: getTextManagementCommandCapabilities(snapshot, resolved, { boundary, permissions }),
    diagnostics: { migration: inspectTextContentUnitMigrationState(snapshot).status, canonicalWrites: false,
      unresolvedAttachmentWorkspaceIds: sourceAttachments.flatMap(a => Object.values(a?.idMap?.documents || {})).filter(id => !snapshot.documents.some(d => d.id === id)),
      unresolvedExternalWorkspaceIds: externalImports.map(i => i.documentId).filter(id => !snapshot.documents.some(d => d.id === id)),
      counts: Object.fromEntries(['collections', 'documents', 'blocks', 'contentUnits', 'segments', 'audioVariants'].map(k => [k, snapshot[k]?.length ?? 0])) } }));
};

/**
 * Validates command fields, capability boundaries, protected metadata, and Workspace scope
 * without allocating persistent IDs/UIDs or mutating snapshots.
 */
export const validateAndScopeTextDataManagementCommand = (candidate, command, { selection = {}, boundary = 'read-only', permissions = [] } = {}) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const selected = resolveTextManagementSelection(snapshot, selection);
  const { type, payload = {} } = command || {};
  const fields = Object.hasOwn(TEXT_DATA_MANAGEMENT_COMMAND_FIELDS, type) && TEXT_DATA_MANAGEMENT_COMMAND_FIELDS[type];
  if (!fields || !plain(payload) || Object.keys(payload).some(k => !fields.includes(k))) fail('INVALID_COMMAND', 'Unsupported command or fields');
  const capability = getTextManagementCommandCapabilities(snapshot, selected, { boundary, permissions })[type];
  if (!capability.enabled) fail(capability.reason, 'Operation unavailable: ' + capability.reason);
  let scoped = { type, payload };
  if (Object.hasOwn(catalogFields, type)) {
    const collection = snapshot.collections.find(c => c.id === selected.collectionId);
    const doc = snapshot.documents.find(d => d.id === selected.workspaceId);
    if (type.startsWith('collection.') && ['collection.update', 'collection.delete'].includes(type) && payload.id !== collection.id) fail('OUT_OF_SCOPE', 'Collection must match current scope');
    if (['document.update', 'document.delete'].includes(type) && payload.id !== doc.id) fail('OUT_OF_SCOPE', 'Workspace must match current scope');
    if (['document.create', 'document.reorder'].includes(type) && (payload.collectionId ?? null) !== (selected.collectionId ?? null)) fail('OUT_OF_SCOPE', 'Command must target the selected Collection or Root');
    if (type === 'document.create' && !['paragraph', ...(snapshot.schemaVersion === 2 ? ['conversation', 'mixed'] : [])].includes(payload.documentType ?? 'paragraph')) fail('PERSISTENT_UNITS_REQUIRED', 'Only complete v2 disposable snapshots can author Conversation or Mixed Workspaces');
    if (type === 'document.reorder' && snapshot.documents.some(d => d.collectionId === (payload.collectionId ?? null) && !supported(snapshot, d))) fail('UNSUPPORTED_WORKSPACE', 'Cannot reorder a group containing an unsupported Workspace');
    if (payload.metadata !== undefined) {
      if (!plain(payload.metadata)) fail('INVALID_COMMAND', 'metadata must be a plain object');
      const before = { ...(type.endsWith('.update') ? (type.startsWith('collection.') ? collection : doc).metadata : {}) };
      const after = { ...payload.metadata }; delete before.note; delete after.note;
      if (canonicalJsonStringify(before) !== canonicalJsonStringify(after)) fail('PROTECTED_METADATA', 'Only metadata.note may change; preserve source/audio/identity keys');
    }
  } else {
    const state = selectTextDataManagementState(snapshot, { selection: selected }).workspace;
    const tree = state.documentTree;
    if (type === 'segment.reorder' || (snapshot.schemaVersion === 1 && type === 'segment.create')) {
      if (!tree.blocks.some(c => c.id === payload.blockId)) fail('OUT_OF_SCOPE', 'Card is outside the selected Workspace');
      if (payload.unitId !== undefined) fail('PERSISTENT_UNITS_REQUIRED', 'Virtual Sections are read-only; omit unitId');
      if (payload.metadata !== undefined && (!plain(payload.metadata) || canonicalJsonStringify(Object.fromEntries(Object.entries(payload.metadata).filter(([k]) => k !== 'note'))) !== '{}')) fail('PROTECTED_METADATA', 'Only metadata.note may be authored');
    } else scoped = scopeTextStructuredEditorCommand(snapshot, { workspace: tree, cards: tree.blocks, speakerRegistry: state.speakers }, command);
    if (type === 'block.create' && tree.documentType !== 'mixed' && payload.blockType !== tree.documentType) fail('INVALID_COMMAND', 'Card kind must match this Workspace');
  }
  return { snapshot, selected, scoped };
};

/** Native command application, explicitly restricted to an in-memory disposable boundary. */
export const applyTextDataManagementCommand = (candidate, command, { selection = {}, boundary = 'read-only', permissions = [], now = Date.now() } = {}) => {
  const { snapshot, scoped } = validateAndScopeTextDataManagementCommand(candidate, command, { selection, boundary, permissions });
  try {
    const outcome = applyTextLibraryCommand(snapshot, scoped, now);
    validateTextManagementSnapshot(outcome.snapshot);
    // Validate every supported resulting Workspace, including speakers and projection.
    for (const doc of outcome.snapshot.documents.filter(d => supported(outcome.snapshot, d))) selectTextDataManagementState(outcome.snapshot, { selection: { workspaceId: doc.id } });
    return outcome;
  } catch (error) {
    if (error.code) throw error;
    fail('COMMAND_REJECTED', error.message);
  }
};
