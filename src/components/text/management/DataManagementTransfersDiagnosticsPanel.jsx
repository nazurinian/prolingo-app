import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Download, FileJson, Lock, Upload } from 'lucide-react';
import {
  buildCompleteBackupMetaRecords,
  DM_INPUT_CLASS,
  DM_SMALL_BTN,
  explainReason
} from './dataManagementUiUtils.js';

/**
 * Section 7: Import/Export (Text Pack, Metadata-Complete Database Backup, External JSON),
 * Pure Format Inspection & Import Previews (applyEnabled: false), and Library Diagnostics.
 */
export default function DataManagementTransfersDiagnosticsPanel({
  view,
  snapshot,
  sourceAttachments = [],
  externalImports = [],
  extraMetaRecords = [],
  persistenceMode = 'in-memory',
  persistenceDbName = null,
  onExportAuthoritativeBackup = null,
  samplePack = null,
  sampleExternalPackage = null,
  onNavigate,
  onExportData,
  onInspectTransfer,
  onPreviewTransfer
}) {
  const [inspectKind, setInspectKind] = useState('database-backup');
  const [transferJson, setTransferJson] = useState(() => (
    sampleExternalPackage ? JSON.stringify(sampleExternalPackage, null, 2) : ''
  ));
  const [exportedPayload, setExportedPayload] = useState(null);
  const [exportPending, setExportPending] = useState(false);
  const [inspectResult, setInspectResult] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [transferError, setTransferError] = useState(null);

  const isDisposableDb = persistenceMode === 'disposable-idb' && typeof onExportAuthoritativeBackup === 'function';
  const selection = view?.selection || {};
  const diagnostics = view?.diagnostics;
  const hasExportScope = Boolean(selection.workspaceId || selection.collectionId);
  const isWholeLibrary = selection.collectionId === undefined && !selection.workspaceId;

  const runSafely = fn => {
    setTransferError(null);
    try {
      fn();
    } catch (error) {
      setTransferError({
        code: error?.code || 'INVALID_TRANSFER',
        message: error?.message || 'Transfer action failed.'
      });
    }
  };

  const handleExportTextPack = () => runSafely(() => {
    const pack = onExportData({ kind: 'text-pack' });
    setExportedPayload({ kind: 'text-pack', origin: isDisposableDb ? 'session-snapshot' : 'in-memory-preview', data: pack });
    setInspectKind('text-pack');
    setTransferJson(JSON.stringify(pack, null, 2));
  });

  const handleExportBackup = async () => {
    setTransferError(null);
    if (isDisposableDb) {
      setExportPending(true);
      try {
        const backup = await onExportAuthoritativeBackup();
        setExportedPayload({
          kind: 'database-backup',
          origin: 'authoritative-disposable-idb',
          dbName: persistenceDbName,
          data: backup
        });
        setInspectKind('database-backup');
        setTransferJson(JSON.stringify(backup, null, 2));
      } catch (error) {
        setTransferError({
          code: error?.code || 'INVALID_TRANSFER',
          message: error?.message || 'Authoritative disposable database backup failed.'
        });
      } finally {
        setExportPending(false);
      }
      return;
    }
    runSafely(() => {
      const metaRecords = buildCompleteBackupMetaRecords(snapshot, {
        sourceAttachments,
        externalImports,
        extraMetaRecords
      });
      const backup = onExportData({ kind: 'database-backup', metaRecords });
      setExportedPayload({
        kind: 'database-backup',
        origin: 'in-memory-preview',
        data: backup
      });
      setInspectKind('database-backup');
      setTransferJson(JSON.stringify(backup, null, 2));
    });
  };

  const handleVerifyBackupWithoutMeta = () => runSafely(() => {
    onExportData({ kind: 'database-backup', metaRecords: null });
  });

  const handleInspect = () => runSafely(() => {
    const result = onInspectTransfer({ kind: inspectKind, data: transferJson });
    setInspectResult(result);
  });

  const handlePreview = operation => runSafely(() => {
    const parsed = typeof transferJson === 'string' && transferJson.trim()
      ? JSON.parse(transferJson)
      : (operation === 'text-pack-copy' ? samplePack : sampleExternalPackage);
    const result = onPreviewTransfer({ operation, data: parsed });
    setPreviewResult(result);
  });

  return (
    <div className="space-y-4">
      {/* Safe Pure Exports */}
      <section
        aria-label="Exports and Transfers"
        data-dm-transfers-panel="true"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Import / Export &amp; Pure Transfer Inspection
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5" data-dm-backup-policy-labels="true">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              No Physical Audio Binaries
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              Canonical Backup Unavailable in H2
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              applyEnabled: false
            </span>
          </div>
        </div>

        {/* Export Controls */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5" data-dm-exports="true">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
              {isDisposableDb ? 'Authoritative Disposable QA JSON Backup' : 'In-Memory JSON Preview (Non-Authoritative Fixture)'}
            </h4>
            <span
              data-dm-backup-origin-badge={isDisposableDb ? 'authoritative-disposable-idb' : 'in-memory-preview'}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isDisposableDb
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {isDisposableDb
                ? `Authoritative disposable QA JSON backup (${persistenceDbName})`
                : 'In-memory JSON preview (fixture build helper)'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {isDisposableDb
              ? 'Exports directly from IndexedDB via adapter.exportBackup() inside a single consistent readonly transaction (no synthetic helper metaRecords). No physical audio binaries are embedded; canonical backup remains unavailable in H2.'
              : 'Simulates a fixture JSON backup in memory using buildCompleteBackupMetaRecords(). This preview is not an authoritative IndexedDB database read; no physical audio binaries are embedded and canonical backup remains unavailable in H2.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-dm-export-text-pack="true"
              disabled={!hasExportScope || exportPending}
              onClick={handleExportTextPack}
              title={hasExportScope ? 'Export selected Collection or Workspace as Text Pack JSON' : explainReason('SELECT_EXPORT_SCOPE')}
              className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200`}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Scoped Text Pack
            </button>
            <button
              type="button"
              data-dm-export-backup="true"
              disabled={exportPending}
              onClick={handleExportBackup}
              className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200`}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              {isDisposableDb
                ? (exportPending ? 'Exporting Consistent DB Backup...' : 'Export Authoritative Disposable DB Backup')
                : 'Preview In-Memory DB Backup JSON'}
            </button>
            <button
              type="button"
              data-dm-export-backup-missing-meta="true"
              disabled={exportPending}
              onClick={handleVerifyBackupWithoutMeta}
              className={`${DM_SMALL_BTN} border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200`}
            >
              Verify Missing-Metadata Backup Rejection
            </button>
          </div>
          {!hasExportScope && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Text Pack export requires selecting a Collection or Workspace (`SELECT_EXPORT_SCOPE`).
            </p>
          )}
          {exportedPayload && (
            <div
              data-dm-export-output={exportedPayload.kind}
              data-dm-export-origin={exportedPayload.origin}
              className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-black text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {exportedPayload.kind === 'database-backup'
                    ? (exportedPayload.origin === 'authoritative-disposable-idb'
                        ? `Authoritative disposable QA JSON backup (${exportedPayload.dbName})`
                        : 'In-memory JSON preview exported (non-authoritative fixture)')
                    : `Exported ${exportedPayload.kind}`}
                </span>
                {exportedPayload.kind === 'database-backup' && (
                  <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                    audioBinaryIncluded: {String(exportedPayload.data.audioBinaryIncluded)} (No physical audio binaries) · metaRecords: {exportedPayload.data.metaRecords?.length || 0}
                  </span>
                )}
              </div>
              {exportedPayload.kind === 'text-pack' && (
                <p className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
                  packageId: {exportedPayload.data.packageId} · scope: {exportedPayload.data.scope?.type} ({exportedPayload.data.scope?.rootId})
                </p>
              )}
            </div>
          )}
        </div>

        {/* Inspect & Import Previews */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5" data-dm-transfer-inspect="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            Transfer Format Inspector &amp; Import Previews
          </h4>

          <div className="flex flex-wrap gap-1.5">
            <select
              aria-label="Inspect transfer kind"
              data-dm-inspect-kind="true"
              value={inspectKind}
              onChange={e => setInspectKind(e.target.value)}
              className={`${DM_INPUT_CLASS} w-auto min-w-44`}
            >
              <option value="database-backup">database-backup</option>
              <option value="text-pack">text-pack</option>
              <option value="external-json">external-json</option>
            </select>

            {samplePack && (
              <button
                type="button"
                data-dm-load-sample-pack="true"
                onClick={() => { setInspectKind('text-pack'); setTransferJson(JSON.stringify(samplePack, null, 2)); }}
                className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
              >
                Load Sample Text Pack
              </button>
            )}
            {sampleExternalPackage && (
              <button
                type="button"
                data-dm-load-sample-external="true"
                onClick={() => { setInspectKind('external-json'); setTransferJson(JSON.stringify(sampleExternalPackage, null, 2)); }}
                className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
              >
                Load Sample External JSON
              </button>
            )}
            <button
              type="button"
              data-dm-load-malformed-json="true"
              onClick={() => { setTransferJson('{ malformed json'); }}
              className={`${DM_SMALL_BTN} border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200`}
            >
              Load Malformed JSON
            </button>
          </div>

          <textarea
            aria-label="Transfer payload JSON"
            data-dm-transfer-json-input="true"
            value={transferJson}
            onChange={e => setTransferJson(e.target.value)}
            rows={4}
            placeholder="Paste database-backup, text-pack, or external-json payload"
            className={`${DM_INPUT_CLASS} font-mono text-[11px] resize-y`}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-dm-run-inspect-transfer="true"
              onClick={handleInspect}
              className={`${DM_SMALL_BTN} border-indigo-600 bg-indigo-600 text-white`}
            >
              Inspect Format (`inspectTransfer`)
            </button>

            <button
              type="button"
              data-dm-preview-pack-copy="true"
              onClick={() => handlePreview('text-pack-copy')}
              title={isWholeLibrary ? 'Preview Text Pack copy merge' : 'Requires Whole Library scope (triggers OUT_OF_SCOPE if clicked outside {})'}
              className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Preview Text Pack Copy
            </button>

            <button
              type="button"
              data-dm-preview-external-import="true"
              onClick={() => handlePreview('external-json-import')}
              title={isWholeLibrary ? 'Preview External JSON initial import' : 'Requires Whole Library scope'}
              className={`${DM_SMALL_BTN} border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Preview External JSON Import
            </button>
          </div>

          {!isWholeLibrary && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Import copy/initial-import previews require Whole Library scope (`{}`).
              <button
                type="button"
                onClick={() => onNavigate({})}
                className="ml-1.5 underline font-bold text-indigo-600 dark:text-indigo-400"
              >
                Select Whole Library
              </button>
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1" data-dm-transfer-disabled-apply="true">
            <button type="button" disabled title="Import, source-sync, and reconciliation apply actions are disabled in P15-H2" className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}>
              <Lock className="w-3 h-3" aria-hidden="true" /> Apply Import / Source Reconcile (Disabled)
            </button>
            <button type="button" disabled title="Database Replace Restore is destructive and disabled in P15-H2" className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}>
              <Lock className="w-3 h-3" aria-hidden="true" /> Execute Replace-Restore (Disabled)
            </button>
            <button type="button" disabled title="Physical Audio ZIP extraction, Staging GC, and production migration are disabled in P15-H2" className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}>
              <Lock className="w-3 h-3" aria-hidden="true" /> Staging GC / Production Migration (Disabled)
            </button>
          </div>

          {transferError && (
            <div role="alert" data-dm-transfer-error="true" className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/35 px-3 py-2 text-xs font-bold text-red-800 dark:text-red-200">
              <span className="font-mono uppercase mr-1.5">{transferError.code}</span>
              {transferError.message}
            </div>
          )}

          {inspectResult && (
            <div data-dm-inspect-result={inspectResult.kind} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-black text-slate-900 dark:text-slate-100">
                  Inspected Format: {inspectResult.kind}
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  applyEnabled: {String(inspectResult.applyEnabled)}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-600 dark:text-slate-300 break-all">
                {inspectResult.kind === 'database-backup'
                  ? `schemaVersion: ${inspectResult.snapshot?.schemaVersion} · audioVariants: ${inspectResult.snapshot?.audioVariants?.length || 0} · diagnostics: ${JSON.stringify(inspectResult.diagnostics)}`
                  : inspectResult.kind === 'text-pack'
                    ? `packageId: ${inspectResult.pack?.packageId} · documents: ${inspectResult.pack?.data?.documents?.length || 0}`
                    : `externalSourceKey: ${inspectResult.package?.externalSourceKey} · cards: ${inspectResult.package?.workspace?.cards?.length || 0}`}
              </p>
            </div>
          )}

          {previewResult && (
            <div data-dm-transfer-preview-result={previewResult.operation} className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-black text-emerald-900 dark:text-emerald-200">
                  Pure Import Preview: {previewResult.operation}
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                  applyEnabled: {String(previewResult.applyEnabled)}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all">
                {previewResult.plan?.counts ? `counts: ${JSON.stringify(previewResult.plan.counts)}` : ''}
                {previewResult.plan?.snapshot ? ` · planned docs: ${previewResult.plan.snapshot.documents?.length}` : ''}
                {previewResult.plan?.importRecord ? ` · externalKey: ${previewResult.plan.importRecord.externalSourceKey}` : ''}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Diagnostics */}
      {diagnostics && (
        <section
          aria-label="Library Diagnostics"
          data-dm-diagnostics="true"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Library Capability &amp; Integrity Diagnostics
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200">
              canonicalWrites: {String(diagnostics.canonicalWrites)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {Object.entries(diagnostics.counts || {}).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{key}</p>
                <p className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1.5">
            <p className="font-bold text-slate-800 dark:text-slate-200">
              Migration status: <span className="font-mono">{diagnostics.migration}</span> · Schema: <span className="font-mono">v{view.schemaVersion}</span>
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              Unresolved Text Pack attachment Workspace IDs:{' '}
              {diagnostics.unresolvedAttachmentWorkspaceIds?.length > 0 ? (
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  {diagnostics.unresolvedAttachmentWorkspaceIds.join(', ')}
                </span>
              ) : (
                <span className="font-mono text-emerald-700 dark:text-emerald-300">none</span>
              )}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              Unresolved External JSON import Workspace IDs:{' '}
              {diagnostics.unresolvedExternalWorkspaceIds?.length > 0 ? (
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">
                  {diagnostics.unresolvedExternalWorkspaceIds.join(', ')}
                </span>
              ) : (
                <span className="font-mono text-emerald-700 dark:text-emerald-300">none</span>
              )}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
