import React, { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextWorkspaceStyleState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import {
  SharedHorizontalFocusCarousel,
  SharedVerticalScrollFocusView
} from './SharedFocusCarousel.jsx';
import {
  IDLE_SHARED_CURSOR,
  getSharedUnitHeading,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  resolveTurnSpeakerPresentation,
  stepCardUnitViewKey
} from './sharedCardPresentationUtils.js';
import { resolvePlaybackSemanticTone } from './sharedDesignTokens.js';

const isConsecutiveSpeakerTurn = (units, unitIndex, speakerAppearanceMap) => {
  const unit = units[unitIndex];
  const prev = unitIndex > 0 ? units[unitIndex - 1] : null;
  if (unit?.kind !== 'turn' || prev?.kind !== 'turn') return false;
  const curInfo = resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap });
  const prevInfo = resolveTurnSpeakerPresentation({ unit: prev, appearanceMap: speakerAppearanceMap });
  return Boolean(curInfo.speakerKey && prevInfo.speakerKey && curInfo.speakerKey === prevInfo.speakerKey);
};

const FocusUnitTopHeader = ({
  unit,
  unitIndex,
  totalUnits,
  speakerAppearanceMap,
  rolePrefix = null,
  segCount = 0,
  isAudible = false,
  cursorState = 'idle',
  cursorChannel = null,
  isRepeatedSpeaker = false,
  emphasize = false,
  showSpeakerInHeader = false
}) => {
  const shortCode = getSharedUnitShortCode(unit, unitIndex);
  const playbackTone = resolvePlaybackSemanticTone({ state: cursorState, channel: cursorChannel });
  const audibleLabel = cursorState === 'paused'
    ? `Paused${cursorChannel === 'meaning' ? ' ID' : cursorChannel === 'text' ? ' EN' : ''}`
    : `Playing${cursorChannel === 'meaning' ? ' ID' : cursorChannel === 'text' ? ' EN' : ''}`;
  if (unit?.kind !== 'turn') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0 text-left">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            emphasize
              ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 ring-1 ring-teal-200/80 dark:ring-teal-800/70'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          {rolePrefix ? `${rolePrefix} · ` : ''}{shortCode} · {getSharedUnitHeading(unit, unitIndex)}
        </span>
        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
          {segCount} {segCount === 1 ? 'sentence' : 'sentences'}
        </span>
        {totalUnits > 1 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
            ({unitIndex + 1}/{totalUnits})
          </span>
        )}
        {isAudible && (
          <span
            data-shared-focus-audible-badge="true"
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              cursorState === 'paused' ? playbackTone.badge : playbackTone.solid
            }`}
          >
            <Radio aria-hidden="true" className="w-3 h-3" />
            <span>{audibleLabel}</span>
          </span>
        )}
      </div>
    );
  }

  const speakerInfo = resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-left">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${
          emphasize
            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 ring-1 ring-indigo-200/80 dark:ring-indigo-800/70'
            : 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300'
        }`}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${speakerInfo.palette.dot}`} />
        <span>
          {rolePrefix ? `${rolePrefix} · ` : ''}{shortCode}
        </span>
      </span>
      {showSpeakerInHeader && (
        <span
          data-shared-focus-preview-speaker={unit.viewKey}
          className={`text-xs font-semibold leading-snug break-words [overflow-wrap:anywhere] ${speakerInfo.palette.nameText}`}
        >
          {speakerInfo.displayName}
        </span>
      )}
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
        {segCount} SG
      </span>
      {totalUnits > 1 && emphasize && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
          ({unitIndex + 1}/{totalUnits})
        </span>
      )}
      {isRepeatedSpeaker && !emphasize && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          · consecutive
        </span>
      )}
      {isAudible && (
        <span
          data-shared-focus-audible-badge="true"
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
            cursorState === 'paused' ? playbackTone.badge : playbackTone.solid
          }`}
        >
          <Radio aria-hidden="true" className="w-3 h-3" />
          <span>{audibleLabel}</span>
        </span>
      )}
    </div>
  );
};

