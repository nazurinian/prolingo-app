import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Layers, List, Play, Rows3, X } from 'lucide-react';
import { MOBILE_BOTTOM_PLAYER_RESERVE } from '../../constants/layoutConstants';
import { getAdvancedContentCount, getAdvancedExpressionPairs } from '../../utils/audioUtils';
import AudioSourceDot from './AudioSourceDot';
import { resolveFirstEnabledTextSlideKey, resolveSpeakingPartSlideKey } from '../../utils/playbackCarouselUtils';

const buildSlides = (item) => {
  if (!item) return [];
  const slides = [];
  if (String(item.sentence || '').trim() || String(item.meaning || '').trim()) {
    slides.push({ key: 'sentence', label: 'SENTENCE', en: item.sentence || '', idn: item.meaning || '', enPart: 'sentence', idnPart: 'meaning' });
  }
  getAdvancedExpressionPairs(item).forEach(pair => {
    if (pair.en.trim() || pair.idn.trim()) {
      slides.push({ key: `exp${pair.number}`, label: `EXP${pair.number}`, en: pair.en, idn: pair.idn, enPart: `exp${pair.number}_en`, idnPart: `exp${pair.number}_idn` });
    }
  });
  return slides;
};

const SourcePlayButton = ({ item, part, playId, independentPlayingId, handleIndependentPlay, active, source }) => {
  const playing = independentPlayingId === playId;
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); handleIndependentPlay(item, part, playId); }}
      className={`relative h-7 w-7 rounded-full border flex items-center justify-center flex-shrink-0 ${playing ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-500' : active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300'}`}
      aria-label={`Play ${part}`}
    >
      {playing ? <X className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
      <AudioSourceDot source={source} />
    </button>
  );
};

const ExpressionLine = ({ item, part, playId, text, secondary = false, active, independentPlayingId, handleIndependentPlay, source }) => {
  if (!text) return null;
  return (
    <div className="grid grid-cols-[28px_1fr] items-start gap-2">
      <SourcePlayButton item={item} part={part} playId={playId} independentPlayingId={independentPlayingId} handleIndependentPlay={handleIndependentPlay} active={active} source={source} />
      <p className={`${secondary ? 'text-[12px] italic text-slate-500 dark:text-slate-400' : 'text-[13px] md:text-sm text-slate-700 dark:text-slate-200'} leading-relaxed ${active ? 'font-black text-indigo-700 dark:text-indigo-300' : ''}`}>{text}</p>
    </div>
  );
};

