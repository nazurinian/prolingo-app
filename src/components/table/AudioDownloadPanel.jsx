import React from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Lock, RefreshCw, X } from 'lucide-react';
import { getAdvancedExpressionPairs, getItemPartText, isIndonesianAudioPart } from '../../utils/audioUtils';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';

const AudioCellButton = ({ item, part, loaded, generatorEngine, isSystemBusy, aiLoadingId, generateAIAudio }) => {
  const text = String(getItemPartText(item, part) || '').trim();
  const languageLocked = generatorEngine === 'gemini' && isIndonesianAudioPart(part);
  const loading = aiLoadingId === `${item.id}-${part}`;
  const disabled = isSystemBusy || !text || languageLocked;
  const title = languageLocked
    ? 'Gemini English only'
    : !text
      ? 'No text available'
      : loaded
        ? 'Replace current session audio'
        : 'Download audio';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); generateAIAudio(item, part); }}
      className={`h-10 w-full rounded-xl border flex items-center justify-center transition-[background-color,border-color,color,opacity,transform] active:scale-[0.98] ${
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
      {languageLocked ? <Lock className="h-4 w-4" /> : loading ? <Loader2 className="h-4 w-4 animate-spin" /> : loaded ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
    </button>
  );
};

export default function AudioDownloadPanel({
  open,
  onClose,
  item,
  generatorEngine,
  isSystemBusy,
  aiLoadingId,
  generateAIAudio,
  loadedAudioParts = ''
}) {
  if (!open || !item || typeof document === 'undefined') return null;

  const loadedSet = new Set(String(loadedAudioParts || '').split('|').filter(Boolean));
  const expressions = getAdvancedExpressionPairs(item).filter(pair => pair.en.trim() || pair.idn.trim());
  const rows = [
    { key: 'word', label: 'Word', enPart: 'word', idnPart: 'word_idn' },
    { key: 'sentence', label: 'Sentence', enPart: 'sentence', idnPart: 'meaning' },
    ...expressions.map(pair => ({ key: `exp${pair.number}`, label: `EXP${pair.number}`, enPart: `exp${pair.number}_en`, idnPart: `exp${pair.number}_idn` }))
  ];
  const engineLabel = generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini';

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
            </div>
            <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{capitalizeDisplayText(item.word || item.text || 'Item')} • ↓ download • ↻ replace</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-3 md:p-4">
          {generatorEngine === 'gemini' && <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 px-2.5 py-2 text-[9px] font-bold text-amber-700 dark:text-amber-300">Gemini mode: English only. Indonesian audio is locked.</div>}

          <div className="grid grid-cols-[minmax(72px,1fr)_88px_88px] items-center gap-2 text-[10px]">
            <div className="px-1 font-black uppercase tracking-wider text-slate-400">Part</div>
            <div className="text-center font-black text-slate-600 dark:text-slate-300">English</div>
            <div className="text-center font-black text-slate-600 dark:text-slate-300">Indonesia</div>
            {rows.map(row => (
              <React.Fragment key={row.key}>
                <div className={`h-10 rounded-xl border px-2 flex items-center font-black ${row.key.startsWith('exp') ? 'border-violet-100 dark:border-violet-900 bg-violet-50/80 dark:bg-violet-950/25 text-violet-700 dark:text-violet-300' : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-200'}`}>{row.label}</div>
                <AudioCellButton item={item} part={row.enPart} loaded={loadedSet.has(row.enPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} />
                <AudioCellButton item={item} part={row.idnPart} loaded={loadedSet.has(row.idnPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} />
              </React.Fragment>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">Replace stays session-only.</strong> Existing files in the selected Audio Folder are not deleted or overwritten; Refresh Audio Folder can restore the folder path.
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
