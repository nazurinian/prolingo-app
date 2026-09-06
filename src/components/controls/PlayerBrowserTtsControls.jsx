import React from 'react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';

export default function PlayerBrowserTtsControls({
  voices,
  selectedVoice,
  setSelectedVoice,
  isSystemBusy,
  mode,
  indonesianVoices,
  selectedIndonesianVoice,
  setSelectedIndonesianVoice,
  showIndonesianVoice = mode === 'table',
  structuredTextModeActive = false,
  rate,
  setRate,
}) {
  return (
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS (Playback)</p>
                {/* Browser Voice Grouped Select */}
                {structuredTextModeActive && <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">English Voice (Text)</p>}
                <GroupedVoiceSelect 
                    voices={voices}
                    selectedValue={selectedVoice?.name || ''}
                    onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
                    disabled={isSystemBusy}
                    className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    context="main"
                />
                
                {showIndonesianVoice && (
                  <div className="mt-2">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Indonesian Voice (Meaning)</p>
                       {indonesianVoices.length > 0 ? (
                           <GroupedVoiceSelect
                                voices={indonesianVoices}
                                selectedValue={selectedIndonesianVoice?.name || ''}
                                onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))}
                                disabled={isSystemBusy}
                                className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                                context="meaning"
                           />
                       ) : (
                           <div className="text-[10px] text-red-400 italic border p-1 rounded bg-red-50 dark:bg-red-900/20">Browser Anda tidak mendukung suara Indonesia.</div>
                       )}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded border border-slate-100 dark:border-slate-600 mt-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-center">{rate}x</span>
                    <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer accent-indigo-600" />
                </div>
              </div>
  );
}
