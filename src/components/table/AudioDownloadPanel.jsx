import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Download, Lock, Server, Wand2, X } from 'lucide-react';
import { getAdvancedExpressionPairs, getItemPartText, isIndonesianAudioPart } from '../../utils/audioUtils';

const coreParts = [
  { part: 'word', label: 'Word EN' },
  { part: 'sentence', label: 'Sentence EN' },
  { part: 'word_idn', label: 'Word IDN' },
  { part: 'meaning', label: 'Meaning IDN' }
];

const PartButton = ({ item, part, label, loaded, generatorEngine, isSystemBusy, aiLoadingId, generateAIAudio }) => {
  const text = String(getItemPartText(item, part) || '').trim();
  const languageLocked = generatorEngine === 'gemini' && isIndonesianAudioPart(part);
  const loading = aiLoadingId === `${item.id}-${part}`;
  const disabled = isSystemBusy || !text || languageLocked;
  const Icon = generatorEngine === 'edge' ? Server : Wand2;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        generateAIAudio(item, part);
      }}
      className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,opacity] ${
        languageLocked
          ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50 text-slate-400 cursor-not-allowed'
          : loaded
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/35'
            : generatorEngine === 'edge'
              ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/35'
              : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/35'
      } ${disabled && !languageLocked ? 'opacity-45 cursor-not-allowed' : ''}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {languageLocked ? <Lock className="h-3.5 w-3.5 flex-shrink-0" /> : loaded ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" /> : <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${loading ? 'animate-pulse' : ''}`} />}
          <span className="truncate text-[11px] font-black">{label}</span>
        </span>
        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide opacity-70">
          {languageLocked ? 'Locked' : loading ? 'Loading' : loaded ? 'Replace' : 'Download'}
        </span>
      </span>
      {!text && !languageLocked && <span className="mt-1 block text-[9px] opacity-65">No text</span>}
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
  const engineLabel = generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini';

  const body = (
    <div className="fixed inset-0 z-[95] flex items-end md:items-center md:justify-center" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Close audio download panel" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
      <section className="relative z-10 w-full max-h-[86dvh] rounded-t-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl md:w-[720px] md:rounded-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <Download className="h-4 w-4" />
              <h3 className="text-sm font-black">Audio Download</h3>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${generatorEngine === 'edge' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>{engineLabel}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{item.word || item.text || 'Item'} • Loaded audio can be downloaded again</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Core audio</p>
              {generatorEngine === 'gemini' && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">Gemini = English only</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {coreParts.map(entry => <PartButton key={entry.part} {...entry} item={item} loaded={loadedSet.has(entry.part)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} />)}
            </div>
          </div>

          {expressions.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">EXP1–EXP5 individual audio</p>
              <div className="space-y-2">
                {expressions.map(pair => (
                  <div key={pair.number} className="grid grid-cols-[48px_1fr_1fr] items-stretch gap-2">
                    <div className="flex items-center justify-center rounded-xl border border-violet-100 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 text-[10px] font-black text-violet-600 dark:text-violet-300">EXP{pair.number}</div>
                    <PartButton item={item} part={`exp${pair.number}_en`} label="English" loaded={loadedSet.has(`exp${pair.number}_en`)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} />
                    <PartButton item={item} part={`exp${pair.number}_idn`} label="Indonesia" loaded={loadedSet.has(`exp${pair.number}_idn`)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">Replace is session-only.</strong> If an audio path is already loaded, ProLingo will confirm before generating again. The original file in your audio folder is not deleted or overwritten; Refresh Audio Folder can load the folder version again.
          </div>
        </div>
      </section>
    </div>
  );

  return createPortal(body, document.body);
}
