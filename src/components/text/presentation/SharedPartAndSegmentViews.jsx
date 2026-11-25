import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Radio } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import TextSegmentInteraction from './TextSegmentInteraction.jsx';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  buildParagraphBodyStyle,
  buildSharedSegmentRenderFlags,
  getSharedUnitHeading,
  getSharedUnitTerms,
  isPrefersReducedMotion,
  normalizeSegmentDisplayText,
  resolveSegmentCoverageStatuses,
  resolveTurnSpeakerPresentation,
  stepCardSegmentId,
  stepCardUnitViewKey
} from './sharedCardPresentationUtils.js';

const escapeSelectorValue = value => {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

const PartUnitIdentityHeader = ({
  unit,
  unitIndex,
  speakerAppearanceMap,
  rolePrefix = null,
  segCount = 0,
  isAudible = false,
  isRepeatedSpeaker = false,
  emphasize = false
}) => {
  if (unit?.kind !== 'turn') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
        {emphasize ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-200">
            {rolePrefix ? `${rolePrefix} · ` : ''}{getSharedUnitHeading(unit, unitIndex)}
          </span>
        ) : (
          <span className="font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            {rolePrefix ? `${rolePrefix} · ` : ''}{getSharedUnitHeading(unit, unitIndex)}
          </span>
        )}
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
        <span className="text-slate-500 dark:text-slate-400">
          {segCount} {segCount === 1 ? 'sentence' : 'sentences'}
        </span>
        {isAudible && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Radio aria-hidden="true" className="w-3 h-3" />
            <span>Audible</span>
          </span>
        )}
      </div>
    );
  }

  const speakerInfo = resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap });
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <span
        aria-hidden="true"
        className={`h-6 w-6 rounded-full text-[11px] font-bold inline-flex items-center justify-center shrink-0 select-none ${speakerInfo.palette.avatar}`}
      >
        {speakerInfo.monogram}
      </span>
      <span
        data-shared-turn-speaker={unit.viewKey}
        className={`text-xs sm:text-[13px] font-semibold leading-snug break-words ${speakerInfo.palette.nameText}`}
      >
        {speakerInfo.displayName}
      </span>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          emphasize
            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200'
            : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400'
        }`}
      >
        {rolePrefix ? `${rolePrefix} · ` : ''}{unit.label || 'Speaker Turn'} {unitIndex + 1}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {segCount} {segCount === 1 ? 'sentence' : 'sentences'}
      </span>
      {isRepeatedSpeaker && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          · consecutive turn
        </span>
      )}
      {isAudible && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Radio aria-hidden="true" className="w-3 h-3" />
          <span>Audible</span>
        </span>
      )}
    </div>
  );
};

const PartSectionNavigator = ({
  card,
  units,
  speakerAppearanceMap,
  selection,
  onSelectUnit,
  onFollowAudible
}) => {
  const { selectedUnitViewKey, selectedUnitIndex, audibleUnitViewKey, unitDivergedFromAudible, isCardPrecisionPlaying } = selection;
  const activeUnit = selectedUnitIndex >= 0 ? units[selectedUnitIndex] : null;
  const isTurnMode = (activeUnit?.kind || card?.blockType) === 'turn' || card?.blockType === 'conversation';
  const unitTerms = getSharedUnitTerms(activeUnit || card);
  const isV1Compat = activeUnit?.identitySource === 'v1-paragraph-compat';
  const activeSpeakerInfo = activeUnit?.kind === 'turn'
    ? resolveTurnSpeakerPresentation({ unit: activeUnit, appearanceMap: speakerAppearanceMap })
    : null;
  const audibleUnit = selection.audibleUnitIndex >= 0 ? units[selection.audibleUnitIndex] : null;
  const audibleSpeakerInfo = audibleUnit?.kind === 'turn'
    ? resolveTurnSpeakerPresentation({ unit: audibleUnit, appearanceMap: speakerAppearanceMap })
    : null;

  const handleGroupKeyDown = event => {
    if (!units.length) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const step = stepCardUnitViewKey({ units, currentViewKey: selectedUnitViewKey, delta: 1 });
      if (step.nextViewKey && step.nextViewKey !== selectedUnitViewKey) onSelectUnit?.(step.nextViewKey);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = stepCardUnitViewKey({ units, currentViewKey: selectedUnitViewKey, delta: -1 });
      if (step.nextViewKey && step.nextViewKey !== selectedUnitViewKey) onSelectUnit?.(step.nextViewKey);
    }
  };

  if (!units.length) return null;

  const atStart = selectedUnitIndex <= 0;
  const atEnd = selectedUnitIndex >= units.length - 1;

  return (
    <div
      className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5"
      data-shared-part-nav="true"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums" data-shared-part-position="true">
          {unitTerms.label} {Math.max(1, selectedUnitIndex + 1)} of {units.length}
        </span>
        {activeSpeakerInfo && (
          <span
            data-shared-part-nav-speaker="true"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${activeSpeakerInfo.palette.pill}`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${activeSpeakerInfo.palette.dot}`} />
            <span>{activeSpeakerInfo.displayName}</span>
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
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/60 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-200"
          >
            <Radio aria-hidden="true" className="w-3 h-3" />
            <span>Playing Full {isTurnMode ? 'Scene' : 'Card'} audio · Browse {unitTerms.plural} freely</span>
          </span>
        )}
        {!isCardPrecisionPlaying && unitDivergedFromAudible && (
          <button
            type="button"
            onClick={onFollowAudible}
            data-shared-part-follow-audio="true"
            className="min-h-8 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Radio aria-hidden="true" className="w-3 h-3" />
            <span>
              Playing {isTurnMode ? `Turn ${selection.audibleUnitIndex + 1}` : `${unitTerms.label} ${selection.audibleUnitIndex + 1}`}
              {audibleSpeakerInfo?.isAssigned ? ` (${audibleSpeakerInfo.displayName})` : ''} · Follow
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" onKeyDown={handleGroupKeyDown}>
        <button
          type="button"
          disabled={atStart}
          onClick={() => {
            const step = stepCardUnitViewKey({ units, currentViewKey: selectedUnitViewKey, delta: -1 });
            if (step.nextViewKey) onSelectUnit?.(step.nextViewKey);
          }}
          data-shared-part-prev="true"
          aria-label={`Previous ${unitTerms.lower}`}
          className="order-1 min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        {units.length > 1 && units.length <= 12 && (
          <div role="group" aria-label={`Jump to ${unitTerms.lower}`} className="order-3 sm:order-2 w-full sm:w-auto flex flex-wrap items-center gap-1">
            {units.map((unit, idx) => {
              const selected = unit.viewKey === selectedUnitViewKey;
              const isAudible = unit.viewKey === audibleUnitViewKey;
              const unitSpeaker = unit.kind === 'turn'
                ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
                : null;
              return (
                <button
                  key={unit.viewKey}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${getSharedUnitTerms(unit).label} ${idx + 1}${unitSpeaker ? ` · ${unitSpeaker.displayName}` : ''}${isAudible ? ' (playing audio)' : ''}`}
                  title={unitSpeaker ? `${getSharedUnitTerms(unit).label} ${idx + 1} · ${unitSpeaker.displayName}` : `${getSharedUnitTerms(unit).label} ${idx + 1}`}
                  data-shared-part-pill={unit.viewKey}
                  onClick={() => onSelectUnit?.(unit.viewKey)}
                  className={`min-h-11 min-w-10 sm:min-h-8 sm:min-w-8 px-2 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isAudible
                        ? 'border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                  }`}
                >
                  {unitSpeaker && !selected && (
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${unitSpeaker.palette.dot}`} />
                  )}
                  <span>{idx + 1}</span>
                  {isAudible && !selected && !unitSpeaker && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          disabled={atEnd}
          onClick={() => {
            const step = stepCardUnitViewKey({ units, currentViewKey: selectedUnitViewKey, delta: 1 });
            if (step.nextViewKey) onSelectUnit?.(step.nextViewKey);
          }}
          data-shared-part-next="true"
          aria-label={`Next ${unitTerms.lower}`}
          className="order-2 sm:order-3 min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span>Next</span>
          <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const PartHorizontalFocusView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onSelectUnit,
  onPlaySegment
}) => {
  const trackRef = useRef(null);
  const programmaticScrollRef = useRef(false);
  const swipeTimerRef = useRef(null);
  const settleResetTimerRef = useRef(null);
  const mountedTrackRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !selection.selectedUnitViewKey) return;
    const isInitialMount = !mountedTrackRef.current;
    mountedTrackRef.current = true;
    const escaped = escapeSelectorValue(selection.selectedUnitViewKey);
    const slide = track.querySelector(`[data-shared-part-slide="${escaped}"]`);
    if (!slide) return;
    const targetLeft = slide.offsetLeft;
    if (Math.abs(track.scrollLeft - targetLeft) <= 2) return;
    programmaticScrollRef.current = true;
    window.clearTimeout(settleResetTimerRef.current);
    const instant = isInitialMount || isPrefersReducedMotion();
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left: targetLeft, behavior: instant ? 'instant' : 'smooth' });
    } else {
      track.scrollLeft = targetLeft;
    }
    settleResetTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, instant ? 40 : 420);
  }, [selection.selectedUnitViewKey, units.length]);

  useEffect(() => () => {
    window.clearTimeout(swipeTimerRef.current);
    window.clearTimeout(settleResetTimerRef.current);
  }, []);

  const markManualTrackGesture = useCallback(() => {
    programmaticScrollRef.current = false;
    window.clearTimeout(settleResetTimerRef.current);
  }, []);

  const handleTrackScroll = useCallback(() => {
    if (programmaticScrollRef.current || !trackRef.current || !units.length) return;
    window.clearTimeout(swipeTimerRef.current);
    swipeTimerRef.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (!track || programmaticScrollRef.current) return;
      const scrollLeft = track.scrollLeft || 0;
      let nearest = units[0];
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const unit of units) {
        const slide = track.querySelector(`[data-shared-part-slide="${escapeSelectorValue(unit.viewKey)}"]`);
        if (!slide) continue;
        const dist = Math.abs(slide.offsetLeft - scrollLeft);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = unit;
        }
      }
      if (nearest?.viewKey && nearest.viewKey !== selection.selectedUnitViewKey) {
        onSelectUnit?.(nearest.viewKey);
      }
    }, 90);
  }, [units, selection.selectedUnitViewKey, onSelectUnit]);

  return (
    <div
      ref={trackRef}
      onTouchStart={markManualTrackGesture}
      onPointerDown={markManualTrackGesture}
      onWheel={markManualTrackGesture}
      onScroll={handleTrackScroll}
      data-shared-part-layout="horizontal-focus"
      data-shared-part-track="horizontal"
      aria-label={`Horizontal ${getSharedUnitTerms(card).plural} track`}
      className="relative flex items-start gap-4 overflow-x-auto overflow-y-visible snap-x snap-mandatory overscroll-x-contain scroll-smooth motion-reduce:scroll-auto custom-scrollbar pb-2"
    >
      {units.map((unit, unitIndex) => {
        const isSelected = unit.viewKey === selection.selectedUnitViewKey;
        const isAudible = unit.viewKey === selection.audibleUnitViewKey;
        const segCount = unit.segments?.length || 0;
        const isTurn = unit.kind === 'turn';
        const speakerInfo = isTurn ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap }) : null;
        const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
        const prevSpeakerInfo = prevUnit?.kind === 'turn'
          ? resolveTurnSpeakerPresentation({ unit: prevUnit, appearanceMap: speakerAppearanceMap })
          : null;
        const isRepeatedSpeaker = Boolean(
          isTurn
          && prevSpeakerInfo?.speakerKey
          && speakerInfo?.speakerKey
          && prevSpeakerInfo.speakerKey === speakerInfo.speakerKey
        );
        return (
          <div
            key={unit.viewKey}
            data-shared-part-slide={unit.viewKey}
            data-shared-part-active={isSelected ? 'true' : undefined}
            data-shared-part-audible={isAudible ? 'true' : undefined}
            data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
            aria-hidden={!isSelected || undefined}
            inert={!isSelected}
            className={`w-full min-w-full shrink-0 snap-start snap-always rounded-xl border ${
              isTurn ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}` : ''
            } p-4 sm:p-6 transition-colors motion-reduce:transition-none ${
              isAudible
                ? 'border-indigo-400/90 dark:border-indigo-500/80 bg-indigo-50/15 dark:bg-indigo-950/20'
                : isSelected
                  ? 'border-slate-300/90 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/50'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/35'
            }`}
          >
            <div className="mb-3.5 pb-2.5 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <PartUnitIdentityHeader
                unit={unit}
                unitIndex={unitIndex}
                speakerAppearanceMap={speakerAppearanceMap}
                segCount={segCount}
                isAudible={isAudible}
                isRepeatedSpeaker={isRepeatedSpeaker}
              />
            </div>
            <SharedBilingualUnitsBody
              card={card}
              unitsOverride={[unit]}
              workspace={workspace}
              speakerAppearanceMap={speakerAppearanceMap}
              bilingualLayout={bilingualLayout}
              workspaceStyle={workspaceStyle}
              playbackCursor={playbackCursor}
              focusSegmentId={focusSegmentId}
              playableSegmentIds={playableSegmentIds}
              audioCoverageMap={audioCoverageMap}
              disabled={disabled}
              forceSectionHeaders={false}
              onPlaySegment={onPlaySegment}
            />
          </div>
        );
      })}
    </div>
  );
};

