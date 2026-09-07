import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Play, Users, Volume2, X } from 'lucide-react';
import {
  collectTextStructuredCardSpeakers,
  getTextStructuredVoiceOverrideLabel,
  getTextStructuredVoiceOverrideProfile,
  resolveTextStructuredEffectiveVoiceProfile
} from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
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

export const TextStructuredCardAudioPanel = ({
  documentTree,
  block,
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  disabled = false,
  onClose,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onPreviewTts,
  onGenerateCardAudio
}) => {
  const [showSegments, setShowSegments] = useState(false);
  const [showParagraphOverrides, setShowParagraphOverrides] = useState(false);
  const [expandedSpeakerKey, setExpandedSpeakerKey] = useState(null);
  const overlayRef = useLiveOverlayViewportRef(true);
  const segments = Array.isArray(block?.segments) ? block.segments : [];
  const cardProfile = getTextStructuredVoiceOverrideProfile(block);
  const speakers = useMemo(() => collectTextStructuredCardSpeakers(block), [block]);
  const firstSegment = segments[0] || null;
  const isConversation = block?.blockType === 'conversation';

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
      segment: segment ? { ...segment, metadata: {} } : null,
      channel,
      defaultVoiceName: channel === 'meaning' ? defaultMeaningVoiceName : defaultTextVoiceName,
      includeDocumentSpeakerProfile: false,
      simpleCardSpeakerMode: true
    });
    return `${compactVoiceLabel(resolved.voiceName)} · ${getTextStructuredVoiceOverrideLabel(resolved.source)}`;
  };

  const speakerOverrideCount = speakers.reduce((count, { key }) => (
    count
    + (cardProfile.speakers?.text?.[key] ? 1 : 0)
    + (cardProfile.speakers?.meaning?.[key] ? 1 : 0)
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

        <div className="flex items-start gap-2 rounded-lg bg-violet-50/70 dark:bg-violet-950/20 px-2.5 py-2" data-text-simple-audio-rule="true">
          <span className="shrink-0 rounded-md bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Default</span>
          <p className="min-w-0 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">
            {isConversation
              ? 'All speakers use Sidebar voices. Expand a speaker only to customise this Card.'
              : 'This Card uses Sidebar voices. Open override only when this Paragraph needs a different voice.'}
          </p>
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

          {speakers.map(({ key, label }) => {
            const sample = segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || null;
            const speakerExpanded = expandedSpeakerKey === key;
            const enOverride = cardProfile.speakers?.text?.[key] || '';
            const idOverride = cardProfile.speakers?.meaning?.[key] || '';
            const hasOverride = Boolean(enOverride || idOverride);
            return <div key={key} className={`rounded-xl border overflow-hidden transition ${hasOverride ? 'border-sky-200 dark:border-sky-800 bg-sky-50/55 dark:bg-sky-950/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-mobile-speaker-card={key}>
              <button type="button" onClick={() => setExpandedSpeakerKey(current => current === key ? null : key)} className="w-full min-h-11 flex items-center gap-2 px-2.5 py-2 text-left" aria-expanded={speakerExpanded} aria-controls={`speaker-voice-${block.id}-${key}`}>
                <span className="shrink-0 px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-[10px] font-black text-sky-700 dark:text-sky-300">{label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] text-slate-600 dark:text-slate-300">{clue(sample, 'text')}</p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-400">{hasOverride ? `Custom • EN ${compactVoiceLabel(enOverride || defaultTextVoiceName)} • ID ${compactVoiceLabel(idOverride || defaultMeaningVoiceName)}` : `Sidebar default • ${compactVoiceLabel(defaultTextVoiceName)}`}</p>
                </div>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${speakerExpanded ? 'rotate-180' : ''}`}/>
              </button>

              {speakerExpanded && <div id={`speaker-voice-${block.id}-${key}`} className="grid gap-2 border-t border-slate-100 dark:border-slate-800 p-3 md:grid-cols-2">
                {['text', 'meaning'].map(channel => {
                  const isMeaning = channel === 'meaning';
                  const value = cardProfile.speakers?.[channel]?.[key] || '';
                  return <label key={channel} className="block min-w-0">
                    <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-slate-500">{isMeaning ? 'ID voice' : 'EN voice'}</span>
                    <VoiceSelect value={value} inheritedLabel={inheritedFor(sample, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onCardVoiceChange?.(block.id, channel, voiceName, label)} testId={`${block.id}:${key}:${channel}`}/>
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
          {showSegments && <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {segments.map((segment, index) => {
              const segmentProfile = getTextStructuredVoiceOverrideProfile(segment);
              return <div key={segment.id} className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-[8px] font-black text-slate-400">{index + 1}</span>
                  <p className="min-w-0 flex-1 text-[9px] font-semibold text-slate-700 dark:text-slate-200 truncate">{segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {['text', 'meaning'].map(channel => {
                    const isMeaning = channel === 'meaning';
                    const value = segmentProfile.channels?.[channel] || '';
                    const inherited = resolveTextStructuredEffectiveVoiceProfile({
                      documentTree,
                      block,
                      segment: { ...segment, metadata: {} },
                      channel,
                      defaultVoiceName: isMeaning ? defaultMeaningVoiceName : defaultTextVoiceName,
                      includeDocumentSpeakerProfile: false,
                      simpleCardSpeakerMode: true
                    });
                    return <div key={channel} className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0 flex-1"><VoiceSelect value={value} inheritedLabel={`${compactVoiceLabel(inherited.voiceName)} · ${getTextStructuredVoiceOverrideLabel(inherited.source)}`} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onSegmentVoiceChange?.(segment.id, channel, voiceName)} testId={`${segment.id}:${channel}`}/></div>
                      <button type="button" disabled={disabled || (isMeaning ? !segment.meaning : !segment.text)} onClick={() => onPreviewTts?.(segment.id, channel)} className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-35 active:scale-95 transition" title={`Preview ${isMeaning ? 'ID' : 'EN'} TTS`}><Play className="w-3 h-3 fill-current"/></button>
                    </div>;
                  })}
                </div>
              </div>;
            })}
          </div>}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white/98 dark:bg-slate-900/98 px-2.5 py-2 md:px-3" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }} data-text-card-audio-generate-footer="true">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-slate-700 dark:text-slate-200">Generate this Card</p>
            <p className="truncate text-[8px] text-slate-400">Uses Sidebar defaults + only the overrides above.</p>
          </div>
          <button type="button" disabled={disabled} onClick={() => onGenerateCardAudio?.(block.id, ['text'])} className="min-h-10 px-3 py-2 rounded-xl bg-violet-600 text-white text-[9px] font-black disabled:opacity-35 active:scale-95 transition"><Download className="w-3 h-3 inline mr-1"/>EN</button>
          <button type="button" disabled={disabled || !segments.some(segment => clean(segment.meaning))} onClick={() => onGenerateCardAudio?.(block.id, ['meaning'])} className="min-h-10 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[9px] font-black disabled:opacity-35 active:scale-95 transition">ID</button>
          <button type="button" disabled={disabled} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'])} className="hidden sm:block min-h-10 px-3 py-2 rounded-xl bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-[9px] font-black disabled:opacity-35 active:scale-95 transition">EN + ID</button>
        </div>
      </div>
    </div>
  </div>;
};

export default TextStructuredCardAudioPanel;
