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
import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notebookLayoutOnly = process.argv.includes('--notebook-layout');
const notebookOnly = process.argv.includes('--only-4c3');
const sessionOnly = process.argv.includes('--only-4e2');
const commandsOnly = sessionOnly || process.argv.includes('--only-4e1');
const evidenceDir = process.env.UAT4_4C1_EVIDENCE_DIR
  || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4c1-evidence-'));
await fs.mkdir(evidenceDir, { recursive: true });

assert.equal(TEXT_LIBRARY_DB_VERSION, 1, 'Canonical DB version must remain 1');
assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1, 'Canonical schema version must remain 1');

const compileCss = async () => {
  const [cssSource, swiperCss, focusCarouselCss, readerTypographyCss, notebookCss] = await Promise.all([
    fs.readFile(path.join(root, 'src/index.css'), 'utf8'),
    fs.readFile(path.join(root, 'node_modules/swiper/swiper.css'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/text/presentation/sharedFocusCarousel.css'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/text/presentation/sharedReaderTypography.css'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/text/presentation/sharedNotebookParallelFlow.css'), 'utf8')
  ]);
  const tailwindConfigModule = await import(pathToFileURL(path.join(root, 'tailwind.config.js')).href);
  const tailwindConfig = {
    ...tailwindConfigModule.default,
    content: [
      path.join(root, 'src/**/*.{js,jsx}'),
      path.join(root, 'scripts/audit-text-uat4-4c1-bilingual-typography-browser.mjs')
    ]
  };
  const result = await postcss([tailwindcss(tailwindConfig), autoprefixer]).process(cssSource, {
    from: path.join(root, 'src/index.css')
  });
  return `${swiperCss}\n${result.css}\n${focusCarouselCss}\n${readerTypographyCss}\n${notebookCss}`;
};

const harnessJsx = `
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { measureNotebookParallelFlow } from './src/components/text/presentation/notebookParallelFlowLayout.js';
window.__measureNotebook = measureNotebookParallelFlow;
import { selectTextMixedReaderState } from './src/domain/text/textMixedReaderDomain.js';
import { applyTextLibraryCommand } from './src/domain/text/textLibraryCommandDomain.js';
import { useConversationAudioPlayback } from './src/components/text/conversation/useConversationAudioPlayback.js';
import { resolveTextConversationReaderCursor } from './src/domain/text/textConversationReaderDomain.js';
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
  JOURNEY_TO_LONDON_CARDS_SPEC,
  createJourneyToLondonFixture,
  createJourneyToLondonStressFixtures
} from './scripts/fixtures/uat4/journey-to-london.js';

const loadOrCreateFixtures = () => {
  const CACHE_KEY = '__uat4_4c1_fixtures_v1';
  try {
    const cached = window.sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  const created = {
    london: createJourneyToLondonFixture(),
    stress: createJourneyToLondonStressFixtures()
  };
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(created));
  } catch { /* ignore */ }
  return created;
};

const fixtures = loadOrCreateFixtures();
const londonBefore = JSON.stringify(fixtures.london.snapshot);
const stressBefore = JSON.stringify(fixtures.stress.snapshot);
const UAT_STORAGE_KEY = resolveTextMainReaderPreferenceStorageKey({ hostId: STRUCTURED_UAT_PREFERENCE_HOST_ID });

const COMMAND_AUDIO_CONFIG = { playbackRepresentationMode: 'full', playbackChannelMode: 'text-meaning' };
function LiveMainAppHostHarness({ activeFixture, playbackLogRef, commandRuntime = null }) {
  const [pref, setPref] = useState(() => loadTextMainReaderPreference());
  const [scope, setScope] = useState(TEXT_WORKSPACE_STYLE_SCOPES.SHARED);
  const [cardExpansionMode, setCardExpansionMode] = useState('all');
  const [activePlayback, setActivePlayback] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);

  const selected = useMemo(
    () => selectTextMixedReaderState(activeFixture.snapshot, { documentId: activeFixture.ids.documentId }),
    [activeFixture]
  );
  const audio = useConversationAudioPlayback({
    snapshot: activeFixture.snapshot, documentTree: commandRuntime ? selected.documentTree : null,
    audioConfig: COMMAND_AUDIO_CONFIG, audioRuntimeHooks: commandRuntime
  });
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

  window.__uat4C1Main = {
    getPreference: () => pref,
    setReader: reader => updatePref({ reader }),
    setActivePlayback: next => setActivePlayback(next),
    setFocusTarget: next => setFocusTarget(next),
    readNowPlaying: audio.readNowPlaying,
    stopPlayback: audio.stopPlayback,
    pausePlayback: audio.pausePlayback,
    resumePlayback: audio.resumePlayback,
    navigatePlayback: audio.navigatePlayback,
    getFocusTarget: () => focusTarget
  };

  const sharedCursor = commandRuntime ? resolveTextConversationReaderCursor({ presentation: selected.presentation, audioPlayback: audio })
    : activePlayback ? {
    workspaceId: selected.presentation.workspace.id,
    workspaceUid: selected.presentation.workspace.uid,
    sessionId: activePlayback.sessionId ?? 101,
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
        focusTarget={focusTarget}
        onFocusConsumed={nonce => setFocusTarget(current => (current?.nonce === nonce ? null : current))}
        isPlaying={Boolean(activePlayback && activePlayback.state === 'playing')}
        isPaused={Boolean(activePlayback && activePlayback.state === 'paused')}
        speakingPart={activePlayback?.channel || null}
        playingContext={activePlayback ? TEXT_STRUCTURED_PLAYBACK_CONTEXT : null}
        playingIndex={activePlayback?.segmentId || null}
        displayMode="text-meaning"
        playbackChannelMode="text-meaning"
        playbackRepresentationMode={activePlayback?.precision === 'card' ? 'full' : 'split'}
        playbackPreferences={{ cardExpansionMode, playbackOrderMode: 'sequential', repeatMode: 'off' }}
        onPlaybackFeelChange={patch => { if (patch.cardExpansionMode) setCardExpansionMode(patch.cardExpansionMode); }}
        onPlayDocument={commandRuntime ? audio.playWorkspace : () => playbackLogRef.current.push(['main:playDocument', activeFixture.ids.documentId])}
        onPlayCard={commandRuntime ? audio.playScene : (cardId, opts) => playbackLogRef.current.push(['main:playCard', cardId, opts || null])}
        onPlaySegment={commandRuntime ? audio.playSentence : segId => playbackLogRef.current.push(['main:playSegment', segId])}
        onPlaySegmentChannel={commandRuntime ? audio.playSentence : undefined}
        onPlayUnit={commandRuntime ? audio.playUnit : undefined}
        onPlayContinueFromSegment={commandRuntime ? (id, options) => audio.playFromSentence(id, options.scope) : undefined}
      />
    </div>
  );
}

function Audit4C1App() {
  const params = new URLSearchParams(window.location.search);
  const [hostTab, setHostTab] = useState(() => params.get('host') || 'uat');
  const [whichDoc, setWhichDoc] = useState(() => params.get('doc') === 'stress' ? 'stress' : 'london');
  const [dark, setDark] = useState(false);
  const [derived, setDerived] = useState(null);
  const playbackLogRef = useRef([]);
  const uatEventsRef = useRef([]);
  const uatCancelsRef = useRef(0);

  const activeFixture = derived || (whichDoc === 'stress' ? fixtures.stress : fixtures.london);

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

  window.__uat4C1 = {
    MAIN_STORAGE_KEY: TEXT_MAIN_READER_PREFERENCE_KEY,
    UAT_STORAGE_KEY,
    londonIds: fixtures.london.ids,
    stressIds: fixtures.stress.ids,
    getFixtureSegments: () => activeFixture.snapshot.segments,
    londonSpec: JOURNEY_TO_LONDON_CARDS_SPEC,
    getSnapshotsUnchanged: () => (
      JSON.stringify(fixtures.london.snapshot) === londonBefore
      && JSON.stringify(fixtures.stress.snapshot) === stressBefore
    ),
    getPlaybackLog: () => [...playbackLogRef.current],
    clearPlaybackLog: () => { playbackLogRef.current = []; },
    getUatEvents: () => uatEventsRef.current,
    getUatCancels: () => uatCancelsRef.current,
    finishLatestUatEvent: status => {
      const ev = uatEventsRef.current[uatEventsRef.current.length - 1];
      if (ev) ev.finish({ status: status || 'played' });
    },
    finishUatEvent: (index, status) => uatEventsRef.current[index]?.finish({ status }),
    deleteDisposableSegment: id => {
      const { snapshot } = applyTextLibraryCommand(activeFixture.snapshot, { type: 'segment.delete', payload: { id }, now: 4002 });
      setDerived({ snapshot, ids: activeFixture.ids });
    },
    setWorkspace: next => {
      setDerived(null);
      const target = next === 'stress' ? 'stress' : 'london';
      setWhichDoc(target);
      const url = new URL(window.location.href);
      url.searchParams.set('doc', target);
      window.history.replaceState(null, '', url);
    },
    extendLondon: () => {
      const source = fixtures.london;
      let snapshot = source.snapshot;
      const apply = (type, payload) => {
        snapshot = applyTextLibraryCommand(snapshot, { type, payload, now: 4001 }).snapshot;
      };
      for (let index = 0; index < 16; index++) {
        apply('block.create', { documentId: source.ids.documentId, blockType: 'paragraph', title: 'Disposable ' + index });
        const blockId = snapshot.blocks.at(-1).id;
        const unitId = snapshot.contentUnits.find(unit => unit.blockId === blockId).id;
        for (const segment of source.snapshot.segments.slice(0, 3)) {
          apply('segment.create', { blockId, unitId, text: segment.text,
            meaning: index === 15 ? 'overflow'.repeat(120) : segment.meaning,
            joinAfter: segment.joinAfter });
        }
      }
      setWhichDoc('large');
      setDerived({ snapshot, ids: source.ids });
    },
    setDark: flag => {
      setDark(Boolean(flag));
      document.documentElement.classList.toggle('dark', Boolean(flag));
    }
  };

  return (
    <div data-uat4-4c1-host={hostTab} data-uat4-4c1-theme={dark ? 'dark' : 'light'} className="min-h-screen bg-slate-100/90 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              ProLingo UAT-4 Packet D (4C1) · Bilingual Style &amp; Typography ({hostTab === 'uat' ? 'Isolated UAT Host' : 'Main App Host'})
            </p>
            <h1 className="text-lg font-bold">Separated (Per-Unit) · Sentence Interlinear · Contextual · Independent Typography</h1>
          </div>
          <span className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-semibold">
            {whichDoc === 'stress' ? 'Complete Stress Fixture (3/8/9)' : 'A Journey to London (4/11/37)'}
          </span>
        </header>

        {hostTab === 'uat' ? (
          <StructuredWorkspacePlayer
            key={whichDoc}
            snapshot={activeFixture.snapshot}
            documentId={activeFixture.ids.documentId}
            audioRuntimeHooks={audioRuntimeHooks}
          />
        ) : (
          <LiveMainAppHostHarness key={whichDoc} activeFixture={activeFixture} playbackLogRef={playbackLogRef}
            commandRuntime={params.get('audit') === '4e1' ? audioRuntimeHooks : null} />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Audit4C1App />);
`;

const [compiledCss, compiledJs] = await Promise.all([
  compileCss(),
  build({
    absWorkingDir: root,
    stdin: {
      contents: harnessJsx,
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'uat4-4c1-harness.jsx'
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
  <title>ProLingo UAT-4 4C1 Bilingual & Typography Audit</title>
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
      value: new Proxy({}, { get() { window.__uat4DbCalls += 1; throw new Error('4C1 browser audit forbids IndexedDB'); } })
    });
  </script>
  <script type="module" src="/app.js"></script>
</body>
</html>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4c1-profile-'));
const browserPath = process.env.UAT4_BROWSER_PATH
  || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const browser = spawn(
  browserPath,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' }
);

let socket;
let closeBrowser;
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
  if (!port) throw new Error('Headless Chrome did not start');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  const pending = new Map();
  let nextId = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, method === 'Browser.close' ? 3000 : 15000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  closeBrowser = () => call('Browser.close');
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (expr, label = expr) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expr})`)) return;
      await sleep(40);
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
  const captureElement = async (selector, filename, padding = 12) => {
    await waitFrames();
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left + window.scrollX - ${padding})),
        y: Math.max(0, Math.floor(r.top + window.scrollY - ${padding})),
        width: Math.ceil(r.width + ${padding * 2}),
        height: Math.ceil(r.height + ${padding * 2})
      };
    })()`);
    if (!box) throw new Error(`Capture element not found: ${selector}`);
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { ...box, scale: 1 }
    });
    const outPath = path.join(evidenceDir, filename);
    await fs.writeFile(outPath, Buffer.from(shot.data, 'base64'));
    screenshots.push({ filename, path: outPath, width: box.width, height: box.height });
    return outPath;
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
  await until('window.__uat4C1 && document.querySelector("[data-structured-workspace-player]")', 'Isolated UAT host mounted');

  if (notebookLayoutOnly || notebookOnly) {
    await run('4C3 layout: Chromium shares and wraps primary lines, preserves text, and falls back locally', async () => {
      const result = await evaluate(`(() => {
        const mirror = document.createElement('div');
        const primarySample = document.createElement('div');
        const secondarySample = document.createElement('div');
        primarySample.style.font = '16px/1.5 sans-serif';
        secondarySample.style.font = '12px/1.5 sans-serif';
        document.body.append(mirror, primarySample, secondarySample);
        try {
          const segments = [
            { primary: 'Hello, there.', secondary: 'Halo, kamu.', separator: ' ' },
            { primary: 'The evening train departs from the third platform in twenty minutes.', secondary: 'Kereta malam berangkat dari peron tiga dalam dua puluh menit.', separator: '\\n' },
            { primary: 'Yes.', secondary: '', separator: '' }
          ];
          const measure = (input, width) => window.__measureNotebook({ mirror, primarySample, secondarySample, segments: input, width });
          const layout = measure(segments, 218);
          const reconstructed = segments.map((_, index) => layout.lines.flatMap(row => row.fragments)
            .filter(fragment => fragment.index === index)
            .reduce(([p, s], fragment) => [p + fragment.primary, s + fragment.secondary], ['', '']));
          return {
            reason: layout.reason, reconstructed, expected: segments.map(s => [s.primary, s.secondary]),
            shared: layout.lines.some(row => row.fragments.length > 1),
            wrapped: layout.lines.filter(row => row.fragments.some(f => f.index === 1)).length > 1,
            hardBreak: layout.lines.at(-1)?.fragments[0]?.index === 2,
            extreme: measure([{ ...segments[0], secondary: 'unbreakable'.repeat(20) }], 160).reason,
            stillValid: !measure(segments.slice(2), 160).reason
          };
        } finally { mirror.remove(); primarySample.remove(); secondarySample.remove(); }
      })()`);
      assert.equal(result.reason, null, JSON.stringify(result));
      assert.deepEqual(result.reconstructed, result.expected);
      assert.ok(result.shared && result.wrapped && result.hardBreak && result.extreme && result.stillValid);
    });
  }

  if (notebookOnly) {
    const option = (attribute, value) => `[data-shared-${attribute}="${value}"]`;
    const select = (attribute, value) => click(option(attribute, value));
    const scan = async () => {
      const count = await evaluate('document.querySelectorAll("[data-shared-notebook-unit]").length');
      for (let index = 0; index < count; index++) {
        const unit = `document.querySelectorAll('[data-shared-notebook-unit]')[${index}]`;
        await evaluate(`${unit}.scrollIntoView({block:'center',behavior:'instant'})`);
        await until(`${unit}.dataset.sharedNotebookUnit !== 'pending'`, 'visible Notebook unit measured');
      }
      return evaluate(`(() => {
        const units = [...document.querySelectorAll('[data-shared-notebook-unit]')];
        const authored = new Map(window.__uat4C1.getFixtureSegments().map(seg => [seg.id, seg]));
        const text = new Map();
        const errors = [];
        let shared = 0, continued = 0;
        for (const unit of units) {
          shared += [...unit.querySelectorAll('[data-shared-notebook-line]')].filter(row => row.children.length > 1).length;
          continued += unit.querySelectorAll('[data-shared-notebook-fragment="1"][data-shared-notebook-role="primary"]').length;
          for (const target of unit.querySelectorAll('[data-shared-card-segment][data-shared-card-channel]')) {
            const { sharedCardSegment: id, sharedCardChannel: channel } = target.dataset;
            const key = id + ':' + channel;
            text.set(key, (text.get(key) || '') + target.textContent);
            if (!target.hasAttribute('data-shared-notebook-fragment') || !target.textContent.trim()) continue;
            const range = document.createRange();
            range.setStart(target.firstChild, 0);
            range.setEnd(target.firstChild, target.textContent.trimEnd().length);
            const rects = [...range.getClientRects()].filter(r => r.width > 0);
            const slot = target.dataset.sharedNotebookRole === 'primary'
              ? target.parentElement.getBoundingClientRect()
              : target.getBoundingClientRect();
            if (rects.some(rect => rect.left < slot.left - 2 || rect.right > slot.right + 2)) {
              for (const word of target.textContent.matchAll(/\\S+/g)) {
                range.setStart(target.firstChild, word.index);
                range.setEnd(target.firstChild, word.index + word[0].length);
                if ([...range.getClientRects()].some(rect => rect.left < slot.left - 2 || rect.right > slot.right + 2)) {
                  errors.push(key + ' overflow: ' + word[0]);
                }
              }
            }
            if (target.dataset.sharedNotebookRole === 'primary' && rects.length !== 1) errors.push(key + ' rewrapped: ' + rects.length);
          }
        }
        for (const [key, observed] of text) {
          const [id, channel] = key.split(':');
          if (observed !== authored.get(id)?.[channel]) errors.push(key + ' changed');
        }
        const ids = new Set([...text.keys()].map(key => key.split(':')[0]));
        for (const id of ids) for (const channel of ['text', 'meaning']) {
          if (authored.get(id)?.[channel] && !text.has(id + ':' + channel)) errors.push(id + ':' + channel + ' missing');
        }
        return { units: units.length, segments: ids.size, shared, continued, errors,
          fallback: units.filter(node => node.dataset.sharedNotebookUnit === 'fallback').length };
      })()`);
    };
    for (const host of ['uat', 'main']) {
      await run(`4C3 ${host}: Notebook persists and renders in the shared Reader modes`, async () => {
        await call('Page.navigate', { url: `${origin}/?host=${host}&doc=london` });
        await until(`window.__uat4C1 && document.querySelector('${host === 'main' ? '[data-main-app-host-harness]' : '[data-structured-workspace-player]'}')`, 'host ready');
        if (host === 'main') await click('[data-main-host-reader="shared"]');
        else if (!(await evaluate('Boolean(document.querySelector("[data-shared-book-page]"))'))) await clickButtonText('Shared UI (Beta)');
        await select('reader-mode-option', 'full');
        await select('bilingual-style-option', 'notebook');
        const london = await scan();
        assert.equal(london.units, 11);
        assert.equal(london.segments, 37);
        assert.deepEqual(london.errors, []);
        assert.ok(london.shared > 0 && london.continued > 0, JSON.stringify(london));
        console.log('MEASURE', host, JSON.stringify(london));
        assert.equal(await evaluate('document.querySelector("[data-shared-notebook-unit]").dataset.sharedNotebookSpacing'), 'compact');
        await captureElement('[data-shared-book-card]', `4c3-${host}-full-notebook.png`);
        await select('workspace-align-option', 'left');
        for (const layout of ['stacked', 'inline', 'aligned']) {
          await select('workspace-speaker-option', layout);
          await until(`document.querySelector('[data-shared-turn-speaker-layout="${layout}"]')`);
        }
        assert.deepEqual((await scan()).errors, []);
        const action = await evaluate(`(() => {
          const button = document.querySelector('[data-notebook-action]');
          button.focus({preventScroll:true});
          return button.dataset.notebookAction;
        })()`);
        await setViewport({ width: 1100, height: 900, mobile: false });
        await scan();
        assert.equal(await evaluate('document.activeElement.dataset.notebookAction'), action, 'authored action stays focused on reflow');
        await setViewport({ width: 1280, height: 900, mobile: false });
        if (host === 'main') {
          await scan();
          const ids = await evaluate('window.__uat4C1.londonIds');
          const id = ids.segmentIdsByUnitKey.P1_SC1[0];
          const fields = { cardId: ids.cards.P1, unitId: ids.units.P1_SC1, precision: 'segment', segmentId: id, channel: 'meaning' };
          const setCursor = next => evaluate(`window.__uat4C1Main.setActivePlayback(${JSON.stringify(next)})`);
          const fragment = `[data-shared-notebook-fragment][data-shared-card-segment="${id}"]`;
          await evaluate(`(() => {
            window.__notebookMeasurements = 0;
            window.__countNotebook = new MutationObserver(entries => {
              for (const entry of entries) for (const node of entry.addedNodes) {
                if (node.classList?.contains('prolingo-notebook-sample')) window.__notebookMeasurements++;
              }
            });
            window.__countNotebook.observe(document.body, { childList: true });
          })()`);
          await setCursor({ ...fields, state: 'playing' });
          await until(`document.querySelector('${fragment}[data-shared-card-channel=meaning][data-notebook-speaking]')`);
          assert.equal(await evaluate(`document.querySelectorAll('${fragment}[data-shared-card-channel=text][data-notebook-speaking]').length`), 0);
          await setCursor({ ...fields, state: 'paused' });
          await until(`document.querySelector('${fragment}[data-shared-card-channel=meaning][data-shared-segment-paused]')`);
          assert.equal(await evaluate(`document.querySelectorAll('${fragment}[data-shared-card-channel=text][data-shared-segment-paused]').length`), 0);
          await setCursor({ ...fields, state: 'playing', segmentId: null, precision: 'card' });
          await until(`document.querySelector('${fragment}[data-notebook-speaking]')`);
          assert.equal(await evaluate('document.querySelectorAll("[data-shared-notebook-fragment][data-text-player-segment-active]").length'), 0);
          await setCursor(null);
          await until('!document.querySelector("[data-notebook-speaking]")');
          assert.equal(await evaluate('window.__notebookMeasurements'), 0, 'cursor updates alone never remeasure Notebook');
          await evaluate('window.__countNotebook.disconnect()');
        }
        await select('appearance-toggle', 'true');
        await select('notebook-guides-option', 'true');
        await select('notebook-spacing-option', 'relaxed');
        await select('appearance-font-family', 'serif');
        await select('reading-language-option', 'id-en');
        await call('Page.reload');
        await until('document.querySelector("[data-shared-notebook-guides=off][data-shared-notebook-spacing=relaxed]")', 'Notebook settings survived reload');
        assert.equal(await evaluate('document.querySelector("[data-shared-bilingual-style=notebook]").dataset.sharedReadingLanguage'), 'id-en');
        for (const mode of ['card', 'focus', 'segment']) {
          await select('reader-mode-option', mode);
          await until('document.querySelector("[data-shared-notebook-unit]")', mode);
          if (mode === 'focus') {
            await select('focus-orientation-option', 'horizontal-focus');
            await until('document.querySelector("[data-shared-part-track=horizontal]")?.swiper');
            await evaluate(`(() => {
              const track = document.querySelector('[data-shared-part-track=horizontal]');
              window.scrollBy({top:track.getBoundingClientRect().top - 110, behavior:'instant'});
            })()`);
            await until(`(() => {
              const track = document.querySelector('[data-shared-part-track=horizontal]');
              const slide = track?.swiper?.slides[track.swiper.activeIndex];
              if (!slide || track.scrollLeft || !slide.querySelector('[data-shared-notebook-unit]:not([data-shared-notebook-unit=pending])')) return false;
              const a = track.getBoundingClientRect(), b = slide.getBoundingClientRect();
              return Math.abs((a.left + a.right - b.left - b.right) / 2) <= 6;
            })()`, 'Swiper centered after Notebook measurement');
            await select('focus-orientation-option', 'vertical-focus');
            const ids = await evaluate('window.__uat4C1.londonIds');
            const row = unitId => `document.querySelector('[data-shared-focus-vertical-unit-id="${unitId}"]')`;
            const t1 = row(ids.units.C1_T1);
            const t2 = row(ids.units.C1_T2);
            const layout = row => `${row}.querySelector('[data-shared-notebook-unit]')?.dataset.sharedNotebookUnit`;
            const active = row => `${row}.matches('[data-shared-part-active=true]')`;
            const assertInactive = async row => {
              const state = await evaluate(`(() => {
                const row = ${row};
                const notebook = row.querySelector('[data-shared-notebook-unit]');
                const action = notebook.querySelector('button, [role="button"]');
                const previous = document.activeElement;
                action?.focus({preventScroll:true});
                const bounds = row.getBoundingClientRect();
                return {
                  active: ${active(row)},
                  inViewport: bounds.bottom > 0 && bounds.top < innerHeight,
                  inert: notebook.closest('[inert]')?.inert === true,
                  layout: notebook.dataset.sharedNotebookUnit,
                  hasAction: Boolean(action),
                  focusUnchanged: previous === document.activeElement
                };
              })()`);
              console.log('MEASURE', host, 'inactive Notebook preview', JSON.stringify(state));
              assert.deepEqual(state, {
                active: false, inViewport: true, inert: true,
                layout: 'pending', hasAction: true, focusUnchanged: true
              });
            };
            const positionForKey = async (row, down) => {
              await evaluate(`(() => {
                document.activeElement.blur();
                const bounds = ${row}.getBoundingClientRect();
                const start = ${down ? 'bounds.top - 25' : 'bounds.bottom + 25'};
                window.scrollTo({top: window.scrollY + start - innerHeight * .42, behavior:'instant'});
              })()`);
              await waitFrames();
            };
            const activateWithKey = async (row, key, windowsVirtualKeyCode) => {
              for (let index = 0; index < 3 && !(await evaluate(active(row))); index++) {
                await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode });
                await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode });
                await waitFrames();
              }
              await until(active(row), 'keyboard activated the Notebook Unit');
              await until(`${layout(row)} === 'parallel'`, 'active Notebook measured without another input');
              assert.equal(await evaluate(`Boolean(${row}.querySelector('[data-shared-notebook-unit]').closest('[inert]'))`), false);
              console.log('MEASURE', host, key, 'Notebook layout', await evaluate(layout(row)));
            };
            await until(t2);
            await evaluate(`${t1}.scrollIntoView({ block: 'center', behavior: 'instant' })`);
            await until(`${active(t1)} && ${layout(t1)} === 'parallel'`, 'T1 measured before navigating away');
            await positionForKey(t2, true);
            await assertInactive(t2);
            await activateWithKey(t2, 'ArrowDown', 40);
            await positionForKey(t1, false);
            await assertInactive(t1);
            await activateWithKey(t1, 'ArrowUp', 38);
          }
        }
        await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'exactly four Study Boxes');
        const segmentResult = await scan();
        assert.deepEqual(segmentResult.errors, []);
        const target = await evaluate(`(() => {
          const target = document.querySelector('[data-shared-notebook-fragment][data-shared-segment-select-only]');
          const id = target?.dataset.sharedCardSegment;
          target?.click();
          return id;
        })()`);
        assert.ok(target);
        await until(`document.querySelector('[data-shared-segment-study-box][data-shared-segment-focus="${target}"]')`, 'context tap selected Study Box');
        const keyboardTarget = await evaluate(`(() => {
          const node = [...document.querySelectorAll('[data-notebook-action]')]
            .find(button => button.dataset.notebookAction.endsWith(':meaning') && !button.dataset.notebookAction.startsWith('${target}:'));
          if (!node) return null;
          const actions = node.parentElement;
          const keys = [...actions.querySelectorAll('[data-notebook-action]')].map(button => button.dataset.notebookAction);
          if (keys.length !== new Set(keys).size || !actions.nextElementSibling.matches('[aria-hidden=true]')) return null;
          actions.parentElement.scrollIntoView({block:'center', behavior:'instant'});
          node.focus({preventScroll:true});
          return document.activeElement === node ? node.dataset.notebookAction.split(':')[0] : null;
        })()`);
        assert.ok(keyboardTarget, 'one accessible action per authored Segment/channel');
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await until(`document.querySelector('[data-shared-segment-study-box][data-shared-segment-focus="${keyboardTarget}"]')`, 'keyboard selected the authored Segment');
        assert.ok(await evaluate(`Boolean(document.querySelector('[data-shared-notebook-fragment][data-shared-card-segment="${keyboardTarget}"][data-shared-segment-selected]'))`));
        assert.deepEqual(await evaluate('window.__uat4C1.getPlaybackLog()'), []);
        await select('reader-mode-option', 'full');
        await evaluate('window.__uat4C1.setWorkspace("stress"); window.__uat4C1.setDark(true)');
        await setViewport({ width: 390, height: 844, mobile: true });
        await until('document.querySelectorAll("[data-shared-book-card]").length === 3', 'complete stress fixture');
        const stress = await scan();
        assert.equal(stress.segments, 9);
        assert.deepEqual(stress.errors, []);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
        await captureFullPage(`4c3-${host}-mobile-stress.png`);
        await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
        await until('window.visualViewport.scale >= 1.2', 'mobile zoom applied');
        assert.deepEqual((await scan()).errors, []);
        await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await setViewport({ width: 1280, height: 900, mobile: false });
        const guard = await evaluate('({ db: window.__uat4DbCalls, errors: window.__uat4Errors, unchanged: window.__uat4C1.getSnapshotsUnchanged() })');
        assert.deepEqual(guard, { db: 0, errors: [], unchanged: true });
        if (host === 'main') {
          await evaluate('window.scrollTo(0,0); window.__uat4C1.extendLondon()');
          await until('document.querySelectorAll("[data-shared-book-card]").length === 20', 'larger disposable fixture');
          await until('document.querySelector("[data-shared-notebook-unit=parallel]")');
          const pending = await evaluate('document.querySelectorAll("[data-shared-notebook-unit=pending]").length');
          assert.ok(pending > 10, 'offscreen Units remain unmeasured');
          const large = await scan();
          assert.equal(large.units, 27);
          assert.equal(large.segments, 85);
          assert.deepEqual(large.errors, []);
          assert.ok(large.fallback > 0 && large.fallback < large.units);
          console.log('MEASURE large', JSON.stringify({ ...large, initiallyPending: pending }));
        }
        if (!(await evaluate('Boolean(document.querySelector("[data-shared-appearance-reset]"))'))) {
          await select('appearance-toggle', 'true');
        }
        await select('appearance-reset', 'true');
        await until('document.querySelector("[data-shared-notebook-guides=on][data-shared-notebook-spacing=compact]")');
        assert.equal(await evaluate('document.querySelector("[data-shared-workspace-align-option=left]").getAttribute("aria-pressed")'), 'true');
        for (const language of ['id-only', 'en-only']) {
          await select('reading-language-option', language);
          assert.equal(await evaluate('document.querySelectorAll("[data-shared-notebook-unit]").length'), 0);
        }
        await waitFrames();
        assert.equal(await evaluate('document.querySelectorAll("body > .prolingo-notebook-sample").length'), 0);
        assert.deepEqual(await evaluate('window.__uat4C1.getPlaybackLog()'), []);
      });
    }
  }

  if (commandsOnly) {
    for (const host of ['uat', 'main']) {
      await run(sessionOnly
        ? `4E2 ${host}: owned Reader actions, precision, replacement and deletion`
        : `4E1 ${host}: exact Reader and Study Box actions reach the owned session`, async () => {
        await call('Page.navigate', { url: `${origin}/?host=${host}&doc=london&audit=4e1` });
        await until('window.__uat4C1');
        if (host === 'main') {
          await until('window.__uat4C1Main');
          await click('[data-main-host-reader="shared"]');
        } else {
          if (!(await evaluate('Boolean(document.querySelector("[data-shared-book-page]"))'))) await clickButtonText('Shared UI (Beta)');
          for (const [name, value] of [['Audio representation', 'full'], ['Audio channel', 'text-meaning']]) {
            await evaluate(`(() => {
              const select = document.querySelector('select[aria-label="${name}"]');
              select.value = "${value}"; select.dispatchEvent(new Event('change', { bubbles: true }));
            })()`);
          }
        }
        const ids = await evaluate('window.__uat4C1.londonIds');
        const [p1First] = ids.segmentIdsByUnitKey.P1_SC1;
        const [turnFirst, turnSecond, turnThird] = ids.segmentIdsByUnitKey.C1_T1;
        const c1 = `[data-shared-card-id="${ids.cards.C1}"]`;
        const fragment = (id, channel) => `[data-shared-card-segment="${id}"][data-shared-card-channel="${channel}"]`;
        const count = () => evaluate('window.__uat4C1.getUatEvents().length');
        const idle = host === 'main' ? 'window.__uat4C1Main.readNowPlaying().state === "idle"'
          : 'document.querySelector("[data-unified-reader]")?.dataset.readerCursorPrecision === "none"';
        const finish = () => evaluate('window.__uat4C1.finishLatestUatEvent("played")');
        const event = async (n, id, channel) => {
          await until(`window.__uat4C1.getUatEvents().length === ${n}`, 'next owned step');
          const actual = await evaluate(`(() => {
            const a = window.__uat4C1.getUatEvents().at(-1).args;
            return [a.item?.id ?? null, a.channel];
          })()`);
          assert.deepEqual(actual, [id, channel]);
        };
        const checkPlay = async (selector, steps) => {
          const initial = await count();
          await click(selector);
          for (const [index, [id, channel]] of steps.entries()) {
            await event(initial + index + 1, id, channel);
            if (host === 'main' && id) {
              const now = await evaluate('window.__uat4C1Main.readNowPlaying()');
              assert.deepEqual([now.segment.id, now.channel, now.savedRepresentation, now.commandRepresentation, now.actualRepresentation, now.representationFallback],
                [id, channel, 'full', 'split', 'split', false]);
            }
            await finish();
          }
          await until(idle, 'one-shot command finished');
          assert.equal(await count(), initial + steps.length);
        };
        const mode = value => click(`[data-shared-reader-mode-option="${value}"]`);
        const style = value => click(`[data-shared-bilingual-style-option="${value}"]`);
        await mode('full');
        await click('[data-shared-reading-language-option="en-id"]');
        await style('separated');
        await checkPlay(fragment(p1First, 'text'), [[p1First, 'text']]);
        await checkPlay(fragment(p1First, 'meaning'), [[p1First, 'meaning']]);
        await style('interlinear');
        await checkPlay(fragment(p1First, 'meaning'), [[p1First, 'meaning']]);
        await style('contextual');
        await click(`[data-shared-contextual-select="${p1First}"]`);
        await checkPlay(`[data-shared-contextual-panel] ${fragment(p1First, 'meaning')}`, [[p1First, 'meaning']]);
        await style('notebook');
        const notebook = `[data-shared-notebook-fragment]${fragment(p1First, 'meaning')}`;
        await until(`document.querySelector(${JSON.stringify(notebook)})`, 'Notebook fragment measured');
        await checkPlay(notebook, [[p1First, 'meaning']]);
        await mode('card');
        await style('interlinear');
        await checkPlay(`${c1} ${fragment(turnFirst, 'text')}`, [[turnFirst, 'text']]);
        await mode('focus');
        await click('[data-shared-focus-orientation-option="horizontal-focus"]');
        await checkPlay(`${c1} [data-shared-part-active="true"] ${fragment(turnFirst, 'meaning')}`, [[turnFirst, 'meaning']]);
        await checkPlay(`${c1} [data-shared-part-active="true"] [data-shared-unit-play]`,
          ids.segmentIdsByUnitKey.C1_T1.flatMap(id => [[id, 'text'], [id, 'meaning']]));

        await mode('segment');
        await style('interlinear');
        const beforeSelect = await count();
        await click(`${c1} [data-shared-segment-context] ${fragment(turnSecond, 'meaning')}`);
        await until(`document.querySelector('[data-shared-segment-study-box][data-shared-segment-focus="${turnSecond}"]')`);
        assert.equal(await count(), beforeSelect);
        const box = action => `${c1} [data-study-box-action="${action}"]`;
        await checkPlay(box('play-en'), [[turnSecond, 'text']]);
        await checkPlay(box('play-id'), [[turnSecond, 'meaning']]);
        await checkPlay(box('play-segment'), [[turnSecond, 'text'], [turnSecond, 'meaning']]);
        const boundary = `${c1} [data-study-box-continue-scope]`;
        assert.equal(await evaluate(`document.querySelector(${JSON.stringify(boundary)}).value`), 'card');
        const pickBoundary = value => evaluate(`(() => {
          const select = document.querySelector(${JSON.stringify(boundary)});
          select.value = "${value}"; select.dispatchEvent(new Event('change', { bubbles:true }));
        })()`);
        await pickBoundary('unit');
        await checkPlay(box('play-continue'), [[turnSecond, 'text'], [turnSecond, 'meaning'], [turnThird, 'text'], [turnThird, 'meaning']]);
        for (const value of ['card', 'document']) {
          await pickBoundary(value);
          const initial = await count();
          await click(box('play-continue'));
          await event(initial + 1, turnSecond, 'text');
          if (host === 'main') {
            const now = await evaluate('window.__uat4C1Main.readNowPlaying()');
            assert.deepEqual([now.scope, now.boundary, now.commandRepresentation, now.representationFallback],
              ['from-here', value, 'split', false]);
            await evaluate('window.__uat4C1Main.stopPlayback()');
          } else {
            await clickButtonText('Stop');
          }
          await finish();
          await until(idle, 'bounded continuation stopped');
          assert.equal(await count(), initial + 1);
        }
        if (host === 'uat') {
          assert.deepEqual(await evaluate(`['Audio representation','Audio channel'].map(name => document.querySelector('select[aria-label="'+name+'"]').value)`),
            ['full', 'text-meaning']);
        }
        if (sessionOnly) {
          const action = (target, value) => until(`document.querySelector(${JSON.stringify(target)})?.dataset.readerPlaybackAction === '${value}'`);
          const stopEn = box('play-en');
          const stopId = box('play-id');
          const initial = await count();
          await click(stopEn);
          await event(initial + 1, turnSecond, 'text');
          await action(stopEn, 'stop');
          await action(stopId, 'play');
          if (host === 'main') await evaluate('window.__uat4C1Main.pausePlayback()');
          else await clickButtonText('Pause');
          await until(`document.querySelector('[data-shared-segment-paused="true"][data-shared-card-channel="text"][data-shared-card-segment="${turnSecond}"]')`, 'paused English only');
          assert.equal(await evaluate('document.querySelectorAll(\'[data-shared-segment-paused="true"][data-shared-card-channel="meaning"]\').length'), 0);
          if (host === 'main') await evaluate('window.__uat4C1Main.resumePlayback()');
          else await clickButtonText('Resume');
          await action(stopEn, 'stop');
          assert.equal(await count(), initial + 1);
          await click(stopId);
          await event(initial + 2, turnSecond, 'meaning');
          await evaluate(`window.__uat4C1.finishUatEvent(${initial}, 'error')`);
          await action(stopId, 'stop');
          await action(stopEn, 'play');
          await click(stopId);
          await finish();
          await until(idle, 'matching exact control stopped');
          assert.equal(await count(), initial + 2);

          await pickBoundary('unit');
          await click(box('play-continue'));
          await event(initial + 3, turnSecond, 'text');
          await action(box('play-continue'), 'stop');
          await finish();
          await event(initial + 4, turnSecond, 'meaning');
          await finish();
          await event(initial + 5, turnThird, 'text');
          await action(box('play-continue'), 'stop');
          const studyFocus = id => until(`document.querySelector(${JSON.stringify(`${c1} [data-shared-segment-study-box][data-shared-segment-focus="${id}"]`)})`);
          await studyFocus(turnSecond);
          await click(`${c1} [data-study-box-local-segment="1"]`);
          await studyFocus(turnFirst);
          assert.equal(await count(), initial + 5, 'local Study Box selection is passive');
          await action(box('play-continue'), 'play');
          await click(`${c1} [data-study-box-return-to-playing="true"]`);
          await studyFocus(turnThird);
          await action(box('play-continue'), 'stop');
          await click(box('play-continue'));
          await finish();
          await until(idle, 'originating continuous control stopped after advancement');
          assert.equal(await count(), initial + 5);

          await mode('full');
          await style('notebook');
          await until(`document.querySelector(${JSON.stringify(notebook)})`, 'Notebook fragment ready');
          await click(notebook);
          await event(initial + 6, p1First, 'meaning');
          await action(notebook, 'stop');
          await action(`[data-shared-notebook-fragment]${fragment(p1First, 'text')}`, 'play');
          await style('interlinear');
          await action(fragment(p1First, 'meaning'), 'stop');
          assert.equal(await count(), initial + 6, 'passive style switch keeps the owned command');
          await clickButtonText(host === 'main' ? 'Play All' : 'Play Workspace');
          await event(initial + 7, null, 'text');
          await until(`document.querySelector('[data-shared-card-id="${ids.cards.P1}"][data-shared-card-precision="card"]')`, 'untimed Full Card precision');
          assert.equal(await evaluate('document.querySelectorAll(\'[data-text-player-segment-active="true"]\').length'), 0);
          await clickButtonText(host === 'main' ? 'Stop All' : 'Stop Workspace');
          await finish();
          await until(idle, 'matching Workspace command stopped');

          await click(fragment(p1First, 'text'));
          await event(initial + 8, p1First, 'text');
          const cancelCount = await evaluate('window.__uat4C1.getUatCancels()');
          await evaluate(`window.__uat4C1.deleteDisposableSegment(${JSON.stringify(p1First)})`);
          await until(`window.__uat4C1.getUatCancels() > ${cancelCount}`, 'deleting active content cancelled execution');
          await finish();
          await until(idle, 'deleted Segment has no active projection');
          assert.equal(await count(), initial + 8);

          await click(fragment(turnFirst, 'text'));
          await event(initial + 9, turnFirst, 'text');
          const unmountCancelCount = await evaluate('window.__uat4C1.getUatCancels()');
          await evaluate('window.__uat4C1.setWorkspace("stress")');
          await until(`window.__uat4C1.getUatCancels() > ${unmountCancelCount}`, 'Workspace replacement cancelled old execution');
          await finish();
          await until(idle, 'replacement Workspace has no old active projection');
          assert.equal(await count(), initial + 9);
        }
        const guard = await evaluate('({ db: window.__uat4DbCalls, errors: window.__uat4Errors, unchanged: window.__uat4C1.getSnapshotsUnchanged() })');
        assert.deepEqual(guard, { db: 0, errors: [], unchanged: true });
      });
    }
  }

  if (!notebookLayoutOnly && !notebookOnly && !commandsOnly) {
  // ---------------------------------------------------------------------------
  // 1. Fresh-reader EN Only default, NO Notebook exposed, Legacy compatibility
  // ---------------------------------------------------------------------------
  await run('4C1-1: Fresh reader defaults to EN Only, keeps Notebook opt-in, and preserves legacy saved preferences', async () => {
    await clickButtonText('Shared UI (Beta)');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Book Page rendered');
    await waitFrames();

    const fresh = await evaluate(`(() => {
      const toolbar = document.querySelector('[data-shared-card-bilingual-toolbar]');
      const book = document.querySelector('[data-shared-book-page="true"]');
      const styleOptions = [...document.querySelectorAll('[data-shared-bilingual-style-option]')].map(b => b.dataset.sharedBilingualStyleOption);
      const langOptions = [...document.querySelectorAll('[data-shared-reading-language-option]')].map(b => b.dataset.sharedReadingLanguageOption);
      const enSegs = [...book.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(e => e.dataset.sharedCardSegment);
      const idSegs = [...book.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')];
      return {
        readingLanguage: toolbar.dataset.sharedReadingLanguage,
        effectiveStyle: toolbar.dataset.sharedBilingualStyleEffective,
        langOptions,
        styleOptions,
        notebookInactive: toolbar.querySelector('[data-shared-bilingual-style-option="notebook"]')?.getAttribute('aria-pressed') === 'false'
          && !document.querySelector('[data-shared-notebook-unit]'),
        enExact37: JSON.stringify(enSegs) === JSON.stringify(window.__uat4C1.londonIds.segmentIds),
        idCount: idSegs.length,
        zeroPlayback: window.__uat4C1.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(fresh.readingLanguage, 'en-only', 'Fresh reader default must be EN Only');
    assert.equal(fresh.effectiveStyle, 'single');
    assert.deepEqual(fresh.langOptions, ['en-only', 'id-only', 'en-id', 'id-en']);
    assert.deepEqual(fresh.styleOptions, ['separated', 'interlinear', 'notebook', 'contextual']);
    assert.equal(fresh.notebookInactive, true);
    assert.equal(fresh.enExact37, true);
    assert.equal(fresh.idCount, 0);
    assert.equal(fresh.zeroPlayback, true);

    // Legacy compatibility: seed old v1 preference with ONLY bilingualLayout='separated' and reload -> preserves EN-ID Separated!
    await evaluate(`localStorage.setItem(window.__uat4C1.UAT_STORAGE_KEY, JSON.stringify({
      version: 1,
      reader: 'shared',
      readerMode: 'full',
      cardVisibility: 'all',
      view: { level: 'full', bilingualLayout: 'separated', partLayout: 'vertical-list' }
    }))`);
    const prevOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevOrigin} && document.querySelector("[data-shared-card-separated=true]")`, 'Legacy separated restored');
    const legacyRestored = await evaluate(`(() => {
      const tb = document.querySelector('[data-shared-card-bilingual-toolbar]');
      return { lang: tb.dataset.sharedReadingLanguage, savedStyle: tb.dataset.sharedBilingualStyleSaved, effStyle: tb.dataset.sharedBilingualStyleEffective };
    })()`);
    assert.equal(legacyRestored.lang, 'en-id', 'Legacy separated preference must never be overwritten with EN Only');
    assert.equal(legacyRestored.savedStyle, 'separated');
    assert.equal(legacyRestored.effStyle, 'separated');
  });

  // ---------------------------------------------------------------------------
  // 2. Per-Unit Separated (EN–ID & ID–EN) — single speaker attribution per Turn
  // ---------------------------------------------------------------------------
  await run('4C1-2: Per-Unit Separated renders primary->secondary inside EACH authored Unit without repeating speaker names, and supports ID-EN reversal', async () => {
    const perUnitEnId = await evaluate(`(() => {
      const p1Id = window.__uat4C1.londonIds.cards.P1;
      const c1Id = window.__uat4C1.londonIds.cards.C1;
      const p1 = document.querySelector('[data-shared-book-card="' + p1Id + '"]');
      const c1 = document.querySelector('[data-shared-book-card="' + c1Id + '"]');
      const p1Units = [...p1.querySelectorAll('[data-shared-unit-separated]')];
      const p1UnitChannelSequence = p1Units.map(u => [...u.querySelectorAll('[data-shared-reading-body="true"]')].map(b => b.dataset.sharedReadingChannel));
      const c1Turns = [...c1.querySelectorAll('[data-shared-unit-kind="turn"]')];
      const c1SpeakerCounts = c1Turns.map(t => t.querySelectorAll('[data-shared-turn-speaker]').length);
      const c1AlignedGrids = c1.querySelectorAll('[data-shared-turn-aligned-grid]').length;
      const allEn = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(e => e.dataset.sharedCardSegment);
      const allId = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')].map(e => e.dataset.sharedCardSegment);
      return {
        p1UnitCount: p1Units.length,
        p1UnitChannelSequence,
        c1TurnCount: c1Turns.length,
        c1SpeakerOncePerTurn: c1SpeakerCounts.every(n => n === 1),
        c1AlignedGrids,
        enExact37: JSON.stringify(allEn) === JSON.stringify(window.__uat4C1.londonIds.segmentIds),
        idExact37: JSON.stringify(allId) === JSON.stringify(window.__uat4C1.londonIds.segmentIds)
      };
    })()`);
    assert.equal(perUnitEnId.p1UnitCount, 2);
    assert.deepEqual(perUnitEnId.p1UnitChannelSequence, [['text', 'meaning'], ['text', 'meaning']], 'Each Section must render EN then ID within itself');
    assert.equal(perUnitEnId.c1TurnCount, 4);
    assert.equal(perUnitEnId.c1SpeakerOncePerTurn, true, 'Speaker name must NOT repeat for both channels in Separated');
    assert.equal(perUnitEnId.c1AlignedGrids, 4, 'Exactly one aligned grid per Turn (4 for C1)');
    assert.equal(perUnitEnId.enExact37, true);
    assert.equal(perUnitEnId.idExact37, true);
    await captureFullPage('01-full-book-per-unit-separated-en-id.png');

    // Reverse reading order to ID–EN -> primary ID then secondary EN within each Unit; Inline speakers still once per Turn!
    await click('[data-shared-reading-language-option="id-en"]');
    await click('[data-shared-workspace-speaker-option="inline"]');
    await waitFrames();
    const reversedCheck = await evaluate(`(() => {
      const p1Id = window.__uat4C1.londonIds.cards.P1;
      const c1Id = window.__uat4C1.londonIds.cards.C1;
      const p1Units = [...document.querySelectorAll('[data-shared-book-card="' + p1Id + '"] [data-shared-unit-separated]')];
      const c1Turns = [...document.querySelectorAll('[data-shared-book-card="' + c1Id + '"] [data-shared-unit-kind="turn"]')];
      return {
        p1Channels: p1Units.map(u => [...u.querySelectorAll('[data-shared-reading-body="true"]')].map(b => b.dataset.sharedReadingChannel)),
        c1SpeakerOnceInline: c1Turns.every(t => t.querySelectorAll('[data-shared-turn-speaker]').length === 1),
        c1Channels: c1Turns.map(t => [...t.querySelectorAll('[data-shared-reading-body="true"]')].map(b => b.dataset.sharedReadingChannel))
      };
    })()`);
    assert.deepEqual(reversedCheck.p1Channels, [['meaning', 'text'], ['meaning', 'text']]);
    assert.equal(reversedCheck.c1SpeakerOnceInline, true, 'Inline speaker attribution must appear ONCE per Turn in Separated');
    assert.deepEqual(reversedCheck.c1Channels, [['meaning', 'text'], ['meaning', 'text'], ['meaning', 'text'], ['meaning', 'text']]);
    await captureElement(`[data-shared-book-card="${await evaluate('window.__uat4C1.londonIds.cards.C1')}"]`, '02-separated-id-en-inline-speaker-c1.png');

    // Restore Aligned speaker default
    await click('[data-shared-workspace-speaker-option="aligned"]');
  });

  // ---------------------------------------------------------------------------
  // 3. Sentence Interlinear (EN–ID & ID–EN)
  // ---------------------------------------------------------------------------
  await run('4C1-3: Sentence Interlinear pairs primary directly above secondary in EN-ID and ID-EN without repeating speaker names', async () => {
    await click('[data-shared-bilingual-style-option="interlinear"]');
    await waitFrames();
    const idEnInterlinear = await evaluate(`(() => {
      const c1Id = window.__uat4C1.londonIds.cards.C1;
      const c1 = document.querySelector('[data-shared-book-card="' + c1Id + '"]');
      const rows = [...c1.querySelectorAll('[data-shared-interlinear-segment]')];
      const firstRowChannels = [...rows[0].querySelectorAll('[data-shared-reading-body="true"]')].map(b => b.dataset.sharedReadingChannel);
      const turns = [...c1.querySelectorAll('[data-shared-unit-kind="turn"]')];
      return {
        rowCount: rows.length,
        firstRowChannels,
        speakerOncePerTurn: turns.every(t => t.querySelectorAll('[data-shared-turn-speaker]').length === 1)
      };
    })()`);
    assert.equal(idEnInterlinear.rowCount, 12);
    assert.deepEqual(idEnInterlinear.firstRowChannels, ['meaning', 'text']);
    assert.equal(idEnInterlinear.speakerOncePerTurn, true);

    await click('[data-shared-reading-language-option="en-id"]');
    await waitFrames();
    const enIdFirstRow = await evaluate(`(() => {
      const row = document.querySelector('[data-shared-interlinear-segment]');
      return [...row.querySelectorAll('[data-shared-reading-body="true"]')].map(b => b.dataset.sharedReadingChannel);
    })()`);
    assert.deepEqual(enIdFirstRow, ['text', 'meaning']);
    await captureElement(`[data-shared-book-card="${await evaluate('window.__uat4C1.londonIds.cards.C1')}"]`, '03-sentence-interlinear-en-id-c1.png');
  });

  // ---------------------------------------------------------------------------
  // 4. Contextual Translation (Above / Below / Inline), single Workspace target,
  //    select-only affordance (0 audio calls), no scroll/selection stealing
  // ---------------------------------------------------------------------------
  await run('4C1-4: Contextual keeps all primary visible, maintains ONE Workspace target across Full/Card/Focus, supports Above/Below/Inline with zero audio hijacking or scroll jumps', async () => {
    await evaluate('window.__uat4C1.clearPlaybackLog()');
    await click('[data-shared-bilingual-style-option="contextual"]');
    await waitFrames();

    const p1Sc1Sg2 = await evaluate('window.__uat4C1.londonIds.segmentIdsByUnitKey.P1_SC1[1]');
    const c1T2Sg3 = await evaluate('window.__uat4C1.londonIds.segmentIdsByUnitKey.C1_T2[2]');

    // Initially idle with no manual target -> 0 panels fabricated, all 37 primary segments visible
    assert.equal(await evaluate('document.querySelectorAll("[data-shared-contextual-panel]").length'), 0);
    assert.equal(await evaluate('document.querySelectorAll("[data-shared-card-segment][data-shared-card-channel=text]").length'), 37);

    // Select P1 SC1 SG2 via select-only icon -> exactly 1 panel, 0 playback calls, stable scrollY
    const scrollBefore = await evaluate('window.scrollY');
    await click(`[data-shared-contextual-select="${p1Sc1Sg2}"]`);
    await waitFrames();
    const afterFirstSelect = await evaluate(`(() => {
      const panels = [...document.querySelectorAll('[data-shared-contextual-panel]')];
      const unit = document.querySelector('[data-shared-unit-id="' + window.__uat4C1.londonIds.units.P1_SC1 + '"]');
      const primaryRect = unit.querySelector('[data-shared-reading-role="primary"]').getBoundingClientRect();
      const panelRect = panels[0].getBoundingClientRect();
      return {
        panelCount: panels.length,
        placement: panels[0].dataset.sharedContextualPanel,
        segmentId: panels[0].dataset.sharedContextualSegment,
        belowPrimary: panelRect.top >= primaryRect.bottom - 4,
        primaryCount: document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]').length,
        scrollDelta: Math.abs(window.scrollY - ${scrollBefore}),
        playbackCalls: window.__uat4C1.getPlaybackLog().length
      };
    })()`);
    assert.equal(afterFirstSelect.panelCount, 1);
    assert.equal(afterFirstSelect.placement, 'below');
    assert.equal(afterFirstSelect.segmentId, p1Sc1Sg2);
    assert.equal(afterFirstSelect.belowPrimary, true);
    assert.equal(afterFirstSelect.primaryCount, 37, 'Contextual must never hide primary text');
    assert.ok(afterFirstSelect.scrollDelta <= 2, 'Contextual reflow must not auto-scroll');
    assert.equal(afterFirstSelect.playbackCalls, 0, 'Select-only affordance must never trigger audio playback');
    await captureElement(`[data-shared-book-card="${await evaluate('window.__uat4C1.londonIds.cards.P1')}"]`, '04-contextual-below-p1.png');

    // Switch placement to Above -> panel moves ABOVE primary body with zero overlap
    await click('[data-shared-contextual-placement-option="above"]');
    await waitFrames();
    const aboveCheck = await evaluate(`(() => {
      const panel = document.querySelector('[data-shared-contextual-panel="above"]');
      const unit = document.querySelector('[data-shared-unit-id="' + window.__uat4C1.londonIds.units.P1_SC1 + '"]');
      const primaryRect = unit.querySelector('[data-shared-reading-role="primary"]').getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        exists: Boolean(panel),
        abovePrimary: panelRect.bottom <= primaryRect.top + 4,
        segmentId: panel.dataset.sharedContextualSegment
      };
    })()`);
    assert.equal(aboveCheck.exists, true);
    assert.equal(aboveCheck.abovePrimary, true);
    assert.equal(aboveCheck.segmentId, p1Sc1Sg2);

    // Switch to Card Mode (4 open Cards) -> select C1 T2 SG3 -> ONLY ONE Contextual panel across all 4 open Cards!
    await click('[data-shared-reader-mode-option="card"]');
    await until('document.querySelectorAll("[data-shared-card-expanded=true]").length === 4', '4 Cards expanded');
    await click('[data-shared-contextual-placement-option="inline"]');
    await click(`[data-shared-contextual-select="${c1T2Sg3}"]`);
    await waitFrames();
    const inlineCardCheck = await evaluate(`(() => {
      const panels = [...document.querySelectorAll('[data-shared-contextual-panel]')];
      return {
        panelCount: panels.length,
        placement: panels[0]?.dataset.sharedContextualPanel,
        segmentId: panels[0]?.dataset.sharedContextualSegment,
        playbackCalls: window.__uat4C1.getPlaybackLog().length
      };
    })()`);
    assert.equal(inlineCardCheck.panelCount, 1, 'Exactly ONE active Contextual target across all 4 open Cards');
    assert.equal(inlineCardCheck.placement, 'inline');
    assert.equal(inlineCardCheck.segmentId, c1T2Sg3);
    assert.equal(inlineCardCheck.playbackCalls, 0);
    await captureElement(`[data-shared-card-id="${await evaluate('window.__uat4C1.londonIds.cards.C1')}"]`, '05-card-mode-contextual-inline-c1.png');

    // Switch to Focus Horizontal -> Swiper autoHeight adapts cleanly with Contextual panel active!
    await click('[data-shared-reader-mode-option="focus"]');
    await until('document.querySelector("[data-shared-focus-view=true]")', 'Focus view');
    await click('[data-shared-focus-orientation-option="horizontal-focus"]');
    await click('[data-shared-contextual-placement-option="above"]');
    await waitFrames();
    const focusCtxCheck = await evaluate(`(() => {
      const c1Id = window.__uat4C1.londonIds.cards.C1;
      const c1 = document.querySelector('[data-shared-card-id="' + c1Id + '"]');
      const activeSlide = c1.querySelector('[data-shared-part-active="true"]');
      const panel = c1.querySelector('[data-shared-contextual-panel="above"]');
      const wrapper = c1.querySelector('.swiper-wrapper');
      return {
        panelCount: document.querySelectorAll('[data-shared-contextual-panel]').length,
        inActiveSlide: Boolean(activeSlide && panel && activeSlide.contains(panel)),
        noClip: wrapper ? wrapper.getBoundingClientRect().height >= activeSlide.getBoundingClientRect().height - 4 : false,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()`);
    assert.equal(focusCtxCheck.panelCount, 1);
    assert.equal(focusCtxCheck.inActiveSlide, true);
    assert.equal(focusCtxCheck.noClip, true, 'Focus Horizontal Swiper autoHeight must not clip Contextual translation');
    assert.equal(focusCtxCheck.noOverflow, true);
    await captureElement(`[data-shared-card-id="${await evaluate('window.__uat4C1.londonIds.cards.C1')}"]`, '06-focus-horizontal-contextual-above-c1.png');
  });

  // ---------------------------------------------------------------------------
  // 5. Mode capability rules & non-destructive fallback in Segment Mode
  // ---------------------------------------------------------------------------
  await run('4C1-5: Segment Mode disables Separated & Contextual with non-destructive fallback, supports optional Sentence Interlinear, and keeps exactly 4 Study Boxes', async () => {
    // Enter Segment Mode while saved style is Contextual (Above)
    await click('[data-shared-reader-mode-option="segment"]');
    await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', '4 Study Boxes in Segment Mode');
    await waitFrames();

    const segFallback = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4C1.UAT_STORAGE_KEY));
      return {
        studyBoxes: document.querySelectorAll('[data-shared-segment-study-box]').length,
        contextualPanels: document.querySelectorAll('[data-shared-contextual-panel]').length,
        sepDisabled: document.querySelector('[data-shared-bilingual-style-option="separated"]').disabled,
        ctxDisabled: document.querySelector('[data-shared-bilingual-style-option="contextual"]').disabled,
        interlinearDisabled: document.querySelector('[data-shared-bilingual-style-option="interlinear"]').disabled,
        hasFallbackNotice: Boolean(document.querySelector('[data-shared-bilingual-fallback-notice="true"]')),
        ctxPlacementBarCount: document.querySelectorAll('[data-shared-contextual-placement-bar]').length,
        contextStyle: document.querySelector('[data-shared-segment-context]').dataset.sharedSegmentContextStyle,
        savedBilingualStyle: saved.view.bilingualStyle,
        savedPlacement: saved.view.contextualPlacement
      };
    })()`);
    assert.equal(segFallback.studyBoxes, 4);
    assert.equal(segFallback.contextualPanels, 0, 'No extra Contextual panel in Segment Mode');
    assert.equal(segFallback.sepDisabled, true);
    assert.equal(segFallback.ctxDisabled, true);
    assert.equal(segFallback.interlinearDisabled, false);
    assert.equal(segFallback.hasFallbackNotice, true);
    assert.equal(segFallback.ctxPlacementBarCount, 0);
    assert.equal(segFallback.contextStyle, 'single');
    assert.equal(segFallback.savedBilingualStyle, 'contextual', 'Segment fallback must NOT overwrite saved Contextual preference');
    assert.equal(segFallback.savedPlacement, 'above');

    // Return to Full Mode -> Contextual (Above) restores automatically!
    await click('[data-shared-reader-mode-option="full"]');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Returned to Full');
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-card-bilingual-toolbar]").dataset.sharedBilingualStyleEffective'), 'contextual');
    assert.equal(await evaluate('Boolean(document.querySelector("[data-shared-contextual-panel=above]"))'), true);

    // Back to Segment Mode -> opt into optional Sentence Interlinear context above 4 Study Boxes
    await click('[data-shared-reader-mode-option="segment"]');
    await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Back in Segment');
    await click('[data-shared-bilingual-style-option="interlinear"]');
    await waitFrames();
    const segInterlinear = await evaluate(`(() => ({
      studyBoxes: document.querySelectorAll('[data-shared-segment-study-box]').length,
      contextStyle: document.querySelector('[data-shared-segment-context]').dataset.sharedSegmentContextStyle,
      interlinearRows: document.querySelectorAll('[data-shared-segment-context] [data-shared-interlinear-segment]').length
    }))()`);
    assert.equal(segInterlinear.studyBoxes, 4);
    assert.equal(segInterlinear.contextStyle, 'interlinear');
    assert.equal(segInterlinear.interlinearRows, 37);
    await captureElement(`[data-shared-card-id="${await evaluate('window.__uat4C1.londonIds.cards.P1')}"]`, '07-segment-optional-interlinear-study-box-p1.png');
  });

  // ---------------------------------------------------------------------------
  // 6. All 6 Independent Appearance / Typography Controls + Independent Resets
  //    + Reload Persistence + Stress Fixture + 390px Mobile + Dark Theme
  // ---------------------------------------------------------------------------
  await run('4C1-6: All 6 independent Typography controls apply cleanly, Reset Appearance stays isolated from Workspace Style, and 390px mobile + Stress + Dark Theme have zero overflow', async () => {
    await click('[data-shared-reader-mode-option="full"]');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Full mode for typography test');
    await click('[data-shared-bilingual-style-option="separated"]');
    await click('[data-shared-workspace-align-option="left"]');
    await click('[data-shared-appearance-toggle="true"]');
    await until('document.querySelector("[data-shared-appearance-panel=true]")', 'Appearance panel open');

    const beforeTypo = await evaluate(`(() => {
      const p = document.querySelector('[data-shared-reading-role="primary"]');
      const s = document.querySelector('[data-shared-reading-role="secondary"]');
      const ps = getComputedStyle(p);
      const ss = getComputedStyle(s);
      return {
        primaryPx: parseFloat(ps.fontSize),
        secondaryPx: parseFloat(ss.fontSize),
        lineHeightRatio: parseFloat(ps.lineHeight) / parseFloat(ps.fontSize),
        resetDisabled: document.querySelector('[data-shared-appearance-reset="true"]').disabled
      };
    })()`);
    assert.equal(beforeTypo.resetDisabled, true);

    // Adjust all 6 independent controls
    await click('[data-shared-appearance-primary-size="xl"]');
    await click('[data-shared-appearance-secondary-size="lg"]');
    await click('[data-shared-appearance-font-family="serif"]');
    await click('[data-shared-appearance-line-height="loose"]');
    await click('[data-shared-appearance-contrast="high"]');
    await click('[data-shared-appearance-spacing="relaxed"]');
    await waitFrames();

    const afterTypo = await evaluate(`(() => {
      const p = document.querySelector('[data-shared-reading-role="primary"]');
      const s = document.querySelector('[data-shared-reading-role="secondary"]');
      const ps = getComputedStyle(p);
      const ss = getComputedStyle(s);
      return {
        primaryPx: parseFloat(ps.fontSize),
        secondaryPx: parseFloat(ss.fontSize),
        fontFamily: ps.fontFamily,
        lineHeightRatio: parseFloat(ps.lineHeight) / parseFloat(ps.fontSize),
        letterSpacing: parseFloat(ps.letterSpacing) || 0,
        highContrastClass: s.className.includes('text-slate-900'),
        resetDisabled: document.querySelector('[data-shared-appearance-reset="true"]').disabled
      };
    })()`);
    assert.ok(afterTypo.primaryPx > beforeTypo.primaryPx + 2, 'Primary font size xl must increase independently');
    assert.ok(afterTypo.secondaryPx > beforeTypo.secondaryPx + 2, 'Secondary font size lg must increase independently');
    assert.ok(afterTypo.fontFamily.toLowerCase().includes('georgia'), 'Serif font family must apply');
    assert.ok(afterTypo.lineHeightRatio >= 1.95, 'Loose line height (~2.0) must apply');
    assert.ok(afterTypo.letterSpacing > 0, 'Relaxed text spacing must apply');
    assert.equal(afterTypo.highContrastClass, true);
    assert.equal(afterTypo.resetDisabled, false);
    await captureFullPage('08-typography-serif-xl-relaxed-panel-open.png');

    // Reload -> verify all 6 appearance fields + readingLanguage + bilingualStyle persist
    const prevOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevOrigin} && document.querySelector("[data-shared-book-page=true]")`, 'Reloaded typography state');
    const persistedTypo = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4C1.UAT_STORAGE_KEY));
      const p = document.querySelector('[data-shared-reading-role="primary"]');
      return {
        appearance: saved.view.appearance,
        align: saved.workspaceStyle.textAlign,
        fontFamily: getComputedStyle(p).fontFamily
      };
    })()`);
    assert.deepEqual(persistedTypo.appearance, {
      primaryFontSize: 'xl',
      secondaryFontSize: 'lg',
      fontFamily: 'serif',
      lineHeight: 'loose',
      translationContrast: 'high',
      textSpacing: 'relaxed',
      notebookSpacing: 'compact',
      notebookGuideLines: true
    });
    assert.equal(persistedTypo.align, 'left');
    assert.ok(persistedTypo.fontFamily.toLowerCase().includes('georgia'));

    // Reset Appearance -> restores ONLY the 6 Typography fields, preserving Workspace Style (left) and Bilingual Style (separated)!
    await click('[data-shared-appearance-toggle="true"]');
    await click('[data-shared-appearance-reset="true"]');
    await waitFrames();
    const afterResetApp = await evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem(window.__uat4C1.UAT_STORAGE_KEY));
      return {
        appearance: saved.view.appearance,
        align: saved.workspaceStyle.textAlign,
        bilingualStyle: saved.view.bilingualStyle,
        readingLanguage: saved.view.readingLanguage,
        resetDisabled: document.querySelector('[data-shared-appearance-reset="true"]').disabled
      };
    })()`);
    assert.equal(afterResetApp.appearance.primaryFontSize, 'md');
    assert.equal(afterResetApp.appearance.fontFamily, 'sans');
    assert.equal(afterResetApp.align, 'left', 'Reset Appearance must NEVER reset Workspace Style');
    assert.equal(afterResetApp.bilingualStyle, 'separated', 'Reset Appearance must NEVER reset Bilingual Style');
    assert.equal(afterResetApp.readingLanguage, 'en-id');
    assert.equal(afterResetApp.resetDisabled, true);

    // Restore Justify, test 390px mobile + Dark Theme + Complete Stress Fixture (joinAfter="none", joinAfter="line", Title, Empty Units)
    await click('[data-shared-workspace-align-option="justify"]');
    await click('[data-shared-appearance-primary-size="lg"]');
    await click('[data-shared-appearance-toggle="true"]');
    await click('[data-shared-bilingual-style-option="contextual"]');
    await evaluate('window.__uat4C1.setWorkspace("stress")');
    await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__uat4C1.stressIds.documentId', 'Stress fixture loaded');
    await setViewport({ width: 390, height: 844, mobile: true });
    await evaluate('window.__uat4C1.setDark(true)');
    await waitFrames();

    const stressMobileCheck = await evaluate(`(() => {
      const bodyText = document.querySelector('[data-shared-book-page="true"]').textContent;
      const titleBody = document.querySelector('[data-shared-reading-kind="title"]');
      return {
        joinNoneIntact: bodyText.includes('Platform 4—direct express service—departed promptly'),
        hasLineBreak: Boolean(document.querySelector('[data-shared-book-page="true"] br')),
        emptyUnitsSafe: document.querySelectorAll('[data-shared-unit-empty]').length === 2,
        titleNotIndented: parseFloat(getComputedStyle(titleBody).textIndent) === 0,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()`);
    assert.equal(stressMobileCheck.joinNoneIntact, true, 'joinAfter=none must stay intact even with Contextual select icons');
    assert.equal(stressMobileCheck.hasLineBreak, true);
    assert.equal(stressMobileCheck.emptyUnitsSafe, true);
    assert.equal(stressMobileCheck.titleNotIndented, true);
    assert.equal(stressMobileCheck.noOverflow, true, '390px mobile dark justified lg must have ZERO horizontal overflow');
    await captureFullPage('09-mobile-390-dark-stress-contextual.png');

    await evaluate('window.__uat4C1.setDark(false)');
    await setViewport({ width: 1280, height: 900, mobile: false });
  });

  // ---------------------------------------------------------------------------
  // 7. Main App Host (TextStructuredPlayer): Full Book + Card Contextual
  //    manual-follow > 1,800ms, transient Search restore, Return to Playing,
  //    untimed Full Audio honesty, and zero playback callback hijacking!
  // ---------------------------------------------------------------------------
  await run('4C1-7: Main App host wires Full Book & Card Contextual to shared selection store (>1800ms manual hold, Search restore, Return to Playing, Full Audio honesty)', async () => {
    await call('Page.navigate', { url: `${origin}/?host=main&doc=london` });
    await until('window.__uat4C1Main && document.querySelector("[data-main-app-host-harness]")', 'Main App host mounted');
    await evaluate('window.__uat4C1.clearPlaybackLog()');

    await click('[data-main-host-reader="shared"]');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Main App Full Book rendered');
    await click('[data-shared-bilingual-style-option="contextual"]');
    await waitFrames();

    const ids = await evaluate('window.__uat4C1.londonIds');
    const p1Id = ids.cards.P1;
    const c1Id = ids.cards.C1;
    const c2Id = ids.cards.C2;
    const p1Sc2Sg3 = ids.segmentIdsByUnitKey.P1_SC2[2];
    const c1T1Sg1 = ids.segmentIdsByUnitKey.C1_T1[0];
    const c1T2Sg2 = ids.segmentIdsByUnitKey.C1_T2[1];
    const c2T3Sg1 = ids.segmentIdsByUnitKey.C2_T3[0];

    // 1. Untimed Full Audio (precision='card') -> ZERO fabricated Contextual segment!
    await evaluate(`window.__uat4C1Main.setActivePlayback({ cardId: ${JSON.stringify(c1Id)}, precision: 'card', segmentId: null, state: 'playing', channel: 'text', sessionId: 301 })`);
    await waitFrames();
    assert.equal(await evaluate('document.querySelectorAll("[data-shared-contextual-panel]").length'), 0, 'Untimed Full Audio must never fabricate Contextual segment');
    assert.equal(await evaluate('Boolean(document.querySelector("[data-shared-contextual-full-audio-notice=true]"))'), true);

    // 2. Start Split playback on C1 T1 SG1 -> Contextual follows audible Segment automatically
    await evaluate(`window.__uat4C1Main.setActivePlayback({ cardId: ${JSON.stringify(c1Id)}, unitId: ${JSON.stringify(ids.units.C1_T1)}, precision: 'segment', segmentId: ${JSON.stringify(c1T1Sg1)}, state: 'playing', channel: 'text', sessionId: 302 })`);
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSegment'), c1T1Sg1);
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSource'), 'audible');

    // 3. Manually select P1 SC2 SG3 via select-only icon -> 0 playback calls; wait > 1,900 ms & advance playback to C1 T2 SG2 -> manual target HELD!
    await click(`[data-shared-contextual-select="${p1Sc2Sg3}"]`);
    await waitFrames();
    assert.equal(await evaluate('window.__uat4C1.getPlaybackLog().length'), 0);
    await sleep(1950);
    await evaluate(`window.__uat4C1Main.setActivePlayback({ cardId: ${JSON.stringify(c1Id)}, unitId: ${JSON.stringify(ids.units.C1_T2)}, precision: 'segment', segmentId: ${JSON.stringify(c1T2Sg2)}, state: 'playing', channel: 'text', sessionId: 302 })`);
    await waitFrames();
    assert.equal(
      await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSegment'),
      p1Sc2Sg3,
      'Explicit manual Contextual target must NOT be stolen by advancing playback even after >1,800ms'
    );
    assert.equal(await evaluate('Boolean(document.querySelector("[data-shared-contextual-return-to-playing=true]"))'), true);

    // 4. Transient Search reveal on C2 T3 SG1 -> reveals C2 T3 SG1; consuming Search restores manual P1 SC2 SG3 intact!
    await evaluate(`window.__uat4C1Main.setFocusTarget({ documentId: window.__uat4C1.londonIds.documentId, blockId: ${JSON.stringify(c2Id)}, segmentId: ${JSON.stringify(c2T3Sg1)}, nonce: 888 })`);
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSegment'), c2T3Sg1);
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSource'), 'search');
    await evaluate('window.__uat4C1Main.setFocusTarget(null)');
    await waitFrames();
    assert.equal(
      await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSegment'),
      p1Sc2Sg3,
      'Consuming transient Search must restore prior manual Contextual target'
    );
    await captureElement(`[data-shared-book-card="${p1Id}"]`, '10-main-app-full-book-contextual-return-to-playing.png');

    // 5. Click Return to Playing -> immediately follows audible Split Segment C1 T2 SG2!
    await click('[data-shared-contextual-return-to-playing="true"]');
    await waitFrames();
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSegment'), c1T2Sg2);
    assert.equal(await evaluate('document.querySelector("[data-shared-contextual-panel]")?.dataset.sharedContextualSource'), 'audible');

    // 6. Existing Segment text click STILL invokes verified onPlaySegment without being hijacked
    await click(`[data-shared-card-segment="${c1T2Sg2}"][data-shared-card-channel="text"]`);
    const log = await evaluate('window.__uat4C1.getPlaybackLog()');
    assert.deepEqual(log[log.length - 1], ['main:playSegment', c1T2Sg2]);

    // Guardrails: zero IndexedDB access, zero uncaught errors, snapshots untouched
    const guard = await evaluate(`({
      dbCalls: window.__uat4DbCalls,
      errors: window.__uat4Errors,
      unchanged: window.__uat4C1.getSnapshotsUnchanged()
    })`);
    assert.equal(guard.dbCalls, 0);
    assert.deepEqual(guard.errors, []);
    assert.equal(guard.unchanged, true);
  });

  }
  const report = {
    status: 'PASS',
    browserPath,
    checksPassed: results.length,
    results,
    evidenceDir,
    screenshots
  };
  await fs.writeFile(path.join(evidenceDir, sessionOnly ? 'uat4-4e2-report.json' : commandsOnly ? 'uat4-4e1-report.json' : notebookOnly || notebookLayoutOnly ? 'uat4-4c3-report.json' : 'uat4-4c1-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('UAT-4 4C1 browser audit FAILED:', error);
  process.exitCode = 1;
} finally {
  await closeBrowser?.().catch(() => {});
  socket?.close();
  if (browser.exitCode === null && browser.signalCode === null) browser.kill();
  server.closeAllConnections();
  server.close();
  // Only remove the disposable directory allocated by this process.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rm(profile, { recursive: true, force: true });
      console.log(`Evidence dir: ${evidenceDir} | Disposable profile removed`);
      break;
    } catch (error) {
      if (attempt === 7) {
        console.error(`Disposable profile cleanup failed: ${profile}`, error);
        process.exitCode = 1;
      } else {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
}