const PartVerticalFocusView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onSelectUnit,
  onPlaySegment
}) => {
  const idx = Math.max(0, selection.selectedUnitIndex);
  const prevUnit = idx > 0 ? units[idx - 1] : null;
  const currentUnit = units[idx];
  const nextUnit = idx < units.length - 1 ? units[idx + 1] : null;
  const cardTerms = getSharedUnitTerms(card);

  const checkRepeatedSpeaker = unitIndex => {
    const unit = units[unitIndex];
    const prev = unitIndex > 0 ? units[unitIndex - 1] : null;
    if (unit?.kind !== 'turn' || prev?.kind !== 'turn') return false;
    const curInfo = resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap });
    const prevInfo = resolveTurnSpeakerPresentation({ unit: prev, appearanceMap: speakerAppearanceMap });
    return Boolean(curInfo.speakerKey && prevInfo.speakerKey && curInfo.speakerKey === prevInfo.speakerKey);
  };

  const renderNeighbor = ({ unit, unitIndex, roleLabel, testRole }) => {
    const isAudible = unit.viewKey === selection.audibleUnitViewKey;
    const isTurn = unit.kind === 'turn';
    const speakerInfo = isTurn ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap }) : null;
    return (
      <div
        key={unit.viewKey}
        data-shared-part-neighbor={testRole}
        data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
        className={`rounded-xl border ${
          isTurn ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}` : ''
        } px-4 py-3.5 sm:px-6 sm:py-4 transition-colors motion-reduce:transition-none ${
          isAudible
            ? 'border-indigo-300/80 dark:border-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/20'
            : 'border-slate-200/80 dark:border-slate-800/90 bg-slate-50/75 dark:bg-slate-900/45 opacity-90 hover:opacity-100'
        }`}
      >
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <PartUnitIdentityHeader
            unit={unit}
            unitIndex={unitIndex}
            speakerAppearanceMap={speakerAppearanceMap}
            rolePrefix={roleLabel}
            segCount={unit.segments?.length || 0}
            isAudible={isAudible}
            isRepeatedSpeaker={checkRepeatedSpeaker(unitIndex)}
          />
          <button
            type="button"
            onClick={() => onSelectUnit?.(unit.viewKey)}
            data-shared-part-focus={unit.viewKey}
            className="min-h-11 sm:min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Focus {getSharedUnitTerms(unit).lower}
          </button>
        </div>
        <SharedBilingualUnitsBody
          card={card}
          unitsOverride={[unit]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          forceSectionHeaders={false}
          onPlaySegment={onPlaySegment}
        />
      </div>
    );
  };

  const currentAudible = currentUnit.viewKey === selection.audibleUnitViewKey;
  const currentIsTurn = currentUnit.kind === 'turn';
  const currentSpeaker = currentIsTurn ? resolveTurnSpeakerPresentation({ unit: currentUnit, appearanceMap: speakerAppearanceMap }) : null;

  return (
    <div className="space-y-3.5" data-shared-part-layout="vertical-focus">
      {prevUnit ? (
        renderNeighbor({ unit: prevUnit, unitIndex: idx - 1, roleLabel: 'Previous', testRole: 'previous' })
      ) : (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1" data-shared-part-boundary="start">
          Start of {cardTerms.cardLower} · {cardTerms.label} 1 of {units.length}
        </p>
      )}

      <div
        data-shared-part-focused={currentUnit.viewKey}
        data-shared-part-active="true"
        data-shared-part-audible={currentAudible ? 'true' : undefined}
        data-shared-turn-speaker-palette={currentSpeaker?.palette?.id || undefined}
        className={`rounded-2xl border-2 ${
          currentIsTurn ? `border-l-4 ${currentAudible ? currentSpeaker.palette.rail : currentSpeaker.palette.railMuted}` : ''
        } p-5 sm:p-7 shadow-md transition-colors motion-reduce:transition-none ${
          currentAudible
            ? 'border-indigo-500/90 dark:border-indigo-400 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/15'
            : 'border-indigo-300/90 dark:border-indigo-600/80 bg-white dark:bg-slate-900 ring-1 ring-indigo-400/15'
        }`}
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
          <PartUnitIdentityHeader
            unit={currentUnit}
            unitIndex={idx}
            speakerAppearanceMap={speakerAppearanceMap}
            rolePrefix="Focused"
            segCount={currentUnit.segments?.length || 0}
            isAudible={currentAudible}
            isRepeatedSpeaker={checkRepeatedSpeaker(idx)}
            emphasize
          />
        </div>
        <SharedBilingualUnitsBody
          card={card}
          unitsOverride={[currentUnit]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          forceSectionHeaders={false}
          onPlaySegment={onPlaySegment}
        />
      </div>

      {nextUnit ? (
        renderNeighbor({ unit: nextUnit, unitIndex: idx + 1, roleLabel: 'Next', testRole: 'next' })
      ) : (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1" data-shared-part-boundary="end">
          End of {cardTerms.cardLower} · {cardTerms.label} {units.length} of {units.length}
        </p>
      )}
    </div>
  );
};

const PartVerticalListView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onSelectUnit,
  onPlaySegment
}) => (
  <div className="space-y-4" data-shared-part-layout="vertical-list">
    {units.map((unit, unitIndex) => {
      const isSelected = unit.viewKey === selection.selectedUnitViewKey;
      const isAudible = unit.viewKey === selection.audibleUnitViewKey;
      const segCount = unit.segments?.length || 0;
      const isTurn = unit.kind === 'turn';
      const speakerInfo = isTurn ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap }) : null;
      const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
      const prevSpeakerInfo = prevUnit?.kind === 'turn'
        ? resolveTurnSpeakerPresentation({ unit: prevUnit, appearanceMap: speakerAppearanceMap })
        : null;
      const isRepeatedSpeaker = Boolean(
        isTurn
        && prevSpeakerInfo?.speakerKey
        && speakerInfo?.speakerKey
        && prevSpeakerInfo.speakerKey === speakerInfo.speakerKey
      );
      return (
        <div
          key={unit.viewKey}
          data-shared-part-list-item={unit.viewKey}
          data-shared-part-active={isSelected ? 'true' : undefined}
          data-shared-part-audible={isAudible ? 'true' : undefined}
          data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
          className={`rounded-xl border ${
            isTurn ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}` : ''
          } p-4 sm:p-6 transition-colors motion-reduce:transition-none ${
            isAudible
              ? 'border-indigo-400/90 dark:border-indigo-500/80 bg-indigo-50/15 dark:bg-indigo-950/20 ring-1 ring-indigo-500/15'
              : isSelected
                ? 'border-slate-400/90 dark:border-slate-500 bg-white dark:bg-slate-900 ring-1 ring-slate-400/20 shadow-sm'
                : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/35 dark:bg-slate-900/40'
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100/90 dark:border-slate-800/75">
            <PartUnitIdentityHeader
              unit={unit}
              unitIndex={unitIndex}
              speakerAppearanceMap={speakerAppearanceMap}
              segCount={segCount}
              isAudible={isAudible}
              isRepeatedSpeaker={isRepeatedSpeaker}
            />
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectUnit?.(unit.viewKey)}
              data-shared-part-select={unit.viewKey}
              className={`min-h-11 sm:min-h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
              }`}
            >
              {isSelected ? 'Selected' : 'Select'}
            </button>
          </div>
          <SharedBilingualUnitsBody
            card={card}
            unitsOverride={[unit]}
            workspace={workspace}
            speakerAppearanceMap={speakerAppearanceMap}
            bilingualLayout={bilingualLayout}
            workspaceStyle={workspaceStyle}
            playbackCursor={playbackCursor}
            focusSegmentId={focusSegmentId}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            disabled={disabled}
            forceSectionHeaders={false}
            onPlaySegment={onPlaySegment}
          />
        </div>
      );
    })}
  </div>
);

/**
 * Focused Part (Section / Speaker Turn) view supporting Horizontal Focus, Vertical Focus, and Vertical List.
 */
export const SharedCardPartView = ({
  card,
  lookup,
  workspace = null,
  partLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.partLayout,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onFollowAudible,
  onPlaySegment
}) => {
  const units = lookup?.units || card?.units || [];
  const speakerAppearanceMap = useMemo(() => buildCardSpeakerAppearanceMap(card), [card]);

  if (!units.length) {
    return (
      <p
        className="text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-part-empty="zero-units"
      >
        No {getSharedUnitTerms(card).plural} in this {getSharedUnitTerms(card).cardLower} to focus.
      </p>
    );
  }

  const LayoutView = partLayout === 'horizontal-focus'
    ? PartHorizontalFocusView
    : partLayout === 'vertical-focus'
      ? PartVerticalFocusView
      : PartVerticalListView;

  return (
    <div data-shared-part-view="true">
      <PartSectionNavigator
        card={card}
        units={units}
        speakerAppearanceMap={speakerAppearanceMap}
        selection={selection}
        onSelectUnit={onSelectUnit}
        onFollowAudible={onFollowAudible}
      />
      <LayoutView
        card={card}
        units={units}
        workspace={workspace}
        speakerAppearanceMap={speakerAppearanceMap}
        bilingualLayout={bilingualLayout}
        workspaceStyle={workspaceStyle}
        playbackCursor={playbackCursor}
        focusSegmentId={focusSegmentId}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        disabled={disabled}
        selection={selection}
        onSelectUnit={onSelectUnit}
        onPlaySegment={onPlaySegment}
      />
    </div>
  );
};

/**
 * Focused Segment (Sentence) study stage preserving exact Segment ID, Section context,
 * speaker attribution, bilingual preference, A1 interaction primitive, and passive browsing.
 */
export const SharedCardSegmentView = ({
  card,
  lookup,
  workspace = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectSegment,
  onFollowAudible,
  onPlaySegment
}) => {
  const entries = lookup?.entries || [];
  const speakerAppearanceMap = useMemo(() => buildCardSpeakerAppearanceMap(card), [card]);
  const cardTerms = getSharedUnitTerms(card);
  if (!entries.length) {
    return (
      <p
        className="text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-segment-empty="true"
      >
        No sentences available to focus in this {cardTerms.cardLower}.
      </p>
    );
  }

  const entry = selection.selectedEntry || entries[0];
  const segment = entry.segment;
  const logicalIndex = entry.logicalIndex;
  const unitSegments = entry.unit?.segments || [];
  const indexInTurn = unitSegments.findIndex(item => item.id === segment.id);
  const unitTerms = getSharedUnitTerms(entry.unit || card);
  const isTurn = entry.unit?.kind === 'turn';
  const speakerInfo = isTurn
    ? resolveTurnSpeakerPresentation({ unit: entry.unit, appearanceMap: speakerAppearanceMap })
    : null;
  const legacySegmentSpeaker = !isTurn ? normalizeSegmentDisplayText(segment.speaker) : '';
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const textContent = normalizeSegmentDisplayText(segment.text);
  const meaningContent = normalizeSegmentDisplayText(segment.meaning);
  const fullTextHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text';
  const fullMeaningHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning';

  const textFlags = buildSharedSegmentRenderFlags({
    segment,
    logicalIndex,
    channel: 'text',
    cursor,
    isSpeakingCard,
    fullChannelHighlighted: fullTextHighlight,
    focusSegmentId,
    playableSegmentIds,
    audioCoverageMap,
    disabled
  });
  const meaningFlags = buildSharedSegmentRenderFlags({
    segment,
    logicalIndex,
    channel: 'meaning',
    cursor,
    isSpeakingCard,
    fullChannelHighlighted: fullMeaningHighlight,
    focusSegmentId,
    playableSegmentIds,
    audioCoverageMap,
    disabled
  });

  const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
  const playButtonDisabled = disabled || !playable;
  const atStart = logicalIndex <= 0;
  const atEnd = logicalIndex >= entries.length - 1;
  const coverageStatuses = resolveSegmentCoverageStatuses({ segment, audioCoverageMap });
  const textLang = workspace?.textLanguage || 'en';
  const segmentBodyStyle = buildParagraphBodyStyle({
    workspaceStyle,
    isTitleRole: card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE,
    allowIndent: false
  });
  const meaningLang = workspace?.meaningLanguage || 'id';
  const isV1Compat = entry.unit?.identitySource === 'v1-paragraph-compat';

  const showText = bilingualLayout !== 'meaning-only';
  const showMeaning = bilingualLayout !== 'text-only';
  const showSeparatedLabels = bilingualLayout === 'separated';

  return (
    <div
      className="space-y-4"
      data-shared-segment-view="true"
      data-shared-segment-focus={segment.id}
      data-shared-segment-focus-unit={entry.unitViewKey}
      data-shared-segment-focus-index={logicalIndex + 1}
      data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
    >
      {/* Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums" data-shared-segment-position="true">
            Sentence {logicalIndex + 1} of {entries.length}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span className="text-slate-500 dark:text-slate-400" data-shared-segment-unit-context="true">
            {entry.unit?.label || unitTerms.label} {entry.unitIndex + 1}{isV1Compat ? ' (Compatibility)' : ''}
            {isTurn && unitSegments.length > 1 && indexInTurn >= 0 ? ` · Line ${indexInTurn + 1} of ${unitSegments.length}` : ''}
          </span>
          {!isTurn && legacySegmentSpeaker && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="rounded-md bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                {legacySegmentSpeaker}
              </span>
            </>
          )}
          {coverageStatuses && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400" data-shared-segment-coverage="true">
              {[
                coverageStatuses.text ? `EN ${coverageStatuses.text}` : null,
                coverageStatuses.meaning ? `ID ${coverageStatuses.meaning}` : null
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {selection.isCardPrecisionPlaying && (
            <span
              data-shared-segment-full-notice="true"
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/60 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-200"
            >
              <Radio aria-hidden="true" className="w-3 h-3" />
              <span>Playing Full {card?.blockType === 'conversation' ? 'Scene' : 'Card'} audio · Browse freely</span>
            </span>
          )}
          {!selection.isCardPrecisionPlaying && selection.segmentDivergedFromAudible && (
            <button
              type="button"
              onClick={onFollowAudible}
              data-shared-segment-follow-audio="true"
              className="min-h-8 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Radio aria-hidden="true" className="w-3 h-3" />
              <span>Playing S{selection.audibleSegmentIndex + 1} · Follow</span>
            </button>
          )}
        </div>
      </div>

      {/* Focused Sentence Stage */}
      <div
        className={`rounded-2xl border ${
          isTurn ? `border-l-4 ${textFlags.active ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}` : ''
        } p-5 sm:p-7 transition-colors motion-reduce:transition-none ${
          textFlags.active
            ? 'border-indigo-400/90 dark:border-indigo-500/80 bg-indigo-50/15 dark:bg-indigo-950/20 ring-1 ring-indigo-500/15'
            : textFlags.focused
              ? 'border-amber-400/90 dark:border-amber-600/80 bg-amber-50/20 dark:bg-amber-950/20'
              : 'border-slate-200/85 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
        }`}
      >
        <div className="max-w-[62ch] space-y-4">
          {isTurn && speakerInfo && (
            <div
              className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-200/70 dark:border-slate-800/80"
              data-shared-segment-speaker-stage="true"
            >
              <span
                aria-hidden="true"
                className={`h-7 w-7 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 select-none ${speakerInfo.palette.avatar}`}
              >
                {speakerInfo.monogram}
              </span>
              <span
                data-shared-segment-speaker-name="true"
                className={`text-sm font-semibold break-words ${speakerInfo.palette.nameText}`}
              >
                {speakerInfo.displayName}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                · {entry.unit?.label || unitTerms.label} {entry.unitIndex + 1}
                {unitSegments.length > 1 && indexInTurn >= 0 ? ` (${indexInTurn + 1}/${unitSegments.length})` : ''}
              </span>
            </div>
          )}
          {showText && (
            <div className="space-y-1.5" data-shared-segment-channel-block="text">
              {showSeparatedLabels && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 select-none">
                  English
                </p>
              )}
              <div
                lang={textLang}
                data-shared-reading-body="true"
                data-shared-reading-channel="text"
                data-shared-reading-align={segmentBodyStyle.textAlign}
                style={segmentBodyStyle.inlineStyle}
                className={`break-words whitespace-pre-line text-xl sm:text-[1.4375rem] font-medium leading-[1.6] text-slate-900 dark:text-slate-50 ${segmentBodyStyle.className}`}
              >
                {textContent ? (
                  <TextSegmentInteraction
                    segmentId={segment.id}
                    channel="text"
                    interactive
                    disabled={textFlags.segmentDisabled}
                    active={textFlags.active}
                    speaking={textFlags.speaking}
                    focused={textFlags.focused}
                    fullChannelHighlighted={textFlags.fullChannelHighlighted}
                    dataAttributes={textFlags.dataAttributes}
                    title={textFlags.title}
                    accessibleLabel={textFlags.accessibleLabel}
                    onActivate={onPlaySegment}
                  >
                    {textContent}
                  </TextSegmentInteraction>
                ) : (
                  <span
                    data-shared-card-missing-text={segment.id}
                    className="text-sm italic text-slate-400 dark:text-slate-500 select-none"
                  >
                    No English text for this sentence.
                  </span>
                )}
              </div>
            </div>
          )}

          {showMeaning && (
            <div
              className={showText ? 'pt-4 border-t border-slate-200/75 dark:border-slate-800 space-y-1.5' : 'space-y-1.5'}
              data-shared-segment-channel-block="meaning"
            >
              {showSeparatedLabels && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 select-none">
                  Indonesian Meaning
                </p>
              )}
              <div
                lang={meaningLang}
                data-shared-reading-body="true"
                data-shared-reading-channel="meaning"
                data-shared-reading-align={segmentBodyStyle.textAlign}
                style={segmentBodyStyle.inlineStyle}
                className={`break-words whitespace-pre-line text-base sm:text-[1.15rem] leading-[1.68] text-slate-600 dark:text-slate-300 ${segmentBodyStyle.className}`}
              >
                {meaningContent ? (
                  <TextSegmentInteraction
                    segmentId={segment.id}
                    channel="meaning"
                    interactive
                    disabled={meaningFlags.segmentDisabled}
                    active={meaningFlags.active}
                    speaking={meaningFlags.speaking}
                    focused={meaningFlags.focused}
                    fullChannelHighlighted={meaningFlags.fullChannelHighlighted}
                    dataAttributes={meaningFlags.dataAttributes}
                    title={meaningFlags.title}
                    accessibleLabel={meaningFlags.accessibleLabel}
                    onActivate={onPlaySegment}
                  >
                    {meaningContent}
                  </TextSegmentInteraction>
                ) : (
                  <span
                    data-shared-card-missing-meaning={segment.id}
                    className="text-sm italic text-slate-400 dark:text-slate-500 select-none"
                  >
                    No Indonesian meaning for this sentence.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Browse & Manual Playback Bar (Browsing never invokes playback) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          className="flex flex-wrap items-center gap-1.5"
          onKeyDown={event => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              const step = stepCardSegmentId({ entries, currentSegmentId: segment.id, delta: 1 });
              if (step.nextSegmentId && step.nextSegmentId !== segment.id) onSelectSegment?.(step.nextSegmentId);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              const step = stepCardSegmentId({ entries, currentSegmentId: segment.id, delta: -1 });
              if (step.nextSegmentId && step.nextSegmentId !== segment.id) onSelectSegment?.(step.nextSegmentId);
            }
          }}
        >
          <button
            type="button"
            disabled={atStart}
            onClick={() => {
              const step = stepCardSegmentId({ entries, currentSegmentId: segment.id, delta: -1 });
              if (step.nextSegmentId) onSelectSegment?.(step.nextSegmentId);
            }}
            data-shared-segment-prev="true"
            aria-label="Previous sentence"
            className="order-1 min-h-11 sm:min-h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-35 hover:border-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronLeft aria-hidden="true" className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {entries.length > 1 && entries.length <= 12 && (
            <div role="group" aria-label="Jump to sentence" className="order-3 sm:order-2 w-full sm:w-auto flex flex-wrap items-center gap-1">
              {entries.map(item => {
                const selected = item.segment.id === segment.id;
                const isAudible = item.segment.id === selection.audibleSegmentId;
                const itemSpeaker = item.unit?.kind === 'turn'
                  ? resolveTurnSpeakerPresentation({ unit: item.unit, appearanceMap: speakerAppearanceMap })
                  : null;
                return (
                  <button
                    key={item.segment.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Sentence ${item.logicalIndex + 1}${itemSpeaker ? ` · ${itemSpeaker.displayName}` : ''}${isAudible ? ' (playing audio)' : ''}`}
                    title={itemSpeaker ? `Sentence ${item.logicalIndex + 1} · ${itemSpeaker.displayName}` : `Sentence ${item.logicalIndex + 1}`}
                    data-shared-segment-pill={item.segment.id}
                    onClick={() => onSelectSegment?.(item.segment.id)}
                    className={`min-h-11 min-w-10 sm:min-h-9 sm:min-w-8 px-2 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      selected
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                        : isAudible
                          ? 'border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                    }`}
                  >
                    {itemSpeaker && !selected && (
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${itemSpeaker.palette.dot}`} />
                    )}
                    <span>{item.logicalIndex + 1}</span>
                    {isAudible && !selected && !itemSpeaker && (
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            disabled={atEnd}
            onClick={() => {
              const step = stepCardSegmentId({ entries, currentSegmentId: segment.id, delta: 1 });
              if (step.nextSegmentId) onSelectSegment?.(step.nextSegmentId);
            }}
            data-shared-segment-next="true"
            aria-label="Next sentence"
            className="order-2 sm:order-3 min-h-11 sm:min-h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-35 hover:border-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span>Next</span>
            <ChevronRight aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={playButtonDisabled}
          onClick={() => onPlaySegment?.(segment.id)}
          data-shared-segment-focus-play="true"
          className="min-h-11 sm:min-h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
          <span>Play Sentence</span>
        </button>
      </div>
    </div>
  );
};
