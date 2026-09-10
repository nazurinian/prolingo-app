import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

const clean = value => String(value ?? '').trim();

export default function TableLocalAudioVoiceControls({
  mode,
  voiceOptions = [],
  voiceMode = 'auto',
  onVoiceModeChange,
  voicePriority = [],
  onMovePriority,
  slotCount = 0,
  disabled = false
}) {
  if (mode !== 'table' || !voiceOptions.length) return null;
  const byId = new Map(voiceOptions.map(option => [clean(option.id).toLowerCase(), option]));
  const ordered = (voicePriority || [])
    .map(id => byId.get(clean(id).toLowerCase()))
    .filter(Boolean);

  const totalVoiceAudio = voiceOptions.reduce((sum, option) => sum + Number(option?.count || 0), 0);
  const slotSuffix = Number(slotCount) > 0 ? ` / ${slotCount} slots` : '';

  if (voiceOptions.length === 1) {
    const voice = voiceOptions[0];
    return (
      <div className="mt-2 rounded border border-indigo-100 dark:border-indigo-800 bg-white/70 dark:bg-slate-800/70 px-2 py-1.5 text-[9px] text-slate-500 dark:text-slate-400">
        <span className="font-black text-indigo-700 dark:text-indigo-300">Local voice:</span> {voice.label || voice.id}
        <span className="ml-1 text-slate-400">• {Number(voice.count || 0)} audio{slotSuffix} • missing audio → Browser TTS</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-indigo-100 dark:border-indigo-800 bg-white/70 dark:bg-slate-800/70 p-2" data-table-local-voice-controls="true">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Local Audio Voice</label>
        <span className="text-[8px] text-slate-400">{voiceOptions.length} voices • {totalVoiceAudio} audio{slotSuffix}</span>
      </div>
      <select
        value={voiceMode}
        disabled={disabled}
        onChange={event => onVoiceModeChange?.(event.target.value)}
        className="mt-1.5 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50"
      >
        <option value="auto">Auto / preferred order</option>
        {voiceOptions.map(option => <option key={option.id} value={option.id}>{option.label || option.id} only • {Number(option.count || 0)} audio</option>)}
      </select>

      {voiceMode === 'auto' && ordered.length > 1 && (
        <div className="mt-2 space-y-1">
          <div className="text-[8px] text-slate-400">Priority: first available local voice wins; if none exists, Browser TTS is used.</div>
          {ordered.map((option, index) => (
            <div key={option.id} className="flex items-center gap-1.5 rounded border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-1.5 py-1">
              <span className="w-4 text-center text-[8px] font-black text-indigo-500">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-600 dark:text-slate-300">{option.label || option.id}</span>
              <span className="shrink-0 text-[8px] font-semibold text-slate-400">{Number(option.count || 0)} audio</span>
              <button type="button" disabled={disabled || index === 0} onClick={() => onMovePriority?.(option.id, -1)} className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-25" title="Move voice up"><ArrowUp className="h-3 w-3"/></button>
              <button type="button" disabled={disabled || index === ordered.length - 1} onClick={() => onMovePriority?.(option.id, 1)} className="rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-25" title="Move voice down"><ArrowDown className="h-3 w-3"/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
