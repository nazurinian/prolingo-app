import React, { useMemo, useState } from 'react';
import { Headphones, Link2, MessageSquare, Server, Users, Volume2 } from 'lucide-react';
import { collectTextStructuredConversationSpeakers, getTextStructuredSpeakerAssignedVoiceName } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { getTextStructuredVoiceOverrideProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { getTextStructuredPlaybackRateProfile } from '../../domain/text/textStructuredPlaybackRateProfileDomain.js';
import { getTextStructuredLocalAudioProfile } from '../../domain/text/textStructuredLocalAudioProfileDomain.js';
import { getTextStructuredAudioDownloadProfile } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import { TEXT_STRUCTURED_AUDIO_SOURCE_MODES } from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import TextAudioDataPanel from './TextAudioDataPanel.jsx';

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

const RateControl = ({ label, value, disabled, onChange }) => <label className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2">
  <span className="mb-1 flex items-center justify-between gap-2 text-[8px] font-black uppercase text-slate-500 dark:text-slate-300"><span>{label}</span><span className="text-[10px] normal-case">{normalizedRate(value).toFixed(1)}×</span></span>
  <input type="range" min="0.5" max="2" step="0.1" value={normalizedRate(value)} disabled={disabled} onChange={event => onChange?.(Number(event.target.value))} className="w-full accent-indigo-600 disabled:opacity-40"/>
</label>;

const VoiceSelect = ({ label, value, options, fallbackLabel, disabled, onChange }) => <label className="block rounded-lg border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-900/40 p-2 text-[8px] font-bold text-slate-500">
  {label}
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-200">
    <option value="">{fallbackLabel}</option>
    {value && !options.includes(value) && <option value={value}>Unavailable • {compactVoiceLabel(value)}</option>}
    {options.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
  </select>
</label>;

const LocalVoiceSelect = ({ label, value, options, disabled, onChange }) => <label className="block rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15 p-2 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
  {label}
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1 w-full rounded-md border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-200">
    <option value="">Global TTS fallback</option>
    {options.map(name => <option key={name} value={name}>{compactVoiceLabel(name)} • local</option>)}
  </select>
</label>;

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
  onSpeakerDownloadVoiceChange,
  edgeHealth = null,
  onEdgeHealthCheck,
  audioLibrary = null
}) {
  const speakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const voiceProfile = useMemo(() => getTextStructuredVoiceOverrideProfile(documentTree), [documentTree?.metadata]);
  const rateProfile = useMemo(() => getTextStructuredPlaybackRateProfile(documentTree), [documentTree?.metadata]);
  const localProfile = useMemo(() => getTextStructuredLocalAudioProfile(documentTree), [documentTree?.metadata]);
  const downloadProfile = useMemo(() => getTextStructuredAudioDownloadProfile(documentTree), [documentTree?.metadata]);
  const englishNames = useMemo(() => uniqueNames(englishVoices), [englishVoices]);
  const indonesianNames = useMemo(() => uniqueNames(indonesianVoices), [indonesianVoices]);
  const edgeEnglish = useMemo(() => (edgeGenerationVoices || []).filter(voice => String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const edgeMeaning = useMemo(() => (edgeGenerationVoices || []).filter(voice => !String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const [audioSurface, setAudioSurface] = useState('playback');
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;

  const sourceMode = preferences.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const isConversation = documentTree.documentType === 'conversation';
  const customLocal = sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL;

  const renderDocumentChannel = (channel, label, voices, fallback, globalRate, localOptions) => {
    const rate = rateProfile.channels?.[channel] || globalRate || 1;
    const localVoice = localProfile.channels?.[channel] || '';
    return <div className="grid gap-2">
      <VoiceSelect label={`${label} • TTS fallback`} value={voiceProfile.channels?.[channel] || ''} options={voices} fallbackLabel={`Global • ${compactVoiceLabel(fallback)}`} disabled={disabled} onChange={value => onDocumentVoiceChange?.(value, channel)}/>
      <RateControl label={`${label} speed`} value={rate} disabled={disabled} onChange={value => onDocumentRateChange?.(value, channel)}/>
      {customLocal && <LocalVoiceSelect label={`${label} • Custom local audio`} value={localVoice} options={localOptions || []} disabled={disabled} onChange={value => onDocumentLocalAudioVoiceChange?.(value, channel)}/>} 
    </div>;
  };

  return <div className="space-y-3" data-text-audio-sidebar="true">
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/60 p-1" role="tablist" aria-label="Text Audio controls" data-text-audio-subtabs="true">
      <button type="button" role="tab" aria-selected={audioSurface === 'playback'} onClick={() => setAudioSurface('playback')} className={`min-h-10 rounded-lg px-2 text-[9px] font-black transition ${audioSurface === 'playback' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>PLAYBACK</button>
      <button type="button" role="tab" aria-selected={audioSurface === 'download'} onClick={() => setAudioSurface('download')} className={`min-h-10 rounded-lg px-2 text-[9px] font-black transition ${audioSurface === 'download' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>DOWNLOAD</button>
    </div>
    <p className="px-1 text-[8px] leading-relaxed text-slate-400">PLAYBACK = TTS/local voice + speed. DOWNLOAD = Edge generation defaults + Staging / Folder / ZIP. Player behaviour stays in the bottom bar.</p>
    {audioSurface === 'playback' && <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-3" data-text-playback-audio-settings="true">
      <div className="flex items-center gap-2 mb-2"><Headphones className="w-4 h-4 text-indigo-600 dark:text-indigo-300"/><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Playback Audio</p><p className="text-[8px] text-slate-400">Voice + speed only. Repeat/order/delay stay in bottom Player Settings.</p></div></div>
      <div className="grid grid-cols-3 gap-1 mb-3" data-text-local-audio-mode="true">
        <button type="button" disabled={disabled} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST)} className={`min-h-10 rounded-lg border px-1 text-[8px] font-black ${sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>LOAD ALL</button>
        <button type="button" disabled={disabled} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL)} className={`min-h-10 rounded-lg border px-1 text-[8px] font-black ${sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>CUSTOM</button>
        <button type="button" disabled={disabled} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY)} className={`min-h-10 rounded-lg border px-1 text-[8px] font-black ${sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY ? 'bg-slate-800 dark:bg-white border-slate-800 dark:border-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>GLOBAL TTS</button>
      </div>
      <p className="mb-3 text-[8px] leading-relaxed text-slate-400">LOAD ALL uses any compatible local audio when available. CUSTOM uses only the selected local voice per speaker/channel; unavailable/empty selection falls back to its TTS voice. GLOBAL TTS ignores local files.</p>

      {!isConversation && <div className="space-y-2" data-text-audio-paragraph="true">
        <div className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[9px] font-black text-slate-600 dark:text-slate-300">Paragraph narrator</span></div>
        {renderDocumentChannel('text', 'EN / Text', englishNames, defaultTextVoiceName, globalTextRate, availableLocalVoices?.channels?.text || [])}
        {renderDocumentChannel('meaning', 'ID / Meaning', indonesianNames, defaultMeaningVoiceName, globalMeaningRate, availableLocalVoices?.channels?.meaning || [])}
      </div>}

      {isConversation && <div className="space-y-2" data-text-audio-conversation="true">
        <div className="flex items-center gap-2 flex-wrap"><Users className="w-3.5 h-3.5 text-sky-500"/><span className="text-[9px] font-black text-slate-600 dark:text-slate-300">Detected speakers ({speakers.length})</span>
          {speakers.length > 1 && <div className="ml-auto flex flex-wrap gap-1">
            <button type="button" disabled={disabled} onClick={() => onSyncSpeakerVoice?.('text')} className="min-h-8 px-2 rounded border border-sky-200 dark:border-sky-900 text-[7px] font-black text-sky-700 dark:text-sky-300"><Link2 className="w-3 h-3 inline mr-1"/>SYNC EN VOICE</button>
            <button type="button" disabled={disabled} onClick={() => onSyncSpeakerRate?.('text')} className="min-h-8 px-2 rounded border border-sky-200 dark:border-sky-900 text-[7px] font-black text-sky-700 dark:text-sky-300">SYNC EN SPEED</button>
            <button type="button" disabled={disabled} onClick={() => onSyncSpeakerVoice?.('meaning')} className="min-h-8 px-2 rounded border border-violet-200 dark:border-violet-900 text-[7px] font-black text-violet-700 dark:text-violet-300"><Link2 className="w-3 h-3 inline mr-1"/>SYNC ID VOICE</button>
            <button type="button" disabled={disabled} onClick={() => onSyncSpeakerRate?.('meaning')} className="min-h-8 px-2 rounded border border-violet-200 dark:border-violet-900 text-[7px] font-black text-violet-700 dark:text-violet-300">SYNC ID SPEED</button>
          </div>}
        </div>
        {speakers.map(({ id, label }, index) => {
          const enVoice = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId: id, channel: 'text' }) || '';
          const idVoice = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId: id, channel: 'meaning' }) || '';
          const enRate = rateProfile.speakerIds?.text?.[id] || rateProfile.speakers?.text?.[label?.toLowerCase?.()] || rateProfile.channels?.text || globalTextRate || 1;
          const idRate = rateProfile.speakerIds?.meaning?.[id] || rateProfile.speakers?.meaning?.[label?.toLowerCase?.()] || rateProfile.channels?.meaning || globalMeaningRate || 1;
          const local = availableLocalVoices?.speakerIds?.[id] || { text: [], meaning: [] };
          const localEn = localProfile.speakerIds?.text?.[id] || '';
          const localId = localProfile.speakerIds?.meaning?.[id] || '';
          return <div key={id} className="rounded-xl border border-sky-100 dark:border-sky-900 bg-white/90 dark:bg-slate-900/40 p-2.5" data-text-audio-speaker={id}>
            <div className="mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-sky-500"/><span className="text-[9px] font-black text-slate-700 dark:text-slate-200">{index + 1}. {label}</span></div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2"><VoiceSelect label="EN • TTS voice" value={enVoice} options={englishNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultTextVoiceName)}`} disabled={disabled} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'text')}/><RateControl label="EN speed" value={enRate} disabled={disabled} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'text')}/>{customLocal && <LocalVoiceSelect label="EN • Custom local" value={localEn} options={local.text || []} disabled={disabled} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'text')}/>}</div>
              <div className="space-y-2"><VoiceSelect label="ID • TTS voice" value={idVoice} options={indonesianNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultMeaningVoiceName)}`} disabled={disabled} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'meaning')}/><RateControl label="ID speed" value={idRate} disabled={disabled} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'meaning')}/>{customLocal && <LocalVoiceSelect label="ID • Custom local" value={localId} options={local.meaning || []} disabled={disabled} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'meaning')}/>}</div>
            </div>
          </div>;
        })}
        {speakers.length === 0 && <p className="text-[8px] text-amber-600 dark:text-amber-300">No speaker identity detected yet. Add Conversation segments first.</p>}
      </div>}
    </section>}

    {audioSurface === 'download' && <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/35 dark:bg-violet-950/15 p-3" data-text-download-defaults="true">
      <div className="flex items-center gap-2 mb-2"><Server className="w-4 h-4 text-violet-600 dark:text-violet-300"/><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Download Defaults & Sources</p><p className="text-[8px] text-slate-400">Manual generation lives on each Card. Batch lives in Data.</p></div><button type="button" disabled={disabled || edgeHealth?.status === 'testing'} onClick={onEdgeHealthCheck} className="ml-auto min-h-9 px-2 rounded-lg border border-violet-200 dark:border-violet-800 text-[8px] font-black text-violet-700 dark:text-violet-300">TEST EDGE</button></div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-[8px] font-bold text-slate-500">Global Edge EN<select disabled={disabled} value={generationPreferences?.edgeTextVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeTextVoiceId: event.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]">{edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></label>
        <label className="text-[8px] font-bold text-slate-500">Global Edge ID<select disabled={disabled} value={generationPreferences?.edgeMeaningVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeMeaningVoiceId: event.target.value })} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]">{edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></label>
        <label className="text-[8px] text-slate-500">Download rate ({Number(generationPreferences?.edgeRate || 0) >= 0 ? '+' : ''}{generationPreferences?.edgeRate || 0}%)<input disabled={disabled} type="range" min="-50" max="50" step="10" value={generationPreferences?.edgeRate || 0} onChange={event => onGenerationPreferencesChange?.({ edgeRate: Number(event.target.value) })} className="w-full accent-violet-600"/></label>
        <label className="text-[8px] text-slate-500">Download pitch ({Number(generationPreferences?.edgePitch || 0) >= 0 ? '+' : ''}{generationPreferences?.edgePitch || 0}Hz)<input disabled={disabled} type="range" min="-20" max="20" step="5" value={generationPreferences?.edgePitch || 0} onChange={event => onGenerationPreferencesChange?.({ edgePitch: Number(event.target.value) })} className="w-full accent-violet-600"/></label>
      </div>
      <div className="mt-3 rounded-lg border border-violet-100 dark:border-violet-900 bg-white dark:bg-slate-900/30 p-2">
        <p className="mb-2 text-[8px] font-black uppercase text-violet-600 dark:text-violet-300">Document download profile</p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-[8px] text-slate-500">EN<select value={downloadProfile.channels?.text || ''} disabled={disabled} onChange={event => onDocumentDownloadVoiceChange?.(event.target.value || null, 'text')} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]"><option value="">Global Edge</option>{edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></label>
          <label className="text-[8px] text-slate-500">ID<select value={downloadProfile.channels?.meaning || ''} disabled={disabled} onChange={event => onDocumentDownloadVoiceChange?.(event.target.value || null, 'meaning')} className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px]"><option value="">Global Edge</option>{edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></label>
        </div>
        {isConversation && speakers.length > 0 && <div className="mt-2 space-y-1.5">{speakers.map(({ id, label }) => <div key={id} className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_1fr_1fr] items-center"><span className="text-[8px] font-black text-slate-500 truncate">{label}</span><select value={downloadProfile.speakerIds?.text?.[id] || ''} disabled={disabled} onChange={event => onSpeakerDownloadVoiceChange?.({ id, label }, event.target.value || null, 'text')} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[8px]"><option value="">EN • Document/Global</option>{edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select><select value={downloadProfile.speakerIds?.meaning?.[id] || ''} disabled={disabled} onChange={event => onSpeakerDownloadVoiceChange?.({ id, label }, event.target.value || null, 'meaning')} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[8px]"><option value="">ID • Document/Global</option>{edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}</select></div>)}</div>}
      </div>
      <div className="mt-3"><TextAudioDataPanel audioLibrary={audioLibrary} compact={false} disabled={disabled}/></div>
    </section>}
  </div>;
}
