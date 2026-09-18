import React from 'react';
import { createPortal } from 'react-dom';
import Header from './Header';
import BottomPlayerBar from './BottomPlayerBar';
import SidebarShell from './SidebarShell';
import SidebarTopControls from './SidebarTopControls';
import PlayerAudioSourceControls from '../controls/PlayerAudioSourceControls';
import PlayerBrowserTtsControls from '../controls/PlayerBrowserTtsControls';
import TextStructuredAudioControls from '../text/TextStructuredAudioControls.jsx';
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
    handleSaveDeck, mode, isCsvDirty, csvChangeSummary, saveUpdatedCSV, folderInputRef, audioZipInputRef,
    sourceInputRef, fullPackInputRef, handleFolderSelect, handleAudioZipSelect, handleSourceUpload, handleFullPackUpload, mobileTab,
    handleMobileTabSwitch, renderWorkspaceTabs, theme, setTheme, handleModeSwitch, sidebarSection, setSidebarSection,
    renderControlSectionTabs, currentMapCount, renderStatusBadge, tableAudioVoiceOptions, tableLocalAudioVoiceMode, setTableLocalAudioVoiceMode, tableAudioVoicePriority, moveTableLocalAudioVoicePriority, preferLocalAudio, setPreferLocalAudio, generatorEngine,
    setGeneratorEngine, aiVoiceName, setAiVoiceName, aiVoices, edgeVoices, edgeVoice,
    setEdgeVoice, edgeIndonesianVoice, setEdgeIndonesianVoice, edgeRate, setEdgeRate, edgePitch,
    setEdgePitch, edgeHealth, testEdgeBackend, userApiKey, onUserApiKeyChange,
    geminiOwnerConfigured, geminiOwnerUnlocked, onGeminiOwnerUnlock, onGeminiOwnerLock, geminiByokAvailable, geminiByokRegistered, onGeminiByokRegister, onGeminiByokClear,
    batchButtonRef, isBatchDownloading, setIsBatchOpen, isBatchOpen, renderBatchPopup, debugButtonRef,
    setShowLogs, showLogs, logContainerRef, systemLogs, voices, selectedVoice,
    setSelectedVoice, indonesianVoices, selectedIndonesianVoice, setSelectedIndonesianVoice, rate, setRate, meaningRate, setMeaningRate, ratesLinked, setRatesLinked, showIndonesianBrowserVoice,
    textStructuredPreferences, defaultStructuredTextVoiceId, defaultStructuredMeaningVoiceId, handleStructuredTextDocumentVoiceChange, handleStructuredTextSpeakerVoiceChange, handleStructuredTextDisplayModeChange, handleStructuredTextPlaybackChannelModeChange, handleStructuredTextPlaybackFeelChange,
    renderPlaybackSequenceBuilder, isMemoryMode, setIsMemoryMode, memorySettings, setMemorySettings, advancedDatasetStats,
    csvInputRef, handleCSVUpload, openManualAdd, playlist, tableViewMode, exportTableCSV, rangeInput, setRangeInput, handleRangeAdd,
    setIsClearDialogOpen, setIsChangeReviewOpen, undoStack, undoLastDataChange, isMultiSourceMode, textareaRef,
    isLocked, textContent, handleInputContentChange, handleInsertTab, setLockedStates, dirtySourceKeys,
    openFullPackPicker, sourceDiagnostics, sourceChangeSummaries, sourcePack, openSourcePicker, removeSourceLayer,
    saveUpdatedSource, exportMergedDataset, lastDraftAutoSaveAt, renderMobileTools, renderPlaylist, isPaused,
    isPlaying, playingIndex, speakingPart, activePlaybackList, handleSmartNav, handleGlobalPlay, forceStopAll,
    playbackMode, cyclePlaybackMode, setPlaybackMode, setShowAppBar, playingContext, structuredTextModeActive, onOpenTextPlayer, isChangeReviewOpen,
    applyChangeRevert, setIsRevertAllConfirmOpen, isRevertAllConfirmOpen, revertAllChanges, isManualEditorOpen, closeManualEditor,
    manualEditingId, importedRowCount, sequenceHighWater, manualForm, setManualForm, manualAdvancedOpen,
    setManualAdvancedOpen, saveManualVocabulary, isClearDialogOpen, setTableContent, setCsvBaselineContent, setSourcePack,
    setSequenceHighWater, setManualIdHighWater, setImportedRowCount, setUndoStack, setMasterSearch, setMasterFilter,
    setLocalAudioMapTable, setAudioStatusTable, setTextContent, setLocalAudioMapText, setAudioStatusText, resetFullState, resetTextState, pendingDeleteItem,
    setPendingDeleteItem, confirmDeleteStructuredItem, isDeleteDialogOpen, setIsDeleteDialogOpen, confirmDeleteDeck,
    storageRefreshToken, onDatasetCacheCleared, onMasteryReset, onStudyTrackingReset,
    masteryByVocabId, activityByVocabId, currentVocabIds, onProgressRestored,
    textLibraryCatalog, activeTextDocument, activeTextDocumentTree, activeTextDocumentId, activeTextEditorModel,
    textLibraryCommandBusy, textLibraryCommandError, handleTextLibrarySelectDocument, handleTextLibraryCreateDocument,
    handleTextLibraryCreateCollection, handleTextLibraryRenameDocument, handleTextLibraryMoveDocument, handleTextLibraryDeleteDocument, handleTextLibraryRenameCollection, handleTextLibraryDeleteCollection, handleTextLibraryStructuredCommand,
    structuredTextAudioSidebarControls, structuredTextAudioLibraryControls, structuredTextAudioCoverageMap
  } = props;

  const mobileTextDocuments = mode === 'text' ? [
    ...(textLibraryCatalog?.rootDocuments || []),
    ...(textLibraryCatalog?.collections || []).flatMap(collection => (collection.documents || []).map(document => ({ ...document, collectionTitle: collection.title })))
  ] : [];
  const getTextModeLabel = document => document?.editorModel === 'legacy-line-v1' ? 'LEGACY' : document?.documentType === 'conversation' ? 'CONV' : document?.documentType === 'paragraph' ? 'PARA' : 'MIXED';

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
        audioZipInputRef={audioZipInputRef}
        sourceInputRef={sourceInputRef}
        fullPackInputRef={fullPackInputRef}
        handleFolderSelect={handleFolderSelect}
        handleAudioZipSelect={handleAudioZipSelect}
        handleSourceUpload={handleSourceUpload}
        handleFullPackUpload={handleFullPackUpload}
        mobileTab={mobileTab}
        handleMobileTabSwitch={handleMobileTabSwitch}
        handleModeSwitch={handleModeSwitch}
        renderWorkspaceTabs={renderWorkspaceTabs}
        textLibraryCatalog={textLibraryCatalog}
        activeTextDocument={activeTextDocument}
        activeTextDocumentId={activeTextDocumentId}
        textLibraryCommandBusy={textLibraryCommandBusy || isSystemBusy}
        handleTextLibrarySelectDocument={handleTextLibrarySelectDocument}
        tableViewMode={tableViewMode}
        rangeInput={rangeInput}
        setRangeInput={setRangeInput}
        handleRangeAdd={handleRangeAdd}
      />

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        <SidebarShell
          isMobile={isMobile}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          mode={mode}
          mobileTab={mobileTab}
        >
          <div className="flex flex-col h-full overflow-y-auto w-72 overscroll-contain custom-scrollbar"> 
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

              {sidebarSection === 'player' && mode === 'table' && <>
              <PlayerAudioSourceControls
                currentMapCount={currentMapCount}
                mode={mode}
                renderStatusBadge={renderStatusBadge}
                preferLocalAudio={preferLocalAudio}
                setPreferLocalAudio={setPreferLocalAudio}
                isSystemBusy={isSystemBusy}
                tableAudioVoiceOptions={tableAudioVoiceOptions}
                tableLocalAudioVoiceMode={tableLocalAudioVoiceMode}
                setTableLocalAudioVoiceMode={setTableLocalAudioVoiceMode}
                tableAudioVoicePriority={tableAudioVoicePriority}
                moveTableLocalAudioVoicePriority={moveTableLocalAudioVoicePriority}
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
                mode={mode}
                batchButtonRef={batchButtonRef}
                isBatchDownloading={isBatchDownloading}
                setIsBatchOpen={setIsBatchOpen}
                isBatchOpen={isBatchOpen}
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

              {sidebarSection === 'player' && mode === 'table' && <>
              <PlayerBrowserTtsControls
                voices={voices}
                selectedVoice={selectedVoice}
                setSelectedVoice={setSelectedVoice}
                isSystemBusy={isSystemBusy}
                mode={mode}
                indonesianVoices={indonesianVoices}
                selectedIndonesianVoice={selectedIndonesianVoice}
                setSelectedIndonesianVoice={setSelectedIndonesianVoice}
                showIndonesianVoice={showIndonesianBrowserVoice}
                structuredTextModeActive={structuredTextModeActive}
                rate={rate}
                setRate={setRate}
                meaningRate={meaningRate}
                setMeaningRate={setMeaningRate}
                ratesLinked={ratesLinked}
                setRatesLinked={setRatesLinked}
              />

              </>}

              {sidebarSection === 'audio' && mode === 'text' && <div className="space-y-3">
                {structuredTextModeActive ? <TextStructuredAudioControls {...structuredTextAudioSidebarControls}/> : <>
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-3">
                    <p className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">Legacy Audio</p>
                    <p className="text-[8px] text-slate-400 mb-2">Legacy is EN-only: choose Browser TTS voice and speed here.</p>
                    <PlayerBrowserTtsControls voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} isSystemBusy={isSystemBusy} mode="text" indonesianVoices={[]} selectedIndonesianVoice={null} setSelectedIndonesianVoice={() => {}} showIndonesianVoice={false} structuredTextModeActive={false} rate={rate} setRate={setRate}/>
                  </div>
                </>}
              </div>}

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
                activeTextEditorModel={activeTextEditorModel}
                isBatchOpen={isBatchOpen}
                setIsBatchOpen={setIsBatchOpen}
                isBatchDownloading={isBatchDownloading}
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
              textLibraryCatalog={textLibraryCatalog}
              activeTextDocument={activeTextDocument}
              activeTextDocumentTree={activeTextDocumentTree}
              activeTextDocumentId={activeTextDocumentId}
              activeTextEditorModel={activeTextEditorModel}
              textLibraryCommandBusy={textLibraryCommandBusy || isSystemBusy}
              textLibraryCommandError={textLibraryCommandError}
              handleTextLibrarySelectDocument={handleTextLibrarySelectDocument}
              handleTextLibraryCreateDocument={handleTextLibraryCreateDocument}
              handleTextLibraryCreateCollection={handleTextLibraryCreateCollection}
              handleTextLibraryRenameDocument={handleTextLibraryRenameDocument}
              handleTextLibraryDeleteDocument={handleTextLibraryDeleteDocument}
              handleTextLibraryMoveDocument={handleTextLibraryMoveDocument}
              handleTextLibraryRenameCollection={handleTextLibraryRenameCollection}
              handleTextLibraryDeleteCollection={handleTextLibraryDeleteCollection}
              handleTextLibraryStructuredCommand={handleTextLibraryStructuredCommand}
              structuredTextAudioCoverageMap={structuredTextAudioCoverageMap}
            />}
          </div>
        </SidebarShell>

        {isBatchOpen && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center md:items-center md:p-5">
            <button
              type="button"
              aria-label="Close Batch workspace"
              onClick={() => setIsBatchOpen(false)}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            />
            <section
              className="relative z-10 w-full max-w-2xl overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl custom-scrollbar pb-[env(safe-area-inset-bottom,0px)]"
              style={{ maxHeight: 'min(88dvh, 820px)' }}
              aria-label="Batch workspace"
            >
              {renderBatchPopup({ inline: true, showClose: true })}
            </section>
          </div>,
          document.body
        )}

        {/* MAIN BODY AREA */}
        <div className={`flex-1 bg-slate-50 dark:bg-slate-900 ${isMobile ? '' : 'overflow-hidden relative flex flex-col'}`}>
            
            {/* 4. TABLE WORKSPACE SHELL (Desktop) */}
            {!isMobile && mode === 'table' && renderWorkspaceTabs(false)}

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
                    {isMobile && mode === 'text' && <div className="mb-2 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white/95 dark:bg-slate-900/95 p-2 shadow-sm" data-mobile-text-document-strip="true">
                      <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain custom-scrollbar pb-0.5">
                        {mobileTextDocuments.map(document => <button key={document.id} type="button" disabled={textLibraryCommandBusy} onClick={() => handleTextLibrarySelectDocument?.(document.id)} className={`shrink-0 min-h-10 max-w-[180px] rounded-lg border px-2.5 py-1.5 text-left ${document.id === activeTextDocumentId ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                          <span className="block truncate text-[9px] font-black">{document.title}</span><span className={`block text-[7px] font-bold ${document.id === activeTextDocumentId ? 'text-indigo-100' : 'text-slate-400'}`}>{getTextModeLabel(document)}</span>
                        </button>)}
                        {!mobileTextDocuments.length && <span className="shrink-0 px-2 text-[9px] text-slate-400">No Text data yet</span>}
                        <button type="button" onClick={() => { setSidebarSection?.('data'); handleMobileTabSwitch?.('tools'); }} className="shrink-0 min-h-10 rounded-lg border border-indigo-200 dark:border-indigo-800 px-3 text-[9px] font-black text-indigo-700 dark:text-indigo-300">DATA</button>
                      </div>
                    </div>}
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
        speakingPart={speakingPart}
        activePlaybackList={activePlaybackList}
        handleSmartNav={handleSmartNav}
        handleGlobalPlay={handleGlobalPlay}
        forceStopAll={forceStopAll}
        playbackMode={playbackMode}
        cyclePlaybackMode={cyclePlaybackMode}
        setPlaybackMode={setPlaybackMode}
        playingContext={playingContext}
        structuredTextModeActive={structuredTextModeActive}
        onOpenTextPlayer={onOpenTextPlayer}
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
          onConfirm={() => {
            if (mode === 'table') {
              setTableContent(''); setCsvBaselineContent(''); setSourcePack(createEmptySourcePack());
              setSequenceHighWater(0); setManualIdHighWater(0); setImportedRowCount(0); setUndoStack([]);
              setMasterSearch(''); setMasterFilter('all'); setLocalAudioMapTable({}); setAudioStatusTable('idle');
              setLockedStates(p => ({...p, table: false}));
              setIsClearDialogOpen(false);
              resetFullState();
              return;
            }
            setTextContent('');
            setLockedStates(p => ({...p, text: false}));
            setIsClearDialogOpen(false);
            resetTextState();
          }}
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
