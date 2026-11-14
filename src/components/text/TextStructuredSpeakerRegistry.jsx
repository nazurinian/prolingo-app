import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Save, Trash2, UserCheck, Users, X } from 'lucide-react';
import { TEXT_LIBRARY_COMMAND_TYPES } from '../../domain/text/textLibraryCommandDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { collectTextStructuredWorkspaceSpeakerRegistry } from '../../domain/text/textStructuredSpeakerIdentityDomain.js';

const clean = value => String(value ?? '').trim();

export const TextStructuredSpeakerRegistry = ({ documentTree, isBusy, onCommand, compact = false }) => {
  const activeDocumentId = documentTree?.id || null;
  const [newLabelState, setNewLabelState] = useState({ documentId: activeDocumentId, value: '' });
  const [editState, setEditState] = useState({ documentId: activeDocumentId, id: null, label: '' });
  const [errorState, setErrorState] = useState({ documentId: activeDocumentId, message: null });
  const speakers = useMemo(() => collectTextStructuredWorkspaceSpeakerRegistry(documentTree), [documentTree]);

  if (!documentTree || documentTree.editorModel !== 'structured-v1' || !['conversation', 'mixed'].includes(documentTree.documentType)) return null;

  const newLabel = newLabelState.documentId === activeDocumentId ? newLabelState.value : '';
  const editingId = editState.documentId === activeDocumentId ? editState.id : null;
  const editingLabel = editState.documentId === activeDocumentId ? editState.label : '';
  const errorMessage = errorState.documentId === activeDocumentId ? errorState.message : null;

  const setNewLabel = value => setNewLabelState({ documentId: activeDocumentId, value });
  const setErrorMessage = message => setErrorState({ documentId: activeDocumentId, message: message || null });
  const setEditRow = (id, label) => setEditState({ documentId: activeDocumentId, id: id || null, label: label || '' });
  const clearEditRow = () => setEditState({ documentId: activeDocumentId, id: null, label: '' });

  const runSpeakerCommand = async (command, fallbackMessage) => {
    setErrorMessage(null);
    try {
      const result = await onCommand?.(command);
      if (!result) {
        setErrorMessage(fallbackMessage);
        return null;
      }
      return result;
    } catch (error) {
      setErrorMessage(error?.message || fallbackMessage);
      return null;
    }
  };

  const registerSpeaker = async speaker => {
    if (!speaker?.id || !speaker?.label || isBusy) return null;
    return runSpeakerCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
      payload: {
        documentId: documentTree.id,
        speakerId: speaker.id,
        label: speaker.label,
        segmentIds: speaker.segmentIds || []
      }
    }, 'Could not register speaker.');
  };

  const addSpeaker = async () => {
    const label = clean(newLabel);
    if (!label) {
      setErrorMessage('Speaker label cannot be empty.');
      return null;
    }
    if (isBusy) return null;
    const normalized = normalizeTextStructuredSpeakerKey(label);
    const matchingEntry = speakers.find(entry => normalizeTextStructuredSpeakerKey(entry.label) === normalized) || null;
    if (matchingEntry?.registered) {
      setErrorMessage(`Speaker label “${label}” is already registered.`);
      return null;
    }
    const result = await runSpeakerCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
      payload: {
        documentId: documentTree.id,
        ...(matchingEntry ? { speakerId: matchingEntry.id, segmentIds: matchingEntry.segmentIds || [] } : { requireNew: true }),
        label: matchingEntry ? matchingEntry.label : label
      }
    }, 'Could not register speaker.');
    if (result) setNewLabel('');
    return result;
  };

  const saveRename = async speaker => {
    const label = clean(editingLabel);
    if (!speaker?.id) return null;
    if (!label) {
      setErrorMessage('Speaker label cannot be empty.');
      return null;
    }
    if (isBusy) return null;
    const normalized = normalizeTextStructuredSpeakerKey(label);
    const collision = speakers.find(entry => entry.id !== speaker.id && normalizeTextStructuredSpeakerKey(entry.label) === normalized) || null;
    if (collision) {
      setErrorMessage(
        collision.registered
          ? `Speaker label “${label}” is already registered.`
          : `Speaker label “${label}” is already used in this document.`
      );
      return null;
    }
    const result = await runSpeakerCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER,
      payload: {
        documentId: documentTree.id,
        speakerId: speaker.id,
        label,
        segmentIds: speaker.segmentIds || []
      }
    }, 'Could not rename speaker.');
    if (result) clearEditRow();
    return result;
  };

  const removeSpeaker = async speaker => {
    if (!speaker?.id || isBusy) return null;
    if (speaker.used || !speaker.registered) {
      setErrorMessage(`Speaker “${speaker.label}” is in use and cannot be removed.`);
      return null;
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(`Remove unused speaker “${speaker.label}” from this Workspace registry?`)) return null;
    return runSpeakerCommand({
      type: TEXT_LIBRARY_COMMAND_TYPES.REMOVE_SPEAKER,
      payload: {
        documentId: documentTree.id,
        speakerId: speaker.id
      }
    }, 'Could not remove speaker.');
  };

  return <section className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/15 p-3 space-y-2" data-text-speaker-registry="true">
    <div className="flex items-start gap-2">
      <Users className="mt-0.5 w-4 h-4 shrink-0 text-sky-600 dark:text-sky-300"/>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap"><h4 className="text-[10px] font-black text-slate-700 dark:text-slate-200">Workspace Speaker Registry</h4><span className="text-[7px] font-black rounded bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">SPK_* STABLE ID</span></div>
        <p className="mt-0.5 text-[8px] leading-relaxed text-slate-400">Register speakers once at Workspace level. Conversation Cards reference only the speakers they actually use; Paragraph Cards continue to use narrator rules.</p>
      </div>
    </div>

    <div className={`${compact ? 'grid-cols-1' : 'grid-cols-[1fr_auto]'} grid gap-1.5`}>
      <input value={newLabel} onChange={event => { setNewLabel(event.target.value); if (errorMessage) setErrorMessage(null); }} onKeyDown={event => event.key === 'Enter' && addSpeaker()} disabled={isBusy} placeholder="Add speaker name" className="min-h-10 min-w-0 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 px-2 text-sm md:text-[10px] dark:text-white"/>
      <button type="button" disabled={isBusy || !clean(newLabel)} onClick={addSpeaker} className="min-h-10 rounded-lg bg-sky-600 px-3 text-[9px] font-black text-white disabled:opacity-40"><Plus className="w-3 h-3 inline mr-1"/>Register</button>
    </div>

    {errorMessage && <p className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-600 dark:text-red-300" role="alert">{errorMessage}</p>}

    {speakers.length === 0 ? <p className="rounded-lg border border-dashed border-sky-200 dark:border-sky-900 px-2.5 py-2 text-[8px] text-slate-400">No speakers yet. You can register them here first, or create a Conversation Segment and its stable speaker identity will be registered automatically.</p> : <div className="space-y-1.5">
      {speakers.map(speaker => <div key={speaker.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-2">
        {editingId === speaker.id ? <div className="flex gap-1.5">
          <input value={editingLabel} onChange={event => { setEditRow(speaker.id, event.target.value); if (errorMessage) setErrorMessage(null); }} onKeyDown={event => event.key === 'Enter' && saveRename(speaker)} disabled={isBusy} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm md:text-[10px] dark:text-white"/>
          <button type="button" disabled={isBusy || !clean(editingLabel)} onClick={() => saveRename(speaker)} className="w-10 min-h-10 rounded-lg bg-sky-600 text-white disabled:opacity-40" title="Save speaker name"><Save className="w-3.5 h-3.5 mx-auto"/></button>
          <button type="button" disabled={isBusy} onClick={() => { clearEditRow(); setErrorMessage(null); }} className="w-10 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400" title="Cancel"><X className="w-3.5 h-3.5 mx-auto"/></button>
        </div> : <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[9px] font-black text-slate-700 dark:text-slate-200">{speaker.label}</span><span className={`rounded px-1.5 py-0.5 text-[7px] font-black ${speaker.registered ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-300'}`}>{speaker.registered ? 'REGISTERED' : 'DETECTED'}</span>{speaker.used && <span className="rounded bg-sky-50 dark:bg-sky-950/30 px-1.5 py-0.5 text-[7px] font-black text-sky-600 dark:text-sky-300">USED • {speaker.segmentIds.length}</span>}</div>
            <p className="mt-0.5 truncate font-mono text-[7px] text-slate-400">{speaker.id}</p>
          </div>
          {!speaker.registered && <button type="button" disabled={isBusy} onClick={() => registerSpeaker(speaker)} className="min-h-9 px-2 rounded-lg border border-emerald-200 dark:border-emerald-900 text-[8px] font-black text-emerald-600 dark:text-emerald-300"><UserCheck className="w-3 h-3 inline mr-1"/>Register</button>}
          <button type="button" disabled={isBusy} onClick={() => { setEditRow(speaker.id, speaker.label); setErrorMessage(null); }} className="w-9 min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-sky-600" title="Rename speaker"><Edit3 className="w-3.5 h-3.5 mx-auto"/></button>
          <button type="button" disabled={isBusy || speaker.used || !speaker.registered} onClick={() => removeSpeaker(speaker)} className="w-9 min-h-9 rounded-lg border border-red-200 dark:border-red-900 text-red-500 disabled:opacity-25" title={speaker.used ? 'Used speakers cannot be removed from the registry' : 'Remove unused speaker'}><Trash2 className="w-3.5 h-3.5 mx-auto"/></button>
        </div>}
      </div>)}
    </div>}
  </section>;
};

export default TextStructuredSpeakerRegistry;
