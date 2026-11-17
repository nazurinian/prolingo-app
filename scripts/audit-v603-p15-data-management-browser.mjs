import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (await build({ absWorkingDir: root, entryPoints: ['scripts/fixtures/p15-data-management/browser-cases.jsx'],
  bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'true', 'process.env.NODE_ENV': '"development"' } })).outputFiles[0].text;
const server = http.createServer((req, res) => {
  if (req.url === '/cases.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><div id="root"></div><script>
  window.__p15DbCalls=0;window.__p15StorageCalls=0;
  Object.defineProperty(window,'indexedDB',{value:new Proxy({},{get(){window.__p15DbCalls++;throw Error('P15 no DB');}})});
  for(const name of ['localStorage','sessionStorage']) Object.defineProperty(window,name,{value:new Proxy({},{get(){window.__p15StorageCalls++;throw Error('P15 no storage');}})});
  </script><script type="module">import {runP15BrowserCases} from '/cases.js';window.runP15=runP15BrowserCases;</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-p15-a1-'));
const browser = spawn(process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 200; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!port) throw Error('Browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(); let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = event => { const msg = JSON.parse(event.data), target = pending.get(msg.id); if (target) { pending.delete(msg.id); msg.error ? target.reject(Error(JSON.stringify(msg.error))) : target.resolve(msg.result); } };
  await call('Runtime.enable');
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  const response = await call('Runtime.evaluate', { expression: `(async () => {
    const end=performance.now()+10000;while(!window.runP15){if(performance.now()>end)throw Error('Fixture load timeout');await new Promise(requestAnimationFrame);}return window.runP15();
  })()`, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  const report = response.result.value;
  const assets = await fs.readdir(path.join(root, 'dist/assets'));
  const sources = await Promise.all(assets.filter(f => f.endsWith('.js')).map(f => fs.readFile(path.join(root, 'dist/assets', f), 'utf8')));
  report.productionFoundationUnwired = sources.every(s => !s.includes('Database backup requires the complete authoritative metaRecords') && !s.includes('P15 browser edit.'));
  console.log(JSON.stringify(report, null, 2));
  if (report.failed || report.indexedDbCalls || report.storageCalls || !report.productionFoundationUnwired) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); console.log('Disposable profile: ' + profile); }
