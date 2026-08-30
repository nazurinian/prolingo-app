import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Brain, Database, FileKey2, HardDrive, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { formatStorageBytes, LOCAL_STORAGE_SAFETY_REFERENCE_BYTES } from '../../domain/progress/storageSafetyDomain.js';
import {
  clearCsvMetadataStorage,
  clearDatasetCacheStorage,
  clearMasteryProgressStorage,
  clearStudyActivityStorage,
  estimateBrowserOriginStorage,
  inspectProLingoStorage
} from '../../services/persistence/storageSafetyService.js';

const resolveBrowserStorage = () => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
};

const safetyClass = (key) => {
  if (key === 'critical') return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  if (key === 'high') return 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
  if (key === 'watch') return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  return 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
};

const categoryRows = (snapshot) => [
  { key: 'datasetCache', label: 'Dataset cache', icon: Database, detail: `${snapshot.deckCount} deck` },
  { key: 'mastery', label: 'Mastery', icon: Brain, detail: `${snapshot.masteryEntryCount} tracked` },
  { key: 'studyTracking', label: 'Study tracking', icon: Activity, detail: `${snapshot.studyTrackingEntryCount} vocab • ${snapshot.studyTrackingEventCount} events` },
  { key: 'csvMetadata', label: 'CSV metadata', icon: FileKey2, detail: `${snapshot.csvMetadataCount} key` },
  { key: 'preferences', label: 'Preferences', icon: HardDrive, detail: `${snapshot.categories.preferences.keyCount} key` }
];

export default function StorageManagerPanel({
  onDatasetCacheCleared,
  onMasteryReset,
  onStudyTrackingReset,
  refreshToken = ''
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [originEstimate, setOriginEstimate] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const storage = resolveBrowserStorage();
    const inspected = inspectProLingoStorage({ storage });
    setSnapshot(inspected.snapshot);
    if (typeof navigator !== 'undefined') {
      setOriginEstimate(await estimateBrowserOriginStorage({ navigatorObject: navigator }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshToken]);

  const referenceLabel = useMemo(() => formatStorageBytes(LOCAL_STORAGE_SAFETY_REFERENCE_BYTES), []);

  const requestAction = (action) => {
    setMessage('');
    setPendingAction(prev => prev === action ? null : action);
  };

  const executeAction = async (action) => {
    const storage = resolveBrowserStorage();
    let result;
    if (action === 'cache') {
      result = clearDatasetCacheStorage({ storage });
      if (result.cleared) onDatasetCacheCleared?.();
      setMessage(result.cleared ? 'Cached decks cleared. Active sheet and Mastery were preserved.' : 'Unable to clear dataset cache.');
    } else if (action === 'mastery') {
      result = clearMasteryProgressStorage({ storage });
      if (result.cleared) onMasteryReset?.();
      setMessage(result.cleared ? 'Mastery progress reset. Dataset cache was preserved.' : 'Unable to reset Mastery progress.');
    } else if (action === 'tracking') {
      result = clearStudyActivityStorage({ storage });
      if (result.cleared) onStudyTrackingReset?.();
      setMessage(result.cleared ? 'Study tracking reset. Dataset cache and Mastery were preserved.' : 'Unable to reset study tracking.');
    } else if (action === 'metadata') {
      result = clearCsvMetadataStorage({ storage });
      setMessage(result.cleared ? `${result.removedKeys.length} CSV metadata key(s) cleared.` : 'Unable to clear CSV metadata.');
    }
    setPendingAction(null);
    await refresh();
  };

  if (!snapshot) {
    return <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 text-[10px] text-slate-500">Reading browser storage…</div>;
  }

  const ratioPercent = Math.min(999, snapshot.referenceRatio * 100);
  const rows = categoryRows(snapshot);
  const originHasEstimate = originEstimate?.status === 'ok' && originEstimate.quota;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5"/> Storage Safety</p>
          <p className="text-[9px] text-slate-400 mt-0.5">LocalStorage is measured; the {referenceLabel} value is a safety reference, not a guaranteed browser quota.</p>
        </div>
        <button type="button" onClick={refresh} className="shrink-0 p-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500" title="Refresh storage usage"><RefreshCw className="w-3.5 h-3.5"/></button>
      </div>

      <div className={`rounded-md border p-2 ${safetyClass(snapshot.safety.key)}`}>
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
          <span>{snapshot.safety.label}</span>
          <span>{formatStorageBytes(snapshot.proLingoBytes)} • {ratioPercent.toFixed(ratioPercent < 10 ? 1 : 0)}% ref.</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-current opacity-60" style={{ width: `${Math.min(100, ratioPercent)}%` }}/>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {rows.map(({ key, label, icon: Icon, detail }) => (
          <div key={key} className="rounded-md border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400"><Icon className="w-3 h-3"/>{label}</div>
            <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 mt-0.5">{formatStorageBytes(snapshot.categories[key].bytes)}</div>
            <div className="text-[8px] text-slate-400">{detail}</div>
          </div>
        ))}
      </div>

      {originHasEstimate && (
        <p className="text-[8px] text-slate-400">Browser-origin estimate (all storage types): {formatStorageBytes(originEstimate.usage || 0)} / {formatStorageBytes(originEstimate.quota)}.</p>
      )}

      <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-700 pt-2">
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Granular reset</p>
        <button type="button" onClick={() => pendingAction === 'cache' ? executeAction('cache') : requestAction('cache')} className={`w-full px-2 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1 ${pendingAction === 'cache' ? 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}><Trash2 className="w-3 h-3"/>{pendingAction === 'cache' ? 'Confirm: clear cached decks' : 'Clear Dataset Cache'}</button>
        <p className="text-[8px] text-slate-400">Preserves the active sheet, Mastery, and CSV high-water metadata. Future edits may create a fresh cache again.</p>

        <button type="button" onClick={() => pendingAction === 'mastery' ? executeAction('mastery') : requestAction('mastery')} className={`w-full px-2 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1 ${pendingAction === 'mastery' ? 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}><Brain className="w-3 h-3"/>{pendingAction === 'mastery' ? 'Confirm: reset all Mastery' : 'Reset Mastery Progress'}</button>

        <button type="button" onClick={() => pendingAction === 'tracking' ? executeAction('tracking') : requestAction('tracking')} className={`w-full px-2 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1 ${pendingAction === 'tracking' ? 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}><Activity className="w-3 h-3"/>{pendingAction === 'tracking' ? 'Confirm: reset study tracking' : 'Reset Study Tracking'}</button>
        <p className="text-[8px] text-slate-400">Clears automatic study counts/timestamps only. Mastery and datasets are preserved.</p>

        <button type="button" onClick={() => pendingAction === 'metadata' ? executeAction('metadata') : requestAction('metadata')} className={`w-full px-2 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1 ${pendingAction === 'metadata' ? 'border-red-400 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}><AlertTriangle className="w-3 h-3"/>{pendingAction === 'metadata' ? 'Confirm: clear CSV metadata' : 'Advanced: Clear CSV Metadata'}</button>
        <p className="text-[8px] text-amber-600 dark:text-amber-400">Danger: this may remove historical high-water recovery metadata. Not required for a normal dataset update/re-import.</p>

        {pendingAction && <button type="button" onClick={() => setPendingAction(null)} className="w-full text-[8px] text-slate-400 underline">Cancel confirmation</button>}
        {message && <p className="rounded bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5 text-[8px] text-slate-500 dark:text-slate-400">{message}</p>}
      </div>
    </div>
  );
}
