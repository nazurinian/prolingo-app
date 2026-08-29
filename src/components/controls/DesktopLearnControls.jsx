import React from 'react';
import { Brain, ToggleLeft, ToggleRight } from 'lucide-react';

export default function DesktopLearnControls({
  mode,
  renderPlaybackSequenceBuilder,
  isMemoryMode,
  setIsMemoryMode,
  memorySettings,
  setMemorySettings,
  advancedDatasetStats,
}) {
  if (mode === 'table') {
    return (
                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Learning Playback</p>
                     <div className="flex flex-col gap-2">
                        {renderPlaybackSequenceBuilder(false)}
                        
                        <div className="mt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                            <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600'}`}>
                                 <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>
                                 {isMemoryMode ? <ToggleRight className="w-5 h-5 text-yellow-600 dark:text-yellow-500"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                            </button>
                            
                            {isMemoryMode && (
                                <div className="mt-2 pl-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-word" checked={memorySettings.word} onChange={(e) => setMemorySettings(prev => ({ ...prev, word: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-word" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Word</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-sentence" checked={memorySettings.sentence} onChange={(e) => setMemorySettings(prev => ({ ...prev, sentence: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-sentence" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Sentence</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-meaning" checked={memorySettings.meaning} onChange={(e) => setMemorySettings(prev => ({ ...prev, meaning: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-meaning" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Meaning</label>
                                    </div>
                                    {advancedDatasetStats.hasAdvanced && <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-expressions" checked={memorySettings.expressions} onChange={(e) => setMemorySettings(prev => ({ ...prev, expressions: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-expressions" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide EXP1–EXP5</label>
                                    </div>}
                                    <p className="text-[9px] text-yellow-600 dark:text-yellow-500 mt-1 italic leading-tight pt-1 border-t border-yellow-100 dark:border-yellow-900/50">Klik teks untuk intip (4 detik).</p>
                                </div>
                            )}
                        </div>
                     </div>
                  </div>
    );
  }

  return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3 text-[10px] text-slate-400">Learning Sequence controls are available in Table mode.</div>
  );
}
