import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Eye, FileDown, FileText, FolderOpen, Loader2, MessageSquare, Play, PlayCircle, RotateCcw, Server, SkipForward, Square, Upload, Users, Volume2, Wand2, X } from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
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
import { summarizeTextStructuredAudioCoverage, TEXT_AUDIO_COVERAGE_STATUS } from '../../domain/text/textStructuredAudioCoverageDomain.js';
import { getTextStructuredVoiceOverrideProfile, resolveTextStructuredEffectiveVoiceProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { TextStructuredCardAudioPanel } from './TextStructuredCardAudioPanel.jsx';
import { collectTextStructuredConversationSpeakers, getTextStructuredSpeakerAssignedVoiceName } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import { getTextStructuredAudioDownloadProfile } from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import TextStructuredPlaybackControls from './TextStructuredPlaybackControls.jsx';
import { TEXT_PARAGRAPH_CARD_ROLES, getTextParagraphCardRoleLabel, resolveTextParagraphCardRole } from '../../domain/text/textParagraphRoleDomain.js';
import TextParagraphUnifiedReading from './TextParagraphUnifiedReading.jsx';

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


const coverageBadgeClass = status => {
  if (status === TEXT_AUDIO_COVERAGE_STATUS.READY) return 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300';
  if (status === TEXT_AUDIO_COVERAGE_STATUS.STALE) return 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
  if (status === TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE) return 'border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300';
  if (status === TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED) return 'border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300';
  return 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/35 text-slate-400';
};
const coverageBadgeLabel = status => ({
  [TEXT_AUDIO_COVERAGE_STATUS.READY]: 'READY',
  [TEXT_AUDIO_COVERAGE_STATUS.STALE]: 'STALE',
  [TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE]: 'OTHER',
  [TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED]: 'HISTORY',
  [TEXT_AUDIO_COVERAGE_STATUS.MISSING]: 'MISSING'
}[status] || 'MISSING');

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
  playingScope,
  playingIndex,
  displayMode,
  playbackChannelMode,
  playbackPreferences = {},
  playbackOrder = null,
  availableLocalVoices = null,
  onCardPlaybackOrderChange,
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
  onCardDownloadModeChange,
  onSegmentDownloadVoiceChange,
  onSegmentDownloadModeChange,
  onPreviewTts,
  onGenerateCardAudio,
  onGenerateSpeakerAudio,
  onCancelGeneration,
  onExportSegmentAudio,
  onExportCardZip,
  onExportFullCardAudio,
  playbackBusy = false,
  focusTarget = null,
  onFocusConsumed,
  userNavigationRef = null
}) => {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [segmentToolsId, setSegmentToolsId] = useState(null);
  const [paragraphSplitMode, setParagraphSplitMode] = useState(false);
  const [paragraphSentenceDetailsOpen, setParagraphSentenceDetailsOpen] = useState(false);
  const cardRef = useRef(null);
  const segments = block.segments || [];
  const isParagraphCard = block.blockType === 'paragraph';
  const paragraphRole = resolveTextParagraphCardRole(block);
  const paragraphRoleLabel = isParagraphCard ? getTextParagraphCardRoleLabel(paragraphRole) : null;
  const activeSegment = segments.find(segment => segment.id === playingIndex) || null;
  const isActiveCard = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && Boolean(activeSegment) && (isPlaying || isPaused);
  const isFocusCard = focusTarget?.documentId === documentTree?.id && focusTarget?.blockId === block.id;
  const expanded = manualExpanded || isActiveCard || isFocusCard;


  useEffect(() => {
    if (isParagraphCard && segments.length <= 1 && paragraphSplitMode) setParagraphSplitMode(false);
  }, [isParagraphCard, segments.length, paragraphSplitMode]);

  useEffect(() => {
    if (!cardRef.current) return undefined;
    if (isFocusCard) {
      setManualExpanded(true);
      if (isParagraphCard && focusTarget?.segmentId) setParagraphSplitMode(true);
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
  }, [isActiveCard, playingIndex, isFocusCard, isParagraphCard, focusTarget?.segmentId, focusTarget?.nonce, onFocusConsumed, userNavigationRef]);

  const manualSegmentChannelMode = playbackPreferences?.manualSegmentPlaybackChannelMode || playbackChannelMode;
  const manualCardChannelMode = playbackPreferences?.manualCardPlaybackChannelMode || playbackChannelMode;
  const firstSegment = segments[0] || null;
  const collapsedDisplay = resolveStructuredTextDisplayState({ displayMode, isActive: false });
  const cardHasPlayableSegment = segments.some(segment => hasStructuredTextPlayableChannel(segment, manualCardChannelMode));
  const paragraphPlayableSegmentIds = new Set(segments.filter(segment => hasStructuredTextPlayableChannel(segment, manualSegmentChannelMode)).map(segment => segment.id));
  const paragraphPreview = segments.map(segment => collapsedDisplay.showText ? segment.text : segment.meaning).map(value => String(value || '').trim()).filter(Boolean).join(' ');
  const preview = isParagraphCard
    ? (paragraphPreview || (collapsedDisplay.showText ? 'No Text yet.' : 'No Meaning yet.'))
    : (collapsedDisplay.showText ? (firstSegment?.text || 'No segment yet.') : (firstSegment?.meaning || 'No meaning yet.'));
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
            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{block.title || (isParagraphCard && paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'Title Card' : `${blockLabel(block.blockType)} Card`)}</span>
            <span className={`hidden sm:inline-flex text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'}`}>{block.blockType === 'conversation' ? 'CONVERSATION' : paragraphRoleLabel?.toUpperCase()}</span>
            {isActiveCard && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shrink-0">ACTIVE</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[8px] text-slate-400" data-text-card-compact-readiness="true"><span>{segments.length} {isParagraphCard ? 'sentence' : 'segment'}{segments.length === 1 ? '' : 's'}</span><span>•</span><span className="rounded bg-emerald-100 dark:bg-emerald-950/30 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">READY {cardCoverage.covered}/{cardCoverage.total}</span>{cardCoverage.needDownload ? <span className="rounded bg-amber-100 dark:bg-amber-950/30 px-1.5 py-0.5 font-black text-amber-700 dark:text-amber-300">MISSING {cardCoverage.needDownload}</span> : <span className="rounded bg-emerald-100 dark:bg-emerald-950/30 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">COMPLETE</span>}</div>
          {!expanded && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate animate-in fade-in duration-150">{preview}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0" data-text-card-quick-actions="true">
          {isParagraphCard && segments.length > 1 && <button type="button" onClick={() => { setParagraphSplitMode(value => !value); setManualExpanded(true); }} className={`min-h-10 sm:min-h-9 px-2 sm:px-2.5 rounded-lg border text-[8px] sm:text-[9px] font-black transition-all duration-150 active:scale-95 ${paragraphSplitMode ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/35 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`} aria-pressed={paragraphSplitMode} data-text-paragraph-split-toggle="true" title="Toggle sentence split reading mode"><span className="hidden sm:inline">Split </span>{paragraphSplitMode ? 'ON' : 'OFF'}</button>}
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
        {isParagraphCard && segments.length > 0 && <>
          <TextParagraphUnifiedReading
            segments={segments}
            splitMode={paragraphSplitMode}
            displayMode={displayMode}
            activeSegmentId={isActiveCard ? playingIndex : null}
            isPlaybackActive={isActiveCard}
            speakingPart={speakingPart}
            focusSegmentId={isFocusCard ? focusTarget?.segmentId : null}
            audioCoverageMap={audioCoverageMap}
            playableSegmentIds={paragraphPlayableSegmentIds}
            disabled={generationBusy}
            onPlaySegment={onPlaySegment}
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[8px] text-slate-400">Card Play reads the full Paragraph in Segment order. Split Mode only changes the reading surface and sentence click behaviour.</p>
            <button type="button" onClick={() => setParagraphSentenceDetailsOpen(value => !value)} className={`shrink-0 min-h-9 px-2.5 rounded-lg border text-[8px] font-black ${paragraphSentenceDetailsOpen ? 'border-violet-400 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`} aria-expanded={paragraphSentenceDetailsOpen}>{paragraphSentenceDetailsOpen ? 'Hide' : 'Sentence'} Audio</button>
          </div>
        </>}
        {(!isParagraphCard || paragraphSentenceDetailsOpen) && segments.map((segment, segmentIndex) => {
          const active = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && segment.id === playingIndex && (isPlaying || isPaused);
          const display = resolveStructuredTextDisplayState({ displayMode, isActive: active });
          const textSpeaking = active && speakingPart === 'text';
          const meaningSpeaking = active && speakingPart === 'meaning';
          const segmentPlayable = hasStructuredTextPlayableChannel(segment, manualSegmentChannelMode);
          const manualOnlyActive = active && playingScope === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT;
          const textCoverage = segment.text ? (audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, 'text')] || { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING }) : null;
          const meaningCoverage = segment.meaning ? (audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, 'meaning')] || { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING }) : null;
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
                <div className="hidden sm:block mt-0.5 text-[9px] font-black text-slate-400 min-w-[24px]">{isParagraphCard ? `S${segmentIndex + 1}` : segmentIndex + 1}</div>
                <div className="min-w-0 flex-1">
                  {block.blockType === 'conversation' && segment.speaker && <div className="mb-1 flex items-center gap-1.5 flex-wrap" data-text-speaker-voice={segment.speaker}>
                    <p className="text-[9px] font-black uppercase tracking-wide text-sky-600 dark:text-sky-300">{segment.speaker}</p>
                    {speakerVoiceName && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-500 dark:text-sky-300">{compactVoiceLabel(speakerVoiceName)}</span>}
                  </div>}
                  <div className="mb-2 flex flex-wrap items-center gap-1" data-text-segment-audio-availability={segment.id}>
                    {textCoverage && <span className={`rounded-md border px-1.5 py-0.5 text-[7px] font-black ${coverageBadgeClass(textCoverage.status)}`} title={textCoverage.requiredVoiceId || textCoverage.voiceId || ''}>EN • {coverageBadgeLabel(textCoverage.status)}</span>}
                    {meaningCoverage && <span className={`rounded-md border px-1.5 py-0.5 text-[7px] font-black ${coverageBadgeClass(meaningCoverage.status)}`} title={meaningCoverage.requiredVoiceId || meaningCoverage.voiceId || ''}>ID • {coverageBadgeLabel(meaningCoverage.status)}</span>}
                  </div>

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
                          {removable && <button type="button" onClick={() => onRemoveAudioVariant?.(status.variantId || coverage.variantId)} className="min-h-8 px-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[8px] font-black" title="Release staged physical RF (all shared logical slots update together) or remove a manual local variant"><X className="w-3 h-3 inline mr-1"/>Release</button>}
                        </div>
                      </div>;
                    })}
                    {generationBusy && <button type="button" onClick={() => onCancelGeneration?.()} className="md:col-span-2 min-h-9 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[8px] font-black"><Square className="w-3 h-3 inline mr-1 fill-current"/>STOP generation</button>}
                  </div>}
                </div>
                <div className="w-full sm:w-auto flex flex-row flex-wrap gap-1 sm:flex-col sm:shrink-0">
                  <button type="button" disabled={!segmentPlayable || generationBusy} onClick={() => onPlaySegment?.(segment.id)} className={`min-h-9 px-2.5 py-1.5 rounded-lg text-[9px] font-bold disabled:opacity-35 ${manualOnlyActive ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200'}`} title={manualOnlyActive ? 'Stop this Segment-only playback' : 'Play only this segment with Manual Play settings'}>{manualOnlyActive ? <Square className="w-3 h-3 inline mr-1 fill-current"/> : <PlayCircle className="w-3 h-3 inline mr-1"/>}{manualOnlyActive ? 'Stop' : 'Only'}</button>
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
      playbackOrder={playbackOrder}
      availableLocalVoices={availableLocalVoices}
      cardCoverage={cardCoverage}
      audioCoverageMap={audioCoverageMap}
      generationRunning={generationBusy}
      disabled={playbackBusy || generationBusy}
      onClose={() => setAudioPanelOpen(false)}
      onCardVoiceChange={onCardVoiceChange}
      onSegmentVoiceChange={onSegmentVoiceChange}
      onCardDownloadVoiceChange={onCardDownloadVoiceChange}
      onCardDownloadModeChange={onCardDownloadModeChange}
      onSegmentDownloadVoiceChange={onSegmentDownloadVoiceChange}
      onSegmentDownloadModeChange={onSegmentDownloadModeChange}
      onPreviewTts={onPreviewTts}
      onGenerateCardAudio={onGenerateCardAudio}
      onGenerateSpeakerAudio={onGenerateSpeakerAudio}
      onCancelGeneration={onCancelGeneration}
      onCardPlaybackOrderChange={onCardPlaybackOrderChange}
      onExportSegmentAudio={onExportSegmentAudio}
      onExportCardZip={onExportCardZip}
      onExportFullCardAudio={onExportFullCardAudio}
    />, document.body)}
  </>);
};

