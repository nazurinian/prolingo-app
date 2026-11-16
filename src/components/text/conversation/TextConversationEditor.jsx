import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Layers,
  MessageSquare,
  Plus,
  Sparkles,
  X
} from 'lucide-react';
import {
  applyTextConversationEditorCommand,
  selectTextConversationEditorState,
  TextConversationEditorError
} from '../../../domain/text/textConversationEditorDomain.js';
import {
  collectConversationEditorSpeakers,
  normalizeConversationEditorError
} from './conversationEditorErrorUtils.js';
import ConversationSpeakerPanel from './ConversationSpeakerPanel.jsx';
import ConversationSceneCard from './ConversationSceneCard.jsx';

const clean = value => String(value ?? '').trim();

const formatErrorDetails = details => {
  if (details == null) return '';
  try {
    const raw = JSON.stringify(details);
    return raw.length > 260 ? `${raw.slice(0, 257)}...` : raw;
  } catch {
    return String(details);
  }
};

const ensureNormalizedError = error => {
  if (!error) return null;
  if (typeof error === 'object' && error.code && error.recovery && error.title) return error;
  return normalizeConversationEditorError(error);
};

const AddSceneForm = ({ workspaceId, isBusy, onCommand, onClose }) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);

  const handleCreate = async () => {
    setFormError(null);
    const payload = {
      documentId: workspaceId,
      title: clean(title) || null
    };
    if (clean(note)) {
      payload.metadata = { note: clean(note) };
    }
    try {
      const outcome = await onCommand?.({ type: 'block.create', payload });
      if (!outcome?.ok) {
        if (outcome?.error) setFormError(outcome.error);
        return;
      }
      onClose?.();
    } catch (error) {
      setFormError(normalizeConversationEditorError(error));
    }
  };

  return (
    <div
      className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2"
      data-conversation-add-scene="true"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">
          New Conversation Scene Card
        </p>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Cancel add scene card">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2.5 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300"
          role="alert"
        >
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <input
        value={title}
        onChange={event => { setTitle(event.target.value); if (formError) setFormError(null); }}
        onKeyDown={event => event.key === 'Enter' && handleCreate()}
        placeholder="Scene Card title (optional — empty Scenes persist cleanly)"
        disabled={isBusy}
        aria-label="New Scene Card Title"
        className="w-full min-h-10 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-3 text-base md:text-xs dark:text-white"
      />
      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="Scene metadata note (optional)"
        disabled={isBusy}
        aria-label="New Scene metadata note"
        className="w-full min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs dark:text-white"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={onClose}
          className="min-h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={handleCreate}
          className="min-h-9 px-3.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40"
        >
          <Plus className="w-3 h-3 inline mr-1" />Create Scene Card
        </button>
      </div>
    </div>
  );
};

/**
 * Controlled Conversation Scene -> Speaker Turn -> Sentence Editor UI backed purely by D4-A selectors and commands.
 */
