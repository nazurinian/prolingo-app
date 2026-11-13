import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Headphones, Link2, MessageSquare, Server, Users, Volume2 } from 'lucide-react';
import { collectTextStructuredConversationSpeakers, getTextStructuredSpeakerAssignedVoiceName } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import {
  formatTextStructuredBrowserVoiceLabel,
  getTextStructuredVoiceOverrideProfile,
  getTextStructuredVoiceSourceDisplayLabel,
  resolveTextStructuredBrowserVoiceResolution
} from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { getTextStructuredPlaybackRateProfile } from '../../domain/text/textStructuredPlaybackRateProfileDomain.js';
import { getTextStructuredLocalAudioProfile } from '../../domain/text/textStructuredLocalAudioProfileDomain.js';
import { getTextStructuredAudioDownloadChannelMode, getTextStructuredAudioDownloadProfile, TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import { getTextStructuredAudioSyncProfile } from '../../domain/text/textStructuredAudioSyncProfileDomain.js';
import { TEXT_STRUCTURED_AUDIO_SOURCE_MODES } from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import TextAudioDataPanel from './TextAudioDataPanel.jsx';
import { PlaybackProfileOrderEditor } from './TextStructuredPlaybackControls.jsx';

const clean = value => String(value ?? '').trim();
const compactVoiceLabel = value => {
  const name = clean(value);
  if (!name) return 'Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
};
const uniqueNames = voices => [...new Set((Array.isArray(voices) ? voices : []).map(v => clean(v?.name)).filter(Boolean))];
const normalizedRate = (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const RateControl = ({ label, value, disabled, helper = null, onChange }) => {
  const currentRate = normalizedRate(value);
  return <label className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-2.5">
    <span className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[10px] font-black normal-case text-indigo-700 dark:text-indigo-300">{currentRate.toFixed(1)}×</span>
        {currentRate !== 1 && (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => { event.preventDefault(); onChange?.(1); }}
            className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[8px] font-bold text-slate-500 hover:text-indigo-600"
            title="Reset speed to 1.0×"
          >
            1.0×
          </button>
        )}
      </span>
    </span>
    <input type="range" min="0.5" max="2" step="0.1" value={currentRate} disabled={disabled} onChange={event => onChange?.(Number(event.target.value))} className="w-full accent-indigo-600 disabled:opacity-40"/>
    {helper && <span className="mt-1 block text-[8px] font-semibold normal-case text-sky-600 dark:text-sky-300">{helper}</span>}
  </label>;
};

const VoiceSelect = ({ label, value, options, fallbackLabel, disabled, helper = null, onChange }) => <label className="block rounded-xl border border-indigo-100 dark:border-indigo-900/80 bg-white dark:bg-slate-900/50 p-2.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
  <span className="flex items-center justify-between gap-1">
    <span>{label}</span>
    <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${value ? 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
      {value ? 'Workspace Narrator' : 'Inherits Global Browser TTS'}
    </span>
  </span>
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-55">
    <option value="">{fallbackLabel}</option>
    {value && !options.includes(value) && <option value={value}>Unavailable in browser • {formatTextStructuredBrowserVoiceLabel(value)}</option>}
    {options.map(name => <option key={name} value={name}>{formatTextStructuredBrowserVoiceLabel(name)}</option>)}
  </select>
  {helper && <span className="mt-1 block text-[8px] font-semibold text-sky-600 dark:text-sky-300">{helper}</span>}
</label>;

const TextGlobalVoiceSelect = ({ channel, title, selected, effectiveName, options, disabled, onChange }) => (
  <label className="block rounded-xl border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900/45 p-2.5 text-[9px] font-bold text-slate-700 dark:text-slate-200">
    <span className="block mb-1.5">{title}</span>
    <select data-text-global-voice-select={channel} value={selected || ''} disabled={disabled}
      onChange={event => onChange?.(event.target.value || null, channel)}
      className="w-full min-w-0 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-800 px-2.5 py-2 text-[10px] text-slate-700 dark:text-slate-200">
      <option value="">DEFAULT · Browser automatic</option>
      {selected && !options.includes(selected) && <option value={selected}>Unavailable · {formatTextStructuredBrowserVoiceLabel(selected)}</option>}
      {options.map(name => <option key={name} value={name}>{formatTextStructuredBrowserVoiceLabel(name)}</option>)}
    </select>
  </label>
);

const DownloadPresetSelect = ({ value, disabled, onChange }) => <select value={value || TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT} disabled={disabled} onChange={event => onChange?.(event.target.value)} className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-semibold text-violet-800 dark:text-violet-200 disabled:opacity-55" data-text-download-preset-select="true">
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT}>DEFAULT • Inherit Global Edge Voice</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER}>FOLLOW PLAYER • Match Browser TTS Voice</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM}>CUSTOM • Pin Workspace Edge Voice</option>
</select>;

const LocalVoiceSelect = ({ label, value, options, disabled, helper = null, onChange }) => <label className="block rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-300">
  {label}
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1.5 w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-55">
    <option value="">Browser TTS fallback</option>
    {value && !options.includes(value) && <option value={value}>Unavailable here • {compactVoiceLabel(value)}</option>}
    {options.map(name => <option key={name} value={name}>{compactVoiceLabel(name)} • local</option>)}
  </select>
  {helper && <span className="mt-1 block text-[8px] font-semibold text-sky-600 dark:text-sky-300">{helper}</span>}
