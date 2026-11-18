import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createP15ExtendedQaFixtures } from '../../../../scripts/fixtures/p15-data-management/fixture.js';
import { createTextDataManagementSession } from '../../../services/textDataManagementSession.js';
import TextDataManagementPage from './TextDataManagementPage.jsx';
import { DM_INPUT_CLASS, DM_SMALL_BTN } from './dataManagementUiUtils.js';

const MODE_CONFIG = Object.freeze({
  'read-only': { label: 'Read-Only (Default)', boundary: 'read-only', permissions: [] },
  'disposable-full': { label: 'Isolated Disposable (Catalog + Content)', boundary: 'disposable', permissions: ['catalog', 'content'] },
  'disposable-catalog': { label: 'Isolated Disposable (Catalog Only)', boundary: 'disposable', permissions: ['catalog'] },
  'disposable-content': { label: 'Isolated Disposable (Content Only)', boundary: 'disposable', permissions: ['content'] }
});

const createQaSessionBox = () => {
  let active = null;
  let seq = 0;
  let preservedSnapshot = null;
  let preservedSelection = {};
  let snap = Object.freeze({ session: null, seq: 0 });
  const listeners = new Set();
  const emit = () => {
    listeners.forEach(listener => listener());
  };
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snap,
    getActiveSession: () => active,
    rememberContext(snapshotCandidate, selectionCandidate = {}) {
      if (snapshotCandidate && snapshotCandidate.schemaVersion) {
        preservedSnapshot = snapshotCandidate;
        preservedSelection = selectionCandidate || {};
      }
    },
    getPreservedContext: () => ({ snapshot: preservedSnapshot, selection: preservedSelection }),
    setSession(nextSession) {
      active = nextSession || null;
      seq += 1;
      snap = Object.freeze({ session: active, seq });
      emit();
    }
  };
};

/**
 * DEV-only isolated QA harness for P15-H1 Structured Text Data Management.
 * Uses disposable fixture presets only; never touches IndexedDB or canonical v1 storage.
 */
