import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  GitMerge,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  User,
  X
} from 'lucide-react';
import {
  buildReplacedMetadataWithNote,
  canMergeTurnsPair,
  listPreservedMetadataEntries,
  normalizeConversationEditorError,
  swapArrayIds
} from './conversationEditorErrorUtils.js';
import ConversationSentenceItem from './ConversationSentenceItem.jsx';

const clean = value => String(value ?? '').trim();

export const AddSentenceForm = ({ sceneId, turn, isBusy, onCommand, onClose, compact }) => {
  const [text, setText] = useState('');
  const [meaning, setMeaning] = useState('');
  const [joinAfter, setJoinAfter] = useState('line');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);

  const handleCreate = async () => {
    setFormError(null);
    const cleanText = clean(text);
    if (!cleanText) {
      setFormError({ code: 'INVALID_COMMAND', message: 'Sentence Text (EN) cannot be empty.' });
      return;
    }
    const payload = {
      blockId: sceneId,
      unitId: turn.id,
      text: cleanText,
      meaning: String(meaning ?? '').trim(),
      joinAfter
    };
    if (clean(note)) {
      payload.metadata = { note: clean(note) };
    }
    try {
      const outcome = await onCommand?.({ type: 'segment.create', payload });
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
      className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 space-y-2"
      data-conversation-add-sentence={turn.id}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black text-indigo-700 dark:text-indigo-300">
          Add Sentence to {turn.kind === 'paragraph' ? 'Section' : `${turn.speaker || 'Unattributed'} Turn`} ({turn.id})
        </p>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Cancel add sentence">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <textarea
        value={text}
        onChange={event => { setText(event.target.value); if (formError) setFormError(null); }}
        placeholder="Sentence Text / English"
        rows={compact ? 3 : 2}
        disabled={isBusy}
        aria-label="New Sentence Text"
        className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"
      />
      <textarea
        value={meaning}
        onChange={event => setMeaning(event.target.value)}
        placeholder="Meaning / Translation (optional)"
        rows={2}
        disabled={isBusy}
        aria-label="New Sentence Meaning"
        className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 dark:text-white resize-y"
      />
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
        <select
          value={joinAfter}
          onChange={event => setJoinAfter(event.target.value)}
          disabled={isBusy}
          aria-label="New Sentence joinAfter"
          className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        >
          <option value="line">joinAfter: line</option>
          <option value="space">joinAfter: space</option>
          <option value="none">joinAfter: none</option>
        </select>
        <input
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={isBusy}
          placeholder="Optional metadata note"
          aria-label="New Sentence metadata note"
          className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">
          Cancel
        </button>
        <button type="button" disabled={isBusy} onClick={handleCreate} className="min-h-9 px-3 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">
          <Plus className="w-3 h-3 inline mr-1" />Add Sentence
        </button>
      </div>
    </div>
  );
};

