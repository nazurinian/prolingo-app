import React from 'react';
import { Settings, FolderOpen, RotateCcw, Layers, Terminal } from 'lucide-react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';
import StorageManagerPanel from '../progress/StorageManagerPanel';
import BatchPopup from '../table/BatchPopup';

export default function MobileSystemControls({
  generatorEngine, setGeneratorEngine, isSystemBusy, aiVoiceName, setAiVoiceName, aiVoices,
  userApiKey, onUserApiKeyChange, geminiOwnerConfigured, geminiOwnerUnlocked, onGeminiOwnerUnlock, onGeminiOwnerLock,
  geminiByokAvailable, geminiByokRegistered, onGeminiByokRegister, onGeminiByokClear, edgeVoices, edgeVoice, setEdgeVoice,
  edgeIndonesianVoice, setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch, setEdgePitch,
  testEdgeBackend, edgeHealth, folderInputRef, currentMapCount, mode, isBatchDownloading,
  isBatchStopping, batchStatusText, batchConfig, setBatchConfig, advancedDatasetStats, runBatchDownload, DownloadCloudIcon,
  isBatchOpen, setIsBatchOpen, showLogs, setShowLogs, systemLogs, logContainerRef,
  storageRefreshToken, onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset,
  masteryByVocabId, activityByVocabId, currentVocabIds, onProgressRestored
}) {
  return (
    <>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> System & TTS</h3>
                  <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-3"><button disabled={isSystemBusy} onClick={() => setGeneratorEngine('gemini')} className={`px-2 py-1.5 rounded text-xs font-bold ${generatorEngine === 'gemini' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>Gemini</button><button disabled={isSystemBusy} onClick={() => setGeneratorEngine('edge')} className={`px-2 py-1.5 rounded text-xs font-bold ${generatorEngine === 'edge' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Edge</button></div>
                  {generatorEngine === 'gemini' ? <div className="space-y-2"><select disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>{aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><input type="password" autoComplete="off" placeholder={geminiOwnerUnlocked ? "Owner Key Active (server)" : geminiByokRegistered ? "Your API key is registered" : "Your Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-3 py-2 w-full dark:bg-slate-700 dark:text-white ${geminiOwnerUnlocked ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={geminiOwnerUnlocked || geminiByokRegistered ? "" : userApiKey} disabled={geminiOwnerUnlocked || geminiByokRegistered || !geminiByokAvailable} onChange={onUserApiKeyChange} /><p className={`text-[9px] text-right font-bold ${geminiOwnerUnlocked ? 'text-green-600' : geminiByokRegistered ? 'text-purple-600' : 'text-amber-600'}`}>{geminiOwnerUnlocked ? 'OWNER • server key protected' : geminiByokRegistered ? 'BYOK • protected on this device' : 'LOCKED • API key required'}</p>{!geminiOwnerUnlocked && !geminiByokRegistered && geminiByokAvailable && <button type="button" disabled={isSystemBusy || !userApiKey.trim()} onClick={onGeminiByokRegister} className="w-full py-2 rounded border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-50">Save My API Key</button>}{!geminiOwnerUnlocked && geminiByokRegistered && <button type="button" disabled={isSystemBusy} onClick={onGeminiByokClear} className="w-full py-2 rounded border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50">Remove My API Key</button>}{!geminiOwnerUnlocked && geminiOwnerConfigured && <button type="button" disabled={isSystemBusy} onClick={onGeminiOwnerUnlock} className="w-full py-2 rounded border border-purple-200 dark:border-purple-800 text-xs font-bold text-purple-700 dark:text-purple-300">Owner Unlock</button>}{geminiOwnerUnlocked && <button type="button" disabled={isSystemBusy} onClick={onGeminiOwnerLock} className="w-full py-2 rounded border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300">Owner Lock</button>}{!geminiByokAvailable && !geminiOwnerUnlocked && <p className="text-[9px] text-amber-600">BYOK vault belum dikonfigurasi di server.</p>}</div> : <div className="space-y-2"><GroupedVoiceSelect voices={edgeVoices} selectedValue={edgeVoice} onChange={e => setEdgeVoice(e.target.value)} disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" context="main"/><GroupedVoiceSelect voices={edgeVoices} selectedValue={edgeIndonesianVoice} onChange={e => setEdgeIndonesianVoice(e.target.value)} disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" context="meaning"/><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-500">Rate ({edgeRate > 0 ? '+' : ''}{edgeRate}%)<input disabled={isSystemBusy} type="range" min="-50" max="50" step="10" value={edgeRate} onChange={e => setEdgeRate(parseInt(e.target.value))} className="w-full accent-teal-600"/></label><label className="text-[9px] text-slate-500">Pitch ({edgePitch > 0 ? '+' : ''}{edgePitch}Hz)<input disabled={isSystemBusy} type="range" min="-20" max="20" step="5" value={edgePitch} onChange={e => setEdgePitch(parseInt(e.target.value))} className="w-full accent-teal-600"/></label></div><button onClick={testEdgeBackend} className="w-full py-2 rounded border border-teal-200 dark:border-teal-800 text-xs font-bold text-teal-700 dark:text-teal-300">Backend: {edgeHealth.status.toUpperCase()} • Test</button></div>}
                  {currentMapCount > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button disabled={isSystemBusy} onClick={() => folderInputRef.refreshAudioFolder?.() ?? folderInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5"/> Refresh</button>
                      <button disabled={isSystemBusy} onClick={() => folderInputRef.openAudioFolder?.({ forcePicker: true }) ?? folderInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border bg-green-600 text-white border-green-700 disabled:opacity-50"><FolderOpen className="w-3.5 h-3.5"/> Change</button>
                    </div>
                  ) : (
                    <button disabled={isSystemBusy} onClick={() => folderInputRef.openAudioFolder?.({ forcePicker: false }) ?? folderInputRef.current?.click()} className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border bg-slate-800 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600 disabled:opacity-50"><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
                  )}
              </div>

              <StorageManagerPanel
                  refreshToken={storageRefreshToken}
                  onDatasetCacheCleared={onDatasetCacheCleared}
                  onMasteryReset={onMasteryReset}
                  onStudyTrackingReset={onStudyTrackingReset}
                  masteryByVocabId={masteryByVocabId}
                  activityByVocabId={activityByVocabId}
                  currentVocabIds={currentVocabIds}
                  onProgressRestored={onProgressRestored}
              />

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                      <button
                          type="button"
                          disabled={isSystemBusy && !isBatchDownloading}
                          onClick={() => { const next = !isBatchOpen; setIsBatchOpen(next); if (next) setShowLogs(false); }}
                          className={`min-h-10 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1.5 ${isBatchOpen ? 'bg-purple-600 border-purple-600 text-white' : 'border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300'}`}
                      ><Layers className="w-3.5 h-3.5"/> Batch</button>
                      <button
                          type="button"
                          onClick={() => { const next = !showLogs; setShowLogs(next); if (next) setIsBatchOpen(false); }}
                          className={`min-h-10 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1.5 ${showLogs ? 'bg-slate-800 dark:bg-slate-600 border-slate-800 dark:border-slate-500 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}
                      ><Terminal className="w-3.5 h-3.5"/> Logs</button>
                  </div>
                  {isBatchOpen && (
                      <div className="pt-3">
                          <BatchPopup
                              mode={mode}
                              setIsBatchOpen={setIsBatchOpen}
                              isBatchDownloading={isBatchDownloading}
                              batchConfig={batchConfig}
                              setBatchConfig={setBatchConfig}
                              generatorEngine={generatorEngine}
                              advancedDatasetStats={advancedDatasetStats}
                              runBatchDownload={runBatchDownload}
                              isBatchStopping={isBatchStopping}
                              batchStatusText={batchStatusText}
                              DownloadCloudIcon={DownloadCloudIcon}
                              inline
                              showClose={false}
                          />
                      </div>
                  )}
                  {showLogs && (
                      <div ref={logContainerRef} className="mt-3 max-h-44 overflow-y-auto rounded-xl bg-slate-950 p-2.5 font-mono text-[9px] text-slate-300 custom-scrollbar">
                          {systemLogs?.length ? systemLogs.slice(-16).map((log, index) => (
                              <div key={`${log.time}-${index}`} className="border-b border-slate-800/80 py-1 last:border-b-0">
                                  <span className="text-slate-500">[{log.time}]</span>{' '}
                                  <span className={log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}>{log.type}</span>: {log.message}
                              </div>
                          )) : <div className="py-2 text-center italic text-slate-500">No logs available.</div>}
                      </div>
                  )}
              </div>
    </>
  );
}
