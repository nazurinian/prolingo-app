import React from 'react';
import { BookOpen, Database, Headphones, Settings, Volume2 } from 'lucide-react';
import MobileTools from './MobileTools';
import WorkspaceTabs from '../table/WorkspaceTabs';
import MasterDataToolbar from '../table/MasterDataToolbar';
import BatchPopup from '../table/BatchPopup';
import TextBatchPopup from '../text/TextBatchPopup.jsx';
import { V5116_CONTROL_SECTIONS } from '../../constants/playbackConstants';

const DownloadCloudIcon = ({className}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="m8 17 4 4 4-4"></path></svg>;

export const renderBatchPopupView = ({
  batchPanelRef, mode, setIsBatchOpen, isBatchDownloading, batchConfig, setBatchConfig,
  generatorEngine, edgeVoice, edgeIndonesianVoice, aiVoiceName, advancedDatasetStats, handleBatchRangeBlur, runBatchDownload,
  isBatchStopping, batchStatusText, tableCoverage = null, structuredTextBatch = null, inline = false, showClose = true,
  batchSessions = [], stagingRecords = [], stagingSummary = null, allStagingSummary = null, batchAvailabilityById = {}, onExportCurrentMp3 = null, onExportCurrentZip = null, onExportBatchSessions = null,
  onClearBatchStaging = null, onClearAllStaging = null, onDeleteBatchHistory = null, directMp3Limit = 10
}) => {
  if (mode === 'text' && structuredTextBatch) {
    return <TextBatchPopup
      batchPanelRef={batchPanelRef}
      setIsBatchOpen={setIsBatchOpen}
      structuredTextBatch={structuredTextBatch}
      inline={inline}
      showClose={showClose}
    />;
  }
  return <BatchPopup
    batchPanelRef={batchPanelRef}
    mode={mode}
    setIsBatchOpen={setIsBatchOpen}
    isBatchDownloading={isBatchDownloading}
    batchConfig={batchConfig}
    setBatchConfig={setBatchConfig}
    generatorEngine={generatorEngine}
    edgeVoice={edgeVoice}
    edgeIndonesianVoice={edgeIndonesianVoice}
    aiVoiceName={aiVoiceName}
    advancedDatasetStats={advancedDatasetStats}
    handleBatchRangeBlur={handleBatchRangeBlur}
    runBatchDownload={runBatchDownload}
    isBatchStopping={isBatchStopping}
    batchStatusText={batchStatusText}
    tableCoverage={tableCoverage}
    structuredTextBatch={null}
    DownloadCloudIcon={DownloadCloudIcon}
    inline={inline}
    showClose={showClose}
    batchSessions={batchSessions}
    stagingRecords={stagingRecords}
    stagingSummary={stagingSummary}
    allStagingSummary={allStagingSummary}
    batchAvailabilityById={batchAvailabilityById}
    onExportCurrentMp3={onExportCurrentMp3}
    onExportCurrentZip={onExportCurrentZip}
    onExportBatchSessions={onExportBatchSessions}
    onClearBatchStaging={onClearBatchStaging}
    onClearAllStaging={onClearAllStaging}
    onDeleteBatchHistory={onDeleteBatchHistory}
    directMp3Limit={directMp3Limit}
  />;
};

export const renderControlSectionTabsView = ({ compact = false, sidebarSection, setSidebarSection, mode = 'table' }) => {
    const iconFor = (key) => {
      if (key === 'player') return <Volume2 className="w-3.5 h-3.5"/>;
      if (key === 'audio') return <Headphones className="w-3.5 h-3.5"/>;
      if (key === 'learn') return <BookOpen className="w-3.5 h-3.5"/>;
      if (key === 'data') return <Database className="w-3.5 h-3.5"/>;
      return <Settings className="w-3.5 h-3.5"/>;
    };
    const sections = mode === 'text'
      ? [{ key: 'audio', label: 'Audio', shortLabel: 'AUDIO' }, ...V5116_CONTROL_SECTIONS.filter(section => section.key === 'data' || section.key === 'system')]
      : V5116_CONTROL_SECTIONS;
    return (
      <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 ${compact ? 'p-1.5' : 'p-2'}`}>
        <div className={`grid ${sections.length === 3 ? 'grid-cols-3' : sections.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} gap-1`}>
          {sections.map(section => {
            const active = sidebarSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setSidebarSection(section.key)}
                className={`min-w-0 rounded-lg border transition-all duration-150 flex flex-col items-center justify-center gap-1 ${compact ? 'px-1 py-2' : 'px-1.5 py-2'} ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                title={`${section.label} controls`}
              >
                {iconFor(section.key)}
                <span className="text-[8px] font-black tracking-wide truncate w-full text-center">{section.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
};

export const renderMobileToolsView = ({
  sidebarSection, renderControlSectionTabs, currentMapCount, mode, renderStatusBadge,
  tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority,
  preferLocalAudio, setPreferLocalAudio, isSystemBusy, voices, selectedVoice,
  setSelectedVoice, indonesianVoices, selectedIndonesianVoice, setSelectedIndonesianVoice,
  rate, setRate, meaningRate, setMeaningRate, ratesLinked, setRatesLinked, showIndonesianBrowserVoice, structuredTextModeActive,
  textStructuredPreferences, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, handleStructuredTextDocumentVoiceChange, handleStructuredTextSpeakerVoiceChange, handleStructuredTextDisplayModeChange, handleStructuredTextPlaybackChannelModeChange, handleStructuredTextPlaybackFeelChange, renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode,
  memorySettings, setMemorySettings, advancedDatasetStats, isMultiSourceMode,
  dirtySourceKeys, isCsvDirty, openFullPackPicker, sourceDiagnostics, sourceChangeSummaries,
  sourcePack, openSourcePicker, removeSourceLayer, saveUpdatedSource, exportMergedDataset,
  savedDecks, selectedDeckId, handleLoadDeck, currentDeckName, setCurrentDeckName,
  handleSaveDeck, handleDeleteDeckInit, csvInputRef, openManualAdd, playlist, tableViewMode,
  exportTableCSV, setIsClearDialogOpen, csvChangeSummary, setIsChangeReviewOpen, undoStack,
  undoLastDataChange, saveUpdatedCSV,
  generatorEngine, setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices,
  userApiKey, onUserApiKeyChange, geminiOwnerConfigured, geminiOwnerUnlocked, onGeminiOwnerUnlock, onGeminiOwnerLock, geminiByokAvailable, geminiByokRegistered, onGeminiByokRegister, onGeminiByokClear,
  edgeVoices, edgeVoice, setEdgeVoice, edgeIndonesianVoice,
  setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch, setEdgePitch, testEdgeBackend,
  edgeHealth, folderInputRef, isBatchDownloading, isBatchStopping, batchStatusText, batchConfig, setBatchConfig, runBatchDownload,
  tableCoverage, structuredTextBatch, batchSessions, stagingRecords, stagingSummary, batchAvailabilityById, onExportCurrentMp3, onExportBatchSessions, onClearBatchStaging, onDeleteBatchHistory, directMp3Limit,
  isBatchOpen, setIsBatchOpen, showLogs, setShowLogs, systemLogs, logContainerRef,
  storageRefreshToken, onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset,
  masteryByVocabId, activityByVocabId, currentVocabIds, onProgressRestored,
  textLibraryCatalog, activeTextDocument, activeTextDocumentTree, activeTextDocumentId, activeTextEditorModel,
  textLibraryCommandBusy, textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
  handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument, handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection, handleTextLibraryStructuredCommand,
  structuredTextAudioSidebarControls, structuredTextAudioLibraryControls, structuredTextAudioCoverageMap
}) => (
      <MobileTools
          sidebarSection={sidebarSection}
          renderControlSectionTabs={renderControlSectionTabs}
          currentMapCount={currentMapCount}
          mode={mode}
          renderStatusBadge={renderStatusBadge}
          tableAudioVoiceOptions={tableAudioVoiceOptions}
          tableLocalAudioVoiceMode={tableLocalAudioVoiceMode}
          setTableLocalAudioVoiceMode={setTableLocalAudioVoiceMode}
          tableAudioVoicePriority={tableAudioVoicePriority}
          moveTableLocalAudioVoicePriority={moveTableLocalAudioVoicePriority}
          preferLocalAudio={preferLocalAudio}
          setPreferLocalAudio={setPreferLocalAudio}
          isSystemBusy={isSystemBusy}
          voices={voices}
          selectedVoice={selectedVoice}
          setSelectedVoice={setSelectedVoice}
          indonesianVoices={indonesianVoices}
          selectedIndonesianVoice={selectedIndonesianVoice}
          setSelectedIndonesianVoice={setSelectedIndonesianVoice}
          showIndonesianBrowserVoice={showIndonesianBrowserVoice}
          rate={rate}
          setRate={setRate}
          meaningRate={meaningRate}
          setMeaningRate={setMeaningRate}
          ratesLinked={ratesLinked}
          setRatesLinked={setRatesLinked}
          structuredTextModeActive={structuredTextModeActive}
          textStructuredPreferences={textStructuredPreferences}
          defaultStructuredTextVoiceId={defaultStructuredTextVoiceId}
          defaultStructuredMeaningVoiceId={defaultStructuredMeaningVoiceId}
          handleStructuredTextDocumentVoiceChange={handleStructuredTextDocumentVoiceChange}
          handleStructuredTextSpeakerVoiceChange={handleStructuredTextSpeakerVoiceChange}
          handleStructuredTextDisplayModeChange={handleStructuredTextDisplayModeChange}
          handleStructuredTextPlaybackChannelModeChange={handleStructuredTextPlaybackChannelModeChange}
          handleStructuredTextPlaybackFeelChange={handleStructuredTextPlaybackFeelChange}
          structuredTextAudioSidebarControls={structuredTextAudioSidebarControls}
          renderPlaybackSequenceBuilder={renderPlaybackSequenceBuilder}
          isMemoryMode={isMemoryMode}
          setIsMemoryMode={setIsMemoryMode}
          memorySettings={memorySettings}
          setMemorySettings={setMemorySettings}
          advancedDatasetStats={advancedDatasetStats}
          isMultiSourceMode={isMultiSourceMode}
          dirtySourceKeys={dirtySourceKeys}
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
          generatorEngine={generatorEngine}
          setGeneratorEngine={setGeneratorEngine}
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
          isBatchDownloading={isBatchDownloading}
          isBatchStopping={isBatchStopping}
          batchStatusText={batchStatusText}
          batchConfig={batchConfig}
          setBatchConfig={setBatchConfig}
          runBatchDownload={runBatchDownload}
          tableCoverage={tableCoverage}
          structuredTextBatch={structuredTextBatch}
          batchSessions={batchSessions}
          stagingRecords={stagingRecords}
          stagingSummary={stagingSummary}
          batchAvailabilityById={batchAvailabilityById}
          onExportCurrentMp3={onExportCurrentMp3}
          onExportBatchSessions={onExportBatchSessions}
          onClearBatchStaging={onClearBatchStaging}
          onDeleteBatchHistory={onDeleteBatchHistory}
          directMp3Limit={directMp3Limit}
          DownloadCloudIcon={DownloadCloudIcon}
          isBatchOpen={isBatchOpen}
          setIsBatchOpen={setIsBatchOpen}
          showLogs={showLogs}
          setShowLogs={setShowLogs}
          systemLogs={systemLogs}
          logContainerRef={logContainerRef}
          storageRefreshToken={storageRefreshToken}
          onDatasetCacheCleared={onDatasetCacheCleared}
          onMasteryReset={onMasteryReset}
          onStudyTrackingReset={onStudyTrackingReset}
          masteryByVocabId={masteryByVocabId}
          activityByVocabId={activityByVocabId}
          currentVocabIds={currentVocabIds}
          onProgressRestored={onProgressRestored}
          textLibraryCatalog={textLibraryCatalog}
          activeTextDocument={activeTextDocument}
          activeTextDocumentTree={activeTextDocumentTree}
          activeTextDocumentId={activeTextDocumentId}
          activeTextEditorModel={activeTextEditorModel}
          textLibraryCommandBusy={textLibraryCommandBusy}
          textLibraryCommandError={textLibraryCommandError}
          handleTextLibrarySelectDocument={handleTextLibrarySelectDocument}
          handleTextLibraryCreateDocument={handleTextLibraryCreateDocument}
          handleTextLibraryCreateCollection={handleTextLibraryCreateCollection}
          handleTextLibraryRenameDocument={handleTextLibraryRenameDocument}
          handleTextLibraryMoveDocument={handleTextLibraryMoveDocument}
          handleTextLibraryDeleteDocument={handleTextLibraryDeleteDocument}
          handleTextLibraryRenameCollection={handleTextLibraryRenameCollection}
          handleTextLibraryDeleteCollection={handleTextLibraryDeleteCollection}
          handleTextLibraryStructuredCommand={handleTextLibraryStructuredCommand}
          structuredTextAudioCoverageMap={structuredTextAudioCoverageMap}
      />
);

export const renderWorkspaceTabsView = ({ mobileContext = false, handleTabSwitch, tableViewMode, studyQueue, clearStudyQueue }) => (
    <WorkspaceTabs
      mobileContext={mobileContext}
      handleTabSwitch={handleTabSwitch}
      tableViewMode={tableViewMode}
      studyQueue={studyQueue}
      clearStudyQueue={clearStudyQueue}
    />
);

export const renderMasterDataToolbarView = ({
  extraClass = '', mode, tableViewMode, playlist, masterSearch, setMasterSearch,
  masterFilter, setMasterFilter, masteryFilter, setMasteryFilter, masteryProgressStats, studyActivityStats,
  isCsvDirty, setIsChangeReviewOpen, csvChangeSummary,
  undoStack, undoLastDataChange, masterFilteredPlaylist, lastDraftAutoSaveAt,
  rangeInput, setRangeInput, handleRangeAdd
}) => {
      if (mode !== 'table' || tableViewMode !== 'master') return null;
      const totalStructured = playlist.filter(item => item.isStructured).length;
      return (
          <MasterDataToolbar
              extraClass={extraClass}
              masterSearch={masterSearch}
              setMasterSearch={setMasterSearch}
              masterFilter={masterFilter}
              setMasterFilter={setMasterFilter}
              masteryFilter={masteryFilter}
              setMasteryFilter={setMasteryFilter}
              masteryProgressStats={masteryProgressStats}
              studyActivityStats={studyActivityStats}
              isCsvDirty={isCsvDirty}
              setIsChangeReviewOpen={setIsChangeReviewOpen}
              csvChangeSummary={csvChangeSummary}
              undoStack={undoStack}
              undoLastDataChange={undoLastDataChange}
              masterFilteredPlaylist={masterFilteredPlaylist}
              totalStructured={totalStructured}
              lastDraftAutoSaveAt={lastDraftAutoSaveAt}
              rangeInput={rangeInput}
              setRangeInput={setRangeInput}
              handleRangeAdd={handleRangeAdd}
          />
      );
};
