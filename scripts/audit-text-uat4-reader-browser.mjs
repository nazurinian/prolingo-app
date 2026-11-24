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
const evidenceDir = process.env.UAT4_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4b0-evidence-'));
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

  // Verify every single bilingual Segment text & meaning matches the authoritative spec
  const expectedPairs = JOURNEY_TO_LONDON_CARDS_SPEC.flatMap(card => (
    card.units.flatMap(unit => unit.segments.map(seg => [seg.text, seg.meaning]))
  ));
  const actualPairs = presentation.cards.flatMap(card => (
    card.units.flatMap(unit => unit.segments.map(seg => [seg.text, seg.meaning]))
  ));
  assert.equal(expectedPairs.length, 37);
  assert.deepEqual(actualPairs, expectedPairs, 'All 37 bilingual Segment pairs must match exact fixture text');

  // Verify Speaker identity & stable accent color across C1 and C2
  const c1 = presentation.cardById[fixtureA.ids.cards.C1];
  const c2 = presentation.cardById[fixtureA.ids.cards.C2];
  const c1Map = buildCardSpeakerAppearanceMap(c1);
  const c2Map = buildCardSpeakerAppearanceMap(c2);
  const jamesKey = `id:${fixtureA.ids.speakers.James}`;
  assert.ok(c1Map.has(jamesKey) && c2Map.has(jamesKey));
  assert.deepEqual(c1Map.get(jamesKey), c2Map.get(jamesKey), 'James must keep stable speaker palette across Scenes');

  // Verify separate stress fixture stays isolated and valid
  const stress = createJourneyToLondonStressFixtures();
  const stressState = selectTextMixedReaderState(stress.snapshot, { documentId: stress.ids.documentId });
  assert.equal(stressState.presentation.cardById[stress.ids.titleCardId].paragraphRole, 'title');
  assert.equal(stressState.presentation.unitById[stress.ids.emptySectionId].segments.length, 0);
  assert.equal(stressState.presentation.unitById[stress.ids.emptyTurnId].segments.length, 0);
  assert.notEqual(
    stressState.presentation.unitById[stress.ids.consecutiveTurn1Id].viewKey,
    stressState.presentation.unitById[stress.ids.consecutiveTurn2Id].viewKey
  );
  assert.equal(
    stressState.presentation.unitById[stress.ids.consecutiveTurn1Id].speakerId,
    stressState.presentation.unitById[stress.ids.consecutiveTurn2Id].speakerId
  );

  assert.equal(JSON.stringify(fixtureA.snapshot), rawBefore, 'Projection must never mutate source snapshot');
  return {
    baseCounts: fixtureA.counts,
    stressCardCount: stressState.presentation.cards.length
  };
};

const nodeVerification = verifyBaseFixtureInNode();
console.log('PASS Node fixture verification:', JSON.stringify(nodeVerification));

// -----------------------------------------------------------------------------
// 2. Compile Tailwind CSS in memory + Bundle isolated UAT-4B0 production renderer harness
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
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { selectTextMixedReaderState } from './src/domain/text/textMixedReaderDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextCardPresentationState
} from './src/domain/text/textCardPresentationStateDomain.js';
import {
  loadTextMainReaderPreference,
  saveTextMainReaderPreference,
  resolveTextMainReaderWorkspaceStyle,
  updateTextMainReaderWorkspaceStyle,
  resetTextMainReaderWorkspaceStyle,
  resolveTextMainReaderPreferenceStorageKey
} from './src/services/persistence/textMainReaderPreferenceService.js';
import { SharedBilingualLayoutToolbar } from './src/components/text/presentation/SharedBilingualLayoutToolbar.jsx';
import { SharedBilingualUnitsBody } from './src/components/text/presentation/SharedBilingualUnitsBody.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildCardSpeakerAppearanceMap,
  summarizeSceneSpeakers
} from './src/components/text/presentation/sharedCardPresentationUtils.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from './src/domain/text/textParagraphRoleDomain.js';
import {
  createJourneyToLondonFixture,
  createJourneyToLondonStressFixtures
} from './scripts/fixtures/uat4/journey-to-london.js';

const HOST_ID = 'uat4-4b0-browser-qa';
const STORAGE_KEY = resolveTextMainReaderPreferenceStorageKey({ hostId: HOST_ID });

const baseFixture = createJourneyToLondonFixture();
const stressFixture = createJourneyToLondonStressFixtures();
const baseSnapshotBefore = JSON.stringify(baseFixture.snapshot);

