import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editorMode = process.argv.includes('--editor');
const audioMode = process.argv.includes('--audio');

const compile = async (entry, dev, stubApp = false) => (await build({
  absWorkingDir: root,
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: {
    'import.meta.env.DEV': String(dev),
    'process.env.NODE_ENV': dev ? '"development"' : '"production"'
  },
  plugins: stubApp
    ? [{
        name: 'p13-safe-app-stub',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/App\.jsx$/ }, () => ({ path: 'app-stub', namespace: 'p13-gate' }));
          builder.onLoad({ filter: /.*/, namespace: 'p13-gate' }, () => ({
            contents: 'export default function App(){ return "P13 safe App stub"; }',
            loader: 'js'
          }));
        }
      }]
    : []
})).outputFiles[0].text;

const assets = await fs.readdir(path.join(root, 'dist/assets'));
const cssName = assets.find(name => name.startsWith('index-') && name.endsWith('.css'));
if (!cssName) throw new Error('Run npm run build before P13 browser acceptance');
const css = await fs.readFile(path.join(root, 'dist/assets', cssName));

const bundles = {
  '/cases.js': await compile(audioMode ? 'scripts/fixtures/p13-mixed/audio-browser-cases.jsx' : editorMode ? 'scripts/fixtures/p13-mixed/editor-browser-cases.jsx' : 'scripts/fixtures/p13-mixed/browser-cases.jsx', true, false),
  '/gate-prod.js': await compile('src/main.jsx', false, true),
  '/gate-dev.js': await compile('src/main.jsx', true, true)
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (bundles[pathname]) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundles[pathname]);
    return;
  }
  if (pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(css);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  const entry = pathname.startsWith('/gate-prod')
    ? '/gate-prod.js'
    : pathname.startsWith('/gate-dev')
      ? '/gate-dev.js'
      : '/cases.js';
  res.end(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css">
<div id="root"></div>
<script>
  window.__p13DbCalls = 0;
  window.__p13StorageCalls = 0;
  Object.defineProperty(window, 'indexedDB', {
    value: new Proxy({}, { get() { window.__p13DbCalls++; throw new Error('P13 forbids IndexedDB'); } })
  });
  Object.defineProperty(window, 'localStorage', {
    value: new Proxy({}, { get() { window.__p13StorageCalls++; throw new Error('P13 forbids storage'); } })
  });
</script>
${entry === '/cases.js'
  ? `<script type="module">import { runP13BrowserCases, runP13AudioDiagnostics } from '/cases.js'; window.runP13 = runP13BrowserCases; window.runP13AudioDiagnostics = runP13AudioDiagnostics;</script>`
  : `<script type="module" src="${entry}"></script>`}`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-p13-mixed-'));
const browser = spawn(
  process.env.P13_BROWSER_PATH || process.env.A2_BROWSER_PATH || process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', ...(audioMode ? ['--autoplay-policy=no-user-gesture-required'] : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' }
);

let socket;
try {
  let port;
  for (let i = 0; i < 200; i += 1) {
    try {
      port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!port) throw new Error('P13 browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
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
    const message = JSON.parse(event.data);
    const target = pending.get(message.id);
    if (target) {
      pending.delete(message.id);
      if (message.error) target.reject(new Error(JSON.stringify(message.error)));
      else target.resolve(message.result);
    }
  };

  await call('Runtime.enable');
  await call('Emulation.enable').catch(() => {});

  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  const navigate = async urlPath => {
    await call('Page.navigate', { url: origin + urlPath });
    await new Promise(resolve => setTimeout(resolve, 400));
  };

  // 1. Verify QA route gating & interactive Part/Segment transition in QA Preview
  const gates = [];
  for (const [route, expectedVisible] of [
    ['/gate-prod?qa=mixed-workspace', false],
    ['/gate-prod#qa-mixed-workspace', false],
    ['/gate-dev?qa=mixed-workspace', true],
    ['/gate-dev#qa-mixed-workspace', true]
  ]) {
    await navigate(route);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await evaluate(
        'Boolean(document.querySelector("[data-mixed-workspace-qa-preview]")) || document.body.textContent.includes("P13 safe App stub")'
      );
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const actualVisible = await evaluate('Boolean(document.querySelector("[data-mixed-workspace-qa-preview]"))');
    const calls = await evaluate('window.__p13DbCalls + window.__p13StorageCalls');
    const qaLevelSwitchOk = !actualVisible || await evaluate(`(async () => {
      document.querySelector('[data-shared-card-level-option="part"]').click();
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        if (document.querySelector('[data-shared-mixed-reader] [data-shared-view-level]')?.dataset.sharedViewLevel === 'part'
          && document.querySelector('[data-shared-card-role=scene]')
          && document.querySelector('[data-mixed-qa-audio-scope="split-1x"]')) return true;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return false;
    })()`);
    const editorGateOk = !editorMode || !actualVisible || await evaluate(`(async () => {
      document.querySelector('[data-mixed-qa-editor-toggle]').click();
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        if (document.querySelector('[data-mixed-workspace-editor]') && document.querySelector('[data-mixed-paragraph-editor]') && document.querySelector('[data-conversation-scene-id]')) return true;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return false;
    })()`);
    const audioGateOk = !audioMode || !actualVisible || await evaluate(`(async () => {
      const preview = document.querySelector('[data-mixed-workspace-qa-preview]');
      const reader = document.querySelector('[data-shared-mixed-reader]');
      for (const [selector, value] of [['[data-mixed-qa-audio-representation]', 'full'], ['[data-mixed-qa-audio-rate]', '1.5'], ['[data-mixed-qa-audio-channel]', 'meaning-text']]) {
        const select = document.querySelector(selector);
        if (!select) return false;
        select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return document.querySelector('[data-mixed-qa-audio-scope="controlled-audio"]')
        && document.querySelector('[data-mixed-workspace-qa-preview]') === preview
        && document.querySelector('[data-shared-mixed-reader]') === reader
        && reader.dataset.readerCursorPrecision === 'none';
    })()`);
    gates.push({
      route,
      expectedVisible,
      actualVisible,
      qaLevelSwitchOk,
      editorGateOk,
      audioGateOk: Boolean(audioGateOk),
      zeroDbAndStorage: calls === 0,
      ok: actualVisible === expectedVisible && qaLevelSwitchOk && editorGateOk && audioGateOk && calls === 0
    });
  }

  // 2. Run real-browser P13 cases
  await navigate('/');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await new Promise(resolve => setTimeout(resolve, 500));

  const suiteReport = await Promise.race([
    evaluate('window.runP13()'),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('P13 browser suite timeout')), 60000);
      timer.unref();
    })
  ]);
  const audioIntegrationDiagnostics = await evaluate('window.runP13AudioDiagnostics()');

  let productionArtifacts = null;
  if (process.argv.includes('--check-production')) {
    const distAssets = await fs.readdir(path.join(root, 'dist/assets'));
    const jsFiles = distAssets.filter(name => name.endsWith('.js'));
    const sources = await Promise.all(
      jsFiles.map(name => fs.readFile(path.join(root, 'dist/assets', name), 'utf8'))
    );
    productionArtifacts = {
      files: jsFiles,
      qaPreviewAbsent: !distAssets.some(name => name.includes('TextMixedWorkspaceQaPreview'))
        && sources.every(src => !src.includes('data-mixed-workspace-qa-preview') && !src.includes('data-conversation-qa-preview') && !src.includes('data-mixed-workspace-editor'))
    };
  }

  const report = {
    ...suiteReport,
    audioIntegrationDiagnostics,
    gates,
    productionArtifacts
  };
  console.log(JSON.stringify(report, null, 2));

  if (
    report.failed
    || report.indexedDbCalls
    || report.storageCalls
    || Array.isArray(audioIntegrationDiagnostics) && audioIntegrationDiagnostics.some(d => d.expectationMet === false)
    || gates.some(g => !g.ok)
    || productionArtifacts?.qaPreviewAbsent === false
  ) {
    process.exitCode = 1;
  }

  await call('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log(`Disposable profile: ${profile}`);
}
