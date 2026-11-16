import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
        name: 'a2-safe-app-stub',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/App\.jsx$/ }, () => ({ path: 'app-stub', namespace: 'a2-gate' }));
          builder.onLoad({ filter: /.*/, namespace: 'a2-gate' }, () => ({
            contents: 'export default function App(){ return "A2 safe App stub"; }',
            loader: 'js'
          }));
        }
      }]
    : []
})).outputFiles[0].text;

const assets = await fs.readdir(path.join(root, 'dist/assets'));
const cssName = assets.find(name => name.startsWith('index-') && name.endsWith('.css'));
if (!cssName) throw new Error('Run npm run build before A2 browser acceptance');
const css = await fs.readFile(path.join(root, 'dist/assets', cssName));

const bundles = {
  '/cases.js': await compile('scripts/fixtures/shared-card-a2/browser-cases.jsx', true, false),
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
  window.__a2DbCalls = 0;
  window.__a2StorageCalls = 0;
  window.__a2InputPending = {};
  Object.defineProperty(window, 'indexedDB', {
    value: new Proxy({}, { get() { window.__a2DbCalls++; throw new Error('A2 forbids IndexedDB'); } })
  });
  Object.defineProperty(window, 'localStorage', {
    value: new Proxy({}, { get() { window.__a2StorageCalls++; throw new Error('A2 forbids storage'); } })
  });
</script>
${entry === '/cases.js'
  ? `<script type="module">import { runA2BrowserCases } from '/cases.js'; window.runA2 = runA2BrowserCases;</script>`
  : `<script type="module" src="${entry}"></script>`}`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-shared-card-a2-'));
const browser = spawn(
  process.env.A2_BROWSER_PATH || process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
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
  if (!port) throw new Error('A2 browser did not start');
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

  const handleControl = async payload => {
    const msg = JSON.parse(payload);
    if (msg.type === 'key') {
      const keys = { Enter: ['Enter', 13], ' ': ['Space', 32], Tab: ['Tab', 9] };
      const [code, windowsVirtualKeyCode] = keys[msg.key];
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: msg.key, code, windowsVirtualKeyCode });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: msg.key, code, windowsVirtualKeyCode });
    } else if (msg.type === 'viewport') {
      await call('Emulation.setDeviceMetricsOverride', {
        width: msg.width,
        height: msg.height,
        deviceScaleFactor: 1,
        mobile: msg.width <= 480
      });
    } else if (msg.type === 'reducedMotion') {
      await call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: msg.enabled ? 'reduce' : 'no-preference' }]
      });
    }
    await call('Runtime.evaluate', {
      expression: `window.__a2InputPending[${msg.id}](); delete window.__a2InputPending[${msg.id}];`
    });
  };

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.bindingCalled') {
      handleControl(message.params.payload).catch(error => console.error(error));
      return;
    }
    const target = pending.get(message.id);
    if (target) {
      pending.delete(message.id);
      if (message.error) target.reject(new Error(JSON.stringify(message.error)));
      else target.resolve(message.result);
    }
  };

  await call('Runtime.enable');
  await call('Emulation.enable').catch(() => {});
  await call('Runtime.addBinding', { name: 'a2BrowserControl' });

  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  const navigate = async urlPath => {
    await call('Page.navigate', { url: origin + urlPath });
    await new Promise(resolve => setTimeout(resolve, 400));
  };

  // 1. Verify QA route gating & interactive QA Preview in dev vs hidden in prod
  const gates = [];
  for (const [route, expectedVisible] of [
    ['/gate-prod?qa=shared-card-reader', false],
    ['/gate-prod#qa-shared-card-reader', false],
    ['/gate-dev?qa=shared-card-reader', true],
    ['/gate-dev#qa-shared-card-reader', true]
  ]) {
    await navigate(route);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await evaluate(
        'Boolean(document.querySelector("[data-shared-card-qa-preview]")) || document.body.textContent.includes("A2 safe App stub")'
      );
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const actualVisible = await evaluate('Boolean(document.querySelector("[data-shared-card-qa-preview]"))');
    const calls = await evaluate('window.__a2DbCalls + window.__a2StorageCalls');
    let qaCompareOk = true;
    if (actualVisible && route === '/gate-dev?qa=shared-card-reader') {
      qaCompareOk = await evaluate(`(() => {
        document.querySelector('[data-qa-comparison="compare"]')?.click();
        return Boolean(document.querySelector('[data-shared-card-qa-preview]'));
      })()`);
    }
    gates.push({
      route,
      expectedVisible,
      actualVisible,
      qaCompareOk,
      zeroDbAndStorage: calls === 0,
      ok: actualVisible === expectedVisible && qaCompareOk && calls === 0
    });
  }

  // 2. Run real-browser A2 cases
  await navigate('/');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await new Promise(resolve => setTimeout(resolve, 500));

  const suiteReport = await Promise.race([
    evaluate('window.runA2()'),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('A2 browser suite timeout')), 45000);
      timer.unref();
    })
  ]);

  let productionArtifacts = null;
  if (process.argv.includes('--check-production')) {
    const distAssets = await fs.readdir(path.join(root, 'dist/assets'));
    const jsFiles = distAssets.filter(name => name.endsWith('.js'));
    const sources = await Promise.all(
      jsFiles.map(name => fs.readFile(path.join(root, 'dist/assets', name), 'utf8'))
    );
    productionArtifacts = {
      files: jsFiles,
      qaPreviewAbsent: !distAssets.some(name => name.includes('TextSharedCardReaderQaPreview'))
        && sources.every(src => !src.includes('data-shared-card-qa-preview') && !src.includes('data-conversation-qa-preview'))
    };
  }

  const report = {
    ...suiteReport,
    gates,
    productionArtifacts
  };
  console.log(JSON.stringify(report, null, 2));

  if (
    report.failed
    || report.indexedDbCalls
    || report.storageCalls
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
