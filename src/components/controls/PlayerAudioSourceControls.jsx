import React from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';

export default function PlayerAudioSourceControls({
  currentMapCount,
  mode,
  renderStatusBadge,
  preferLocalAudio,
  setPreferLocalAudio,
  isSystemBusy,
}) {
  return (
              <div className={`p-3 rounded-lg border ${currentMapCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600'}`}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Audio Source ({mode})</p>
                  {renderStatusBadge()}
                </div>
                <button onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)} disabled={currentMapCount === 0 || isSystemBusy} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'}`}>
                  <span className={preferLocalAudio ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}>{preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}</span>
                  {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                </button>
              </div>
  );
}
