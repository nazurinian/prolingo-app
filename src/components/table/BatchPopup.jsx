import React from 'react';
import { X, CheckSquare, Square, XCircle, Loader2 } from 'lucide-react';

export const BatchPopup = ({
  batchPanelRef,
  mode,
  setIsBatchOpen,
  isBatchDownloading,
  batchConfig,
  setBatchConfig,
  generatorEngine,
  advancedDatasetStats,
  handleBatchRangeBlur,
  runBatchDownload,
  isBatchStopping,
  batchStatusText,
  DownloadCloudIcon
}) => (
     <div 
        ref={batchPanelRef} 
        className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
     >
        <div className="bg-slate-800 text-white p-2 text-xs font-bold flex justify-between">
            <span>Batch Download ({mode})</span>
            <button onClick={() => setIsBatchOpen(false)}><X className="w-3 h-3"/></button>
        </div>
        <div className="p-3 space-y-3">
             {mode === 'table' ? (
                 <div className="flex flex-col gap-2 text-xs">
                     <div className="flex gap-2">
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`${batchConfig.doWord ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Words</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doWordTranslation: !p.doWordTranslation}))} className={`${batchConfig.doWordTranslation ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doWordTranslation ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className={`dark:text-slate-300 ${generatorEngine !== 'edge' ? 'line-through opacity-50' : ''}`}>Word IDN</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`${batchConfig.doSentence ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Sentences</span>
                         </div>
                     </div>
                     {/* Meaning Checkbox (Edge Only) */}
                     <div className="flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-2">
                          <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doMeaning: !p.doMeaning}))} className={`${batchConfig.doMeaning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                             {batchConfig.doMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                         </button>
                         <span className={`dark:text-slate-300 ${generatorEngine !== 'edge' ? 'line-through opacity-50' : ''}`}>Meaning (Indonesian)</span>
                     </div>
                     {advancedDatasetStats.hasAdvanced && <div className="border-t border-violet-100 dark:border-violet-900 pt-2 space-y-1.5">
                         <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doExpressions: !p.doExpressions}))} className={`flex items-center gap-1 ${batchConfig.doExpressions ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>{batchConfig.doExpressions ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}<span>EXP1–EXP5 EN</span></button>
                         <button disabled={isBatchDownloading || generatorEngine !== 'edge' || !batchConfig.doExpressions} onClick={() => setBatchConfig(p=>({...p, doExpressionTranslations: !p.doExpressionTranslations}))} className={`flex items-center gap-1 ${batchConfig.doExpressionTranslations ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge' || !batchConfig.doExpressions) ? 'opacity-40' : ''}`}>{batchConfig.doExpressionTranslations ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}<span>EXP IDN (Edge)</span></button>
                     </div>}
                 </div>
             ) : (
                 <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
             )}
             
             <div className="flex gap-2 items-center text-xs">
                 <span className="text-slate-500">Range:</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.start} 
                    onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))}
                    onBlur={() => handleBatchRangeBlur('start')} 
                    disabled={isBatchDownloading}
                 />
                 <span className="dark:text-slate-400">-</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.end} 
                    onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))} 
                    onBlur={() => handleBatchRangeBlur('end')} 
                    disabled={isBatchDownloading}
                 />
             </div>
             
             <button 
                onClick={runBatchDownload} 
                className={`w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-2 text-white transition-all
                   ${isBatchStopping ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : ''}
                   ${isBatchDownloading && !isBatchStopping ? 'bg-red-500 hover:bg-red-600' : ''}
                   ${!isBatchDownloading && !isBatchStopping ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                `}
             >
                 {isBatchDownloading ? (
                     <>
                        {isBatchStopping ? <XCircle className="w-3 h-3"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
                        {isBatchStopping ? "Stopping..." : (batchStatusText || "STOP BATCH")}
                     </>
                 ) : (
                     <>
                        <DownloadCloudIcon className="w-3 h-3"/>
                        START BATCH
                     </>
                 )}
             </button>
             <div className="text-[10px] text-center italic text-slate-400 mt-1">Using: {generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini AI'}</div>
        </div>
     </div>

);

export default BatchPopup;
