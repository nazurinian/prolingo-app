import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { A11y } from 'swiper/modules';
import 'swiper/css';
import './sharedFocusCarousel.css';
import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextWorkspaceStyleState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import { WorkspaceReaderScrollContext } from './useWorkspaceReaderScroll.js';
import {
  IDLE_SHARED_CURSOR,
  buildUnitPreviewExcerpt,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  isPrefersReducedMotion,
  resolveTurnSpeakerPresentation
} from './sharedCardPresentationUtils.js';
import {
  SHARED_SEMANTIC_COLORS,
  SHARED_SPACING_TOKENS,
  resolvePlaybackSemanticTone
} from './sharedDesignTokens.js';

const SWIPER_MODULES = [A11y];
const SWIPER_A11Y_CONFIG = Object.freeze({
  enabled: true,
  containerRoleDescriptionMessage: 'carousel',
  slideRole: 'group',
  scrollOnFocus: false
});

const useReducedMotionPreference = () => {
  const [reduced, setReduced] = useState(() => isPrefersReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches === true);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    if (typeof media.addListener === 'function') {
      media.addListener(sync);
      return () => media.removeListener(sync);
    }
    return undefined;
  }, []);
  return reduced;
};

/**
 * Horizontal Focus Carousel backed by Swiper React (`swiper@14.4.0`).
 * - Centered active slide (`centeredSlides`, `slidesPerView="auto"`) so first,
 *   interior, and last slides genuinely align to track midpoint while peeking
 *   adjacent Units with Expo-inspired scale/opacity.
 * - Real mouse-drag and touch-swipe gestures without accidental playback triggers.
 * - Adaptive variable height (`autoHeight`) updated on content/style/viewport changes.
 * - Offscreen/inactive slides are marked `inert` and `aria-hidden` so keyboard Tab
 *   never enters hidden controls; scoped keyboard navigation lives on the Card's rail.
 * - ProLingo Reader remains the sole owner of selected Unit identity; Swiper indices
 *   are derived UI values with feedback-loop prevention and safe user interruption.
 */