const EditTurnPanel = ({ turn, speakerOptions = [], isBusy, onCommand, onClose }) => {
  const initialChoice = turn?.speakerId && speakerOptions.some(s => s.id === turn.speakerId)
    ? turn.speakerId
    : turn?.speaker
      ? '__custom__'
      : '__none__';
  const initialNote = typeof turn?.metadata?.note === 'string' ? turn.metadata.note : '';

  const [speakerChoice, setSpeakerChoice] = useState(initialChoice);
  const [customSpeaker, setCustomSpeaker] = useState(initialChoice === '__custom__' ? (turn?.speaker || '') : '');
  const [note, setNote] = useState(initialNote);
  const [formError, setFormError] = useState(null);

  const extraMeta = listPreservedMetadataEntries(turn?.metadata, { exclude: ['note'] });

  const handleSave = async () => {
    setFormError(null);
    const payload = { id: turn.id };

    if (speakerChoice === '__none__') {
      if (turn?.speakerId || turn?.speaker) {
        payload.resetSpeaker = true;
      }
    } else if (speakerChoice === '__custom__') {
      const cleanCustom = clean(customSpeaker);
      if (!cleanCustom) {
        setFormError({ code: 'INVALID_COMMAND', message: 'Enter a speaker name or choose Reset / No Speaker.' });
        return;
      }
      payload.speaker = cleanCustom;
    } else if (speakerChoice !== turn?.speakerId) {
      payload.speakerId = speakerChoice;
    }

    if (clean(note) !== clean(initialNote)) {
      payload.metadata = buildReplacedMetadataWithNote(turn?.metadata, note);
    }

    try {
      const outcome = await onCommand?.({ type: 'contentUnit.update', payload });
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
    <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/25 p-2.5 space-y-2" data-conversation-turn-edit={turn.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black text-sky-700 dark:text-sky-300">Reassign Speaker / Turn Metadata • {turn.id}</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Close edit turn">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <select
        value={speakerChoice}
        onChange={event => { setSpeakerChoice(event.target.value); if (formError) setFormError(null); }}
        disabled={isBusy}
        aria-label="Turn Speaker Choice"
        className="w-full min-h-10 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
      >
        <option value="__none__">No Speaker (Reset speaker attribution)</option>
        {speakerOptions.map(entry => (
          <option key={entry.id} value={entry.id}>
            {entry.label}{entry.registered ? '' : ' • detected'}
          </option>
        ))}
        <option value="__custom__">+ Custom / New Speaker Name…</option>
      </select>
      {speakerChoice === '__custom__' && (
        <input
          value={customSpeaker}
          onChange={event => { setCustomSpeaker(event.target.value); if (formError) setFormError(null); }}
          placeholder="Custom speaker name"
          disabled={isBusy}
          aria-label="Custom Turn Speaker"
          className="w-full min-h-10 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        />
      )}
      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="Turn metadata note (preserves other keys)"
        disabled={isBusy}
        aria-label="Turn metadata note"
        className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
      />
      {extraMeta.length > 0 && (
        <p className="text-[8px] text-slate-400">Preserved Turn metadata keys: {extraMeta.map(e => e.key).join(', ')}</p>
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">Cancel</button>
        <button type="button" disabled={isBusy} onClick={handleSave} className="min-h-9 px-3 rounded-lg bg-sky-600 text-white text-[9px] font-black disabled:opacity-40">
          <Save className="w-3 h-3 inline mr-1" />Save Turn
        </button>
      </div>
    </div>
  );
};

/**
 * Renders one persistent Speaker Turn inside a Conversation Scene Card.
 */
export const ConversationTurnSection = ({
  turn,
  turnIndex,
  scene,
  nextTurn = null,
  speakerOptions = [],
  selectedForMerge = false,
  onToggleMergeSelect,
  audioEntriesBySegmentChannel = null,
  audioPlayback = null,
  isBusy = false,
  onCommand,
  compact = false
}) => {
  const [editingTurn, setEditingTurn] = useState(false);
  const [addingSentence, setAddingSentence] = useState(false);
  const turns = scene?.turns || [];
  const canMergeWithNext = Boolean(nextTurn && canMergeTurnsPair(turn, nextTurn));
  const preservedEntries = listPreservedMetadataEntries(turn?.metadata);

  const handleReorderTurn = async direction => {
    const orderedIds = swapArrayIds(turns.map(item => item.id), turn.id, direction);
    if (!orderedIds || isBusy) return;
    await onCommand?.({
      type: 'contentUnit.reorder',
      payload: { blockId: scene.id, orderedIds }
    });
  };

  const handleMergeWithNextTurn = async () => {
    if (!canMergeWithNext || isBusy) return;
    await onCommand?.({
      type: 'contentUnit.merge',
      payload: { ids: [turn.id, nextTurn.id] }
    });
  };

  const handleDeleteTurn = async () => {
    if (isBusy) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Delete Turn ${turn.id}${turn.sentenceCount > 0 ? ` and its ${turn.sentenceCount} sentence(s)` : ''}?`)) return;
    }
    await onCommand?.({
      type: 'contentUnit.delete',
      payload: { id: turn.id }
    });
  };

  return (
    <div
      className="rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-sky-50/25 dark:bg-slate-900/50 overflow-hidden"
      data-conversation-turn-id={turn.id}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50/70 dark:bg-sky-950/30 border-b border-sky-100 dark:border-sky-900/60">
        <input
          type="checkbox"
          checked={selectedForMerge}
          disabled={isBusy}
          onChange={() => onToggleMergeSelect?.(turn.id)}
          aria-label={`Select Turn ${turn.id} for merge`}
          className="h-4 w-4 accent-sky-600 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">Turn #{turnIndex + 1}</span>
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black ${turn.speaker ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
              <User className="w-2.5 h-2.5" />
              {turn.speaker || 'No Speaker'}
            </span>
            {turn.empty && (
              <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[7px] font-black text-amber-800 dark:text-amber-300">
                EMPTY TURN
              </span>
            )}
            <span className="text-[8px] font-bold text-slate-400">
              {turn.sentenceCount} sentence{turn.sentenceCount === 1 ? '' : 's'}
            </span>
            {!compact && <span className="text-[8px] font-mono text-slate-400">{turn.id}</span>}
          </div>
          {(preservedEntries.length > 0 || turn.speakerId) && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[7px] text-slate-400">
              {turn.speakerId && <span className="font-mono">{turn.speakerId}</span>}
              {turn.metadata?.note && <span className="text-slate-600 dark:text-slate-300">Note: {turn.metadata.note}</span>}
              {!compact && preservedEntries.filter(e => e.key !== 'note').length > 0 && (
                <span>meta: {preservedEntries.filter(e => e.key !== 'note').map(e => e.key).join(', ')}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isBusy || turnIndex === 0}
            onClick={() => handleReorderTurn(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-sky-600 disabled:opacity-25"
            title="Move Turn up"
            aria-label={`Move Turn ${turn.id} up`}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={isBusy || turnIndex === turns.length - 1}
            onClick={() => handleReorderTurn(1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-sky-600 disabled:opacity-25"
            title="Move Turn down"
            aria-label={`Move Turn ${turn.id} down`}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setEditingTurn(value => !value)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-sky-600 disabled:opacity-40"
            title="Reassign Speaker or Edit Turn Metadata"
            aria-label={`Edit Turn ${turn.id}`}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          {canMergeWithNext && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleMergeWithNextTurn}
              className="px-2 h-8 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 text-[8px] font-black text-sky-700 dark:text-sky-300"
              title="Merge this Turn with the next identical-speaker Turn"
            >
              <GitMerge className="w-3 h-3 inline mr-0.5" />{!compact && 'Merge Next'}
            </button>
          )}
          <button
            type="button"
            disabled={isBusy}
            onClick={handleDeleteTurn}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-red-400 hover:text-red-600 disabled:opacity-40"
            title="Delete Turn"
            aria-label={`Delete Turn ${turn.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        {editingTurn && (
          <EditTurnPanel
            key={`${turn.id}-${turn.updatedAt}`}
            turn={turn}
            speakerOptions={speakerOptions}
            isBusy={isBusy}
            onCommand={onCommand}
            onClose={() => setEditingTurn(false)}
          />
        )}

        {turn.empty ? (
          <div className="rounded-xl border border-dashed border-sky-200 dark:border-sky-900 bg-white/60 dark:bg-slate-900/30 py-4 px-3 text-center">
            <MessageSquare className="w-4 h-4 mx-auto text-sky-300 dark:text-sky-700" />
            <p className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Empty Turn preserved ({turn.id})</p>
            <p className="mt-0.5 text-[8px] text-slate-400">No placeholder Sentences created. Add a Sentence or move an existing Sentence here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {turn.sentences.map((sentence, sentenceIndex) => {
              const audioEntries = audioEntriesBySegmentChannel
                ? {
                    text: audioEntriesBySegmentChannel[`${sentence.id}::text`] || null,
                    meaning: audioEntriesBySegmentChannel[`${sentence.id}::meaning`] || null
                  }
                : null;
              const isSessionActive = Boolean(audioPlayback && (audioPlayback.isPlaying || audioPlayback.isPaused));
              const isPlayingSentence = isSessionActive && audioPlayback?.playingIndex === sentence.id;
              const isCursorSentence = Boolean(audioPlayback?.currentIndex === sentence.id && !isPlayingSentence);
              return (
                <ConversationSentenceItem
                  key={sentence.id}
                  sentence={sentence}
                  sentenceIndex={sentenceIndex}
                  turn={turn}
                  sceneTurns={turns}
                  nextSentence={turn.sentences[sentenceIndex + 1] || null}
                  audioEntries={audioEntries}
                  failedVariantIds={audioPlayback?.failedVariantIds || null}
                  isPlayingSentence={isPlayingSentence}
                  isPausedSentence={isPlayingSentence && Boolean(audioPlayback?.isPaused)}
                  isCursorSentence={isCursorSentence}
                  speakingPart={isPlayingSentence ? audioPlayback?.speakingPart : null}
                  onPlaySentence={audioPlayback?.playSentence || null}
                  onPlayFromSentence={audioPlayback?.playFromSentence || null}
                  isBusy={isBusy}
                  onCommand={onCommand}
                  compact={compact}
                />
              );
            })}
          </div>
        )}

        {addingSentence ? (
          <AddSentenceForm
            key={`${turn.id}-add-sentence`}
            sceneId={scene.id}
            turn={turn}
            isBusy={isBusy}
            onCommand={onCommand}
            onClose={() => setAddingSentence(false)}
            compact={compact}
          />
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setAddingSentence(true)}
            className="w-full min-h-9 py-1.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 text-[9px] font-black disabled:opacity-40 active:scale-[0.99] transition"
          >
            <Plus className="w-3 h-3 inline mr-1" />Add Sentence
          </button>
        )}
      </div>
    </div>
  );
};

export default ConversationTurnSection;
