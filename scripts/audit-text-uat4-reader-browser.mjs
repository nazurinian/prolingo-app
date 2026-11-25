import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

import {
  JOURNEY_TO_LONDON_CARDS_SPEC,
  createJourneyToLondonFixture,
  createJourneyToLondonStressFixtures
} from './fixtures/uat4/journey-to-london.js';
import { selectTextMixedReaderState } from '../src/domain/text/textMixedReaderDomain.js';
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';
import { buildCardSpeakerAppearanceMap } from '../src/components/text/presentation/sharedCardPresentationUtils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = process.env.UAT4_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4b1-evidence-'));
await fs.mkdir(evidenceDir, { recursive: true });

// -----------------------------------------------------------------------------
// 1. Node fixture & frozen projection verification (4 Cards, 11 Units, 37 Segments)
// -----------------------------------------------------------------------------
const verifyBaseFixtureInNode = () => {
  const fixtureA = createJourneyToLondonFixture();
  const fixtureB = createJourneyToLondonFixture();
  const rawBefore = JSON.stringify(fixtureA.snapshot);

  assert.equal(TEXT_LIBRARY_DB_VERSION, 1, 'Canonical DB version must remain 1');
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1, 'Canonical schema version must remain 1');

  assert.deepEqual(fixtureA.counts, { cards: 4, units: 11, segments: 37 });
  assert.deepEqual(fixtureA.ids.cards, fixtureB.ids.cards, 'Card IDs must be deterministic');
  assert.deepEqual(fixtureA.ids.units, fixtureB.ids.units, 'Unit IDs must be deterministic');
  assert.deepEqual(fixtureA.ids.segmentIds, fixtureB.ids.segmentIds, 'Segment IDs must be deterministic');
  assert.deepEqual(fixtureA.ids.speakers, fixtureB.ids.speakers, 'Speaker IDs must be deterministic');

  const { presentation } = selectTextMixedReaderState(fixtureA.snapshot, {
    documentId: fixtureA.ids.documentId
  });
  assert.ok(Object.isFrozen(presentation), 'Presentation projection must be frozen');
  assert.equal(presentation.workspace.title, 'A Journey to London');
  assert.equal(presentation.workspace.documentType, 'mixed');
  assert.equal(presentation.cards.length, 4);

  const expectedUnitsPerCard = [2, 4, 1, 4];
  const expectedSegmentsPerUnit = [4, 4, 3, 3, 3, 3, 5, 3, 3, 3, 3];
  assert.deepEqual(presentation.cards.map(c => c.units.length), expectedUnitsPerCard);
  assert.deepEqual(
    presentation.cards.flatMap(c => c.units.map(u => u.segments.length)),
    expectedSegmentsPerUnit
  );

  const expectedPairs = JOURNEY_TO_LONDON_CARDS_SPEC.flatMap(card => (
    card.units.flatMap(unit => unit.segments.map(seg => [seg.text, seg.meaning]))
  ));
  const actualPairs = presentation.cards.flatMap(card => (
    card.units.flatMap(unit => unit.segments.map(seg => [seg.text, seg.meaning]))
  ));
  assert.equal(expectedPairs.length, 37);
  assert.deepEqual(actualPairs, expectedPairs, 'All 37 bilingual Segment pairs must match exact fixture text');

  const c1 = presentation.cardById[fixtureA.ids.cards.C1];
  const c2 = presentation.cardById[fixtureA.ids.cards.C2];
  const c1Map = buildCardSpeakerAppearanceMap(c1);
  const c2Map = buildCardSpeakerAppearanceMap(c2);
  const jamesKey = `id:${fixtureA.ids.speakers.James}`;
  assert.ok(c1Map.has(jamesKey) && c2Map.has(jamesKey));
  assert.deepEqual(c1Map.get(jamesKey), c2Map.get(jamesKey), 'James must keep stable speaker palette across Scenes');

  const stress = createJourneyToLondonStressFixtures();
  const stressState = selectTextMixedReaderState(stress.snapshot, { documentId: stress.ids.documentId });
  assert.equal(stressState.presentation.cardById[stress.ids.titleCardId].paragraphRole, 'title');
  assert.equal(stressState.presentation.unitById[stress.ids.emptySectionId].segments.length, 0);
  assert.equal(stressState.presentation.unitById[stress.ids.emptyTurnId].segments.length, 0);

  assert.equal(JSON.stringify(fixtureA.snapshot), rawBefore, 'Projection must never mutate source snapshot');
  return {
    baseCounts: fixtureA.counts,
    stressCardCount: stressState.presentation.cards.length
  };
};

const nodeVerification = verifyBaseFixtureInNode();
console.log('PASS Node fixture verification:', JSON.stringify(nodeVerification));

