import React from 'react';
import { SkipBack, SkipForward, Pause, Play, XCircle, List, Repeat1, Shuffle, SlidersHorizontal } from 'lucide-react';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from '../../domain/text/textStructuredPlaybackDomain.js';

const BottomPlayerBar = ({
  isMobile,
  isPaused,
  isPlaying,
  playingIndex,
  speakingPart,
  activePlaybackList,
  handleSmartNav,
  handleGlobalPlay,
  forceStopAll,
  playbackMode,
  cyclePlaybackMode,
  setPlaybackMode,
  playingContext,
  structuredTextModeActive = false,
  textPlaybackRepresentationMode = 'split',
  textPlaybackOrder = null,
  textPlaybackChannelMode = 'text-only',
  textActiveCursorSegmentId = null,
  onTextPlaybackRepresentationModeChange,
  onOpenTextPlayer
}) => {
  const isStructuredText = structuredTextModeActive || playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT;
  const compactVoiceLabel = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const tail = raw.split('-').pop() || raw;
    return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
  };
  const globalOrderLabel = channel => {
    const profiles = Array.isArray(textPlaybackOrder?.channels?.[channel]) ? textPlaybackOrder.channels[channel] : [];
    return profiles.map(profile => compactVoiceLabel(profile?.voiceId || profile)).filter(Boolean).join(' > ') || 'Auto';
  };
  const languageOrderLabel = ({ 'text-only': 'EN', 'meaning-only': 'ID', 'text-meaning': 'EN → ID', 'meaning-text': 'ID → EN' })[textPlaybackChannelMode] || 'EN';
  // Full sessions suppress playingIndex per sentence. Use the already tracked cursor only for the label.
  const displayPlayingIndex = (isPlaying || isPaused) ? (playingIndex ?? (isStructuredText ? textActiveCursorSegmentId : null)) : null;
  const representationIsFull = textPlaybackRepresentationMode === 'full';
  const toggleRepresentation = () => onTextPlaybackRepresentationModeChange?.(representationIsFull ? 'split' : 'full');

  const getMobileItemLabel = item => {
    if (!item) return 'Ready';
    if (item.isTextStructuredSegment) {
      const source = speakingPart === 'meaning' ? item.meaning : item.text;
      const channel = speakingPart === 'meaning' ? 'ID' : 'EN';
      const excerpt = source ? `${source.substring(0, 18)}${source.length > 18 ? '…' : ''}` : 'Segment';
      return `${item.documentTitle || 'Text Document'} • ${channel} • ${item.speaker ? `${item.speaker}: ` : ''}${excerpt}`;
    }
    return item.word ? capitalizeDisplayText(item.word) : (item.text ? `${capitalizeDisplayText(item.text.substring(0, 18))}${item.text.length > 18 ? '…' : ''}` : 'Item');
  };
  const getDesktopItemLabel = item => {
    if (!item) return 'Ready';
    if (item.isTextStructuredSegment) {
      const source = speakingPart === 'meaning' ? item.meaning : item.text;
      const channel = speakingPart === 'meaning' ? 'ID' : 'EN';
      const excerpt = source ? `${source.substring(0, 15)}${source.length > 15 ? '…' : ''}` : 'Segment';
      return `${item.documentTitle || 'Text Document'} • ${channel} • ${item.speaker ? `${item.speaker}: ` : ''}${excerpt}`;
    }
    return item.word ? capitalizeDisplayText(item.word) : (item.text ? capitalizeDisplayText(item.text.substring(0, 15))+'...' : 'Item');
  };

  return (
  <div className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-700/80 shadow-2xl z-50 flex-shrink-0 prolingo-text-bottom-player ${isMobile ? 'fixed inset-x-0 bottom-0 w-full px-2.5 pt-2 prolingo-mobile-bottom-safe' : 'px-4 py-3'}`}>
    <div className="max-w-4xl mx-auto">
       <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 md:hidden">
           <div className="flex flex-col min-w-0 pr-1">
             <div className="flex items-center gap-1.5 prolingo-text-player-kicker">
               <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPlaying && !isPaused ? 'bg-emerald-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
               <p className="text-[9px] font-black text-slate-400 tracking-wider">{isPaused ? 'PAUSED' : (isPlaying ? 'NOW PLAYING' : 'READY')}</p>
               {isStructuredText && (isPlaying || isPaused) && speakingPart && (
                 <span className={`rounded px-1 py-0.2 text-[8px] font-black uppercase ${speakingPart === 'meaning' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'}`}>
                   {speakingPart === 'meaning' ? 'ID' : 'EN'}
                 </span>
               )}
             </div>
             <p className="text-xs font-bold truncate text-slate-800 dark:text-slate-100 prolingo-text-player-label">
               {displayPlayingIndex !== null 
                 ? (() => {
                     const item = activePlaybackList.find(p => p.id === displayPlayingIndex);
                     const seqIdx = activePlaybackList.indexOf(item);
                     if (!item) return "Ready";
                     const itemLabel = getMobileItemLabel(item);
                     return `${seqIdx + 1}. ${itemLabel} (${seqIdx + 1}/${activePlaybackList.length})`;
                   })()
                 : "Ready"}
             </p>
             {isStructuredText && <p className="truncate text-[9px] font-semibold text-indigo-600 dark:text-indigo-300" title={`Global language order: ${languageOrderLabel}`}>GLOBAL LANG {languageOrderLabel}</p>}
           </div>
           <div className="flex items-center gap-1.5 prolingo-text-player-controls">
              <button title={isStructuredText ? (representationIsFull ? 'Previous card' : 'Previous sentence') : 'Previous item'} aria-label={isStructuredText ? (representationIsFull ? 'Previous card' : 'Previous sentence') : 'Previous item'} onClick={() => handleSmartNav('prev')} className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-indigo-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-full active:scale-95 transition-all"><SkipBack className="w-4 h-4 fill-current"/></button>
              <button onClick={handleGlobalPlay} aria-label={isPlaying && !isPaused ? 'Pause playback' : 'Start playback'} className={`w-10 h-10 rounded-full shadow-md transform transition-all active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-900' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {isPlaying && !isPaused ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button title={isStructuredText ? (representationIsFull ? 'Next card' : 'Next sentence') : 'Next item'} aria-label={isStructuredText ? (representationIsFull ? 'Next card' : 'Next sentence') : 'Next item'} onClick={() => handleSmartNav('next')} className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-indigo-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-full active:scale-95 transition-all"><SkipForward className="w-4 h-4 fill-current"/></button>
              <button onClick={forceStopAll} aria-label="Stop playback" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-colors" title="Stop"><XCircle className="w-4 h-4"/></button>
           </div>
           <div className="flex justify-end gap-1 pl-0.5">
              {isStructuredText ? (
                <div className="flex items-center gap-1" data-text-global-player-controls="true">
                  <button type="button" onClick={toggleRepresentation} className={`min-h-9 min-w-[44px] rounded-lg border px-1.5 text-[9px] font-black transition-colors ${representationIsFull ? 'border-violet-300 dark:border-violet-700 bg-violet-100/80 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200' : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'}`} title="Toggle global Split / Full">{representationIsFull ? 'FULL' : 'SPLIT'}</button>
                  <button type="button" onClick={onOpenTextPlayer} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40 transition-colors" title="Open Text Player settings" aria-label="Open Text Player settings"><SlidersHorizontal className="w-4 h-4"/></button>
                </div>
              ) : (
                <button onClick={cyclePlaybackMode} className="flex flex-col items-center justify-center gap-0.5 min-w-[42px] p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">
                    {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-500 rounded px-1 text-slate-600 dark:text-slate-400">1</span>}
                    {playbackMode === 'sequence' && <List className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>}
                    {playbackMode === 'repeat_2x' && <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2x</span>}
                    {playbackMode === 'loop_one' && <Repeat1 className="w-5 h-5 text-orange-500"/>}
                    {playbackMode === 'random' && <Shuffle className="w-5 h-5 text-blue-500"/>}
                    <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-full">{playbackMode === 'once' ? 'Once' : playbackMode === 'sequence' ? 'Next' : playbackMode === 'repeat_2x' ? '2x' : playbackMode === 'loop_one' ? 'Loop' : 'Rand'}</span>
                </button>
              )}

           </div>
       </div>

       <div className="hidden md:flex items-center justify-between gap-4">
           <div className="w-72 flex flex-col min-w-0">
             <div className="flex items-center gap-2 mb-0.5">
               <span className={`w-2 h-2 rounded-full ${isPlaying && !isPaused ? 'bg-emerald-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
               <p className="text-[10px] font-black text-slate-400 tracking-wider">GLOBAL PLAYER ({isPaused ? 'PAUSED' : (playingContext ? playingContext.toUpperCase() : 'IDLE')})</p>
               {isStructuredText && (isPlaying || isPaused) && speakingPart && (
                 <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${speakingPart === 'meaning' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                   {speakingPart === 'meaning' ? 'ID' : 'EN'}
                 </span>
               )}
             </div>
             <p className="text-sm font-bold truncate text-slate-800 dark:text-white">
               {displayPlayingIndex !== null 
                 ? (() => {
                     const item = activePlaybackList.find(p => p.id === displayPlayingIndex);
                     const seqIdx = activePlaybackList.indexOf(item);
                     if (!item) return "Ready";
                     return `${seqIdx + 1}. ${getDesktopItemLabel(item)} (${seqIdx + 1}/${activePlaybackList.length} Items)`;
                   })()
                 : "Ready"}
             </p>
             {isStructuredText && <p className="truncate text-[10px] font-semibold text-indigo-600 dark:text-indigo-300" title={`Global language order: ${languageOrderLabel}`}>GLOBAL LANG {languageOrderLabel}</p>}
           </div>

           <div className="flex items-center gap-3">
                <button title={isStructuredText ? (representationIsFull ? 'Previous card' : 'Previous sentence') : 'Previous item'} aria-label={isStructuredText ? (representationIsFull ? 'Previous card' : 'Previous sentence') : 'Previous item'} onClick={() => handleSmartNav('prev')} className="w-11 h-11 flex items-center justify-center text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-full transition-all active:scale-95"><SkipBack className="w-5 h-5 fill-current"/></button>
                <button onClick={handleGlobalPlay} aria-label={isPlaying && !isPaused ? 'Pause playback' : 'Start playback'} className={`w-13 h-13 p-3.5 rounded-full shadow-lg transform transition-all active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-900 hover:bg-amber-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isPlaying && !isPaused ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>
                <button title={isStructuredText ? (representationIsFull ? 'Next card' : 'Next sentence') : 'Next item'} aria-label={isStructuredText ? (representationIsFull ? 'Next card' : 'Next sentence') : 'Next item'} onClick={() => handleSmartNav('next')} className="w-11 h-11 flex items-center justify-center text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-full transition-all active:scale-95"><SkipForward className="w-5 h-5 fill-current"/></button>
                <button onClick={forceStopAll} aria-label="Stop playback" className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/30 rounded-full transition-all active:scale-95" title="Stop"><XCircle className="w-5 h-5"/></button>
           </div>

           <div className="w-72 flex flex-col items-end gap-1">
             {isStructuredText ? (
               <>
                 <div className="flex items-center gap-1.5" data-text-global-player-controls="true">
                   <button type="button" onClick={toggleRepresentation} className={`min-h-9 rounded-xl border px-3 text-[10px] font-black transition-colors ${representationIsFull ? 'border-violet-300 dark:border-violet-700 bg-violet-100/80 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200' : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'}`} title="Toggle global Split / Full">{representationIsFull ? 'FULL' : 'SPLIT'}</button>
                   <button type="button" onClick={onOpenTextPlayer} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-[10px] font-black text-slate-600 hover:text-indigo-600 hover:border-indigo-300 dark:text-slate-200 transition-colors" title="Open Text Player settings"><SlidersHorizontal className="w-3.5 h-3.5"/>SETTINGS</button>
                 </div>
                 <p className="max-w-72 truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400" title={`Global language ${languageOrderLabel} • Local voice EN ${globalOrderLabel('text')} • ID ${globalOrderLabel('meaning')}`}>LANG {languageOrderLabel} • LOCAL VOICE: EN {globalOrderLabel('text')} • ID {globalOrderLabel('meaning')}</p>
               </>
             ) : (
               <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                  <select className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none p-1 cursor-pointer dark:bg-slate-700" value={playbackMode} onChange={(e) => setPlaybackMode(e.target.value)}>
                    <option value="once">Putar Sekali</option>
                    <option value="sequence">Lanjut Otomatis</option>
                    <option value="repeat_2x">Ulangi Item 2x & Lanjut</option>
                    <option value="loop_one">Loop 1 Item</option>
                    <option value="random">Acak</option>
                  </select>
                  <div className="px-2 text-slate-400">
                    {playbackMode === 'sequence' && <List className="w-4 h-4"/>}
                    {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-400 rounded px-1">1</span>}
                    {playbackMode === 'repeat_2x' && <span className="text-xs font-bold">2x</span>}
                    {playbackMode === 'loop_one' && <Repeat1 className="w-4 h-4"/>}
                    {playbackMode === 'random' && <Shuffle className="w-4 h-4"/>}
                  </div>
               </div>
             )}
           </div>
       </div>
    </div>
  </div>
  );
};

export default BottomPlayerBar;
