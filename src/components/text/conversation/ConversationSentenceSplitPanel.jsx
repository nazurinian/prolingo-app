import React, { useMemo, useState } from 'react';
import { AlertTriangle, Scissors, Sparkles, X } from 'lucide-react';
import {
  buildTextParagraphManualSplitProposal,
  buildTextParagraphSentenceSplitProposal
} from '../../../domain/text/textParagraphSentenceAuthoringDomain.js';
import { normalizeConversationEditorError } from './conversationEditorErrorUtils.js';

const clean = value => String(value ?? '').trim();

const PartsPreviewList = ({ parts = [], retainedId }) => (
  <div className="space-y-1.5">
    {parts.map((part, index) => (
      <div
        key={`${index}-${part.text}`}
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-300">
            {index === 0 ? `RETAIN ${retainedId}` : `NEW PART ${index + 1}`}
          </span>
          <span className="text-[7px] font-mono text-slate-400">joinAfter: {part.joinAfter || 'space'}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{part.text}</p>
        {clean(part.meaning) ? (
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 whitespace-pre-wrap">{part.meaning}</p>
        ) : (
          <p className="mt-1 text-[8px] italic text-slate-400">Meaning: (empty)</p>
        )}
      </div>
    ))}
  </div>
);

/**
 * Bilingual-safe Conversation Sentence Split panel calling D4-A `conversationSegment.split`.
 */
