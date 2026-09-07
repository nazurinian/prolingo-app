import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export const TextHydrationGate = ({ status, error }) => {
  const hasError = status === 'error';
  return (
    <div className="flex-1 flex items-center justify-center p-6" role={hasError ? 'alert' : 'status'} aria-live="polite" aria-busy={!hasError}>
      <div className={`w-full max-w-sm rounded-2xl border p-6 text-center shadow-sm ${hasError ? 'border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/20' : 'border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800'}`}>
        {hasError
          ? <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-500"/>
          : <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-indigo-500"/>}
        <h2 className={`text-sm font-black ${hasError ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>
          {hasError ? 'Text Library tidak dapat dibuka' : 'Memuat Text Library...'}
        </h2>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 break-words">
          {hasError
            ? (error || 'Penyimpanan Text lokal tidak tersedia. Coba reload aplikasi atau periksa izin penyimpanan browser.')
            : 'Memuat Document, Card, Segment, dan metadata audio lokal.'}
        </p>
      </div>
    </div>
  );
};

export default TextHydrationGate;