export const TextStructuredPlayer = ({
  documentTree,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingScope,
  playingIndex,
  displayMode,
  playbackChannelMode,
  playbackRepresentationMode,
  playbackPreferences = {},
  playbackOrder = null,
  availableLocalVoices = null,
  onDisplayModeChange,
  onPlaybackChannelModeChange,
  onPlaybackRepresentationModeChange,
  onGlobalPlaybackOrderChange,
  onGlobalTtsOnlyChange,
  onCardPlaybackOrderChange,
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
  onDocumentVoiceChange,
  onDocumentDownloadVoiceChange,
  onSpeakerVoiceChange,
  onSpeakerDownloadVoiceChange,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onCardDownloadVoiceChange,
  onCardDownloadModeChange,
  onSegmentDownloadVoiceChange,
  onSegmentDownloadModeChange,
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
  onExportFullCardAudio,
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
  const documentVoiceProfile = useMemo(() => getTextStructuredVoiceOverrideProfile(documentTree), [documentTree?.metadata]);
  const documentDownloadProfile = useMemo(() => getTextStructuredAudioDownloadProfile(documentTree), [documentTree?.metadata]);
  const documentModeLabel = documentTree?.documentType === 'conversation' ? 'Conversation' : documentTree?.documentType === 'paragraph' ? 'Paragraph' : 'Conversation • MIX';

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
            {['conversation', 'mixed'].includes(documentTree?.documentType) ? <MessageSquare className="w-4 h-4"/> : <FileText className="w-4 h-4"/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{documentModeLabel} • Global Player settings via bottom bar</p>
            <div className="flex min-w-0 flex-wrap items-center gap-1 text-[8px] text-slate-400" data-text-workspace-compact-readiness="true"><span className="truncate">{blocks.length} cards • {playableList.length}/{playbackList.length} playable{documentTree?.documentType === 'conversation' ? ` • ${conversationSpeakers.length} speakers` : documentTree?.documentType === 'mixed' ? ` • narrator + ${conversationSpeakers.length} speakers` : ' • single narrator'}</span><span className="rounded bg-emerald-100 dark:bg-emerald-950/30 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">READY {documentCoverage?.covered || 0}/{documentCoverage?.total || 0}</span>{documentCoverage?.needDownload ? <span className="rounded bg-amber-100 dark:bg-amber-950/30 px-1.5 py-0.5 font-black text-amber-700 dark:text-amber-300">MISSING {documentCoverage.needDownload}</span> : null}</div>
          </div>
          <button type="button" disabled={!playableList.length || generationBusy} onClick={onPlayDocument} className="min-h-10 sm:min-h-9 px-3 py-2 sm:py-1.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-md active:scale-95" title="Play Workspace"><Play className="w-3 h-3 inline mr-1 fill-current"/>Play</button>
        </div>

        {controlsWorkspaceOpen && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[155] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" data-text-player-workspace="true" onMouseDown={event => { if (event.target === event.currentTarget) onCloseControlsWorkspace?.(); }}>
            <div className="w-full max-w-2xl max-h-[92dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onMouseDown={event => event.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><PlayCircle className="w-4 h-4"/></div>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-800 dark:text-white">Text Player Settings</h2><p className="text-[9px] text-slate-400 truncate">{documentTree?.title || 'Text Workspace'} • order • repeat • delay • resume</p></div>
                <button type="button" onClick={() => onCloseControlsWorkspace?.()} className="min-h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-black text-slate-500 hover:text-red-500"><X className="w-4 h-4 inline mr-1"/>Close</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-3 md:p-4">
                <TextStructuredPlaybackControls
                  documentTree={documentTree}
                  preferences={playbackPreferences}
                  playbackRepresentationMode={playbackRepresentationMode}
                  playbackOrder={playbackOrder}
                  availableLocalVoices={availableLocalVoices}
                  disabled={controlsBusy}
                  onDisplayModeChange={onDisplayModeChange}
                  onPlaybackChannelModeChange={onPlaybackChannelModeChange}
                  onPlaybackRepresentationModeChange={onPlaybackRepresentationModeChange}
                  onGlobalPlaybackOrderChange={onGlobalPlaybackOrderChange}
                  onGlobalTtsOnlyChange={onGlobalTtsOnlyChange}
                  onPlaybackFeelChange={onPlaybackFeelChange}
                />
              </div>
            </div>
          </div>, document.body)}
      </div>

      <div className="space-y-3 animate-in fade-in duration-200">
        {blocks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-sm text-slate-400">Workspace belum memiliki Card. Buka DATA → CREATE untuk membuat Card pertama.</div>}
        {blocks.map((block, index) => <StructuredPlayerCard
          key={block.id}
          block={block}
          index={index}
          isPlaying={isPlaying}
          isPaused={isPaused}
          speakingPart={speakingPart}
          playingContext={playingContext}
          playingScope={playingScope}
          playingIndex={playingIndex}
          displayMode={displayMode}
          playbackChannelMode={playbackChannelMode}
          playbackPreferences={playbackPreferences}
          playbackOrder={playbackOrder}
          availableLocalVoices={availableLocalVoices}
          onCardPlaybackOrderChange={onCardPlaybackOrderChange}
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
          onCardDownloadModeChange={onCardDownloadModeChange}
          onSegmentDownloadVoiceChange={onSegmentDownloadVoiceChange}
          onSegmentDownloadModeChange={onSegmentDownloadModeChange}
          onPreviewTts={onPreviewTts}
          onGenerateCardAudio={onGenerateCardAudio}
          onGenerateSpeakerAudio={onGenerateSpeakerAudio}
          onCancelGeneration={onCancelGeneration}
          onExportSegmentAudio={onExportSegmentAudio}
          onExportCardZip={onExportCardZip}
          onExportFullCardAudio={onExportFullCardAudio}
          focusTarget={focusTarget}
          onFocusConsumed={onFocusConsumed}
          userNavigationRef={userNavigationRef}
        />)}
      </div>
    </section>
  );
};

export default TextStructuredPlayer;