export const ConversationSentenceSplitPanel = ({ sentence, unitKind = 'turn', isBusy = false, onCommand, onClose, compact = false }) => {
  const autoProposal = useMemo(() => buildTextParagraphSentenceSplitProposal({ segment: sentence }), [sentence]);
  const [tab, setTab] = useState(() => (
    autoProposal.canApply || autoProposal.reason === 'meaning-count-mismatch' ? 'auto' : 'manual'
  ));
  const [textOffset, setTextOffset] = useState(null);
  const [meaningOffset, setMeaningOffset] = useState(null);
  const [draftParts, setDraftParts] = useState(() => (
    autoProposal.textParts.length >= 2
      ? autoProposal.parts.map((part, index) => ({
          text: part.text,
          meaning: autoProposal.meaningAligned ? part.meaning : (index === 0 ? clean(sentence?.meaning) : ''),
          joinAfter: part.joinAfter || 'space'
        }))
      : [
          { text: clean(sentence?.text), meaning: clean(sentence?.meaning), joinAfter: 'space' },
          { text: '', meaning: '', joinAfter: sentence?.joinAfter || 'space' }
        ]
  ));
  const [confirmBlankMeaning, setConfirmBlankMeaning] = useState(false);
  const [localError, setLocalError] = useState(null);

  const manualProposal = useMemo(
    () => buildTextParagraphManualSplitProposal({ segment: sentence, textOffset, meaningOffset }),
    [sentence, textOffset, meaningOffset]
  );

  const hasOriginalMeaning = Boolean(clean(sentence?.meaning));

  const submitParts = async parts => {
    setLocalError(null);
    const prepared = (parts || []).map((part, index, list) => ({
      text: clean(part.text),
      meaning: hasOriginalMeaning ? String(part.meaning ?? '').trim() : clean(part.meaning),
      joinAfter: part.joinAfter || (index === list.length - 1 ? (sentence?.joinAfter || 'space') : 'space')
    }));
    if (prepared.length < 2 || prepared.some(p => !p.text)) {
      setLocalError({ code: 'INVALID_COMMAND', message: 'Every split part requires nonblank English/Text.' });
      return;
    }
    if (hasOriginalMeaning && prepared.some(p => !clean(p.meaning)) && !confirmBlankMeaning) {
      setLocalError({
        code: 'INVALID_COMMAND',
        message: 'Original Sentence has a translation. Fill every part’s Meaning or confirm explicit blank translation handling.'
      });
      return;
    }
    try {
      const outcome = await onCommand?.({
        type: unitKind === 'paragraph' ? 'paragraphSegment.split' : 'conversationSegment.split',
        payload: { id: sentence.id, parts: prepared }
      });
      if (!outcome?.ok) {
        if (outcome?.error) setLocalError(outcome.error);
        return;
      }
      onClose?.();
    } catch (error) {
      setLocalError(normalizeConversationEditorError(error));
    }
  };

  const openEditableFromAuto = () => {
    setDraftParts(autoProposal.parts.map((part, index) => ({
      text: part.text,
      meaning: autoProposal.meaningAligned ? part.meaning : (index === 0 ? clean(sentence?.meaning) : ''),
      joinAfter: part.joinAfter || 'space'
    })));
    setConfirmBlankMeaning(false);
    setLocalError(null);
    setTab('parts');
  };

  const openEditableFromManual = () => {
    if (!manualProposal?.canApply) return;
    setDraftParts(manualProposal.parts.map(p => ({ ...p })));
    setConfirmBlankMeaning(false);
    setLocalError(null);
    setTab('parts');
  };

  const manualHasBlankPart = hasOriginalMeaning && draftParts.some(part => !clean(part.meaning));
  const partsValid = draftParts.length >= 2 && draftParts.every(part => Boolean(clean(part.text))) && (!manualHasBlankPart || confirmBlankMeaning);

  return (
    <div
      className="mt-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 space-y-2.5"
      data-conversation-sentence-split="true"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
          <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Split Conversation Sentence</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600" aria-label="Close sentence split">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => { setTab('auto'); setLocalError(null); }}
          className={`min-h-9 rounded-lg border px-2 text-[9px] font-black ${tab === 'auto' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >
          <Sparkles className="w-3 h-3 inline mr-1" />Auto
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => { setTab('manual'); setLocalError(null); }}
          className={`min-h-9 rounded-lg border px-2 text-[9px] font-black ${tab === 'manual' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >
          Split Here
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => { setTab('parts'); setLocalError(null); }}
          className={`min-h-9 rounded-lg border px-2 text-[9px] font-black ${tab === 'parts' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >
          Edit Parts
        </button>
      </div>

      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
        First sentence retains <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{sentence.id}</span> and source identity (with audio marked stale). New child sentences become local Turn children without copied audio.
      </div>

      {localError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300" role="alert">
          <span className="font-mono uppercase mr-1">{localError.code}</span> {localError.message}
        </div>
      )}

      {tab === 'auto' && (
        <div className="space-y-2">
          {autoProposal.canApply ? (
            <>
              {hasOriginalMeaning && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-2 py-1.5 text-[8px] text-emerald-700 dark:text-emerald-300">
                  Bilingual alignment check passed: {autoProposal.textParts.length} EN &harr; {autoProposal.meaningParts.length} ID sentence(s) matched cleanly.
                </div>
              )}
              <PartsPreviewList parts={autoProposal.parts} retainedId={sentence.id} />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={openEditableFromAuto}
                  className="min-h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[9px] font-bold text-slate-600 dark:text-slate-300"
                >
                  Edit Parts
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => submitParts(autoProposal.parts)}
                  className="flex-1 min-h-10 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40"
                >
                  Apply Auto Split ({autoProposal.parts.length})
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900 px-2.5 py-2 space-y-2" role="status">
              <div className="flex items-start gap-1.5 text-[9px] leading-relaxed text-amber-800 dark:text-amber-200 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  {autoProposal.reason === 'meaning-count-mismatch'
                    ? `Translation alignment warning: EN detected ${autoProposal.textParts.length} sentence(s), while Meaning/ID detected ${autoProposal.meaningParts.length}. Auto Split is blocked so translations never shift silently.`
                    : 'No multi-sentence boundary detected automatically. Use Split Here or Edit Parts below.'}
                </span>
              </div>
              {autoProposal.reason === 'meaning-count-mismatch' && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={openEditableFromAuto}
                  className="w-full min-h-9 rounded-lg bg-amber-600 text-white text-[9px] font-black"
                >
                  Review &amp; Align Bilingual Parts Manually
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div className="space-y-2">
          <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
            Select a split cursor position inside EN Text{hasOriginalMeaning ? ' and inside Meaning/ID so both translations remain paired' : ''}.
          </p>
          <div>
            <div className="flex justify-between text-[8px] font-bold text-slate-400 mb-1">
              <span>EN / Text</span>
              <span>{Number.isInteger(textOffset) ? `cursor @ ${textOffset}` : 'click/tap text to set cursor'}</span>
            </div>
            <textarea
              readOnly
              value={sentence?.text || ''}
              onSelect={event => setTextOffset(event.currentTarget.selectionStart)}
              rows={compact ? 3 : 2}
              aria-label="Select EN split cursor"
              className="w-full text-base md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"
            />
          </div>
          {hasOriginalMeaning && (
            <div>
              <div className="flex justify-between text-[8px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                <span>Meaning / Translation (Required Pair)</span>
                <span>{Number.isInteger(meaningOffset) ? `cursor @ ${meaningOffset}` : 'click/tap meaning to set cursor'}</span>
              </div>
              <textarea
                readOnly
                value={sentence?.meaning || ''}
                onSelect={event => setMeaningOffset(event.currentTarget.selectionStart)}
                rows={compact ? 3 : 2}
                aria-label="Select Meaning split cursor"
                className="w-full text-base md:text-xs px-2 py-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/15 dark:text-white resize-y"
              />
            </div>
          )}
          {manualProposal.canApply ? (
            <>
              <PartsPreviewList parts={manualProposal.parts} retainedId={sentence.id} />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={openEditableFromManual}
                  className="min-h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[9px] font-bold text-slate-600 dark:text-slate-300"
                >
                  Fine-Tune Parts
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => submitParts(manualProposal.parts)}
                  className="flex-1 min-h-10 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40"
                >
                  Apply Split Here
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-2 py-2 text-[8px] text-amber-700 dark:text-amber-300">
              {manualProposal.reason === 'meaning-split-required'
                ? 'Translation alignment warning: also choose a valid split cursor inside Meaning/ID (not at start/end).'
                : 'Choose a valid cursor position inside EN Text (not at start/end), or use Edit Parts.'}
            </div>
          )}
        </div>
      )}

      {tab === 'parts' && (
        <div className="space-y-2">
          {hasOriginalMeaning && manualHasBlankPart && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900 px-2.5 py-2 space-y-1.5">
              <div className="flex items-start gap-1.5 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>Original Sentence has a nonblank Meaning. One or more split parts currently have an empty Meaning.</span>
              </div>
              <label className="flex items-center gap-2 text-[9px] text-amber-800 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmBlankMeaning}
                  onChange={event => setConfirmBlankMeaning(event.target.checked)}
                />
                <span>Confirm intentionally leaving blank Meaning (&quot;&quot;) on empty part(s)</span>
              </label>
            </div>
          )}

          {draftParts.map((part, index) => (
            <div key={index} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-300">
                  {index === 0 ? `PART 1 • RETAIN ${sentence.id}` : `PART ${index + 1} • NEW CHILD`}
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={part.joinAfter || 'space'}
                    onChange={event => setDraftParts(prev => prev.map((item, idx) => idx === index ? { ...item, joinAfter: event.target.value } : item))}
                    disabled={isBusy}
                    aria-label={`Part ${index + 1} joinAfter`}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] font-mono dark:text-white"
                  >
                    <option value="space">join: space</option>
                    <option value="line">join: line</option>
                    <option value="none">join: none</option>
                  </select>
                  {draftParts.length > 2 && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setDraftParts(prev => prev.filter((_, idx) => idx !== index))}
                      className="text-[8px] font-bold text-red-500 px-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={part.text}
                onChange={event => {
                  const next = event.target.value;
                  setDraftParts(prev => prev.map((item, idx) => idx === index ? { ...item, text: next } : item));
                }}
                placeholder={`Part ${index + 1} Text (EN)`}
                rows={2}
                disabled={isBusy}
                className="w-full text-base md:text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white"
              />
              <textarea
                value={part.meaning}
                onChange={event => {
                  const next = event.target.value;
                  setDraftParts(prev => prev.map((item, idx) => idx === index ? { ...item, meaning: next } : item));
                }}
                placeholder={`Part ${index + 1} Meaning (ID)`}
                rows={2}
                disabled={isBusy}
                className="w-full text-base md:text-xs px-2 py-1.5 rounded border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 dark:text-white"
              />
            </div>
          ))}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setDraftParts(prev => [...prev, { text: '', meaning: '', joinAfter: sentence?.joinAfter || 'space' }])}
              className="min-h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[9px] font-bold text-slate-600 dark:text-slate-300"
            >
              + Part
            </button>
            <button
              type="button"
              disabled={isBusy || !partsValid}
              onClick={() => submitParts(draftParts)}
              className="flex-1 min-h-10 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40"
            >
              Apply Split ({draftParts.length} Parts)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationSentenceSplitPanel;