export default function AdvancedExpressionPanel({
  open,
  onClose,
  item,
  rowId,
  isActive,
  speakingPart,
  independentPlayingId,
  handleIndependentPlay,
  isExpressionsHidden,
  revealedCells,
  toggleCellReveal,
  blurClass,
  revealedClass,
  playbackSequence = [],
  audioSourceByPart = {}
}) {
  const trackRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const [currentSlideKey, setCurrentSlideKey] = useState(null);
  const [showFull, setShowFull] = useState(false);
  const slides = useMemo(() => buildSlides(item), [item]);
  const slideSignature = useMemo(() => slides.map(slide => slide.key).join('|'), [slides]);
  const preferredSlideKey = useMemo(() => resolveFirstEnabledTextSlideKey(playbackSequence, slides.map(slide => slide.key)), [playbackSequence, slides]);
  const advancedCount = getAdvancedContentCount(item || {});

  const scrollToSlide = (slideKey, behavior = 'smooth') => {
    if (!slideKey || !trackRef.current) return;
    const target = trackRef.current.querySelector(`[data-advanced-slide="${slideKey}"]`);
    if (!target) return;
    setCurrentSlideKey(slideKey);
    trackRef.current.scrollTo({ left: target.offsetLeft, behavior });
  };

  useEffect(() => {
    if (!open) return;
    setShowFull(false);
    setCurrentSlideKey(preferredSlideKey);
    const frame = window.requestAnimationFrame(() => scrollToSlide(preferredSlideKey, 'auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [open, item?.id, preferredSlideKey, slideSignature]);

  useEffect(() => {
    if (!open || showFull || !isActive) return;
    const speakingSlideKey = resolveSpeakingPartSlideKey(speakingPart, slides.map(slide => slide.key));
    if (!speakingSlideKey) return;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollToSlide(speakingSlideKey, reduceMotion ? 'auto' : 'smooth');
  }, [open, showFull, isActive, speakingPart, slideSignature]);

  useEffect(() => () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  if (!open || !item || typeof document === 'undefined') return null;

  const activeIndex = Math.max(0, slides.findIndex(slide => slide.key === currentSlideKey));
  const currentSlide = slides[activeIndex] || slides[0] || null;

  const move = (direction) => {
    if (slides.length <= 1) return;
    const nextIndex = (activeIndex + direction + slides.length) % slides.length;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollToSlide(slides[nextIndex].key, reduceMotion ? 'auto' : 'smooth');
  };

  const syncCurrentSlideFromScroll = () => {
    if (!trackRef.current || !slides.length) return;
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const left = trackRef.current?.scrollLeft || 0;
      let nearest = slides[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      slides.forEach(slide => {
        const element = trackRef.current?.querySelector(`[data-advanced-slide="${slide.key}"]`);
        if (!element) return;
        const distance = Math.abs(element.offsetLeft - left);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = slide;
        }
      });
      if (nearest?.key) setCurrentSlideKey(nearest.key);
    });
  };

  const renderSlideBody = (slide) => {
    const isSentence = slide.key === 'sentence';
    const revealKey = isSentence ? `${rowId}-sent` : `${rowId}-${slide.key}`;
    const revealed = revealedCells[revealKey];
    const contentHidden = !isSentence && isExpressionsHidden;
    return (
      <div className={`space-y-3 ${contentHidden ? (revealed ? revealedClass : blurClass) : ''}`} onClick={(event) => contentHidden && toggleCellReveal(event, revealKey)}>
        <ExpressionLine
          item={item}
          part={slide.enPart}
          playId={`${rowId}-${slide.key}-en`}
          text={slide.en}
          active={isActive && speakingPart === slide.enPart}
          independentPlayingId={independentPlayingId}
          handleIndependentPlay={handleIndependentPlay}
          source={audioSourceByPart[slide.enPart]}
        />
        <ExpressionLine
          item={item}
          part={slide.idnPart}
          playId={`${rowId}-${slide.key}-idn`}
          text={slide.idn}
          secondary
          active={isActive && speakingPart === slide.idnPart}
          independentPlayingId={independentPlayingId}
          handleIndependentPlay={handleIndependentPlay}
          source={audioSourceByPart[slide.idnPart]}
        />
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center" onClick={(event) => event.stopPropagation()}>
      <button aria-label="Close advanced expressions" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
      <section
        className="relative z-10 w-full rounded-t-2xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col md:w-[min(920px,92vw)] md:rounded-2xl md:max-h-[86dvh]"
        style={{ maxHeight: `calc(100dvh - ${MOBILE_BOTTOM_PLAYER_RESERVE + 12}px - env(safe-area-inset-bottom, 0px))` }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-violet-50/85 dark:bg-violet-950/30 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Layers className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-wider">Advanced • {advancedCount} EXP</span></div>
            <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{item.word}</p>
            <p className="text-[9px] text-slate-500 dark:text-slate-400">One by One follows playback but remains manually swipeable. Show Full keeps every available Sentence/EXP visible.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600"><X className="h-4 w-4" /></button>
        </header>

        <div className="px-3 pt-3 md:px-4 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between flex-shrink-0">
          <div className="inline-flex w-full md:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/40 p-1">
            <button type="button" onClick={() => setShowFull(false)} className={`h-8 flex-1 md:flex-none px-3 rounded-lg flex items-center justify-center gap-1.5 text-[9px] font-black ${!showFull ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><Rows3 className="h-3.5 w-3.5" /> ONE BY ONE</button>
            <button type="button" onClick={() => setShowFull(true)} className={`h-8 flex-1 md:flex-none px-3 rounded-lg flex items-center justify-center gap-1.5 text-[9px] font-black ${showFull ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><List className="h-3.5 w-3.5" /> SHOW FULL</button>
          </div>

          {!showFull && slides.length > 1 ? (
            <div className="self-center md:self-auto flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-1">
              <button type="button" onClick={() => move(-1)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Previous advanced slide"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[78px] text-center text-[9px] font-black text-violet-600 dark:text-violet-300">{currentSlide?.label || '—'} • {activeIndex + 1}/{slides.length}</span>
              <button type="button" onClick={() => move(1)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Next advanced slide"><ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : (
            <span className="text-[8px] font-bold text-slate-400">Audio download stays in ⋮ → Audio</span>
          )}
        </div>

        {item.info && <div className="mx-3 mt-3 md:mx-4 rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-900/10 px-3 py-2"><span className="text-[9px] font-black uppercase mr-2 text-amber-600 dark:text-amber-400">INFO</span><span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.info}</span></div>}

        {!showFull ? (
          <div className="relative flex-1 min-h-0 px-3 py-3 md:px-4">
            <div ref={trackRef} onScroll={syncCurrentSlideFromScroll} className="flex h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain no-scrollbar scroll-smooth motion-reduce:scroll-auto rounded-2xl">
              {slides.map(slide => (
                <article key={slide.key} data-advanced-slide={slide.key} className="min-w-full snap-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/30 px-3 py-3 md:px-5 md:py-4 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${slide.key === 'sentence' ? 'bg-indigo-100 dark:bg-indigo-900/35 text-indigo-700 dark:text-indigo-300' : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'}`}>{slide.label}</span>
                    <span className="text-[9px] font-bold text-slate-400">{slides.findIndex(entry => entry.key === slide.key) + 1}/{slides.length}</span>
                  </div>
                  {renderSlideBody(slide)}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 md:px-4 space-y-2">
            {slides.map(slide => (
              <article key={slide.key} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/30 px-3 py-3 md:px-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded-lg px-2 py-1 text-[9px] font-black ${slide.key === 'sentence' ? 'bg-indigo-100 dark:bg-indigo-900/35 text-indigo-700 dark:text-indigo-300' : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'}`}>{slide.label}</span>
                  {(isActive && (speakingPart === slide.enPart || speakingPart === slide.idnPart)) && <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-300">PLAYING</span>}
                </div>
                {renderSlideBody(slide)}
              </article>
            ))}
          </div>
        )}

        {!showFull && slides.length > 1 && (
          <div className="px-4 pb-3 flex items-center justify-center gap-1.5 flex-shrink-0">
            {slides.map(slide => <button key={slide.key} type="button" onClick={() => scrollToSlide(slide.key)} className={`h-1.5 rounded-full transition-[width,background-color] ${slide.key === currentSlideKey ? 'w-5 bg-violet-600' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`} aria-label={`Show ${slide.key}`} />)}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
