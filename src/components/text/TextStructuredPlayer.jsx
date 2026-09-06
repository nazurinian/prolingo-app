import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, FolderOpen, Loader2, MessageSquare, Play, PlayCircle, RotateCcw, Server, SkipForward, Upload, Users, Volume2, Wand2, X } from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  resolveStructuredTextPlaybackList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  TEXT_STRUCTURED_RESUME_MODES,
  getStructuredTextDisplayModeLabel,
  getStructuredTextOrderModeLabel,
  getStructuredTextPlaybackModeLabel,
  getStructuredTextRepeatModeLabel,
  getStructuredTextResumeModeLabel,
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

const ORDER_OPTIONS = [TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL, TEXT_STRUCTURED_ORDER_MODES.SHUFFLE];
const REPEAT_OPTIONS = [TEXT_STRUCTURED_REPEAT_MODES.ONCE, TEXT_STRUCTURED_REPEAT_MODES.TWICE, TEXT_STRUCTURED_REPEAT_MODES.LOOP];
const RESUME_OPTIONS = [TEXT_STRUCTURED_RESUME_MODES.CONTINUE, TEXT_STRUCTURED_RESUME_MODES.RESTART];

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
  onGenerateSpeakerAudio,
  focusTarget = null,
  onFocusConsumed
}) => {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const cardRef = useRef(null);
  const segments = block.segments || [];
  const activeSegment = segments.find(segment => segment.id === playingIndex) || null;
  const isActiveCard = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && Boolean(activeSegment) && (isPlaying || isPaused);
  const isFocusCard = focusTarget?.documentId === documentTree?.id && focusTarget?.blockId === block.id;
  const expanded = manualExpanded || isActiveCard || isFocusCard;

  useEffect(() => {
    if (!cardRef.current) return undefined;
    if (isFocusCard) {
      setManualExpanded(true);
      const frame = window.requestAnimationFrame(() => {
        const target = focusTarget?.segmentId
          ? cardRef.current?.querySelector(`[data-text-player-segment="${focusTarget.segmentId}"]`)
          : cardRef.current;
        (target || cardRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1400);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (!isActiveCard) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = cardRef.current?.querySelector('[data-text-player-segment-active="true"]') || cardRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isActiveCard, playingIndex, isFocusCard, focusTarget?.segmentId, focusTarget?.nonce, onFocusConsumed]);

  const firstSegment = segments[0] || null;
  const collapsedDisplay = resolveStructuredTextDisplayState({ displayMode, isActive: false });
  const cardHasPlayableSegment = segments.some(segment => hasStructuredTextPlayableChannel(segment, playbackChannelMode));
  const preview = collapsedDisplay.showText
    ? (firstSegment?.text || 'No segment yet.')
    : (firstSegment?.meaning || 'No meaning yet.');

  return (<>
    <article ref={cardRef} className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-px hover:shadow-md ${isActiveCard ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-100 dark:ring-indigo-950/50 shadow-indigo-100/40 dark:shadow-none' : isFocusCard ? 'border-amber-400 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-950/40' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`} data-text-player-card={block.id} data-text-search-focus-card={isFocusCard ? 'true' : undefined}>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-slate-50/80 dark:bg-slate-900/40">
        <button type="button" onClick={() => setManualExpanded(value => !value)} className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-all duration-150 active:scale-90" aria-label={expanded ? 'Collapse card' : 'Expand card'}>
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ease-out ${expanded ? 'rotate-90' : ''}`}/>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400">#{index + 1}</span>
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || `${blockLabel(block.blockType)} Card`}</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{blockLabel(block.blockType).toUpperCase()}</span>
            {isActiveCard && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">ACTIVE</span>}
          </div>
          <p className="mt-0.5 text-[8px] font-mono text-slate-400">{block.id} • {segments.length} segment{segments.length === 1 ? '' : 's'}</p>
          {!expanded && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate animate-in fade-in duration-150">{preview}</p>}
        </div>
        <div className="w-full pl-7 sm:w-auto sm:pl-0 sm:ml-auto flex items-center gap-1.5" data-text-card-quick-actions="true">
          <button type="button" disabled={controlsBusy} onClick={() => setAudioPanelOpen(true)} className="flex-1 sm:flex-none px-2 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-sm active:scale-95" title="Card audio profile and Edge download">
            <Volume2 className="w-3 h-3 inline mr-1"/>Audio
          </button>
          <button type="button" disabled={!cardHasPlayableSegment || generationBusy} onClick={() => onPlayCard?.(block.id)} className="flex-1 sm:flex-none px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-md active:scale-95" title="Play this card">
            <Play className="w-3 h-3 inline mr-1 fill-current"/>Card
          </button>
        </div>
      </div>

      {expanded && <div className="p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
            <div key={segment.id} className={`rounded-xl border p-3 transition-all duration-200 ease-out ${active ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/25 shadow-sm' : (isFocusCard && focusTarget?.segmentId === segment.id) ? 'border-amber-400 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-900' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-player-segment={segment.id} data-text-player-segment-active={active ? 'true' : undefined} data-text-search-focus-segment={isFocusCard && focusTarget?.segmentId === segment.id ? 'true' : undefined}>
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
  playbackPreferences = {},
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlaybackFeelChange,
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
  onGenerateAudio,
  focusTarget = null,
  onFocusConsumed
}) => {
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [audioGenerationExpanded, setAudioGenerationExpanded] = useState(false);
  const [playbackFeelExpanded, setPlaybackFeelExpanded] = useState(false);
  const playerRef = useRef(null);
  const blocks = documentTree?.blocks || [];
  const playbackList = useMemo(() => resolveStructuredTextPlaybackList(documentTree), [documentTree]);
  const playableList = useMemo(() => playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode)), [playbackList, playbackChannelMode]);
  const structuredSessionActive = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused);
  const generationBusy = Boolean(generationState?.running);
  const controlsBusy = structuredSessionActive || generationBusy;
  const conversationSpeakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const englishVoiceNames = useMemo(() => [...new Set((Array.isArray(englishVoices) ? englishVoices : []).map(voice => String(voice?.name || '').trim()).filter(Boolean))], [englishVoices]);
  const textSpeakerMap = speakerVoiceMap?.text && typeof speakerVoiceMap.text === 'object' ? speakerVoiceMap.text : {};

  useEffect(() => {
    if (!playerRef.current || focusTarget?.documentId !== documentTree?.id || focusTarget?.blockId) return undefined;
    playerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1000);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.documentId, focusTarget?.blockId, focusTarget?.nonce, documentTree?.id, onFocusConsumed]);

  return (
    <section ref={playerRef} className="h-full overflow-y-auto pb-32 md:pb-4 scroll-smooth" data-text-structured-player="true" data-text-segment-auto-follow="true">
      <div className="mb-2 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white/90 dark:bg-slate-800/90 shadow-sm transition-all duration-200 ease-out motion-reduce:transition-none" data-text-compact-toolbar="true">
        <div className="flex items-center gap-2 p-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
            {documentTree?.documentType === 'conversation' ? <MessageSquare className="w-4 h-4"/> : <FileText className="w-4 h-4"/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Text</p>
            <p className="text-[8px] text-slate-400 truncate">{blocks.length} cards • {playableList.length}/{playbackList.length} playable</p>
          </div>
          <button type="button" onClick={() => setControlsExpanded(value => !value)} className={`px-2 py-1.5 rounded-lg border text-[9px] font-black transition-all duration-150 active:scale-95 ${controlsExpanded ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700'}`} aria-expanded={controlsExpanded} title="Show Text controls">
            <ChevronRight className={`w-3 h-3 inline mr-1 transition-transform duration-200 ${controlsExpanded ? 'rotate-90' : ''}`}/>Controls
          </button>
          <button type="button" disabled={!playableList.length || generationBusy} onClick={onPlayDocument} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-md active:scale-95" title="Play Document"><Play className="w-3 h-3 inline mr-1 fill-current"/>Play</button>
        </div>

        {controlsExpanded && <div className="border-t border-indigo-100 dark:border-indigo-900 p-2.5 animate-in fade-in slide-in-from-top-1 duration-200" data-text-compact-controls="true">
          <div className="mb-2 flex items-center gap-2 text-[8px] text-slate-400">
            <span className="font-black text-slate-600 dark:text-slate-300">Document</span>
            <span className="truncate" title={documentTree?.title || 'Text Document'}>{documentTree?.title || 'Text Document'}</span>
            <span className="ml-auto hidden sm:inline font-mono">{documentTree?.id || ''}</span>
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

        <div className="mt-3 rounded-xl border border-violet-100 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20 p-2.5" data-text-audio-generation="true" data-text-edge-only-generation="true" data-text-audio-generation-collapsible="true">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setAudioGenerationExpanded(value => !value)} className="flex items-center gap-1.5 min-w-0 text-left" aria-expanded={audioGenerationExpanded} title="Open Edge audio download settings">
              {audioGenerationExpanded ? <ChevronDown className="w-3.5 h-3.5 text-violet-500"/> : <ChevronRight className="w-3.5 h-3.5 text-violet-500"/>}
              <Wand2 className="w-3.5 h-3.5 text-violet-500"/>
              <span className="text-[9px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Audio Download</span>
            </button>
            <span className="text-[8px] text-slate-400">{audioGenerationExpanded ? 'Edge settings' : 'collapsed • Card Audio tetap tersedia per Card'}</span>
            {generationBusy && <span className="text-[8px] font-black text-violet-600 dark:text-violet-300"><Loader2 className="w-3 h-3 inline mr-1 animate-spin"/>{generationState?.completed || 0}/{generationState?.total || 0}</span>}
            <button type="button" disabled={controlsBusy || edgeHealth?.status === 'testing'} onClick={onEdgeHealthCheck} className="ml-auto px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-[8px] font-black text-violet-700 dark:text-violet-300 disabled:opacity-40">
              {edgeHealth?.status === 'testing' ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin"/> : <Server className="w-3 h-3 inline mr-1"/>}Test Edge
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-slate-400" data-text-audio-generation-summary="true">
            <span>Folder: {folderState?.status || 'idle'}{folderState?.matchedCount ? ` • ${folderState.matchedCount} connected` : ''}</span>
            <span className={edgeHealth?.status === 'online' ? 'text-emerald-600 dark:text-emerald-300' : edgeHealth?.status === 'error' ? 'text-red-500' : ''}>Edge: {edgeHealth?.message || edgeHealth?.status || 'not tested'}</span>
          </div>

          {audioGenerationExpanded && <div className="mt-2 border-t border-violet-100 dark:border-violet-900 pt-2" data-text-audio-generation-details="true">
            <div className="grid gap-2 lg:grid-cols-2">
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
            <p className="mt-1.5 text-[8px] text-slate-400">A12.1 audio contract tetap frozen: Card/Segment override, Edge generation, dan runtime lookup tetap memakai effective voice + SEGMENT_ID/TXTAUDIO identity.</p>
          </div>}
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

        <div className="mt-2 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/55 dark:bg-emerald-950/20 p-2" data-text-playback-feel-controls="true">
          <button type="button" onClick={() => setPlaybackFeelExpanded(value => !value)} className="w-full flex items-center gap-1.5 text-left" aria-expanded={playbackFeelExpanded}>
            {playbackFeelExpanded ? <ChevronDown className="w-3.5 h-3.5 text-emerald-500"/> : <ChevronRight className="w-3.5 h-3.5 text-emerald-500"/>}
            <span className="text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Playback Feel</span>
            <span className="ml-auto text-[8px] text-slate-400">{getStructuredTextOrderModeLabel(playbackPreferences?.playbackOrderMode)} • {getStructuredTextRepeatModeLabel(playbackPreferences?.repeatMode)} • {Number(playbackPreferences?.channelDelayMs || 0)}/{Number(playbackPreferences?.segmentDelayMs || 0)} ms • {getStructuredTextResumeModeLabel(playbackPreferences?.resumeMode)}</span>
          </button>

          {playbackFeelExpanded && <div className="mt-2 grid gap-2 border-t border-emerald-100 dark:border-emerald-900 pt-2 md:grid-cols-2" data-text-playback-feel-details="true">
            <div>
              <p className="mb-1 text-[8px] font-black uppercase tracking-wide text-slate-500">Order</p>
              <div className="flex gap-1">
                {ORDER_OPTIONS.map(option => <button key={option} type="button" disabled={controlsBusy} onClick={() => onPlaybackFeelChange?.({ playbackOrderMode: option })} className={`px-2 py-1.5 rounded-lg text-[8px] font-black disabled:opacity-40 ${playbackPreferences?.playbackOrderMode === option ? 'bg-emerald-600 text-white' : 'border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300'}`}>{getStructuredTextOrderModeLabel(option)}</button>)}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[8px] font-black uppercase tracking-wide text-slate-500">Repeat scope</p>
              <div className="flex gap-1">
                {REPEAT_OPTIONS.map(option => <button key={option} type="button" disabled={controlsBusy} onClick={() => onPlaybackFeelChange?.({ repeatMode: option })} className={`px-2 py-1.5 rounded-lg text-[8px] font-black disabled:opacity-40 ${playbackPreferences?.repeatMode === option ? 'bg-emerald-600 text-white' : 'border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300'}`}>{getStructuredTextRepeatModeLabel(option)}</button>)}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[8px] font-black uppercase tracking-wide text-slate-500">Delay</p>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[8px] text-slate-500">EN/ID gap<input type="number" min="0" max="5000" step="50" disabled={controlsBusy} value={Number(playbackPreferences?.channelDelayMs || 0)} onChange={event => onPlaybackFeelChange?.({ channelDelayMs: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[9px]"/></label>
                <label className="text-[8px] text-slate-500">Segment gap<input type="number" min="0" max="5000" step="50" disabled={controlsBusy} value={Number(playbackPreferences?.segmentDelayMs || 0)} onChange={event => onPlaybackFeelChange?.({ segmentDelayMs: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[9px]"/></label>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[8px] font-black uppercase tracking-wide text-slate-500">Global Play after Stop</p>
              <div className="flex gap-1">
                {RESUME_OPTIONS.map(option => <button key={option} type="button" disabled={controlsBusy} onClick={() => onPlaybackFeelChange?.({ resumeMode: option })} className={`px-2 py-1.5 rounded-lg text-[8px] font-black disabled:opacity-40 ${playbackPreferences?.resumeMode === option ? 'bg-emerald-600 text-white' : 'border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300'}`}>{getStructuredTextResumeModeLabel(option)}</button>)}
              </div>
              <p className="mt-1 text-[8px] text-slate-400">Pause/Resume transport tetap true resume untuk local/generated audio; opsi ini hanya memilih cursor saat memulai lagi setelah Stop.</p>
            </div>
          </div>}
        </div>

        <p className="mt-2 text-[9px] text-slate-400">Text controls tetap isolated dari Table. Tutup Controls untuk kembali ke tampilan Card yang lapang.</p>
        </div>}
      </div>

      <div className="space-y-3 animate-in fade-in duration-200">
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
          focusTarget={focusTarget}
          onFocusConsumed={onFocusConsumed}
        />)}
      </div>
    </section>
  );
};

export default TextStructuredPlayer;
