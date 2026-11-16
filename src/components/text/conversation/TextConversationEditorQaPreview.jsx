import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bug,
  Database,
  Monitor,
  Moon,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sun,
  Volume2
} from 'lucide-react';
import { createD4aConversationFixture } from '../../../../scripts/fixtures/d4a/conversation-editor-fixture.js';
import { createD5AudioFixture } from '../../../../scripts/fixtures/d5/conversation-audio-fixture.js';
import { applyTextConversationEditorCommand } from '../../../domain/text/textConversationEditorDomain.js';
import { applyTextLibraryCommand } from '../../../domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../domain/text/textLibraryDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../domain/text/textStructuredSplitFullDomain.js';
import { normalizeConversationEditorError } from './conversationEditorErrorUtils.js';
import { assembleConversationSceneFullWavPreview } from './conversationAudioUiUtils.js';
import TextConversationEditor from './TextConversationEditor.jsx';

const QA_MODES = Object.freeze([
  { id: 'live', label: 'Live Fixture (v2)' },
  { id: 'mixed', label: 'Mixed Workspace' },
  { id: 'unsupported', label: 'Test: Unsupported Workspace' },
  { id: 'missing-workspace', label: 'Test: Missing Workspace' },
  { id: 'v1-blocked', label: 'Test: v1 Migration Guard' },
  { id: 'corrupt', label: 'Test: Corrupt Integrity Guard' }
]);

const QA_AUDIO_PRESETS = Object.freeze([
  { id: 'd4a-default', label: 'D4-A Baseline' },
  { id: 'd5-ready', label: 'D5 Audio: Ready WAVs' },
  { id: 'd5-mixed-states', label: 'D5 Audio: Mixed Readiness' },
  { id: 'd5-cached-full', label: 'D5 Audio: Cached Full (1.0x)' },
  { id: 'd5-non-unit-rate', label: 'D5 Audio: Non-Unit Rate (1.2x)' },
  { id: 'd5-unavailable-binary', label: 'D5 Audio: Unavailable Binary' }
]);

