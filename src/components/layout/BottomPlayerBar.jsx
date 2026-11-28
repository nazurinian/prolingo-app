import React, { useEffect, useId, useReducer, useRef, useState } from 'react';
import {
  AlignLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Headphones,
  Layers,
  List,
  Loader2,
  MessagesSquare,
  Pause,
  Play,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Table2
} from 'lucide-react';
import { presentGlobalPlayer } from '../../domain/playback/globalPlayerPresentationDomain.js';
import {
  SHARED_CONTROL_TOKENS,
  SHARED_SEMANTIC_COLORS,
  resolveGlobalPlayerSemanticTone
} from '../text/presentation/sharedDesignTokens.js';
import {
  OVERLAY_SOURCES,
  announcePresentationOverlayOpen,
  subscribeOtherPresentationOverlayOpen
} from '../text/presentation/sharedOverlayCoordinator.js';
import { usePresentationOverlayFocus } from '../text/presentation/usePresentationOverlayFocus.js';

const mediaEvents = ['timeupdate', 'durationchange', 'loadedmetadata', 'ratechange'];

const repeatLabels = { once: 'Once', sequence: 'Sequence', repeat_2x: 'Repeat twice', loop_one: 'Loop one', random: 'Random' };
const repeatIcons = { sequence: List, loop_one: Repeat1, random: Shuffle };
const languages = { 'text-only': 'EN', 'meaning-only': 'ID', 'text-meaning': 'EN → ID', 'meaning-text': 'ID → EN' };
const idle = { transport: { phase: 'idle', navKind: 'item', canNavigate: true } };

const formatTime = seconds => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const resolveDomainIdentity = ({ domain, cardKind, phase }) => {
  if (domain === 'structured-text') {
    if (cardKind === 'paragraph') {
      return {
        label: 'Paragraph',
        Icon: FileText,
        boxClass: `${SHARED_SEMANTIC_COLORS.paragraph.bgSoft} ${SHARED_SEMANTIC_COLORS.paragraph.border} ${SHARED_SEMANTIC_COLORS.paragraph.text}`,
        badgeClass: SHARED_SEMANTIC_COLORS.paragraph.badge
      };
    }
    if (cardKind === 'conversation') {
      return {
        label: 'Conversation',
        Icon: MessagesSquare,
        boxClass: `${SHARED_SEMANTIC_COLORS.conversation.bgSoft} ${SHARED_SEMANTIC_COLORS.conversation.border} ${SHARED_SEMANTIC_COLORS.conversation.text}`,
        badgeClass: SHARED_SEMANTIC_COLORS.conversation.badge
      };
    }
    return {
      label: 'Structured Text',
      Icon: BookOpen,
      boxClass: `${SHARED_SEMANTIC_COLORS.conversation.bgSoft} ${SHARED_SEMANTIC_COLORS.conversation.border} ${SHARED_SEMANTIC_COLORS.conversation.text}`,
      badgeClass: SHARED_SEMANTIC_COLORS.conversation.badge
    };
  }
  if (domain === 'table') {
    return {
      label: 'Table',
      Icon: Table2,
      boxClass: 'bg-sky-50/90 dark:bg-sky-950/45 border-sky-200/90 dark:border-sky-800/80 text-sky-700 dark:text-sky-300',
      badgeClass: 'bg-sky-100/90 text-sky-800 dark:bg-sky-950/75 dark:text-sky-200'
    };
  }
  if (domain === 'legacy-text') {
    return {
      label: 'Legacy Text',
      Icon: AlignLeft,
      boxClass: 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-300',
      badgeClass: 'bg-slate-200/80 text-slate-700 dark:bg-slate-700/80 dark:text-slate-200'
    };
  }
  return {
    label: phase === 'idle' ? 'Ready' : 'Audio',
    Icon: Headphones,
    boxClass: 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 text-slate-500 dark:text-slate-400',
    badgeClass: SHARED_SEMANTIC_COLORS.manual.badge
  };
};

