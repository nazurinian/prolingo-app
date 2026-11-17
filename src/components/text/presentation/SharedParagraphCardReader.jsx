import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState,
  updateTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import SharedBilingualLayoutToolbar from './SharedBilingualLayoutToolbar.jsx';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import { SharedCardPartView, SharedCardSegmentView } from './SharedPartAndSegmentViews.jsx';
import { useCardPresentationFollow } from './useCardPresentationFollow.js';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  buildCardUnitLookup,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
  resolveCardChannelAvailability,
  resolveEffectiveCardSelection,
  summarizeCardPresentationCoverage,
  summarizeSceneSpeakers
} from './sharedCardPresentationUtils.js';

export const SharedFullCardBody = props => <SharedBilingualUnitsBody {...props} />;

/**
 * Cohesive Shared Card reading surface supporting Full Card (continuous Sections),
 * Part View (Horizontal Focus / Vertical Focus / Vertical List), and Segment Focus,
 * usable standalone (`variant="card"`) or inside host shells (`variant="embedded"`).
 */
export const SharedCardReadingSurface = ({
  card,
  index = 0,
  workspace = null,
  presentationState = null,
  bilingualLayout = null,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusTarget = null,
  focusSegmentId = null,
  isFocusCard = false,
  playableSegmentIds = null,
  audioCoverageMap = null,
  cardPlayable = true,
  disabled = false,
  expanded = true,
  collapsible = false,
  onToggleExpanded,
  onPlayCard,
  onPlaySegment,
  onManualNavigate = null,
  headerActionsSlot = null,
  footerSlot = null,
  variant = 'card'
}) => {
  const viewState = useMemo(() => (
    presentationState
      ? normalizeTextCardPresentationState(presentationState)
      : normalizeTextCardPresentationState({
          bilingualLayout: bilingualLayout || DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout
        })
  ), [presentationState, bilingualLayout]);

  const workspaceId = workspace?.id ?? card?.documentId ?? null;
  const workspaceKey = workspace?.id
    ? `${workspace.id}:${workspace.uid || ''}`
    : (card?.documentId || 'default');

  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const isConversationScene = card?.blockType === 'conversation';
  const cardTerms = getSharedUnitTerms(card);
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const lookup = useMemo(() => buildCardUnitLookup(card), [card]);
  const orderedSegments = useMemo(() => lookup.entries.map(item => item.segment), [lookup]);
  const speakerAppearanceMap = useMemo(
    () => (isConversationScene ? buildCardSpeakerAppearanceMap(card) : null),
    [isConversationScene, card]
  );
  const sceneCast = useMemo(
    () => (isConversationScene ? summarizeSceneSpeakers({ card, appearanceMap: speakerAppearanceMap }) : []),
    [isConversationScene, card, speakerAppearanceMap]
  );
  const { hasText, hasMeaning } = useMemo(() => resolveCardChannelAvailability(card), [card]);
  const coverage = useMemo(
    () => summarizeCardPresentationCoverage({ orderedSegments, audioCoverageMap }),
    [orderedSegments, audioCoverageMap]
  );

  const [manualAnchor, setManualAnchor] = useState(null);
  const [dismissedFocusNonce, setDismissedFocusNonce] = useState(null);
  const [manualGraceActive, setManualGraceActive] = useState(false);
  const graceTimerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(graceTimerRef.current), []);

  const selection = useMemo(() => resolveEffectiveCardSelection({
    card,
    lookup,
    cursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    manualAnchor,
    dismissedFocusNonce,
    manualGraceActive
  }), [card, lookup, cursor, focusTarget, workspaceId, workspaceKey, manualAnchor, dismissedFocusNonce, manualGraceActive]);

  const triggerManualGrace = useCallback(() => {
    window.clearTimeout(graceTimerRef.current);
    setManualGraceActive(true);
    graceTimerRef.current = window.setTimeout(() => {
      setManualGraceActive(false);
    }, 1800);
    onManualNavigate?.();
  }, [onManualNavigate]);

  const handleSelectUnit = useCallback(unitViewKey => {
    const unit = lookup.unitByViewKey.get(unitViewKey);
    const firstSegId = unit?.segments?.[0]?.id || null;
    if (focusTarget?.documentId === workspaceId && focusTarget?.blockId === card?.id && focusTarget?.nonce !== undefined) {
      setDismissedFocusNonce(focusTarget.nonce);
    }
    setManualAnchor({
      workspaceKey,
      unitViewKey,
      segmentId: firstSegId,
      playingKeyAtManual: selection.audiblePlayingKey
    });
    triggerManualGrace();
  }, [lookup, focusTarget, workspaceId, card?.id, workspaceKey, selection.audiblePlayingKey, triggerManualGrace]);

  const handleSelectSegment = useCallback(segmentId => {
    const entry = lookup.entryBySegmentId.get(segmentId);
    if (!entry) return;
    if (focusTarget?.documentId === workspaceId && focusTarget?.blockId === card?.id && focusTarget?.nonce !== undefined) {
      setDismissedFocusNonce(focusTarget.nonce);
    }
    setManualAnchor({
      workspaceKey,
      unitViewKey: entry.unitViewKey,
      segmentId,
      playingKeyAtManual: selection.audiblePlayingKey
    });
    triggerManualGrace();
  }, [lookup, focusTarget, workspaceId, card?.id, workspaceKey, selection.audiblePlayingKey, triggerManualGrace]);

  const handleFollowAudible = useCallback(() => {
    window.clearTimeout(graceTimerRef.current);
    setManualGraceActive(false);
    setManualAnchor(null);
  }, []);

  const activeSegmentNumber = cursor.precision === 'segment' && cursor.segmentId && lookup.entryBySegmentId.has(cursor.segmentId)
    ? lookup.entryBySegmentId.get(cursor.segmentId).logicalIndex + 1
    : null;
  const channelBadge = cursor.channel === 'meaning' ? 'ID' : cursor.channel === 'text' ? 'EN' : 'Audio';
  const effectiveFocusSegmentId = focusSegmentId ?? (isFocusCard ? focusTarget?.segmentId : null);

  const firstVisiblePreview = useMemo(() => {
    const pickMeaning = viewState.bilingualLayout === 'meaning-only';
    const first = orderedSegments.find(item => normalizeSegmentDisplayText(pickMeaning ? item.meaning : item.text));
    return first ? normalizeSegmentDisplayText(pickMeaning ? first.meaning : first.text) : '';
  }, [orderedSegments, viewState.bilingualLayout]);

  const bodyNode = (
    <div data-shared-card-measure="true">
      {viewState.level === 'part' ? (
        <SharedCardPartView
          card={card}
          lookup={lookup}
          workspace={workspace}
          partLayout={viewState.partLayout}
          bilingualLayout={viewState.bilingualLayout}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onSelectUnit={handleSelectUnit}
          onFollowAudible={handleFollowAudible}
          onPlaySegment={onPlaySegment}
        />
      ) : viewState.level === 'segment' ? (
        <SharedCardSegmentView
          card={card}
          lookup={lookup}
          workspace={workspace}
          bilingualLayout={viewState.bilingualLayout}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onSelectSegment={handleSelectSegment}
          onFollowAudible={handleFollowAudible}
          onPlaySegment={onPlaySegment}
        />
      ) : (
        <SharedBilingualUnitsBody
          card={card}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={viewState.bilingualLayout}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          onPlaySegment={onPlaySegment}
        />
      )}
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div
        className="px-1 py-1 sm:px-2 sm:py-2 space-y-4"
        data-shared-card-id={card?.id}
        data-shared-card-embedded="true"
        data-shared-card-role={isTitleRole ? 'title' : card?.blockType === 'conversation' ? 'scene' : 'paragraph'}
        data-shared-card-level={viewState.level}
        data-shared-card-part-layout={viewState.partLayout}
        data-shared-card-layout={viewState.bilingualLayout}
        data-shared-card-precision={isSpeakingCard ? cursor.precision : 'none'}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || !hasText}
              onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'text-only' })}
              data-shared-card-play-channel="text"
              title={`Play EN — Play English only (entire ${cardTerms.cardLower}, one-time override)`}
              aria-label="EN — Play English only"
              className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-indigo-200/85 dark:border-indigo-800/75 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Play aria-hidden="true" className="w-3 h-3 fill-current" />
              <span>EN</span>
            </button>
            <button
              type="button"
              disabled={disabled || !hasMeaning}
              onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'meaning-only' })}
              data-shared-card-play-channel="meaning"
              title={`Play ID — Play Indonesian only (entire ${cardTerms.cardLower}, one-time override)`}
              aria-label="ID — Play Indonesian only"
              className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-emerald-200/85 dark:border-emerald-800/75 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Play aria-hidden="true" className="w-3 h-3 fill-current" />
              <span>ID</span>
            </button>
          </div>
          {isSpeakingCard && (
            <span
              data-shared-card-status-pill="true"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                cursor.state === 'paused'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                  : cursor.channel === 'meaning'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
              }`}
            >
              {cursor.state === 'paused' ? 'Paused' : 'Playing'} {channelBadge}
              {cursor.precision === 'card'
                ? (isConversationScene ? ' · Full Scene' : ' · Full Card')
                : activeSegmentNumber
                  ? ` · S${activeSegmentNumber}`
                  : ''}
            </span>
          )}
        </div>
        {bodyNode}
        {footerSlot}
      </div>
    );
  }

  const cardSurfaceTone = isSpeakingCard
    ? cursor.state === 'paused'
      ? 'border-amber-400/90 dark:border-amber-600/80 ring-2 ring-amber-400/20'
      : cursor.channel === 'meaning'
        ? 'border-emerald-400/90 dark:border-emerald-500/80 ring-2 ring-emerald-500/15'
        : 'border-indigo-400/90 dark:border-indigo-500/80 ring-2 ring-indigo-500/15'
    : isFocusCard
      ? 'border-amber-400/90 dark:border-amber-600/80 ring-2 ring-amber-400/20'
      : 'border-slate-200/90 dark:border-slate-800';

  const cardBackground = isTitleRole
    ? 'bg-gradient-to-b from-slate-50/95 via-white to-white dark:from-slate-800/45 dark:via-slate-900/95 dark:to-slate-900/95'
    : isConversationScene
      ? 'bg-gradient-to-b from-indigo-50/20 via-white to-white dark:from-slate-800/35 dark:via-slate-900/95 dark:to-slate-900/95'
      : 'bg-white dark:bg-slate-900/90';

  return (
    <article
      data-shared-card-id={card?.id}
      data-text-player-card={card?.id}
      data-shared-card-role={isTitleRole ? 'title' : isConversationScene ? 'scene' : 'paragraph'}
      data-shared-card-level={viewState.level}
      data-shared-card-part-layout={viewState.partLayout}
      data-shared-card-layout={viewState.bilingualLayout}
      data-shared-card-precision={isSpeakingCard ? cursor.precision : 'none'}
      data-shared-card-speaking={isSpeakingCard ? (cursor.precision === 'card' ? 'card' : 'segment') : undefined}
      data-text-search-focus-card={isFocusCard ? 'true' : undefined}
      className={`rounded-2xl border shadow-sm transition-colors duration-150 motion-reduce:transition-none overflow-hidden ${cardSurfaceTone} ${cardBackground}`}
    >
      <header className="px-5 py-4 sm:px-8 sm:py-5 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 w-full sm:flex-1 flex items-start gap-2.5">
          {collapsible && (
            <button
              type="button"
              onClick={() => onToggleExpanded?.(card.id)}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${cardTerms.cardLower}` : `Expand ${cardTerms.cardLower}`}
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 -ml-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 inline-flex items-center justify-center transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <ChevronRight
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90 text-indigo-600 dark:text-indigo-300' : ''}`}
              />
            </button>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="tabular-nums font-semibold text-slate-400 dark:text-slate-500">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span
                className={
                  isTitleRole
                    ? 'font-bold uppercase tracking-wider text-[11px] text-indigo-700 dark:text-indigo-300'
                    : isConversationScene
                      ? 'font-semibold uppercase tracking-wider text-[11px] text-indigo-700/85 dark:text-indigo-300'
                      : 'font-medium text-slate-500 dark:text-slate-400'
                }
                data-shared-card-role-label={isTitleRole ? 'title' : isConversationScene ? 'scene' : 'paragraph'}
              >
                {isTitleRole ? 'Title' : isConversationScene ? 'Scene' : 'Paragraph'}
              </span>
              {(isConversationScene ? card?.units?.length > 0 : card?.units?.length > 1) && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {card.units.length} {card.units.length === 1 ? cardTerms.lower : cardTerms.plural}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                {orderedSegments.length} {orderedSegments.length === 1 ? 'sentence' : 'sentences'}
              </span>
              {coverage && coverage.total > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400" data-shared-card-readiness="true">
                    Audio {coverage.ready}/{coverage.total} ready
                  </span>
                </>
              )}
              {isSpeakingCard && (
                <span
                  data-shared-card-status-pill="true"
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    cursor.state === 'paused'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                      : cursor.channel === 'meaning'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${cursor.state === 'paused' ? 'bg-amber-500' : 'bg-white'}`}
                  />
                  {cursor.state === 'paused' ? 'Paused' : 'Playing'} {channelBadge}
                  {cursor.precision === 'card'
                    ? (isConversationScene ? ' · Full Scene' : ' · Full Card')
                    : activeSegmentNumber
                      ? ` · S${activeSegmentNumber}`
                      : ''}
                </span>
              )}
            </div>

            <h3
              className={`break-words ${
                isTitleRole
                  ? 'text-lg sm:text-[1.35rem] font-bold tracking-tight leading-snug text-slate-900 dark:text-white'
                  : 'text-base sm:text-[1.0625rem] font-semibold leading-snug text-slate-900 dark:text-slate-100'
              }`}
              style={{ textWrap: 'balance' }}
            >
              {card?.title || (isTitleRole ? 'Untitled Title Card' : isConversationScene ? 'Scene' : 'Paragraph')}
            </h3>

            {sceneCast.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center gap-1.5" data-shared-scene-cast={card?.id}>
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none">Cast:</span>
                {sceneCast.map(person => (
                  <span
                    key={person.speakerKey || person.displayName}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${person.palette.pill}`}
                  >
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${person.palette.dot}`} />
                    <span>{person.displayName}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={disabled || !hasText}
            onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'text-only' })}
            data-shared-card-play-channel="text"
            title={`Play EN — Play English only (entire ${cardTerms.cardLower}, one-time override)`}
            aria-label="EN — Play English only"
            className="min-h-11 sm:min-h-9 px-2.5 rounded-xl border border-indigo-200/85 dark:border-indigo-800/75 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Play aria-hidden="true" className="w-3 h-3 fill-current" />
            <span>EN</span>
          </button>
          <button
            type="button"
            disabled={disabled || !hasMeaning}
            onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'meaning-only' })}
            data-shared-card-play-channel="meaning"
            title={`Play ID — Play Indonesian only (entire ${cardTerms.cardLower}, one-time override)`}
            aria-label="ID — Play Indonesian only"
            className="min-h-11 sm:min-h-9 px-2.5 rounded-xl border border-emerald-200/85 dark:border-emerald-800/75 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Play aria-hidden="true" className="w-3 h-3 fill-current" />
            <span>ID</span>
          </button>
          <button
            type="button"
            disabled={disabled || !cardPlayable}
            onClick={() => onPlayCard?.(card.id)}
            data-shared-card-play="true"
            title={`Play entire ${cardTerms.cardLower}`}
            aria-label={`Play ${cardTerms.cardLower} ${index + 1}: ${card?.title || (isTitleRole ? 'Title' : isConversationScene ? 'Scene' : 'Paragraph')}`}
            className={`min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-3 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              isSpeakingCard
                ? 'bg-indigo-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
            <span className="sr-only sm:not-sr-only">Play</span>
          </button>
          {headerActionsSlot}
        </div>
      </header>

      {expanded ? (
        <div className="px-5 py-5 sm:px-8 sm:py-6" data-shared-card-body={card?.id}>
          {bodyNode}
          {footerSlot}
        </div>
      ) : (
        <div className="px-5 py-3.5 sm:px-8 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
          {firstVisiblePreview || (card?.units?.length === 0 ? `No ${getSharedUnitTerms(card).plural} in this card yet.` : 'No preview text.')}
        </div>
      )}
    </article>
  );
};