const ConversationEditorSession = ({
  snapshot,
  documentId = null,
  onCommand = null,
  onStateChange = null,
  compact = false,
  isBusy: externalBusy = false,
  workspaceOptions = null,
  onSelectWorkspace = null,
  error = null,
  onClearError = null,
  lastReceipt = null
}) => {
  const [localError, setLocalError] = useState(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const activeRef = useRef(true);
  const isBusy = externalBusy || pending;
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const [addingSceneWorkspaceId, setAddingSceneWorkspaceId] = useState(null);
  const [focusedSceneState, setFocusedSceneState] = useState({ workspaceId: null, sceneId: null });

  const eligibleWorkspaces = useMemo(() => {
    if (Array.isArray(workspaceOptions)) return workspaceOptions;
    const docs = Object.values(snapshot?.documents || {});
    return docs
      .filter(doc => doc?.editorModel === 'structured-v1' && (doc.documentType === 'conversation' || doc.documentType === 'mixed'))
      .map(doc => ({
        id: doc.id,
        uid: doc.uid || doc.id,
        title: doc.title || doc.id,
        documentType: doc.documentType,
        textLanguage: doc.textLanguage || 'en',
        meaningLanguage: doc.meaningLanguage || 'id'
      }));
  }, [snapshot, workspaceOptions]);

  const selection = useMemo(() => {
    try {
      const state = selectTextConversationEditorState(snapshot, documentId ? { documentId } : undefined);
      return { state, fatalError: null };
    } catch (caught) {
      return { state: null, fatalError: normalizeConversationEditorError(caught) };
    }
  }, [snapshot, documentId]);

  const state = selection.state;
  const workspaceId = state?.workspace?.id || null;
  const speakerOptions = useMemo(() => (state ? collectConversationEditorSpeakers(state) : []), [state]);

  const activeError = ensureNormalizedError(error) || localError;
  const addingScene = Boolean(workspaceId && addingSceneWorkspaceId === workspaceId);
  const activeFocusedSceneId = (
    workspaceId &&
    focusedSceneState.workspaceId === workspaceId &&
    (state?.scenes || []).some(scene => scene.id === focusedSceneState.sceneId)
  ) ? focusedSceneState.sceneId : null;

  const dismissBannerError = () => {
    setLocalError(null);
    onClearError?.();
  };

  const handleCommand = async command => {
    if (isBusy || pendingRef.current) {
      const busyError = normalizeConversationEditorError({
        code: 'INVALID_COMMAND',
        message: 'Conversation editor is currently processing another command.'
      });
      return { ok: false, error: busyError };
    }
    pendingRef.current = true;
    setPending(true);
    try {
      dismissBannerError();
      if (typeof onCommand === 'function') {
        const outcome = await onCommand({ ...command, documentId: workspaceId || documentId || null });
        if (!activeRef.current) return { ok: false };
        if (outcome?.ok === false) {
          const norm = ensureNormalizedError(outcome.error) || normalizeConversationEditorError({
            code: 'COMMAND_REJECTED',
            message: 'Conversation edit command was rejected.'
          });
          setLocalError(norm);
          return { ok: false, error: norm };
        }
        if (!outcome || typeof outcome !== 'object' || (outcome.ok !== undefined && outcome.ok !== true)
          || outcome.error || !outcome.snapshot || !outcome.result || typeof outcome.result !== 'object'
          || Array.isArray(outcome.result) || outcome.result.documentId !== workspaceId
          || typeof outcome.result.action !== 'string' || typeof outcome.result.entity !== 'string') {
          throw new TextConversationEditorError('COMMAND_REJECTED', 'Command callback must return a valid D4-A outcome or an explicit failure.');
        }
        const nextState = selectTextConversationEditorState(outcome.snapshot, { documentId: workspaceId });
        if (nextState.workspace.uid !== state.workspace.uid) {
          throw new TextConversationEditorError('COMMAND_REJECTED', 'Command callback returned a different Workspace identity.');
        }
        const validated = { ...outcome, state: nextState, ok: true };
        await onStateChange?.(validated);
        return activeRef.current ? validated : { ok: false };
      }
      if (typeof onStateChange !== 'function') {
        throw new TextConversationEditorError('COMMAND_REJECTED', 'An isolated state receiver is required to apply editor commands.');
      }
      const outcome = applyTextConversationEditorCommand(
        snapshot,
        command,
        workspaceId ? { documentId: workspaceId } : undefined
      );
      await onStateChange(outcome);
      return activeRef.current ? { ok: true, ...outcome } : { ok: false };
    } catch (caught) {
      const norm = normalizeConversationEditorError(caught);
      if (activeRef.current) setLocalError(norm);
      return { ok: false, error: norm };
    } finally {
      pendingRef.current = false;
      if (activeRef.current) setPending(false);
    }
  };

  if (selection.fatalError) {
    const fatal = selection.fatalError;
    const isWorkspaceSwitchable = fatal.code === 'WORKSPACE_NOT_FOUND' || fatal.code === 'UNSUPPORTED_WORKSPACE';
    const detailText = formatErrorDetails(fatal.details);
    const toneClass = fatal.tone === 'amber'
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
      : 'border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-red-900 dark:text-red-200';

    return (
      <section
        className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${toneClass}`}
        role="alert"
        data-conversation-editor-fatal-error={fatal.code}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-900/70 border border-current/20 font-mono text-[9px] font-black uppercase">
                {fatal.code}
              </span>
              <h2 className="text-sm font-black">{fatal.title}</h2>
            </div>
            <p className="text-xs font-medium">{fatal.message}</p>
            <p className="text-[10px] opacity-85">{fatal.recovery}</p>
            {detailText && (
              <pre className="mt-1 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-current/15 px-2.5 py-1.5 text-[9px] font-mono overflow-x-auto">
                {detailText}
              </pre>
            )}
          </div>
        </div>
        {isWorkspaceSwitchable && eligibleWorkspaces.length > 0 && typeof onSelectWorkspace === 'function' && (
          <div className="pt-2 border-t border-current/15 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-wide">Eligible Conversation / Mixed Workspaces</p>
            <div className="flex flex-wrap gap-1.5">
              {eligibleWorkspaces.map(doc => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => { dismissBannerError(); onSelectWorkspace(doc.id); }}
                  className="min-h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[10px] font-bold hover:border-indigo-400"
                >
                  {doc.title} • {doc.documentType} ({doc.id})
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  const workspace = state.workspace;
  const scenes = state.scenes || [];
  const sceneIdSet = new Set(scenes.map(scene => scene.id));
  const sceneIndexById = new Map(scenes.map((scene, index) => [scene.id, index]));
  const visibleScenes = activeFocusedSceneId
    ? scenes.filter(scene => scene.id === activeFocusedSceneId)
    : scenes;
  const isMixed = workspace.documentType === 'mixed';

  return (
    <div
      className={compact ? 'space-y-2.5' : 'space-y-3.5'}
      data-conversation-editor="true"
      data-conversation-workspace-id={workspace.id}
    >
      <header className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-sm space-y-2.5">
        <div className={`flex ${compact ? 'flex-col' : 'items-start justify-between'} gap-2.5`}>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wider">
                <MessageSquare className="w-3 h-3" />
                {isMixed ? 'Mixed Workspace • Scenes' : 'Conversation Workspace'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase">
                {workspace.textLanguage || 'en'} → {workspace.meaningLanguage || 'id'}
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {workspace.id}{workspace.uid ? ` • ${workspace.uid}` : ''}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
              {workspace.title || workspace.id}
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Hierarchy: Scene Card → Speaker Turn → Sentence ({state.counts.scenes} Scene{state.counts.scenes === 1 ? '' : 's'} • {state.counts.turns} Turn{state.counts.turns === 1 ? '' : 's'} • {state.counts.sentences} Sentence{state.counts.sentences === 1 ? '' : 's'})
            </p>
          </div>

          <div className={`flex items-center gap-1.5 flex-wrap ${compact ? 'w-full' : 'shrink-0'}`}>
            {eligibleWorkspaces.length > 0 && typeof onSelectWorkspace === 'function' && (
              <select
                value={workspace.id}
                onChange={event => { dismissBannerError(); onSelectWorkspace(event.target.value); }}
                aria-label="Conversation Workspace Selector"
                className={`${compact ? 'flex-1' : ''} min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200`}
              >
                {eligibleWorkspaces.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title} • {doc.documentType}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setAddingSceneWorkspaceId(addingScene ? null : workspace.id)}
              className="min-h-10 px-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40 active:scale-95 transition"
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" />Scene Card
            </button>
          </div>
        </div>

        {isMixed && Array.isArray(state.cardOrderIds) && state.cardOrderIds.length > 0 && (
          <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/70 bg-violet-50/40 dark:bg-violet-950/20 px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-[9px] font-black text-violet-700 dark:text-violet-300">
              <Layers className="w-3 h-3" />
              Mixed Workspace Card Order ({state.cardOrderIds.length} cards preserved)
            </div>
            <div className="flex flex-wrap gap-1" data-mixed-card-order={state.cardOrderIds.join(',')}>
              {state.cardOrderIds.map((cardId, idx) => {
                const isScene = sceneIdSet.has(cardId);
                return (
                  <span
                    key={cardId}
                    className={`px-1.5 py-0.5 rounded-md font-mono text-[8px] font-bold ${
                      isScene
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-200'
                        : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {idx + 1}. {isScene ? `Scene:${cardId}` : `Paragraph/Other:${cardId}`}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {scenes.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <button
              type="button"
              onClick={() => setFocusedSceneState({ workspaceId: workspace.id, sceneId: null })}
              className={`min-h-8 px-2.5 rounded-full text-[9px] font-black transition ${
                activeFocusedSceneId === null
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              All Scenes ({scenes.length})
            </button>
            {scenes.map((scene, idx) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => setFocusedSceneState({ workspaceId: workspace.id, sceneId: scene.id })}
                className={`min-h-8 px-2.5 rounded-full text-[9px] font-bold transition ${
                  activeFocusedSceneId === scene.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {idx + 1}. {scene.title || scene.id} ({scene.turnCount ?? (scene.turns || []).length})
              </button>
            ))}
          </div>
        )}

        {lastReceipt?.commandType && (
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Last committed: <code className="font-mono">{lastReceipt.commandType}</code></span>
          </div>
        )}
      </header>

      {activeError && (
        <div
          className={`rounded-2xl border px-3.5 py-2.5 flex items-start justify-between gap-2.5 ${
            activeError.tone === 'amber'
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
              : 'border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 text-red-900 dark:text-red-200'
          }`}
          role="alert"
          data-conversation-error-code={activeError.code}
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/70">
                  {activeError.code}
                </span>
                <span className="text-[11px] font-black">{activeError.title}</span>
              </div>
              <p className="text-[10px] font-bold">{activeError.message}</p>
              <p className="text-[9px] opacity-85">{activeError.recovery}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissBannerError}
            className="p-1.5 opacity-70 hover:opacity-100 shrink-0"
            aria-label="Dismiss error banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {addingScene && (
        <AddSceneForm
          key={`${workspace.id}-add-scene`}
          workspaceId={workspace.id}
          isBusy={isBusy}
          onCommand={handleCommand}
          onClose={() => setAddingSceneWorkspaceId(null)}
        />
      )}

      <ConversationSpeakerPanel
        state={state}
        isBusy={isBusy}
        onCommand={handleCommand}
        compact={compact}
      />

      {state.empty ? (
        <div
          className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 py-8 px-4 text-center space-y-2"
          data-conversation-empty-workspace={workspace.id}
        >
          <BookOpen className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-black text-slate-700 dark:text-slate-200">
            Empty Conversation Workspace ({workspace.title || workspace.id})
          </p>
          <p className="text-[10px] text-slate-500 max-w-md mx-auto">
            Zero Scene Cards are persisted. Create a Scene Card explicitly to begin authoring Speaker Turns and Sentences.
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setAddingSceneWorkspaceId(workspace.id)}
            className="min-h-10 px-4 rounded-xl bg-indigo-600 text-white text-[10px] font-black"
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />Create First Scene Card
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleScenes.map(scene => (
            <ConversationSceneCard
              key={scene.id}
              scene={scene}
              sceneIndex={sceneIndexById.get(scene.id) ?? 0}
              state={state}
              speakerOptions={speakerOptions}
              isBusy={isBusy}
              onCommand={handleCommand}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// UID scopes local React state to this fixture/Workspace incarnation, not reused local IDs.
export const TextConversationEditor = props => {
  const id = props.documentId || props.snapshot?.activeDocumentId || '';
  const documents = Array.isArray(props.snapshot?.documents) ? props.snapshot.documents : [];
  const document = documents.find(item => item?.id === id);
  return <ConversationEditorSession key={`${id}:${document?.uid || ''}`} {...props} />;
};

export default TextConversationEditor;
