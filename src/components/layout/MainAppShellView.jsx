import React from 'react';
import Header from './Header';
import BottomPlayerBar from './BottomPlayerBar';
import SidebarShell from './SidebarShell';
import SidebarTopControls from './SidebarTopControls';
import PlayerAudioSourceControls from '../controls/PlayerAudioSourceControls';
import PlayerBrowserTtsControls from '../controls/PlayerBrowserTtsControls';
import DesktopLearnControls from '../controls/DesktopLearnControls';
import DesktopDataActions from '../controls/DesktopDataActions';
import DesktopDataWorkspace from '../controls/DesktopDataWorkspace';
import DesktopSystemControls from '../controls/DesktopSystemControls';
import ChangeReviewModal from '../modals/ChangeReviewModal';
import ManualEditorModal from '../modals/ManualEditorModal';
import { RevertAllConfirmModal, DeleteVocabularyModal, ClearViewModal, DeleteDeckModal } from '../modals/ConfirmDialog';
import { createEmptySourcePack } from '../../utils/multiSourceUtils';
import { MOBILE_AUX_TOP_OFFSET, MOBILE_BOTTOM_PLAYER_RESERVE_CSS, getMobilePlayerTopOffset } from '../../constants/layoutConstants';

export const renderMainAppShellView = (props) => {
  const {
    isMobile, showAppBar, isSidebarOpen, setIsSidebarOpen, goHome, isSystemBusy,
    savedDecks, selectedDeckId, handleLoadDeck, handleDeleteDeckInit, currentDeckName, setCurrentDeckName,
    handleSaveDeck, mode, isCsvDirty, csvChangeSummary, saveUpdatedCSV, folderInputRef,
    sourceInputRef, fullPackInputRef, handleFolderSelect, handleSourceUpload, handleFullPackUpload, mobileTab,
    handleMobileTabSwitch, renderWorkspaceTabs, theme, setTheme, handleModeSwitch, sidebarSection,
    renderControlSectionTabs, currentMapCount, renderStatusBadge, preferLocalAudio, setPreferLocalAudio, generatorEngine,
    setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices, edgeVoices, edgeVoice,
    setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch,
    setEdgePitch, edgeHealth, testEdgeBackend, userApiKey, onUserApiKeyChange,
    geminiOwnerConfigured, geminiOwnerUnlocked, onGeminiOwnerUnlock, onGeminiOwnerLock, geminiByokAvailable, geminiByokRegistered, onGeminiByokRegister, onGeminiByokClear,
    batchButtonRef, isBatchDownloading, setIsBatchOpen, isBatchOpen, renderBatchPopup, debugButtonRef,
    setShowLogs, showLogs, logContainerRef, systemLogs, voices, selectedVoice,
    setSelectedVoice, indonesianVoices, selectedIndonesianVoice, setSelectedIndonesianVoice, rate, setRate,
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode, memorySettings, setMemorySettings, advancedDatasetStats,
    csvInputRef, handleCSVUpload, openManualAdd, playlist, tableViewMode, exportTableCSV,
    setIsClearDialogOpen, setIsChangeReviewOpen, undoStack, undoLastDataChange, isMultiSourceMode, textareaRef,
    isLocked, textContent, handleInputContentChange, handleInsertTab, setLockedStates, dirtySourceKeys,
    openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker, removeSourceLayer,
    saveUpdatedSource, exportMergedDataset, lastDraftAutoSaveAt, renderMobileTools, renderPlaylist, isPaused,
    isPlaying, playingIndex, activePlaybackList, handleSmartNav, handleGlobalPlay, forceStopAll,
    playbackMode, cyclePlaybackMode, setPlaybackMode, setShowAppBar, playingContext, isChangeReviewOpen,
    applyChangeRevert, setIsRevertAllConfirmOpen, isRevertAllConfirmOpen, revertAllChanges, isManualEditorOpen, closeManualEditor,
    manualEditingId, importedRowCount, sequenceHighWater, manualForm, setManualForm, manualAdvancedOpen,
    setManualAdvancedOpen, saveManualVocabulary, isClearDialogOpen, setTableContent, setCsvBaselineContent, setSourcePack,
    setSequenceHighWater, setManualIdHighWater, setImportedRowCount, setUndoStack, setMasterSearch, setMasterFilter,
    setLocalAudioMapTable, setAudioStatusTable, setTextContent, setLocalAudioMapText, setAudioStatusText, resetFullState, pendingDeleteItem,
    setPendingDeleteItem, confirmDeleteStructuredItem, isDeleteDialogOpen, setIsDeleteDialogOpen, confirmDeleteDeck,
    storageRefreshToken, onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset,
    masteryByVocabId, activityByVocabId, currentVocabIds, onProgressRestored
  } = props;

  return (
    <div className={`bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans flex flex-col relative transition-colors ${isMobile ? 'min-h-[100dvh] overflow-x-hidden' : 'h-screen overflow-hidden'}`}>
      
      {/* --- UNIFIED MOBILE HEADER GROUP --- */}
      <Header
        isMobile={isMobile}
        showAppBar={showAppBar}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        goHome={goHome}
        isSystemBusy={isSystemBusy}
        savedDecks={savedDecks}
        selectedDeckId={selectedDeckId}
        handleLoadDeck={handleLoadDeck}
        handleDeleteDeckInit={handleDeleteDeckInit}
        currentDeckName={currentDeckName}
        setCurrentDeckName={setCurrentDeckName}
        handleSaveDeck={handleSaveDeck}
        mode={mode}
        isCsvDirty={isCsvDirty}
        csvChangeSummary={csvChangeSummary}
        saveUpdatedCSV={saveUpdatedCSV}
        folderInputRef={folderInputRef}
        sourceInputRef={sourceInputRef}
        fullPackInputRef={fullPackInputRef}
        handleFolderSelect={handleFolderSelect}
        handleSourceUpload={handleSourceUpload}
        handleFullPackUpload={handleFullPackUpload}
        mobileTab={mobileTab}
        handleMobileTabSwitch={handleMobileTabSwitch}
        renderWorkspaceTabs={renderWorkspaceTabs}
      />

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        <SidebarShell
          isMobile={isMobile}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          mode={mode}
          mobileTab={mobileTab}
        >
          <div className="flex flex-col h-full overflow-y-auto w-72 overscroll-contain"> 
             <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-4 flex-shrink-0">
              
              <SidebarTopControls
                theme={theme}
                setTheme={setTheme}
                isSystemBusy={isSystemBusy}
                mode={mode}
                handleModeSwitch={handleModeSwitch}
                sidebarSection={sidebarSection}
                renderControlSectionTabs={renderControlSectionTabs}
              />

              {sidebarSection === 'player' && <>
              <PlayerAudioSourceControls
                currentMapCount={currentMapCount}
                mode={mode}
                renderStatusBadge={renderStatusBadge}
                preferLocalAudio={preferLocalAudio}
                setPreferLocalAudio={setPreferLocalAudio}
                isSystemBusy={isSystemBusy}
              />

              </>}

              {sidebarSection === 'system' && <DesktopSystemControls
                generatorEngine={generatorEngine}
                setGeneratorEngine={setGeneratorEngine}
                isSystemBusy={isSystemBusy}
                aiVoiceName={aiVoiceName}
                setAiVoiceName={setAiVoiceName}
                aiVoices={aiVoices}
                edgeVoices={edgeVoices}
                edgeVoice={edgeVoice}
                setEdgeVoice={setEdgeVoice}
                edgeIndonesianVoice={edgeIndonesianVoice}
                setEdgeIndonesianVoice={setEdgeIndonesianVoice}
                edgeRate={edgeRate}
                setEdgeRate={setEdgeRate}
                edgePitch={edgePitch}
                setEdgePitch={setEdgePitch}
                edgeHealth={edgeHealth}
                testEdgeBackend={testEdgeBackend}
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
                folderInputRef={folderInputRef}
                currentMapCount={currentMapCount}
                batchButtonRef={batchButtonRef}
                isBatchDownloading={isBatchDownloading}
                setIsBatchOpen={setIsBatchOpen}
                isBatchOpen={isBatchOpen}
                renderBatchPopup={renderBatchPopup}
                debugButtonRef={debugButtonRef}
                setShowLogs={setShowLogs}
                showLogs={showLogs}
                logContainerRef={logContainerRef}
                systemLogs={systemLogs}
                storageRefreshToken={storageRefreshToken}
                onDatasetCacheCleared={onDatasetCacheCleared}
                onMasteryReset={onMasteryReset}
                onStudyTrackingReset={onStudyTrackingReset}
                masteryByVocabId={masteryByVocabId}
                activityByVocabId={activityByVocabId}
                currentVocabIds={currentVocabIds}
                onProgressRestored={onProgressRestored}
              />}

              {sidebarSection === 'player' && <>
              <PlayerBrowserTtsControls
                voices={voices}
                selectedVoice={selectedVoice}
                setSelectedVoice={setSelectedVoice}
                isSystemBusy={isSystemBusy}
                mode={mode}
                indonesianVoices={indonesianVoices}
                selectedIndonesianVoice={selectedIndonesianVoice}
                setSelectedIndonesianVoice={setSelectedIndonesianVoice}
                rate={rate}
                setRate={setRate}
              />

              </>}

              {sidebarSection === 'learn' && <DesktopLearnControls
                  mode={mode}
                  renderPlaybackSequenceBuilder={renderPlaybackSequenceBuilder}
                  isMemoryMode={isMemoryMode}
                  setIsMemoryMode={setIsMemoryMode}
                  memorySettings={memorySettings}
                  setMemorySettings={setMemorySettings}
                  advancedDatasetStats={advancedDatasetStats}
              />}

              {sidebarSection === 'data' && <DesktopDataActions
                mode={mode}
                isSystemBusy={isSystemBusy}
                csvInputRef={csvInputRef}
                handleCSVUpload={handleCSVUpload}
                openManualAdd={openManualAdd}
                playlist={playlist}
                tableViewMode={tableViewMode}
                exportTableCSV={exportTableCSV}
                setIsClearDialogOpen={setIsClearDialogOpen}
                isCsvDirty={isCsvDirty}
                csvChangeSummary={csvChangeSummary}
                setIsChangeReviewOpen={setIsChangeReviewOpen}
                undoStack={undoStack}
                undoLastDataChange={undoLastDataChange}
                saveUpdatedCSV={saveUpdatedCSV}
                isMultiSourceMode={isMultiSourceMode}
              />}
            </div>
            
            {sidebarSection === 'data' && <DesktopDataWorkspace
              mode={mode}
              textareaRef={textareaRef}
              isSystemBusy={isSystemBusy}
              isLocked={isLocked}
              textContent={textContent}
              handleInputContentChange={handleInputContentChange}
              handleInsertTab={handleInsertTab}
              setLockedStates={setLockedStates}
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
              csvChangeSummary={csvChangeSummary}
              setIsChangeReviewOpen={setIsChangeReviewOpen}
              undoStack={undoStack}
              undoLastDataChange={undoLastDataChange}
              lastDraftAutoSaveAt={lastDraftAutoSaveAt}
            />}
          </div>
        </SidebarShell>

        {/* MAIN BODY AREA */}
        <div className={`flex-1 bg-slate-50 dark:bg-slate-900 ${isMobile ? '' : 'overflow-hidden relative flex flex-col'}`}>
            
            {/* 4. TABLE WORKSPACE SHELL (Desktop) */}
            {!isMobile && mode === 'table' && renderWorkspaceTabs(false)}

            <div
              className={`absolute inset-0 bg-slate-900 p-4 overflow-auto z-30 ${mobileTab === 'terminal' ? 'block md:hidden' : 'hidden'}`}
              style={isMobile ? { paddingTop: `${MOBILE_AUX_TOP_OFFSET}px`, paddingBottom: MOBILE_BOTTOM_PLAYER_RESERVE_CSS } : undefined}
            >
                {systemLogs.map((log, i) => (
                    <div key={i} className="leading-tight border-b border-slate-800 pb-1 mb-1 font-mono text-[10px]">
                        <span className="text-slate-500 mr-2">[{log.time}]</span> 
                        <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>{log.type}:</span> 
                        <span className="text-slate-300 ml-1">{log.message}</span>
                    </div>
                ))}
            </div>

            <div
              className={`absolute inset-0 bg-slate-50 dark:bg-slate-900 z-30 overflow-y-auto ${mobileTab === 'tools' ? 'block md:hidden' : 'hidden'}`}
              style={isMobile ? { paddingTop: `${MOBILE_AUX_TOP_OFFSET}px`, paddingBottom: MOBILE_BOTTOM_PLAYER_RESERVE_CSS } : undefined}
            >
                {renderMobileTools()}
            </div>

            <div className={`${mobileTab === 'player' ? 'block' : 'hidden'} md:block ${isMobile ? '' : 'flex-1 overflow-hidden p-0'}`}>
                 {/* 5. SPACER OTOMATIS */}
                 <div className={`max-w-4xl mx-auto px-2 md:px-4 ${isMobile ? 'h-auto' : 'h-full pt-2 md:pt-4'}`}
                      style={{ 
                          paddingTop: isMobile ? `${getMobilePlayerTopOffset(mode)}px` : '0'
                      }}
                 >
                    {renderPlaylist()}
                 </div>
            </div>

        </div>
      </div>

      {/* BOTTOM BAR - FIXED BOTTOM */}
      <BottomPlayerBar
        isMobile={isMobile}
        isPaused={isPaused}
        isPlaying={isPlaying}
        playingIndex={playingIndex}
        activePlaybackList={activePlaybackList}
        handleSmartNav={handleSmartNav}
        handleGlobalPlay={handleGlobalPlay}
        forceStopAll={forceStopAll}
        playbackMode={playbackMode}
        cyclePlaybackMode={cyclePlaybackMode}
        setPlaybackMode={setPlaybackMode}
        mobileTab={mobileTab}
        handleMobileTabSwitch={(target) => {
          setShowAppBar(true);
          handleMobileTabSwitch(target);
        }}
        playingContext={playingContext}
      />
      {isChangeReviewOpen && (
        <ChangeReviewModal
          setIsChangeReviewOpen={setIsChangeReviewOpen}
          isCsvDirty={isCsvDirty}
          csvChangeSummary={csvChangeSummary}
          applyChangeRevert={applyChangeRevert}
          undoStack={undoStack}
          undoLastDataChange={undoLastDataChange}
          setIsRevertAllConfirmOpen={setIsRevertAllConfirmOpen}
          saveUpdatedCSV={saveUpdatedCSV}
          isMultiSourceMode={isMultiSourceMode}
        />
      )}

      <RevertAllConfirmModal
        isRevertAllConfirmOpen={isRevertAllConfirmOpen}
        setIsRevertAllConfirmOpen={setIsRevertAllConfirmOpen}
        revertAllChanges={revertAllChanges}
      />

      <ManualEditorModal
        isManualEditorOpen={isManualEditorOpen}
        closeManualEditor={closeManualEditor}
        manualEditingId={manualEditingId}
        importedRowCount={importedRowCount}
        sequenceHighWater={sequenceHighWater}
        manualForm={manualForm}
        setManualForm={setManualForm}
        manualAdvancedOpen={manualAdvancedOpen}
        setManualAdvancedOpen={setManualAdvancedOpen}
        saveManualVocabulary={saveManualVocabulary}
      />

      {isClearDialogOpen && (
        <ClearViewModal
          onCancel={() => setIsClearDialogOpen(false)}
          onConfirm={() => { if(mode === 'table') {setTableContent(''); setCsvBaselineContent(''); setSourcePack(createEmptySourcePack()); setSequenceHighWater(0); setManualIdHighWater(0); setImportedRowCount(0); setUndoStack([]); setMasterSearch(''); setMasterFilter('all'); setLocalAudioMapTable({}); setAudioStatusTable('idle');} else {setTextContent(''); setLocalAudioMapText({}); setAudioStatusText('idle');} setLockedStates(p => ({...p, [mode]: false})); setIsClearDialogOpen(false); resetFullState(); }}
        />
      )}

      <DeleteVocabularyModal
        pendingDeleteItem={pendingDeleteItem}
        setPendingDeleteItem={setPendingDeleteItem}
        confirmDeleteStructuredItem={confirmDeleteStructuredItem}
      />

      {isDeleteDialogOpen && (
        <DeleteDeckModal
          onCancel={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDeleteDeck}
        />
      )}
    </div>
  );
};
