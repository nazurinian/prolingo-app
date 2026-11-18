import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createP15ExtendedQaFixtures } from '../../../../scripts/fixtures/p15-data-management/fixture.js';
import { createTextDataManagementSession } from '../../../services/textDataManagementSession.js';
import {
  createTextDataManagementPersistenceAdapter,
  executeDisposableTextManagementTransaction,
  seedDisposableTextManagementDatabase,
  TEXT_DISPOSABLE_QA_DB_PREFIX
} from '../../../services/persistence/textDataManagementPersistenceService.js';
import TextDataManagementPage from './TextDataManagementPage.jsx';
import { DM_INPUT_CLASS, DM_SMALL_BTN } from './dataManagementUiUtils.js';

const EMPTY_ARRAY = Object.freeze([]);

const MODE_CONFIG = Object.freeze({
  'read-only': { label: 'Read-Only (Default)', boundary: 'read-only', permissions: [] },
  'disposable-full': { label: 'Isolated Disposable (Catalog + Content)', boundary: 'disposable', permissions: ['catalog', 'content'] },
  'disposable-catalog': { label: 'Isolated Disposable (Catalog Only)', boundary: 'disposable', permissions: ['catalog'] },
  'disposable-content': { label: 'Isolated Disposable (Content Only)', boundary: 'disposable', permissions: ['content'] }
});

const DISPOSABLE_DB_SLOTS = Object.freeze([
  { id: `${TEXT_DISPOSABLE_QA_DB_PREFIX}h2_primary`, label: 'Primary Disposable QA DB (h2_primary)' },
  { id: `${TEXT_DISPOSABLE_QA_DB_PREFIX}h2_secondary`, label: 'Secondary Disposable QA DB (h2_secondary)' }
]);

const ADAPTER_CEILINGS = Object.freeze({
  'match-mode': { label: 'Adapter Ceiling: Match Selected Mode' },
  'read-only': { label: 'Adapter Ceiling: Read-Only Fixed', boundary: 'read-only', permissions: [] },
  catalog: { label: 'Adapter Ceiling: Catalog-Only Fixed', boundary: 'disposable', permissions: ['catalog'] },
  content: { label: 'Adapter Ceiling: Content-Only Fixed', boundary: 'disposable', permissions: ['content'] }
});

const createQaSessionBox = () => {
  let active = null;
  let seq = 0;
  let preservedSnapshot = null;
  let preservedSelection = {};
  let snap = Object.freeze({ session: null, seq: 0 });
  const listeners = new Set();
  const emit = () => {
    listeners.forEach(listener => listener());
  };
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snap,
    getActiveSession: () => active,
    rememberContext(snapshotCandidate, selectionCandidate = {}) {
      if (snapshotCandidate && snapshotCandidate.schemaVersion) {
        preservedSnapshot = snapshotCandidate;
        preservedSelection = selectionCandidate || {};
      }
    },
    getPreservedContext: () => ({ snapshot: preservedSnapshot, selection: preservedSelection }),
    setSession(nextSession) {
      active = nextSession || null;
      seq += 1;
      snap = Object.freeze({ session: active, seq });
      emit();
    }
  };
};

/**
 * DEV-only isolated QA harness for P15 Structured Text Data Management.
 * Defaults to In-Memory Fixture mode (zero IndexedDB access); explicitly supports switching
 * to isolated Disposable IndexedDB databases via createTextDataManagementPersistenceAdapter.
 */
