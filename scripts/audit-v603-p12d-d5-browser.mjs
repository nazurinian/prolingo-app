import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No dependencies, app startup, canonical IndexedDB, or live audio services.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = process.env.D5_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await fs.access(edge);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-d5-edge-'));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Isolated D5 audio QA</title>'); return; }
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', /\.(m?js)$/.test(file) ? 'text/javascript' : 'text/plain');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  const deadline = Date.now() + 20000;
  let debuggingPort;
  while (Date.now() < deadline) {
    try { debuggingPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!debuggingPort) throw new Error('Headless browser did not expose DevTools');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  let id = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const nextId = ++id;
    pending.set(nextId, { resolve, reject });
    socket.send(JSON.stringify({ id: nextId, method, params }));
  });
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await new Promise(resolve => setTimeout(resolve, 300));
  const outcome = await Promise.race([
    call('Runtime.evaluate', {
      expression: "import('/scripts/fixtures/d5/browser-audio-cases.js').then(m => m.runD5AudioBrowserCases())",
      awaitPromise: true, returnByValue: true
    }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Browser QA exceeded 45 seconds')), 45000); timer.unref(); })
  ]);
  if (outcome.exceptionDetails) throw new Error(JSON.stringify(outcome.exceptionDetails));
  const report = outcome.result.value;
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  // Keep the isolated profile path visible; no recursive filesystem deletion is needed.
  console.log(`Disposable browser profile: ${profile}`);
}
