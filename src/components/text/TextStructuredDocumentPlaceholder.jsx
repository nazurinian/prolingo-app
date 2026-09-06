import React from 'react';
import { FileText, Layers } from 'lucide-react';

export const TextStructuredDocumentPlaceholder = ({ documentTree }) => {
  const blocks = documentTree?.blocks || [];
  const segments = blocks.reduce((sum, block) => sum + (block.segments?.length || 0), 0);
  return (
    <div className="h-full min-h-[280px] flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-800 shadow-sm p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><FileText className="w-6 h-6"/></div>
        <h2 className="mt-3 text-lg font-black text-slate-800 dark:text-white">{documentTree?.title || 'Structured Text Document'}</h2>
        <p className="mt-1 text-[10px] font-mono text-slate-400">{documentTree?.id || ''}</p>
        <div className="mt-3 flex justify-center gap-2 flex-wrap">
          <span className="px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold uppercase">{documentTree?.documentType || 'mixed'}</span>
          <span className="px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">STRUCTURED V1</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><Layers className="w-4 h-4 mx-auto text-slate-400"/><p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{blocks.length}</p><p className="text-[9px] text-slate-400">Cards / Blocks</p></div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><FileText className="w-4 h-4 mx-auto text-slate-400"/><p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{segments}</p><p className="text-[9px] text-slate-400">Playable Segments</p></div>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Document ini sudah memakai database terstruktur. Card/Segment sekarang diedit melalui Text Data tab. Player structured masih ditahan sebagai placeholder sampai playback berbasis SEGMENT_ID dibangun pada patch berikutnya.</p>
      </div>
    </div>
  );
};
