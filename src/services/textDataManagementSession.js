import { createTextSnapshotCommandCoordinator } from '../domain/text/textMixedEditorDomain.js';
import { validateTextManagementSnapshot, selectTextDataManagementState, resolveTextManagementSelection,
  applyTextDataManagementCommand, validateAndScopeTextDataManagementCommand, freezeTextManagementView, TextDataManagementError } from '../domain/text/textDataManagementDomain.js';
import { exportTextManagementData, inspectTextManagementTransfer, previewTextManagementTransfer } from '../domain/text/textDataManagementTransferDomain.js';
import { executeTextLibraryCommand } from './persistence/textLibraryCommandService.js';
import { normalizeTextSourceAttachments } from '../domain/text/textSourceAttachmentDomain.js';
import { normalizeTextExternalImportRegistry } from '../domain/text/textExternalJsonDomain.js';

/**
 * Headless Hydrogen adapter. Supports in-memory disposable sessions and explicit
 * authoritative disposable persistence adapters, never direct executeTextLibraryCommand.
 * Navigation never calls document.setActive. Drafts survive rejection/navigation and are identity scoped.
 */
export const createTextDataManagementSession = ({ snapshot: initial, selection: initialSelection = {},
  boundary = 'read-only', permissions = [], bookAuthoring = false, sourceAttachments = [], externalImports = [], metaRecords = null, audio = null, execute = null } = {}) => {
  if (execute && (execute === executeTextLibraryCommand || execute.__unsafeNonTransactionalExecutor || execute.name === 'executeTextLibraryCommand')) {
    throw new TextDataManagementError('INVALID_EXECUTOR', 'executeTextLibraryCommand cannot be passed directly as session execute callback');
  }
  let snapshot, selection = {}, revision = 0, pending = false, error = null, disposed = false, state;
  let sidecars = structuredClone({ sourceAttachments, externalImports });
  let authoritativeMetaRecords = Array.isArray(metaRecords) ? structuredClone(metaRecords) : null;
  const access = { boundary, permissions: [...permissions], bookAuthoring };
  const drafts = new Map(), listeners = new Set();
  const emit = () => {
    let view = null;
    if (snapshot) {
      try { view = selectTextDataManagementState(snapshot, { selection, ...access, ...sidecars, audio }); }
      catch (e) { error = { code: e.code || 'INVALID_SNAPSHOT', message: e.message }; }
    }
    state = freezeTextManagementView({ revision, pending, disposed, error, view, draftCount: drafts.size });
    listeners.forEach(listener => listener());
  };
  const loadSource = (candidate, nextSelection) => {
    try {
      const next = validateTextManagementSnapshot(candidate);
      const scope = resolveTextManagementSelection(next, nextSelection);
      selectTextDataManagementState(next, { selection: scope });
      snapshot = freezeTextManagementView(next); selection = scope; error = null;
    } catch (e) { snapshot = null; selection = {}; error = { code: e.code || 'INVALID_SNAPSHOT', message: e.message }; }
    revision++; emit();
  };
  loadSource(initial, initialSelection);
  const coordinator = createTextSnapshotCommandCoordinator({
    getScope: () => ({ snapshot, documentId: selection.workspaceId, revision, selection, ...access }),
    precheck: (source, command, scope) => validateAndScopeTextDataManagementCommand(source, command, scope),
    prepare: (source, command, scope) => applyTextDataManagementCommand(source, command, scope),
    validateSnapshot: candidate => validateTextManagementSnapshot(candidate),
    getExecutor: () => execute,
    onPending(value) { pending = value; emit(); },
    onCommit(outcome) {
      snapshot = freezeTextManagementView(outcome.snapshot); revision++; error = null;
      if (Array.isArray(outcome.metaRecords)) {
        authoritativeMetaRecords = structuredClone(outcome.metaRecords);
        const meta = new Map(authoritativeMetaRecords.map(record => [record.key, record.value]));
        sidecars = { sourceAttachments: normalizeTextSourceAttachments(meta.get('sourceAttachments') || []),
          externalImports: normalizeTextExternalImportRegistry(meta.get('externalSourceImports') || []) };
      }
      // Native deletions may remove the browsed entity; fall back to its nearest surviving parent.
      for (const [field, records] of [['segmentId', snapshot.segments], ['unitId', snapshot.contentUnits || []], ['cardId', snapshot.blocks], ['workspaceId', snapshot.documents], ['collectionId', snapshot.collections]]) {
        if (selection[field] && !records.some(r => r.id === selection[field])) delete selection[field];
      }
      if (!selection.workspaceId) { delete selection.cardId; delete selection.unitId; delete selection.segmentId; }
      if (selection.workspaceId) selection.collectionId = snapshot.documents.find(d => d.id === selection.workspaceId).collectionId;
      if (selection.segmentId) { const s = snapshot.segments.find(s => s.id === selection.segmentId); selection.cardId = s.blockId; if (s.unitId) selection.unitId = s.unitId; }
      selection = resolveTextManagementSelection(snapshot, selection); emit();
    }
  });
  const draftKey = ({ catalog = false, collectionId, workspaceId, entityId, field }, validateOwner = true) => {
    if (catalog && typeof field === 'string' && field
      && (!validateOwner || (snapshot && (collectionId == null || snapshot.collections.some(c => c.id === collectionId))))) {
      return JSON.stringify(['catalog', collectionId ?? null, field]);
    }
    // A rejected replacement/deleted source must not make already retained drafts unreadable.
    if (!validateOwner && typeof workspaceId === 'string' && typeof entityId === 'string' && typeof field === 'string' && field) return JSON.stringify([workspaceId, entityId, field]);
    if (!snapshot || typeof field !== 'string' || !field || !snapshot.documents.some(d => d.id === workspaceId)
      || ![...snapshot.documents, ...snapshot.blocks, ...(snapshot.contentUnits || []), ...snapshot.segments].some(r => r.id === entityId && (r.id === workspaceId || r.documentId === workspaceId))) {
      throw new TextDataManagementError('OUT_OF_SCOPE', 'Draft requires a real entity in its Workspace');
    }
    return JSON.stringify([workspaceId, entityId, field]);
  };
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    getMetaRecords: () => (authoritativeMetaRecords ? structuredClone(authoritativeMetaRecords) : null),
    configure({ boundary: nextBoundary = access.boundary, permissions: nextPermissions = access.permissions, execute: nextExecute = execute, audio: nextAudio = audio } = {}) {
      if (disposed) return;
      if (nextExecute && (nextExecute === executeTextLibraryCommand || nextExecute.__unsafeNonTransactionalExecutor || nextExecute.name === 'executeTextLibraryCommand')) throw new TextDataManagementError('INVALID_EXECUTOR', 'Unsafe executor');
      if (access.boundary === nextBoundary && JSON.stringify(access.permissions) === JSON.stringify(nextPermissions) && execute === nextExecute && audio === nextAudio) return;
      access.boundary = nextBoundary; access.permissions = [...nextPermissions]; execute = nextExecute; audio = nextAudio;
      revision++; emit();
    },
    navigate(nextSelection) {
      if (disposed) return false;
      try { selection = resolveTextManagementSelection(snapshot, nextSelection); revision++; error = null; emit(); return true; }
      catch (e) { error = { code: e.code || 'INVALID_SELECTION', message: e.message }; emit(); return false; }
    },
    async dispatch(command) {
      const result = await coordinator.dispatch(command);
      if (!disposed) { error = result.ok ? null : result.error; emit(); }
      return result;
    },
    setDraft(key, value) { if (disposed) return; drafts.set(draftKey(key), structuredClone(value)); emit(); },
    getDraft(key) { return structuredClone(drafts.get(draftKey(key, false))); },
    clearDraft(key) { if (disposed) return; drafts.delete(draftKey(key, false)); emit(); },
    replaceSource(candidate, { selection: nextSelection = {}, sourceAttachments: attachments = [], externalImports: imports = [], metaRecords: nextMeta = null } = {}) {
      if (disposed) return;
      sidecars = structuredClone({ sourceAttachments: attachments, externalImports: imports });
      authoritativeMetaRecords = Array.isArray(nextMeta) ? structuredClone(nextMeta) : null;
      loadSource(candidate, nextSelection);
    },
    exportData(options) {
      const resolvedMetaRecords = options?.metaRecords !== undefined ? options.metaRecords : authoritativeMetaRecords;
      return exportTextManagementData(snapshot, { ...options, selection, ...sidecars, ...(resolvedMetaRecords !== null ? { metaRecords: resolvedMetaRecords } : {}) });
    },
    inspectTransfer: inspectTextManagementTransfer,
    previewTransfer(options) { return previewTextManagementTransfer(snapshot, { ...options, selection, ...sidecars }); },
    dispose() { disposed = true; revision++; coordinator.dispose(); pending = false; emit(); listeners.clear(); }
  };
};