export const SharedHorizontalFocusCarousel = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  presentationState = null,
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onPlaySegment,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null,
  renderUnitHeader,
  isConsecutiveSpeakerTurn
}) => {
  const resolvedStyle = useMemo(
    () => normalizeTextWorkspaceStyleState(workspaceStyle),
    [workspaceStyle]
  );
  const reducedMotion = useReducedMotionPreference();
  const activeIndex = Math.max(0, Math.min(units.length - 1, selection.selectedUnitIndex >= 0 ? selection.selectedUnitIndex : 0));

  const swiperRef = useRef(null);
  const activeSlideContentRef = useRef(null);
  const selectedUnitViewKeyRef = useRef(selection.selectedUnitViewKey);
  const unitsRef = useRef(units);
  const onSelectUnitRef = useRef(onSelectUnit);
  const programmaticTargetRef = useRef(null);
  const draggingRef = useRef(false);
  const dragReleaseTimerRef = useRef(null);
  const resizeTimerRef = useRef(null);
  const mountedSyncRef = useRef(false);
  const lastTrackWidthRef = useRef(0);

  useLayoutEffect(() => {
    selectedUnitViewKeyRef.current = selection.selectedUnitViewKey;
    unitsRef.current = units;
    onSelectUnitRef.current = onSelectUnit;
  }, [selection.selectedUnitViewKey, units, onSelectUnit]);

  useEffect(() => () => {
    window.clearTimeout(dragReleaseTimerRef.current);
    window.clearTimeout(resizeTimerRef.current);
  }, []);

  const syncSwiperLayout = useCallback(() => {
    const swiper = swiperRef.current;
    if (!swiper || swiper.destroyed) return;
    swiper.update();
    swiper.updateAutoHeight(0);
  }, []);

  // Sync programmatic Reader selection -> Swiper slide position without feedback loops.
  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper || swiper.destroyed) return;
    const isInitial = !mountedSyncRef.current;
    mountedSyncRef.current = true;
    const duration = isInitial || reducedMotion ? 0 : 280;
    if (swiper.activeIndex !== activeIndex) {
      programmaticTargetRef.current = activeIndex;
      swiper.slideTo(activeIndex, duration, false);
    }
    swiper.updateAutoHeight(isInitial || reducedMotion ? 0 : 220);
  }, [activeIndex, reducedMotion, units.length]);

  const activeContextualSegmentId = contextualState?.target?.segmentId || null;

  // Recalculate autoHeight cleanly when bilingual layout, Contextual target, Typography, or Workspace Style changes.
  useEffect(() => {
    const frame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => syncSwiperLayout())
      : null;
    return () => {
      if (frame !== null && typeof window !== 'undefined') window.cancelAnimationFrame(frame);
    };
  }, [
    bilingualLayout,
    presentationState?.readingLanguage,
    presentationState?.bilingualStyle,
    presentationState?.contextualPlacement,
    presentationState?.appearance?.primaryFontSize,
    presentationState?.appearance?.secondaryFontSize,
    presentationState?.appearance?.fontFamily,
    presentationState?.appearance?.lineHeight,
    presentationState?.appearance?.textSpacing,
    activeContextualSegmentId,
    resolvedStyle.textAlign,
    resolvedStyle.paragraphIndent,
    resolvedStyle.speakerLayout,
    resolvedStyle.showAccents,
    syncSwiperLayout
  ]);

  // Observe active slide height changes (font reflow, viewport resize, bilingual switch).
  // Defer updateAutoHeight to a macrotask to prevent synchronous ResizeObserver loops.
  useEffect(() => {
    const node = activeSlideContentRef.current;
    if (!node || typeof ResizeObserver !== 'function') return undefined;
    let timerId = null;
    const observer = new ResizeObserver(() => {
      if (timerId !== null) return;
      timerId = window.setTimeout(() => {
        timerId = null;
        const swiper = swiperRef.current;
        if (!swiper || swiper.destroyed) return;
        swiper.updateAutoHeight(0);
      }, 0);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [activeIndex]);

  const handleSwiperInit = useCallback(swiper => {
    swiperRef.current = swiper;
    lastTrackWidthRef.current = swiper.el?.clientWidth || 0;
    swiper.setTransition(0);
    if (swiper.activeIndex !== activeIndex) {
      programmaticTargetRef.current = activeIndex;
      swiper.slideTo(activeIndex, 0, false);
    }
    swiper.update();
    swiper.setTransition(0);
    swiper.updateAutoHeight(0);
  }, [activeIndex]);

  const handleUserGestureStart = useCallback(() => {
    // Allow real touch/drag input to immediately interrupt any programmatic transition.
    programmaticTargetRef.current = null;
  }, []);

  const handleSliderFirstMove = useCallback(() => {
    programmaticTargetRef.current = null;
    draggingRef.current = true;
    window.clearTimeout(dragReleaseTimerRef.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    window.clearTimeout(dragReleaseTimerRef.current);
    dragReleaseTimerRef.current = window.setTimeout(() => {
      draggingRef.current = false;
    }, 120);
  }, []);

  const handleSlideChange = useCallback(swiper => {
    if (!swiper || swiper.destroyed) return;
    const nextIndex = swiper.activeIndex;
    if (programmaticTargetRef.current === nextIndex) {
      programmaticTargetRef.current = null;
      return;
    }
    programmaticTargetRef.current = null;
    const nextUnit = unitsRef.current[nextIndex];
    if (nextUnit && nextUnit.viewKey !== selectedUnitViewKeyRef.current) {
      selectedUnitViewKeyRef.current = nextUnit.viewKey;
      onSelectUnitRef.current?.(nextUnit.viewKey);
    }
  }, []);

  const handleSlideChangeTransitionEnd = useCallback(swiper => {
    if (!swiper || swiper.destroyed) return;
    programmaticTargetRef.current = null;
    swiper.updateAutoHeight(0);
  }, []);

  const handleResize = useCallback(swiper => {
    if (!swiper || swiper.destroyed) return;
    const nextWidth = swiper.el?.clientWidth || 0;
    if (!nextWidth || Math.abs(nextWidth - lastTrackWidthRef.current) <= 1) return;
    lastTrackWidthRef.current = nextWidth;
    window.clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      if (swiper.destroyed || swiperRef.current !== swiper) return;
      const found = unitsRef.current.findIndex(u => u.viewKey === selectedUnitViewKeyRef.current);
      const target = Math.max(0, Math.min(unitsRef.current.length - 1, found >= 0 ? found : swiper.activeIndex));
      swiper.updateSize();
      swiper.updateSlides();
      swiper.setTransition(0);
      programmaticTargetRef.current = target;
      swiper.slideTo(target, 0, false);
      swiper.updateAutoHeight(0);
    }, 0);
  }, []);

  const safePlaySegment = useCallback((segmentId, channel) => {
    if (draggingRef.current) return;
    onPlaySegment?.(segmentId, channel);
  }, [onPlaySegment]);

  const handlePeekClick = useCallback(unitViewKey => {
    if (draggingRef.current) return;
    onSelectUnit?.(unitViewKey);
  }, [onSelectUnit]);

  return (
    <div
      className="relative overflow-x-hidden"
      data-shared-focus-horizontal-shell="true"
      data-shared-focus-carousel-engine="swiper"
    >
      <Swiper
        modules={SWIPER_MODULES}
        a11y={SWIPER_A11Y_CONFIG}
        className="prolingo-focus-swiper"
        initialSlide={activeIndex}
        runCallbacksOnInit={false}
        centeredSlides
        slidesPerView="auto"
        spaceBetween={12}
        autoHeight
        loop={false}
        autoplay={false}
        speed={reducedMotion ? 0 : 280}
        threshold={8}
        longSwipesRatio={0.22}
        grabCursor
        simulateTouch
        allowTouchMove
        preventClicks
        preventClicksPropagation
        watchSlidesProgress
        observer
        observeParents
        resizeObserver
        onSwiper={handleSwiperInit}
        onTouchStart={handleUserGestureStart}
        onSliderFirstMove={handleSliderFirstMove}
        onTouchEnd={handleTouchEnd}
        onSlideChange={handleSlideChange}
        onSlideChangeTransitionEnd={handleSlideChangeTransitionEnd}
        onResize={handleResize}
        data-shared-part-layout="horizontal-focus"
        data-shared-focus-orientation="horizontal-focus"
        data-shared-part-track="horizontal"
        aria-label={`Horizontal ${getSharedUnitTerms(card).plural} focus carousel`}
      >
        {units.map((unit, unitIndex) => {
          const isSelected = unit.viewKey === selection.selectedUnitViewKey;
          const isAudible = unit.viewKey === selection.audibleUnitViewKey;
          const segCount = unit.segments?.length || 0;
          const isTurn = unit.kind === 'turn';
          const playbackTone = resolvePlaybackSemanticTone({
            state: playbackCursor?.state,
            channel: playbackCursor?.channel
          });
          const focusSurface = isTurn
            ? SHARED_SEMANTIC_COLORS.conversation.focusRing
            : SHARED_SEMANTIC_COLORS.paragraph.focusRing;
          const speakerInfo = isTurn
            ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
            : null;
          const repeated = isConsecutiveSpeakerTurn(units, unitIndex, speakerAppearanceMap);
          const excerpt = !isSelected ? buildUnitPreviewExcerpt(unit, presentationState || bilingualLayout, 180) : '';
          const peekAccentBorder = !isSelected && resolvedStyle.showAccents
            ? (isTurn
                ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}`
                : 'border-l-4 border-l-teal-400/55 dark:border-l-teal-600/55')
            : '';

          return (
            <SwiperSlide
              key={unit.viewKey}
              aria-hidden={!isSelected ? 'true' : undefined}
              data-shared-part-slide={unit.viewKey}
              data-shared-part-slide-unit-id={unit.id || undefined}
              data-shared-part-slide-index={unitIndex}
              data-shared-part-focused={isSelected ? unit.viewKey : undefined}
              data-shared-part-focused-unit-id={isSelected ? (unit.id || undefined) : undefined}
              data-shared-part-active={isSelected ? 'true' : undefined}
              data-shared-part-audible={isAudible ? 'true' : undefined}
              data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
            >
              <div
                ref={isSelected ? activeSlideContentRef : null}
                className={`prolingo-focus-slide-inner rounded-2xl border ${peekAccentBorder} ${
                  isSelected
                    ? (isAudible
                        ? `${playbackTone.cardActive} bg-white dark:bg-slate-900 shadow-md p-3.5 sm:p-5`
                        : `${focusSurface} bg-white dark:bg-slate-900 shadow-sm p-3.5 sm:p-5`)
                    : (isAudible
                        ? `${playbackTone.border} ${playbackTone.bgSoft} p-3 sm:p-4 cursor-pointer select-none`
                        : 'border-slate-200/85 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 p-3 sm:p-4 cursor-pointer select-none')
                }`}
              >
                {isSelected ? (
                  <>
                    <div className="mb-2.5 pb-2 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      {renderUnitHeader({
                        unit,
                        unitIndex,
                        totalUnits: units.length,
                        rolePrefix: 'Focused',
                        segCount,
                        isAudible,
                        isRepeatedSpeaker: repeated,
                        emphasize: true,
                        showSpeakerInHeader: false
                      })}
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
                      onPlaySegment={safePlaySegment}
                      onSelectContextualSegment={onSelectContextualSegment}
                      onFollowContextualAudible={onFollowContextualAudible}
                      onDismissContextualTarget={onDismissContextualTarget}
                    />
                  </>
                ) : (
                  <div
                    role="presentation"
                    tabIndex={-1}
                    onClick={() => handlePeekClick(unit.viewKey)}
                    data-shared-part-focus={unit.viewKey}
                    data-shared-part-focus-unit-id={unit.id || undefined}
                    data-shared-focus-peek="true"
                    className="w-full text-left space-y-2 rounded-xl"
                  >
                    <div className="pb-1.5 border-b border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
                      {renderUnitHeader({
                        unit,
                        unitIndex,
                        totalUnits: units.length,
                        rolePrefix: null,
                        segCount,
                        isAudible,
                        isRepeatedSpeaker: repeated,
                        emphasize: false,
                        showSpeakerInHeader: isTurn
                      })}
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300 shrink-0">
                        Focus
                      </span>
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-4 whitespace-pre-line break-words">
                      {excerpt || `Empty ${getSharedUnitTerms(unit).lower} — no sentences yet.`}
                    </p>
                  </div>
                )}
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
};

/**
 * Document-Flow Scroll-Driven Vertical Focus (Approved Hybrid C-HF2 Alternative).
 * Renders all authored Units in stable vertical document flow with ZERO fixed-height
 * containers and ZERO nested vertical scroll traps so oversized bilingual Units stay
 * 100% readable and ordinary document scrolling works seamlessly across multiple open Cards.
 *
 * One lightweight rAF-throttled viewport focal-band observer per multi-Unit Card dynamically
 * promotes the Unit passing through the reading focal band to full active prominence while
 * scaling neighbors down smoothly (respecting prefers-reduced-motion).
 */
export const SharedVerticalScrollFocusView = ({
  card,
  units,
  workspace,
  speakerAppearanceMap,
  presentationState = null,
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onNavigateUnit,
  navigationRef,
  onPlaySegment,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null,
  renderUnitHeader,
  isConsecutiveSpeakerTurn
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
  const scroll = useContext(WorkspaceReaderScrollContext);
  const activeIndex = Math.max(0, Math.min(units.length - 1, selection.selectedUnitIndex >= 0 ? selection.selectedUnitIndex : 0));
  const cardTerms = getSharedUnitTerms(card);

  const flowRootRef = useRef(null);
  const unitNodeMapRef = useRef(new Map());
  const setUnitNode = useCallback((viewKey, node) => {
    if (node) unitNodeMapRef.current.set(viewKey, node);
    else unitNodeMapRef.current.delete(viewKey);
  }, []);

  useEffect(() => {
    const key = selection.selectedUnitViewKey;
    const requestedKey = navigationRef.current;
    navigationRef.current = null;
    if (!requestedKey || requestedKey !== key || selection.source !== 'manual') return undefined;

    const target = unitNodeMapRef.current.get(key);
    if (!target) return undefined;
    return scroll?.reveal({ target, origin: 'unit', block: 'center' });
  }, [scroll, navigationRef, selection.selectedUnitViewKey, selection.source]);

  useLayoutEffect(() => () => { navigationRef.current = null; }, [navigationRef]);

  useLayoutEffect(() => {
    const root = flowRootRef.current;
    // A passive viewport observation must not create a manual selection during Book playback.
    if (!root || !scroll || units.length <= 1 || playbackCursor?.continuousPresentation) return undefined;
    return scroll.registerVerticalFocus(root, ({ top, bottom, focalY, scrollTop, maxScrollTop }) => {
      const flowRect = root.getBoundingClientRect();
      let nearest;
      if (scrollTop <= 8 && flowRect.top >= top - 40 && flowRect.top <= focalY) {
        nearest = units[0];
      } else if (scrollTop >= maxScrollTop - 20 && flowRect.bottom >= bottom - 120 && flowRect.bottom <= bottom + 80) {
        nearest = units[units.length - 1];
      } else {
        let nearestEdge = Infinity;
        let nearestCenter = Infinity;
        for (const unit of units) {
          const rect = unitNodeMapRef.current.get(unit.viewKey)?.getBoundingClientRect();
          if (!rect || rect.bottom < top || rect.top > bottom) continue;
          const edge = Math.max(rect.top - focalY, focalY - rect.bottom, 0);
          const center = Math.abs((rect.top + rect.bottom) / 2 - focalY);
          if (edge < nearestEdge || (edge === nearestEdge && center < nearestCenter)) {
            nearest = unit;
            nearestEdge = edge;
            nearestCenter = center;
          }
        }
      }
      if (nearest && nearest.viewKey !== selection.selectedUnitViewKey) {
        onSelectUnit?.(nearest.viewKey);
      }
    });
  }, [scroll, units, selection.selectedUnitViewKey, onSelectUnit, playbackCursor?.continuousPresentation]);

  return (
    <div
      ref={flowRootRef}
      className="space-y-3.5"
      data-shared-part-layout="vertical-focus"
      data-shared-focus-orientation="vertical-focus"
      data-shared-focus-vertical-flow="true"
      data-shared-focus-carousel-engine="document-flow-scroll"
    >
      {activeIndex === 0 && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1 text-left" data-shared-part-boundary="start">
          Start of {cardTerms.cardLower} · {getSharedUnitShortCode(units[0], 0)} of {units.length}
        </p>
      )}

      {units.map((unit, unitIndex) => {
        const isSelected = unit.viewKey === selection.selectedUnitViewKey;
        const isAudible = unit.viewKey === selection.audibleUnitViewKey;
        const isTurn = unit.kind === 'turn';
        const playbackTone = resolvePlaybackSemanticTone({
          state: playbackCursor?.state,
          channel: playbackCursor?.channel
        });
        const focusSurface = isTurn
          ? SHARED_SEMANTIC_COLORS.conversation.focusRing
          : SHARED_SEMANTIC_COLORS.paragraph.focusRing;
        const speakerInfo = isTurn
          ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
          : null;
        const repeated = isConsecutiveSpeakerTurn(units, unitIndex, speakerAppearanceMap);
        const segCount = unit.segments?.length || 0;
        const neighborRole = unitIndex === activeIndex - 1
          ? 'previous'
          : unitIndex === activeIndex + 1
            ? 'next'
            : undefined;
        const rolePrefix = isSelected
          ? 'Focused'
          : neighborRole === 'previous'
            ? 'Previous'
            : neighborRole === 'next'
              ? 'Next'
              : null;
        const accentBorder = !isSelected && resolvedStyle.showAccents
          ? (isTurn
              ? `border-l-4 ${isAudible ? speakerInfo.palette.rail : speakerInfo.palette.railMuted}`
              : 'border-l-4 border-l-teal-400/50 dark:border-l-teal-600/50')
          : '';

        return (
          <div
            key={unit.viewKey}
            ref={node => setUnitNode(unit.viewKey, node)}
            data-shared-focus-vertical-unit={unit.viewKey}
            data-shared-focus-vertical-unit-id={unit.id || undefined}
            data-shared-part-neighbor={neighborRole}
            data-shared-focus-preview={neighborRole}
            data-shared-part-focused={isSelected ? unit.viewKey : undefined}
            data-shared-part-focused-unit-id={isSelected ? (unit.id || undefined) : undefined}
            data-shared-part-active={isSelected ? 'true' : undefined}
            data-shared-part-audible={isAudible ? 'true' : undefined}
            data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
            className={`${SHARED_SPACING_TOKENS.mobileScrollMargin} prolingo-focus-vertical-unit rounded-2xl ${accentBorder} ${
              isSelected
                ? (isAudible
                    ? `border ${playbackTone.cardActive} bg-white dark:bg-slate-900 shadow-md p-3.5 sm:p-5`
                    : `${focusSurface} bg-white dark:bg-slate-900 shadow-sm p-3.5 sm:p-5`)
                : (isAudible
                    ? `border ${playbackTone.border} ${playbackTone.bgSoft} px-3 py-2.5 sm:px-4 sm:py-3`
                    : 'border border-slate-200/85 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/55 px-3 py-2.5 sm:px-4 sm:py-3')
            }`}
          >
            <div className={`${isSelected ? 'mb-2.5 pb-2' : 'mb-1.5 pb-1.5'} border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2`}>
              {renderUnitHeader({
                unit,
                unitIndex,
                totalUnits: units.length,
                rolePrefix,
                segCount,
                isAudible,
                isRepeatedSpeaker: repeated,
                emphasize: isSelected,
                showSpeakerInHeader: !isSelected && isTurn
              })}
              {!isSelected && (
                <button
                  type="button"
                  onClick={() => onNavigateUnit?.(unit.viewKey)}
                  data-shared-part-focus={unit.viewKey}
                  data-shared-part-focus-unit-id={unit.id || undefined}
                  aria-label={`Focus ${getSharedUnitShortCode(unit, unitIndex)}${speakerInfo ? ` ${speakerInfo.displayName}` : ''}`}
                  className="min-h-8 sm:min-h-7 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 dark:border-indigo-800/80 bg-white dark:bg-slate-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
                >
                  View {getSharedUnitShortCode(unit, unitIndex)}
                </button>
              )}
            </div>

            {isSelected ? (
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
            ) : (
              <div
                role="presentation"
                onClick={() => onNavigateUnit?.(unit.viewKey)}
                className="cursor-pointer relative max-h-[4.75rem] sm:max-h-[5.75rem] overflow-hidden"
              >
                <div inert aria-hidden="true" className="pointer-events-none">
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
                    disabled
                    forceSectionHeaders={false}
                  />
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-slate-50/95 via-slate-50/55 to-transparent dark:from-slate-900/95 dark:via-slate-900/55"
                />
              </div>
            )}
          </div>
        );
      })}

      {activeIndex === units.length - 1 && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500 px-1 text-left" data-shared-part-boundary="end">
          End of {cardTerms.cardLower} · {getSharedUnitShortCode(units[units.length - 1], units.length - 1)} of {units.length}
        </p>
      )}
    </div>
  );
};

export default SharedHorizontalFocusCarousel;