const resolvePlayerAccentClasses = ({ phase, channel }) => {
  if (phase === 'paused') {
    return {
      topBorder: 'border-t-2 border-t-amber-500/90 dark:border-t-amber-400/85',
      playButton: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
      statusPill: `${SHARED_SEMANTIC_COLORS.paused.bgSoft} ${SHARED_SEMANTIC_COLORS.paused.border} ${SHARED_SEMANTIC_COLORS.paused.text}`,
      dot: SHARED_SEMANTIC_COLORS.paused.dot,
      progressFill: 'bg-amber-500 dark:bg-amber-400',
      cardSurface: `${SHARED_SEMANTIC_COLORS.paused.bgSoft} ${SHARED_SEMANTIC_COLORS.paused.border}`
    };
  }
  if (phase === 'playing' || phase === 'waiting') {
    if (channel === 'meaning') {
      return {
        topBorder: 'border-t-2 border-t-violet-500/85 dark:border-t-violet-400/80',
        playButton: 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm',
        statusPill: `${SHARED_SEMANTIC_COLORS.id.bgSoft} ${SHARED_SEMANTIC_COLORS.id.border} ${SHARED_SEMANTIC_COLORS.id.text}`,
        dot: SHARED_SEMANTIC_COLORS.id.dot,
        progressFill: 'bg-violet-600 dark:bg-violet-400',
        cardSurface: `${SHARED_SEMANTIC_COLORS.id.bgSoft} ${SHARED_SEMANTIC_COLORS.id.border}`
      };
    }
    if (channel === 'text') {
      return {
        topBorder: 'border-t-2 border-t-blue-500/85 dark:border-t-blue-400/80',
        playButton: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
        statusPill: `${SHARED_SEMANTIC_COLORS.en.bgSoft} ${SHARED_SEMANTIC_COLORS.en.border} ${SHARED_SEMANTIC_COLORS.en.text}`,
        dot: SHARED_SEMANTIC_COLORS.en.dot,
        progressFill: 'bg-blue-600 dark:bg-blue-400',
        cardSurface: `${SHARED_SEMANTIC_COLORS.en.bgSoft} ${SHARED_SEMANTIC_COLORS.en.border}`
      };
    }
    return {
      topBorder: 'border-t-2 border-t-indigo-500/85 dark:border-t-indigo-400/80',
      playButton: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
      statusPill: `${SHARED_SEMANTIC_COLORS.conversation.bgSoft} ${SHARED_SEMANTIC_COLORS.conversation.border} ${SHARED_SEMANTIC_COLORS.conversation.text}`,
      dot: 'bg-indigo-600 dark:bg-indigo-400',
      progressFill: 'bg-indigo-600 dark:bg-indigo-400',
      cardSurface: `${SHARED_SEMANTIC_COLORS.conversation.bgSoft} ${SHARED_SEMANTIC_COLORS.conversation.border}`
    };
  }
  return {
    topBorder: 'border-t border-slate-200/95 dark:border-slate-800',
    playButton: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
    statusPill: 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400 dark:bg-slate-500',
    progressFill: 'bg-indigo-600 dark:bg-indigo-400',
    cardSurface: 'bg-slate-50/85 dark:bg-slate-800/45 border-slate-200/80 dark:border-slate-800'
  };
};

