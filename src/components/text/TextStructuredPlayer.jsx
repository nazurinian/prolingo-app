import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Eye, FileDown, FileText, FolderOpen, Loader2, MessageSquare, Play, PlayCircle, RotateCcw, Server, SkipForward, Square, Upload, Users, Volume2, Wand2, X } from 'lucide-react';
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
import { summarizeTextStructuredAudioCoverage } from '../../domain/text/textStructuredAudioCoverageDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { TextStructuredCardAudioPanel } from './TextStructuredCardAudioPanel.jsx';
import { collectTextStructuredConversationSpeakers, getTextStructuredSpeakerAssignedVoiceName } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { getTextStructuredAudioDownloadProfile } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';

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

const ensureTextTargetVisible = (target, container, { explicit = false } = {}) => {
  if (!target) return;
  if (explicit) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const viewport = container?.getBoundingClientRect?.();
  const rect = target.getBoundingClientRect?.();
  if (!rect) return;
  const isMobileViewport = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
  const safeTop = (viewport?.top ?? 0) + 16;
  const safeBottom = (viewport?.bottom ?? window.innerHeight) - (isMobileViewport ? 104 : 24);
  if (rect.top >= safeTop && rect.bottom <= safeBottom) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  audioCoverageMap,
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
  generationPreferences = {},
  edgeGenerationVoices = [],
  onCardVoiceChange,
  onSegmentVoiceChange,
  onCardDownloadVoiceChange,
  onSegmentDownloadVoiceChange,
  onPreviewTts,
  onGenerateCardAudio,
  onGenerateSpeakerAudio,
  onCancelGeneration,
  onExportSegmentAudio,
  onExportCardZip,
  playbackBusy = false,
  focusTarget = null,
  onFocusConsumed,
  userNavigationRef = null
}) => {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [segmentToolsId, setSegmentToolsId] = useState(null);
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
        ensureTextTargetVisible(target || cardRef.current, cardRef.current?.closest('[data-text-structured-player]'), { explicit: true });
      });
      const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1400);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (!isActiveCard) return undefined;
    if (userNavigationRef?.current && Date.now() - userNavigationRef.current < 1800) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = cardRef.current?.querySelector('[data-text-player-segment-active="true"]') || cardRef.current;
      ensureTextTargetVisible(target, cardRef.current?.closest('[data-text-structured-player]'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isActiveCard, playingIndex, isFocusCard, focusTarget?.segmentId, focusTarget?.nonce, onFocusConsumed, userNavigationRef]);

  const firstSegment = segments[0] || null;
  const collapsedDisplay = resolveStructuredTextDisplayState({ displayMode, isActive: false });
  const cardHasPlayableSegment = segments.some(segment => hasStructuredTextPlayableChannel(segment, playbackChannelMode));
  const preview = collapsedDisplay.showText
    ? (firstSegment?.text || 'No segment yet.')
    : (firstSegment?.meaning || 'No meaning yet.');
  const cardCoverage = useMemo(() => summarizeTextStructuredAudioCoverage({
    documentTree,
    coverageMap: audioCoverageMap,
    blockId: block.id
  }), [documentTree, audioCoverageMap, block.id]);

  return (<>
    <article ref={cardRef} className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-px hover:shadow-md ${isActiveCard ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-100 dark:ring-indigo-950/50 shadow-indigo-100/40 dark:shadow-none' : isFocusCard ? 'border-amber-400 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-950/40' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`} data-text-player-card={block.id} data-text-search-focus-card={isFocusCard ? 'true' : undefined}>
      <div className="flex items-start gap-1.5 p-2.5 sm:gap-2 sm:p-3 bg-slate-50/80 dark:bg-slate-900/40">
        <button type="button" onClick={() => setManualExpanded(value => !value)} className="w-10 h-10 shrink-0 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-all duration-150 active:scale-90 flex items-center justify-center" aria-label={expanded ? 'Collapse card' : 'Expand card'}>
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ease-out ${expanded ? 'rotate-90' : ''}`}/>
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-black text-slate-400 shrink-0">#{index + 1}</span>
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || `${blockLabel(block.blockType)} Card`}</span>
            <span className={`hidden sm:inline-flex text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{blockLabel(block.blockType).toUpperCase()}</span>
            {isActiveCard && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shrink-0">ACTIVE</span>}
          </div>
          <p className="mt-0.5 text-[8px] text-slate-400">{segments.length} segment{segments.length === 1 ? '' : 's'} • Audio {cardCoverage.covered}/{cardCoverage.total}{cardCoverage.needDownload ? ` • ${cardCoverage.needDownload} need download` : ' • ready'}</p>
          {!expanded && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate animate-in fade-in duration-150">{preview}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0" data-text-card-quick-actions="true">
          <button type="button" disabled={playbackBusy} onClick={() => setAudioPanelOpen(true)} className="w-10 h-10 sm:w-auto sm:h-auto sm:min-h-9 sm:px-2 sm:py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-sm active:scale-95 flex items-center justify-center" title="Card audio" aria-label="Open card audio controls">
            <Volume2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 sm:mr-1"/><span className="hidden sm:inline">Audio</span>
          </button>
          <button type="button" disabled={!cardHasPlayableSegment || generationBusy} onClick={() => onPlayCard?.(block.id)} className="w-10 h-10 sm:w-auto sm:h-auto sm:min-h-9 sm:px-2 sm:py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-md active:scale-95 flex items-center justify-center" title="Play this card" aria-label="Play this card">
            <Play className="w-3.5 h-3.5 sm:w-3 sm:h-3 sm:mr-1 fill-current"/><span className="hidden sm:inline">Card</span>
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
                defaultVoiceName: defaultTextVoiceName,
              }).voiceName
            : null;
          return (
            <div key={segment.id} className={`rounded-xl border p-3 transition-all duration-200 ease-out ${active ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/25 shadow-sm' : (isFocusCard && focusTarget?.segmentId === segment.id) ? 'border-amber-400 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-900' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-player-segment={segment.id} data-text-player-segment-active={active ? 'true' : undefined} data-text-search-focus-segment={isFocusCard && focusTarget?.segmentId === segment.id ? 'true' : undefined}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="hidden sm:block mt-0.5 text-[9px] font-black text-slate-400 min-w-[24px]">{segmentIndex + 1}</div>
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
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{segment.meaning || <span className="italic text-slate-400">No Meaning</span>}</p>
                  </div>}

                  {segmentToolsId === segment.id && <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-2 animate-in fade-in duration-150 md:grid-cols-2" data-text-audio-runtime-controls={segment.id}>
                    {['text', 'meaning'].map(channel => {
                      const key = buildTextStructuredRuntimeAudioKey(segment.id, channel);
                      const status = audioRuntimeStatusMap?.[key] || { available: false };
                      const coverage = audioCoverageMap?.[key] || { status: 'missing' };
                      const label = channel === 'meaning' ? 'ID' : 'EN';
                      const hasContent = channel === 'meaning' ? Boolean(segment.meaning) : Boolean(segment.text);
                      const ready = coverage.status === 'ready';
                      const removable = Boolean(status.variantId) && (coverage.sourceType === 'staging' || status.source === 'file');
                      return <div key={channel} className={`rounded-lg border p-2 ${ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25' : 'border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-700 dark:text-slate-200">{label} audio</span>
                          <span className={`ml-auto rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${ready ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}>{coverage.status || 'missing'}</span>
                        </div>
                        <p className="mt-1 truncate text-[7px] text-slate-400" title={coverage.requiredVoiceId || status.downloadVoiceId || ''}>{coverage.requiredVoiceId || status.downloadVoiceId || 'No resolved download voice'}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button type="button" disabled={generationBusy || !hasContent} onClick={() => onGenerateAudio?.(segment.id, channel)} className="min-h-8 px-2 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-35"><Wand2 className="w-3 h-3 inline mr-1"/>{ready ? 'Regenerate' : 'Generate'}</button>
                          <button type="button" disabled={!ready} onClick={() => onExportSegmentAudio?.(segment.id, channel)} className="min-h-8 px-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[8px] font-black disabled:opacity-35"><FileDown className="w-3 h-3 inline mr-1"/>MP3</button>
                          <label className="min-h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center cursor-pointer text-[8px] font-black text-slate-500 dark:text-slate-300"><Upload className="w-3 h-3 mr-1"/>Attach<input type="file" accept="audio/*,.mp3,.wav,.ogg,.webm" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttachAudioFile?.(segment.id, channel, file); event.target.value = ''; }}/></label>
                          {removable && <button type="button" onClick={() => onRemoveAudioVariant?.(status.variantId || coverage.variantId)} className="min-h-8 px-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[8px] font-black" title="Release staged audio or remove manual local variant"><X className="w-3 h-3 inline mr-1"/>Release</button>}
                        </div>
                      </div>;
                    })}
                    {generationBusy && <button type="button" onClick={() => onCancelGeneration?.()} className="md:col-span-2 min-h-9 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[8px] font-black"><Square className="w-3 h-3 inline mr-1 fill-current"/>STOP generation</button>}
                  </div>}
                </div>
                <div className="w-full sm:w-auto flex flex-row flex-wrap gap-1 sm:flex-col sm:shrink-0">
                  <button type="button" disabled={!segmentPlayable || generationBusy} onClick={() => onPlaySegment?.(segment.id)} className="min-h-9 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[9px] font-bold disabled:opacity-35" title="Play only this segment"><PlayCircle className="w-3 h-3 inline mr-1"/>Only</button>
                  <button type="button" disabled={generationBusy} onClick={() => onStartFromSegment?.(segment.id)} className="min-h-9 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold" title="Start from here and continue"><SkipForward className="w-3 h-3 inline mr-1"/>From here</button>
                  <button type="button" onClick={() => setSegmentToolsId(current => current === segment.id ? null : segment.id)} className={`min-h-10 sm:min-h-9 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold ${segmentToolsId === segment.id ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`} aria-expanded={segmentToolsId === segment.id} title="Segment audio tools"><Volume2 className="w-3 h-3 inline mr-1"/>Audio</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>}
    </article>
    {audioPanelOpen && typeof document !== 'undefined' && createPortal(<TextStructuredCardAudioPanel
      documentTree={documentTree}
      block={block}
      englishVoices={englishVoices}
      indonesianVoices={indonesianVoices}
      defaultTextVoiceName={defaultTextVoiceName}
      defaultMeaningVoiceName={defaultMeaningVoiceName}
      generationPreferences={generationPreferences}
      edgeGenerationVoices={edgeGenerationVoices}
      cardCoverage={cardCoverage}
      audioCoverageMap={audioCoverageMap}
      generationRunning={generationBusy}
      disabled={playbackBusy || generationBusy}
      onClose={() => setAudioPanelOpen(false)}
      onCardVoiceChange={onCardVoiceChange}
      onSegmentVoiceChange={onSegmentVoiceChange}
      onCardDownloadVoiceChange={onCardDownloadVoiceChange}
      onSegmentDownloadVoiceChange={onSegmentDownloadVoiceChange}
      onPreviewTts={onPreviewTts}
      onGenerateCardAudio={onGenerateCardAudio}
      onGenerateSpeakerAudio={onGenerateSpeakerAudio}
      onCancelGeneration={onCancelGeneration}
      onExportSegmentAudio={onExportSegmentAudio}
      onExportCardZip={onExportCardZip}
    />, document.body)}
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
  audioCoverageMap,
  documentCoverage = null,
  onAttachAudioFile,
  onRemoveAudioVariant,
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  speakerVoiceMap = {},
  onSpeakerVoiceChange,
  onSpeakerDownloadVoiceChange,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onCardDownloadVoiceChange,
  onSegmentDownloadVoiceChange,
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
  onExportSegmentAudio,
  onExportCardZip,
  focusTarget = null,
  onFocusConsumed,
  controlsWorkspaceOpen = false,
  onCloseControlsWorkspace
}) => {
  const [advancedControlsExpanded, setAdvancedControlsExpanded] = useState(false);
  const [audioGenerationExpanded, setAudioGenerationExpanded] = useState(false);
  const [playbackFeelExpanded, setPlaybackFeelExpanded] = useState(false);
  const playerRef = useRef(null);
  const userNavigationRef = useRef(0);
  const blocks = documentTree?.blocks || [];
  const playbackList = useMemo(() => resolveStructuredTextPlaybackList(documentTree), [documentTree]);
  const playableList = useMemo(() => playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode)), [playbackList, playbackChannelMode]);
  const structuredSessionActive = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused);
  const generationBusy = Boolean(generationState?.running);
  const controlsBusy = structuredSessionActive || generationBusy;
  const conversationSpeakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const englishVoiceNames = useMemo(() => [...new Set((Array.isArray(englishVoices) ? englishVoices : []).map(voice => String(voice?.name || '').trim()).filter(Boolean))], [englishVoices]);
  const indonesianVoiceNames = useMemo(() => [...new Set((Array.isArray(indonesianVoices) ? indonesianVoices : []).map(voice => String(voice?.name || '').trim()).filter(Boolean))], [indonesianVoices]);
  const documentDownloadProfile = useMemo(() => getTextStructuredAudioDownloadProfile(documentTree), [documentTree?.metadata]);

  useEffect(() => {
    if (!playerRef.current || focusTarget?.documentId !== documentTree?.id || focusTarget?.blockId) return undefined;
    playerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1000);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.documentId, focusTarget?.blockId, focusTarget?.nonce, documentTree?.id, onFocusConsumed]);

  return (
    <section ref={playerRef} onWheel={() => { userNavigationRef.current = Date.now(); }} onTouchStart={() => { userNavigationRef.current = Date.now(); }} onPointerDown={() => { userNavigationRef.current = Date.now(); }} className="h-full overflow-y-auto overscroll-contain pb-32 md:pb-4 scroll-smooth custom-scrollbar" data-text-structured-player="true" data-text-segment-auto-follow="true" data-text-auto-follow-user-grace-ms="1800">
      <div className="mb-2 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white/90 dark:bg-slate-800/90 shadow-sm transition-all duration-200 ease-out motion-reduce:transition-none" data-text-compact-toolbar="true">
        <div className="flex items-center gap-2 p-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
            {documentTree?.documentType === 'conversation' ? <MessageSquare className="w-4 h-4"/> : <FileText className="w-4 h-4"/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Text • Player settings via bottom bar</p>
            <p className="text-[8px] text-slate-400 truncate">{blocks.length} cards • {playableList.length}/{playbackList.length} playable • Audio {documentCoverage?.covered || 0}/{documentCoverage?.total || 0}{documentCoverage?.needDownload ? ` • ${documentCoverage.needDownload} need` : ''}</p>
          </div>
          <button type="button" disabled={!playableList.length || generationBusy} onClick={onPlayDocument} className="min-h-10 sm:min-h-9 px-3 py-2 sm:py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-md active:scale-95" title="Play Document"><Play className="w-3 h-3 inline mr-1 fill-current"/>Play</button>
        </div>

        {controlsWorkspaceOpen && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[155] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" data-text-player-workspace="true" onMouseDown={event => { if (event.target === event.currentTarget) onCloseControlsWorkspace?.(); }}>
            <div className="w-full max-w-5xl max-h-[92dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onMouseDown={event => event.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><Volume2 className="w-4 h-4"/></div>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-800 dark:text-white">Text Player</h2><p className="text-[9px] text-slate-400 truncate">{documentTree?.title || 'Text Document'} • playback • voices • audio download</p></div>
                <button type="button" onClick={() => onCloseControlsWorkspace?.()} className="min-h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-black text-slate-500 hover:text-red-500"><X className="w-4 h-4 inline mr-1"/>Close</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-3 md:p-4">
                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-white dark:bg-slate-800 p-2.5" data-text-compact-controls="true">
          <div className="mb-2 flex items-center gap-2 text-[8px] text-slate-400">
            <span className="font-black text-slate-600 dark:text-slate-300">Document</span>
            <span className="truncate" title={documentTree?.title || 'Text Document'}>{documentTree?.title || 'Text Document'}</span>
          </div>

          <button type="button" onClick={() => setAdvancedControlsExpanded(value => !value)} className="mb-2 w-full min-h-10 sm:min-h-9 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 text-left text-[9px] font-black text-slate-600 dark:text-slate-300" aria-expanded={advancedControlsExpanded} data-text-advanced-controls-toggle="true">
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${advancedControlsExpanded ? 'rotate-90' : ''}`}/>
            Audio & voices
            <span className="ml-auto text-[8px] font-normal text-slate-400">advanced</span>
          </button>

        {advancedControlsExpanded && <><div className="animate-in fade-in duration-150">
        {conversationSpeakers.length > 0 && <div className="mt-1 rounded-xl border border-sky-100 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20 p-2.5" data-text-speaker-voice-profiles="true">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3.5 h-3.5 text-sky-500"/>
            <span className="text-[9px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Conversation Speaker Profiles</span>
            <span className="text-[8px] text-slate-400">Document-level • playback and Edge download stay separate</span>
          </div>
          <div className="space-y-2">
            {conversationSpeakers.map(({ id: speakerId, label, persisted }) => {
              const playbackText = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId, channel: 'text' }) || '';
              const playbackMeaning = getTextStructuredSpeakerAssignedVoiceName({ documentTree, speaker: label, speakerId, channel: 'meaning' }) || '';
              const downloadText = documentDownloadProfile?.speakerIds?.text?.[speakerId] || documentDownloadProfile?.speakers?.text?.[String(label || '').trim().toLowerCase().replace(/\s+/g, ' ')] || '';
              const downloadMeaning = documentDownloadProfile?.speakerIds?.meaning?.[speakerId] || documentDownloadProfile?.speakers?.meaning?.[String(label || '').trim().toLowerCase().replace(/\s+/g, ' ')] || '';
              const edgeEnglish = (edgeGenerationVoices || []).filter(voice => String(voice.lang || '').startsWith('en-'));
              const edgeMeaning = (edgeGenerationVoices || []).filter(voice => !String(voice.lang || '').startsWith('en-'));
              return <div key={speakerId} className="rounded-xl border border-sky-100 dark:border-sky-900 bg-white/90 dark:bg-slate-900/50 p-2.5" data-text-speaker-profile-id={speakerId}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-lg bg-sky-100 dark:bg-sky-900/40 px-2 py-1 text-[9px] font-black text-sky-700 dark:text-sky-300">{label}</span>
                  <span className="text-[7px] font-mono text-slate-400" title={speakerId}>{speakerId.slice(0, 12)}…</span>
                  <span className="ml-auto text-[7px] text-slate-400">{persisted ? 'stable identity' : 'identity saved on first change'}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-[8px] font-bold text-slate-500">Playback EN
                    <select value={playbackText} disabled={controlsBusy} onChange={event => onSpeakerVoiceChange?.({ id: speakerId, label }, event.target.value || null, 'text')} className="mt-1 w-full text-[9px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5" data-text-speaker-playback-en={speakerId}>
                      <option value="">Global • {compactVoiceLabel(defaultTextVoiceName)}</option>
                      {playbackText && !englishVoiceNames.includes(playbackText) && <option value={playbackText}>Unavailable • {compactVoiceLabel(playbackText)}</option>}
                      {englishVoiceNames.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
                    </select>
                  </label>
                  <label className="text-[8px] font-bold text-slate-500">Playback ID
                    <select value={playbackMeaning} disabled={controlsBusy} onChange={event => onSpeakerVoiceChange?.({ id: speakerId, label }, event.target.value || null, 'meaning')} className="mt-1 w-full text-[9px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5" data-text-speaker-playback-id={speakerId}>
                      <option value="">Global • {compactVoiceLabel(defaultMeaningVoiceName)}</option>
                      {playbackMeaning && !indonesianVoiceNames.includes(playbackMeaning) && <option value={playbackMeaning}>Unavailable • {compactVoiceLabel(playbackMeaning)}</option>}
                      {indonesianVoiceNames.map(name => <option key={name} value={name}>{compactVoiceLabel(name)}</option>)}
                    </select>
                  </label>
                  <label className="text-[8px] font-bold text-violet-600 dark:text-violet-300">Edge Download EN
                    <select value={downloadText} disabled={controlsBusy} onChange={event => onSpeakerDownloadVoiceChange?.({ id: speakerId, label }, event.target.value || null, 'text')} className="mt-1 w-full text-[9px] rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 px-2 py-1.5" data-text-speaker-download-en={speakerId}>
                      <option value="">Global Edge EN</option>
                      {downloadText && !edgeEnglish.some(voice => voice.id === downloadText) && <option value={downloadText}>Unavailable • {compactVoiceLabel(downloadText)}</option>}
                      {edgeEnglish.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}
                    </select>
                  </label>
                  <label className="text-[8px] font-bold text-violet-600 dark:text-violet-300">Edge Download ID
                    <select value={downloadMeaning} disabled={controlsBusy} onChange={event => onSpeakerDownloadVoiceChange?.({ id: speakerId, label }, event.target.value || null, 'meaning')} className="mt-1 w-full text-[9px] rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 px-2 py-1.5" data-text-speaker-download-id={speakerId}>
                      <option value="">Global Edge ID</option>
                      {downloadMeaning && !edgeMeaning.some(voice => voice.id === downloadMeaning) && <option value={downloadMeaning}>Unavailable • {compactVoiceLabel(downloadMeaning)}</option>}
                      {edgeMeaning.map(voice => <option key={voice.id} value={voice.id}>{voice.label || compactVoiceLabel(voice.id)}</option>)}
                    </select>
                  </label>
                </div>
              </div>;
            })}
          </div>
          <p className="mt-1.5 text-[8px] text-slate-400">Stable speaker identity is stored in Segment metadata on first profile change. Renaming the visible speaker label later does not replace the profile identity. Card and Segment overrides remain higher priority.</p>
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
            <span className={documentCoverage?.needDownload ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}>Coverage: {documentCoverage?.covered || 0}/{documentCoverage?.total || 0} • need {documentCoverage?.needDownload || 0}</span>
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
              <button type="button" disabled={controlsBusy || !(generationPreferences?.generateText !== false || generationPreferences?.generateMeaning !== false) || !(documentCoverage?.needDownload || 0)} onClick={() => onGenerateDocumentAudio?.({ missingOnly: true })} className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[8px] font-black disabled:opacity-35"><Wand2 className="w-3 h-3 inline mr-1"/>Download Missing ({documentCoverage?.needDownload || 0})</button>
              <button type="button" disabled={controlsBusy || !(documentCoverage?.total || 0)} onClick={() => onGenerateDocumentAudio?.({ missingOnly: false })} className="px-2 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-[8px] font-black text-violet-700 dark:text-violet-300 disabled:opacity-35">Redownload All ({documentCoverage?.total || 0})</button>
              {generationBusy && <button type="button" onClick={onCancelGeneration} className="px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 text-[8px] font-black">Cancel</button>}
              {!generationBusy && (generationState?.failedJobs?.length || 0) > 0 && <button type="button" onClick={onRetryFailedGeneration} className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[8px] font-black"><RotateCcw className="w-3 h-3 inline mr-1"/>Retry {generationState.failedJobs.length}</button>}
            </div>
            <p className="mt-1.5 text-[8px] text-slate-400">Edge Download Profile is independent from Browser/Sidebar playback voices. Generated/local audio is matched by its Edge download voice identity.</p>
          </div>}
        </div>
        </div></>}

        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-2" data-text-show-controls="true">
            <div className="flex items-center gap-1.5 mb-1.5"><Eye className="w-3.5 h-3.5 text-slate-400"/><span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Show</span><span className="text-[8px] text-slate-400">visual only</span></div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {DISPLAY_OPTIONS.map(option => <button
                key={option}
                type="button"
                onClick={() => onDisplayModeChange?.(option)}
                className={`shrink-0 min-h-10 sm:min-h-0 px-2.5 py-2 sm:py-1.5 rounded-lg text-[9px] font-black transition ${displayMode === option ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
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
                className={`shrink-0 min-h-10 sm:min-h-0 px-2.5 py-2 sm:py-1.5 rounded-lg text-[9px] font-black transition disabled:opacity-45 ${playbackChannelMode === option ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900'}`}
              >{getStructuredTextPlaybackModeLabel(option)}</button>)}
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/55 dark:bg-emerald-950/20 p-2" data-text-playback-feel-controls="true">
          <button type="button" onClick={() => setPlaybackFeelExpanded(value => !value)} className="w-full min-h-10 flex items-center gap-1.5 text-left" aria-expanded={playbackFeelExpanded}>
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

        <p className="mt-2 text-[9px] text-slate-400">Text controls tetap isolated dari Table. Tutup Text Player untuk kembali ke tampilan Card yang lapang.</p>
                </div>
              </div>
            </div>
          </div>, document.body)}
      </div>

      <div className="space-y-3 animate-in fade-in duration-200">
        {blocks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-sm text-slate-400">Document belum memiliki Card. Buka Data untuk membuat Card pertama.</div>}
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
          audioCoverageMap={audioCoverageMap}
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
          generationPreferences={generationPreferences}
          edgeGenerationVoices={edgeGenerationVoices}
          controlsBusy={controlsBusy}
          playbackBusy={structuredSessionActive}
          onCardVoiceChange={onCardVoiceChange}
          onSegmentVoiceChange={onSegmentVoiceChange}
          onCardDownloadVoiceChange={onCardDownloadVoiceChange}
          onSegmentDownloadVoiceChange={onSegmentDownloadVoiceChange}
          onPreviewTts={onPreviewTts}
          onGenerateCardAudio={onGenerateCardAudio}
          onGenerateSpeakerAudio={onGenerateSpeakerAudio}
          onCancelGeneration={onCancelGeneration}
          onExportSegmentAudio={onExportSegmentAudio}
          onExportCardZip={onExportCardZip}
          focusTarget={focusTarget}
          onFocusConsumed={onFocusConsumed}
          userNavigationRef={userNavigationRef}
        />)}
      </div>
    </section>
  );
};

export default TextStructuredPlayer;
