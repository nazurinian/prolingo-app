import React from 'react';
import { createPortal } from 'react-dom';
import { Download, FileAudio, Loader2, Lock, RefreshCw, Trash2, X } from 'lucide-react';
import { getAdvancedExpressionPairs, getItemPartText, isIndonesianAudioPart } from '../../utils/audioUtils';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';

const SOURCE_LABEL = Object.freeze({
  staging: 'IndexedDB Staging',
  folder: 'Audio Folder',
  zip: 'Audio ZIP',
  generated: 'Runtime generated',
  legacy: 'Legacy local'
});

const parseActionState = value => Object.fromEntries(String(value || '').split('|').filter(Boolean).map(entry => {
  const [part, sourceType, mp3, zip, voiceId] = entry.split(':');
  return [part, { sourceType, mp3Exported: mp3 === '1', zipExported: zip === '1', voiceId: voiceId || null }];
}));

const playbackKeyForAudioPart = part => {
  if (part === 'word') return 'word_en';
  if (part === 'word_idn') return 'word_idn';
  if (part === 'sentence') return 'sentence_en';
  if (part === 'meaning') return 'sentence_idn';
  return part;
};

const compactVoiceLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const tail = raw.split('-').pop() || raw;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
};

const AudioCellButton = ({ item, part, loaded, generatorEngine, isSystemBusy, aiLoadingId, generateAIAudio, onRequestAction, learnEnabled = true }) => {
  const text = String(getItemPartText(item, part) || '').trim();
  const languageLocked = generatorEngine === 'gemini' && isIndonesianAudioPart(part);
  const loading = aiLoadingId === `${item.id}-${part}`;
  const learnOff = /^exp[1-5]_(en|idn)$/i.test(part) && learnEnabled === false;
  const disabled = isSystemBusy || !text || languageLocked;
  const title = languageLocked
    ? 'Gemini English only'
    : !text
      ? 'No text available'
      : loaded
        ? `${learnOff ? 'Learn playback OFF • ' : ''}Open audio actions`
        : `${learnOff ? 'Learn playback OFF • ' : ''}Generate to Audio Staging`;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (loaded) onRequestAction?.(part);
        else generateAIAudio(item, part, { deferBrowserDownload: true });
      }}
      className={`h-10 w-full rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-[background-color,border-color,color,opacity,transform] active:scale-[0.98] ${
        languageLocked
          ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50 text-slate-400 cursor-not-allowed'
          : loaded
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
            : generatorEngine === 'edge'
              ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
              : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
      } ${disabled && !languageLocked ? 'opacity-35 cursor-not-allowed' : ''}`}
      title={title}
      aria-label={title}
    >
      {languageLocked ? <Lock className="h-4 w-4" /> : loading ? <Loader2 className="h-4 w-4 animate-spin" /> : loaded ? <FileAudio className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {learnOff && <span className="text-[6px] font-black tracking-wide text-amber-600 dark:text-amber-300">LEARN OFF</span>}
    </button>
  );
};

