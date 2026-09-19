import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitMerge, Scissors, Sparkles, X } from 'lucide-react';
import { TEXT_LIBRARY_COMMAND_TYPES } from '../../domain/text/textLibraryCommandDomain.js';
import {
  buildTextParagraphManualSplitProposal,
  buildTextParagraphSentenceSplitProposal
} from '../../domain/text/textParagraphSentenceAuthoringDomain.js';

const normalize = value => String(value ?? '').trim();
const shortText = (value, max = 88) => {
  const text = normalize(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const SentencePicker = ({ segments, value, onChange, disabled, excludeLast = false }) => {
  const options = excludeLast ? segments.slice(0, -1) : segments;
  return (
    <select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled || options.length === 0} className="w-full min-h-10 text-[10px] px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
      {options.map((segment, index) => <option key={segment.id} value={segment.id}>Sentence {index + 1} • {shortText(segment.text, 56)}</option>)}
    </select>
  );
};

const PreviewParts = ({ parts = [] }) => (
  <div className="space-y-1.5">
    {parts.map((part, index) => <div key={`${index}-${part.text}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2">
      <div className="flex items-center gap-2"><span className="shrink-0 text-[8px] font-black text-indigo-500">{index + 1}</span><p className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{part.text}</p></div>
      {part.meaning && <p className="mt-1 pl-4 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300 whitespace-pre-wrap">{part.meaning}</p>}
    </div>)}
  </div>
);

export const TextParagraphSentenceAuthoring = ({ block, segments = [], isBusy, onCommand, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null);
  const [targetId, setTargetId] = useState(segments[0]?.id || '');
  const [mergeStartId, setMergeStartId] = useState(segments[0]?.id || '');
  const [textOffset, setTextOffset] = useState(null);
  const [meaningOffset, setMeaningOffset] = useState(null);

  useEffect(() => {
    if (!segments.some(segment => segment.id === targetId)) setTargetId(segments[0]?.id || '');
    if (!segments.slice(0, -1).some(segment => segment.id === mergeStartId)) setMergeStartId(segments[0]?.id || '');
  }, [segments, targetId, mergeStartId]);

  useEffect(() => {
    setMode(null);
    setTextOffset(null);
    setMeaningOffset(null);
  }, [block.id]);

  const target = useMemo(() => segments.find(segment => segment.id === targetId) || segments[0] || null, [segments, targetId]);
  const autoProposal = useMemo(() => target ? buildTextParagraphSentenceSplitProposal({ segment: target }) : null, [target]);
  const manualProposal = useMemo(() => target ? buildTextParagraphManualSplitProposal({ segment: target, textOffset, meaningOffset }) : null, [target, textOffset, meaningOffset]);
  const mergeStartIndex = segments.findIndex(segment => segment.id === mergeStartId);
  const mergePair = mergeStartIndex >= 0 && mergeStartIndex < segments.length - 1 ? [segments[mergeStartIndex], segments[mergeStartIndex + 1]] : [];

  const openMode = nextMode => {
    setExpanded(true);
    setMode(current => current === nextMode ? null : nextMode);
    setTextOffset(null);
    setMeaningOffset(null);
  };

  const applyAutoSplit = async () => {
    if (!target || !autoProposal?.canApply || isBusy) return;
    const result = await onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.SPLIT_PARAGRAPH_SEGMENT,
      payload: { id: target.id, parts: autoProposal.parts }
    });
    if (result) setMode(null);
  };

  const applyManualSplit = async () => {
    if (!target || !manualProposal?.canApply || isBusy) return;
    const result = await onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.SPLIT_PARAGRAPH_SEGMENT,
      payload: { id: target.id, parts: manualProposal.parts }
    });
    if (result) {
      setMode(null);
      setTextOffset(null);
      setMeaningOffset(null);
    }
  };

  const applyMerge = async () => {
    if (mergePair.length !== 2 || isBusy) return;
    const result = await onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.MERGE_PARAGRAPH_SEGMENTS,
      payload: { ids: mergePair.map(segment => segment.id) }
    });
    if (result) setMode(null);
  };

  const moveSentence = (segment, direction) => {
    const ids = segments.map(item => item.id);
    const from = ids.indexOf(segment.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.REORDER_SEGMENTS,
      payload: { blockId: block.id, orderedIds: ids }
    });
  };

  if (!segments.length) return null;

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/10 overflow-hidden" data-text-sentence-authoring="true">
      <button type="button" onClick={() => setExpanded(value => !value)} className="w-full min-h-10 px-2.5 py-2 flex items-center gap-2 text-left active:scale-[0.995] transition">
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500"/> : <ChevronRight className="w-3.5 h-3.5 text-indigo-500"/>}
        <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Sentence Tools</p><p className="text-[7px] text-slate-400">Preview-safe split • merge adjacent • reorder with permanent Segment IDs</p></div>
        <span className="text-[8px] font-bold text-slate-400">{segments.length} sentence{segments.length === 1 ? '' : 's'}</span>
      </button>

      {expanded && <div className="border-t border-indigo-100 dark:border-indigo-900 p-2.5 space-y-2.5">
        <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-4'} gap-1.5`}>
          <button type="button" disabled={isBusy} onClick={() => openMode('auto')} className={`min-h-10 rounded-lg border px-2 text-[9px] font-black ${mode === 'auto' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900'} disabled:opacity-40`}><Sparkles className="w-3 h-3 inline mr-1"/>Auto Split</button>
          <button type="button" disabled={isBusy} onClick={() => openMode('manual')} className={`min-h-10 rounded-lg border px-2 text-[9px] font-black ${mode === 'manual' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900'} disabled:opacity-40`}><Scissors className="w-3 h-3 inline mr-1"/>Split Here</button>
          <button type="button" disabled={isBusy || segments.length < 2} onClick={() => openMode('merge')} className={`min-h-10 rounded-lg border px-2 text-[9px] font-black ${mode === 'merge' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900'} disabled:opacity-40`}><GitMerge className="w-3 h-3 inline mr-1"/>Merge</button>
          <button type="button" disabled={isBusy} onClick={() => openMode('reorder')} className={`min-h-10 rounded-lg border px-2 text-[9px] font-black ${mode === 'reorder' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900'} disabled:opacity-40`}><ArrowUp className="w-3 h-3 inline"/><ArrowDown className="w-3 h-3 inline mr-1"/>Reorder</button>
        </div>

        {mode === 'auto' && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between"><p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Auto Split Preview</p><button type="button" onClick={() => setMode(null)} className="p-1 text-slate-400"><X className="w-3.5 h-3.5"/></button></div>
          <SentencePicker segments={segments} value={target?.id} onChange={id => { setTargetId(id); setTextOffset(null); setMeaningOffset(null); }} disabled={isBusy}/>
          {autoProposal?.canApply ? <>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-2 py-1.5 text-[8px] text-emerald-700 dark:text-emerald-300">Preview only. Apply will retain <span className="font-mono font-bold">{target.id}</span> for the first sentence and create new Segment IDs only for additional sentences.</div>
            <PreviewParts parts={autoProposal.parts}/>
            <button type="button" disabled={isBusy} onClick={applyAutoSplit} className="w-full min-h-10 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">Apply Auto Split ({autoProposal.parts.length})</button>
          </> : <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-2 py-2 text-[8px] leading-relaxed text-amber-700 dark:text-amber-300">
            {autoProposal?.reason === 'meaning-count-mismatch'
              ? `Manual review required: EN detected ${autoProposal.textParts.length} sentence(s), while ID detected ${autoProposal.meaningParts.length}. Auto Apply is disabled so translations cannot shift silently.`
              : 'No safe multi-sentence boundary was detected in this Sentence. Use Split Here for a manual split.'}
          </div>}
        </div>}

        {mode === 'manual' && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between"><p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Split Here</p><button type="button" onClick={() => setMode(null)} className="p-1 text-slate-400"><X className="w-3.5 h-3.5"/></button></div>
          <SentencePicker segments={segments} value={target?.id} onChange={id => { setTargetId(id); setTextOffset(null); setMeaningOffset(null); }} disabled={isBusy}/>
          <p className="text-[8px] leading-relaxed text-slate-500">Klik/taruh cursor di posisi pemisah. Jika Meaning/ID terisi, tentukan cursor ID juga agar pasangan EN↔ID tetap selaras.</p>
          <div>
            <div className="flex justify-between text-[8px] font-bold text-slate-400 mb-1"><span>EN / Text</span><span>{Number.isInteger(textOffset) ? `split @ ${textOffset}` : 'choose cursor'}</span></div>
            <textarea readOnly value={target?.text || ''} onSelect={event => setTextOffset(event.currentTarget.selectionStart)} rows={compact ? 4 : 3} className="w-full text-sm md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"/>
          </div>
          {normalize(target?.meaning) && <div>
            <div className="flex justify-between text-[8px] font-bold text-slate-400 mb-1"><span>ID / Meaning</span><span>{Number.isInteger(meaningOffset) ? `split @ ${meaningOffset}` : 'choose cursor'}</span></div>
            <textarea readOnly value={target?.meaning || ''} onSelect={event => setMeaningOffset(event.currentTarget.selectionStart)} rows={compact ? 4 : 3} className="w-full text-sm md:text-xs px-2 py-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 dark:text-white resize-y"/>
          </div>}
          {manualProposal?.canApply ? <>
            <PreviewParts parts={manualProposal.parts}/>
            <button type="button" disabled={isBusy} onClick={applyManualSplit} className="w-full min-h-10 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">Apply Split Here</button>
          </> : <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-[8px] text-slate-500">{manualProposal?.reason === 'meaning-split-required' ? 'Choose a valid split cursor inside Meaning/ID too.' : 'Choose a valid cursor inside the EN text (not at the very beginning/end).'}</div>}
        </div>}

        {mode === 'merge' && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between"><p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Merge Adjacent Sentences</p><button type="button" onClick={() => setMode(null)} className="p-1 text-slate-400"><X className="w-3.5 h-3.5"/></button></div>
          <SentencePicker segments={segments} value={mergeStartId} onChange={setMergeStartId} disabled={isBusy} excludeLast/>
          {mergePair.length === 2 && <>
            <div className="space-y-1.5">{mergePair.map((segment, index) => <div key={segment.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-2"><p className="text-[8px] font-black text-slate-400">{index === 0 ? 'RETAIN ID' : 'MERGE INTO ABOVE'} • <span className="font-mono">{segment.id}</span></p><p className="mt-1 text-[10px] text-slate-700 dark:text-slate-200">{segment.text}</p>{segment.meaning && <p className="mt-1 text-[9px] text-amber-700 dark:text-amber-300">{segment.meaning}</p>}</div>)}</div>
            <p className="text-[8px] leading-relaxed text-slate-500">The first Segment ID is retained. The second Segment identity is retired; its audio metadata is retired with it, while the retained Segment is marked stale until audio is regenerated.</p>
            <button type="button" disabled={isBusy} onClick={applyMerge} className="w-full min-h-10 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-40">Merge Sentence {mergeStartIndex + 1} + {mergeStartIndex + 2}</button>
          </>}
        </div>}

        {mode === 'reorder' && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between"><p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Reorder Sentences</p><button type="button" onClick={() => setMode(null)} className="p-1 text-slate-400"><X className="w-3.5 h-3.5"/></button></div>
          <p className="text-[8px] text-slate-500">Reorder changes only position/order. Permanent Segment IDs and content stay unchanged.</p>
          {segments.map((segment, index) => <div key={segment.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5">
            <span className="w-5 text-[8px] font-black text-slate-400">{index + 1}</span>
            <p className="min-w-0 flex-1 truncate text-[9px] text-slate-600 dark:text-slate-300">{segment.text}</p>
            <button type="button" disabled={isBusy || index === 0} onClick={() => moveSentence(segment, -1)} className="w-9 h-9 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5 mx-auto"/></button>
            <button type="button" disabled={isBusy || index === segments.length - 1} onClick={() => moveSentence(segment, 1)} className="w-9 h-9 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5 mx-auto"/></button>
          </div>)}
        </div>}
      </div>}
    </div>
  );
};

export default TextParagraphSentenceAuthoring;
