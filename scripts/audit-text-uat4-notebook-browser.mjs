import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { TEXT_LIBRARY_DB_VERSION, TEXT_LIBRARY_SCHEMA_VERSION } from '../src/constants/textDatabaseConstants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = process.env.UAT4_4C2_EVIDENCE_DIR
  || path.join(os.tmpdir(), `prolingo-uat4-4c2-evidence-${Date.now()}`);
await fs.mkdir(evidenceDir, { recursive: true });

assert.equal(TEXT_LIBRARY_DB_VERSION, 1, 'Canonical DB version must remain 1');
assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1, 'Canonical schema version must remain 1');

const [prototypeCss, prototypeBundle] = await Promise.all([
  fs.readFile(path.join(root, 'scripts/fixtures/uat4/notebook-prototype.css'), 'utf8'),
  build({
    absWorkingDir: root,
    entryPoints: [path.join(root, 'scripts/fixtures/uat4/notebook-prototype.js')],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    define: {
      'import.meta.env.DEV': 'false',
      'process.env.NODE_ENV': '"production"'
    }
  }).then(res => res.outputFiles[0].text)
]);

const htmlDoc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ProLingo UAT-4 4C2 — Notebook Parallel Flow Audit</title>
  <link rel="stylesheet" href="/notebook-prototype.css">
