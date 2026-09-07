import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { TEXT_LIBRARY_COMMAND_TYPES } from '../../domain/text/textLibraryCommandDomain.js';

const normalize = value => String(value ?? '').trim();
const blockLabel = type => type === 'conversation' ? 'Conversation' : 'Paragraph';

const SegmentEditor = ({ block, segment, isBusy, onCommand, onClose, compact = false }) => {
  const [text, setText] = useState(segment?.text || '');
  const [meaning, setMeaning] = useState(segment?.meaning || '');
  const [speaker, setSpeaker] = useState(segment?.speaker || '');
  const isConversation = block.blockType === 'conversation';

  useEffect(() => {
    setText(segment?.text || '');
    setMeaning(segment?.meaning || '');
    setSpeaker(segment?.speaker || '');
  }, [segment?.id]);

  const save = async () => {
    const cleanText = normalize(text);
    if (!cleanText || isBusy) return;
    const command = segment ? {
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      payload: {
        id: segment.id,
        text: cleanText,
        meaning: normalize(meaning),
        speaker: isConversation ? normalize(speaker) || null : null
      }
    } : {
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
      payload: {
        blockId: block.id,
        text: cleanText,
        meaning: normalize(meaning),
        speaker: isConversation ? normalize(speaker) || null : null,
        joinAfter: isConversation ? 'line' : 'space'
      }
    };
    const result = await onCommand?.(command);
    if (result) onClose?.();
  };

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 space-y-2 scroll-mb-32" data-text-editor-keyboard-safe={compact ? 'true' : undefined}>
      {isConversation && <input
        value={speaker}
        onChange={event => setSpeaker(event.target.value)}
        placeholder="Speaker (optional)"
        disabled={isBusy}
        className="w-full min-h-11 text-sm md:text-[10px] px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white"
      />}
      <textarea
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder="Text / English"
        rows={3}
        disabled={isBusy}
        className="w-full text-base md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"
        autoFocus={!compact}
      />
      <textarea
        value={meaning}
        onChange={event => setMeaning(event.target.value)}
        placeholder="Meaning / Indonesian (optional)"
        rows={2}
        disabled={isBusy}
        className="w-full text-base md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white resize-y"
      />
      <div className={`${compact ? 'sticky bottom-0 z-10 -mx-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2 py-2 shadow-sm backdrop-blur' : ''} flex justify-end gap-1.5`} data-text-mobile-editor-savebar={compact ? 'true' : undefined}>
        <button type="button" disabled={isBusy} onClick={onClose} className="min-h-10 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 active:scale-95 transition"><X className="w-3 h-3 inline mr-1"/>Cancel</button>
        <button type="button" disabled={isBusy || !normalize(text)} onClick={save} className="min-h-10 px-3 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 active:scale-95 transition"><Save className="w-3 h-3 inline mr-1"/>{segment ? 'Save Segment' : 'Add Segment'}</button>
      </div>
    </div>
  );
};

