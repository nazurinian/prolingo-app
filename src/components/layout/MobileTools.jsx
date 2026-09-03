import React from 'react';
import { Volume2, ToggleRight, ToggleLeft } from 'lucide-react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';
import MobileLearnControls from '../controls/MobileLearnControls';
import MobileDataControls from '../controls/MobileDataControls';
import MobileSystemControls from '../controls/MobileSystemControls';

const MobileTools = ({
  sidebarSection,
  renderControlSectionTabs,
  currentMapCount,
  mode,
  renderStatusBadge,
  preferLocalAudio,
  setPreferLocalAudio,
  isSystemBusy,
  voices,
  selectedVoice,
  setSelectedVoice,
  indonesianVoices,
  selectedIndonesianVoice,
  setSelectedIndonesianVoice,
  rate,
  setRate,
  renderPlaybackSequenceBuilder,
  isMemoryMode,
  setIsMemoryMode,
  memorySettings,
  setMemorySettings,
  advancedDatasetStats,
  isMultiSourceMode,
  dirtySourceKeys,
  isCsvDirty,
  openFullPackPicker,
  sourceDiagnostics,
  sourceChangeSummaries,
  sourcePack,
  openSourcePicker,
  removeSourceLayer,
  saveUpdatedSource,
  exportMergedDataset,
  savedDecks,
  selectedDeckId,
  handleLoadDeck,
  currentDeckName,
  setCurrentDeckName,
  handleSaveDeck,
  handleDeleteDeckInit,
  csvInputRef,
  openManualAdd,
  playlist,
  tableViewMode,
  exportTableCSV,
  setIsClearDialogOpen,
  csvChangeSummary,
  setIsChangeReviewOpen,
  undoStack,
  undoLastDataChange,
  saveUpdatedCSV,
  rangeInput,
  setRangeInput,
  handleRangeAdd,
  generatorEngine,
  setGeneratorEngine,
  aiVoiceName,
  setAiVoiceName,
  aiVoices,
  userApiKey,
  onUserApiKeyChange,
  geminiOwnerConfigured,
  geminiOwnerUnlocked,
  onGeminiOwnerUnlock,
  onGeminiOwnerLock,
  geminiByokAvailable,
  geminiByokRegistered,
  onGeminiByokRegister,
  onGeminiByokClear,
  edgeVoices,
  edgeVoice,
  setEdgeVoice,
  edgeIndonesianVoice,
  setEdgeIndonesianVoice,
  edgeRate,
  setEdgeRate,
  edgePitch,
  setEdgePitch,
  testEdgeBackend,
  edgeHealth,
  folderInputRef,
  isBatchDownloading,
  batchConfig,
  setBatchConfig,
  runBatchDownload,
  DownloadCloudIcon,
  storageRefreshToken,
  onDatasetCacheCleared,
  onMasteryReset,
  onStudyTrackingReset,
  masteryByVocabId,
  activityByVocabId,
  currentVocabIds,
  onProgressRestored,
}) => (
      <div className="p-4 space-y-4">
          <div className="sticky top-0 z-20 -mx-1 pt-1 pb-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <div className="flex items-center justify-between px-1 mb-2">
                  <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Control Center</p>
                      <p className="text-[9px] text-slate-400">Same sections as desktop sidebar.</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">{sidebarSection.toUpperCase()}</span>
              </div>
              {renderControlSectionTabs(true)}
          </div>

          {sidebarSection === 'player' && <>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/> Player</h3>
                  <div className={`p-3 rounded-lg border mb-3 ${currentMapCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600'}`}>
                      <div className="flex justify-between items-center mb-1"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Audio Source ({mode})</p>{renderStatusBadge()}</div>
                      <button onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)} disabled={currentMapCount === 0 || isSystemBusy} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'}`}>
                          <span className={preferLocalAudio ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}>{preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}</span>
                          {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                      </button>
                  </div>
                  <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS</p>
                      <GroupedVoiceSelect voices={voices} selectedValue={selectedVoice?.name || ''} onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))} disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} context="main"/>
                      {mode === 'table' && (indonesianVoices.length > 0 ? <GroupedVoiceSelect voices={indonesianVoices} selectedValue={selectedIndonesianVoice?.name || ''} onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))} disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} context="meaning"/> : <div className="text-[10px] text-red-400 italic border p-2 rounded bg-red-50 dark:bg-red-900/20">Browser tidak menyediakan suara Indonesia.</div>)}
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded border border-slate-100 dark:border-slate-600"><span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-center">{rate}x</span><input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer accent-indigo-600" /></div>
                  </div>
              </div>
          </>}

          {sidebarSection === 'learn' && <MobileLearnControls
              mode={mode}
              renderPlaybackSequenceBuilder={renderPlaybackSequenceBuilder}
              isMemoryMode={isMemoryMode}
              setIsMemoryMode={setIsMemoryMode}
              memorySettings={memorySettings}
              setMemorySettings={setMemorySettings}
              advancedDatasetStats={advancedDatasetStats}
          />}

          {sidebarSection === 'data' && <MobileDataControls
              mode={mode}
              isMultiSourceMode={isMultiSourceMode}
              dirtySourceKeys={dirtySourceKeys}
              isSystemBusy={isSystemBusy}
              isCsvDirty={isCsvDirty}
              openFullPackPicker={openFullPackPicker}
              sourceDiagnostics={sourceDiagnostics}
              sourceChangeSummaries={sourceChangeSummaries}
              sourcePack={sourcePack}
              openSourcePicker={openSourcePicker}
              removeSourceLayer={removeSourceLayer}
              saveUpdatedSource={saveUpdatedSource}
              exportMergedDataset={exportMergedDataset}
              savedDecks={savedDecks}
              selectedDeckId={selectedDeckId}
              handleLoadDeck={handleLoadDeck}
              currentDeckName={currentDeckName}
              setCurrentDeckName={setCurrentDeckName}
              handleSaveDeck={handleSaveDeck}
              handleDeleteDeckInit={handleDeleteDeckInit}
              csvInputRef={csvInputRef}
              openManualAdd={openManualAdd}
              playlist={playlist}
              tableViewMode={tableViewMode}
              exportTableCSV={exportTableCSV}
              setIsClearDialogOpen={setIsClearDialogOpen}
              csvChangeSummary={csvChangeSummary}
              setIsChangeReviewOpen={setIsChangeReviewOpen}
              undoStack={undoStack}
              undoLastDataChange={undoLastDataChange}
              saveUpdatedCSV={saveUpdatedCSV}
              rangeInput={rangeInput}
              setRangeInput={setRangeInput}
              handleRangeAdd={handleRangeAdd}
          />}

          {sidebarSection === 'system' && <MobileSystemControls
              generatorEngine={generatorEngine}
              setGeneratorEngine={setGeneratorEngine}
              isSystemBusy={isSystemBusy}
              aiVoiceName={aiVoiceName}
              setAiVoiceName={setAiVoiceName}
              aiVoices={aiVoices}
              userApiKey={userApiKey}
              onUserApiKeyChange={onUserApiKeyChange}
              geminiOwnerConfigured={geminiOwnerConfigured}
              geminiOwnerUnlocked={geminiOwnerUnlocked}
              onGeminiOwnerUnlock={onGeminiOwnerUnlock}
              onGeminiOwnerLock={onGeminiOwnerLock}
              geminiByokAvailable={geminiByokAvailable}
              geminiByokRegistered={geminiByokRegistered}
              onGeminiByokRegister={onGeminiByokRegister}
              onGeminiByokClear={onGeminiByokClear}
              edgeVoices={edgeVoices}
              edgeVoice={edgeVoice}
              setEdgeVoice={setEdgeVoice}
              edgeIndonesianVoice={edgeIndonesianVoice}
              setEdgeIndonesianVoice={setEdgeIndonesianVoice}
              edgeRate={edgeRate}
              setEdgeRate={setEdgeRate}
              edgePitch={edgePitch}
              setEdgePitch={setEdgePitch}
              testEdgeBackend={testEdgeBackend}
              edgeHealth={edgeHealth}
              folderInputRef={folderInputRef}
              currentMapCount={currentMapCount}
              mode={mode}
              isBatchDownloading={isBatchDownloading}
              batchConfig={batchConfig}
              setBatchConfig={setBatchConfig}
              advancedDatasetStats={advancedDatasetStats}
              runBatchDownload={runBatchDownload}
              DownloadCloudIcon={DownloadCloudIcon}
              storageRefreshToken={storageRefreshToken}
              onDatasetCacheCleared={onDatasetCacheCleared}
              onMasteryReset={onMasteryReset}
              onStudyTrackingReset={onStudyTrackingReset}
              masteryByVocabId={masteryByVocabId}
              activityByVocabId={activityByVocabId}
              currentVocabIds={currentVocabIds}
              onProgressRestored={onProgressRestored}
          />}
      </div>
  );

export default MobileTools;
