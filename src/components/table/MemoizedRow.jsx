import React, { memo, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MOBILE_BOTTOM_PLAYER_RESERVE } from '../../constants/layoutConstants';
import {
  Play, X, MoreVertical, Plus, CheckCircle, Edit3, Trash2, Loader2,
  Layers, Hash, Server, Wand2, FileText, Download
} from 'lucide-react';
import {
  getAdvancedContentCount,
  hasAdvancedContent
} from '../../utils/audioUtils';
import { MasteryStatusControl } from '../progress/MasteryStatusControl';
import AudioDownloadPanel from './AudioDownloadPanel';
import AdvancedExpressionPanel from './AdvancedExpressionPanel';
import InlineLearningCarousel from './InlineLearningCarousel';
import AudioSourceDot from './AudioSourceDot';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';
import { getMemoryRevealKey, isMemoryPartHidden } from '../../utils/memoryModeUtils';
import { useStableOverlayViewport } from '../../hooks/useStableOverlayViewport';

// --- OPTIMIZED ROW COMPONENT (TABLE MODE) ---
export const MemoizedRow = memo(({
    item,
    isActive,
    isSystemBusy,
    toggleStudyItem,
    isInQueue,
    handleIndependentPlay,
    handleRowClick,
    independentPlayingId,
    speakingPart,
    isMemoryMode,
    memorySettings,
    revealedCells,
    toggleCellReveal,
    localWordUrl,
    localWordIdnUrl,
    localSentUrl,
    localMeaningUrl,
    loadedAudioParts,
    preferLocalAudio,
    generateAIAudio,
    aiLoadingId,
    rowId,
    idx,
    style,
    activeMenuId,
    onMenuToggle,
    changeType,
    generatorEngine,
    onEditItem,
    onDeleteItem,
    advancedExpanded,
    onToggleAdvanced,
    masteryState,
    masteryTrackable,
    onCycleMastery,
    playbackSequence,
    audioSourceParts = ''
}) => {
    const [audioPanelOpen, setAudioPanelOpen] = useState(false);
    const isMenuOpen = activeMenuId === rowId;
    const isWordUsingLocal = localWordUrl && preferLocalAudio;
    const isWordActive = isActive && speakingPart === 'word';
    const isWordIdnActive = isActive && speakingPart === 'word_idn';
    const advancedCount = getAdvancedContentCount(item);
    const hasAdvanced = hasAdvancedContent(item);
    const loadedAudioSet = new Set(String(loadedAudioParts || '').split('|').filter(Boolean));
    const loadedAudioCount = loadedAudioSet.size;
    const audioSourceByPart = useMemo(() => Object.fromEntries(String(audioSourceParts || '').split('|').filter(Boolean).map(entry => { const [part, source] = entry.split(':'); return [part, source]; })), [audioSourceParts]);

    const blurClass = "filter blur-sm bg-slate-100 dark:bg-slate-800 select-none cursor-pointer transition-[filter,background-color] duration-300";
    const revealedClass = "filter-none bg-yellow-50 dark:bg-yellow-900/30 cursor-pointer transition-[filter,background-color] duration-300";
    const wordEnRevealKey = getMemoryRevealKey(rowId, 'word');
    const wordIdnRevealKey = getMemoryRevealKey(rowId, 'word_idn');
    const isWordEnHidden = isMemoryMode && isMemoryPartHidden(memorySettings, 'word');
    const isWordIdnHidden = isMemoryMode && isMemoryPartHidden(memorySettings, 'word_idn');
    const wordEnRevealed = revealedCells[wordEnRevealKey];
    const wordIdnRevealed = revealedCells[wordIdnRevealKey];
    const menuViewportStyle = useStableOverlayViewport(isMenuOpen);

    const genColorClass = generatorEngine === 'edge'
        ? 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40'
        : 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/35';

    const miniPlayClass = (active) => `w-5 h-5 flex items-center justify-center rounded-full border transition-colors ${active ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:text-indigo-600')}`;

    const openAudioPanel = (e) => {
        e?.stopPropagation?.();
        onMenuToggle(null);
        setAudioPanelOpen(true);
    };

    return (
        <div style={style} className="absolute left-0 right-0 px-2 py-1.5 md:py-2 z-0">
            <div
                id={rowId}
                onClick={(e) => { e.stopPropagation(); handleRowClick(item, idx); }}
                className={`h-full rounded-xl border p-2.5 md:p-3 flex flex-col justify-between transition-[background-color,border-color,box-shadow] hover:shadow-md cursor-pointer relative ${isActive ? 'bg-blue-600 border-blue-700 dark:border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
            >
                {hasAdvanced && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }}
                        className={`md:hidden absolute top-2 right-11 z-20 h-7 px-2 rounded-full border flex items-center gap-1 text-[9px] font-black ${advancedExpanded ? 'bg-violet-600 text-white border-violet-500' : isActive ? 'bg-blue-700 text-violet-100 border-blue-400' : 'bg-violet-50 dark:bg-violet-900/25 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800'}`}
                        title="INFO + EXP1–EXP5"
                    >
                        <Layers className="w-3 h-3" /> ADV
                    </button>
                )}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMenuToggle(rowId); }}
                    className={`md:hidden absolute top-2 right-2 z-20 h-8 w-8 rounded-full flex items-center justify-center transition-colors ${isActive ? 'text-white hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    aria-label="Vocabulary actions"
                >
                    <MoreVertical className="w-5 h-5" />
                </button>

                <div className="flex flex-col md:flex-row justify-between items-start gap-1.5 md:gap-2 h-full">
                    <div className="flex-1 w-full min-w-0 overflow-hidden flex flex-col gap-0.5 md:gap-1 h-full">
                        <div className="flex items-start md:items-center gap-2 md:gap-3 flex-shrink-0 mb-0.5 md:mb-1 pr-[76px] md:pr-0">
                            <div className="w-10 md:w-12 flex flex-col items-center mt-1 md:mt-0 gap-0.5 flex-shrink-0">
                                <span className={`text-xs font-mono font-bold ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                                {changeType && <span className={`text-[8px] leading-none px-1 py-0.5 rounded font-black tracking-wide ${changeType === 'added' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{changeType === 'added' ? 'NEW' : 'EDITED'}</span>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word', `${rowId}-word`); }} className={`relative flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 md:mt-0 ${independentPlayingId === `${rowId}-word` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>
                                {independentPlayingId === `${rowId}-word` ? <X className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current"/>}
                                <AudioSourceDot source={audioSourceByPart.word} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="md:hidden min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <div className={`min-w-0 ${isWordEnHidden ? (wordEnRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordEnHidden && toggleCellReveal(e, wordEnRevealKey)}>
                                            <h3 className={`min-w-0 truncate text-base leading-snug ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100' : 'text-slate-800 dark:text-slate-100')}`}>{capitalizeDisplayText(item.word)}</h3>
                                        </div>
                                        {item.partOfSpeech && <span className={`text-[9px] italic border px-1 rounded flex-shrink-0 ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.partOfSpeech}</span>}
                                    </div>
                                    {item.meaningWord && <div className={`mt-1 h-6 max-w-full rounded-md border px-1.5 flex items-center gap-1.5 ${isWordIdnActive ? 'font-bold text-white bg-blue-500/30 border-blue-300' : isActive ? 'text-blue-200 border-blue-400 bg-blue-500/40' : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/30'}`}><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word_idn', `${rowId}-word-idn`); }} className={`${miniPlayClass(independentPlayingId === `${rowId}-word-idn`)} relative`} title="Play word translation">{independentPlayingId === `${rowId}-word-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}<AudioSourceDot source={audioSourceByPart.word_idn} /></button><span className={`min-w-0 truncate text-[10px] ${isWordIdnHidden ? (wordIdnRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordIdnHidden && toggleCellReveal(e, wordIdnRevealKey)}>{capitalizeDisplayText(item.meaningWord)}</span></div>}
                                </div>
                                <div className="hidden md:flex md:items-center gap-2 min-w-0">
                                    <div className={`min-w-0 ${isWordEnHidden ? (wordEnRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordEnHidden && toggleCellReveal(e, wordEnRevealKey)}>
                                        <h3 className={`text-lg leading-snug line-clamp-1 ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100' : 'text-slate-800 dark:text-slate-100')}`}>{capitalizeDisplayText(item.word)}</h3>
                                    </div>
                                    {item.partOfSpeech && <span className={`text-[10px] italic border px-1 rounded flex-shrink-0 ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.partOfSpeech}</span>}
                                    {item.meaningWord && <div className={`text-[10px] border pl-1 pr-1.5 py-0.5 rounded flex items-center gap-1 min-w-0 ${isWordIdnActive ? 'font-bold text-white bg-blue-500/30 border-blue-300' : (isActive ? 'text-blue-200 border-blue-400 bg-blue-500' : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800')}`}><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word_idn', `${rowId}-word-idn`); }} className={`${miniPlayClass(independentPlayingId === `${rowId}-word-idn`)} relative`} title="Play word translation">{independentPlayingId === `${rowId}-word-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}<AudioSourceDot source={audioSourceByPart.word_idn} /></button><span className={`truncate ${isWordIdnHidden ? (wordIdnRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordIdnHidden && toggleCellReveal(e, wordIdnRevealKey)}>{capitalizeDisplayText(item.meaningWord)}</span></div>}
                                    {item.vocabId && <span className={`hidden lg:inline text-[9px] font-mono border px-1 rounded ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.vocabId}</span>}
                                    {masteryTrackable && <MasteryStatusControl state={masteryState} onCycle={onCycleMastery} compact className="hidden md:inline-flex flex-shrink-0" />}
                                </div>
                            </div>
                            {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }} className={`hidden md:flex items-center gap-1 px-1.5 py-1 rounded border text-[9px] font-black flex-shrink-0 ${advancedExpanded ? 'bg-violet-600 text-white border-violet-500' : (isActive ? 'bg-blue-700 text-violet-100 border-blue-400' : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800')}`} title="Open INFO + EXP1–EXP5"><Layers className="w-3 h-3"/>ADV {advancedCount}</button>}
                            {isWordUsingLocal ? <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold hidden md:flex"><Hash className="w-3 h-3"/> OK</span> : <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold hidden md:flex ${isActive ? 'bg-blue-700 text-blue-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>TTS</span>}
                        </div>

                        <InlineLearningCarousel
                            item={item}
                            rowId={rowId}
                            isActive={isActive}
                            speakingPart={speakingPart}
                            playbackSequence={playbackSequence}
                            independentPlayingId={independentPlayingId}
                            handleIndependentPlay={handleIndependentPlay}
                            isMemoryMode={isMemoryMode}
                            memorySettings={memorySettings}
                            revealedCells={revealedCells}
                            toggleCellReveal={toggleCellReveal}
                            blurClass={blurClass}
                            revealedClass={revealedClass}
                            audioSourceByPart={audioSourceByPart}
                        />
                    </div>

                    <div className={`hidden md:flex md:flex-col md:ml-2 justify-center items-end w-[78px] gap-1.5 flex-shrink-0 md:border-l md:pl-2 ${isActive ? 'border-blue-500' : 'border-slate-100 dark:border-slate-700'}`}>
                        <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); }} className={`w-full h-[24px] flex items-center justify-center gap-1 rounded border text-[9px] font-bold ${isInQueue ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>{isInQueue ? <CheckCircle className="w-3 h-3"/> : <Plus className="w-3 h-3"/>}<span>{isInQueue ? 'Added' : 'Add'}</span></button>
                        <div className="flex gap-1 w-full"><button onClick={(e) => { e.stopPropagation(); onEditItem(item); }} className="flex-1 h-[24px] flex items-center justify-center rounded border border-blue-100 dark:border-blue-900 text-blue-500" title="Edit vocabulary"><Edit3 className="w-3 h-3"/></button><button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }} className="flex-1 h-[24px] flex items-center justify-center rounded border border-red-100 dark:border-red-900 text-red-500" title="Delete vocabulary"><Trash2 className="w-3 h-3"/></button></div>
                        <button disabled={isSystemBusy} onClick={openAudioPanel} className={`w-full min-h-[34px] px-1.5 rounded-lg border flex flex-col items-center justify-center leading-tight ${genColorClass} ${isSystemBusy ? 'opacity-45' : ''}`} title="Audio download / replace"><span className="flex items-center gap-1 text-[9px] font-black">{aiLoadingId?.startsWith(`${item.id}-`) ? <Loader2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3"/>} Audio</span><span className="text-[8px] font-bold opacity-70">{loadedAudioCount ? `${loadedAudioCount} loaded` : 'Download'}</span></button>
                    </div>
                </div>
            </div>

            {isMenuOpen && typeof document !== 'undefined' && createPortal(
                <>
                    <button
                        type="button"
                        aria-label="Close vocabulary actions"
                        onClick={() => onMenuToggle(null)}
                        className="md:hidden fixed inset-x-0 top-0 z-[84] bg-slate-950/45 backdrop-blur-[1px]"
                        style={{ height: '100lvh' }}
                    />
                    <div className="md:hidden fixed top-0 left-0 z-[85] flex items-center justify-center p-4 overflow-hidden pointer-events-none" style={menuViewportStyle} onClick={(e) => e.stopPropagation()}>
                    <section className="pointer-events-auto relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-3" style={{ maxHeight: `calc(var(--prolingo-overlay-height, 100dvh) - ${MOBILE_BOTTOM_PLAYER_RESERVE + 28}px - env(safe-area-inset-bottom, 0px))` }}>
                        <div className="flex items-center justify-between gap-2 mb-2"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-800 dark:text-white">{capitalizeDisplayText(item.word)}</p><p className="text-[9px] text-slate-400">Vocabulary actions</p></div><button type="button" onClick={() => onMenuToggle(null)} className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500"><X className="w-3.5 h-3.5"/></button></div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); onMenuToggle(null); }} className={`min-h-10 px-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold border ${isInQueue ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{isInQueue ? <CheckCircle className="w-3.5 h-3.5"/> : <Plus className="w-3.5 h-3.5"/>}{isInQueue ? 'In Queue' : 'Add Queue'}</button>
                            {masteryTrackable ? <MasteryStatusControl state={masteryState} onCycle={() => { onCycleMastery(); onMenuToggle(null); }} className="w-full min-h-10" /> : <div />}
                            <button onClick={(e) => { e.stopPropagation(); onEditItem(item); onMenuToggle(null); }} className="min-h-10 px-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"><Edit3 className="w-3.5 h-3.5"/> Edit</button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); onMenuToggle(null); }} className="min-h-10 px-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"><Trash2 className="w-3.5 h-3.5"/> Delete</button>
                            <button disabled={isSystemBusy} onClick={openAudioPanel} className={`col-span-2 min-h-11 px-3 rounded-xl flex items-center justify-between gap-2 text-[10px] font-black border ${genColorClass} ${isSystemBusy ? 'opacity-45' : ''}`}><span className="flex items-center gap-2"><Download className="w-3.5 h-3.5"/> Audio</span><span className="text-[9px] opacity-70">{loadedAudioCount ? `${loadedAudioCount} loaded` : generatorEngine.toUpperCase()}</span></button>
                        </div>
                    </section>
                    </div>
                </>,
                document.body
            )}

            <AdvancedExpressionPanel
                open={advancedExpanded}
                onClose={onToggleAdvanced}
                item={item}
                rowId={rowId}
                isActive={isActive}
                speakingPart={speakingPart}
                independentPlayingId={independentPlayingId}
                handleIndependentPlay={handleIndependentPlay}
                isMemoryMode={isMemoryMode}
                memorySettings={memorySettings}
                revealedCells={revealedCells}
                toggleCellReveal={toggleCellReveal}
                blurClass={blurClass}
                revealedClass={revealedClass}
                playbackSequence={playbackSequence}
                audioSourceByPart={audioSourceByPart}
            />
            <AudioDownloadPanel
                open={audioPanelOpen}
                onClose={() => setAudioPanelOpen(false)}
                item={item}
                generatorEngine={generatorEngine}
                isSystemBusy={isSystemBusy}
                aiLoadingId={aiLoadingId}
                generateAIAudio={generateAIAudio}
                loadedAudioParts={loadedAudioParts}
            />
        </div>
    );
}, (prev, next) => (
    prev.item === next.item &&
    prev.isActive === next.isActive &&
    prev.isSystemBusy === next.isSystemBusy &&
    prev.isInQueue === next.isInQueue &&
    prev.independentPlayingId === next.independentPlayingId &&
    prev.speakingPart === next.speakingPart &&
    prev.isMemoryMode === next.isMemoryMode &&
    prev.memorySettings === next.memorySettings &&
    prev.revealedCells === next.revealedCells &&
    prev.preferLocalAudio === next.preferLocalAudio &&
    prev.localWordUrl === next.localWordUrl &&
    prev.localWordIdnUrl === next.localWordIdnUrl &&
    prev.localSentUrl === next.localSentUrl &&
    prev.localMeaningUrl === next.localMeaningUrl &&
    prev.loadedAudioParts === next.loadedAudioParts &&
    prev.aiLoadingId === next.aiLoadingId &&
    prev.style.top === next.style.top &&
    prev.activeMenuId === next.activeMenuId &&
    prev.changeType === next.changeType &&
    prev.generatorEngine === next.generatorEngine &&
    prev.advancedExpanded === next.advancedExpanded &&
    prev.masteryState === next.masteryState &&
    prev.masteryTrackable === next.masteryTrackable &&
    prev.playbackSequence === next.playbackSequence &&
    prev.audioSourceParts === next.audioSourceParts
));

// --- OPTIMIZED ROW COMPONENT (TEXT MODE) ---
export const MemoizedTextRow = memo(({ 
    item, 
    style, 
    isActive, 
    isTextActive, 
    handleManualRowClick, 
    handleDeleteTextItem, 
    localTextUrl, 
    isSystemBusy, 
    generateAIAudio, 
    aiLoadingId,
    preferLocalAudio,
    generatorEngine
}) => {
    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';

    return (
        <div 
            style={style} 
            className="absolute left-0 right-0 w-full px-2 py-1"
        >
            <div 
                id={`row-${item.id}`} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleManualRowClick(item, item.virtualIdx); 
                }} 
                className={`h-full rounded-lg px-3 py-2 transition-all hover:shadow-sm flex items-start gap-3 cursor-pointer overflow-hidden ${isActive ? 'bg-blue-600 border border-blue-700 dark:border-blue-500' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
            >
                <div className="flex flex-col items-center gap-1 mt-0.5 flex-shrink-0">
                    <span className={`text-xs font-mono w-6 text-center ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                    {localTextUrl && preferLocalAudio ? <Hash className="w-3 h-3 text-green-500"/> : <FileText className={`w-3 h-3 ${isActive ? 'text-blue-300' : 'text-slate-300 dark:text-slate-600'}`} />}
                </div>
                <p className={`text-sm flex-1 leading-relaxed whitespace-pre-line overflow-hidden text-ellipsis line-clamp-3 md:line-clamp-2 ${isTextActive ? 'font-bold text-white' : (isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300')}`}>{item.text}</p>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTextItem(item.virtualIdx); }} className={`p-1.5 rounded-md border transition-colors mr-1 ${isActive ? 'bg-blue-500 text-blue-200 border-blue-400 hover:bg-red-500 hover:text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200'}`}><Trash2 className="w-3.5 h-3.5"/></button>
                    <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold transition-[background-color,border-color,opacity] ${localTextUrl ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' : genColorClass} ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                            {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : localTextUrl ? <CheckCircle className="w-3 h-3" /> : <GenIcon className="w-3 h-3"/>} {localTextUrl ? 'Replace' : 'Gen'}
                        </button>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.style.top === next.style.top && 
        prev.isActive === next.isActive &&
        prev.isTextActive === next.isTextActive &&
        prev.isSystemBusy === next.isSystemBusy &&
        prev.localTextUrl === next.localTextUrl &&
        prev.aiLoadingId === next.aiLoadingId &&
        prev.preferLocalAudio === next.preferLocalAudio &&
        prev.generatorEngine === next.generatorEngine
    );
});

export default MemoizedRow;