const buildSyntheticQaWavBlob = (amplitude = 6000, frames = 240) => {
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  for (const [offset, label] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    for (let i = 0; i < label.length; i += 1) view.setUint8(offset + i, label.charCodeAt(i));
  }
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i += 1) {
    const wave = Math.round(amplitude * Math.sin((i / frames) * Math.PI * 8));
    view.setInt16(44 + i * 2, wave, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const revokeObjectUrls = urls => {
  (urls || []).forEach(url => {
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    } catch { /* noop */ }
  });
};

const createD5PresetState = presetId => {
  const createdObjectUrls = [];
  const trackUrl = blob => {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && blob instanceof Blob) {
      const url = URL.createObjectURL(blob);
      createdObjectUrls.push(url);
      return url;
    }
    return null;
  };
  if (presetId === 'd4a-default') {
    const initial = createD4aConversationFixture();
    return {
      fixture: initial,
      snapshot: initial.snapshot,
      selectedDocumentId: initial.ids.documentId,
      runtimeAudioUrls: {},
      runtimeFullAudio: {},
      createdObjectUrls,
      audioConfig: {
        playbackChannelMode: 'text-only',
        playbackRepresentationMode: 'split',
        audioSourceMode: 'local-first',
        globalPlaybackRate: 1,
        preferences: null
      }
    };
  }

  const d5 = createD5AudioFixture();
  let snapshot = d5.snapshot;
  const runtimeAudioUrls = {};
  const entries = Object.entries(d5.runtimeAudioUrls);
  entries.forEach(([variantId, binding], index) => {
    const variant = snapshot.audioVariants.find(item => item.id === variantId);
    const amplitude = variant?.voiceId === 'en-GB-SoniaNeural' ? -6000 : 4500 + index * 400;
    const blob = buildSyntheticQaWavBlob(amplitude);
    const url = trackUrl(blob) || binding.url;
    runtimeAudioUrls[variantId] = { blob, url, renderFingerprint: binding.renderFingerprint };
  });

  let runtimeFullAudio = {};
  let playbackRepresentationMode = 'split';
  let globalPlaybackRate = 1;

  if (presetId === 'd5-mixed-states') {
    snapshot.audioVariants
      .filter(v => v.segmentId === d5.ids.secondSentenceId && v.channel === 'text')
      .forEach(v => { delete runtimeAudioUrls[v.id]; });
    const thirdSeg = snapshot.segments.find(s => s.unitId === d5.ids.nextAliceTurnId);
    if (thirdSeg) {
      snapshot = applyTextLibraryCommand(snapshot, {
        type: 'segment.update',
        payload: { id: thirdSeg.id, text: 'Stale edited Sentence text.' }
      }, 450).snapshot;
    }
    snapshot = {
      ...snapshot,
      audioVariants: snapshot.audioVariants.filter(
        v => !(v.segmentId === d5.ids.bobSentenceId && v.channel === 'text')
      )
    };
    Object.keys(runtimeAudioUrls).forEach(variantId => {
      if (!snapshot.audioVariants.some(v => v.id === variantId)) delete runtimeAudioUrls[variantId];
    });
  } else if (presetId === 'd5-cached-full') {
    playbackRepresentationMode = 'full';
    const tree = resolveTextLibraryDocumentTree(snapshot, d5.ids.documentId);
    const block = tree.blocks.find(b => b.id === d5.ids.sceneId);
    const plan = buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: tree,
      block,
      channel: 'text',
      representationMode: 'full',
      audioVariants: snapshot.audioVariants,
      runtimeAudioUrls,
      preferences: d5.preferences
    });
    const artifact = buildTextStructuredFullArtifactRecord({
      block,
      channel: 'text',
      composition: plan.composition,
      source: 'derived',
      mimeType: 'audio/wav',
      filename: 'qa-cached-full.wav'
    });
    snapshot = applyTextLibraryCommand(snapshot, {
      type: 'fullAudioArtifact.upsert',
      payload: { blockId: d5.ids.sceneId, artifact }
    }, 450).snapshot;
    const fullBlob = buildSyntheticQaWavBlob(5500, 720);
    runtimeFullAudio = {
      [artifact.fullArtifactFingerprint]: {
        blob: fullBlob,
        url: trackUrl(fullBlob),
        fullArtifactFingerprint: artifact.fullArtifactFingerprint
      }
    };
  } else if (presetId === 'd5-non-unit-rate') {
    playbackRepresentationMode = 'full';
    globalPlaybackRate = 1.2;
  } else if (presetId === 'd5-unavailable-binary') {
    snapshot.audioVariants
      .filter(v => v.segmentId === d5.ids.firstSentenceId && v.channel === 'text')
      .forEach(v => {
        if (runtimeAudioUrls[v.id]) {
          runtimeAudioUrls[v.id] = {
            url: 'blob:qa-unavailable-binary-invalid',
            renderFingerprint: runtimeAudioUrls[v.id].renderFingerprint
          };
        }
      });
  }

  return {
    fixture: d5,
    snapshot,
    selectedDocumentId: d5.ids.documentId,
    runtimeAudioUrls,
    runtimeFullAudio,
    createdObjectUrls,
    audioConfig: {
      playbackChannelMode: 'text-only',
      playbackRepresentationMode,
      audioSourceMode: 'local-first',
      globalPlaybackRate,
      preferences: d5.preferences
    }
  };
};

const toList = value => (Array.isArray(value) ? value : Object.values(value || {}));

const buildScenarioView = ({ fixture, baseSnapshot, selectedDocumentId, qaMode }) => {
  if (qaMode === 'v1-blocked') {
    return {
      snapshot: { ...baseSnapshot, schemaVersion: 1 },
      documentId: selectedDocumentId
    };
  }
  if (qaMode === 'corrupt') {
    const firstSegId = fixture.ids.firstSentenceId;
    const nextSegments = Array.isArray(baseSnapshot.segments)
      ? baseSnapshot.segments.map(seg => (seg?.id === firstSegId ? { ...seg, unitId: null } : seg))
      : {
          ...baseSnapshot.segments,
          ...(baseSnapshot.segments?.[firstSegId]
            ? { [firstSegId]: { ...baseSnapshot.segments[firstSegId], unitId: null } }
            : {})
        };
    return {
      snapshot: {
        ...baseSnapshot,
        segments: nextSegments
      },
      documentId: selectedDocumentId
    };
  }
  if (qaMode === 'missing-workspace') {
    return {
      snapshot: baseSnapshot,
      documentId: 'DOC_999999'
    };
  }
  if (qaMode === 'unsupported') {
    const created = applyTextLibraryCommand(baseSnapshot, {
      type: 'document.create',
      payload: {
        title: 'QA Synthetic Paragraph Doc',
        documentType: 'paragraph',
        textLanguage: 'en',
        meaningLanguage: 'id'
      }
    });
    return {
      snapshot: created.snapshot,
      documentId: created.result.id
    };
  }
  if (qaMode === 'mixed') {
    return {
      snapshot: baseSnapshot,
      documentId: fixture.ids.mixedDocumentId
    };
  }
  return {
    snapshot: baseSnapshot,
    documentId: selectedDocumentId
  };
};

const useAutoCompactBreakpoint = () => {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = event => setIsNarrow(Boolean(event.matches));
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  return isNarrow;
};

