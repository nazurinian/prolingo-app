import React, { useCallback, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Edit3,
  GitMerge,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  X
} from 'lucide-react';
import {
  buildReplacedMetadataWithNote,
  listPreservedMetadataEntries,
  normalizeConversationEditorError,
  swapConversationSceneInCardOrder
} from './conversationEditorErrorUtils.js';
import ConversationTurnSection from './ConversationTurnSection.jsx';
import ConversationSceneAudioPanel from './ConversationSceneAudioPanel.jsx';

const EMPTY_MAP = Object.freeze({});
const clean = value => String(value ?? '').trim();

const EditSceneForm = ({ scene, isBusy, onCommand, onClose }) => {
  const initialNote = typeof scene?.metadata?.note === 'string' ? scene.metadata.note : '';
  const [title, setTitle] = useState(scene?.title || '');
  const [note, setNote] = useState(initialNote);
  const [formError, setFormError] = useState(null);
  const extraMeta = listPreservedMetadataEntries(scene?.metadata, { exclude: ['note'] });

  const handleSave = async () => {
    setFormError(null);
    const payload = {
      id: scene.id,
      title: clean(title) || null
    };
    if (clean(note) !== clean(initialNote)) {
      payload.metadata = buildReplacedMetadataWithNote(scene?.metadata, note);
    }
    try {
      const outcome = await onCommand?.({ type: 'block.update', payload });
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
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-2.5 space-y-2" data-conversation-scene-edit={scene.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-200">Edit Scene Card • {scene.id}</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Close scene edit">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <input
        value={title}
        onChange={event => setTitle(event.target.value)}
        onKeyDown={event => event.key === 'Enter' && handleSave()}
        placeholder="Scene Card title (optional)"
        disabled={isBusy}
        aria-label="Scene Card Title"
        className="w-full min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-base md:text-xs dark:text-white"
      />
      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="Scene metadata note (preserves other keys)"
        disabled={isBusy}
        aria-label="Scene metadata note"
        className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs dark:text-white"
      />
      {extraMeta.length > 0 && (
        <p className="text-[8px] text-slate-400">Preserved Scene metadata keys: {extraMeta.map(e => e.key).join(', ')}</p>
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">Cancel</button>
        <button type="button" disabled={isBusy} onClick={handleSave} className="min-h-9 px-3 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">
          <Save className="w-3 h-3 inline mr-1" />Save Scene
        </button>
      </div>
    </div>
  );
};

const AddTurnForm = ({ scene, speakerOptions = [], isBusy, onCommand, onClose, compact }) => {
  const [speakerChoice, setSpeakerChoice] = useState(() => (speakerOptions[0]?.id || '__none__'));
  const [customSpeaker, setCustomSpeaker] = useState('');
  const [afterUnitId, setAfterUnitId] = useState('');
  const [initialText, setInitialText] = useState('');
  const [initialMeaning, setInitialMeaning] = useState('');
  const [joinAfter, setJoinAfter] = useState('line');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);

  const handleCreate = async () => {
    setFormError(null);
    const payload = { blockId: scene.id };
    if (speakerChoice === '__custom__') {
      const cleanCustom = clean(customSpeaker);
      if (!cleanCustom) {
        setFormError({ code: 'INVALID_COMMAND', message: 'Enter a custom speaker name or select No Speaker.' });
        return;
      }
      payload.speaker = cleanCustom;
    } else if (speakerChoice && speakerChoice !== '__none__') {
      payload.speakerId = speakerChoice;
    }
    if (afterUnitId) {
      payload.afterUnitId = afterUnitId;
    }
    if (clean(initialText)) {
      payload.text = clean(initialText);
      payload.meaning = String(initialMeaning ?? '').trim();
      payload.joinAfter = joinAfter;
    }
    if (clean(note)) {
      payload.metadata = { note: clean(note) };
    }
    try {
      const outcome = await onCommand?.({ type: 'contentUnit.create', payload });
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
    <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 p-3 space-y-2" data-conversation-add-turn={scene.id}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black text-sky-700 dark:text-sky-300">New Speaker Turn in {scene.title || scene.id}</p>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Cancel new turn">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
        <select
          value={speakerChoice}
          onChange={event => { setSpeakerChoice(event.target.value); if (formError) setFormError(null); }}
          disabled={isBusy}
          aria-label="New Turn Speaker"
          className="min-h-10 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        >
          <option value="__none__">No Speaker (Unattributed)</option>
          {speakerOptions.map(entry => (
            <option key={entry.id} value={entry.id}>
              {entry.label}{entry.registered ? '' : ' • detected'}
            </option>
          ))}
          <option value="__custom__">+ Custom / New Speaker…</option>
        </select>
        <select
          value={afterUnitId}
          onChange={event => setAfterUnitId(event.target.value)}
          disabled={isBusy}
          aria-label="Insert Turn Position"
          className="min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        >
          <option value="">Append at end of Scene</option>
          {(scene.turns || []).map((turn, idx) => (
            <option key={turn.id} value={turn.id}>
              After Turn #{idx + 1} ({turn.speaker || 'No Speaker'})
            </option>
          ))}
        </select>
      </div>
      {speakerChoice === '__custom__' && (
        <input
          value={customSpeaker}
          onChange={event => { setCustomSpeaker(event.target.value); if (formError) setFormError(null); }}
          placeholder="Custom speaker label"
          disabled={isBusy}
          aria-label="Custom New Turn Speaker"
          className="w-full min-h-10 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        />
      )}
      <textarea
        value={initialText}
        onChange={event => setInitialText(event.target.value)}
        placeholder="First Sentence Text (leave blank to create an Empty Turn)"
        rows={2}
        disabled={isBusy}
        aria-label="First Sentence Text"
        className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white"
      />
      {clean(initialText) && (
        <>
          <textarea
            value={initialMeaning}
            onChange={event => setInitialMeaning(event.target.value)}
            placeholder="First Sentence Meaning / Translation (optional)"
            rows={2}
            disabled={isBusy}
            aria-label="First Sentence Meaning"
            className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 dark:text-white"
          />
          <select
            value={joinAfter}
            onChange={event => setJoinAfter(event.target.value)}
            disabled={isBusy}
            aria-label="First Sentence joinAfter"
            className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
          >
            <option value="line">joinAfter: line</option>
            <option value="space">joinAfter: space</option>
            <option value="none">joinAfter: none</option>
          </select>
        </>
      )}
      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="Optional Turn metadata note"
        disabled={isBusy}
        aria-label="New Turn metadata note"
        className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
      />
      <div className="flex justify-end gap-1.5">
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">Cancel</button>
        <button type="button" disabled={isBusy} onClick={handleCreate} className="min-h-9 px-3 rounded-lg bg-sky-600 text-white text-[9px] font-black disabled:opacity-40">
          {clean(initialText) ? 'Create Turn + Sentence' : 'Create Empty Turn'}
        </button>
      </div>
    </div>
  );
};

/**
 * Renders one persistent Conversation Scene Card containing Speaker Turns and Sentences.
 */
export const ConversationSceneCard = ({
  scene,
  sceneIndex,
  state,
  cardOrderPeers = null,
  speakerOptions = [],
  hydratedBlock = null,
  scenePlans = null,
  audioEntriesBySegmentChannel = null,
  audioPlayback = null,
  runtimeAudioUrls = EMPTY_MAP,
  onAssembleFullWav = null,
  isBusy = false,
  onCommand,
  compact = false
}) => {
  const [expanded, setExpanded] = useState(true);
  const [editingScene, setEditingScene] = useState(false);
  const [addingTurn, setAddingTurn] = useState(false);
  const [showCompactActions, setShowCompactActions] = useState(false);
  const [selectedTurnIds, setSelectedTurnIds] = useState([]);
  const [mergeError, setMergeError] = useState(null);

  const scenes = cardOrderPeers || state?.scenes || [];
  const turns = scene?.turns || [];
  const preservedEntries = listPreservedMetadataEntries(scene?.metadata);
  const activeSelectedIds = selectedTurnIds.filter(id => turns.some(t => t.id === id));
  const isScenePlaying = Boolean(audioPlayback && (audioPlayback.isPlaying || audioPlayback.isPaused) && audioPlayback.activeBlockId === scene.id);
  const scenePlayable = !scene.empty && Number(scene.sentenceCount) > 0;
  const playSceneFn = audioPlayback?.playScene || null;
  const handlePlaySceneChannel = useCallback((sceneId, ch) => {
    playSceneFn?.(sceneId, { playbackChannelMode: ch === 'meaning' ? 'meaning-only' : 'text-only' });
  }, [playSceneFn]);

  const toggleSelectTurn = turnId => {
    setMergeError(null);
    setSelectedTurnIds(prev => (
      prev.includes(turnId) ? prev.filter(id => id !== turnId) : [...prev, turnId]
    ));
  };

  const handleReorderScene = async direction => {
    const orderedIds = swapConversationSceneInCardOrder(state?.cardOrderIds, scenes, scene.id, direction);
    if (!orderedIds || isBusy) return;
    await onCommand?.({
      type: 'block.reorder',
      payload: { documentId: state.workspace.id, orderedIds }
    });
  };

  const handleDeleteScene = async () => {
    if (isBusy) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Delete Scene Card ${scene.id} (${scene.turnCount} turn(s), ${scene.sentenceCount} sentence(s))?`)) return;
    }
    await onCommand?.({
      type: 'block.delete',
      payload: { id: scene.id }
    });
  };

  const handleMergeSelectedTurns = async () => {
    if (activeSelectedIds.length < 2 || isBusy) return;
    setMergeError(null);
    const orderedSelection = turns.filter(t => activeSelectedIds.includes(t.id)).map(t => t.id);
    try {
      const outcome = await onCommand?.({
        type: 'contentUnit.merge',
        payload: { ids: orderedSelection }
      });
      if (!outcome?.ok) {
        if (outcome?.error) setMergeError(outcome.error);
        return;
      }
      setSelectedTurnIds([]);
    } catch (error) {
      setMergeError(normalizeConversationEditorError(error));
    }
  };

  return (
    <article
      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
      data-conversation-scene-id={scene.id}
    >
      <div className="flex items-center gap-2 p-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className={`${compact ? 'w-10 h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-indigo-600 active:scale-95 transition`}
          aria-expanded={expanded}
          aria-label={`Toggle Scene ${scene.id}`}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">#{sceneIndex + 1}</span>
            <h4 className="text-xs font-black text-slate-800 dark:text-white truncate">{scene.title || 'Untitled Scene Card'}</h4>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">SCENE</span>
            {scene.empty && (
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">ZERO UNITS</span>
            )}
            {isScenePlaying && (
              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full text-white ${audioPlayback?.isPaused ? 'bg-amber-500' : 'bg-indigo-600'}`}>
                {audioPlayback?.isPaused ? 'PAUSED' : `PLAYING ${audioPlayback?.speakingPart === 'meaning' ? 'ID' : 'EN'} • ${audioPlayback?.config?.playbackRepresentationMode === 'full' ? 'FULL' : 'SPLIT'}`}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex gap-2 flex-wrap text-[8px] text-slate-400">
            {!compact && <span className="font-mono">{scene.id}</span>}
            <span>{scene.turnCount} turn{scene.turnCount === 1 ? '' : 's'}</span>
            <span>{scene.sentenceCount} sentence{scene.sentenceCount === 1 ? '' : 's'}</span>
            {scene.metadata?.note && <span className="text-slate-600 dark:text-slate-300">Note: {scene.metadata.note}</span>}
            {!compact && preservedEntries.filter(e => e.key !== 'note').length > 0 && (
              <span>meta: {preservedEntries.filter(e => e.key !== 'note').map(e => e.key).join(', ')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {typeof audioPlayback?.playScene === 'function' && (
            <button
              type="button"
              disabled={isBusy || (!isScenePlaying && !scenePlayable)}
              onClick={() => audioPlayback.playScene(scene.id)}
              className={`${compact ? 'w-9 h-9' : 'w-8 h-8'} flex items-center justify-center rounded-full border transition disabled:opacity-30 ${
                isScenePlaying
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-indigo-200 dark:border-indigo-800 bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
              title={isScenePlaying ? 'Stop Scene playback' : 'Play this Scene Card'}
              aria-label={isScenePlaying ? `Stop Scene ${scene.id}` : `Play Scene ${scene.id}`}
            >
              {isScenePlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>
          )}
          {compact ? (
            <button
              type="button"
              onClick={() => setShowCompactActions(value => !value)}
              className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition active:scale-95 ${showCompactActions ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-indigo-600'}`}
              aria-expanded={showCompactActions}
              aria-label="Scene actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-0.5">
              <button type="button" disabled={isBusy || sceneIndex === 0} onClick={() => handleReorderScene(-1)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25" title="Move Scene up" aria-label={`Move Scene ${scene.id} up`}><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" disabled={isBusy || sceneIndex === scenes.length - 1} onClick={() => handleReorderScene(1)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25" title="Move Scene down" aria-label={`Move Scene ${scene.id} down`}><ArrowDown className="w-3.5 h-3.5" /></button>
              <button type="button" disabled={isBusy} onClick={() => { setEditingScene(v => !v); setExpanded(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-40" title="Edit Scene title or metadata" aria-label={`Edit Scene ${scene.id}`}><Edit3 className="w-3.5 h-3.5" /></button>
              <button type="button" disabled={isBusy} onClick={handleDeleteScene} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-40" title="Delete Scene" aria-label={`Delete Scene ${scene.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {compact && showCompactActions && (
        <div className="grid grid-cols-4 gap-1 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2" data-conversation-mobile-scene-actions="true">
          <button type="button" disabled={isBusy || sceneIndex === 0} onClick={() => handleReorderScene(-1)} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-25"><ArrowUp className="w-3.5 h-3.5 mx-auto mb-0.5" />Up</button>
          <button type="button" disabled={isBusy || sceneIndex === scenes.length - 1} onClick={() => handleReorderScene(1)} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-25"><ArrowDown className="w-3.5 h-3.5 mx-auto mb-0.5" />Down</button>
          <button type="button" disabled={isBusy} onClick={() => { setEditingScene(v => !v); setExpanded(true); setShowCompactActions(false); }} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-40"><Edit3 className="w-3.5 h-3.5 mx-auto mb-0.5" />Edit</button>
          <button type="button" disabled={isBusy} onClick={handleDeleteScene} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-red-500 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5 mx-auto mb-0.5" />Delete</button>
        </div>
      )}

      {expanded && (
        <div className="p-3 space-y-3">
          {scenePlans && (
            <ConversationSceneAudioPanel
              scene={scene}
              hydratedBlock={hydratedBlock}
              documentTitle={state?.workspace?.title || 'Conversation'}
              scenePlans={scenePlans}
              failedVariantIds={audioPlayback?.failedVariantIds}
              playbackChannelMode={audioPlayback?.config?.playbackChannelMode}
              globalPlaybackRate={audioPlayback?.config?.globalPlaybackRate}
              runtimeAudioUrls={runtimeAudioUrls}
              isBusy={isBusy}
              onAssembleFullWav={onAssembleFullWav}
              onPlaySceneChannel={playSceneFn ? handlePlaySceneChannel : null}
            />
          )}

          {editingScene && (
            <EditSceneForm
              key={`${scene.id}-${scene.updatedAt}`}
              scene={scene}
              isBusy={isBusy}
              onCommand={onCommand}
              onClose={() => setEditingScene(false)}
            />
          )}

          {activeSelectedIds.length > 0 && (
            <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/25 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] font-bold text-sky-800 dark:text-sky-200">
                {activeSelectedIds.length} Turn{activeSelectedIds.length === 1 ? '' : 's'} selected
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy || activeSelectedIds.length < 2}
                  onClick={handleMergeSelectedTurns}
                  className="min-h-8 px-2.5 rounded-lg bg-sky-600 text-white text-[9px] font-black disabled:opacity-40"
                >
                  <GitMerge className="w-3 h-3 inline mr-1" />Merge Selected Turns
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedTurnIds([]); setMergeError(null); }}
                  className="min-h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] text-slate-500"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {mergeError && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2.5 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
              <span className="font-mono uppercase mr-1">{mergeError.code}</span> {mergeError.message}
            </div>
          )}

          {scene.empty ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-6 px-4 text-center">
              <MessageSquare className="w-5 h-5 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-1.5 text-[10px] font-bold text-slate-500">Empty Scene Card ({scene.id})</p>
              <p className="mt-0.5 text-[8px] text-slate-400">Zero Turns persisted. Add a Speaker Turn explicitly when ready.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {turns.map((turn, turnIndex) => (
                <ConversationTurnSection
                  key={turn.id}
                  turn={turn}
                  turnIndex={turnIndex}
                  scene={scene}
                  nextTurn={turns[turnIndex + 1] || null}
                  speakerOptions={speakerOptions}
                  selectedForMerge={activeSelectedIds.includes(turn.id)}
                  onToggleMergeSelect={toggleSelectTurn}
                  audioEntriesBySegmentChannel={audioEntriesBySegmentChannel}
                  audioPlayback={audioPlayback}
                  isBusy={isBusy}
                  onCommand={onCommand}
                  compact={compact}
                />
              ))}
            </div>
          )}

          {addingTurn ? (
            <AddTurnForm
              key={`${scene.id}-add-turn`}
              scene={scene}
              speakerOptions={speakerOptions}
              isBusy={isBusy}
              onCommand={onCommand}
              onClose={() => setAddingTurn(false)}
              compact={compact}
            />
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setAddingTurn(true)}
              className="w-full min-h-10 py-2 rounded-xl border border-dashed border-sky-300 dark:border-sky-800 text-sky-600 dark:text-sky-300 text-[10px] font-black disabled:opacity-40 active:scale-[0.99] transition"
            >
              <Plus className="w-3 h-3 inline mr-1" />Add Speaker Turn
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default ConversationSceneCard;
