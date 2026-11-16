import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Columns2,
  Eye,
  Monitor,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  Smartphone,
  Square,
  Sun,
  Volume2,
  ZoomIn
} from 'lucide-react';
import { selectTextCardPresentation } from '../../../domain/text/textCardPresentationDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { resolveTextCardPresentationCursor } from '../../../domain/text/textCardPresentationCursorDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from '../../../domain/text/textStructuredPlaybackDomain.js';
import {
  createA2ParagraphReaderFixture,
  createA2V1CompatibilityParagraphFixture
} from '../../../../scripts/fixtures/shared-card-a2/paragraph-reader-fixture.js';
import { createA1PresentationFixture } from '../../../../scripts/fixtures/shared-card-a1/presentation-fixture.js';
import TextParagraphUnifiedReading from '../TextParagraphUnifiedReading.jsx';
import SharedParagraphWorkspaceReader from './SharedParagraphCardReader.jsx';

const FIXTURE_MODES = Object.freeze([
  { id: 'editorial-v2', label: 'v2 Editorial (Title + Multi-Section)' },
  { id: 'a1-v2', label: 'A1 Multi-Section Fixture' },
  { id: 'v1-compat', label: 'v1 Compatibility Paragraph' }
]);

const VIEWPORT_MODES = Object.freeze([
  { id: 'desktop', label: 'Desktop' },
  { id: 'mobile', label: 'Mobile (375px)' },
  { id: 'narrow', label: '320px Reflow' }
]);

const COMPARISON_MODES = Object.freeze([
  { id: 'shared', label: 'Shared Reader' },
  { id: 'compare', label: 'Before / After' },
  { id: 'legacy', label: 'Legacy Only' }
]);

const createFixturePayload = fixtureMode => {
  if (fixtureMode === 'v1-compat') {
    const f = createA2V1CompatibilityParagraphFixture();
    return { fixtureMode, ...f, targetDocumentId: f.ids.documentId, audioCoverageMap: null };
  }
  if (fixtureMode === 'a1-v2') {
    const f = createA1PresentationFixture();
    return { fixtureMode, ...f, targetDocumentId: f.ids.paragraphDocumentId, audioCoverageMap: null };
  }
  const f = createA2ParagraphReaderFixture();
  return { fixtureMode, ...f, targetDocumentId: f.ids.documentId };
};

const flattenReadableSegments = presentation => (
  (presentation?.cards || []).flatMap(card => (
    (card.units || []).flatMap(unit => (
      (unit.segments || []).map(seg => ({ cardId: card.id, unitId: unit.id, segment: seg }))
    ))
  ))
);

/**
 * Developer-only QA preview for evaluating Shared Card UI / A2 Paragraph Reader across
 * v2 multi-section, v1 compatibility, dark mode, 200% text scale, and live view switches.
 */
