import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, Radio, SkipForward, Target } from 'lucide-react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleState,
  resolveEffectiveBilingualPresentation
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  buildParagraphBodyStyle,
  getSharedUnitHeading,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
  resolveReaderAppearancePresentation,
  resolveSegmentCoverageStatuses,
  resolveTurnSpeakerPresentation
} from './sharedCardPresentationUtils.js';

/**
 * 4B3 / 4C1 Segment Mode Surface (One Study Box per Card):
 * 1. Complete natural reading context with ALL authored Sections or Turns above:
 *    - Primary-only reading context (EN or ID), OR optional Sentence Interlinear when
 *      bilingual reading + Sentence Interlinear is selected.
 *    - Separated and Contextual are unavailable in Segment Mode and fall back cleanly
 *      to primary-only context WITHOUT overwriting the saved bilingual preference.
 *    - Preserves full Workspace Style, Appearance / Typography, punctuation, joinAfter,
 *      Title role, and Speaker identity. Tapping any Segment selects its Unit + Segment
 *      in this Card's Study Box without touching audio.
 * 2. Exactly ONE bilingual Segment Study Box below with hierarchical Unit picker (hidden
 *    for 1-Unit Cards), Unit-local Segment picker (1..N), per-Unit remembered selection,
 *    exact bilingual EN + ID display ordered by readingLanguage with shared alignment and
 *    typography, and integration-ready playback controls.
 */
