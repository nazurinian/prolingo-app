import React, { memo } from 'react';
import { Server, Wand2, Hash, FileText, Trash2, CheckCircle, Loader2 } from 'lucide-react';

// --- OPTIMIZED ROW COMPONENT (TEXT MODE) - NEW COMPONENT FIX ---
export const MemoizedTextRow = memo(({ 
    item, 
    style, 
    isActive, 
    isTextActive, 
    handleManualRowClick, 
    handleDeleteTextItem, 
    localTextUrl, 
    // eslint-disable-next-line no-unused-vars
    textFilename, 
    isSystemBusy, 
    generateAIAudio, 
    aiLoadingId,
    preferLocalAudio,
    generatorEngine
}) => {
    
    // Dynamic Icon & Style
    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';

    return (
        <div 
            style={style} 
            className="absolute left-0 right-0 w-full px-2 py-1"
        >
            <div 
                id={`row-${item.id}`} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleManualRowClick(item, item.virtualIdx); 
                }} 
                className={`h-full rounded-lg px-3 py-2 transition-[background-color,border-color,box-shadow] hover:shadow-sm flex items-start gap-3 cursor-pointer overflow-hidden ${isActive ? 'bg-blue-600 border border-blue-700 dark:border-blue-500' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
            >
                <div className="flex flex-col items-center gap-1 mt-0.5 flex-shrink-0">
                    <span className={`text-xs font-mono w-6 text-center ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                    {localTextUrl && preferLocalAudio ? <Hash className="w-3 h-3 text-green-500"/> : <FileText className={`w-3 h-3 ${isActive ? 'text-blue-300' : 'text-slate-300 dark:text-slate-600'}`} />}
                </div>
                <p className={`text-sm flex-1 leading-relaxed whitespace-pre-line overflow-hidden text-ellipsis line-clamp-3 md:line-clamp-2 ${isTextActive ? 'font-bold text-white' : (isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300')}`}>{item.text}</p>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTextItem(item.virtualIdx); }} className={`p-1.5 rounded-md border transition-colors mr-1 ${isActive ? 'bg-blue-500 text-blue-200 border-blue-400 hover:bg-red-500 hover:text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200'}`}><Trash2 className="w-3.5 h-3.5"/></button>
                    {localTextUrl ? (
                         <button disabled className={`flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs font-bold border border-green-200 dark:border-green-800 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> OK</button>
                    ) : (
                        <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold transition-all ${genColorClass} ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                            {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>} Gen
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.style.top === next.style.top && 
        prev.isActive === next.isActive &&
        prev.isTextActive === next.isTextActive &&
        prev.isSystemBusy === next.isSystemBusy &&
        prev.localTextUrl === next.localTextUrl &&
        prev.aiLoadingId === next.aiLoadingId &&
        prev.preferLocalAudio === next.preferLocalAudio &&
        prev.generatorEngine === next.generatorEngine
    );
});