export const TextSharedCardReaderQaPreview = () => {
  const [fixtureMode, setFixtureMode] = useState('editorial-v2');
  const [fixtureData, setFixtureData] = useState(() => createFixturePayload('editorial-v2'));
  const [viewState, setViewState] = useState(() => normalizeTextCardPresentationState());
  const [comparisonMode, setComparisonMode] = useState('shared');
  const [viewportMode, setViewportMode] = useState('desktop');
  const [theme, setTheme] = useState('light');
  const [zoom200, setZoom200] = useState(false);
  const [reducedMotionPreview, setReducedMotionPreview] = useState(false);

  // Simulated host audio state (lives outside presentation viewState)
  const [audioConfig, setAudioConfig] = useState(() => ({
    representationMode: 'split',
    speakingChannel: 'text'
  }));
  const [audioSession, setAudioSession] = useState(() => ({
    sessionId: 0,
    isPlaying: false,
    isPaused: false,
    activeCardId: null,
    activeSegmentId: null,
    speakingChannel: 'text'
  }));
  const [focusTarget, setFocusTarget] = useState(null);
  const [actionLog, setActionLog] = useState([]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.documentElement.style.fontSize = zoom200 ? '200%' : '';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [zoom200]);

  const presentation = useMemo(() => (
    selectTextCardPresentation(fixtureData.snapshot, { documentId: fixtureData.targetDocumentId })
  ), [fixtureData]);

  const orderedEntries = useMemo(() => flattenReadableSegments(presentation), [presentation]);

  const appendLog = useCallback(message => {
    setActionLog(prev => [{ id: `${Date.now()}-${prev.length}`, text: message }, ...prev].slice(0, 8));
  }, []);

  const handleSelectFixture = nextMode => {
    const nextPayload = createFixturePayload(nextMode);
    setFixtureMode(nextMode);
    setFixtureData(nextPayload);
    setFocusTarget(null);
    setAudioSession({
      sessionId: 0,
      isPlaying: false,
      isPaused: false,
      activeCardId: null,
      activeSegmentId: null,
      speakingChannel: 'text'
    });
    appendLog(`Loaded fixture: ${nextMode}`);
  };

  const handleResetViewOnly = useCallback(() => {
    setViewState(normalizeTextCardPresentationState(DEFAULT_TEXT_CARD_PRESENTATION_STATE));
    appendLog('Reset presentation layout only (audio unchanged)');
  }, [appendLog]);

  const handlePresentationStateChange = useCallback(next => {
    setViewState(normalizeTextCardPresentationState(next));
  }, []);

  const handleFocusConsumed = useCallback(nonce => {
    setFocusTarget(prev => (prev && prev.nonce === nonce ? null : prev));
  }, []);

  const startSimulatedPlayback = useCallback(({ cardId = null, segmentId = null, channel = null, forceSplit = false }) => {
    const targetEntry = segmentId
      ? orderedEntries.find(item => item.segment.id === segmentId)
      : cardId
        ? orderedEntries.find(item => item.cardId === cardId)
        : orderedEntries[0];
    if (!targetEntry) return;
    const useChannel = channel || audioConfig.speakingChannel || 'text';
    const nextRep = forceSplit ? 'split' : audioConfig.representationMode;
    setAudioSession(prev => ({
      sessionId: prev.sessionId + 1,
      isPlaying: true,
      isPaused: false,
      activeCardId: targetEntry.cardId,
      activeSegmentId: nextRep === 'full' ? null : targetEntry.segment.id,
      speakingChannel: useChannel,
      representationMode: nextRep
    }));
  }, [orderedEntries, audioConfig.speakingChannel, audioConfig.representationMode]);

  const handlePlaySegment = useCallback(segmentId => {
    appendLog(`Manual segment click -> ${segmentId}`);
    startSimulatedPlayback({ segmentId, forceSplit: true });
  }, [appendLog, startSimulatedPlayback]);

  const handlePlayCard = useCallback((cardId, options = null) => {
    const channelOverride = options?.playbackChannelMode === 'meaning-only'
      ? 'meaning'
      : options?.playbackChannelMode === 'text-only'
        ? 'text'
        : null;
    appendLog(channelOverride
      ? `One-shot Card channel play (${channelOverride.toUpperCase()}) -> ${cardId}`
      : `Card play -> ${cardId}`);
    startSimulatedPlayback({ cardId, channel: channelOverride });
  }, [appendLog, startSimulatedPlayback]);

  const handleStepNext = () => {
    if (!orderedEntries.length) return;
    if (audioConfig.representationMode === 'full') {
      const cards = (presentation?.cards || []).filter(c => c.units.some(u => u.segments.length > 0));
      const idx = cards.findIndex(c => c.id === audioSession.activeCardId);
      const nextCard = cards[(idx + 1) % cards.length];
      if (!nextCard) return;
      setAudioSession(prev => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
        sessionId: prev.sessionId || 1,
        activeCardId: nextCard.id,
        activeSegmentId: null
      }));
      return;
    }
    const idx = orderedEntries.findIndex(item => item.segment.id === audioSession.activeSegmentId);
    const next = orderedEntries[(idx + 1) % orderedEntries.length];
    if (!next) return;
    setAudioSession(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      sessionId: prev.sessionId || 1,
      activeCardId: next.cardId,
      activeSegmentId: next.segment.id
    }));
  };

  const handleTriggerSearchReveal = () => {
    const dupTargetId = fixtureData.ids?.duplicateSeg2Id || orderedEntries[orderedEntries.length - 1]?.segment?.id;
    const entry = orderedEntries.find(item => item.segment.id === dupTargetId);
    if (!entry) return;
    setFocusTarget({
      documentId: presentation.workspace.id,
      blockId: entry.cardId,
      segmentId: entry.segment.id,
      nonce: Date.now()
    });
    appendLog(`Search reveal -> ${entry.segment.id} (in ${entry.cardId})`);
  };

  const cursor = useMemo(() => resolveTextCardPresentationCursor({
    presentation,
    playback: {
      workspaceId: presentation.workspace.id,
      workspaceUid: presentation.workspace.uid,
      sessionId: audioSession.sessionId || null,
      playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
      isPlaying: audioSession.isPlaying,
      isPaused: audioSession.isPaused,
      playbackRepresentationMode: audioSession.representationMode || audioConfig.representationMode,
      playingIndex: audioSession.activeSegmentId,
      currentIndex: audioSession.activeSegmentId,
      activeBlockId: audioSession.activeCardId,
      speakingPart: audioSession.speakingChannel,
      playbackSourceStatus: audioSession.isPlaying || audioSession.isPaused
        ? {
            sessionId: audioSession.sessionId,
            documentId: presentation.workspace.id,
            workspaceUid: presentation.workspace.uid,
            blockId: audioSession.activeCardId,
            segmentId: (audioSession.representationMode || audioConfig.representationMode) === 'full'
              ? null
              : audioSession.activeSegmentId,
            channel: audioSession.speakingChannel,
            mode: (audioSession.representationMode || audioConfig.representationMode) === 'full' ? 'full-local' : 'split-local'
          }
        : null
    }
  }), [presentation, audioSession, audioConfig.representationMode]);

  const legacyComparisonCard = useMemo(() => (
    presentation.cards.find(card => (card.units || []).some(unit => unit.segments?.length > 1))
    || presentation.cards.find(card => (card.units || []).some(unit => unit.segments?.length > 0))
    || null
  ), [presentation]);

  const legacyComparisonSegments = useMemo(() => (
    (legacyComparisonCard?.units || []).flatMap(unit => unit.segments || [])
  ), [legacyComparisonCard]);

  const stageWidthClass = viewportMode === 'narrow'
    ? 'max-w-[320px]'
    : viewportMode === 'mobile'
      ? 'max-w-[375px]'
      : 'max-w-5xl';

  return (
    <div
      className={`${theme === 'dark' ? 'dark' : ''} ${reducedMotionPreview ? '[&_*]:!transition-none [&_*]:!animate-none' : ''}`}
      data-shared-card-qa-preview="true"
    >
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-14 transition-colors">
        <div className="md:sticky md:top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <a
                href="?"
                className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Exit QA</span>
              </a>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>A2 Shared Card QA · Canonical DB Untouched</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                {COMPARISON_MODES.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setComparisonMode(mode.id)}
                    data-qa-comparison={mode.id}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                      comparisonMode === mode.id
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-700 dark:text-indigo-200'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {mode.id === 'compare' ? <Columns2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                {VIEWPORT_MODES.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setViewportMode(mode.id)}
                    data-qa-viewport={mode.id}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                      viewportMode === mode.id
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {mode.id === 'desktop' ? <Monitor className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle dark theme"
                data-qa-toggle-theme="true"
                className="min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>

              <button
                type="button"
                onClick={() => setZoom200(prev => !prev)}
                aria-pressed={zoom200}
                data-qa-toggle-zoom="true"
                className={`min-h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                  zoom200
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>200% Text</span>
              </button>

              <button
                type="button"
                onClick={() => setReducedMotionPreview(prev => !prev)}
                aria-pressed={reducedMotionPreview}
                data-qa-toggle-reduced-motion="true"
                className={`min-h-8 px-2.5 rounded-lg border text-[11px] font-semibold ${
                  reducedMotionPreview
                    ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Reduced Motion
              </button>
            </div>
          </div>

          {/* Fixture & Simulated Audio Continuity Strip */}
          <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-2.5 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/90">
            <div className="flex flex-wrap items-center gap-1.5">
              {FIXTURE_MODES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectFixture(item.id)}
                  data-qa-fixture={item.id}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    fixtureMode === item.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleTriggerSearchReveal}
                data-qa-search-reveal="true"
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 inline-flex items-center gap-1"
              >
                <Search className="w-3 h-3" />
                <span>Reveal Search Match</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" data-qa-audio-simulator="true">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <Volume2 className="w-3.5 h-3.5 text-indigo-500" />Audio Host:
              </span>
              <button
                type="button"
                onClick={() => setAudioConfig(prev => ({
                  ...prev,
                  representationMode: prev.representationMode === 'split' ? 'full' : 'split'
                }))}
                data-qa-audio-rep-toggle="true"
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold bg-white dark:bg-slate-800"
              >
                {audioConfig.representationMode === 'full' ? 'Mode: Full Card' : 'Mode: Split Sentence'}
              </button>
              <button
                type="button"
                onClick={() => setAudioConfig(prev => ({
                  ...prev,
                  speakingChannel: prev.speakingChannel === 'text' ? 'meaning' : 'text'
                }))}
                data-qa-audio-channel-toggle="true"
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold bg-white dark:bg-slate-800"
              >
                Voice: {audioConfig.speakingChannel === 'meaning' ? 'ID' : 'EN'}
              </button>
              <button
                type="button"
                onClick={() => startSimulatedPlayback({})}
                data-qa-audio-play="true"
                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Play</span>
              </button>
              {(audioSession.isPlaying || audioSession.isPaused) && (
                <>
                  <button
                    type="button"
                    onClick={() => setAudioSession(prev => ({ ...prev, isPaused: !prev.isPaused, isPlaying: prev.isPaused }))}
                    data-qa-audio-pause="true"
                    className="px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-800 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    {audioSession.isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    <span>{audioSession.isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStepNext}
                    data-qa-audio-next="true"
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <SkipForward className="w-3 h-3" />
                    <span>Next</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioSession(prev => ({ ...prev, isPlaying: false, isPaused: false, activeCardId: null, activeSegmentId: null }))}
                    data-qa-audio-stop="true"
                    className="px-2 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  handleResetViewOnly();
                }}
                data-qa-reset-all-view="true"
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Default View</span>
              </button>
            </div>
          </div>
        </div>

        <main className={`mx-auto px-3 sm:px-6 pt-5 space-y-4 transition-all ${stageWidthClass}`}>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300" data-qa-audio-telemetry="true">
              <span>session={audioSession.sessionId}</span>
              <span>state={cursor.state}</span>
              <span>precision={cursor.precision}</span>
              <span>card={cursor.cardId || 'null'}</span>
              <span>seg={cursor.segmentId || 'null'}</span>
              <span>layout={viewState.bilingualLayout}</span>
            </div>
            {actionLog[0] && (
              <span className="text-indigo-700 dark:text-indigo-300 truncate max-w-md" data-qa-last-action="true">
                {actionLog[0].text}
              </span>
            )}
          </div>

          <div
            className={`${zoom200 ? 'rounded-2xl border border-dashed border-indigo-300 dark:border-indigo-700 p-2' : ''}`}
            data-qa-zoom-stage={zoom200 ? '200' : '100'}
          >
            {comparisonMode === 'legacy' && legacyComparisonCard && (
              <section className="space-y-3" data-qa-legacy-stage="true">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Legacy Paragraph UI ({legacyComparisonCard.title || legacyComparisonCard.id})
                </p>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <TextParagraphUnifiedReading
                    segments={legacyComparisonSegments}
                    splitMode={audioConfig.representationMode === 'split'}
                    displayMode="text-meaning"
                    activeSegmentId={cursor.precision === 'segment' ? cursor.segmentId : null}
                    isPlaybackActive={cursor.state === 'playing' || cursor.state === 'paused'}
                    fullCardActive={cursor.precision === 'card' && cursor.cardId === legacyComparisonCard.id}
                    speakingPart={cursor.channel}
                    focusSegmentId={focusTarget?.blockId === legacyComparisonCard.id ? focusTarget.segmentId : null}
                    audioCoverageMap={fixtureData.audioCoverageMap || {}}
                    onPlaySegment={handlePlaySegment}
                    onPlayChannel={channel => handlePlayCard(legacyComparisonCard.id, {
                      playbackChannelMode: channel === 'meaning' ? 'meaning-only' : 'text-only'
                    })}
                  />
                </div>
              </section>
            )}

            {comparisonMode === 'compare' && (
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <section className="space-y-2.5" data-qa-compare-before="true">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Before · Existing Paragraph UI ({legacyComparisonCard?.title || 'Card'})
                  </p>
                  {legacyComparisonCard && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                      <TextParagraphUnifiedReading
                        segments={legacyComparisonSegments}
                        splitMode={audioConfig.representationMode === 'split'}
                        displayMode="text-meaning"
                        activeSegmentId={cursor.precision === 'segment' ? cursor.segmentId : null}
                        isPlaybackActive={cursor.state === 'playing' || cursor.state === 'paused'}
                        fullCardActive={cursor.precision === 'card' && cursor.cardId === legacyComparisonCard.id}
                        speakingPart={cursor.channel}
                        focusSegmentId={focusTarget?.blockId === legacyComparisonCard.id ? focusTarget.segmentId : null}
                        audioCoverageMap={fixtureData.audioCoverageMap || {}}
                        onPlaySegment={handlePlaySegment}
                        onPlayChannel={channel => handlePlayCard(legacyComparisonCard.id, {
                          playbackChannelMode: channel === 'meaning' ? 'meaning-only' : 'text-only'
                        })}
                      />
                    </div>
                  )}
                </section>
                <section className="space-y-2.5" data-qa-compare-after="true">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    After · Shared Full Card Reader ({viewState.bilingualLayout})
                  </p>
                  <SharedParagraphWorkspaceReader
                    presentation={presentation}
                    presentationState={viewState}
                    onPresentationStateChange={handlePresentationStateChange}
                    playbackCursor={cursor}
                    focusTarget={focusTarget}
                    onFocusConsumed={handleFocusConsumed}
                    audioCoverageMap={fixtureData.audioCoverageMap}
                    onPlayCard={handlePlayCard}
                    onPlaySegment={handlePlaySegment}
                  />
                </section>
              </div>
            )}

            {comparisonMode === 'shared' && (
              <SharedParagraphWorkspaceReader
                presentation={presentation}
                presentationState={viewState}
                onPresentationStateChange={handlePresentationStateChange}
                playbackCursor={cursor}
                focusTarget={focusTarget}
                onFocusConsumed={handleFocusConsumed}
                audioCoverageMap={fixtureData.audioCoverageMap}
                onPlayCard={handlePlayCard}
                onPlaySegment={handlePlaySegment}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default TextSharedCardReaderQaPreview;