const StructuredCard = ({ block, index, total, isBusy, onCommand, compact = false }) => {
  const [expanded, setExpanded] = useState(() => !compact);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(block.title || '');
  const [segmentEditor, setSegmentEditor] = useState(null);
  const [showCardActions, setShowCardActions] = useState(false);
  const segments = block.segments || [];

  useEffect(() => setTitle(block.title || ''), [block.id, block.title]);

  const saveTitle = async () => {
    const result = await onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
      payload: { id: block.id, title: normalize(title) || null }
    });
    if (result) setEditingTitle(false);
  };

  const moveBlock = direction => {
    const ids = (block.__siblings || []).map(item => item.id);
    const from = ids.indexOf(block.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.REORDER_BLOCKS,
      payload: { documentId: block.documentId, orderedIds: ids }
    });
  };

  const deleteBlock = () => {
    if (!window.confirm(`Delete card ${block.id} and all of its segments?`)) return;
    onCommand?.({ type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_BLOCK, payload: { id: block.id } });
  };

  const moveSegment = (segment, direction) => {
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

  const deleteSegment = segment => {
    if (!window.confirm(`Delete segment ${segment.id}?`)) return;
    onCommand?.({ type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_SEGMENT, payload: { id: segment.id } });
  };

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-3 bg-slate-50/80 dark:bg-slate-900/40">
        <button type="button" onClick={() => setExpanded(value => !value)} className={`${compact ? 'w-10 h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-indigo-600 active:scale-95 transition`}>{expanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}</button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">#{index + 1}</span>
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || `${blockLabel(block.blockType)} Card`}</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{blockLabel(block.blockType).toUpperCase()}</span>
          </div>
          <div className="mt-0.5 flex gap-2 text-[8px] text-slate-400">{!compact && <span className="font-mono">{block.id}</span>}<span>{segments.length} segment{segments.length === 1 ? '' : 's'}</span></div>
        </div>
        {compact ? <button type="button" onClick={() => setShowCardActions(value => !value)} className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition active:scale-95 ${showCardActions ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-indigo-600'}`} aria-expanded={showCardActions} aria-label="Card actions" title="Card actions"><MoreHorizontal className="w-4 h-4"/></button> : <div className="flex gap-0.5">
          <button type="button" disabled={isBusy || index === 0} onClick={() => moveBlock(-1)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition" title="Move card up"><ArrowUp className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy || index === total - 1} onClick={() => moveBlock(1)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition" title="Move card down"><ArrowDown className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy} onClick={() => { setEditingTitle(value => !value); setExpanded(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-40 active:scale-95 transition" title="Edit card title"><Edit3 className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy} onClick={deleteBlock} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-40 active:scale-95 transition" title="Delete card"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>}
      </div>

      {compact && showCardActions && <div className="grid grid-cols-4 gap-1 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 animate-in fade-in duration-150" data-text-mobile-card-actions="true">
        <button type="button" disabled={isBusy || index === 0} onClick={() => moveBlock(-1)} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition"><ArrowUp className="w-3.5 h-3.5 mx-auto mb-0.5"/>Up</button>
        <button type="button" disabled={isBusy || index === total - 1} onClick={() => moveBlock(1)} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition"><ArrowDown className="w-3.5 h-3.5 mx-auto mb-0.5"/>Down</button>
        <button type="button" disabled={isBusy} onClick={() => { setEditingTitle(value => !value); setExpanded(true); setShowCardActions(false); }} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-40 active:scale-95 transition"><Edit3 className="w-3.5 h-3.5 mx-auto mb-0.5"/>Title</button>
        <button type="button" disabled={isBusy} onClick={deleteBlock} className="min-h-11 rounded-lg text-[9px] font-bold text-slate-500 hover:text-red-500 disabled:opacity-40 active:scale-95 transition"><Trash2 className="w-3.5 h-3.5 mx-auto mb-0.5"/>Delete</button>
      </div>}

      {expanded && <div className="p-3 space-y-3">
        {editingTitle && <div className="flex gap-1.5">
          <input value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveTitle()} disabled={isBusy} placeholder="Card title (optional)" className="flex-1 min-w-0 min-h-11 text-sm md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
          <button type="button" disabled={isBusy} onClick={saveTitle} className="w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600 text-white active:scale-95 transition"><Save className="w-3.5 h-3.5"/></button>
          <button type="button" disabled={isBusy} onClick={() => { setEditingTitle(false); setTitle(block.title || ''); }} className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 active:scale-95 transition"><X className="w-3.5 h-3.5"/></button>
        </div>}

        {segments.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-5 text-center text-[10px] text-slate-400">Card masih kosong. Tambahkan playable segment pertama.</div>}

        <div className="space-y-2">
          {segments.map((segment, segmentIndex) => <div key={segment.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
            {segmentEditor?.mode === 'edit' && segmentEditor.id === segment.id ? <SegmentEditor block={block} segment={segment} isBusy={isBusy} onCommand={onCommand} onClose={() => setSegmentEditor(null)} compact={compact} /> : <>
              <div className={compact ? "block" : "flex items-start gap-2"}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-[8px] font-black text-slate-400">{segmentIndex + 1}</span>
                    {block.blockType === 'conversation' && segment.speaker && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300">{segment.speaker}</span>}
                    {!compact && <span className="text-[8px] font-mono text-slate-300 dark:text-slate-500">{segment.id}</span>}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{segment.text}</p>
                  {segment.meaning && <div className="mt-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 px-2 py-1.5"><p className="text-[8px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Meaning</p><p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{segment.meaning}</p></div>}
                </div>
                <div className={compact ? "mt-2 grid grid-cols-4 gap-1 border-t border-slate-100 dark:border-slate-700 pt-2" : "flex flex-col gap-0.5"} data-text-editor-segment-actions="true">
                  <button type="button" disabled={isBusy || segmentIndex === 0} onClick={() => moveSegment(segment, -1)} className={`${compact ? 'min-h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition`} title="Move segment up" aria-label="Move segment up"><ArrowUp className="w-3 h-3"/></button>
                  <button type="button" disabled={isBusy || segmentIndex === segments.length - 1} onClick={() => moveSegment(segment, 1)} className={`${compact ? 'min-h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-25 active:scale-95 transition`} title="Move segment down" aria-label="Move segment down"><ArrowDown className="w-3 h-3"/></button>
                  <button type="button" disabled={isBusy} onClick={() => setSegmentEditor({ mode: 'edit', id: segment.id })} className={`${compact ? 'min-h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-40 active:scale-95 transition`} title="Edit segment" aria-label="Edit segment"><Edit3 className="w-3 h-3"/></button>
                  <button type="button" disabled={isBusy} onClick={() => deleteSegment(segment)} className={`${compact ? 'min-h-10 flex items-center justify-center' : 'p-1'} rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-40 active:scale-95 transition`} title="Delete segment" aria-label="Delete segment"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
            </>}
          </div>)}
        </div>

        {segmentEditor?.mode === 'create' ? <SegmentEditor block={block} isBusy={isBusy} onCommand={onCommand} onClose={() => setSegmentEditor(null)} compact={compact} /> : <button type="button" disabled={isBusy} onClick={() => setSegmentEditor({ mode: 'create' })} className="w-full min-h-10 py-2 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 text-[10px] font-black disabled:opacity-40 active:scale-[0.99] transition"><Plus className="w-3 h-3 inline mr-1"/>Add Segment</button>}
      </div>}
    </article>
  );
};

export const TextStructuredEditor = ({ documentTree, isBusy, error, onCommand, compact = false }) => {
  const [creatingCard, setCreatingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardType, setNewCardType] = useState('paragraph');
  const blocks = documentTree?.blocks || [];
  const documentType = documentTree?.documentType || 'mixed';
  const segmentCount = useMemo(() => blocks.reduce((sum, block) => sum + (block.segments?.length || 0), 0), [blocks]);

  useEffect(() => {
    setCreatingCard(false);
    setNewCardTitle('');
    setNewCardType(documentType === 'conversation' ? 'conversation' : 'paragraph');
  }, [documentTree?.id, documentType]);

  const createCard = async () => {
    const blockType = documentType === 'mixed' ? newCardType : documentType;
    const result = await onCommand?.({
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
      payload: { documentId: documentTree.id, blockType, title: normalize(newCardTitle) || null }
    });
    if (!result) return;
    setCreatingCard(false);
    setNewCardTitle('');
  };

  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;

  const siblings = blocks.map(block => ({ id: block.id }));
  return (
    <section className="space-y-3" data-text-structured-editor="true">
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-300"/>
              <h3 className="text-xs font-black text-slate-800 dark:text-white">{compact ? 'Cards & Segments' : 'Structured Card / Segment Editor'}</h3>
              {!compact && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">DIRECT INDEXEDDB</span>}
            </div>
            <p className="mt-1 text-[9px] text-slate-400">{blocks.length} card{blocks.length === 1 ? '' : 's'} • {segmentCount} segment{segmentCount === 1 ? '' : 's'} • Text + Meaning{documentType !== 'paragraph' ? ' + Speaker' : ''}</p>
          </div>
          <button type="button" disabled={isBusy} onClick={() => setCreatingCard(value => !value)} className="min-h-10 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black disabled:opacity-40 active:scale-95 transition"><Plus className="w-3 h-3 inline mr-1"/>Card</button>
        </div>
        {error && <p className="mt-2 text-[9px] font-bold text-red-500" role="alert">{error}</p>}
      </div>

      {creatingCard && <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 p-3 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">New Card</p>
        <input value={newCardTitle} onChange={event => setNewCardTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && createCard()} placeholder="Card title (optional)" disabled={isBusy} className="w-full min-h-11 text-sm md:text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" autoFocus={!compact} />
        {documentType === 'mixed' && <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={isBusy} onClick={() => setNewCardType('paragraph')} className={`py-2 rounded-lg border text-[10px] font-black ${newCardType === 'paragraph' ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}><FileText className="w-3 h-3 inline mr-1"/>Paragraph</button>
          <button type="button" disabled={isBusy} onClick={() => setNewCardType('conversation')} className={`py-2 rounded-lg border text-[10px] font-black ${newCardType === 'conversation' ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}><MessageSquare className="w-3 h-3 inline mr-1"/>Conversation</button>
        </div>}
        <div className="flex justify-end gap-1.5">
          <button type="button" disabled={isBusy} onClick={() => setCreatingCard(false)} className="min-h-10 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 active:scale-95 transition">Cancel</button>
          <button type="button" disabled={isBusy} onClick={createCard} className="min-h-10 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-bold disabled:opacity-40 active:scale-95 transition">Create Card</button>
        </div>
      </div>}

      {blocks.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
        <FileText className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600"/>
        <p className="mt-2 text-xs font-bold text-slate-500">Belum ada Card</p>
        <p className="mt-1 text-[9px] text-slate-400">Buat Card pertama. Setelah itu tambahkan Segment Text/Meaning di dalam Card.</p>
      </div> : <div className="space-y-3">{blocks.map((block, index) => <StructuredCard key={block.id} block={{ ...block, __siblings: siblings }} index={index} total={blocks.length} isBusy={isBusy} onCommand={onCommand} compact={compact} />)}</div>}
    </section>
  );
};

export default TextStructuredEditor;
