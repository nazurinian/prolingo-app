import React, { useCallback, useEffect, useState } from 'react';
import { createD4aConversationFixture } from '../../../../scripts/fixtures/d4a/conversation-editor-fixture.js';
import { createA4hShowcaseConversationFixture } from '../../../../scripts/fixtures/shared-card-a4h/conversation-ux-fixture.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState
} from '../../../domain/text/textCardPresentationStateDomain.js';
import TextConversationEditor from '../conversation/TextConversationEditor.jsx';
import SharedConversationReader from './SharedConversationReader.jsx';

const QA_PRESETS = Object.freeze({
  showcase: {
    id: 'showcase',
    label: 'Showcase Dialogue',
    create: () => createA4hShowcaseConversationFixture({ includeAudioVariants: true, includeFullArtifact: false })
  },
  baseline: {
    id: 'baseline',
    label: 'D4-A Baseline',
    create: () => createD4aConversationFixture()
  }
});

const VIEWPORT_MODES = Object.freeze([
  { id: 'full', label: 'Desktop Full', className: 'w-full' },
  { id: 'mobile-375', label: 'Mobile 375px', className: 'w-[375px] max-w-full mx-auto' },
  { id: 'mobile-320', label: 'Narrow 320px', className: 'w-[320px] max-w-full mx-auto' }
]);

/** DEV-only in-memory preview for A4-H2 Shared Conversation Reader UX. The original authoring QA route is untouched. */
export default function TextSharedConversationReaderQaPreview() {
  const [presetId, setPresetId] = useState('showcase');
  const [fixture, setFixture] = useState(() => QA_PRESETS.showcase.create());
  const [generation, setGeneration] = useState(0);
  const [viewState, setViewState] = useState(() => normalizeTextCardPresentationState());
  const [viewportMode, setViewportMode] = useState('full');
  const [darkTheme, setDarkTheme] = useState(false);
  const [largeScale, setLargeScale] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);

  useEffect(() => {
    document.documentElement.style.fontSize = largeScale ? '32px' : '';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [largeScale]);

  const handleSelectPreset = nextPresetId => {
    const preset = QA_PRESETS[nextPresetId] || QA_PRESETS.showcase;
    setPresetId(preset.id);
    setFixture(preset.create());
    setFocusTarget(null);
    setGeneration(value => value + 1);
  };

  const handleResetFixture = () => {
    const preset = QA_PRESETS[presetId] || QA_PRESETS.showcase;
    setFixture(preset.create());
    setFocusTarget(null);
    setGeneration(value => value + 1);
  };

  const handleResetView = () => {
    setViewState(normalizeTextCardPresentationState(DEFAULT_TEXT_CARD_PRESENTATION_STATE));
    setFocusTarget(null);
  };

  const handleTriggerSearchReveal = () => {
    const targetCardId = fixture.ids.scene1Id || fixture.ids.sceneId;
    const targetSegId = fixture.ids.mayaS5UrlId || fixture.ids.bobSentenceId;
    if (!targetCardId || !targetSegId) return;
    setFocusTarget(prev => ({
      documentId: fixture.ids.documentId,
      blockId: targetCardId,
      segmentId: targetSegId,
      nonce: (prev?.nonce || 0) + 1
    }));
  };

  const handleFocusConsumed = useCallback(nonce => {
    setFocusTarget(prev => (prev && prev.nonce === nonce ? null : prev));
  }, []);

  const renderReader = useCallback(({ snapshot, editorState, audioPlayback, isBusy }) => (
    <SharedConversationReader
      snapshot={snapshot}
      documentId={editorState.workspace.id}
      audioPlayback={audioPlayback}
      isBusy={isBusy}
      presentationState={viewState}
      onPresentationStateChange={setViewState}
      focusTarget={focusTarget}
      onFocusConsumed={handleFocusConsumed}
    />
  ), [viewState, focusTarget, handleFocusConsumed]);

  const frameClass = VIEWPORT_MODES.find(item => item.id === viewportMode)?.className || 'w-full';

  return (
    <div className={darkTheme ? 'dark' : ''}>
      <main
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6 transition-colors"
        data-shared-conversation-qa-preview="true"
      >
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white dark:bg-slate-900 px-4 py-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                <span>A4-H2 Shared Conversation QA · Canonical DB Untouched</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Conversation Reader UX Preview (Full, Part Turns, Segment Spotlight & Live D4/D5)
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {Object.values(QA_PRESETS).map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  data-qa-conv-preset={preset.id}
                  className={`min-h-9 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    presetId === preset.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {VIEWPORT_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setViewportMode(mode.id)}
                  data-qa-conv-viewport={mode.id}
                  className={`min-h-9 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                    viewportMode === mode.id
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDarkTheme(v => !v)}
                data-qa-conv-dark="true"
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {darkTheme ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button
                type="button"
                onClick={() => setLargeScale(v => !v)}
                data-qa-conv-scale="true"
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {largeScale ? '100% Scale' : '200% Text'}
              </button>
              <button
                type="button"
                onClick={handleTriggerSearchReveal}
                data-qa-conv-search-reveal="true"
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
              >
                Reveal Search Target
              </button>
              <button
                type="button"
                onClick={handleResetView}
                data-qa-conv-reset-view="true"
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                Reset View
              </button>
              <button
                type="button"
                onClick={handleResetFixture}
                data-qa-conv-reset-fixture="true"
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                Reset fixture
              </button>
            </div>
          </div>

          <div className={`${frameClass} transition-all`}>
            <TextConversationEditor
              key={`${presetId}-${generation}`}
              snapshot={fixture.snapshot}
              documentId={fixture.ids.documentId}
              compact={viewportMode !== 'full'}
              onStateChange={outcome => setFixture(current => ({ ...current, snapshot: outcome.snapshot }))}
              renderReader={renderReader}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
