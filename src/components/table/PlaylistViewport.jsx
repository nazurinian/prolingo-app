import React from 'react';
import { FileText, ListPlus, Send, Table } from 'lucide-react';
import { OVERSCAN } from '../../constants/datasetConstants';
import { MOBILE_BOTTOM_PLAYER_RESERVE_CSS } from '../../constants/layoutConstants';
import { getStableAudioIdentity } from '../../utils/audioUtils';
import { resolveMasteryState } from '../../domain/progress/masteryStateDomain.js';
import { MemoizedRow } from './MemoizedRow';
import { MemoizedTextRow } from './MemoizedTextRow';

export const renderPlaylistViewport = ({
  rowHeights,
  mode,
  currentPlayerList,
  tableViewMode,
  setTableViewMode,
  playlist,
  newItemTextareaRef,
  isSystemBusy,
  newTextItem,
  setNewTextItem,
  handleAddTextItem,
  renderMasterDataToolbar,
  isMobile,
  scrollTop,
  containerHeight,
  listContainerRef,
  handleScroll,
  playingIndex,
  isPlaying,
  independentPlayingId,
  playingContext,
  studyQueueSet,
  localAudioMapTable,
  toggleStudyItem,
  handleIndependentPlay,
  handleManualRowClick,
  speakingPart,
  isMemoryMode,
  memorySettings,
  revealedCells,
  toggleCellReveal,
  preferLocalAudio,
  generateAIAudio,
  aiLoadingId,
  activeMenuId,
  handleMenuToggle,
  csvChangeSummary,
  generatorEngine,
  openManualEdit,
  deleteStructuredItem,
  expandedAdvancedId,
  setExpandedAdvancedId,
  localAudioMapText,
  handleDeleteTextItem,
  masteryByVocabId,
  cycleMasteryState
}) => {
    const rowHeight = rowHeights[mode];
    const totalCount = currentPlayerList.length;
    
    // --- EMPTY STATE HANDLING (CENTERED & NO SCROLL) ---
    if (totalCount === 0) {
        let emptyContent = null;
        if (mode === 'table' && tableViewMode === 'study') {
            emptyContent = (
             <div className="text-center text-slate-400">
                 <ListPlus className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Study Queue Kosong</p>
                 <button onClick={() => setTableViewMode('master')} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                     Go to Master Data
                 </button>
             </div>
            );
        } else if (mode === 'table' && tableViewMode === 'master') {
             const hasUnderlyingData = playlist.some(item => item.isStructured);
             emptyContent = (
             <div className="text-center text-slate-400">
                 <Table className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">{hasUnderlyingData ? 'Tidak ada hasil yang cocok' : 'Belum ada data'}</p>
                 <p className="text-xs mt-2 opacity-70">{hasUnderlyingData ? 'Ubah search/filter untuk menampilkan data.' : 'Import CSV atau gunakan Add Manual.'}</p>
             </div>
            );
        } else if (mode === 'text') {
             emptyContent = (
             <div className="text-center text-slate-400">
                 <FileText className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Text Editor Kosong</p>
                 <p className="text-xs mt-2 opacity-70">Ketik teks di atas atau paste di kolom input kiri</p>
             </div>
            );
        }

        return (
            <div className="w-full h-full flex flex-col items-center p-4 min-h-[50vh]">
                 {/* Text Mode Input - Keep visible at top */}
                 {mode === 'text' && (
                     <div className="w-full mb-8 z-10">
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                             <textarea
                                 ref={newItemTextareaRef}
                                 disabled={isSystemBusy}
                                 className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                                 placeholder="Ketik atau paste teks baru..."
                                 value={newTextItem}
                                 onChange={(e) => setNewTextItem(e.target.value)}
                                 onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                                 rows={1}
                             />
                             <button 
                                 disabled={isSystemBusy || !newTextItem.trim()}
                                 onClick={handleAddTextItem} 
                                 className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                             >
                                 <Send className="w-4 h-4"/> Add
                             </button>
                        </div>
                     </div>
                 )}
                 
                 {mode === 'table' && tableViewMode === 'master' && (
                     <div className="w-full mb-6 z-10">{renderMasterDataToolbar()}</div>
                 )}

                 <div className="flex-1 flex items-center justify-center w-full">
                    {emptyContent}
                 </div>
            </div>
        );
    }

    const totalHeight = totalCount * rowHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const endIndex = Math.min(
        totalCount - 1,
        Math.floor((scrollTop + containerHeight) / rowHeight) + OVERSCAN
    );

    const virtualItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
        virtualItems.push({
            ...currentPlayerList[i],
            virtualIdx: i, 
            offsetTop: i * rowHeight
        });
    }

    return (
      <div 
         ref={listContainerRef} 
         onScroll={handleScroll} 
         className={`${isMobile ? 'overflow-visible' : 'h-full overflow-y-auto pb-0 custom-scrollbar'} relative w-full touch-pan-y`}
         style={isMobile ? { paddingBottom: MOBILE_BOTTOM_PLAYER_RESERVE_CSS } : undefined}
      >
        {mode === 'text' && (
             <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                     <textarea
                         ref={newItemTextareaRef}
                         disabled={isSystemBusy}
                         className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                         placeholder="Ketik atau paste teks baru..."
                         value={newTextItem}
                         onChange={(e) => setNewTextItem(e.target.value)}
                         onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                         rows={1}
                     />
                     <button 
                         disabled={isSystemBusy || !newTextItem.trim()}
                         onClick={handleAddTextItem} 
                         className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                     >
                         <Send className="w-4 h-4"/> Add
                     </button>
                 </div>
             </div>
        )}

        {mode === 'table' && tableViewMode === 'master' && (
             <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 {renderMasterDataToolbar()}
             </div>
        )}

        
        {/* Virtual list owns only real row height; mobile no longer adds artificial page spacer. */}
        <div style={{ height: totalHeight, position: 'relative' }} className="w-full">
            {virtualItems.map((item) => {
               if (mode === 'table' && item.isStructured) {
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === tableViewMode);
                   const rowId = `row-${item.id}`; 
                   const isInQueue = studyQueueSet.has(item.id);
                   const audioIdentity = getStableAudioIdentity(item);
                   const localWordUrl = localAudioMapTable[`${audioIdentity}_word`] || null;
                   const localWordIdnUrl = localAudioMapTable[`${audioIdentity}_word_idn`] || null;
                   const localSentUrl = localAudioMapTable[`${audioIdentity}_sentence`] || null;
                   const localMeaningUrl = localAudioMapTable[`${audioIdentity}_meaning`] || null;
                   const loadedAudioParts = [
                       'word', 'word_idn', 'sentence', 'meaning',
                       'exp1_en', 'exp1_idn', 'exp2_en', 'exp2_idn', 'exp3_en', 'exp3_idn',
                       'exp4_en', 'exp4_idn', 'exp5_en', 'exp5_idn'
                   ].filter(part => Boolean(localAudioMapTable[`${audioIdentity}_${part}`])).join('|');
                   const masteryVocabId = String(item.vocabId || '').trim();
                   const masteryTrackable = Boolean(masteryVocabId);
                   const masteryState = resolveMasteryState(masteryByVocabId, masteryVocabId);

                   return (
                       <MemoizedRow 
                           key={`${mode}-${tableViewMode}-${item.id}`} 
                           item={item}
                           isActive={isActive}
                           isSystemBusy={isSystemBusy}
                           toggleStudyItem={toggleStudyItem}
                           isInQueue={isInQueue}
                           handleIndependentPlay={handleIndependentPlay}
                           handleRowClick={handleManualRowClick} 
                           independentPlayingId={independentPlayingId}
                           speakingPart={speakingPart}
                           isMemoryMode={isMemoryMode}
                           memorySettings={memorySettings}
                           revealedCells={revealedCells}
                           toggleCellReveal={toggleCellReveal}
                           localWordUrl={localWordUrl}
                           localWordIdnUrl={localWordIdnUrl}
                           localSentUrl={localSentUrl}
                           localMeaningUrl={localMeaningUrl}
                           loadedAudioParts={loadedAudioParts}
                           preferLocalAudio={preferLocalAudio}
                           generateAIAudio={generateAIAudio}
                           aiLoadingId={aiLoadingId}
                           rowId={rowId}
                           idx={item.virtualIdx}
                           style={{ 
                               height: rowHeight, 
                               top: item.offsetTop 
                           }}
                           activeMenuId={activeMenuId}
                           onMenuToggle={handleMenuToggle}
                           changeType={csvChangeSummary.byId[item.id] || null}
                           generatorEngine={generatorEngine}
                           onEditItem={openManualEdit}
                           onDeleteItem={deleteStructuredItem}
                           advancedExpanded={expandedAdvancedId === item.id}
                           onToggleAdvanced={() => setExpandedAdvancedId(prev => prev === item.id ? null : item.id)}
                           masteryState={masteryState}
                           masteryTrackable={masteryTrackable}
                           onCycleMastery={() => cycleMasteryState(masteryVocabId)}
                       />
                   );
               } 
               else {
                   const textIdentity = getStableAudioIdentity(item);
                   const localTextUrl = localAudioMapText[textIdentity];
                   const textFilename = `${textIdentity}_text.wav`;
                   
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === 'text');
                   const isTextActive = isActive && speakingPart === 'full';

                   return (
                      <MemoizedTextRow
                        key={item.id}
                        item={item}
                        style={{ height: rowHeight, top: item.offsetTop }} 
                        isActive={isActive}
                        isTextActive={isTextActive}
                        handleManualRowClick={handleManualRowClick}
                        handleDeleteTextItem={handleDeleteTextItem}
                        localTextUrl={localTextUrl}
                        textFilename={textFilename}
                        isSystemBusy={isSystemBusy}
                        generateAIAudio={generateAIAudio}
                        aiLoadingId={aiLoadingId}
                        preferLocalAudio={preferLocalAudio}
                        generatorEngine={generatorEngine}
                      />
                   );
               }
             })}
        </div>
      </div>
    );
};
