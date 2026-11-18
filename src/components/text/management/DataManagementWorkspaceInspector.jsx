import React, { useMemo } from 'react';
import { AlertOctagon, Lock, Save, Trash2, Users } from 'lucide-react';
import ConversationSpeakerPanel from '../conversation/ConversationSpeakerPanel.jsx';
import {
  buildReplacedMetadataWithNote,
  listPreservedMetadataEntries
} from '../conversation/conversationEditorErrorUtils.js';
import {
  buildSpeakerPanelStateFromWorkspace,
  DM_CONTROL_BTN,
  DM_INPUT_CLASS,
  DM_SMALL_BTN,
  explainReason,
  formatDocTypeBadge
} from './dataManagementUiUtils.js';

const clean = value => String(value ?? '').trim();

/**
 * Sections 2 & 4: Workspace Inspector (supported and unsupported states, opaque metadata,
 * move/rename/delete) and Speaker Management (reusing D4 ConversationSpeakerPanel).
 */
export default function DataManagementWorkspaceInspector({
  view,
  isPending = false,
  onDispatch,
  getDraft,
  setDraft,
  clearDraft,
  compact = false
}) {
  const workspace = view?.workspace;
  const catalog = view?.catalog;
  const capabilities = view?.capabilities || {};
  const schemaVersion = view?.schemaVersion;

  const speakerPanelState = useMemo(
    () => buildSpeakerPanelStateFromWorkspace(workspace),
    [workspace]
  );

  if (!workspace) {
    return (
      <section
        data-dm-workspace-inspector="empty"
        className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-center space-y-1.5"
      >
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">Workspace Inspector</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select any Workspace from the Library Explorer to inspect metadata, speakers, structured Cards, audio associations, and sources.
        </p>
      </section>
    );
  }

  const doc = workspace.document;
  const tree = workspace.documentTree;
  const badge = formatDocTypeBadge(doc.documentType);
  const canUpdateWs = Boolean(capabilities['document.update']?.enabled);
  const canDeleteWs = Boolean(capabilities['document.delete']?.enabled);
  const canSpeaker = Boolean(capabilities['speaker.register']?.enabled);

  const titleKey = { workspaceId: doc.id, entityId: doc.id, field: 'title' };
  const colKey = { workspaceId: doc.id, entityId: doc.id, field: 'collectionId' };
  const textLangKey = { workspaceId: doc.id, entityId: doc.id, field: 'textLanguage' };
  const meanLangKey = { workspaceId: doc.id, entityId: doc.id, field: 'meaningLanguage' };
  const noteKey = { workspaceId: doc.id, entityId: doc.id, field: 'note' };

  const draftTitle = getDraft(titleKey) ?? doc.title ?? '';
  const draftCollectionId = getDraft(colKey) !== undefined ? getDraft(colKey) : (doc.collectionId ?? '__root__');
  const draftTextLang = getDraft(textLangKey) ?? doc.textLanguage ?? 'en';
  const draftMeanLang = getDraft(meanLangKey) ?? doc.meaningLanguage ?? 'id';
  const draftNote = getDraft(noteKey) ?? (typeof doc.metadata?.note === 'string' ? doc.metadata.note : '');

  const preservedMeta = listPreservedMetadataEntries(doc.metadata, { exclude: ['note'] });
  const totalCards = tree?.blocks?.length ?? 0;
  const totalUnits = (tree?.blocks || []).reduce((sum, block) => sum + (block.units?.length ?? 0), 0);
  const totalSegments = (tree?.blocks || []).reduce((sum, block) => sum + (block.segments?.length ?? 0), 0);

  const handleSaveWorkspace = async event => {
    event.preventDefault();
    const targetCollectionId = draftCollectionId === '__root__' ? null : draftCollectionId;
    const res = await onDispatch({
      type: 'document.update',
      payload: {
        id: doc.id,
        title: clean(draftTitle) || doc.title,
        collectionId: targetCollectionId,
        textLanguage: clean(draftTextLang) || doc.textLanguage,
        meaningLanguage: clean(draftMeanLang) || doc.meaningLanguage,
        metadata: buildReplacedMetadataWithNote(doc.metadata, draftNote)
      }
    });
    if (res?.ok) {
      clearDraft(titleKey);
      clearDraft(colKey);
      clearDraft(textLangKey);
      clearDraft(meanLangKey);
      clearDraft(noteKey);
    }
  };

  return (
    <div className="space-y-4">
      {/* Workspace Inspector */}
      <section
        aria-label="Workspace Inspector"
        data-dm-workspace-inspector={doc.id}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100 break-words">
                {doc.title || 'Untitled Workspace'}
              </h2>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-black ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 break-all max-w-full">
                {doc.editorModel} · Schema v{schemaVersion}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
              {doc.id} · {doc.uid} · Collection: {doc.collectionId || 'Root (null)'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {totalCards} Cards
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {schemaVersion === 2 ? `${totalUnits} Persistent Units` : 'Virtual v1 Sections'}
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {totalSegments} Segments
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {workspace.audio?.variants?.length ?? 0} AudioVariants
            </span>
          </div>
        </div>

        {/* Unsupported Workspace Banner */}
        {workspace.unsupportedReason && (
          <div
            role="status"
            data-dm-unsupported-workspace={workspace.unsupportedReason}
            className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 p-3 space-y-1 text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-center gap-2 text-xs font-black">
              <AlertOctagon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>{workspace.unsupportedReason}</span>
            </div>
            <p className="text-xs leading-relaxed">
              {explainReason(workspace.unsupportedReason)} Authoring, deletion, and Shared Reader projection are disabled without converting or migrating data.
            </p>
          </div>
        )}

        {/* Opaque Preserved Metadata + Workspace Edit Form */}
        <form
          onSubmit={handleSaveWorkspace}
          data-dm-workspace-edit-form="true"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">
              Workspace Settings &amp; Preserved Metadata
            </h3>
            {!canUpdateWs && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                <Lock className="w-3 h-3" aria-hidden="true" />
                {capabilities['document.update']?.reason || 'READ_ONLY'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Title</span>
              <input
                aria-label="Workspace Title"
                value={draftTitle}
                onChange={e => setDraft(titleKey, e.target.value)}
                disabled={isPending || !canUpdateWs}
                className={DM_INPUT_CLASS}
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Move to Collection / Root</span>
              <select
                aria-label="Workspace Collection"
                value={draftCollectionId || '__root__'}
                onChange={e => setDraft(colKey, e.target.value)}
                disabled={isPending || !canUpdateWs}
                className={DM_INPUT_CLASS}
              >
                <option value="__root__">Root (No Collection)</option>
                {(catalog?.collections || []).map(col => (
                  <option key={col.id} value={col.id}>
                    {col.title} ({col.id})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Workspace Type (Conversion Disabled)</span>
              <input
                aria-label="Workspace Type Read-Only"
                value={doc.documentType || doc.editorModel}
                disabled
                readOnly
                title="Workspace kind conversion between Paragraph, Conversation, and Mixed is unsupported."
                className={`${DM_INPUT_CLASS} bg-slate-100 dark:bg-slate-800/70`}
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Text Language</span>
              <input
                aria-label="Workspace Text Language"
                value={draftTextLang}
                onChange={e => setDraft(textLangKey, e.target.value)}
                disabled={isPending || !canUpdateWs}
                className={DM_INPUT_CLASS}
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Meaning Language</span>
              <input
                aria-label="Workspace Meaning Language"
                value={draftMeanLang}
                onChange={e => setDraft(meanLangKey, e.target.value)}
                disabled={isPending || !canUpdateWs}
                className={DM_INPUT_CLASS}
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Editable metadata.note</span>
              <input
                aria-label="Workspace metadata note"
                value={draftNote}
                onChange={e => setDraft(noteKey, e.target.value)}
                disabled={isPending || !canUpdateWs}
                placeholder="Preserves source & speaker keys"
                className={DM_INPUT_CLASS}
              />
            </label>
          </div>

          {preservedMeta.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 space-y-1" data-dm-workspace-opaque-meta="true">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Read-Only Opaque Metadata Preserved Byte-for-Byte
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preservedMeta.map(entry => (
                  <span key={entry.key} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
                    {entry.key}: {entry.summary}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              data-dm-workspace-delete={doc.id}
              disabled={isPending || !canDeleteWs}
              onClick={() => onDispatch({ type: 'document.delete', payload: { id: doc.id } })}
              title={canDeleteWs ? 'Delete this Workspace' : explainReason(capabilities['document.delete']?.reason)}
              className={`${DM_CONTROL_BTN} border-red-300 dark:border-red-900 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Delete Workspace
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  clearDraft(titleKey);
                  clearDraft(colKey);
                  clearDraft(textLangKey);
                  clearDraft(meanLangKey);
                  clearDraft(noteKey);
                }}
                className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
              >
                Reset Form Drafts
              </button>
              <button
                type="submit"
                data-dm-workspace-save={doc.id}
                disabled={isPending || !canUpdateWs}
                title={canUpdateWs ? 'Save Workspace changes' : explainReason(capabilities['document.update']?.reason)}
                className={`${DM_CONTROL_BTN} border-indigo-600 bg-indigo-600 text-white`}
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                Save Workspace
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Section 4: Speaker Management */}
      <section
        aria-label="Speaker Management"
        data-dm-speaker-management="true"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Speaker Identity Registry</h3>
          </div>
          {!canSpeaker && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" data-dm-speaker-disabled-reason={capabilities['speaker.register']?.reason || 'UNSUPPORTED'}>
              Read-only ({capabilities['speaker.register']?.reason || 'UNSUPPORTED'})
            </span>
          )}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Authoritative speaker identity lives in the persistent Workspace registry (`SPK_*` / `SPKUID_*`). Labels and colors are presentation only.
        </p>

        {canSpeaker && speakerPanelState ? (
          <div className="space-y-2">
            <ConversationSpeakerPanel
              state={speakerPanelState}
              isBusy={isPending}
              onCommand={onDispatch}
              compact={compact}
            />
            {workspace.speakers?.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-dm-speaker-uid-list="true">
                {workspace.speakers.map(spk => (
                  <span key={spk.id} className="text-[10px] font-mono px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200 break-all max-w-full">
                    {spk.label} · {spk.id} · {spk.uid || 'no-uid'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2" data-dm-speaker-readonly="true">
            {!canSpeaker && capabilities['speaker.register']?.reason && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {explainReason(capabilities['speaker.register'].reason)}
              </p>
            )}
            {workspace.speakers?.length > 0 ? (
              <ul className="space-y-1.5">
                {workspace.speakers.map(spk => (
                  <li key={spk.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{spk.label}</span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{spk.id} · {spk.uid || 'no-uid'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">No registered speakers in this Workspace.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
