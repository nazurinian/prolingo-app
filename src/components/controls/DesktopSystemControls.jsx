import React from 'react';
import { CloudLightning, Server, FolderOpen, RotateCcw, Layers, Terminal, FileArchive, X } from 'lucide-react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';
import StorageManagerPanel from '../progress/StorageManagerPanel';
import { SafetyConfirmDialog } from '../modals/ConfirmDialog';

export default function DesktopSystemControls({
  generatorEngine, setGeneratorEngine, isSystemBusy, aiVoiceName, setAiVoiceName, aiVoices,
  edgeVoices, edgeVoice, setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice,
  edgeRate, setEdgeRate, edgePitch, setEdgePitch, edgeHealth, testEdgeBackend,
  userApiKey, onUserApiKeyChange, geminiOwnerConfigured, geminiOwnerUnlocked, onGeminiOwnerUnlock, onGeminiOwnerLock,
  geminiByokAvailable, geminiByokRegistered, onGeminiByokRegister, onGeminiByokClear,
  folderInputRef, currentMapCount, mode, batchButtonRef,
  isBatchDownloading, setIsBatchOpen, isBatchOpen, renderBatchPopup, debugButtonRef,
  setShowLogs, showLogs, logContainerRef, systemLogs, storageRefreshToken,
  onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset,
  masteryByVocabId, activityByVocabId, currentVocabIds, onProgressRestored
}) {
  const [clearZipConfirmOpen, setClearZipConfirmOpen] = React.useState(false);
  const [detachFolderConfirmOpen, setDetachFolderConfirmOpen] = React.useState(false);
  const [resetCoverageConfirmOpen, setResetCoverageConfirmOpen] = React.useState(false);
  const [clearGeneratedRamConfirmOpen, setClearGeneratedRamConfirmOpen] = React.useState(false);
  const [clearStagingConfirmOpen, setClearStagingConfirmOpen] = React.useState(false);
  const hasActiveAudioFolder = mode === 'table' ? !!folderInputRef?.tableAudioFolderSummary?.active : currentMapCount > 0;
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
                        <p className={`text-[9px] text-right font-bold ${geminiOwnerUnlocked ? 'text-green-600 dark:text-green-400' : geminiByokRegistered ? 'text-purple-600 dark:text-purple-400' : 'text-amber-600 dark:text-amber-400'}`}>{geminiOwnerUnlocked ? 'OWNER • server key protected' : geminiByokRegistered ? 'BYOK • protected on this device' : 'LOCKED • API key required'}</p>
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
                <input type="password" autoComplete="off" placeholder={geminiOwnerUnlocked ? "Owner Key Active (server)" : geminiByokRegistered ? "Your API key is registered" : "Your Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-2 w-full dark:bg-slate-800 dark:text-white ${geminiOwnerUnlocked ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={geminiOwnerUnlocked || geminiByokRegistered ? "" : userApiKey} disabled={geminiOwnerUnlocked || geminiByokRegistered || !geminiByokAvailable} onChange={onUserApiKeyChange} />
                {!geminiOwnerUnlocked && !geminiByokRegistered && geminiByokAvailable && <button type="button" disabled={isSystemBusy || !userApiKey.trim()} onClick={onGeminiByokRegister} className="w-full px-2 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 disabled:opacity-50">Save My API Key</button>}
                {!geminiOwnerUnlocked && geminiByokRegistered && <button type="button" disabled={isSystemBusy} onClick={onGeminiByokClear} className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50">Remove My API Key</button>}
                {!geminiOwnerUnlocked && geminiOwnerConfigured && <button type="button" disabled={isSystemBusy} onClick={onGeminiOwnerUnlock} className="w-full px-2 py-1.5 rounded border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 disabled:opacity-50">Owner Unlock</button>}
                {geminiOwnerUnlocked && <button type="button" disabled={isSystemBusy} onClick={onGeminiOwnerLock} className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50">Owner Lock</button>}
                {!geminiByokAvailable && !geminiOwnerUnlocked && <p className="text-[9px] text-amber-600 dark:text-amber-400">BYOK vault belum dikonfigurasi di server.</p>}
                {hasActiveAudioFolder ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={isSystemBusy} onClick={() => folderInputRef.refreshAudioFolder?.() ?? folderInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5"/> Refresh Audio</button>
                    <button disabled={isSystemBusy} onClick={() => folderInputRef.openAudioFolder?.({ forcePicker: true }) ?? folderInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border bg-green-600 text-white border-green-700 disabled:opacity-50"><FolderOpen className="w-3.5 h-3.5"/> Change Folder</button>
                  </div>
                ) : (
                  <button disabled={isSystemBusy} onClick={() => folderInputRef.openAudioFolder?.({ forcePicker: false }) ?? folderInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border bg-slate-800 dark:bg-slate-900 text-white border-slate-900 dark:border-slate-600 disabled:opacity-50"><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
                )}
                {mode === 'table' && folderInputRef?.tableAudioFolderSummary?.active && <button disabled={isSystemBusy} onClick={() => setDetachFolderConfirmOpen(true)} className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-bold border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 disabled:opacity-35"><X className="w-3.5 h-3.5"/> Detach Audio Folder</button>}
                {mode === 'table' && <div className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/15 p-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Audio ZIP Archive</span>
                    {(folderInputRef?.tableAudioZipSummary?.archiveCount || 0) > 0 && <span className="text-[8px] text-slate-400">{folderInputRef.tableAudioZipSummary.archiveCount} ZIP • {folderInputRef.tableAudioZipSummary.matchedCount} matched</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={isSystemBusy} onClick={() => folderInputRef.openAudioZip?.()} className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-bold border bg-indigo-600 text-white border-indigo-700 disabled:opacity-50"><FileArchive className="w-3.5 h-3.5"/> Add ZIP</button>
                    <button disabled={isSystemBusy || !(folderInputRef?.tableAudioZipSummary?.archiveCount > 0)} onClick={() => setClearZipConfirmOpen(true)} className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-35"><X className="w-3.5 h-3.5"/> Clear ZIP</button>
                  </div>
                  <p className="mt-1.5 text-[8px] leading-relaxed text-slate-400">ZIP is additive to Audio Folder. ProLingo indexes filenames first and opens only the requested audio entry during playback.</p>
                </div>}
                {mode === 'table' && <div className="space-y-2">
                  <div className="rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15 p-2 text-[9px]">
                    <div className="flex items-center justify-between gap-2 font-black text-emerald-700 dark:text-emerald-300"><span>Audio Staging (IndexedDB)</span><span>{folderInputRef?.tableAudioStagingSummary?.count || 0} audio</span></div>
                    <div className="mt-1 text-slate-500 dark:text-slate-400">{((folderInputRef?.tableAudioStagingSummary?.bytes || 0) / (1024 * 1024)).toFixed(1)} MB • survives refresh until released/cleared</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button disabled={isSystemBusy} onClick={() => setResetCoverageConfirmOpen(true)} className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[9px] font-bold border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 disabled:opacity-35"><RotateCcw className="w-3 h-3"/> Reset Audio Coverage Memory</button>
                    <button disabled={isSystemBusy} onClick={() => setClearGeneratedRamConfirmOpen(true)} className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[9px] font-bold border border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-300 disabled:opacity-35"><X className="w-3 h-3"/> Clear RAM</button>
                    <button disabled={isSystemBusy || !(folderInputRef?.tableAudioStagingSummary?.count > 0)} onClick={() => setClearStagingConfirmOpen(true)} className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[9px] font-bold border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 disabled:opacity-35"><X className="w-3 h-3"/> Clear Staging</button>
                  </div>
                </div>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    ref={batchButtonRef}
                    disabled={isSystemBusy && !isBatchDownloading}
                    onClick={() => {
                      const next = !isBatchOpen;
                      setIsBatchOpen(next);
                      if (next) setShowLogs(false);
                    }}
                    className={`w-full px-2 py-2 rounded border text-[10px] font-bold disabled:opacity-50 transition-colors ${isBatchOpen ? 'bg-purple-600 border-purple-600 text-white' : 'border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300'}`}
                  ><Layers className="w-3 h-3 inline mr-1"/>Batch</button>
                  <button
                    ref={debugButtonRef}
                    onClick={() => {
                      const next = !showLogs;
                      setShowLogs(next);
                      if (next) setIsBatchOpen(false);
                    }}
                    className={`px-2 py-2 rounded border text-[10px] font-bold transition-colors ${showLogs ? 'bg-slate-800 border-slate-800 text-white dark:bg-slate-600 dark:border-slate-500' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}
                  ><Terminal className="w-3 h-3 inline mr-1"/>Logs</button>
                </div>
                {isBatchOpen && <div className="pt-1">{renderBatchPopup({ inline: true, showClose: false })}</div>}
                {showLogs && <div ref={logContainerRef} className="max-h-36 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[8px] text-slate-300 space-y-1">{systemLogs.length ? systemLogs.slice(-12).map((log, i) => <div key={`${log.time}-${i}`}><span className="text-slate-500">[{log.time}]</span> <span className={log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}>{log.type}</span>: {log.message}</div>) : <div className="text-slate-500 italic">No logs available.</div>}</div>}
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

      <SafetyConfirmDialog
        open={detachFolderConfirmOpen}
        title="Detach Table audio folder?"
        message="Melepas Audio Folder Table dari ProLingo dan menghapus daftar audio/Downloaded* Table yang tersimpan. File audio asli di folder tidak dihapus. ZIP yang masih diload tetap aktif."
        confirmLabel="Detach Folder"
        onCancel={() => setDetachFolderConfirmOpen(false)}
        onConfirm={() => { setDetachFolderConfirmOpen(false); folderInputRef.detachAudioFolder?.(); }}
      />
      <SafetyConfirmDialog
        open={clearZipConfirmOpen}
        title="Clear loaded ZIP archives?"
        message={`Melepas ${folderInputRef?.tableAudioZipSummary?.archiveCount || 0} ZIP dari sesi ProLingo. File ZIP asli tidak dihapus, Audio Folder tetap aktif, dan status Downloaded* Table lama di-reset agar coverage dihitung ulang dari source yang masih aktif.`}
        confirmLabel="Clear ZIP"
        onCancel={() => setClearZipConfirmOpen(false)}
        onConfirm={() => { setClearZipConfirmOpen(false); folderInputRef.clearAudioZip?.(); }}
      />
      <SafetyConfirmDialog
        open={clearGeneratedRamConfirmOpen}
        title="Clear runtime audio cache?"
        message="Melepas hanya runtime ObjectURL/cache audio sementara (legacy generated + playback cache Staging/ZIP). Blob yang tersimpan di Audio Staging IndexedDB tidak dihapus. Folder/ZIP, CSV, IndexedDB, login, cookie, dan export history tetap aman."
        confirmLabel="Clear Audio RAM"
        onCancel={() => setClearGeneratedRamConfirmOpen(false)}
        onConfirm={() => { setClearGeneratedRamConfirmOpen(false); folderInputRef.clearGeneratedAudioRam?.(); }}
      />
      <SafetyConfirmDialog
        open={clearStagingConfirmOpen}
        title="Clear Table Audio Staging?"
        message={`Menghapus ${folderInputRef?.tableAudioStagingSummary?.count || 0} binary audio (${((folderInputRef?.tableAudioStagingSummary?.bytes || 0) / (1024 * 1024)).toFixed(1)} MB) dari IndexedDB Staging. Batch/export metadata kecil tetap disimpan; Folder/ZIP dan file download tidak dihapus.`}
        confirmLabel="Clear Staging"
        onCancel={() => setClearStagingConfirmOpen(false)}
        onConfirm={() => { setClearStagingConfirmOpen(false); folderInputRef.clearAudioStaging?.(); }}
      />
      <SafetyConfirmDialog
        open={resetCoverageConfirmOpen}
        title="Reset Table audio coverage memory?"
        message="Menghapus hanya riwayat Exported/Downloaded* Table dan metadata coverage legacy. Audio Staging IndexedDB tidak dihapus, Folder/ZIP tetap aktif, dan CSV/login/cookie/data situs lain tidak disentuh."
        confirmLabel="Reset Coverage"
        onCancel={() => setResetCoverageConfirmOpen(false)}
        onConfirm={() => { setResetCoverageConfirmOpen(false); folderInputRef.resetAudioCoverageMemory?.(); }}
      />
    </>
  );
}