export default function TextDataManagementQaPreview() {
  const [fixtures] = useState(createP15ExtendedQaFixtures);
  const [qaBox] = useState(createQaSessionBox);
  const [presetKey, setPresetKey] = useState('v2-complete');
  const [modeKey, setModeKey] = useState('read-only');
  const [audioMode, setAudioMode] = useState('not-evaluated');
  const [transportMode, setTransportMode] = useState('accept');
  const [hostLoading, setHostLoading] = useState(false);
  const [frameWidth, setFrameWidth] = useState('desktop');
  const [darkMode, setDarkMode] = useState(false);
  const [deferredPending, setDeferredPending] = useState(false);

  const deferredResolverRef = useRef(null);
  const transportModeRef = useRef(transportMode);
  useEffect(() => {
    transportModeRef.current = transportMode;
  }, [transportMode]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const preset = fixtures.presets[presetKey] || fixtures.presets['v2-complete'];

  const audioConfig = useMemo(() => {
    if (audioMode === 'not-evaluated') return null;
    if (audioMode === 'lazy-markers-only') {
      return {
        preferences: preset.preferences,
        runtimeAudioUrls: Object.fromEntries(
          (preset.snapshot?.audioVariants || []).map(v => [v.id, { folderBacked: true }])
        )
      };
    }
    return {
      preferences: preset.preferences,
      runtimeAudioUrls: Object.fromEntries(
        (preset.snapshot?.audioVariants || []).map(v => [
          v.id,
          { url: `blob:qa-verified-${v.id}`, renderFingerprint: v?.metadata?.audioRenderFingerprintV1 || null }
        ])
      )
    };
  }, [audioMode, preset]);

  const modeCfg = MODE_CONFIG[modeKey] || MODE_CONFIG['read-only'];
  const presetRef = useRef(preset);
  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    const activePreset = presetRef.current;
    const preserved = qaBox.getPreservedContext();
    const initialSnapshot = preserved.snapshot || activePreset.snapshot;
    const initialSelection = preserved.selection || {};

    const nextSession = createTextDataManagementSession({
      snapshot: initialSnapshot,
      selection: initialSelection,
      boundary: modeCfg.boundary,
      permissions: modeCfg.permissions,
      sourceAttachments: activePreset.sourceAttachments,
      externalImports: activePreset.externalImports,
      audio: audioConfig,
      execute: (_, { preparedOutcome }) => {
        const mode = transportModeRef.current;
        if (mode === 'reject') {
          return { ok: false, error: { code: 'QA_REJECTED', message: 'Disposable QA transport rejected command; retry draft.' } };
        }
        if (mode === 'malformed') {
          return { ok: true };
        }
        if (mode === 'defer') {
          setDeferredPending(true);
          return new Promise(resolve => {
            deferredResolverRef.current = () => {
              setDeferredPending(false);
              resolve(preparedOutcome);
            };
          });
        }
        return preparedOutcome;
      }
    });
    qaBox.setSession(nextSession);
    return () => {
      const snap = nextSession.getSnapshot();
      const sel = nextSession.getState()?.view?.selection || {};
      if (snap) qaBox.rememberContext(snap, sel);
      if (qaBox.getActiveSession() === nextSession) {
        qaBox.setSession(null);
      }
      nextSession.dispose();
    };
  }, [qaBox, modeCfg.boundary, modeCfg.permissions, audioConfig, presetKey]);

  const { session, seq } = useSyncExternalStore(qaBox.subscribe, qaBox.getSnapshot);

  const handleLoadPreset = useCallback(nextKey => {
    const nextPreset = fixtures.presets[nextKey] || fixtures.presets['v2-complete'];
    qaBox.rememberContext(nextPreset.snapshot, {});
    setPresetKey(nextKey);
    qaBox.getActiveSession()?.replaceSource(nextPreset.snapshot, {
      selection: {},
      sourceAttachments: nextPreset.sourceAttachments,
      externalImports: nextPreset.externalImports
    });
  }, [fixtures.presets, qaBox]);

  const handleInjectInvalid = useCallback(() => {
    qaBox.getActiveSession()?.replaceSource({ schemaVersion: 99 });
  }, [qaBox]);

  const handleReloadValidSource = useCallback(() => {
    qaBox.getActiveSession()?.replaceSource(preset.snapshot, {
      selection: {},
      sourceAttachments: preset.sourceAttachments,
      externalImports: preset.externalImports
    });
  }, [preset, qaBox]);

  const handleReleaseDeferred = useCallback(() => {
    const release = deferredResolverRef.current;
    deferredResolverRef.current = null;
    release?.();
  }, []);

  const frameClass = frameWidth === '320'
    ? 'max-w-[320px] mx-auto border-x border-slate-300 dark:border-slate-700'
    : frameWidth === '375'
      ? 'max-w-[375px] mx-auto border-x border-slate-300 dark:border-slate-700'
      : 'w-full';

  const qaHeaderControls = (
    <section
      aria-label="DEV QA Harness Controls"
      data-dm-qa-controls="true"
      className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/25 p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-black text-indigo-900 dark:text-indigo-200">
            DEV QA Route — Isolated Disposable Fixture Harness (No Canonical Persistence)
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Session rev key #{seq} · Canonical DB/Schema v1 untouched
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-dm-qa-toggle-loading="true"
            onClick={() => setHostLoading(v => !v)}
            className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
          >
            {hostLoading ? 'Exit Loading' : 'Simulate Loading'}
          </button>
          <button
            type="button"
            data-dm-qa-inject-invalid="true"
            onClick={handleInjectInvalid}
            className={`${DM_SMALL_BTN} border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300`}
          >
            Inject Schema 99 Error
          </button>
          <button
            type="button"
            data-dm-qa-reset-preset="true"
            onClick={() => handleLoadPreset(presetKey)}
            className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300`}
          >
            Reset Preset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Session Boundary Mode</span>
          <select
            aria-label="QA Session Mode"
            data-dm-qa-mode-select="true"
            value={modeKey}
            onChange={e => setModeKey(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Fixture Preset</span>
          <select
            aria-label="QA Fixture Preset"
            data-dm-qa-preset-select="true"
            value={presetKey}
            onChange={e => handleLoadPreset(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            {Object.entries(fixtures.presets).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Audio Coverage Bindings</span>
          <select
            aria-label="QA Audio Evaluation"
            data-dm-qa-audio-select="true"
            value={audioMode}
            onChange={e => setAudioMode(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            <option value="not-evaluated">Not Evaluated (Default)</option>
            <option value="lazy-markers-only">Folder Markers Only (Never Ready)</option>
            <option value="verified-url-bindings">Verified Concrete URLs (Ready)</option>
          </select>
        </label>

        <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span>Async Command Transport</span>
          <select
            aria-label="QA Async Transport"
            data-dm-qa-transport-select="true"
            value={transportMode}
            onChange={e => setTransportMode(e.target.value)}
            className={DM_INPUT_CLASS}
          >
            <option value="accept">Accept Synchronously</option>
            <option value="defer">Defer (Manual Release)</option>
            <option value="reject">Reject (QA_REJECTED)</option>
            <option value="malformed">Malformed Ack (INVALID_RESPONSE)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {deferredPending && (
          <button
            type="button"
            data-dm-qa-release-deferred="true"
            onClick={handleReleaseDeferred}
            className={`${DM_SMALL_BTN} border-amber-500 bg-amber-500 text-white`}
          >
            Release Deferred Command
          </button>
        )}
        <button
          type="button"
          data-dm-qa-frame="desktop"
          onClick={() => setFrameWidth('desktop')}
          className={`${DM_SMALL_BTN} ${frameWidth === 'desktop' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Desktop Full
        </button>
        <button
          type="button"
          data-dm-qa-frame="375"
          onClick={() => setFrameWidth('375')}
          className={`${DM_SMALL_BTN} ${frameWidth === '375' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Mobile 375px
        </button>
        <button
          type="button"
          data-dm-qa-frame="320"
          onClick={() => setFrameWidth('320')}
          className={`${DM_SMALL_BTN} ${frameWidth === '320' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
        >
          Narrow 320px
        </button>
        <button
          type="button"
          data-dm-qa-dark-toggle="true"
          onClick={() => setDarkMode(v => !v)}
          className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`}
        >
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </section>
  );

  return (
    <div data-dm-qa-preview="true" className={frameClass}>
      <TextDataManagementPage
        session={session}
        loading={hostLoading || !session}
        boundary={modeCfg.boundary}
        permissions={modeCfg.permissions}
        sourceAttachments={preset.sourceAttachments}
        externalImports={preset.externalImports}
        extraMetaRecords={preset.extraMetaRecords}
        samplePack={preset.samplePack}
        sampleExternalPackage={preset.sampleExternalPackage}
        onReloadValidSource={handleReloadValidSource}
        compact={frameWidth !== 'desktop'}
        headerActions={qaHeaderControls}
      />
    </div>
  );
}