/**
 * Rich Focus Navigation Rail for multi-Unit Cards.
 * Never relies on dots alone: displays SC1 · 4 SG or T1 James · 3 SG with speaker color,
 * active & audible indicators, Previous/Next boundaries, keyboard support, and Return to Playing.
 */
const FocusNavigationRail = ({
  card,
  units,
  speakerAppearanceMap,
  selection,
  playbackCursor = IDLE_SHARED_CURSOR,
  orientation = 'vertical-focus',
  onSelectUnit,
  onFollowAudible
}) => {
  const {
    selectedUnitViewKey,
    selectedUnitIndex,
    audibleUnitViewKey,
    audibleUnitIndex,
    audibleSegmentId,
    unitDivergedFromAudible,
    isCardPrecisionPlaying
  } = selection;
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const playbackTone = resolvePlaybackSemanticTone({ state: cursor.state, channel: cursor.channel });
  const activeUnit = selectedUnitIndex >= 0 ? units[selectedUnitIndex] : null;
  const isTurnMode = (activeUnit?.kind || card?.blockType) === 'turn' || card?.blockType === 'conversation';
  const unitTerms = getSharedUnitTerms(activeUnit || card);
  const isV1Compat = activeUnit?.identitySource === 'v1-paragraph-compat';
  const activeSpeakerInfo = activeUnit?.kind === 'turn'
    ? resolveTurnSpeakerPresentation({ unit: activeUnit, appearanceMap: speakerAppearanceMap })
    : null;
  const audibleUnit = audibleUnitIndex >= 0 ? units[audibleUnitIndex] : null;
  const audibleSpeakerInfo = audibleUnit?.kind === 'turn'
    ? resolveTurnSpeakerPresentation({ unit: audibleUnit, appearanceMap: speakerAppearanceMap })
    : null;
  const audibleShortCode = audibleUnit ? getSharedUnitShortCode(audibleUnit, audibleUnitIndex) : null;
  const audibleUnitSegments = audibleUnit?.segments || [];
  const audibleLocalIndex = audibleUnit && audibleSegmentId
    ? audibleUnitSegments.findIndex(item => item.id === audibleSegmentId)
    : -1;

  const atStart = selectedUnitIndex <= 0;
  const atEnd = selectedUnitIndex >= units.length - 1;

  const stepBy = delta => {
    const step = stepCardUnitViewKey({ units, currentViewKey: selectedUnitViewKey, delta });
    if (step.nextViewKey && step.nextViewKey !== selectedUnitViewKey) {
      onSelectUnit?.(step.nextViewKey);
    }
  };

  const handleKeyDown = event => {
    if (!units.length) return;
    if (event.key === 'ArrowRight' || (orientation === 'vertical-focus' && event.key === 'ArrowDown')) {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === 'ArrowLeft' || (orientation === 'vertical-focus' && event.key === 'ArrowUp')) {
      event.preventDefault();
      stepBy(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (units[0]?.viewKey && units[0].viewKey !== selectedUnitViewKey) onSelectUnit?.(units[0].viewKey);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = units[units.length - 1];
      if (last?.viewKey && last.viewKey !== selectedUnitViewKey) onSelectUnit?.(last.viewKey);
    }
  };

  return (
    <div
      className="mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800/80 space-y-2 text-left"
      data-shared-part-nav="true"
      data-shared-focus-nav="true"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums"
            data-shared-part-position="true"
            data-shared-focus-position="true"
          >
            {unitTerms.label} {Math.max(1, selectedUnitIndex + 1)} of {units.length}
          </span>
          {activeSpeakerInfo && (
            <span
              data-shared-part-nav-speaker="true"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold max-w-full ${activeSpeakerInfo.palette.pill}`}
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${activeSpeakerInfo.palette.dot}`} />
              <span className="truncate max-w-[10rem] sm:max-w-[16rem]">{activeSpeakerInfo.displayName}</span>
            </span>
          )}
          {isV1Compat && (
            <span
              className="text-[11px] font-medium text-slate-400 dark:text-slate-500"
              data-shared-part-compat-badge="true"
              title="Virtual compatibility section for v1 Paragraph schema"
            >
              · Virtual v1 section
            </span>
          )}
          {isCardPrecisionPlaying && (
            <span
              data-shared-part-full-notice="true"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${playbackTone.bgSoft} ${playbackTone.border} ${playbackTone.text}`}
            >
              <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>
                {cursor.state === 'paused' ? 'Paused' : 'Playing'} {cursor.channel === 'meaning' ? 'ID' : 'EN'} · Full {isTurnMode ? 'Scene' : 'Card'} · Browse {unitTerms.plural} freely
              </span>
            </span>
          )}
          {!isCardPrecisionPlaying && unitDivergedFromAudible && (
            <button
              type="button"
              onClick={onFollowAudible}
              data-shared-part-follow-audio="true"
              data-shared-focus-return-to-playing="true"
              className={`min-h-8 sm:min-h-7 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${playbackTone.bgSoft} ${playbackTone.border} ${playbackTone.text} hover:brightness-95 dark:hover:brightness-110`}
            >
              <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>
                Return to Playing · {audibleShortCode}
                {audibleSpeakerInfo?.isAssigned ? ` ${audibleSpeakerInfo.displayName}` : ''}
                {audibleLocalIndex >= 0 ? ` · SG${audibleLocalIndex + 1}/${audibleUnitSegments.length}` : ''}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={atStart}
            onClick={() => stepBy(-1)}
            data-shared-part-prev="true"
            data-shared-focus-prev="true"
            aria-label={`Previous ${unitTerms.lower}`}
            className="min-h-9 sm:min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={atEnd}
            onClick={() => stepBy(1)}
            data-shared-part-next="true"
            data-shared-focus-next="true"
            aria-label={`Next ${unitTerms.lower}`}
            className="min-h-9 sm:min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span>Next</span>
            <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Rich Unit Chip Rail (SC1 · 4 SG | SC2 · 4 SG or T1 James · 3 SG | ...) */}
      <div
        role="group"
        aria-label={`Jump to ${unitTerms.lower}`}
        data-shared-focus-rail="true"
        className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 min-w-0 max-w-full"
      >
        {units.map((unit, idx) => {
          const selected = unit.viewKey === selectedUnitViewKey;
          const isAudible = unit.viewKey === audibleUnitViewKey;
          const segCount = unit.segments?.length || 0;
          const shortCode = getSharedUnitShortCode(unit, idx);
          const unitSpeaker = unit.kind === 'turn'
            ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
            : null;
          const fullTitle = unitSpeaker
            ? `${shortCode} ${unitSpeaker.displayName} · ${segCount} SG${isAudible ? ' (playing audio)' : ''}`
            : `${shortCode} · ${segCount} SG${isAudible ? ' (playing audio)' : ''}`;
          return (
            <button
              key={unit.viewKey}
              type="button"
              aria-pressed={selected}
              aria-label={fullTitle}
              title={fullTitle}
              data-shared-part-pill={unit.viewKey}
              data-shared-focus-rail-item={unit.viewKey}
              data-shared-focus-rail-unit-id={unit.id || undefined}
              data-shared-focus-rail-code={shortCode}
              data-shared-focus-rail-segments={segCount}
              onClick={() => onSelectUnit?.(unit.viewKey)}
              className={`min-h-9 sm:min-h-8 shrink-0 max-w-full px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 transition-all duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selected
                  ? (isAudible ? `${playbackTone.solid} shadow-xs` : (isTurnMode ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-500/40' : 'bg-teal-600 text-white shadow-xs ring-1 ring-teal-500/40'))
                  : isAudible
                    ? playbackTone.chipAudible
                    : segCount === 0
                      ? 'border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-400'
                      : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/75 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {unitSpeaker && (
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full shrink-0 ${selected ? 'bg-white/90' : unitSpeaker.palette.dot}`}
                />
              )}
              <span className="shrink-0 font-bold">{shortCode}</span>
              {unitSpeaker && (
                <>
                  {' '}
                  <span className="truncate max-w-[7.5rem] sm:max-w-[11rem] font-medium">
                    {unitSpeaker.displayName}
                  </span>
                </>
              )}
              <span
                aria-hidden="true"
                className={selected ? 'text-indigo-200' : 'text-slate-300 dark:text-slate-600'}
              >
                {' · '}
              </span>
              <span className={`shrink-0 text-[11px] ${selected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                {segCount} SG
              </span>
              {isAudible && !selected && (
                <Radio aria-hidden="true" className={`w-3 h-3 shrink-0 ${playbackTone.text}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Single-Unit Focus surface (e.g., P2 — On the Train): renders the complete Unit cleanly
 * with Workspace Style and suppresses unnecessary carousel controls, rail, and neighbor previews.
 */
const FocusSingleUnitView = ({
  card,
  unit,
  workspace,
  speakerAppearanceMap,
  presentationState = null,
  bilingualLayout,
  workspaceStyle,
  partLayout,
  playbackCursor,
  focusSegmentId,
  contextualState = null,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onPlaySegment,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const playbackTone = resolvePlaybackSemanticTone({ state: cursor.state, channel: cursor.channel });
  const isTurn = unit.kind === 'turn';
  const isAudible = unit.viewKey === selection.audibleUnitViewKey;
  const isV1Compat = unit.identitySource === 'v1-paragraph-compat';
  const speakerInfo = isTurn ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap }) : null;

  return (
    <div
      data-shared-part-layout={partLayout}
      data-shared-focus-single-unit="true"
      className="space-y-2.5"
    >
      {(isV1Compat || selection.isCardPrecisionPlaying) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-left">
          {isV1Compat && (
            <span
              className="text-[11px] font-medium text-slate-400 dark:text-slate-500"
              data-shared-part-compat-badge="true"
              title="Virtual compatibility section for v1 Paragraph schema"
            >
              Virtual v1 section
            </span>
          )}
          {selection.isCardPrecisionPlaying && (
            <span
              data-shared-part-full-notice="true"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${playbackTone.bgSoft} ${playbackTone.border} ${playbackTone.text}`}
            >
              <Radio aria-hidden="true" className="w-3 h-3" />
              <span>{cursor.state === 'paused' ? 'Paused' : 'Playing'} {cursor.channel === 'meaning' ? 'ID' : 'EN'} · Full {isTurn ? 'Scene' : 'Card'}</span>
            </span>
          )}
        </div>
      )}
      <div
        data-shared-part-focused={unit.viewKey}
        data-shared-part-focused-unit-id={unit.id || undefined}
        data-shared-part-active="true"
        data-shared-part-audible={isAudible ? 'true' : undefined}
        data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
        className={`rounded-2xl border p-4 sm:p-5 bg-white dark:bg-slate-900/90 transition-colors motion-reduce:transition-none ${
          isAudible || selection.isCardPrecisionPlaying
            ? playbackTone.cardActive
            : 'border-slate-200/90 dark:border-slate-800'
        }`}
      >
        <div className="mb-3 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <FocusUnitTopHeader
            unit={unit}
            unitIndex={0}
            totalUnits={1}
            speakerAppearanceMap={speakerAppearanceMap}
            segCount={unit.segments?.length || 0}
            isAudible={isAudible}
            cursorState={cursor.state}
            cursorChannel={cursor.channel}
            emphasize
          />
        </div>
        <SharedBilingualUnitsBody
          card={card}
          unitsOverride={[unit]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={presentationState}
          bilingualLayout={bilingualLayout}
          readerMode="focus"
          workspaceStyle={resolvedStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          contextualState={contextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          forceSectionHeaders={isTurn}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={onSelectContextualSegment}
          onFollowContextualAudible={onFollowContextualAudible}
          onDismissContextualTarget={onDismissContextualTarget}
        />
      </div>
    </div>
  );
};

/**
 * 4B2 / C-HF2 Focus Mode Surface: displays one active Content Unit (Paragraph Section
 * or Conversation Turn) per expanded Card with:
 * - Horizontal Focus: Swiper React centered carousel (`SharedHorizontalFocusCarousel`).
 * - Vertical Focus: document flow with explicit Unit navigation (`SharedVerticalScrollFocusView`).
 * - Single-Unit Cards bypass all carousel/scroll mechanics completely.
 */
export const SharedFocusView = ({
  card,
  units,
  workspace = null,
  speakerAppearanceMap,
  presentationState = null,
  partLayout = 'vertical-focus',
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onFollowAudible,
  onPlaySegment,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null
}) => {
  const effectiveOrientation = partLayout === 'horizontal-focus' ? 'horizontal-focus' : 'vertical-focus';
  const verticalNavigationRef = useRef(null);
  const navigateVertically = useCallback(viewKey => {
    if (viewKey !== selection.selectedUnitViewKey) verticalNavigationRef.current = viewKey;
    onSelectUnit?.(viewKey);
  }, [onSelectUnit, selection.selectedUnitViewKey]);

  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const renderUnitHeader = useCallback(headerProps => (
    <FocusUnitTopHeader
      speakerAppearanceMap={speakerAppearanceMap}
      cursorState={cursor.state}
      cursorChannel={cursor.channel}
      {...headerProps}
    />
  ), [speakerAppearanceMap, cursor.state, cursor.channel]);

  if (units.length === 1) {
    return (
      <div data-shared-part-view="true" data-shared-focus-view="true">
        <FocusSingleUnitView
          card={card}
          unit={units[0]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={presentationState}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          partLayout={effectiveOrientation}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          contextualState={contextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={onSelectContextualSegment}
          onFollowContextualAudible={onFollowContextualAudible}
          onDismissContextualTarget={onDismissContextualTarget}
        />
      </div>
    );
  }

  return (
    <div data-shared-part-view="true" data-shared-focus-view="true">
      <FocusNavigationRail
        card={card}
        units={units}
        speakerAppearanceMap={speakerAppearanceMap}
        selection={selection}
        playbackCursor={playbackCursor}
        orientation={effectiveOrientation}
        onSelectUnit={effectiveOrientation === 'vertical-focus' ? navigateVertically : onSelectUnit}
        onFollowAudible={onFollowAudible}
      />
      {effectiveOrientation === 'horizontal-focus' ? (
        <SharedHorizontalFocusCarousel
          card={card}
          units={units}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={presentationState}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          contextualState={contextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onSelectUnit={onSelectUnit}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={onSelectContextualSegment}
          onFollowContextualAudible={onFollowContextualAudible}
          onDismissContextualTarget={onDismissContextualTarget}
          renderUnitHeader={renderUnitHeader}
          isConsecutiveSpeakerTurn={isConsecutiveSpeakerTurn}
        />
      ) : (
        <SharedVerticalScrollFocusView
          card={card}
          units={units}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={presentationState}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          contextualState={contextualState}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onNavigateUnit={navigateVertically}
          navigationRef={verticalNavigationRef}
          onPlaySegment={onPlaySegment}
          onSelectContextualSegment={onSelectContextualSegment}
          onFollowContextualAudible={onFollowContextualAudible}
          onDismissContextualTarget={onDismissContextualTarget}
          renderUnitHeader={renderUnitHeader}
          isConsecutiveSpeakerTurn={isConsecutiveSpeakerTurn}
        />
      )}
    </div>
  );
};

export default SharedFocusView;