</head>
<body>
  <div id="notebook-prototype-root"></div>
  <script>
    window.__uat4DbCalls = 0;
    window.__uat4Errors = [];
    window.addEventListener('error', e => window.__uat4Errors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.__uat4Errors.push(String(e.reason)));
    Object.defineProperty(window, 'indexedDB', {
      value: new Proxy({}, { get() { window.__uat4DbCalls += 1; throw new Error('4C2 audit forbids IndexedDB'); } })
    });
  </script>
  <script type="module" src="/notebook-prototype.js"></script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/notebook-prototype.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end(prototypeBundle);
  }
  if (pathname === '/notebook-prototype.css') {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    return res.end(prototypeCss);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(htmlDoc);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const disposableProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4c2-profile-'));
const browserPath = process.env.UAT4_BROWSER_PATH
  || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';

const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${disposableProfileDir}`,
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
);

let socket = null;
const results = [];
const screenshots = [];
const empiricalMetrics = {};
const cleanupStatus = {
  disposableProfileDir,
  removed: false,
  remainingError: null
};

const waitProcessExit = (proc, timeoutMs = 4000) => new Promise(resolve => {
  if (proc.exitCode !== null || proc.killed) return resolve();
  const timer = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    resolve();
  }, timeoutMs);
  proc.once('exit', () => {
    clearTimeout(timer);
    resolve();
  });
  try { proc.kill(); } catch { /* ignore */ }
});

const removeDirWithRetries = async (dirPath, retries = 8) => {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return { removed: true, error: null };
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return { removed: false, error: lastError ? String(lastError.message || lastError) : 'unknown error' };
};

try {
  let port = null;
  for (let i = 0; i < 200; i += 1) {
    try {
      port = Number((await fs.readFile(path.join(disposableProfileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
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
    }, method === 'Browser.close' ? 2500 : 15000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (expr, label = expr) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expr})`)) return;
      await sleep(40);
    }
    throw new Error(`Timeout waiting for: ${label}`);
  };
  const setViewport = async ({ width, height, mobile = false }) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await until(`window.innerWidth === ${width}`, `viewport ${width}`);
    await waitFrames();
  };
  const captureFullPage = async filename => {
    await waitFrames();
    const metrics = await call('Page.getLayoutMetrics');
    const contentHeight = Math.ceil(metrics.cssContentSize?.height || metrics.contentSize?.height || 1000);
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
  const captureElement = async (selector, filename, padding = 10) => {
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
    if (!box) throw new Error(`Element not found for screenshot: ${selector}`);
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

  await call('Runtime.enable');
  await call('Page.enable');
  await setViewport({ width: 1320, height: 920, mobile: false });
  await call('Page.navigate', { url: `${origin}/?candidate=side-by-side&dataset=short-long-mixed&order=en-id&align=left` });
  await until('window.__notebook4C2 && document.querySelector("[data-nb-candidate-panel=candidate-b]")', 'Prototype mounted');
  await waitFrames();

  // ---------------------------------------------------------------------------
  // 1. Empirical Candidate A (Ruby) vs Candidate B (Measured Parallel Flow)
  // ---------------------------------------------------------------------------
  await run('4C2-1: Side-by-side Short+Long Paragraph & Conversation compares Candidate A (HTML Ruby) vs Candidate B (Measured Parallel Flow)', async () => {
    const check = await evaluate(`(() => {
      const panelA = document.querySelector('[data-nb-candidate-panel="candidate-a"]');
      const panelB = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const p1Sg2Id = window.__notebook4C2.londonIds.segmentIdsByUnitKey.P1_SC1[1];
      const p1Sg3Id = window.__notebook4C2.londonIds.segmentIdsByUnitKey.P1_SC1[2];

      // Inspect Candidate A (Native HTML Ruby) empirical geometry on long multi-line segments
      const rubySeg2Base = panelA.querySelector('[data-nb-ruby-segment="' + p1Sg2Id + '"] .nb-ruby-base');
      const rubySeg2Rt = panelA.querySelector('[data-nb-ruby-segment="' + p1Sg2Id + '"] .nb-ruby-rt');
      const rubySeg2BaseRects = rubySeg2Base ? [...rubySeg2Base.getClientRects()] : [];
      const rubySeg2RtRects = rubySeg2Rt ? [...rubySeg2Rt.getClientRects()] : [];
      const rubyShort1Base = panelA.querySelector('[data-nb-ruby-segment="DERIVED_SEG_SHORT_1"] .nb-ruby-base');
      const rubyShort1Rt = panelA.querySelector('[data-nb-ruby-segment="DERIVED_SEG_SHORT_1"] .nb-ruby-rt');
      const rubyShort2Base = panelA.querySelector('[data-nb-ruby-segment="DERIVED_SEG_SHORT_2"] .nb-ruby-base');
      const rubyShort1GapPx = (rubyShort1Base && rubyShort2Base)
        ? Math.round(rubyShort2Base.getBoundingClientRect().left - rubyShort1Base.getBoundingClientRect().right)
        : null;

      // Inspect Candidate B (Measured Parallel Flow)
      const bSeg2PrimaryFrags = [...panelB.querySelectorAll('[data-notebook-segment-id="' + p1Sg2Id + '"][data-notebook-channel="text"]')];
      const bSeg2SecondaryFrags = [...panelB.querySelectorAll('[data-notebook-segment-id="' + p1Sg2Id + '"][data-notebook-channel="meaning"]')];
      const bSeg3PrimaryFrags = [...panelB.querySelectorAll('[data-notebook-segment-id="' + p1Sg3Id + '"][data-notebook-channel="text"]')];
      const bSeg3SecondaryFrags = [...panelB.querySelectorAll('[data-notebook-segment-id="' + p1Sg3Id + '"][data-notebook-channel="meaning"]')];
      const line0 = panelB.querySelector('[data-nb-card-id="DERIVED_P_MIX"] [data-notebook-line="0"]');
      const line0SegIds = line0 ? [...new Set([...line0.querySelectorAll('[data-notebook-channel="text"]')].map(n => n.dataset.notebookSegmentId))] : [];

      return {
        ruby: {
          exactPrimary: panelA.dataset.nbExactPrimary === 'true',
          exactSecondary: panelA.dataset.nbExactSecondary === 'true',
          seg2BaseRectCount: rubySeg2BaseRects.length,
          seg2RtRectCount: rubySeg2RtRects.length,
          seg2BaseWidth: rubySeg2Base ? Math.round(rubySeg2Base.getBoundingClientRect().width) : 0,
          seg2RtWidth: rubySeg2Rt ? Math.round(rubySeg2Rt.getBoundingClientRect().width) : 0,
          short1BaseWidth: rubyShort1Base ? Math.round(rubyShort1Base.getBoundingClientRect().width) : 0,
          short1RtWidth: rubyShort1Rt ? Math.round(rubyShort1Rt.getBoundingClientRect().width) : 0,
          short1ToShort2GapPx: rubyShort1GapPx,
          horizontalOverflow: panelA.dataset.nbHorizontalOverflow === 'true'
        },
        measured: {
          exactPrimary: panelB.dataset.nbExactPrimary === 'true',
          exactSecondary: panelB.dataset.nbExactSecondary === 'true',
          sharedLines: Number(panelB.dataset.nbSharedLines),
          wrappedSegments: Number(panelB.dataset.nbWrappedSegments),
          secondaryOverlaps: Number(panelB.dataset.nbSecondaryOverlaps),
          horizontalOverflow: panelB.dataset.nbHorizontalOverflow === 'true',
          line0SegIds,
          seg2PrimaryFragCount: bSeg2PrimaryFrags.length,
          seg2SecondaryFragCount: bSeg2SecondaryFrags.length,
          seg2StartsOnFirstFrag: Boolean(bSeg2SecondaryFrags[0]?.textContent?.trim()),
          seg2ContinuesOnLaterFrag: bSeg2SecondaryFrags.length >= 2 && Boolean(bSeg2SecondaryFrags[1]?.textContent?.trim()),
          seg3PrimaryFragCount: bSeg3PrimaryFrags.length,
          seg3SecondaryFragCount: bSeg3SecondaryFrags.length
        }
      };
    })()`);

    empiricalMetrics.sideBySideShortLong = check;
    assert.equal(check.measured.exactPrimary, true, 'Candidate B must reconstruct 100% of primary text');
    assert.equal(check.measured.exactSecondary, true, 'Candidate B must reconstruct 100% of secondary text');
    assert.ok(check.measured.line0SegIds.length >= 2, 'Short adjacent Segments MUST share Line 0 (not 1 segment per line)');
    assert.ok(check.measured.seg2PrimaryFragCount >= 2, 'Long P1 SC1 SG2 must wrap across >=2 visual lines');
    assert.equal(check.measured.seg2StartsOnFirstFrag, true, 'Secondary translation must start beneath Fragment 0');
    assert.equal(check.measured.seg2ContinuesOnLaterFrag, true, 'Secondary translation must continue beneath later fragments');
    assert.equal(check.measured.secondaryOverlaps, 0, 'Candidate B must have ZERO secondary slot overlap');
    assert.equal(check.measured.horizontalOverflow, false, 'Candidate B must have ZERO horizontal overflow');

    await captureFullPage('01-side-by-side-short-long-paragraph-and-conversation.png');
  });

  // ---------------------------------------------------------------------------
  // 2. Full Verbatim "A Journey to London" (4/11/37): EN-ID Left & ID-EN Justify
  // ---------------------------------------------------------------------------
  await run('4C2-2: Full 4/11/37 Journey to London in Candidate B supports EN-ID Left and ID-EN Justify across all Paragraph & Conversation Cards', async () => {
    await evaluate('window.__notebook4C2.setState({ candidateView: "candidate-b", dataset: "london-mixed", order: "en-id", align: "left", widthPreset: "desktop" })');
    await waitFrames();
    const londonEnId = await evaluate(`(() => {
      const p = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      // Measure whether any secondary word was chopped mid-word into multiple vertical rects
      let midWordChops = 0;
      const range = document.createRange();
      for (const span of p.querySelectorAll('.nb-secondary-slot .nb-frag')) {
        const textNode = span.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
        const txt = textNode.textContent || '';
        const matches = [...txt.matchAll(/\\S+/g)];
        for (const m of matches) {
          range.setStart(textNode, m.index);
          range.setEnd(textNode, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
          if (rects.length > 1) midWordChops += 1;
        }
      }
      return {
        cardCount: p.querySelectorAll('[data-nb-card-id]').length,
        unitCount: p.querySelectorAll('[data-nb-unit-key]').length,
        exactPrimary: p.dataset.nbExactPrimary === 'true',
        exactSecondary: p.dataset.nbExactSecondary === 'true',
        sharedLines: Number(p.dataset.nbSharedLines),
        wrappedSegments: Number(p.dataset.nbWrappedSegments),
        secondaryOverlaps: Number(p.dataset.nbSecondaryOverlaps),
        horizontalOverflow: p.dataset.nbHorizontalOverflow === 'true',
        fallbackUnits: Number(p.dataset.nbFallbackUnits),
        midWordChops
      };
    })()`);
    empiricalMetrics.londonEnIdLeft = londonEnId;
    assert.equal(londonEnId.cardCount, 4);
    assert.equal(londonEnId.unitCount, 11);
    assert.equal(londonEnId.exactPrimary, true);
    assert.equal(londonEnId.exactSecondary, true);
    assert.ok(londonEnId.sharedLines >= 4, 'Full London fixture must share lines across adjacent Segments');
    assert.ok(londonEnId.wrappedSegments >= 15, 'Full London fixture must wrap long Segments across lines');
    assert.equal(londonEnId.secondaryOverlaps, 0);
    assert.equal(londonEnId.horizontalOverflow, false);
    assert.equal(londonEnId.fallbackUnits, 0, 'Normal London prose/dialogue must stay in true Parallel Flow without unnecessary fallback');
    assert.equal(londonEnId.midWordChops, 0, 'Candidate B must have ZERO mid-word letter chops across all 37 London segments');
    await captureFullPage('02-candidate-b-london-en-id-left.png');

    // Reversed ID-EN + Justify alignment
    await evaluate('window.__notebook4C2.setState({ order: "id-en", align: "justify" })');
    await waitFrames();
    const londonIdEnJustify = await evaluate(`(() => {
      const p = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const firstPrimaryFrag = p.querySelector('[data-notebook-line="0"] .nb-primary-row [data-notebook-channel]');
      const firstSecondaryFrag = p.querySelector('[data-notebook-secondary-row="0"] [data-notebook-channel]');
      const justifiedLines = p.querySelectorAll('.nb-primary-row[data-justify-line="true"]').length;
      let midWordChops = 0;
      const range = document.createRange();
      for (const span of p.querySelectorAll('.nb-secondary-slot .nb-frag')) {
        const textNode = span.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
        const txt = textNode.textContent || '';
        const matches = [...txt.matchAll(/\\S+/g)];
        for (const m of matches) {
          range.setStart(textNode, m.index);
          range.setEnd(textNode, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
          if (rects.length > 1) midWordChops += 1;
        }
      }
      return {
        exactPrimary: p.dataset.nbExactPrimary === 'true',
        exactSecondary: p.dataset.nbExactSecondary === 'true',
        primaryChannel: firstPrimaryFrag?.dataset.notebookChannel,
        secondaryChannel: firstSecondaryFrag?.dataset.notebookChannel,
        justifiedLines,
        secondaryOverlaps: Number(p.dataset.nbSecondaryOverlaps),
        horizontalOverflow: p.dataset.nbHorizontalOverflow === 'true',
        midWordChops
      };
    })()`);
    empiricalMetrics.londonIdEnJustify = londonIdEnJustify;
    assert.equal(londonIdEnJustify.exactPrimary, true);
    assert.equal(londonIdEnJustify.exactSecondary, true);
    assert.equal(londonIdEnJustify.primaryChannel, 'meaning', 'ID-EN must put Indonesian meaning as primary');
    assert.equal(londonIdEnJustify.secondaryChannel, 'text', 'ID-EN must put English text as secondary');
    assert.ok(londonIdEnJustify.justifiedLines >= 10, 'Justify must justify non-final lines naturally');
    assert.equal(londonIdEnJustify.secondaryOverlaps, 0);
    assert.equal(londonIdEnJustify.horizontalOverflow, false);
    assert.equal(londonIdEnJustify.midWordChops, 0, 'ID-EN Justify must have ZERO mid-word letter chops across all 37 London segments');
    await captureElement('[data-nb-candidate-panel="candidate-b"]', '03-candidate-b-london-id-en-justify.png');
  });

  // ---------------------------------------------------------------------------
  // 3. Complete Stress Fixture (3/8/9) — joinAfter=none, joinAfter=line,
  //    Title, Empty Section/Turn, Long 71-char Speaker, Unequal All aboard!
  // ---------------------------------------------------------------------------
  await run('4C2-3: Complete Stress Fixture preserves joinAfter=none, joinAfter=line, Title, Empty Units, 71-char Speaker & Unequal All aboard!', async () => {
    await evaluate('window.__notebook4C2.setState({ candidateView: "side-by-side", dataset: "stress-complete", order: "en-id", align: "left", widthPreset: "auto" })');
    await waitFrames();
    const stressCheck = await evaluate(`(() => {
      const panelA = document.querySelector('[data-nb-candidate-panel="candidate-a"]');
      const panelB = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const allAboardId = window.__notebook4C2.stressIds.unequalShortEnLongIdSegId;
      const joinNoneId = window.__notebook4C2.stressIds.joinNoneSegId;
      const joinPunctId = window.__notebook4C2.stressIds.joinAfterPunctSegId;

      // Measure Ruby primary gap vs height on "All aboard!" (extreme unequal EN->ID)
      const rubyAllAboardBase = panelA.querySelector('[data-nb-ruby-segment="' + allAboardId + '"] .nb-ruby-base');
      const rubyAllAboardRt = panelA.querySelector('[data-nb-ruby-segment="' + allAboardId + '"] .nb-ruby-rt');
      const rubyAllAboardBox = panelA.querySelector('[data-nb-ruby-segment="' + allAboardId + '"]');

      // Verify Candidate B preserves joinAfter="none" without injecting spaces
      const pStressCardB = panelB.querySelector('[data-nb-card-id="' + window.__notebook4C2.stressIds.paragraphStressCardId + '"]');
      const line0TextB = pStressCardB?.querySelector('[data-notebook-line="0"] .nb-primary-row')?.textContent || '';
      const allAboardLineB = [...(pStressCardB?.querySelectorAll('[data-notebook-line]') || [])]
        .find(l => l.querySelector('[data-notebook-segment-id="' + allAboardId + '"]'));
      const joinNoneLineB = [...(pStressCardB?.querySelectorAll('[data-notebook-line]') || [])]
        .find(l => l.querySelector('[data-notebook-segment-id="' + joinNoneId + '"]'));
      const joinPunctLineB = [...(pStressCardB?.querySelectorAll('[data-notebook-line]') || [])]
        .find(l => l.querySelector('[data-notebook-segment-id="' + joinPunctId + '"]'));

      return {
        rubyAllAboardBaseWidth: rubyAllAboardBase ? Math.round(rubyAllAboardBase.getBoundingClientRect().width) : 0,
        rubyAllAboardRtWidth: rubyAllAboardRt ? Math.round(rubyAllAboardRt.getBoundingClientRect().width) : 0,
        rubyAllAboardBoxWidth: rubyAllAboardBox ? Math.round(rubyAllAboardBox.getBoundingClientRect().width) : 0,
        bExactPrimary: panelB.dataset.nbExactPrimary === 'true',
        bExactSecondary: panelB.dataset.nbExactSecondary === 'true',
        bJoinNoneIntact: line0TextB.includes('Platform 4—direct'),
        bJoinLineSeparated: Boolean(allAboardLineB && joinPunctLineB && allAboardLineB !== joinPunctLineB),
        bEmptyUnitCount: panelB.querySelectorAll('.nb-empty-unit').length,
        bSecondaryOverlaps: Number(panelB.dataset.nbSecondaryOverlaps),
        bHorizontalOverflow: panelB.dataset.nbHorizontalOverflow === 'true',
        aHorizontalOverflow: panelA.dataset.nbHorizontalOverflow === 'true'
      };
    })()`);
    empiricalMetrics.stressComplete = stressCheck;
    assert.equal(stressCheck.bExactPrimary, true);
    assert.equal(stressCheck.bExactSecondary, true);
    assert.equal(stressCheck.bJoinNoneIntact, true, 'joinAfter=none must keep Platform 4—direct glued without stray space');
    assert.equal(stressCheck.bJoinLineSeparated, true, 'joinAfter=line must start All aboard! on a new visual line');
    assert.equal(stressCheck.bEmptyUnitCount, 2, 'Empty Section and Empty Turn must render safely');
    assert.equal(stressCheck.bSecondaryOverlaps, 0);
    assert.equal(stressCheck.bHorizontalOverflow, false);
    await captureFullPage('04-side-by-side-stress-complete.png');
  });

  // ---------------------------------------------------------------------------
  // 4. Extreme Length Mismatch & Non-Silent Fallback (Disposable Derived Case)
  // ---------------------------------------------------------------------------
  await run('4C2-4: Extreme shared-line translation mismatch triggers visible Sentence Interlinear fallback (and supports Extra Annotation Rows mode) without clipping or silent downgrade', async () => {
    await evaluate('window.__notebook4C2.setState({ candidateView: "side-by-side", dataset: "extreme-mismatch", order: "en-id", align: "left", widthPreset: "auto", fallbackPolicy: "auto-fallback" })');
    await waitFrames();
    const autoFallbackCheck = await evaluate(`(() => {
      const panelA = document.querySelector('[data-nb-candidate-panel="candidate-a"]');
      const panelB = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const rubyStopBase = panelA.querySelector('[data-nb-ruby-segment="DERIVED_EXT_TINY_PRIMARY"] .nb-ruby-base');
      const rubyStopNext = panelA.querySelector('[data-nb-ruby-segment="DERIVED_EXT_NEXT_NORMAL"] .nb-ruby-base');
      const rubyStopRect = rubyStopBase ? rubyStopBase.getBoundingClientRect() : null;
      const rubyNextRect = rubyStopNext ? rubyStopNext.getBoundingClientRect() : null;
      const rubySameLine = Boolean(rubyStopRect && rubyNextRect && Math.abs(rubyStopRect.top - rubyNextRect.top) < 16);
      const rubyForcedGapPx = (rubySameLine && rubyStopRect && rubyNextRect)
        ? Math.round(rubyNextRect.left - rubyStopRect.right)
        : null;

      return {
        rubyStopSameLineAsNext: rubySameLine,
        rubyForcedGapPx,
        rubyStopHeightPx: rubyStopRect ? Math.round(rubyStopRect.height) : 0,
        bFallbackBannerCount: panelB.querySelectorAll('[data-notebook-fallback="sentence-interlinear"]').length,
        bExactPrimary: panelB.dataset.nbExactPrimary === 'true',
        bExactSecondary: panelB.dataset.nbExactSecondary === 'true',
        bHorizontalOverflow: panelB.dataset.nbHorizontalOverflow === 'true',
        bTurnStillParallelFlow: panelB.querySelectorAll('[data-nb-card-id="DERIVED_EXTREME_2"] [data-notebook-line]').length >= 2
      };
    })()`);
    empiricalMetrics.extremeAutoFallback = autoFallbackCheck;
    assert.equal(autoFallbackCheck.bFallbackBannerCount, 1, 'Extreme shared-line mismatch must surface explicit Sentence Interlinear fallback banner');
    assert.equal(autoFallbackCheck.bExactPrimary, true);
    assert.equal(autoFallbackCheck.bExactSecondary, true);
    assert.equal(autoFallbackCheck.bHorizontalOverflow, false);
    assert.equal(autoFallbackCheck.bTurnStillParallelFlow, true, 'Unaffected Conversation Card must remain in true Parallel Flow');
    await captureFullPage('05-extreme-mismatch-ruby-vs-fallback.png');

    // Also verify Extra Annotation Rows mode on the same extreme case (zero overlap, full continuation band!)
    await evaluate('window.__notebook4C2.setState({ candidateView: "candidate-b", fallbackPolicy: "extra-rows", widthPreset: "desktop" })');
    await waitFrames();
    const extraRowsCheck = await evaluate(`(() => {
      const p = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      return {
        extraBands: p.querySelectorAll('[data-notebook-extra-band="DERIVED_EXT_TINY_PRIMARY"]').length,
        fallbackBanners: p.querySelectorAll('[data-notebook-fallback="sentence-interlinear"]').length,
        exactPrimary: p.dataset.nbExactPrimary === 'true',
        exactSecondary: p.dataset.nbExactSecondary === 'true',
        secondaryOverlaps: Number(p.dataset.nbSecondaryOverlaps),
        horizontalOverflow: p.dataset.nbHorizontalOverflow === 'true'
      };
    })()`);
    empiricalMetrics.extremeExtraRows = extraRowsCheck;
    assert.equal(extraRowsCheck.extraBands, 1, 'Extra Annotation Rows mode must render continuation annotation band');
    assert.equal(extraRowsCheck.fallbackBanners, 0);
    assert.equal(extraRowsCheck.exactPrimary, true);
    assert.equal(extraRowsCheck.exactSecondary, true);
    assert.equal(extraRowsCheck.secondaryOverlaps, 0);
    assert.equal(extraRowsCheck.horizontalOverflow, false);
    await captureElement('[data-nb-candidate-panel="candidate-b"]', '06-extreme-mismatch-candidate-b-extra-rows.png');
  });

  // ---------------------------------------------------------------------------
  // 5. 390px Mobile, Dark Theme, Font/Size/Line-Height Changes, Zoom & Zero Layout Loops
  // ---------------------------------------------------------------------------
  await run('4C2-5: 390px mobile, Dark Theme, Serif/LG typography, zoom, and resize reflow cleanly with ZERO ResizeObserver loops', async () => {
    await setViewport({ width: 390, height: 844, mobile: true });
    await evaluate('window.__notebook4C2.setState({ candidateView: "candidate-b", dataset: "short-long-mixed", order: "en-id", align: "justify", primarySize: "lg", secondarySize: "sm", fontFamily: "serif", lineHeight: "loose", widthPreset: "auto", dark: true, fallbackPolicy: "auto-fallback" })');
    await waitFrames();
    const passesBeforeWait = await evaluate('window.__notebook4C2.getMeasurePasses()');
    await sleep(350);
    const passesAfterWait = await evaluate('window.__notebook4C2.getMeasurePasses()');

    const mobileCheck = await evaluate(`(() => {
      const p = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      let midWordChops = 0;
      const range = document.createRange();
      for (const span of p.querySelectorAll('.nb-secondary-slot .nb-frag')) {
        const textNode = span.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
        const txt = textNode.textContent || '';
        const matches = [...txt.matchAll(/\\S+/g)];
        for (const m of matches) {
          range.setStart(textNode, m.index);
          range.setEnd(textNode, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
          if (rects.length > 1) midWordChops += 1;
        }
      }
      return {
        exactPrimary: p.dataset.nbExactPrimary === 'true',
        exactSecondary: p.dataset.nbExactSecondary === 'true',
        secondaryOverlaps: Number(p.dataset.nbSecondaryOverlaps),
        horizontalOverflow: p.dataset.nbHorizontalOverflow === 'true',
        docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        wrappedSegments: Number(p.dataset.nbWrappedSegments),
        primaryFontFamily: getComputedStyle(p.querySelector('.nb-primary-row')).fontFamily,
        midWordChops
      };
    })()`);
    empiricalMetrics.mobile390DarkSerif = { ...mobileCheck, passesBeforeWait, passesAfterWait };
    assert.equal(passesAfterWait, passesBeforeWait, 'ResizeObserver MUST NOT trigger layout loops after settling');
    assert.equal(mobileCheck.exactPrimary, true);
    assert.equal(mobileCheck.exactSecondary, true);
    assert.equal(mobileCheck.secondaryOverlaps, 0);
    assert.equal(mobileCheck.horizontalOverflow, false);
    assert.equal(mobileCheck.docOverflow, false, '390px mobile page must have ZERO horizontal overflow');
    assert.equal(mobileCheck.midWordChops, 0, '390px mobile Dark Serif must have ZERO mid-word letter chops');
    assert.ok(mobileCheck.primaryFontFamily.toLowerCase().includes('georgia'), 'Serif font family must apply');
    await captureFullPage('07-mobile-390-dark-candidate-b.png');

    // Zoom check (1.25x CSS zoom) on 390px mobile -> re-triggers clean reflow with zero overlap/overflow
    await evaluate('document.documentElement.style.zoom = "1.25"');
    await waitFrames();
    await sleep(150);
    const zoomCheck = await evaluate(`(() => {
      const p = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      return {
        exactPrimary: p.dataset.nbExactPrimary === 'true',
        exactSecondary: p.dataset.nbExactSecondary === 'true',
        secondaryOverlaps: Number(p.dataset.nbSecondaryOverlaps),
        horizontalOverflow: p.dataset.nbHorizontalOverflow === 'true'
      };
    })()`);
    await evaluate('document.documentElement.style.zoom = ""');
    empiricalMetrics.mobileZoom125 = zoomCheck;
    assert.equal(zoomCheck.exactPrimary, true);
    assert.equal(zoomCheck.exactSecondary, true);
    assert.equal(zoomCheck.secondaryOverlaps, 0);
    assert.equal(zoomCheck.horizontalOverflow, false);

    // Side-by-side comparison screenshot on 390px mobile light theme (stacked panels)
    await evaluate('window.__notebook4C2.setState({ candidateView: "side-by-side", dataset: "short-long-mixed", order: "en-id", align: "left", primarySize: "md", secondarySize: "xs", fontFamily: "sans", lineHeight: "relaxed", dark: false })');
    await waitFrames();
    await captureFullPage('08-mobile-390-side-by-side-ruby-vs-b.png');
  });

  // ---------------------------------------------------------------------------
  // 6. Fragment Selection Identity Preservation Across Reflow (Simulated Only)
  // ---------------------------------------------------------------------------
  await run('4C2-6: Selecting any primary or secondary fragment identifies exact Segment ID + channel, highlights full Segment, and survives width reflow with 0 audio calls', async () => {
    await setViewport({ width: 1280, height: 900, mobile: false });
    await evaluate('window.__notebook4C2.setState({ candidateView: "candidate-b", dataset: "short-long-mixed", order: "en-id", align: "left", widthPreset: "desktop", dark: false })');
    await waitFrames();

    const p1Sg2Id = await evaluate('window.__notebook4C2.londonIds.segmentIdsByUnitKey.P1_SC1[1]');
    // Click fragment index 1 (continuation line!) of P1 SC1 SG2 primary channel
    const clickBeforeReflow = await evaluate(`(() => {
      const panel = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const frag = panel.querySelector('[data-notebook-segment-id="${p1Sg2Id}"][data-notebook-channel="text"][data-notebook-fragment-index="1"]');
      if (!frag) throw new Error('Expected wrapped fragment index 1 for P1 SC1 SG2');
      frag.click();
      const selectedNodes = [...panel.querySelectorAll('[data-notebook-segment-id="${p1Sg2Id}"][data-selected="true"]')];
      const allSegNodes = [...panel.querySelectorAll('[data-notebook-segment-id="${p1Sg2Id}"]')];
      return {
        inspectedId: document.querySelector('[data-nb-inspected-segment-id]')?.dataset.nbInspectedSegmentId,
        inspectedChannel: document.querySelector('[data-nb-inspected-channel]')?.dataset.nbInspectedChannel,
        inspectedExact: document.querySelector('[data-nb-inspected-exact]')?.dataset.nbInspectedExact,
        allFragmentsHighlighted: selectedNodes.length === allSegNodes.length && selectedNodes.length >= 4,
        totalFragsBeforeReflow: allSegNodes.length,
        audioCalls: window.__notebook4C2.getSimulatedAudioCalls()
      };
    })()`);
    assert.equal(clickBeforeReflow.inspectedId, p1Sg2Id);
    assert.equal(clickBeforeReflow.inspectedChannel, 'text');
    assert.equal(clickBeforeReflow.inspectedExact, 'true');
    assert.equal(clickBeforeReflow.allFragmentsHighlighted, true, 'Selecting one fragment must highlight ALL primary + secondary fragments of that Segment');
    assert.equal(clickBeforeReflow.audioCalls, 0);
    await captureFullPage('09-fragment-selection-identity-inspector.png');

    // Reflow width from 760px -> 390px (changes fragment count!) and click a secondary fragment
    await evaluate('window.__notebook4C2.setState({ widthPreset: "mobile" })');
    await waitFrames();
    const clickAfterReflow = await evaluate(`(() => {
      const panel = document.querySelector('[data-nb-candidate-panel="candidate-b"]');
      const secFrags = [...panel.querySelectorAll('[data-notebook-segment-id="${p1Sg2Id}"][data-notebook-channel="meaning"]')];
      if (!secFrags.length) throw new Error('Missing secondary fragments after reflow');
      secFrags[secFrags.length - 1].click();
      return {
        inspectedId: document.querySelector('[data-nb-inspected-segment-id]')?.dataset.nbInspectedSegmentId,
        inspectedChannel: document.querySelector('[data-nb-inspected-channel]')?.dataset.nbInspectedChannel,
        inspectedExact: document.querySelector('[data-nb-inspected-exact]')?.dataset.nbInspectedExact,
        totalFragsAfterReflow: panel.querySelectorAll('[data-notebook-segment-id="${p1Sg2Id}"]').length,
        audioCalls: window.__notebook4C2.getSimulatedAudioCalls()
      };
    })()`);
    assert.equal(clickAfterReflow.inspectedId, p1Sg2Id, 'Original Segment ID must persist across reflow');
    assert.equal(clickAfterReflow.inspectedChannel, 'meaning', 'Actual channel (meaning) must be reported accurately');
    assert.equal(clickAfterReflow.inspectedExact, 'true');
    assert.ok(clickAfterReflow.totalFragsAfterReflow > clickBeforeReflow.totalFragsBeforeReflow, 'Narrowing to 390px must genuinely reflow into more line fragments');
    assert.equal(clickAfterReflow.audioCalls, 0);

    // Final guardrails
    const guard = await evaluate(`({
      dbCalls: window.__uat4DbCalls,
      errors: window.__uat4Errors,
      fixturesUnchanged: window.__notebook4C2.getFixturesUnchanged()
    })`);
    assert.equal(guard.dbCalls, 0);
    assert.deepEqual(guard.errors, []);
    assert.equal(guard.fixturesUnchanged, true);
  });

  await call('Browser.close').catch(() => {});
} catch (error) {
  console.error('UAT-4 4C2 Notebook prototype audit FAILED:', error);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  await waitProcessExit(browser, 4000);
  try { server.closeAllConnections(); } catch { /* ignore */ }
  try { server.close(); } catch { /* ignore */ }

  const rmRes = await removeDirWithRetries(disposableProfileDir);
  cleanupStatus.removed = rmRes.removed;
  cleanupStatus.remainingError = rmRes.error;

  const report = {
    status: process.exitCode ? 'FAIL' : 'PASS',
    browserPath,
    checksPassed: results.length,
    results,
    empiricalMetrics,
    evidenceDir,
    screenshots,
    tempCleanup: cleanupStatus
  };
  await fs.writeFile(path.join(evidenceDir, 'uat4-4c2-notebook-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!cleanupStatus.removed) {
    console.warn(`WARNING: Could not remove disposable temp profile ${disposableProfileDir}: ${cleanupStatus.remainingError}`);
  } else {
    console.log(`CLEANUP OK: Removed disposable browser profile ${disposableProfileDir}`);
  }
}
