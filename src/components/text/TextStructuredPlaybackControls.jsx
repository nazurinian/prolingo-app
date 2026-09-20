import React from 'react';
import { ArrowDown, ArrowUp, Eye, List, ListOrdered, PlayCircle, Plus, Repeat2, Trash2, Volume2 } from 'lucide-react';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_MANUAL_REPEAT_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
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

const compactVoiceLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown';
  const tail = raw.split('-').pop() || raw;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
};

const PlaybackProfileOrderEditor = ({ channel = 'text', playbackOrder, availableLocalVoices, disabled, onChange }) => {
  const profiles = Array.isArray(playbackOrder?.channels?.[channel]) ? playbackOrder.channels[channel] : [];
  const currentVoices = profiles.map(profile => String(profile?.voiceId || profile || '').trim()).filter(Boolean);
  const available = [...new Set([...(availableLocalVoices?.channels?.[channel] || []), ...currentVoices].filter(Boolean))].sort();
  const remaining = available.filter(voiceId => !currentVoices.some(item => item.toLowerCase() === voiceId.toLowerCase()));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= profiles.length) return;
    const next = [...profiles];
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next, channel);
  };
  const remove = index => onChange?.(profiles.filter((_, itemIndex) => itemIndex !== index), channel);
  const add = voiceId => {
    if (!voiceId) return;
    onChange?.([...profiles, { engine: 'edge', voiceId }], channel);
  };
  return <div className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-white/85 dark:bg-slate-900/35 p-2.5" data-text-global-playback-order={channel}>
    <div className="flex items-center justify-between gap-2"><p className="text-[8px] font-black uppercase text-indigo-700 dark:text-indigo-300">{channel === 'meaning' ? 'ID local order' : 'EN local order'}</p><span className="text-[7px] text-slate-400">first Ready wins</span></div>
    {profiles.length ? <div className="mt-1.5 space-y-1">{profiles.map((profile, index) => <div key={`${channel}-${profile?.id || profile?.voiceId || index}`} className="flex items-center gap-1 rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/25 px-1.5 py-1">
      <span className="w-4 shrink-0 text-center text-[7px] font-black text-indigo-500">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-[8px] font-bold text-slate-600 dark:text-slate-300" title={profile?.voiceId}>{compactVoiceLabel(profile?.voiceId)}</span>
      <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} className="min-h-8 min-w-8 rounded text-slate-400 disabled:opacity-25" title="Move up"><ArrowUp className="mx-auto h-3 w-3"/></button>
      <button type="button" disabled={disabled || index === profiles.length - 1} onClick={() => move(index, 1)} className="min-h-8 min-w-8 rounded text-slate-400 disabled:opacity-25" title="Move down"><ArrowDown className="mx-auto h-3 w-3"/></button>
      <button type="button" disabled={disabled} onClick={() => remove(index)} className="min-h-8 min-w-8 rounded text-slate-400 hover:text-red-500 disabled:opacity-25" title="Remove from explicit order"><Trash2 className="mx-auto h-3 w-3"/></button>
    </div>)}</div> : <p className="mt-1.5 text-[7px] leading-relaxed text-slate-400">Compatibility fallback is active. Add a Ready local voice to make the global priority explicit.</p>}
    <div className="mt-1.5 flex items-center gap-1.5"><Plus className="h-3 w-3 shrink-0 text-indigo-400"/><select disabled={disabled || !remaining.length} value="" onChange={event => add(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 px-2 text-[8px] text-slate-600 dark:text-slate-300 disabled:opacity-40"><option value="">{remaining.length ? 'Add local voice…' : 'No other Ready voice'}</option>{remaining.map(voiceId => <option key={voiceId} value={voiceId}>{compactVoiceLabel(voiceId)}</option>)}</select></div>
  </div>;
};

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
  playbackRepresentationMode = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
  playbackOrder = null,
  availableLocalVoices = null,
  disabled = false,
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlaybackRepresentationModeChange,
  onGlobalPlaybackOrderChange,
  onGlobalTtsOnlyChange,
  onPlaybackFeelChange
}) {
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;
  return <div className="space-y-3" data-text-player-settings="true">
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Text Player Settings</p>
      <p className="mt-0.5 text-[8px] text-slate-400">Global Split/Full, TTS Only and local voice priority live here. Voice generation/download and speed remain in AUDIO.</p>
    </div>

    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/45 dark:bg-indigo-950/15 p-3 space-y-2.5" data-text-global-playback-audio="true">
      <div className="flex items-start gap-2"><Volume2 className="mt-0.5 h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300"/><div className="min-w-0 flex-1"><p className="text-[8px] font-black uppercase text-indigo-700 dark:text-indigo-300">Playback Audio</p><p className="text-[7px] leading-relaxed text-slate-400">Global representation and local voice priority across Structured Text documents. Generation/export selections stay independent.</p></div></div>
      <div>
        <p className="mb-1 text-[7px] font-bold text-slate-500">Representation</p>
        <div className="grid grid-cols-2 gap-1.5" data-text-global-playback-mode="true">
          {[TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL].map(mode => <button key={mode} type="button" disabled={disabled} onClick={() => onPlaybackRepresentationModeChange?.(mode)} className={`min-h-9 rounded-lg border px-2 text-[8px] font-black ${playbackRepresentationMode === mode ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300'}`}>{mode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL ? 'FULL' : 'SPLIT'}</button>)}
        </div>
      </div>
      <button type="button" disabled={disabled} onClick={() => onGlobalTtsOnlyChange?.(!(playbackOrder?.ttsOnly === true))} className={`w-full min-h-9 rounded-lg border px-2 text-left text-[8px] font-black ${playbackOrder?.ttsOnly === true ? 'border-amber-400 bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`} data-text-global-tts-only="true">TTS ONLY • {playbackOrder?.ttsOnly === true ? 'ON — local audio bypassed' : 'OFF — local audio allowed'}</button>
      <div className="grid gap-2 md:grid-cols-2" data-text-global-playback-order-editor="true">
        <PlaybackProfileOrderEditor channel="text" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
        <PlaybackProfileOrderEditor channel="meaning" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
      </div>
    </div>

    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3" data-text-player-show-play="true">
      <div className="mb-1 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-slate-400"/><span className="text-[8px] font-black uppercase text-slate-500">Display</span></div>
      <div className="flex flex-wrap gap-1">{DISPLAY_OPTIONS.map(option => <button key={option} type="button" disabled={disabled} onClick={() => onDisplayModeChange?.(option)} className={`min-h-9 rounded px-2 py-1 text-[8px] font-black ${preferences.displayMode === option ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>{getStructuredTextDisplayModeLabel(option)}</button>)}</div>
      <div className="mt-3 mb-1 flex items-center gap-1"><List className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[8px] font-black uppercase text-indigo-600 dark:text-indigo-300">Global EN / ID order</span></div>
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
      <div className="mb-2 flex items-center gap-1.5"><Repeat2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300"/><p className="text-[8px] font-black uppercase text-emerald-700 dark:text-emerald-300">Global Playback Behaviour</p></div>
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
