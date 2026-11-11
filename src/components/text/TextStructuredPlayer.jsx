import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, FileDown, FileText, MessageSquare, Play, PlayCircle, SkipForward, SlidersHorizontal, Square, Upload, Volume2, Wand2, X } from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  getStructuredTextDisplayModeLabel,
  getStructuredTextOrderModeLabel,
  getStructuredTextPlaybackModeLabel,
  getStructuredTextRepeatModeLabel,
  hasStructuredTextPlayableChannel,
  resolveTextStructuredManualPlaybackProfile,
  resolveStructuredTextDisplayState
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioCoverage, TEXT_AUDIO_COVERAGE_STATUS } from '../../domain/text/textStructuredAudioCoverageDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { TextStructuredCardAudioPanel } from './TextStructuredCardAudioPanel.jsx';
import { collectTextStructuredConversationSpeakers } from '../../domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import TextStructuredPlaybackControls from './TextStructuredPlaybackControls.jsx';
import { TEXT_PARAGRAPH_CARD_ROLES, getTextParagraphCardRoleLabel, resolveTextParagraphCardRole } from '../../domain/text/textParagraphRoleDomain.js';
import TextParagraphUnifiedReading from './TextParagraphUnifiedReading.jsx';
import { TEXT_CARD_EXPANSION_MODES, normalizeTextCardExpansionMode, resolveActiveTextCardId, resolveExpandedTextCardIds, toggleTextCardExpandedId } from '../../domain/text/textStructuredCardExpansionDomain.js';

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

