import React from 'react';
import { Eye, List, PlayCircle, Repeat2 } from 'lucide-react';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_MANUAL_REPEAT_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  TEXT_STRUCTURED_RESUME_MODES,
  getStructuredTextDisplayModeLabel,
  getStructuredTextOrderModeLabel,
  getStructuredTextPlaybackModeLabel,
  getStructuredTextRepeatModeLabel,
  getStructuredTextResumeModeLabel
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';

const DISPLAY_OPTIONS = [
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ONLY,
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING,
  TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING,
  TEXT_STRUCTURED_DISPLAY_MODES.MEANING_ONLY
];
const PLAY_OPTIONS = [
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY
];

const ManualTargetControls = ({ title, prefix, preferences, disabled, onChange }) => {
  const channelKey = `${prefix}PlaybackChannelMode`;
  const repeatKey = `${prefix}RepeatMode`;
  const countKey = `${prefix}RepeatCount`;
  const repeatMode = preferences?.[repeatKey] || TEXT_STRUCTURED_MANUAL_REPEAT_MODES.ONCE;
  return <div className="rounded-lg border border-amber-100 dark:border-amber-900 bg-white/90 dark:bg-slate-900/35 p-2.5">
    <p className="mb-1.5 text-[8px] font-black uppercase text-amber-700 dark:text-amber-300">{title}</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[7px] font-bold text-slate-500">Channels
        <select disabled={disabled} value={preferences?.[channelKey] || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY} onChange={event => onChange?.({ [channelKey]: event.target.value })} className="mt-1 w-full min-h-9 rounded border border-amber-100 dark:border-amber-900 bg-white dark:bg-slate-800 px-2 text-[8px]">
          {PLAY_OPTIONS.map(option => <option key={option} value={option}>{getStructuredTextPlaybackModeLabel(option)}</option>)}
        </select>
      </label>
      <label className="text-[7px] font-bold text-slate-500">Repeat
        <select disabled={disabled} value={repeatMode} onChange={event => onChange?.({ [repeatKey]: event.target.value })} className="mt-1 w-full min-h-9 rounded border border-amber-100 dark:border-amber-900 bg-white dark:bg-slate-800 px-2 text-[8px]">
          <option value={TEXT_STRUCTURED_MANUAL_REPEAT_MODES.ONCE}>Once</option>
          <option value={TEXT_STRUCTURED_MANUAL_REPEAT_MODES.TWICE}>2×</option>
          <option value={TEXT_STRUCTURED_MANUAL_REPEAT_MODES.CUSTOM}>Custom</option>
          <option value={TEXT_STRUCTURED_MANUAL_REPEAT_MODES.LOOP}>Loop</option>
        </select>
      </label>
    </div>
    {repeatMode === TEXT_STRUCTURED_MANUAL_REPEAT_MODES.CUSTOM && <label className="mt-2 flex items-center justify-between gap-2 text-[7px] font-bold text-slate-500"><span>Custom repeats</span><input type="number" min="1" max="20" step="1" disabled={disabled} value={Number(preferences?.[countKey] || 3)} onChange={event => onChange?.({ [countKey]: Number(event.target.value) })} className="w-20 min-h-9 rounded border border-amber-100 dark:border-amber-900 bg-white dark:bg-slate-800 px-2 text-center text-[8px]"/></label>}
  </div>;
};

