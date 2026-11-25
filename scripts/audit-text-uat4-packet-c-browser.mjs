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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gate4B2Only = process.argv.includes('--gate-4b2');
const gateCHF1Only = process.argv.includes('--gate-chf1');
const onlyCHF1 = process.argv.includes('--only-chf1');
const onlyCHF2 = process.argv.includes('--only-chf2');
const evidenceDir = process.env.UAT4_PACKET_C_EVIDENCE_DIR
  || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-packet-c-evidence-'));
await fs.mkdir(evidenceDir, { recursive: true });

// -----------------------------------------------------------------------------
// 1. Node verification of authoritative 4/11/37 London + COMPLETE stress fixtures
// -----------------------------------------------------------------------------
const verifyFixtures = () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1, 'Canonical DB version must remain 1');
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1, 'Canonical schema version must remain 1');

  const london = createJourneyToLondonFixture();
  assert.deepEqual(london.counts, { cards: 4, units: 11, segments: 37 });
  const londonState = selectTextMixedReaderState(london.snapshot, { documentId: london.ids.documentId });
  assert.deepEqual(londonState.presentation.cards.map(c => c.units.length), [2, 4, 1, 4]);
  assert.deepEqual(
    londonState.presentation.cards.flatMap(c => c.units.map(u => u.segments.length)),
    [4, 4, 3, 3, 3, 3, 5, 3, 3, 3, 3]
  );

  const stress = createJourneyToLondonStressFixtures();
  const stressState = selectTextMixedReaderState(stress.snapshot, { documentId: stress.ids.documentId });
  assert.equal(stressState.presentation.cards.length, 3);
  assert.equal(stressState.presentation.unitById[stress.ids.longSpeakerTurnId].segments.length, 2, 'Complete stress fixture retains BOTH long-speaker sentences');
  assert.equal(stressState.presentation.unitById[stress.ids.emptySectionId].segments.length, 0);
  assert.equal(stressState.presentation.unitById[stress.ids.emptyTurnId].segments.length, 0);
  assert.equal(stress.snapshot.segments.length, 9, 'Complete stress fixture has all 9 stress sentences');
  return {
    londonCounts: london.counts,
    stressCounts: {
      cards: stress.snapshot.blocks.length,
      units: stress.snapshot.contentUnits.length,
      segments: stress.snapshot.segments.length
    }
  };
};

const fixtureSummary = verifyFixtures();
console.log('PASS Packet C fixture verification:', JSON.stringify(fixtureSummary));