const StructuredPlayerCard = ({
  block,
  index,
  isPlaying,
  isPaused,
  speakingPart,
  playingContext,
  playingScope,
  playingIndex,
  isActiveCard = false,
  isExpanded = false,
  isFullRepresentation = false,
  onToggleCardExpanded,
  onEnsureCardExpanded,
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
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [segmentToolsId, setSegmentToolsId] = useState(null);
  const [paragraphSentenceDetailsOpen, setParagraphSentenceDetailsOpen] = useState(false);
  const cardRef = useRef(null);
  const segments = block.segments || [];
  const isParagraphCard = block.blockType === 'paragraph';
  const paragraphRole = resolveTextParagraphCardRole(block);
  const paragraphRoleLabel = isParagraphCard ? getTextParagraphCardRoleLabel(paragraphRole) : null;
  const isFocusCard = focusTarget?.documentId === documentTree?.id && focusTarget?.blockId === block.id;
  const expanded = isExpanded || isFocusCard;


  useEffect(() => {
    if (!cardRef.current) return undefined;
    if (isFocusCard) {
      onEnsureCardExpanded?.(block.id);
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
  }, [isActiveCard, playingIndex, isFocusCard, isParagraphCard, focusTarget?.segmentId, focusTarget?.nonce, onFocusConsumed, onEnsureCardExpanded, block.id, userNavigationRef]);

  const manualSegmentChannelMode = resolveTextStructuredManualPlaybackProfile(playbackPreferences, 'segment').playbackChannelMode;
  const manualCardChannelMode = resolveTextStructuredManualPlaybackProfile(playbackPreferences, 'card').playbackChannelMode;
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

  const activeSegmentIndex = useMemo(
    () => (isActiveCard && playingIndex ? segments.findIndex(item => item.id === playingIndex) : -1),
    [isActiveCard, playingIndex, segments]
  );
  const isCardSpeaking = Boolean(isActiveCard && playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused));
  const activeChannelBadgeLabel = speakingPart === 'meaning' ? 'ID' : speakingPart === 'text' ? 'EN' : null;

  return (<>
    <article ref={cardRef} className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-px hover:shadow-md ${isActiveCard ? (speakingPart === 'meaning' ? 'border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20 dark:ring-emerald-400/25 shadow-emerald-100/50 dark:shadow-none' : 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/20 dark:ring-indigo-400/25 shadow-indigo-100/50 dark:shadow-none') : isFocusCard ? 'border-amber-400 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-950/40' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`} data-text-player-card={block.id} data-text-search-focus-card={isFocusCard ? 'true' : undefined}>
      <div className={`flex items-start gap-2 p-2.5 sm:gap-2.5 sm:p-3.5 transition-colors ${isActiveCard ? (speakingPart === 'meaning' ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50' : 'bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50') : 'bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80'}`}>
        <button type="button" onClick={() => onToggleCardExpanded?.(block.id)} aria-expanded={expanded} className="w-9 h-9 shrink-0 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-all duration-150 active:scale-95 flex items-center justify-center" aria-label={expanded ? 'Collapse card' : 'Expand card'} title={expanded ? 'Collapse card' : 'Expand card'}>
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ease-out ${expanded ? 'rotate-90 text-indigo-600 dark:text-indigo-400' : ''}`}/>
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center justify-center rounded-md bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-slate-600 dark:text-slate-300 shrink-0">#{index + 1}</span>
            <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-white truncate">{block.title || (isParagraphCard && paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'Title Card' : `${blockLabel(block.blockType)} Card`)}</span>
            <span className={`inline-flex text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${block.blockType === 'conversation' ? 'bg-sky-100 dark:bg-sky-900/35 text-sky-700 dark:text-sky-300' : paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE ? 'bg-fuchsia-100 dark:bg-fuchsia-900/35 text-fuchsia-700 dark:text-fuchsia-300' : 'bg-violet-100 dark:bg-violet-900/35 text-violet-700 dark:text-violet-300'}`}>{block.blockType === 'conversation' ? 'CONVERSATION' : paragraphRoleLabel?.toUpperCase()}</span>
            {isActiveCard && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-200 shrink-0">ACTIVE</span>
            )}
            {isCardSpeaking && (
              <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-sm ${
                isPaused
                  ? 'bg-amber-500 text-white'
                  : speakingPart === 'meaning'
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : 'bg-indigo-600 text-white animate-pulse'
              }`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                {isPaused
                  ? `PAUSED${activeChannelBadgeLabel ? ` • ${activeChannelBadgeLabel}` : ''}`
                  : `PLAYING ${activeChannelBadgeLabel || 'AUDIO'} • ${isFullRepresentation ? 'FULL' : activeSegmentIndex >= 0 ? `S${activeSegmentIndex + 1}` : 'SPLIT'}`}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400" data-text-card-compact-readiness="true">
            <span className="font-semibold">{segments.length} {isParagraphCard ? 'sentence' : 'segment'}{segments.length === 1 ? '' : 's'}</span>
            <span>•</span>
            <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">READY {cardCoverage.covered}/{cardCoverage.total}</span>
            {cardCoverage.needDownload ? (
              <span className="rounded-md bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 font-black text-amber-700 dark:text-amber-300">MISSING {cardCoverage.needDownload}</span>
            ) : (
              <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">COMPLETE</span>
            )}
            {cardCoverage.stale > 0 && (
              <span className="rounded-md bg-rose-100 dark:bg-rose-950/40 px-1.5 py-0.5 font-black text-rose-700 dark:text-rose-300">STALE {cardCoverage.stale}</span>
            )}
          </div>
          {!expanded && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 animate-in fade-in duration-150">{preview}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" data-text-card-quick-actions="true">
          <button type="button" disabled={playbackBusy} onClick={() => setAudioPanelOpen(true)} className="w-9 h-9 sm:w-auto sm:h-9 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-300 text-[10px] font-black disabled:opacity-35 transition-all duration-150 hover:shadow-sm active:scale-95 flex items-center justify-center" title="Card audio & voice overrides" aria-label="Open card audio controls">
            <SlidersHorizontal className="w-3.5 h-3.5 sm:mr-1.5"/><span className="hidden sm:inline">Audio</span>
          </button>
          <button type="button" disabled={!cardHasPlayableSegment || generationBusy} onClick={() => onPlayCard?.(block.id)} className={`w-9 h-9 shrink-0 rounded-full border transition-all active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-35 ${isCardSpeaking ? 'border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-800' : 'border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500'}`} title="Play entire card with Manual Card settings" aria-label="Play this card" data-text-card-play-compact="true">
            <Play className="w-3.5 h-3.5 fill-current ml-0.5"/>
          </button>
        </div>
      </div>

      {expanded && <div className="p-3 sm:p-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
        {segments.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-400">No segments in this card.</div>}
        {isParagraphCard && segments.length > 0 && <>
          <TextParagraphUnifiedReading
            segments={segments}
            splitMode={!isFullRepresentation}
            displayMode={displayMode}
            activeSegmentId={isActiveCard && !isFullRepresentation ? playingIndex : null}
            isPlaybackActive={isActiveCard}
            fullCardActive={isActiveCard && isFullRepresentation}
            speakingPart={speakingPart}
            focusSegmentId={isFocusCard ? focusTarget?.segmentId : null}
            audioCoverageMap={audioCoverageMap}
            playableSegmentIds={paragraphPlayableSegmentIds}
            disabled={generationBusy}
            onPlaySegment={onPlaySegment}
            onPlayChannel={channel => onPlayCard?.(block.id, { playbackChannelMode: channel === 'meaning' ? TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY : TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {!isFullRepresentation ? 'Split mode: tap any sentence above to play it, or use TEXT / MEANING buttons for full-card channel playback.' : 'Full mode: plays uninterrupted card audio. Switch to Split in bottom bar to tap individual sentences.'}
            </p>
            <button type="button" onClick={() => setParagraphSentenceDetailsOpen(value => !value)} className={`shrink-0 min-h-8 px-2.5 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${paragraphSentenceDetailsOpen ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:border-slate-300'}`} aria-expanded={paragraphSentenceDetailsOpen}>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${paragraphSentenceDetailsOpen ? 'rotate-180' : ''}`} />
              {paragraphSentenceDetailsOpen ? 'Hide Sentence List' : `Sentence List (${segments.length})`}
            </button>
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
            <div key={segment.id} className={`rounded-xl border p-3 transition-all duration-200 ease-out ${active ? (meaningSpeaking ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/25 shadow-sm ring-1 ring-emerald-500/20' : 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-600 dark:bg-indigo-950/25 shadow-sm ring-1 ring-indigo-500/20') : (isFocusCard && focusTarget?.segmentId === segment.id) ? 'border-amber-400 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-900' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-player-segment={segment.id} data-text-player-segment-active={active ? 'true' : undefined} data-text-search-focus-segment={isFocusCard && focusTarget?.segmentId === segment.id ? 'true' : undefined}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      disabled={!segmentPlayable || generationBusy}
                      onClick={() => onPlaySegment?.(segment.id)}
                      className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center transition-all shadow-sm disabled:opacity-35 ${
                        manualOnlyActive
                          ? 'bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-800'
                          : active
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-800'
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-600 hover:text-white'
                      }`}
                      title={manualOnlyActive ? 'Stop this sentence playback' : 'Play only this sentence (Manual Play settings)'}
                      aria-label={manualOnlyActive ? `Stop sentence ${segmentIndex + 1}` : `Play sentence ${segmentIndex + 1} only`}
                    >
                      {manualOnlyActive ? <Square className="w-3 h-3 fill-current"/> : <Play className="w-3.5 h-3.5 fill-current ml-0.5"/>}
                    </button>
                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 px-1">
                      {isParagraphCard ? `S${segmentIndex + 1}` : `#${segmentIndex + 1}`}
                    </span>
                    {block.blockType === 'conversation' && segment.speaker && (
                      <div className="flex items-center gap-1.5 flex-wrap" data-text-speaker-voice={segment.speaker}>
                        <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">{segment.speaker}</span>
                        {speakerVoiceName && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{compactVoiceLabel(speakerVoiceName)}</span>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1" data-text-segment-audio-availability={segment.id}>
                      {textCoverage && <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black ${coverageBadgeClass(textCoverage.status)}`} title={textCoverage.requiredVoiceId || textCoverage.voiceId || ''}>EN • {coverageBadgeLabel(textCoverage.status)}</span>}
                      {meaningCoverage && <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black ${coverageBadgeClass(meaningCoverage.status)}`} title={meaningCoverage.requiredVoiceId || meaningCoverage.voiceId || ''}>ID • {coverageBadgeLabel(meaningCoverage.status)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" disabled={generationBusy} onClick={() => onStartFromSegment?.(segment.id)} className="min-h-8 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 text-[10px] font-bold inline-flex items-center gap-1 transition-colors" title="Start playback from this sentence and continue through workspace">
                      <SkipForward className="w-3 h-3"/><span>From here</span>
                    </button>
                    <button type="button" onClick={() => setSegmentToolsId(current => current === segment.id ? null : segment.id)} className={`min-h-8 px-2.5 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${segmentToolsId === segment.id ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-slate-300'}`} aria-expanded={segmentToolsId === segment.id} title="Sentence audio tools & single MP3 export">
                      <Volume2 className="w-3 h-3"/><span>Audio</span>
                    </button>
                  </div>
                </div>

                {display.showText && <div className={`rounded-lg transition ${textSpeaking ? 'bg-indigo-100/80 dark:bg-indigo-900/35 px-3 py-2 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'px-1 py-0.5'}`} data-text-channel="text">
                  {textSpeaking && <p className="text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-0.5">Playing EN (Text)</p>}
                  <p className="text-sm sm:text-[15px] leading-relaxed font-semibold text-slate-800 dark:text-slate-100">{segment.text || <span className="italic text-slate-400">No Text</span>}</p>
                </div>}

                {display.showMeaning && <div className={`rounded-lg px-3 py-2 transition ${meaningSpeaking ? 'bg-emerald-100/80 dark:bg-emerald-900/35 ring-1 ring-emerald-300 dark:ring-emerald-700' : 'bg-slate-50 dark:bg-slate-800/70'}`} data-text-channel="meaning">
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-0.5 ${meaningSpeaking ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>{meaningSpeaking ? 'Playing ID (Meaning)' : 'Meaning (ID)'}</p>
                  <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">{segment.meaning || <span className="italic text-slate-400">No Meaning</span>}</p>
                </div>}

                {segmentToolsId === segment.id && <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/70 p-2.5 animate-in fade-in duration-150 md:grid-cols-2" data-text-audio-runtime-controls={segment.id}>
                  {['text', 'meaning'].map(channel => {
                    const key = buildTextStructuredRuntimeAudioKey(segment.id, channel);
                    const status = audioRuntimeStatusMap?.[key] || { available: false };
                    const coverage = audioCoverageMap?.[key] || { status: 'missing' };
                    const label = channel === 'meaning' ? 'ID (Meaning)' : 'EN (Text)';
                    const hasContent = channel === 'meaning' ? Boolean(segment.meaning) : Boolean(segment.text);
                    const ready = coverage.status === 'ready';
                    const removable = Boolean(status.variantId) && (coverage.sourceType === 'staging' || status.source === 'file');
                    return <div key={channel} className={`rounded-lg border p-2.5 ${ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25' : 'border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{label}</span>
                        <span className={`ml-auto rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${ready ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}>{coverage.status || 'missing'}</span>
                      </div>
                      <p className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400" title={coverage.requiredVoiceId || status.downloadVoiceId || ''}>Voice: {coverage.requiredVoiceId || status.downloadVoiceId || 'Default Edge voice'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button type="button" disabled={generationBusy || !hasContent} onClick={() => onGenerateAudio?.(segment.id, channel)} className="min-h-8 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-black disabled:opacity-35 transition-colors"><Wand2 className="w-3 h-3 inline mr-1"/>{ready ? 'Regenerate' : 'Generate'}</button>
                        <button type="button" disabled={!ready} onClick={() => onExportSegmentAudio?.(segment.id, channel)} className="min-h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 text-[9px] font-black disabled:opacity-35"><FileDown className="w-3 h-3 inline mr-1"/>Export MP3</button>
                        <label className="min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center cursor-pointer text-[9px] font-black text-slate-600 dark:text-slate-300 hover:border-indigo-300"><Upload className="w-3 h-3 mr-1"/>Attach File<input type="file" accept="audio/*,.mp3,.wav,.ogg,.webm" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttachAudioFile?.(segment.id, channel, file); event.target.value = ''; }}/></label>
                        {removable && <button type="button" onClick={() => onRemoveAudioVariant?.(status.variantId || coverage.variantId)} className="min-h-8 px-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[9px] font-black" title="Release staged physical RF (all shared logical slots update together) or remove a manual local variant"><X className="w-3 h-3 inline mr-1"/>Release</button>}
                      </div>
                    </div>;
                  })}
                  {generationBusy && <button type="button" onClick={() => onCancelGeneration?.()} className="md:col-span-2 min-h-9 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-[9px] font-black"><Square className="w-3 h-3 inline mr-1 fill-current"/>STOP generation</button>}
                </div>}
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
  activeCursorSegmentId = null,
  activeSessionRepresentationMode = null,
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
  onCloseControlsWorkspace,
  onStopPlayback
}) => {
  const [customExpandedIds, setCustomExpandedIds] = useState(() => new Set());
  const [lastActiveBlockId, setLastActiveBlockId] = useState(null);
  const lastProcessedActiveBlockIdRef = useRef(null);
  const playerRef = useRef(null);
  const userNavigationRef = useRef(0);
  const blocks = documentTree?.blocks || [];
  const playbackList = useMemo(() => resolveStructuredTextPlaybackList(documentTree), [documentTree]);
  const playableList = useMemo(() => playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode)), [playbackList, playbackChannelMode]);
  const structuredSessionActive = playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT && (isPlaying || isPaused);
  const expansionMode = normalizeTextCardExpansionMode(playbackPreferences.cardExpansionMode);
  // Manual Segment playback is Split even when the global preference is Full.
  // Use the real running session's representation to keep sentence highlights intact.
  const effectiveRepresentationMode = structuredSessionActive && activeSessionRepresentationMode ? activeSessionRepresentationMode : playbackRepresentationMode;
  const activeBlockId = resolveActiveTextCardId({ blocks, playingIndex, activeCursorSegmentId, playbackRepresentationMode: effectiveRepresentationMode, isSessionActive: structuredSessionActive });
  const activeCardNumber = useMemo(() => (activeBlockId ? blocks.findIndex(item => item.id === activeBlockId) + 1 : 0), [blocks, activeBlockId]);
  const expandedCardIds = useMemo(() => resolveExpandedTextCardIds({ mode: expansionMode, blocks, activeBlockId, lastActiveBlockId, customExpandedIds }), [expansionMode, blocks, activeBlockId, lastActiveBlockId, customExpandedIds]);
  const generationBusy = Boolean(generationState?.running);
  const controlsBusy = structuredSessionActive || generationBusy;
  const conversationSpeakers = useMemo(() => collectTextStructuredConversationSpeakers(documentTree), [documentTree]);
  const documentModeLabel = documentTree?.documentType === 'conversation' ? 'Conversation' : documentTree?.documentType === 'paragraph' ? 'Paragraph' : 'Conversation • MIX';
  const isGlobalTtsOnly = playbackPreferences?.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY;

  useEffect(() => {
    lastProcessedActiveBlockIdRef.current = null;
    setLastActiveBlockId(null);
    setCustomExpandedIds(new Set());
  }, [documentTree?.id]);

  useEffect(() => {
    if (!activeBlockId) {
      lastProcessedActiveBlockIdRef.current = null;
      return;
    }
    // A mode change alone must not reopen a Card the user has just closed.
    if (lastProcessedActiveBlockIdRef.current === activeBlockId) return;
    lastProcessedActiveBlockIdRef.current = activeBlockId;
    setLastActiveBlockId(activeBlockId);
    if (expansionMode === TEXT_CARD_EXPANSION_MODES.CUSTOM) {
      setCustomExpandedIds(previous => previous.has(activeBlockId) ? previous : new Set([...previous, activeBlockId]));
    }
  }, [activeBlockId, expansionMode]);

  const onChangeCardExpansionMode = useCallback((nextMode) => {
    const normalized = normalizeTextCardExpansionMode(nextMode);
    if (normalized === TEXT_CARD_EXPANSION_MODES.CUSTOM && expansionMode !== TEXT_CARD_EXPANSION_MODES.CUSTOM) {
      setCustomExpandedIds(new Set(expandedCardIds));
    }
    onPlaybackFeelChange?.({ cardExpansionMode: normalized });
  }, [expansionMode, expandedCardIds, onPlaybackFeelChange]);

  const onToggleCardExpanded = useCallback((blockId) => {
    // Manual control takes precedence over auto-follow; preserve every currently open card.
    setCustomExpandedIds(toggleTextCardExpandedId(expandedCardIds, blockId));
    if (expansionMode !== TEXT_CARD_EXPANSION_MODES.CUSTOM) onPlaybackFeelChange?.({ cardExpansionMode: TEXT_CARD_EXPANSION_MODES.CUSTOM });
  }, [expandedCardIds, expansionMode, onPlaybackFeelChange]);

  const onEnsureCardExpanded = useCallback((blockId) => {
    if (expandedCardIds.has(blockId)) return;
    setCustomExpandedIds(new Set([...expandedCardIds, blockId]));
    if (expansionMode !== TEXT_CARD_EXPANSION_MODES.CUSTOM) onPlaybackFeelChange?.({ cardExpansionMode: TEXT_CARD_EXPANSION_MODES.CUSTOM });
  }, [expandedCardIds, expansionMode, onPlaybackFeelChange]);

  useEffect(() => {
    if (!playerRef.current || focusTarget?.documentId !== documentTree?.id || focusTarget?.blockId) return undefined;
    playerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1000);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.documentId, focusTarget?.blockId, focusTarget?.nonce, documentTree?.id, onFocusConsumed]);

  return (
    <section ref={playerRef} onWheel={() => { userNavigationRef.current = Date.now(); }} onTouchStart={() => { userNavigationRef.current = Date.now(); }} onPointerDown={() => { userNavigationRef.current = Date.now(); }} className="h-full overflow-y-auto overscroll-contain pb-32 md:pb-4 scroll-smooth custom-scrollbar" data-text-structured-player="true" data-text-segment-auto-follow="true" data-text-auto-follow-user-grace-ms="1800">
      <div className="mb-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/70 bg-white/95 dark:bg-slate-800/95 shadow-sm transition-all duration-200 ease-out motion-reduce:transition-none" data-text-compact-toolbar="true">
        <div className="flex flex-wrap items-center gap-2.5 p-2.5 sm:p-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
            {['conversation', 'mixed'].includes(documentTree?.documentType) ? <MessageSquare className="w-4 h-4"/> : <FileText className="w-4 h-4"/>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">{documentModeLabel}</p>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${effectiveRepresentationMode === 'full' ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'}`}>
                {effectiveRepresentationMode === 'full' ? 'FULL • Card' : 'SPLIT • Sentence'}
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-200">
                Lang: {getStructuredTextPlaybackModeLabel(playbackChannelMode)}
              </span>
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${isGlobalTtsOnly ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
                {isGlobalTtsOnly ? 'TTS ONLY' : 'LOCAL FIRST'}
              </span>
              {structuredSessionActive && activeCardNumber > 0 && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-sm ${
                  isPaused ? 'bg-amber-500' : speakingPart === 'meaning' ? 'bg-emerald-600 animate-pulse' : 'bg-indigo-600 animate-pulse'
                }`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  Card #{activeCardNumber} • {isPaused ? 'Paused' : speakingPart === 'meaning' ? 'Playing ID' : 'Playing EN'}
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400" data-text-workspace-compact-readiness="true">
              <span className="truncate font-medium">{blocks.length} cards • {playableList.length}/{playbackList.length} playable{documentTree?.documentType === 'conversation' ? ` • ${conversationSpeakers.length} speakers` : documentTree?.documentType === 'mixed' ? ` • narrator + ${conversationSpeakers.length} speakers` : ' • single narrator'}</span>
              <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 font-black text-emerald-700 dark:text-emerald-300">READY {documentCoverage?.covered || 0}/{documentCoverage?.total || 0}</span>
              {documentCoverage?.needDownload ? <span className="rounded-md bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 font-black text-amber-700 dark:text-amber-300">MISSING {documentCoverage.needDownload}</span> : null}
              {documentCoverage?.stale ? <span className="rounded-md bg-rose-100 dark:bg-rose-950/40 px-1.5 py-0.5 font-black text-rose-700 dark:text-rose-300">STALE {documentCoverage.stale}</span> : null}
            </div>
          </div>
          <button type="button" disabled={!playableList.length || generationBusy} onClick={onPlayDocument} className="min-h-10 sm:min-h-9 px-3.5 py-2 sm:py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black disabled:opacity-35 transition-all duration-150 shadow-sm hover:shadow-md active:scale-95 inline-flex items-center gap-1.5 shrink-0" title="Play Workspace from start"><Play className="w-3.5 h-3.5 fill-current"/>Play All</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100/80 dark:border-indigo-900/60 bg-slate-50/60 dark:bg-slate-900/40 px-2.5 sm:px-3 py-2 rounded-b-2xl" data-text-card-expansion-toolbar="true">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Cards:</span>
            {[
              [TEXT_CARD_EXPANSION_MODES.FOLLOW, 'Follow Playback'],
              [TEXT_CARD_EXPANSION_MODES.ALL, 'Expand All'],
              [TEXT_CARD_EXPANSION_MODES.CUSTOM, 'Custom']
            ].map(([mode, label]) => <button key={mode} type="button" onClick={() => onChangeCardExpansionMode(mode)} aria-pressed={expansionMode === mode} className={`min-h-9 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all ${expansionMode === mode ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm dark:border-indigo-500 dark:bg-indigo-600 dark:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`} data-text-card-expansion-mode={mode}>{label}</button>)}
          </div>
          <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span>{getStructuredTextOrderModeLabel(playbackPreferences?.playbackOrderMode)} • {getStructuredTextRepeatModeLabel(playbackPreferences?.repeatMode)} • View: {getStructuredTextDisplayModeLabel(displayMode)}</span>
          </div>
        </div>

        {controlsWorkspaceOpen && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[155] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" data-text-player-workspace="true" onMouseDown={event => { if (event.target === event.currentTarget) onCloseControlsWorkspace?.(); }}>
            <div className="w-full max-w-2xl max-h-[92dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onMouseDown={event => event.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><PlayCircle className="w-4 h-4"/></div>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-800 dark:text-white">Text Player Settings</h2><p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{documentTree?.title || 'Text Workspace'} • Global Playback • Manual Play • Display</p></div>
                {structuredSessionActive && <button type="button" onClick={() => onStopPlayback?.()} className="min-h-10 shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 text-[10px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200" title="Stop playback so settings can be edited" data-text-settings-stop-playback="true"><Square className="inline h-3 w-3 mr-1 fill-current"/>Stop audio</button>}
                <button type="button" onClick={() => onCloseControlsWorkspace?.()} className="min-h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 hover:text-red-500 transition-colors"><X className="w-4 h-4 inline mr-1"/>Close</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-3.5 md:p-5">
                {controlsBusy && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="status" data-text-settings-busy-reason="true">{generationBusy ? 'Audio generation is running; settings are temporarily locked until it finishes.' : 'Audio is playing. Tap Stop audio above to unlock the settings.'}</p>}
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
          isActiveCard={activeBlockId === block.id}
          isExpanded={expandedCardIds.has(block.id)}
          isFullRepresentation={effectiveRepresentationMode === 'full'}
          onToggleCardExpanded={onToggleCardExpanded}
          onEnsureCardExpanded={onEnsureCardExpanded}
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