export default function TextDataManagementQaPreview() {
  const [fixtures] = useState(createP15ExtendedQaFixtures);
  const [qaBox] = useState(createQaSessionBox);

  const [storageMode, setStorageMode] = useState('in-memory');
  const [dbSlotKey, setDbSlotKey] = useState(DISPOSABLE_DB_SLOTS[0].id);
  const [customDbName, setCustomDbName] = useState(`${TEXT_DISPOSABLE_QA_DB_PREFIX}h2_custom`);
  const [adapterCeilingKey, setAdapterCeilingKey] = useState('match-mode');

  const [presetKey, setPresetKey] = useState('v2-complete');
  const [modeKey, setModeKey] = useState('read-only');
  const [audioMode, setAudioMode] = useState('not-evaluated');
  const [transportMode, setTransportMode] = useState('accept');
  const [hostLoading, setHostLoading] = useState(false);
  const [frameWidth, setFrameWidth] = useState('desktop');
  const [darkMode, setDarkMode] = useState(false);
  const [deferredPending, setDeferredPending] = useState(false);

  const [dbLoaded, setDbLoaded] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [dbStatusMessage, setDbStatusMessage] = useState('');
  const [sourceReloadNonce, setSourceReloadNonce] = useState(0);
  const [initInFlight, setInitInFlight] = useState(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const [overwriteAcknowledged, setOverwriteAcknowledged] = useState(false);

  const deferredResolverRef = useRef(null);
  const dbConnectSeqRef = useRef(0);
  const conflictCounterRef = useRef(0);
  const initInFlightRef = useRef(false);
  const concurrentInitBlockedRef = useRef(false);
  const accessConfigRef = useRef({
    boundary: MODE_CONFIG['read-only'].boundary,
    permissions: MODE_CONFIG['read-only'].permissions,
    audio: null
  });
  const transportModeRef = useRef(transportMode);
  useEffect(() => {
    transportModeRef.current = transportMode;
  }, [transportMode]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const preset = fixtures.presets[presetKey] || fixtures.presets['v2-complete'];
  const modeCfg = MODE_CONFIG[modeKey] || MODE_CONFIG['read-only'];
  const isDisposableIdb = storageMode === 'disposable-idb';
  const activeDbName = dbSlotKey === '__custom__' ? customDbName.trim() : dbSlotKey;

  const adapterGrant = useMemo(() => {
    const ceiling = ADAPTER_CEILINGS[adapterCeilingKey];
    if (ceiling && adapterCeilingKey !== 'match-mode') {
      return { boundary: ceiling.boundary, permissions: ceiling.permissions };
    }
    return { boundary: modeCfg.boundary, permissions: modeCfg.permissions };
  }, [adapterCeilingKey, modeCfg.boundary, modeCfg.permissions]);

  const audioSnapshot = isDisposableIdb ? dbLoaded?.snapshot : preset.snapshot;
  const audioConfig = useMemo(() => {
    if (audioMode === 'not-evaluated') return null;
    if (audioMode === 'lazy-markers-only') {
      return {
        preferences: preset.preferences,
        runtimeAudioUrls: Object.fromEntries(
          (audioSnapshot?.audioVariants || []).map(v => [v.id, { folderBacked: true }])
        )
      };
    }
    return {
      preferences: preset.preferences,
      runtimeAudioUrls: Object.fromEntries(
        (audioSnapshot?.audioVariants || []).map(v => [
          v.id,
          { url: `blob:qa-verified-${v.id}`, renderFingerprint: v?.metadata?.audioRenderFingerprintV1 || null }
        ])
      )
    };
  }, [audioMode, preset.preferences, audioSnapshot]);

  const presetRef = useRef(preset);
  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    accessConfigRef.current = {
      boundary: modeCfg.boundary,
      permissions: modeCfg.permissions,
      audio: audioConfig
    };
  }, [modeCfg.boundary, modeCfg.permissions, audioConfig]);

  // Reset explicit overwrite confirmation whenever target DB, storage mode, or seed preset changes.
  useEffect(() => {
    setOverwriteConfirmOpen(false);
    setOverwriteAcknowledged(false);
  }, [isDisposableIdb, activeDbName, presetKey]);

  // In-memory QA session lifecycle (only active in default in-memory storageMode; zero IDB access).
  useEffect(() => {
    if (isDisposableIdb) {
      qaBox.setSession(null);
      return undefined;
    }
    const activePreset = presetRef.current;
    const activeAccess = accessConfigRef.current;
    const preserved = qaBox.getPreservedContext();
    const initialSnapshot = preserved.snapshot || activePreset.snapshot;
    const initialSelection = preserved.selection || {};

    const nextSession = createTextDataManagementSession({
      snapshot: initialSnapshot,
      selection: initialSelection,
      boundary: activeAccess.boundary,
      permissions: activeAccess.permissions,
      sourceAttachments: activePreset.sourceAttachments,
      externalImports: activePreset.externalImports,
      audio: activeAccess.audio,
      execute: (_, { preparedOutcome }) => {
        const mode = transportModeRef.current;
        if (mode === 'reject') {
          return { ok: false, error: { code: 'QA_REJECTED', message: 'Disposable QA transport rejected command; retry draft.' } };
        }
        if (mode === 'malformed') {
          return { ok: true };
        }
        if (mode === 'defer') {
          setDeferredPending(true);
          return new Promise(resolve => {
            deferredResolverRef.current = () => {
              setDeferredPending(false);
              resolve(preparedOutcome);
            };
          });
        }
        return preparedOutcome;
      }
    });
    qaBox.setSession(nextSession);
    return () => {
      const snap = nextSession.getSnapshot();
      const sel = nextSession.getState()?.view?.selection || {};
      if (snap) qaBox.rememberContext(snap, sel);
      if (qaBox.getActiveSession() === nextSession) {
        qaBox.setSession(null);
      }
      nextSession.dispose();
    };
  }, [qaBox, isDisposableIdb, presetKey]);

  // Configure live in-memory session when boundary, permissions, or audio mode change (preserves session drafts).
  useEffect(() => {
    if (isDisposableIdb) return;
    qaBox.getActiveSession()?.configure({
      boundary: modeCfg.boundary,
      permissions: modeCfg.permissions,
      audio: audioConfig
    });
  }, [qaBox, isDisposableIdb, modeCfg.boundary, modeCfg.permissions, audioConfig]);

  const { session, seq } = useSyncExternalStore(qaBox.subscribe, qaBox.getSnapshot);

  // Build base disposable persistence adapter only when disposable-idb mode is active.
  const baseAdapterState = useMemo(() => {
    if (!isDisposableIdb) return { adapter: null, error: null };
    try {
      const adapter = createTextDataManagementPersistenceAdapter({
        dbName: activeDbName,
        boundary: adapterGrant.boundary,
        permissions: adapterGrant.permissions
      });
      return { adapter, error: null };
    } catch (error) {
      return {
        adapter: null,
        error: {
          code: error?.code || 'INVALID_DATABASE_NAME',
          message: error?.message || 'Unable to bind disposable database adapter.'
        }
      };
    }
  }, [isDisposableIdb, activeDbName, adapterGrant.boundary, adapterGrant.permissions]);

  const connectDisposableDb = useCallback(async ({ reason = 'connect' } = {}) => {
    const connectSeq = ++dbConnectSeqRef.current;
    if (!isDisposableIdb) return;
    if (baseAdapterState.error || !baseAdapterState.adapter) {
      setDbLoaded(null);
      setDbLoading(false);
      setDbError(baseAdapterState.error || { code: 'INVALID_DATABASE_NAME', message: 'Invalid disposable DB selection.' });
      setDbStatusMessage('Adapter validation failed');
      return;
    }
    setDbLoading(true);
    setDbError(null);
    if (reason === 'switch') {
      setDbLoaded(null);
    }
    try {
      const loaded = await baseAdapterState.adapter.loadState();
      if (dbConnectSeqRef.current !== connectSeq) return;
      setDbLoaded(loaded);
      setDbError(null);
      setDbStatusMessage(
        reason === 'reload'
          ? `Reloaded authoritative state from ${baseAdapterState.adapter.dbName} (v${loaded.dbVersion})`
          : `Connected to existing disposable DB ${baseAdapterState.adapter.dbName} (v${loaded.dbVersion}) without overwrite`
      );
      setSourceReloadNonce(n => n + 1);
    } catch (error) {
      if (dbConnectSeqRef.current !== connectSeq) return;
      setDbLoaded(null);
      setDbError({
        code: error?.code || 'CONNECTION_ERROR',
        message: error?.message || 'Unable to load disposable IndexedDB state.',
        databaseMissing: error?.code === 'UNINITIALIZED' ? Boolean(error?.databaseMissing) : false
      });
      setDbStatusMessage(`Connection failed (${error?.code || 'CONNECTION_ERROR'})`);
    } finally {
      if (dbConnectSeqRef.current === connectSeq) {
        setDbLoading(false);
      }
    }
  }, [isDisposableIdb, baseAdapterState]);

  const lastConnectedDbRef = useRef(null);
  useEffect(() => {
    if (!isDisposableIdb) {
      lastConnectedDbRef.current = null;
      setDbLoaded(null);
      setDbError(null);
      return;
    }
    const targetDb = baseAdapterState.adapter?.dbName || activeDbName;
    if (lastConnectedDbRef.current !== targetDb) {
      lastConnectedDbRef.current = targetDb;
      connectDisposableDb({ reason: 'switch' });
    }
  }, [isDisposableIdb, baseAdapterState.adapter, activeDbName, connectDisposableDb]);

  // Optional DEV transport wrapper for deferring committed receipt return on disposable-idb adapter.
  const effectiveAdapter = useMemo(() => {
    if (!isDisposableIdb || !baseAdapterState.adapter) return null;
    const base = baseAdapterState.adapter;
    const execute = async (command, context) => {
      const mode = transportModeRef.current;
      if (mode === 'reject') {
        return { ok: false, error: { code: 'QA_REJECTED', message: 'DEV QA simulated rejection before DB transaction.' } };
      }
      const receipt = await base.execute(command, context);
      if (mode === 'malformed') {
        return { ok: true };
      }
      if (mode === 'defer') {
        setDeferredPending(true);
        return new Promise(resolve => {
          deferredResolverRef.current = () => {
            setDeferredPending(false);
            resolve(receipt);
          };
        });
      }
      return receipt;
    };
    Object.defineProperty(execute, 'authoritativeTransaction', {
      value: true,
      enumerable: false,
      configurable: false
    });
    return Object.freeze({
      ...base,
      execute
    });
  }, [isDisposableIdb, baseAdapterState.adapter]);

  const handleLoadPreset = useCallback(nextKey => {
    const nextPreset = fixtures.presets[nextKey] || fixtures.presets['v2-complete'];
    setPresetKey(nextKey);
    if (!isDisposableIdb) {
      qaBox.rememberContext(nextPreset.snapshot, {});
      qaBox.getActiveSession()?.replaceSource(nextPreset.snapshot, {
        selection: {},
        sourceAttachments: nextPreset.sourceAttachments,
        externalImports: nextPreset.externalImports
      });
    }
  }, [fixtures.presets, isDisposableIdb, qaBox]);

  const handleInitializeDisposableDb = useCallback(async ({ allowOverwrite = false } = {}) => {
    if (!isDisposableIdb || !baseAdapterState.adapter) {
      return { ok: false, code: 'UNAVAILABLE' };
    }
    if (initInFlightRef.current) {
      concurrentInitBlockedRef.current = true;
      setDbStatusMessage('Refused concurrent initialization (`CONCURRENT_INIT`): initialization already in progress.');
      return { ok: false, code: 'CONCURRENT_INIT' };
    }
    if (allowOverwrite && !overwriteAcknowledged) {
      setDbStatusMessage('Refused destructive overwrite (`CONFIRMATION_REQUIRED`): explicit confirmation checkbox must be checked first.');
      return { ok: false, code: 'CONFIRMATION_REQUIRED' };
    }
    if (!allowOverwrite && dbLoaded) {
      setDbStatusMessage('Refused ordinary initialization (`ALREADY_INITIALIZED`): existing QA database is loaded and protected.');
      return { ok: false, code: 'ALREADY_INITIALIZED' };
    }

    initInFlightRef.current = true;
    concurrentInitBlockedRef.current = false;
    setInitInFlight(true);
    const connectSeq = ++dbConnectSeqRef.current;
    setDbLoading(true);
    setDbError(null);
    try {
      if (!allowOverwrite) {
        try {
          const existing = await baseAdapterState.adapter.loadState();
          if (dbConnectSeqRef.current !== connectSeq) return { ok: false, code: 'STALE' };
          setDbLoaded(existing);
          setDbError(null);
          setDbStatusMessage(
            `Refused ordinary initialization (ALREADY_INITIALIZED): loaded existing disposable DB ${baseAdapterState.adapter.dbName} without overwrite.`
          );
          setSourceReloadNonce(n => n + 1);
          return { ok: false, code: 'ALREADY_INITIALIZED' };
        } catch (probeError) {
          const confirmedMissing = probeError?.code === 'UNINITIALIZED' && probeError?.databaseMissing === true;
          if (!confirmedMissing) {
            if (dbConnectSeqRef.current !== connectSeq) return { ok: false, code: 'STALE' };
            setDbLoaded(null);
            setDbError({
              code: probeError?.code || 'EXISTING_DB_PROTECTED',
              message: probeError?.message || 'Existing IndexedDB database is already present on disk.',
              databaseMissing: false
            });
            setDbStatusMessage(
              `Refused ordinary initialization (EXISTING_DB_PROTECTED / ${probeError?.code || 'ERROR'}): existing QA database data was preserved.`
            );
            return { ok: false, code: 'EXISTING_DB_PROTECTED', existingCode: probeError?.code || 'ERROR' };
          }
        }
      }

      await seedDisposableTextManagementDatabase({
        dbName: baseAdapterState.adapter.dbName,
        snapshot: preset.snapshot,
        sourceAttachments: preset.sourceAttachments,
        externalImports: preset.externalImports,
        extraMetaRecords: preset.extraMetaRecords
      });
      const loaded = await baseAdapterState.adapter.loadState();
      if (dbConnectSeqRef.current !== connectSeq) return { ok: false, code: 'STALE' };
      setDbLoaded(loaded);
      setDbError(null);
      setOverwriteConfirmOpen(false);
      setOverwriteAcknowledged(false);
      setDbStatusMessage(
        `${allowOverwrite ? 'Explicitly overwrote' : 'Initialized fresh'} ${baseAdapterState.adapter.dbName} with preset "${preset.label}" (v${loaded.dbVersion})${concurrentInitBlockedRef.current ? ' · Duplicate click blocked (CONCURRENT_INIT)' : ''}`
      );
      setSourceReloadNonce(n => n + 1);
      return { ok: true };
    } catch (error) {
      if (dbConnectSeqRef.current !== connectSeq) return { ok: false, code: 'STALE' };
      setDbLoaded(null);
      setDbError({
        code: error?.code || 'INITIALIZE_FAILED',
        message: error?.message || 'Failed to initialize disposable database.',
        databaseMissing: error?.code === 'UNINITIALIZED' ? Boolean(error?.databaseMissing) : false
      });
      setDbStatusMessage(`Initialization failed (${error?.code || 'INITIALIZE_FAILED'})`);
      return { ok: false, code: error?.code || 'INITIALIZE_FAILED' };
    } finally {
      initInFlightRef.current = false;
      setInitInFlight(false);
      if (dbConnectSeqRef.current === connectSeq) {
        setDbLoading(false);
      }
    }
  }, [isDisposableIdb, baseAdapterState.adapter, dbLoaded, overwriteAcknowledged, preset]);

  const handleSimulateConcurrentEdit = useCallback(async () => {
    if (!isDisposableIdb || !baseAdapterState.adapter) return;
    try {
      const latest = await baseAdapterState.adapter.loadState();
      const targetDoc = latest.snapshot.documents.find(doc => doc.editorModel === 'structured-v1' && (latest.snapshot.schemaVersion === 2 || doc.documentType === 'paragraph'));
      if (!targetDoc) {
        setDbStatusMessage('No editable Workspace found in DB to simulate external concurrent writer.');
        return;
      }
      conflictCounterRef.current += 1;
      const note = `External QA writer update #${conflictCounterRef.current}`;
      await executeDisposableTextManagementTransaction({
        dbName: baseAdapterState.adapter.dbName,
        selection: { workspaceId: targetDoc.id },
        boundary: 'disposable',
        permissions: ['catalog', 'content'],
        expectedSnapshotFingerprint: latest.snapshotFingerprint,
        command: {
          type: 'document.update',
          payload: {
            id: targetDoc.id,
            metadata: { ...(targetDoc.metadata || {}), note }
          }
        }
      });
      setDbStatusMessage(`External writer committed "${note}" to ${baseAdapterState.adapter.dbName} without reloading UI session (next UI commit will hit STALE_RESULT).`);
    } catch (error) {
      setDbStatusMessage(`Concurrent edit simulation error (${error?.code || 'ERROR'}): ${error?.message || 'Failed'}`);
    }
  }, [isDisposableIdb, baseAdapterState.adapter]);

  const handleInjectInvalid = useCallback(() => {
    if (!isDisposableIdb) {
      qaBox.getActiveSession()?.replaceSource({ schemaVersion: 99 });
    }
  }, [isDisposableIdb, qaBox]);

  const handleReloadValidSource = useCallback(() => {
    if (isDisposableIdb) {
      return connectDisposableDb({ reason: 'reload' });
    }
    qaBox.getActiveSession()?.replaceSource(preset.snapshot, {
      selection: {},
      sourceAttachments: preset.sourceAttachments,
      externalImports: preset.externalImports
    });
    return undefined;
  }, [isDisposableIdb, connectDisposableDb, preset, qaBox]);

  const handleReleaseDeferred = useCallback(() => {
    const release = deferredResolverRef.current;
    deferredResolverRef.current = null;
    release?.();
  }, []);

  const frameClass = frameWidth === '320'
    ? 'max-w-[320px] mx-auto border-x border-slate-300 dark:border-slate-700'
    : frameWidth === '375'
      ? 'max-w-[375px] mx-auto border-x border-slate-300 dark:border-slate-700'
      : 'w-full';

  const isMissingDisposableDb = Boolean(
    isDisposableIdb
    && baseAdapterState.adapter
    && !baseAdapterState.error
    && !dbLoaded
    && dbError?.code === 'UNINITIALIZED'
    && dbError?.databaseMissing === true
  );
  const isExistingUnreadableDb = Boolean(
    isDisposableIdb
    && baseAdapterState.adapter
    && !baseAdapterState.error
    && !dbLoaded
    && dbError
    && !isMissingDisposableDb
  );
  const hasProtectedExistingDb = Boolean(dbLoaded || isExistingUnreadableDb);

  const renderOverwriteConfirmationPanel = () => (
    overwriteConfirmOpen && hasProtectedExistingDb ? (
      <div
        role="region"
        aria-label="Explicit Destructive QA Database Overwrite Confirmation"
        data-dm-qa-overwrite-confirm-panel="true"
        className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/35 p-3 space-y-2 text-xs text-red-950 dark:text-red-100"
      >
        <p className="font-black">
          Destructive QA Overwrite Confirmation Required
        </p>
        <p className="text-[11px] break-words">
          Proceeding will clear all IndexedDB stores in disposable database <span className="font-mono font-bold break-all">{activeDbName}</span> and replace them with preset <span className="font-bold">"{preset.label}"</span>. Ordinary initialization blocks overwrite whenever any existing or corrupted database is detected; atomic cross-context <code className="font-mono">createOnly</code> tx enforcement awaits Codex service patch.
        </p>
        <label className="flex items-start gap-2 text-[11px] font-bold cursor-pointer">
          <input
            type="checkbox"
            data-dm-qa-confirm-overwrite-checkbox="true"
            checked={overwriteAcknowledged}
            disabled={dbLoading || initInFlight}
            onChange={e => setOverwriteAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-red-400 text-red-600 focus-visible:outline-2 focus-visible:outline-indigo-600"
          />
          <span className="break-words">
            I confirm overwriting existing data (if any) in disposable database "{activeDbName}" with "{preset.label}".
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-dm-qa-confirm-overwrite="true"
            disabled={dbLoading || initInFlight || !overwriteAcknowledged}
            onClick={() => handleInitializeDisposableDb({ allowOverwrite: true })}
            className={`${DM_SMALL_BTN} border-red-700 bg-red-700 text-white`}
          >
            Confirm Overwrite DB
          </button>
          <button
            type="button"
            data-dm-qa-cancel-overwrite="true"
            disabled={dbLoading || initInFlight}
            onClick={() => { setOverwriteConfirmOpen(false); setOverwriteAcknowledged(false); }}
            className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
          >
            Cancel Overwrite
          </button>
        </div>
      </div>
    ) : null
  );

  const qaHeaderControls = (
    <section
      aria-label="DEV QA Harness Controls"
      data-dm-qa-controls="true"
      className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/25 p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-black text-indigo-900 dark:text-indigo-200 break-words">
            DEV QA Route — {isDisposableIdb ? `Disposable IndexedDB (${activeDbName})` : 'In-Memory Disposable Fixture Harness'} (No Canonical Persistence)
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 break-words">
            {isDisposableIdb
              ? (dbStatusMessage || 'Connected through createTextDataManagementPersistenceAdapter (canonical prolingo_text_library blocked)')
              : `Session rev key #${seq} · Canonical DB/Schema v1 untouched (0 IndexedDB calls)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-dm-qa-toggle-loading="true"
            onClick={() => setHostLoading(v => !v)}
            className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
          >
            {hostLoading ? 'Exit Loading' : 'Simulate Loading'}
          </button>
          {!isDisposableIdb ? (
            <>
              <button
                type="button"
                data-dm-qa-inject-invalid="true"
                onClick={handleInjectInvalid}
                className={`${DM_SMALL_BTN} border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300`}
              >
                Inject Schema 99 Error
              </button>
              <button
                type="button"
                data-dm-qa-reset-preset="true"
                onClick={() => handleLoadPreset(presetKey)}
                className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300`}
              >
                Reset Preset
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-dm-qa-connect-db="true"
                disabled={dbLoading || initInFlight}
                onClick={() => connectDisposableDb({ reason: 'reload' })}
                className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300`}
              >
                Connect / Reload DB
              </button>
              {isMissingDisposableDb && (
                <button
                  type="button"
                  data-dm-qa-seed-db="true"
                  disabled={dbLoading || initInFlight || Boolean(baseAdapterState.error)}
                  onClick={() => handleInitializeDisposableDb({ allowOverwrite: false })}
                  className={`${DM_SMALL_BTN} border-emerald-600 bg-emerald-600 text-white`}
                >
                  Initialize Disposable DB from Preset
                </button>
              )}
              {dbLoaded && (
                <button
                  type="button"
                  data-dm-qa-simulate-conflict="true"
                  disabled={dbLoading || initInFlight}
                  onClick={handleSimulateConcurrentEdit}
                  className={`${DM_SMALL_BTN} border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200`}
                >
                  Simulate External DB Edit
                </button>
              )}
              {hasProtectedExistingDb && (
                <button
                  type="button"
                  data-dm-qa-open-overwrite-confirm="true"
                  disabled={dbLoading || initInFlight}
                  onClick={() => {
                    setOverwriteAcknowledged(false);
                    setOverwriteConfirmOpen(v => !v);
                  }}
                  className={`${DM_SMALL_BTN} border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300`}
                >
                  {isExistingUnreadableDb ? 'Overwrite Protected DB...' : 'Overwrite DB with Selected Preset...'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!isExistingUnreadableDb && renderOverwriteConfirmationPanel()}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>QA Storage Engine</span>
          <select
            aria-label="QA Storage Mode"
            data-dm-qa-storage-select="true"
            value={storageMode}
            onChange={e => setStorageMode(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            <option value="in-memory">In-Memory Fixture QA (0 IDB)</option>
            <option value="disposable-idb">Disposable IndexedDB (P15-A2)</option>
          </select>
        </label>

        {isDisposableIdb && (
          <>
            <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Disposable QA Database</span>
              <select
                aria-label="Disposable QA Database"
                data-dm-qa-db-select="true"
                value={dbSlotKey}
                onChange={e => setDbSlotKey(e.target.value)}
                className={DM_INPUT_CLASS}
              >
                {DISPOSABLE_DB_SLOTS.map(slot => (
                  <option key={slot.id} value={slot.id}>{slot.label}</option>
                ))}
                <option value="__custom__">Custom Disposable Name / Guard Check</option>
              </select>
            </label>

            {dbSlotKey === '__custom__' && (
              <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>Custom QA DB Name</span>
                <input
                  type="text"
                  aria-label="Custom Disposable QA DB Name"
                  data-dm-qa-db-custom-input="true"
                  value={customDbName}
                  onChange={e => setCustomDbName(e.target.value)}
                  className={`${DM_INPUT_CLASS} font-mono`}
                />
              </label>
            )}

            <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Adapter Ceiling</span>
              <select
                aria-label="Adapter Permission Ceiling"
                data-dm-qa-adapter-ceiling-select="true"
                value={adapterCeilingKey}
                onChange={e => setAdapterCeilingKey(e.target.value)}
                className={DM_INPUT_CLASS}
              >
                {Object.entries(ADAPTER_CEILINGS).map(([key, item]) => (
                  <option key={key} value={key}>{item.label}</option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Session Boundary Mode</span>
          <select
            aria-label="QA Session Mode"
            data-dm-qa-mode-select="true"
            value={modeKey}
            onChange={e => setModeKey(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>{isDisposableIdb ? 'Initialization Seed Preset' : 'Fixture Preset'}</span>
          <select
            aria-label="QA Fixture Preset"
            data-dm-qa-preset-select="true"
            value={presetKey}
            onChange={e => handleLoadPreset(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            {Object.entries(fixtures.presets).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Audio Coverage Bindings</span>
          <select
            aria-label="QA Audio Evaluation"
            data-dm-qa-audio-select="true"
            value={audioMode}
            onChange={e => setAudioMode(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            <option value="not-evaluated">Not Evaluated (Default)</option>
            <option value="lazy-markers-only">Folder Markers Only (Never Ready)</option>
            <option value="verified-url-bindings">Verified Concrete URLs (Ready)</option>
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Async Command Transport</span>
          <select
            aria-label="QA Async Transport"
            data-dm-qa-transport-select="true"
            value={transportMode}
            onChange={e => setTransportMode(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            <option value="accept">Accept Synchronously</option>
            <option value="defer">Defer (Manual Release)</option>
            <option value="reject">Reject (QA_REJECTED)</option>
            <option value="malformed">Malformed Ack (INVALID_RESPONSE)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {deferredPending && (
          <button
            type="button"
            data-dm-qa-release-deferred="true"
            onClick={handleReleaseDeferred}
            className={`${DM_SMALL_BTN} border-amber-500 bg-amber-500 text-white`}
          >
            Release Deferred Command
          </button>
        )}
        <button
          type="button"
          data-dm-qa-frame="desktop"
          onClick={() => setFrameWidth('desktop')}
          className={`${DM_SMALL_BTN} ${frameWidth === 'desktop' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Desktop Full
        </button>
        <button
          type="button"
          data-dm-qa-frame="375"
          onClick={() => setFrameWidth('375')}
          className={`${DM_SMALL_BTN} ${frameWidth === '375' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Mobile 375px
        </button>
        <button
          type="button"
          data-dm-qa-frame="320"
          onClick={() => setFrameWidth('320')}
          className={`${DM_SMALL_BTN} ${frameWidth === '320' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Narrow 320px
        </button>
        <button
          type="button"
          data-dm-qa-dark-toggle="true"
          onClick={() => setDarkMode(v => !v)}
          className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
        >
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </section>
  );

  if (isDisposableIdb) {
    return (
      <div data-dm-qa-preview="true" className={frameClass}>
        <TextDataManagementPage
          session={null}
          snapshot={dbLoaded?.snapshot ?? null}
          metaRecords={dbLoaded?.metaRecords ?? null}
          loading={hostLoading || dbLoading}
          connectionError={dbError}
          connectionActions={isMissingDisposableDb ? (
            <button
              type="button"
              data-dm-connection-seed-db="true"
              disabled={dbLoading || initInFlight}
              onClick={() => handleInitializeDisposableDb({ allowOverwrite: false })}
              className={`${DM_SMALL_BTN} border-emerald-600 bg-emerald-600 text-white`}
            >
              Initialize Disposable DB from "{preset.label}"
            </button>
          ) : isExistingUnreadableDb ? (
            <div className="w-full space-y-2">
              <button
                type="button"
                data-dm-connection-open-overwrite-confirm="true"
                disabled={dbLoading || initInFlight}
                onClick={() => {
                  setOverwriteAcknowledged(false);
                  setOverwriteConfirmOpen(v => !v);
                }}
                className={`${DM_SMALL_BTN} border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300`}
              >
                Explicitly Overwrite Protected DB...
              </button>
              {renderOverwriteConfirmationPanel()}
            </div>
          ) : null}
          boundary={modeCfg.boundary}
          permissions={modeCfg.permissions}
          persistenceAdapter={dbLoaded ? effectiveAdapter : null}
          sourceAttachments={dbLoaded?.sourceAttachments ?? EMPTY_ARRAY}
          externalImports={dbLoaded?.externalImports ?? EMPTY_ARRAY}
          extraMetaRecords={dbLoaded?.extraMetaRecords ?? EMPTY_ARRAY}
          audio={audioConfig}
          sourceReloadNonce={sourceReloadNonce}
          samplePack={preset.samplePack}
          sampleExternalPackage={preset.sampleExternalPackage}
          onReloadValidSource={handleReloadValidSource}
          compact={frameWidth !== 'desktop'}
          headerActions={qaHeaderControls}
        />
      </div>
    );
  }

  return (
    <div data-dm-qa-preview="true" className={frameClass}>
      <TextDataManagementPage
        session={session}
        loading={hostLoading || !session}
        boundary={modeCfg.boundary}
        permissions={modeCfg.permissions}
        sourceAttachments={preset.sourceAttachments}
        externalImports={preset.externalImports}
        extraMetaRecords={preset.extraMetaRecords}
        samplePack={preset.samplePack}
        sampleExternalPackage={preset.sampleExternalPackage}
        onReloadValidSource={handleReloadValidSource}
        compact={frameWidth !== 'desktop'}
        headerActions={qaHeaderControls}
      />
    </div>
  );
}
