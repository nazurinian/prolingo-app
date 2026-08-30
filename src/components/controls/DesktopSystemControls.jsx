import React from 'react';
import { CloudLightning, Server, FolderOpen, Layers, Terminal } from 'lucide-react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';
import StorageManagerPanel from '../progress/StorageManagerPanel';

export default function DesktopSystemControls({
  generatorEngine, setGeneratorEngine, isSystemBusy, aiVoiceName, setAiVoiceName, aiVoices,
  edgeVoices, edgeVoice, setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice,
  edgeRate, setEdgeRate, edgePitch, setEdgePitch, edgeHealth, testEdgeBackend,
  apiKey, userApiKey, onUserApiKeyChange, folderInputRef, currentMapCount, batchButtonRef,
  isBatchDownloading, setIsBatchOpen, isBatchOpen, renderBatchPopup, debugButtonRef,
  setShowLogs, showLogs, logContainerRef, systemLogs, storageRefreshToken,
  onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset
}) {
  return (
    <>
              {/* --- NEW: GENERATOR ENGINE SWITCHER --- */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className="flex items-center justify-between">
                     <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                         {generatorEngine === 'gemini' ? <CloudLightning className="w-3 h-3 text-purple-500"/> : <Server className="w-3 h-3 text-teal-500"/>}
                         Generator Engine
                     </p>
                     <div className="flex bg-slate-200 dark:bg-slate-800 rounded p-0.5">
                         <button disabled={isSystemBusy} onClick={() => setGeneratorEngine('gemini')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${generatorEngine === 'gemini' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>Gemini</button>
                         <button disabled={isSystemBusy} onClick={() => setGeneratorEngine('edge')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${generatorEngine === 'edge' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Edge</button>
                     </div>
                </div>

                {generatorEngine === 'gemini' ? (
                    // GEMINI CONTROLS
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <select disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-purple-100 dark:border-slate-600 text-purple-700 dark:text-purple-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>
                            {aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                        <p className="text-[9px] text-slate-400 text-right">Requires API Key</p>
                    </div>
                ) : (
                    // EDGE TTS CONTROLS (Grouped)
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <label className="text-[9px] text-slate-500 font-bold block mb-1">Main Voice (English)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeVoice} 
                            onChange={e => setEdgeVoice(e.target.value)}
                            disabled={isSystemBusy}
                            className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                            context="main" // HANYA ENGLISH
                        />
                        
                        <label className="text-[9px] text-slate-500 font-bold block mb-1 mt-2">Meaning Voice (Indonesian)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeIndonesianVoice} 
                            onChange={e => setEdgeIndonesianVoice(e.target.value)}
                            disabled={isSystemBusy}
                            className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                            context="meaning" // KHUSUS INDO/REGIONAL
                        />

                        <div className="grid grid-cols-2 gap-2 mt-2">
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Rate ({edgeRate > 0 ? '+' : ''}{edgeRate}%)</label>
                                 <input disabled={isSystemBusy} type="range" min="-50" max="50" step="10" value={edgeRate} onChange={e => setEdgeRate(parseInt(e.target.value))} className={`w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} />
                             </div>
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Pitch ({edgePitch > 0 ? '+' : ''}{edgePitch}Hz)</label>
                                 <input disabled={isSystemBusy} type="range" min="-20" max="20" step="5" value={edgePitch} onChange={e => setEdgePitch(parseInt(e.target.value))} className={`w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} />
                             </div>
                        </div>
                        <div className={`rounded border px-2 py-2 text-[10px] ${edgeHealth.status === 'online' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : edgeHealth.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-bold">Backend: {edgeHealth.status === 'online' ? 'ONLINE' : edgeHealth.status === 'error' ? 'ERROR' : edgeHealth.status === 'testing' ? 'TESTING' : 'UNKNOWN'}</span>
                                <button onClick={testEdgeBackend} disabled={isSystemBusy && edgeHealth.status !== 'testing'} className="px-2 py-1 rounded border border-current font-bold disabled:opacity-50">{edgeHealth.status === 'testing' ? 'Cancel' : 'Test'}</button>
                            </div>
                            <p className="mt-1 break-words opacity-80">{edgeHealth.message}</p>
                        </div>
                        <p className="text-[9px] text-slate-400 text-right">Local Backend (/api/tts)</p>
                    </div>
                )}
              </div>

              <div className="space-y-2 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                <p className="text-[10px] font-bold text-slate-400 uppercase">System Utilities</p>
                <input type="password" placeholder={apiKey ? "System Key Active" : "Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-2 w-full dark:bg-slate-800 dark:text-white ${apiKey ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={onUserApiKeyChange} />
                <button disabled={isSystemBusy} onClick={() => folderInputRef.current?.click()} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-900 text-white border-slate-900 dark:border-slate-600'} disabled:opacity-50`}><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <button ref={batchButtonRef} disabled={isSystemBusy && !isBatchDownloading} onClick={() => setIsBatchOpen(!isBatchOpen)} className="w-full px-2 py-2 rounded border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 disabled:opacity-50"><Layers className="w-3 h-3 inline mr-1"/>Batch</button>
                    {isBatchOpen && renderBatchPopup()}
                  </div>
                  <button ref={debugButtonRef} onClick={() => setShowLogs(!showLogs)} className="px-2 py-2 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300"><Terminal className="w-3 h-3 inline mr-1"/>Logs</button>
                </div>
                {showLogs && <div ref={logContainerRef} className="max-h-36 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[8px] text-slate-300 space-y-1">{systemLogs.length ? systemLogs.slice(-12).map((log, i) => <div key={`${log.time}-${i}`}><span className="text-slate-500">[{log.time}]</span> <span className={log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}>{log.type}</span>: {log.message}</div>) : <div className="text-slate-500 italic">No logs available.</div>}</div>}
              </div>

              <StorageManagerPanel
                refreshToken={storageRefreshToken}
                onDatasetCacheCleared={onDatasetCacheCleared}
                onMasteryReset={onMasteryReset}
                onStudyTrackingReset={onStudyTrackingReset}
              />

    </>
  );
}
