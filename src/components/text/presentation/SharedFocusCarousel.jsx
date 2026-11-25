import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { A11y } from 'swiper/modules';
import 'swiper/css';
import './sharedFocusCarousel.css';
import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextWorkspaceStyleState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import SharedBilingualUnitsBody from './SharedBilingualUnitsBody.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildUnitPreviewExcerpt,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  isPrefersReducedMotion,
  resolveSafeScrollContainer,
  resolveTurnSpeakerPresentation
} from './sharedCardPresentationUtils.js';

const SWIPER_MODULES = [A11y];
const SWIPER_A11Y_CONFIG = Object.freeze({
  enabled: true,
  containerRoleDescriptionMessage: 'carousel',
  slideRole: 'group',
  scrollOnFocus: false
});

// Shared timestamp across open Vertical Focus Cards so one Card's programmatic
// scrollIntoView (from Rail/Prev/Next click) never falsely triggers another
// open Card's scroll-driven focal-band observer. Cleared immediately on real
// user wheel or touch input so user gestures always interrupt cleanly.
let globalProgrammaticVerticalScrollUntil = 0;

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
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onPlaySegment,
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
  const mountedSyncRef = useRef(false);
  const lastTrackWidthRef = useRef(0);

  useEffect(() => {
    selectedUnitViewKeyRef.current = selection.selectedUnitViewKey;
    unitsRef.current = units;
    onSelectUnitRef.current = onSelectUnit;
  }, [selection.selectedUnitViewKey, units, onSelectUnit]);

  useEffect(() => () => {
    window.clearTimeout(dragReleaseTimerRef.current);
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

  // Recalculate autoHeight cleanly when bilingual layout or Workspace Style changes.
  useEffect(() => {
    const frame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => syncSwiperLayout())
      : null;
    return () => {
      if (frame !== null && typeof window !== 'undefined') window.cancelAnimationFrame(frame);
    };
  }, [
    bilingualLayout,
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
    window.setTimeout(() => {
      if (!swiper || swiper.destroyed) return;
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

  const safePlaySegment = useCallback(segmentId => {
    if (draggingRef.current) return;
    onPlaySegment?.(segmentId);
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
        spaceBetween={14}
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
                        ? 'border-2 border-indigo-500/90 dark:border-indigo-400 bg-white dark:bg-slate-900 shadow-md ring-2 ring-indigo-500/15 p-4 sm:p-6'
                        : 'border-2 border-indigo-300/90 dark:border-indigo-600/80 bg-white dark:bg-slate-900 shadow-md ring-1 ring-indigo-400/15 p-4 sm:p-6')
                    : 'border-slate-200/85 dark:border-slate-800 bg-slate-50/85 dark:bg-slate-900/55 p-3.5 sm:p-5 cursor-pointer select-none'
                }`}
              >
                {isSelected ? (
                  <>
                    <div className="mb-3.5 pb-2.5 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
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
                      bilingualLayout={bilingualLayout}
                      workspaceStyle={resolvedStyle}
                      playbackCursor={playbackCursor}
                      focusSegmentId={focusSegmentId}
                      playableSegmentIds={playableSegmentIds}
                      audioCoverageMap={audioCoverageMap}
                      disabled={disabled}
                      forceSectionHeaders={isTurn}
                      onPlaySegment={safePlaySegment}
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
                    className="w-full text-left space-y-2.5 rounded-xl"
                  >
                    <div className="pb-2 border-b border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
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
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">
                        Focus
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-4 whitespace-pre-line break-words">
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
  bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  selection,
  onSelectUnit,
  onPlaySegment,
  renderUnitHeader,
  isConsecutiveSpeakerTurn
}) => {
  const resolvedStyle = normalizeTextWorkspaceStyleState(workspaceStyle);
  const reducedMotion = useReducedMotionPreference();
  const activeIndex = Math.max(0, Math.min(units.length - 1, selection.selectedUnitIndex >= 0 ? selection.selectedUnitIndex : 0));
  const cardTerms = getSharedUnitTerms(card);

  const flowRootRef = useRef(null);
  const unitNodeMapRef = useRef(new Map());
  const selectedUnitViewKeyRef = useRef(selection.selectedUnitViewKey);
  const unitsRef = useRef(units);
  const onSelectUnitRef = useRef(onSelectUnit);
  const prevSelectedKeyRef = useRef(selection.selectedUnitViewKey);
  const lastScrollSelectedKeyRef = useRef(null);
  const programmaticScrollUntilRef = useRef(0);
  const userHasScrolledRef = useRef(false);

  useEffect(() => {
    selectedUnitViewKeyRef.current = selection.selectedUnitViewKey;
    unitsRef.current = units;
    onSelectUnitRef.current = onSelectUnit;
  }, [selection.selectedUnitViewKey, units, onSelectUnit]);

  const setUnitNode = useCallback((viewKey, node) => {
    if (node) unitNodeMapRef.current.set(viewKey, node);
    else unitNodeMapRef.current.delete(viewKey);
  }, []);

  // Scroll smoothly to the active Unit ONLY on explicit non-scroll selection changes
  // (e.g., Rail chip, Prev/Next button, neighbor click), never fighting real user scroll.
  useEffect(() => {
    const prevKey = prevSelectedKeyRef.current;
    prevSelectedKeyRef.current = selection.selectedUnitViewKey;
    if (!prevKey || prevKey === selection.selectedUnitViewKey) return;
    if (lastScrollSelectedKeyRef.current === selection.selectedUnitViewKey) {
      lastScrollSelectedKeyRef.current = null;
      return;
    }
    if (selection.source !== 'manual') return;

    const node = unitNodeMapRef.current.get(selection.selectedUnitViewKey);
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    const comfortable = rect.top >= 48 && rect.bottom <= vh - 48;
    if (!comfortable && typeof node.scrollIntoView === 'function') {
      const guardUntil = Date.now() + (reducedMotion ? 120 : 560);
      programmaticScrollUntilRef.current = guardUntil;
      globalProgrammaticVerticalScrollUntil = Math.max(globalProgrammaticVerticalScrollUntil, guardUntil);
      node.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: rect.height > vh * 0.75 ? 'start' : 'center'
      });
    }
  }, [selection.selectedUnitViewKey, selection.source, reducedMotion]);

  // Single viewport focal-band observer for real scroll/wheel-driven active Unit updates.
  useEffect(() => {
    const rootNode = flowRootRef.current;
    if (!rootNode || typeof window === 'undefined' || units.length <= 1) return undefined;

    const scrollContainer = resolveSafeScrollContainer(rootNode);
    const scrollTarget = scrollContainer || window;
    let rafId = null;

    const evaluateFocalUnit = () => {
      rafId = null;
      if (!flowRootRef.current) return;
      if (!userHasScrolledRef.current) return;
      const now = Date.now();
      if (now < programmaticScrollUntilRef.current || now < globalProgrammaticVerticalScrollUntil) return;

      const vpRect = scrollContainer
        ? scrollContainer.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const vpHeight = Math.max(1, vpRect.bottom - vpRect.top);
      const focalY = vpRect.top + vpHeight * 0.42;

      const flowRect = flowRootRef.current.getBoundingClientRect();
      // Multi-Card non-competition guard: only update this Card when it actually
      // occupies the reading focal band, so open Cards never fight each other.
      if (flowRect.bottom < focalY - 64 || flowRect.top > focalY + 64) {
        return;
      }

      const currentUnits = unitsRef.current;
      const atScrollBottom = scrollContainer
        ? (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 20)
        : (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 20);
      const atScrollTop = scrollContainer
        ? scrollContainer.scrollTop <= 8
        : window.scrollY <= 8;

      if (atScrollTop && flowRect.top >= vpRect.top - 40 && flowRect.top <= focalY) {
        const first = currentUnits[0];
        if (first && first.viewKey !== selectedUnitViewKeyRef.current) {
          lastScrollSelectedKeyRef.current = first.viewKey;
          onSelectUnitRef.current?.(first.viewKey);
        }
        return;
      }

      if (atScrollBottom && flowRect.bottom >= vpRect.bottom - 120 && flowRect.bottom <= vpRect.bottom + 80) {
        const last = currentUnits[currentUnits.length - 1];
        if (last && last.viewKey !== selectedUnitViewKeyRef.current) {
          lastScrollSelectedKeyRef.current = last.viewKey;
          onSelectUnitRef.current?.(last.viewKey);
        }
        return;
      }

      let bestUnit = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestCenterDist = Number.POSITIVE_INFINITY;

      for (const unit of currentUnits) {
        const el = unitNodeMapRef.current.get(unit.viewKey);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Skip units completely outside the viewport
        if (rect.bottom < vpRect.top || rect.top > vpRect.bottom) continue;
        const spansFocal = rect.top <= focalY && rect.bottom >= focalY;
        const edgeDist = spansFocal
          ? 0
          : Math.min(Math.abs(rect.top - focalY), Math.abs(rect.bottom - focalY));
        const centerDist = Math.abs((rect.top + rect.bottom) / 2 - focalY);
        if (edgeDist < bestScore || (edgeDist === bestScore && centerDist < bestCenterDist)) {
          bestScore = edgeDist;
          bestCenterDist = centerDist;
          bestUnit = unit;
        }
      }

      if (bestUnit && bestUnit.viewKey !== selectedUnitViewKeyRef.current) {
        lastScrollSelectedKeyRef.current = bestUnit.viewKey;
        onSelectUnitRef.current?.(bestUnit.viewKey);
      }
    };

    const scheduleEvaluation = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(evaluateFocalUnit);
    };

    const markUserScrollIntent = () => {
      userHasScrolledRef.current = true;
      // Real wheel or touch input immediately interrupts programmatic scroll transitions.
      programmaticScrollUntilRef.current = 0;
      globalProgrammaticVerticalScrollUntil = 0;
      scheduleEvaluation();
    };

    const handleScroll = () => {
      const now = Date.now();
      if (now < programmaticScrollUntilRef.current || now < globalProgrammaticVerticalScrollUntil) return;
      if (!userHasScrolledRef.current) return;
      scheduleEvaluation();
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    scrollTarget.addEventListener('wheel', markUserScrollIntent, { passive: true });
    scrollTarget.addEventListener('touchstart', markUserScrollIntent, { passive: true });

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      scrollTarget.removeEventListener('wheel', markUserScrollIntent);
      scrollTarget.removeEventListener('touchstart', markUserScrollIntent);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [units.length]);

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
            className={`prolingo-focus-vertical-unit rounded-2xl ${accentBorder} ${
              isSelected
                ? (isAudible
                    ? 'border-2 border-indigo-500/90 dark:border-indigo-400 bg-white dark:bg-slate-900 shadow-md ring-2 ring-indigo-500/15 p-4 sm:p-6'
                    : 'border-2 border-indigo-300/90 dark:border-indigo-600/80 bg-white dark:bg-slate-900 shadow-md ring-1 ring-indigo-400/15 p-4 sm:p-6')
                : (isAudible
                    ? 'border border-indigo-300/90 dark:border-indigo-700 bg-indigo-50/25 dark:bg-indigo-950/20 p-3.5 sm:p-5'
                    : 'border border-slate-200/85 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/55 p-3.5 sm:p-5')
            }`}
          >
            <div className="mb-3 pb-2 border-b border-slate-100/90 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
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
                  onClick={() => onSelectUnit?.(unit.viewKey)}
                  data-shared-part-focus={unit.viewKey}
                  data-shared-part-focus-unit-id={unit.id || undefined}
                  aria-label={`Focus ${getSharedUnitShortCode(unit, unitIndex)}${speakerInfo ? ` ${speakerInfo.displayName}` : ''}`}
                  className="min-h-9 sm:min-h-7 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 dark:border-indigo-800/80 bg-white dark:bg-slate-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
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
            ) : (
              <div
                role="presentation"
                onClick={() => onSelectUnit?.(unit.viewKey)}
                className="cursor-pointer"
              >
                <div inert="" aria-hidden="true" className="pointer-events-none">
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
                    disabled
                    forceSectionHeaders={isTurn}
                  />
                </div>
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
