import React, { useMemo, useRef, useState } from 'react';
import { Download, FileJson2, Merge, RefreshCcw, Upload } from 'lucide-react';
import { APP_VERSION } from '../../constants/appMetadata.js';
import { PROGRESS_RESTORE_MODES, resolveProgressBackupDiagnostics } from '../../domain/progress/progressBackupDomain.js';
import {
  createProgressBackupFile,
  persistPreparedProgressRestore,
  prepareProgressRestore,
  readProgressBackupFile,
  triggerProgressBackupDownload
} from '../../services/progress/progressBackupService.js';

const statusMessage = (status) => {
  if (status === 'invalid_json') return 'This file is not valid JSON.';
  if (status === 'invalid_format') return 'This is not a ProLingo progress backup.';
  if (status === 'unsupported_schema' || status === 'unsupported_mastery_schema' || status === 'unsupported_tracking_schema') return 'This backup uses an unsupported progress schema.';
  if (status === 'invalid_mastery_payload' || status === 'invalid_tracking_payload' || status === 'invalid_payload') return 'The progress backup payload is incomplete or invalid.';
  if (status === 'read_error') return 'The backup file could not be read.';
  return 'Unable to prepare this backup.';
};

const resolveBrowserStorage = () => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
};

export default function ProgressBackupRestorePanel({
  masteryByVocabId = {},
  activityByVocabId = {},
  currentVocabIds = [],
  onProgressRestored,
  onStorageRefresh
}) {
  const fileInputRef = useRef(null);
  const [parsedBackup, setParsedBackup] = useState(null);
  const [restoreMode, setRestoreMode] = useState(PROGRESS_RESTORE_MODES.MERGE);
  const [pendingApply, setPendingApply] = useState(false);
  const [message, setMessage] = useState('');

  const diagnostics = useMemo(() => (
    parsedBackup?.status === 'ok'
      ? resolveProgressBackupDiagnostics({ backup: parsedBackup.backup, currentVocabIds })
      : null
  ), [parsedBackup, currentVocabIds]);

  const exportBackup = () => {
    setMessage('');
    const backupFile = createProgressBackupFile({ masteryByVocabId, activityByVocabId, appVersion: APP_VERSION });
    const result = triggerProgressBackupDownload({
      documentObject: typeof document !== 'undefined' ? document : null,
      urlObject: typeof URL !== 'undefined' ? URL : null,
      content: backupFile.content,
      filename: backupFile.filename
    });
    setMessage(result.downloaded
      ? `Progress backup exported: ${backupFile.filename}`
      : 'Browser download is unavailable.');
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const parsed = await readProgressBackupFile(file);
    setParsedBackup(parsed);
    setRestoreMode(PROGRESS_RESTORE_MODES.MERGE);
    setPendingApply(false);
    setMessage(parsed.status === 'ok'
      ? `Backup loaded: ${parsed.fileName || 'progress backup'}`
      : statusMessage(parsed.status));
  };

  const applyRestore = async () => {
    if (!pendingApply) {
      setPendingApply(true);
      return;
    }

    const result = prepareProgressRestore({
      parsedBackupResult: parsedBackup,
      currentMasteryByVocabId: masteryByVocabId,
      currentActivityByVocabId: activityByVocabId,
      currentVocabIds,
      mode: restoreMode
    });

    if (result.status !== 'ok') {
      setMessage(statusMessage(result.status));
      setPendingApply(false);
      return;
    }

    const persistence = persistPreparedProgressRestore({
      storage: resolveBrowserStorage(),
      masteryByVocabId: result.masteryByVocabId,
      activityByVocabId: result.activityByVocabId
    });
    if (!persistence.saved) {
      setMessage(persistence.rolledBack
        ? 'Restore could not be saved. Previous progress was restored safely.'
        : 'Restore could not be saved to browser storage. No in-memory progress was changed.');
      setPendingApply(false);
      await onStorageRefresh?.();
      return;
    }

    onProgressRestored?.({
      masteryByVocabId: result.masteryByVocabId,
      activityByVocabId: result.activityByVocabId,
      mode: result.mode,
      diagnostics: result.diagnostics
    });
    setPendingApply(false);
    setMessage(`${result.mode === 'replace' ? 'Replace' : 'Merge'} restore applied${result.changed ? '.' : ' — no progress values changed.'}`);
    await onStorageRefresh?.();
  };

  return (
    <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
      <div>
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><FileJson2 className="w-3 h-3"/> Progress Backup / Restore</p>
        <p className="text-[8px] text-slate-400 mt-0.5">Portable JSON contains Mastery + Study Tracking only. CSV, deck cache, NO/audio high-water, API keys, and preferences are excluded.</p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={exportBackup} className="px-2 py-1.5 rounded border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1"><Download className="w-3 h-3"/>Export Progress</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1"><Upload className="w-3 h-3"/>Import Backup</button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup}/>

      {parsedBackup?.status === 'ok' && diagnostics && (
        <div className="rounded-md border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-500 dark:text-slate-400">
            <span>Mastery entries <b className="text-slate-700 dark:text-slate-200">{diagnostics.masteryEntryCount}</b></span>
            <span>Tracked vocab <b className="text-slate-700 dark:text-slate-200">{diagnostics.studyTrackingEntryCount}</b></span>
            <span>Unique IDs <b className="text-slate-700 dark:text-slate-200">{diagnostics.uniqueVocabIdCount}</b></span>
            <span>Matches current <b className="text-slate-700 dark:text-slate-200">{diagnostics.matchedCurrentDataset}</b></span>
          </div>
          {diagnostics.notInCurrentDatasetCount > 0 && (
            <p className="text-[8px] text-amber-600 dark:text-amber-400">{diagnostics.notInCurrentDatasetCount} backup ID(s) are not in the current dataset. They will be preserved for other decks, not remapped.</p>
          )}

          <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 rounded p-0.5">
            <button type="button" onClick={() => { setRestoreMode(PROGRESS_RESTORE_MODES.MERGE); setPendingApply(false); }} className={`rounded px-2 py-1 text-[9px] font-bold ${restoreMode === PROGRESS_RESTORE_MODES.MERGE ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}><Merge className="w-3 h-3 inline mr-1"/>Merge</button>
            <button type="button" onClick={() => { setRestoreMode(PROGRESS_RESTORE_MODES.REPLACE); setPendingApply(false); }} className={`rounded px-2 py-1 text-[9px] font-bold ${restoreMode === PROGRESS_RESTORE_MODES.REPLACE ? 'bg-white dark:bg-slate-600 text-red-600 dark:text-red-300 shadow-sm' : 'text-slate-500'}`}><RefreshCcw className="w-3 h-3 inline mr-1"/>Replace</button>
          </div>

          <p className={`text-[8px] ${restoreMode === PROGRESS_RESTORE_MODES.REPLACE ? 'text-red-500' : 'text-slate-400'}`}>
            {restoreMode === PROGRESS_RESTORE_MODES.MERGE
              ? 'Merge is idempotent: keeps the higher Mastery level and merges tracking with max count / earliest first / latest last timestamps.'
              : 'Replace removes current local Mastery/Study Tracking entries that are not present in this backup. Dataset data is still untouched.'}
          </p>

          <button type="button" onClick={applyRestore} className={`w-full px-2 py-1.5 rounded border text-[9px] font-bold ${pendingApply ? 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'}`}>
            {pendingApply ? `Confirm ${restoreMode === 'replace' ? 'Replace' : 'Merge'} Restore` : `Apply ${restoreMode === 'replace' ? 'Replace' : 'Merge'} Restore`}
          </button>
          {pendingApply && <button type="button" onClick={() => setPendingApply(false)} className="w-full text-[8px] text-slate-400 underline">Cancel restore confirmation</button>}
        </div>
      )}

      {message && <p className="rounded bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5 text-[8px] text-slate-500 dark:text-slate-400 break-words">{message}</p>}
    </div>
  );
}
