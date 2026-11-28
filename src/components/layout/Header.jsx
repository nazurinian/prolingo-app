import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { APP_CHECKPOINT_ID, APP_CHECKPOINT_LABEL, APP_VERSION_LABEL } from '../../constants/appMetadata';
import { getTextWorkspaceBadge } from '../../domain/text/textWorkspaceTaxonomyDomain';
import {
  PanelLeftClose, PanelLeftOpen, Mic, Database, Trash2, Save, FileDown,
  Settings, FileText, Table2, ChevronDown, ChevronUp, ListPlus,
  MoreVertical, Sun, Moon, Monitor, Home, SlidersHorizontal, X, RefreshCcw
} from 'lucide-react';
import {
  OVERLAY_SOURCES,
  announcePresentationOverlayOpen,
  subscribeOtherPresentationOverlayOpen
} from '../text/presentation/sharedOverlayCoordinator';
import { usePresentationOverlayFocus } from '../text/presentation/usePresentationOverlayFocus';
import { SHARED_CONTROL_TOKENS } from '../text/presentation/sharedDesignTokens';

/**
 * Presentation-only AppBar for Desktop & Mobile (refined in UAT-4 Packet I / 4G-E1).
 * State, handlers, and workspace logic remain owned by App.jsx.
 */
const Header = ({
  isMobile,
  showAppBar,
  isSidebarOpen,
  setIsSidebarOpen,
  goHome,
  isSystemBusy,
  savedDecks,
  selectedDeckId,
  handleLoadDeck,
  handleDeleteDeckInit,
  currentDeckName,
  setCurrentDeckName,
  handleSaveDeck,
  mode,
  bookQaMode = false,
  bookQaDatabaseName = '',
  bookQaRefreshing = false,
  bookQaPending = false,
  onBookQaRefresh = null,
  onOpenBookQaData = null,
  isCsvDirty,
  csvChangeSummary,
  saveUpdatedCSV,
  folderInputRef,
  audioZipInputRef,
  csvInputRef,
  handleCSVUpload,
  sourceInputRef,
  fullPackInputRef,
  handleFolderSelect,
  handleAudioZipSelect,
  handleSourceUpload,
  handleFullPackUpload,
  mobileTab,
  handleMobileTabSwitch,
  handleModeSwitch,
  renderWorkspaceTabs,
  textLibraryCatalog,
  activeTextDocument,
  activeTextDocumentId,
  textLibraryCommandBusy,
  handleTextLibrarySelectDocument,
  tableViewMode,
  rangeInput,
  setRangeInput,
  handleRangeAdd,
  theme,
  setTheme,
  setSidebarSection
}) => {
  const [mobileStudyQueueExpanded, setMobileStudyQueueExpanded] = useState(false);
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false);
  const overflowTriggerRef = useRef(null);
  const overflowPanelRef = useRef(null);
  const studyQueueDrawerOpen = Boolean(
    isMobile && mode === 'table' && tableViewMode === 'study' && mobileTab === 'player' && mobileStudyQueueExpanded
  );
  const overflowMenuOpen = Boolean(isMobile && mobileOverflowOpen);

  useEffect(() => (
    subscribeOtherPresentationOverlayOpen(OVERLAY_SOURCES.APPBAR_OVERFLOW, () => {
      setMobileOverflowOpen(false);
    })
  ), []);

  useEffect(() => { if (!isMobile) setMobileOverflowOpen(false); }, [isMobile]);
  usePresentationOverlayFocus({
    open: overflowMenuOpen, panelRef: overflowPanelRef,
    onClose: () => setMobileOverflowOpen(false), returnFocus: () => overflowTriggerRef.current
  });

  const toggleMobileOverflow = () => {
    if (!overflowMenuOpen) announcePresentationOverlayOpen(OVERLAY_SOURCES.APPBAR_OVERFLOW);
    setMobileOverflowOpen(!overflowMenuOpen);
  };

  const openMobileToolsSection = section => {
    setMobileOverflowOpen(false);
    setSidebarSection?.(section);
    if (mobileTab !== 'tools') {
      handleMobileTabSwitch?.('tools');
    }
  };

  return (
    <div
      data-app-header="true"
      className={`z-50 transition-transform duration-300 ${
        isMobile
          ? 'fixed top-0 left-0 right-0 w-full border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xs'
          : 'sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-md'
      } ${isMobile && !showAppBar ? '-translate-y-full' : 'translate-y-0'}`}
    >

      {/* 1. HEADER UTAMA (Compact 48px on Mobile, 64px on Desktop) */}
      <div className={`flex justify-between items-center min-w-0 ${isMobile ? 'h-12 px-2.5 gap-2' : 'h-16 p-3 gap-4 border-none shadow-none'}`}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 md:flex-none">
          {!isMobile && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className={`p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 ${SHARED_CONTROL_TOKENS.focusRing}`}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0" title="ProLingo">
            <div className={`bg-indigo-600 text-white flex-shrink-0 inline-flex items-center justify-center ${isMobile ? 'h-7 w-7 rounded-lg shadow-xs' : 'p-2 rounded-lg'}`}>
              <Mic aria-hidden="true" className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>
            <div className="min-w-0">
              <h1 className={`font-bold text-slate-900 dark:text-white leading-tight truncate ${isMobile ? 'text-sm tracking-tight' : ''}`}>
                ProLingo <span className="hidden md:inline text-indigo-500">{APP_VERSION_LABEL}</span>
              </h1>
              <p className="hidden md:block text-[8px] leading-tight font-bold text-slate-400 dark:text-slate-500 truncate max-w-40" title={APP_CHECKPOINT_LABEL}>
                Checkpoint: {APP_CHECKPOINT_ID}
              </p>
            </div>
          </div>
        </div>

        {bookQaMode && <div data-book-qa-indicator="true" className="flex min-w-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-[8px] font-black uppercase text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="shrink-0">BOOK QA · ISOLATED v2</span>
          <span className="hidden lg:inline max-w-36 truncate font-mono font-normal normal-case" title={bookQaDatabaseName}>{bookQaDatabaseName}</span>
          <button type="button" aria-label="Refresh isolated Book QA library" title="Reload persisted Book QA snapshot" disabled={bookQaRefreshing || bookQaPending} onClick={() => { void onBookQaRefresh?.().catch(() => {}); }} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-amber-300 bg-white text-amber-800 disabled:opacity-40 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"><RefreshCcw className={`h-3 w-3 ${bookQaRefreshing ? 'animate-spin' : ''}`}/></button>
          {onOpenBookQaData && <button type="button" onClick={onOpenBookQaData}
            className="min-h-9 shrink-0 rounded border border-amber-300 bg-white px-2 text-[11px] font-semibold normal-case dark:border-amber-800 dark:bg-slate-900">Book Data</button>}
        </div>}

        {/* Desktop Header Tools (preserved intact) */}
        <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
          {mode === 'text' ? (
            <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/30 p-1 rounded-lg border border-indigo-200 dark:border-indigo-900 min-w-0 max-w-xl">
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300 ml-1 flex-shrink-0" />
              <select disabled={!activeTextDocumentId} aria-busy={textLibraryCommandBusy || undefined} value={activeTextDocumentId || ''} onChange={event => { if (!textLibraryCommandBusy) handleTextLibrarySelectDocument?.(event.target.value); }} className="bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none min-w-0 max-w-64 cursor-pointer disabled:opacity-100 dark:bg-slate-800">
                {(textLibraryCatalog?.rootDocuments || []).length > 0 && <optgroup label="Library Root">{textLibraryCatalog.rootDocuments.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</optgroup>}
                {(textLibraryCatalog?.collections || []).map(collection => <optgroup key={collection.id} label={collection.title}>{(collection.documents || []).map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</optgroup>)}
              </select>
              {activeTextDocument && <span className="hidden lg:inline-flex text-[9px] font-black px-2 py-1 rounded bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 whitespace-nowrap">{getTextWorkspaceBadge(activeTextDocument)}</span>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600 flex-shrink min-w-0 max-w-full overflow-hidden">
                <Database className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1 flex-shrink-0" />
                <div className="flex items-center flex-shrink min-w-0">
                  <select disabled={isSystemBusy} className={`bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none w-16 lg:w-28 cursor-pointer flex-shrink min-w-0 dark:bg-slate-700 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}>
                    <option value="" disabled>Load Saved...</option>
                    {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  {selectedDeckId && <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded transition flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Hapus Deck Ini"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
                <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-500 mx-1 flex-shrink-0"></div>
                <input disabled={isSystemBusy} className="bg-transparent text-sm w-16 lg:w-24 outline-none disabled:opacity-50 flex-shrink min-w-0 dark:text-white" placeholder="Sheet Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-1 hover:bg-white dark:hover:bg-slate-600 text-green-600 dark:text-green-400 rounded flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Save Draft to Cache"><Save className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`hidden lg:inline-flex px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap ${isCsvDirty ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>{isCsvDirty ? `CSV +${csvChangeSummary.added} ~${csvChangeSummary.modified} -${csvChangeSummary.deleted}` : 'CSV SAVED'}</span>
                <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`p-1.5 rounded border flex-shrink-0 ${isCsvDirty ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/20' : 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-60' : ''}`} title="Save Updated CSV"><FileDown className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>

        {/* v5.11.6: technical controls moved to SYSTEM. Keep file pickers mounted for all layouts. */}
        {!bookQaMode && <div className="hidden">
          <input type="file" ref={folderInputRef} webkitdirectory="" directory="" multiple onChange={handleFolderSelect} />
          <input type="file" ref={audioZipInputRef} accept=".zip,application/zip,application/x-zip-compressed" multiple onChange={handleAudioZipSelect} />
          <input type="file" ref={sourceInputRef} accept=".csv,.tsv,.txt" onChange={handleSourceUpload} />
          <input type="file" ref={fullPackInputRef} accept=".csv,.tsv,.txt" multiple onChange={handleFullPackUpload} />
        </div>}
        {/* Keep this single CSV picker mounted, including on mobile where SidebarShell returns null. */}
        {!bookQaMode && <input type="file" data-csv-import-input="true" className="sr-only" tabIndex={-1} ref={csvInputRef} accept=".csv,.tsv,.txt" onChange={handleCSVUpload} />}

        {/* Mobile Compact Application Navigation (E1) */}
        <div className="md:hidden ml-auto flex items-center gap-1 flex-shrink-0" data-mobile-appbar-actions="true">
          <button
            type="button"
            disabled={isSystemBusy || bookQaMode}
            onClick={() => {
              setMobileOverflowOpen(false);
              const targetMode = mode === 'table' ? 'text' : 'table';
              handleModeSwitch?.(targetMode);
              if (mobileTab !== 'player') handleMobileTabSwitch?.('player');
            }}
            className={`h-9 px-2.5 rounded-lg border border-slate-200/90 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing}`}
            title={bookQaMode ? 'Table mode is unavailable in isolated Book QA' : `Switch to ${mode === 'table' ? 'Text' : 'Table'}`}
            aria-label={`Switch to ${mode === 'table' ? 'Text' : 'Table'} mode`}
            data-mobile-mode-switch="true"
          >
            {mode === 'table' ? <FileText aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" /> : <Table2 aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />}
            <span>{mode === 'table' ? 'Text' : 'Table'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileOverflowOpen(false);
              const nextTab = mobileTab === 'tools' ? 'player' : 'tools';
              handleMobileTabSwitch?.(nextTab);
            }}
            className={`h-9 w-9 rounded-lg border inline-flex items-center justify-center transition-colors motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
              mobileTab === 'tools'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'bg-slate-50/90 dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-200'
            }`}
            title={mobileTab === 'tools' ? 'Close Controls' : 'Open Controls'}
            aria-label={mobileTab === 'tools' ? 'Close Controls' : 'Open Controls'}
            aria-pressed={mobileTab === 'tools'}
            data-mobile-controls-toggle="true"
          >
            {mobileTab === 'tools' ? <X aria-hidden="true" className="w-4 h-4" /> : <Settings aria-hidden="true" className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              ref={overflowTriggerRef}
              type="button"
              onClick={toggleMobileOverflow}
              aria-label="More app options"
              aria-expanded={overflowMenuOpen}
              aria-haspopup="menu"
              data-mobile-appbar-overflow="true"
              className={`h-9 w-9 rounded-lg border inline-flex items-center justify-center transition-colors motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing} ${
                overflowMenuOpen
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200'
                  : 'border-slate-200/90 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <MoreVertical aria-hidden="true" className="w-4 h-4" />
            </button>

            {overflowMenuOpen && createPortal(
              <>
                <button
                  type="button"
                  aria-label="Close app menu"
                  tabIndex={-1}
                  onClick={() => setMobileOverflowOpen(false)}
                  className="fixed inset-0 z-[70] bg-slate-950/20"
                />
                <div
                  ref={overflowPanelRef}
                  tabIndex={-1}
                  role="menu"
                  aria-label="Application options"
                  data-mobile-appbar-overflow-menu="true"
                  className="fixed right-2.5 top-[50px] z-[75] w-56 max-h-[calc(100dvh-58px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/95 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl space-y-2 text-left"
                >
                  {typeof setTheme === 'function' && (
                    <div className="space-y-1 px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Theme
                      </span>
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 p-0.5">
                        {[
                          { id: 'light', label: 'Light', icon: Sun },
                          { id: 'system', label: 'Auto', icon: Monitor },
                          { id: 'dark', label: 'Dark', icon: Moon }
                        ].map(item => {
                          const active = theme === item.id;
                          const ThemeIcon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={active}
                              onClick={() => setTheme(item.id)}
                              className={`min-h-8 rounded-md px-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                                active
                                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <ThemeIcon aria-hidden="true" className="w-3 h-3 shrink-0" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {typeof setSidebarSection === 'function' && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-0.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openMobileToolsSection(mode === 'text' ? 'audio' : 'player')}
                        className={`w-full min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 ${SHARED_CONTROL_TOKENS.focusRing}`}
                      >
                        <SlidersHorizontal aria-hidden="true" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
                        <span>{mode === 'text' ? 'Audio & Voices' : 'Player Controls'}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openMobileToolsSection('system')}
                        className={`w-full min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 ${SHARED_CONTROL_TOKENS.focusRing}`}
                      >
                        <Settings aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span>System &amp; Diagnostics</span>
                      </button>
                    </div>
                  )}

                  {typeof goHome === 'function' && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileOverflowOpen(false);
                          goHome();
                        }}
                        className={`w-full min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 ${SHARED_CONTROL_TOKENS.focusRing}`}
                      >
                        <Home aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span>Home</span>
                      </button>
                    </div>
                  )}
                </div>
              </>, document.body
            )}
          </div>
        </div>
      </div>

      {/* 2. TABLE WORKSPACE TABS (Mobile). Utility navigation lives behind Controls. */}
      {isMobile && mode === 'table' && mobileTab === 'player' && (
        <>
          {renderWorkspaceTabs(true)}
          {tableViewMode === 'study' && (
            <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 pb-2" data-mobile-study-anchor="true">
              <button type="button" onClick={() => setMobileStudyQueueExpanded(value => !value)} className="w-full min-h-10 rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 px-3 flex items-center gap-2 text-indigo-700 dark:text-indigo-300" aria-expanded={studyQueueDrawerOpen}>
                <ListPlus className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-wide flex-1 text-left">Study • Add Queue</span>
                {studyQueueDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {studyQueueDrawerOpen && (
                <div className="mt-2 flex items-center gap-2" data-mobile-study-add-queue="true">
                  <input disabled={isSystemBusy} value={rangeInput} onChange={event => setRangeInput?.(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') handleRangeAdd?.(); }} placeholder="e.g. 1-10, 15, 22-30" className="min-h-10 flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 disabled:opacity-50" />
                  <button type="button" disabled={isSystemBusy || !String(rangeInput || '').trim()} onClick={() => handleRangeAdd?.()} className="min-h-10 px-3 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-40">ADD</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Header;
