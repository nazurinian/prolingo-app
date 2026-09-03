import React from 'react';
import { X, CheckSquare, Square, XCircle, Loader2, Lock } from 'lucide-react';

const getExpressionSelection = (batchConfig, lang) => {
  const key = lang === 'idn' ? 'expIdn' : 'expEn';
  if (Array.isArray(batchConfig?.[key]) && batchConfig[key].length === 5) return batchConfig[key];
  const legacyEnabled = lang === 'idn'
    ? Boolean(batchConfig?.doExpressions && batchConfig?.doExpressionTranslations)
    : Boolean(batchConfig?.doExpressions);
  return Array(5).fill(legacyEnabled);
};

const toggleExpression = (setBatchConfig, lang, index) => {
  const key = lang === 'idn' ? 'expIdn' : 'expEn';
  setBatchConfig(prev => {
    const next = [...getExpressionSelection(prev, lang)];
    next[index] = !next[index];
    return { ...prev, [key]: next };
  });
};

const setAllExpressions = (setBatchConfig, lang, enabled) => {
  const key = lang === 'idn' ? 'expIdn' : 'expEn';
  setBatchConfig(prev => ({ ...prev, [key]: Array(5).fill(enabled) }));
};

const ToggleRow = ({ checked, disabled = false, onClick, children, tone = 'indigo' }) => {
  const activeClass = tone === 'amber'
    ? 'text-amber-600 dark:text-amber-400'
    : tone === 'violet'
      ? 'text-violet-600 dark:text-violet-400'
      : 'text-indigo-600 dark:text-indigo-400';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-1.5 text-left text-[11px] font-semibold ${checked ? activeClass : 'text-slate-400 dark:text-slate-500'} ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:opacity-80'}`}
    >
      {disabled ? <Lock className="h-3.5 w-3.5 flex-shrink-0"/> : checked ? <CheckSquare className="h-4 w-4 flex-shrink-0"/> : <Square className="h-4 w-4 flex-shrink-0"/>}
      <span className="truncate">{children}</span>
    </button>
  );
};

export const BatchPopup = ({
  batchPanelRef,
  mode,
  setIsBatchOpen,
  isBatchDownloading,
  batchConfig,
  setBatchConfig,
  generatorEngine,
  advancedDatasetStats,
  handleBatchRangeBlur,
  runBatchDownload,
  isBatchStopping,
  batchStatusText,
  DownloadCloudIcon,
  inline = false,
  showClose = true
}) => {
  const expEn = getExpressionSelection(batchConfig, 'en');
  const expIdn = getExpressionSelection(batchConfig, 'idn');
  const isGemini = generatorEngine === 'gemini';
  const panelClass = inline
    ? 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col animate-in fade-in duration-150'
    : 'absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200';

  return (
    <div ref={batchPanelRef} className={panelClass}>
      <div className="bg-slate-800 text-white px-3 py-2 text-xs font-bold flex items-center justify-between gap-2">
        <span>Batch Download ({mode})</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${isGemini ? 'bg-purple-500/25 text-purple-100' : 'bg-teal-500/25 text-teal-100'}`}>{isGemini ? 'Gemini • EN only' : 'Edge • EN + IDN'}</span>
        {showClose && <button type="button" onClick={() => setIsBatchOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close batch"><X className="w-3.5 h-3.5"/></button>}
      </div>

      <div className="p-3 space-y-3">
        {mode === 'table' ? (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-2.5">
              <ToggleRow checked={batchConfig.doWord} disabled={isBatchDownloading} onClick={() => setBatchConfig(p => ({ ...p, doWord: !p.doWord }))}>Word EN</ToggleRow>
              <ToggleRow checked={batchConfig.doWordTranslation} disabled={isBatchDownloading || isGemini} onClick={() => setBatchConfig(p => ({ ...p, doWordTranslation: !p.doWordTranslation }))} tone="amber">Word IDN</ToggleRow>
              <ToggleRow checked={batchConfig.doSentence} disabled={isBatchDownloading} onClick={() => setBatchConfig(p => ({ ...p, doSentence: !p.doSentence }))}>Sentence EN</ToggleRow>
              <ToggleRow checked={batchConfig.doMeaning} disabled={isBatchDownloading || isGemini} onClick={() => setBatchConfig(p => ({ ...p, doMeaning: !p.doMeaning }))} tone="amber">Meaning IDN</ToggleRow>
            </div>

            {advancedDatasetStats.hasAdvanced && (
              <div className="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/10 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">Expressions</span>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold">
                    <button type="button" disabled={isBatchDownloading} onClick={() => setAllExpressions(setBatchConfig, 'en', !expEn.every(Boolean))} className="rounded border border-violet-200 dark:border-violet-800 px-1.5 py-0.5 text-violet-600 dark:text-violet-300 disabled:opacity-40">{expEn.every(Boolean) ? 'EN none' : 'EN all'}</button>
                    <button type="button" disabled={isBatchDownloading || isGemini} onClick={() => setAllExpressions(setBatchConfig, 'idn', !expIdn.every(Boolean))} className="rounded border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-amber-600 dark:text-amber-300 disabled:opacity-40">{isGemini ? 'IDN locked' : expIdn.every(Boolean) ? 'IDN none' : 'IDN all'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5">
                  {[0, 1, 2, 3, 4].map(index => (
                    <React.Fragment key={index}>
                      <ToggleRow checked={expEn[index]} disabled={isBatchDownloading} onClick={() => toggleExpression(setBatchConfig, 'en', index)} tone="violet">EXP{index + 1} EN</ToggleRow>
                      <ToggleRow checked={expIdn[index]} disabled={isBatchDownloading || isGemini} onClick={() => toggleExpression(setBatchConfig, 'idn', index)} tone="amber">EXP{index + 1} IDN</ToggleRow>
                    </React.Fragment>
                  ))}
                </div>
                {isGemini && <p className="text-[9px] leading-relaxed text-purple-500 dark:text-purple-300">Gemini hanya menghasilkan audio English. Semua field IDN dikunci dan tidak ikut batch.</p>}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
        )}

        <div className="flex gap-2 items-center text-xs">
          <span className="text-slate-500">Range:</span>
          <input
            type="number"
            className="w-14 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            value={batchConfig.start}
            onChange={e => setBatchConfig(p => ({ ...p, start: e.target.value }))}
            onBlur={() => handleBatchRangeBlur?.('start')}
            disabled={isBatchDownloading}
          />
          <span className="dark:text-slate-400">-</span>
          <input
            type="number"
            className="w-14 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            value={batchConfig.end}
            onChange={e => setBatchConfig(p => ({ ...p, end: e.target.value }))}
            onBlur={() => handleBatchRangeBlur?.('end')}
            disabled={isBatchDownloading}
          />
        </div>

        <button
          type="button"
          onClick={runBatchDownload}
          className={`w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-2 text-white transition-colors
            ${isBatchStopping ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : ''}
            ${isBatchDownloading && !isBatchStopping ? 'bg-red-500 hover:bg-red-600' : ''}
            ${!isBatchDownloading && !isBatchStopping ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
          `}
        >
          {isBatchDownloading ? (
            <>
              {isBatchStopping ? <XCircle className="w-3 h-3"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
              {isBatchStopping ? 'Stopping...' : (batchStatusText || 'STOP BATCH')}
            </>
          ) : (
            <><DownloadCloudIcon className="w-3 h-3"/>START BATCH</>
          )}
        </button>
      </div>
    </div>
  );
};

export default BatchPopup;
