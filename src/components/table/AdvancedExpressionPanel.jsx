import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Download, Layers, Lock, Play, Server, Wand2, X } from 'lucide-react';
import { MOBILE_BOTTOM_PLAYER_RESERVE } from '../../constants/layoutConstants';
import { getAdvancedContentCount, getAdvancedExpressionPairs } from '../../utils/audioUtils';

const SmallGenerateButton = ({ item, part, loaded, generatorEngine, isSystemBusy, aiLoadingId, generateAIAudio }) => {
  const locked = generatorEngine === 'gemini' && /_idn$/i.test(part);
  const loading = aiLoadingId === `${item.id}-${part}`;
  const Icon = generatorEngine === 'edge' ? Server : Wand2;
  return (
    <button
      type="button"
      disabled={locked || isSystemBusy}
      onClick={(e) => { e.stopPropagation(); generateAIAudio(item, part); }}
      className={`h-7 min-w-[72px] px-2 rounded-lg border flex items-center justify-center gap-1 text-[9px] font-black flex-shrink-0 ${locked ? 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed' : loaded ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : generatorEngine === 'edge' ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'} ${isSystemBusy && !locked ? 'opacity-45' : ''}`}
      title={locked ? 'Gemini English only' : loaded ? 'Download again / replace current session path' : 'Download audio'}
    >
      {locked ? <Lock className="h-3 w-3" /> : loaded ? <CheckCircle className="h-3 w-3" /> : <Icon className={`h-3 w-3 ${loading ? 'animate-pulse' : ''}`} />}
      {locked ? 'Locked' : loading ? '...' : loaded ? 'Replace' : 'Download'}
    </button>
  );
};

export default function AdvancedExpressionPanel({
  open,
  onClose,
  item,
  rowId,
  isActive,
  speakingPart,
  independentPlayingId,
  handleIndependentPlay,
  isExpressionsHidden,
  revealedCells,
  toggleCellReveal,
  blurClass,
  revealedClass,
  miniPlayClass,
  generatorEngine,
  isSystemBusy,
  aiLoadingId,
  generateAIAudio,
  loadedAudioParts = ''
}) {
  if (!open || !item || typeof document === 'undefined') return null;
  const advancedPairs = getAdvancedExpressionPairs(item).filter(pair => pair.en.trim() || pair.idn.trim());
  const advancedCount = getAdvancedContentCount(item);
  const loadedSet = new Set(String(loadedAudioParts || '').split('|').filter(Boolean));

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center" onClick={(e) => e.stopPropagation()}>
      <button aria-label="Close advanced expressions" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
      <section
        className="relative z-10 w-full rounded-t-2xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col md:w-[min(920px,92vw)] md:rounded-2xl md:max-h-[86dvh]"
        style={{ maxHeight: `calc(100dvh - ${MOBILE_BOTTOM_PLAYER_RESERVE + 12}px - env(safe-area-inset-bottom, 0px))` }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-violet-50/85 dark:bg-violet-950/30 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Layers className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-wider">Advanced • {advancedCount} fields</span></div>
            <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{item.word}</p>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 md:block hidden">EXP cards use scroll snap, so each wheel/trackpad scroll settles cleanly on an expression.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 md:px-4 snap-y snap-proximity scroll-py-3">
          {item.info && <div className="snap-start mb-3 rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-900/10 px-3 py-2"><span className="text-[9px] font-black uppercase mr-2 text-amber-600 dark:text-amber-400">INFO</span><span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.info}</span></div>}
          <div className="space-y-3">
            {advancedPairs.map(pair => {
              const expKey = `${rowId}-exp${pair.number}`;
              const revealed = revealedCells[expKey];
              const enPart = `exp${pair.number}_en`;
              const idnPart = `exp${pair.number}_idn`;
              return (
                <article key={pair.number} className="snap-start rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/30 px-3 py-3 md:px-4 md:py-3.5 min-h-[120px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="rounded-lg bg-violet-100 dark:bg-violet-900/40 px-2 py-1 text-[10px] font-black text-violet-700 dark:text-violet-300">EXP{pair.number}</span>
                    <span className="text-[9px] font-bold text-slate-400">EN / IDN</span>
                  </div>
                  <div className={`space-y-2.5 ${isExpressionsHidden ? (revealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isExpressionsHidden && toggleCellReveal(e, expKey)}>
                    {pair.en && <div className="grid grid-cols-[24px_1fr_auto] items-start gap-2"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, enPart, `${rowId}-exp${pair.number}-en`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-en`)}>{independentPlayingId === `${rowId}-exp${pair.number}-en` ? <X className="h-2.5 w-2.5"/> : <Play className="h-2.5 w-2.5 fill-current"/>}</button><p className={`text-[13px] md:text-sm leading-relaxed ${speakingPart === enPart && isActive ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{pair.en}</p><SmallGenerateButton item={item} part={enPart} loaded={loadedSet.has(enPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} /></div>}
                    {pair.idn && <div className="grid grid-cols-[24px_1fr_auto] items-start gap-2"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, idnPart, `${rowId}-exp${pair.number}-idn`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-idn`)}>{independentPlayingId === `${rowId}-exp${pair.number}-idn` ? <X className="h-2.5 w-2.5"/> : <Play className="h-2.5 w-2.5 fill-current"/>}</button><p className={`text-[11px] md:text-xs italic leading-relaxed ${speakingPart === idnPart && isActive ? 'font-bold text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>{pair.idn}</p><SmallGenerateButton item={item} part={idnPart} loaded={loadedSet.has(idnPart)} generatorEngine={generatorEngine} isSystemBusy={isSystemBusy} aiLoadingId={aiLoadingId} generateAIAudio={generateAIAudio} /></div>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
