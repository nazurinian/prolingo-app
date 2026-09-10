import React, { useRef, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, FolderOpen, HardDrive, Layers, Upload, X } from 'lucide-react';

const clean = value => String(value ?? '').trim();
const voiceLabel = value => {
  const text = clean(value);
  const neural = text.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  return neural?.[1] || text || 'Unknown';
};

export const TextAudioDataPanel = ({ audioLibrary = null, compact = false, disabled = false }) => {
  const [expanded, setExpanded] = useState(!compact);
  const zipInputRef = useRef(null);
  if (!audioLibrary) return null;

  const folder = audioLibrary.folderState || {};
  const zip = audioLibrary.zipState || {};
  const coverage = audioLibrary.coverage || {};
  const inventory = audioLibrary.inventory || {};
  const voices = Array.isArray(inventory.voices) ? inventory.voices : [];
  const reconnect = folder.status === 'reconnect-required';
  const archiveCount = zip.archives?.length || 0;

  return <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/45 dark:bg-violet-950/15 overflow-hidden" data-text-audio-data-panel="true">
    <button type="button" onClick={() => setExpanded(value => !value)} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-left" aria-expanded={expanded}>
      {expanded ? <ChevronDown className="w-4 h-4 text-violet-500"/> : <ChevronRight className="w-4 h-4 text-violet-500"/>}
      <HardDrive className="w-4 h-4 text-violet-600 dark:text-violet-300"/>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">Text Audio Library</p>
        <p className="text-[8px] text-slate-400 truncate">Ready {coverage.ready || 0}/{coverage.total || 0} • need {coverage.needDownload || 0} • Folder + ZIP</p>
      </div>
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-violet-100 dark:border-violet-900 text-violet-600 dark:text-violet-300">{inventory.ready || 0} LOCAL</span>
    </button>

    {expanded && <div className="border-t border-violet-100 dark:border-violet-900 p-2.5 space-y-2" data-text-audio-data-panel-details="true">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900/40 p-2"><p className="text-sm font-black text-emerald-600">{coverage.ready || 0}</p><p className="text-[7px] font-black uppercase text-slate-400">Ready</p></div>
        <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900/40 p-2"><p className="text-sm font-black text-sky-600">{coverage.downloaded || 0}</p><p className="text-[7px] font-black uppercase text-slate-400">Downloaded*</p></div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-900/40 p-2"><p className="text-sm font-black text-amber-600">{(coverage.otherVoice || 0) + (coverage.stale || 0)}</p><p className="text-[7px] font-black uppercase text-slate-400">Other/Stale</p></div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2"><p className="text-sm font-black text-slate-500">{coverage.missing || 0}</p><p className="text-[7px] font-black uppercase text-slate-400">Missing</p></div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-indigo-500"/>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Audio Folder</p>
            <p className="text-[8px] text-slate-400 truncate">{folder.name || 'No remembered folder'} • {folder.matchedCount || 0} matched{folder.aliasMatchedCount ? ` • ${folder.aliasMatchedCount} source-ID reconnected` : ''}{folder.legacyCount ? ` • ${folder.legacyCount} legacy unresolved` : ''}</p>
          </div>
          <button type="button" disabled={disabled} onClick={reconnect ? audioLibrary.onReconnectFolder : audioLibrary.onChooseFolder} className="min-h-10 px-2.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[8px] font-black text-indigo-600 dark:text-indigo-300 disabled:opacity-40">{reconnect ? 'Reconnect' : (folder.name ? 'Change' : 'Choose')}</button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-violet-500"/>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-slate-600 dark:text-slate-300">Audio ZIP Archive</p>
            <p className="text-[8px] text-slate-400 truncate">{archiveCount} ZIP • {zip.matchedCount || 0} matched • {zip.orphanCount || 0} orphan{zip.aliasMatchedCount ? ` • ${zip.aliasMatchedCount} source-ID reconnected` : ''}{zip.legacyCount ? ` • ${zip.legacyCount} legacy unresolved` : ''}</p>
          </div>
          <input ref={zipInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" multiple className="hidden" onChange={async event => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (files.length) await audioLibrary.onAddZipFiles?.(files);
          }}/>
          <button type="button" disabled={disabled} onClick={() => zipInputRef.current?.click()} className="min-h-10 px-2.5 py-2 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-40"><Upload className="w-3 h-3 inline mr-1"/>Add ZIP</button>
          {archiveCount > 0 && <button type="button" disabled={disabled} onClick={audioLibrary.onClearZip} className="w-10 h-10 flex items-center justify-center rounded-lg border border-red-100 dark:border-red-900 text-red-500 disabled:opacity-40" title="Clear Text ZIP archives"><X className="w-3.5 h-3.5"/></button>}
        </div>
        {archiveCount > 0 && <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
          {(zip.archives || []).map(archive => <div key={archive.id} className="flex items-center gap-2 rounded-md bg-violet-50/60 dark:bg-violet-950/20 px-2 py-1 text-[8px]">
            <Layers className="w-3 h-3 text-violet-400 shrink-0"/><span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-300">{archive.name}</span><span className="text-slate-400">{archive.matchedCount || 0}{archive.aliasMatchedCount ? ` • ${archive.aliasMatchedCount} alias` : ''}</span>
          </div>)}
        </div>}
        <p className="text-[8px] leading-relaxed text-slate-400">ZIP is session-bound and read lazily: ProLingo indexes filenames first, then opens only the requested audio entry. Folder remains active.</p>
      </div>

      {voices.length > 0 && <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2.5">
        <p className="text-[8px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Detected local voices</p>
        <div className="flex flex-wrap gap-1">
          {voices.map(voice => <span key={voice.id} className="px-1.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[8px] font-black text-slate-600 dark:text-slate-300" title={`${voice.id} • ${voice.sources?.join(', ') || 'local'}`}>{voiceLabel(voice.id)} <span className="font-normal text-slate-400">{voice.count}</span></span>)}
        </div>
      </div>}

      {(zip.legacyCount || folder.legacyCount) > 0 && <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 px-2.5 py-2 text-[8px] leading-relaxed text-amber-700 dark:text-amber-300">Legacy filenames such as <span className="font-mono">TEXT_000002_en-GB-SoniaNeural_text</span> are detected but intentionally not auto-bound. They do not contain the structured SEGMENT_ID + TXTAUDIO_ID contract and still require a separate migration audit.</p>}
    </div>}
  </section>;
};

export default TextAudioDataPanel;
