import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkProduction = process.argv.includes('--check-production');
const screenshotsArg = process.argv.find(arg => arg.startsWith('--screenshots-dir='));
const screenshotsDir = screenshotsArg ? path.resolve(root, screenshotsArg.split('=')[1]) : null;
if (screenshotsDir) {
  await fs.mkdir(screenshotsDir, { recursive: true });
}

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
        name: 'p15-safe-app-stub',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/App\.jsx$/ }, () => ({ path: 'app-stub', namespace: 'p15-gate' }));
          builder.onLoad({ filter: /.*/, namespace: 'p15-gate' }, () => ({
            contents: 'export default function App(){ return "P15 safe App stub"; }',
            loader: 'js'
          }));
        }
      }]
    : []
})).outputFiles[0].text;

const assets = await fs.readdir(path.join(root, 'dist/assets'));
const cssName = assets.find(name => name.startsWith('index-') && name.endsWith('.css'));
if (!cssName) throw new Error('Run npm run build before P15 browser acceptance');
const css = await fs.readFile(path.join(root, 'dist/assets', cssName));

const bundles = {
  '/cases.js': await compile('scripts/fixtures/p15-data-management/browser-cases.jsx', true, false),
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
  window.__p15DbCalls = 0;
  window.__p15StorageCalls = 0;
  window.__p15InputPending = {};
  Object.defineProperty(window, 'indexedDB', {
    value: new Proxy({}, { get() { window.__p15DbCalls++; throw Error('P15 no DB'); } })
  });
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, {
      value: new Proxy({}, { get() { window.__p15StorageCalls++; throw Error('P15 no storage'); } })
    });
  }
</script>
${entry === '/cases.js'
    ? '<script type="module">import { runP15BrowserCases } from \'/cases.js\'; window.runP15 = runP15BrowserCases;</script>'
    : `<script type="module" src="${entry}"></script>`}`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-p15-h1-'));
const browser = spawn(
  process.env.P15_BROWSER_PATH || process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
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
  if (!port) throw Error('Browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  const pending = new Map();
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const savedScreenshots = [];

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    const target = pending.get(msg.id);
    if (target) {
      pending.delete(msg.id);
      if (msg.error) target.reject(Error(JSON.stringify(msg.error)));
      else target.resolve(msg.result);
    }
  };

  await call('Runtime.enable');
  await call('Emulation.enable').catch(() => {});
  await call('Runtime.addBinding', { name: 'p15BrowserControl' });

  socket.addEventListener('message', async event => {
    const msg = JSON.parse(event.data);
    if (msg.method !== 'Runtime.bindingCalled' || msg.params?.name !== 'p15BrowserControl') return;
    const req = JSON.parse(msg.params.payload || '{}');
    try {
      if (req.type === 'viewport') {
        await call('Emulation.setDeviceMetricsOverride', {
          width: Number(req.width) || 1280,
          height: Number(req.height) || 800,
          deviceScaleFactor: 1,
          mobile: Number(req.width) <= 500
        });
      } else if (req.type === 'screenshot' && screenshotsDir && req.name) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(screenshotsDir, `${req.name}.png`);
        await fs.writeFile(filePath, Buffer.from(shot.data, 'base64'));
        savedScreenshots.push(filePath);
      }
    } finally {
      await call('Runtime.evaluate', { expression: `window.__p15InputPending[${req.id}]?.(); delete window.__p15InputPending[${req.id}];` }).catch(() => {});
    }
  });

  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };

  const navigate = async urlPath => {
    await call('Page.navigate', { url: origin + urlPath });
    await new Promise(resolve => setTimeout(resolve, 350));
  };

  // 1. DEV vs Production route isolation check
  const gates = [];
  for (const [route, expectedVisible] of [
    ['/gate-prod?qa=data-management', false],
    ['/gate-prod#qa-data-management', false],
    ['/gate-dev?qa=data-management', true],
    ['/gate-dev#qa-data-management', true]
  ]) {
    await navigate(route);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await evaluate(
        'Boolean(document.querySelector("[data-dm-qa-preview]")) || document.body.textContent.includes("P15 safe App stub")'
      );
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const actualVisible = await evaluate('Boolean(document.querySelector("[data-dm-qa-preview]"))');
    const calls = await evaluate('window.__p15DbCalls + window.__p15StorageCalls');
    const devRouteHealthy = !actualVisible || await evaluate(`(async () => {
      const end = performance.now() + 4000;
      while (performance.now() < end) {
        if (document.querySelector('[data-dm-page="ready"]') && document.querySelector('[data-dm-mode-badge="read-only"]')) return true;
        await new Promise(r => requestAnimationFrame(r));
      }
      return false;
    })()`);
    gates.push({
      route,
      expectedVisible,
      actualVisible,
      devRouteHealthy,
      zeroDbAndStorage: calls === 0,
      ok: actualVisible === expectedVisible && devRouteHealthy && calls === 0
    });
  }

  // 2. Main Interactive A1 + P15-H1 Cases
  await navigate('/');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await new Promise(resolve => setTimeout(resolve, 300));

  const report = await Promise.race([
    evaluate(`(async () => {
      const end = performance.now() + 10000;
      while (!window.runP15) {
        if (performance.now() > end) throw Error('Fixture load timeout');
        await new Promise(requestAnimationFrame);
      }
      return window.runP15();
    })()`),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('P15 browser suite timeout')), 90000);
      timer.unref();
    })
  ]);

  const jsFiles = assets.filter(f => f.endsWith('.js'));
  const sources = await Promise.all(jsFiles.map(f => fs.readFile(path.join(root, 'dist/assets', f), 'utf8')));
  report.productionFoundationUnwired = sources.every(
    s => !s.includes('Database backup requires the complete authoritative metaRecords')
      && !s.includes('P15 browser edit.')
      && !s.includes('data-dm-qa-preview')
      && !s.includes('data-dm-page')
  );
  if (checkProduction) {
    report.productionArtifacts = {
      files: jsFiles,
      qaPreviewAbsent: !assets.some(name => name.includes('TextDataManagementQaPreview'))
        && report.productionFoundationUnwired
    };
  }
  report.gates = gates;
  if (screenshotsDir) {
    report.screenshots = savedScreenshots;
  }

  console.log(JSON.stringify(report, null, 2));
  if (
    report.failed
    || report.indexedDbCalls
    || report.storageCalls
    || !report.productionFoundationUnwired
    || gates.some(g => !g.ok)
    || report.productionArtifacts?.qaPreviewAbsent === false
  ) {
    process.exitCode = 1;
  }

  await call('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log('Disposable profile: ' + profile);
}
