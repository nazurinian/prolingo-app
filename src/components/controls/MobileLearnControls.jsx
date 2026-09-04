import React from 'react';
import { BookOpen, Brain, ToggleLeft, ToggleRight } from 'lucide-react';
import MemoryModeFieldControls from './MemoryModeFieldControls';

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
      {mode === 'table' ? <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400"/> Learning Playback</h3>
        {renderPlaybackSequenceBuilder(true)}
        <div className="mt-2.5 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2.5">
          <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-[background-color,border-color,color] ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600'}`}><span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>{isMemoryMode ? <ToggleRight className="w-5 h-5"/> : <ToggleLeft className="w-5 h-5"/>}</button>
          {isMemoryMode && <MemoryModeFieldControls memorySettings={memorySettings} setMemorySettings={setMemorySettings} hasAdvanced={advancedDatasetStats.hasAdvanced} />}
        </div>
      </div> : <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-xs text-slate-400">Learning Sequence controls are available in Table mode.</div>}
    </>
  );
}