export default function TextStructuredPlaybackControls({
  documentTree,
  preferences = {},
  disabled = false,
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlaybackFeelChange
}) {
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;
  return <div className="space-y-3" data-text-player-settings="true">
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Text Player Settings</p>
      <p className="mt-0.5 text-[8px] text-slate-400">Playback behaviour only. Voice, speed and local-audio selection live in AUDIO.</p>
    </div>

    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3" data-text-player-show-play="true">
      <div className="mb-1 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-slate-400"/><span className="text-[8px] font-black uppercase text-slate-500">Display</span></div>
      <div className="flex flex-wrap gap-1">{DISPLAY_OPTIONS.map(option => <button key={option} type="button" disabled={disabled} onClick={() => onDisplayModeChange?.(option)} className={`min-h-9 rounded px-2 py-1 text-[8px] font-black ${preferences.displayMode === option ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>{getStructuredTextDisplayModeLabel(option)}</button>)}</div>
      <div className="mt-3 mb-1 flex items-center gap-1"><List className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[8px] font-black uppercase text-indigo-600 dark:text-indigo-300">Document EN / ID order</span></div>
      <div className="flex flex-wrap gap-1">{PLAY_OPTIONS.map(option => <button key={option} type="button" disabled={disabled} onClick={() => onPlaybackChannelModeChange?.(option)} className={`min-h-9 rounded px-2 py-1 text-[8px] font-black ${preferences.playbackChannelMode === option ? 'bg-indigo-600 text-white' : 'border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300'}`}>{getStructuredTextPlaybackModeLabel(option)}</button>)}</div>
    </div>

    <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/15 p-3" data-text-manual-playback-settings="true">
      <div className="mb-2 flex items-center gap-1.5"><PlayCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300"/><div><p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-300">Manual Play</p><p className="text-[7px] text-slate-400">Used by Card Play and Segment Only. Bottom player remains the main Pause/Stop control.</p></div></div>
      <div className="space-y-2">
        <ManualTargetControls title="Segment Only" prefix="manualSegment" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
        <ManualTargetControls title="Card Play" prefix="manualCard" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
      </div>
    </div>

    <div className="rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3" data-text-player-behaviour="true">
      <div className="mb-2 flex items-center gap-1.5"><Repeat2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300"/><p className="text-[8px] font-black uppercase text-emerald-700 dark:text-emerald-300">Document Playback Behaviour</p></div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[7px] font-bold text-slate-500">Order<select disabled={disabled} value={preferences.playbackOrderMode || TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL} onChange={e => onPlaybackFeelChange?.({ playbackOrderMode: e.target.value })} className="mt-1 w-full min-h-9 rounded border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 text-[8px]"><option value={TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL}>{getStructuredTextOrderModeLabel(TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL)}</option><option value={TEXT_STRUCTURED_ORDER_MODES.SHUFFLE}>{getStructuredTextOrderModeLabel(TEXT_STRUCTURED_ORDER_MODES.SHUFFLE)}</option></select></label>
        <label className="text-[7px] font-bold text-slate-500">Repeat<select disabled={disabled} value={preferences.repeatMode || TEXT_STRUCTURED_REPEAT_MODES.ONCE} onChange={e => onPlaybackFeelChange?.({ repeatMode: e.target.value })} className="mt-1 w-full min-h-9 rounded border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 text-[8px]"><option value={TEXT_STRUCTURED_REPEAT_MODES.ONCE}>{getStructuredTextRepeatModeLabel(TEXT_STRUCTURED_REPEAT_MODES.ONCE)}</option><option value={TEXT_STRUCTURED_REPEAT_MODES.TWICE}>{getStructuredTextRepeatModeLabel(TEXT_STRUCTURED_REPEAT_MODES.TWICE)}</option><option value={TEXT_STRUCTURED_REPEAT_MODES.LOOP}>{getStructuredTextRepeatModeLabel(TEXT_STRUCTURED_REPEAT_MODES.LOOP)}</option></select></label>
        <label className="text-[7px] font-bold text-slate-500">EN/ID gap<input type="number" min="0" max="5000" step="50" disabled={disabled} value={Number(preferences.channelDelayMs || 0)} onChange={e => onPlaybackFeelChange?.({ channelDelayMs: Number(e.target.value) })} className="mt-1 w-full min-h-9 rounded border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 text-[8px]"/></label>
        <label className="text-[7px] font-bold text-slate-500">Segment gap<input type="number" min="0" max="5000" step="50" disabled={disabled} value={Number(preferences.segmentDelayMs || 0)} onChange={e => onPlaybackFeelChange?.({ segmentDelayMs: Number(e.target.value) })} className="mt-1 w-full min-h-9 rounded border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 text-[8px]"/></label>
      </div>
      <label className="mt-2 flex items-center justify-between gap-2 text-[7px] font-bold text-slate-500"><span>After Stop</span><select disabled={disabled} value={preferences.resumeMode || TEXT_STRUCTURED_RESUME_MODES.CONTINUE} onChange={e => onPlaybackFeelChange?.({ resumeMode: e.target.value })} className="min-h-9 rounded border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 text-[8px]"><option value={TEXT_STRUCTURED_RESUME_MODES.CONTINUE}>{getStructuredTextResumeModeLabel(TEXT_STRUCTURED_RESUME_MODES.CONTINUE)}</option><option value={TEXT_STRUCTURED_RESUME_MODES.RESTART}>{getStructuredTextResumeModeLabel(TEXT_STRUCTURED_RESUME_MODES.RESTART)}</option></select></label>
    </div>
  </div>;
}
