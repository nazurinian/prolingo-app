import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Radio, SkipForward, Square, Target } from 'lucide-react';
import { matchesStructuredPlaybackControl } from '../../../domain/playback/nowPlayingDomain.js';
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
  getSharedUnitShortCode,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
  resolveCursorAuthoredPosition,
  resolveReaderAppearancePresentation,
  resolveSegmentCoverageStatuses,
  resolveTurnSpeakerPresentation
} from './sharedCardPresentationUtils.js';
import {
  SHARED_CONTROL_TOKENS,
  SHARED_SEMANTIC_COLORS,
  resolvePlaybackSemanticTone
} from './sharedDesignTokens.js';

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
  const [continueScope, setContinueScope] = useState('card');
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
  const cursorAuthored = resolveCursorAuthoredPosition({ card, lookup, cursor });
  const playbackTone = resolvePlaybackSemanticTone({ state: cursor.state, channel: cursor.channel });
  const isSelectedAudible = Boolean(
    segment
    && isSpeakingCard
    && cursor.precision === 'segment'
    && cursor.segmentId === segment.id
  );
  const isSelectedPaused = isSelectedAudible && cursor.state === 'paused';
  const isSelectedPlayingText = isSelectedAudible && !isSelectedPaused && cursor.channel === 'text';
  const isSelectedPlayingMeaning = isSelectedAudible && !isSelectedPaused && cursor.channel === 'meaning';
  const ownsSegmentControl = channel => matchesStructuredPlaybackControl(cursor, { scope: 'segment', segmentId: segment?.id, channel });
  const stopsEn = ownsSegmentControl('text');
  const stopsId = ownsSegmentControl('meaning');
  const stopsSegment = ownsSegmentControl(null);
  const continueStart = cursor.commandTarget?.segmentId;
  const continuesThisCard = lookup?.entryBySegmentId?.has(continueStart) && (!selection.hasManualOverride || continueStart === segment?.id);
  const stopsContinue = continuesThisCard && matchesStructuredPlaybackControl(cursor, {
    scope: 'from-here', segmentId: continueStart, boundary: continueScope
  });
  const EnIcon = stopsEn ? Square : Play;
  const IdIcon = stopsId ? Square : Play;
  const SegmentIcon = stopsSegment ? Square : Play;
  const ContinueIcon = stopsContinue ? Square : SkipForward;

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
  const playContinueDisabled = !supportsContinuePlay || disabled || (!stopsContinue && (!segment || (!hasText && !hasMeaning)));

  const atUnitStart = localIndex <= 0;
  const atUnitEnd = localIndex < 0 || localIndex >= activeUnitSegments.length - 1;
  const coverageStatuses = segment ? resolveSegmentCoverageStatuses({ segment, audioCoverageMap }) : null;

  // Authoritative audible unit/local segment metadata for Return to Playing
  const audibleEntry = selection.audibleSegmentId
    ? (lookup?.entryBySegmentId?.get(selection.audibleSegmentId) || null)
    : null;
  const audibleUnit = audibleEntry?.unit || null;
  const audibleUnitIndex = audibleEntry ? audibleEntry.unitIndex : -1;
  const audibleUnitSegments = audibleUnit?.segments || [];
  const audibleLocalIndex = audibleUnit && audibleEntry
    ? audibleUnitSegments.findIndex(item => item.id === audibleEntry.segment.id)
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
    const sizeToken = isPrimaryRole
      ? appearancePres.appearance.primaryFontSize
      : appearancePres.appearance.secondaryFontSize;
    const isChannelPlaying = isMeaningChannel ? isSelectedPlayingMeaning : isSelectedPlayingText;
    const isChannelPaused = isSelectedPaused && cursor.channel === channel;
    const content = isMeaningChannel ? meaningContent : textContent;
    const hasContent = isMeaningChannel ? hasMeaning : hasText;
    const langTag = isMeaningChannel ? meaningLang : textLang;
    const labelText = isMeaningChannel ? 'Indonesian (ID)' : 'English (EN)';
    const semantic = isMeaningChannel ? SHARED_SEMANTIC_COLORS.id : SHARED_SEMANTIC_COLORS.en;
    const textTone = isPrimaryRole
      ? 'font-medium text-slate-900 dark:text-slate-50'
      : appearancePres.secondaryTextClass;
    const activeSurface = isChannelPaused
      ? `${SHARED_SEMANTIC_COLORS.paused.rowActive} rounded-lg px-2.5 py-2 -mx-2.5`
      : isChannelPlaying
        ? `${semantic.rowActive} rounded-lg px-2.5 py-2 -mx-2.5`
        : '';

    return (
      <div
        key={channel}
        className={`${isPrimaryRole ? 'space-y-1' : 'pt-2.5 border-t border-slate-100 dark:border-slate-800/90 space-y-1'} ${activeSurface} transition-colors motion-reduce:transition-none`}
        data-shared-segment-channel-block={channel}
        data-study-box-channel={channel}
        data-study-box-role={role}
        data-study-box-channel-state={isChannelPaused ? 'paused' : isChannelPlaying ? 'playing' : 'idle'}
      >
        <div className="flex items-center gap-2 text-left">
          <span className={`text-[10px] font-bold uppercase tracking-wider select-none ${semantic.text}`}>
            {labelText}
          </span>
          {isChannelPlaying && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${semantic.solid}`}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Playing {isMeaningChannel ? 'ID' : 'EN'}</span>
            </span>
          )}
          {isChannelPaused && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${SHARED_SEMANTIC_COLORS.paused.badge}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SHARED_SEMANTIC_COLORS.paused.dot}`} />
              <span>Paused {isMeaningChannel ? 'ID' : 'EN'}</span>
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
          data-shared-reading-size={sizeToken}
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
      className="space-y-4"
      data-shared-segment-view="true"
      data-shared-segment-context-lang={primaryChannel}
      data-shared-segment-context-style={bilingualResolution.effectiveRenderMode}
    >
      {/* 1. Complete Natural Reading Context (all authored Sections/Turns, tap-to-select only) */}
      <div
        data-shared-segment-context={card?.id}
        data-shared-segment-context-channel={primaryChannel}
        data-shared-segment-context-style={bilingualResolution.effectiveRenderMode}
        className="space-y-1.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
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
        className={`rounded-2xl border ${studyBoxAccentBorder} bg-slate-50/85 dark:bg-slate-900/75 p-3 sm:p-4 space-y-2.5 sm:space-y-3 shadow-xs transition-colors motion-reduce:transition-none text-left ${
          isSelectedPaused
            ? SHARED_SEMANTIC_COLORS.paused.cardActive
            : isSelectedPlayingMeaning
              ? SHARED_SEMANTIC_COLORS.id.cardActive
              : isSelectedPlayingText
                ? SHARED_SEMANTIC_COLORS.en.cardActive
                : selection.isCardPrecisionPlaying
                  ? playbackTone.cardActive
                  : 'border-slate-200/95 dark:border-slate-700/90'
        }`}
      >
        {/* Compact Study Box Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/75 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
              isConversation ? SHARED_SEMANTIC_COLORS.conversation.badge : SHARED_SEMANTIC_COLORS.paragraph.badge
            }`}>
              <Target aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span>Study Box</span>
            </span>
            <span
              className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums shrink-0"
              data-shared-segment-unit-context="true"
            >
              {activeUnitShortCode}
              {isV1Compat ? ' (Compat)' : ''}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span
              className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0"
              data-shared-segment-position="true"
            >
              {activeUnitSegments.length > 0
                ? `SG${localIndex + 1}/${activeUnitSegments.length}`
                : '0 SG (empty)'}
            </span>
            {activeSpeakerInfo && (
              <span
                data-shared-segment-speaker-name="true"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold max-w-full ${activeSpeakerInfo.palette.pill}`}
              >
                <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${activeSpeakerInfo.palette.dot}`} />
                <span className="truncate max-w-[11rem] sm:max-w-[16rem]">{activeSpeakerInfo.displayName}</span>
              </span>
            )}
            {!activeUnitIsTurn && legacySegmentSpeaker && (
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {legacySegmentSpeaker}
              </span>
            )}
            {coverageStatuses && (
              <span className="hidden sm:inline text-[11px] text-slate-400 dark:text-slate-500" data-shared-segment-coverage="true">
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
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${playbackTone.bgSoft} ${playbackTone.border} ${playbackTone.text}`}
              >
                <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
                <span>
                  {cursor.state === 'paused' ? 'Paused' : 'Playing'} {cursor.channel === 'meaning' ? 'ID' : 'EN'} · Full {isConversation ? 'Scene' : 'Card'} · Browse freely
                </span>
              </span>
            )}
            {isSelectedAudible && cursorAuthored.variationLabel && (
              <span
                data-shared-playback-variation={cursorAuthored.variationKind}
                className="inline-flex items-center rounded-full border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
              >
                {cursorAuthored.variationLabel}
              </span>
            )}
            {studyBoxDivergedFromAudible && (
              <button
                type="button"
                onClick={onFollowAudible}
                data-shared-segment-follow-audio="true"
                data-study-box-return-to-playing="true"
                className={`min-h-8 sm:min-h-7 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${playbackTone.bgSoft} ${playbackTone.border} ${playbackTone.text} hover:brightness-95 dark:hover:brightness-110`}
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
        </div>

        {/* Hierarchical Unit Selector (hidden for single-Unit Cards like P2; scrollable on mobile) */}
        {hasMultipleUnits && (
          <div className="flex items-center gap-2 min-w-0" data-study-box-unit-picker="true">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
              {isConversation ? 'Turn' : 'Section'}
            </span>
            <div
              role="group"
              aria-label={`Select ${activeUnitTerms.lower} in Study Box`}
              className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 min-w-0 flex-1"
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
                    className={`min-h-8 shrink-0 max-w-full px-2.5 py-0.5 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                      selected
                        ? SHARED_SEMANTIC_COLORS.manual.pillActive
                        : isAudible
                          ? playbackTone.chipAudible
                          : segCount === 0
                            ? 'border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-400'
                            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {uSpeaker && (
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full shrink-0 ${selected ? 'bg-current opacity-80' : uSpeaker.palette.dot}`}
                      />
                    )}
                    <span className="shrink-0 font-bold">{shortCode}</span>
                    {uSpeaker && (
                      <span className="truncate max-w-[7rem] sm:max-w-[10.5rem] font-medium">
                        {uSpeaker.displayName}
                      </span>
                    )}
                    <span aria-hidden="true" className={selected ? 'opacity-50' : 'text-slate-300 dark:text-slate-600'}>
                      ·
                    </span>
                    <span className={`shrink-0 text-[11px] ${selected ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>
                      {segCount} SG
                    </span>
                    {isAudible && !selected && (
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full shrink-0 ${playbackTone.dot}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Unit-Local Segment Selector (1..N within active Unit) + Compact Prev/Next */}
        <div
          className="flex items-center justify-between gap-2 min-w-0"
          onKeyDown={handleSegmentKeys}
          data-study-box-segment-picker="true"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto pb-0.5 sm:pb-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
              Segment
            </span>
            {activeUnitSegments.length > 0 ? (
              <div role="group" aria-label={`Jump to sentence in ${activeUnitShortCode}`} className="flex flex-nowrap sm:flex-wrap items-center gap-1">
                {activeUnitSegments.map((seg, idx) => {
                  const selected = seg.id === segment?.id;
                  const isAudible = seg.id === selection.audibleSegmentId;
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${activeUnitShortCode} Sentence ${idx + 1}${isAudible ? ' (playing audio)' : ''}`}
                      title={`${activeUnitShortCode} · SG${idx + 1}/${activeUnitSegments.length}${isAudible ? ' (playing audio)' : ''}`}
                      data-shared-segment-pill={seg.id}
                      data-study-box-local-segment={idx + 1}
                      onClick={() => onSelectSegment?.(seg.id)}
                      className={`min-h-8 min-w-8 shrink-0 px-2 rounded-lg text-xs font-semibold tabular-nums inline-flex items-center justify-center gap-1 transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                        selected
                          ? (isAudible ? `${playbackTone.solid} shadow-xs` : SHARED_SEMANTIC_COLORS.manual.pillActive)
                          : isAudible
                            ? playbackTone.chipAudible
                            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span>{idx + 1}</span>
                      {isAudible && !selected && (
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${playbackTone.dot}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs italic text-slate-400 dark:text-slate-500">None</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={atUnitStart}
              onClick={() => stepLocalSegment(-1)}
              data-shared-segment-prev="true"
              aria-label={`Previous sentence in ${activeUnitShortCode}`}
              className={`min-h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-0.5 disabled:opacity-35 hover:border-slate-300 dark:hover:border-slate-600 transition-colors ${SHARED_CONTROL_TOKENS.focusRing}`}
            >
              <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previous</span>
              <span className="sm:hidden">Prev</span>
            </button>
            <button
              type="button"
              disabled={atUnitEnd}
              onClick={() => stepLocalSegment(1)}
              data-shared-segment-next="true"
              aria-label={`Next sentence in ${activeUnitShortCode}`}
              className={`min-h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-0.5 disabled:opacity-35 hover:border-slate-300 dark:hover:border-slate-600 transition-colors ${SHARED_CONTROL_TOKENS.focusRing}`}
            >
              <span>Next</span>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Primary Bilingual Sentence Pair Display */}
        {segment ? (
          <div className="rounded-xl border border-slate-200/85 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-3.5 sm:p-4 space-y-2.5">
            {renderStudyChannelBlock(primaryChannel, 'primary')}
            {renderStudyChannelBlock(secondaryChannel, 'secondary')}
          </div>
        ) : (
          <div
            data-study-box-empty-unit={activeUnit.viewKey}
            className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-3.5 text-sm italic text-slate-500 dark:text-slate-400"
          >
            Empty {activeUnitTerms.lower} ({activeUnitShortCode}) — no sentences to study yet.
          </div>
        )}

        {/* Study Box Playback Bar: 2 structured rows on mobile, unified horizontal strip on desktop */}
        <div
          className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 pt-0.5"
          data-study-box-playback-bar="true"
        >
          {/* Row 1: Play EN / Play ID / Play Segment */}
          <div className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,1.36fr)] sm:flex sm:flex-wrap items-center gap-1.5" data-study-box-primary-actions="true">
            <button
              type="button"
              disabled={playEnDisabled}
              onClick={() => supportsChannelPlay && segment && onPlaySegmentChannel(segment.id, 'text')}
              data-study-box-action="play-en"
              data-reader-playback-action={stopsEn ? 'stop' : 'play'}
              data-study-box-pending-callback={!supportsChannelPlay ? 'onPlaySegmentChannel' : undefined}
              title={stopsEn ? 'Stop English playback' : supportsChannelPlay
                ? 'Play English only for this sentence (one-time Split override)'
                : 'Play EN — awaits 4E exact-channel Split override callback'}
              className={`min-h-9 sm:min-h-8 px-1.5 sm:px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                stopsEn
                  ? `${SHARED_SEMANTIC_COLORS.en.solid} border-blue-600 shadow-xs`
                  : `${SHARED_SEMANTIC_COLORS.en.border} ${SHARED_SEMANTIC_COLORS.en.bgSoft} ${SHARED_SEMANTIC_COLORS.en.text} hover:bg-blue-100/90 dark:hover:bg-blue-900/60`
              }`}
            >
              <EnIcon aria-hidden="true" className="w-3 h-3 fill-current shrink-0" />
              <span>{stopsEn ? 'Stop EN' : 'Play EN'}</span>
            </button>
            <button
              type="button"
              disabled={playIdDisabled}
              onClick={() => supportsChannelPlay && segment && onPlaySegmentChannel(segment.id, 'meaning')}
              data-study-box-action="play-id"
              data-reader-playback-action={stopsId ? 'stop' : 'play'}
              data-study-box-pending-callback={!supportsChannelPlay ? 'onPlaySegmentChannel' : undefined}
              title={stopsId ? 'Stop Indonesian playback' : supportsChannelPlay
                ? 'Play Indonesian only for this sentence (one-time Split override)'
                : 'Play ID — awaits 4E exact-channel Split override callback'}
              className={`min-h-9 sm:min-h-8 px-1.5 sm:px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                stopsId
                  ? `${SHARED_SEMANTIC_COLORS.id.solid} border-violet-600 shadow-xs`
                  : `${SHARED_SEMANTIC_COLORS.id.border} ${SHARED_SEMANTIC_COLORS.id.bgSoft} ${SHARED_SEMANTIC_COLORS.id.text} hover:bg-violet-100/90 dark:hover:bg-violet-900/60`
              }`}
            >
              <IdIcon aria-hidden="true" className="w-3 h-3 fill-current shrink-0" />
              <span>{stopsId ? 'Stop ID' : 'Play ID'}</span>
            </button>
            <button
              type="button"
              disabled={playSegmentDisabled}
              onClick={() => segment && onPlaySegment?.(segment.id)}
              data-shared-segment-focus-play="true"
              data-study-box-action="play-segment"
              data-reader-playback-action={stopsSegment ? 'stop' : 'play'}
              title={stopsSegment ? 'Stop Segment playback' : 'Play this sentence using current host playback configuration'}
              className={`min-h-9 sm:min-h-8 px-2 sm:px-3 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                stopsSegment
                  ? `${playbackTone.solid}`
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <SegmentIcon aria-hidden="true" className="w-3 h-3 fill-current shrink-0" />
              <span>{stopsSegment ? 'Stop Segment' : 'Play Segment'}</span>
            </button>
          </div>

          {/* Row 2: Continue through [Boundary] / Play & Continue */}
          <div
            className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800 sm:pt-0 sm:border-t-0"
            data-study-box-continue-actions="true"
          >
            {supportsContinuePlay && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
                <span className="whitespace-nowrap">Continue through</span>
                <select
                  data-study-box-continue-scope="true"
                  className={`min-h-9 sm:min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 sm:px-2 text-xs font-semibold text-slate-800 dark:text-slate-100 ${SHARED_CONTROL_TOKENS.focusRing}`}
                  value={continueScope}
                  disabled={disabled}
                  onChange={event => setContinueScope(event.target.value)}
                >
                  <option value="unit">{activeUnitIsTurn ? 'Turn' : 'Section'}</option>
                  <option value="card">Card</option>
                  <option value="document">Workspace</option>
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={playContinueDisabled}
              onClick={() => supportsContinuePlay && onPlayContinueFromSegment(stopsContinue ? continueStart : segment.id, { scope: continueScope })}
              data-study-box-action="play-continue"
              data-reader-playback-action={stopsContinue ? 'stop' : 'play'}
              data-study-box-pending-callback={!supportsContinuePlay ? 'onPlayContinueFromSegment' : undefined}
              title={stopsContinue ? 'Stop continuous playback' : supportsContinuePlay
                ? 'Play from this sentence and continue through the configured boundary'
                : 'Play & Continue — awaits 4E bounded Continue playback callback'}
              className={`flex-1 sm:flex-none min-h-9 sm:min-h-8 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors ${SHARED_CONTROL_TOKENS.focusRing} ${
                stopsContinue
                  ? `${playbackTone.solid} border-transparent shadow-xs`
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-200'
              }`}
            >
              <ContinueIcon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
              <span>{stopsContinue ? 'Stop Continue' : 'Play & Continue'}</span>
            </button>
          </div>

          {(!supportsChannelPlay || !supportsContinuePlay) && (
            <span
              data-study-box-pending-note="true"
              className="w-full text-[11px] text-slate-400 dark:text-slate-500"
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