// -----------------------------------------------------------------------------
// 2. Compile Tailwind CSS in memory + Bundle live dual-host harness
//    - Host A: Actual Isolated UAT host (StructuredWorkspacePlayer -> UnifiedStructuredReader)
//    - Host B: Actual Main App host (TextStructuredPlayer + textMainReaderPreferenceService)
// -----------------------------------------------------------------------------
const compileCss = async () => {
  const cssSource = await fs.readFile(path.join(root, 'src/index.css'), 'utf8');
  const tailwindConfigModule = await import(pathToFileURL(path.join(root, 'tailwind.config.js')).href);
  const tailwindConfig = {
    ...tailwindConfigModule.default,
    content: [
      path.join(root, 'src/**/*.{js,jsx}'),
      path.join(root, 'scripts/audit-text-uat4-reader-browser.mjs')
    ]
  };
  const result = await postcss([tailwindcss(tailwindConfig), autoprefixer]).process(cssSource, {
    from: path.join(root, 'src/index.css')
  });
  return result.css;
};

const harnessJsx = `
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { selectTextMixedReaderState } from './src/domain/text/textMixedReaderDomain.js';
import {
  TEXT_MAIN_READER_PREFERENCE_KEY,
  TEXT_WORKSPACE_STYLE_SCOPES,
  loadTextMainReaderPreference,
  normalizeTextWorkspacePreferenceKey,
  resetTextMainReaderWorkspaceStyle,
  resolveTextMainReaderPreferenceStorageKey,
  resolveTextMainReaderWorkspaceStyle,
  saveTextMainReaderPreference,
  updateTextMainReaderWorkspaceStyle
} from './src/services/persistence/textMainReaderPreferenceService.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from './src/domain/text/textStructuredPlaybackDomain.js';
import StructuredWorkspacePlayer, {
  STRUCTURED_UAT_PREFERENCE_HOST_ID
} from './src/components/text/presentation/StructuredWorkspacePlayer.jsx';
import TextStructuredPlayer from './src/components/text/TextStructuredPlayer.jsx';
import {
  createJourneyToLondonFixture,
  createJourneyToLondonStressFixtures
} from './scripts/fixtures/uat4/journey-to-london.js';

// Consume BOTH verbatim authoritative fixtures without shortening or dropping stress sentences:
// 1. Complete 4/11/37 "A Journey to London" Mixed Workspace
// 2. Complete 3/8/9 "UAT-4B0 Stress Cases (Separate)" Mixed Workspace
const buildDualWorkspaceSnapshots = () => {
  const base = createJourneyToLondonFixture();
  const stress = createJourneyToLondonStressFixtures();
  return {
    london: base,
    stress,
    londonIds: base.ids,
    stressIds: stress.ids
  };
};

const loadOrCreateDualSnapshot = () => {
  const CACHE_KEY = '__uat4_4b1_dual_snapshot_cache_v2';
  try {
    const cached = window.sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  const created = buildDualWorkspaceSnapshots();
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(created));
  } catch { /* ignore */ }
  return created;
};

const dual = loadOrCreateDualSnapshot();
const londonBefore = JSON.stringify(dual.london.snapshot);
const stressBefore = JSON.stringify(dual.stress.snapshot);
const UAT_STORAGE_KEY = resolveTextMainReaderPreferenceStorageKey({ hostId: STRUCTURED_UAT_PREFERENCE_HOST_ID });

function LiveMainAppHostHarness({ activeFixture, playbackLogRef }) {
  const [pref, setPref] = useState(() => loadTextMainReaderPreference());
  const [scope, setScope] = useState(TEXT_WORKSPACE_STYLE_SCOPES.SHARED);
  const [cardExpansionMode, setCardExpansionMode] = useState('all');
  const [activePlayback, setActivePlayback] = useState(null);

  const selected = useMemo(
    () => selectTextMixedReaderState(activeFixture.snapshot, { documentId: activeFixture.ids.documentId }),
    [activeFixture]
  );
  const activeWorkspaceKey = useMemo(
    () => normalizeTextWorkspacePreferenceKey(selected.presentation.workspace),
    [selected.presentation.workspace]
  );
  const effectiveScope = scope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE && activeWorkspaceKey
    ? TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
    : TEXT_WORKSPACE_STYLE_SCOPES.SHARED;
  const activeStyleRes = useMemo(
    () => resolveTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }),
    [pref, activeWorkspaceKey]
  );
  const sharedStyleRes = useMemo(
    () => resolveTextMainReaderWorkspaceStyle(pref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED }),
    [pref]
  );

  const updatePref = patch => setPref(previous => saveTextMainReaderPreference({ ...previous, ...patch }));
  const updateStyle = patch => {
    const target = effectiveScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
      ? { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }
      : { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED };
    setPref(previous => saveTextMainReaderPreference(updateTextMainReaderWorkspaceStyle(previous, patch, target)));
  };
  const resetStyle = () => {
    const target = effectiveScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
      ? { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }
      : { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED };
    setPref(previous => saveTextMainReaderPreference(resetTextMainReaderWorkspaceStyle(previous, target)));
  };

  window.__uat4Main = {
    getPreference: () => pref,
    setReader: reader => updatePref({ reader }),
    setActivePlayback: next => setActivePlayback(next)
  };

  const sharedCursor = activePlayback ? {
    workspaceId: selected.presentation.workspace.id,
    workspaceUid: selected.presentation.workspace.uid,
    sessionId: 77,
    state: activePlayback.state || 'playing',
    cardId: activePlayback.cardId,
    unitId: activePlayback.unitId ?? null,
    segmentId: activePlayback.segmentId ?? null,
    channel: activePlayback.channel || 'text',
    precision: activePlayback.precision || 'segment'
  } : null;

  return (
    <div data-main-app-host-harness="true" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-main-host-reader="legacy" onClick={() => updatePref({ reader: 'legacy' })} className="min-h-10 px-3 rounded-lg border text-xs font-semibold">Tampilan Lama</button>
        <button type="button" data-main-host-reader="shared" onClick={() => updatePref({ reader: 'shared' })} className="min-h-10 px-3 rounded-lg border text-xs font-semibold">Shared UI (Beta)</button>
      </div>
      <TextStructuredPlayer
        documentTree={selected.documentTree}
        useSharedCardReader={pref.reader === 'shared'}
        sharedPresentation={selected.presentation}
        sharedPresentationState={pref.view}
        onSharedPresentationStateChange={view => updatePref({ view })}
        sharedReaderMode={pref.readerMode}
        onSharedReaderModeChange={readerMode => updatePref({ readerMode })}
        sharedWorkspaceStyle={activeStyleRes.effectiveStyle}
        sharedWorkspaceStyleControlValue={effectiveScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE ? activeStyleRes.effectiveStyle : sharedStyleRes.sharedStyle}
        sharedWorkspaceStyleDefaults={effectiveScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE ? activeStyleRes.effectiveDefaults : sharedStyleRes.effectiveDefaults}
        sharedWorkspaceStyleScope={effectiveScope}
        onSharedWorkspaceStyleScopeChange={setScope}
        sharedWorkspaceStyleHasOverride={activeStyleRes.hasWorkspaceOverride}
        sharedWorkspaceStyleCanOverride={Boolean(activeWorkspaceKey)}
        onSharedWorkspaceStyleChange={updateStyle}
        onResetSharedWorkspaceStyle={resetStyle}
        sharedPlaybackCursor={sharedCursor}
        isPlaying={Boolean(activePlayback && activePlayback.state === 'playing')}
        isPaused={Boolean(activePlayback && activePlayback.state === 'paused')}
        speakingPart={activePlayback?.channel || null}
        playingContext={activePlayback ? TEXT_STRUCTURED_PLAYBACK_CONTEXT : null}
        playingIndex={activePlayback?.segmentId || null}
        displayMode="text-meaning"
        playbackChannelMode="text-meaning"
        playbackRepresentationMode="split"
        playbackPreferences={{ cardExpansionMode, playbackOrderMode: 'sequential', repeatMode: 'off' }}
        onPlaybackFeelChange={patch => { if (patch.cardExpansionMode) setCardExpansionMode(patch.cardExpansionMode); }}
        onPlayDocument={() => playbackLogRef.current.push(['main:playDocument', activeFixture.ids.documentId])}
        onPlayCard={(cardId, opts) => playbackLogRef.current.push(['main:playCard', cardId, opts || null])}
        onPlaySegment={segId => playbackLogRef.current.push(['main:playSegment', segId])}
      />
    </div>
  );
}

function DualHostApp() {
  const initialParams = new URLSearchParams(window.location.search);
  const [hostTab, setHostTab] = useState(() => initialParams.get('host') || 'uat');
  const [whichDoc, setWhichDoc] = useState(() => initialParams.get('doc') === 'stress' ? 'stress' : 'london');
  const [dark, setDark] = useState(false);
  const playbackLogRef = useRef([]);
  const uatEventsRef = useRef([]);
  const uatCancelsRef = useRef(0);
  const activeFixture = whichDoc === 'stress' ? dual.stress : dual.london;

  const audioRuntimeHooks = useMemo(() => ({
    speechSynth: {
      getVoices: () => [{ name: 'UAT English', lang: 'en-US', voiceURI: 'uat-en', localService: true }],
      speak() {},
      pause() {},
      resume() {},
      cancel() { uatCancelsRef.current += 1; }
    },
    executeBrowserTts: args => new Promise(resolve => {
      uatEventsRef.current.push({ args, finish: outcome => resolve(outcome || { status: 'played' }) });
      playbackLogRef.current.push(['uat:tts', args?.text || null]);
    }),
    executeRuntimeAudio: args => new Promise(resolve => {
      uatEventsRef.current.push({ args, finish: outcome => resolve(outcome || { status: 'played' }) });
      playbackLogRef.current.push(['uat:runtime', args?.url || null]);
    })
  }), []);

  window.__uat4 = {
    MAIN_STORAGE_KEY: TEXT_MAIN_READER_PREFERENCE_KEY,
    UAT_STORAGE_KEY,
    londonIds: dual.londonIds,
    stressIds: dual.stressIds,
    getSnapshotUnchanged: () => (
      JSON.stringify(dual.london.snapshot) === londonBefore
      && JSON.stringify(dual.stress.snapshot) === stressBefore
    ),
    getPlaybackLog: () => [...playbackLogRef.current],
    clearPlaybackLog: () => { playbackLogRef.current = []; },
    getUatEvents: () => uatEventsRef.current,
    getUatCancels: () => uatCancelsRef.current,
    finishLatestUatEvent: status => {
      const ev = uatEventsRef.current[uatEventsRef.current.length - 1];
      if (ev) ev.finish({ status: status || 'played' });
    },
    setHostTab: next => {
      setHostTab(next);
      const url = new URL(window.location.href);
      url.searchParams.set('host', next);
      window.history.replaceState(null, '', url);
    },
    setWorkspace: which => {
      const nextDoc = which === 'stress' ? 'stress' : 'london';
      setWhichDoc(nextDoc);
      const url = new URL(window.location.href);
      url.searchParams.set('doc', nextDoc);
      window.history.replaceState(null, '', url);
    },
    setDark: flag => {
      setDark(Boolean(flag));
      document.documentElement.classList.toggle('dark', Boolean(flag));
    }
  };

  return (
    <div data-uat4-dual-host={hostTab} data-uat4-theme={dark ? 'dark' : 'light'} className="min-h-screen bg-slate-100/90 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              ProLingo UAT-4B1 · Live Host Integration Audit ({hostTab === 'uat' ? 'Isolated UAT Host' : 'Main App Host'})
            </p>
            <h1 className="text-lg font-bold">Full Book Page · Card Mode · Card Visibility · Workspace Style Persistence</h1>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 font-semibold">
              Host: {hostTab === 'uat' ? 'StructuredWorkspacePlayer' : 'TextStructuredPlayer'}
            </span>
          </div>
        </header>

        {hostTab === 'uat' ? (
          <StructuredWorkspacePlayer
            key={whichDoc}
            snapshot={activeFixture.snapshot}
            documentId={activeFixture.ids.documentId}
            audioRuntimeHooks={audioRuntimeHooks}
          />
        ) : (
          <LiveMainAppHostHarness key={whichDoc} activeFixture={activeFixture} playbackLogRef={playbackLogRef} />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<DualHostApp />);
`;

