import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, Play, X } from 'lucide-react';
import HighlightedText from '../common/HighlightedText';
import { getAdvancedExpressionPairs } from '../../utils/audioUtils';
import AudioSourceDot from './AudioSourceDot';
import { resolveFirstEnabledTextSlideKey, resolveSpeakingPartSlideKey } from '../../utils/playbackCarouselUtils';
import { getMemoryRevealKey, isMemoryPartHidden } from '../../utils/memoryModeUtils';

const getEnabledContentSlides = (item, playbackSequence) => {
  const enabled = new Set((Array.isArray(playbackSequence) ? playbackSequence : [])
    .filter(entry => entry?.enabled)
    .map(entry => String(entry.key || '')));
  const slides = [];

  if ((enabled.has('sentence_en') || enabled.has('sentence_idn')) && (String(item?.sentence || '').trim() || String(item?.meaning || '').trim())) {
    slides.push({ key: 'sentence', label: 'SENTENCE', en: item?.sentence || '', idn: item?.meaning || '', enPart: 'sentence', idnPart: 'meaning' });
  }

  getAdvancedExpressionPairs(item || {}).forEach(pair => {
    const key = `exp${pair.number}`;
    if ((enabled.has(`${key}_en`) || enabled.has(`${key}_idn`)) && (pair.en.trim() || pair.idn.trim())) {
      slides.push({ key, label: `EXP${pair.number}`, en: pair.en, idn: pair.idn, enPart: `${key}_en`, idnPart: `${key}_idn` });
    }
  });

  return slides;
};

const SourcePlayButton = ({ item, part, playId, independentPlayingId, handleIndependentPlay, isActive, source, small = false }) => {
  const playing = independentPlayingId === playId;
  const size = small ? 'h-5 w-5' : 'h-6 w-6';
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); handleIndependentPlay(item, part, playId); }}
      className={`relative ${size} flex-shrink-0 rounded-full border flex items-center justify-center transition-colors ${playing ? 'bg-red-50 dark:bg-red-900/30 text-red-500 border-red-200 dark:border-red-800' : isActive ? 'bg-blue-500 border-blue-400 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:text-indigo-600'}`}
      aria-label={`Play ${part}`}
    >
      {playing ? <X className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> : <Play className={`${small ? 'h-2.5 w-2.5' : 'h-3 w-3'} fill-current`} />}
      <AudioSourceDot source={source} />
    </button>
  );
};

