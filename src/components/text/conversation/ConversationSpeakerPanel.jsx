import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Plus, Save, Trash2, UserCheck, Users, X } from 'lucide-react';
import { collectConversationEditorSpeakers, normalizeConversationEditorError } from './conversationEditorErrorUtils.js';

const clean = value => String(value ?? '').trim();

/**
 * Isolated Workspace Speaker Registry panel driven by selectTextConversationEditorState
 * and strictly scoped D4-A speaker.register / speaker.rename / speaker.remove commands.
 */
export const ConversationSpeakerPanel = ({ state, isBusy = false, onCommand, compact = false }) => {
  const workspaceId = state?.workspace?.id || null;
  const [expanded, setExpanded] = useState(false);
  const [newLabelState, setNewLabelState] = useState({ workspaceId, value: '' });
  const [editState, setEditState] = useState({ workspaceId, id: null, label: '' });
  const [localErrorState, setLocalErrorState] = useState({ workspaceId, error: null });

  const speakers = useMemo(() => collectConversationEditorSpeakers(state), [state]);

  if (!workspaceId) return null;

  const newLabel = newLabelState.workspaceId === workspaceId ? newLabelState.value : '';
  const editingId = editState.workspaceId === workspaceId ? editState.id : null;
  const editingLabel = editState.workspaceId === workspaceId ? editState.label : '';
  const panelError = localErrorState.workspaceId === workspaceId ? localErrorState.error : null;

  const setNewLabel = value => setNewLabelState({ workspaceId, value });
  const setEditRow = (id, label) => setEditState({ workspaceId, id: id || null, label: label || '' });
  const clearEditRow = () => setEditState({ workspaceId, id: null, label: '' });
  const setPanelError = error => setLocalErrorState({ workspaceId, error: error || null });

  const dispatchSpeaker = async command => {
    setPanelError(null);
    try {
      const outcome = await onCommand?.(command);
      if (!outcome?.ok) {
        if (outcome?.error) setPanelError(outcome.error);
        return false;
      }
      return true;
    } catch (error) {
      setPanelError(normalizeConversationEditorError(error));
      return false;
    }
  };

  const handleRegisterNew = async () => {
    const label = clean(newLabel);
    if (!label) {
      setPanelError({ code: 'INVALID_COMMAND', message: 'Speaker label cannot be empty.' });
      return;
    }
    if (isBusy) return;
    const ok = await dispatchSpeaker({
      type: 'speaker.register',
      payload: { documentId: workspaceId, label }
    });
    if (ok) setNewLabel('');
  };

  const handlePromoteDetected = async speaker => {
    if (!speaker?.id || !speaker?.label || isBusy) return;
    await dispatchSpeaker({
      type: 'speaker.register',
      payload: { documentId: workspaceId, speakerId: speaker.id, label: speaker.label }
    });
  };

  const handleSaveRename = async speaker => {
    const label = clean(editingLabel);
    if (!speaker?.id || isBusy) return;
    if (!label) {
      setPanelError({ code: 'INVALID_COMMAND', message: 'Speaker label cannot be empty.' });
      return;
    }
    const ok = await dispatchSpeaker({
      type: 'speaker.rename',
      payload: { documentId: workspaceId, speakerId: speaker.id, label }
    });
    if (ok) clearEditRow();
  };

  const handleRemove = async speaker => {
    if (!speaker?.id || isBusy) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Remove unused speaker "${speaker.label}" from the Workspace registry?`)) return;
    }
    await dispatchSpeaker({
      type: 'speaker.remove',
      payload: { documentId: workspaceId, speakerId: speaker.id }
    });
  };

  return (
    <section
      className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/15 overflow-hidden"
      data-conversation-speaker-registry="true"
    >
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="w-full min-h-11 px-3 py-2.5 flex items-center gap-2 text-left active:scale-[0.995] transition"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-300" /> : <ChevronRight className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-300" />}
        <Users className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-200">Workspace Speaker Registry</h4>
            <span className="text-[7px] font-black rounded bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">SPK_* STABLE ID</span>
          </div>
          <p className="mt-0.5 text-[8px] text-slate-400">
            {speakers.length} speaker{speakers.length === 1 ? '' : 's'} • Renaming syncs Turns (including empty) &amp; Sentences
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-sky-200/80 dark:border-sky-900 p-3 space-y-2.5">
          <div className={`${compact ? 'grid-cols-1' : 'grid-cols-[1fr_auto]'} grid gap-1.5`}>
            <input
              value={newLabel}
              onChange={event => {
                setNewLabel(event.target.value);
                if (panelError) setPanelError(null);
              }}
              onKeyDown={event => event.key === 'Enter' && handleRegisterNew()}
              disabled={isBusy}
              placeholder="Register speaker name (e.g. Carla)"
              aria-label="New speaker label"
              className="min-h-10 min-w-0 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 px-2.5 text-base md:text-xs dark:text-white"
            />
            <button
              type="button"
              disabled={isBusy || !clean(newLabel)}
              onClick={handleRegisterNew}
              className="min-h-10 rounded-lg bg-sky-600 px-3 text-[10px] font-black text-white disabled:opacity-40 active:scale-95 transition"
            >
              <Plus className="w-3 h-3 inline mr-1" />Register
            </button>
          </div>

          {panelError && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 px-2.5 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
              <span className="font-mono uppercase mr-1.5 px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/50">{panelError.code}</span>
              <span>{panelError.message}</span>
            </div>
          )}

          {speakers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-sky-200 dark:border-sky-900 px-2.5 py-2.5 text-[9px] text-slate-400">
              No speakers registered or used in this Workspace yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {speakers.map(speaker => (
                <div key={speaker.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-2">
                  {editingId === speaker.id ? (
                    <div className="flex gap-1.5">
                      <input
                        value={editingLabel}
                        onChange={event => {
                          setEditRow(speaker.id, event.target.value);
                          if (panelError) setPanelError(null);
                        }}
                        onKeyDown={event => event.key === 'Enter' && handleSaveRename(speaker)}
                        disabled={isBusy}
                        aria-label={`Rename ${speaker.label}`}
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-base md:text-xs dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={isBusy || !clean(editingLabel)}
                        onClick={() => handleSaveRename(speaker)}
                        className="w-10 min-h-10 rounded-lg bg-sky-600 text-white disabled:opacity-40"
                        title="Save speaker name"
                        aria-label="Save speaker name"
                      >
                        <Save className="w-3.5 h-3.5 mx-auto" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { clearEditRow(); setPanelError(null); }}
                        className="w-10 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400"
                        title="Cancel rename"
                        aria-label="Cancel rename"
                      >
                        <X className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{speaker.label}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[7px] font-black ${speaker.registered ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-300'}`}>
                            {speaker.registered ? 'REGISTERED' : 'DETECTED'}
                          </span>
                          {speaker.used && (
                            <span className="rounded bg-sky-50 dark:bg-sky-950/30 px-1.5 py-0.5 text-[7px] font-black text-sky-600 dark:text-sky-300">
                              IN USE • {speaker.turnCount}T / {speaker.sentenceCount}S
                            </span>
                          )}
                          {speaker.externalKey && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[7px] font-mono text-slate-500">
                              ext:{speaker.externalKey}
                            </span>
                          )}
                        </div>
                        {!compact && <p className="mt-0.5 truncate font-mono text-[8px] text-slate-400">{speaker.id}</p>}
                      </div>
                      {!speaker.registered && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handlePromoteDetected(speaker)}
                          className="min-h-9 px-2 rounded-lg border border-emerald-200 dark:border-emerald-900 text-[8px] font-black text-emerald-600 dark:text-emerald-300"
                        >
                          <UserCheck className="w-3 h-3 inline mr-1" />Register
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { setEditRow(speaker.id, speaker.label); setPanelError(null); }}
                        className="w-9 min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-sky-600"
                        title="Rename speaker"
                        aria-label={`Edit speaker ${speaker.label}`}
                      >
                        <Edit3 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || !speaker.registered}
                        onClick={() => handleRemove(speaker)}
                        className="w-9 min-h-9 rounded-lg border border-red-200 dark:border-red-900 text-red-500 disabled:opacity-25"
                        title={speaker.used ? 'Speaker is in use (command will reject removal)' : 'Remove unused speaker'}
                        aria-label={`Remove speaker ${speaker.label}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ConversationSpeakerPanel;
