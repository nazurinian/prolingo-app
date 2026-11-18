import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const compile = async (entry, dev = true) => (await build({
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
  }
})).outputFiles[0].text;

const assets = await fs.readdir(path.join(root, 'dist/assets'));
const cssName = assets.find(name => name.startsWith('index-') && name.endsWith('.css'));
if (!cssName) throw new Error('Run npm run build before P15-A2 browser verification');
const css = await fs.readFile(path.join(root, 'dist/assets', cssName));
const bundle = await compile(process.argv.includes('--independent')
  ? 'scripts/fixtures/p15-data-management/a2-independent-browser-cases.jsx'
  : 'scripts/fixtures/p15-data-management/a2-browser-cases.jsx', true);

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/a2-cases.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle);
    return;
  }
  if (pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(css);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css">
<div id="root"></div>
<script>
  window.__p15A2CanonicalDbTouches = 0;
  const origOpen = window.indexedDB.open.bind(window.indexedDB);
  const origDelete = window.indexedDB.deleteDatabase.bind(window.indexedDB);
  window.indexedDB.open = function(name, version) {
    if (String(name || '').trim() === 'prolingo_text_library') {
      window.__p15A2CanonicalDbTouches += 1;
      throw new Error('Canonical prolingo_text_library access is forbidden in P15-A2');
    }
    return version !== undefined ? origOpen(name, version) : origOpen(name);
  };
  window.indexedDB.deleteDatabase = function(name) {
    if (String(name || '').trim() === 'prolingo_text_library') {
      window.__p15A2CanonicalDbTouches += 1;
      throw new Error('Canonical prolingo_text_library deletion is forbidden in P15-A2');
    }
    return origDelete(name);
  };
</script>
<script type="module">
  import { runP15A2BrowserCases } from '/a2-cases.js';
  window.runP15A2 = runP15A2BrowserCases;
</script>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-p15-a2-'));
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
  if (!port) throw new Error('Browser did not start');
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
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    const target = pending.get(msg.id);
    if (target) {
      pending.delete(msg.id);
      if (msg.error) target.reject(new Error(JSON.stringify(msg.error)));
      else target.resolve(msg.result);
    }
  };

  await call('Runtime.enable');
  await call('Emulation.enable').catch(() => {});
  await call('Page.navigate', { url: origin + '/' });
  await new Promise(resolve => setTimeout(resolve, 400));

  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };

  const report = await Promise.race([
    evaluate(`(async () => {
      const end = performance.now() + 10000;
      while (!window.runP15A2) {
        if (performance.now() > end) throw new Error('A2 browser fixture load timeout');
        await new Promise(requestAnimationFrame);
      }
      return window.runP15A2();
    })()`),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('P15-A2 browser suite timeout')), 90000);
      timer.unref();
    })
  ]);

  console.log(JSON.stringify(report, null, 2));
  if (report.failed || report.canonicalDbTouches > 0 || report.hasCanonicalDb || report.remainingDisposableDbs > 0) {
    process.exitCode = 1;
  }

  await call('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