export default function InlineLearningCarousel({
  item,
  rowId,
  isActive,
  speakingPart,
  playbackSequence,
  independentPlayingId,
  handleIndependentPlay,
  isMemoryMode,
  memorySettings,
  revealedCells,
  toggleCellReveal,
  blurClass,
  revealedClass,
  audioSourceByPart = {}
}) {
  const trackRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const wasActiveRef = useRef(false);
  const slides = useMemo(() => getEnabledContentSlides(item, playbackSequence), [item, playbackSequence]);
  const slideSignature = useMemo(() => slides.map(slide => slide.key).join('|'), [slides]);
  const initialSlideKey = useMemo(() => resolveFirstEnabledTextSlideKey(playbackSequence, slides.map(slide => slide.key)), [playbackSequence, slides]);
  const [visibleSlideKey, setVisibleSlideKey] = useState(initialSlideKey);

  const scrollToSlide = (slideKey, behavior = 'smooth') => {
    if (!slideKey || !trackRef.current) return;
    const target = trackRef.current.querySelector(`[data-inline-slide="${slideKey}"]`);
    if (!target) return;
    setVisibleSlideKey(slideKey);
    trackRef.current.scrollTo({ left: target.offsetLeft, behavior });
  };

  useEffect(() => {
    if (!initialSlideKey) return;
    setVisibleSlideKey(initialSlideKey);
    const frame = window.requestAnimationFrame(() => scrollToSlide(initialSlideKey, 'auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [item?.id, slideSignature, initialSlideKey]);

  useEffect(() => {
    if (!initialSlideKey || !trackRef.current) {
      wasActiveRef.current = isActive;
      return;
    }

    const wasActive = wasActiveRef.current;
    const justActivated = isActive && !wasActive;
    const justDeactivated = !isActive && wasActive;
    wasActiveRef.current = isActive;

    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';

    if (justActivated || justDeactivated) {
      scrollToSlide(initialSlideKey, justActivated ? 'auto' : behavior);
      return;
    }

    if (!isActive) return;

    const speakingSlideKey = resolveSpeakingPartSlideKey(speakingPart, slides.map(slide => slide.key));
    if (speakingSlideKey && slides.some(slide => slide.key === speakingSlideKey)) {
      scrollToSlide(speakingSlideKey, behavior);
      return;
    }

    if (!speakingPart || speakingPart === 'word' || speakingPart === 'word_idn') {
      scrollToSlide(initialSlideKey, behavior);
    }
  }, [isActive, speakingPart, initialSlideKey, slideSignature]);

  useEffect(() => () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  if (!slides.length) return null;

  const visibleIndex = Math.max(0, slides.findIndex(slide => slide.key === visibleSlideKey));
  const move = (direction) => {
    if (slides.length <= 1) return;
    const nextIndex = (visibleIndex + direction + slides.length) % slides.length;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollToSlide(slides[nextIndex].key, reduceMotion ? 'auto' : 'smooth');
  };

  const syncVisibleSlideFromScroll = () => {
    if (!trackRef.current || !slides.length) return;
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const left = trackRef.current?.scrollLeft || 0;
      let nearest = slides[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      slides.forEach(slide => {
        const element = trackRef.current?.querySelector(`[data-inline-slide="${slide.key}"]`);
        if (!element) return;
        const distance = Math.abs(element.offsetLeft - left);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = slide;
        }
      });
      if (nearest?.key) setVisibleSlideKey(nearest.key);
    });
  };

  return (
    <div className="pl-0 md:pl-11 flex-1 min-h-0 pr-0.5">
      <div
        ref={trackRef}
        className="flex h-full min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain scroll-smooth motion-reduce:scroll-auto no-scrollbar"
        onScroll={syncVisibleSlideFromScroll}
        onClick={(event) => event.stopPropagation()}
      >
        {slides.map((slide, index) => {
          const isSentence = slide.key === 'sentence';
          const enActive = isActive && speakingPart === slide.enPart;
          const idnActive = isActive && speakingPart === slide.idnPart;
          const slideActive = enActive || idnActive;
          const enHidden = isMemoryMode && isMemoryPartHidden(memorySettings, slide.enPart);
          const idHidden = isMemoryMode && isMemoryPartHidden(memorySettings, slide.idnPart);
          const enRevealKey = getMemoryRevealKey(rowId, slide.enPart);
          const idRevealKey = getMemoryRevealKey(rowId, slide.idnPart);
          const enReveal = revealedCells[enRevealKey];
          const idReveal = revealedCells[idRevealKey];
          return (
            <article
              key={slide.key}
              data-inline-slide={slide.key}
              className={`min-w-full snap-center rounded-lg border px-2 py-1.5 ${slideActive ? 'overflow-y-auto overscroll-contain custom-scrollbar' : 'overflow-hidden'} ${isActive ? 'border-blue-400/70 bg-blue-500/25' : 'border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/20'}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`text-[8px] font-black tracking-wide ${isActive ? 'text-blue-100' : isSentence ? 'text-indigo-500' : 'text-violet-500'}`}>{slide.label}</span>
                <div className="flex items-center gap-1">
                  {slides.length > 1 && (
                    <div className="hidden md:flex items-center gap-0.5">
                      <button type="button" onClick={(event) => { event.stopPropagation(); move(-1); }} className={`h-5 w-5 rounded-full flex items-center justify-center border ${isActive ? 'border-blue-300/70 text-blue-100 hover:bg-blue-500/50' : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300'}`} aria-label="Previous card text"><ChevronLeft className="h-3 w-3" /></button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); move(1); }} className={`h-5 w-5 rounded-full flex items-center justify-center border ${isActive ? 'border-blue-300/70 text-blue-100 hover:bg-blue-500/50' : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300'}`} aria-label="Next card text"><ChevronRight className="h-3 w-3" /></button>
                    </div>
                  )}
                  {slides.length > 1 && <span className={`text-[8px] min-w-[24px] text-right font-bold ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>{visibleIndex + 1}/{slides.length}</span>}
                </div>
              </div>

              <div className="space-y-1">
                {slide.en && (
                  <div className="flex items-start gap-1.5">
                    <SourcePlayButton item={item} part={slide.enPart} playId={`${rowId}-${slide.key}-en`} independentPlayingId={independentPlayingId} handleIndependentPlay={handleIndependentPlay} isActive={isActive} source={audioSourceByPart[slide.enPart]} />
                    <div className={`min-w-0 flex-1 ${enHidden ? (enReveal ? revealedClass : blurClass) : ''}`} onClick={(event) => enHidden && toggleCellReveal(event, enRevealKey)}>
                      <p className={`text-[12px] md:text-sm leading-snug ${enActive ? 'font-black text-white line-clamp-none' : `line-clamp-2 ${isActive ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}`}`}>
                        <HighlightedText text={slide.en} highlight={item.word} />
                      </p>
                    </div>
                  </div>
                )}

                {slide.idn && (
                  <div className="flex items-start gap-1.5 pl-1 md:pl-5">
                    <SourcePlayButton item={item} part={slide.idnPart} playId={`${rowId}-${slide.key}-idn`} independentPlayingId={independentPlayingId} handleIndependentPlay={handleIndependentPlay} isActive={isActive} source={audioSourceByPart[slide.idnPart]} small />
                    <div className={`min-w-0 flex-1 ${idHidden ? (idReveal ? revealedClass : blurClass) : ''}`} onClick={(event) => idHidden && toggleCellReveal(event, idRevealKey)}>
                      <p className={`text-[10px] md:text-xs italic leading-snug ${idnActive ? 'font-black text-white line-clamp-none' : `line-clamp-2 ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}`}>
                        <HighlightedText text={slide.idn} highlight={item.meaningWord || item.word} />
                        <Globe className="ml-1 inline-block h-2.5 w-2.5 opacity-45" />
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
