import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Edit3,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Trash2
} from 'lucide-react';
import {
  buildReplacedMetadataWithNote,
  listPreservedMetadataEntries,
  swapArrayIds
} from '../conversation/conversationEditorErrorUtils.js';
import {
  DM_CONTROL_BTN,
  DM_INPUT_CLASS,
  DM_SMALL_BTN,
  explainReason,
  formatDocTypeBadge
} from './dataManagementUiUtils.js';

const clean = value => String(value ?? '').trim();

const WorkspaceNavList = ({
  documents = [],
  groupCollectionId,
  selection,
  capabilities,
  isPending,
  onNavigate,
  onDispatch
}) => {
  const hasUnsupported = documents.some(doc => !doc.supported);
  const canReorder = Boolean(
    capabilities?.['document.reorder']?.enabled
    && !selection?.workspaceId
    && (selection?.collectionId ?? null) === (groupCollectionId ?? null)
    && !hasUnsupported
    && documents.length > 1
  );

  let reorderReason = null;
  if (!capabilities?.['document.reorder']?.enabled) {
    reorderReason = capabilities?.['document.reorder']?.reason || 'READ_ONLY';
  } else if (hasUnsupported) {
    reorderReason = 'UNSUPPORTED_WORKSPACE';
  }

  const moveDoc = async (docId, direction) => {
    const orderedIds = swapArrayIds(documents.map(d => d.id), docId, direction);
    if (!orderedIds) return;
    await onDispatch({
      type: 'document.reorder',
      payload: { collectionId: groupCollectionId ?? null, orderedIds }
    });
  };

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
        No Workspaces in this group yet.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {hasUnsupported && documents.length > 1 && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1" data-dm-reorder-blocked-reason="UNSUPPORTED_WORKSPACE">
          Reorder disabled: group contains an unsupported Workspace ({explainReason('UNSUPPORTED_WORKSPACE')})
        </p>
      )}
      {documents.map((doc, idx) => {
        const selected = selection?.workspaceId === doc.id;
        const badge = formatDocTypeBadge(doc.documentType);
        return (
          <div
            key={doc.id}
            data-dm-catalog-workspace={doc.id}
            className={`rounded-lg border p-2 transition ${
              selected
                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/35 ring-1 ring-indigo-500/30'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60'
            }`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                data-dm-workspace={doc.id}
                onClick={() => onNavigate({ workspaceId: doc.id })}
                className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-indigo-500 rounded"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 break-words">
                    {doc.title || 'Untitled Workspace'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {!doc.supported && (
                    <span className="px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-[9px] font-black text-red-700 dark:text-red-300">
                      UNSUPPORTED
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {doc.id} · {doc.uid}
                </p>
              </button>
              {documents.length > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    data-dm-workspace-reorder-up={doc.id}
                    disabled={isPending || !canReorder || idx === 0}
                    onClick={() => moveDoc(doc.id, -1)}
                    title={reorderReason ? explainReason(reorderReason) : 'Move Workspace up'}
                    aria-label={`Move Workspace ${doc.title || doc.id} up`}
                    className="min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 inline-flex items-center justify-center disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-dm-workspace-reorder-down={doc.id}
                    disabled={isPending || !canReorder || idx === documents.length - 1}
                    onClick={() => moveDoc(doc.id, 1)}
                    title={reorderReason ? explainReason(reorderReason) : 'Move Workspace down'}
                    aria-label={`Move Workspace ${doc.title || doc.id} down`}
                    className="min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 inline-flex items-center justify-center disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Section 1: Library Explorer covering Root, Collections, Workspaces,
 * and allowlisted catalog create/update/reorder/delete actions.
 */
export default function DataManagementLibraryExplorer({
  view,
  isPending = false,
  onNavigate,
  onDispatch,
  getDraft,
  setDraft,
  clearDraft
}) {
  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  const selection = view?.selection || {};
  const catalog = view?.catalog || { rootDocuments: [], collections: [] };
  const capabilities = view?.capabilities || {};
  const schemaVersion = view?.schemaVersion;

  const isWholeLibrary = selection.collectionId === undefined && !selection.workspaceId;
  const isRootScope = selection.collectionId === null && !selection.workspaceId;
  const targetCollectionId = selection.collectionId ?? null;

  const newColTitleKey = { catalog: true, field: 'newCollectionTitle' };
  const newColNoteKey = { catalog: true, field: 'newCollectionNote' };
  const newColTitle = getDraft(newColTitleKey) ?? '';
  const newColNote = getDraft(newColNoteKey) ?? '';

  const newWsTitleKey = { catalog: true, collectionId: targetCollectionId, field: 'newWorkspaceTitle' };
  const newWsTypeKey = { catalog: true, collectionId: targetCollectionId, field: 'newWorkspaceType' };
  const newWsTextLangKey = { catalog: true, collectionId: targetCollectionId, field: 'newWorkspaceTextLang' };
  const newWsMeanLangKey = { catalog: true, collectionId: targetCollectionId, field: 'newWorkspaceMeaningLang' };
  const newWsNoteKey = { catalog: true, collectionId: targetCollectionId, field: 'newWorkspaceNote' };

  const newWsTitle = getDraft(newWsTitleKey) ?? '';
  const newWsType = getDraft(newWsTypeKey) ?? 'paragraph';
  const newWsTextLang = getDraft(newWsTextLangKey) ?? 'en';
  const newWsMeanLang = getDraft(newWsMeanLangKey) ?? 'id';
  const newWsNote = getDraft(newWsNoteKey) ?? '';

  const canCreateCol = Boolean(capabilities['collection.create']?.enabled);
  const canReorderCol = Boolean(capabilities['collection.reorder']?.enabled && catalog.collections.length > 1);
  const canCreateWs = Boolean(capabilities['document.create']?.enabled);

  const handleCreateCollection = async event => {
    event.preventDefault();
    const payload = { title: clean(newColTitle) || 'Untitled Collection' };
    if (clean(newColNote)) payload.metadata = { note: clean(newColNote) };
    const res = await onDispatch({ type: 'collection.create', payload });
    if (res?.ok) {
      clearDraft(newColTitleKey);
      clearDraft(newColNoteKey);
      setCreateCollectionOpen(false);
    }
  };

  const handleCreateWorkspace = async event => {
    event.preventDefault();
    const payload = {
      collectionId: targetCollectionId,
      title: clean(newWsTitle) || 'Untitled Workspace',
      documentType: newWsType,
      textLanguage: clean(newWsTextLang) || 'en',
      meaningLanguage: clean(newWsMeanLang) || 'id'
    };
    if (clean(newWsNote)) payload.metadata = { note: clean(newWsNote) };
    const res = await onDispatch({ type: 'document.create', payload });
    if (res?.ok) {
      clearDraft(newWsTitleKey);
      clearDraft(newWsTypeKey);
      clearDraft(newWsTextLangKey);
      clearDraft(newWsMeanLangKey);
      clearDraft(newWsNoteKey);
      setCreateWorkspaceOpen(false);
    }
  };

  const handleReorderCollection = async (collectionId, direction) => {
    const orderedIds = swapArrayIds(catalog.collections.map(c => c.id), collectionId, direction);
    if (!orderedIds) return;
    await onDispatch({ type: 'collection.reorder', payload: { orderedIds } });
  };

  return (
    <section
      aria-label="Library Explorer"
      data-dm-library-explorer="true"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-4"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Library Explorer</h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          Schema v{schemaVersion}
        </span>
      </div>

      {/* Primary Scope Switchers */}
      <nav aria-label="Library scopes" className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          data-dm-nav-library="true"
          onClick={() => onNavigate({})}
          className={`${DM_CONTROL_BTN} ${
            isWholeLibrary
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
          }`}
        >
          Whole Library
        </button>
        <button
          type="button"
          data-dm-nav-root="true"
          onClick={() => onNavigate({ collectionId: null })}
          className={`${DM_CONTROL_BTN} ${
            isRootScope
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
          }`}
        >
          Root ({catalog.rootDocuments.length})
        </button>
      </nav>

      {/* Create Collection & Create Workspace Actions */}
      <div className="space-y-2 border-y border-slate-100 dark:border-slate-800 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-dm-toggle-create-collection="true"
            disabled={isPending || !canCreateCol}
            onClick={() => setCreateCollectionOpen(v => !v)}
            title={canCreateCol ? 'Create Collection in Whole Library' : explainReason(capabilities['collection.create']?.reason)}
            className={`${DM_SMALL_BTN} flex-1 border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Collection
          </button>
          <button
            type="button"
            data-dm-toggle-create-workspace="true"
            disabled={isPending || !canCreateWs}
            onClick={() => setCreateWorkspaceOpen(v => !v)}
            title={canCreateWs ? 'Create Workspace in current Catalog scope' : explainReason(capabilities['document.create']?.reason)}
            className={`${DM_SMALL_BTN} flex-1 border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Workspace
          </button>
        </div>

        {!canCreateCol && capabilities['collection.create']?.reason && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400" data-dm-capability-hint="collection.create">
            Collection create/reorder: <span className="font-mono font-bold">{capabilities['collection.create'].reason}</span>
            {capabilities['collection.create'].reason === 'SELECT_LIBRARY_SCOPE' || capabilities['collection.create'].reason === 'SELECT_CATALOG_SCOPE'
              ? (
                <button
                  type="button"
                  onClick={() => onNavigate({})}
                  className="ml-1.5 underline text-indigo-600 dark:text-indigo-400 font-bold"
                >
                  Select Whole Library
                </button>
              )
              : null}
          </p>
        )}

        {!canCreateWs && capabilities['document.create']?.reason && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400" data-dm-capability-hint="document.create">
            Workspace create/reorder: <span className="font-mono font-bold">{capabilities['document.create'].reason}</span>
            {capabilities['document.create'].reason === 'SELECT_CATALOG_SCOPE' && (
              <button
                type="button"
                onClick={() => onNavigate(selection.collectionId !== undefined ? { collectionId: selection.collectionId } : {})}
                className="ml-1.5 underline text-indigo-600 dark:text-indigo-400 font-bold"
              >
                Return to Catalog Scope
              </button>
            )}
          </p>
        )}

        {createCollectionOpen && canCreateCol && (
          <form
            onSubmit={handleCreateCollection}
            data-dm-create-collection-form="true"
            className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 space-y-2"
          >
            <p className="text-[11px] font-black text-sky-800 dark:text-sky-200">Create Collection (Library Scope)</p>
            <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Collection Title</span>
              <input
                aria-label="New Collection title"
                value={newColTitle}
                onChange={e => setDraft(newColTitleKey, e.target.value)}
                disabled={isPending}
                placeholder="Collection title"
                className={DM_INPUT_CLASS}
              />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Collection metadata.note</span>
              <input
                aria-label="New Collection note"
                value={newColNote}
                onChange={e => setDraft(newColNoteKey, e.target.value)}
                disabled={isPending}
                placeholder="Optional metadata.note"
                className={DM_INPUT_CLASS}
              />
            </label>
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setCreateCollectionOpen(false)} className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}>
                Cancel
              </button>
              <button type="submit" disabled={isPending} data-dm-submit-create-collection="true" className={`${DM_SMALL_BTN} border-sky-600 bg-sky-600 text-white`}>
                Create Collection
              </button>
            </div>
          </form>
        )}

        {createWorkspaceOpen && canCreateWs && (
          <form
            onSubmit={handleCreateWorkspace}
            data-dm-create-workspace-form="true"
            className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 space-y-2"
          >
            <p className="text-[11px] font-black text-indigo-800 dark:text-indigo-200">
              Create Workspace in {targetCollectionId ? `Collection ${targetCollectionId}` : 'Root'}
            </p>
            <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Workspace Title</span>
              <input
                aria-label="New Workspace title"
                value={newWsTitle}
                onChange={e => setDraft(newWsTitleKey, e.target.value)}
                disabled={isPending}
                placeholder="Workspace title"
                className={DM_INPUT_CLASS}
              />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Workspace Type</span>
              <select
                aria-label="New Workspace type"
                value={newWsType}
                onChange={e => setDraft(newWsTypeKey, e.target.value)}
                disabled={isPending}
                className={DM_INPUT_CLASS}
              >
                <option value="paragraph">Paragraph Workspace</option>
                <option value="conversation" disabled={schemaVersion !== 2}>
                  Conversation Workspace {schemaVersion !== 2 ? '(Requires Schema v2)' : ''}
                </option>
                <option value="mixed" disabled={schemaVersion !== 2}>
                  Mixed Workspace {schemaVersion !== 2 ? '(Requires Schema v2)' : ''}
                </option>
              </select>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>Text Lang</span>
                <input
                  aria-label="New Workspace text language"
                  value={newWsTextLang}
                  onChange={e => setDraft(newWsTextLangKey, e.target.value)}
                  disabled={isPending}
                  placeholder="en"
                  className={DM_INPUT_CLASS}
                />
              </label>
              <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>Meaning Lang</span>
                <input
                  aria-label="New Workspace meaning language"
                  value={newWsMeanLang}
                  onChange={e => setDraft(newWsMeanLangKey, e.target.value)}
                  disabled={isPending}
                  placeholder="id"
                  className={DM_INPUT_CLASS}
                />
              </label>
            </div>
            <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Workspace metadata.note</span>
              <input
                aria-label="New Workspace note"
                value={newWsNote}
                onChange={e => setDraft(newWsNoteKey, e.target.value)}
                disabled={isPending}
                placeholder="Optional metadata.note"
                className={DM_INPUT_CLASS}
              />
            </label>
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setCreateWorkspaceOpen(false)} className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}>
                Cancel
              </button>
              <button type="submit" disabled={isPending} data-dm-submit-create-workspace="true" className={`${DM_SMALL_BTN} border-indigo-600 bg-indigo-600 text-white`}>
                Create Workspace
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Collections */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Collections ({catalog.collections.length})
          </h3>
        </div>
        {catalog.collections.length === 0 ? (
          <p data-dm-empty-collections="true" className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
            Empty library: no Collections exist yet.
          </p>
        ) : (
          catalog.collections.map((collection, colIdx) => {
            const selectedCol = selection.collectionId === collection.id && !selection.workspaceId;
            const colUpdateCap = capabilities['collection.update'];
            const colDeleteCap = capabilities['collection.delete'];
            const isEditing = editingCollectionId === collection.id && selectedCol;
            const editTitleKey = { catalog: true, collectionId: collection.id, field: 'editTitle' };
            const editNoteKey = { catalog: true, collectionId: collection.id, field: 'editNote' };
            const editTitle = getDraft(editTitleKey) ?? collection.title ?? '';
            const editNote = getDraft(editNoteKey) ?? (typeof collection.metadata?.note === 'string' ? collection.metadata.note : '');
            const opaqueKeys = listPreservedMetadataEntries(collection.metadata, { exclude: ['note'] });

            const handleSaveCol = async event => {
              event.preventDefault();
              const res = await onDispatch({
                type: 'collection.update',
                payload: {
                  id: collection.id,
                  title: clean(editTitle) || collection.title,
                  metadata: buildReplacedMetadataWithNote(collection.metadata, editNote)
                }
              });
              if (res?.ok) {
                clearDraft(editTitleKey);
                clearDraft(editNoteKey);
                setEditingCollectionId(null);
              }
            };

            return (
              <div
                key={collection.id}
                data-dm-collection-card={collection.id}
                className={`rounded-xl border p-2.5 space-y-2 ${
                  selectedCol
                    ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/25'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    data-dm-collection={collection.id}
                    onClick={() => onNavigate({ collectionId: collection.id })}
                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-sky-500 rounded"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedCol
                        ? <FolderOpen className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        : <Folder className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />}
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100 break-words">
                        {collection.title || 'Untitled Collection'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        ({collection.documents.length})
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {collection.id} · {collection.uid}
                    </p>
                    {collection.metadata?.note && (
                      <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300">Note: {collection.metadata.note}</p>
                    )}
                  </button>
                  {catalog.collections.length > 1 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-dm-collection-reorder-up={collection.id}
                        disabled={isPending || !canReorderCol || colIdx === 0}
                        onClick={() => handleReorderCollection(collection.id, -1)}
                        title={canReorderCol ? 'Move Collection up' : explainReason(capabilities['collection.reorder']?.reason)}
                        aria-label={`Move Collection ${collection.title || collection.id} up`}
                        className="min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:focus-visible:outline-sky-400 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-dm-collection-reorder-down={collection.id}
                        disabled={isPending || !canReorderCol || colIdx === catalog.collections.length - 1}
                        onClick={() => handleReorderCollection(collection.id, 1)}
                        title={canReorderCol ? 'Move Collection down' : explainReason(capabilities['collection.reorder']?.reason)}
                        aria-label={`Move Collection ${collection.title || collection.id} down`}
                        className="min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:focus-visible:outline-sky-400 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                {selectedCol && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-sky-200/70 dark:border-sky-900">
                    <button
                      type="button"
                      data-dm-collection-edit-toggle={collection.id}
                      disabled={isPending || !colUpdateCap?.enabled}
                      onClick={() => setEditingCollectionId(v => v === collection.id ? null : collection.id)}
                      title={colUpdateCap?.enabled ? 'Edit Collection title or note' : explainReason(colUpdateCap?.reason)}
                      className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
                    >
                      <Edit3 className="w-3 h-3" aria-hidden="true" /> Rename / Note
                    </button>
                    <button
                      type="button"
                      data-dm-collection-delete={collection.id}
                      disabled={isPending || !colDeleteCap?.enabled}
                      onClick={() => onDispatch({ type: 'collection.delete', payload: { id: collection.id } })}
                      title={colDeleteCap?.enabled
                        ? (collection.documents.length > 0 ? 'Native command rejects deleting non-empty Collection' : 'Delete empty Collection')
                        : explainReason(colDeleteCap?.reason)}
                      className={`${DM_SMALL_BTN} border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400`}
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" /> Delete Collection
                    </button>
                    {collection.documents.length > 0 && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        Must be empty before deletion succeeds
                      </span>
                    )}
                  </div>
                )}

                {isEditing && (
                  <form
                    onSubmit={handleSaveCol}
                    data-dm-collection-edit={collection.id}
                    className="rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 p-2 space-y-2"
                  >
                    <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <span>Collection Title</span>
                      <input
                        aria-label={`Collection title ${collection.id}`}
                        value={editTitle}
                        onChange={e => setDraft(editTitleKey, e.target.value)}
                        disabled={isPending}
                        className={DM_INPUT_CLASS}
                      />
                    </label>
                    <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <span>Collection metadata.note</span>
                      <input
                        aria-label={`Collection note ${collection.id}`}
                        value={editNote}
                        onChange={e => setDraft(editNoteKey, e.target.value)}
                        disabled={isPending}
                        placeholder="Collection metadata.note"
                        className={DM_INPUT_CLASS}
                      />
                    </label>
                    {opaqueKeys.length > 0 && (
                      <p className="text-[10px] text-slate-500">Preserved keys: {opaqueKeys.map(k => k.key).join(', ')}</p>
                    )}
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setEditingCollectionId(null)} className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}>
                        Cancel
                      </button>
                      <button type="submit" disabled={isPending} data-dm-collection-save={collection.id} className={`${DM_SMALL_BTN} border-sky-600 bg-sky-600 text-white`}>
                        Save Collection
                      </button>
                    </div>
                  </form>
                )}

                <WorkspaceNavList
                  documents={collection.documents}
                  groupCollectionId={collection.id}
                  selection={selection}
                  capabilities={capabilities}
                  isPending={isPending}
                  onNavigate={onNavigate}
                  onDispatch={onDispatch}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Root Workspaces */}
      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Root Workspaces ({catalog.rootDocuments.length})
        </h3>
        <WorkspaceNavList
          documents={catalog.rootDocuments}
          groupCollectionId={null}
          selection={selection}
          capabilities={capabilities}
          isPending={isPending}
          onNavigate={onNavigate}
          onDispatch={onDispatch}
        />
      </div>
    </section>
  );
}
