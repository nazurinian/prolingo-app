import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, Download, FileDown, Package, Play, Square, Users, Volume2, X } from 'lucide-react';
import {
  collectTextStructuredCardSpeakers,
  getTextStructuredVoiceOverrideLabel,
  getTextStructuredVoiceOverrideProfile,
  resolveTextStructuredEffectiveVoiceProfile
} from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../domain/text/textStructuredAudioRuntimeDomain.js';
import { getTextStructuredAudioDownloadChannelMode, getTextStructuredAudioDownloadProfile, resolveTextStructuredEffectiveDownloadVoice, TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import { useLiveOverlayViewportRef } from '../../hooks/useStableOverlayViewport.js';

const clean = value => String(value ?? '').trim();

const compactVoiceLabel = value => {
  const name = clean(value);
  if (!name) return 'Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 30 ? `${name.slice(0, 29)}…` : name;
};

const clue = (segment, channel = 'text') => {
  const value = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
  if (!value) return '—';
  return value.length > 54 ? `${value.slice(0, 53)}…` : value;
};

const uniqueVoiceNames = voices => [...new Set((Array.isArray(voices) ? voices : [])
  .map(voice => clean(voice?.name))
  .filter(Boolean))];

const VoiceSelect = ({ value, inheritedLabel, voices, disabled, onChange, testId }) => {
  const names = uniqueVoiceNames(voices);
  const missing = value && !names.includes(value);
  return <select
    value={value || ''}
    disabled={disabled}
    onChange={event => onChange?.(event.target.value || null)}
    className="w-full min-w-0 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-base md:text-[10px] text-slate-700 dark:text-slate-200 disabled:opacity-50"
    data-text-voice-override-select={testId}
  >
    <option value="">Use sidebar • {inheritedLabel || 'default'}</option>
    {missing && <option value={value}>Unavailable • {compactVoiceLabel(value)}</option>}
    {names.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
  </select>;
};

const VoiceSummary = ({ label, value, accent = 'slate' }) => (
  <div className={`min-w-0 rounded-xl border px-2.5 py-2 ${accent === 'sky' ? 'border-sky-100 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/20'}`}>
    <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</p>
    <p className="mt-0.5 truncate text-[10px] font-bold text-slate-700 dark:text-slate-200" title={value}>{compactVoiceLabel(value)}</p>
  </div>
);

const EdgeVoiceSelect = ({ value, inheritedVoiceId, voices, channel = 'text', disabled, onChange, testId }) => {
  const pool = (Array.isArray(voices) ? voices : []).filter(voice => channel === 'meaning'
    ? !String(voice?.lang || '').startsWith('en-')
    : String(voice?.lang || '').startsWith('en-'));
  const known = pool.some(voice => voice?.id === value);
  return <select
    value={value || ''}
    disabled={disabled}
    onChange={event => onChange?.(event.target.value || null)}
    className="w-full min-w-0 min-h-11 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-3 py-2 text-base md:text-[10px] text-violet-800 dark:text-violet-200 disabled:opacity-50"
    data-text-download-voice-select={testId}
  >
    <option value="">Use inherited Edge • {compactVoiceLabel(inheritedVoiceId)}</option>
    {value && !known && <option value={value}>{compactVoiceLabel(value)}</option>}
    {pool.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}
  </select>;
};

const DownloadPresetSelect = ({ value, disabled, onChange, testId }) => <select value={value || TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT} disabled={disabled} onChange={event => onChange?.(event.target.value)} className="w-full min-w-0 min-h-10 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-2.5 py-2 text-[9px] text-violet-800 dark:text-violet-200 disabled:opacity-50" data-text-card-download-preset={testId}>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT}>DEFAULT • inherit</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER}>FOLLOW PLAYER</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM}>CUSTOM • Edge voice</option>
</select>;