const [compiledCss, compiledJs] = await Promise.all([
  compileCss(),
  build({
    absWorkingDir: root,
    stdin: {
      contents: harnessJsx,
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'uat4-4b1-dual-host-harness.jsx'
    },
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: {
      'import.meta.env.DEV': 'false',
      'process.env.NODE_ENV': '"production"'
    }
  }).then(res => res.outputFiles[0].text)
]);

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(compiledJs); }
  if (pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(compiledCss); }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ProLingo UAT-4B1 Dual-Host Audit</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__uat4DbCalls = 0;
    window.__uat4Errors = [];
    window.addEventListener('error', e => window.__uat4Errors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__uat4Errors.push(String(e.reason)));
    Object.defineProperty(window, 'indexedDB', {
      value: new Proxy({}, { get() { window.__uat4DbCalls += 1; throw new Error('UAT-4B1 browser audit forbids IndexedDB'); } })
    });
  </script>
  <script type="module" src="/app.js"></script>
</body>
</html>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4b1-profile-'));
const browserPath = process.env.UAT4_BROWSER_PATH
  || process.env.P13_BROWSER_PATH
  || process.env.A6_BROWSER_PATH
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = spawn(
  browserPath,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' }
);

let socket;
const results = [];
const screenshots = [];

try {
  let port;
  for (let i = 0; i < 200; i += 1) {
    try {
      port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (!port) throw new Error('Headless browser did not start');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  const pending = new Map();
  let nextId = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  };

  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  const waitFrames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const until = async (expr, label = expr) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expr})`)) return;
      await new Promise(r => setTimeout(r, 40));
    }
    throw new Error(`Timeout waiting for: ${label}`);
  };
  const click = selector => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el || el.disabled) throw new Error('Missing or disabled: ' + ${JSON.stringify(selector)});
    el.click();
  })()`);
  const clickButtonText = text => evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled);
    if (!btn) throw new Error('Missing button: ' + ${JSON.stringify(text)});
    btn.click();
  })()`);
  const setViewport = async ({ width, height, mobile = false }) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await until(`window.innerWidth === ${width}`, `viewport ${width}`);
    await waitFrames();
  };
  const captureFullPage = async filename => {
    await waitFrames();
    const metrics = await call('Page.getLayoutMetrics');
    const contentHeight = Math.ceil(metrics.cssContentSize?.height || metrics.contentSize?.height || 1200);
    const contentWidth = Math.ceil(metrics.cssContentSize?.width || metrics.contentSize?.width || 1280);
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, width: contentWidth, height: contentHeight, scale: 1 }
    });
    const outPath = path.join(evidenceDir, filename);
    await fs.writeFile(outPath, Buffer.from(shot.data, 'base64'));
    screenshots.push({ filename, path: outPath, width: contentWidth, height: contentHeight });
    return outPath;
  };
  const run = async (name, fn) => {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await setViewport({ width: 1280, height: 900, mobile: false });
  await call('Page.navigate', { url: `${origin}/?host=uat&doc=london` });
  await until('window.__uat4 && document.querySelector("[data-structured-workspace-player]")', 'Isolated UAT host mounted');

  // -------------------------------------------------------------------------
  // PART A — LIVE ISOLATED UAT HOST (StructuredWorkspacePlayer)
  // -------------------------------------------------------------------------
  await run('Isolated UAT host preserves Tampilan Lama default, opts into Shared Book-Page Full Mode with accepted defaults', async () => {
    assert.equal(await evaluate('document.querySelector("[data-unified-reader]").dataset.unifiedReader'), 'classic');
    await clickButtonText('Shared UI (Beta)');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Book Page rendered');
    await click('[data-shared-card-layout-option="separated"]');
    await waitFrames();

    const check = await evaluate(`(() => {
      const bar = document.querySelector('[data-shared-workspace-style-bar]');
      const book = document.querySelector('[data-shared-book-page="true"]');
      const resetBtn = document.querySelector('[data-shared-workspace-style-reset]');
      const enSegs = [...book.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(el => el.dataset.sharedCardSegment);
      const idSegs = [...book.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')].map(el => el.dataset.sharedCardSegment);
      const paraBodies = [...book.querySelectorAll('[data-shared-reading-body="true"][data-shared-reading-kind="paragraph"]')];
      const turnBodies = [...book.querySelectorAll('[data-shared-reading-body="true"][data-shared-reading-kind="turn"]')];
      const alignedGrids = [...book.querySelectorAll('[data-shared-turn-aligned-grid]')];
      return {
        align: bar.dataset.sharedWorkspaceStyleAlign,
        indent: bar.dataset.sharedWorkspaceStyleIndent,
        speaker: bar.dataset.sharedWorkspaceStyleSpeaker,
        accents: bar.dataset.sharedWorkspaceStyleAccents,
        resetDisabled: resetBtn.disabled,
        cardCount: book.querySelectorAll('[data-shared-book-card]').length,
        enExact37: JSON.stringify(enSegs) === JSON.stringify(window.__uat4.londonIds.segmentIds),
        idExact37: JSON.stringify(idSegs) === JSON.stringify(window.__uat4.londonIds.segmentIds),
        allJustified: [...paraBodies, ...turnBodies].length === 22 && [...paraBodies, ...turnBodies].every(el => getComputedStyle(el).textAlign === 'justify'),
        allParaIndented: paraBodies.length === 6 && paraBodies.every(el => parseFloat(getComputedStyle(el).textIndent) > 16),
        noTurnIndented: turnBodies.every(el => parseFloat(getComputedStyle(el).textIndent) === 0),
        alignedSideBySide: alignedGrids.length === 8 && alignedGrids.every(g => {
          const sp = g.querySelector('[data-shared-turn-speaker-column]').getBoundingClientRect();
          const body = g.querySelector('[data-shared-turn-body-column]').getBoundingClientRect();
          return sp.right <= body.left + 2;
        }),
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        zeroPlaybackCalls: window.__uat4.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(check.align, 'justify');
    assert.equal(check.indent, 'on');
    assert.equal(check.speaker, 'aligned');
    assert.equal(check.accents, 'on');
    assert.equal(check.resetDisabled, true);
    assert.equal(check.cardCount, 4);
    assert.equal(check.enExact37, true);
    assert.equal(check.idExact37, true);
    assert.equal(check.allJustified, true);
    assert.equal(check.allParaIndented, true);
    assert.equal(check.noTurnIndented, true);
    assert.equal(check.alignedSideBySide, true);
    assert.equal(check.noOverflow, true);
    assert.equal(check.zeroPlaybackCalls, true);
    await captureFullPage('01-uat-host-full-book-defaults-separated.png');
  });

  await run('Isolated UAT host Full Book Page adapts safely on 390px mobile and Dark Theme without mutating saved speaker layout', async () => {
    await evaluate('window.__uat4.setDark(true)');
    await waitFrames();
    await captureFullPage('05-uat-host-dark-full-book.png');
    await evaluate('window.__uat4.setDark(false)');

    await setViewport({ width: 390, height: 844, mobile: true });
    await waitFrames();
    const mob = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4.UAT_STORAGE_KEY));
      const grids = [...document.querySelectorAll('[data-shared-turn-aligned-grid]')];
      const stackedSafely = grids.length === 8 && grids.every(g => {
        const sp = g.querySelector('[data-shared-turn-speaker-column]').getBoundingClientRect();
        const body = g.querySelector('[data-shared-turn-body-column]').getBoundingClientRect();
        return sp.bottom <= body.top + 2 && body.width >= 240;
      });
      return {
        savedSpeaker: saved.workspaceStyle.speakerLayout,
        stackedSafely,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()`);
    assert.equal(mob.savedSpeaker, 'aligned', 'Mobile adaptation must never mutate saved aligned preference');
    assert.equal(mob.stackedSafely, true);
    assert.equal(mob.noOverflow, true);
    await captureFullPage('04-uat-host-mobile-390-full-book.png');
    await setViewport({ width: 1280, height: 900, mobile: false });
  });

  await run('Isolated UAT host Card Mode supports Expand All, Follow Playback, Custom multi-open, and playback-independent collapse', async () => {
    await click('[data-shared-reader-mode-option="card"]');
    await until('!document.querySelector("[data-shared-book-page=true]") && document.querySelector("[data-shared-card-visibility-bar=true]")', 'Card mode rendered');
    await waitFrames();
    assert.equal(await evaluate('document.querySelectorAll("[data-shared-card-expanded=true]").length'), 4);
    await captureFullPage('02-uat-host-card-mode-expand-all-separated.png');

    // Start playback on Card 2 (C1) via its actual Play Card button and verify Follow Playback
    const c1Id = await evaluate('window.__uat4.londonIds.cards.C1');
    const c2Id = await evaluate('window.__uat4.londonIds.cards.C2');
    const p1Id = await evaluate('window.__uat4.londonIds.cards.P1');
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-card-play="true"]`);
    await until('window.__uat4.getUatEvents().length === 1 && document.querySelector("[data-unified-reader]").dataset.readerCursorCard === window.__uat4.londonIds.cards.C1', 'C1 playback active');
    const cancelsBeforeVisibility = await evaluate('window.__uat4.getUatCancels()');

    // Follow Playback keeps only active playing Card (C1) open
    await click('[data-shared-card-visibility-option="follow"]');
    await waitFrames();
    const followExpanded = await evaluate('[...document.querySelectorAll("[data-shared-card-expanded=true]")].map(e => e.dataset.sharedCardId)');
    assert.deepEqual(followExpanded, [c1Id], 'Follow Playback must expand only active playing Card');

    // Manual toggle opens P1 alongside C1 (Custom mode, multiple open cards!) without touching playback
    await click(`[data-shared-card-toggle="${p1Id}"]`);
    await waitFrames();
    const customBoth = await evaluate('[...document.querySelectorAll("[data-shared-card-expanded=true]")].map(e => e.dataset.sharedCardId)');
    assert.deepEqual(customBoth, [p1Id, c1Id], 'Custom visibility must support multiple open Cards');
    assert.equal(await evaluate('document.querySelector("[data-shared-card-visibility-bar]").dataset.sharedCardVisibilityMode'), 'custom');

    // Collapsing active playing Card C1 must NEVER stop or cancel playback, and surfaces Follow Playing Card
    await click(`[data-shared-card-toggle="${c1Id}"]`);
    await waitFrames();
    assert.equal(await evaluate('window.__uat4.getUatCancels()'), cancelsBeforeVisibility, 'Collapsing playing Card must not stop/cancel playback');
    assert.equal(await evaluate('document.querySelector("[data-unified-reader]").dataset.readerCursorCard'), c1Id);
    assert.equal(await evaluate('Boolean(document.querySelector("[data-shared-card-return-to-playing=true]"))'), true);

    // Clicking Follow Playing Card re-expands C1 cleanly without touching audio
    await click('[data-shared-card-return-to-playing="true"]');
    await waitFrames();
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-shared-card-expanded=true]")].map(e => e.dataset.sharedCardId)'), [c1Id]);
    assert.equal(await evaluate('window.__uat4.getUatCancels()'), cancelsBeforeVisibility);

    // Open P1 + C1 in Custom mode and stop playback cleanly before reload test
    await click(`[data-shared-card-toggle="${p1Id}"]`);
    await clickButtonText('Stop');
    await evaluate('window.__uat4.finishLatestUatEvent("stopped")');
    await until('document.querySelector("[data-unified-reader]").dataset.readerCursorPrecision === "none"', 'Playback stopped');
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-shared-card-id="${c2Id}"][data-shared-card-expanded="false"]'))`), true);
  });

  await run('Isolated UAT host supports explicit Workspace-specific override, isolated Workspace switch, reload persistence & scoped Reset', async () => {
    const beforeLogLen = await evaluate('window.__uat4.getPlaybackLog().length');
    // Switch Workspace Style scope to This Workspace (London only) and apply Left + Inline + Indent Off
    await click('[data-shared-workspace-style-scope-option="workspace"]');
    await click('[data-shared-workspace-align-option="left"]');
    await click('[data-shared-workspace-speaker-option="inline"]');
    await click('[data-shared-workspace-indent-toggle="true"]');
    await waitFrames();

    // Verify Workspace override applies on London, Reset Override enabled, and zero playback side effects
    const londonOverrideState = await evaluate(`(() => ({
      resetDisabled: document.querySelector('[data-shared-workspace-style-reset]').disabled,
      align: document.querySelector('[data-shared-reading-body="true"]').dataset.sharedReadingAlign,
      inlineSpeakers: document.querySelectorAll('[data-shared-turn-speaker-inline="true"]').length,
      logLen: window.__uat4.getPlaybackLog().length
    }))()`);
    assert.equal(londonOverrideState.resetDisabled, false);
    assert.equal(londonOverrideState.align, 'left');
    assert.ok(londonOverrideState.inlineSpeakers >= 4);
    assert.equal(londonOverrideState.logLen, beforeLogLen);

    // Reload browser page -> verify Shared UI, Card Mode, Separated layout, AND London Workspace Override persist!
    const prevTimeOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevTimeOrigin} && window.__uat4 && document.querySelector("[data-shared-card-visibility-bar]")`, 'Reloaded UAT host');
    await waitFrames();
    const afterReload = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4.UAT_STORAGE_KEY));
      const mainRaw = localStorage.getItem(window.__uat4.MAIN_STORAGE_KEY);
      return {
        savedReader: saved.reader,
        savedReaderMode: saved.readerMode,
        savedLayout: saved.view.bilingualLayout,
        sharedStyleStillAcceptedDefaults: saved.workspaceStyle.textAlign === 'justify' && saved.workspaceStyle.speakerLayout === 'aligned' && saved.workspaceStyle.paragraphIndent === true,
        hasLondonOverride: Object.keys(saved.workspaceStyleOverrides).length === 1,
        renderedAlign: document.querySelector('[data-shared-reading-body="true"]').dataset.sharedReadingAlign,
        mainHostUntouched: mainRaw === null
      };
    })()`);
    assert.equal(afterReload.savedReader, 'shared');
    assert.equal(afterReload.savedReaderMode, 'card');
    assert.equal(afterReload.savedLayout, 'separated');
    assert.equal(afterReload.sharedStyleStillAcceptedDefaults, true);
    assert.equal(afterReload.hasLondonOverride, true);
    assert.equal(afterReload.renderedAlign, 'left', 'Reload must restore London workspace override');
    assert.equal(afterReload.mainHostUntouched, true, 'Isolated UAT storage must not touch Main App key');

    // Expand P1 + C1 for clear Custom + Workspace Override visual screenshot
    await click('[data-shared-card-visibility-option="all"]');
    await click(`[data-shared-card-toggle="${await evaluate('window.__uat4.londonIds.cards.P2')}"]`);
    await click(`[data-shared-card-toggle="${await evaluate('window.__uat4.londonIds.cards.C2')}"]`);
    await click('[data-shared-workspace-style-scope-option="workspace"]');
    await waitFrames();
    await captureFullPage('03-uat-host-card-mode-custom-override-inline.png');

    // Switch to Stress Workspace -> must inherit Shared defaults (Justify + Aligned + Indent On), NOT London's override!
    await evaluate('window.__uat4.setWorkspace("stress")');
    await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__uat4.stressIds.documentId', 'Switched to Stress Workspace');
    await click('[data-shared-card-visibility-option="all"]');
    await waitFrames();
    const stressInherit = await evaluate(`(() => ({
      align: document.querySelector('[data-shared-reading-body="true"]').dataset.sharedReadingAlign,
      alignedCount: document.querySelectorAll('[data-shared-turn-aligned-grid]').length,
      titleIndented: [...document.querySelectorAll('[data-shared-reading-kind="title"]')].some(el => parseFloat(getComputedStyle(el).textIndent) > 0),
      consecutiveCount: document.querySelectorAll('[data-shared-turn-consecutive="true"]').length,
      totalEnStressSegments: document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]').length,
      hasLongSpeakerSecondSentence: document.body.textContent.includes('Our onboard attendants can also help you locate your reserved window seat'),
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth
    }))()`);
    assert.equal(stressInherit.align, 'justify', 'Unoverridden Workspace must inherit Shared defaults');
    assert.ok(stressInherit.alignedCount >= 4);
    assert.equal(stressInherit.titleIndented, false, 'Title Card must never indent');
    assert.ok(stressInherit.consecutiveCount >= 1);
    assert.equal(stressInherit.totalEnStressSegments, 9, 'Complete stress fixture must retain all 9 stress sentences');
    assert.equal(stressInherit.hasLongSpeakerSecondSentence, true, 'Complete stress fixture must retain second long-speaker sentence');
    assert.equal(stressInherit.noOverflow, true);
    await captureFullPage('08-uat-host-stress-title-consecutive-long.png');

    // Switch back to London -> override still active -> Reset Override clears ONLY override without resetting readerMode/layout!
    await evaluate('window.__uat4.setWorkspace("london")');
    await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__uat4.londonIds.documentId', 'Back to London');
    await click('[data-shared-workspace-style-scope-option="workspace"]');
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-reading-body=true]").dataset.sharedReadingAlign'), 'left');
    await click('[data-shared-workspace-style-reset="true"]');
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-reading-body=true]").dataset.sharedReadingAlign'), 'justify');
    assert.equal(await evaluate('document.querySelector("[data-shared-workspace-style-reset]").disabled'), true);
    assert.equal(await evaluate('document.querySelector("[data-shared-card-bilingual-toolbar]").dataset.sharedReaderMode'), 'card', 'Reset Override must not reset readerMode');
  });

  // -------------------------------------------------------------------------
  // PART B — LIVE MAIN APP HOST (TextStructuredPlayer + main preference key)
  // -------------------------------------------------------------------------
  await run('Live Main App host wires Full Book Page, Card Mode, Card Audio Panel, Workspace Style, override & reload persistence', async () => {
    await call('Page.navigate', { url: `${origin}/?host=main&doc=london` });
    await until('window.__uat4Main && document.querySelector("[data-main-app-host-harness]")', 'Main App host mounted');
    await evaluate('window.__uat4.clearPlaybackLog()');

    // Opt into Shared UI -> renders Book-Page Full Mode with accepted defaults
    await click('[data-main-host-reader="shared"]');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Main App Book Page rendered');
    await click('[data-shared-card-layout-option="separated"]');
    await waitFrames();

    const mainBookCheck = await evaluate(`(() => {
      const book = document.querySelector('[data-shared-book-page="true"]');
      const enSegs = [...book.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(e => e.dataset.sharedCardSegment);
      return {
        enExact37: JSON.stringify(enSegs) === JSON.stringify(window.__uat4.londonIds.segmentIds),
        align: book.dataset.sharedWorkspaceAlign,
        indent: book.dataset.sharedWorkspaceIndent,
        speaker: book.dataset.sharedWorkspaceSpeakerLayout,
        hasAudioPanelTrigger: Boolean(book.querySelector('[aria-label="Open card audio controls"]')),
        zeroPlaybackCalls: window.__uat4.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(mainBookCheck.enExact37, true);
    assert.equal(mainBookCheck.align, 'justify');
    assert.equal(mainBookCheck.indent, 'on');
    assert.equal(mainBookCheck.speaker, 'aligned');
    assert.equal(mainBookCheck.hasAudioPanelTrigger, true);
    assert.equal(mainBookCheck.zeroPlaybackCalls, true);
    await captureFullPage('06-main-app-host-full-book-separated.png');

    // Verify Card Audio panel opens cleanly even from Book-Page Full Mode
    await click('[aria-label="Open card audio controls"]');
    await until('document.querySelector("[data-text-card-audio-panel]")', 'Card Audio Panel opened from Book Page');
    await click('[aria-label="Close audio settings"]');
    await until('!document.querySelector("[data-text-card-audio-panel]")', 'Card Audio Panel closed');

    // Switch to Card Mode -> expandable StructuredPlayerCards + Card Visibility toolbar
    await click('[data-shared-reader-mode-option="card"]');
    await until('!document.querySelector("[data-shared-book-page=true]") && document.querySelector("[data-text-card-expansion-toolbar=true]")', 'Main App Card Mode rendered');
    await waitFrames();
    assert.equal(await evaluate('document.querySelectorAll("[data-text-player-card]").length'), 4);
    await captureFullPage('07-main-app-host-card-mode-expand-all-separated.png');

    // Test Shared Workspace Style change + Accents toggle + Reload persistence in Main App key
    await click('[data-shared-workspace-align-option="left"]');
    await click('[data-shared-workspace-speaker-option="stacked"]');
    await click('[data-shared-workspace-accents-toggle="true"]');
    await waitFrames();
    const prevOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevOrigin} && window.__uat4Main && document.querySelector("[data-shared-workspace-style-bar]")`, 'Main App host reloaded');
    const mainReload = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4.MAIN_STORAGE_KEY));
      const uatSaved = JSON.parse(localStorage.getItem(window.__uat4.UAT_STORAGE_KEY));
      return {
        mainAlign: saved.workspaceStyle.textAlign,
        mainSpeaker: saved.workspaceStyle.speakerLayout,
        mainAccents: saved.workspaceStyle.showAccents,
        mainReaderMode: saved.readerMode,
        uatStillIsolated: uatSaved.workspaceStyle.textAlign === 'justify' && uatSaved.workspaceStyle.speakerLayout === 'aligned'
      };
    })()`);
    assert.equal(mainReload.mainAlign, 'left');
    assert.equal(mainReload.mainSpeaker, 'stacked');
    assert.equal(mainReload.mainAccents, false);
    assert.equal(mainReload.mainReaderMode, 'card');
    assert.equal(mainReload.uatStillIsolated, true, 'Main App style edits must never leak to Isolated UAT host');

    // Click actual Segment callback -> exact persistent segment ID preserved
    const targetSegId = await evaluate('window.__uat4.londonIds.segmentIdsByUnitKey.C1_T2[0]');
    await click(`[data-shared-card-segment="${targetSegId}"][data-shared-card-channel="text"]`);
    const log = await evaluate('window.__uat4.getPlaybackLog()');
    assert.deepEqual(log[log.length - 1], ['main:playSegment', targetSegId]);

    // Reset Shared Style in Main App -> restores accepted defaults without resetting readerMode='card' or layout='separated'
    await click('[data-shared-workspace-style-reset="true"]');
    await waitFrames();
    assert.equal(await evaluate('window.__uat4Main.getPreference().workspaceStyle.textAlign'), 'justify');
    assert.equal(await evaluate('window.__uat4Main.getPreference().readerMode'), 'card');
    assert.equal(await evaluate('window.__uat4Main.getPreference().view.bilingualLayout'), 'separated');

    // Guardrails: zero IndexedDB access, zero uncaught errors, snapshot unmutated
    const guardrails = await evaluate(`({
      dbCalls: window.__uat4DbCalls,
      errors: window.__uat4Errors,
      snapshotUnchanged: window.__uat4.getSnapshotUnchanged()
    })`);
    assert.equal(guardrails.dbCalls, 0);
    assert.deepEqual(guardrails.errors, []);
    assert.equal(guardrails.snapshotUnchanged, true);
  });

  const report = {
    status: 'PASS',
    nodeVerification,
    browserChecksPassed: results.length,
    results,
    evidenceDir,
    screenshots
  };
  await fs.writeFile(path.join(evidenceDir, 'uat4-4b1-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await call('Browser.close').catch(() => {});
} catch (error) {
  console.error('UAT-4B1 browser audit FAILED:', error);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log(`Evidence dir: ${evidenceDir} | Disposable profile: ${profile}`);
}