// -----------------------------------------------------------------------------
// 2. Compile Tailwind CSS & Dual-Host Live Browser Harness (Isolated UAT + Main App)
//    Consumes verbatim createJourneyToLondonFixture() and createJourneyToLondonStressFixtures()
// -----------------------------------------------------------------------------
const compileCss = async () => {
  const [cssSource, swiperCss, focusCarouselCss] = await Promise.all([
    fs.readFile(path.join(root, 'src/index.css'), 'utf8'),
    fs.readFile(path.join(root, 'node_modules/swiper/swiper.css'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/text/presentation/sharedFocusCarousel.css'), 'utf8')
  ]);
  const tailwindConfigModule = await import(pathToFileURL(path.join(root, 'tailwind.config.js')).href);
  const tailwindConfig = {
    ...tailwindConfigModule.default,
    content: [
      path.join(root, 'src/**/*.{js,jsx}'),
      path.join(root, 'scripts/audit-text-uat4-packet-c-browser.mjs')
    ]
  };
  const result = await postcss([tailwindcss(tailwindConfig), autoprefixer]).process(cssSource, {
    from: path.join(root, 'src/index.css')
  });
  return `${swiperCss}\n${result.css}\n${focusCarouselCss}`;
};

const harnessJsx = `
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { selectTextMixedReaderState } from './src/domain/text/textMixedReaderDomain.js';
import { applyTextLibraryCommand } from './src/domain/text/textLibraryCommandDomain.js';
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
  const CACHE_KEY = '__uat4_packet_c_fixtures_v1';
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

function LiveMainAppHostHarness({ activeFixture, playbackLogRef }) {
  const [pref, setPref] = useState(() => loadTextMainReaderPreference());
  const [scope, setScope] = useState(TEXT_WORKSPACE_STYLE_SCOPES.SHARED);
  const [cardExpansionMode, setCardExpansionMode] = useState('all');
  const [activePlayback, setActivePlayback] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);

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

  window.__packetCMain = {
    getPreference: () => pref,
    setReader: reader => updatePref({ reader }),
    setActivePlayback: next => setActivePlayback(next),
    setFocusTarget: next => setFocusTarget(next),
    getFocusTarget: () => focusTarget
  };

  const sharedCursor = activePlayback ? {
    workspaceId: selected.presentation.workspace.id,
    workspaceUid: selected.presentation.workspace.uid,
    sessionId: activePlayback.sessionId ?? 91,
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
        onPlayDocument={() => playbackLogRef.current.push(['main:playDocument', activeFixture.ids.documentId])}
        onPlayCard={(cardId, opts) => playbackLogRef.current.push(['main:playCard', cardId, opts || null])}
        onPlaySegment={segId => playbackLogRef.current.push(['main:playSegment', segId])}
      />
    </div>
  );
}

function PacketCApp() {
  const params = new URLSearchParams(window.location.search);
  const [hostTab, setHostTab] = useState(() => params.get('host') || 'uat');
  const [whichDoc, setWhichDoc] = useState(() => params.get('doc') === 'stress' ? 'stress' : 'london');
  const [derivedOverride, setDerivedOverride] = useState(null);
  const [dark, setDark] = useState(false);
  const playbackLogRef = useRef([]);
  const uatEventsRef = useRef([]);
  const uatCancelsRef = useRef(0);

  const baseFixture = whichDoc === 'stress' ? fixtures.stress : fixtures.london;
  const activeFixture = derivedOverride || baseFixture;

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

  window.__packetC = {
    MAIN_STORAGE_KEY: TEXT_MAIN_READER_PREFERENCE_KEY,
    UAT_STORAGE_KEY,
    londonIds: fixtures.london.ids,
    stressIds: fixtures.stress.ids,
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
    setHostTab: next => {
      setDerivedOverride(null);
      setHostTab(next);
      const url = new URL(window.location.href);
      url.searchParams.set('host', next);
      window.history.replaceState(null, '', url);
    },
    setWorkspace: next => {
      setDerivedOverride(null);
      setWhichDoc(next);
      const url = new URL(window.location.href);
      url.searchParams.set('doc', next);
      window.history.replaceState(null, '', url);
    },
    // Creates a disposable derived snapshot (e.g., removing a selected Segment)
    // WITHOUT mutating the authoritative London or Stress fixtures.
    deleteSegmentInDisposableClone: segmentIdToRemove => {
      const source = baseFixture;
      const cloned = JSON.parse(JSON.stringify(source));
      const nextResult = applyTextLibraryCommand(cloned.snapshot, {
        type: 'segment.delete',
        payload: { id: segmentIdToRemove }
      });
      cloned.snapshot = nextResult.snapshot;
      setDerivedOverride(cloned);
    },
    // Creates a disposable derived snapshot with an oversized bilingual Unit (C1_T2)
    // WITHOUT mutating the authoritative London fixture.
    loadOversizedBilingualProbe: () => {
      const cloned = JSON.parse(JSON.stringify(fixtures.london));
      const targetSegId = cloned.ids.segmentIdsByUnitKey.C1_T2[0];
      const extraEn = ' '.repeat(1) + [
        'Because the morning express timetable includes seasonal engineering updates across three suburban junctions, passengers travelling with reserved luggage racks are kindly advised to verify platform assignments on the overhead concourse boards at least fifteen minutes prior to departure.',
        'If an earlier regional connection arrives late due to wet track conditions near Reading or Slough, your off-peak return ticket remains valid on the immediately following direct service without requiring an additional endorsement at the main concourse booth.',
        'Quiet coach seating is positioned at the front of the train near Coach A and Coach B, while the refreshment trolley circulates twice between departure and Paddington terminus with hot tea, fresh sandwiches, and bottled water.',
        'Final oversized probe sentinel sentence EN-END-MARKER confirms zero vertical clipping.'
      ].join(' ');
      const extraId = ' '.repeat(1) + [
        'Karena jadwal kereta ekspres pagi mencakup pembaruan teknis musiman di tiga persimpangan pinggiran kota, penumpang yang bepergian dengan rak bagasi terpesan sangat disarankan memeriksa papan informasi peron setidaknya lima belas menit sebelum keberangkatan.',
        'Apabila kereta penghubung regional sebelumnya tiba terlambat akibat kondisi rel basah di sekitar Reading atau Slough, tiket pulang-pergi di luar jam sibuk Anda tetap berlaku pada layanan langsung berikutnya tanpa memerlukan pengesahan tambahan di loket utama.',
        'Kursi gerbong tenang berada di bagian depan kereta dekat Gerbong A dan Gerbong B, sedangkan troli makanan dan minuman berkeliling dua kali sepanjang perjalanan menuju stasiun akhir Paddington dengan teh hangat, roti lapis segar, dan air mineral.',
        'Kalimat penutup uji panjang ID-END-MARKER memastikan seluruh teks terbaca utuh tanpa terpotong.'
      ].join(' ');
      cloned.snapshot.segments = cloned.snapshot.segments.map(seg => (
        seg.id === targetSegId
          ? { ...seg, text: seg.text + extraEn, meaning: seg.meaning + extraId }
          : seg
      ));
      setWhichDoc('london');
      setDerivedOverride(cloned);
    },
    clearDerivedOverride: () => setDerivedOverride(null),
    setDark: flag => {
      setDark(Boolean(flag));
      document.documentElement.classList.toggle('dark', Boolean(flag));
    }
  };

  return (
    <div data-packet-c-host={hostTab} data-packet-c-theme={dark ? 'dark' : 'light'} className="min-h-screen bg-slate-100/90 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              ProLingo UAT-4 Packet C · Focus Reader & Segment Study Box ({hostTab === 'uat' ? 'Isolated UAT Host' : 'Main App Host'})
            </p>
            <h1 className="text-lg font-bold">Focus Mode (4B2) · Segment Study Box (4B3)</h1>
          </div>
          <span className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-semibold">
            {whichDoc === 'stress' ? 'Complete Stress Fixture' : 'A Journey to London (4/11/37)'}
          </span>
        </header>

        {hostTab === 'uat' ? (
          <StructuredWorkspacePlayer
            snapshot={activeFixture.snapshot}
            documentId={activeFixture.ids.documentId}
            audioRuntimeHooks={audioRuntimeHooks}
          />
        ) : (
          <LiveMainAppHostHarness activeFixture={activeFixture} playbackLogRef={playbackLogRef} />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<PacketCApp />);
`;

const [compiledCss, compiledJs] = await Promise.all([
  compileCss(),
  build({
    absWorkingDir: root,
    stdin: {
      contents: harnessJsx,
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'uat4-packet-c-harness.jsx'
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
  <title>ProLingo UAT-4 Packet C Audit</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__packetCDbCalls = 0;
    window.__packetCErrors = [];
    window.addEventListener('error', e => window.__packetCErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__packetCErrors.push(String(e.reason)));
    Object.defineProperty(window, 'indexedDB', {
      value: new Proxy({}, { get() { window.__packetCDbCalls += 1; throw new Error('Packet C audit forbids IndexedDB'); } })
    });
  </script>
  <script type="module" src="/app.js"></script>
</body>
</html>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-packet-c-profile-'));
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
  const initialPage = targets.find(t => t.type === 'page');
  let activeTargetId = initialPage.id;
  const pending = new Map();
  let nextId = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP call timed out after 20s: ${method} ${params?.expression ? String(params.expression).slice(0, 100) : ''}`));
      }
    }, 20000);
    pending.set(id, {
      resolve: val => { clearTimeout(timer); resolve(val); },
      reject: err => { clearTimeout(timer); reject(err); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const attachPageSocket = async wsUrl => {
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.close();
    }
    socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onclose = () => {
      for (const entry of pending.values()) {
        entry.reject(new Error('CDP WebSocket closed unexpectedly'));
      }
      pending.clear();
    };
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
        else entry.resolve(msg.result);
      }
    };
    await call('Runtime.enable');
    await call('Page.enable');
  };
  await attachPageSocket(initialPage.webSocketDebuggerUrl);
  const openFreshPage = async () => {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const prevTargetId = activeTargetId;
    activeTargetId = targetId;
    const nextTargets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const nextPage = nextTargets.find(t => t.id === targetId);
    if (!nextPage?.webSocketDebuggerUrl) throw new Error('Failed to open fresh CDP page target');
    await attachPageSocket(nextPage.webSocketDebuggerUrl);
    if (prevTargetId) {
      await call('Target.closeTarget', { targetId: prevTargetId }).catch(() => {});
    }
  };

  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  const waitFrames = () => evaluate(`new Promise(resolve => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(true); } };
    setTimeout(finish, 180);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  })`);
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
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const mouseDrag = async ({ startX, startY, endX, endY, steps = 14, stepMs = 14 }) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX, y: startY, button: 'none', buttons: 0 });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(startX + (endX - startX) * t);
      const y = Math.round(startY + (endY - startY) * t);
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      await sleep(stepMs);
    }
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: endY, button: 'left', buttons: 0, clickCount: 1 });
  };
  const touchSwipe = async ({ startX, startY, endX, endY, steps = 12, stepMs = 14 }) => {
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY, id: 1, radiusX: 10, radiusY: 10, force: 1 }]
    });
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(startX + (endX - startX) * t);
      const y = Math.round(startY + (endY - startY) * t);
      await call('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1, radiusX: 10, radiusY: 10, force: 1 }]
      });
      await sleep(stepMs);
    }
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
  };
  const wheelScroll = async ({ x, y, deltaY, steps = 6, stepMs = 35 }) => {
    const perStep = Math.round(deltaY / steps);
    for (let i = 0; i < steps; i += 1) {
      await call('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: 0,
        deltaY: perStep
      });
      await sleep(stepMs);
    }
  };
  const pressKey = async (key, code = key, windowsVirtualKeyCode = 0) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  };
  let currentViewport = { width: 1280, height: 900, mobile: false };
  const setViewport = async ({ width, height, mobile = false }) => {
    const wasMobile = currentViewport.mobile;
    currentViewport = { width, height, mobile };
    if (wasMobile && !mobile) {
      await call('Emulation.clearDeviceMetricsOverride');
    }
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await until(`window.innerWidth === ${width}`, `viewport ${width}`);
    await waitFrames();
  };
  const captureFullPage = async filename => {
    await waitFrames();
    const metrics = await call('Page.getLayoutMetrics');
    const contentHeight = Math.ceil(metrics.cssContentSize?.height || metrics.contentSize?.height || 1200);
    const contentWidth = currentViewport.width;
    await call('Emulation.setDeviceMetricsOverride', {
      width: contentWidth,
      height: contentHeight,
      deviceScaleFactor: 1,
      mobile: currentViewport.mobile
    });
    await waitFrames();
    await waitFrames();
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true
    });
    await call('Emulation.setDeviceMetricsOverride', {
      width: currentViewport.width,
      height: currentViewport.height,
      deviceScaleFactor: currentViewport.mobile ? 2 : 1,
      mobile: currentViewport.mobile
    });
    await waitFrames();
    const outPath = path.join(evidenceDir, filename);
    await fs.writeFile(outPath, Buffer.from(shot.data, 'base64'));
    screenshots.push({ filename, path: outPath, width: contentWidth, height: contentHeight });
    return outPath;
  };
  const captureElement = async (selector, filename, pad = 16) => {
    await waitFrames();
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left + window.scrollX - ${pad})),
        y: Math.max(0, Math.floor(r.top + window.scrollY - ${pad})),
        width: Math.min(window.innerWidth, Math.ceil(r.width + ${pad * 2})),
        height: Math.ceil(r.height + ${pad * 2})
      };
    })()`);
    if (!box) throw new Error(`Missing element for screenshot: ${selector}`);
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
  const run = async (name, fn) => {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  };

  await setViewport({ width: 1280, height: 900, mobile: false });
  await call('Page.navigate', { url: `${origin}/?host=uat&doc=london` });
  await until('window.__packetC && document.querySelector("[data-structured-workspace-player]")', 'Isolated UAT host mounted');

  // =========================================================================
  // 4B2 INTERNAL ACCEPTANCE GATE — FOCUS MODE (VERTICAL & HORIZONTAL)
  // =========================================================================
  if (!onlyCHF1 && !onlyCHF2) {
  await run('4B2-1: Toolbar exposes Full | Card | Focus | Segment (no visible Part label) & Focus Vertical on full 4/11/37 London', async () => {
    await clickButtonText('Shared UI (Beta)');
    await until('document.querySelector("[data-shared-card-bilingual-toolbar]")', 'Shared toolbar ready');

    const modeLabels = await evaluate(`[...document.querySelectorAll('[data-shared-reader-mode-option]')].map(b => b.textContent.trim())`);
    assert.deepEqual(modeLabels, ['Full', 'Card', 'Focus', 'Segment'], 'Toolbar must expose Full | Card | Focus | Segment');

    // Switch to Focus (defaults to Vertical Focus) and Separated layout for rich bilingual inspection
    await click('[data-shared-reader-mode-option="focus"]');
    await until('document.querySelector("[data-shared-focus-orientation=vertical-focus]")', 'Focus Vertical rendered');
    await click('[data-shared-card-layout-option="separated"]');
    await waitFrames();

    const orientationLabels = await evaluate(`[...document.querySelectorAll('[data-shared-focus-orientation-option]')].map(b => b.textContent.trim())`);
    assert.deepEqual(orientationLabels, ['Vertical', 'Horizontal'], 'Focus Style must expose Vertical | Horizontal');

    const check = await evaluate(`(() => {
      const ids = window.__packetC.londonIds;
      const p1 = document.querySelector('[data-shared-card-id="' + ids.cards.P1 + '"]');
      const c1 = document.querySelector('[data-shared-card-id="' + ids.cards.C1 + '"]');
      const p2 = document.querySelector('[data-shared-card-id="' + ids.cards.P2 + '"]');
      const c2 = document.querySelector('[data-shared-card-id="' + ids.cards.C2 + '"]');
      return {
        p1Rail: [...p1.querySelectorAll('[data-shared-focus-rail-item]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
        c1Rail: [...c1.querySelectorAll('[data-shared-focus-rail-item]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
        c2Rail: [...c2.querySelectorAll('[data-shared-focus-rail-item]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
        p2SingleUnit: Boolean(p2.querySelector('[data-shared-focus-single-unit="true"]')),
        p2NoRail: !p2.querySelector('[data-shared-focus-rail]'),
        p2NoPrevNext: !p2.querySelector('[data-shared-focus-prev]') && !p2.querySelector('[data-shared-focus-next]'),
        p2NoNeighbors: p2.querySelectorAll('[data-shared-part-neighbor]').length === 0,
        p2SegCount: p2.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]').length,
        p1PrevDisabled: p1.querySelector('[data-shared-focus-prev]').disabled,
        p1NextDisabled: p1.querySelector('[data-shared-focus-next]').disabled,
        p1HasNextPreview: Boolean(p1.querySelector('[data-shared-part-neighbor="next"]')),
        c1AlignedSpeakerGrid: Boolean(c1.querySelector('[data-shared-turn-aligned-grid]')),
        p1ParaIndented: parseFloat(getComputedStyle(p1.querySelector('[data-shared-reading-body="true"]')).textIndent) > 16,
        allJustified: [...document.querySelectorAll('[data-shared-reading-body="true"]')].every(el => getComputedStyle(el).textAlign === 'justify'),
        noNestedVerticalTrap: [...document.querySelectorAll('[data-shared-focus-view]')].every(el => {
          const style = getComputedStyle(el);
          return style.overflowY !== 'auto' && style.overflowY !== 'scroll';
        }),
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        zeroPlaybackCalls: window.__packetC.getPlaybackLog().length === 0
      };
    })()`);

    assert.deepEqual(check.p1Rail, ['SC1 · 4 SG', 'SC2 · 4 SG']);
    assert.deepEqual(check.c1Rail, ['T1 James · 3 SG', 'T2 Ticket Officer · 3 SG', 'T3 James · 3 SG', 'T4 Ticket Officer · 3 SG']);
    assert.deepEqual(check.c2Rail, ['T1 Emma · 3 SG', 'T2 James · 3 SG', 'T3 Emma · 3 SG', 'T4 James · 3 SG']);
    assert.equal(check.p2SingleUnit, true, 'P2 must render clean single-unit Focus surface');
    assert.equal(check.p2NoRail, true, 'P2 must suppress redundant Navigation Rail');
    assert.equal(check.p2NoPrevNext, true, 'P2 must suppress redundant Prev/Next controls');
    assert.equal(check.p2NoNeighbors, true, 'P2 must suppress neighbor previews');
    assert.equal(check.p2SegCount, 5, 'P2 must display all 5 segments');
    assert.equal(check.p1PrevDisabled, true);
    assert.equal(check.p1NextDisabled, false);
    assert.equal(check.p1HasNextPreview, true);
    assert.equal(check.c1AlignedSpeakerGrid, true, 'Aligned speaker layout must apply in Focus Conversation Turns');
    assert.equal(check.p1ParaIndented, true, 'Paragraph first-line indent must apply in Focus Paragraph Sections');
    assert.equal(check.allJustified, true, 'Shared Justify alignment must apply in Focus Mode');
    assert.equal(check.noNestedVerticalTrap, true);
    assert.equal(check.noOverflow, true);
    assert.equal(check.zeroPlaybackCalls, true);

    await captureFullPage('01-focus-vertical-expand-all-london.png');
    await captureElement(`[data-shared-card-id="${await evaluate('window.__packetC.londonIds.cards.P2')}"]`, '04-focus-single-section-p2.png');

    // Step P1 -> SC2 via Next preview click, and C1 -> T2 via rail click (must be completely silent)
    const p1Id = await evaluate('window.__packetC.londonIds.cards.P1');
    const c1Id = await evaluate('window.__packetC.londonIds.cards.C1');
    const c1T2Id = await evaluate('window.__packetC.londonIds.units.C1_T2');
    await click(`[data-shared-card-id="${p1Id}"] [data-shared-part-neighbor="next"] [data-shared-part-focus]`);
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T2Id}"]`);
    await waitFrames();

    const afterStep = await evaluate(`(() => {
      const ids = window.__packetC.londonIds;
      const p1 = document.querySelector('[data-shared-card-id="' + ids.cards.P1 + '"]');
      const c1 = document.querySelector('[data-shared-card-id="' + ids.cards.C1 + '"]');
      return {
        p1NextDisabled: p1.querySelector('[data-shared-focus-next]').disabled,
        p1HasPrevPreview: Boolean(p1.querySelector('[data-shared-part-neighbor="previous"]')),
        p1FocusedUnitId: p1.querySelector('[data-shared-part-focused]').dataset.sharedPartFocusedUnitId,
        c1FocusedUnitId: c1.querySelector('[data-shared-part-focused]').dataset.sharedPartFocusedUnitId,
        c1PrevAndNextPreviews: c1.querySelectorAll('[data-shared-part-neighbor]').length,
        c1SpeakerText: c1.querySelector('[data-shared-part-focused] [data-shared-turn-speaker]').textContent.trim(),
        zeroPlaybackCalls: window.__packetC.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(afterStep.p1NextDisabled, true);
    assert.equal(afterStep.p1HasPrevPreview, true);
    assert.equal(afterStep.p1FocusedUnitId, await evaluate('window.__packetC.londonIds.units.P1_SC2'));
    assert.equal(afterStep.c1FocusedUnitId, c1T2Id);
    assert.equal(afterStep.c1PrevAndNextPreviews, 2, 'T2 in C1 must show both Previous (T1) and Next (T3) previews');
    assert.equal(afterStep.c1SpeakerText, 'Ticket Officer');
    assert.equal(afterStep.zeroPlaybackCalls, true);
  });

  await run('4B2-2: Focus Horizontal centers active Unit, peeks neighbors, suppresses P2 track, adapts height with zero overflow', async () => {
    await click('[data-shared-focus-orientation-option="horizontal-focus"]');
    await until('document.querySelector("[data-shared-focus-orientation=horizontal-focus]")', 'Focus Horizontal rendered');
    await waitFrames();

    const hCheck = await evaluate(`(() => {
      const ids = window.__packetC.londonIds;
      const p1 = document.querySelector('[data-shared-card-id="' + ids.cards.P1 + '"]');
      const c1 = document.querySelector('[data-shared-card-id="' + ids.cards.C1 + '"]');
      const p2 = document.querySelector('[data-shared-card-id="' + ids.cards.P2 + '"]');
      const c1Track = c1.querySelector('[data-shared-part-track="horizontal"]');
      const c1Slides = [...c1.querySelectorAll('[data-shared-part-slide]')];
      const activeSlide = c1.querySelector('[data-shared-part-slide][data-shared-part-active="true"]');
      const trackRect = c1Track.getBoundingClientRect();
      const activeRect = activeSlide.getBoundingClientRect();
      return {
        p1SlideCount: p1.querySelectorAll('[data-shared-part-slide]').length,
        c1SlideCount: c1Slides.length,
        c1PeekButtons: c1.querySelectorAll('[data-shared-focus-peek="true"]').length,
        p2SingleUnitStillSuppressed: Boolean(p2.querySelector('[data-shared-focus-single-unit="true"]')) && !p2.querySelector('[data-shared-part-track]'),
        activeNarrowerThanTrackForPeek: activeRect.width < trackRect.width - 20 && activeRect.width > trackRect.width * 0.72,
        activeSlideFullyVisibleInTrack: activeRect.left >= trackRect.left - 2 && activeRect.right <= trackRect.right + 2,
        debugRects: {
          trackLeft: Math.round(trackRect.left),
          trackRight: Math.round(trackRect.right),
          trackWidth: Math.round(trackRect.width),
          activeLeft: Math.round(activeRect.left),
          activeRight: Math.round(activeRect.right),
          activeWidth: Math.round(activeRect.width),
          wrapperTransform: c1Track.querySelector('.swiper-wrapper')?.style?.transform || null,
          wrapperComputedTransform: getComputedStyle(c1Track.querySelector('.swiper-wrapper')).transform,
          wrapperLeft: Math.round(c1Track.querySelector('.swiper-wrapper').getBoundingClientRect().left),
          slideOffsets: c1Slides.map(s => ({ idx: s.dataset.sharedPartSlideIndex, ol: s.offsetLeft, ow: s.offsetWidth, rectL: Math.round(s.getBoundingClientRect().left), active: s.dataset.sharedPartActive || null })),
          activeClasses: activeSlide.className
        },
        c1AuthoredTurnLabel: c1.querySelector('[data-shared-part-active="true"] [data-shared-turn-label]')?.textContent?.trim() || null,
        noPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        zeroPlaybackCalls: window.__packetC.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(hCheck.p1SlideCount, 2);
    assert.equal(hCheck.c1SlideCount, 4);
    assert.equal(hCheck.c1PeekButtons, 3, '3 inactive slides provide peeking preview triggers');
    assert.equal(hCheck.p2SingleUnitStillSuppressed, true);
    assert.equal(hCheck.activeNarrowerThanTrackForPeek, true, 'Active horizontal slide leaves edge room for neighbor previews');
    assert.equal(hCheck.activeSlideFullyVisibleInTrack, true, `Active horizontal slide must be centered & fully visible inside track: ${JSON.stringify(hCheck.debugRects)}`);
    assert.equal(hCheck.c1AuthoredTurnLabel, 'Speaker Turn 2', 'Focused Turn must retain its true authored ordinal');
    assert.equal(hCheck.noPageOverflow, true);
    assert.equal(hCheck.zeroPlaybackCalls, true);

    await captureFullPage('02-focus-horizontal-expand-all-london.png');

    // Click peeking T3 slide in C1 -> smoothly switches active slide without starting audio
    const c1Id = await evaluate('window.__packetC.londonIds.cards.C1');
    const c1T3Id = await evaluate('window.__packetC.londonIds.units.C1_T3');
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-part-focus-unit-id="${c1T3Id}"]`);
    await waitFrames();
    assert.equal(
      await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId`),
      c1T3Id
    );
    assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0);
  });

  await run('4B2-3: Focus reading focus stays separate from active playback, shows Return to Playing, and respects all Workspace Styles', async () => {
    const c1Id = await evaluate('window.__packetC.londonIds.cards.C1');
    const c1T1Id = await evaluate('window.__packetC.londonIds.units.C1_T1');
    const c1T1Seg0Id = await evaluate('window.__packetC.londonIds.segmentIdsByUnitKey.C1_T1[0]');
    const c1T4Id = await evaluate('window.__packetC.londonIds.units.C1_T4');

    // Return to Vertical Focus and start Split playback on C1
    await click('[data-shared-focus-orientation-option="vertical-focus"]');
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-card-play="true"]`);
    await until(`window.__packetC.getUatEvents().length === 1 && document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${c1T1Seg0Id}"`, 'C1 T1 playing');
    const cancelsBefore = await evaluate('window.__packetC.getUatCancels()');

    // Browse manually to T4 while T1 is actively playing -> cursor stays on T1, Return to Playing appears!
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T4Id}"]`);
    await waitFrames();
    const diverged = await evaluate(`(() => {
      const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
      const rtn = c1.querySelector('[data-shared-focus-return-to-playing="true"]');
      return {
        focusedUnitId: c1.querySelector('[data-shared-part-focused]').dataset.sharedPartFocusedUnitId,
        cursorSegment: document.querySelector('[data-unified-reader]').dataset.readerCursorSegment,
        cancels: window.__packetC.getUatCancels(),
        returnText: rtn ? rtn.textContent.replace(/\\s+/g, ' ').trim() : null
      };
    })()`);
    assert.equal(diverged.focusedUnitId, c1T4Id);
    assert.equal(diverged.cursorSegment, c1T1Seg0Id, 'Manual Focus navigation must never mutate engine cursor');
    assert.equal(diverged.cancels, cancelsBefore);
    assert.ok(diverged.returnText && diverged.returnText.includes('Return to Playing') && diverged.returnText.includes('T1 James'));

    await captureElement(`[data-shared-card-id="${c1Id}"]`, '05-focus-active-conversation-turn.png');

    // Click Return to Playing -> focuses T1 cleanly without cancelling playback
    await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-return-to-playing="true"]`);
    await waitFrames();
    assert.equal(
      await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-focused]').dataset.sharedPartFocusedUnitId`),
      c1T1Id
    );
    assert.equal(await evaluate('window.__packetC.getUatCancels()'), cancelsBefore);

    // Stop playback cleanly
    await clickButtonText('Stop');
    await evaluate('window.__packetC.finishLatestUatEvent("stopped")');
    await until('document.querySelector("[data-unified-reader]").dataset.readerCursorPrecision === "none"', 'Playback stopped');

    // Exercise Workspace Style combinations (Left + Stacked + Inline + Indent Off + Accents Off)
    await click('[data-shared-workspace-align-option="left"]');
    await click('[data-shared-workspace-speaker-option="stacked"]');
    await waitFrames();
    assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-reading-body="true"]').dataset.sharedReadingAlign`), 'left');
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-turn-aligned-grid]'))`), false);
    await click('[data-shared-workspace-speaker-option="inline"]');
    await waitFrames();
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-turn-speaker-inline="true"]'))`), true);
    await click('[data-shared-workspace-style-reset="true"]');
    await waitFrames();
  });

  await run('4B2-4: Complete Stress Fixture (verbatim) + 390px Mobile + Dark Theme + Empty Units + Long 71-char Speaker', async () => {
    await evaluate('window.__packetC.setWorkspace("stress")');
    await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__packetC.stressIds.documentId', 'Stress fixture mounted');
    await evaluate('window.__packetC.clearPlaybackLog()');

    const paraStressId = await evaluate('window.__packetC.stressIds.paragraphStressCardId');
    const emptySecId = await evaluate('window.__packetC.stressIds.emptySectionId');
    const convStressId = await evaluate('window.__packetC.stressIds.conversationStressCardId');
    const longTurnId = await evaluate('window.__packetC.stressIds.longSpeakerTurnId');
    const emptyTurnId = await evaluate('window.__packetC.stressIds.emptyTurnId');
    const titleCardId = await evaluate('window.__packetC.stressIds.titleCardId');

    // Navigate to empty Section (0 SG) and empty Turn (0 SG) cleanly without fabricating segments
    await click(`[data-shared-card-id="${paraStressId}"] [data-shared-focus-rail-unit-id="${emptySecId}"]`);
    await click(`[data-shared-card-id="${convStressId}"] [data-shared-focus-rail-unit-id="${emptyTurnId}"]`);
    await waitFrames();
    const emptyCheck = await evaluate(`(() => ({
      emptySecText: document.querySelector('[data-shared-card-id="${paraStressId}"] [data-shared-part-focused]').textContent,
      emptyTurnText: document.querySelector('[data-shared-card-id="${convStressId}"] [data-shared-part-focused]').textContent,
      titleSingleUnit: Boolean(document.querySelector('[data-shared-card-id="${titleCardId}"] [data-shared-focus-single-unit="true"]')),
      titleNotIndented: parseFloat(getComputedStyle(document.querySelector('[data-shared-card-id="${titleCardId}"] [data-shared-reading-body="true"]')).textIndent) === 0
    }))()`);
    assert.ok(emptyCheck.emptySecText.includes('Empty section'));
    assert.ok(emptyCheck.emptyTurnText.includes('Empty speaker turn'));
    assert.equal(emptyCheck.titleSingleUnit, true);
    assert.equal(emptyCheck.titleNotIndented, true);

    // Focus the 71-char long Speaker Turn with BOTH stress sentences on 390px mobile + dark theme!
    await click(`[data-shared-card-id="${convStressId}"] [data-shared-focus-rail-unit-id="${longTurnId}"]`);
    await setViewport({ width: 390, height: 844, mobile: true });
    await waitFrames();

    const mobileLong = await evaluate(`(() => {
      const card = document.querySelector('[data-shared-card-id="${convStressId}"]');
      const focused = card.querySelector('[data-shared-part-focused]');
      const enSegs = focused.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]');
      const idSegs = focused.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]');
      return {
        enCount: enSegs.length,
        idCount: idSegs.length,
        containsSecondSentence: focused.textContent.includes('Our onboard attendants can also help you locate your reserved window seat'),
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        zeroPlaybackCalls: window.__packetC.getPlaybackLog().length === 0
      };
    })()`);
    assert.equal(mobileLong.enCount, 2, 'Complete stress fixture must show BOTH long-speaker EN sentences');
    assert.equal(mobileLong.idCount, 2, 'Complete stress fixture must show BOTH long-speaker ID sentences');
    assert.equal(mobileLong.containsSecondSentence, true);
    assert.equal(mobileLong.noOverflow, true, '390px mobile Focus must have zero horizontal page overflow');
    assert.equal(mobileLong.zeroPlaybackCalls, true);

    // Verify Horizontal Focus on 390px mobile also has zero page overflow
    await click('[data-shared-focus-orientation-option="horizontal-focus"]');
    await waitFrames();
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, '390px mobile Horizontal Focus must have zero page overflow');

    await click('[data-shared-focus-orientation-option="vertical-focus"]');
    await evaluate('window.__packetC.setDark(true)');
    await waitFrames();
    await captureElement(`[data-shared-card-id="${convStressId}"]`, '03-focus-mobile-390-long-unit.png', 12);
    await evaluate('window.__packetC.setDark(false)');
    await setViewport({ width: 1280, height: 900, mobile: false });
  });

  await run('4B2-5: Saved historical preferences (legacy vertical-list -> Card, horizontal-focus -> Focus Horizontal) & Main App host Focus', async () => {
    await evaluate('window.__packetC.setWorkspace("london")');
    await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__packetC.londonIds.documentId', 'Back on London');

    // Legacy saved preference: level='part', partLayout='vertical-list' -> resolves to Card Mode after reload!
    await evaluate(`localStorage.setItem(window.__packetC.UAT_STORAGE_KEY, JSON.stringify({
      version: 1,
      reader: 'shared',
      view: { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-list' }
    }))`);
    let prevOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevOrigin} && document.querySelector("[data-shared-card-bilingual-toolbar]")`, 'Reloaded legacy vertical-list');
    assert.equal(await evaluate('document.querySelector("[data-shared-card-bilingual-toolbar]").dataset.sharedReaderMode'), 'card');
    assert.equal(await evaluate('Boolean(document.querySelector("[data-shared-focus-view]"))'), false, 'Legacy vertical-list must render Card Mode, not Focus');

    // Legacy saved preference: level='part', partLayout='horizontal-focus' -> resolves to Focus Horizontal after reload!
    await evaluate(`localStorage.setItem(window.__packetC.UAT_STORAGE_KEY, JSON.stringify({
      version: 1,
      reader: 'shared',
      view: { level: 'part', bilingualLayout: 'interlinear', partLayout: 'horizontal-focus' }
    }))`);
    prevOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${prevOrigin} && document.querySelector("[data-shared-focus-orientation=horizontal-focus]")`, 'Reloaded legacy horizontal-focus');
    assert.equal(await evaluate('document.querySelector("[data-shared-card-bilingual-toolbar]").dataset.sharedReaderMode'), 'focus');

    // Verify Main App host (TextStructuredPlayer) Focus Vertical & Horizontal cleanly
    await call('Page.navigate', { url: `${origin}/?host=main&doc=london` });
    await until('window.__packetCMain && document.querySelector("[data-main-app-host-harness]")', 'Main App host mounted');
    await click('[data-main-host-reader="shared"]');
    await until('document.querySelector("[data-shared-book-page=true]")', 'Main App Shared ready');
    await click('[data-shared-reader-mode-option="focus"]');
    await until('document.querySelector("[data-shared-focus-orientation=vertical-focus]")', 'Main App Focus Vertical');
    await click('[data-shared-focus-orientation-option="horizontal-focus"]');
    await until('document.querySelector("[data-shared-focus-orientation=horizontal-focus]")', 'Main App Focus Horizontal');
    assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0);
  });

  if (!gate4B2Only) {
    // =========================================================================
    // 4B3 — SEGMENT STUDY BOX (ONE STUDY BOX PER CARD)
    // =========================================================================
    await run('4B3-1: Segment Mode Expand All renders 4 Cards, 11 Units, exact 37 EN context Segments & EXACTLY 4 Study Boxes (never 11)', async () => {
      await call('Page.navigate', { url: `${origin}/?host=uat&doc=london` });
      await until('window.__packetC && document.querySelector("[data-structured-workspace-player]")', 'Isolated UAT host ready for 4B3');
      await evaluate('window.__packetC.clearPlaybackLog()');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', '4 Study Boxes rendered');
      await waitFrames();

      const segOverview = await evaluate(`(() => {
        const ids = window.__packetC.londonIds;
        const spec = window.__packetC.londonSpec;
        const expectedEn = spec.flatMap(c => c.units.flatMap(u => u.segments.map(s => s.text)));
        const contextSegEls = [...document.querySelectorAll('[data-shared-segment-context] [data-shared-card-segment][data-shared-card-channel="text"]')];
        const actualEnIds = contextSegEls.map(el => el.dataset.sharedCardSegment);
        const actualEnTexts = contextSegEls.map(el => el.textContent.trim());
        const p1 = document.querySelector('[data-shared-card-id="' + ids.cards.P1 + '"]');
        const c1 = document.querySelector('[data-shared-card-id="' + ids.cards.C1 + '"]');
        const p2 = document.querySelector('[data-shared-card-id="' + ids.cards.P2 + '"]');
        const c2 = document.querySelector('[data-shared-card-id="' + ids.cards.C2 + '"]');
        const studyBoxes = [...document.querySelectorAll('[data-shared-segment-study-box]')];
        return {
          cardCount: document.querySelectorAll('[data-shared-card-id]').length,
          unitCount: document.querySelectorAll('[data-shared-segment-context] [data-shared-card-unit]').length,
          studyBoxCount: studyBoxes.length,
          contextIdsExact37: JSON.stringify(actualEnIds) === JSON.stringify(ids.segmentIds),
          contextTextExact37: JSON.stringify(actualEnTexts) === JSON.stringify(expectedEn),
          p1UnitPickerCount: p1.querySelectorAll('[data-study-box-unit-option]').length,
          p1LocalSegNums: [...p1.querySelectorAll('[data-study-box-local-segment]')].map(b => b.textContent.trim()),
          c1UnitPickerCount: c1.querySelectorAll('[data-study-box-unit-option]').length,
          c1LocalSegNums: [...c1.querySelectorAll('[data-study-box-local-segment]')].map(b => b.textContent.trim()),
          p2HasNoUnitPicker: !p2.querySelector('[data-study-box-unit-picker]'),
          p2LocalSegNums: [...p2.querySelectorAll('[data-study-box-local-segment]')].map(b => b.textContent.trim()),
          c2UnitPickerCount: c2.querySelectorAll('[data-study-box-unit-option]').length,
          c2LocalSegNums: [...c2.querySelectorAll('[data-study-box-local-segment]')].map(b => b.textContent.trim()),
          p1NaturalIndent: parseFloat(getComputedStyle(p1.querySelector('[data-shared-segment-context] [data-shared-reading-body="true"]')).textIndent) > 16,
          c1AlignedSpeaker: Boolean(c1.querySelector('[data-shared-segment-context] [data-shared-turn-aligned-grid]')),
          studyBoxJustified: [...document.querySelectorAll('[data-shared-reading-kind="study-box"]')].every(el => getComputedStyle(el).textAlign === 'justify'),
          studyBoxButtonsNotJustified: [...document.querySelectorAll('[data-shared-segment-study-box] button')].every(b => getComputedStyle(b).textAlign !== 'justify'),
          pendingControlsDisabled: studyBoxes.every(box => (
            box.querySelector('[data-study-box-action="play-en"]').disabled
            && box.querySelector('[data-study-box-action="play-id"]').disabled
            && box.querySelector('[data-study-box-action="play-continue"]').disabled
            && !box.querySelector('[data-study-box-action="play-segment"]').disabled
          )),
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          zeroPlaybackCalls: window.__packetC.getPlaybackLog().length === 0
        };
      })()`);

      assert.equal(segOverview.cardCount, 4);
      assert.equal(segOverview.unitCount, 11);
      assert.equal(segOverview.studyBoxCount, 4, 'Must render EXACTLY 4 Study Boxes (one per Card, never 11)');
      assert.equal(segOverview.contextIdsExact37, true);
      assert.equal(segOverview.contextTextExact37, true, 'All 37 natural context sentences must match London fixture verbatim');
      assert.equal(segOverview.p1UnitPickerCount, 2);
      assert.deepEqual(segOverview.p1LocalSegNums, ['1', '2', '3', '4']);
      assert.equal(segOverview.c1UnitPickerCount, 4);
      assert.deepEqual(segOverview.c1LocalSegNums, ['1', '2', '3']);
      assert.equal(segOverview.p2HasNoUnitPicker, true, 'Single-Unit Card P2 must hide redundant Unit picker');
      assert.deepEqual(segOverview.p2LocalSegNums, ['1', '2', '3', '4', '5']);
      assert.equal(segOverview.c2UnitPickerCount, 4);
      assert.deepEqual(segOverview.c2LocalSegNums, ['1', '2', '3']);
      assert.equal(segOverview.p1NaturalIndent, true, 'Natural Paragraph context must preserve first-line indent');
      assert.equal(segOverview.c1AlignedSpeaker, true, 'Natural Conversation context must preserve Aligned speaker layout');
      assert.equal(segOverview.studyBoxJustified, true, 'Shared Justify alignment must apply to Study Box reading bodies');
      assert.equal(segOverview.studyBoxButtonsNotJustified, true);
      assert.equal(segOverview.pendingControlsDisabled, true, 'Unsupported EN/ID/Continue scopes must stay cleanly disabled');
      assert.equal(segOverview.noOverflow, true);
      assert.equal(segOverview.zeroPlaybackCalls, true);

      await captureFullPage('06-segment-mode-all-four-study-boxes.png');
    });

    await run('4B3-2: Per-Unit selection memory (SC1 SG3 <-> SC2 SG2), tap-to-select silent update, Play Segment & Return to Playing', async () => {
      const ids = await evaluate('window.__packetC.londonIds');
      const p1Id = ids.cards.P1;
      const p1Sc1Id = ids.units.P1_SC1;
      const p1Sc2Id = ids.units.P1_SC2;
      const p1Sc1Sg3 = ids.segmentIdsByUnitKey.P1_SC1[2];
      const p1Sc2Sg2 = ids.segmentIdsByUnitKey.P1_SC2[1];

      // P1: Select SC1 SG3 -> SC2 SG2 -> return to SC1 (restores SG3!) -> return to SC2 (restores SG2!)
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc1Sg3}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc1Id}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg3,
        'Returning to SC1 must restore remembered SG3'
      );
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc2Sg2,
        'Returning to SC2 must restore remembered SG2'
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentLocalIndex`),
        '2'
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc2Sg2}"]').dataset.sharedSegmentSelected`),
        'true',
        'Selected segment must be highlighted distinctly in natural context'
      );
      assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0, 'Unit/Segment selection must trigger zero audio');
      await captureElement(`[data-shared-card-id="${p1Id}"]`, '07-segment-p1-sc2-selection.png');

      // C1: Tap directly on context sentence T2 SG2 -> selects T2 Ticket Officer SG2 in Study Box silently!
      const c1Id = ids.cards.C1;
      const c1T2Id = ids.units.C1_T2;
      const c1T3Id = ids.units.C1_T3;
      const c1T1Sg1 = ids.segmentIdsByUnitKey.C1_T1[0];
      const c1T2Sg2 = ids.segmentIdsByUnitKey.C1_T2[1];
      const c1T3Sg1 = ids.segmentIdsByUnitKey.C1_T3[0];

      await click(`[data-shared-card-id="${c1Id}"] [data-shared-segment-context] [data-shared-card-segment="${c1T2Sg2}"]`);
      await waitFrames();
      const c1TapCheck = await evaluate(`(() => {
        const box = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]');
        return {
          focusId: box.dataset.sharedSegmentFocus,
          focusUnitId: box.dataset.sharedSegmentFocusUnitId,
          localIdx: box.dataset.sharedSegmentLocalIndex,
          speaker: box.querySelector('[data-shared-segment-speaker-name]')?.textContent?.trim(),
          enText: box.querySelector('[data-study-box-text]')?.textContent?.trim(),
          idText: box.querySelector('[data-study-box-meaning]')?.textContent?.trim(),
          zeroAudio: window.__packetC.getPlaybackLog().length === 0
        };
      })()`);
      assert.equal(c1TapCheck.focusId, c1T2Sg2);
      assert.equal(c1TapCheck.focusUnitId, c1T2Id);
      assert.equal(c1TapCheck.localIdx, '2');
      assert.equal(c1TapCheck.speaker, 'Ticket Officer');
      assert.equal(c1TapCheck.enText, 'The journey usually takes about two hours, depending on the service.');
      assert.equal(c1TapCheck.idText, 'Perjalanan biasanya memakan waktu sekitar dua jam, tergantung layanannya.');
      assert.equal(c1TapCheck.zeroAudio, true, 'Tap-to-select in context must NEVER start playback');

      // C1 Unit memory: T2 SG2 -> T3 SG1 -> return to T2 restores SG2!
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T3Id}"]`);
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`), c1T3Sg1);
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T2Id}"]`);
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`), c1T2Sg2);
      await captureElement(`[data-shared-card-id="${c1Id}"]`, '08-segment-c1-turn-speaker-selection.png');

      // Explicit Play Segment in Study Box invokes verified onPlaySegment(c1T2Sg2); browsing away keeps playback & shows Return to Playing!
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-action="play-segment"]`);
      await until(`document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${c1T2Sg2}"`, 'Play Segment started exact segment');
      const cancelsBeforeBrowse = await evaluate('window.__packetC.getUatCancels()');
      await click(`[data-shared-card-id="${c1Id}"] [data-shared-segment-context] [data-shared-card-segment="${c1T1Sg1}"]`);
      await waitFrames();
      assert.equal(await evaluate('window.__packetC.getUatCancels()'), cancelsBeforeBrowse, 'Tap-to-select while playing must NOT cancel audio');
      assert.equal(await evaluate('document.querySelector("[data-unified-reader]").dataset.readerCursorSegment'), c1T2Sg2);
      assert.ok(await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-study-box-return-to-playing="true"]')?.textContent?.includes('T2 Ticket Officer SG2')`));

      // Pause playback -> distinct paused highlight state on c1T2Sg2 while c1T1Sg1 stays selected!
      await clickButtonText('Pause');
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-card-segment="${c1T2Sg2}"]').dataset.sharedSegmentPaused`),
        'true',
        'Paused segment must have distinct paused visual state'
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-card-segment="${c1T1Sg1}"]').dataset.sharedSegmentSelected`),
        'true',
        'Selected segment must remain visually distinct from paused audio position'
      );

      // Click Return to Playing -> restores Study Box to T2 SG2 cleanly without cancelling paused session
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-return-to-playing="true"]`);
      await waitFrames();
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`), c1T2Sg2);
      assert.equal(await evaluate('window.__packetC.getUatCancels()'), cancelsBeforeBrowse);

      await clickButtonText('Stop');
      await evaluate('window.__packetC.finishLatestUatEvent("stopped")');
      await until('document.querySelector("[data-unified-reader]").dataset.readerCursorPrecision === "none"', 'Playback stopped');
    });

    await run('4B3-3: Primary ID context + Complete Stress Fixture empty Units + 390px Mobile & Dark Theme', async () => {
      // Switch to ID Only -> context switches to ID while Study Box STILL displays BOTH EN & ID!
      await click('[data-shared-card-layout-option="meaning-only"]');
      await waitFrames();
      const idContextCheck = await evaluate(`(() => {
        const ctx = document.querySelector('[data-shared-segment-context]');
        const box = document.querySelector('[data-shared-segment-study-box]');
        return {
          ctxChannel: ctx.dataset.sharedSegmentContextChannel,
          hasEnInBox: Boolean(box.querySelector('[data-study-box-text]')?.textContent?.trim()),
          hasIdInBox: Boolean(box.querySelector('[data-study-box-meaning]')?.textContent?.trim())
        };
      })()`);
      assert.equal(idContextCheck.ctxChannel, 'meaning');
      assert.equal(idContextCheck.hasEnInBox, true);
      assert.equal(idContextCheck.hasIdInBox, true);

      // Restore default Combined/EN context and capture 390px mobile + dark theme screenshot
      await click('[data-shared-card-layout-option="interlinear"]');
      await setViewport({ width: 390, height: 844, mobile: true });
      await evaluate('window.__packetC.setDark(true)');
      await waitFrames();
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, '390px mobile Segment Mode must have zero page overflow');
      const c1Id = await evaluate('window.__packetC.londonIds.cards.C1');
      await captureElement(`[data-shared-card-id="${c1Id}"]`, '09-segment-mobile-390-dark-theme.png', 12);
      await evaluate('window.__packetC.setDark(false)');
      await setViewport({ width: 1280, height: 900, mobile: false });

      // Complete Stress Fixture: empty Section & empty Turn render safe Study Box empty states without fake segments
      await evaluate('window.__packetC.setWorkspace("stress")');
      await until('document.querySelector("[data-shared-workspace-id]")?.dataset.sharedWorkspaceId === window.__packetC.stressIds.documentId', 'Stress fixture in Segment Mode');
      const stressIds = await evaluate('window.__packetC.stressIds');
      await click(`[data-shared-card-id="${stressIds.paragraphStressCardId}"] [data-study-box-unit-id="${stressIds.emptySectionId}"]`);
      await click(`[data-shared-card-id="${stressIds.conversationStressCardId}"] [data-study-box-unit-id="${stressIds.emptyTurnId}"]`);
      await waitFrames();
      const stressEmptyCheck = await evaluate(`(() => {
        const pBox = document.querySelector('[data-shared-card-id="${stressIds.paragraphStressCardId}"] [data-shared-segment-study-box]');
        const cBox = document.querySelector('[data-shared-card-id="${stressIds.conversationStressCardId}"] [data-shared-segment-study-box]');
        const pCtxText = document.querySelector('[data-shared-card-id="${stressIds.paragraphStressCardId}"] [data-shared-segment-context]').textContent;
        return {
          pEmptyNotice: Boolean(pBox.querySelector('[data-study-box-empty-unit]')),
          pPlayDisabled: pBox.querySelector('[data-study-box-action="play-segment"]').disabled,
          cEmptyNotice: Boolean(cBox.querySelector('[data-study-box-empty-unit]')),
          cPlayDisabled: cBox.querySelector('[data-study-box-action="play-segment"]').disabled,
          joinNonePreserved: pCtxText.includes('Platform 4—direct express service'),
          hasLineBreak: Boolean(document.querySelector('[data-shared-card-id="${stressIds.paragraphStressCardId}"] [data-shared-segment-context] br')),
          studyBoxCount: document.querySelectorAll('[data-shared-segment-study-box]').length
        };
      })()`);
      assert.equal(stressEmptyCheck.pEmptyNotice, true);
      assert.equal(stressEmptyCheck.pPlayDisabled, true);
      assert.equal(stressEmptyCheck.cEmptyNotice, true);
      assert.equal(stressEmptyCheck.cPlayDisabled, true);
      assert.equal(stressEmptyCheck.joinNonePreserved, true, 'joinAfter=none must remain preserved in natural context');
      assert.equal(stressEmptyCheck.hasLineBreak, true, 'joinAfter=line must remain preserved in natural context');
      assert.equal(stressEmptyCheck.studyBoxCount, 3, '3 Stress Cards -> exactly 3 Study Boxes');
    });

    await run('4B3-4: Representative Main App host (TextStructuredPlayer) integrates Focus & Segment Study Box cleanly with Card Visibility & reload persistence', async () => {
      await call('Page.navigate', { url: `${origin}/?host=main&doc=london` });
      await until('window.__packetCMain && document.querySelector("[data-main-app-host-harness]")', 'Main App host mounted for 4B3');
      await evaluate('window.__packetC.clearPlaybackLog()');

      // Switch Main App host to Segment Mode -> 4 Cards, 4 Study Boxes, Card Audio controls intact
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Main App 4 Study Boxes');
      await waitFrames();

      const ids = await evaluate('window.__packetC.londonIds');
      const targetSeg = ids.segmentIdsByUnitKey.P1_SC2[2];
      // Tap-to-select in Main App context must be silent (0 playback calls!)
      await click(`[data-shared-card-id="${ids.cards.P1}"] [data-shared-segment-context] [data-shared-card-segment="${targetSeg}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${ids.cards.P1}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        targetSeg
      );
      assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0, 'Main App tap-to-select must trigger 0 playback calls');

      // Explicit Play Segment in Main App Study Box invokes verified onPlaySegment(targetSeg)
      await click(`[data-shared-card-id="${ids.cards.P1}"] [data-study-box-action="play-segment"]`);
      const log = await evaluate('window.__packetC.getPlaybackLog()');
      assert.deepEqual(log[log.length - 1], ['main:playSegment', targetSeg]);

      // Card Audio Panel still opens cleanly from Main App host
      await click('[aria-label="Open card audio controls"]');
      await until('document.querySelector("[data-text-card-audio-panel]")', 'Main App Card Audio Panel opened');
      await click('[aria-label="Close audio settings"]');
      await until('!document.querySelector("[data-text-card-audio-panel]")', 'Main App Card Audio Panel closed');

      // Capture representative Main App host screenshot showing Segment Study Boxes + Main App toolbar & Card Audio controls
      await captureFullPage('10-main-app-host-segment-study-boxes.png');

      // Verify reload restores Segment mode in Main App key without leaking into Isolated UAT key
      const prevOrigin = await evaluate('performance.timeOrigin');
      await call('Page.reload');
      await until(`performance.timeOrigin !== ${prevOrigin} && document.querySelectorAll("[data-shared-segment-study-box]").length === 4`, 'Main App reloaded Segment Mode');
      const savedMain = await evaluate('JSON.parse(localStorage.getItem(window.__packetC.MAIN_STORAGE_KEY))');
      assert.equal(savedMain.readerMode, 'segment');
      assert.equal(savedMain.view.level, 'segment');
    });
  }
  }

  if (!gate4B2Only) {
    // =========================================================================
    // C-HF1 — STABLE SELECTION OWNERSHIP, EXPLICIT MANUAL-FOLLOW & PAUSED CHANNEL
    // =========================================================================
    if (!onlyCHF2) {
    await run('C-HF1-1: Isolated UAT — P1 (SC1 SG3, SC2 SG2) & independent C1 selections survive Full/Card/Focus/collapse/layout/visibility/style round-trips', async () => {
      await call('Page.navigate', { url: `${origin}/?host=uat&doc=london` });
      await until('window.__packetC && document.querySelector("[data-structured-workspace-player]")', 'UAT host mounted for C-HF1-1');
      await clickButtonText('Shared UI (Beta)');
      await until('document.querySelector("[data-shared-card-bilingual-toolbar]")', 'UAT shared toolbar');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'UAT 4 Study Boxes');
      await evaluate('window.__packetC.clearPlaybackLog()');

      const ids = await evaluate('window.__packetC.londonIds');
      const p1Id = ids.cards.P1;
      const c1Id = ids.cards.C1;
      const p1Sc1Id = ids.units.P1_SC1;
      const p1Sc2Id = ids.units.P1_SC2;
      const p1Sc1Sg3 = ids.segmentIdsByUnitKey.P1_SC1[2];
      const p1Sc2Sg2 = ids.segmentIdsByUnitKey.P1_SC2[1];
      const c1T2Id = ids.units.C1_T2;
      const c1T3Id = ids.units.C1_T3;
      const c1T2Sg2 = ids.segmentIdsByUnitKey.C1_T2[1];
      const c1T3Sg3 = ids.segmentIdsByUnitKey.C1_T3[2];

      // Select P1 SC1 SG3 -> P1 SC2 SG2, and independently C1 T2 SG2 -> C1 T3 SG3
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc1Sg3}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T2Id}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-shared-segment-pill="${c1T2Sg2}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T3Id}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-shared-segment-pill="${c1T3Sg3}"]`);
      await waitFrames();

      await captureElement(`[data-shared-card-id="${p1Id}"]`, 'chf1-01-uat-segment-before-full-roundtrip.png');

      // Round-trip 1: Segment -> Full -> Segment (unmounts all Cards!)
      await click('[data-shared-reader-mode-option="full"]');
      await until('document.querySelector("[data-shared-book-page=true]")', 'Switched to Full');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Returned to Segment after Full');

      // Round-trip 2: Segment -> Focus -> Segment
      await click('[data-shared-reader-mode-option="focus"]');
      await until('document.querySelector("[data-shared-focus-view=true]")', 'Switched to Focus');
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-part-focused]').dataset.sharedPartFocusedUnitId`),
        p1Sc2Id,
        'Focus Mode must inherit stable P1 SC2 Unit selection'
      );
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Returned to Segment after Focus');

      // Round-trip 3: Segment -> Card -> Segment
      await click('[data-shared-reader-mode-option="card"]');
      await until('!document.querySelector("[data-shared-segment-study-box]") && document.querySelector("[data-shared-cards-list]")', 'Switched to Card');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Returned to Segment after Card');

      // Round-trip 4: Collapse P1 -> Reopen P1
      await click(`[data-shared-card-toggle="${p1Id}"]`);
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"]').dataset.sharedCardExpanded === "false"`, 'P1 collapsed');
      await click(`[data-shared-card-toggle="${p1Id}"]`);
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"]').dataset.sharedCardExpanded === "true"`, 'P1 reopened');

      // Round-trip 5: Bilingual layout changes + Card Visibility changes + Workspace Style changes
      await click('[data-shared-card-layout-option="separated"]');
      await click('[data-shared-card-layout-option="meaning-only"]');
      await click('[data-shared-card-layout-option="interlinear"]');
      await click('[data-shared-card-visibility-option="all"]');
      await click('[data-shared-workspace-align-option="left"]');
      await click('[data-shared-workspace-speaker-option="stacked"]');
      await click('[data-shared-workspace-style-reset="true"]');
      await waitFrames();

      // Verify P1 still has SC2 SG2 active, SC1 still restores SG3, and C1 still holds T3 SG3 & T2 SG2!
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc2Sg2,
        'P1 SC2 SG2 must survive all mode, collapse, layout, visibility and style round-trips'
      );
      await captureElement(`[data-shared-card-id="${p1Id}"]`, 'chf1-02-uat-segment-after-full-roundtrip.png');

      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc1Id}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg3,
        'P1 SC1 SG3 per-Unit memory must survive all round-trips'
      );
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc2Sg2
      );

      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        c1T3Sg3,
        'C1 independent T3 SG3 selection must survive all round-trips'
      );
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T2Id}"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        c1T2Sg2,
        'C1 independent T2 SG2 per-Unit memory must survive all round-trips'
      );
      assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0, 'Round-trips must trigger zero playback');
    });

    await run('C-HF1-2: Isolated UAT — Explicit manual-follow (>2000ms past old 1800ms grace), Return to Playing, Search reveal restoration, deletion recovery & Workspace isolation', async () => {
      const ids = await evaluate('window.__packetC.londonIds');
      const p1Id = ids.cards.P1;
      const p1Sc1Sg1 = ids.segmentIdsByUnitKey.P1_SC1[0];
      const p1Sc1Sg2 = ids.segmentIdsByUnitKey.P1_SC1[1];
      const p1Sc1Sg3 = ids.segmentIdsByUnitKey.P1_SC1[2];
      const p1Sc1Sg4 = ids.segmentIdsByUnitKey.P1_SC1[3];
      const p1Sc2Id = ids.units.P1_SC2;
      const p1Sc2Sg1 = ids.segmentIdsByUnitKey.P1_SC2[0];
      const p1Sc2Sg2 = ids.segmentIdsByUnitKey.P1_SC2[1];

      // Start playing P1 from start (SG1) while P1 has manual selection on SC2 SG2
      const eventsBefore = await evaluate('window.__packetC.getUatEvents().length');
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-card-play="true"]`);
      await until(`window.__packetC.getUatEvents().length > ${eventsBefore} && document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${p1Sc1Sg1}"`, 'P1 SC1 SG1 started');

      // Re-assert manual browse to P1 SC2 SG2 while playing
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await waitFrames();

      // Wait 2,050 ms (> 1,800 ms old timer grace window!) then advance playback cursor TWICE (SG1 -> SG2 -> SG3)
      await new Promise(resolve => setTimeout(resolve, 2050));
      await evaluate('window.__packetC.finishLatestUatEvent("played")');
      await until(`document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${p1Sc1Sg2}"`, 'Playback advanced to SG2');
      await evaluate('window.__packetC.finishLatestUatEvent("played")');
      await until(`document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${p1Sc1Sg3}"`, 'Playback advanced to SG3');
      await waitFrames();

      const heldAfterGrace = await evaluate(`(() => {
        const p1 = document.querySelector('[data-shared-card-id="${p1Id}"]');
        const box = p1.querySelector('[data-shared-segment-study-box]');
        const activePlayingSeg = p1.querySelector('[data-shared-segment-context] [data-shared-card-segment="${p1Sc1Sg3}"]');
        const selectedSeg = p1.querySelector('[data-shared-segment-context] [data-shared-card-segment="${p1Sc2Sg2}"]');
        const rtn = p1.querySelector('[data-study-box-return-to-playing="true"]');
        return {
          studyBoxFocus: box.dataset.sharedSegmentFocus,
          cursorSegment: document.querySelector('[data-unified-reader]').dataset.readerCursorSegment,
          playingHighlighted: activePlayingSeg?.dataset.textPlayerSegmentActive === 'true',
          selectedStillMarked: selectedSeg?.dataset.sharedSegmentSelected === 'true',
          returnText: rtn ? rtn.textContent.replace(/\\s+/g, ' ').trim() : null
        };
      })()`);
      assert.equal(heldAfterGrace.studyBoxFocus, p1Sc2Sg2, 'Manual selection SC2 SG2 must NOT be stolen after >1800ms + cursor advancements');
      assert.equal(heldAfterGrace.cursorSegment, p1Sc1Sg3, 'Actual playback cursor must advance normally to SG3');
      assert.equal(heldAfterGrace.playingHighlighted, true, 'Actual playing segment SG3 must remain accurately highlighted');
      assert.equal(heldAfterGrace.selectedStillMarked, true, 'Selected segment SC2 SG2 must remain distinctly marked');
      assert.ok(heldAfterGrace.returnText && heldAfterGrace.returnText.includes('Return to Playing') && heldAfterGrace.returnText.includes('SC1 SG3'));

      await captureElement(`[data-shared-card-id="${p1Id}"]`, 'chf1-03-manual-selection-vs-advancing-playback.png');

      // Explicit Return to Playing restores SC1 SG3 AND resumes following when playback advances to SG4!
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-return-to-playing="true"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg3,
        'Return to Playing must restore authoritative playing segment SG3'
      );
      await evaluate('window.__packetC.finishLatestUatEvent("played")');
      await until(`document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${p1Sc1Sg4}"`, 'Playback advanced to SG4');
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg4,
        'After Return to Playing, Study Box must resume following subsequent cursor advancement to SG4'
      );

      // Stop playback cleanly
      await clickButtonText('Stop');
      await evaluate('window.__packetC.finishLatestUatEvent("stopped")');
      await until('document.querySelector("[data-unified-reader]").dataset.readerCursorPrecision === "none"', 'Playback stopped');

      // Re-select P1 SC2 SG2, then run Search for a segment in SC1 -> search reveals transiently, then restores SC2 SG2!
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await waitFrames();
      await evaluate(`(() => {
        const input = document.querySelector('input[aria-label="Find Sentence"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'woke up earlier than usual');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await clickButtonText('Find');
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus === "${p1Sc1Sg1}"`, 'Search transiently revealed SC1 SG1');
      // Wait for onFocusConsumed (1400ms) -> prior manual selection SC2 SG2 must restore automatically!
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus === "${p1Sc2Sg2}"`, 'Prior manual selection SC2 SG2 restored after search reveal consumed');

      // Selected Segment deletion recovery (disposable derived clone; authoritative London stays untouched!)
      await evaluate(`window.__packetC.deleteSegmentInDisposableClone(${JSON.stringify(p1Sc2Sg2)})`);
      await waitFrames();
      const afterDeletion = await evaluate(`(() => {
        const box = document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]');
        return {
          focusUnitId: box.dataset.sharedSegmentFocusUnitId,
          focusSegId: box.dataset.sharedSegmentFocus
        };
      })()`);
      assert.equal(afterDeletion.focusUnitId, p1Sc2Id, 'Surviving Unit SC2 must stay selected after Segment deletion');
      assert.equal(afterDeletion.focusSegId, p1Sc2Sg1, 'Deleted Segment must recover safely to first valid Segment in SC2');
      await evaluate('window.__packetC.clearDerivedOverride()');
      await waitFrames();

      // Workspace isolation (SAME mounted Reader + overlapping local IDs TEXT_000001/TEXT_000002, different Workspace UID!):
      // Switching to Stress must NEVER inherit London's P1 SC2 SG2 or C1 T2 SG2 selection!
      await evaluate('window.__packetC.setWorkspace("stress")');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 3', 'Switched to Stress (3 Cards)');
      await waitFrames();
      const stressIsolation = await evaluate(`(() => {
        const sIds = window.__packetC.stressIds;
        const card1Box = document.querySelector('[data-shared-card-id="' + sIds.titleCardId + '"] [data-shared-segment-study-box]');
        const card2Box = document.querySelector('[data-shared-card-id="' + sIds.paragraphStressCardId + '"] [data-shared-segment-study-box]');
        return {
          card1LocalIdx: card1Box?.dataset.sharedSegmentLocalIndex,
          card2LocalIdx: card2Box?.dataset.sharedSegmentLocalIndex,
          card2FocusUnit: card2Box?.dataset.sharedSegmentFocusUnitId
        };
      })()`);
      assert.equal(stressIsolation.card1LocalIdx, '1', 'Stress Card 1 must start clean at SG1 without inheriting London P1 SC2 SG2');
      assert.equal(stressIsolation.card2LocalIdx, '1', 'Stress Card 2 must start clean at SG1 without inheriting London C1 T2 SG2');
      assert.notEqual(stressIsolation.card2FocusUnit, await evaluate('window.__packetC.stressIds.emptySectionId'));
      await evaluate('window.__packetC.setWorkspace("london")');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Back on London (4 Cards)');
    });

    await run('C-HF1-3: Isolated UAT — Channel-specific paused highlight (EN paused never styles ID; ID paused never styles EN)', async () => {
      const ids = await evaluate('window.__packetC.londonIds');
      const p1Id = ids.cards.P1;
      const p1Sc1Sg1 = ids.segmentIdsByUnitKey.P1_SC1[0];

      // Card Mode + Separated layout displays BOTH EN and ID spans for P1 SC1 SG1 simultaneously
      await click('[data-shared-reader-mode-option="card"]');
      await click('[data-shared-card-layout-option="separated"]');
      await waitFrames();

      // Set QA Audio Channel to EN -> ID so we can pause on EN, then advance and pause on ID!
      await evaluate(`(() => {
        const select = document.querySelector('select[aria-label="Audio channel"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, 'text-meaning');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFrames();

      const eventsBefore = await evaluate('window.__packetC.getUatEvents().length');
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-card-play="true"]`);
      await until(`window.__packetC.getUatEvents().length > ${eventsBefore} && document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-status-pill]')?.textContent?.includes('Playing EN')`, 'Playing EN on P1 SC1 SG1');

      await clickButtonText('Pause');
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-status-pill]')?.textContent?.includes('Paused EN')`, 'Paused on EN');
      await waitFrames();

      const enPausedCheck = await evaluate(`(() => {
        const en = document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg1}"][data-shared-card-channel="text"]');
        const id = document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg1}"][data-shared-card-channel="meaning"]');
        return {
          enPausedAttr: en?.dataset.sharedSegmentPaused || null,
          idPausedAttr: id?.dataset.sharedSegmentPaused || null,
          enClassHasAmber: Boolean(en?.className.includes('amber')),
          idClassHasAmber: Boolean(id?.className.includes('amber'))
        };
      })()`);
      assert.equal(enPausedCheck.enPausedAttr, 'true', 'EN span must be marked paused when EN is paused');
      assert.equal(enPausedCheck.enClassHasAmber, true, 'EN span must receive amber paused style');
      assert.equal(enPausedCheck.idPausedAttr, null, 'ID span must NOT be marked paused when EN is paused');
      assert.equal(enPausedCheck.idClassHasAmber, false, 'ID span must NOT receive amber paused style when EN is paused');
      await captureElement(`[data-shared-card-id="${p1Id}"]`, 'chf1-04-paused-channel-en-only.png');

      // Resume EN -> advance into ID channel of the SAME segment -> Pause on ID!
      await clickButtonText('Resume');
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-status-pill]')?.textContent?.includes('Playing EN')`, 'Resumed EN');
      await evaluate('window.__packetC.finishLatestUatEvent("played")');
      await until(`document.querySelector('[data-unified-reader]').dataset.readerCursorSegment === "${p1Sc1Sg1}" && document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-status-pill]')?.textContent?.includes('Playing ID')`, 'Playing ID on P1 SC1 SG1');
      await clickButtonText('Pause');
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-status-pill]')?.textContent?.includes('Paused ID')`, 'Paused on ID');
      await waitFrames();

      const idPausedCheck = await evaluate(`(() => {
        const en = document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg1}"][data-shared-card-channel="text"]');
        const id = document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg1}"][data-shared-card-channel="meaning"]');
        return {
          enPausedAttr: en?.dataset.sharedSegmentPaused || null,
          idPausedAttr: id?.dataset.sharedSegmentPaused || null,
          enClassHasAmber: Boolean(en?.className.includes('amber')),
          idClassHasAmber: Boolean(id?.className.includes('amber'))
        };
      })()`);
      assert.equal(idPausedCheck.idPausedAttr, 'true', 'ID span must be marked paused when ID is paused');
      assert.equal(idPausedCheck.idClassHasAmber, true, 'ID span must receive amber paused style');
      assert.equal(idPausedCheck.enPausedAttr, null, 'EN span must NOT be marked paused when ID is paused');
      assert.equal(idPausedCheck.enClassHasAmber, false, 'EN span must NOT receive amber paused style when ID is paused');
      await captureElement(`[data-shared-card-id="${p1Id}"]`, 'chf1-05-paused-channel-id-only.png');

      await clickButtonText('Stop');
      await evaluate('window.__packetC.finishLatestUatEvent("stopped")');
      await until('document.querySelector("[data-unified-reader]").dataset.readerCursorPrecision === "none"', 'Playback stopped after pause test');
    });

    await run('C-HF1-4: Main App Host (TextStructuredPlayer) — Stable selection round-trips, >2000ms manual-follow, Return to Playing, Search restoration, deletion recovery, paused channel & single scroll owner', async () => {
      await call('Page.navigate', { url: `${origin}/?host=main&doc=london` });
      await sleep(250);
      await until('window.__packetCMain && document.querySelector("[data-main-app-host-harness]")', 'Main App mounted for C-HF1-4');
      await click('[data-main-host-reader="shared"]');
      await until('document.querySelector("[data-shared-card-bilingual-toolbar]")', 'Main App Shared ready');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Main App 4 Study Boxes');
      await evaluate('window.__packetC.clearPlaybackLog()');

      const ids = await evaluate('window.__packetC.londonIds');
      const p1Id = ids.cards.P1;
      const c1Id = ids.cards.C1;
      const p1Sc1Id = ids.units.P1_SC1;
      const p1Sc2Id = ids.units.P1_SC2;
      const p1Sc1Sg1 = ids.segmentIdsByUnitKey.P1_SC1[0];
      const p1Sc1Sg2 = ids.segmentIdsByUnitKey.P1_SC1[1];
      const p1Sc1Sg3 = ids.segmentIdsByUnitKey.P1_SC1[2];
      const p1Sc2Sg1 = ids.segmentIdsByUnitKey.P1_SC2[0];
      const p1Sc2Sg2 = ids.segmentIdsByUnitKey.P1_SC2[1];
      const c1T2Id = ids.units.C1_T2;
      const c1T2Sg2 = ids.segmentIdsByUnitKey.C1_T2[1];

      // Select P1 SC1 SG3 -> P1 SC2 SG2, and C1 T2 SG2
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc1Sg3}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-study-box-unit-id="${c1T2Id}"]`);
      await click(`[data-shared-card-id="${c1Id}"] [data-shared-segment-pill="${c1T2Sg2}"]`);
      await waitFrames();

      // Round-trip: Full -> Focus -> Card -> Segment + Collapse/Reopen P1 + layout + style + visibility
      await click('[data-shared-reader-mode-option="full"]');
      await until('document.querySelector("[data-shared-book-page=true]")', 'Main App Full');
      await click('[data-shared-reader-mode-option="focus"]');
      await until('document.querySelector("[data-shared-focus-view=true]")', 'Main App Focus');
      await click('[data-shared-reader-mode-option="card"]');
      await until('!document.querySelector("[data-shared-focus-view]") && !document.querySelector("[data-shared-book-page]")', 'Main App Card');
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Main App back in Segment');

      // Collapse and reopen P1 via Main App's StructuredPlayerCard collapse button
      await click(`[data-text-player-card="${p1Id}"] button[aria-label="Collapse card"]`);
      await until(`!document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]')`, 'Main App P1 collapsed');
      await click(`[data-text-player-card="${p1Id}"] button[aria-label="Expand card"]`);
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]')`, 'Main App P1 reopened');

      await click('[data-shared-card-layout-option="separated"]');
      await click('[data-shared-card-layout-option="interlinear"]');
      await click('[data-text-card-expansion-mode="all"]');
      await click('[data-shared-workspace-align-option="left"]');
      await click('[data-shared-workspace-style-reset="true"]');
      await waitFrames();

      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc2Sg2,
        'Main App P1 SC2 SG2 must survive Full/Focus/Card/collapse/layout/style round-trips'
      );
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc1Id}"]`);
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg3,
        'Main App P1 SC1 SG3 memory must survive round-trips'
      );
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        c1T2Sg2,
        'Main App C1 independent T2 SG2 selection must survive round-trips'
      );

      // Spy on scrollIntoView calls to confirm single automatic scroll owner (0 competing scroll calls while manually pinned!)
      await evaluate(`(() => {
        window.__chf1ScrollCalls = 0;
        const orig = Element.prototype.scrollIntoView;
        window.__chf1OrigScrollIntoView = orig;
        Element.prototype.scrollIntoView = function(...args) {
          window.__chf1ScrollCalls += 1;
          return orig.apply(this, args);
        };
      })()`);

      // Simulate Main App playback advancing SG1 -> SG2 -> SG3 AFTER waiting >2,000 ms while manually pinned on SC2 SG2
      await evaluate(`window.__packetCMain.setActivePlayback({ sessionId: 501, state: 'playing', cardId: ${JSON.stringify(p1Id)}, unitId: ${JSON.stringify(p1Sc1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg1)}, channel: 'text', precision: 'segment' })`);
      await new Promise(resolve => setTimeout(resolve, 2050));
      await evaluate(`window.__packetCMain.setActivePlayback({ sessionId: 501, state: 'playing', cardId: ${JSON.stringify(p1Id)}, unitId: ${JSON.stringify(p1Sc1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg2)}, channel: 'text', precision: 'segment' })`);
      await waitFrames();
      await evaluate(`window.__packetCMain.setActivePlayback({ sessionId: 501, state: 'playing', cardId: ${JSON.stringify(p1Id)}, unitId: ${JSON.stringify(p1Sc1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg3)}, channel: 'text', precision: 'segment' })`);
      await waitFrames();

      const mainHeld = await evaluate(`({
        focus: document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus,
        scrollCallsWhileManuallyPinned: window.__chf1ScrollCalls
      })`);
      assert.equal(mainHeld.focus, p1Sc2Sg2, 'Main App manual selection SC2 SG2 must survive >2000ms + cursor progression');
      assert.equal(mainHeld.scrollCallsWhileManuallyPinned, 0, 'Manually pinned browsing across open Cards must trigger zero competing automatic page scrolls');

      // Restore scrollIntoView
      await evaluate('if (window.__chf1OrigScrollIntoView) Element.prototype.scrollIntoView = window.__chf1OrigScrollIntoView;');

      // Return to Playing -> restores SC1 SG3
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-return-to-playing="true"]`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc1Sg3
      );

      // Pause on EN -> switch to Card Separated to inspect both channels -> verify EN paused only, then ID paused only!
      await click('[data-shared-reader-mode-option="card"]');
      await click('[data-shared-card-layout-option="separated"]');
      await evaluate(`window.__packetCMain.setActivePlayback({ sessionId: 501, state: 'paused', cardId: ${JSON.stringify(p1Id)}, unitId: ${JSON.stringify(p1Sc1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg3)}, channel: 'text', precision: 'segment' })`);
      await waitFrames();
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg3}"][data-shared-card-channel="text"]').dataset.sharedSegmentPaused`), 'true');
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg3}"][data-shared-card-channel="meaning"]').dataset.sharedSegmentPaused || null`), null);

      await evaluate(`window.__packetCMain.setActivePlayback({ sessionId: 501, state: 'paused', cardId: ${JSON.stringify(p1Id)}, unitId: ${JSON.stringify(p1Sc1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg3)}, channel: 'meaning', precision: 'segment' })`);
      await waitFrames();
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg3}"][data-shared-card-channel="meaning"]').dataset.sharedSegmentPaused`), 'true');
      assert.equal(await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-card-segment="${p1Sc1Sg3}"][data-shared-card-channel="text"]').dataset.sharedSegmentPaused || null`), null);

      await evaluate('window.__packetCMain.setActivePlayback(null)');

      // Search reveal + deletion recovery on Main App host
      await click('[data-shared-reader-mode-option="segment"]');
      await until('document.querySelectorAll("[data-shared-segment-study-box]").length === 4', 'Main App Segment for search/deletion');
      await click(`[data-shared-card-id="${p1Id}"] [data-study-box-unit-id="${p1Sc2Id}"]`);
      await click(`[data-shared-card-id="${p1Id}"] [data-shared-segment-pill="${p1Sc2Sg2}"]`);
      await evaluate(`window.__packetCMain.setFocusTarget({ documentId: ${JSON.stringify(ids.documentId)}, blockId: ${JSON.stringify(p1Id)}, segmentId: ${JSON.stringify(p1Sc1Sg1)}, nonce: 777 })`);
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus === "${p1Sc1Sg1}"`, 'Main App transient search reveal');
      await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus === "${p1Sc2Sg2}"`, 'Main App prior manual selection restored after search consumed');

      await evaluate(`window.__packetC.deleteSegmentInDisposableClone(${JSON.stringify(p1Sc2Sg2)})`);
      await waitFrames();
      assert.equal(
        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-segment-study-box]').dataset.sharedSegmentFocus`),
        p1Sc2Sg1,
        'Main App deleted segment recovers safely to first valid segment in SC2'
      );
      await evaluate('window.__packetC.clearDerivedOverride()');
    });
    }

    // =========================================================================
    // C-HF2 — SWIPER HORIZONTAL CAROUSEL, SCROLL-DRIVEN VERTICAL FOCUS & A11Y
    // =========================================================================
    if (!gateCHF1Only && !onlyCHF1) {
      await run('C-HF2-1: Horizontal Focus (Swiper React) — First/Middle/Final midpoint centering (<=6px), real mouse drag, peeking neighbors & zero playback', async () => {
        // Verify guardrails on the prior tab and open a clean page target for gesture/scroll accuracy
        if (!onlyCHF2) {
          const priorGuard = await evaluate('({ dbCalls: window.__packetCDbCalls, errors: window.__packetCErrors, snapshotsUnchanged: window.__packetC.getSnapshotsUnchanged() })');
          assert.equal(priorGuard.dbCalls, 0);
          assert.deepEqual(priorGuard.errors, []);
          assert.equal(priorGuard.snapshotsUnchanged, true);
          await openFreshPage();
        }
        await setViewport({ width: 1280, height: 900, mobile: false });
        await call('Page.navigate', { url: `${origin}/?host=uat&doc=london` });
        await sleep(250);
        await until('window.__packetC && document.querySelector("[data-structured-workspace-player]")', 'UAT host mounted for C-HF2-1');
        await clickButtonText('Shared UI (Beta)');
        await until('document.querySelector("[data-shared-card-bilingual-toolbar]")', 'Toolbar mounted');
        await click('[data-shared-reader-mode-option="focus"]');
        await click('[data-shared-focus-orientation-option="horizontal-focus"]');
        await click('[data-shared-card-layout-option="separated"]');
        await until('document.querySelector("[data-shared-focus-carousel-engine=swiper]")', 'Swiper horizontal carousel mounted');
        await sleep(360);
        await waitFrames();
        await evaluate('window.__packetC.clearPlaybackLog()');

        const ids = await evaluate('window.__packetC.londonIds');
        const c1Id = ids.cards.C1;
        const p2Id = ids.cards.P2;
        const c1T1 = ids.units.C1_T1;
        const c1T2 = ids.units.C1_T2;
        const c1T3 = ids.units.C1_T3;
        const c1T4 = ids.units.C1_T4;

        // Single-Unit P2 completely bypasses Swiper carousel mechanics
        const p2Bypass = await evaluate(`(() => {
          const p2 = document.querySelector('[data-shared-card-id="${p2Id}"]');
          return {
            singleUnit: Boolean(p2.querySelector('[data-shared-focus-single-unit="true"]')),
            hasSwiper: Boolean(p2.querySelector('.swiper')),
            hasRail: Boolean(p2.querySelector('[data-shared-focus-rail]'))
          };
        })()`);
        assert.equal(p2Bypass.singleUnit, true);
        assert.equal(p2Bypass.hasSwiper, false, 'Single-Unit P2 must bypass Swiper');
        assert.equal(p2Bypass.hasRail, false);

        // Scroll C1 into view so we can perform real pointer drags and measure true midpoints
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"]').scrollIntoView({ behavior: 'instant', block: 'center' })`);
        await waitFrames();

        const measureCentering = () => evaluate(`(() => {
          const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
          const track = c1.querySelector('[data-shared-part-track="horizontal"]');
          const activeSlide = c1.querySelector('[data-shared-part-slide][data-shared-part-active="true"]');
          const tr = track.getBoundingClientRect();
          const sr = activeSlide.getBoundingClientRect();
          const trackMid = tr.left + tr.width / 2;
          const slideMid = sr.left + sr.width / 2;
          return {
            activeUnitId: activeSlide.dataset.sharedPartSlideUnitId,
            trackWidth: Math.round(tr.width),
            slideWidth: Math.round(sr.width),
            trackMid: Math.round(trackMid * 10) / 10,
            slideMid: Math.round(slideMid * 10) / 10,
            midpointDeltaPx: Math.round(Math.abs(slideMid - trackMid) * 10) / 10,
            dragStartX: Math.round(sr.left + sr.width * 0.72),
            dragEndXLeft: Math.round(sr.left + sr.width * 0.18),
            dragStartXRight: Math.round(sr.left + sr.width * 0.25),
            dragEndXRight: Math.round(sr.left + sr.width * 0.80),
            dragY: Math.round(sr.top + Math.min(120, sr.height * 0.4)),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
          };
        })()`);

        // 1. First slide (T1) must be genuinely centered (<= 6px tolerance)
        const firstMetrics = await measureCentering();
        assert.equal(firstMetrics.activeUnitId, c1T1);
        assert.ok(firstMetrics.midpointDeltaPx <= 6, `First slide midpoint delta ${firstMetrics.midpointDeltaPx}px exceeded 6px tolerance`);
        assert.equal(firstMetrics.noOverflow, true);
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-01-horizontal-first-unit.png');

        // 2. Real desktop mouse drag LEFT across active slide -> advances T1 -> T2 (NO Next click!)
        await mouseDrag({
          startX: firstMetrics.dragStartX,
          startY: firstMetrics.dragY,
          endX: firstMetrics.dragEndXLeft,
          endY: firstMetrics.dragY
        });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T2}"`, 'Real mouse drag advanced T1 -> T2');
        await sleep(360);
        await waitFrames();

        const middleMetrics = await measureCentering();
        assert.equal(middleMetrics.activeUnitId, c1T2);
        assert.ok(middleMetrics.midpointDeltaPx <= 6, `Middle slide midpoint delta ${middleMetrics.midpointDeltaPx}px exceeded 6px tolerance`);
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-02-horizontal-middle-unit.png');

        // 3. Real desktop mouse drag LEFT again -> T2 -> T3, then T3 -> T4 (final slide)!
        await mouseDrag({
          startX: middleMetrics.dragStartX,
          startY: middleMetrics.dragY,
          endX: middleMetrics.dragEndXLeft,
          endY: middleMetrics.dragY
        });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T3}"`, 'Real mouse drag advanced T2 -> T3');
        await sleep(360);
        const t3Metrics = await measureCentering();
        await mouseDrag({
          startX: t3Metrics.dragStartX,
          startY: t3Metrics.dragY,
          endX: t3Metrics.dragEndXLeft,
          endY: t3Metrics.dragY
        });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T4}"`, 'Real mouse drag advanced T3 -> T4');
        await sleep(360);
        await waitFrames();

        const finalMetrics = await measureCentering();
        assert.equal(finalMetrics.activeUnitId, c1T4);
        assert.ok(finalMetrics.midpointDeltaPx <= 6, `Final slide midpoint delta ${finalMetrics.midpointDeltaPx}px exceeded 6px tolerance`);
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-03-horizontal-final-unit.png');

        // 4. Real mouse drag RIGHT -> T4 -> T3, with ZERO accidental playback calls across all drags!
        await mouseDrag({
          startX: finalMetrics.dragStartXRight,
          startY: finalMetrics.dragY,
          endX: finalMetrics.dragEndXRight,
          endY: finalMetrics.dragY
        });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T3}"`, 'Real mouse drag right returned T4 -> T3');
        assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0, 'Real horizontal drags must never trigger audio playback');
      });

      await run('C-HF2-2: Real Tab A11y (offscreen/inactive preview controls unreachable), scoped multi-Card controls, programmatic transition interruption, rapid gestures + resize & mobile 390px touch swipe', async () => {
        const ids = await evaluate('window.__packetC.londonIds');
        const p1Id = ids.cards.P1;
        const c1Id = ids.cards.C1;
        const p1Sc1 = ids.units.P1_SC1;
        const p1Sc2 = ids.units.P1_SC2;
        const c1T1 = ids.units.C1_T1;
        const c1T2 = ids.units.C1_T2;
        const c1T3 = ids.units.C1_T3;
        const c1T4 = ids.units.C1_T4;

        // Reset C1 to T1 and P1 to SC1
        await click(`[data-shared-card-id="${p1Id}"] [data-shared-focus-rail-unit-id="${p1Sc1}"]`);
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]`);
        await sleep(340);

        // Two open Cards have independent scoped keyboard controls (ArrowRight on C1 rail NEVER moves P1, and vice versa!)
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]').focus()`);
        await pressKey('ArrowRight', 'ArrowRight', 39);
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T2}"`, 'Scoped C1 rail ArrowRight moved C1 to T2');
        assert.equal(
          await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId`),
          p1Sc1,
          'Scoped C1 keyboard navigation must NEVER affect P1'
        );

        await evaluate(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-focus-rail-unit-id="${p1Sc1}"]').focus()`);
        await pressKey('ArrowRight', 'ArrowRight', 39);
        await until(`document.querySelector('[data-shared-card-id="${p1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${p1Sc2}"`, 'Scoped P1 rail ArrowRight moved P1 to SC2');
        assert.equal(
          await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId`),
          c1T2,
          'Scoped P1 keyboard navigation must NEVER affect C1'
        );

        await captureFullPage('chf2-08-two-expanded-cards-focus.png');

        // Real Tab key walk starting from C1's last rail chip -> MUST NOT reach ANY inactive/offscreen slide or shift carousel!
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T4}"]').focus()`);
        const tabViolations = [];
        for (let step = 0; step < 18; step += 1) {
          await pressKey('Tab', 'Tab', 9);
          const hit = await evaluate(`(() => {
            const el = document.activeElement;
            if (!el) return { bad: false };
            const inInactiveSlide = Boolean(el.closest('[data-shared-part-slide]:not([data-shared-part-active="true"])'));
            const isPeek = Boolean(el.closest('[data-shared-focus-peek="true"]'));
            const c1Active = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]')?.dataset.sharedPartSlideUnitId;
            return { bad: inInactiveSlide || isPeek, c1Active, tag: el.tagName };
          })()`);
          if (hit.bad) tabViolations.push({ step, hit });
          assert.equal(hit.c1Active, c1T2, `Tab step ${step} unexpectedly shifted C1 carousel`);
        }
        assert.deepEqual(tabViolations, [], 'Tab walk must NEVER focus inactive/offscreen carousel controls');

        // Interrupting programmatic transition safely: start T1 -> T4 transition, then immediately drag back mid-transition!
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]`);
        await sleep(340);
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"]').scrollIntoView({ behavior: 'instant', block: 'center' })`);
        await waitFrames();
        const boxForInterrupt = await evaluate(`(() => {
          const track = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-track="horizontal"]');
          const r = track.getBoundingClientRect();
          return { left: r.left, width: r.width, y: Math.round(r.top + 100) };
        })()`);
        // Fire programmatic jump T1 -> T4, wait 45ms mid-280ms transition, then drag rightward!
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T4}"]`);
        await sleep(45);
        await mouseDrag({
          startX: Math.round(boxForInterrupt.left + boxForInterrupt.width * 0.22),
          startY: boxForInterrupt.y,
          endX: Math.round(boxForInterrupt.left + boxForInterrupt.width * 0.82),
          endY: boxForInterrupt.y,
          steps: 10,
          stepMs: 10
        });
        await sleep(420);
        const afterInterrupt = await evaluate(`(() => {
          const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
          const activeSlide = c1.querySelector('[data-shared-part-slide][data-shared-part-active="true"]');
          const pressedRail = c1.querySelector('[data-shared-focus-rail-item][aria-pressed="true"]');
          return {
            slideUnitId: activeSlide?.dataset.sharedPartSlideUnitId,
            railUnitId: pressedRail?.dataset.sharedFocusRailUnitId
          };
        })()`);
        assert.ok(afterInterrupt.slideUnitId && afterInterrupt.slideUnitId === afterInterrupt.railUnitId, 'Interrupted transition must settle cleanly with Reader & Swiper in sync');

        // Rapid gestures + viewport resize resilience (1280 -> 390 -> 768 -> 1280)
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]`);
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T3}"]`);
        await setViewport({ width: 390, height: 844, mobile: true });
        await sleep(260);
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"]').scrollIntoView({ behavior: 'instant', block: 'center' })`);
        await waitFrames();

        // Real mobile touch swipe (Input.dispatchTouchEvent) on 390px emulated viewport: T3 -> T4!
        const mobileBox = await evaluate(`(() => {
          const track = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-track="horizontal"]');
          const activeSlide = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-slide][data-shared-part-active="true"]');
          const tr = track.getBoundingClientRect();
          const sr = activeSlide.getBoundingClientRect();
          return {
            deltaPx: Math.round(Math.abs((sr.left + sr.width / 2) - (tr.left + tr.width / 2)) * 10) / 10,
            startX: Math.round(sr.left + sr.width * 0.78),
            endX: Math.round(sr.left + sr.width * 0.16),
            y: Math.round(sr.top + 100),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
          };
        })()`);
        assert.ok(mobileBox.deltaPx <= 6, `Mobile 390px slide midpoint delta ${mobileBox.deltaPx}px exceeded 6px`);
        assert.equal(mobileBox.noOverflow, true, 'Mobile 390px Horizontal Focus must have zero page overflow');

        await touchSwipe({ startX: mobileBox.startX, startY: mobileBox.y, endX: mobileBox.endX, endY: mobileBox.y });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T4}"`, 'Real mobile touch swipe advanced T3 -> T4');
        await sleep(360);
        const mobileAfterSwipe = await evaluate(`(() => {
          const track = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-track="horizontal"]');
          const activeSlide = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-slide][data-shared-part-active="true"]');
          const tr = track.getBoundingClientRect();
          const sr = activeSlide.getBoundingClientRect();
          return {
            deltaPx: Math.round(Math.abs((sr.left + sr.width / 2) - (tr.left + tr.width / 2)) * 10) / 10,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
          };
        })()`);
        assert.ok(mobileAfterSwipe.deltaPx <= 6, `Mobile 390px final slide midpoint delta ${mobileAfterSwipe.deltaPx}px exceeded 6px`);
        assert.equal(mobileAfterSwipe.noOverflow, true);
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-04-horizontal-mobile-390.png', 10);

        await setViewport({ width: 768, height: 900, mobile: false });
        await sleep(160);
        await setViewport({ width: 1280, height: 900, mobile: false });
        await sleep(220);
        assert.equal(
          await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId`),
          c1T4,
          'Rapid resize cycle must preserve selected Unit T4'
        );
        assert.equal(await evaluate('window.__packetC.getPlaybackLog().length'), 0);
      });

      await run('C-HF2-3: Document-Flow Vertical Focus — Real wheel scroll changes active Unit, scales neighbors, preserves ordinary page scrolling across multiple Cards', async () => {
        const ids = await evaluate('window.__packetC.londonIds');
        const c1Id = ids.cards.C1;
        const c2Id = ids.cards.C2;
        const c1T1 = ids.units.C1_T1;
        const c1T4 = ids.units.C1_T4;

        await click('[data-shared-focus-orientation-option="vertical-focus"]');
        await until('document.querySelector("[data-shared-focus-vertical-flow=true]")', 'Document-flow Vertical Focus rendered');
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]`);
        await sleep(320);
        await waitFrames();
        await evaluate('window.__packetC.clearPlaybackLog()');

        // Position C1 T1 near top of viewport, capture before-scroll evidence
        await evaluate(`(() => {
          const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
          const top = c1.getBoundingClientRect().top + window.scrollY - 24;
          window.scrollTo({ top, behavior: 'instant' });
        })()`);
        await waitFrames();
        const beforeScroll = await evaluate(`(() => {
          const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
          const active = c1.querySelector('[data-shared-part-active="true"]');
          const neighbor = c1.querySelector('[data-shared-part-neighbor="next"]');
          return {
            scrollY: Math.round(window.scrollY),
            activeUnitId: active?.dataset.sharedPartFocusedUnitId,
            activeOpacity: parseFloat(getComputedStyle(active).opacity),
            neighborOpacity: neighbor ? parseFloat(getComputedStyle(neighbor).opacity) : null
          };
        })()`);
        assert.equal(beforeScroll.activeUnitId, c1T1);
        assert.ok(beforeScroll.activeOpacity >= 0.99, 'Active Vertical Unit must be at full prominence');
        assert.ok(beforeScroll.neighborOpacity !== null && beforeScroll.neighborOpacity < 0.9, 'Neighbor Vertical Unit must be visually scaled down/quieter');
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-05-vertical-scroll-before.png');

        // Dispatch REAL CDP mouseWheel scrolling down through C1 -> active Unit MUST change purely from scroll!
        await wheelScroll({ x: 640, y: 450, deltaY: 620, steps: 8, stepMs: 40 });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartFocusedUnitId !== "${c1T1}"`, 'Real mouseWheel scroll changed Vertical Focus active Unit');
        await sleep(320);

        const afterWheel1 = await evaluate(`({
          scrollY: Math.round(window.scrollY),
          activeUnitId: document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartFocusedUnitId,
          zeroAudio: window.__packetC.getPlaybackLog().length === 0
        })`);
        assert.ok(afterWheel1.scrollY > beforeScroll.scrollY + 300, 'Ordinary document scrolling must advance freely over Vertical Focus Cards');
        assert.notEqual(afterWheel1.activeUnitId, c1T1, 'Wheel scroll must advance active Unit beyond T1');
        assert.equal(afterWheel1.zeroAudio, true, 'Scroll-driven focus change must trigger zero audio playback');
        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-06-vertical-scroll-after.png');

        // Continue real wheel scrolling further down to verify ordinary page scrolling reaches C2 cleanly with zero scroll trap!
        const scrollBeforeC2 = await evaluate('window.scrollY');
        await wheelScroll({ x: 640, y: 450, deltaY: 1400, steps: 10, stepMs: 30 });
        await sleep(220);
        const reachedC2 = await evaluate(`(() => {
          const c2 = document.querySelector('[data-shared-card-id="${c2Id}"]');
          const r = c2.getBoundingClientRect();
          return {
            scrollY: Math.round(window.scrollY),
            c2VisibleOrNear: r.top < window.innerHeight + 120
          };
        })()`);
        assert.ok(reachedC2.scrollY > scrollBeforeC2 + 500 && reachedC2.c2VisibleOrNear, 'Ordinary page scrolling must reach lower Cards (C2) with zero nested scroll trap');
        assert.ok(c1T4);
      });

      await run('C-HF2-4: Oversized bilingual Unit (disposable derived probe) readable with zero clipping in BOTH Horizontal & Vertical Focus + Reduced Motion + joinAfter preview separators', async () => {
        const ids = await evaluate('window.__packetC.londonIds');
        const c1Id = ids.cards.C1;
        const c1T1 = ids.units.C1_T1;
        const c1T2 = ids.units.C1_T2;

        // 1. Load disposable oversized bilingual probe on C1_T2 (authoritative London untouched!)
        await evaluate('window.__packetC.loadOversizedBilingualProbe()');
        await waitFrames();
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T2}"]`);
        await waitFrames();

        // Check Vertical Focus readability on oversized Unit (zero clipping, zero scroll trap)
        const vertOversized = await evaluate(`(() => {
          const unit = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]');
          const style = getComputedStyle(unit);
          return {
            hasEnEnd: unit.textContent.includes('EN-END-MARKER'),
            hasIdEnd: unit.textContent.includes('ID-END-MARKER'),
            height: Math.round(unit.getBoundingClientRect().height),
            overflowY: style.overflowY,
            noClip: unit.scrollHeight <= unit.clientHeight + 4
          };
        })()`);
        assert.equal(vertOversized.hasEnEnd, true, 'Vertical oversized Unit must render complete EN text');
        assert.equal(vertOversized.hasIdEnd, true, 'Vertical oversized Unit must render complete ID text');
        assert.ok(vertOversized.height > 450, 'Oversized bilingual probe must genuinely exceed compact slide height');
        assert.equal(vertOversized.noClip, true, 'Vertical oversized Unit must have zero clipping');

        // Switch to Horizontal Focus -> Swiper autoHeight must expand to hold full oversized Unit with zero clipping!
        await click('[data-shared-focus-orientation-option="horizontal-focus"]');
        await until('document.querySelector("[data-shared-focus-carousel-engine=swiper]")', 'Horizontal Swiper mounted for oversized probe');
        await sleep(360);
        await waitFrames();

        const horizOversized = await evaluate(`(() => {
          const c1 = document.querySelector('[data-shared-card-id="${c1Id}"]');
          const swiperEl = c1.querySelector('.swiper');
          const wrapper = c1.querySelector('.swiper-wrapper');
          const activeSlide = c1.querySelector('[data-shared-part-slide][data-shared-part-active="true"]');
          const lastTextSpan = [...activeSlide.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')].pop();
          const swiperRect = swiperEl.getBoundingClientRect();
          const slideRect = activeSlide.getBoundingClientRect();
          const lastRect = lastTextSpan.getBoundingClientRect();
          return {
            hasEnEnd: activeSlide.textContent.includes('EN-END-MARKER'),
            hasIdEnd: activeSlide.textContent.includes('ID-END-MARKER'),
            wrapperHeight: Math.round(wrapper.getBoundingClientRect().height),
            slideHeight: Math.round(slideRect.height),
            lastBottomWithinSwiper: lastRect.bottom <= swiperRect.bottom + 8,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
          };
        })()`);
        assert.equal(horizOversized.hasEnEnd, true);
        assert.equal(horizOversized.hasIdEnd, true);
        assert.ok(horizOversized.wrapperHeight >= horizOversized.slideHeight - 4, `Swiper autoHeight (${horizOversized.wrapperHeight}px) must accommodate full oversized slide (${horizOversized.slideHeight}px)`);
        assert.equal(horizOversized.lastBottomWithinSwiper, true, 'Last line of oversized bilingual Unit must not be clipped by Swiper container');
        assert.equal(horizOversized.noOverflow, true);

        await captureElement(`[data-shared-card-id="${c1Id}"]`, 'chf2-07-oversized-bilingual-active-unit.png');
        await evaluate('window.__packetC.clearDerivedOverride()');
        await waitFrames();

        // 2. Reduced Motion functional test (Emulation.setEmulatedMedia prefers-reduced-motion: reduce)
        await call('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        });
        await sleep(120);
        await click(`[data-shared-card-id="${c1Id}"] [data-shared-focus-rail-unit-id="${c1T1}"]`);
        await waitFrames();
        await evaluate(`document.querySelector('[data-shared-card-id="${c1Id}"]').scrollIntoView({ behavior: 'instant', block: 'center' })`);
        await waitFrames();
        const rmBox = await evaluate(`(() => {
          const active = document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-slide][data-shared-part-active="true"]');
          const inner = active.querySelector('.prolingo-focus-slide-inner') || active;
          const r = active.getBoundingClientRect();
          return {
            transitionDuration: getComputedStyle(inner).transitionDuration,
            startX: Math.round(r.left + r.width * 0.72),
            endX: Math.round(r.left + r.width * 0.18),
            y: Math.round(r.top + 100)
          };
        })()`);
        assert.equal(rmBox.transitionDuration, '0s', 'Reduced motion must suppress slide CSS transitions');
        await mouseDrag({ startX: rmBox.startX, startY: rmBox.y, endX: rmBox.endX, endY: rmBox.y });
        await until(`document.querySelector('[data-shared-card-id="${c1Id}"] [data-shared-part-active="true"]').dataset.sharedPartSlideUnitId === "${c1T2}"`, 'Reduced motion Horizontal drag still advances T1 -> T2');
        await call('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
        });

        // 3. joinAfter=none & joinAfter=line preserved inside Horizontal Focus peeking preview text on Stress fixture
        await evaluate('window.__packetC.setWorkspace("stress")');
        await until('document.querySelectorAll("[data-shared-card-id]").length === 3', 'Stress fixture in Horizontal Focus');
        const stressIds = await evaluate('window.__packetC.stressIds');
        // Select empty Section 2 so Section 1 (with joinAfter=none & joinAfter=line) becomes a peeking preview slide!
        await click(`[data-shared-card-id="${stressIds.paragraphStressCardId}"] [data-shared-focus-rail-unit-id="${stressIds.emptySectionId}"]`);
        await waitFrames();
        const peekSeparatorCheck = await evaluate(`(() => {
          const card = document.querySelector('[data-shared-card-id="${stressIds.paragraphStressCardId}"]');
          const peek = card.querySelector('[data-shared-focus-peek="true"] p');
          return peek ? peek.textContent : '';
        })()`);
        assert.ok(peekSeparatorCheck.includes('Platform 4—direct express service'), 'Horizontal peeking preview must preserve joinAfter=none without synthetic space');
        assert.ok(peekSeparatorCheck.includes('\n'), 'Horizontal peeking preview must preserve joinAfter=line newline separator');
      });
    }
  }

  const guardrails = await evaluate(`({
    dbCalls: window.__packetCDbCalls,
    errors: window.__packetCErrors,
    snapshotsUnchanged: window.__packetC.getSnapshotsUnchanged()
  })`);
  assert.equal(guardrails.dbCalls, 0);
  assert.deepEqual(guardrails.errors, []);
  assert.equal(guardrails.snapshotsUnchanged, true);

  const report = {
    status: 'PASS',
    scope: gate4B2Only ? '4B2-GATE' : gateCHF1Only ? 'C-HF1-GATE' : 'PACKET-C',
    fixtureSummary,
    checksPassed: results.length,
    results,
    evidenceDir,
    screenshots
  };
  await fs.writeFile(path.join(evidenceDir, 'packet-c-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await call('Browser.close').catch(() => {});
} catch (error) {
  console.error('Packet C browser audit FAILED:', error);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log(`Evidence dir: ${evidenceDir} | Disposable profile: ${profile}`);
}
