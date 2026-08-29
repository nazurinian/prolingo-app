import React from 'react';
import { BookOpen, Brain, ToggleLeft, ToggleRight } from 'lucide-react';

export default function MobileLearnControls({
  mode,
  renderPlaybackSequenceBuilder,
  isMemoryMode,
  setIsMemoryMode,
  memorySettings,
  setMemorySettings,
  advancedDatasetStats,
}) {
  return (
    <>
              {mode === 'table' ? <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400"/> Learning Playback</h3>
                  {renderPlaybackSequenceBuilder(true)}
                  <div className="mt-3 border-t border-dashed border-slate-200 dark:border-slate-700 pt-3">
                      <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600'}`}><span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>{isMemoryMode ? <ToggleRight className="w-5 h-5"/> : <ToggleLeft className="w-5 h-5"/>}</button>
                      {isMemoryMode && <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-slate-600 dark:text-slate-300">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.word} onChange={e => setMemorySettings(prev => ({...prev, word:e.target.checked}))} className="accent-yellow-600"/>Hide Word</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.meaning} onChange={e => setMemorySettings(prev => ({...prev, meaning:e.target.checked}))} className="accent-yellow-600"/>Hide Meaning</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.sentence} onChange={e => setMemorySettings(prev => ({...prev, sentence:e.target.checked}))} className="accent-yellow-600"/>Hide Sentence</label>
                          {advancedDatasetStats.hasAdvanced && <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.expressions} onChange={e => setMemorySettings(prev => ({...prev, expressions:e.target.checked}))} className="accent-yellow-600"/>Hide EXP</label>}
                      </div>}
                  </div>
              </div> : <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-xs text-slate-400">Learning Sequence controls are available in Table mode.</div>}
    </>
  );
}
