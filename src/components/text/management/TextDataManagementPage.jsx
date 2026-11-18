import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Database,
  FileWarning,
  Layers,
  Loader2,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { createTextDataManagementSession } from '../../../services/textDataManagementSession.js';
import DataManagementLibraryExplorer from './DataManagementLibraryExplorer.jsx';
import DataManagementWorkspaceInspector from './DataManagementWorkspaceInspector.jsx';
import DataManagementStructuredEditor from './DataManagementStructuredEditor.jsx';
import DataManagementAudioSourcesPanel from './DataManagementAudioSourcesPanel.jsx';
import DataManagementTransfersDiagnosticsPanel from './DataManagementTransfersDiagnosticsPanel.jsx';
import {
  buildSerializedDraftId,
  DM_CONTROL_BTN,
  DM_SMALL_BTN,
  explainReason,
  formatDraftKeyLabel
} from './dataManagementUiUtils.js';

const LOADING_SNAPSHOT = Object.freeze({
  revision: 0,
  pending: false,
  disposed: false,
  error: null,
  view: null,
  draftCount: 0,
  session: null
});

const SECTION_TABS = Object.freeze([
  { id: 'all', label: 'Overview (All)' },
  { id: 'editor', label: 'Structured Editor' },
  { id: 'workspace', label: 'Workspace & Speakers' },
  { id: 'audio', label: 'Audio Inspector' },
  { id: 'sources', label: 'Sources' },
  { id: 'transfers', label: 'Transfers & Diagnostics' }
]);

const createExternalSessionStore = () => {
  let ownedSession = null;
  let boundSession = null;
  let unsubscribeSession = null;
  let cachedState = LOADING_SNAPSHOT;
  const listeners = new Set();

  const notify = () => {
    const nextState = boundSession
      ? { ...boundSession.getState(), session: boundSession }
      : LOADING_SNAPSHOT;
    cachedState = nextState;
    listeners.forEach(listener => listener());
  };

  const bind = (targetSession, isOwned) => {
    if (unsubscribeSession) {
      unsubscribeSession();
      unsubscribeSession = null;
    }
    if (ownedSession && ownedSession !== targetSession) {
      ownedSession.dispose();
      ownedSession = null;
    }
    boundSession = targetSession || null;
    ownedSession = isOwned ? targetSession : null;
    if (boundSession) {
      unsubscribeSession = boundSession.subscribe(notify);
    }
    notify();
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => cachedState,
    attachExternal: session => bind(session, false),
    createInternal: options => bind(createTextDataManagementSession(options), true),
    teardown: () => bind(null, false)
  };
};

/**
 * Full-page Structured Text Data Management UI bound to one headless
 * createTextDataManagementSession via useSyncExternalStore.
 */