export default function AudioDownloadPanel({
  open,
  onClose,
  item,
  generatorEngine,
  isSystemBusy,
  isBatchDownloading = false,
  aiLoadingId,
  generateAIAudio,
  loadedAudioParts = '',
  audioActionParts = '',
  playbackSequence = [],
  downloadVoiceEn = null,
  downloadVoiceId = null,
  exportAudioMp3 = null,
  removeStagedAudio = null,
  cancelActiveGeneration = null
}) {
  const [actionPart, setActionPart] = React.useState(null);
  const [actionBusy, setActionBusy] = React.useState(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState(null);
  const bulkStopRef = React.useRef(false);
  const bulkRunningRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      setActionPart(null);
      setActionBusy(null);
    }
  }, [open]);

  React.useEffect(() => () => {
    if (bulkRunningRef.current) {
      bulkStopRef.current = true;
      cancelActiveGeneration?.();
    }
  }, [cancelActiveGeneration]);

  if (!open || !item || typeof document === 'undefined') return null;

  const loadedSet = new Set(String(loadedAudioParts || '').split('|').filter(Boolean));
  const actionState = parseActionState(audioActionParts);
  const selectedState = actionPart ? (actionState[actionPart] || {}) : null;
  const learnEnabledByKey = Object.fromEntries((Array.isArray(playbackSequence) ? playbackSequence : []).map(entry => [String(entry?.key || ''), Boolean(entry?.enabled)]));
  const expressions = getAdvancedExpressionPairs(item).filter(pair => pair.en.trim() || pair.idn.trim());
  const rows = [
    { key: 'word', label: 'Word', enPart: 'word', idnPart: 'word_idn' },
    { key: 'sentence', label: 'Sentence', enPart: 'sentence', idnPart: 'meaning' },
    ...expressions.map(pair => ({ key: `exp${pair.number}`, label: `EXP${pair.number}`, enPart: `exp${pair.number}_en`, idnPart: `exp${pair.number}_idn` }))
  ];
  const engineLabel = generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini';
  const currentCardGenerationActive = !isBatchDownloading && String(aiLoadingId || '').startsWith(`${item.id}-`);
  const allParts = rows.flatMap(row => [row.enPart, row.idnPart]).filter(Boolean);
  const stageableMissingParts = allParts.filter(part => {
    const text = String(getItemPartText(item, part) || '').trim();
    const languageLocked = generatorEngine === 'gemini' && isIndonesianAudioPart(part);
    return text && !languageLocked && !loadedSet.has(part);
  });

  const runAction = async (key, fn) => {
    if (!fn || actionBusy) return;
    setActionBusy(key);
    try { await fn(); }
    finally { setActionBusy(null); }
  };

  const stageMissingAll = async () => {
    if (bulkBusy || isSystemBusy || !stageableMissingParts.length) return;
    bulkStopRef.current = false;
    bulkRunningRef.current = true;
    setBulkBusy(true);
    try {
      for (let index = 0; index < stageableMissingParts.length; index += 1) {
        if (bulkStopRef.current) break;
        const part = stageableMissingParts[index];
        setBulkProgress({ current: index + 1, total: stageableMissingParts.length, part });
        const result = await generateAIAudio(item, part, {
          skipReplaceConfirm: true,
          deferBrowserDownload: true,
          suppressFailureAlert: true
        });
        if (bulkStopRef.current || result?.status === 'cancelled') break;
      }
    } finally {
      bulkRunningRef.current = false;
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };

  const stopCardGeneration = () => {
    bulkStopRef.current = true;
    cancelActiveGeneration?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[95] pointer-events-none md:flex md:items-center md:justify-center" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label="Close audio download panel"
        onClick={onClose}
        className="pointer-events-auto fixed inset-x-0 top-0 bg-slate-950/50 backdrop-blur-[1px]"
        style={{ height: '100lvh' }}
      />
      <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 w-full rounded-t-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl md:relative md:inset-auto md:w-[520px] md:rounded-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)]" style={{ maxHeight: 'min(86dvh, 100dvh)' }}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <Download className="h-4 w-4" />
              <h3 className="text-sm font-black">Audio</h3>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${generatorEngine === 'edge' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>{engineLabel}</span>
              {currentCardGenerationActive && <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[8px] font-black text-amber-700 dark:text-amber-300">RUNNING</span>}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{capitalizeDisplayText(item.word || item.text || 'Item')} • first click stages • loaded click opens actions</p>
          </div>
          <div className="flex items-center gap-2">
            {currentCardGenerationActive && <button type="button" onClick={stopCardGeneration} className="h-9 rounded-full bg-red-500 px-3 text-[9px] font-black text-white hover:bg-red-600"><X className="mr-1 inline h-3 w-3"/>STOP</button>}
            <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-3 md:p-4">
          {actionPart && <div className="mb-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="text-[10px] font-black text-emerald-800 dark:text-emerald-200">{actionPart.toUpperCase()} • {SOURCE_LABEL[selectedState?.sourceType] || selectedState?.sourceType || 'Local audio'}</div><div className="mt-1 text-[8px] text-slate-500 dark:text-slate-400">{selectedState?.voiceId ? `Voice: ${selectedState.voiceId} • ` : ''}MP3 exported*: {selectedState?.mp3Exported ? 'yes' : 'no'} • ZIP exported*: {selectedState?.zipExported ? 'yes' : 'no'}</div></div>
              <button type="button" onClick={() => setActionPart(null)} className="rounded p-1 text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5"/></button>
            </div>
            <div className={`mt-2 grid gap-2 ${selectedState?.sourceType === 'staging' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button type="button" disabled={isSystemBusy || actionBusy} onClick={() => runAction('mp3', () => exportAudioMp3?.(item, actionPart))} className="rounded-lg bg-emerald-600 px-2 py-2 text-[9px] font-black text-white disabled:opacity-40">{actionBusy === 'mp3' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin"/> : <Download className="mr-1 inline h-3 w-3"/>}MP3</button>
              <button type="button" disabled={isSystemBusy || actionBusy} onClick={() => runAction('regen', async () => { await generateAIAudio(item, actionPart, { skipReplaceConfirm: true, deferBrowserDownload: true }); setActionPart(null); })} className="rounded-lg border border-indigo-200 dark:border-indigo-800 px-2 py-2 text-[9px] font-black text-indigo-700 dark:text-indigo-300 disabled:opacity-40">{actionBusy === 'regen' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 inline h-3 w-3"/>}Regenerate</button>
              {selectedState?.sourceType === 'staging' && <button type="button" disabled={isSystemBusy || actionBusy} onClick={() => runAction('release', async () => { await removeStagedAudio?.(item, actionPart); setActionPart(null); })} className="rounded-lg border border-rose-200 dark:border-rose-900 px-2 py-2 text-[9px] font-black text-rose-700 dark:text-rose-300 disabled:opacity-40">{actionBusy === 'release' ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin"/> : <Trash2 className="mr-1 inline h-3 w-3"/>}Release</button>}
            </div>
            <p className="mt-2 text-[8px] leading-relaxed text-slate-400">Download MP3 reuses the current Staging / Folder / ZIP binary. Regenerate creates a new Staging variant and never overwrites the external Folder/ZIP file.</p>
          </div>}

          {generatorEngine === 'gemini' && <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 px-2.5 py-2 text-[9px] font-bold text-amber-700 dark:text-amber-300">Gemini mode: English only. Indonesian audio is locked.</div>}

          <div className="mb-3 rounded-lg border border-cyan-100 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/15 px-2.5 py-2 text-[9px] text-slate-500 dark:text-slate-400">
            <span className="font-black text-cyan-700 dark:text-cyan-300">Current download voice</span>
            <span className="ml-2">EN <strong className="text-slate-700 dark:text-slate-200">{compactVoiceLabel(downloadVoiceEn)}</strong></span>
            <span className="ml-2">ID <strong className="text-slate-700 dark:text-slate-200">{generatorEngine === 'gemini' ? 'locked' : compactVoiceLabel(downloadVoiceId)}</strong></span>
            <p className="mt-1 text-[8px] text-slate-400">If you change the System voice, these buttons re-check that exact voice. Existing variants from other voices stay stored and playable.</p>
          </div>

          <div className="mb-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black text-blue-800 dark:text-blue-200">DOWNLOAD ALL → STAGING</div>
                <div className="mt-0.5 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">Per-card only: stage missing audio in IndexedDB. Batch Auto Export ZIP is never used here.</div>
              </div>
              <button type="button" disabled={!bulkBusy && (isSystemBusy || !stageableMissingParts.length)} onClick={bulkBusy ? stopCardGeneration : stageMissingAll} className={`shrink-0 rounded-lg px-3 py-2 text-[9px] font-black text-white disabled:opacity-40 ${bulkBusy ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600'}`}>
                {bulkBusy ? <X className="mr-1 inline h-3 w-3"/> : <Download className="mr-1 inline h-3 w-3"/>}
                {bulkBusy ? `STOP ${bulkProgress ? `${bulkProgress.current}/${bulkProgress.total}` : ''}` : stageableMissingParts.length ? `${stageableMissingParts.length} MISSING` : 'READY'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(72px,1fr)_88px_88px] items-center gap-2 text-[10px]">
            <div className="px-1 font-black uppercase tracking-wider text-slate-400">Part</div>
            <div className="text-center font-black text-slate-600 dark:text-slate-300">English</div>
            <div className="text-center font-black text-slate-600 dark:text-slate-300">Indonesia</div>
            {rows.map(row => (
              <React.Fragment key={row.key}>
                <div className={`h-10 rounded-xl border px-2 flex items-center font-black ${row.key.startsWith('exp') ? 'border-violet-100 dark:border-violet-900 bg-violet-50/80 dark:bg-violet-950/25 text-violet-700 dark:text-violet-300' : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-200'}`}>{row.label}</div>
                <AudioCellButton item={item} part={row.enPart} loaded={loadedSet.has(row.enPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} onRequestAction={setActionPart} learnEnabled={learnEnabledByKey[playbackKeyForAudioPart(row.enPart)] !== false} />
                <AudioCellButton item={item} part={row.idnPart} loaded={loadedSet.has(row.idnPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} onRequestAction={setActionPart} learnEnabled={learnEnabledByKey[playbackKeyForAudioPart(row.idnPart)] !== false} />
              </React.Fragment>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">R2 source parity.</strong> Generated audio is Staged in IndexedDB and survives refresh. Folder/ZIP audio can be re-exported as MP3 without opening or extracting the source manually.
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
