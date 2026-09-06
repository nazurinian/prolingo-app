import React from 'react';
import { SkipBack, SkipForward, Pause, Play, XCircle, List, Repeat1, Shuffle } from 'lucide-react';
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
  structuredTextModeActive = false
}) => {
  const isStructuredText = structuredTextModeActive || playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT;
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
  <div className={`bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-2xl z-50 flex-shrink-0 ${isMobile ? 'fixed inset-x-0 bottom-0 w-full px-2 pt-2 prolingo-mobile-bottom-safe' : 'p-4'}`}>
    <div className="max-w-4xl mx-auto">
       <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 md:hidden">
           <div className="flex flex-col min-w-0 pr-1">
             <p className="text-[10px] font-bold text-slate-400 tracking-wider">{isPaused ? 'PAUSED' : 'NOW PLAYING'}</p>
             <p className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">
               {playingIndex !== null 
                 ? (() => {
                     const item = activePlaybackList.find(p => p.id === playingIndex);
                     const seqIdx = activePlaybackList.indexOf(item);
                     if (!item) return "Ready";
                     const itemLabel = getMobileItemLabel(item);
                     return `${seqIdx + 1}. ${itemLabel} (${seqIdx + 1}/${activePlaybackList.length})`;
                   })()
                 : "Ready"}
             </p>
           </div>
           <div className="relative -left-1 flex items-center gap-1.5">
              <button onClick={() => handleSmartNav('prev')} className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipBack className="w-4 h-4 fill-current"/></button>
              <button onClick={handleGlobalPlay} className={`p-2.5 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800' : 'bg-indigo-600 text-white'}`}>
                {isPlaying && !isPaused ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={() => handleSmartNav('next')} className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipForward className="w-4 h-4 fill-current"/></button>
              <button onClick={forceStopAll} className="ml-1.5 p-1.5 text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700 rounded-full active:scale-95 transition-colors" title="Stop"><XCircle className="w-4 h-4"/></button>
           </div>
           <div className="flex justify-end gap-1 pl-1">
              {isStructuredText ? (
                <div className="flex flex-col items-center justify-center gap-0.5 min-w-[42px] p-1 text-indigo-600 dark:text-indigo-300">
                  <List className="w-5 h-5"/>
                  <span className="text-[9px] font-bold uppercase">Text</span>
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
           <div className="w-64 flex flex-col">
             <div className="flex items-center gap-2 mb-1">
               <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
               <p className="text-[10px] font-bold text-slate-400 tracking-wider">GLOBAL PLAYER ({isPaused ? 'PAUSED' : (playingContext ? playingContext.toUpperCase() : 'IDLE')})</p>
             </div>
             <p className="text-sm font-semibold truncate text-slate-800 dark:text-white">
               {playingIndex !== null 
                 ? (() => {
                     const item = activePlaybackList.find(p => p.id === playingIndex);
                     const seqIdx = activePlaybackList.indexOf(item);
                     if (!item) return "Ready";
                     return `${seqIdx + 1}. ${getDesktopItemLabel(item)} (${seqIdx + 1}/${activePlaybackList.length} Items)`;
                   })()
                 : "Ready"}
             </p>
           </div>

           <div className="flex items-center gap-4">
                <button onClick={() => handleSmartNav('prev')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipBack className="w-6 h-6 fill-current"/></button>
                <button onClick={handleGlobalPlay} className={`p-4 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isPlaying && !isPaused ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                </button>
                <button onClick={() => handleSmartNav('next')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipForward className="w-6 h-6 fill-current"/></button>
                <button onClick={forceStopAll} className="p-3 text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700 rounded-full transition active:scale-95" title="Stop"><XCircle className="w-5 h-5"/></button>
           </div>

           <div className="w-64 flex flex-col items-end gap-1">
             {isStructuredText ? (
               <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-lg text-xs font-black">
                 <List className="w-4 h-4"/> Structured Text
               </div>
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
