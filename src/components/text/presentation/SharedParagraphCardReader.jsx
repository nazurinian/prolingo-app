import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronRight, Play, Radio, Square } from 'lucide-react';
import { matchesStructuredPlaybackControl } from '../../../domain/playback/nowPlayingDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleState,
  resolveEffectiveBilingualPresentation,
  resolveTextReaderModeFromState,
  updateTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import {
  TEXT_CARD_EXPANSION_MODES,
  TEXT_CARD_EXPANSION_OPTIONS,
  normalizeTextCardExpansionMode,
  resolveActiveCardIdFromCursor,
  resolveSharedReaderExpandedCardIds,
  toggleTextCardExpandedId
} from '../../../domain/text/textStructuredCardExpansionDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import SharedBilingualLayoutToolbar from './SharedBilingualLayoutToolbar.jsx';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import { SharedCardPartView, SharedCardSegmentView } from './SharedPartAndSegmentViews.jsx';
import { useCardPresentationFollow } from './useCardPresentationFollow.js';
import { WorkspaceReaderScrollContext } from './useWorkspaceReaderScroll.js';
import {
  EMPTY_CARD_SELECTION_STATE,
  useSharedReaderSelectionStore
} from './useSharedReaderSelectionStore.js';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  buildCardUnitLookup,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
  resolveCardChannelAvailability,
  resolveEffectiveCardSelection,
  resolveWorkspaceContextualTarget,
  resolveWorkspaceStylePresentation,
  summarizeCardPresentationCoverage,
  summarizeSceneSpeakers
} from './sharedCardPresentationUtils.js';
import { SHARED_SPACING_TOKENS } from './sharedDesignTokens.js';

export const SharedFullCardBody = props => <SharedBilingualUnitsBody {...props} />;

const resolveCardTypeOrdinal = (cards, cardIndex) => {
  let pCount = 0;
  let cCount = 0;
  for (let i = 0; i <= cardIndex; i += 1) {
    if (cards[i]?.blockType === 'conversation') cCount += 1;
    else pCount += 1;
  }
  return cards[cardIndex]?.blockType === 'conversation' ? `C${cCount}` : `P${pCount}`;
};

/**
 * Continuous Book-Page Full Mode renderer displaying the entire Workspace as one
 * cohesive reading page in authored order without repeated outer Card boxes.
 * Preserves Title Card semantics, persistent Card/Unit/Segment identities, Workspace
 * Style, active audio highlights, shared selection store Contextual bindings,
 * and existing playback / card-management callbacks.
 */
