import React from 'react';
import { 
  Sun, Laptop, Moon, ToggleRight, ToggleLeft, CloudLightning, Server, 
  FolderOpen, Layers, Terminal, Brain, Upload, Plus, FileDown, Trash2, 
  History, RotateCcw, ArrowRightToLine, Lock, Unlock, X 
} from 'lucide-react';
import ControlSectionTabs from '../controls/ControlSectionTabs';
import GroupedVoiceSelect from '../common/GroupedVoiceSelect';
import PlaybackSequenceBuilder from '../controls/PlaybackSequenceBuilder';

export const Sidebar = ({
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
  mode,
  mobileTab,
  theme,
  setTheme,
  isSystemBusy,
  handleModeSwitch,
  sidebarSection,
  setSidebarSection,
  currentMapCount,
  renderStatusBadge,
  preferLocalAudio,
  setPreferLocalAudio,
  generatorEngine,
  setGeneratorEngine,
  aiVoices,
  aiVoiceName,
  setAiVoiceName,
  apiKey,
  userApiKey,
  setUserApiKey,
  edgeVoices,
  edgeVoice,
  setEdgeVoice,
  edgeIndonesianVoice,
  setEdgeIndonesianVoice,
  edgeRate,
  setEdgeRate,
  edgePitch,
  setEdgePitch,
  edgeHealth,
  testEdgeBackend,
  folderInputRef,
  batchButtonRef,
  isBatchDownloading,
  isBatchOpen,
  setIsBatchOpen,
  debugButtonRef,
  showLogs,
  setShowLogs,
  renderBatchPopup,
  logContainerRef,
  systemLogs,
  voices,
  selectedVoice,
  setSelectedVoice,
  indonesianVoices,
  selectedIndonesianVoice,
  setSelectedIndonesianVoice,
  rate,
  setRate,
  isMemoryMode,
  setIsMemoryMode,
  memorySettings,
  setMemorySettings,
  advancedDatasetStats,
  csvInputRef,
  handleCSVUpload,
  openManualAdd,
  exportTableCSV,
  tableViewMode,
  playlist,
  setIsClearDialogOpen,
  isCsvDirty,
  csvChangeSummary,
  setIsChangeReviewOpen,
  undoStack,
  undoLastDataChange,
  saveUpdatedCSV,
  isMultiSourceMode,
  textareaRef,
  isLocked,
  textContent,
  handleInputContentChange,
  handleInsertTab,
  setLockedStates,
  dirtySourceKeys,
  openFullPackPicker,
  V510_SOURCE_KEYS,
  V510_SOURCE_LABELS,
  sourceDiagnostics,
  sourceChangeSummaries,
  sourcePack,
  openSourcePicker,
  removeSourceLayer,
  saveUpdatedSource,
  exportMergedDataset,
  lastDraftAutoSaveAt,
  // Playback builder props
  activePlaybackPreset,
  applyPlaybackPreset,
  shufflePlaybackSequence,
  resetPlaybackSequence,
  playbackSequence,
  isPlaybackSequencePartAvailable,
  togglePlaybackSequencePart,
  setPlaybackSequencePartRepeat,
  movePlaybackSequencePart,
  resetPlaybackDelays,
  playbackDelays,
  setPlaybackDelay,
  enabledCount,
  enabledPlayCount,
  vocabularyPlayOrder,
  toggleVocabularyPlayOrder
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[40] backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-lg transition-transform duration-300 ease-in-out bg-white dark:bg-slate-800 overflow-hidden
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isMobile 
          ? `fixed inset-y-0 left-0 w-72 z-[45] pb-20 ${mode === 'table' && mobileTab === 'player' ? 'pt-[160px]' : 'pt-[112px]'}` 
          : 'relative w-72 h-full z-40'}
        ${!isSidebarOpen && !isMobile ? 'md:w-0 md:border-none' : ''}
      `}>
        <div className="flex flex-col h-full overflow-y-auto w-72 overscroll-contain"> 
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-4 flex-shrink-0">
            
            {/* Theme Selector */}
            <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Theme</span>
              <div className="flex gap-1">
                <button onClick={() => setTheme('light')} className={`p-1.5 rounded transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Light Mode"><Sun className="w-3.5 h-3.5" /></button>
                <button onClick={() => setTheme('system')} className={`p-1.5 rounded transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="System Mode"><Laptop className="w-3.5 h-3.5" /></button>
                <button onClick={() => setTheme('dark')} className={`p-1.5 rounded transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Dark Mode"><Moon className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
              <button disabled={isSystemBusy} onClick={() => handleModeSwitch('table')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'table' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Table</button>
              <button disabled={isSystemBusy} onClick={() => handleModeSwitch('text')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'text' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Text</button>
            </div>

            {/* Control Center Section Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Control Center</p>
                  <p className="text-[8px] text-slate-400">Extensible shell for Player / Learn / Data / System.</p>
                </div>
                <span className="text-[8px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{sidebarSection.toUpperCase()}</span>
              </div>
              <ControlSectionTabs sidebarSection={sidebarSection} setSidebarSection={setSidebarSection} compact={true} />
            </div>

            {/* PLAYER SECTION */}
            {sidebarSection === 'player' && (
              <>
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

                <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS (Playback)</p>
                  <GroupedVoiceSelect 
                    voices={voices}
                    selectedValue={selectedVoice?.name || ''}
                    onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
                    disabled={isSystemBusy}
                    className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    context="main"
                  />
                  
                  {mode === 'table' && (
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
              </>
            )}

            {/* SYSTEM SECTION */}
            {sidebarSection === 'system' && (
              <>
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
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                      <select disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-purple-100 dark:border-slate-600 text-purple-700 dark:text-purple-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>
                        {aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                      <p className="text-[9px] text-slate-400 text-right">Requires API Key</p>
                    </div>
                  ) : (
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                      <label className="text-[9px] text-slate-500 font-bold block mb-1">Main Voice (English)</label>
                      <GroupedVoiceSelect 
                        voices={edgeVoices} 
                        selectedValue={edgeVoice} 
                        onChange={e => setEdgeVoice(e.target.value)}
                        disabled={isSystemBusy}
                        className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                        context="main"
                      />
                      
                      <label className="text-[9px] text-slate-500 font-bold block mb-1 mt-2">Meaning Voice (Indonesian)</label>
                      <GroupedVoiceSelect 
                        voices={edgeVoices} 
                        selectedValue={edgeIndonesianVoice} 
                        onChange={e => setEdgeIndonesianVoice(e.target.value)}
                        disabled={isSystemBusy}
                        className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                        context="meaning"
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
                  <input type="password" placeholder={apiKey ? "System Key Active" : "Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-2 w-full dark:bg-slate-800 dark:text-white ${apiKey ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} />
                  <button disabled={isSystemBusy} onClick={() => folderInputRef.current?.click()} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-900 text-white border-slate-900 dark:border-slate-600'} disabled:opacity-50`}><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <button ref={batchButtonRef} disabled={isSystemBusy && !isBatchDownloading} onClick={() => setIsBatchOpen(!isBatchOpen)} className="w-full px-2 py-2 rounded border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 disabled:opacity-50"><Layers className="w-3 h-3 inline mr-1"/>Batch</button>
                      {isBatchOpen && renderBatchPopup()}
                    </div>
                    <button ref={debugButtonRef} onClick={() => setShowLogs(!showLogs)} className="px-2 py-2 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300"><Terminal className="w-3 h-3 inline mr-1"/>Logs</button>
                  </div>
                  {showLogs && (
                    <div ref={logContainerRef} className="max-h-36 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[8px] text-slate-300 space-y-1">
                      {systemLogs.length ? systemLogs.slice(-12).map((log, i) => (
                        <div key={`${log.time}-${i}`}><span className="text-slate-500">[{log.time}]</span> <span className={log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}>{log.type}</span>: {log.message}</div>
                      )) : <div className="text-slate-500 italic">No logs available.</div>}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* LEARN SECTION */}
            {sidebarSection === 'learn' && mode === 'table' && (
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Learning Playback</p>
                <div className="flex flex-col gap-2">
                  <PlaybackSequenceBuilder
                    compact={false}
                    activePlaybackPreset={activePlaybackPreset}
                    applyPlaybackPreset={applyPlaybackPreset}
                    shufflePlaybackSequence={shufflePlaybackSequence}
                    resetPlaybackSequence={resetPlaybackSequence}
                    playbackSequence={playbackSequence}
                    isPlaybackSequencePartAvailable={isPlaybackSequencePartAvailable}
                    togglePlaybackSequencePart={togglePlaybackSequencePart}
                    setPlaybackSequencePartRepeat={setPlaybackSequencePartRepeat}
                    movePlaybackSequencePart={movePlaybackSequencePart}
                    resetPlaybackDelays={resetPlaybackDelays}
                    playbackDelays={playbackDelays}
                    setPlaybackDelay={setPlaybackDelay}
                    enabledCount={enabledCount}
                    enabledPlayCount={enabledPlayCount}
                    vocabularyPlayOrder={vocabularyPlayOrder}
                    toggleVocabularyPlayOrder={toggleVocabularyPlayOrder}
                  />
                  
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
                        {advancedDatasetStats.hasAdvanced && (
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id="hide-expressions" checked={memorySettings.expressions} onChange={(e) => setMemorySettings(prev => ({ ...prev, expressions: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                            <label htmlFor="hide-expressions" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide EXP1–EXP5</label>
                          </div>
                        )}
                        <p className="text-[9px] text-yellow-600 dark:text-yellow-500 mt-1 italic leading-tight pt-1 border-t border-yellow-100 dark:border-yellow-900/50">Klik teks untuk intip (4 detik).</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {sidebarSection === 'learn' && mode !== 'table' && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3 text-[10px] text-slate-400">Learning Sequence controls are available in Table mode.</div>
            )}

            {/* DATA SECTION */}
            {sidebarSection === 'data' && (
              <div className="grid grid-cols-2 gap-2">
                {mode === 'table' ? (
                  <>
                    <button disabled={isSystemBusy} onClick={() => csvInputRef.current.click()} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs dark:text-slate-300 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Upload className="w-3 h-3"/> Import CSV</button>
                    <input type="file" ref={csvInputRef} accept=".csv,.tsv,.txt" className="hidden" onChange={handleCSVUpload} />
                    <button disabled={isSystemBusy} onClick={openManualAdd} className={`flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Plus className="w-3 h-3"/> Add Manual</button>
                    <button disabled={isSystemBusy || playlist.filter(i => i.isStructured).length === 0} onClick={() => exportTableCSV(tableViewMode === 'study' ? 'study' : 'master')} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><FileDown className="w-3 h-3"/> Export Copy</button>
                    <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                    <div className={`col-span-2 px-2 py-1.5 rounded border text-[10px] font-bold text-center ${isCsvDirty ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>
                      {isCsvDirty ? `Unsaved CSV: +${csvChangeSummary.added} new / ~${csvChangeSummary.modified} edited / -${csvChangeSummary.deleted} deleted` : 'CSV saved / no pending changes'}
                    </div>
                    <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="flex items-center justify-center gap-1 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-2 rounded text-xs disabled:opacity-50"><History className="w-3 h-3"/> Review Changes</button>
                    <button disabled={!undoStack.length} onClick={undoLastDataChange} className="flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 p-2 rounded text-xs disabled:opacity-50"><RotateCcw className="w-3 h-3"/> Undo</button>
                    <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`col-span-2 flex items-center justify-center gap-1 p-2 rounded text-xs font-bold ${isCsvDirty ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-70' : ''}`}><FileDown className="w-3 h-3"/> {isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
                  </>
                ) : (
                  <>
                    <div className="col-span-2 mb-1">
                      <p className="text-[10px] text-slate-400 italic text-center border dark:border-slate-700 p-1 rounded bg-slate-50 dark:bg-slate-800">Gunakan kotak input di atas daftar untuk menambah item.</p>
                    </div>
                    <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`col-span-2 flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Data details inside Sidebar */}
          {sidebarSection === 'data' && (mode === 'text' ? (
            <div className="flex-1 p-2 relative flex flex-col min-h-[300px] bg-white dark:bg-slate-800">
              <textarea ref={textareaRef} disabled={isSystemBusy} readOnly={isLocked || isSystemBusy} className={`w-full flex-1 text-xs font-mono p-2 border rounded resize-none focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy ? 'bg-slate-100 dark:bg-slate-900 text-slate-500' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white'} dark:border-slate-600`} placeholder="Paste text..." value={textContent} onChange={(e) => handleInputContentChange(e.target.value)} />
              <div className="flex justify-end items-center mt-2 px-1 flex-shrink-0 gap-2">
                <button disabled={isLocked || isSystemBusy} onClick={handleInsertTab} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded border transition ${isLocked || isSystemBusy ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-700 text-slate-400' : 'bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 text-slate-600 dark:text-white border-slate-200 dark:border-slate-500'}`} title="Insert Tab Character (Separator)"><ArrowRightToLine className="w-3 h-3" /> Add Tab</button>
                <button disabled={isSystemBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed text-slate-400' : (isLocked ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700')}`}>{isLocked ? <><Lock className="w-3 h-3"/> Locked</> : <><Unlock className="w-3 h-3"/> Unlocked</>}</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-3 min-h-[220px] bg-white dark:bg-slate-800 flex flex-col gap-3">
              <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-600"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Source Manager</span></div><span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isMultiSourceMode ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{isMultiSourceMode ? `MULTI${dirtySourceKeys.length ? ` • ${dirtySourceKeys.length}` : ''}` : 'FLAT'}</span></div>
                <p className="text-[9px] text-slate-400 mb-2">Load MAIN first, then SENTENCE / EXP1–EXP5.</p>
                <button disabled={isSystemBusy || isCsvDirty} onClick={openFullPackPicker} className="w-full mb-2 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-bold disabled:opacity-40"><Upload className="w-3 h-3 inline mr-1"/>Load Full Pack (Auto)</button>
                <div className="space-y-1.5">
                  {V510_SOURCE_KEYS.map(key => { 
                    const d = sourceDiagnostics[key]; 
                    const dirty = sourceChangeSummaries[key]; 
                    return (
                      <div key={key} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5">
                        <div className="flex items-center gap-1"><span className="w-14 text-[9px] font-black text-violet-600 dark:text-violet-400">{V510_SOURCE_LABELS[key]}</span><span className="flex-1 truncate text-[8px] text-slate-400">{sourcePack[key]?.filename || 'Not loaded'}</span><button disabled={isSystemBusy} onClick={() => openSourcePicker(key)} className="px-1.5 py-0.5 rounded border dark:border-slate-600 text-[8px] font-bold">{d.loaded ? 'Replace' : 'Load'}</button>{key !== 'main' && d.loaded && <button disabled={isSystemBusy || isCsvDirty} onClick={() => removeSourceLayer(key)} className="p-0.5 text-red-500"><X className="w-3 h-3"/></button>}</div>
                        {d.loaded && <div className="mt-1 flex flex-wrap gap-x-1 text-[7px]"><span className="text-emerald-600">{d.rows} rows</span>{key !== 'main' && <><span className="text-slate-400">{d.matched} match</span>{d.missing > 0 && <span className="text-amber-600">{d.missing} missing</span>}{d.orphan > 0 && <span className="text-red-500">{d.orphan} orphan</span>}</>}{dirty.isDirty && <button onClick={() => saveUpdatedSource(key)} className="ml-auto text-amber-700 dark:text-amber-300 font-black">SAVE +{dirty.added} ~{dirty.modified} -{dirty.deleted}</button>}</div>}
                      </div>
                    ); 
                  })}
                </div>
                {isMultiSourceMode && <button onClick={exportMergedDataset} className="w-full mt-2 py-1.5 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-[9px] font-bold"><FileDown className="w-3 h-3 inline mr-1"/>Export Merged CSV</button>}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                <div className="flex items-center gap-2 mb-2"><History className="w-4 h-4 text-indigo-500"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Data Manager</span></div>
                <p className="text-[10px] text-slate-400 leading-relaxed">v5.11.6 UI Shell: controls are separated into Player / Learn / Data / System; learning engine remains unchanged.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-2"><div className="text-lg font-black text-emerald-600">+{csvChangeSummary.added}</div><div className="text-[9px] text-slate-400">NEW</div></div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-2"><div className="text-lg font-black text-amber-600">~{csvChangeSummary.modified}</div><div className="text-[9px] text-slate-400">EDITED</div></div>
                <div className="rounded-lg border border-red-200 dark:border-red-800 p-2"><div className="text-lg font-black text-red-500">-{csvChangeSummary.deleted}</div><div className="text-[9px] text-slate-400">DELETED</div></div>
              </div>
              <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="w-full py-2 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><History className="w-3.5 h-3.5 inline mr-1"/>Open Change Review</button>
              <button disabled={!undoStack.length} onClick={undoLastDataChange} className="w-full py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 inline mr-1"/>Undo Last Change</button>
              {lastDraftAutoSaveAt && isCsvDirty && <p className="text-[9px] text-center text-slate-400">Working draft autosaved at {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</p>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