</label>;

const SourceStatus = ({ status }) => {
  if (!status) return <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-[9px] text-slate-400" data-text-playback-source-status="idle">Live playback source telemetry (Local MP3 vs Browser TTS) will appear here when audio plays.</div>;
  const isLocal = status.source === 'local' || status.mode === 'local';
  const isTts = status.source === 'tts' || status.mode === 'tts';
  const label = isLocal
    ? `Local MP3 • ${status.origin || 'Staged Audio'}`
    : isTts
      ? 'Browser TTS (SpeechSynthesis)'
      : 'Source Unavailable';
  const effectiveVoice = isLocal
    ? (compactVoiceLabel(status.voiceId || status.effectiveVoice) || 'Local MP3')
    : formatTextStructuredBrowserVoiceLabel(status.effectiveVoice || status.voiceId || status.voice);
  const requestedVoice = !isLocal && status.requestedVoice
    ? formatTextStructuredBrowserVoiceLabel(status.requestedVoice)
    : null;
  const sourceRoleLabel = status.effectiveSourceLabel
    || (status.voiceSource ? getTextStructuredVoiceSourceDisplayLabel(status.voiceSource) : null);

  return <div className={`rounded-xl border px-3 py-2 space-y-1 ${isLocal ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/25' : isTts ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/25' : 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/25'}`} data-text-playback-source-status={status.source || status.mode || 'unknown'}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${status.channel === 'meaning' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'}`}>{status.channel === 'meaning' ? 'ID' : 'EN'}</span>
    </div>
    <p className="truncate text-[9px] font-bold text-slate-700 dark:text-slate-200">
      Effective: {effectiveVoice}{sourceRoleLabel ? ` (${sourceRoleLabel})` : ''}{status.syncedToFirstSpeaker ? ' • Following Speaker 1' : ''}
    </p>
    {requestedVoice && requestedVoice !== effectiveVoice && (
      <p className="truncate text-[8px] text-slate-500 dark:text-slate-400">
        Requested: {requestedVoice}{status.requestedSourceLabel ? ` (${status.requestedSourceLabel})` : ''}
      </p>
    )}
    {status.fallbackReason && (
      <p className="text-[8px] font-semibold text-amber-700 dark:text-amber-300" data-text-playback-fallback-reason="true">
        {status.fallbackReason}
      </p>
    )}
  </div>;
};

export default function TextStructuredAudioControls({
  documentTree,
  preferences = {},
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  globalTextRate = 1,
  globalMeaningRate = 1,
  availableLocalVoices = { channels: { text: [], meaning: [] }, speakerIds: {} },
  disabled = false,
  onAudioSourceModeChange,
  onDocumentVoiceChange,
  onGlobalBrowserTtsVoiceChange,
  onSpeakerVoiceChange,
  onDocumentRateChange,
  onSpeakerRateChange,
  onSyncSpeakerVoice,
  onSyncSpeakerRate,
  onDocumentLocalAudioVoiceChange,
  onSpeakerLocalAudioVoiceChange,
  generationPreferences = {},
  edgeGenerationVoices = [],
  onGenerationPreferencesChange,
  onDocumentDownloadVoiceChange,
  onDocumentDownloadModeChange,
  onSpeakerDownloadVoiceChange,
  edgeHealth = null,
  onEdgeHealthCheck,
  audioLibrary = null,
  playbackSourceStatus = null,
  playbackOrder = null,
  onGlobalPlaybackOrderChange = null
}) {
  const speakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const voiceProfile = useMemo(() => getTextStructuredVoiceOverrideProfile(documentTree), [documentTree?.metadata]);
  const rateProfile = useMemo(() => getTextStructuredPlaybackRateProfile(documentTree), [documentTree?.metadata]);
  const localProfile = useMemo(() => getTextStructuredLocalAudioProfile(documentTree), [documentTree?.metadata]);
  const downloadProfile = useMemo(() => getTextStructuredAudioDownloadProfile(documentTree), [documentTree?.metadata]);
  const syncProfile = useMemo(() => getTextStructuredAudioSyncProfile(documentTree), [documentTree?.metadata]);
  const orderedSegments = useMemo(() => {
    let displayIndex = 0;
    return (documentTree?.blocks || []).flatMap(block => (block?.segments || []).map(segment => ({ segment, displayIndex: ++displayIndex })));
  }, [documentTree?.blocks]);
  const englishNames = useMemo(() => uniqueNames(englishVoices), [englishVoices]);
  const indonesianNames = useMemo(() => uniqueNames(indonesianVoices), [indonesianVoices]);
  const edgeEnglish = useMemo(() => (edgeGenerationVoices || []).filter(voice => String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const edgeMeaning = useMemo(() => (edgeGenerationVoices || []).filter(voice => !String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const [audioSurface, setAudioSurface] = useState('playback');
  const [localReadyExpanded, setLocalReadyExpanded] = useState({});
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;

  const sourceMode = preferences.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const hasParagraphCards = documentTree.documentType === 'paragraph' || documentTree.documentType === 'mixed' || (documentTree.blocks || []).some(block => block?.blockType === 'paragraph');
  const hasConversationCards = documentTree.documentType === 'conversation' || documentTree.documentType === 'mixed' || (documentTree.blocks || []).some(block => block?.blockType === 'conversation');
  const localAudioEnabled = sourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY;
  const customLocal = localAudioEnabled && sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL;
  const firstSpeaker = speakers[0] || null;
  const firstEnVoice = firstSpeaker ? (getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: firstSpeaker.label, speakerId: firstSpeaker.id, channel: 'text' }) || '') : '';
  const firstIdVoice = firstSpeaker ? (getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: firstSpeaker.label, speakerId: firstSpeaker.id, channel: 'meaning' }) || '') : '';
  const firstEnRate = firstSpeaker ? (rateProfile.speakerIds?.text?.[firstSpeaker.id] || rateProfile.speakers?.text?.[String(firstSpeaker.label || '').trim().toLowerCase()] || rateProfile.channels?.text || globalTextRate || 1) : (rateProfile.channels?.text || globalTextRate || 1);
  const firstIdRate = firstSpeaker ? (rateProfile.speakerIds?.meaning?.[firstSpeaker.id] || rateProfile.speakers?.meaning?.[String(firstSpeaker.label || '').trim().toLowerCase()] || rateProfile.channels?.meaning || globalMeaningRate || 1) : (rateProfile.channels?.meaning || globalMeaningRate || 1);
  const firstLocalEn = firstSpeaker ? (localProfile.speakerIds?.text?.[firstSpeaker.id] || localProfile.speakers?.text?.[String(firstSpeaker.label || '').trim().toLowerCase()] || localProfile.channels?.text || '') : (localProfile.channels?.text || '');
  const firstLocalId = firstSpeaker ? (localProfile.speakerIds?.meaning?.[firstSpeaker.id] || localProfile.speakers?.meaning?.[String(firstSpeaker.label || '').trim().toLowerCase()] || localProfile.channels?.meaning || '') : (localProfile.channels?.meaning || '');
  const folderLocked = audioLibrary?.folderState?.locked === true || audioLibrary?.folderState?.status === 'deprecated-locked';
  const zipCount = Array.isArray(audioLibrary?.zipState?.archives) ? audioLibrary.zipState.archives.length : 0;
  const stagingCount = Number(audioLibrary?.staging?.count || 0);
  const localVoiceCountEn = (availableLocalVoices?.channels?.text || []).length;
  const localVoiceCountId = (availableLocalVoices?.channels?.meaning || []).length;

  const renderDocumentChannel = (channel, label, voices, fallback, globalRate, localOptions) => {
    const rate = rateProfile.channels?.[channel] || globalRate || 1;
    const resolution = resolveTextStructuredBrowserVoiceResolution({
      documentTree,
      block: null,
      segment: null,
      channel,
      globalVoiceName: fallback,
      availableBrowserVoices: channel === 'meaning' ? indonesianVoices : englishVoices,
      ignoreSegmentOverride: true,
      representationMode: 'full'
    });
    return <div className="grid gap-2" data-text-workspace-narrator-channel={channel}>
      <VoiceSelect
        label={`${label} • Workspace Narrator (Browser TTS)`}
        value={voiceProfile.channels?.[channel] || ''}
        options={voices}
        fallbackLabel="AUTO · Inherit Global"
        disabled={disabled}
        helper={`Effective: ${formatTextStructuredBrowserVoiceLabel(resolution.effectiveVoiceName)} (${resolution.effectiveSourceLabel})`}
        onChange={value => onDocumentVoiceChange?.(value, channel)}
      />
      {resolution.fallbackUsed && resolution.fallbackReason && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 px-2.5 py-1.5 text-[8px] font-semibold text-amber-800 dark:text-amber-200 flex items-start gap-1.5" data-text-workspace-voice-fallback={channel}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
          <span>{resolution.fallbackReason}</span>
        </div>
      )}
      <RateControl label={`${label} Playback Speed`} value={rate} disabled={disabled} onChange={value => onDocumentRateChange?.(value, channel)}/>
      {/* Workspace-pinned local voices are shown in the dedicated CUSTOM panel below. */}
    </div>;
  };

  const edgeStatusBadge = edgeHealth?.status === 'online'
    ? { label: 'ONLINE', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' }
    : edgeHealth?.status === 'testing'
      ? { label: 'TESTING…', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' }
      : edgeHealth?.status === 'error' || edgeHealth?.status === 'offline'
        ? { label: 'OFFLINE', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' }
        : null;

  // SETUP & SOURCES: Playback Voices / Generate Audio / Audio Library
  return <div className="space-y-3" data-text-audio-sidebar="true">
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-900/70 p-1" role="tablist" aria-label="Text Audio controls" data-text-audio-subtabs="true">
      {[['playback', 'Playback Voices'], ['download', 'Generate Audio'], ['library', 'Audio Library']].map(([tab, label]) => <button type="button" role="tab" key={tab} aria-selected={audioSurface === tab} onClick={() => setAudioSurface(tab)} className={`min-h-10 rounded-lg px-1.5 text-[10px] font-bold leading-tight transition-all ${audioSurface === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600'}`} data-text-audio-tab={tab}>{label}</button>)}
    </div>
    <p className="px-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
      {audioSurface === 'playback'
        ? 'What you hear: Browser TTS fallback voices, Local First routing, and Local Voice Priority.'
        : audioSurface === 'download'
          ? 'What you create: Edge neural generation voices & prosody. Generating audio never alters your playback voice.'
          : 'What is stored: Ready/Missing/Stale coverage, IndexedDB Staging binaries, and Portable Audio ZIP archives.'}
    </p>
    <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" data-text-audio-tab-divider="true" />

    {audioSurface === 'playback' && <section className="min-w-0 space-y-3" data-text-playback-audio-settings="true">
      <div className="flex items-start gap-2">
        <Headphones className="w-4 h-4 mt-0.5 text-indigo-600 dark:text-indigo-300 shrink-0"/>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Playback Voices & Routing</p>
          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400"> Inheritance order: <b>Segment → Card → Speaker / Workspace → Global</b>.</p>
        </div>
      </div>

      <SourceStatus status={playbackSourceStatus}/>
      <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" />

      <details className="min-w-0 space-y-2" data-text-playback-source-menu="true">
        <summary className="cursor-pointer select-none py-2 text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-300">1. Audio Source & Local MP3 <span className="ml-1 text-[9px] normal-case font-semibold text-slate-500 dark:text-slate-400">({localAudioEnabled ? (customLocal ? 'Custom' : 'Auto') : 'TTS Only'})</span></summary>
        <div className="space-y-3 pt-1">
      <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/45 p-2.5" data-text-local-audio-mode="true">
        <button type="button" disabled={disabled} aria-pressed={!localAudioEnabled}
          aria-label={`Global Player Source: ${localAudioEnabled ? 'Local First' : 'TTS Only'}. Switch to ${localAudioEnabled ? 'TTS Only' : 'Local First'}.`}
          onClick={() => onAudioSourceModeChange?.(localAudioEnabled ? TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY : TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST)}
          className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[9px] font-black transition-colors disabled:opacity-40 ${localAudioEnabled ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400' : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-300 hover:border-amber-400'}`}
          data-text-global-tts-status="true" data-text-audio-source-toggle="true"
          title={`Click to switch to ${localAudioEnabled ? 'TTS Only' : 'Local First'}`}>
          <span className="min-w-0"><span className="block">GLOBAL PLAYER SOURCE</span><span className="block text-[8px] font-medium opacity-70">Click to change</span></span>
          <span className="shrink-0 rounded px-1.5 py-1 bg-white/80 dark:bg-slate-900/60">{localAudioEnabled ? 'LOCAL FIRST' : 'TTS ONLY'}</span>
        </button>
        {localAudioEnabled && <div className="space-y-1.5">
          <p className="text-[9px] font-bold text-slate-600 dark:text-slate-300">Local MP3 voice selection</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={disabled} aria-pressed={!customLocal} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST)} className={`min-h-9 rounded-lg border px-2 text-[9px] font-black transition-colors disabled:opacity-40 ${!customLocal ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>AUTO · Priority</button>
            <button type="button" disabled={disabled} aria-pressed={customLocal} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL)} className={`min-h-9 rounded-lg border px-2 text-[9px] font-black transition-colors disabled:opacity-40 ${customLocal ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>CUSTOM · Pin Voice</button>
          </div>
        </div>}
        <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
          {!localAudioEnabled
            ? 'TTS Only bypasses local MP3 and uses Browser TTS. Tap the source button above to switch back.'
            : customLocal
              ? 'CUSTOM pins a local MP3 voice per narrator/speaker, with Browser TTS fallback if missing.'
              : 'AUTO uses the Ready local MP3 priority order, then Browser TTS if no matching file is available.'}
        </p>
        <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-600 dark:text-slate-300" data-text-local-audio-inventory="true">
          <div className="min-w-0 space-y-1 rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-2.5 py-2" data-text-local-storage-counts="true">
            <p>Staging: {stagingCount}</p>
            <p>ZIP: {zipCount}</p>
          </div>
          <div className="min-w-0 space-y-1 rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-2.5 py-2" data-text-local-voice-counts="true">
            <p>Local Voices:</p>
            <p>EN {localVoiceCountEn} • ID {localVoiceCountId}</p>
          </div>
        </div>
      </div>

      {localAudioEnabled && !customLocal && <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white/90 dark:bg-slate-900/40 p-3" data-text-audio-local-voice-priority="true">
        <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 flex items-center justify-between gap-2">
          <span>Local Voice Priority (EN & ID)</span>
          <span className="rounded bg-indigo-100 dark:bg-indigo-950/70 px-1.5 py-0.5 text-[8px] font-black text-indigo-700 dark:text-indigo-300">EN {localVoiceCountEn} • ID {localVoiceCountId}</span>
        </div>
        <p className="my-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">When multiple downloaded voices are Ready, use the first matching voice in this priority order.</p>
        <div className="grid gap-2">
          <PlaybackProfileOrderEditor channel="text" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
          <PlaybackProfileOrderEditor channel="meaning" playbackOrder={playbackOrder} availableLocalVoices={availableLocalVoices} disabled={disabled} onChange={onGlobalPlaybackOrderChange}/>
        </div>
      </section>}

      {customLocal && <section className="space-y-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white/90 dark:bg-slate-900/45 p-2.5" data-text-audio-custom-local-pins="true">
        <p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">Pinned Local Voice</p>
        <p className="text-[9px] text-slate-500 dark:text-slate-400">CUSTOM uses the pinned local MP3 voice when available; otherwise Browser TTS fallback applies. These settings do not change TTS narrator voices.</p>
        {hasParagraphCards && <div className="grid gap-2">
          <LocalVoiceSelect label="EN · Local Voice" value={localProfile.channels?.text || ''} options={availableLocalVoices?.channels?.text || []} disabled={disabled} onChange={value => onDocumentLocalAudioVoiceChange?.(value, 'text')}/>
          <LocalVoiceSelect label="ID · Local Voice" value={localProfile.channels?.meaning || ''} options={availableLocalVoices?.channels?.meaning || []} disabled={disabled} onChange={value => onDocumentLocalAudioVoiceChange?.(value, 'meaning')}/>
        </div>}
        {hasConversationCards && <p className="text-[9px] font-medium text-emerald-700 dark:text-emerald-300">For Conversations, set each speaker's pinned voice under Conversation Speakers below.</p>}
      </section>}

        </div>
      </details>

      <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" data-text-playback-menu-divider="true" />

      <details className="min-w-0 space-y-2" data-text-playback-voices-menu="true">
        <summary className="cursor-pointer select-none py-2 text-[11px] font-black uppercase text-sky-700 dark:text-sky-300">2. Browser TTS · Global & Workspace</summary>
        <div className="space-y-3 pt-1">
          <p className="px-1 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400"><b>Global</b> sets the Text-wide default. <b>Workspace</b> overrides it only here. Card and Segment voices are configured in Card Audio → Player. Conversation speakers have their own assignments. MP3 downloads are separate.</p>
      <section className="space-y-2 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/35 dark:bg-sky-950/15 p-2.5" data-text-global-browser-tts-settings="true">
        <p className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">Text Global Browser TTS</p>
        <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">Default for Text Workspaces unless overridden below. Table has its own Browser TTS preferences. These choices do not regenerate or change downloaded MP3 files.</p>
        <div className="grid gap-2">
          <TextGlobalVoiceSelect channel="text" title="EN · Global Default" selected={preferences.browserTextVoiceName} effectiveName={defaultTextVoiceName} options={englishNames} disabled={disabled} onChange={onGlobalBrowserTtsVoiceChange}/>
          <TextGlobalVoiceSelect channel="meaning" title="ID · Global Default" selected={preferences.browserMeaningVoiceName} effectiveName={defaultMeaningVoiceName} options={indonesianNames} disabled={disabled} onChange={onGlobalBrowserTtsVoiceChange}/>
        </div>
      </section>
      {hasParagraphCards && <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" />}

      {hasParagraphCards && <div className="space-y-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/75 dark:bg-slate-900/35 p-2.5" data-text-audio-paragraph="true">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-500"/>
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">This Workspace Narrator (Browser TTS)</span>
          </div>
          <span className="text-[8px] font-semibold text-slate-400">EN {englishNames.length} • ID {indonesianNames.length}</span>
        </div>
        {renderDocumentChannel('text', 'EN (Text)', englishNames, defaultTextVoiceName, globalTextRate, availableLocalVoices?.channels?.text || [])}
        {renderDocumentChannel('meaning', 'ID (Meaning)', indonesianNames, defaultMeaningVoiceName, globalMeaningRate, availableLocalVoices?.channels?.meaning || [])}
      </div>}
      {hasConversationCards && <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" />}

      {hasConversationCards && <div className="space-y-2.5 rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-white/75 dark:bg-slate-900/35 p-2.5" data-text-audio-conversation="true">
        <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-sky-500"/><span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Conversation Speakers ({speakers.length})</span></div>
        {speakers.length > 1 && <div className="grid grid-cols-2 gap-1.5" data-text-audio-sync-grid="true">
          {[
            { key: 'en-voice', label: 'EN VOICE', active: syncProfile.voice?.text === true, tone: 'sky', click: () => onSyncSpeakerVoice?.('text', !(syncProfile.voice?.text === true)) },
            { key: 'en-speed', label: 'EN SPEED', active: syncProfile.rate?.text === true, tone: 'sky', click: () => onSyncSpeakerRate?.('text', !(syncProfile.rate?.text === true)) },
            { key: 'id-voice', label: 'ID VOICE', active: syncProfile.voice?.meaning === true, tone: 'violet', click: () => onSyncSpeakerVoice?.('meaning', !(syncProfile.voice?.meaning === true)) },
            { key: 'id-speed', label: 'ID SPEED', active: syncProfile.rate?.meaning === true, tone: 'violet', click: () => onSyncSpeakerRate?.('meaning', !(syncProfile.rate?.meaning === true)) }
          ].map(item => <button key={item.key} type="button" aria-pressed={item.active} disabled={disabled} onClick={item.click} className={`flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border px-2 text-center text-[8px] font-black transition-colors ${item.active ? (item.tone === 'sky' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-violet-600 border-violet-600 text-white') : (item.tone === 'sky' ? 'border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300' : 'border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300')}`}>
            {item.key.includes('voice') && <Link2 className="w-3 h-3 shrink-0"/>}<span>SYNC {item.label} • {item.active ? 'ON' : 'OFF'}</span>
          </button>)}
        </div>}
        {speakers.length > 1 && <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">Sync temporarily links followers to Speaker 1 without overwriting their saved individual voices or speeds.</p>}
        {speakers.map(({ id, label }, index) => {
          const savedEnVoice = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId: id, channel: 'text' }) || '';
          const savedIdVoice = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId: id, channel: 'meaning' }) || '';
          const savedEnRate = rateProfile.speakerIds?.text?.[id] || rateProfile.speakers?.text?.[label?.toLowerCase?.()] || rateProfile.channels?.text || globalTextRate || 1;
          const savedIdRate = rateProfile.speakerIds?.meaning?.[id] || rateProfile.speakers?.meaning?.[label?.toLowerCase?.()] || rateProfile.channels?.meaning || globalMeaningRate || 1;
          const local = availableLocalVoices?.speakerIds?.[id] || { text: [], meaning: [] };
          const savedLocalEn = localProfile.speakerIds?.text?.[id] || localProfile.speakers?.text?.[label?.toLowerCase?.()] || localProfile.channels?.text || '';
          const savedLocalId = localProfile.speakerIds?.meaning?.[id] || localProfile.speakers?.meaning?.[label?.toLowerCase?.()] || localProfile.channels?.meaning || '';
          const enVoiceFollower = index > 0 && syncProfile.voice?.text === true;
          const idVoiceFollower = index > 0 && syncProfile.voice?.meaning === true;
          const enRateFollower = index > 0 && syncProfile.rate?.text === true;
          const idRateFollower = index > 0 && syncProfile.rate?.meaning === true;
          const effectiveEnVoice = enVoiceFollower ? firstEnVoice : savedEnVoice;
          const effectiveIdVoice = idVoiceFollower ? firstIdVoice : savedIdVoice;
          const effectiveEnRate = enRateFollower ? firstEnRate : savedEnRate;
          const effectiveIdRate = idRateFollower ? firstIdRate : savedIdRate;
          const effectiveLocalEn = enVoiceFollower ? firstLocalEn : savedLocalEn;
          const effectiveLocalId = idVoiceFollower ? firstLocalId : savedLocalId;
          const syncNotes = [
            enVoiceFollower ? `EN voice follows 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedEnVoice || defaultTextVoiceName)}` : null,
            enRateFollower ? `EN speed follows 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${Number(savedEnRate).toFixed(1)}×` : null,
            idVoiceFollower ? `ID voice follows 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedIdVoice || defaultMeaningVoiceName)}` : null,
            idRateFollower ? `ID speed follows 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${Number(savedIdRate).toFixed(1)}×` : null
          ].filter(Boolean);
          const localSegments = local.segments || {};
          const localSegmentRows = orderedSegments.filter(({ segment }) => localSegments[segment.id]).map(({ segment, displayIndex }) => ({
            segment,
            segmentIndex: displayIndex,
            channels: localSegments[segment.id]
          }));
          const localReadyOpen = Boolean(localReadyExpanded[id]);
          return <div key={id} className={`rounded-xl border bg-white/95 dark:bg-slate-900/50 p-2.5 ${index === 0 ? 'border-indigo-200 dark:border-indigo-900' : 'border-sky-100 dark:border-sky-900'}`} data-text-audio-speaker={id}>
            <div className="mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-sky-500"/><span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{index + 1}. {label}</span>{index === 0 && speakers.length > 1 && <span className="ml-auto rounded bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.5 text-[8px] font-black text-indigo-600 dark:text-indigo-300">SYNC MASTER</span>}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2"><VoiceSelect label="EN • TTS Voice" value={effectiveEnVoice} options={englishNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultTextVoiceName)}`} disabled={disabled || enVoiceFollower} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'text')}/><RateControl label="EN Speed" value={effectiveEnRate} disabled={disabled || enRateFollower} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'text')}/>{customLocal && <LocalVoiceSelect label="EN • Custom Local" value={effectiveLocalEn} options={local.text || []} disabled={disabled || enVoiceFollower} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'text')}/>}</div>
              <div className="space-y-2"><VoiceSelect label="ID • TTS Voice" value={effectiveIdVoice} options={indonesianNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultMeaningVoiceName)}`} disabled={disabled || idVoiceFollower} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'meaning')}/><RateControl label="ID Speed" value={effectiveIdRate} disabled={disabled || idRateFollower} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'meaning')}/>{customLocal && <LocalVoiceSelect label="ID • Custom Local" value={effectiveLocalId} options={local.meaning || []} disabled={disabled || idVoiceFollower} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'meaning')}/>}</div>
            </div>
            {syncNotes.length > 0 && <div className="mt-2 space-y-0.5 px-0.5" data-text-audio-sync-notes={id}>{syncNotes.map(note => <p key={note} className="text-[8px] font-semibold leading-relaxed text-sky-600 dark:text-sky-300">{note}</p>)}</div>}
            <button type="button" onClick={() => setLocalReadyExpanded(current => ({ ...current, [id]: !current[id] }))} className="mt-2 flex min-h-9 w-full items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 px-2.5 text-left text-[9px] font-black text-emerald-700 dark:text-emerald-300" aria-expanded={localReadyOpen}>
              <span>LOCAL READY • {localSegmentRows.length} segment{localSegmentRows.length === 1 ? '' : 's'} • EN {(local.text || []).length} voice{(local.text || []).length === 1 ? '' : 's'} • ID {(local.meaning || []).length} voice{(local.meaning || []).length === 1 ? '' : 's'}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${localReadyOpen ? 'rotate-180' : ''}`}/>
            </button>
            {localReadyOpen && <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-emerald-100 dark:border-emerald-900 bg-white/80 dark:bg-slate-900/45 p-2" data-text-local-ready-list={id}>
              {localSegmentRows.length === 0 && <p className="text-[8px] text-slate-400">No linked local audio is ready for this speaker yet.</p>}
              {localSegmentRows.map(({ segment, segmentIndex, channels }) => <div key={segment.id} className="rounded-md border border-slate-100 dark:border-slate-800 px-2 py-1.5">
                <p className="text-[8px] font-black text-slate-600 dark:text-slate-300">Segment {segmentIndex} • {segment.id}</p>
                <p className="mt-0.5 text-[8px] text-slate-500 dark:text-slate-400">EN: {(channels.text || []).map(compactVoiceLabel).join(', ') || '—'} • ID: {(channels.meaning || []).map(compactVoiceLabel).join(', ') || '—'}</p>
              </div>)}
            </div>}
          </div>;
        })}
        {speakers.length === 0 && <p className="text-[9px] text-amber-600 dark:text-amber-300">No speaker identity detected yet. Add Conversation segments first.</p>}
      </div>}
        </div>
      </details>
    </section>}

    {audioSurface === 'download' && <section className="min-w-0 space-y-3" data-text-download-defaults="true">
      <div className="space-y-2" data-text-generate-header="true">
        <div className="flex items-center gap-1.5">
          <Server className="w-4 h-4 text-violet-600 dark:text-violet-300 shrink-0"/>
          <p className="text-[11px] font-black uppercase leading-tight text-violet-700 dark:text-violet-300">Generate Audio · Edge MP3</p>
        </div>
        <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">Create MP3 in Staging; Browser TTS playback is unchanged. Card Audio handles single cards; Bulk Audio handles multi-voice and Full/Split batches.</p>
      </div>
      <button type="button" disabled={disabled || edgeHealth?.status === 'testing'} onClick={onEdgeHealthCheck}
        className={`w-full min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${edgeHealth?.status === 'online' ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 hover:border-emerald-500' : edgeHealth?.status === 'error' || edgeHealth?.status === 'offline' ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 hover:border-rose-500' : 'border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900/45 hover:border-violet-400'}`}
        data-text-edge-health-action="true" aria-label="Test Edge MP3 generation connectivity" title="Click to test Edge generation without changing downloaded Card audio">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">EDGE GENERATION STATUS</span>
            <span className="block text-[9px] font-medium text-slate-500 dark:text-slate-400">Click to test connection</span>
          </span>
          <span className="shrink-0 rounded px-2 py-1 text-[9px] font-black uppercase bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{edgeHealth?.status === 'online' ? 'READY' : edgeHealth?.status === 'testing' ? 'TESTING…' : edgeHealth?.status === 'error' || edgeHealth?.status === 'offline' ? 'FAILED' : 'NOT TESTED'}</span>
        </span>
        {edgeHealth?.message && <span className="mt-2 block break-words border-t border-slate-200/75 dark:border-slate-700 pt-2 text-[9px] font-medium text-slate-600 dark:text-slate-300">{edgeHealth.message}</span>}
      </button>
      <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" />

      <details className="rounded-xl border border-violet-100 dark:border-violet-900/80 bg-white/90 dark:bg-slate-900/40 p-2.5 space-y-2.5" data-text-audio-global-edge-advanced="true">
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">1. Global Edge Generation · Advanced</summary>
        <p className="my-2 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">Shared EN/ID Edge voices, rate and pitch. Workspace DEFAULT inherits them. Browser TTS playback stays separate.</p>
        <button type="button" disabled={disabled || (generationPreferences?.edgeTextVoiceId === 'en-GB-SoniaNeural' && generationPreferences?.edgeMeaningVoiceId === 'id-ID-GadisNeural')}
          onClick={() => onGenerationPreferencesChange?.({ edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural' })}
          className="mb-2 min-h-9 w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-2.5 text-[9px] font-black text-violet-700 dark:text-violet-300 hover:border-violet-400 disabled:opacity-45"
          data-text-global-edge-restore-default="true">Use defaults · Sonia EN / Gadis ID</button>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300">Global Edge EN Voice
            <select disabled={disabled} value={generationPreferences?.edgeTextVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeTextVoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 dark:text-slate-200">{edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select>
          </label>
          <label className="text-[9px] font-bold text-slate-600 dark:text-slate-300">Global Edge ID Voice
            <select disabled={disabled} value={generationPreferences?.edgeMeaningVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeMeaningVoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 dark:text-slate-200">{edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select>
          </label>
          <label className="rounded-lg border border-slate-200/80 dark:border-slate-800 p-2 text-[9px] font-bold text-slate-600 dark:text-slate-300">
            <span className="flex items-center justify-between mb-1">
              <span>Download Rate</span>
              <span className="font-black text-violet-700 dark:text-violet-300">{Number(generationPreferences?.edgeRate || 0) >= 0 ? '+' : ''}{generationPreferences?.edgeRate || 0}%</span>
            </span>
            <input disabled={disabled} type="range" min="-50" max="50" step="10" value={generationPreferences?.edgeRate || 0} onChange={event => onGenerationPreferencesChange?.({ edgeRate: Number(event.target.value) })} className="w-full accent-violet-600"/>
          </label>
          <label className="rounded-lg border border-slate-200/80 dark:border-slate-800 p-2 text-[9px] font-bold text-slate-600 dark:text-slate-300">
            <span className="flex items-center justify-between mb-1">
              <span>Download Pitch</span>
              <span className="font-black text-violet-700 dark:text-violet-300">{Number(generationPreferences?.edgePitch || 0) >= 0 ? '+' : ''}{generationPreferences?.edgePitch || 0}Hz</span>
            </span>
            <input disabled={disabled} type="range" min="-20" max="20" step="5" value={generationPreferences?.edgePitch || 0} onChange={event => onGenerationPreferencesChange?.({ edgePitch: Number(event.target.value) })} className="w-full accent-violet-600"/>
          </label>
        </div>
      </details>
      <div role="separator" aria-hidden="true" className="border-t border-slate-200 dark:border-slate-700" data-text-generation-menu-divider="true" />

      <details className="rounded-xl border border-violet-100 dark:border-violet-900/80 bg-white/90 dark:bg-slate-900/40 p-2.5 space-y-2" data-text-audio-workspace-edge-preset="true">
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">2. This Workspace · MP3 Voice Preset</summary>
        <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">DEFAULT = Global Edge · FOLLOW PLAYER = map the effective Browser TTS voice (including Card/Segment overrides) · CUSTOM = this Workspace's own Edge voice.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {['text', 'meaning'].map(channel => {
            const isMeaning = channel === 'meaning';
            const mode = getTextStructuredAudioDownloadChannelMode(documentTree, channel);
            const pool = isMeaning ? edgeMeaning : edgeEnglish;
            const voice = downloadProfile.channels?.[channel] || '';
            return <div key={channel} className="rounded-lg border border-violet-100 dark:border-violet-900/80 bg-slate-50/60 dark:bg-slate-900/50 p-2">
              <p className="mb-1 text-[9px] font-black text-slate-600 dark:text-slate-300">{isMeaning ? 'ID (Meaning)' : 'EN (Text)'}</p>
              <DownloadPresetSelect value={mode} disabled={disabled} onChange={next => onDocumentDownloadModeChange?.(next, channel)}/>
              {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT && <p className="mt-1.5 text-[8px] font-semibold text-violet-700 dark:text-violet-300">Global Edge · {compactVoiceLabel(isMeaning ? generationPreferences?.edgeMeaningVoiceId : generationPreferences?.edgeTextVoiceId)}</p>}
              {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && <select value={voice} disabled={disabled} onChange={event => onDocumentDownloadVoiceChange?.(event.target.value || null, channel)} className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[10px]"><option value="">Choose Edge voice…</option>{pool.map(item => <option key={item.id} value={item.id}>{item.label || compactVoiceLabel(item.id)}</option>)}</select>}
              {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER && <p className="mt-1.5 text-[8px] font-semibold text-sky-600 dark:text-sky-300">Maps the effective Browser TTS voice at generation time (not always the Workspace narrator).</p>}
            </div>;
          })}
        </div>
        {hasConversationCards && speakers.length > 0 && <details className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5" data-text-audio-speaker-download-advanced="true"><summary className="cursor-pointer text-[9px] font-black uppercase text-slate-500 dark:text-slate-400">Advanced · Speaker Edge Generation Overrides</summary>{speakers.map(({ id, label }) => <div key={id} className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_1fr_1fr] items-center"><span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 truncate">{label}</span><select value={downloadProfile.speakerIds?.text?.[id] || ''} disabled={disabled} onChange={event => onSpeakerDownloadVoiceChange?.({ id, label }, event.target.value || null, 'text')} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]"><option value="">EN • Workspace preset</option>{edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select><select value={downloadProfile.speakerIds?.meaning?.[id] || ''} disabled={disabled} onChange={event => onSpeakerDownloadVoiceChange?.({ id, label }, event.target.value || null, 'meaning')} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]"><option value="">ID • Workspace preset</option>{edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></div>)}</details>}
      </details>
    </section>}

    {audioSurface === 'library' && <section className="min-w-0 space-y-3" data-text-audio-library-surface="true">
      <div className="flex items-start gap-2">
        <Headphones className="mt-0.5 w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"/>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Your Local Audio Library</p>
          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">Inspect Ready/Missing/Stale status, manage IndexedDB Staging binaries, and import Portable Audio ZIP packages.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-black">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/80 p-2 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300">{localVoiceCountEn} EN Local Voice{localVoiceCountEn === 1 ? '' : 's'}</div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/80 p-2 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300">{localVoiceCountId} ID Local Voice{localVoiceCountId === 1 ? '' : 's'}</div>
      </div>
      <TextAudioDataPanel audioLibrary={audioLibrary} compact={false} embedded={true} disabled={disabled}/>
    </section>}
  </div>;
}
