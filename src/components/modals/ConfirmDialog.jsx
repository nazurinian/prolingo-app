import React from 'react';
import { Trash2 } from 'lucide-react';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';

export const RevertAllConfirmModal = ({ isRevertAllConfirmOpen, setIsRevertAllConfirmOpen, revertAllChanges }) => {
  if (!isRevertAllConfirmOpen) return null;
  return (
        <div className="fixed inset-0 bg-black/50 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-5 border animate-in fade-in zoom-in-95 duration-200 border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-slate-800 dark:text-white text-center">Revert all unsaved CSV changes?</h3>
            <p className="text-xs text-slate-400 text-center mt-2">This restores the last saved/imported CSV snapshot. You can still use Undo immediately afterwards.</p>
            <div className="flex gap-2 mt-5"><button onClick={() => setIsRevertAllConfirmOpen(false)} className="flex-1 py-2 rounded border border-slate-200 dark:border-slate-600 text-sm dark:text-slate-300">Cancel</button><button onClick={revertAllChanges} className="flex-1 py-2 rounded bg-red-600 text-white text-sm font-bold">Revert All</button></div>
          </div>
        </div>
  );
};

export const ClearViewModal = ({ onCancel, onConfirm }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Bersihkan Tampilan?</h3>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded bg-indigo-600 text-white">Ya</button>
        </div>
      </div>
    </div>
);

export const DeleteVocabularyModal = ({ pendingDeleteItem, setPendingDeleteItem, confirmDeleteStructuredItem }) => {
  if (!pendingDeleteItem) return null;
  return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center"><Trash2 className="w-5 h-5"/></div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center">Delete Vocabulary?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">#{pendingDeleteItem.displayId} • {pendingDeleteItem.vocabId || pendingDeleteItem.id}<br/><span className="font-semibold">{capitalizeDisplayText(pendingDeleteItem.word)}</span></p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center mt-3">Audio slot #{pendingDeleteItem.displayId} will not be reused. Existing disk audio becomes orphan until removed manually.</p>
            <div className="flex gap-3 w-full mt-5">
                <button onClick={() => setPendingDeleteItem(null)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Cancel</button>
                <button onClick={confirmDeleteStructuredItem} className="flex-1 py-2 rounded bg-red-500 hover:bg-red-600 text-white font-bold">Delete</button>
            </div>
          </div>
        </div>
  );
};

export const DeleteDeckModal = ({ onCancel, onConfirm }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Hapus Deck?</h3>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded bg-red-500 text-white">Hapus</button>
        </div>
      </div>
    </div>
);