export const SharedBookPageView = ({
  presentation,
  presentationState = null,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusTarget = null,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  embedded = false,
  onPlayCard,
  onPlaySegment,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null,
  renderCardActions = null
}) => {
  const viewState = useMemo(() => (
    presentationState
      ? normalizeTextCardPresentationState(presentationState)
      : DEFAULT_TEXT_CARD_PRESENTATION_STATE
  ), [presentationState]);
  const stylePresentation = useMemo(
    () => resolveWorkspaceStylePresentation(workspaceStyle),
    [workspaceStyle]
  );

  if (!presentation) return null;

  const cards = presentation.cards || [];
  const workspace = presentation.workspace;
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const totalUnits = cards.reduce((sum, item) => sum + (item.units?.length || 0), 0);
  const totalSegments = cards.reduce(
    (sum, item) => sum + (item.units || []).reduce((unitSum, unit) => unitSum + (unit.segments?.length || 0), 0),
    0
  );
  const workspaceTypeLabel = workspace?.documentType === 'mixed'
    ? 'Mixed Workspace'
    : workspace?.documentType === 'conversation'
      ? 'Conversation Workspace'
      : 'Paragraph Workspace';

  return (
    <article
      data-shared-book-page="true"
      data-shared-workspace-id={workspace?.id}
      data-shared-workspace-align={stylePresentation.style.textAlign}
      data-shared-workspace-indent={stylePresentation.style.paragraphIndent ? 'on' : 'off'}
      data-shared-workspace-speaker-layout={stylePresentation.style.speakerLayout}
      data-shared-workspace-accents={stylePresentation.style.showAccents ? 'on' : 'off'}
      className={`${SHARED_SPACING_TOKENS.mobileScrollMargin} rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/95 shadow-sm px-4 py-4 sm:px-9 sm:py-7 space-y-6 transition-colors motion-reduce:transition-none`}
    >
      <header
        data-shared-book-header="true"
        className="pb-5 border-b border-slate-200/80 dark:border-slate-800 space-y-1.5 text-left"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-bold uppercase tracking-wider text-[11px] text-indigo-700 dark:text-indigo-300">
            {workspaceTypeLabel} · Book Page
          </span>
          <span className="tabular-nums">
            {cards.length} {cards.length === 1 ? 'Card' : 'Cards'} · {totalUnits} {totalUnits === 1 ? 'Unit' : 'Units'} · {totalSegments} {totalSegments === 1 ? 'Segment' : 'Segments'}
          </span>
        </div>
        {workspace?.title && (
          <h2 className="text-xl sm:text-[1.625rem] font-bold tracking-tight leading-snug text-slate-900 dark:text-white break-words">
            {workspace.title}
          </h2>
        )}
      </header>

      {cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          This workspace does not have any cards yet.
        </p>
      ) : (
        <div className="space-y-8" data-shared-book-chapters="true">
          {cards.map((card, cardIndex) => {
            const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
            const isConversationScene = card?.blockType === 'conversation';
            const cardTerms = getSharedUnitTerms(card);
            const typeTag = resolveCardTypeOrdinal(cards, cardIndex);
            const speakerAppearanceMap = isConversationScene ? buildCardSpeakerAppearanceMap(card) : null;
            const sceneCast = isConversationScene ? summarizeSceneSpeakers({ card, appearanceMap: speakerAppearanceMap }) : [];
            const { hasText, hasMeaning } = resolveCardChannelAvailability(card);
            const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
            const stopsCard = cardChannel => matchesStructuredPlaybackControl(cursor, { scope: 'card', blockId: card.id, cardChannel });
            const isFocusCard = Boolean(
              focusTarget?.documentId === workspace?.id
              && focusTarget?.blockId === card?.id
            );
            const effectiveFocusSegmentId = isFocusCard ? (focusTarget?.segmentId || null) : null;
            const lookup = buildCardUnitLookup(card);
            const activeSegmentNumber = isSpeakingCard && cursor.precision === 'segment' && cursor.segmentId && lookup.entryBySegmentId.has(cursor.segmentId)
              ? lookup.entryBySegmentId.get(cursor.segmentId).logicalIndex + 1
              : null;
            const channelBadge = cursor.channel === 'meaning' ? 'ID' : cursor.channel === 'text' ? 'EN' : 'Audio';
            const cardPlayable = hasText || hasMeaning;
            const speakingAccent = isSpeakingCard
              ? (cursor.state === 'paused'
                  ? 'ring-2 ring-amber-400/35 rounded-xl px-3 py-3 -mx-3 bg-amber-50/25 dark:bg-amber-950/15'
                  : cursor.channel === 'meaning'
                    ? 'ring-2 ring-emerald-500/25 rounded-xl px-3 py-3 -mx-3 bg-emerald-50/20 dark:bg-emerald-950/15'
                    : 'ring-2 ring-indigo-500/25 rounded-xl px-3 py-3 -mx-3 bg-indigo-50/20 dark:bg-indigo-950/15')
              : isFocusCard
                ? 'ring-2 ring-amber-400/30 rounded-xl px-3 py-3 -mx-3 bg-amber-50/20 dark:bg-amber-950/15'
                : '';

            return (
              <section
                key={card.uid || card.id}
                data-shared-book-card={card.id}
                data-shared-card-id={card.id}
                data-text-player-card={card.id}
                data-shared-card-embedded={embedded ? 'true' : undefined}
                data-shared-card-role={isTitleRole ? 'title' : isConversationScene ? 'scene' : 'paragraph'}
                data-shared-card-level={viewState.level}
                data-shared-card-part-layout={viewState.partLayout}
                data-shared-card-layout={viewState.bilingualLayout}
                data-shared-card-precision={isSpeakingCard ? cursor.precision : 'none'}
                data-shared-card-speaking={isSpeakingCard ? (cursor.precision === 'card' ? 'card' : 'segment') : undefined}
                data-text-search-focus-card={isFocusCard ? 'true' : undefined}
                className={`${SHARED_SPACING_TOKENS.mobileScrollMargin} ${cardIndex > 0 ? 'pt-7 border-t border-slate-100 dark:border-slate-800/80' : ''} ${speakingAccent} space-y-4 transition-colors motion-reduce:transition-none`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 text-left">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="tabular-nums font-semibold text-slate-400 dark:text-slate-500">
                        Card {cardIndex + 1}/{cards.length}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span
                        data-shared-card-role-label={isTitleRole ? 'title' : isConversationScene ? 'scene' : 'paragraph'}
                        className={
                          isTitleRole
                            ? 'font-bold uppercase tracking-wider text-[11px] text-indigo-700 dark:text-indigo-300'
                            : isConversationScene
                              ? 'font-bold uppercase tracking-wider text-[11px] text-indigo-700/90 dark:text-indigo-300'
                              : 'font-bold uppercase tracking-wider text-[11px] text-teal-700/90 dark:text-teal-300'
                        }
                      >
                        {typeTag} · {isTitleRole ? 'Title' : isConversationScene ? 'Conversation' : 'Paragraph'}
                      </span>
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
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cursor.state === 'paused' ? 'bg-amber-500' : 'bg-white'}`} />
                          {cursor.state === 'paused' ? 'Paused' : 'Playing'} {channelBadge}
                          {cursor.precision === 'card'
                            ? (isConversationScene ? ' · Full Scene' : ' · Full Card')
                            : activeSegmentNumber
                              ? ` · S${activeSegmentNumber}`
                              : ''}
                        </span>
                      )}
                    </div>

                    {card?.title && (
                      <h3
                        className={`text-left break-words ${
                          isTitleRole
                            ? 'text-xl sm:text-2xl font-bold tracking-tight leading-snug text-slate-900 dark:text-white'
                            : isConversationScene
                              ? 'text-base sm:text-lg font-semibold leading-snug text-indigo-950 dark:text-indigo-100'
                              : 'text-base sm:text-lg font-semibold leading-snug text-teal-950 dark:text-teal-100'
                        }`}
                      >
                        {card.title}
                      </h3>
                    )}

                    {sceneCast.length > 0 && (
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5" data-shared-scene-cast={card.id}>
                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none">Speakers:</span>
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

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={disabled || !hasText}
                      onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'text-only' })}
                      data-shared-card-play-channel="text"
                      data-reader-playback-action={stopsCard('text-only') ? 'stop' : 'play'}
                      title={stopsCard('text-only') ? 'Stop EN' : `Play EN — Play English only (entire ${cardTerms.cardLower}, one-time override)`}
                      aria-label={stopsCard('text-only') ? "Stop EN" : "EN — Play English only"}
                      className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-indigo-200/85 dark:border-indigo-800/75 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {stopsCard('text-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
                      <span>{stopsCard('text-only') ? "Stop EN" : "EN"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled || !hasMeaning}
                      onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'meaning-only' })}
                      data-shared-card-play-channel="meaning"
                      data-reader-playback-action={stopsCard('meaning-only') ? 'stop' : 'play'}
                      title={stopsCard('meaning-only') ? 'Stop ID' : `Play ID — Play Indonesian only (entire ${cardTerms.cardLower}, one-time override)`}
                      aria-label={stopsCard('meaning-only') ? "Stop ID" : "ID — Play Indonesian only"}
                      className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-emerald-200/85 dark:border-emerald-800/75 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      {stopsCard('meaning-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
                      <span>{stopsCard('meaning-only') ? "Stop ID" : "ID"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled || !cardPlayable}
                      onClick={() => onPlayCard?.(card.id)}
                      data-shared-card-play="true"
                      data-reader-playback-action={stopsCard() ? 'stop' : 'play'}
                      data-text-card-play-compact="true"
                      title={stopsCard() ? 'Stop Card' : `Play entire ${cardTerms.cardLower}`}
                      aria-label={stopsCard() ? 'Stop Card' : `Play ${cardTerms.cardLower} ${cardIndex + 1}: ${card?.title || (isTitleRole ? 'Title' : isConversationScene ? 'Scene' : 'Paragraph')}`}
                      className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 px-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 shadow-sm disabled:opacity-40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {stopsCard() ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
                      <span className="sr-only sm:not-sr-only">{stopsCard() ? 'Stop' : 'Play'}</span>
                    </button>
                    {renderCardActions?.(card, cardIndex)}
                  </div>
                </div>

                <div data-shared-card-body={card.id}>
                  <SharedBilingualUnitsBody
                    card={card}
                    workspace={workspace}
                    speakerAppearanceMap={speakerAppearanceMap}
                    presentationState={viewState}
                    bilingualLayout={viewState.bilingualLayout}
                    readerMode="full"
                    workspaceStyle={stylePresentation.style}
                    playbackCursor={cursor}
                    focusSegmentId={effectiveFocusSegmentId}
                    contextualState={contextualState}
                    playableSegmentIds={playableSegmentIds}
                    audioCoverageMap={audioCoverageMap}
                    disabled={disabled}
                    onPlaySegment={onPlaySegment}
                    onSelectContextualSegment={onSelectContextualSegment}
                    onFollowContextualAudible={onFollowContextualAudible}
                    onDismissContextualTarget={onDismissContextualTarget}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
};

/**
 * Cohesive Shared Card reading surface supporting Card (all Sections/Turns),
 * Part View (Horizontal Focus / Vertical Focus / Vertical List), and Segment Focus,
 * usable standalone (`variant="card"`) or inside host shells (`variant="embedded"`).
 */
export const SharedCardReadingSurface = ({
  card,
  index = 0,
  workspace = null,
  presentationState = null,
  bilingualLayout = null,
  readerMode = null,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusTarget = null,
  focusSegmentId = null,
  isFocusCard = false,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  cardPlayable = true,
  disabled = false,
  expanded = true,
  collapsible = false,
  onToggleExpanded,
  onPlayCard,
  onPlaySegment,
  onPlaySegmentChannel = null,
  onPlayContinueFromSegment = null,
  onManualNavigate = null,
  cardSelectionState = null,
  onSelectCardUnit = null,
  onSelectCardSegment = null,
  onFollowCardAudible = null,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null,
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
  const resolvedWorkspaceStyle = useMemo(
    () => normalizeTextWorkspaceStyleState(workspaceStyle),
    [workspaceStyle]
  );

  const workspaceId = workspace?.id ?? card?.documentId ?? null;
  const workspaceKey = workspace?.id
    ? `${workspace.id}:${workspace.uid || ''}`
    : (card?.documentId || 'default');

  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const isConversationScene = card?.blockType === 'conversation';
  const cardTerms = getSharedUnitTerms(card);
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const stopsCard = cardChannel => matchesStructuredPlaybackControl(cursor, { scope: 'card', blockId: card?.id, cardChannel });
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

  const standaloneSelectionStore = useSharedReaderSelectionStore(workspaceKey);
  const usesExternalSelectionOwner = Boolean(
    cardSelectionState !== null
    || typeof onSelectCardUnit === 'function'
    || typeof onSelectCardSegment === 'function'
    || typeof onFollowCardAudible === 'function'
  );
  const effectiveCardSelectionState = usesExternalSelectionOwner
    ? (cardSelectionState || EMPTY_CARD_SELECTION_STATE)
    : standaloneSelectionStore.getCardSelectionState(card?.id);

  const selection = useMemo(() => resolveEffectiveCardSelection({
    card,
    lookup,
    cursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    manualAnchor: effectiveCardSelectionState.manualAnchor,
    unitSegmentMemory: effectiveCardSelectionState.byUnitViewKey,
    dismissedFocusNonce: effectiveCardSelectionState.dismissedFocusNonce
  }), [
    card,
    lookup,
    cursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    effectiveCardSelectionState.manualAnchor,
    effectiveCardSelectionState.byUnitViewKey,
    effectiveCardSelectionState.dismissedFocusNonce
  ]);

  const activePlaybackSessionId = cursor.state === 'playing' || cursor.state === 'paused'
    ? (cursor.sessionId ?? null)
    : null;

  const handleSelectUnit = useCallback(unitViewKey => {
    const payload = {
      card,
      lookup,
      unitViewKey,
      focusTarget,
      workspaceId,
      activePlaybackSessionId
    };
    if (typeof onSelectCardUnit === 'function') {
      onSelectCardUnit(payload);
    } else {
      standaloneSelectionStore.selectCardUnit(payload);
    }
    onManualNavigate?.();
  }, [
    card,
    lookup,
    focusTarget,
    workspaceId,
    activePlaybackSessionId,
    onSelectCardUnit,
    standaloneSelectionStore,
    onManualNavigate
  ]);

  const handleSelectSegment = useCallback(segmentId => {
    const payload = {
      card,
      lookup,
      segmentId,
      focusTarget,
      workspaceId,
      activePlaybackSessionId
    };
    if (typeof onSelectCardSegment === 'function') {
      onSelectCardSegment(payload);
    } else {
      standaloneSelectionStore.selectCardSegment(payload);
    }
    onManualNavigate?.();
  }, [
    card,
    lookup,
    focusTarget,
    workspaceId,
    activePlaybackSessionId,
    onSelectCardSegment,
    standaloneSelectionStore,
    onManualNavigate
  ]);

  const handleFollowAudible = useCallback(() => {
    if (typeof onFollowCardAudible === 'function') {
      onFollowCardAudible(card?.id);
    } else {
      standaloneSelectionStore.clearCardManualSelection(card?.id);
    }
  }, [onFollowCardAudible, card?.id, standaloneSelectionStore]);

  const activeSegmentNumber = cursor.precision === 'segment' && cursor.segmentId && lookup.entryBySegmentId.has(cursor.segmentId)
    ? lookup.entryBySegmentId.get(cursor.segmentId).logicalIndex + 1
    : null;
  const channelBadge = cursor.channel === 'meaning' ? 'ID' : cursor.channel === 'text' ? 'EN' : 'Audio';
  const effectiveFocusSegmentId = focusSegmentId ?? (isFocusCard ? focusTarget?.segmentId : null);

  const firstVisiblePreview = useMemo(() => {
    const pickMeaning = viewState.readingLanguage === 'id-only'
      || viewState.readingLanguage === 'id-en'
      || viewState.bilingualLayout === 'meaning-only';
    const first = orderedSegments.find(item => normalizeSegmentDisplayText(pickMeaning ? item.meaning : item.text));
    return first ? normalizeSegmentDisplayText(pickMeaning ? first.meaning : first.text) : '';
  }, [orderedSegments, viewState.readingLanguage, viewState.bilingualLayout]);

  const effectiveStandaloneContextualState = useMemo(() => {
    if (contextualState) return contextualState;
    return resolveWorkspaceContextualTarget({
      cards: card ? [card] : [],
      cursor,
      focusTarget,
      workspaceId,
      workspaceKey,
      activeContextualSelection: standaloneSelectionStore.activeContextualTarget,
      dismissedFocusNonce: standaloneSelectionStore.dismissedContextualFocusNonce
    });
  }, [
    contextualState,
    card,
    cursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    standaloneSelectionStore.activeContextualTarget,
    standaloneSelectionStore.dismissedContextualFocusNonce
  ]);

  const handleEffectiveSelectContextualSegment = useCallback((targetCard, segmentId) => {
    if (typeof onSelectContextualSegment === 'function') {
      onSelectContextualSegment(targetCard, segmentId);
      return;
    }
    handleSelectSegment(segmentId);
  }, [onSelectContextualSegment, handleSelectSegment]);

  const handleEffectiveFollowContextualAudible = useCallback(() => {
    if (typeof onFollowContextualAudible === 'function') {
      onFollowContextualAudible();
      return;
    }
    handleFollowAudible();
  }, [onFollowContextualAudible, handleFollowAudible]);

  const handleEffectiveDismissContextualTarget = useCallback(() => {
    if (typeof onDismissContextualTarget === 'function') {
      onDismissContextualTarget();
      return;
    }
    standaloneSelectionStore.clearContextualSelection();
  }, [onDismissContextualTarget, standaloneSelectionStore]);

  const resolvedSurfaceMode = readerMode
    || (viewState.level === 'segment' ? 'segment' : viewState.level === 'part' ? 'focus' : 'card');

  const bodyNode = (
    <div data-shared-card-measure="true">
      {viewState.level === 'part' ? (
        <SharedCardPartView
          card={card}
          lookup={lookup}
          workspace={workspace}
          presentationState={viewState}
          partLayout={viewState.partLayout}
          bilingualLayout={viewState.bilingualLayout}
          workspaceStyle={resolvedWorkspaceStyle}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          contextualState={effectiveStandaloneContextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onSelectUnit={handleSelectUnit}
          onFollowAudible={handleFollowAudible}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={handleEffectiveSelectContextualSegment}
          onFollowContextualAudible={handleEffectiveFollowContextualAudible}
          onDismissContextualTarget={handleEffectiveDismissContextualTarget}
        />
      ) : viewState.level === 'segment' ? (
        <SharedCardSegmentView
          card={card}
          lookup={lookup}
          workspace={workspace}
          presentationState={viewState}
          bilingualLayout={viewState.bilingualLayout}
          workspaceStyle={resolvedWorkspaceStyle}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onSelectUnit={handleSelectUnit}
          onSelectSegment={handleSelectSegment}
          onFollowAudible={handleFollowAudible}
          onPlaySegment={onPlaySegment}
          onPlaySegmentChannel={onPlaySegmentChannel}
          onPlayContinueFromSegment={onPlayContinueFromSegment}
        />
      ) : (
        <SharedBilingualUnitsBody
          card={card}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={viewState}
          bilingualLayout={viewState.bilingualLayout}
          readerMode={resolvedSurfaceMode}
          workspaceStyle={resolvedWorkspaceStyle}
          playbackCursor={cursor}
          focusSegmentId={effectiveFocusSegmentId}
          contextualState={effectiveStandaloneContextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={handleEffectiveSelectContextualSegment}
          onFollowContextualAudible={handleEffectiveFollowContextualAudible}
          onDismissContextualTarget={handleEffectiveDismissContextualTarget}
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
              data-reader-playback-action={stopsCard('text-only') ? 'stop' : 'play'}
              title={stopsCard('text-only') ? 'Stop EN' : `Play EN — Play English only (entire ${cardTerms.cardLower}, one-time override)`}
              aria-label={stopsCard('text-only') ? "Stop EN" : "EN — Play English only"}
              className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-indigo-200/85 dark:border-indigo-800/75 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {stopsCard('text-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
              <span>{stopsCard('text-only') ? "Stop EN" : "EN"}</span>
            </button>
            <button
              type="button"
              disabled={disabled || !hasMeaning}
              onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'meaning-only' })}
              data-shared-card-play-channel="meaning"
              data-reader-playback-action={stopsCard('meaning-only') ? 'stop' : 'play'}
              title={stopsCard('meaning-only') ? 'Stop ID' : `Play ID — Play Indonesian only (entire ${cardTerms.cardLower}, one-time override)`}
              aria-label={stopsCard('meaning-only') ? "Stop ID" : "ID — Play Indonesian only"}
              className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-emerald-200/85 dark:border-emerald-800/75 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {stopsCard('meaning-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
              <span>{stopsCard('meaning-only') ? "Stop ID" : "ID"}</span>
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

  const cardTopAccent = resolvedWorkspaceStyle.showAccents
    ? (isTitleRole
        ? 'border-t-2 border-t-indigo-600/80 dark:border-t-indigo-400/80'
        : isConversationScene
          ? 'border-t-2 border-t-indigo-500/75 dark:border-t-indigo-400/70'
          : 'border-t-2 border-t-teal-500/75 dark:border-t-teal-400/70')
    : '';

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
      data-shared-card-expanded={expanded ? 'true' : 'false'}
      data-shared-card-precision={isSpeakingCard ? cursor.precision : 'none'}
      data-shared-card-speaking={isSpeakingCard ? (cursor.precision === 'card' ? 'card' : 'segment') : undefined}
      data-text-search-focus-card={isFocusCard ? 'true' : undefined}
      className={`${SHARED_SPACING_TOKENS.mobileScrollMargin} rounded-2xl border shadow-sm transition-colors duration-150 motion-reduce:transition-none overflow-hidden ${cardSurfaceTone} ${cardTopAccent} ${cardBackground}`}
    >
      <header className="px-5 py-4 sm:px-8 sm:py-5 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 w-full sm:flex-1 flex items-start gap-2.5">
          {collapsible && (
            <button
              type="button"
              onClick={() => onToggleExpanded?.(card.id)}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${cardTerms.cardLower}` : `Expand ${cardTerms.cardLower}`}
              data-shared-card-toggle={card.id}
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 -ml-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 inline-flex items-center justify-center transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <ChevronRight
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90 text-indigo-600 dark:text-indigo-300' : ''}`}
              />
            </button>
          )}
          <div className="min-w-0 flex-1 space-y-1 text-left">
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
                      : 'font-semibold uppercase tracking-wider text-[11px] text-teal-700/85 dark:text-teal-300'
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
              className={`text-left break-words ${
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
            data-reader-playback-action={stopsCard('text-only') ? 'stop' : 'play'}
            title={stopsCard('text-only') ? 'Stop EN' : `Play EN — Play English only (entire ${cardTerms.cardLower}, one-time override)`}
            aria-label={stopsCard('text-only') ? "Stop EN" : "EN — Play English only"}
            className="min-h-11 sm:min-h-9 px-2.5 rounded-xl border border-indigo-200/85 dark:border-indigo-800/75 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {stopsCard('text-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
            <span>{stopsCard('text-only') ? "Stop EN" : "EN"}</span>
          </button>
          <button
            type="button"
            disabled={disabled || !hasMeaning}
            onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'meaning-only' })}
            data-shared-card-play-channel="meaning"
            data-reader-playback-action={stopsCard('meaning-only') ? 'stop' : 'play'}
            title={stopsCard('meaning-only') ? 'Stop ID' : `Play ID — Play Indonesian only (entire ${cardTerms.cardLower}, one-time override)`}
            aria-label={stopsCard('meaning-only') ? "Stop ID" : "ID — Play Indonesian only"}
            className="min-h-11 sm:min-h-9 px-2.5 rounded-xl border border-emerald-200/85 dark:border-emerald-800/75 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 transition-colors motion-reduce:transition-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {stopsCard('meaning-only') ? <Square aria-hidden="true" className="w-3 h-3 fill-current" /> : <Play aria-hidden="true" className="w-3 h-3 fill-current" />}
            <span>{stopsCard('meaning-only') ? "Stop ID" : "ID"}</span>
          </button>
          <button
            type="button"
            disabled={disabled || !cardPlayable}
            onClick={() => onPlayCard?.(card.id)}
            data-shared-card-play="true"
            data-reader-playback-action={stopsCard() ? 'stop' : 'play'}
            title={stopsCard() ? 'Stop Card' : `Play entire ${cardTerms.cardLower}`}
            aria-label={stopsCard() ? 'Stop Card' : `Play ${cardTerms.cardLower} ${index + 1}: ${card?.title || (isTitleRole ? 'Title' : isConversationScene ? 'Scene' : 'Paragraph')}`}
            className={`min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-3 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              isSpeakingCard
                ? 'bg-indigo-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {stopsCard() ? <Square aria-hidden="true" className="w-3.5 h-3.5 fill-current" /> : <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />}
            <span className="sr-only sm:not-sr-only">{stopsCard() ? 'Stop' : 'Play'}</span>
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
        <div className="px-5 py-3.5 sm:px-8 text-left text-sm text-slate-500 dark:text-slate-400 line-clamp-2" data-shared-card-collapsed-preview={card?.id}>
          {firstVisiblePreview || (card?.units?.length === 0 ? `No ${getSharedUnitTerms(card).plural} in this card yet.` : 'No preview text.')}
        </div>
      )}
    </article>
  );
};

/**
 * Shared Workspace Reader consuming the frozen A1 presentation projection and
 * read-only cursor without owning audio sessions or snapshot mutations.
 * Supports continuous Book-Page Full Mode, expandable Card Mode with Follow Playback /
 * Expand All / Custom visibility, and shared Workspace Style.
 */
export const SharedParagraphWorkspaceReader = ({
  presentation,
  presentationState = null,
  onPresentationStateChange = null,
  readerMode = null,
  onReaderModeChange = null,
  cardVisibility = null,
  onCardVisibilityChange = null,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  workspaceStyleControlValue = null,
  effectiveWorkspaceStyleDefaults = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  workspaceStyleScope = 'shared',
  onWorkspaceStyleScopeChange = null,
  hasWorkspaceStyleOverride = false,
  canOverrideWorkspaceStyle = false,
  onWorkspaceStyleChange = null,
  onResetWorkspaceStyle = null,
  showWorkspaceStyle = false,
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
  onPlaySegmentChannel = null,
  onPlayContinueFromSegment = null,
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

  const supportsBookAndCardModes = Boolean(readerMode !== null || onReaderModeChange !== null);
  const modeResolution = useMemo(() => resolveTextReaderModeFromState({
    readerMode,
    view: activeViewState,
    supportsFourModes: supportsBookAndCardModes
  }), [readerMode, activeViewState, supportsBookAndCardModes]);
  const effectiveReaderMode = modeResolution.mode;
  const effectiveCardPresentationState = useMemo(() => (
    supportsBookAndCardModes
      ? normalizeTextCardPresentationState({
          ...activeViewState,
          level: modeResolution.effectiveLevel,
          partLayout: modeResolution.effectivePartLayout
        })
      : activeViewState
  ), [supportsBookAndCardModes, activeViewState, modeResolution.effectiveLevel, modeResolution.effectivePartLayout]);
  const showBookPage = supportsBookAndCardModes && effectiveReaderMode === 'full';

  const resolvedWorkspaceStyle = useMemo(
    () => normalizeTextWorkspaceStyleState(workspaceStyle),
    [workspaceStyle]
  );
  const resolvedControlStyle = useMemo(
    () => normalizeTextWorkspaceStyleState(workspaceStyleControlValue ?? workspaceStyle),
    [workspaceStyleControlValue, workspaceStyle]
  );

  // Card Visibility state for standalone/UAT Workspace hosts (Follow Playback / Expand All / Custom)
  const managesCardVisibility = Boolean(cardVisibility !== null || onCardVisibilityChange !== null);
  const [uncontrolledVisibility, setUncontrolledVisibility] = useState(TEXT_CARD_EXPANSION_MODES.ALL);
  const effectiveVisibility = normalizeTextCardExpansionMode(
    cardVisibility !== null ? cardVisibility : uncontrolledVisibility
  );
  const [customExpandedState, setCustomExpandedState] = useState(() => ({
    workspaceKey,
    ids: null
  }));
  const [lastActiveState, setLastActiveState] = useState(() => ({
    workspaceKey,
    cardId: null
  }));
  const cards = useMemo(() => presentation?.cards || [], [presentation?.cards]);
  const activeCursorCardId = useMemo(
    () => resolveActiveCardIdFromCursor({ cards, playbackCursor }),
    [cards, playbackCursor]
  );

  const customExpandedIds = useMemo(() => {
    if (customExpandedState.workspaceKey === workspaceKey && customExpandedState.ids !== null) {
      return customExpandedState.ids;
    }
    return new Set(cards[0]?.id ? [cards[0].id] : []);
  }, [customExpandedState, workspaceKey, cards]);
  if (activeCursorCardId && (lastActiveState.workspaceKey !== workspaceKey || lastActiveState.cardId !== activeCursorCardId)) {
    setLastActiveState({ workspaceKey, cardId: activeCursorCardId });
  }
  const lastActiveCardId = lastActiveState.workspaceKey === workspaceKey ? lastActiveState.cardId : null;

  const internalExpandedCardIds = useMemo(() => resolveSharedReaderExpandedCardIds({
    mode: effectiveVisibility,
    cards,
    activeCardId: activeCursorCardId,
    lastActiveCardId,
    customExpandedIds,
    fallbackFirstWhenIdle: true
  }), [effectiveVisibility, cards, activeCursorCardId, lastActiveCardId, customExpandedIds]);

  const effectiveExpandedCardIds = expandedCardIds || (managesCardVisibility ? internalExpandedCardIds : null);

  // Stable Workspace-level transient selection owner surviving mode transitions
  // (Full <-> Card <-> Focus <-> Segment), Card collapse/reopen, layout, visibility,
  // and Workspace Style changes with strict Workspace isolation.
  const selectionStore = useSharedReaderSelectionStore(workspaceKey);

  const workspaceId = presentation?.workspace?.id || null;
  const activePlaybackSessionId = playbackCursor?.state === 'playing' || playbackCursor?.state === 'paused'
    ? (playbackCursor?.sessionId ?? null)
    : null;
  const workspaceContextualState = useMemo(() => resolveWorkspaceContextualTarget({
    cards,
    cursor: playbackCursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    activeContextualSelection: selectionStore.activeContextualTarget,
    dismissedFocusNonce: selectionStore.dismissedContextualFocusNonce
  }), [
    cards,
    playbackCursor,
    focusTarget,
    workspaceId,
    workspaceKey,
    selectionStore.activeContextualTarget,
    selectionStore.dismissedContextualFocusNonce
  ]);

  const workspaceContextualModeActive = useMemo(() => resolveEffectiveBilingualPresentation({
    readerMode: effectiveReaderMode,
    view: activeViewState
  }).isContextualActive, [effectiveReaderMode, activeViewState]);

  const isPlayingCardDiverged = Boolean(
    managesCardVisibility
    && !showBookPage
    && activeCursorCardId
    && effectiveVisibility === TEXT_CARD_EXPANSION_MODES.CUSTOM
    && !internalExpandedCardIds.has(activeCursorCardId)
  );
  const followScrollBlocked = Boolean(
    isPlayingCardDiverged
    || (activeCursorCardId && selectionStore.hasManualSelection(activeCursorCardId))
    || Boolean(workspaceContextualModeActive && selectionStore.activeContextualTarget && workspaceContextualState.divergedFromAudible)
    || (
      playbackCursor?.sessionId !== null
      && playbackCursor?.sessionId !== undefined
      && selectionStore.manualBrowseSessionId === playbackCursor.sessionId
    )
  );

  const handleEnsureCardExpanded = useCallback(cardId => {
    if (onEnsureCardExpanded) {
      onEnsureCardExpanded(cardId);
      return;
    }
    if (!managesCardVisibility || internalExpandedCardIds.has(cardId)) return;
    setCustomExpandedState({ workspaceKey, ids: new Set([...internalExpandedCardIds, cardId]) });
    if (effectiveVisibility !== TEXT_CARD_EXPANSION_MODES.CUSTOM) {
      if (onCardVisibilityChange) onCardVisibilityChange(TEXT_CARD_EXPANSION_MODES.CUSTOM);
      else setUncontrolledVisibility(TEXT_CARD_EXPANSION_MODES.CUSTOM);
    }
  }, [onEnsureCardExpanded, managesCardVisibility, internalExpandedCardIds, effectiveVisibility, onCardVisibilityChange, workspaceKey]);

  const {
    scroll,
    markUserNavigation,
    resetUserNavigationGrace,
    handleKeyDownNavigation
  } = useCardPresentationFollow({
    rootRef,
    workspaceId,
    workspaceKey,
    focusTarget,
    cursor: playbackCursor,
    followScrollBlocked,
    onEnsureCardExpanded: handleEnsureCardExpanded,
    onFocusConsumed
  });

  const handleSelectContextualSegment = useCallback((targetCard, segmentId) => {
    if (!targetCard?.id || !segmentId) return;
    selectionStore.selectCardSegment({
      card: targetCard,
      lookup: buildCardUnitLookup(targetCard),
      segmentId,
      focusTarget,
      workspaceId,
      activePlaybackSessionId
    });
    markUserNavigation();
  }, [selectionStore, focusTarget, workspaceId, activePlaybackSessionId, markUserNavigation]);

  const handleFollowContextualAudible = useCallback(() => {
    selectionStore.clearContextualSelection();
    selectionStore.clearAllManualSelections();
    selectionStore.resumeViewportFollow();
    resetUserNavigationGrace();
  }, [selectionStore, resetUserNavigationGrace]);

  const handleDismissContextualTarget = useCallback(() => {
    selectionStore.clearContextualSelection();
  }, [selectionStore]);

  const handleVisibilityChange = useCallback(nextMode => {
    const normalized = normalizeTextCardExpansionMode(nextMode);
    if (normalized === TEXT_CARD_EXPANSION_MODES.CUSTOM && effectiveVisibility !== TEXT_CARD_EXPANSION_MODES.CUSTOM) {
      setCustomExpandedState({ workspaceKey, ids: new Set(internalExpandedCardIds) });
    }
    if (normalized === TEXT_CARD_EXPANSION_MODES.FOLLOW) {
      selectionStore.clearAllManualSelections();
      selectionStore.resumeViewportFollow();
      resetUserNavigationGrace();
    }
    if (onCardVisibilityChange) {
      onCardVisibilityChange(normalized);
    } else {
      setUncontrolledVisibility(normalized);
    }
  }, [
    effectiveVisibility,
    internalExpandedCardIds,
    onCardVisibilityChange,
    workspaceKey,
    selectionStore,
    resetUserNavigationGrace
  ]);

  const handleToggleCard = useCallback(cardId => {
    if (onToggleCardExpanded) {
      onToggleCardExpanded(cardId);
      return;
    }
    if (!managesCardVisibility) return;
    // Manual browsing switches to Custom while retaining every currently open Card.
    setCustomExpandedState({ workspaceKey, ids: toggleTextCardExpandedId(internalExpandedCardIds, cardId) });
    if (effectiveVisibility !== TEXT_CARD_EXPANSION_MODES.CUSTOM) {
      if (onCardVisibilityChange) onCardVisibilityChange(TEXT_CARD_EXPANSION_MODES.CUSTOM);
      else setUncontrolledVisibility(TEXT_CARD_EXPANSION_MODES.CUSTOM);
    }
  }, [onToggleCardExpanded, managesCardVisibility, internalExpandedCardIds, effectiveVisibility, onCardVisibilityChange, workspaceKey]);

  const handleFollowCardAudible = useCallback(cardId => {
    selectionStore.clearCardManualSelection(cardId);
    selectionStore.resumeViewportFollow();
    resetUserNavigationGrace();
  }, [selectionStore, resetUserNavigationGrace]);

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
    if (onReaderModeChange) {
      onReaderModeChange('full');
    }
    if (onPresentationStateChange) {
      onPresentationStateChange(next);
    } else {
      setUncontrolledState(next);
    }
  }, [onReaderModeChange, onPresentationStateChange]);

  if (!presentation) return null;

  const cardsCollapsible = Boolean(onToggleCardExpanded || managesCardVisibility);

  return (
    <WorkspaceReaderScrollContext.Provider value={scroll}>
    <section
      ref={rootRef}
      key={workspaceKey}
      onWheel={markUserNavigation}
      onTouchStart={markUserNavigation}
      onPointerDown={markUserNavigation}
      onKeyDown={handleKeyDownNavigation}
      data-shared-paragraph-reader="true"
      data-shared-workspace-id={presentation.workspace.id}
      data-shared-reader-surface={showBookPage ? 'book-full' : effectiveReaderMode}
      data-shared-view-level={effectiveCardPresentationState.level}
      data-shared-part-layout={effectiveCardPresentationState.partLayout}
      data-shared-bilingual-layout={effectiveCardPresentationState.bilingualLayout}
      data-shared-card-visibility={managesCardVisibility ? effectiveVisibility : undefined}
      className="space-y-4"
    >
      <SharedBilingualLayoutToolbar
        unitKind={presentation.workspace.documentType === 'conversation' ? 'turn' : 'paragraph'}
        workspaceType={presentation.workspace.documentType}
        presentationState={activeViewState}
        onChangePresentationState={handleChangePresentationState}
        onResetView={handleResetView}
        readerMode={supportsBookAndCardModes ? readerMode : null}
        onChangeReaderMode={onReaderModeChange}
        workspaceStyle={showWorkspaceStyle || onWorkspaceStyleChange ? resolvedControlStyle : null}
        effectiveWorkspaceStyleDefaults={effectiveWorkspaceStyleDefaults}
        onChangeWorkspaceStyle={onWorkspaceStyleChange}
        onResetWorkspaceStyle={onResetWorkspaceStyle}
        workspaceStyleScope={workspaceStyleScope}
        onChangeWorkspaceStyleScope={onWorkspaceStyleScopeChange}
        canOverrideWorkspaceStyle={canOverrideWorkspaceStyle}
        hasWorkspaceStyleOverride={hasWorkspaceStyleOverride}
        showWorkspaceStyle={showWorkspaceStyle}
        rightSlot={toolbarRightSlot}
        cardVisibilitySlot={managesCardVisibility && !showBookPage && cards.length > 0 ? (
          <div
            data-shared-card-visibility-bar="true"
            data-shared-card-visibility-mode={effectiveVisibility}
            className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2.5 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
              Card Visibility
            </span>
            <div role="group" aria-label="Card visibility (display only)" className="inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/85 p-0.5">
              {TEXT_CARD_EXPANSION_OPTIONS.map(option => {
                const active = effectiveVisibility === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleVisibilityChange(option.id)}
                    title={option.description}
                    data-shared-card-visibility-option={option.id}
                    className={`min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        divergedBannerSlot={isPlayingCardDiverged ? (
          <>
            <span className="text-[11px] font-medium text-indigo-800 dark:text-indigo-200">
              Browsing other cards while audio plays
            </span>
            <button
              type="button"
              onClick={() => handleVisibilityChange(TEXT_CARD_EXPANSION_MODES.FOLLOW)}
              data-shared-card-return-to-playing="true"
              className="min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-full border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-indigo-950/70 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Radio aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Follow Playing Card</span>
            </button>
          </>
        ) : null}
      />

      {showBookPage ? (
        <SharedBookPageView
          presentation={presentation}
          presentationState={activeViewState}
          workspaceStyle={resolvedWorkspaceStyle}
          playbackCursor={playbackCursor}
          focusTarget={focusTarget}
          contextualState={workspaceContextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          onPlayCard={onPlayCard}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={handleSelectContextualSegment}
          onFollowContextualAudible={handleFollowContextualAudible}
          onDismissContextualTarget={handleDismissContextualTarget}
        />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          This workspace does not have any cards yet.
        </div>
      ) : (
        <div className="space-y-4" data-shared-cards-list="true">
          {cards.map((card, cardIndex) => {
            const isFocusCard = Boolean(
              focusTarget?.documentId === presentation.workspace.id
              && focusTarget?.blockId === card.id
            );
            const focusSegmentId = isFocusCard ? (focusTarget?.segmentId || null) : null;
            const expanded = effectiveExpandedCardIds?.has ? effectiveExpandedCardIds.has(card.id) : true;
            const { hasText, hasMeaning } = resolveCardChannelAvailability(card);
            return (
              <SharedCardReadingSurface
                key={card.uid || card.id}
                card={card}
                index={cardIndex}
                workspace={presentation.workspace}
                presentationState={effectiveCardPresentationState}
                readerMode={effectiveReaderMode}
                workspaceStyle={resolvedWorkspaceStyle}
                playbackCursor={playbackCursor}
                focusTarget={focusTarget}
                focusSegmentId={focusSegmentId}
                isFocusCard={isFocusCard}
                contextualState={workspaceContextualState}
                playableSegmentIds={playableSegmentIds}
                audioCoverageMap={audioCoverageMap}
                cardPlayable={hasText || hasMeaning}
                disabled={disabled}
                expanded={expanded}
                collapsible={cardsCollapsible}
                onToggleExpanded={cardsCollapsible ? handleToggleCard : undefined}
                onPlayCard={onPlayCard}
                onPlaySegment={onPlaySegment}
                onPlaySegmentChannel={onPlaySegmentChannel}
                onPlayContinueFromSegment={onPlayContinueFromSegment}
                onManualNavigate={markUserNavigation}
                cardSelectionState={selectionStore.getCardSelectionState(card.id)}
                onSelectCardUnit={selectionStore.selectCardUnit}
                onSelectCardSegment={selectionStore.selectCardSegment}
                onFollowCardAudible={handleFollowCardAudible}
                onSelectContextualSegment={handleSelectContextualSegment}
                onFollowContextualAudible={handleFollowContextualAudible}
                onDismissContextualTarget={handleDismissContextualTarget}
              />
            );
          })}
        </div>
      )}
    </section>
    </WorkspaceReaderScrollContext.Provider>
  );
};

export default SharedParagraphWorkspaceReader;
