import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE
} from '../../../domain/text/textCardPresentationStateDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import SharedFocusView from './SharedFocusView.jsx';
import SharedSegmentStudyBox from './SharedSegmentStudyBox.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  getSharedUnitHeading,
  getSharedUnitTerms,
  resolveTurnSpeakerPresentation,
  stepCardUnitViewKey
} from './sharedCardPresentationUtils.js';

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
 * Focused Unit view (4B2 Focus Mode: Vertical Focus & Horizontal Focus, plus
 * legacy Vertical List compatibility for three-mode callers).
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

  if (partLayout === 'vertical-focus' || partLayout === 'horizontal-focus') {
    return (
      <SharedFocusView
        card={card}
        units={units}
        workspace={workspace}
        speakerAppearanceMap={speakerAppearanceMap}
        partLayout={partLayout}
        bilingualLayout={bilingualLayout}
        workspaceStyle={workspaceStyle}
        playbackCursor={playbackCursor}
        focusSegmentId={focusSegmentId}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        disabled={disabled}
        selection={selection}
        onSelectUnit={onSelectUnit}
        onFollowAudible={onFollowAudible}
        onPlaySegment={onPlaySegment}
      />
    );
  }

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
      <PartVerticalListView
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
 * Segment Mode View (4B3): renders complete natural reading context above exactly
 * one Segment Study Box per Card, preserving persistent identities and passive selection.
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
  onSelectUnit,
  onSelectSegment,
  onFollowAudible,
  onPlaySegment,
  onPlaySegmentChannel = null,
  onPlayContinueFromSegment = null
}) => (
  <SharedSegmentStudyBox
    card={card}
    lookup={lookup}
    workspace={workspace}
    bilingualLayout={bilingualLayout}
    workspaceStyle={workspaceStyle}
    playbackCursor={playbackCursor}
    focusSegmentId={focusSegmentId}
    playableSegmentIds={playableSegmentIds}
    audioCoverageMap={audioCoverageMap}
    disabled={disabled}
    selection={selection}
    onSelectUnit={onSelectUnit}
    onSelectSegment={onSelectSegment}
    onFollowAudible={onFollowAudible}
    onPlaySegment={onPlaySegment}
    onPlaySegmentChannel={onPlaySegmentChannel}
    onPlayContinueFromSegment={onPlayContinueFromSegment}
  />
);
