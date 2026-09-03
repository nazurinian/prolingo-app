import React from 'react';
import { APP_CHECKPOINT_ID, APP_CHECKPOINT_LABEL, APP_VERSION_LABEL } from '../../constants/appMetadata';
import {
  PanelLeftClose, PanelLeftOpen, Mic, Database, Trash2, Save, FileDown,
  Terminal, Play, Settings
} from 'lucide-react';

/**
 * Mechanical extraction from ProLingo v5.11.6 golden master.
 * Presentation only: state, effects, handlers, and workspace logic remain owned by App.jsx.
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
  isCsvDirty,
  csvChangeSummary,
  saveUpdatedCSV,
  folderInputRef,
  sourceInputRef,
  fullPackInputRef,
  handleFolderSelect,
  handleSourceUpload,
  handleFullPackUpload,
  mobileTab,
  handleMobileTabSwitch,
  renderWorkspaceTabs,
}) => {
  return (
    <div className={`z-50 bg-white dark:bg-slate-800 transition-transform duration-300 shadow-md ${isMobile ? 'fixed top-0 left-0 right-0 w-full' : 'sticky top-0 border-b border-slate-200 dark:border-slate-700'} ${isMobile && !showAppBar ? '-translate-y-full' : 'translate-y-0'}`}>
      
      {/* 1. HEADER UTAMA */}
      <div className={`p-3 flex gap-4 justify-between items-center ${!isMobile ? 'border-none shadow-none' : ''} h-16`}>
          <div className="flex items-center gap-3">
          {!isMobile && <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300">
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
          </button>}
          <div className="flex items-center gap-2 whitespace-nowrap" title="ProLingo">
              <div className="bg-indigo-600 text-white p-2 rounded-lg"><Mic className="w-5 h-5" /></div>
              <div className="min-w-0"><h1 className="font-bold text-slate-800 dark:text-white leading-tight whitespace-nowrap">ProLingo <span className="text-indigo-500">{APP_VERSION_LABEL}</span></h1><p className="text-[8px] leading-tight font-bold text-slate-400 dark:text-slate-500 truncate max-w-40" title={APP_CHECKPOINT_LABEL}>Checkpoint: {APP_CHECKPOINT_ID}</p></div>
          </div>
          </div>
          
          {/* Desktop Header Tools */}
          <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
               <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600 flex-shrink min-w-0 max-w-full overflow-hidden">
                <Database className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1 flex-shrink-0" />
                <div className="flex items-center flex-shrink min-w-0">
                  <select disabled={isSystemBusy} className={`bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none w-16 lg:w-28 cursor-pointer flex-shrink min-w-0 dark:bg-slate-700 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}>
                      <option value="" disabled>Load Saved...</option>
                      {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  {selectedDeckId && (
                      <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded transition flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Hapus Deck Ini"><Trash2 className="w-3.5 h-3.5"/></button>
                  )}
                </div>
                <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-500 mx-1 flex-shrink-0"></div>
                <input disabled={isSystemBusy} className="bg-transparent text-sm w-16 lg:w-24 outline-none disabled:opacity-50 flex-shrink min-w-0 dark:text-white" placeholder="Sheet Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-1 hover:bg-white dark:hover:bg-slate-600 text-green-600 dark:text-green-400 rounded flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Save Draft to Cache"><Save className="w-4 h-4"/></button>
              </div>
              {mode === 'table' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`hidden lg:inline-flex px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap ${isCsvDirty ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                          {isCsvDirty ? `CSV +${csvChangeSummary.added} ~${csvChangeSummary.modified} -${csvChangeSummary.deleted}` : 'CSV SAVED'}
                      </span>
                      <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`p-1.5 rounded border flex-shrink-0 ${isCsvDirty ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/20' : 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-60' : ''}`} title="Save Updated CSV"><FileDown className="w-4 h-4"/></button>
                  </div>
              )}
          </div>
    
          {/* v5.11.6: technical controls moved to SYSTEM. Keep file pickers mounted for all layouts. */}
          <div className="hidden">
              <input type="file" ref={folderInputRef} webkitdirectory="" directory="" multiple onChange={handleFolderSelect} />
              <input type="file" ref={sourceInputRef} accept=".csv,.tsv,.txt" onChange={handleSourceUpload} />
              <input type="file" ref={fullPackInputRef} accept=".csv,.tsv,.txt" multiple onChange={handleFullPackUpload} />
          </div>
    
          <div className="md:hidden ml-auto">
              {/* REMOVED DUPLICATE ERASER BUTTON AS REQUESTED */}
          </div>
      </div>
    
      {/* 2. MOBILE TAB BAR */}
      <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex text-xs font-bold text-slate-500 z-10 relative">
          <button onClick={() => handleMobileTabSwitch('terminal')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'terminal' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Terminal className="w-4 h-4"/> Logs</button>
          <button onClick={() => handleMobileTabSwitch('player')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'player' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Play className="w-4 h-4"/> Player</button>
          <button onClick={() => handleMobileTabSwitch('tools')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'tools' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Settings className="w-4 h-4"/> Controls</button>
      </div>
    
      {/* 3. TABLE WORKSPACE TABS (Mobile) */}
      {isMobile && mode === 'table' && mobileTab === 'player' && renderWorkspaceTabs(true)}
    </div>
  );
};

export default Header;
