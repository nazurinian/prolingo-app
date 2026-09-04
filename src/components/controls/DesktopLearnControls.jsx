import React from 'react';
import { Brain, ToggleLeft, ToggleRight } from 'lucide-react';
import MemoryModeFieldControls from './MemoryModeFieldControls';

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
            <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-[background-color,border-color,color] ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600'}`}>
              <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>
              {isMemoryMode ? <ToggleRight className="w-5 h-5 text-yellow-600 dark:text-yellow-500"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
            </button>

            {isMemoryMode && <MemoryModeFieldControls memorySettings={memorySettings} setMemorySettings={setMemorySettings} hasAdvanced={advancedDatasetStats.hasAdvanced} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3 text-[10px] text-slate-400">Learning Sequence controls are available in Table mode.</div>
  );
}
