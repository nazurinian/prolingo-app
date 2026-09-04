import React from 'react';
import { CheckSquare, ChevronDown, ChevronUp, RotateCcw, Shuffle, Square } from 'lucide-react';
import { V511_DELAY_OPTIONS, V511_PLAYBACK_PARTS, V511_PLAYBACK_PRESETS } from '../../constants/playbackConstants';
import { formatPlaybackDelay } from '../../utils/playbackSequenceUtils';

export const renderPlaybackSequenceBuilderView = ({
  compact = false,
  playbackSequence,
  isPlaybackSequencePartAvailable,
  vocabularyPlayOrder,
  activeVocabularyOrder,
  changeVocabularyPlayOrder,
  isPlaying,
  reshuffleVocabularyPlayback,
  activePlaybackPreset,
  applyPlaybackPreset,
  shufflePlaybackSequence,
  resetPlaybackSequence,
  togglePlaybackSequencePart,
  setPlaybackSequencePartRepeat,
  movePlaybackSequencePart,
  playbackDelays,
  resetPlaybackDelays,
  setPlaybackDelay
}) => {
    const enabledCount = playbackSequence.filter(entry => entry.enabled).length;
    const enabledPlayCount = playbackSequence.reduce((total, entry) => {
      if (!entry.enabled || !isPlaybackSequencePartAvailable(entry.key)) return total;
      return total + Math.min(5, Math.max(1, Number.parseInt(entry.repeat, 10) || 1));
    }, 0);
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-emerald-700 dark:text-emerald-400">Vocabulary Play Order</p>
              <p className="text-[8px] text-slate-400">Controls item order only. NO / AUDIO SLOT never changes.</p>
            </div>
            <span className={`text-[8px] font-black px-2 py-1 rounded-full ${vocabularyPlayOrder === 'shuffle' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {vocabularyPlayOrder === 'shuffle' ? `SHUFFLE${activeVocabularyOrder.cycle ? ` • C${activeVocabularyOrder.cycle}` : ''}` : 'SEQUENTIAL'}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            <button
              type="button"
              onClick={() => changeVocabularyPlayOrder('sequential')}
              className={`rounded-md border px-2 py-1.5 text-[9px] font-black transition ${vocabularyPlayOrder === 'sequential' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              Sequential
            </button>
            <button
              type="button"
              onClick={() => changeVocabularyPlayOrder('shuffle')}
              className={`rounded-md border px-2 py-1.5 text-[9px] font-black transition flex items-center justify-center gap-1 ${vocabularyPlayOrder === 'shuffle' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              <Shuffle className="w-3 h-3"/> Shuffle
            </button>
            <button
              type="button"
              disabled={vocabularyPlayOrder !== 'shuffle' || isPlaying}
              onClick={reshuffleVocabularyPlayback}
              title="Create a fresh no-repeat vocabulary order"
              className="rounded-md border border-emerald-200 dark:border-emerald-800 px-2 py-1.5 text-emerald-700 dark:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5"/>
            </button>
          </div>
          <p className="text-[8px] leading-relaxed text-slate-400">
            Shuffle uses every vocabulary once per round before creating a new order. Previous / Next follow the active shuffled order.
          </p>
        </div>

        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-indigo-700 dark:text-indigo-400">Playback Presets</p>
              <p className="text-[8px] text-slate-400">Preset = sequence + repeat + delay. Manual edits become Custom.</p>
            </div>
            <span className={`text-[8px] font-black px-2 py-1 rounded-full ${activePlaybackPreset === 'custom' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-indigo-600 text-white'}`}>
              {activePlaybackPreset === 'custom' ? 'CUSTOM' : V511_PLAYBACK_PRESETS[activePlaybackPreset]?.shortLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(V511_PLAYBACK_PRESETS).map(([key, preset]) => {
              const active = activePlaybackPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPlaybackPreset(key)}
                  className={`text-left rounded-md border px-2 py-1.5 transition ${active ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400'}`}
                  title={preset.description}
                >
                  <span className="block text-[9px] font-black">{preset.label}</span>
                  <span className={`block text-[7px] leading-tight mt-0.5 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{preset.description}</span>
                </button>
              );
            })}
          </div>
          {activePlaybackPreset === 'custom' && <p className="text-[8px] text-slate-400">Custom uses your current manual order/repeat/delay and is already persisted automatically.</p>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400">Playback Sequence</p>
            <p className="text-[9px] text-slate-400">Top → bottom = order • {enabledCount} enabled • {enabledPlayCount} plays/item</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={shufflePlaybackSequence} title="Shuffle part order" className="p-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-violet-600 dark:text-slate-400"><Shuffle className="w-3.5 h-3.5"/></button>
            <button type="button" onClick={resetPlaybackSequence} title="Reset to Word EN → Sentence EN" className="p-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-violet-600 dark:text-slate-400"><RotateCcw className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        <div className={`${compact ? 'overflow-visible' : 'max-h-80 overflow-y-auto overscroll-contain no-scrollbar'} space-y-1`}>
          {playbackSequence.map((entry, index) => {
            const meta = V511_PLAYBACK_PARTS.find(part => part.key === entry.key);
            if (!meta) return null;
            const available = isPlaybackSequencePartAvailable(entry.key);
            const active = entry.enabled && available;
            return (
              compact ? (
                <div key={entry.key} className={`rounded-lg border px-2 py-1.5 space-y-1 ${active ? 'border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/15' : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60'} ${available ? '' : 'opacity-40'}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-5 text-[9px] text-center font-mono text-slate-400 flex-shrink-0">{index + 1}</span>
                    <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`${active ? (meta.language === 'IDN' ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400') : 'text-slate-400'} disabled:cursor-not-allowed flex-shrink-0`}>{active ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}</button>
                    <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`flex-1 min-w-0 text-left text-[10px] font-bold truncate ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} disabled:cursor-not-allowed`}>{meta.label}</button>
                    <span className={`text-[8px] font-black px-1 rounded flex-shrink-0 ${meta.language === 'IDN' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'}`}>{meta.language}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-7">
                    <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden" title="Repeat this part per item (1–5x)">
                      <button type="button" disabled={!available || (entry.repeat || 1) <= 1} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) - 1)} className="w-7 h-7 text-sm font-black text-slate-500 disabled:opacity-20 active:bg-slate-100 dark:active:bg-slate-700">−</button>
                      <span className="min-w-[34px] text-center text-[9px] font-black text-violet-600 dark:text-violet-400 border-x border-slate-200 dark:border-slate-600">{entry.repeat || 1}x</span>
                      <button type="button" disabled={!available || (entry.repeat || 1) >= 5} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) + 1)} className="w-7 h-7 text-sm font-black text-slate-500 disabled:opacity-20 active:bg-slate-100 dark:active:bg-slate-700">+</button>
                    </div>
                    <div className="flex items-center gap-0.5" aria-label={`Reorder ${meta.label}`}>
                      <button type="button" disabled={index === 0} onClick={() => movePlaybackSequencePart(entry.key, -1)} className="w-8 h-7 rounded-md text-slate-400 hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400 disabled:opacity-15 flex items-center justify-center" title="Move up"><ChevronUp className="w-4 h-4"/></button>
                      <button type="button" disabled={index === playbackSequence.length - 1} onClick={() => movePlaybackSequencePart(entry.key, 1)} className="w-8 h-7 rounded-md text-slate-400 hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400 disabled:opacity-15 flex items-center justify-center" title="Move down"><ChevronDown className="w-4 h-4"/></button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={entry.key} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${active ? 'border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/15' : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60'} ${available ? '' : 'opacity-40'}`}>
                  <span className="w-5 text-[9px] text-center font-mono text-slate-400">{index + 1}</span>
                  <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`${active ? (meta.language === 'IDN' ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400') : 'text-slate-400'} disabled:cursor-not-allowed`}>{active ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}</button>
                  <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`flex-1 text-left text-xs font-bold ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} disabled:cursor-not-allowed`}>{meta.label}</button>
                  <span className={`text-[8px] font-black px-1 rounded ${meta.language === 'IDN' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'}`}>{meta.language}</span>
                  <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden" title="Repeat this part per item (1–5x)">
                    <button type="button" disabled={!available || (entry.repeat || 1) <= 1} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) - 1)} className="w-5 h-6 text-[11px] font-black text-slate-500 disabled:opacity-20">−</button>
                    <span className="min-w-[28px] text-center text-[9px] font-black text-violet-600 dark:text-violet-400 border-x border-slate-200 dark:border-slate-600">{entry.repeat || 1}x</span>
                    <button type="button" disabled={!available || (entry.repeat || 1) >= 5} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) + 1)} className="w-5 h-6 text-[11px] font-black text-slate-500 disabled:opacity-20">+</button>
                  </div>
                  <button type="button" disabled={index === 0} onClick={() => movePlaybackSequencePart(entry.key, -1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-600 text-[11px] font-black text-slate-500 disabled:opacity-20">↑</button>
                  <button type="button" disabled={index === playbackSequence.length - 1} onClick={() => movePlaybackSequencePart(entry.key, 1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-600 text-[11px] font-black text-slate-500 disabled:opacity-20">↓</button>
                </div>
              )
            );
          })}
        </div>

        <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-sky-700 dark:text-sky-400">Delay Control</p>
              <p className="text-[8px] text-slate-400">Learning gap only — audio speed is unchanged.</p>
            </div>
            <button type="button" onClick={resetPlaybackDelays} className="px-2 py-1 rounded border border-sky-200 dark:border-sky-800 text-[8px] font-black text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30">RESET 300ms</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[8px] font-bold text-slate-500 dark:text-slate-400">Between parts</span>
              <select value={playbackDelays.partDelayMs} onChange={e => setPlaybackDelay('partDelayMs', e.target.value)} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none">
                {V511_DELAY_OPTIONS.map(ms => <option key={`part-${ms}`} value={ms}>{formatPlaybackDelay(ms)}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[8px] font-bold text-slate-500 dark:text-slate-400">Between repeats</span>
              <select value={playbackDelays.repeatDelayMs} onChange={e => setPlaybackDelay('repeatDelayMs', e.target.value)} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none">
                {V511_DELAY_OPTIONS.map(ms => <option key={`repeat-${ms}`} value={ms}>{formatPlaybackDelay(ms)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[8px] text-slate-400">Parts: Word → Meaning → Sentence → EXP. Repeats: repeated play of the same part.</p>
        </div>

        {enabledCount === 0 && <div className="text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">No playback parts enabled. Turn on at least one item.</div>}
        <p className="text-[8px] leading-relaxed text-slate-400">Repeat is per part (1–5x). Delay is independent for part transitions and repeats. Playback mode “Item 2x” still repeats the whole sequence twice.</p>
      </div>
    );
};