/**
 * Paragraph-first Workspace Shared Card Reader consuming the frozen A1 presentation projection
 * and read-only cursor without owning audio sessions or snapshot mutations.
 */
export const SharedParagraphWorkspaceReader = ({
  presentation,
  presentationState = null,
  onPresentationStateChange = null,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusTarget = null,
  onFocusConsumed = null,
  expandedCardIds = null,
  onToggleCardExpanded = null,
  onEnsureCardExpanded = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  onPlayCard,
  onPlaySegment,
  toolbarRightSlot = null,
  scrollContainerRef = null
}) => {
  const internalRootRef = useRef(null);
  const rootRef = scrollContainerRef || internalRootRef;
  const workspaceKey = presentation?.workspace
    ? `${presentation.workspace.id}:${presentation.workspace.uid || ''}`
    : 'empty';

  const [uncontrolledState, setUncontrolledState] = useState(
    () => normalizeTextCardPresentationState()
  );
  const activeViewState = presentationState
    ? normalizeTextCardPresentationState(presentationState)
    : uncontrolledState;

  const handleChangePresentationState = useCallback(nextCandidate => {
    const next = updateTextCardPresentationState(activeViewState, nextCandidate);
    if (onPresentationStateChange) {
      onPresentationStateChange(next);
    } else {
      setUncontrolledState(next);
    }
  }, [activeViewState, onPresentationStateChange]);

  const handleResetView = useCallback(() => {
    const next = normalizeTextCardPresentationState(DEFAULT_TEXT_CARD_PRESENTATION_STATE);
    if (onPresentationStateChange) {
      onPresentationStateChange(next);
    } else {
      setUncontrolledState(next);
    }
  }, [onPresentationStateChange]);

  const { markUserNavigation, handleKeyDownNavigation } = useCardPresentationFollow({
    rootRef,
    workspaceId: presentation?.workspace?.id || null,
    focusTarget,
    cursor: playbackCursor,
    onEnsureCardExpanded,
    onFocusConsumed
  });

  if (!presentation) return null;

  const cards = presentation.cards || [];

  return (
    <section
      ref={rootRef}
      key={workspaceKey}
      onWheel={markUserNavigation}
      onTouchStart={markUserNavigation}
      onPointerDown={markUserNavigation}
      onKeyDown={handleKeyDownNavigation}
      data-shared-paragraph-reader="true"
      data-shared-workspace-id={presentation.workspace.id}
      data-shared-view-level={activeViewState.level}
      data-shared-part-layout={activeViewState.partLayout}
      data-shared-bilingual-layout={activeViewState.bilingualLayout}
      className="space-y-4"
    >
      <SharedBilingualLayoutToolbar
        unitKind={presentation.workspace.documentType === 'conversation' ? 'turn' : 'paragraph'}
        workspaceType={presentation.workspace.documentType}
        presentationState={activeViewState}
        onChangePresentationState={handleChangePresentationState}
        onResetView={handleResetView}
        rightSlot={toolbarRightSlot}
      />

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          This workspace does not have any cards yet.
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card, cardIndex) => {
            const isFocusCard = Boolean(
              focusTarget?.documentId === presentation.workspace.id
              && focusTarget?.blockId === card.id
            );
            const focusSegmentId = isFocusCard ? (focusTarget?.segmentId || null) : null;
            const expanded = expandedCardIds?.has ? expandedCardIds.has(card.id) : true;
            const { hasText, hasMeaning } = resolveCardChannelAvailability(card);
            return (
              <SharedCardReadingSurface
                key={card.uid || card.id}
                card={card}
                index={cardIndex}
                workspace={presentation.workspace}
                presentationState={activeViewState}
                playbackCursor={playbackCursor}
                focusTarget={focusTarget}
                focusSegmentId={focusSegmentId}
                isFocusCard={isFocusCard}
                playableSegmentIds={playableSegmentIds}
                audioCoverageMap={audioCoverageMap}
                cardPlayable={hasText || hasMeaning}
                disabled={disabled}
                expanded={expanded}
                collapsible={Boolean(onToggleCardExpanded)}
                onToggleExpanded={onToggleCardExpanded}
                onPlayCard={onPlayCard}
                onPlaySegment={onPlaySegment}
                onManualNavigate={markUserNavigation}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

export default SharedParagraphWorkspaceReader;
