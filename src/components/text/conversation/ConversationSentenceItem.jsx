import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Edit3,
  GitMerge,
  Scissors,
  Split,
  Trash2,
  X
} from 'lucide-react';
import {
  buildReplacedMetadataWithNote,
  getSentenceLogicalAudioMetaState,
  listPreservedMetadataEntries,
  normalizeConversationEditorError,
  swapArrayIds
} from './conversationEditorErrorUtils.js';
import ConversationSentenceSplitPanel from './ConversationSentenceSplitPanel.jsx';

const clean = value => String(value ?? '').trim();

const SentenceAudioMetaBadges = ({ audioVariants, text, meaning }) => {
  const channels = [
    { key: 'text', label: 'EN', hasContent: Boolean(clean(text)) },
    { key: 'meaning', label: 'ID', hasContent: Boolean(clean(meaning)) }
  ];
  return (
    <div className="flex flex-wrap gap-1" data-conversation-sentence-audio-meta="true">
      {channels.filter(c => c.hasContent).map(ch => {
        const meta = getSentenceLogicalAudioMetaState(audioVariants, ch.key);
        const tone = meta.status === 'recorded'
          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
          : meta.status === 'invalidated'
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
            : 'bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
        return (
          <span key={ch.key} className={`px-1.5 py-0.5 rounded border text-[7px] font-black ${tone}`}>
            {ch.label} {meta.label}
          </span>
        );
      })}
    </div>
  );
};

const EditSentenceForm = ({ sentence, isBusy, onCommand, onClose, compact }) => {
  const initialNote = typeof sentence?.metadata?.note === 'string' ? sentence.metadata.note : '';
  const [text, setText] = useState(sentence?.text || '');
  const [meaning, setMeaning] = useState(sentence?.meaning || '');
  const [joinAfter, setJoinAfter] = useState(sentence?.joinAfter || 'space');
  const [note, setNote] = useState(initialNote);
  const [formError, setFormError] = useState(null);

  const extraMeta = listPreservedMetadataEntries(sentence?.metadata, {
    exclude: ['note', 'speakerIdentityV1']
  });

  const handleSave = async () => {
    setFormError(null);
    const cleanText = clean(text);
    if (!cleanText) {
      setFormError({ code: 'INVALID_COMMAND', message: 'Sentence Text (EN) cannot be empty.' });
      return;
    }
    const noteChanged = clean(note) !== clean(initialNote);
    const payload = {
      id: sentence.id,
      text: cleanText,
      meaning: String(meaning ?? '').trim(),
      joinAfter
    };
    if (noteChanged) {
      payload.metadata = buildReplacedMetadataWithNote(sentence?.metadata, note);
    }
    try {
      const outcome = await onCommand?.({ type: 'segment.update', payload });
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
      data-conversation-sentence-edit={sentence.id}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300">Edit Sentence Draft • {sentence.id}</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Cancel sentence edit">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {formError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{formError.code}</span> {formError.message}
        </div>
      )}
      <textarea
        value={text}
        onChange={event => { setText(event.target.value); if (formError) setFormError(null); }}
        placeholder="Sentence Text (EN)"
        rows={compact ? 3 : 2}
        disabled={isBusy}
        aria-label="Edit Sentence Text"
        className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"
      />
      <textarea
        value={meaning}
        onChange={event => { setMeaning(event.target.value); if (formError) setFormError(null); }}
        placeholder="Meaning / Translation (optional)"
        rows={2}
        disabled={isBusy}
        aria-label="Edit Sentence Meaning"
        className="w-full text-base md:text-xs px-2 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/15 dark:text-white resize-y"
      />
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
        <select
          value={joinAfter}
          onChange={event => setJoinAfter(event.target.value)}
          disabled={isBusy}
          aria-label="Edit joinAfter"
          className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        >
          <option value="space">joinAfter: space</option>
          <option value="line">joinAfter: line</option>
          <option value="none">joinAfter: none</option>
        </select>
        <input
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={isBusy}
          placeholder="Metadata note (preserves other keys)"
          aria-label="Sentence metadata note"
          className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
        />
      </div>
      {extraMeta.length > 0 && (
        <p className="text-[8px] text-slate-400">
          Preserved metadata keys: {extraMeta.map(item => item.key).join(', ')}
        </p>
      )}
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
          onClick={handleSave}
          className="min-h-9 px-3 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40"
        >
          Save Sentence
        </button>
      </div>
    </div>
  );
};