const PlayerTimeline = ({ timeline, progressFill, reserveSlot, phase, source }) => {
  if (!timeline && !reserveSlot) return null;
  const { elapsedSeconds, durationSeconds } = timeline ?? {};
  const hasElapsed = elapsedSeconds != null;
  const pct = hasElapsed && durationSeconds > 0
    ? Math.max(0, Math.min(100, (elapsedSeconds / durationSeconds) * 100))
    : 0;

  return (
    <div
      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 px-3 py-2 space-y-1.5"
      data-player-timeline={timeline ? '' : undefined}
      data-player-timeline-slot={reserveSlot ? '' : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Media timeline
        </span>
        {timeline ? <span>
          {hasElapsed ? `${formatTime(elapsedSeconds)} / ${formatTime(durationSeconds)}` : `Duration ${formatTime(durationSeconds)}`}
        </span> : <span>{phase === 'waiting' ? 'Waiting for audio' : source === 'TTS' ? 'Timing unavailable for Browser TTS' : 'No active media timing'}</span>}
      </div>
      {hasElapsed && (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/85">
          <progress
            className="sr-only"
            aria-label="Playback progress"
            value={elapsedSeconds}
            max={durationSeconds}
          />
          <div
            aria-hidden="true"
            className={`h-full rounded-full transition-[width] duration-150 motion-reduce:transition-none ${progressFill}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {reserveSlot && !hasElapsed && <div aria-hidden="true" className="h-2" />}
    </div>
  );
};

const StatusGlyph = ({ phase, betweenSteps, dotClass }) => {
  if (phase === 'pending' || (phase === 'waiting' && !betweenSteps)) {
    return <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin" />;
  }
  if (phase === 'paused') {
    return <Pause aria-hidden="true" className="h-2.5 w-2.5 shrink-0 fill-current" />;
  }
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />;
};

export default function BottomPlayerBar({
  isMobile, readPlayer, handleSmartNav, handleGlobalPlay, forceStopAll, playbackMode, cyclePlaybackMode, setPlaybackMode,
  structuredTextModeActive, textPlaybackRepresentationMode, textPlaybackOrder, textPlaybackChannelMode,
  onTextPlaybackRepresentationModeChange, onOpenTextPlayer
}) {
  const [expanded, setExpanded] = useState(false);
  const [, refresh] = useReducer(revision => revision + 1, 0);
  const detailsId = useId();
  const toggleRef = useRef(null);
  const detailsRef = useRef(null);
  const snapshot = readPlayer?.() ?? idle;
  const { media } = snapshot;
  const player = presentGlobalPlayer(snapshot);
  const active = player.phase !== 'idle';
  const pausedAction = ['playing', 'waiting'].includes(player.phase);
  const PlayIcon = pausedAction ? Pause : Play;
  const ExpandIcon = expanded ? ChevronDown : ChevronUp;
  const RepeatIcon = repeatIcons[playbackMode];
  const fullSaved = textPlaybackRepresentationMode === 'full';
  const domainIdentity = resolveDomainIdentity(player);
  const DomainIcon = domainIdentity.Icon;
  const accent = resolvePlayerAccentClasses(player);
  const semanticTone = resolveGlobalPlayerSemanticTone(player);
  const localOrder = channel => {
    const profiles = textPlaybackOrder?.channels?.[channel];
    return (Array.isArray(profiles) ? profiles.map(profile => profile?.voiceId || profile).filter(Boolean).join(' → ') : '') || 'Auto';
  };

  useEffect(() => {
    if (!expanded || !media?.addEventListener) return undefined;
    // Media events refresh this bar only. Replacing the observed source releases its listeners.
    for (const event of mediaEvents) media.addEventListener(event, refresh);
    return () => {
      for (const event of mediaEvents) media.removeEventListener(event, refresh);
    };
  }, [expanded, media]);

  // E4: Close expanded drawer when another presentation overlay opens (never touches playback/ownership)
  useEffect(() => subscribeOtherPresentationOverlayOpen(OVERLAY_SOURCES.GLOBAL_PLAYER, () => {
    setExpanded(false);
  }), []);

  usePresentationOverlayFocus({
    open: expanded, panelRef: detailsRef, onClose: () => setExpanded(false),
    contain: false, returnFocus: () => toggleRef.current
  });

  const toggleExpanded = () => {
    if (!expanded) announcePresentationOverlayOpen(OVERLAY_SOURCES.GLOBAL_PLAYER);
    setExpanded(!expanded);
  };

  const ownedDomainLabel = player.domain === 'structured-text'
    ? 'Structured Text'
    : player.domain === 'table'
      ? 'Table'
      : player.domain === 'legacy-text'
        ? 'Legacy Text'
        : null;
  const browsedDomainLabel = structuredTextModeActive ? 'Structured Text' : 'Table / Legacy';
  const settingsDomainDiffersFromOwned = Boolean(
    active
    && ownedDomainLabel
    && ((structuredTextModeActive && player.domain !== 'structured-text')
      || (!structuredTextModeActive && player.domain === 'structured-text'))
  );

  const secondaryControlClass = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 dark:border-slate-700/90 bg-slate-50/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors motion-reduce:transition-none disabled:opacity-35 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing}`;
  const playControlClass = `flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none disabled:opacity-45 disabled:cursor-not-allowed ${SHARED_CONTROL_TOKENS.focusRing} ${accent.playButton}`;

  const variationPill = player.variationBadge ? (
    <span
      data-player-variation-badge={player.variationKind}
      title={player.variation}
      className="inline-flex shrink-0 items-center rounded-full border border-amber-300/90 dark:border-amber-700/80 bg-amber-50/95 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 whitespace-nowrap"
    >
      {player.variationBadge}
    </span>
  ) : null;

  const hasNowPlayingBody = active && Boolean(
    player.workspaceTitle || player.cardTitle || player.context || player.speaker || player.segmentText || player.playedText || player.channelLabel
  );

  return (
    <section
      aria-label="Global player"
      aria-busy={player.phase === 'pending'}
      data-global-player
      data-player-phase={player.phase}
      data-player-domain={player.domain || 'idle'}
      data-player-channel={player.channel || undefined}
      className={`z-50 shrink-0 ${accent.topBorder} bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_-8px_28px_-14px_rgba(15,23,42,0.18)] dark:shadow-[0_-8px_28px_-14px_rgba(0,0,0,0.58)] transition-colors motion-reduce:transition-none prolingo-text-bottom-player ${
        isMobile ? 'fixed inset-x-0 bottom-0 px-3 pt-1.5 prolingo-mobile-bottom-safe' : 'px-4 py-2.5'
      }`}
    >
      <div className="mx-auto max-w-4xl">
        {/* Compact Header Bar: Single horizontal strip on Desktop, full-width metadata + balanced transport on Mobile */}
        {isMobile ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${domainIdentity.boxClass}`}
              >
                <DomainIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p
                    data-player-title
                    className="min-w-0 flex-1 truncate text-xs font-bold leading-4 text-slate-900 dark:text-slate-50"
                    title={player.title}
                  >
                    {player.title || 'Global Player'}
                  </p>
                  <p
                    data-player-status
                    className={`inline-flex shrink-0 max-w-[58%] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-snug ${accent.statusPill}`}
                    title={player.status}
                  >
                    <StatusGlyph phase={player.phase} betweenSteps={player.betweenSteps} dotClass={accent.dot} />
                    <span className="truncate">{player.compactStatus}</span>
                  </p>
                </div>
                {(player.context || variationPill) && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    {player.context && (
                      <p
                        data-player-context
                        className="min-w-0 flex-1 truncate text-[11px] font-medium leading-4 text-slate-600 dark:text-slate-300 tabular-nums"
                        title={player.context}
                      >
                        {player.context}
                      </p>
                    )}
                    {variationPill}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 prolingo-text-player-controls">
              <button
                type="button"
                className={secondaryControlClass}
                aria-label="Stop playback"
                disabled={!active}
                onClick={forceStopAll}
              >
                <Square aria-hidden="true" size={14} className="fill-current" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={secondaryControlClass}
                  aria-label={`Previous ${player.navLabel}`}
                  disabled={!player.canPrevious}
                  onClick={() => handleSmartNav('prev')}
                >
                  <SkipBack aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  className={playControlClass}
                  aria-label={player.playLabel}
                  disabled={player.phase === 'pending'}
                  onClick={handleGlobalPlay}
                >
                  <PlayIcon aria-hidden="true" size={18} />
                </button>
                <button
                  type="button"
                  className={secondaryControlClass}
                  aria-label={`Next ${player.navLabel}`}
                  disabled={!player.canNext}
                  onClick={() => handleSmartNav('next')}
                >
                  <SkipForward aria-hidden="true" size={16} />
                </button>
              </div>

              <button
                type="button"
                className={secondaryControlClass}
                aria-label={expanded ? 'Collapse player details' : 'Expand player details'}
                ref={toggleRef}
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={toggleExpanded}
              >
                <ExpandIcon aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${domainIdentity.boxClass}`}
              >
                <DomainIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <p
                    data-player-title
                    className="truncate text-sm font-bold leading-5 text-slate-900 dark:text-slate-50"
                    title={player.title}
                  >
                    {player.title || 'Global Player'}
                  </p>
                  <p
                    data-player-status
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-snug ${accent.statusPill}`}
                    title={player.status}
                  >
                    <StatusGlyph phase={player.phase} betweenSteps={player.betweenSteps} dotClass={accent.dot} />
                    <span>{player.compactStatus}</span>
                  </p>
                  {variationPill}
                </div>
                {player.context && (
                  <p
                    data-player-context
                    className="truncate text-xs font-medium leading-4 text-slate-600 dark:text-slate-300 tabular-nums"
                    title={player.context}
                  >
                    {player.context}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 prolingo-text-player-controls">
              <button
                type="button"
                className={secondaryControlClass}
                aria-label={`Previous ${player.navLabel}`}
                disabled={!player.canPrevious}
                onClick={() => handleSmartNav('prev')}
              >
                <SkipBack aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                className={playControlClass}
                aria-label={player.playLabel}
                disabled={player.phase === 'pending'}
                onClick={handleGlobalPlay}
              >
                <PlayIcon aria-hidden="true" size={18} />
              </button>
              <button
                type="button"
                className={secondaryControlClass}
                aria-label={`Next ${player.navLabel}`}
                disabled={!player.canNext}
                onClick={() => handleSmartNav('next')}
              >
                <SkipForward aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                className={secondaryControlClass}
                aria-label="Stop playback"
                disabled={!active}
                onClick={forceStopAll}
              >
                <Square aria-hidden="true" size={14} className="fill-current" />
              </button>
              <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700/80" />
              <button
                type="button"
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-slate-700/90 bg-slate-50/90 dark:bg-slate-800/90 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors motion-reduce:transition-none ${SHARED_CONTROL_TOKENS.focusRing}`}
                aria-label={expanded ? 'Collapse player details' : 'Expand player details'}
                ref={toggleRef}
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={toggleExpanded}
              >
                <span>{expanded ? 'Hide' : 'Details'}</span>
                <ExpandIcon aria-hidden="true" size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Expanded Player Drawer (D3 & D4): Now Playing -> Media Timeline -> Playback Info -> Settings -> Secondary Technical Details */}
        <div
          id={detailsId}
          ref={detailsRef}
          tabIndex={-1}
          hidden={!expanded}
          className="mt-2.5 max-h-[52dvh] overflow-y-auto overscroll-contain border-t border-slate-200/85 pt-2.5 dark:border-slate-800 md:max-h-[54dvh] custom-scrollbar"
        >
          {expanded && (
            <div className="space-y-2.5 pb-1 text-xs">
              {/* 1. Now Playing Section */}
              {hasNowPlayingBody ? (
                <div
                  data-player-section="now-playing"
                  className={`rounded-xl border p-2.5 sm:p-3 space-y-1.5 ${accent.cardSurface}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${domainIdentity.badgeClass}`}>
                        <DomainIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                        <span>{domainIdentity.label}</span>
                      </span>
                      {player.workspaceTitle ? (
                        <span
                          data-player-detail="Workspace"
                          className="text-xs font-semibold text-slate-600 dark:text-slate-300 break-words [overflow-wrap:anywhere]"
                        >
                          {player.workspaceTitle}
                        </span>
                      ) : player.title ? (
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-50 break-words [overflow-wrap:anywhere]">
                          {player.title}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {player.channelLabel && (
                        <span
                          data-player-detail="Channel"
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${semanticTone.badge}`}
                        >
                          {player.channelLabel}
                        </span>
                      )}
                      {player.speaker && (
                        <span
                          data-player-detail="Speaker"
                          className="inline-flex items-center rounded-full border border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 max-w-[14rem] min-w-0"
                          title={player.speaker}
                        >
                          <span className="truncate">{player.speaker}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {(player.cardTitle || player.context) && (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                      {player.cardTitle && (
                        <p
                          data-player-detail="Card"
                          className="text-xs font-bold text-slate-900 dark:text-slate-50 break-words [overflow-wrap:anywhere]"
                        >
                          {player.cardTitle}
                        </p>
                      )}
                      {player.domain === 'structured-text' && player.context ? (
                        <p
                          data-player-detail="Authored position"
                          className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums break-words"
                        >
                          {player.context}
                        </p>
                      ) : player.context ? (
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums break-words">
                          {player.context}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {player.segmentText && (
                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 sm:px-3 sm:py-2">
                      <p
                        data-player-detail="Segment"
                        className="text-[13px] font-medium leading-relaxed text-slate-900 dark:text-slate-50 break-words [overflow-wrap:anywhere]"
                      >
                        {player.segmentText}
                      </p>
                    </div>
                  )}

                  {player.playedText && (
                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 sm:px-3 sm:py-2">
                      <p
                        data-player-spoken-item="true"
                        className="text-[13px] font-medium leading-relaxed text-slate-900 dark:text-slate-50 break-words [overflow-wrap:anywhere]"
                      >
                        {player.playedText}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  data-player-section="now-playing"
                  className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/35 px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400"
                >
                  {player.phase === 'pending'
                    ? 'Starting audio session…'
                    : player.phase === 'waiting'
                      ? 'Waiting for next audio segment…'
                      : 'No active playback — press Play or select any Card, sentence, word, or text item to listen.'}
                </div>
              )}

              {/* 2. Actual Media Timeline (D4 — strictly real owned media only) */}
              <PlayerTimeline timeline={player.timeline} progressFill={accent.progressFill} reserveSlot={player.timelineSlot}
                phase={player.phase} source={player.sourceLabel} />

              {/* 3. Playback Information */}
              {player.playbackInfo.length > 0 && (
                <div
                  data-player-section="playback-info"
                  className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/45 px-3 py-2"
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Playback information
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 md:grid-cols-6">
                    {player.playbackInfo.map(([label, value]) => (
                      <div key={label} className={label === 'Voice' ? 'col-span-2 md:col-span-2 min-w-0' : 'min-w-0'}>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {label}
                        </dt>
                        <dd
                          data-player-detail={label}
                          title={value}
                          className="text-xs font-semibold text-slate-800 dark:text-slate-100 break-words [overflow-wrap:anywhere] tabular-nums"
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* 4. Settings & Quick Controls (Always accessible without scrolling past technical diagnostics) */}
              <div
                data-player-section="settings"
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/75 px-3 py-2"
              >
                {settingsDomainDiffersFromOwned && (
                  <p
                    data-player-settings-domain-note="true"
                    className="mb-1.5 rounded-lg border border-indigo-200/80 dark:border-indigo-800/70 bg-indigo-50/75 dark:bg-indigo-950/35 px-2 py-1 text-[11px] font-medium text-indigo-800 dark:text-indigo-200"
                  >
                    Browsed view settings ({browsedDomainLabel}) · Active audio owned by {ownedDomainLabel}
                  </p>
                )}
                {structuredTextModeActive ? (
                  <div className="space-y-1.5" data-text-global-player-controls="true">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Saved defaults (next play)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                          fullSaved
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/90 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700'
                        }`}
                        onClick={() => onTextPlaybackRepresentationModeChange(fullSaved ? 'split' : 'full')}
                      >
                        <Layers aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span>Saved {fullSaved ? 'Full' : 'Split'}</span>
                      </button>
                      <button
                        type="button"
                        className={`inline-flex min-h-9 items-center gap-1.5 px-2.5 text-xs font-semibold ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
                        data-player-open-text-settings="true"
                        onClick={() => {
                          announcePresentationOverlayOpen(OVERLAY_SOURCES.PLAYBACK_SETTINGS);
                          onOpenTextPlayer?.();
                        }}
                      >
                        <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span>Open Text Player settings</span>
                      </button>
                    </div>
                    <p className="min-w-0 break-words text-[11px] text-slate-500 dark:text-slate-400">
                      Saved language {languages[textPlaybackChannelMode]} · Local voice EN {localOrder('text')} · ID {localOrder('meaning')}
                    </p>
                  </div>
                ) : isMobile ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold ${SHARED_CONTROL_TOKENS.secondaryButton} ${SHARED_CONTROL_TOKENS.focusRing}`}
                      onClick={cyclePlaybackMode}
                    >
                      {RepeatIcon && <RepeatIcon aria-hidden="true" size={15} />}
                      <span>Repeat setting · {repeatLabels[playbackMode]}</span>
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <span>Repeat setting</span>
                    <select
                      className={`min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 ${SHARED_CONTROL_TOKENS.focusRing}`}
                      value={playbackMode}
                      onChange={event => setPlaybackMode(event.target.value)}
                    >
                      {Object.entries(repeatLabels).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* 5. Technical Details (Secondary Disclosure — preserves all diagnostic fields without cluttering primary view) */}
              {player.technicalDetails.length > 0 && (
                <details
                  data-player-technical-details="true"
                  className="group rounded-xl border border-slate-200/75 dark:border-slate-800 bg-slate-50/55 dark:bg-slate-800/30"
                >
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 select-none ${SHARED_CONTROL_TOKENS.focusRing}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Technical details</span>
                      {variationPill}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <div className="border-t border-slate-200/70 dark:border-slate-800 px-3 py-2">
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1.5 text-xs">
                      {player.technicalDetails.map(([label, value]) => (
                        <React.Fragment key={label}>
                          <dt className="font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
                          <dd
                            data-player-detail={label}
                            className="break-words [overflow-wrap:anywhere] text-slate-700 dark:text-slate-200"
                          >
                            {value}
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