export const SharedSegmentStudyBox = ({
  card,
  lookup,
  workspace = null,
  presentationState = null,
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
}) => {
  const units = lookup?.units || card?.units || [];
  const entries = lookup?.entries || [];
  const speakerAppearanceMap = useMemo(() => buildCardSpeakerAppearanceMap(card), [card]);
  const resolvedStyle = useMemo(() => normalizeTextWorkspaceStyleState(workspaceStyle), [workspaceStyle]);
  const normalizedView = useMemo(() => (
    presentationState
      ? normalizeTextCardPresentationState(presentationState)
      : normalizeTextCardPresentationState({ bilingualLayout })
  ), [presentationState, bilingualLayout]);
  const bilingualResolution = useMemo(() => resolveEffectiveBilingualPresentation({
    readerMode: 'segment',
    view: normalizedView
  }), [normalizedView]);
  const appearancePres = useMemo(
    () => resolveReaderAppearancePresentation(bilingualResolution.appearance),
    [bilingualResolution.appearance]
  );

  const cardTerms = getSharedUnitTerms(card);
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;

  const isConversation = card?.blockType === 'conversation';
  const primaryChannel = bilingualResolution.primaryChannel;
  const secondaryChannel = bilingualResolution.secondaryChannel;
  const textLang = workspace?.textLanguage || 'en';
  const meaningLang = workspace?.meaningLanguage || 'id';

  const studyPrimaryBodyStyle = buildParagraphBodyStyle({
    workspaceStyle: resolvedStyle,
    appearance: appearancePres.appearance,
    channelRole: 'primary',
    isTitleRole: false,
    allowIndent: false
  });
  const studySecondaryBodyStyle = buildParagraphBodyStyle({
    workspaceStyle: resolvedStyle,
    appearance: appearancePres.appearance,
    channelRole: 'secondary',
    isTitleRole: false,
    allowIndent: false
  });

  const contextLabel = bilingualResolution.effectiveRenderMode === 'interlinear'
    ? (primaryChannel === 'meaning'
        ? 'Reading Context (ID–EN Sentence Interlinear) · Tap any sentence to study'
        : 'Reading Context (EN–ID Sentence Interlinear) · Tap any sentence to study')
    : (primaryChannel === 'meaning'
        ? 'Reading Context (ID) · Tap any sentence to study'
        : 'Reading Context (EN) · Tap any sentence to study');

  if (!units.length || !entries.length) {
    return (
      <div className="space-y-4" data-shared-segment-view="true">
        {units.length > 0 && (
          <div
            data-shared-segment-context={card?.id}
            data-shared-segment-context-channel={primaryChannel}
            data-shared-segment-context-style={bilingualResolution.effectiveRenderMode}
          >
            <SharedBilingualUnitsBody
              card={card}
              workspace={workspace}
              speakerAppearanceMap={speakerAppearanceMap}
              presentationState={normalizedView}
              bilingualPresentation={bilingualResolution}
              readerMode="segment"
              workspaceStyle={resolvedStyle}
              playbackCursor={cursor}
              focusSegmentId={focusSegmentId}
              selectionOnly
              playableSegmentIds={playableSegmentIds}
              audioCoverageMap={audioCoverageMap}
              disabled={disabled}
              onSelectSegment={onSelectSegment}
            />
          </div>
        )}
        <div
          className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/50 p-4 text-left"
          data-shared-segment-study-box={card?.id}
          data-shared-segment-empty="true"
        >
          <p className="text-sm italic text-slate-500 dark:text-slate-400">
            No sentences available to study in this {cardTerms.cardLower}.
          </p>
        </div>
      </div>
    );
  }

  // Active Unit derives strictly from validated selection or first Unit (preserving empty Units!)
  const activeUnit = selection.selectedUnit || units[0];
  const activeUnitIndex = selection.selectedUnitIndex >= 0 ? selection.selectedUnitIndex : 0;
  const activeUnitSegments = activeUnit?.segments || [];
  const activeUnitShortCode = getSharedUnitShortCode(activeUnit, activeUnitIndex);
  const activeUnitTerms = getSharedUnitTerms(activeUnit || card);
  const activeUnitIsTurn = activeUnit?.kind === 'turn';
  const activeSpeakerInfo = activeUnitIsTurn
    ? resolveTurnSpeakerPresentation({ unit: activeUnit, appearanceMap: speakerAppearanceMap })
    : null;
  const isV1Compat = activeUnit?.identitySource === 'v1-paragraph-compat';

  // Active Segment MUST belong to activeUnit (null if activeUnit is intentionally empty!)
  const matchedInUnitIndex = selection.selectedSegmentId
    ? activeUnitSegments.findIndex(seg => seg.id === selection.selectedSegmentId)
    : -1;
  const localIndex = activeUnitSegments.length > 0 ? (matchedInUnitIndex >= 0 ? matchedInUnitIndex : 0) : -1;
  const segment = localIndex >= 0 ? activeUnitSegments[localIndex] : null;
  const segmentEntry = segment ? lookup?.entryBySegmentId?.get(segment.id) : null;
  const globalLogicalIndex = segmentEntry ? segmentEntry.logicalIndex : -1;

  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const isSelectedAudible = Boolean(
    segment
    && isSpeakingCard
    && cursor.precision === 'segment'
    && cursor.segmentId === segment.id
  );
  const isSelectedPaused = isSelectedAudible && cursor.state === 'paused';
  const isSelectedPlayingText = isSelectedAudible && !isSelectedPaused && cursor.channel === 'text';
  const isSelectedPlayingMeaning = isSelectedAudible && !isSelectedPaused && cursor.channel === 'meaning';

  const textContent = segment ? normalizeSegmentDisplayText(segment.text) : '';
  const meaningContent = segment ? normalizeSegmentDisplayText(segment.meaning) : '';
  const hasText = Boolean(textContent);
  const hasMeaning = Boolean(meaningContent);
  const legacySegmentSpeaker = segment && !activeUnitIsTurn ? normalizeSegmentDisplayText(segment.speaker) : '';

  const playable = segment
    ? (playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : (hasText || hasMeaning))
    : false;
  const playSegmentDisabled = disabled || !segment || !playable || (!hasText && !hasMeaning);

  const supportsChannelPlay = typeof onPlaySegmentChannel === 'function';
  const supportsContinuePlay = typeof onPlayContinueFromSegment === 'function';
  const playEnDisabled = !supportsChannelPlay || disabled || !segment || !hasText;
  const playIdDisabled = !supportsChannelPlay || disabled || !segment || !hasMeaning;
  const playContinueDisabled = !supportsContinuePlay || disabled || !segment || (!hasText && !hasMeaning);

  const atUnitStart = localIndex <= 0;
  const atUnitEnd = localIndex < 0 || localIndex >= activeUnitSegments.length - 1;
  const coverageStatuses = segment ? resolveSegmentCoverageStatuses({ segment, audioCoverageMap }) : null;

  // Authoritative audible unit/local segment metadata for Return to Playing
  const audibleEntry = selection.audibleSegmentId
    ? (lookup?.entryBySegmentId?.get(selection.audibleSegmentId) || null)
    : null;
  const audibleUnit = audibleEntry?.unit || null;
  const audibleUnitIndex = audibleEntry ? audibleEntry.unitIndex : -1;
  const audibleLocalIndex = audibleUnit && audibleEntry
    ? (audibleUnit.segments || []).findIndex(item => item.id === audibleEntry.segment.id)
    : -1;
  const audibleShortCode = audibleUnit ? getSharedUnitShortCode(audibleUnit, audibleUnitIndex) : null;
  const audibleSpeakerInfo = audibleUnit?.kind === 'turn'
    ? resolveTurnSpeakerPresentation({ unit: audibleUnit, appearanceMap: speakerAppearanceMap })
    : null;
  const studyBoxDivergedFromAudible = Boolean(
    !selection.isCardPrecisionPlaying
    && audibleEntry
    && (
      !segment
      || segment.id !== audibleEntry.segment.id
      || activeUnit.viewKey !== audibleEntry.unitViewKey
    )
  );

  const stepLocalSegment = delta => {
    if (!activeUnitSegments.length) return;
    const targetIdx = Math.min(activeUnitSegments.length - 1, Math.max(0, localIndex + (delta < 0 ? -1 : 1)));
    const nextSeg = activeUnitSegments[targetIdx];
    if (nextSeg && nextSeg.id !== segment?.id) {
      onSelectSegment?.(nextSeg.id);
    }
  };

  const handleSegmentKeys = event => {
    if (!activeUnitSegments.length) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepLocalSegment(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLocalSegment(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (activeUnitSegments[0]?.id && activeUnitSegments[0].id !== segment?.id) {
        onSelectSegment?.(activeUnitSegments[0].id);
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = activeUnitSegments[activeUnitSegments.length - 1];
      if (last?.id && last.id !== segment?.id) {
        onSelectSegment?.(last.id);
      }
    }
  };

  const hasMultipleUnits = units.length > 1;
  const studyBoxAccentBorder = resolvedStyle.showAccents
    ? (activeUnitIsTurn && activeSpeakerInfo
        ? `border-l-4 ${isSelectedAudible ? activeSpeakerInfo.palette.rail : activeSpeakerInfo.palette.railMuted}`
        : card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE
          ? 'border-l-4 border-l-indigo-500/70 dark:border-l-indigo-400/70'
          : 'border-l-4 border-l-teal-500/60 dark:border-l-teal-400/55')
    : '';

  const renderStudyChannelBlock = (channel, role) => {
    const isMeaningChannel = channel === 'meaning';
    const isPrimaryRole = role === 'primary';
    const bodyStyle = isPrimaryRole ? studyPrimaryBodyStyle : studySecondaryBodyStyle;
    const isChannelPlaying = isMeaningChannel ? isSelectedPlayingMeaning : isSelectedPlayingText;
    const isChannelPaused = isSelectedPaused && cursor.channel === channel;
    const content = isMeaningChannel ? meaningContent : textContent;
    const hasContent = isMeaningChannel ? hasMeaning : hasText;
    const langTag = isMeaningChannel ? meaningLang : textLang;
    const labelText = isMeaningChannel ? 'Indonesian (ID)' : 'English (EN)';
    const labelTone = isMeaningChannel
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-indigo-700 dark:text-indigo-300';
    const textTone = isPrimaryRole
      ? 'font-medium text-slate-900 dark:text-slate-50'
      : appearancePres.secondaryTextClass;

    return (
      <div
        key={channel}
        className={isPrimaryRole ? 'space-y-1' : 'pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-1'}
        data-shared-segment-channel-block={channel}
        data-study-box-channel={channel}
        data-study-box-role={role}
      >
        <div className="flex items-center gap-2 text-left">
          <span className={`text-[10px] font-bold uppercase tracking-wider select-none ${labelTone}`}>
            {labelText}
          </span>
          {isChannelPlaying && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${isMeaningChannel ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
              Playing {isMeaningChannel ? 'ID' : 'EN'}
            </span>
          )}
          {isChannelPaused && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              Paused
            </span>
          )}
        </div>
        <div
          lang={langTag}
          data-shared-reading-body="true"
          data-shared-reading-channel={channel}
          data-shared-reading-role={role}
          data-shared-reading-kind="study-box"
          data-shared-reading-align={bodyStyle.textAlign}
          data-study-box-text={!isMeaningChannel ? segment.id : undefined}
          data-study-box-meaning={isMeaningChannel ? segment.id : undefined}
          style={bodyStyle.inlineStyle}
          className={`max-w-[66ch] break-words whitespace-pre-line ${textTone} ${bodyStyle.className}`}
        >
          {hasContent ? content : (
            <span
              data-shared-card-missing-text={!isMeaningChannel ? segment.id : undefined}
              data-shared-card-missing-meaning={isMeaningChannel ? segment.id : undefined}
              className="text-sm italic font-normal text-slate-400 dark:text-slate-500"
            >
              {isMeaningChannel ? 'No Indonesian meaning for this sentence.' : 'No English text for this sentence.'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="space-y-5"
      data-shared-segment-view="true"
      data-shared-segment-context-lang={primaryChannel}
      data-shared-segment-context-style={bilingualResolution.effectiveRenderMode}
    >
      {/* 1. Complete Natural Reading Context (all authored Sections/Turns, tap-to-select only) */}
      <div
        data-shared-segment-context={card?.id}
        data-shared-segment-context-channel={primaryChannel}
        data-shared-segment-context-style={bilingualResolution.effectiveRenderMode}
        className="space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-left">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
            {contextLabel}
          </span>
        </div>
        <SharedBilingualUnitsBody
          card={card}
          workspace={workspace}
          speakerAppearanceMap={speakerAppearanceMap}
          presentationState={normalizedView}
          bilingualPresentation={bilingualResolution}
          readerMode="segment"
          workspaceStyle={resolvedStyle}
          playbackCursor={cursor}
          focusSegmentId={focusSegmentId}
          selectedSegmentId={segment?.id || null}
          selectionOnly
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          disabled={disabled}
          onPlaySegment={onPlaySegment}
          onSelectSegment={onSelectSegment}
        />
      </div>

      {/* 2. Exactly One Segment Study Box for this Card */}
      <section
        aria-label={`Segment Study Box for ${card?.title || cardTerms.cardLabel}`}
        data-shared-segment-study-box={card?.id}
        data-shared-segment-focus={segment?.id || ''}
        data-shared-segment-focus-unit={activeUnit?.viewKey || ''}
        data-shared-segment-focus-unit-id={activeUnit?.id || undefined}
        data-shared-segment-local-index={localIndex >= 0 ? localIndex + 1 : undefined}
        data-shared-segment-focus-index={globalLogicalIndex >= 0 ? globalLogicalIndex + 1 : undefined}
        data-shared-turn-speaker-palette={activeSpeakerInfo?.palette?.id || undefined}
        className={`rounded-2xl border ${studyBoxAccentBorder} bg-slate-50/80 dark:bg-slate-900/75 p-4 sm:p-5 space-y-4 shadow-sm transition-colors motion-reduce:transition-none text-left ${
          isSelectedPaused
            ? 'border-amber-400/90 dark:border-amber-600/80 ring-1 ring-amber-400/20'
            : isSelectedPlayingMeaning
              ? 'border-emerald-400/90 dark:border-emerald-500/80 ring-1 ring-emerald-500/15'
              : isSelectedPlayingText
                ? 'border-indigo-400/90 dark:border-indigo-500/80 ring-1 ring-indigo-500/15'
                : 'border-slate-200/95 dark:border-slate-700/90'
        }`}
      >
        {/* Study Box Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/10 dark:bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-200">
              <Target aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>Study Box</span>
            </span>
            <span
              className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums"
              data-shared-segment-unit-context="true"
            >
              {activeUnitShortCode}
              {!activeUnitIsTurn ? ` · ${getSharedUnitHeading(activeUnit, activeUnitIndex)}` : ''}
              {isV1Compat ? ' (Compatibility)' : ''}
            </span>
            {activeSpeakerInfo && (
              <span
                data-shared-segment-speaker-name="true"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold max-w-full ${activeSpeakerInfo.palette.pill}`}
              >
                <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${activeSpeakerInfo.palette.dot}`} />
                <span className="truncate max-w-[16rem]">{activeSpeakerInfo.displayName}</span>
              </span>
            )}
            <span
              className="text-slate-500 dark:text-slate-400 tabular-nums"
              data-shared-segment-position="true"
            >
              {activeUnitSegments.length > 0
                ? `SG ${localIndex + 1} of ${activeUnitSegments.length}`
                : '0 SG (empty)'}
            </span>
            {!activeUnitIsTurn && legacySegmentSpeaker && (
              <span className="rounded-md bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                {legacySegmentSpeaker}
              </span>
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
                <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
                <span>Playing Full {isConversation ? 'Scene' : 'Card'} audio · Browse freely</span>
              </span>
            )}
            {studyBoxDivergedFromAudible && (
              <button
                type="button"
                onClick={onFollowAudible}
                data-shared-segment-follow-audio="true"
                data-study-box-return-to-playing="true"
                className="min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
                <span>
                  Return to Playing · {audibleShortCode}
                  {audibleSpeakerInfo?.isAssigned ? ` ${audibleSpeakerInfo.displayName}` : ''}
                  {audibleLocalIndex >= 0 ? ` SG${audibleLocalIndex + 1}` : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Hierarchical Unit Selector (hidden for single-Unit Cards like P2!) */}
        {hasMultipleUnits && (
          <div className="space-y-1.5" data-study-box-unit-picker="true">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isConversation ? 'Turn & Speaker' : 'Section'}
            </span>
            <div
              role="group"
              aria-label={`Select ${activeUnitTerms.lower} in Study Box`}
              className="flex flex-wrap items-center gap-1.5 min-w-0"
            >
              {units.map((unit, uIdx) => {
                const selected = unit.viewKey === activeUnit.viewKey;
                const isAudible = unit.viewKey === selection.audibleUnitViewKey;
                const segCount = unit.segments?.length || 0;
                const shortCode = getSharedUnitShortCode(unit, uIdx);
                const uSpeaker = unit.kind === 'turn'
                  ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
                  : null;
                const fullTitle = uSpeaker
                  ? `${shortCode} ${uSpeaker.displayName} · ${segCount} SG`
                  : `${shortCode} · ${segCount} SG`;
                return (
                  <button
                    key={unit.viewKey}
                    type="button"
                    aria-pressed={selected}
                    aria-label={fullTitle}
                    title={fullTitle}
                    data-study-box-unit-option={unit.viewKey}
                    data-study-box-unit-id={unit.id || undefined}
                    data-study-box-unit-code={shortCode}
                    onClick={() => onSelectUnit?.(unit.viewKey)}
                    className={`min-h-11 sm:min-h-8 max-w-full px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      selected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isAudible
                          ? 'border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-800 dark:text-indigo-200'
                          : segCount === 0
                            ? 'border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:border-indigo-300'
                            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {uSpeaker && (
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full shrink-0 ${selected ? 'bg-white/90' : uSpeaker.palette.dot}`}
                      />
                    )}
                    <span className="shrink-0 font-bold">{shortCode}</span>
                    {uSpeaker && (
                      <span className="truncate max-w-[9.5rem] sm:max-w-[11rem] font-medium">
                        {uSpeaker.displayName}
                      </span>
                    )}
                    <span aria-hidden="true" className={selected ? 'text-indigo-200' : 'text-slate-300 dark:text-slate-600'}>
                      {' · '}
                    </span>
                    <span className={`shrink-0 text-[11px] ${selected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {segCount} SG
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Unit-Local Segment Selector (1..N within active Unit) + Prev/Next */}
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          onKeyDown={handleSegmentKeys}
          data-study-box-segment-picker="true"
        >
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
              Sentence
            </span>
            {activeUnitSegments.length > 0 ? (
              <div role="group" aria-label={`Jump to sentence in ${activeUnitShortCode}`} className="flex flex-wrap items-center gap-1">
                {activeUnitSegments.map((seg, idx) => {
                  const selected = seg.id === segment?.id;
                  const isAudible = seg.id === selection.audibleSegmentId;
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${activeUnitShortCode} Sentence ${idx + 1}${isAudible ? ' (playing audio)' : ''}`}
                      title={`${activeUnitShortCode} · SG${idx + 1}${isAudible ? ' (playing audio)' : ''}`}
                      data-shared-segment-pill={seg.id}
                      data-study-box-local-segment={idx + 1}
                      onClick={() => onSelectSegment?.(seg.id)}
                      className={`min-h-11 min-w-10 sm:min-h-8 sm:min-w-8 px-2.5 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        selected
                          ? 'bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 shadow-sm'
                          : isAudible
                            ? 'border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-200'
                            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <span>{idx + 1}</span>
                      {isAudible && !selected && (
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs italic text-slate-400 dark:text-slate-500">None</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={atUnitStart}
              onClick={() => stepLocalSegment(-1)}
              data-shared-segment-prev="true"
              aria-label={`Previous sentence in ${activeUnitShortCode}`}
              className="min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 hover:border-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={atUnitEnd}
              onClick={() => stepLocalSegment(1)}
              data-shared-segment-next="true"
              aria-label={`Next sentence in ${activeUnitShortCode}`}
              className="min-h-11 sm:min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-35 hover:border-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span>Next</span>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Exact Bilingual Pair Display (respects shared Workspace Style alignment, reading order, and Typography) */}
        {segment ? (
          <div className="rounded-xl border border-slate-200/85 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-4 sm:p-5 space-y-3.5">
            {renderStudyChannelBlock(primaryChannel, 'primary')}
            {renderStudyChannelBlock(secondaryChannel, 'secondary')}
          </div>
        ) : (
          <div
            data-study-box-empty-unit={activeUnit.viewKey}
            className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-4 text-sm italic text-slate-500 dark:text-slate-400"
          >
            Empty {activeUnitTerms.lower} ({activeUnitShortCode}) — no sentences to study yet.
          </div>
        )}

        {/* Integration-Ready Study Box Playback Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={playEnDisabled}
              onClick={() => supportsChannelPlay && segment && onPlaySegmentChannel(segment.id, 'text')}
              data-study-box-action="play-en"
              data-study-box-pending-callback={!supportsChannelPlay ? 'onPlaySegmentChannel' : undefined}
              title={supportsChannelPlay
                ? 'Play English only for this sentence (one-time Split override)'
                : 'Play EN — awaits 4E exact-channel Split override callback'}
              className="min-h-11 sm:min-h-9 px-3 rounded-xl border border-indigo-200/90 dark:border-indigo-800/80 bg-indigo-50/75 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
              <span>Play EN</span>
            </button>
            <button
              type="button"
              disabled={playIdDisabled}
              onClick={() => supportsChannelPlay && segment && onPlaySegmentChannel(segment.id, 'meaning')}
              data-study-box-action="play-id"
              data-study-box-pending-callback={!supportsChannelPlay ? 'onPlaySegmentChannel' : undefined}
              title={supportsChannelPlay
                ? 'Play Indonesian only for this sentence (one-time Split override)'
                : 'Play ID — awaits 4E exact-channel Split override callback'}
              className="min-h-11 sm:min-h-9 px-3 rounded-xl border border-emerald-200/90 dark:border-emerald-800/80 bg-emerald-50/75 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
              <span>Play ID</span>
            </button>
            <button
              type="button"
              disabled={playSegmentDisabled}
              onClick={() => segment && onPlaySegment?.(segment.id)}
              data-shared-segment-focus-play="true"
              data-study-box-action="play-segment"
              title="Play this sentence using current host playback configuration"
              className="min-h-11 sm:min-h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
              <span>Play Segment</span>
            </button>
            <button
              type="button"
              disabled={playContinueDisabled}
              onClick={() => supportsContinuePlay && segment && onPlayContinueFromSegment(segment.id, { scope: 'card' })}
              data-study-box-action="play-continue"
              data-study-box-pending-callback={!supportsContinuePlay ? 'onPlayContinueFromSegment' : undefined}
              title={supportsContinuePlay
                ? 'Play from this sentence and continue through the configured boundary'
                : 'Play & Continue — awaits 4E bounded Continue playback callback'}
              className="min-h-11 sm:min-h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <SkipForward aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Play &amp; Continue</span>
            </button>
          </div>
          {(!supportsChannelPlay || !supportsContinuePlay) && (
            <span
              data-study-box-pending-note="true"
              className="text-[11px] text-slate-400 dark:text-slate-500"
            >
              EN/ID channel &amp; Continue scopes pending 4E playback integration
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

export default SharedSegmentStudyBox;
