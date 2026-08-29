import React, { memo } from 'react';
import { 
  Play, X, MoreVertical, Plus, CheckCircle, Edit3, Trash2, Loader2, 
  Layers, Globe, Hash, Server, Wand2, FileText 
} from 'lucide-react';
import { 
  getAdvancedExpressionPairs, 
  getAdvancedContentCount, 
  hasAdvancedContent 
} from '../../utils/audioUtils';
import HighlightedText from '../common/HighlightedText';
import { MasteryStatusControl } from '../progress/MasteryStatusControl';

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
    onCycleMastery
}) => {
    const isMenuOpen = activeMenuId === rowId;
    const isWordUsingLocal = localWordUrl && preferLocalAudio;
    const isWordActive = isActive && speakingPart === 'word';
    const isWordIdnActive = isActive && speakingPart === 'word_idn';
    const isSentActive = isActive && speakingPart === 'sentence';
    const isMeaningActive = isActive && speakingPart === 'meaning';
    const advancedPairs = getAdvancedExpressionPairs(item);
    const advancedCount = getAdvancedContentCount(item);
    const hasAdvanced = hasAdvancedContent(item);

    const blurClass = "filter blur-sm bg-slate-100 dark:bg-slate-800 select-none cursor-pointer transition-all duration-300";
    const revealedClass = "filter-none bg-yellow-50 dark:bg-yellow-900/30 cursor-pointer transition-all duration-300";
    const isWordHidden = isMemoryMode && memorySettings.word;
    const isSentHidden = isMemoryMode && memorySettings.sentence;
    const isMeaningHidden = isMemoryMode && memorySettings.meaning;
    const isExpressionsHidden = isMemoryMode && memorySettings.expressions;
    const wordRevealed = revealedCells[`${rowId}-word`];
    const sentRevealed = revealedCells[`${rowId}-sent`];
    const meaningRevealed = revealedCells[`${rowId}-meaning`];

    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50';

    const miniPlayClass = (active) => `w-5 h-5 flex items-center justify-center rounded-full border transition-colors ${active ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:text-indigo-600')}`;

    return (
        <div style={style} className="absolute left-0 right-0 px-2 py-2 z-0">
            <div 
                id={rowId} 
                onClick={(e) => { e.stopPropagation(); handleRowClick(item, idx); }} 
                className={`h-full rounded-xl border p-3 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer relative ${isActive ? 'bg-blue-600 border-blue-700 dark:border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
            >
                <div className="md:hidden absolute top-2 right-2 z-20">
                    <button onClick={(e) => { e.stopPropagation(); onMenuToggle(rowId); }} className={`p-1.5 rounded-full transition-colors ${isActive ? 'text-white hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute top-8 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg p-1 flex flex-col gap-1 w-36 z-30 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                            <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded text-[10px] font-bold border ${isInQueue ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700'}`}>
                                {isInQueue ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{isInQueue ? 'Added' : 'Queue'}
                            </button>
                            {masteryTrackable && <MasteryStatusControl state={masteryState} onCycle={() => { onCycleMastery(); onMenuToggle(null); }} className="w-full" />}
                            {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); onMenuToggle(null); }} className="w-full px-2 py-1.5 flex items-center gap-2 rounded text-[10px] font-bold border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20"><Layers className="w-3 h-3"/>{advancedExpanded ? 'Basic View' : `Advanced (${advancedCount})`}</button>}
                            <div className="grid grid-cols-2 gap-1">
                                <button onClick={(e) => { e.stopPropagation(); onEditItem(item); onMenuToggle(null); }} className="px-2 py-1.5 flex items-center justify-center gap-1 rounded text-[10px] font-bold border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"><Edit3 className="w-3 h-3"/> Edit</button>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); onMenuToggle(null); }} className="px-2 py-1.5 flex items-center justify-center gap-1 rounded text-[10px] font-bold border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"><Trash2 className="w-3 h-3"/> Del</button>
                            </div>
                            <div className="h-[1px] bg-slate-100 dark:bg-slate-700 w-full my-0.5"/>
                            {localWordUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Word OK</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Word</span></button>}
                            {generatorEngine === 'edge' && item.meaningWord && (localWordIdnUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Word IDN OK</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word_idn'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word_idn` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Word IDN</span></button>)}
                            {localSentUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Sent OK</span></button> : <button disabled={isSystemBusy || !item.sentence} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border ${genColorClass} ${(isSystemBusy || !item.sentence) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Sent</span></button>}
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start gap-2 h-full">
                    <div className="flex-1 w-full min-w-0 overflow-hidden flex flex-col gap-1 h-full">
                        <div className="flex items-start md:items-center gap-3 flex-shrink-0 mb-1 pr-8 md:pr-0">
                            <div className="w-12 flex flex-col items-center mt-1 md:mt-0 gap-0.5">
                                <span className={`text-xs font-mono font-bold ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                                {changeType && <span className={`text-[8px] leading-none px-1 py-0.5 rounded font-black tracking-wide ${changeType === 'added' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{changeType === 'added' ? 'NEW' : 'EDITED'}</span>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word', `${rowId}-word`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 md:mt-0 ${independentPlayingId === `${rowId}-word` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>
                                {independentPlayingId === `${rowId}-word` ? <X className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current"/>}
                            </button>
                            <div className={`flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0 ${isWordHidden ? (wordRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordHidden && toggleCellReveal(e, `${rowId}-word`)}>
                                <h3 className={`text-lg leading-snug line-clamp-2 md:line-clamp-1 ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100' : 'text-slate-800 dark:text-slate-100')}`}>{item.word}</h3>
                                <div className="flex items-center gap-1 min-w-0 overflow-hidden max-w-full">
                                    {item.partOfSpeech && <span className={`text-[10px] italic border px-1 rounded flex-shrink-0 ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.partOfSpeech}</span>}
                                    {item.meaningWord && <div className={`text-[10px] border pl-1 pr-1.5 py-0.5 rounded flex items-center gap-1 min-w-0 ${isWordIdnActive ? 'font-bold text-white bg-blue-500/30 border-blue-300' : (isActive ? 'text-blue-200 border-blue-400 bg-blue-500' : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800')}`}><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word_idn', `${rowId}-word-idn`); }} className={miniPlayClass(independentPlayingId === `${rowId}-word-idn`)} title="Play word translation">{independentPlayingId === `${rowId}-word-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><span className="truncate">{item.meaningWord}</span></div>}
                                    {item.vocabId && <span className={`hidden lg:inline text-[9px] font-mono border px-1 rounded ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.vocabId}</span>}
                                    {masteryTrackable && <MasteryStatusControl state={masteryState} onCycle={onCycleMastery} compact className="hidden md:inline-flex flex-shrink-0" />}
                                </div>
                            </div>
                            {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }} className={`hidden md:flex items-center gap-1 px-1.5 py-1 rounded border text-[9px] font-black flex-shrink-0 ${advancedExpanded ? 'bg-violet-600 text-white border-violet-500' : (isActive ? 'bg-blue-700 text-violet-100 border-blue-400' : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800')}`} title="Toggle INFO + EXP1–EXP5"><Layers className="w-3 h-3"/>ADV {advancedCount}</button>}
                            {isWordUsingLocal ? <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold hidden md:flex"><Hash className="w-3 h-3"/> OK</span> : <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold hidden md:flex ${isActive ? 'bg-blue-700 text-blue-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>TTS</span>}
                        </div>

                        <div className="flex flex-col gap-2 pl-0 md:pl-11 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                            {!advancedExpanded ? (
                                <>
                                    {item.sentence && <div className="flex gap-2 items-start">
                                        <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'sentence', `${rowId}-sent`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 ${independentPlayingId === `${rowId}-sent` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>{independentPlayingId === `${rowId}-sent` ? <X className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current"/>}</button>
                                        <div className={`flex-1 ${isSentHidden ? (sentRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isSentHidden && toggleCellReveal(e, `${rowId}-sent`)}><p className={`text-sm leading-relaxed line-clamp-4 md:line-clamp-2 ${isSentActive ? 'font-bold text-white' : (isActive ? 'text-blue-50 font-medium' : 'text-slate-600 dark:text-slate-300')}`}>&ldquo;<HighlightedText text={item.sentence} highlight={item.word} />&rdquo;</p></div>
                                    </div>}
                                    {item.meaning && <div className="flex gap-2 items-start md:ml-6">
                                        <div className="w-6 flex justify-center flex-shrink-0 mt-0.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'meaning', `${rowId}-meaning`); }} className={`w-4 h-4 flex items-center justify-center rounded-full border ${independentPlayingId === `${rowId}-meaning` ? 'bg-red-50 dark:bg-red-900/30 text-red-500' : (isActive ? 'bg-blue-500/50 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-indigo-600')}`}>{independentPlayingId === `${rowId}-meaning` ? <X className="w-2 h-2"/> : <Play className="w-2 h-2 fill-current"/>}</button></div>
                                        <div className={`flex-1 ${isMeaningHidden ? (meaningRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isMeaningHidden && toggleCellReveal(e, `${rowId}-meaning`)}><p className={`text-xs italic line-clamp-3 md:line-clamp-2 ${isMeaningActive ? 'font-bold text-white bg-blue-500/20 px-1 rounded' : (isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500')}`}><HighlightedText text={item.meaning} highlight={item.meaningWord || item.word}/><Globe className="w-3 h-3 inline-block ml-1 opacity-50"/></p></div>
                                    </div>}
                                    {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }} className={`md:hidden self-start flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold ${isActive ? 'border-blue-400 text-blue-100 bg-blue-700/60' : 'border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20'}`}><Layers className="w-3 h-3"/> INFO + EXP1–EXP5 ({advancedCount})</button>}
                                </>
                            ) : (
                                <div className="space-y-2 pb-1" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between gap-2 sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 rounded py-1">
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-violet-100' : 'text-violet-600 dark:text-violet-300'}`}>Advanced Spoken Expressions</span>
                                        <button onClick={onToggleAdvanced} className={`px-2 py-0.5 rounded text-[9px] font-bold border ${isActive ? 'border-blue-400 text-blue-100' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>Basic</button>
                                    </div>
                                    {item.info && <div className={`rounded-lg border px-2 py-1.5 ${isActive ? 'border-blue-400 bg-blue-700/30' : 'border-amber-100 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-900/10'}`}><span className={`text-[9px] font-black uppercase mr-2 ${isActive ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400'}`}>INFO</span><span className={`text-[11px] ${isActive ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}`}>{item.info}</span></div>}
                                    {advancedPairs.filter(pair => pair.en.trim() || pair.idn.trim()).map(pair => {
                                        const expKey = `${rowId}-exp${pair.number}`;
                                        const revealed = revealedCells[expKey];
                                        return <div key={pair.number} className={`rounded-lg border px-2 py-1.5 ${isActive ? 'border-blue-400/70 bg-blue-700/20' : 'border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30'}`}>
                                            <div className="flex items-start gap-2">
                                                <span className={`text-[9px] font-black w-9 flex-shrink-0 pt-0.5 ${isActive ? 'text-violet-100' : 'text-violet-600 dark:text-violet-400'}`}>EXP{pair.number}</span>
                                                <div className={`flex-1 min-w-0 space-y-1 ${isExpressionsHidden ? (revealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isExpressionsHidden && toggleCellReveal(e, expKey)}>
                                                    {pair.en && <div className="flex items-start gap-1.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, `exp${pair.number}_en`, `${rowId}-exp${pair.number}-en`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-en`)}>{independentPlayingId === `${rowId}-exp${pair.number}-en` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><p className={`text-[11px] leading-relaxed ${speakingPart === `exp${pair.number}_en` && isActive ? 'font-bold text-white' : (isActive ? 'text-blue-50' : 'text-slate-700 dark:text-slate-200')}`}>{pair.en}</p></div>}
                                                    {pair.idn && <div className="flex items-start gap-1.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, `exp${pair.number}_idn`, `${rowId}-exp${pair.number}-idn`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-idn`)}>{independentPlayingId === `${rowId}-exp${pair.number}-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><p className={`text-[10px] italic leading-relaxed ${speakingPart === `exp${pair.number}_idn` && isActive ? 'font-bold text-white' : (isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500')}`}>{pair.idn}</p></div>}
                                                </div>
                                            </div>
                                        </div>;
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`hidden md:flex md:flex-col md:ml-2 justify-center items-end w-auto gap-1 flex-shrink-0 md:border-l md:pl-2 ${isActive ? 'border-blue-500' : 'border-slate-100 dark:border-slate-700'}`}>
                        <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); }} className={`md:w-[55px] md:h-[22px] flex items-center justify-center gap-1 rounded border text-[9px] font-bold ${isInQueue ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>{isInQueue ? <CheckCircle className="w-3 h-3"/> : <Plus className="w-3 h-3"/>}<span>{isInQueue ? 'Added' : 'Add'}</span></button>
                        <div className="flex gap-1"><button onClick={(e) => { e.stopPropagation(); onEditItem(item); }} className="w-[27px] h-[20px] flex items-center justify-center rounded border border-blue-100 dark:border-blue-900 text-blue-500" title="Edit vocabulary"><Edit3 className="w-3 h-3"/></button><button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }} className="w-[27px] h-[20px] flex items-center justify-center rounded border border-red-100 dark:border-red-900 text-red-500" title="Delete vocabulary"><Trash2 className="w-3 h-3"/></button></div>
                        <div className="flex flex-col gap-1 items-end">
                            {localWordUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Word</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Word</span></button>}
                            {generatorEngine === 'edge' && item.meaningWord && (localWordIdnUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">W-ID</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word_idn'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word_idn` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">W-ID</span></button>)}
                            {localSentUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Sent</span></button> : <button disabled={isSystemBusy || !item.sentence} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border ${genColorClass} ${(isSystemBusy || !item.sentence) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Sent</span></button>}
                            {generatorEngine === 'edge' && (localMeaningUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Mean</span></button> : <button disabled={isSystemBusy || !item.meaning} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'meaning'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${(isSystemBusy || !item.meaning) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-meaning` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Mean</span></button>)}
                        </div>
                    </div>
                </div>
            </div>
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
    prev.aiLoadingId === next.aiLoadingId &&
    prev.style.top === next.style.top &&
    prev.activeMenuId === next.activeMenuId &&
    prev.changeType === next.changeType &&
    prev.generatorEngine === next.generatorEngine &&
    prev.advancedExpanded === next.advancedExpanded &&
    prev.masteryState === next.masteryState &&
    prev.masteryTrackable === next.masteryTrackable
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
                    {localTextUrl ? (
                         <button disabled className={`flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs font-bold border border-green-200 dark:border-green-800 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> OK</button>
                    ) : (
                        <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold transition-all ${genColorClass} ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                            {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>} Gen
                        </button>
                    )}
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