export const TextStructuredCardAudioPanel = ({
  documentTree,
  block,
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  generationPreferences = {},
  edgeGenerationVoices = [],
  cardCoverage = null,
  audioCoverageMap = {},
  generationRunning = false,
  disabled = false,
  onClose,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onCardDownloadVoiceChange,
  onCardDownloadModeChange,
  onSegmentDownloadVoiceChange,
  onSegmentDownloadModeChange,
  onPreviewTts,
  onGenerateCardAudio,
  onCancelGeneration,
  onExportSegmentAudio,
  onExportCardZip,
  onExportFullCardAudio
}) => {
  const [showSegments, setShowSegments] = useState(false);
  const [showParagraphOverrides, setShowParagraphOverrides] = useState(false);
  const [expandedSpeakerKey, setExpandedSpeakerKey] = useState(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState([]);
  const overlayRef = useLiveOverlayViewportRef(true);
  const segments = Array.isArray(block?.segments) ? block.segments : [];
  const cardProfile = getTextStructuredVoiceOverrideProfile(block);
  const cardDownloadProfile = getTextStructuredAudioDownloadProfile(block);
  const speakers = useMemo(() => collectTextStructuredCardSpeakers(block), [block]);
  const firstSegment = segments[0] || null;
  const isConversation = block?.blockType === 'conversation';
  const cardChannelCoverage = useMemo(() => {
    const result = { text: { total: 0, ready: 0, voices: new Set() }, meaning: { total: 0, ready: 0, voices: new Set() } };
    segments.forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const slot = audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { status: 'missing' };
        result[channel].total += 1;
        if (slot.status === 'ready') result[channel].ready += 1;
        if (slot.requiredVoiceId) result[channel].voices.add(slot.requiredVoiceId);
      });
    });
    return result;
  }, [segments, audioCoverageMap]);

  useEffect(() => {
    setSelectedSegmentIds([]);
  }, [block?.id]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const inheritedFor = (segment, channel, ignoreCard = false) => {
    const safeBlock = ignoreCard ? { ...block, metadata: {} } : block;
    const resolved = resolveTextStructuredEffectiveVoiceProfile({
      documentTree,
      block: safeBlock,
      segment: segment ? { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } } : null,
      channel,
      defaultVoiceName: channel === 'meaning' ? defaultMeaningVoiceName : defaultTextVoiceName,
    });
    return `${compactVoiceLabel(resolved.voiceName)} · ${getTextStructuredVoiceOverrideLabel(resolved.source)}`;
  };

  const speakerOverrideCount = speakers.reduce((count, { id, key }) => (
    count
    + ((cardProfile.speakerIds?.text?.[id] || cardProfile.speakers?.text?.[key]) ? 1 : 0)
    + ((cardProfile.speakerIds?.meaning?.[id] || cardProfile.speakers?.meaning?.[key]) ? 1 : 0)
  ), 0);

  return <div
    ref={overlayRef}
    className="fixed left-0 top-0 z-[90] box-border flex items-end md:items-center justify-center overflow-hidden overscroll-none bg-slate-950/45 p-1.5 md:p-4 animate-in fade-in duration-150"
    data-text-card-audio-panel={block?.id}
    role="presentation"
    onClick={onClose}
  >
    <div
      className="prolingo-text-audio-sheet flex w-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Audio settings for ${block?.title || 'Text card'}`}
      onClick={event => event.stopPropagation()}
    >
      <div className="prolingo-text-audio-sheet-header sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2.5 md:px-4">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center"><Volume2 className="w-4 h-4"/></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] md:text-sm font-black text-slate-800 dark:text-white truncate">Card Audio</h3>
          <p className="text-[9px] text-slate-400 truncate">{isConversation ? `${speakers.length} speaker${speakers.length === 1 ? '' : 's'} detected` : 'Paragraph'} • {segments.length} segment{segments.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={onClose} className="w-11 h-11 shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center active:scale-95 transition" aria-label="Close audio settings"><X className="w-4 h-4"/></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 md:p-3 space-y-2.5" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="grid grid-cols-2 gap-2" data-text-card-audio-sidebar-defaults="true">
          <VoiceSummary label="Sidebar EN" value={defaultTextVoiceName}/>
          <VoiceSummary label="Sidebar ID" value={defaultMeaningVoiceName}/>
        </div>

        <div className="grid grid-cols-2 gap-2" data-text-card-manual-coverage="true">
          {['text', 'meaning'].map(channel => {
            const info = cardChannelCoverage[channel];
            const ready = info.total > 0 && info.ready === info.total;
            const voiceLabels = [...info.voices].map(compactVoiceLabel);
            return <div key={channel} className={`rounded-xl border px-2.5 py-2 ${ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/15'}`}>
              <div className="flex items-center gap-2"><p className="text-[8px] font-black uppercase tracking-wide text-slate-500">{channel === 'meaning' ? 'ID / Meaning' : 'EN / Text'}</p><span className="ml-auto text-[8px] font-black">{info.ready}/{info.total}</span></div>
              <p className="mt-1 truncate text-[8px] text-slate-400" title={voiceLabels.join(', ')}>{voiceLabels.length > 1 ? `Multi-voice • ${voiceLabels.join(' + ')}` : (voiceLabels[0] || 'No audio target')}</p>
            </div>;
          })}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-violet-50/70 dark:bg-violet-950/20 px-2.5 py-2" data-text-simple-audio-rule="true">
          <span className="shrink-0 rounded-md bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Default</span>
          <p className="min-w-0 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
            {isConversation
              ? 'Speakers inherit the Document speaker profile first. Expand a speaker only to customise this Card.'
              : 'This Card uses Sidebar voices. Open override only when this Paragraph needs a different voice.'}
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/45 dark:bg-violet-950/15 p-2.5" data-text-card-download-profile="true">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-violet-500"/>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Edge Download Profile</p>
              <p className="text-[8px] text-slate-400">DEFAULT inherits. FOLLOW PLAYER maps playback voice → Edge. CUSTOM pins Edge without changing playback.</p>
            </div>
            {cardCoverage && <span className={`shrink-0 rounded-lg px-2 py-1 text-[8px] font-black ${cardCoverage.needDownload ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}>{cardCoverage.covered}/{cardCoverage.total}</span>}
          </div>

          <div className="grid gap-2 md:grid-cols-2" data-text-card-download-presets="true">
            {['text', 'meaning'].map(channel => {
              const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block: { ...block, metadata: {} }, segment: firstSegment, channel, preferences: generationPreferences });
              const mode = getTextStructuredAudioDownloadChannelMode(block, channel);
              const value = cardDownloadProfile.channels?.[channel] || '';
              return <div key={channel} className="rounded-lg border border-violet-100 dark:border-violet-900 bg-white/70 dark:bg-slate-900/30 p-2">
                <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">{channel === 'meaning' ? 'ID download preset' : 'EN download preset'}</span>
                <DownloadPresetSelect value={mode} disabled={disabled} onChange={next => onCardDownloadModeChange?.(block.id, channel, next)} testId={`${block.id}:${channel}`}/>
                {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && <div className="mt-1.5"><EdgeVoiceSelect value={value} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onCardDownloadVoiceChange?.(block.id, channel, voiceId, null)} testId={`${block.id}:download:${channel}`}/></div>}
                {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER && <p className="mt-1.5 text-[7px] font-semibold text-sky-600 dark:text-sky-300">Maps each Segment's effective TTS playback voice to Edge.</p>}
              </div>;
            })}
          </div>

          {isConversation && <div className="mt-2 space-y-2">
            <p className="text-[8px] text-slate-400">Speaker Edge overrides are optional and take priority over the Card preset for that speaker.</p>
            {speakers.map(({ id, key, label }) => {
              const sample = segments.find(segment => segment?.metadata?.speakerIdentityV1 === id) || segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || firstSegment;
              return <div key={`download-${id}`} className="rounded-lg border border-violet-100 dark:border-violet-900 bg-white/70 dark:bg-slate-900/30 p-2">
                <p className="mb-1.5 text-[9px] font-black text-violet-700 dark:text-violet-300">{label}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {['text', 'meaning'].map(channel => {
                    const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block: { ...block, metadata: { ...block.metadata, audioDownloadProfileV1: { ...cardDownloadProfile, speakers: { text: {}, meaning: {} }, speakerIds: { text: {}, meaning: {} } } } }, segment: sample, channel, preferences: generationPreferences });
                    const value = cardDownloadProfile.speakerIds?.[channel]?.[id] || cardDownloadProfile.speakers?.[channel]?.[key] || '';
                    return <label key={channel} className="block min-w-0">
                      <span className="mb-1 block text-[8px] font-bold text-slate-500">{channel === 'meaning' ? 'ID custom Edge' : 'EN custom Edge'}</span>
                      <EdgeVoiceSelect value={value} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onCardDownloadVoiceChange?.(block.id, channel, voiceId, { id, label })} testId={`${block.id}:${id}:download:${channel}`}/>
                    </label>;
                  })}
                </div>
              </div>;
            })}
          </div>}
        </div>

        {!isConversation && <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-text-paragraph-audio-profile="true">
          <button type="button" onClick={() => setShowParagraphOverrides(value => !value)} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-left" aria-expanded={showParagraphOverrides}>
            {showParagraphOverrides ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Card voice override</span>
            <span className="ml-auto text-[8px] text-slate-400">optional</span>
          </button>
          {showParagraphOverrides && <div className="grid gap-2 p-3 md:grid-cols-2">
            {['text', 'meaning'].map(channel => {
              const isMeaning = channel === 'meaning';
              const value = cardProfile.channels?.[channel] || '';
              return <label key={channel} className="block min-w-0">
                <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-slate-500">{isMeaning ? 'ID / Meaning' : 'EN / Text'}</span>
                <VoiceSelect value={value} inheritedLabel={inheritedFor(firstSegment, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onCardVoiceChange?.(block.id, channel, voiceName, null)} testId={`${block.id}:${channel}`}/>
              </label>;
            })}
          </div>}
        </div>}

        {isConversation && <div className="space-y-2" data-text-conversation-card-voices="true">
          <div className="flex items-center gap-2 px-0.5">
            <Users className="w-4 h-4 text-sky-500"/>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Detected speakers</p>
              <p className="text-[8px] text-slate-400">{speakers.length || 0} found • {speakerOverrideCount} custom assignment{speakerOverrideCount === 1 ? '' : 's'}</p>
            </div>
          </div>

          {speakers.length === 0 && <div className="rounded-xl border border-dashed border-sky-200 dark:border-sky-900 p-3 text-center text-[9px] text-slate-400">Add speaker names to Conversation Segments first.</div>}

          {speakers.map(({ id, key, label }) => {
            const sample = segments.find(segment => segment?.metadata?.speakerIdentityV1 === id) || segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || null;
            const speakerExpanded = expandedSpeakerKey === id;
            const enOverride = cardProfile.speakerIds?.text?.[id] || cardProfile.speakers?.text?.[key] || '';
            const idOverride = cardProfile.speakerIds?.meaning?.[id] || cardProfile.speakers?.meaning?.[key] || '';
            const hasOverride = Boolean(enOverride || idOverride);
            return <div key={id} className={`rounded-xl border overflow-hidden transition ${hasOverride ? 'border-sky-200 dark:border-sky-800 bg-sky-50/55 dark:bg-sky-950/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-mobile-speaker-card={id}>
              <button type="button" onClick={() => setExpandedSpeakerKey(current => current === id ? null : id)} className="w-full min-h-11 flex items-center gap-2 px-2.5 py-2 text-left" aria-expanded={speakerExpanded} aria-controls={`speaker-voice-${block.id}-${id}`}>
                <span className="shrink-0 px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-[10px] font-black text-sky-700 dark:text-sky-300">{label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] text-slate-600 dark:text-slate-300">{clue(sample, 'text')}</p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-400">{hasOverride ? `Custom • EN ${compactVoiceLabel(enOverride || defaultTextVoiceName)} • ID ${compactVoiceLabel(idOverride || defaultMeaningVoiceName)}` : `Document/global inherit • ${compactVoiceLabel(defaultTextVoiceName)}`}</p>
                </div>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${speakerExpanded ? 'rotate-180' : ''}`}/>
              </button>

              {speakerExpanded && <div id={`speaker-voice-${block.id}-${id}`} className="grid gap-2 border-t border-slate-100 dark:border-slate-800 p-3 md:grid-cols-2">
                {['text', 'meaning'].map(channel => {
                  const isMeaning = channel === 'meaning';
                  const value = cardProfile.speakerIds?.[channel]?.[id] || cardProfile.speakers?.[channel]?.[key] || '';
                  return <label key={channel} className="block min-w-0">
                    <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-slate-500">{isMeaning ? 'ID voice' : 'EN voice'}</span>
                    <VoiceSelect value={value} inheritedLabel={inheritedFor(sample, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onCardVoiceChange?.(block.id, channel, voiceName, { id, label })} testId={`${block.id}:${id}:${channel}`}/>
                  </label>;
                })}
              </div>}
            </div>;
          })}
        </div>}

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-text-segment-voice-overrides="true">
          <button type="button" onClick={() => setShowSegments(value => !value)} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-left" aria-expanded={showSegments}>
            {showSegments ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Segment overrides</span>
            <span className="ml-auto text-[8px] text-slate-400">advanced</span>
          </button>
          {showSegments && <div>
            <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2">
              <p className="min-w-0 flex-1 text-[8px] text-slate-400">Select Sentence Segments for Selected Split ZIP.</p>
              <button type="button" disabled={disabled || !segments.length} onClick={() => setSelectedSegmentIds(segments.map(item => item.id))} className="min-h-8 rounded-md border border-emerald-200 dark:border-emerald-800 px-2 text-[7px] font-black text-emerald-700 dark:text-emerald-300 disabled:opacity-35">SELECT ALL</button>
              <button type="button" disabled={disabled || !selectedSegmentIds.length} onClick={() => setSelectedSegmentIds([])} className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2 text-[7px] font-black text-slate-500 disabled:opacity-35">CLEAR</button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {segments.map((segment, index) => {
              const segmentProfile = getTextStructuredVoiceOverrideProfile(segment);
              const selectedForSplitExport = selectedSegmentIds.includes(segment.id);
              return <div key={segment.id} className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedSegmentIds(current => current.includes(segment.id) ? current.filter(id => id !== segment.id) : [...current, segment.id])}
                    className={`mt-0.5 shrink-0 rounded p-0.5 ${selectedForSplitExport ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-600'} disabled:opacity-35`}
                    title={selectedForSplitExport ? 'Remove this Sentence from Selected Split ZIP' : 'Add this Sentence to Selected Split ZIP'}
                    aria-label={selectedForSplitExport ? 'Unselect sentence for split export' : 'Select sentence for split export'}
                  >{selectedForSplitExport ? <CheckSquare className="h-3.5 w-3.5"/> : <Square className="h-3.5 w-3.5"/>}</button>
                  <span className="text-[8px] font-black text-slate-400">{index + 1}</span>
                  <p className="min-w-0 flex-1 text-[9px] font-semibold text-slate-700 dark:text-slate-200 truncate">{segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}</p>
                </div>
                <div className="mb-2 grid gap-1.5 md:grid-cols-2" data-text-segment-manual-audio={segment.id}>
                  {['text', 'meaning'].map(channel => {
                    const slot = audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { status: 'missing' };
                    const hasContent = channel === 'meaning' ? Boolean(clean(segment.meaning)) : Boolean(clean(segment.text));
                    const ready = slot.status === 'ready';
                    return <div key={`manual-${channel}`} className={`flex min-w-0 items-center gap-1 rounded-lg border px-2 py-1.5 ${ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                      <span className="shrink-0 text-[8px] font-black">{channel === 'meaning' ? 'ID' : 'EN'}</span>
                      <span className="min-w-0 flex-1 truncate text-[7px] text-slate-400" title={slot.requiredVoiceId || ''}>{ready ? `Ready • ${compactVoiceLabel(slot.requiredVoiceId)}` : `${slot.status || 'missing'} • ${compactVoiceLabel(slot.requiredVoiceId)}`}</span>
                      <button type="button" disabled={disabled || generationRunning || !hasContent} onClick={() => onGenerateCardAudio?.(block.id, [channel], { missingOnly: false, segmentIds: [segment.id] })} className="min-h-8 px-1.5 rounded-md text-[7px] font-black text-violet-600 disabled:opacity-35">{ready ? 'Regen' : 'Gen'}</button>
                      <button type="button" disabled={!ready} onClick={() => onExportSegmentAudio?.(segment.id, channel)} className="min-h-8 px-1.5 rounded-md text-[7px] font-black text-emerald-600 disabled:opacity-35"><FileDown className="w-3 h-3"/></button>
                    </div>;
                  })}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {['text', 'meaning'].map(channel => {
                    const isMeaning = channel === 'meaning';
                    const value = segmentProfile.channels?.[channel] || '';
                    const inherited = resolveTextStructuredEffectiveVoiceProfile({
                      documentTree,
                      block,
                      segment: { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } },
                      channel,
                      defaultVoiceName: isMeaning ? defaultMeaningVoiceName : defaultTextVoiceName,
                    });
                    return <div key={channel} className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0 flex-1"><VoiceSelect value={value} inheritedLabel={`${compactVoiceLabel(inherited.voiceName)} · ${getTextStructuredVoiceOverrideLabel(inherited.source)}`} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onSegmentVoiceChange?.(segment.id, channel, voiceName)} testId={`${segment.id}:${channel}`}/></div>
                      <button type="button" disabled={disabled || (isMeaning ? !segment.meaning : !segment.text)} onClick={() => onPreviewTts?.(segment.id, channel)} className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-35 active:scale-95 transition" title={`Preview ${isMeaning ? 'ID' : 'EN'} TTS`}><Play className="w-3 h-3 fill-current"/></button>
                    </div>;
                  })}
                </div>
                <div className="mt-2 grid gap-2 border-t border-violet-100 dark:border-violet-900 pt-2 md:grid-cols-2" data-text-segment-download-overrides="true">
                  {['text', 'meaning'].map(channel => {
                    const segmentDownload = getTextStructuredAudioDownloadProfile(segment);
                    const mode = getTextStructuredAudioDownloadChannelMode(segment, channel);
                    const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment: { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } }, channel, preferences: generationPreferences });
                    return <div key={`download-${channel}`} className="block min-w-0">
                      <span className="mb-1 block text-[8px] font-bold text-violet-600 dark:text-violet-300">{channel === 'meaning' ? 'ID download preset' : 'EN download preset'}</span>
                      <DownloadPresetSelect value={mode} disabled={disabled} onChange={next => onSegmentDownloadModeChange?.(segment.id, channel, next)} testId={`${segment.id}:${channel}`}/>
                      {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && <div className="mt-1.5"><EdgeVoiceSelect value={segmentDownload.channels?.[channel] || ''} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onSegmentDownloadVoiceChange?.(segment.id, channel, voiceId)} testId={`${segment.id}:download:${channel}`}/></div>}
                      {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER && <p className="mt-1.5 text-[7px] font-semibold text-sky-600 dark:text-sky-300">Follows this Segment's effective playback voice.</p>}
                    </div>;
                  })}
                </div>
              </div>;
            })}
            </div>
          </div>}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white/98 dark:bg-slate-900/98 px-2.5 py-2 md:px-3" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }} data-text-card-audio-generate-footer="true">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Card Audio Workflow</p>
            <p className="truncate text-[8px] text-slate-400">{cardCoverage?.covered || 0}/{cardCoverage?.total || 0} Ready • Missing/Other/Stale must be resolved before complete exports.</p>
          </div>
          <span className={`shrink-0 rounded-md px-2 py-1 text-[8px] font-black ${cardCoverage?.needDownload ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'}`}>{cardCoverage?.needDownload ? `${cardCoverage.needDownload} NEED AUDIO` : 'EXPORT READY'}</span>
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/45 dark:bg-violet-950/15 p-2" data-text-card-audio-generate-group="true">
            <p className="text-[8px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">1 • Prepare audio</p>
            <p className="mt-0.5 text-[7px] leading-relaxed text-slate-400">Generate only missing RF renders, or rebuild every logical slot with the current download profile.</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {generationRunning ? <button type="button" onClick={() => onCancelGeneration?.()} className="col-span-2 min-h-10 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 text-[9px] font-black"><Square className="w-3 h-3 inline mr-1 fill-current"/>STOP GENERATION</button> : <>
                <button type="button" disabled={disabled || !cardCoverage?.needDownload} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'], { missingOnly: true })} className="min-h-10 px-2 py-2 rounded-xl bg-violet-600 text-white text-[8px] font-black disabled:opacity-35"><Download className="w-3 h-3 inline mr-1"/>MISSING</button>
                <button type="button" disabled={disabled || !cardCoverage?.total} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'], { missingOnly: false })} className="min-h-10 px-2 py-2 rounded-xl border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-[8px] font-black disabled:opacity-35">REGENERATE</button>
              </>}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/45 dark:bg-emerald-950/15 p-2" data-text-card-audio-split-group="true">
            <p className="text-[8px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">2 • Split download</p>
            <p className="mt-0.5 text-[7px] leading-relaxed text-slate-400">Exports canonical Segment audio. Physical RF binaries are deduplicated and accompanied by a manifest.</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" disabled={disabled || !cardCoverage?.total || Boolean(cardCoverage?.needDownload)} onClick={() => onExportCardZip?.(block.id)} className="min-h-10 px-2 py-2 rounded-xl bg-emerald-600 text-white text-[8px] font-black disabled:opacity-35" title={cardCoverage?.needDownload ? 'Generate/reconnect every missing exact-RF slot before Split ZIP export.' : 'Export RF-deduplicated Segment audio + manifest'}><Package className="w-3 h-3 inline mr-1"/>FULL CARD SPLIT</button>
              <button type="button" disabled={disabled || !selectedSegmentIds.length} onClick={() => onExportCardZip?.(block.id, { segmentIds: selectedSegmentIds })} className="min-h-10 px-2 py-2 rounded-xl border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[8px] font-black disabled:opacity-35"><Package className="w-3 h-3 inline mr-1"/>SELECTED ZIP • {selectedSegmentIds.length}</button>
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/45 dark:bg-sky-950/15 p-2" data-text-card-audio-full-group="true">
            <p className="text-[8px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">3 • Full derived audio</p>
            <p className="mt-0.5 text-[7px] leading-relaxed text-slate-400">Builds one ordered WAV from Ready Segment audio. It is an export artifact only and creates no permanent Full AudioVariant.</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" disabled={disabled || !cardChannelCoverage.text.total || cardChannelCoverage.text.ready !== cardChannelCoverage.text.total} onClick={() => onExportFullCardAudio?.(block.id, 'text')} className="min-h-10 px-2 py-2 rounded-xl border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[8px] font-black disabled:opacity-35"><FileDown className="w-3 h-3 inline mr-1"/>FULL EN</button>
              <button type="button" disabled={disabled || !cardChannelCoverage.meaning.total || cardChannelCoverage.meaning.ready !== cardChannelCoverage.meaning.total} onClick={() => onExportFullCardAudio?.(block.id, 'meaning')} className="min-h-10 px-2 py-2 rounded-xl border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[8px] font-black disabled:opacity-35"><FileDown className="w-3 h-3 inline mr-1"/>FULL ID</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
};

export default TextStructuredCardAudioPanel;
