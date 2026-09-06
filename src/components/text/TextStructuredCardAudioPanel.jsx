import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Play, Volume2, X } from 'lucide-react';
import {
  collectTextStructuredCardSpeakers,
  getTextStructuredVoiceOverrideLabel,
  getTextStructuredVoiceOverrideProfile,
  resolveTextStructuredEffectiveVoiceProfile
} from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';

const clean = value => String(value ?? '').trim();

const compactVoiceLabel = value => {
  const name = clean(value);
  if (!name) return 'Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 34 ? `${name.slice(0, 33)}…` : name;
};

const clue = (segment, channel = 'text') => {
  const value = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
  if (!value) return '—';
  return value.length > 58 ? `${value.slice(0, 57)}…` : value;
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
    className="w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-200 disabled:opacity-50"
    data-text-voice-override-select={testId}
  >
    <option value="">Inherit • {inheritedLabel || 'global default'}</option>
    {missing && <option value={value}>Unavailable • {compactVoiceLabel(value)}</option>}
    {names.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
  </select>;
};

const ActionButtons = ({ segmentId, blockId, speaker = null, channel, disabled, onPreviewTts, onGenerateCardAudio, onGenerateSpeakerAudio }) => <div className="flex items-center gap-1 shrink-0">
  <button type="button" disabled={disabled || !segmentId} onClick={() => segmentId && onPreviewTts?.(segmentId, channel)} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[8px] font-black text-slate-600 dark:text-slate-300 disabled:opacity-35" title="Preview with Browser TTS"><Play className="w-3 h-3 inline mr-1 fill-current"/>TTS</button>
  <button type="button" disabled={disabled} onClick={() => speaker ? onGenerateSpeakerAudio?.(blockId, speaker, [channel]) : onGenerateCardAudio?.(blockId, [channel])} className="px-2 py-1.5 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-35" title="Download/generate Edge audio"><Download className="w-3 h-3 inline mr-1"/>Edge</button>
</div>;

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
  onGenerateCardAudio,
  onGenerateSpeakerAudio
}) => {
  const [showSegments, setShowSegments] = useState(false);
  const segments = Array.isArray(block?.segments) ? block.segments : [];
  const cardProfile = getTextStructuredVoiceOverrideProfile(block);
  const speakers = useMemo(() => collectTextStructuredCardSpeakers(block), [block]);
  const firstSegment = segments[0] || null;

  const inheritedFor = (segment, channel, ignoreCard = false) => {
    const safeBlock = ignoreCard ? { ...block, metadata: {} } : block;
    const resolved = resolveTextStructuredEffectiveVoiceProfile({
      documentTree,
      block: safeBlock,
      segment: segment ? { ...segment, metadata: {} } : null,
      channel,
      defaultVoiceName: channel === 'meaning' ? defaultMeaningVoiceName : defaultTextVoiceName
    });
    return `${compactVoiceLabel(resolved.voiceName)} · ${getTextStructuredVoiceOverrideLabel(resolved.source)}`;
  };

  return <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-slate-950/45 p-0 md:p-4" data-text-card-audio-panel={block?.id}>
    <div className="w-full md:max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center"><Volume2 className="w-4 h-4"/></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-slate-800 dark:text-white truncate">Audio • {block?.title || block?.id || 'Card'}</h3>
          <p className="text-[9px] text-slate-400">{block?.id} • {block?.blockType === 'conversation' ? 'Conversation' : 'Paragraph'} • Edge-first A12.1</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4"/></button>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/20 p-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">How voice selection works</p>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">Segment override → Card speaker → Document speaker → Card default → Global Sidebar. TTS preview and Edge download use this same effective profile.</p>
        </div>

        {block?.blockType === 'paragraph' && <div className="grid gap-3 md:grid-cols-2" data-text-paragraph-audio-profile="true">
          {['text', 'meaning'].map(channel => {
            const isMeaning = channel === 'meaning';
            const value = cardProfile.channels?.[channel] || '';
            return <div key={channel} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between gap-2 mb-2"><span className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{isMeaning ? 'ID / Meaning' : 'EN / Text'} Card Voice</span><span className="text-[8px] text-slate-400 truncate">{clue(firstSegment, channel)}</span></div>
              <VoiceSelect value={value} inheritedLabel={inheritedFor(firstSegment, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onCardVoiceChange?.(block.id, channel, voiceName, null)} testId={`${block.id}:${channel}`}/>
              <div className="mt-2 flex justify-end"><ActionButtons segmentId={firstSegment?.id} blockId={block.id} channel={channel} disabled={disabled || (isMeaning && !firstSegment?.meaning)} onPreviewTts={onPreviewTts} onGenerateCardAudio={onGenerateCardAudio}/></div>
            </div>;
          })}
        </div>}

        {block?.blockType === 'conversation' && <div className="space-y-2" data-text-conversation-card-voices="true">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Conversation speakers in this Card</p>
            <p className="text-[8px] text-slate-400">Each speaker can override the A11 Document profile only for this Card.</p>
          </div>
          {speakers.map(({ key, label }) => {
            const sample = segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || null;
            return <div key={key} className="rounded-2xl border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/15 p-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-[9px] font-black text-sky-700 dark:text-sky-300">{label}</span>
                <p className="min-w-0 flex-1 text-[9px] text-slate-500 dark:text-slate-400 truncate">{clue(sample, 'text')}</p>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {['text', 'meaning'].map(channel => {
                  const isMeaning = channel === 'meaning';
                  const value = cardProfile.speakers?.[channel]?.[key] || '';
                  return <div key={channel} className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-2">
                    <p className="mb-1 text-[8px] font-black uppercase text-slate-500">{isMeaning ? 'ID voice' : 'EN voice'}</p>
                    <VoiceSelect value={value} inheritedLabel={inheritedFor(sample, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onCardVoiceChange?.(block.id, channel, voiceName, label)} testId={`${block.id}:${key}:${channel}`}/>
                    <div className="mt-2 flex justify-end"><ActionButtons segmentId={sample?.id} blockId={block.id} speaker={label} channel={channel} disabled={disabled || (isMeaning && !sample?.meaning)} onPreviewTts={onPreviewTts} onGenerateSpeakerAudio={onGenerateSpeakerAudio}/></div>
                  </div>;
                })}
              </div>
            </div>;
          })}
        </div>}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-text-segment-voice-overrides="true">
          <button type="button" onClick={() => setShowSegments(value => !value)} className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-left">
            {showSegments ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Segment overrides</span>
            <span className="text-[8px] text-slate-400">optional • most specific</span>
          </button>
          {showSegments && <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {segments.map((segment, index) => {
              const segmentProfile = getTextStructuredVoiceOverrideProfile(segment);
              return <div key={segment.id} className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-[8px] font-black text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold text-slate-700 dark:text-slate-200 truncate">{segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}</p>
                    <p className="text-[7px] font-mono text-slate-400">{segment.id}</p>
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {['text', 'meaning'].map(channel => {
                    const isMeaning = channel === 'meaning';
                    const value = segmentProfile.channels?.[channel] || '';
                    const inherited = resolveTextStructuredEffectiveVoiceProfile({
                      documentTree,
                      block,
                      segment: { ...segment, metadata: {} },
                      channel,
                      defaultVoiceName: isMeaning ? defaultMeaningVoiceName : defaultTextVoiceName
                    });
                    return <div key={channel} className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1"><VoiceSelect value={value} inheritedLabel={`${compactVoiceLabel(inherited.voiceName)} · ${getTextStructuredVoiceOverrideLabel(inherited.source)}`} voices={isMeaning ? indonesianVoices : englishVoices} disabled={disabled} onChange={voiceName => onSegmentVoiceChange?.(segment.id, channel, voiceName)} testId={`${segment.id}:${channel}`}/></div>
                      <button type="button" disabled={disabled || (isMeaning ? !segment.meaning : !segment.text)} onClick={() => onPreviewTts?.(segment.id, channel)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-35" title={`Preview ${isMeaning ? 'ID' : 'EN'} TTS`}><Play className="w-3 h-3 fill-current"/></button>
                    </div>;
                  })}
                </div>
              </div>;
            })}
          </div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 p-3">
          <div><p className="text-[9px] font-black text-violet-700 dark:text-violet-300">Generate whole Card</p><p className="text-[8px] text-slate-400">Uses every effective override above; each Segment keeps its own permanent audio identity.</p></div>
          <div className="flex gap-1.5">
            <button type="button" disabled={disabled} onClick={() => onGenerateCardAudio?.(block.id, ['text'])} className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-35"><Download className="w-3 h-3 inline mr-1"/>EN</button>
            <button type="button" disabled={disabled || !segments.some(segment => clean(segment.meaning))} onClick={() => onGenerateCardAudio?.(block.id, ['meaning'])} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[8px] font-black disabled:opacity-35"><Download className="w-3 h-3 inline mr-1"/>ID</button>
            <button type="button" disabled={disabled} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'])} className="px-2.5 py-1.5 rounded-lg bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-[8px] font-black disabled:opacity-35">EN + ID</button>
          </div>
        </div>
      </div>
    </div>
  </div>;
};

export default TextStructuredCardAudioPanel;