function Uat4B0HarnessApp() {
  const [datasetMode, setDatasetMode] = useState('base');
  const [darkMode, setDarkMode] = useState(false);
  const [preference, setPreference] = useState(() => loadTextMainReaderPreference({ hostId: HOST_ID }));
  const [playbackCalls, setPlaybackCalls] = useState([]);
  const [cursor, setCursor] = useState(IDLE_SHARED_CURSOR);

  const activeFixture = datasetMode === 'stress' ? stressFixture : baseFixture;
  const { presentation } = useMemo(
    () => selectTextMixedReaderState(activeFixture.snapshot, { documentId: activeFixture.ids.documentId }),
    [activeFixture]
  );

  const styleResolution = useMemo(
    () => resolveTextMainReaderWorkspaceStyle(preference),
    [preference]
  );

  const commitPreference = next => {
    const saved = saveTextMainReaderPreference(next, { hostId: HOST_ID });
    setPreference(saved);
    return saved;
  };

  const handleChangePresentationState = nextView => {
    commitPreference({ ...preference, view: normalizeTextCardPresentationState(nextView) });
  };

  const handleResetView = () => {
    commitPreference({ ...preference, view: DEFAULT_TEXT_CARD_PRESENTATION_STATE });
  };

  const handleChangeWorkspaceStyle = nextStyle => {
    commitPreference(updateTextMainReaderWorkspaceStyle(preference, nextStyle));
  };

  const handleResetWorkspaceStyle = () => {
    commitPreference(resetTextMainReaderWorkspaceStyle(preference));
  };

  const handlePlaySegment = segmentId => {
    setPlaybackCalls(prev => [...prev, segmentId]);
  };

  const toggleDark = nextDark => {
    setDarkMode(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
  };

  window.__uat4 = {
    STORAGE_KEY,
    baseIds: baseFixture.ids,
    stressIds: stressFixture.ids,
    getSnapshotUnchanged: () => JSON.stringify(baseFixture.snapshot) === baseSnapshotBefore,
    getPreference: () => preference,
    getPlaybackCalls: () => playbackCalls,
    clearPlaybackCalls: () => setPlaybackCalls([]),
    setDatasetMode: mode => setDatasetMode(mode),
    setDarkMode: flag => toggleDark(Boolean(flag)),
    setCursor: next => setCursor(next || IDLE_SHARED_CURSOR),
    reloadFromStorage: () => setPreference(loadTextMainReaderPreference({ hostId: HOST_ID })),
    seedLegacyV1Preference: () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        reader: 'shared',
        view: { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' }
      }));
      const loaded = loadTextMainReaderPreference({ hostId: HOST_ID });
      setPreference(loaded);
      return loaded;
    },
    resetAllHarnessState: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      const fresh = saveTextMainReaderPreference({
        version: 1,
        reader: 'shared',
        view: DEFAULT_TEXT_CARD_PRESENTATION_STATE,
        workspaceStyle: DEFAULT_TEXT_WORKSPACE_STYLE_STATE
      }, { hostId: HOST_ID });
      setPreference(fresh);
      setCursor(IDLE_SHARED_CURSOR);
      setPlaybackCalls([]);
      setDatasetMode('base');
      toggleDark(false);
      return fresh;
    }
  };

  let pOrd = 0;
  let cOrd = 0;

  return (
    <div
      data-uat4-harness="true"
      data-uat4-dataset={datasetMode}
      data-uat4-theme={darkMode ? 'dark' : 'light'}
      className="min-h-screen bg-slate-100/90 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors"
    >
      <div className="max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
        <header className="space-y-1.5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              UAT-4B0 · Shared Workspace Style Visual Harness · Mixed Workspace
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              {presentation.cards.length} Cards · {presentation.cards.reduce((sum, c) => sum + c.units.length, 0)} Units · {Object.keys(presentation.segmentById).length} Segments
            </span>
          </div>
          <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-slate-900 dark:text-white">
            {presentation.workspace.title}
          </h1>
        </header>

        <SharedBilingualLayoutToolbar
          presentationState={preference.view}
          onChangePresentationState={handleChangePresentationState}
          onResetView={handleResetView}
          workspaceStyle={styleResolution.effectiveStyle}
          effectiveWorkspaceStyleDefaults={styleResolution.effectiveDefaults}
          onChangeWorkspaceStyle={handleChangeWorkspaceStyle}
          onResetWorkspaceStyle={handleResetWorkspaceStyle}
          showWorkspaceStyle
          workspaceType={presentation.workspace.documentType}
        />

        <main className="space-y-5" data-uat4-cards-list="true">
          {presentation.cards.map((card, cardIdx) => {
            const isConversation = card.blockType === 'conversation';
            const isTitleRole = card.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
            const typeTag = isConversation ? \`C\${++cOrd}\` : \`P\${++pOrd}\`;
            const speakerAppearanceMap = isConversation ? buildCardSpeakerAppearanceMap(card) : null;
            const cast = isConversation ? summarizeSceneSpeakers({ card, appearanceMap: speakerAppearanceMap }) : [];
            const cardAccentClass = styleResolution.effectiveStyle.showAccents
              ? (isConversation
                  ? 'border-t-2 border-t-indigo-500/75 dark:border-t-indigo-400/70'
                  : isTitleRole
                    ? 'border-t-2 border-t-indigo-600/80 dark:border-t-indigo-400/80'
                    : 'border-t-2 border-t-teal-500/75 dark:border-t-teal-400/70')
              : '';
            const totalCardSegments = card.units.reduce((sum, u) => sum + (u.segments?.length || 0), 0);

            return (
              <article
                key={card.uid || card.id}
                data-shared-card-id={card.id}
                data-shared-card-type={card.blockType}
                data-shared-card-role={isTitleRole ? 'title' : isConversation ? 'scene' : 'paragraph'}
                className={\`rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/95 shadow-sm overflow-hidden \${cardAccentClass}\`}
              >
                <header className="px-4 py-3.5 sm:px-7 sm:py-4 border-b border-slate-100 dark:border-slate-800/85 space-y-1.5 text-left">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold tabular-nums">
                      Card {cardIdx + 1}/{presentation.cards.length}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={\`font-bold uppercase tracking-wider text-[11px] \${
                        isConversation
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : isTitleRole
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-teal-700 dark:text-teal-300'
                      }\`}
                    >
                      {typeTag} · {isTitleRole ? 'Title' : isConversation ? 'Conversation' : 'Paragraph'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {card.units.length} {isConversation ? (card.units.length === 1 ? 'Turn' : 'Turns') : (card.units.length === 1 ? 'Section' : 'Sections')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{totalCardSegments} Segments</span>
                  </div>

                  <h2
                    className={\`text-left break-words \${
                      isTitleRole
                        ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white'
                        : isConversation
                          ? 'text-base sm:text-lg font-semibold text-indigo-950 dark:text-indigo-100'
                          : 'text-base sm:text-lg font-semibold text-teal-950 dark:text-teal-100'
                    }\`}
                  >
                    {card.title}
                  </h2>

                  {cast.length > 0 && (
                    <div className="pt-0.5 flex flex-wrap items-center gap-1.5" data-shared-scene-cast={card.id}>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none">Speakers:</span>
                      {cast.map(person => (
                        <span
                          key={person.speakerKey || person.displayName}
                          className={\`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium \${person.palette.pill}\`}
                        >
                          <span aria-hidden="true" className={\`h-1.5 w-1.5 rounded-full \${person.palette.dot}\`} />
                          <span>{person.displayName}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                <div className="px-4 py-4 sm:px-7 sm:py-6">
                  <SharedBilingualUnitsBody
                    card={card}
                    workspace={presentation.workspace}
                    speakerAppearanceMap={speakerAppearanceMap}
                    bilingualLayout={preference.view.bilingualLayout}
                    workspaceStyle={styleResolution.effectiveStyle}
                    playbackCursor={cursor}
                    onPlaySegment={handlePlaySegment}
                  />
                </div>
              </article>
            );
          })}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Uat4B0HarnessApp />);
`;

const [compiledCss, compiledJs] = await Promise.all([
  compileCss(),
  build({
    absWorkingDir: root,
    stdin: {
      contents: harnessJsx,
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'uat4-4b0-harness.jsx'
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
  if (pathname === '/app.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(compiledJs);
    return;
  }
  if (pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(compiledCss);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ProLingo UAT-4B0 Workspace Style Audit</title>
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
      value: new Proxy({}, { get() { window.__uat4DbCalls += 1; throw new Error('UAT-4B0 audit forbids IndexedDB'); } })
    });
  </script>
  <script type="module" src="/app.js"></script>
</body>
</html>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4b0-profile-'));
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
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

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
  const setViewport = async ({ width, height, mobile = false }) => {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile
    });
    await until(`window.innerWidth === ${width}`, `viewport ${width}px`);
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
  await call('Page.navigate', { url: origin });
  await until('window.__uat4 && document.querySelector("[data-uat4-harness]")', 'UAT-4B0 harness mounted');

  // Case 1: Provisional defaults — Align Left + Stacked + Indent Off + Accents On (Combined EN/ID)
  await run('Provisional defaults: Left + Stacked + Indent Off + Accents On + 37 exact Segments + Reset disabled', async () => {
    await evaluate('window.__uat4.resetAllHarnessState()');
    await waitFrames();
    const check = await evaluate(`(() => {
      const bar = document.querySelector('[data-shared-workspace-style-bar]');
      const resetBtn = document.querySelector('[data-shared-workspace-style-reset]');
      const enSegs = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(el => el.dataset.sharedCardSegment);
      const idSegs = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')].map(el => el.dataset.sharedCardSegment);
      const bodies = [...document.querySelectorAll('[data-shared-reading-body="true"]')];
      const allLeft = bodies.length > 0 && bodies.every(el => getComputedStyle(el).textAlign === 'left');
      const allNoIndent = bodies.every(el => parseFloat(getComputedStyle(el).textIndent) === 0);
      const turns = [...document.querySelectorAll('[data-shared-turn-layout="stacked"]')];
      const stackedAbove = turns.length === 8 && turns.every(section => {
        const header = section.querySelector('[data-shared-turn-header]');
        const body = section.querySelector('[data-shared-reading-body="true"]');
        return header && body && header.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + 2;
      });
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return {
        align: bar.dataset.sharedWorkspaceStyleAlign,
        indent: bar.dataset.sharedWorkspaceStyleIndent,
        speaker: bar.dataset.sharedWorkspaceStyleSpeaker,
        accents: bar.dataset.sharedWorkspaceStyleAccents,
        dirty: bar.dataset.sharedWorkspaceStyleDirty,
        resetDisabled: resetBtn.disabled,
        enCount: enSegs.length,
        idCount: idSegs.length,
        enMatchesExpected: JSON.stringify(enSegs) === JSON.stringify(window.__uat4.baseIds.segmentIds),
        idMatchesExpected: JSON.stringify(idSegs) === JSON.stringify(window.__uat4.baseIds.segmentIds),
        allLeft,
        allNoIndent,
        stackedAbove,
        overflow
      };
    })()`);
    assert.equal(check.align, 'left');
    assert.equal(check.indent, 'off');
    assert.equal(check.speaker, 'stacked');
    assert.equal(check.accents, 'on');
    assert.equal(check.dirty, 'false');
    assert.equal(check.resetDisabled, true);
    assert.equal(check.enCount, 37);
    assert.equal(check.idCount, 37);
    assert.equal(check.enMatchesExpected, true);
    assert.equal(check.idMatchesExpected, true);
    assert.equal(check.allLeft, true);
    assert.equal(check.allNoIndent, true);
    assert.equal(check.stackedAbove, true);
    assert.equal(check.overflow, false);
    await captureFullPage('01-desktop-left-stacked-indent-off-combined.png');
  });

  // Case 2: Justify + Aligned + Indentation On (Separated EN & ID flowing bodies)
  await run('Justify + Aligned + Indent On applies across Paragraph & Conversation (EN & ID) without justifying speakers/controls', async () => {
    await click('[data-shared-card-layout-option="separated"]');
    // Changing bilingual layout alone must NOT dirty Workspace Style Reset
    const resetBeforeStyleChange = await evaluate('document.querySelector("[data-shared-workspace-style-reset]").disabled');
    assert.equal(resetBeforeStyleChange, true, 'Changing bilingual layout must not mark Workspace Style dirty');

    await click('[data-shared-workspace-align-option="justify"]');
    await click('[data-shared-workspace-speaker-option="aligned"]');
    await click('[data-shared-workspace-indent-toggle="true"]');
    await waitFrames();

    const check = await evaluate(`(() => {
      const resetBtn = document.querySelector('[data-shared-workspace-style-reset]');
      const enSegs = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="text"]')].map(el => el.dataset.sharedCardSegment);
      const idSegs = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="meaning"]')].map(el => el.dataset.sharedCardSegment);
      const paraBodies = [...document.querySelectorAll('[data-shared-reading-body="true"][data-shared-reading-kind="paragraph"]')];
      const turnBodies = [...document.querySelectorAll('[data-shared-reading-body="true"][data-shared-reading-kind="turn"]')];
      const allParaJustified = paraBodies.length === 6 && paraBodies.every(el => getComputedStyle(el).textAlign === 'justify');
      const allTurnJustified = turnBodies.length === 16 && turnBodies.every(el => getComputedStyle(el).textAlign === 'justify');
      const allParaIndentedOnce = paraBodies.every(el => {
        const bodyLeft = el.getBoundingClientRect().left;
        const indentPx = parseFloat(getComputedStyle(el).textIndent);
        const segs = [...el.querySelectorAll('[data-shared-card-segment]')];
        if (indentPx <= 16 || segs.length < 2) return false;
        const firstRects = [...segs[0].getClientRects()];
        const allInline = segs.every(s => getComputedStyle(s).display === 'inline');
        const firstLineIndented = firstRects.length > 0 && (firstRects[0].left - bodyLeft) >= 16;
        // Subsequent wrapped lines inside the paragraph must return flush to the paragraph left edge (never re-indented per segment)
        const allLineRects = segs.flatMap(s => [...s.getClientRects()]);
        const laterLines = allLineRects.filter(r => r.top > firstRects[0].top + 4);
        const laterLineStarts = [];
        for (const r of laterLines) {
          const existing = laterLineStarts.find(entry => Math.abs(entry.top - r.top) < 4);
          if (!existing) laterLineStarts.push({ top: r.top, left: r.left });
          else if (r.left < existing.left) existing.left = r.left;
        }
        const laterLinesFlushLeft = laterLineStarts.length > 0
          && laterLineStarts.every(line => Math.abs(line.left - bodyLeft) < 3);
        return allInline && firstLineIndented && laterLinesFlushLeft;
      });
      const noTurnIndented = turnBodies.every(el => parseFloat(getComputedStyle(el).textIndent) === 0);
      const speakersNotJustified = [...document.querySelectorAll('[data-shared-turn-header], [data-shared-turn-speaker], [data-shared-section-heading], h1, h2, button')]
        .every(el => getComputedStyle(el).textAlign !== 'justify');
      const alignedGrids = [...document.querySelectorAll('[data-shared-turn-aligned-grid]')];
      const alignedColumnsSideBySide = alignedGrids.length === 16 && alignedGrids.every(grid => {
        const sp = grid.querySelector('[data-shared-turn-speaker-column]').getBoundingClientRect();
        const body = grid.querySelector('[data-shared-turn-body-column]').getBoundingClientRect();
        return sp.right <= body.left + 2 && Math.abs(sp.top - body.top) < 24;
      });
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const bodyClipped = [...document.querySelectorAll('[data-shared-reading-body="true"]')]
        .some(el => el.scrollWidth > el.clientWidth + 1);
      return {
        resetDisabled: resetBtn.disabled,
        enMatchesExpected: JSON.stringify(enSegs) === JSON.stringify(window.__uat4.baseIds.segmentIds),
        idMatchesExpected: JSON.stringify(idSegs) === JSON.stringify(window.__uat4.baseIds.segmentIds),
        allParaJustified,
        allTurnJustified,
        allParaIndentedOnce,
        noTurnIndented,
        speakersNotJustified,
        alignedColumnsSideBySide,
        overflow,
        bodyClipped
      };
    })()`);
    assert.equal(check.resetDisabled, false);
    assert.equal(check.enMatchesExpected, true);
    assert.equal(check.idMatchesExpected, true);
    assert.equal(check.allParaJustified, true);
    assert.equal(check.allTurnJustified, true);
    assert.equal(check.allParaIndentedOnce, true);
    assert.equal(check.noTurnIndented, true);
    assert.equal(check.speakersNotJustified, true);
    assert.equal(check.alignedColumnsSideBySide, true);
    assert.equal(check.overflow, false);
    assert.equal(check.bodyClipped, false);
    await captureFullPage('02-desktop-justify-aligned-indent-on-separated.png');
  });

  // Case 3: Inline Speaker arrangement (EN & ID Separated + verify EN-only and ID-only too)
  await run('Inline Speaker arrangement starts Turn naturally inline, keeps speaker left-aligned inside justified Turn, and preserves EN-only/ID-only', async () => {
    await click('[data-shared-workspace-speaker-option="inline"]');
    await waitFrames();

    const check = await evaluate(`(() => {
      const inlineHeaders = [...document.querySelectorAll('[data-shared-turn-speaker-inline="true"]')];
      const allInlineLeft = inlineHeaders.length === 16 && inlineHeaders.every(el => getComputedStyle(el).textAlign === 'left');
      const allOnOpeningLine = inlineHeaders.every(el => {
        const firstSeg = el.parentElement.querySelector('[data-shared-card-segment]');
        if (!firstSeg) return false;
        const spRect = el.getBoundingClientRect();
        const segFirstLine = firstSeg.getClientRects()[0];
        return Boolean(segFirstLine) && spRect.right <= segFirstLine.left + 12 && Math.abs(spRect.top - segFirstLine.top) < 16;
      });
      const turnBodiesJustified = [...document.querySelectorAll('[data-shared-reading-body="true"][data-shared-reading-kind="turn"]')]
        .every(el => getComputedStyle(el).textAlign === 'justify');
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return { inlineCount: inlineHeaders.length, allInlineLeft, allOnOpeningLine, turnBodiesJustified, overflow };
    })()`);
    assert.equal(check.inlineCount, 16);
    assert.equal(check.allInlineLeft, true);
    assert.equal(check.allOnOpeningLine, true);
    assert.equal(check.turnBodiesJustified, true);
    assert.equal(check.overflow, false);
    await captureFullPage('03-desktop-inline-speakers-separated.png');

    // Quick verification of EN-only and ID-only layouts retaining Workspace Style & exact 37 Segments
    for (const [layoutId, expectedChannel] of [['text-only', 'text'], ['meaning-only', 'meaning']]) {
      await click(`[data-shared-card-layout-option="${layoutId}"]`);
      await waitFrames();
      const singleCheck = await evaluate(`(() => {
        const segs = [...document.querySelectorAll('[data-shared-card-segment][data-shared-card-channel="${expectedChannel}"]')].map(el => el.dataset.sharedCardSegment);
        const bodies = [...document.querySelectorAll('[data-shared-reading-body="true"]')];
        return {
          exact37: JSON.stringify(segs) === JSON.stringify(window.__uat4.baseIds.segmentIds),
          allJustified: bodies.length === 11 && bodies.every(el => getComputedStyle(el).textAlign === 'justify'),
          paraIndentCount: bodies.filter(el => el.dataset.sharedParagraphIndentApplied === 'true').length
        };
      })()`);
      assert.equal(singleCheck.exact37, true, `${layoutId} must render exact 37 Segments`);
      assert.equal(singleCheck.allJustified, true, `${layoutId} must justify all 11 Units`);
      assert.equal(singleCheck.paraIndentCount, 3, `${layoutId} must indent exactly 3 Paragraph Sections`);
    }
    await click('[data-shared-card-layout-option="separated"]');
  });

  // Case 4: Dark theme (Desktop, Justify + Aligned + Indent On, EN & ID Separated)
  await run('Dark theme renders cleanly with Justify + Aligned + Indent On across EN & ID', async () => {
    await click('[data-shared-workspace-speaker-option="aligned"]');
    await evaluate('window.__uat4.setDarkMode(true)');
    await waitFrames();
    const darkCheck = await evaluate(`(() => {
      const isDark = document.documentElement.classList.contains('dark');
      const bg = getComputedStyle(document.querySelector('[data-uat4-harness]')).backgroundColor;
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return { isDark, bg, overflow };
    })()`);
    assert.equal(darkCheck.isDark, true);
    assert.equal(darkCheck.overflow, false);
    await captureFullPage('05-desktop-dark-theme-justify-aligned.png');
    await evaluate('window.__uat4.setDarkMode(false)');
  });

  // Case 5: Narrow mobile layout (390px) using full Mixed fixture with long Sections and Turns
  await run('Narrow mobile (390px) adapts Aligned safely without mutating saved preference and prevents overflow', async () => {
    await setViewport({ width: 390, height: 844, mobile: true });
    await waitFrames();
    const mobileCheck = await evaluate(`(() => {
      const pref = window.__uat4.getPreference();
      const alignedGrids = [...document.querySelectorAll('[data-shared-turn-aligned-grid]')];
      const stackedSafelyOnMobile = alignedGrids.length === 16 && alignedGrids.every(grid => {
        const sp = grid.querySelector('[data-shared-turn-speaker-column]').getBoundingClientRect();
        const body = grid.querySelector('[data-shared-turn-body-column]').getBoundingClientRect();
        return sp.bottom <= body.top + 2 && body.width >= 260;
      });
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const toolbarClipped = [...document.querySelectorAll('[data-shared-card-bilingual-toolbar] button')]
        .some(btn => { const r = btn.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth + 1; });
      const bodyClipped = [...document.querySelectorAll('[data-shared-reading-body="true"]')]
        .some(el => el.scrollWidth > el.clientWidth + 1);
      return {
        savedSpeakerLayout: pref.workspaceStyle.speakerLayout,
        stackedSafelyOnMobile,
        overflow,
        toolbarClipped,
        bodyClipped
      };
    })()`);
    assert.equal(mobileCheck.savedSpeakerLayout, 'aligned', 'Narrow mobile treatment must not mutate saved preference');
    assert.equal(mobileCheck.stackedSafelyOnMobile, true, 'Aligned speaker layout must stack cleanly on narrow mobile');
    assert.equal(mobileCheck.overflow, false, 'No horizontal overflow on 390px mobile');
    assert.equal(mobileCheck.toolbarClipped, false, 'No clipped toolbar controls on 390px mobile');
    assert.equal(mobileCheck.bodyClipped, false, 'No clipped reading bodies on 390px mobile');
    await captureFullPage('04-mobile-narrow-long-sections-turns.png');
  });

  // Case 6: Separate Stress Fixture (Title Card no indent, empty Units, consecutive Turns, long Speaker name, joinAfter)
  await run('Stress cases preserve Title Card, empty Units, consecutive Turns, long Speaker name and joinAfter on mobile & desktop', async () => {
    await evaluate('window.__uat4.setDatasetMode("stress")');
    await waitFrames();

    for (const speakerLayout of ['stacked', 'aligned', 'inline']) {
      await click(`[data-shared-workspace-speaker-option="${speakerLayout}"]`);
      await waitFrames();
      const stressMobile = await evaluate(`(() => {
        const paraStressFlow = document.querySelector('[data-shared-card-id="' + window.__uat4.stressIds.paragraphStressCardId + '"] [data-shared-card-flow="text"]');
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          titleIndented: [...document.querySelectorAll('[data-shared-reading-kind="title"]')].some(el => parseFloat(getComputedStyle(el).textIndent) > 0),
          hasEmptySection: Boolean(document.querySelector('[data-shared-card-empty-section]')),
          consecutiveCueCount: document.querySelectorAll('[data-shared-turn-consecutive="true"]').length,
          hasBrForJoinLine: Boolean(paraStressFlow && paraStressFlow.querySelectorAll('br').length >= 1),
          joinNonePreserved: Boolean(paraStressFlow && paraStressFlow.textContent.includes('Platform 4—direct express service'))
        };
      })()`);
      assert.equal(stressMobile.overflow, false, `No horizontal overflow on mobile stress (${speakerLayout})`);
      assert.equal(stressMobile.titleIndented, false, 'Title Card must never receive body first-line indent');
      assert.equal(stressMobile.hasEmptySection, true);
      assert.ok(stressMobile.consecutiveCueCount >= 2, 'Consecutive same-speaker Turn cue must appear');
      assert.equal(stressMobile.hasBrForJoinLine, true, 'joinAfter=line must render line break');
      assert.equal(stressMobile.joinNonePreserved, true, 'joinAfter=none must not insert extra space');
    }

    await setViewport({ width: 1280, height: 900, mobile: false });
    await click('[data-shared-workspace-speaker-option="aligned"]');
    await waitFrames();
    await captureFullPage('06-desktop-stress-title-consecutive-long-speaker.png');
    await evaluate('window.__uat4.setDatasetMode("base")');
    await waitFrames();
  });

  // Case 7: Accents toggle, Playback callbacks, Read-only cursor highlight, Reset isolation & Old preference compatibility
  await run('Accents toggle, playback callbacks, active cursor highlight, Reset isolation and old v1 compatibility hold', async () => {
    // Switching styles so far must NEVER have triggered playback
    const callsBeforePlay = await evaluate('window.__uat4.getPlaybackCalls().length');
    assert.equal(callsBeforePlay, 0, 'Changing Workspace Style must never invoke playback');

    // Accent lines toggle Off -> On
    await click('[data-shared-workspace-accents-toggle="true"]');
    await waitFrames();
    const accentsOff = await evaluate(`(() => {
      const units = [...document.querySelectorAll('[data-shared-unit-accent="off"]')];
      return units.length > 0 && units.every(u => parseFloat(getComputedStyle(u.firstElementChild).borderLeftWidth) === 0);
    })()`);
    assert.equal(accentsOff, true, 'Accents Off must hide accent rail borders');
    await click('[data-shared-workspace-accents-toggle="true"]');
    await waitFrames();
    const accentsOn = await evaluate(`(() => {
      const units = [...document.querySelectorAll('[data-shared-unit-accent="on"]')];
      return units.length > 0 && units.every(u => parseFloat(getComputedStyle(u.firstElementChild).borderLeftWidth) >= 2);
    })()`);
    assert.equal(accentsOn, true, 'Accents On must render accent rail borders');

    // Click actual EN and ID segments -> exact persistent segment ID callbacks
    const targetSegId = await evaluate('window.__uat4.baseIds.segmentIdsByUnitKey.C1_T2[1]');
    await click(`[data-shared-card-segment="${targetSegId}"][data-shared-card-channel="text"]`);
    await click(`[data-shared-card-segment="${targetSegId}"][data-shared-card-channel="meaning"]`);
    const callsAfterPlay = await evaluate('window.__uat4.getPlaybackCalls()');
    assert.deepEqual(callsAfterPlay, [targetSegId, targetSegId], 'Clicking segments must invoke exact persistent segment ID');

    // Read-only active cursor highlights Turn + Segment across all 3 speaker layouts
    await evaluate(`window.__uat4.setCursor({
      workspaceId: window.__uat4.baseIds.documentId,
      state: 'playing',
      cardId: window.__uat4.baseIds.cards.C1,
      unitId: window.__uat4.baseIds.units.C1_T2,
      segmentId: ${JSON.stringify(targetSegId)},
      channel: 'text',
      precision: 'segment'
    })`);
    for (const layout of ['stacked', 'aligned', 'inline']) {
      await click(`[data-shared-workspace-speaker-option="${layout}"]`);
      await waitFrames();
      const activeCheck = await evaluate(`({
        audibleTurn: Boolean(document.querySelector('[data-shared-turn-audible="true"]')),
        activeSeg: Boolean(document.querySelector('[data-shared-card-segment="${targetSegId}"][data-text-player-segment-active="true"]'))
      })`);
      assert.equal(activeCheck.audibleTurn, true, `Audible Turn badge must render in ${layout}`);
      assert.equal(activeCheck.activeSeg, true, `Active segment highlight must render in ${layout}`);
    }
    await evaluate('window.__uat4.setCursor(null)');

    // Reset Workspace Style restores ONLY Workspace Style, leaving layout='separated' intact
    await click('[data-shared-workspace-style-reset="true"]');
    await waitFrames();
    const afterReset = await evaluate(`(() => ({
      pref: window.__uat4.getPreference(),
      resetDisabled: document.querySelector('[data-shared-workspace-style-reset]').disabled,
      callsCount: window.__uat4.getPlaybackCalls().length
    }))()`);
    assert.deepEqual(afterReset.pref.workspaceStyle, { textAlign: 'left', paragraphIndent: false, speakerLayout: 'stacked', showAccents: true });
    assert.equal(afterReset.pref.view.bilingualLayout, 'separated', 'Reset Workspace Style must not reset bilingualLayout');
    assert.equal(afterReset.resetDisabled, true, 'Reset button must disable once clean');
    assert.equal(afterReset.callsCount, 2, 'Reset Workspace Style must not trigger playback');

    // Old v1 saved preference compatibility (missing workspaceStyle)
    const migrated = await evaluate('window.__uat4.seedLegacyV1Preference()');
    assert.equal(migrated.reader, 'shared');
    assert.deepEqual(migrated.view, { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' });
    assert.deepEqual(migrated.workspaceStyle, { textAlign: 'left', paragraphIndent: false, speakerLayout: 'stacked', showAccents: true });

    // Zero IndexedDB calls, zero runtime errors, zero source snapshot mutation
    const guardrails = await evaluate(`({
      dbCalls: window.__uat4DbCalls,
      errors: window.__uat4Errors,
      snapshotUnchanged: window.__uat4.getSnapshotUnchanged()
    })`);
    assert.equal(guardrails.dbCalls, 0, 'Must never touch IndexedDB');
    assert.deepEqual(guardrails.errors, [], 'Zero uncaught browser errors');
    assert.equal(guardrails.snapshotUnchanged, true, 'Source fixture snapshot must stay unmutated');
  });

  const report = {
    status: 'PASS',
    nodeVerification,
    browserChecksPassed: results.length,
    results,
    evidenceDir,
    screenshots
  };
  await fs.writeFile(path.join(evidenceDir, 'uat4-4b0-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await call('Browser.close').catch(() => {});
} catch (error) {
  console.error('UAT-4B0 browser audit FAILED:', error);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log(`Evidence dir: ${evidenceDir} | Disposable profile: ${profile}`);
}
