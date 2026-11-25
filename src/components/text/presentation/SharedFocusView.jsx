import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextWorkspaceStyleState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildUnitPreviewExcerpt,
  getSharedUnitHeading,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  isPrefersReducedMotion,
  resolveTurnSpeakerPresentation,
  stepCardUnitViewKey
} from './sharedCardPresentationUtils.js';

const escapeSelectorValue = value => {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

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
  isRepeatedSpeaker = false,
  emphasize = false,
  showSpeakerInHeader = false
}) => {
  const shortCode = getSharedUnitShortCode(unit, unitIndex);
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
            className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            <Radio aria-hidden="true" className="w-3 h-3" />
            <span>Audible</span>
          </span>
        )}
      </div>
    );
  }

  const speakerInfo = resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap });
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0 text-left">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
          emphasize
            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 ring-1 ring-indigo-200/80 dark:ring-indigo-800/70'
            : 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300'
        }`}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${speakerInfo.palette.dot}`} />
        <span>
          {rolePrefix ? `${rolePrefix} · ` : ''}{shortCode} · {unit.label || 'Speaker Turn'} {unitIndex + 1}
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
      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        {segCount} SG
      </span>
      {isRepeatedSpeaker && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          · consecutive turn
        </span>
      )}
      {isAudible && (
        <span
          data-shared-focus-audible-badge="true"
          className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white"
        >
          <Radio aria-hidden="true" className="w-3 h-3" />
          <span>Audible</span>
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
  orientation = 'vertical-focus',
  onSelectUnit,
  onFollowAudible
}) => {
  const {
    selectedUnitViewKey,
    selectedUnitIndex,
    audibleUnitViewKey,
    audibleUnitIndex,
    unitDivergedFromAudible,
    isCardPrecisionPlaying
  } = selection;
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
      className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800/80 space-y-2.5 text-left"
      data-shared-part-nav="true"
      data-shared-focus-nav="true"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
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
              <span className="truncate max-w-[16rem]">{activeSpeakerInfo.displayName}</span>
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
              <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>Playing Full {isTurnMode ? 'Scene' : 'Card'} audio · Browse {unitTerms.plural} freely</span>
            </span>
          )}
          {!isCardPrecisionPlaying && unitDivergedFromAudible && (
            <button
              type="button"
              onClick={onFollowAudible}
              data-shared-part-follow-audio="true"
              data-shared-focus-return-to-playing="true"
              className="min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>
                Return to Playing · {audibleShortCode}
                {audibleSpeakerInfo?.isAssigned ? ` ${audibleSpeakerInfo.displayName}` : ''}
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
            className="min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
            className="min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
        className="flex flex-wrap items-center gap-1.5 min-w-0"
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
              className={`min-h-11 sm:min-h-8 max-w-full px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 transition-all duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selected
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/40'
                  : isAudible
                    ? 'border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-800 dark:text-indigo-200'
                    : segCount === 0
                      ? 'border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:border-indigo-300'
                      : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/75 text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 dark:hover:bg-slate-800'
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
                  <span className="truncate max-w-[9.5rem] sm:max-w-[11rem] font-medium">
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
                <Radio aria-hidden="true" className="w-3 h-3 text-indigo-600 dark:text-indigo-300 shrink-0" />
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
  bilingualLayout,
  workspaceStyle,
  partLayout,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onPlaySegment
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
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
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/60 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-200"
            >
              <Radio aria-hidden="true" className="w-3 h-3" />
              <span>Playing Full {isTurn ? 'Scene' : 'Card'} audio</span>
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
        className={`rounded-2xl border p-4 sm:p-6 bg-white dark:bg-slate-900/90 transition-colors motion-reduce:transition-none ${
          isAudible
            ? 'border-indigo-400/90 dark:border-indigo-500/80 ring-2 ring-indigo-500/15'
            : 'border-slate-200/90 dark:border-slate-800'
        }`}
      >
        <div className="mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <FocusUnitTopHeader
            unit={unit}
            unitIndex={0}
            totalUnits={1}
            speakerAppearanceMap={speakerAppearanceMap}
            segCount={unit.segments?.length || 0}
            isAudible={isAudible}
            emphasize
          />
        </div>
        <SharedBilingualUnitsBody
          card={card}
          unitsOverride={[unit]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={bilingualLayout}
          workspaceStyle={resolvedStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          forceSectionHeaders={isTurn}
          onPlaySegment={onPlaySegment}
        />
      </div>
    </div>
  );
};

/**
 * Vertical Focus View (4B2):
 * Active Unit at full prominence and adaptive natural height (no nested vertical scroll trap),
 * with smaller quieter Previous / Next neighbor previews that step focus silently on click.
 */
const FocusVerticalView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  bilingualLayout,
  workspaceStyle,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onSelectUnit,
  onPlaySegment
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
  const idx = Math.max(0, selection.selectedUnitIndex);
  const prevUnit = idx > 0 ? units[idx - 1] : null;
  const currentUnit = units[idx];
  const nextUnit = idx < units.length - 1 ? units[idx + 1] : null;
  const cardTerms = getSharedUnitTerms(card);

  const activeStageRef = useRef(null);
  const prevSelectedKeyRef = useRef(selection.selectedUnitViewKey);

  useEffect(() => {
    const prevKey = prevSelectedKeyRef.current;
    prevSelectedKeyRef.current = selection.selectedUnitViewKey;
    if (!prevKey || prevKey === selection.selectedUnitViewKey) return;
    if (selection.source !== 'manual') return;
    const node = activeStageRef.current;
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    const comfortable = rect.top >= 48 && rect.bottom <= vh - 48;
    if (!comfortable && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({
        behavior: isPrefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest'
      });
    }
  }, [selection.selectedUnitViewKey, selection.source]);

  const renderNeighborPreview = ({ unit, unitIndex, roleLabel, testRole }) => {
    const isAudible = unit.viewKey === selection.audibleUnitViewKey;
    const isTurn = unit.kind === 'turn';
    const speakerInfo = isTurn ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap }) : null;
    const segCount = unit.segments?.length || 0;
    const excerpt = buildUnitPreviewExcerpt(unit, bilingualLayout, 150);
    const accentBorder = resolvedStyle.showAccents && isTurn
      ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}`
      : resolvedStyle.showAccents && !isTurn
        ? 'border-l-4 border-l-teal-400/50 dark:border-l-teal-600/50'
        : '';

    return (
      <div
        key={unit.viewKey}
        data-shared-part-neighbor={testRole}
        data-shared-focus-preview={testRole}
        data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
        className="px-1.5 sm:px-5"
      >
        <button
          type="button"
          onClick={() => onSelectUnit?.(unit.viewKey)}
          data-shared-part-focus={unit.viewKey}
          aria-label={`Focus ${roleLabel.toLowerCase()} ${getSharedUnitTerms(unit).lower}: ${getSharedUnitShortCode(unit, unitIndex)}${speakerInfo ? ` ${speakerInfo.displayName}` : ''}`}
          className={`w-full text-left rounded-xl border ${accentBorder} px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all duration-200 motion-reduce:transition-none scale-[0.985] hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isAudible
              ? 'border-indigo-300/90 dark:border-indigo-700 bg-indigo-50/35 dark:bg-indigo-950/25 opacity-95 hover:opacity-100'
              : 'border-slate-200/80 dark:border-slate-800/90 bg-slate-50/85 dark:bg-slate-900/55 opacity-75 hover:opacity-100 hover:border-indigo-300/80 dark:hover:border-indigo-700/80'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <FocusUnitTopHeader
              unit={unit}
              unitIndex={unitIndex}
              totalUnits={units.length}
              speakerAppearanceMap={speakerAppearanceMap}
              rolePrefix={roleLabel}
              segCount={segCount}
              isAudible={isAudible}
              isRepeatedSpeaker={isConsecutiveSpeakerTurn(units, unitIndex, speakerAppearanceMap)}
              showSpeakerInHeader={isTurn}
            />
            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">
              View {getSharedUnitShortCode(unit, unitIndex)}
            </span>
          </div>
          <p className="text-xs sm:text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2 break-words">
            {excerpt || `Empty ${getSharedUnitTerms(unit).lower} — no sentences yet.`}
          </p>
        </button>
      </div>
    );
  };

  const currentAudible = currentUnit.viewKey === selection.audibleUnitViewKey;
  const currentIsTurn = currentUnit.kind === 'turn';
  const currentSpeaker = currentIsTurn
    ? resolveTurnSpeakerPresentation({ unit: currentUnit, appearanceMap: speakerAppearanceMap })
    : null;

  return (
    <div
      className="space-y-3"
      data-shared-part-layout="vertical-focus"
      data-shared-focus-orientation="vertical-focus"
    >
      {prevUnit ? (
        renderNeighborPreview({ unit: prevUnit, unitIndex: idx - 1, roleLabel: 'Previous', testRole: 'previous' })
      ) : (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1 text-left" data-shared-part-boundary="start">
          Start of {cardTerms.cardLower} · {getSharedUnitShortCode(currentUnit, 0)} of {units.length}
        </p>
      )}

      <div
        ref={activeStageRef}
        data-shared-part-focused={currentUnit.viewKey}
        data-shared-part-focused-unit-id={currentUnit.id || undefined}
        data-shared-part-active="true"
        data-shared-part-audible={currentAudible ? 'true' : undefined}
        data-shared-turn-speaker-palette={currentSpeaker?.palette?.id || undefined}
        className={`rounded-2xl border-2 p-4 sm:p-6 shadow-md transition-all duration-200 motion-reduce:transition-none ${
          currentAudible
            ? 'border-indigo-500/90 dark:border-indigo-400 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/15'
            : 'border-indigo-300/90 dark:border-indigo-600/80 bg-white dark:bg-slate-900 ring-1 ring-indigo-400/15'
        }`}
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
          <FocusUnitTopHeader
            unit={currentUnit}
            unitIndex={idx}
            totalUnits={units.length}
            speakerAppearanceMap={speakerAppearanceMap}
            rolePrefix="Focused"
            segCount={currentUnit.segments?.length || 0}
            isAudible={currentAudible}
            isRepeatedSpeaker={isConsecutiveSpeakerTurn(units, idx, speakerAppearanceMap)}
            emphasize
          />
        </div>
        <SharedBilingualUnitsBody
          card={card}
          unitsOverride={[currentUnit]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={bilingualLayout}
          workspaceStyle={resolvedStyle}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          forceSectionHeaders={currentIsTurn}
          onPlaySegment={onPlaySegment}
        />
      </div>

      {nextUnit ? (
        renderNeighborPreview({ unit: nextUnit, unitIndex: idx + 1, roleLabel: 'Next', testRole: 'next' })
      ) : (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1 text-left" data-shared-part-boundary="end">
          End of {cardTerms.cardLower} · {getSharedUnitShortCode(currentUnit, units.length - 1)} of {units.length}
        </p>
      )}
    </div>
  );
};

/**
 * Horizontal Focus View (4B2):
 * Native CSS Scroll Snap carousel inspired by Expo Slider (centered active Unit, peeking
 * neighbor slides with subtle scale/opacity, dynamic active height without clipping or
 * vertical void inflation, touch swipe momentum, keyboard & button controls, zero page overflow).
 */
const FocusHorizontalView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  bilingualLayout,
  workspaceStyle,
  playbackCursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  disabled,
  selection,
  onSelectUnit,
  onPlaySegment
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
  const trackRef = useRef(null);
  const programmaticScrollRef = useRef(false);
  const swipeTimerRef = useRef(null);
  const settleResetTimerRef = useRef(null);
  const mountedTrackRef = useRef(false);

  const selectedUnitViewKeyRef = useRef(selection.selectedUnitViewKey);

  const centerTrackOnUnit = useCallback((unitViewKey, { instant = false } = {}) => {
    const track = trackRef.current;
    if (!track || !unitViewKey) return;
    const escaped = escapeSelectorValue(unitViewKey);
    const slide = track.querySelector(`[data-shared-part-slide="${escaped}"]`);
    if (!slide) return;
    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    const rawTargetLeft = Math.round(slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2);
    const targetLeft = Math.min(maxScrollLeft, Math.max(0, rawTargetLeft));
    if (Math.abs(track.scrollLeft - targetLeft) <= 2) return;
    programmaticScrollRef.current = true;
    window.clearTimeout(settleResetTimerRef.current);
    if (instant) {
      const prevSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';
      if (typeof track.scrollTo === 'function') {
        track.scrollTo({ left: targetLeft, behavior: 'instant' });
      } else {
        track.scrollLeft = targetLeft;
      }
      void track.offsetWidth;
      track.style.scrollSnapType = prevSnap;
    } else if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      track.scrollLeft = targetLeft;
    }
    settleResetTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, instant ? 120 : 420);
  }, []);

  useEffect(() => {
    selectedUnitViewKeyRef.current = selection.selectedUnitViewKey;
    const isInitialMount = !mountedTrackRef.current;
    mountedTrackRef.current = true;
    const instant = isInitialMount || isPrefersReducedMotion();
    centerTrackOnUnit(selection.selectedUnitViewKey, { instant });
    if (isInitialMount && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(() => {
        centerTrackOnUnit(selectedUnitViewKeyRef.current, { instant: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [selection.selectedUnitViewKey, units.length, centerTrackOnUnit]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => {
      centerTrackOnUnit(selectedUnitViewKeyRef.current, { instant: true });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [centerTrackOnUnit]);

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
      const viewportCenter = (track.scrollLeft || 0) + (track.clientWidth || 0) / 2;
      let nearest = units[0];
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const unit of units) {
        const slide = track.querySelector(`[data-shared-part-slide="${escapeSelectorValue(unit.viewKey)}"]`);
        if (!slide) continue;
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(slideCenter - viewportCenter);
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
    <div className="relative overflow-x-hidden -mx-1 px-1" data-shared-focus-horizontal-shell="true">
      <div
        ref={trackRef}
        onTouchStart={markManualTrackGesture}
        onPointerDown={markManualTrackGesture}
        onWheel={markManualTrackGesture}
        onScroll={handleTrackScroll}
        data-shared-part-layout="horizontal-focus"
        data-shared-focus-orientation="horizontal-focus"
        data-shared-part-track="horizontal"
        aria-label={`Horizontal ${getSharedUnitTerms(card).plural} focus carousel`}
        className="relative flex items-start gap-3 sm:gap-4 overflow-x-auto overflow-y-visible snap-x snap-proximity overscroll-x-contain custom-scrollbar pb-2.5 px-3 sm:px-8"
      >
        {units.map((unit, unitIndex) => {
          const isSelected = unit.viewKey === selection.selectedUnitViewKey;
          const isAudible = unit.viewKey === selection.audibleUnitViewKey;
          const segCount = unit.segments?.length || 0;
          const isTurn = unit.kind === 'turn';
          const speakerInfo = isTurn
            ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
            : null;
          const repeated = isConsecutiveSpeakerTurn(units, unitIndex, speakerAppearanceMap);
          const excerpt = !isSelected ? buildUnitPreviewExcerpt(unit, bilingualLayout, 180) : '';
          const peekAccentBorder = !isSelected && resolvedStyle.showAccents
            ? (isTurn
                ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}`
                : 'border-l-4 border-l-teal-400/55 dark:border-l-teal-600/55')
            : '';

          return (
            <div
              key={unit.viewKey}
              data-shared-part-slide={unit.viewKey}
              data-shared-part-slide-unit-id={unit.id || undefined}
              data-shared-part-focused={isSelected ? unit.viewKey : undefined}
              data-shared-part-focused-unit-id={isSelected ? (unit.id || undefined) : undefined}
              data-shared-part-active={isSelected ? 'true' : undefined}
              data-shared-part-audible={isAudible ? 'true' : undefined}
              data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
              className={`w-[90%] min-w-[90%] sm:w-[86%] sm:min-w-[86%] shrink-0 snap-center snap-always rounded-2xl border ${peekAccentBorder} transition-all duration-200 ease-out motion-reduce:transition-none ${
                isSelected
                  ? (isAudible
                      ? 'border-2 border-indigo-500/90 dark:border-indigo-400 bg-white dark:bg-slate-900 shadow-md ring-2 ring-indigo-500/15 scale-100 opacity-100 z-10 p-4 sm:p-6'
                      : 'border-2 border-indigo-300/90 dark:border-indigo-600/80 bg-white dark:bg-slate-900 shadow-md ring-1 ring-indigo-400/15 scale-100 opacity-100 z-10 p-4 sm:p-6')
                  : 'border-slate-200/85 dark:border-slate-800 bg-slate-50/85 dark:bg-slate-900/55 scale-[0.95] opacity-70 hover:opacity-95 p-3.5 sm:p-5'
              }`}
            >
              {isSelected ? (
                <>
                  <div className="mb-3.5 pb-2.5 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <FocusUnitTopHeader
                      unit={unit}
                      unitIndex={unitIndex}
                      totalUnits={units.length}
                      speakerAppearanceMap={speakerAppearanceMap}
                      rolePrefix="Focused"
                      segCount={segCount}
                      isAudible={isAudible}
                      isRepeatedSpeaker={repeated}
                      emphasize
                    />
                  </div>
                  <SharedBilingualUnitsBody
                    card={card}
                    unitsOverride={[unit]}
                    workspace={workspace}
                    speakerAppearanceMap={speakerAppearanceMap}
                    bilingualLayout={bilingualLayout}
                    workspaceStyle={resolvedStyle}
                    playbackCursor={playbackCursor}
                    focusSegmentId={focusSegmentId}
                    playableSegmentIds={playableSegmentIds}
                    audioCoverageMap={audioCoverageMap}
                    disabled={disabled}
                    forceSectionHeaders={isTurn}
                    onPlaySegment={onPlaySegment}
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectUnit?.(unit.viewKey)}
                  data-shared-part-focus={unit.viewKey}
                  data-shared-part-focus-unit-id={unit.id || undefined}
                  data-shared-focus-peek="true"
                  aria-label={`Focus ${getSharedUnitShortCode(unit, unitIndex)}${speakerInfo ? ` ${speakerInfo.displayName}` : ''}`}
                  className="w-full text-left space-y-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
                >
                  <div className="pb-2 border-b border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <FocusUnitTopHeader
                      unit={unit}
                      unitIndex={unitIndex}
                      totalUnits={units.length}
                      speakerAppearanceMap={speakerAppearanceMap}
                      segCount={segCount}
                      isAudible={isAudible}
                      isRepeatedSpeaker={repeated}
                      showSpeakerInHeader={isTurn}
                    />
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">
                      Focus
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-4 break-words">
                    {excerpt || `Empty ${getSharedUnitTerms(unit).lower} — no sentences yet.`}
                  </p>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 4B2 Focus Mode Surface: displays one active Content Unit (Paragraph Section or
 * Conversation Turn) per expanded Card with Vertical or Horizontal focus navigation.
 * Single-Unit Cards render cleanly without redundant carousel chrome.
 */
export const SharedFocusView = ({
  card,
  units,
  workspace = null,
  speakerAppearanceMap,
  partLayout = 'vertical-focus',
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
  const effectiveOrientation = partLayout === 'horizontal-focus' ? 'horizontal-focus' : 'vertical-focus';

  if (units.length === 1) {
    return (
      <div data-shared-part-view="true" data-shared-focus-view="true">
        <FocusSingleUnitView
          card={card}
          unit={units[0]}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          bilingualLayout={bilingualLayout}
          workspaceStyle={workspaceStyle}
          partLayout={effectiveOrientation}
          playbackCursor={playbackCursor}
          focusSegmentId={focusSegmentId}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          selection={selection}
          onPlaySegment={onPlaySegment}
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
        orientation={effectiveOrientation}
        onSelectUnit={onSelectUnit}
        onFollowAudible={onFollowAudible}
      />
      {effectiveOrientation === 'horizontal-focus' ? (
        <FocusHorizontalView
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
      ) : (
        <FocusVerticalView
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
      )}
    </div>
  );
};

export default SharedFocusView;
