import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState,
  updateTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import TextSegmentInteraction from './TextSegmentInteraction.jsx';
import SharedBilingualLayoutToolbar from './SharedBilingualLayoutToolbar.jsx';
import { useCardPresentationFollow } from './useCardPresentationFollow.js';
import {
  buildCardSegmentIndexMap,
  buildSegmentCoverageTitle,
  normalizeSegmentDisplayText,
  resolveCardChannelAvailability,
  resolveSegmentJoinSeparator,
  summarizeCardPresentationCoverage
} from './sharedCardPresentationUtils.js';

const IDLE_CURSOR = Object.freeze({
  workspaceId: null,
  workspaceUid: null,
  sessionId: null,
  state: 'idle',
  cardId: null,
  unitId: null,
  segmentId: null,
  channel: null,
  precision: 'none'
});

const renderChannelJoinSeparator = (segment, hasNextSegment) => {
  if (!hasNextSegment) return null;
  const separator = resolveSegmentJoinSeparator(segment?.joinAfter);
  if (separator === '') return null;
  if (separator === '\n') return <br aria-hidden="true" />;
  return ' ';
};

const CardChannelFlowBody = ({
  units,
  channel,
  indexById,
  cursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  fullChannelHighlighted,
  isTitleRole,
  langTag,
  disabled,
  showSectionHeaders,
  showMissingInline,
  onPlaySegment
}) => {
  const isMeaning = channel === 'meaning';
  const proseTypography = isTitleRole
    ? (isMeaning
        ? 'text-base sm:text-[1.0625rem] leading-[1.72] text-slate-600 dark:text-slate-300'
        : 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50')
    : (isMeaning
        ? 'text-[0.96875rem] sm:text-base leading-[1.75] text-slate-700 dark:text-slate-200'
        : 'text-[1.0625rem] sm:text-[1.125rem] leading-[1.8] text-slate-800 dark:text-slate-100');

  return (
    <div
      className="space-y-5"
      data-shared-card-flow={channel}
      data-shared-full-channel-highlight={fullChannelHighlighted ? 'true' : undefined}
    >
      {units.map((unit, unitIndex) => {
        const unitSegments = unit.segments || [];
        const hasAnyContent = unitSegments.some(segment => (
          Boolean(normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text))
        ));
        return (
          <section
            key={`${channel}-${unit.viewKey}`}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            className={unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}
          >
            {showSectionHeaders && (
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                {unit.label || 'Section'} {unitIndex + 1}
              </p>
            )}
            {unitSegments.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                Empty section — no sentences yet.
              </p>
            ) : !hasAnyContent && !showMissingInline ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-channel={channel}>
                {isMeaning ? 'No Indonesian meaning in this section yet.' : 'No English text in this section yet.'}
              </p>
            ) : (
              <div lang={langTag} className={`max-w-[66ch] text-left break-words whitespace-pre-line ${proseTypography}`}>
                {unitSegments.map((segment, segIdx) => {
                  const content = normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text);
                  const logicalIndex = indexById.get(segment.id) ?? segIdx;
                  if (!content) {
                    if (!showMissingInline) return null;
                    return (
                      <React.Fragment key={`${channel}-${segment.id}-missing`}>
                        <span
                          data-shared-card-missing-meaning={isMeaning ? segment.id : undefined}
                          data-shared-card-missing-text={!isMeaning ? segment.id : undefined}
                          className="inline text-xs italic text-slate-400 dark:text-slate-500 select-none"
                        >
                          [{`#${logicalIndex + 1}: `}{isMeaning ? 'no meaning' : 'no text'}]
                        </span>
                        {segIdx < unitSegments.length - 1 ? ' ' : null}
                      </React.Fragment>
                    );
                  }
                  const active = isSpeakingCard && cursor.precision === 'segment' && cursor.segmentId === segment.id;
                  const speaking = active && cursor.channel === channel;
                  const focused = segment.id === focusSegmentId;
                  const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
                  const segmentDisabled = disabled || !playable;
                  const nextHasRenderable = unitSegments.slice(segIdx + 1).some(item => (
                    showMissingInline || Boolean(normalizeSegmentDisplayText(isMeaning ? item.meaning : item.text))
                  ));
                  return (
                    <React.Fragment key={`${channel}-${segment.id}`}>
                      <TextSegmentInteraction
                        segmentId={segment.id}
                        channel={channel}
                        interactive
                        disabled={segmentDisabled}
                        active={active}
                        speaking={speaking}
                        focused={focused}
                        fullChannelHighlighted={fullChannelHighlighted}
                        dataAttributes={{
                          'data-shared-card-segment': segment.id,
                          'data-shared-card-channel': channel,
                          'data-shared-card-index': logicalIndex + 1
                        }}
                        title={buildSegmentCoverageTitle({
                          segment,
                          logicalIndex,
                          audioCoverageMap,
                          playable,
                          disabled
                        })}
                        accessibleLabel={`Play sentence ${logicalIndex + 1} (${isMeaning ? 'Indonesian meaning' : 'English text'})`}
                        onActivate={onPlaySegment}
                      >
                        {content}
                      </TextSegmentInteraction>
                      {renderChannelJoinSeparator(segment, nextHasRenderable)}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

const CardInterlinearBody = ({
  units,
  indexById,
  cursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  isTitleRole,
  textLang,
  meaningLang,
  disabled,
  showSectionHeaders,
  onPlaySegment
}) => {
  const fullTextHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text';
  const fullMeaningHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning';

  return (
    <div className="space-y-6" data-shared-card-flow="interlinear">
      {units.map((unit, unitIndex) => {
        const unitSegments = unit.segments || [];
        return (
          <section
            key={unit.viewKey}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            className={unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}
          >
            {showSectionHeaders && (
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                {unit.label || 'Section'} {unitIndex + 1}
              </p>
            )}
            {unitSegments.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                Empty section — no sentences yet.
              </p>
            ) : (
              <div className="space-y-4">
                {unitSegments.map((segment, segIdx) => {
                  const logicalIndex = indexById.get(segment.id) ?? segIdx;
                  const textContent = normalizeSegmentDisplayText(segment.text);
                  const meaningContent = normalizeSegmentDisplayText(segment.meaning);
                  const active = isSpeakingCard && cursor.precision === 'segment' && cursor.segmentId === segment.id;
                  const focused = segment.id === focusSegmentId;
                  const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
                  const segmentDisabled = disabled || !playable;
                  const sharedTitle = buildSegmentCoverageTitle({
                    segment,
                    logicalIndex,
                    audioCoverageMap,
                    playable,
                    disabled
                  });

                  return (
                    <div
                      key={segment.id}
                      data-shared-card-segment-pair={segment.id}
                      data-shared-card-index={logicalIndex + 1}
                      className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-x-2.5 items-baseline"
                    >
                      <span
                        aria-hidden="true"
                        className={`select-none text-xs tabular-nums text-right ${
                          active
                            ? 'font-bold text-indigo-600 dark:text-indigo-400'
                            : focused
                              ? 'font-bold text-amber-600 dark:text-amber-400'
                              : 'font-medium text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {logicalIndex + 1}
                      </span>
                      <div className="min-w-0 max-w-[66ch] space-y-1.5">
                        <div
                          lang={textLang}
                          className={`text-left break-words whitespace-pre-line ${
                            isTitleRole
                              ? 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50'
                              : 'text-[1.0625rem] sm:text-[1.125rem] font-normal leading-[1.74] text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {textContent ? (
                            <TextSegmentInteraction
                              segmentId={segment.id}
                              channel="text"
                              interactive
                              disabled={segmentDisabled}
                              active={active}
                              speaking={active && cursor.channel === 'text'}
                              focused={focused}
                              fullChannelHighlighted={fullTextHighlight}
                              dataAttributes={{
                                'data-shared-card-segment': segment.id,
                                'data-shared-card-channel': 'text',
                                'data-shared-card-index': logicalIndex + 1
                              }}
                              title={sharedTitle}
                              accessibleLabel={`Play sentence ${logicalIndex + 1} (English)`}
                              onActivate={onPlaySegment}
                            >
                              {textContent}
                            </TextSegmentInteraction>
                          ) : (
                            <span
                              data-shared-card-missing-text={segment.id}
                              className="text-xs italic text-slate-400 dark:text-slate-500 select-none"
                            >
                              No English text
                            </span>
                          )}
                        </div>

                        <div
                          lang={meaningLang}
                          className="text-left break-words whitespace-pre-line text-[0.9375rem] sm:text-[0.96875rem] leading-[1.62] text-slate-600 dark:text-slate-300"
                        >
                          {meaningContent ? (
                            <TextSegmentInteraction
                              segmentId={segment.id}
                              channel="meaning"
                              interactive
                              disabled={segmentDisabled}
                              active={active}
                              speaking={active && cursor.channel === 'meaning'}
                              focused={focused}
                              fullChannelHighlighted={fullMeaningHighlight}
                              dataAttributes={{
                                'data-shared-card-segment': segment.id,
                                'data-shared-card-channel': 'meaning',
                                'data-shared-card-index': logicalIndex + 1
                              }}
                              title={sharedTitle}
                              accessibleLabel={`Play sentence ${logicalIndex + 1} (Indonesian meaning)`}
                              onActivate={onPlaySegment}
                            >
                              {meaningContent}
                            </TextSegmentInteraction>
                          ) : (
                            <span
                              data-shared-card-missing-meaning={segment.id}
                              className="text-xs italic text-slate-400 dark:text-slate-500 select-none"
                            >
                              No Indonesian meaning
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export const SharedFullCardBody = ({
  card,
  workspace = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  playbackCursor = IDLE_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  onPlaySegment
}) => {
  const units = card?.units || [];
  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const cursor = playbackCursor || IDLE_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const { indexById } = useMemo(() => buildCardSegmentIndexMap(card), [card]);
  const hasMultipleUnits = units.length > 1;
  const hasPersistentEmpty = units.some(unit => unit.identitySource === 'persistent' && (unit.segments?.length || 0) === 0);
  const showSectionHeaders = hasMultipleUnits || hasPersistentEmpty;
  const textLang = workspace?.textLanguage || 'en';
  const meaningLang = workspace?.meaningLanguage || 'id';

  if (units.length === 0) {
    return (
      <p
        className="text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-card-empty="zero-units"
      >
        No sections in this card yet.
      </p>
    );
  }

  if (bilingualLayout === 'separated') {
    return (
      <div className="space-y-6" data-shared-card-separated="true">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 select-none">
            English
          </p>
          <CardChannelFlowBody
            units={units}
            channel="text"
            indexById={indexById}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text'}
            isTitleRole={isTitleRole}
            langTag={textLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            onPlaySegment={onPlaySegment}
          />
        </div>
        <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 select-none">
            Indonesian Meaning
          </p>
          <CardChannelFlowBody
            units={units}
            channel="meaning"
            indexById={indexById}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning'}
            isTitleRole={isTitleRole}
            langTag={meaningLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            onPlaySegment={onPlaySegment}
          />
        </div>
      </div>
    );
  }

  if (bilingualLayout === 'text-only' || bilingualLayout === 'meaning-only') {
    const channel = bilingualLayout === 'meaning-only' ? 'meaning' : 'text';
    return (
      <CardChannelFlowBody
        units={units}
        channel={channel}
        indexById={indexById}
        cursor={cursor}
        focusSegmentId={focusSegmentId}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        isSpeakingCard={isSpeakingCard}
        fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === channel}
        isTitleRole={isTitleRole}
        langTag={channel === 'meaning' ? meaningLang : textLang}
        disabled={disabled}
        showSectionHeaders={showSectionHeaders}
        showMissingInline
        onPlaySegment={onPlaySegment}
      />
    );
  }

  return (
    <CardInterlinearBody
      units={units}
      indexById={indexById}
      cursor={cursor}
      focusSegmentId={focusSegmentId}
      playableSegmentIds={playableSegmentIds}
      audioCoverageMap={audioCoverageMap}
      isSpeakingCard={isSpeakingCard}
      isTitleRole={isTitleRole}
      textLang={textLang}
      meaningLang={meaningLang}
      disabled={disabled}
      showSectionHeaders={showSectionHeaders}
      onPlaySegment={onPlaySegment}
    />
  );
};

/**
 * Cohesive Full Card reading surface. Renders a single paper-like surface without
 * boxed Section or Sentence wrappers, suitable both standalone (`variant="card"`) and
 * embedded inside existing host shells (`variant="embedded"`).
 */
export const SharedCardReadingSurface = ({
  card,
  index = 0,
  workspace = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  playbackCursor = IDLE_CURSOR,
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
  headerActionsSlot = null,
  footerSlot = null,
  variant = 'card'
}) => {
  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const cursor = playbackCursor || IDLE_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const { orderedSegments, indexById } = useMemo(() => buildCardSegmentIndexMap(card), [card]);
  const { hasText, hasMeaning } = useMemo(() => resolveCardChannelAvailability(card), [card]);
  const coverage = useMemo(
    () => summarizeCardPresentationCoverage({ orderedSegments, audioCoverageMap }),
    [orderedSegments, audioCoverageMap]
  );

  const activeSegmentNumber = cursor.precision === 'segment' && cursor.segmentId && indexById.has(cursor.segmentId)
    ? indexById.get(cursor.segmentId) + 1
    : null;
  const channelBadge = cursor.channel === 'meaning' ? 'ID' : cursor.channel === 'text' ? 'EN' : 'Audio';

  const firstVisiblePreview = useMemo(() => {
    const pickMeaning = bilingualLayout === 'meaning-only';
    const first = orderedSegments.find(item => normalizeSegmentDisplayText(pickMeaning ? item.meaning : item.text));
    return first ? normalizeSegmentDisplayText(pickMeaning ? first.meaning : first.text) : '';
  }, [orderedSegments, bilingualLayout]);

  const bodyNode = (
    <div data-shared-card-measure="true">
      <SharedFullCardBody
        card={card}
        workspace={workspace}
        bilingualLayout={bilingualLayout}
        playbackCursor={cursor}
        focusSegmentId={focusSegmentId}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        disabled={disabled}
        onPlaySegment={onPlaySegment}
      />
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div
        className="px-1 py-1 sm:px-2 sm:py-2 space-y-4"
        data-shared-card-id={card?.id}
        data-shared-card-embedded="true"
        data-shared-card-role={isTitleRole ? 'title' : 'paragraph'}
        data-shared-card-layout={bilingualLayout}
        data-shared-card-precision={isSpeakingCard ? cursor.precision : 'none'}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || !hasText}
              onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'text-only' })}
              data-shared-card-play-channel="text"
              title="Play EN — Play English only (entire card, one-time override)"
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
              title="Play ID — Play Indonesian only (entire card, one-time override)"
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
                ? ' · Full Card'
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
    : 'bg-white dark:bg-slate-900/90';

  return (
    <article
      data-shared-card-id={card?.id}
      data-text-player-card={card?.id}
      data-shared-card-role={isTitleRole ? 'title' : 'paragraph'}
      data-shared-card-layout={bilingualLayout}
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
              aria-label={expanded ? 'Collapse card' : 'Expand card'}
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
                    : 'font-medium text-slate-500 dark:text-slate-400'
                }
                data-shared-card-role-label={isTitleRole ? 'title' : 'paragraph'}
              >
                {isTitleRole ? 'Title' : 'Paragraph'}
              </span>
              {card?.units?.length > 1 && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400">{card.units.length} sections</span>
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
                    ? ' · Full Card'
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
              {card?.title || (isTitleRole ? 'Untitled Title Card' : 'Paragraph')}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={disabled || !hasText}
            onClick={() => onPlayCard?.(card.id, { playbackChannelMode: 'text-only' })}
            data-shared-card-play-channel="text"
            title="Play EN — Play English only (entire card, one-time override)"
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
            title="Play ID — Play Indonesian only (entire card, one-time override)"
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
            title="Play entire card"
            aria-label={`Play card ${index + 1}: ${card?.title || (isTitleRole ? 'Title' : 'Paragraph')}`}
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
          {firstVisiblePreview || (card?.units?.length === 0 ? 'No sections in this card yet.' : 'No preview text.')}
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
  playbackCursor = IDLE_CURSOR,
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

  const handleChangeLayout = useCallback(bilingualLayout => {
    const next = updateTextCardPresentationState(activeViewState, { bilingualLayout });
    if (onPresentationStateChange) {
      onPresentationStateChange(next);
    } else {
      setUncontrolledState(next);
    }
  }, [activeViewState, onPresentationStateChange]);

  const handleResetView = useCallback(() => {
    const next = updateTextCardPresentationState(activeViewState, {
      bilingualLayout: DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout
    });
    if (onPresentationStateChange) {
      onPresentationStateChange(next);
    } else {
      setUncontrolledState(next);
    }
  }, [activeViewState, onPresentationStateChange]);

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
      data-shared-bilingual-layout={activeViewState.bilingualLayout}
      className="space-y-4"
    >
      <SharedBilingualLayoutToolbar
        bilingualLayout={activeViewState.bilingualLayout}
        onChangeLayout={handleChangeLayout}
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
                bilingualLayout={activeViewState.bilingualLayout}
                playbackCursor={playbackCursor}
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
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

export default SharedParagraphWorkspaceReader;
