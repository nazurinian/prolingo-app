import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Plus, Repeat2, Trash2, Volume2 } from 'lucide-react';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_MANUAL_REPEAT_MODES,
  TEXT_STRUCTURED_MANUAL_INHERIT_GLOBAL,
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

// HF4C-R1: these option sets are required when the Playback tab is rendered.
// Keeping them here (instead of in the card component) prevents a ReferenceError
// when users open Text Player Settings.
const ORDER_OPTIONS = [TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL, TEXT_STRUCTURED_ORDER_MODES.SHUFFLE];
const REPEAT_OPTIONS = [TEXT_STRUCTURED_REPEAT_MODES.ONCE, TEXT_STRUCTURED_REPEAT_MODES.TWICE, TEXT_STRUCTURED_REPEAT_MODES.LOOP];
const RESUME_OPTIONS = [TEXT_STRUCTURED_RESUME_MODES.CONTINUE, TEXT_STRUCTURED_RESUME_MODES.RESTART];

const compactVoiceLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown';
  const tail = raw.split('-').pop() || raw;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '') || raw;
};

export const PlaybackProfileOrderEditor = ({ channel = 'text', playbackOrder, availableLocalVoices, disabled, onChange }) => {
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

const ChoiceGroup = ({ title, options, value, onChange, disabled = false, tone = 'indigo', testId }) => (
  <div className="space-y-1.5" data-text-choice-group={testId || title}>
    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{title}</p>
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value: optionValue, label }) => <button type="button" key={String(optionValue)} disabled={disabled} onClick={() => onChange?.(optionValue)} aria-pressed={value === optionValue} className={`min-h-10 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${value === optionValue ? (tone === 'amber' ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400') : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}
    </div>
  </div>
);

const manualChannelChoices = [
  { value: TEXT_STRUCTURED_MANUAL_INHERIT_GLOBAL, label: 'Follow Global' },
  ...PLAY_OPTIONS.map(value => ({ value, label: getStructuredTextPlaybackModeLabel(value) }))
];
const repeatChoices = [
  { value: TEXT_STRUCTURED_MANUAL_REPEAT_MODES.ONCE, label: 'Once' },
  { value: TEXT_STRUCTURED_MANUAL_REPEAT_MODES.TWICE, label: '2×' },
  { value: TEXT_STRUCTURED_MANUAL_REPEAT_MODES.CUSTOM, label: 'Custom' },
  { value: TEXT_STRUCTURED_MANUAL_REPEAT_MODES.LOOP, label: 'Loop' }
];
const ManualTargetControls = ({ title, prefix, preferences, disabled, onChange }) => {
  const channelKey = `${prefix}PlaybackChannelMode`;
  const repeatKey = `${prefix}RepeatMode`;
  const countKey = `${prefix}RepeatCount`;
  const repeatMode = preferences?.[repeatKey] || TEXT_STRUCTURED_MANUAL_REPEAT_MODES.ONCE;
  const channelMode = preferences?.[channelKey] || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  return <div className="rounded-xl border border-amber-100 dark:border-amber-900 bg-white/90 dark:bg-slate-900/35 p-3 space-y-3" data-text-manual-target={prefix}>
    <div><p className="text-[12px] font-bold text-amber-800 dark:text-amber-200">{title}</p><p className="text-[10px] text-slate-500 dark:text-slate-400">{prefix === 'manualCard' ? 'Play the entire card, separately from the main player.' : 'Play a single sentence, without changing Global playback.'}</p></div>
    <ChoiceGroup title="Language playback" options={manualChannelChoices} value={channelMode} disabled={disabled} tone="amber" testId={`${prefix}-channels`} onChange={value => onChange?.({ [channelKey]: value })}/>
    <ChoiceGroup title="Repeat" options={repeatChoices} value={repeatMode} disabled={disabled} tone="amber" testId={`${prefix}-repeat`} onChange={value => onChange?.({ [repeatKey]: value })}/>
    {repeatMode === TEXT_STRUCTURED_MANUAL_REPEAT_MODES.CUSTOM && <label className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">Repeat count<input type="number" min="1" max="20" disabled={disabled} value={Number(preferences?.[countKey] || 3)} onChange={event => onChange?.({ [countKey]: Number(event.target.value) })} className="w-20 min-h-10 rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800 px-2 text-center"/></label>}
    {channelMode === TEXT_STRUCTURED_MANUAL_INHERIT_GLOBAL && <p className="text-[10px] text-amber-700 dark:text-amber-300">Follows the current Global EN/ID language order; your existing manual settings remain unchanged until you choose this.</p>}
  </div>;
};

const DELAY_PRESETS = [0, 500, 1000, 2000];
const DelayChoices = ({ title, value, disabled, onChange }) => {
  const numeric = Number(value || 0);
  const presetOptions = [...DELAY_PRESETS.map(ms => ({ value: ms, label: ms === 0 ? 'None' : `${ms / 1000}s` })), { value: 'custom', label: 'Custom' }];
  const chosen = DELAY_PRESETS.includes(numeric) ? numeric : 'custom';
  return <div className="space-y-2">
    <ChoiceGroup title={title} options={presetOptions} value={chosen} disabled={disabled} onChange={next => onChange?.(next === 'custom' ? (DELAY_PRESETS.includes(numeric) ? 1500 : numeric) : next)}/>
    {chosen === 'custom' && <label className="flex items-center gap-2 text-[10px] text-slate-500">Custom milliseconds<input type="number" min="0" max="5000" step="50" disabled={disabled} value={numeric} onChange={e => onChange?.(Number(e.target.value))} className="w-28 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-[11px]"/></label>}
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
  const [activeTab, setActiveTab] = useState('playback');
  const [showAdvancedPriority, setShowAdvancedPriority] = useState(false);
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;
  const tabs = [
    { id: 'playback', label: 'Playback' },
    { id: 'manual', label: 'Manual Play' },
    { id: 'display', label: 'Display' }
  ];
  return <div className="space-y-4" data-text-player-settings="true">
    <div><p className="text-[12px] font-bold text-indigo-700 dark:text-indigo-200">Text Player Settings</p><p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Choose how the document plays, how manual buttons behave, or what appears on cards. Browser TTS voices, Edge downloads and Local Audio Library live under AUDIO.</p></div>
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1" role="tablist" aria-label="Text Player Settings tabs" data-text-player-settings-tabs="true">
      {tabs.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`min-h-11 rounded-lg px-1.5 text-[11px] font-semibold ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{tab.label}</button>)}
    </div>

    {activeTab === 'playback' && <div className="space-y-4" data-text-settings-playback-tab="true">
      <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-3 space-y-3" data-text-global-playback-audio="true">
        <div className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-indigo-600"/><p className="text-[12px] font-bold text-indigo-800 dark:text-indigo-200">Global listening</p></div>
        <ChoiceGroup title="Reading mode" options={[{value: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT, label: 'Split · sentences'}, {value: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL, label: 'Full · paragraph'}]} value={playbackRepresentationMode} disabled={disabled} testId="representation" onChange={onPlaybackRepresentationModeChange}/>
        <div data-text-global-playback-mode="true" className="sr-only">Global Split/Full</div>
        <button type="button" disabled={disabled} onClick={() => onGlobalTtsOnlyChange?.(!(playbackOrder?.ttsOnly === true))} className={`min-h-11 w-full rounded-lg border px-3 text-left text-[11px] font-semibold ${playbackOrder?.ttsOnly === true ? 'border-amber-400 bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'}`} data-text-global-tts-only="true">{playbackOrder?.ttsOnly === true ? 'TTS ONLY · ignore saved local audio' : 'LOCAL FIRST · use saved audio, fall back to TTS'}</button>
        <ChoiceGroup title="Language Playback Order (what plays first)" options={PLAY_OPTIONS.map(value => ({value, label: getStructuredTextPlaybackModeLabel(value)}))} value={preferences.playbackChannelMode || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY} disabled={disabled} testId="global-language-order" onChange={onPlaybackChannelModeChange}/>
        <p className="text-[10px] text-slate-500">Language Playback Order (EN/ID) is different from Local Voice Priority (Libby/Maisie etc.).</p>
        <details open={showAdvancedPriority} onToggle={e => setShowAdvancedPriority(e.currentTarget.open)} className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white/80 dark:bg-slate-900/30 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-indigo-700 dark:text-indigo-200">Advanced · Local Voice Priority</summary>
          <p className="mt-2 mb-3 text-[10px] text-slate-500">Global representation and local voice priority across Structured Text documents. The first Ready local voice is used. You can also manage priority from AUDIO → Playback Voices. Order here does not change Edge generation.</p>
          <div className="grid gap-2 md:grid-cols-2" data-text-global-playback-order-editor="true">
            <PlaybackProfileOrderEditor channel="text" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
            <PlaybackProfileOrderEditor channel="meaning" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
          </div>
        </details>
      </section>
      <section className="rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/35 dark:bg-emerald-950/15 p-3 space-y-3" data-text-player-behaviour="true">
        <div className="flex gap-2 items-center"><Repeat2 className="w-4 h-4 text-emerald-700"/><p className="text-[12px] font-bold text-emerald-800 dark:text-emerald-200">Global Playback Behaviour</p></div>
        <ChoiceGroup title="Card/sentence order" options={ORDER_OPTIONS.map(value => ({value, label:getStructuredTextOrderModeLabel(value)}))} value={preferences.playbackOrderMode || TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL} disabled={disabled} onChange={value => onPlaybackFeelChange?.({ playbackOrderMode: value })}/>
        <ChoiceGroup title="Repeat document" options={REPEAT_OPTIONS.map(value => ({value, label:getStructuredTextRepeatModeLabel(value)}))} value={preferences.repeatMode || TEXT_STRUCTURED_REPEAT_MODES.ONCE} disabled={disabled} onChange={value => onPlaybackFeelChange?.({ repeatMode: value })}/>
        <ChoiceGroup title="When playback is stopped" options={RESUME_OPTIONS.map(value => ({value, label:getStructuredTextResumeModeLabel(value)}))} value={preferences.resumeMode || TEXT_STRUCTURED_RESUME_MODES.CONTINUE} disabled={disabled} onChange={value => onPlaybackFeelChange?.({ resumeMode: value })}/>
        <DelayChoices title="Pause between EN / ID" value={preferences.channelDelayMs} disabled={disabled} onChange={value => onPlaybackFeelChange?.({ channelDelayMs: value })}/>
        <DelayChoices title="Pause between sentences" value={preferences.segmentDelayMs} disabled={disabled} onChange={value => onPlaybackFeelChange?.({ segmentDelayMs: value })}/>
      </section>
    </div>}

    {activeTab === 'manual' && <section className="space-y-3" data-text-manual-playback-settings="true">
      <p className="text-[11px] text-slate-500">Manual Play does not overwrite Global settings. Choose Full Card for the card header or Sentence Only for a single sentence. Play EN / Play ID on headings override language only for that one run.</p>
      <ManualTargetControls title="Entire Card · Card Play" prefix="manualCard" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
      <ManualTargetControls title="One Sentence · Segment Only" prefix="manualSegment" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
    </section>}

    {activeTab === 'display' && <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3" data-text-player-show-play="true">
      <div className="flex gap-2 items-center"><Eye className="w-4 h-4 text-slate-500"/><p className="text-[12px] font-bold text-slate-800 dark:text-slate-200">Text & Meaning Display</p></div>
      <p className="text-[11px] text-slate-500">These options control what is visible. They do not change the Language Playback Order.</p>
      <ChoiceGroup title="Shown on cards" options={DISPLAY_OPTIONS.map(value => ({value, label:getStructuredTextDisplayModeLabel(value)}))} value={preferences.displayMode || TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING} disabled={disabled} onChange={onDisplayModeChange}/>
      <p className="text-[10px] text-slate-500">Card opening/closing is controlled by the Follow Playback, Expand All and Custom buttons above the cards.</p>
    </section>}
  </div>;
}
