import React, { useMemo, useState } from 'react';
import { Headphones, Link2, MessageSquare, Server, Users, Volume2 } from 'lucide-react';
import { collectTextStructuredConversationSpeakers, getTextStructuredSpeakerAssignedVoiceName } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { getTextStructuredVoiceOverrideProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { getTextStructuredPlaybackRateProfile } from '../../domain/text/textStructuredPlaybackRateProfileDomain.js';
import { getTextStructuredLocalAudioProfile } from '../../domain/text/textStructuredLocalAudioProfileDomain.js';
import { getTextStructuredAudioDownloadProfile } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import { getTextStructuredAudioSyncProfile } from '../../domain/text/textStructuredAudioSyncProfileDomain.js';
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

const RateControl = ({ label, value, disabled, helper = null, onChange }) => <label className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2">
  <span className="mb-1 flex items-center justify-between gap-2 text-[8px] font-black uppercase text-slate-500 dark:text-slate-300"><span>{label}</span><span className="text-[10px] normal-case">{normalizedRate(value).toFixed(1)}×</span></span>
  <input type="range" min="0.5" max="2" step="0.1" value={normalizedRate(value)} disabled={disabled} onChange={event => onChange?.(Number(event.target.value))} className="w-full accent-indigo-600 disabled:opacity-40"/>
  {helper && <span className="mt-1 block text-[7px] font-semibold normal-case text-sky-600 dark:text-sky-300">{helper}</span>}
</label>;

const VoiceSelect = ({ label, value, options, fallbackLabel, disabled, helper = null, onChange }) => <label className="block rounded-lg border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-900/40 p-2 text-[8px] font-bold text-slate-500">
  {label}
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-200 disabled:opacity-55">
    <option value="">{fallbackLabel}</option>
    {value && !options.includes(value) && <option value={value}>Unavailable • {compactVoiceLabel(value)}</option>}
    {options.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
  </select>
  {helper && <span className="mt-1 block text-[7px] font-semibold text-sky-600 dark:text-sky-300">{helper}</span>}
</label>;

const LocalVoiceSelect = ({ label, value, options, disabled, helper = null, onChange }) => <label className="block rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15 p-2 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
  {label}
  <select value={value || ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} className="mt-1 w-full rounded-md border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-200 disabled:opacity-55">
    <option value="">Browser TTS fallback</option>
    {value && !options.includes(value) && <option value={value}>Unavailable here • {compactVoiceLabel(value)}</option>}
    {options.map(name => <option key={name} value={name}>{compactVoiceLabel(name)} • local</option>)}
  </select>
  {helper && <span className="mt-1 block text-[7px] font-semibold text-sky-600 dark:text-sky-300">{helper}</span>}
</label>;

const SourceStatus = ({ status }) => {
  if (!status) return <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-2.5 py-2 text-[8px] text-slate-400">Source used will appear here while you test playback.</div>;
  const isLocal = status.source === 'local';
  const isTts = status.source === 'tts';
  const label = isLocal ? `LOCAL • ${status.origin || 'Audio'}` : isTts ? 'TTS • Browser' : 'SOURCE UNAVAILABLE';
  return <div className={`rounded-lg border px-2.5 py-2 ${isLocal ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20' : isTts ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20' : 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20'}`} data-text-playback-source-status={status.source}>
    <div className="flex items-center justify-between gap-2"><span className="text-[8px] font-black uppercase text-slate-600 dark:text-slate-200">{label}</span><span className="text-[7px] font-bold uppercase text-slate-400">{status.channel === 'meaning' ? 'ID' : 'EN'}</span></div>
    <p className="mt-0.5 truncate text-[8px] text-slate-500 dark:text-slate-300">{compactVoiceLabel(status.voiceId) || 'Default voice'}{status.syncedToFirstSpeaker ? ' • Following Speaker 1' : ''}</p>
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
  audioLibrary = null,
  playbackSourceStatus = null
}) {
  const speakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const voiceProfile = useMemo(() => getTextStructuredVoiceOverrideProfile(documentTree), [documentTree?.metadata]);
  const rateProfile = useMemo(() => getTextStructuredPlaybackRateProfile(documentTree), [documentTree?.metadata]);
  const localProfile = useMemo(() => getTextStructuredLocalAudioProfile(documentTree), [documentTree?.metadata]);
  const downloadProfile = useMemo(() => getTextStructuredAudioDownloadProfile(documentTree), [documentTree?.metadata]);
  const syncProfile = useMemo(() => getTextStructuredAudioSyncProfile(documentTree), [documentTree?.metadata]);
  const englishNames = useMemo(() => uniqueNames(englishVoices), [englishVoices]);
  const indonesianNames = useMemo(() => uniqueNames(indonesianVoices), [indonesianVoices]);
  const edgeEnglish = useMemo(() => (edgeGenerationVoices || []).filter(voice => String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const edgeMeaning = useMemo(() => (edgeGenerationVoices || []).filter(voice => !String(voice?.lang || '').startsWith('en-')), [edgeGenerationVoices]);
  const [audioSurface, setAudioSurface] = useState('playback');
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return null;

  const sourceMode = preferences.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const isConversation = documentTree.documentType === 'conversation';
  const localAudioEnabled = sourceMode !== TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY;
  const customLocal = localAudioEnabled && sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL;
  const firstSpeaker = speakers[0] || null;
  const firstEnVoice = firstSpeaker ? (getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: firstSpeaker.label, speakerId: firstSpeaker.id, channel: 'text' }) || '') : '';
  const firstIdVoice = firstSpeaker ? (getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: firstSpeaker.label, speakerId: firstSpeaker.id, channel: 'meaning' }) || '') : '';
  const firstEnRate = firstSpeaker ? (rateProfile.speakerIds?.text?.[firstSpeaker.id] || rateProfile.speakers?.text?.[String(firstSpeaker.label || '').trim().toLowerCase()] || rateProfile.channels?.text || globalTextRate || 1) : (rateProfile.channels?.text || globalTextRate || 1);
  const firstIdRate = firstSpeaker ? (rateProfile.speakerIds?.meaning?.[firstSpeaker.id] || rateProfile.speakers?.meaning?.[String(firstSpeaker.label || '').trim().toLowerCase()] || rateProfile.channels?.meaning || globalMeaningRate || 1) : (rateProfile.channels?.meaning || globalMeaningRate || 1);
  const firstLocalEn = firstSpeaker ? (localProfile.speakerIds?.text?.[firstSpeaker.id] || localProfile.speakers?.text?.[String(firstSpeaker.label || '').trim().toLowerCase()] || localProfile.channels?.text || '') : (localProfile.channels?.text || '');
  const firstLocalId = firstSpeaker ? (localProfile.speakerIds?.meaning?.[firstSpeaker.id] || localProfile.speakers?.meaning?.[String(firstSpeaker.label || '').trim().toLowerCase()] || localProfile.channels?.meaning || '') : (localProfile.channels?.meaning || '');
  const folderReady = Boolean(audioLibrary?.folderState?.matchedCount > 0 || audioLibrary?.folderState?.status === 'ready' || audioLibrary?.folderState?.status === 'connected');
  const zipCount = Array.isArray(audioLibrary?.zipState?.archives) ? audioLibrary.zipState.archives.length : 0;
  const stagingCount = Number(audioLibrary?.staging?.count || 0);
  const localVoiceCountEn = (availableLocalVoices?.channels?.text || []).length;
  const localVoiceCountId = (availableLocalVoices?.channels?.meaning || []).length;

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
      <div className="mb-3 space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/75 dark:bg-slate-900/35 p-2.5" data-text-local-audio-mode="true">
        <button type="button" aria-pressed={localAudioEnabled} disabled={disabled} onClick={() => onAudioSourceModeChange?.(localAudioEnabled ? TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY : TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST)} className={`flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-[9px] font-black ${localAudioEnabled ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
          <span>LOCAL AUDIO</span><span>{localAudioEnabled ? 'ON' : 'OFF'}</span>
        </button>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" disabled={disabled || !localAudioEnabled} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST)} className={`min-h-9 rounded-lg border px-2 text-[8px] font-black disabled:opacity-40 ${sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>AUTO</button>
          <button type="button" disabled={disabled || !localAudioEnabled} onClick={() => onAudioSourceModeChange?.(TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL)} className={`min-h-9 rounded-lg border px-2 text-[8px] font-black disabled:opacity-40 ${sourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>CUSTOM</button>
        </div>
        <p className="text-[8px] leading-relaxed text-slate-400">{!localAudioEnabled ? 'OFF = Browser TTS only.' : customLocal ? 'CUSTOM = use the selected local voice for each narrator/speaker. If that local file is unavailable, playback falls back to its Browser TTS voice.' : 'AUTO = use compatible Folder / ZIP / Staging audio when available, then fall back to Browser TTS.'}</p>
        <div className="grid grid-cols-2 gap-1 text-[7px] font-bold text-slate-500 dark:text-slate-300">
          <div className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5">Sources • Folder {folderReady ? 'ready' : '—'} • ZIP {zipCount} • Staging {stagingCount}</div>
          <div className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5">Local voices • EN {localVoiceCountEn} • ID {localVoiceCountId}</div>
        </div>
        <p className="text-[7px] leading-relaxed text-slate-400">Attach or reconnect Folder / ZIP from <b>DOWNLOAD → SOURCES</b>. Playback does not import files from this switch; it only decides whether linked local audio may be used.</p>
      </div>
      <SourceStatus status={playbackSourceStatus}/>

      {!isConversation && <div className="space-y-2" data-text-audio-paragraph="true">
        <div className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[9px] font-black text-slate-600 dark:text-slate-300">Paragraph narrator</span></div>
        {renderDocumentChannel('text', 'EN / Text', englishNames, defaultTextVoiceName, globalTextRate, availableLocalVoices?.channels?.text || [])}
        {renderDocumentChannel('meaning', 'ID / Meaning', indonesianNames, defaultMeaningVoiceName, globalMeaningRate, availableLocalVoices?.channels?.meaning || [])}
      </div>}

      {isConversation && <div className="space-y-2" data-text-audio-conversation="true">
        <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-sky-500"/><span className="text-[9px] font-black text-slate-600 dark:text-slate-300">Detected speakers ({speakers.length})</span></div>
        {speakers.length > 1 && <div className="grid grid-cols-2 gap-1" data-text-audio-sync-grid="true">
          {[
            { key: 'en-voice', label: 'EN VOICE', active: syncProfile.voice?.text === true, tone: 'sky', click: () => onSyncSpeakerVoice?.('text', !(syncProfile.voice?.text === true)) },
            { key: 'en-speed', label: 'EN SPEED', active: syncProfile.rate?.text === true, tone: 'sky', click: () => onSyncSpeakerRate?.('text', !(syncProfile.rate?.text === true)) },
            { key: 'id-voice', label: 'ID VOICE', active: syncProfile.voice?.meaning === true, tone: 'violet', click: () => onSyncSpeakerVoice?.('meaning', !(syncProfile.voice?.meaning === true)) },
            { key: 'id-speed', label: 'ID SPEED', active: syncProfile.rate?.meaning === true, tone: 'violet', click: () => onSyncSpeakerRate?.('meaning', !(syncProfile.rate?.meaning === true)) }
          ].map(item => <button key={item.key} type="button" aria-pressed={item.active} disabled={disabled} onClick={item.click} className={`flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border px-2 text-center text-[7px] font-black ${item.active ? (item.tone === 'sky' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-violet-600 border-violet-600 text-white') : (item.tone === 'sky' ? 'border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300' : 'border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-300')}`}>
            {item.key.includes('voice') && <Link2 className="w-3 h-3 shrink-0"/>}<span>SYNC {item.label} • {item.active ? 'ON' : 'OFF'}</span>
          </button>)}
        </div>}
        {speakers.length > 1 && <p className="text-[7px] leading-relaxed text-slate-400">Sync is non-destructive: followers use Speaker 1 while ON, but their saved voice/speed stays untouched and returns when OFF.</p>}
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
          const enVoiceHelper = enVoiceFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedEnVoice || defaultTextVoiceName)}` : null;
          const idVoiceHelper = idVoiceFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedIdVoice || defaultMeaningVoiceName)}` : null;
          const enRateHelper = enRateFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${Number(savedEnRate).toFixed(1)}×` : null;
          const idRateHelper = idRateFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${Number(savedIdRate).toFixed(1)}×` : null;
          return <div key={id} className={`rounded-xl border bg-white/90 dark:bg-slate-900/40 p-2.5 ${index === 0 ? 'border-indigo-200 dark:border-indigo-900' : 'border-sky-100 dark:border-sky-900'}`} data-text-audio-speaker={id}>
            <div className="mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-sky-500"/><span className="text-[9px] font-black text-slate-700 dark:text-slate-200">{index + 1}. {label}</span>{index === 0 && speakers.length > 1 && <span className="ml-auto rounded bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.5 text-[7px] font-black text-indigo-600 dark:text-indigo-300">SYNC MASTER</span>}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2"><VoiceSelect label="EN • TTS voice" value={effectiveEnVoice} options={englishNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultTextVoiceName)}`} disabled={disabled || enVoiceFollower} helper={enVoiceHelper} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'text')}/><RateControl label="EN speed" value={effectiveEnRate} disabled={disabled || enRateFollower} helper={enRateHelper} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'text')}/>{customLocal && <LocalVoiceSelect label="EN • Custom local" value={effectiveLocalEn} options={local.text || []} disabled={disabled || enVoiceFollower} helper={enVoiceFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedLocalEn)}` : null} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'text')}/>}</div>
              <div className="space-y-2"><VoiceSelect label="ID • TTS voice" value={effectiveIdVoice} options={indonesianNames} fallbackLabel={`Global • ${compactVoiceLabel(defaultMeaningVoiceName)}`} disabled={disabled || idVoiceFollower} helper={idVoiceHelper} onChange={value => onSpeakerVoiceChange?.({ id, label }, value, 'meaning')}/><RateControl label="ID speed" value={effectiveIdRate} disabled={disabled || idRateFollower} helper={idRateHelper} onChange={value => onSpeakerRateChange?.({ id, label }, value, 'meaning')}/>{customLocal && <LocalVoiceSelect label="ID • Custom local" value={effectiveLocalId} options={local.meaning || []} disabled={disabled || idVoiceFollower} helper={idVoiceFollower ? `Following 1. ${firstSpeaker?.label || 'Speaker 1'} • saved ${compactVoiceLabel(savedLocalId)}` : null} onChange={value => onSpeakerLocalAudioVoiceChange?.({ id, label }, value, 'meaning')}/>}</div>
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
