import React, { useMemo, useState } from 'react';
import { FileCode2, FileSearch, Lock, RefreshCw, ShieldAlert, Volume2 } from 'lucide-react';
import { summarizeTextStructuredAudioCoverage } from '../../../domain/text/textStructuredAudioCoverageDomain.js';
import { DM_INPUT_CLASS, DM_SMALL_BTN, explainReason } from './dataManagementUiUtils.js';

const COVERAGE_TONE = Object.freeze({
  ready: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200',
  stale: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200',
  'metadata-only': 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  'other-voice': 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200',
  'other-profile': 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200',
  'legacy-unverified': 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200',
  missing: 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
});

/**
 * Sections 5 & 6: Read-only Audio Inspector (AudioVariants, Full metadata, honest coverage)
 * and Source Management (Text Pack attachments, External JSON imports, pure sync/detach/reconcile previews).
 */
export default function DataManagementAudioSourcesPanel({
  view,
  onPreviewTransfer,
  samplePack = null,
  sampleExternalPackage = null,
  showAudio = true,
  showSources = true
}) {
  const [packInputJson, setPackInputJson] = useState(() => (
    samplePack ? JSON.stringify(samplePack, null, 2) : ''
  ));
  const [externalInputJson, setExternalInputJson] = useState(() => (
    sampleExternalPackage ? JSON.stringify(sampleExternalPackage, null, 2) : ''
  ));
  const [previewResult, setPreviewResult] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const workspace = view?.workspace;
  const workspaceId = workspace?.document?.id || null;
  const audio = workspace?.audio;
  const sources = workspace?.sources;

  const coverageMap = audio?.coverage || null;
  const documentTree = workspace?.documentTree || null;

  const coverageSummary = useMemo(() => {
    if (!coverageMap || !documentTree) return null;
    return summarizeTextStructuredAudioCoverage({
      documentTree,
      coverageMap
    });
  }, [coverageMap, documentTree]);

  if (!workspace) {
    return null;
  }

  const runPreview = (operation, optionsOrBuilder) => {
    setPreviewError(null);
    try {
      const options = typeof optionsOrBuilder === 'function' ? optionsOrBuilder() : optionsOrBuilder;
      const outcome = onPreviewTransfer({ operation, ...options });
      setPreviewResult(outcome);
    } catch (error) {
      setPreviewResult(null);
      setPreviewError({
        code: error?.code || 'INVALID_TRANSFER',
        message: error?.message || 'Preview failed.'
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Section 5: Audio Inspector */}
      {showAudio && (
      <section
        aria-label="Audio Inspector"
        data-dm-audio-inspector={workspaceId}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Audio Inspector (Metadata &amp; Honest Coverage)
            </h3>
          </div>
          <span
            data-dm-audio-readiness={audio?.readiness || 'not-evaluated'}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            readiness: {audio?.readiness || 'not-evaluated'}
          </span>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p>
            Metadata or historical download status never implies physical Ready. Only exact status <code className="font-mono font-bold">ready</code> backed by verified concrete runtime URL bindings qualifies as Ready. Full artifact metadata is never labelled Ready.
          </p>
        </div>

        {/* Coverage Evaluation */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2" data-dm-audio-coverage="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">Coverage Summary</h4>
          {!coverageSummary ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Coverage not evaluated (`not-evaluated`). Supply caller audio preferences and concrete runtime URL bindings to inspect channel coverage.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE.ready}`}>Ready: {coverageSummary.ready}/{coverageSummary.total}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE.stale}`}>Stale: {coverageSummary.stale}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE['metadata-only']}`}>Metadata Only: {coverageSummary.metadataOnly}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE['other-voice']}`}>Other Voice: {coverageSummary.otherVoice}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE['other-profile']}`}>Other Profile: {coverageSummary.otherProfile}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE['legacy-unverified']}`}>Legacy Unverified: {coverageSummary.legacyUnverified}</span>
                <span className={`px-2 py-0.5 rounded border ${COVERAGE_TONE.missing}`}>Missing: {coverageSummary.missing}</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {Object.entries(audio.coverage).map(([slotKey, slot]) => (
                  <div key={slotKey} className="flex items-center justify-between gap-2 text-[11px] border border-slate-100 dark:border-slate-800 rounded px-2 py-1">
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{slotKey}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${COVERAGE_TONE[slot.status] || COVERAGE_TONE.missing}`}>
                      {slot.status}{slot.deliveryStatus ? ` (${slot.deliveryStatus})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Full Audio Artifacts Metadata */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2" data-dm-full-artifacts="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            Full Audio Artifact Metadata by Card ({audio?.fullArtifacts?.filter(a => a.metadata).length || 0} recorded)
          </h4>
          {!audio?.fullArtifacts?.some(item => item.metadata) ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No Full Card artifact metadata recorded in this Workspace.</p>
          ) : (
            <div className="space-y-1.5">
              {audio.fullArtifacts.filter(item => item.metadata).map(item => (
                <div key={item.cardId} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{item.cardId}</span>
                    <span className="px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-[10px] font-black text-amber-800 dark:text-amber-200">
                      Metadata Only — Not Physical Ready
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all">
                    {JSON.stringify(item.metadata)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scoped AudioVariants */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2" data-dm-audio-variants="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            Scoped AudioVariants ({audio?.variants?.length || 0} via Segment FK)
          </h4>
          {!audio?.variants?.length ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No AudioVariant records bound to Segments in this Workspace.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {audio.variants.map(variant => (
                <div key={variant.id} data-dm-audio-variant-id={variant.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                      {variant.id} · {variant.segmentId} ({variant.channel})
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {variant.engine} · {variant.voiceId} · status: {variant.status || 'metadata'}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all">
                    {variant.uid} · RF: {variant.metadata?.audioRenderFingerprintV1 || 'none'}
                    {variant.metadata?.contentInvalidatedV1 ? ' · contentInvalidatedV1: true' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1" data-dm-audio-disabled-controls="true">
          <button type="button" disabled title="AudioVariant deletion is disabled in P15 Data Management" className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}>
            <Lock className="w-3 h-3" aria-hidden="true" /> Delete AudioVariant (Disabled)
          </button>
          <button type="button" disabled title="Physical audio generation / Staging GC is out of scope for Data Management" className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}>
            <Lock className="w-3 h-3" aria-hidden="true" /> Generate / GC Physical Audio (Disabled)
          </button>
        </div>
      </section>
      )}

      {/* Section 6: Source Management */}
      {showSources && (
      <section
        aria-label="Source Management"
        data-dm-source-inspector={workspaceId}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Source Management &amp; Pure Previews (`applyEnabled: false`)
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200">
            Preview Only · No Destructive Apply
          </span>
        </div>

        {/* Owned Text Pack Attachments */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5" data-dm-source-attachments="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            Owned Text Pack Attachments ({sources?.attachments?.length || 0})
          </h4>
          {!sources?.attachments?.length ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This Workspace is not attached to any supplied Text Pack source record.
            </p>
          ) : (
            <div className="space-y-2.5">
              <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>Text Pack JSON for Sync Preview</span>
                <textarea
                  aria-label="Text Pack JSON for Source Sync Preview"
                  value={packInputJson}
                  onChange={e => setPackInputJson(e.target.value)}
                  rows={3}
                  placeholder="Paste prolingo-text-pack JSON for source-sync preview"
                  className={`${DM_INPUT_CLASS} font-mono text-[11px] resize-y`}
                />
              </label>

              {sources.attachments.map(att => {
                const ownedDocIds = [...new Set(Object.values(att.idMap?.documents || {}))];
                const isMultiWorkspace = ownedDocIds.length !== 1;
                return (
                  <div key={att.attachmentId} data-dm-attachment-id={att.attachmentId} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {att.packageId} ({att.attachmentId})
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        scope: {att.scopeType} · docs: {ownedDocIds.length} · status: {att.status}
                      </span>
                    </div>
                    {isMultiWorkspace && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200 font-bold" data-dm-multi-workspace-source-disabled={att.attachmentId}>
                        COLLECTION_SOURCE_SCOPE_REQUIRED: {explainReason('COLLECTION_SOURCE_SCOPE_REQUIRED')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        data-dm-preview-source-sync={att.attachmentId}
                        disabled={isMultiWorkspace || !packInputJson.trim()}
                        onClick={() => runPreview('source-sync', () => ({ attachmentId: att.attachmentId, data: JSON.parse(packInputJson) }))}
                        title={isMultiWorkspace ? explainReason('COLLECTION_SOURCE_SCOPE_REQUIRED') : 'Compute pure source-sync preview'}
                        className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        Preview Source Sync
                      </button>
                      <button
                        type="button"
                        data-dm-preview-source-detach={att.attachmentId}
                        disabled={isMultiWorkspace}
                        onClick={() => runPreview('source-detach', { attachmentId: att.attachmentId })}
                        title={isMultiWorkspace ? explainReason('COLLECTION_SOURCE_SCOPE_REQUIRED') : 'Compute pure non-destructive detach preview'}
                        className={`${DM_SMALL_BTN} border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200`}
                      >
                        Preview Source Detach (Preserve Data)
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Sync apply and destructive source removal are disabled in P15-H1"
                        className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}
                      >
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        Apply / Remove Source (Disabled)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Owned External JSON Imports */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5" data-dm-external-imports="true">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            Owned External JSON Imports ({sources?.externalImports?.length || 0})
          </h4>
          {!sources?.externalImports?.length ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This Workspace is not bound to an External JSON import record.
            </p>
          ) : (
            <div className="space-y-2.5">
              <label className="block space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>External JSON Package for Reconciliation Inspect Preview</span>
                <textarea
                  aria-label="External JSON Package for Reconciliation Preview"
                  value={externalInputJson}
                  onChange={e => setExternalInputJson(e.target.value)}
                  rows={3}
                  placeholder="Paste prolingo-text-external JSON package"
                  className={`${DM_INPUT_CLASS} font-mono text-[11px] resize-y`}
                />
              </label>

              {sources.externalImports.map(record => (
                <div key={record.externalSourceKey} data-dm-external-record={record.externalSourceKey} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-900 dark:text-slate-100">{record.externalSourceKey}</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      rev {record.revision ?? 1} · {record.documentId}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      data-dm-preview-external-reconcile={record.externalSourceKey}
                      disabled={!externalInputJson.trim()}
                      onClick={() => runPreview('external-json-inspect', () => ({ data: JSON.parse(externalInputJson) }))}
                      className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300`}
                    >
                      <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
                      Preview External Reconciliation
                    </button>
                    <button
                      type="button"
                      disabled
                      title="External JSON reconciliation apply is disabled in P15-H1"
                      className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-500`}
                    >
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      Apply Reconciliation (Disabled)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {previewError && (
          <div role="alert" data-dm-source-preview-error="true" className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/35 p-3 text-xs font-bold text-red-800 dark:text-red-200">
            <span className="font-mono uppercase mr-1.5">{previewError.code}</span>
            {previewError.message}
          </div>
        )}

        {previewResult && (
          <div data-dm-source-preview-result={previewResult.operation} className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-black text-emerald-900 dark:text-emerald-200">
                Source Preview: {previewResult.operation}
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                applyEnabled: {String(previewResult.applyEnabled)}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">
              {previewResult.plan?.counts
                ? `counts: ${JSON.stringify(previewResult.plan.counts)}`
                : previewResult.plan?.summary
                  ? `status: ${previewResult.plan.status} · summary: ${JSON.stringify(previewResult.plan.summary)}`
                  : `ok: ${String(previewResult.plan?.ok ?? true)}`}
            </p>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
