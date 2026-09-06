import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, FolderOpen, Loader2, MessageSquare, Play, PlayCircle, RotateCcw, Server, SkipForward, Upload, Users, Volume2, Wand2, X } from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  resolveStructuredTextPlaybackList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  getStructuredTextDisplayModeLabel,
  getStructuredTextPlaybackModeLabel,
  hasStructuredTextPlayableChannel,
  resolveStructuredTextDisplayState
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../domain/text/textStructuredAudioRuntimeDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { TextStructuredCardAudioPanel } from './TextStructuredCardAudioPanel.jsx';
import { collectTextStructuredConversationSpeakers } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';

const blockLabel = type => type === 'conversation' ? 'Conversation' : 'Paragraph';

const compactVoiceLabel = value => {
  const name = String(value || '').trim();
  if (!name) return 'Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
};

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

const StructuredPlayerCard = ({
  block,
  index,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingIndex,
  displayMode,
  playbackChannelMode,
  onPlayCard,
  onPlaySegment,
  onStartFromSegment,
  audioRuntimeStatusMap,
  onAttachAudioFile,
  onRemoveAudioVariant,
  onGenerateAudio,
  generationBusy = false,
  controlsBusy = false,
  speakerVoiceMap,
  defaultTextVoiceName,
  defaultMeaningVoiceName,
  documentTree,
  englishVoices = [],
  indonesianVoices = [],
  onCardVoiceChange,
  onSegmentVoiceChange,
  onPreviewTts,
  onGenerateCardAudio,
  onGenerateSpeakerAudio
}) => {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const cardRef = useRef(null);
  const segments = block.segments || [];
  const activeSegment = segments.find(segment => segment.id === playingIndex) || null;
  const isActiveCard = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && Boolean(activeSegment) && (isPlaying || isPaused);
  const expanded = manualExpanded || isActiveCard;

  useEffect(() => {
    if (!isActiveCard || !cardRef.current) return;
    cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isActiveCard, playingIndex]);

  const firstSegment = segments[0] || null;
  const collapsedDisplay = resolveStructuredTextDisplayState({ displayMode, isActive: false });
  const cardHasPlayableSegment = segments.some(segment => hasStructuredTextPlayableChannel(segment, playbackChannelMode));
  const preview = collapsedDisplay.showText
    ? (firstSegment?.text || 'No segment yet.')
    : (firstSegment?.meaning || 'No meaning yet.');

  return (<>
    <article ref={cardRef} className={`rounded-2xl border shadow-sm overflow-hidden transition ${isActiveCard ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-100 dark:ring-indigo-950/50' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`} data-text-player-card={block.id}>
      <div className="flex items-center gap-2 p-3 bg-slate-50/80 dark:bg-slate-900/40">
        <button type="button" onClick={() => setManualExpanded(value => !value)} className="p-1 rounded text-slate-400 hover:text-indigo-600" aria-label={expanded ? 'Collapse card' : 'Expand card'}>
          {expanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">#{index + 1}</span>
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || `${blockLabel(block.blockType)} Card`}</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{blockLabel(block.blockType).toUpperCase()}</span>
            {isActiveCard && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">ACTIVE</span>}
          </div>
          <p className="mt-0.5 text-[8px] font-mono text-slate-400">{block.id} • {segments.length} segment{segments.length === 1 ? '' : 's'}</p>
          {!expanded && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">{preview}</p>}
        </div>
        <button type="button" disabled={controlsBusy} onClick={() => setAudioPanelOpen(true)} className="px-2 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 text-[9px] font-black disabled:opacity-35" title="Card audio profile and Edge download">
          <Volume2 className="w-3 h-3 inline mr-1"/>Audio
        </button>
        <button type="button" disabled={!cardHasPlayableSegment || generationBusy} onClick={() => onPlayCard?.(block.id)} className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35" title="Play this card">
          <Play className="w-3 h-3 inline mr-1 fill-current"/>Card
        </button>
      </div>

      {expanded && <div className="p-3 space-y-2">
        {segments.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-400">No segments in this card.</div>}
        {segments.map((segment, segmentIndex) => {
          const active = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && segment.id === playingIndex && (isPlaying || isPaused);
          const display = resolveStructuredTextDisplayState({ displayMode, isActive: active });
          const textSpeaking = active && speakingPart === 'text';
          const meaningSpeaking = active && speakingPart === 'meaning';
          const segmentPlayable = hasStructuredTextPlayableChannel(segment, playbackChannelMode);
          const speakerVoiceName = block.blockType === 'conversation' && segment.speaker
            ? resolveTextStructuredEffectiveVoiceProfile({
                documentTree,
                block,
                segment,
                channel: 'text',
                defaultVoiceName: defaultTextVoiceName
              }).voiceName
            : null;
          return (
            <div key={segment.id} className={`rounded-xl border p-3 transition ${active ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/25' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-player-segment={segment.id}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 text-[9px] font-black text-slate-400 min-w-[24px]">{segmentIndex + 1}</div>
                <div className="min-w-0 flex-1">
                  {block.blockType === 'conversation' && segment.speaker && <div className="mb-1 flex items-center gap-1.5 flex-wrap" data-text-speaker-voice={segment.speaker}>
                    <p className="text-[9px] font-black uppercase tracking-wide text-sky-600 dark:text-sky-300">{segment.speaker}</p>
                    {speakerVoiceName && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-500 dark:text-sky-300">{compactVoiceLabel(speakerVoiceName)}</span>}
                  </div>}

                  {display.showText && <div className={`rounded-lg transition ${textSpeaking ? 'bg-indigo-100/80 dark:bg-indigo-900/35 px-2.5 py-2' : ''}`} data-text-channel="text">
                    {textSpeaking && <p className="text-[8px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300 mb-0.5">Playing Text</p>}
                    <p className="text-sm leading-relaxed font-semibold text-slate-800 dark:text-slate-100">{segment.text || <span className="italic text-slate-400">No Text</span>}</p>
                  </div>}

                  {display.showMeaning && <div className={`mt-2 rounded-lg px-2.5 py-2 transition ${meaningSpeaking ? 'bg-emerald-100/80 dark:bg-emerald-900/30 ring-1 ring-emerald-300 dark:ring-emerald-700' : 'bg-slate-50 dark:bg-slate-800'}`} data-text-channel="meaning">
                    <p className={`text-[8px] font-black uppercase tracking-wide mb-0.5 ${meaningSpeaking ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>{meaningSpeaking ? 'Playing Meaning' : 'Meaning'}</p>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{segment.meaning || <span className="italic text-slate-400">No Meaning</span>}</p>
                  </div>}

                  <div className="mt-2 flex flex-wrap gap-1.5" data-text-audio-runtime-controls={segment.id}>
                    {['text', 'meaning'].map(channel => {
                      const status = audioRuntimeStatusMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { available: false };
                      const label = channel === 'meaning' ? 'ID audio' : 'EN audio';
                      return <div key={channel} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${status.available ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'}`}>
                        <label className="cursor-pointer text-[8px] font-black text-slate-600 dark:text-slate-300" title={`Attach local ${label} for the currently selected Text voice`}>
                          <Upload className="w-3 h-3 inline mr-1"/>{status.available ? label : (status.stale ? `Stale ${label}` : (status.metadataExists ? `Reconnect ${label}` : `Attach ${label}`))}
                          <input type="file" accept="audio/*,.mp3,.wav,.ogg,.webm" className="hidden" onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onAttachAudioFile?.(segment.id, channel, file);
                            event.target.value = '';
                          }}/>
                        </label>
                        <button type="button" disabled={generationBusy || (channel === 'meaning' ? !segment.meaning : !segment.text)} onClick={() => onGenerateAudio?.(segment.id, channel)} className="text-[8px] font-black text-violet-600 dark:text-violet-300 disabled:opacity-35" title={`Generate Edge ${label}`}><Wand2 className="w-3 h-3 inline mr-0.5"/>Edge</button>
                        {status.metadataExists && <>
                          <span className={`max-w-[120px] truncate text-[7px] ${status.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`} title={`${status.voiceId || ''} • ${status.filename || status.variantId}`}>{status.available ? (status.filename || status.variantId) : (status.stale ? 'text changed • regenerate' : 'reconnect file')}</span>
                          <button type="button" onClick={() => onRemoveAudioVariant?.(status.variantId)} className="text-slate-400 hover:text-red-500" title="Remove runtime audio variant"><X className="w-3 h-3"/></button>
                        </>}
                      </div>;
                    })}
                  </div>

                  <p className="mt-1.5 text-[8px] font-mono text-slate-400">{segment.id}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" disabled={!segmentPlayable || generationBusy} onClick={() => onPlaySegment?.(segment.id)} className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[9px] font-bold disabled:opacity-35" title="Play only this segment"><PlayCircle className="w-3 h-3 inline mr-1"/>Only</button>
                  <button type="button" disabled={generationBusy} onClick={() => onStartFromSegment?.(segment.id)} className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold" title="Start from here and continue"><SkipForward className="w-3 h-3 inline mr-1"/>From here</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>}
    </article>
    {audioPanelOpen && <TextStructuredCardAudioPanel
      documentTree={documentTree}
      block={block}
      englishVoices={englishVoices}
      indonesianVoices={indonesianVoices}
      defaultTextVoiceName={defaultTextVoiceName}
      defaultMeaningVoiceName={defaultMeaningVoiceName}
      disabled={controlsBusy}
      onClose={() => setAudioPanelOpen(false)}
      onCardVoiceChange={onCardVoiceChange}
      onSegmentVoiceChange={onSegmentVoiceChange}
      onPreviewTts={onPreviewTts}
      onGenerateCardAudio={onGenerateCardAudio}
      onGenerateSpeakerAudio={onGenerateSpeakerAudio}
    />}
  </>);
};

export const TextStructuredPlayer = ({
  documentTree,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingIndex,
  displayMode,
  playbackChannelMode,
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlayDocument,
  onPlayCard,
  onPlaySegment,
  onStartFromSegment,
  audioRuntimeStatusMap,
  onAttachAudioFile,
  onRemoveAudioVariant,
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  speakerVoiceMap = {},
  onSpeakerVoiceChange,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onPreviewTts,
  generationPreferences = {},
  onGenerationPreferencesChange,
  edgeGenerationVoices = [],
  edgeHealth = {},
  onEdgeHealthCheck,
  generationState = {},
  folderState = {},
  onChooseGenerationFolder,
  onReconnectGenerationFolder,
  onGenerateDocumentAudio,
  onGenerateCardAudio,
  onGenerateSpeakerAudio,
  onCancelGeneration,
  onRetryFailedGeneration,
  onGenerateAudio
}) => {
  const blocks = documentTree?.blocks || [];
  const playbackList = useMemo(() => resolveStructuredTextPlaybackList(documentTree), [documentTree]);
  const playableList = useMemo(() => playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode)), [playbackList, playbackChannelMode]);
  const structuredSessionActive = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused);
  const generationBusy = Boolean(generationState?.running);
  const controlsBusy = structuredSessionActive || generationBusy;
  const conversationSpeakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const englishVoiceNames = useMemo(() => [...new Set((Array.isArray(englishVoices) ? englishVoices : []).map(voice => String(voice?.name || '').trim()).filter(Boolean))], [englishVoices]);
  const textSpeakerMap = speakerVoiceMap?.text && typeof speakerVoiceMap.text === 'object' ? speakerVoiceMap.text : {};

  return (
    <section className="h-full overflow-y-auto pb-32 md:pb-4" data-text-structured-player="true">
      <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-sm p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
            {documentTree?.documentType === 'conversation' ? <MessageSquare className="w-5 h-5"/> : <FileText className="w-5 h-5"/>}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-slate-800 dark:text-white truncate">{documentTree?.title || 'Text Document'}</h2>
            <p className="text-[9px] font-mono text-slate-400">{documentTree?.id || ''} • {blocks.length} cards • {playableList.length}/{playbackList.length} playable</p>
          </div>
          <button type="button" disabled={!playableList.length || generationBusy} onClick={onPlayDocument} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black disabled:opacity-35"><Play className="w-3.5 h-3.5 inline mr-1 fill-current"/>Play Document</button>
        </div>

        {conversationSpeakers.length > 0 && <div className="mt-3 rounded-xl border border-sky-100 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20 p-2.5" data-text-speaker-voice-profiles="true">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3.5 h-3.5 text-sky-500"/>
            <span className="text-[9px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Conversation Voices</span>
            <span className="text-[8px] text-slate-400">EN per speaker • default {compactVoiceLabel(defaultTextVoiceName)}</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {conversationSpeakers.map(({ key, label }) => {
              const assignedVoice = textSpeakerMap[normalizeTextStructuredSpeakerKey(key)] || '';
              const assignedMissing = assignedVoice && !englishVoiceNames.includes(assignedVoice);
              return <label key={key} className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900/50 border border-sky-100 dark:border-sky-900 px-2 py-1.5">
                <span className="text-[9px] font-black text-sky-700 dark:text-sky-300 min-w-[34px] truncate" title={label}>{label}</span>
                <select
                  value={assignedVoice}
                  disabled={controlsBusy}
                  onChange={event => onSpeakerVoiceChange?.(label, event.target.value || null, 'text')}
                  className="min-w-0 flex-1 text-[9px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 px-1.5 py-1 disabled:opacity-50"
                  title={`Voice profile for ${label}`}
                  data-text-speaker-voice-select={key}
                >
                  <option value="">Document default • {compactVoiceLabel(defaultTextVoiceName)}</option>
                  {assignedMissing && <option value={assignedVoice}>Unavailable • {compactVoiceLabel(assignedVoice)}</option>}
                  {englishVoiceNames.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
                </select>
              </label>;
            })}
          </div>
          <p className="mt-1.5 text-[8px] text-slate-400">Speaker profile memilih voice runtime; SEGMENT_ID dan TXTAUDIO identity tidak berubah.</p>
        </div>}

        <div className="mt-3 rounded-xl border border-violet-100 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20 p-2.5" data-text-audio-generation="true" data-text-edge-only-generation="true">
          <div className="flex items-center gap-2 flex-wrap">
            <Wand2 className="w-3.5 h-3.5 text-violet-500"/>
            <span className="text-[9px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Edge Audio Download</span>
            <span className="text-[8px] text-slate-400">A12.1 • generator terpisah dari Browser TTS + runtime resolver</span>
            <button type="button" disabled={controlsBusy || edgeHealth?.status === 'testing'} onClick={onEdgeHealthCheck} className="ml-auto px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-[8px] font-black text-violet-700 dark:text-violet-300 disabled:opacity-40">
              {edgeHealth?.status === 'testing' ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin"/> : <Server className="w-3 h-3 inline mr-1"/>}Test Edge
            </button>
          </div>

          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <label className="text-[8px] font-bold text-slate-500">Global Edge EN default
              <select disabled={controlsBusy} value={generationPreferences?.edgeTextVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeTextVoiceId: event.target.value })} className="mt-1 w-full text-[9px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5">
                {(edgeGenerationVoices || []).filter(voice => String(voice.lang || '').startsWith('en-')).map(voice => <option key={voice.id} value={voice.id}>{voice.label || voice.id}</option>)}
              </select>
            </label>
            <label className="text-[8px] font-bold text-slate-500">Global Edge ID / Meaning default
              <select disabled={controlsBusy} value={generationPreferences?.edgeMeaningVoiceId || ''} onChange={event => onGenerationPreferencesChange?.({ edgeMeaningVoiceId: event.target.value })} className="mt-1 w-full text-[9px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5">
                {!edgeGenerationVoices?.some?.(voice => voice.id === generationPreferences?.edgeMeaningVoiceId) && generationPreferences?.edgeMeaningVoiceId && <option value={generationPreferences.edgeMeaningVoiceId}>{generationPreferences.edgeMeaningVoiceId}</option>}
                {(edgeGenerationVoices || []).filter(voice => !String(voice.lang || '').startsWith('en-')).map(voice => <option key={voice.id} value={voice.id}>{voice.label || voice.id}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[8px] text-slate-500">Download rate ({Number(generationPreferences?.edgeRate || 0) >= 0 ? '+' : ''}{generationPreferences?.edgeRate || 0}%)<input disabled={controlsBusy} type="range" min="-50" max="50" step="10" value={generationPreferences?.edgeRate || 0} onChange={event => onGenerationPreferencesChange?.({ edgeRate: Number(event.target.value) })} className="w-full accent-violet-600"/></label>
            <label className="text-[8px] text-slate-500">Download pitch ({Number(generationPreferences?.edgePitch || 0) >= 0 ? '+' : ''}{generationPreferences?.edgePitch || 0}Hz)<input disabled={controlsBusy} type="range" min="-20" max="20" step="5" value={generationPreferences?.edgePitch || 0} onChange={event => onGenerationPreferencesChange?.({ edgePitch: Number(event.target.value) })} className="w-full accent-violet-600"/></label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[8px] font-bold text-slate-600 dark:text-slate-300"><input disabled={controlsBusy} type="checkbox" checked={generationPreferences?.generateText !== false} onChange={event => onGenerationPreferencesChange?.({ generateText: event.target.checked })}/>EN</label>
            <label className="flex items-center gap-1 text-[8px] font-bold text-slate-600 dark:text-slate-300"><input disabled={controlsBusy} type="checkbox" checked={generationPreferences?.generateMeaning !== false} onChange={event => onGenerationPreferencesChange?.({ generateMeaning: event.target.checked })}/>ID</label>
            <button type="button" disabled={controlsBusy} onClick={folderState?.status === 'reconnect-required' ? onReconnectGenerationFolder : onChooseGenerationFolder} className="px-2 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-[8px] font-black text-violet-700 dark:text-violet-300"><FolderOpen className="w-3 h-3 inline mr-1"/>{folderState?.status === 'reconnect-required' ? 'Reconnect Folder' : (folderState?.name || 'Choose Folder')}</button>
            <button type="button" disabled={controlsBusy || !(generationPreferences?.generateText !== false || generationPreferences?.generateMeaning !== false)} onClick={onGenerateDocumentAudio} className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-35"><Wand2 className="w-3 h-3 inline mr-1"/>Generate Document</button>
            {generationBusy && <button type="button" onClick={onCancelGeneration} className="px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 text-[8px] font-black">Cancel</button>}
            {!generationBusy && (generationState?.failedJobs?.length || 0) > 0 && <button type="button" onClick={onRetryFailedGeneration} className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[8px] font-black"><RotateCcw className="w-3 h-3 inline mr-1"/>Retry {generationState.failedJobs.length}</button>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[8px] text-slate-400">
            {generationBusy && <Loader2 className="w-3 h-3 animate-spin"/>}
            <span>{generationBusy ? `${generationState?.completed || 0}/${generationState?.total || 0} • ${generationState?.current?.segmentId || ''}/${generationState?.current?.channel || ''}` : `Folder: ${folderState?.status || 'idle'}${folderState?.matchedCount ? ` • ${folderState.matchedCount} connected` : ''}`}</span>
            <span className={edgeHealth?.status === 'online' ? 'text-emerald-600 dark:text-emerald-300' : edgeHealth?.status === 'error' ? 'text-red-500' : ''}>Edge: {edgeHealth?.message || edgeHealth?.status || 'not tested'}</span>
          </div>
          <p className="mt-1 text-[8px] text-slate-400">Global voice hanya default. Card Audio dapat override per Paragraph, per Conversation speaker, lalu per Segment. Browser TTS preview dan Edge download memakai effective voice resolver yang sama; audio playback tetap dipilih oleh SEGMENT_ID + channel + voice identity.</p>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-2" data-text-show-controls="true">
            <div className="flex items-center gap-1.5 mb-1.5"><Eye className="w-3.5 h-3.5 text-slate-400"/><span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Show</span><span className="text-[8px] text-slate-400">visual only</span></div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {DISPLAY_OPTIONS.map(option => <button
                key={option}
                type="button"
                onClick={() => onDisplayModeChange?.(option)}
                className={`shrink-0 px-2 py-1.5 rounded-lg text-[9px] font-black transition ${displayMode === option ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
              >{getStructuredTextDisplayModeLabel(option)}</button>)}
            </div>
          </div>

          <div className="rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 p-2" data-text-play-controls="true">
            <div className="flex items-center gap-1.5 mb-1.5"><Volume2 className="w-3.5 h-3.5 text-indigo-500"/><span className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Play</span><span className="text-[8px] text-slate-400">TTS channel order</span></div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {PLAY_OPTIONS.map(option => <button
                key={option}
                type="button"
                disabled={controlsBusy}
                onClick={() => onPlaybackChannelModeChange?.(option)}
                className={`shrink-0 px-2 py-1.5 rounded-lg text-[9px] font-black transition disabled:opacity-45 ${playbackChannelMode === option ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900'}`}
              >{getStructuredTextPlaybackModeLabel(option)}</button>)}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[9px] text-slate-400">A12.1 • Browser TTS, Edge download, dan audio runtime resolver dipisah. Voice override tidak mengubah SEGMENT_ID/TXTAUDIO identity.</p>
      </div>

      <div className="space-y-3">
        {blocks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-sm text-slate-400">Document belum memiliki Card. Tambahkan melalui Text → Data.</div>}
        {blocks.map((block, index) => <StructuredPlayerCard
          key={block.id}
          block={block}
          index={index}
          isPlaying={isPlaying}
          isPaused={isPaused}
          speakingPart={speakingPart}
          playingContext={playingContext}
          playingIndex={playingIndex}
          displayMode={displayMode}
          playbackChannelMode={playbackChannelMode}
          onPlayCard={onPlayCard}
          onPlaySegment={onPlaySegment}
          onStartFromSegment={onStartFromSegment}
          audioRuntimeStatusMap={audioRuntimeStatusMap}
          onAttachAudioFile={onAttachAudioFile}
          onRemoveAudioVariant={onRemoveAudioVariant}
          onGenerateAudio={onGenerateAudio}
          generationBusy={generationBusy}
          speakerVoiceMap={speakerVoiceMap}
          defaultTextVoiceName={defaultTextVoiceName}
          defaultMeaningVoiceName={defaultMeaningVoiceName}
          documentTree={documentTree}
          englishVoices={englishVoices}
          indonesianVoices={indonesianVoices}
          controlsBusy={controlsBusy}
          onCardVoiceChange={onCardVoiceChange}
          onSegmentVoiceChange={onSegmentVoiceChange}
          onPreviewTts={onPreviewTts}
          onGenerateCardAudio={onGenerateCardAudio}
          onGenerateSpeakerAudio={onGenerateSpeakerAudio}
        />)}
      </div>
    </section>
  );
};

export default TextStructuredPlayer;
