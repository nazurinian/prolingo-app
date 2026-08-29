import React from 'react';
import { X, ChevronDown, Save } from 'lucide-react';

export const ManualEditorModal = ({
  isManualEditorOpen,
  closeManualEditor,
  manualEditingId,
  importedRowCount,
  sequenceHighWater,
  manualForm,
  setManualForm,
  manualAdvancedOpen,
  setManualAdvancedOpen,
  saveManualVocabulary
}) => {
  if (!isManualEditorOpen) return null;

  return (
        <div className="fixed inset-0 bg-black/55 z-[120] flex items-center justify-center p-3 md:p-6 backdrop-blur-sm" onClick={closeManualEditor}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">{manualEditingId ? 'Edit Vocabulary' : 'Add Manual Vocabulary'}</h3>
                <p className="text-[10px] text-slate-400">v5.11.6 • UI Shell + Learning Engine • Imported baseline: {importedRowCount} • Max audio NO: #{sequenceHighWater} • Next: #{sequenceHighWater + 1}</p>
              </div>
              <button onClick={closeManualEditor} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4"/></button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">VOCAB_ID
                  <input value={manualForm.vocabId} readOnly disabled className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-100 font-mono"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">NO / AUDIO SLOT
                  <input type="number" min="1" value={manualForm.no} readOnly disabled className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 font-mono disabled:opacity-100"/>
                  <span className="block mt-1 normal-case font-normal text-[9px] text-slate-400">Auto • nomor yang pernah dipakai tidak digunakan ulang</span>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase md:col-span-2">WORDS *
                  <input autoFocus value={manualForm.word} onChange={e => setManualForm(p => ({...p, word: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-indigo-200 dark:border-indigo-800 dark:bg-slate-700 dark:text-white"/>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Part of Speech
                  <input value={manualForm.partOfSpeech} onChange={e => setManualForm(p => ({...p, partOfSpeech: e.target.value}))} placeholder="noun / verb / adjective..." className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Meaning
                  <input value={manualForm.meaningWord} onChange={e => setManualForm(p => ({...p, meaningWord: e.target.value}))} placeholder="Arti kata" className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Info
                  <input value={manualForm.info} onChange={e => setManualForm(p => ({...p, info: e.target.value}))} placeholder="Register/context (optional)" className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">EN / Sentence
                  <textarea rows="3" value={manualForm.sentence} onChange={e => setManualForm(p => ({...p, sentence: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">IDN / Translation
                  <textarea rows="3" value={manualForm.meaning} onChange={e => setManualForm(p => ({...p, meaning: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                </label>
              </div>

              <button onClick={() => setManualAdvancedOpen(v => !v)} className="w-full flex items-center justify-between p-2 rounded border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>Advanced Expressions EXP1–EXP5</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${manualAdvancedOpen ? 'rotate-180' : ''}`}/>
              </button>

              {manualAdvancedOpen && (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">EXP{n} EN
                        <textarea rows="2" value={manualForm[`exp${n}En`]} onChange={e => setManualForm(p => ({...p, [`exp${n}En`]: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                      </label>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">EXP{n} IDN
                        <textarea rows="2" value={manualForm[`exp${n}Idn`]} onChange={e => setManualForm(p => ({...p, [`exp${n}Idn`]: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
              <button onClick={closeManualEditor} className="px-4 py-2 rounded border border-slate-200 dark:border-slate-600 text-sm dark:text-slate-300">Cancel</button>
              <button onClick={saveManualVocabulary} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-2"><Save className="w-4 h-4"/>{manualEditingId ? 'Save Changes' : 'Add Vocabulary'}</button>
            </div>
          </div>
        </div>
  );
};

export default ManualEditorModal;
