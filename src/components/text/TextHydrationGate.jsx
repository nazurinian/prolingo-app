import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export const TextHydrationGate = ({ status, error }) => {
  const hasError = status === 'error';
  return (
    <div className="w-full h-full min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
        {hasError
          ? <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500"/>
          : <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-indigo-500"/>}
        <p className="font-semibold text-slate-700 dark:text-slate-200">
          {hasError ? 'Text Library gagal dimuat' : 'Memuat Text Library...'}
        </p>
        <p className="text-xs mt-2 leading-relaxed">
          {hasError
            ? (error || 'IndexedDB Text Library tidak tersedia.')
            : 'Menunggu IndexedDB menjadi source of truth sebelum menampilkan data.'}
        </p>
      </div>
    </div>
  );
};
