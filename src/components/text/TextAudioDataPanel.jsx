import React, { useRef, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Database, FolderOpen, HardDrive, Layers, RefreshCw, Trash2, Upload, X } from 'lucide-react';

const clean = value => String(value ?? '').trim();
const formatBytes = value => {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const voiceLabel = value => {
  const text = clean(value);
  const neural = text.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  return neural?.[1] || text || 'Unknown';
};

export const TextAudioDataPanel = ({ audioLibrary = null, compact = false, embedded = false, disabled = false }) => {
  const [expanded, setExpanded] = useState(!compact || embedded);
  const zipInputRef = useRef(null);
  if (!audioLibrary) return null;

  const staging = audioLibrary.staging || {};
  const folder = audioLibrary.folderState || {};
  const zip = audioLibrary.zipState || {};
  const coverage = audioLibrary.coverage || {};
  const inventory = audioLibrary.inventory || {};
  const voices = Array.isArray(inventory.voices) ? inventory.voices : [];
  const archiveCount = zip.archives?.length || 0;
  const isOpen = embedded ? true : expanded;

  return <section className={`w-full min-w-0 rounded-xl border ${embedded ? 'border-emerald-200/80 dark:border-emerald-900/70 bg-white/90 dark:bg-slate-900/50' : 'border-violet-200 dark:border-violet-900 bg-violet-50/45 dark:bg-violet-950/15'} overflow-hidden`} data-text-audio-data-panel="true">
    {!embedded && (
      <button type="button" onClick={() => setExpanded(value => !value)} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-left" aria-expanded={isOpen}>
        {isOpen ? <ChevronDown className="w-4 h-4 text-violet-500"/> : <ChevronRight className="w-4 h-4 text-violet-500"/>}
        <HardDrive className="w-4 h-4 text-violet-600 dark:text-violet-300"/>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Text Audio Library</p>
          <p className="text-[9px] text-slate-400 truncate">Ready {coverage.ready || 0}/{coverage.total || 0} • need {coverage.needDownload || 0} • Staging + Portable ZIP</p>
        </div>
        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-violet-100 dark:border-violet-900 text-violet-600 dark:text-violet-300">{inventory.ready || 0} LOCAL</span>
      </button>
    )}

    {isOpen && <div className={`${!embedded ? 'border-t border-violet-100 dark:border-violet-900' : ''} p-3 space-y-3`} data-text-audio-data-panel-details="true">
      {/* 1. Ready / Missing / Stale / History Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center" data-text-audio-library-indicators="true">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/25 px-2.5 py-2">
          <p className="text-base font-black leading-tight text-emerald-600 dark:text-emerald-400">{coverage.ready || 0}</p>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Ready</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-2.5 py-2">
          <p className="text-base font-black leading-tight text-slate-600 dark:text-slate-300">{coverage.missing || 0}</p>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Missing</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/25 px-2.5 py-2">
          <p className="text-base font-black leading-tight text-amber-600 dark:text-amber-400">{(coverage.otherVoice || 0) + (coverage.stale || 0)}</p>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Stale / Other</p>
        </div>
        <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/25 px-2.5 py-2">
          <p className="text-base font-black leading-tight text-sky-600 dark:text-sky-400">{coverage.downloaded || 0}</p>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">History*</p>
        </div>
      </div>

      <p className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-2.5 py-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300" data-text-audio-history-explanation="true">
        <b>Ready</b> = playable local file is present. <b>History</b> = a downloaded/generated voice was recorded, but its local binary may be absent. <b>Stale / Other</b> = text changed or audio is under another voice. <b>Missing</b> = no matching playable file.
      </p>

      {/* 2. Available Local Voices */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 space-y-2" data-text-audio-library-voices="true">
        <div className="flex items-center justify-between gap-2" data-text-library-row="title">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Available Local Voices</p>
          <span className="shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-black text-slate-600 dark:text-slate-300">
            {voices.length} voice{voices.length === 1 ? '' : 's'}
          </span>
        </div>
        <div data-text-library-row="metadata">
          {voices.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {voices.map(voice => (
                <span
                  key={voice.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[9px] font-black text-slate-700 dark:text-slate-200"
                  title={`${voice.id} • ${voice.sources?.join(', ') || 'local'}`}
                >
                  <span>{voiceLabel(voice.id)}</span>
                  <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">{voice.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[9px] leading-relaxed text-slate-400">
              No local Edge voices staged for this Workspace yet. Generate audio or import a Portable Audio ZIP below.
            </p>
          )}
        </div>
      </div>

      {/* 3. Portable ZIP Import */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-900/80 bg-white dark:bg-slate-900/40 p-3 space-y-2.5" data-text-audio-library-zip="true">
        <div className="flex items-center justify-between gap-2" data-text-library-row="title">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0"/>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 truncate">Portable Audio ZIP</p>
          </div>
          <span className="shrink-0 rounded-md bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 text-[8px] font-black text-violet-700 dark:text-violet-300">
            {archiveCount} archive{archiveCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="space-y-1.5" data-text-library-row="metadata">
          <p className="text-[9px] leading-relaxed text-slate-600 dark:text-slate-300">
            Split matched: <b>{zip.splitMatchedCount || 0}</b> • Full matched: <b>{zip.fullMatchedCount || 0}</b> • Orphan: <b>{zip.orphanCount || 0}</b>
            {zip.aliasMatchedCount ? ` • ${zip.aliasMatchedCount} source-ID reconnected` : ''}
            {zip.legacyCount ? ` • ${zip.legacyCount} legacy unresolved` : ''}
          </p>
          <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
            Importing a Portable ZIP validates its manifest and merges matching Split & Full audio into IndexedDB Staging additively.
          </p>
        </div>

        {archiveCount > 0 && (
          <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1">
            {(zip.archives || []).map(archive => (
              <div key={archive.id} className="flex items-center gap-2 rounded-lg bg-violet-50/70 dark:bg-violet-950/30 px-2.5 py-1.5 text-[9px]">
                <Layers className="w-3 h-3 text-violet-500 shrink-0"/>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{archive.name}</span>
                <span className="shrink-0 font-bold text-violet-700 dark:text-violet-300">Split {archive.splitMatchedCount || 0} • Full {archive.fullMatchedCount || 0}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800" data-text-library-row="actions">
          <input ref={zipInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" multiple className="hidden" onChange={async event => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (files.length) await audioLibrary.onAddZipFiles?.(files);
          }}/>
          <button
            type="button"
            disabled={disabled}
            onClick={() => zipInputRef.current?.click()}
            data-text-audio-import-zip="true"
            className="min-h-9 flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-black disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5"/>
            <span>Import ZIP</span>
          </button>
          {archiveCount > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (typeof window !== 'undefined' && !window.confirm(`Clear ${archiveCount} Portable ZIP source record(s)? Original ZIP files will not be deleted; audio already imported into Staging will also remain.`)) return;
                audioLibrary.onClearZip?.();
              }}
              className="min-h-9 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[9px] font-black text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 inline-flex items-center justify-center gap-1"
              title="Detach Portable ZIP source list (imported Staging audio remains)"
            >
              <X className="w-3.5 h-3.5"/>
              <span>Clear ZIP List</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. IndexedDB Staging (with Refresh Cache & Guarded Clear Staging) */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/80 bg-white dark:bg-slate-900/40 p-3 space-y-2.5" data-text-audio-staging="true">
        <div className="flex items-center justify-between gap-2" data-text-library-row="title">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"/>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 truncate">Text Staging (IndexedDB)</p>
          </div>
          <span className="shrink-0 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[8px] font-black text-emerald-700 dark:text-emerald-300">
            {staging.count || 0} file{(staging.count || 0) === 1 ? '' : 's'} • {formatBytes(staging.bytes || 0)}
          </span>
        </div>

        <div data-text-library-row="metadata">
          <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
            Generated Edge audio and imported ZIP audio are stored in IndexedDB Staging ({staging.count || 0} binary file(s) • {formatBytes(staging.bytes || 0)}) for instant offline playback.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800" data-text-library-row="actions">
          <button
            type="button"
            disabled={disabled}
            onClick={audioLibrary.onClearRuntimeCache}
            data-text-audio-refresh-cache="true"
            className="min-h-9 flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[9px] font-black text-slate-700 dark:text-slate-200 hover:border-slate-300 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3"/>
            <span>Refresh Cache</span>
          </button>
          <button
            type="button"
            disabled={disabled || !(staging.count > 0)}
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm(`Clear ${staging.count || 0} app-owned staged audio file(s) (${formatBytes(staging.bytes || 0)})? This does not delete your original Portable ZIP files.`)) return;
              audioLibrary.onClearStaging?.();
            }}
            data-text-audio-clear-staging="true"
            className="min-h-9 flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[9px] font-black text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-35 transition-colors inline-flex items-center justify-center gap-1.5"
            title="Release Text Staging binary but keep Text metadata/history"
          >
            <Trash2 className="w-3 h-3"/>
            <span>Clear Staging</span>
          </button>
        </div>
      </div>

      {/* 5. Deprecated Folder Lock */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0"/>
            <div className="min-w-0">
              <p className="text-[9px] font-black text-slate-500 dark:text-slate-400">Audio Folder • Deprecated</p>
              <p className="text-[8px] text-slate-400 truncate">Replaced by Staging + Portable ZIP in beta.8</p>
            </div>
          </div>
          <button type="button" disabled className="shrink-0 min-h-8 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-400 opacity-60">LOCKED</button>
        </div>
      </div>

      {(zip.legacyCount || folder.legacyCount) > 0 && <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">Legacy filenames such as <span className="font-mono">TEXT_000002_en-GB-SoniaNeural_text</span> are detected but intentionally not auto-bound.</p>}
    </div>}
  </section>;
};

export default TextAudioDataPanel;