/**
 * Developer-only isolated QA sandbox rendering TextConversationEditor purely from an in-memory D4-A v2 fixture.
 */
export const TextConversationEditorQaPreview = () => {
  const [audioPreset, setAudioPreset] = useState('d4a-default');
  const [fixtureState, setFixtureState] = useState(() => createD5PresetState('d4a-default'));
  const [qaMode, setQaMode] = useState('live');
  const [viewportMode, setViewportMode] = useState('auto');
  const [theme, setTheme] = useState('light');
  const [commandError, setCommandError] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [showInspector, setShowInspector] = useState(true);
  const [audioReport, setAudioReport] = useState(null);

  useEffect(() => {
    const urls = fixtureState.createdObjectUrls || [];
    return () => revokeObjectUrls(urls);
  }, [fixtureState.createdObjectUrls]);

  const isAutoCompact = useAutoCompactBreakpoint();
  const compact = viewportMode === 'mobile' || (viewportMode === 'auto' && isAutoCompact);

  const scenario = useMemo(() => buildScenarioView({
    fixture: fixtureState.fixture,
    baseSnapshot: fixtureState.snapshot,
    selectedDocumentId: fixtureState.selectedDocumentId,
    qaMode
  }), [fixtureState, qaMode]);

  const applyAudioPreset = presetId => {
    const nextState = createD5PresetState(presetId);
    setAudioPreset(presetId);
    setFixtureState(nextState);
    setQaMode('live');
    setCommandError(null);
    setLastReceipt(null);
  };

  const handleResetFixture = () => {
    applyAudioPreset(audioPreset);
  };

  const handleAudioConfigChange = patch => {
    setFixtureState(prev => ({
      ...prev,
      audioConfig: { ...(prev.audioConfig || {}), ...patch }
    }));
  };

  const handleQaAssembleFullWav = async ({ block, plan }) => {
    const res = await assembleConversationSceneFullWavPreview({
      documentTitle: fixtureState.snapshot.documents?.find(d => d.id === scenario.documentId)?.title || 'Conversation',
      block,
      plan,
      runtimeAudioUrls: fixtureState.runtimeAudioUrls
    });
    const fullUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(res.composed.blob)
      : null;
    const updated = applyTextLibraryCommand(scenario.snapshot, {
      type: 'fullAudioArtifact.upsert',
      payload: { blockId: block.id, artifact: res.artifact }
    });
    setFixtureState(prev => ({
      ...prev,
      snapshot: updated.snapshot,
      createdObjectUrls: fullUrl ? [...(prev.createdObjectUrls || []), fullUrl] : (prev.createdObjectUrls || []),
      runtimeFullAudio: {
        ...prev.runtimeFullAudio,
        [res.artifact.fullArtifactFingerprint]: {
          blob: res.composed.blob,
          url: fullUrl,
          fullArtifactFingerprint: res.artifact.fullArtifactFingerprint
        }
      }
    }));
    return res;
  };

  const handleSelectWorkspace = nextDocId => {
    setCommandError(null);
    if (nextDocId === fixtureState.fixture.ids.mixedDocumentId) {
      setQaMode('mixed');
    } else {
      setQaMode('live');
    }
    setFixtureState(prev => ({
      ...prev,
      selectedDocumentId: nextDocId
    }));
  };

  const handleQaCommand = command => {
    setCommandError(null);
    try {
      const targetDocId = command.documentId || scenario.documentId;
      const outcome = applyTextConversationEditorCommand(
        scenario.snapshot,
        { type: command.type, payload: command.payload },
        targetDocId ? { documentId: targetDocId } : undefined
      );
      setFixtureState(prev => ({
        ...prev,
        snapshot: outcome.snapshot,
        selectedDocumentId: targetDocId || prev.selectedDocumentId
      }));
      const receipt = {
        commandType: command.type,
        documentId: targetDocId,
        at: new Date().toISOString(),
        counts: outcome.state?.counts || null,
        resultKeys: Object.keys(outcome.result || {})
      };
      setLastReceipt(receipt);
      return { ok: true, ...outcome };
    } catch (caught) {
      const normalized = normalizeConversationEditorError(caught);
      setCommandError(normalized);
      return { ok: false, error: normalized };
    }
  };

  const snapshot = scenario.snapshot;
  const counts = {
    documents: toList(snapshot?.documents).length,
    blocks: toList(snapshot?.blocks).length,
    contentUnits: toList(snapshot?.contentUnits).length,
    segments: toList(snapshot?.segments).length,
    speakers: toList(snapshot?.speakers).length
  };

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-conversation-qa-preview="true">
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-12 transition-colors">
        <div className="border-b border-indigo-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 sticky top-0 z-20 backdrop-blur">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <a
                href="?"
                className="min-h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Exit QA
              </a>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase">
                <ShieldCheck className="w-3 h-3" />In-Memory QA Only • Canonical DB Untouched
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setViewportMode('auto')}
                  className={`px-2 py-1 rounded-md text-[9px] font-bold ${viewportMode === 'auto' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('desktop')}
                  aria-label="Desktop layout preview"
                  className={`px-2 py-1 rounded-md text-[9px] font-bold inline-flex items-center gap-1 ${viewportMode === 'desktop' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <Monitor className="w-3 h-3" />Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('mobile')}
                  aria-label="Mobile layout preview"
                  className={`px-2 py-1 rounded-md text-[9px] font-bold inline-flex items-center gap-1 ${viewportMode === 'mobile' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <Smartphone className="w-3 h-3" />Mobile
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle QA dark theme"
                className="min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold inline-flex items-center gap-1"
              >
                {theme === 'dark' ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3 text-slate-500" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>

              <button
                type="button"
                onClick={() => setShowInspector(prev => !prev)}
                className="min-h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-bold inline-flex items-center gap-1"
              >
                <Bug className="w-3 h-3 text-indigo-500" />Inspector
              </button>

              <button
                type="button"
                onClick={handleResetFixture}
                className="min-h-8 px-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-[9px] font-black inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />Reset Fixture
              </button>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-3 sm:px-6 pb-2 flex items-center gap-1.5 overflow-x-auto">
            {QA_MODES.map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setCommandError(null);
                  setQaMode(mode.id);
                  if (mode.id === 'live') {
                    setFixtureState(prev => ({ ...prev, selectedDocumentId: prev.fixture.ids.documentId }));
                  }
                }}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black border transition ${
                  qaMode === mode.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="max-w-5xl mx-auto px-3 sm:px-6 pb-2 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-black text-violet-700 dark:text-violet-300">
              <Volume2 className="w-3 h-3" />Audio Fixtures:
            </span>
            {QA_AUDIO_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyAudioPreset(preset.id)}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-[9px] font-bold border transition ${
                  audioPreset === preset.id
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <main className={`mx-auto px-3 sm:px-6 pt-4 space-y-4 ${viewportMode === 'mobile' ? 'max-w-md' : 'max-w-5xl'}`}>
          {showInspector && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-[10px] space-y-1.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200">
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  <span>D4-B / D5 Authoritative In-Memory Snapshot State</span>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[9px]">
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">schemaVersion={snapshot?.schemaVersion}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">phase={snapshot?.contentUnitMigration?.phase || 'none'}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">targetDoc={scenario.documentId}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">activeDocumentId={snapshot?.activeDocumentId || 'null'}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                <span>
                  docs={counts.documents} • blocks={counts.blocks} • contentUnits={counts.contentUnits} • segments={counts.segments} • speakers={counts.speakers}
                </span>
                {lastReceipt && (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    receipt: {lastReceipt.commandType} ({lastReceipt.documentId}) [{lastReceipt.resultKeys.join(', ')}]
                  </span>
                )}
              </div>
              {audioReport && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[9px] font-mono text-violet-700 dark:text-violet-300">
                  <span>audioReady={audioReport.audioPlans?.workspaceTotals?.ready || 0}/{audioReport.audioPlans?.workspaceTotals?.entries || 0}</span>
                  <span>resumeCursor={audioReport.resumeCursorSegmentId || 'null'}</span>
                  <span>active={audioReport.isPlaying ? (audioReport.isPaused ? 'paused' : 'playing') : 'idle'}</span>
                  {audioReport.playbackLogs?.[0] && (
                    <span className="truncate max-w-md text-slate-500 dark:text-slate-400">
                      log: [{audioReport.playbackLogs[0].tag}] {audioReport.playbackLogs[0].message}
                    </span>
                  )}
                </div>
              )}
            </section>
          )}

          <TextConversationEditor
            snapshot={scenario.snapshot}
            documentId={scenario.documentId}
            onCommand={handleQaCommand}
            onSelectWorkspace={handleSelectWorkspace}
            compact={compact}
            error={commandError}
            onClearError={() => setCommandError(null)}
            lastReceipt={lastReceipt}
            runtimeAudioUrls={fixtureState.runtimeAudioUrls}
            runtimeFullAudio={fixtureState.runtimeFullAudio}
            audioConfig={fixtureState.audioConfig}
            onAudioConfigChange={handleAudioConfigChange}
            onAssembleFullWav={handleQaAssembleFullWav}
            onAudioStateReport={setAudioReport}
          />
        </main>
      </div>
    </div>
  );
};

export default TextConversationEditorQaPreview;