const MoveSentencePanel = ({ sentence, currentTurnId, sceneTurns = [], isBusy, onCommand, onClose }) => {
  const otherTurns = sceneTurns.filter(t => t.id !== currentTurnId);
  const [targetUnitId, setTargetUnitId] = useState(otherTurns[0]?.id || sceneTurns[0]?.id || '');
  const [positionMode, setPositionMode] = useState('end');
  const [beforeSegmentId, setBeforeSegmentId] = useState('');
  const [moveError, setMoveError] = useState(null);

  const selectedTurn = sceneTurns.find(t => t.id === targetUnitId) || null;
  const targetSentences = (selectedTurn?.sentences || []).filter(s => s.id !== sentence.id);

  const handleMove = async () => {
    setMoveError(null);
    if (!targetUnitId) {
      setMoveError({ code: 'INVALID_COMMAND', message: 'Choose a destination Turn within this Scene.' });
      return;
    }
    const payload = {
      segmentId: sentence.id,
      targetUnitId
    };
    if (positionMode === 'start' && targetSentences.length > 0) {
      payload.beforeSegmentId = targetSentences[0].id;
    } else if (positionMode === 'before' && beforeSegmentId) {
      payload.beforeSegmentId = beforeSegmentId;
    }
    try {
      const outcome = await onCommand?.({ type: 'segment.move', payload });
      if (!outcome?.ok) {
        if (outcome?.error) setMoveError(outcome.error);
        return;
      }
      onClose?.();
    } catch (error) {
      setMoveError(normalizeConversationEditorError(error));
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 p-2.5 space-y-2" data-conversation-sentence-move="true">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black text-sky-700 dark:text-sky-300">Move Sentence to Turn (Same Scene)</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Close move sentence">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {moveError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{moveError.code}</span> {moveError.message}
        </div>
      )}
      <select
        value={targetUnitId}
        onChange={event => { setTargetUnitId(event.target.value); setPositionMode('end'); setBeforeSegmentId(''); }}
        disabled={isBusy}
        aria-label="Destination Turn"
        className="w-full min-h-9 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
      >
        {sceneTurns.map((turn, idx) => (
          <option key={turn.id} value={turn.id}>
            Turn #{idx + 1} • {turn.speaker || 'No Speaker'} ({turn.sentenceCount}s){turn.id === currentTurnId ? ' [current]' : ''}
          </option>
        ))}
      </select>
      {targetSentences.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={positionMode}
            onChange={event => {
              const mode = event.target.value;
              setPositionMode(mode);
              if (mode === 'before' && !beforeSegmentId) setBeforeSegmentId(targetSentences[0]?.id || '');
            }}
            disabled={isBusy}
            aria-label="Placement in Turn"
            className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
          >
            <option value="end">Append at end</option>
            <option value="start">Insert at start</option>
            <option value="before">Before sentence…</option>
          </select>
          {positionMode === 'before' && (
            <select
              value={beforeSegmentId || targetSentences[0]?.id || ''}
              onChange={event => setBeforeSegmentId(event.target.value)}
              disabled={isBusy}
              aria-label="Insert before sentence"
              className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white"
            >
              {targetSentences.map((item, idx) => (
                <option key={item.id} value={item.id}>#{idx + 1} • {item.text.slice(0, 32)}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <p className="text-[8px] text-slate-500">
        Moving inherits the target Turn&apos;s speaker{selectedTurn?.speaker ? ` (${selectedTurn.speaker})` : ''} and preserves an empty source Turn if this was its last Sentence.
      </p>
      <div className="flex justify-end gap-1.5">
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">Cancel</button>
        <button type="button" disabled={isBusy || !targetUnitId} onClick={handleMove} className="min-h-9 px-3 rounded-lg bg-sky-600 text-white text-[9px] font-black disabled:opacity-40">Move Sentence</button>
      </div>
    </div>
  );
};

/**
 * Renders one persistent Sentence inside a Speaker Turn with edit, reorder, move, split, merge, Turn split, and delete controls.
 */
export const ConversationSentenceItem = ({
  sentence,
  sentenceIndex,
  turn,
  sceneTurns = [],
  nextSentence = null,
  isBusy = false,
  onCommand,
  compact = false
}) => {
  const [subMode, setSubMode] = useState(null);
  const siblings = turn?.sentences || [];

  const handleReorder = async direction => {
    const orderedIds = swapArrayIds(siblings.map(item => item.id), sentence.id, direction);
    if (!orderedIds || isBusy) return;
    await onCommand?.({
      type: 'contentUnit.reorderSegments',
      payload: { id: turn.id, orderedIds }
    });
  };

  const handleDelete = async () => {
    if (isBusy) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Delete sentence ${sentence.id}?${siblings.length === 1 ? ' Its parent Turn will remain intact as an empty Turn.' : ''}`)) return;
    }
    await onCommand?.({
      type: 'segment.delete',
      payload: { id: sentence.id }
    });
  };

  const handleMergeWithNext = async () => {
    if (!nextSentence || isBusy) return;
    await onCommand?.({
      type: 'conversationSegments.merge',
      payload: { ids: [sentence.id, nextSentence.id] }
    });
    setSubMode(null);
  };

  const handleSplitTurnBeforeHere = async () => {
    if (sentenceIndex < 1 || isBusy) return;
    await onCommand?.({
      type: 'contentUnit.split',
      payload: { id: turn.id, beforeSegmentId: sentence.id }
    });
  };

  const toggleSubMode = next => setSubMode(current => current === next ? null : next);
  const preservedEntries = listPreservedMetadataEntries(sentence?.metadata, { exclude: ['speakerIdentityV1'] });

  if (subMode === 'edit') {
    return (
      <EditSentenceForm
        key={`${sentence.id}-edit`}
        sentence={sentence}
        isBusy={isBusy}
        onCommand={onCommand}
        onClose={() => setSubMode(null)}
        compact={compact}
      />
    );
  }

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 p-2.5"
      data-conversation-sentence-id={sentence.id}
    >
      <div className={compact ? 'space-y-2' : 'flex items-start gap-2'}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[8px] font-black text-slate-400">
              Sentence {sentenceIndex + 1}
              {Number.isInteger(sentence.order) ? ` (Card #${sentence.order})` : ''}
            </span>
            {!compact && <span className="text-[8px] font-mono text-slate-400">{sentence.id}</span>}
            <span className="rounded bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 text-[7px] font-mono text-slate-500">
              join: {sentence.joinAfter || 'space'}
            </span>
            {sentence.metadata?.externalEntityV1 && (
              <span className="rounded bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 text-[7px] font-mono text-violet-600 dark:text-violet-300">
                src:{sentence.metadata.externalEntityV1.segmentKey || 'ext'}
              </span>
            )}
            {sentence.metadata?.note && (
              <span className="rounded bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 text-[7px] text-slate-600 dark:text-slate-300">
                note: {sentence.metadata.note}
              </span>
            )}
            {preservedEntries.length > 0 && !compact && (
              <span className="text-[7px] text-slate-400" title={preservedEntries.map(e => `${e.key}=${e.summary}`).join(', ')}>
                +{preservedEntries.length} meta
              </span>
            )}
          </div>

          <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{sentence.text}</p>

          {clean(sentence.meaning) && (
            <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 px-2 py-1.5">
              <p className="text-[8px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Meaning</p>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{sentence.meaning}</p>
            </div>
          )}

          <SentenceAudioMetaBadges audioVariants={sentence.audioVariants} text={sentence.text} meaning={sentence.meaning} />
        </div>

        <div className={compact ? 'grid grid-cols-4 gap-1 border-t border-slate-100 dark:border-slate-700 pt-2' : 'flex flex-wrap gap-1 shrink-0 max-w-[168px] justify-end'}>
          <button
            type="button"
            disabled={isBusy || sentenceIndex === 0}
            onClick={() => handleReorder(-1)}
            className={`${compact ? 'min-h-10' : 'p-1.5'} rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600 disabled:opacity-25`}
            title="Move sentence up inside Turn"
            aria-label={`Move sentence ${sentence.id} up`}
          >
            <ArrowUp className="w-3 h-3 mx-auto" />
          </button>
          <button
            type="button"
            disabled={isBusy || sentenceIndex === siblings.length - 1}
            onClick={() => handleReorder(1)}
            className={`${compact ? 'min-h-10' : 'p-1.5'} rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600 disabled:opacity-25`}
            title="Move sentence down inside Turn"
            aria-label={`Move sentence ${sentence.id} down`}
          >
            <ArrowDown className="w-3 h-3 mx-auto" />
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => toggleSubMode('edit')}
            className={`${compact ? 'min-h-10' : 'p-1.5'} rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600 disabled:opacity-40`}
            title="Edit sentence"
            aria-label={`Edit sentence ${sentence.id}`}
          >
            <Edit3 className="w-3 h-3 mx-auto" />
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleDelete}
            className={`${compact ? 'min-h-10' : 'p-1.5'} rounded-lg border border-red-200 dark:border-red-900 text-red-400 hover:text-red-600 disabled:opacity-40`}
            title="Delete sentence (retains empty Turn)"
            aria-label={`Delete sentence ${sentence.id}`}
          >
            <Trash2 className="w-3 h-3 mx-auto" />
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => toggleSubMode('split')}
            className={`${compact ? 'min-h-9 col-span-2' : 'px-1.5 py-1'} rounded-lg border ${subMode === 'split' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300'} text-[8px] font-black`}
          >
            <Scissors className="w-2.5 h-2.5 inline mr-0.5" />Split
          </button>
          <button
            type="button"
            disabled={isBusy || sceneTurns.length < 2}
            onClick={() => toggleSubMode('move')}
            className={`${compact ? 'min-h-9 col-span-2' : 'px-1.5 py-1'} rounded-lg border ${subMode === 'move' ? 'bg-sky-600 border-sky-600 text-white' : 'border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-300'} text-[8px] font-black disabled:opacity-30`}
          >
            <ArrowRightLeft className="w-2.5 h-2.5 inline mr-0.5" />Move Turn
          </button>
          {nextSentence && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => toggleSubMode('merge')}
              className={`${compact ? 'min-h-9 col-span-2' : 'px-1.5 py-1'} rounded-lg border ${subMode === 'merge' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} text-[8px] font-black`}
            >
              <GitMerge className="w-2.5 h-2.5 inline mr-0.5" />Merge Next
            </button>
          )}
          {sentenceIndex > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSplitTurnBeforeHere}
              className={`${compact ? 'min-h-9 col-span-2' : 'px-1.5 py-1'} rounded-lg border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[8px] font-black`}
              title="Split Turn so this Sentence starts a new Speaker Turn"
            >
              <Split className="w-2.5 h-2.5 inline mr-0.5" />Split Turn Here
            </button>
          )}
        </div>
      </div>

      {subMode === 'split' && (
        <ConversationSentenceSplitPanel
          key={`${sentence.id}-split`}
          sentence={sentence}
          isBusy={isBusy}
          onCommand={onCommand}
          onClose={() => setSubMode(null)}
          compact={compact}
        />
      )}

      {subMode === 'move' && (
        <MoveSentencePanel
          key={`${sentence.id}-move`}
          sentence={sentence}
          currentTurnId={turn.id}
          sceneTurns={sceneTurns}
          isBusy={isBusy}
          onCommand={onCommand}
          onClose={() => setSubMode(null)}
        />
      )}

      {subMode === 'merge' && nextSentence && (
        <div className="mt-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 space-y-2" data-conversation-sentence-merge="true">
          <p className="text-[9px] font-black text-indigo-700 dark:text-indigo-300">Merge with Next Sentence inside {turn.id}</p>
          <p className="text-[8px] leading-relaxed text-slate-600 dark:text-slate-300">
            Retains <span className="font-mono font-bold">{sentence.id}</span> and merges <span className="font-mono font-bold">{nextSentence.id}</span> into it. The second Sentence ID and its audio metadata are retired, while retained audio is marked stale.
          </p>
          <div className="flex justify-end gap-1.5">
            <button type="button" disabled={isBusy} onClick={() => setSubMode(null)} className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500">Cancel</button>
            <button type="button" disabled={isBusy} onClick={handleMergeWithNext} className="min-h-9 px-3 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">
              Confirm Merge ({sentenceIndex + 1} + {sentenceIndex + 2})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationSentenceItem;