export default function TextDataManagementPage({
  session: externalSession = null,
  snapshot = null,
  initialSelection = {},
  boundary = 'read-only',
  permissions = [],
  sourceAttachments = [],
  externalImports = [],
  extraMetaRecords = [],
  audio = null,
  execute = null,
  samplePack = null,
  sampleExternalPackage = null,
  loading = false,
  onReloadValidSource = null,
  compact = false,
  headerActions = null
}) {
  const [store] = useState(createExternalSessionStore);
  const [activeTab, setActiveTab] = useState('all');
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(true);
  const [trackedDraftKeys, setTrackedDraftKeys] = useState(() => new Map());

  const initialConfigRef = useRef({ snapshot, initialSelection, boundary, permissions, sourceAttachments, externalImports, audio, execute });
  useEffect(() => {
    initialConfigRef.current = { snapshot, initialSelection, boundary, permissions, sourceAttachments, externalImports, audio, execute };
  }, [snapshot, initialSelection, boundary, permissions, sourceAttachments, externalImports, audio, execute]);

  const permissionsKey = permissions.join(',');
  useEffect(() => {
    if (loading) {
      store.teardown();
      return undefined;
    }
    if (externalSession) {
      store.attachExternal(externalSession);
      return () => store.teardown();
    }
    const cfg = initialConfigRef.current;
    store.createInternal({
      snapshot: cfg.snapshot,
      selection: cfg.initialSelection,
      boundary: cfg.boundary,
      permissions: cfg.permissions,
      sourceAttachments: cfg.sourceAttachments,
      externalImports: cfg.externalImports,
      audio: cfg.audio,
      execute: cfg.execute
    });
    return () => store.teardown();
  }, [store, externalSession, loading, boundary, permissionsKey]);

  const syncedState = useSyncExternalStore(store.subscribe, store.getState);
  const activeSession = externalSession || syncedState.session;

  const sessionState = useMemo(() => {
    if (externalSession && syncedState.session !== externalSession) {
      return { ...externalSession.getState(), session: externalSession };
    }
    return syncedState;
  }, [externalSession, syncedState]);

  const firstMountRef = useRef(true);
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    if (externalSession || loading || !syncedState.session || snapshot === undefined) return;
    syncedState.session.replaceSource(snapshot, {
      selection: initialSelection,
      sourceAttachments,
      externalImports
    });
  }, [externalSession, loading, syncedState.session, snapshot, initialSelection, sourceAttachments, externalImports]);

  const getDraft = useCallback(key => {
    if (!activeSession) return undefined;
    try {
      return activeSession.getDraft(key);
    } catch {
      return undefined;
    }
  }, [activeSession]);

  const setDraft = useCallback((key, value) => {
    if (!activeSession) return;
    activeSession.setDraft(key, value);
    const serialized = buildSerializedDraftId(key);
    setTrackedDraftKeys(prev => {
      if (prev.has(serialized)) return prev;
      const next = new Map(prev);
      next.set(serialized, key);
      return next;
    });
  }, [activeSession]);

  const clearDraft = useCallback(key => {
    if (!activeSession) return;
    try {
      activeSession.clearDraft(key);
    } catch {
      // ignore invalid clear keys
    }
    const serialized = buildSerializedDraftId(key);
    setTrackedDraftKeys(prev => {
      if (!prev.has(serialized)) return prev;
      const next = new Map(prev);
      next.delete(serialized);
      return next;
    });
  }, [activeSession]);

  const getRetainedDraftEntries = () => {
    const list = [];
    for (const [id, key] of trackedDraftKeys.entries()) {
      const val = getDraft(key);
      if (val !== undefined) list.push({ id, key, value: val });
    }
    return list;
  };

  const handleNavigate = useCallback(nextSelection => {
    if (!activeSession) return false;
    return activeSession.navigate(nextSelection);
  }, [activeSession]);

  const handleDispatch = useCallback(command => {
    if (!activeSession) return Promise.resolve({ ok: false, error: { code: 'UNINITIALIZED', message: 'Session unavailable' } });
    return activeSession.dispatch(command);
  }, [activeSession]);

  const handleExportData = useCallback(options => {
    if (!activeSession) return null;
    return activeSession.exportData(options);
  }, [activeSession]);

  const handleInspectTransfer = useCallback(options => {
    if (!activeSession) return null;
    return activeSession.inspectTransfer(options);
  }, [activeSession]);

  const handlePreviewTransfer = useCallback(options => {
    if (!activeSession) return null;
    return activeSession.previewTransfer(options);
  }, [activeSession]);

  const handleTabKeyDown = event => {
    const idx = SECTION_TABS.findIndex(t => t.id === activeTab);
    if (idx < 0) return;
    let nextIdx = null;
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % SECTION_TABS.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + SECTION_TABS.length) % SECTION_TABS.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = SECTION_TABS.length - 1;
    if (nextIdx !== null) {
      event.preventDefault();
      setActiveTab(SECTION_TABS[nextIdx].id);
    }
  };

  // State 1: Host Loading
  if (loading || !activeSession) {
    return (
      <main
        data-dm-page="loading"
        data-dm-loading="true"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6"
      >
        <div className="max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3" role="status">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h1 className="text-base font-black">Loading Structured Text Data Management...</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Initializing isolated working snapshot and headless session coordinator.
          </p>
        </div>
      </main>
    );
  }

  const { view, pending, disposed, error, draftCount, revision } = sessionState;
  const currentSnapshot = activeSession.getSnapshot();
  const selection = view?.selection || {};
  const isReadOnlyBoundary = !Object.values(view?.capabilities || {}).some(cap => cap?.enabled);
  const workspaceSelected = Boolean(view?.workspace);
  const showAll = activeTab === 'all';

  // State 2: Invalid Snapshot / Failed Validation (view === null)
  if (!view) {
    const retainedDraftEntries = getRetainedDraftEntries();
    return (
      <main
        data-dm-page="invalid-snapshot"
        data-dm-invalid-snapshot="true"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6"
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {headerActions}
          <section role="alert" className="rounded-2xl border border-red-300 dark:border-red-900 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <FileWarning className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <h1 className="text-base font-black text-red-800 dark:text-red-200">
                  {error?.code || 'INVALID_SNAPSHOT'}: Snapshot Validation Failed
                </h1>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {error?.message || 'Unable to inspect or edit an invalid, partial, or unsupported schema snapshot.'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {explainReason(error?.code || 'INVALID_SNAPSHOT')} Stale projections are cleared automatically; canonical database remains untouched (`v1`).
                </p>
              </div>
            </div>
            {onReloadValidSource && (
              <div className="pt-1">
                <button
                  type="button"
                  data-dm-reload-valid-source="true"
                  onClick={onReloadValidSource}
                  className={`${DM_CONTROL_BTN} border-indigo-600 bg-indigo-600 text-white`}
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Reload Valid Source Snapshot
                </button>
              </div>
            )}
          </section>

          <section
            aria-label="Retained Drafts Recovery"
            data-dm-retained-drafts="true"
            className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 p-4 space-y-2.5"
          >
            <h2 className="text-xs font-black text-amber-900 dark:text-amber-200">
              Retained Drafts ({draftCount} in memory)
            </h2>
            {retainedDraftEntries.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                No tracked draft values were modified before validation failed. ({draftCount} total drafts held in session.)
              </p>
            ) : (
              <ul className="space-y-1.5">
                {retainedDraftEntries.map(entry => (
                  <li key={entry.id} data-dm-retained-draft-item={entry.id} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 p-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200">{formatDraftKeyLabel(entry.key)}</p>
                      <p className="text-xs text-slate-900 dark:text-slate-100 break-words">{String(entry.value)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => clearDraft(entry.key)}
                      className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                    >
                      Discard Draft
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  const selectedLabel = selection.segmentId
    ? `Segment ${selection.segmentId}`
    : selection.unitId
      ? `Unit ${selection.unitId}`
      : selection.cardId
        ? `Card ${selection.cardId}`
        : selection.workspaceId
          ? `Workspace ${selection.workspaceId}`
          : selection.collectionId
            ? `Collection ${selection.collectionId}`
            : selection.collectionId === null
              ? 'Root (collectionId: null)'
              : 'Whole Library ({})';

  return (
    <main
      data-dm-page="ready"
      aria-busy={pending}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-5 lg:p-6 overflow-x-clip"
    >
      <div className="max-w-7xl mx-auto space-y-4">
        {headerActions}

        {/* Top Full-Page Banner */}
        <header
          data-dm-boundary-banner="true"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Database className="w-5 h-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white" style={{ textWrap: 'balance' }}>
                  Structured Text Data Management
                </h1>
                {isReadOnlyBoundary && boundary === 'read-only' ? (
                  <span data-dm-mode-badge="read-only" className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-black text-slate-700 dark:text-slate-200">
                    <Lock className="w-3 h-3" aria-hidden="true" /> Read-Only Default
                  </span>
                ) : (
                  <span data-dm-mode-badge="disposable" className="inline-flex items-center gap-1 rounded-full border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-200">
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Isolated Disposable Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scope: <span className="font-mono font-bold text-slate-800 dark:text-slate-200" data-dm-current-selection={selectedLabel}>{selectedLabel}</span> · Rev <span className="font-mono">{revision}</span> · Drafts <span className="font-mono" data-dm-draft-count={draftCount}>{draftCount}</span> · Canonical Writes: <span className="font-mono font-bold">false</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <output
                role="status"
                aria-live="polite"
                data-dm-pending-status={pending ? 'pending' : 'idle'}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                  pending
                    ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                    : disposed
                      ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                {disposed ? 'Disposed' : pending ? 'Pending...' : 'Idle'}
              </output>

              <button
                type="button"
                data-dm-mobile-explorer-toggle="true"
                onClick={() => setMobileExplorerOpen(v => !v)}
                className={`${DM_CONTROL_BTN} lg:hidden border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100`}
              >
                {mobileExplorerOpen ? <PanelLeftClose className="w-4 h-4" aria-hidden="true" /> : <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />}
                {mobileExplorerOpen ? 'Hide Library' : 'Show Library'}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              data-dm-page-error={error.code || 'ERROR'}
              className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/35 px-3.5 py-2.5 text-xs text-red-900 dark:text-red-200 space-y-1"
            >
              <div className="flex items-center gap-2 font-black">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                <span>{error.code}: {error.message}</span>
              </div>
              <p className="text-[11px] text-red-800 dark:text-red-300">
                {explainReason(error.code)} Any active edits remain saved in your session drafts for review and retry.
              </p>
            </div>
          )}
        </header>

        {/* Responsive Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
          {/* Left Rail: Library Explorer */}
          <aside className={`${mobileExplorerOpen ? 'block' : 'hidden'} lg:block min-w-0`}>
            <DataManagementLibraryExplorer
              view={view}
              isPending={pending}
              onNavigate={handleNavigate}
              onDispatch={handleDispatch}
              getDraft={getDraft}
              setDraft={setDraft}
              clearDraft={clearDraft}
            />
          </aside>

          {/* Right Main Area */}
          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 pt-2">
              <div
                role="tablist"
                aria-label="Data Management sections"
                onKeyDown={handleTabKeyDown}
                className="flex flex-nowrap overflow-x-auto gap-1 -mb-px"
              >
                {SECTION_TABS.map(tab => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`dm-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      data-dm-tab={tab.id}
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-none min-h-11 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                        selected
                          ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div role="tabpanel" aria-labelledby={`dm-tab-${activeTab}`} className="space-y-4 min-w-0">
              {!workspaceSelected && (showAll || activeTab === 'workspace' || activeTab === 'editor') && (
                <section
                  data-dm-catalog-overview="true"
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      {selection.collectionId
                        ? `Collection Selected (${selection.collectionId})`
                        : selection.collectionId === null
                          ? 'Root Group Selected (collectionId: null)'
                          : 'Whole Library Overview ({})'}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Select any Workspace from the Library Explorer to inspect its metadata, edit Cards/Units/Segments, view speakers, audio associations, or preview owned source sync/detach. Whole Library scope enables Database Backup, Format Inspection, and Text Pack / External JSON initial import previews below.
                  </p>
                </section>
              )}

              {(showAll || activeTab === 'workspace') && (
                <DataManagementWorkspaceInspector
                  view={view}
                  isPending={pending}
                  onDispatch={handleDispatch}
                  getDraft={getDraft}
                  setDraft={setDraft}
                  clearDraft={clearDraft}
                  compact={compact}
                />
              )}

              {(showAll || activeTab === 'editor') && (
                <DataManagementStructuredEditor
                  view={view}
                  snapshot={currentSnapshot}
                  isPending={pending}
                  onNavigate={handleNavigate}
                  onDispatch={handleDispatch}
                  getDraft={getDraft}
                  setDraft={setDraft}
                  clearDraft={clearDraft}
                  compact={compact}
                />
              )}

              {(showAll || activeTab === 'audio' || activeTab === 'sources') && (
                <DataManagementAudioSourcesPanel
                  view={view}
                  onPreviewTransfer={handlePreviewTransfer}
                  samplePack={samplePack}
                  sampleExternalPackage={sampleExternalPackage}
                  showAudio={showAll || activeTab === 'audio'}
                  showSources={showAll || activeTab === 'sources'}
                />
              )}

              {(showAll || activeTab === 'transfers') && (
                <DataManagementTransfersDiagnosticsPanel
                  view={view}
                  snapshot={currentSnapshot}
                  sourceAttachments={sourceAttachments}
                  externalImports={externalImports}
                  extraMetaRecords={extraMetaRecords}
                  samplePack={samplePack}
                  sampleExternalPackage={sampleExternalPackage}
                  onNavigate={handleNavigate}
                  onExportData={handleExportData}
                  onInspectTransfer={handleInspectTransfer}
                  onPreviewTransfer={handlePreviewTransfer}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
