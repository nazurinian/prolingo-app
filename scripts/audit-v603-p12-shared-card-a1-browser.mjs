import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (await build({ absWorkingDir: root, entryPoints: ['scripts/fixtures/shared-card-a1/browser-cases.jsx'], bundle: true,
  write: false, format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'true', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'a1-approved-paragraph', setup(builder) {
    builder.onResolve({ filter: /^a1-approved-paragraph$/ }, () => ({ path: 'paragraph', namespace: 'a1-baseline' }));
    builder.onLoad({ filter: /.*/, namespace: 'a1-baseline' }, () => ({
      contents: execFileSync('git', ['show', 'cb12f95ea6bf3045502b60ee824abe4c1b23695c:src/components/text/TextParagraphUnifiedReading.jsx'], { cwd: root, encoding: 'utf8' }),
      loader: 'jsx', resolveDir: path.join(root, 'src/components/text')
    }));
  } }]
})).outputFiles[0].text;
// Test the actual production CSS, without loading App or any production services.
const assets = await fs.readdir(path.join(root, 'dist/assets'));
const cssName = assets.find(name => name.startsWith('index-') && name.endsWith('.css'));
if (!cssName) throw Error('Run npm run build before A1 browser acceptance');
const css = await fs.readFile(path.join(root, 'dist/assets', cssName));
const server = http.createServer((req, res) => {
  if (req.url === '/cases.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
  if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><div id="root"></div><script>
    window.__a1DbCalls=0;window.__a1StorageCalls=0;window.__a1InputPending={};
    Object.defineProperty(window,'indexedDB',{value:new Proxy({},{get(){window.__a1DbCalls++;throw Error('A1 forbids IndexedDB');}})});
    Object.defineProperty(window,'localStorage',{value:new Proxy({},{get(){window.__a1StorageCalls++;throw Error('A1 forbids storage');}})});
    </script><script type="module">import {runA1BrowserCases} from '/cases.js';window.runA1=runA1BrowserCases;</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-shared-card-a1-'));
const browser = spawn(process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 200; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!port) throw Error('A1 browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(); let nextId = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const input = async payload => {
    const { id, key } = JSON.parse(payload);
    const keys = { Enter: ['Enter', 13], ' ': ['Space', 32], Tab: ['Tab', 9] };
    const [code, windowsVirtualKeyCode] = keys[key];
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    await call('Runtime.evaluate', { expression: `window.__a1InputPending[${id}]();delete window.__a1InputPending[${id}];` });
  };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.bindingCalled') { input(message.params.payload).catch(error => console.error(error)); return; }
    const target = pending.get(message.id);
    if (target) { pending.delete(message.id); message.error ? target.reject(Error(JSON.stringify(message.error))) : target.resolve(message.result); }
  };
  await call('Runtime.enable');
  await call('Runtime.addBinding', { name: 'a1BrowserInput' });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await new Promise(resolve => setTimeout(resolve, 500));
  const result = await Promise.race([
    call('Runtime.evaluate', { expression: 'window.runA1()', awaitPromise: true, returnByValue: true }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('A1 browser timeout')), 45000); timer.unref(); })
  ]);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  const report = result.result.value;
  console.log(JSON.stringify(report, null, 2));
  if (report.failed || report.indexedDbCalls || report.storageCalls) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); console.log(`Disposable profile: ${profile}`); }
