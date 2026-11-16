import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const baselineSources = new Set([
  'src/components/text/conversation/useConversationAudioPlayback.js',
  'src/components/text/conversation/ConversationSceneAudioPanel.jsx',
  'src/components/text/conversation/ConversationSceneCard.jsx'
]);
const bundleText = (await build({
  absWorkingDir: root,
  entryPoints: ['scripts/fixtures/d5/ui-browser-cases.jsx'],
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'true', 'process.env.NODE_ENV': '"development"' },
  plugins: baseline ? [{ name: 'd5-approved-baseline', setup(builder) {
    builder.onLoad({ filter: /\.(jsx|js)$/ }, args => {
      const relative = path.relative(root, args.path).replaceAll('\\', '/');
      if (baselineSources.has(relative)) return {
        contents: execFileSync('git', ['show', `81221073637e176bc12ef23b538835a6e0886b2c:${relative}`], { cwd: root, encoding: 'utf8' }),
        loader: relative.endsWith('.jsx') ? 'jsx' : 'js'
      };
    });
  } }] : []
})).outputFiles[0].text;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
  if (pathname === '/d5-ui-cases.js') {
    res.end(bundleText);
    return;
  }
  res.end(`<!doctype html><div id="root"></div><script>
    window.__d5UiDbCalls=0; window.confirm=()=>true;
    Object.defineProperty(window,'indexedDB',{value:new Proxy({},{get(){window.__d5UiDbCalls++;throw Error('D5 UI forbids IndexedDB');}})});
    </script><script type="module">import * as s from '/d5-ui-cases.js'; window.runD5Ui=s.runD5UiBrowserInteractions;</script>`);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const edge = process.env.D5_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await fs.access(edge);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-d5-ui-edge-'));
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let socket;
try {
  let debuggingPort;
  for (let i = 0; i < 200; i += 1) {
    try { debuggingPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!debuggingPort) throw new Error('Headless Edge DevTools port unavailable');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  const pending = new Map();
  let nextId = 0;
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    const target = pending.get(msg.id);
    if (!target) return;
    pending.delete(msg.id);
    if (msg.error) target.reject(new Error(JSON.stringify(msg.error)));
    else target.resolve(msg.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  await call('Page.navigate', { url: `${origin}/` });
  await new Promise(resolve => setTimeout(resolve, 400));
  const report = await Promise.race([
    evaluate('window.runD5Ui()'),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('D5 UI browser timeout')), 45000); timer.unref(); })
  ]);
  console.log(JSON.stringify({ baseline, ...report }, null, 2));
  if (report.failed || report.indexedDbCalls) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  console.log(`Disposable browser profile: ${profile}`);
}
