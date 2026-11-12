import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, HelpCircle, Plus, Repeat2, Sliders, Trash2, Volume2 } from 'lucide-react';
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
import { TEXT_CARD_EXPANSION_MODES } from '../../domain/text/textStructuredCardExpansionDomain.js';

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

const EXPANSION_OPTIONS = [
  { value: TEXT_CARD_EXPANSION_MODES.FOLLOW, label: 'Follow Playback' },
  { value: TEXT_CARD_EXPANSION_MODES.ALL, label: 'Expand All' },
  { value: TEXT_CARD_EXPANSION_MODES.CUSTOM, label: 'Custom' }
];

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
  return <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white/90 dark:bg-slate-900/40 p-2.5" data-text-global-playback-order={channel}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-[9px] font-black uppercase text-indigo-700 dark:text-indigo-300">{channel === 'meaning' ? 'ID Local Priority' : 'EN Local Priority'}</p>
      <span className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[7px] font-bold text-indigo-600 dark:text-indigo-300">first Ready wins</span>
    </div>
    {profiles.length ? <div className="mt-1.5 space-y-1">{profiles.map((profile, index) => <div key={`${channel}-${profile?.id || profile?.voiceId || index}`} className="flex items-center gap-1 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/25 px-2 py-1">
      <span className="w-4 shrink-0 text-center text-[8px] font-black text-indigo-500">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-700 dark:text-slate-200" title={profile?.voiceId}>{compactVoiceLabel(profile?.voiceId)}</span>
      <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} className="min-h-8 min-w-8 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-25" title="Move up"><ArrowUp className="mx-auto h-3 w-3"/></button>
      <button type="button" disabled={disabled || index === profiles.length - 1} onClick={() => move(index, 1)} className="min-h-8 min-w-8 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-25" title="Move down"><ArrowDown className="mx-auto h-3 w-3"/></button>
      <button type="button" disabled={disabled} onClick={() => remove(index)} className="min-h-8 min-w-8 rounded text-slate-400 hover:text-red-500 disabled:opacity-25" title="Remove from explicit order"><Trash2 className="mx-auto h-3 w-3"/></button>
    </div>)}</div> : <p className="mt-1.5 text-[8px] leading-relaxed text-slate-400">Compatibility fallback is active. Add a Ready local voice to make the global priority explicit.</p>}
    <div className="mt-1.5 flex items-center gap-1.5"><Plus className="h-3 w-3 shrink-0 text-indigo-400"/><select disabled={disabled || !remaining.length} value="" onChange={event => add(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 px-2 text-[9px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40"><option value="">{remaining.length ? 'Add local voice…' : 'No other Ready voice'}</option>{remaining.map(voiceId => <option key={voiceId} value={voiceId}>{compactVoiceLabel(voiceId)}</option>)}</select></div>
  </div>;
};

const ChoiceGroup = ({ title, subtitle = null, options, value, onChange, disabled = false, tone = 'indigo', testId }) => (
  <div className="space-y-1.5" data-text-choice-group={testId || title}>
    <div>
      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{title}</p>
      {subtitle && <p className="text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value: optionValue, label }) => <button type="button" key={String(optionValue)} disabled={disabled} onClick={() => onChange?.(optionValue)} aria-pressed={value === optionValue} className={`min-h-9 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all disabled:opacity-50 ${value === optionValue ? (tone === 'amber' ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 shadow-sm' : tone === 'emerald' ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm' : 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 shadow-sm') : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}
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
const ManualTargetControls = ({ title, badge, prefix, preferences, disabled, onChange }) => {
  const channelKey = `${prefix}PlaybackChannelMode`;
  const repeatKey = `${prefix}RepeatMode`;
  const countKey = `${prefix}RepeatCount`;
  const repeatMode = preferences?.[repeatKey] || TEXT_STRUCTURED_MANUAL_REPEAT_MODES.ONCE;
  const channelMode = preferences?.[channelKey] || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  return <div className="rounded-xl border border-amber-200/80 dark:border-amber-900 bg-white/95 dark:bg-slate-900/40 p-3.5 space-y-3" data-text-manual-target={prefix}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-[12px] font-black text-amber-900 dark:text-amber-200">{title}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{prefix === 'manualCard' ? 'Plays only the clicked Card without overwriting Global Player settings.' : 'Plays only the clicked sentence/line without altering Global Player settings.'}</p>
      </div>
      {badge && <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[9px] font-black text-amber-800 dark:text-amber-300">{badge}</span>}
    </div>
    <ChoiceGroup title="Language Playback Order" options={manualChannelChoices} value={channelMode} disabled={disabled} tone="amber" testId={`${prefix}-channels`} onChange={value => onChange?.({ [channelKey]: value })}/>
    <ChoiceGroup title="Repeat Behaviour" options={repeatChoices} value={repeatMode} disabled={disabled} tone="amber" testId={`${prefix}-repeat`} onChange={value => onChange?.({ [repeatKey]: value })}/>
    {repeatMode === TEXT_STRUCTURED_MANUAL_REPEAT_MODES.CUSTOM && <label className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">Repeat count<input type="number" min="1" max="20" disabled={disabled} value={Number(preferences?.[countKey] || 3)} onChange={event => onChange?.({ [countKey]: Number(event.target.value) })} className="w-20 min-h-9 rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800 px-2 text-center font-bold"/></label>}
    {channelMode === TEXT_STRUCTURED_MANUAL_INHERIT_GLOBAL && <p className="rounded-lg bg-amber-50/80 dark:bg-amber-950/30 px-2.5 py-1.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">Follows the current Global EN/ID Language Playback Order automatically.</p>}
  </div>;
};

const DELAY_PRESETS = [0, 500, 1000, 2000];
const DelayChoices = ({ title, subtitle = null, value, disabled, onChange }) => {
  const numeric = Number(value || 0);
  const presetOptions = [...DELAY_PRESETS.map(ms => ({ value: ms, label: ms === 0 ? 'None (0s)' : `${ms / 1000}s` })), { value: 'custom', label: 'Custom' }];
  const chosen = DELAY_PRESETS.includes(numeric) ? numeric : 'custom';
  return <div className="space-y-2">
    <ChoiceGroup title={title} subtitle={subtitle} options={presetOptions} value={chosen} disabled={disabled} tone="emerald" onChange={next => onChange?.(next === 'custom' ? (DELAY_PRESETS.includes(numeric) ? 1500 : numeric) : next)}/>
    {chosen === 'custom' && <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">Custom delay (ms)<input type="number" min="0" max="5000" step="50" disabled={disabled} value={numeric} onChange={e => onChange?.(Number(e.target.value))} className="w-28 min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-[11px] font-bold"/></label>}
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

  const isFull = playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL;
  const isTtsOnly = playbackOrder?.ttsOnly === true;
  const currentLangLabel = getStructuredTextPlaybackModeLabel(preferences.playbackChannelMode || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY);
  const currentOrderLabel = getStructuredTextOrderModeLabel(preferences.playbackOrderMode || TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL);
  const currentDisplayLabel = getStructuredTextDisplayModeLabel(preferences.displayMode || TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING);

  return <div className="space-y-3.5" data-text-player-settings="true">
    {/* Header + Active Configuration Summary Pills */}
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/>
          <p className="text-xs font-black uppercase tracking-wide text-indigo-800 dark:text-indigo-200">Text Player Settings</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[9px] font-black">
          <span className="rounded-md bg-indigo-100 dark:bg-indigo-950/70 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">{isFull ? 'FULL' : 'SPLIT'}</span>
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-700 dark:text-slate-300">{currentLangLabel}</span>
          <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">{currentOrderLabel}</span>
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-600 dark:text-slate-400">{currentDisplayLabel}</span>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Configure <b>Global Playback</b> (bottom player), <b>Manual Play</b> (card & sentence buttons), and <b>Display</b> (visible text & card expansion). Voices and Edge downloads live in the <b>AUDIO</b> sidebar.
      </p>
    </div>

    {/* 3-Tab Navigation */}
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1" role="tablist" aria-label="Text Player Settings tabs" data-text-player-settings-tabs="true">
      {tabs.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`min-h-10 rounded-lg px-2 text-[11px] font-bold transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}>{tab.label}</button>)}
    </div>

    {/* TAB 1: PLAYBACK */}
    {activeTab === 'playback' && <div className="space-y-3.5" data-text-settings-playback-tab="true">
      <section className="rounded-xl border border-indigo-200/80 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-3.5 space-y-3" data-text-global-playback-audio="true">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/>
            <p className="text-[12px] font-black text-indigo-900 dark:text-indigo-200">1. Global Mode & Language Playback Order</p>
          </div>
          <span className="rounded bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 text-[9px] font-black text-indigo-700 dark:text-indigo-300">Bottom Player</span>
        </div>

        <ChoiceGroup
          title="Reading Mode (Split vs Full)"
          subtitle="Split plays and highlights sentence-by-sentence; Full plays the entire Card channel as one unit."
          options={[
            { value: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT, label: 'Split · Sentences' },
            { value: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL, label: 'Full · Entire Card' }
          ]}
          value={playbackRepresentationMode}
          disabled={disabled}
          testId="representation"
          onChange={onPlaybackRepresentationModeChange}
        />
        <div data-text-global-playback-mode="true" className="sr-only">Global Split/Full</div>

        <ChoiceGroup
          title="Language Playback Order (Which language plays first)"
          subtitle="Controls whether English (EN), Indonesian (ID), or both are spoken during Global Playback."
          options={PLAY_OPTIONS.map(value => ({ value, label: getStructuredTextPlaybackModeLabel(value) }))}
          value={preferences.playbackChannelMode || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY}
          disabled={disabled}
          testId="global-language-order"
          onChange={onPlaybackChannelModeChange}
        />

        <details open={showAdvancedPriority} onToggle={e => setShowAdvancedPriority(e.currentTarget.open)} className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white/90 dark:bg-slate-900/35 p-3">
          <summary className="cursor-pointer text-[11px] font-bold text-indigo-700 dark:text-indigo-200">Advanced · Local Voice Priority (Global EN / ID order)</summary>
          <p className="mt-1.5 mb-2.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            Global representation and local voice priority across Structured Text documents. When multiple local voices are downloaded for a card or sentence, the first Ready local voice is used. Generation/export selections stay independent from this playback priority.
          </p>
          <div className="grid gap-2 md:grid-cols-2" data-text-global-playback-order-editor="true">
            <PlaybackProfileOrderEditor channel="text" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
            <PlaybackProfileOrderEditor channel="meaning" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
          </div>
        </details>
      </section>

      <section className="rounded-xl border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50/35 dark:bg-emerald-950/15 p-3.5 space-y-3" data-text-player-behaviour="true">
        <div className="flex gap-2 items-center">
          <Repeat2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400"/>
          <p className="text-[12px] font-black text-emerald-900 dark:text-emerald-200">2. Global Playback Behaviour</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ChoiceGroup
            title="Card Traversal Order"
            subtitle="Shuffle rearranges Card order only; sentences inside each Card stay in order."
            options={ORDER_OPTIONS.map(value => ({ value, label: getStructuredTextOrderModeLabel(value) }))}
            value={preferences.playbackOrderMode || TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL}
            disabled={disabled}
            tone="emerald"
            onChange={value => onPlaybackFeelChange?.({ playbackOrderMode: value })}
          />
          <ChoiceGroup
            title="Repeat Document"
            subtitle="What happens after reaching the last Card."
            options={REPEAT_OPTIONS.map(value => ({ value, label: getStructuredTextRepeatModeLabel(value) }))}
            value={preferences.repeatMode || TEXT_STRUCTURED_REPEAT_MODES.ONCE}
            disabled={disabled}
            tone="emerald"
            onChange={value => onPlaybackFeelChange?.({ repeatMode: value })}
          />
        </div>

        <ChoiceGroup
          title="When playback is stopped"
          subtitle="Continue resumes from your active cursor; Restart returns to Card #1 when Play is pressed next."
          options={RESUME_OPTIONS.map(value => ({ value, label: getStructuredTextResumeModeLabel(value) }))}
          value={preferences.resumeMode || TEXT_STRUCTURED_RESUME_MODES.CONTINUE}
          disabled={disabled}
          tone="emerald"
          onChange={value => onPlaybackFeelChange?.({ resumeMode: value })}
        />

        <div className="grid gap-3 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/60 md:grid-cols-2">
          <DelayChoices
            title="Pause between EN / ID"
            subtitle="Silence between English and Indonesian channels."
            value={preferences.channelDelayMs}
            disabled={disabled}
            onChange={value => onPlaybackFeelChange?.({ channelDelayMs: value })}
          />
          <DelayChoices
            title="Pause between sentences"
            subtitle="Silence before advancing to the next sentence or card."
            value={preferences.segmentDelayMs}
            disabled={disabled}
            onChange={value => onPlaybackFeelChange?.({ segmentDelayMs: value })}
          />
        </div>
      </section>
    </div>}

    {/* TAB 2: MANUAL PLAY */}
    {activeTab === 'manual' && <section className="space-y-3" data-text-manual-playback-settings="true">
      <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/70 bg-amber-50/40 dark:bg-amber-950/15 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
        <b>Manual Play</b> controls the circular Play buttons on Card headers and individual sentences. Manual Play never overwrites your Global Player settings. Note: clicking the tiny <b>Play EN</b> or <b>Play ID</b> icon next to a paragraph heading plays that single channel once for the Card.
      </div>
      <ManualTargetControls title="Entire Card · Card Play" badge="Play Card button" prefix="manualCard" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
      <ManualTargetControls title="One Sentence · Segment Only" badge="Sentence click / Play" prefix="manualSegment" preferences={preferences} disabled={disabled} onChange={onPlaybackFeelChange}/>
    </section>}

    {/* TAB 3: DISPLAY */}
    {activeTab === 'display' && <section className="space-y-3" data-text-player-show-play="true">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 space-y-3">
        <div className="flex gap-2 items-center">
          <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/>
          <p className="text-[12px] font-black text-slate-800 dark:text-slate-200">1. Visible Text & Meaning Channels</p>
        </div>
        <ChoiceGroup
          title="Text Display Order & Visibility (Shown on cards)"
          subtitle="Controls which reading containers (TEXT / MEANING) are visible on screen. Does not change what audio plays."
          options={DISPLAY_OPTIONS.map(value => ({ value, label: getStructuredTextDisplayModeLabel(value) }))}
          value={preferences.displayMode || TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING}
          disabled={disabled}
          onChange={onDisplayModeChange}
        />

        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700">
          <ChoiceGroup
            title="Card Expansion Preference (Synced with Workspace Toolbar)"
            subtitle="Follow Playback opens only the active Card; Expand All opens every Card; Custom remembers manual clicks."
            options={EXPANSION_OPTIONS}
            value={preferences.cardExpansionMode || TEXT_CARD_EXPANSION_MODES.FOLLOW}
            disabled={false}
            onChange={value => onPlaybackFeelChange?.({ cardExpansionMode: value })}
          />
        </div>
      </div>

      {/* Explicit 5-Concept Distinction Guide */}
      <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/70 bg-indigo-50/30 dark:bg-indigo-950/15 p-3.5 space-y-2" data-text-settings-terminology-guide="true">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"/>
          <p className="text-[11px] font-black uppercase tracking-wide text-indigo-800 dark:text-indigo-200">Quick Reference: How Settings Relate</p>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 p-2 border border-slate-200/70 dark:border-slate-800">
            <b className="text-indigo-700 dark:text-indigo-300">1. Language Playback Order:</b> Which language channel is spoken (<code className="text-[9px]">EN</code>, <code className="text-[9px]">ID</code>, <code className="text-[9px]">EN → ID</code>, or <code className="text-[9px]">ID → EN</code>).
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 p-2 border border-slate-200/70 dark:border-slate-800">
            <b className="text-indigo-700 dark:text-indigo-300">2. Local Voice Priority:</b> Which downloaded Edge voice (e.g. Sonia vs Ryan) wins when multiple local files are Ready.
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 p-2 border border-slate-200/70 dark:border-slate-800">
            <b className="text-indigo-700 dark:text-indigo-300">3. Text Display Visibility:</b> Which text boxes (<code className="text-[9px]">TEXT</code> / <code className="text-[9px]">MEANING</code>) are shown visually on Cards.
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-slate-900/40 p-2 border border-slate-200/70 dark:border-slate-800">
            <b className="text-indigo-700 dark:text-indigo-300">4. Global vs Manual Playback:</b> <b>Global</b> traverses the document via the bottom bar; <b>Manual</b> plays a single Card or Sentence on demand.
          </div>
        </div>
      </div>
    </section>}
  </div>;
}
