import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, MessageSquare, Play, PlayCircle, SkipForward, Volume2 } from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  resolveStructuredTextPlaybackList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  getStructuredTextDisplayModeLabel,
  getStructuredTextPlaybackModeLabel,
  hasStructuredTextPlayableChannel,
  resolveStructuredTextDisplayState
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';

const blockLabel = type => type === 'conversation' ? 'Conversation' : 'Paragraph';

const DISPLAY_OPTIONS = [
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ONLY,
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING,
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING,
  TEXT_STRUCTURED_DISPLAY_MODES.MEANING_ONLY
];

const PLAY_OPTIONS = [
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY
];

const StructuredPlayerCard = ({
  block,
  index,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingIndex,
  displayMode,
  playbackChannelMode,
  onPlayCard,
  onPlaySegment,
  onStartFromSegment
}) => {
  const [manualExpanded, setManualExpanded] = useState(false);
  const cardRef = useRef(null);
  const segments = block.segments || [];
  const activeSegment = segments.find(segment => segment.id === playingIndex) || null;
  const isActiveCard = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && Boolean(activeSegment) && (isPlaying || isPaused);
  const expanded = manualExpanded || isActiveCard;

  useEffect(() => {
    if (!isActiveCard || !cardRef.current) return;
    cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isActiveCard, playingIndex]);

  const firstSegment = segments[0] || null;
  const collapsedDisplay = resolveStructuredTextDisplayState({ displayMode, isActive: false });
  const cardHasPlayableSegment = segments.some(segment => hasStructuredTextPlayableChannel(segment, playbackChannelMode));
  const preview = collapsedDisplay.showText
    ? (firstSegment?.text || 'No segment yet.')
    : (firstSegment?.meaning || 'No meaning yet.');

  return (
    <article ref={cardRef} className={`rounded-2xl border shadow-sm overflow-hidden transition ${isActiveCard ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-100 dark:ring-indigo-950/50' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`} data-text-player-card={block.id}>
      <div className="flex items-center gap-2 p-3 bg-slate-50/80 dark:bg-slate-900/40">
        <button type="button" onClick={() => setManualExpanded(value => !value)} className="p-1 rounded text-slate-400 hover:text-indigo-600" aria-label={expanded ? 'Collapse card' : 'Expand card'}>
          {expanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">#{index + 1}</span>
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || `${blockLabel(block.blockType)} Card`}</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{blockLabel(block.blockType).toUpperCase()}</span>
            {isActiveCard && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">ACTIVE</span>}
          </div>
          <p className="mt-0.5 text-[8px] font-mono text-slate-400">{block.id} • {segments.length} segment{segments.length === 1 ? '' : 's'}</p>
          {!expanded && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">{preview}</p>}
        </div>
        <button type="button" disabled={!cardHasPlayableSegment} onClick={() => onPlayCard?.(block.id)} className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35" title="Play this card">
          <Play className="w-3 h-3 inline mr-1 fill-current"/>Card
        </button>
      </div>

      {expanded && <div className="p-3 space-y-2">
        {segments.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-400">No segments in this card.</div>}
        {segments.map((segment, segmentIndex) => {
          const active = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && segment.id === playingIndex && (isPlaying || isPaused);
          const display = resolveStructuredTextDisplayState({ displayMode, isActive: active });
          const textSpeaking = active && speakingPart === 'text';
          const meaningSpeaking = active && speakingPart === 'meaning';
          const segmentPlayable = hasStructuredTextPlayableChannel(segment, playbackChannelMode);
          return (
            <div key={segment.id} className={`rounded-xl border p-3 transition ${active ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/25' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-player-segment={segment.id}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 text-[9px] font-black text-slate-400 min-w-[24px]">{segmentIndex + 1}</div>
                <div className="min-w-0 flex-1">
                  {block.blockType === 'conversation' && segment.speaker && <p className="text-[9px] font-black uppercase tracking-wide text-sky-600 dark:text-sky-300 mb-1">{segment.speaker}</p>}

                  {display.showText && <div className={`rounded-lg transition ${textSpeaking ? 'bg-indigo-100/80 dark:bg-indigo-900/35 px-2.5 py-2' : ''}`} data-text-channel="text">
                    {textSpeaking && <p className="text-[8px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300 mb-0.5">Playing Text</p>}
                    <p className="text-sm leading-relaxed font-semibold text-slate-800 dark:text-slate-100">{segment.text || <span className="italic text-slate-400">No Text</span>}</p>
                  </div>}

                  {display.showMeaning && <div className={`mt-2 rounded-lg px-2.5 py-2 transition ${meaningSpeaking ? 'bg-emerald-100/80 dark:bg-emerald-900/30 ring-1 ring-emerald-300 dark:ring-emerald-700' : 'bg-slate-50 dark:bg-slate-800'}`} data-text-channel="meaning">
                    <p className={`text-[8px] font-black uppercase tracking-wide mb-0.5 ${meaningSpeaking ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>{meaningSpeaking ? 'Playing Meaning' : 'Meaning'}</p>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{segment.meaning || <span className="italic text-slate-400">No Meaning</span>}</p>
                  </div>}

                  <p className="mt-1.5 text-[8px] font-mono text-slate-400">{segment.id}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" disabled={!segmentPlayable} onClick={() => onPlaySegment?.(segment.id)} className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[9px] font-bold disabled:opacity-35" title="Play only this segment"><PlayCircle className="w-3 h-3 inline mr-1"/>Only</button>
                  <button type="button" onClick={() => onStartFromSegment?.(segment.id)} className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold" title="Start from here and continue"><SkipForward className="w-3 h-3 inline mr-1"/>From here</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>}
    </article>
  );
};

export const TextStructuredPlayer = ({
  documentTree,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingIndex,
  displayMode,
  playbackChannelMode,
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlayDocument,
  onPlayCard,
  onPlaySegment,
  onStartFromSegment
}) => {
  const blocks = documentTree?.blocks || [];
  const playbackList = useMemo(() => resolveStructuredTextPlaybackList(documentTree), [documentTree]);
  const playableList = useMemo(() => playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode)), [playbackList, playbackChannelMode]);
  const structuredSessionActive = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused);

  return (
    <section className="h-full overflow-y-auto pb-32 md:pb-4" data-text-structured-player="true">
      <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-sm p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
            {documentTree?.documentType === 'conversation' ? <MessageSquare className="w-5 h-5"/> : <FileText className="w-5 h-5"/>}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-slate-800 dark:text-white truncate">{documentTree?.title || 'Text Document'}</h2>
            <p className="text-[9px] font-mono text-slate-400">{documentTree?.id || ''} • {blocks.length} cards • {playableList.length}/{playbackList.length} playable</p>
          </div>
          <button type="button" disabled={!playableList.length} onClick={onPlayDocument} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black disabled:opacity-35"><Play className="w-3.5 h-3.5 inline mr-1 fill-current"/>Play Document</button>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-2" data-text-show-controls="true">
            <div className="flex items-center gap-1.5 mb-1.5"><Eye className="w-3.5 h-3.5 text-slate-400"/><span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Show</span><span className="text-[8px] text-slate-400">visual only</span></div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {DISPLAY_OPTIONS.map(option => <button
                key={option}
                type="button"
                onClick={() => onDisplayModeChange?.(option)}
                className={`shrink-0 px-2 py-1.5 rounded-lg text-[9px] font-black transition ${displayMode === option ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
              >{getStructuredTextDisplayModeLabel(option)}</button>)}
            </div>
          </div>

          <div className="rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 p-2" data-text-play-controls="true">
            <div className="flex items-center gap-1.5 mb-1.5"><Volume2 className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Play</span><span className="text-[8px] text-slate-400">TTS channel order</span></div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {PLAY_OPTIONS.map(option => <button
                key={option}
                type="button"
                disabled={structuredSessionActive}
                onClick={() => onPlaybackChannelModeChange?.(option)}
                className={`shrink-0 px-2 py-1.5 rounded-lg text-[9px] font-black transition disabled:opacity-45 ${playbackChannelMode === option ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900'}`}
              >{getStructuredTextPlaybackModeLabel(option)}</button>)}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[9px] text-slate-400">A8 • Show dan Play independen. Voice EN/ID dan speed Browser TTS milik Text diatur dari Player controls. Play mode dikunci selama session aktif.</p>
      </div>

      <div className="space-y-3">
        {blocks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-sm text-slate-400">Document belum memiliki Card. Tambahkan melalui Text → Data.</div>}
        {blocks.map((block, index) => <StructuredPlayerCard
          key={block.id}
          block={block}
          index={index}
          isPlaying={isPlaying}
          isPaused={isPaused}
          speakingPart={speakingPart}
          playingContext={playingContext}
          playingIndex={playingIndex}
          displayMode={displayMode}
          playbackChannelMode={playbackChannelMode}
          onPlayCard={onPlayCard}
          onPlaySegment={onPlaySegment}
          onStartFromSegment={onStartFromSegment}
        />)}
      </div>
    </section>
  );
};

export default TextStructuredPlayer;
