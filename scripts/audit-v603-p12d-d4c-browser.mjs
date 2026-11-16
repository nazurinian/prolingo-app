import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const changedSources = new Set(['src/main.jsx', 'src/components/text/conversation/TextConversationEditor.jsx', 'src/components/text/conversation/ConversationSentenceItem.jsx']);
const compile = async (entry, dev) => (await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
  format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.DEV': String(dev), 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'd4c-safety', setup(builder) {
    builder.onResolve({ filter: /^\.\/App\.jsx$/ }, () => ({ path: 'app-stub', namespace: 'd4c' }));
    builder.onLoad({ filter: /.*/, namespace: 'd4c' }, () => ({ contents: 'export default function App(){ return "D4C safe App stub"; }', loader: 'js' }));
    if (baseline) builder.onLoad({ filter: /\.(jsx|js)$/ }, args => {
      const relative = path.relative(root, args.path).replaceAll('\\', '/');
      if (changedSources.has(relative)) return { contents: execFileSync('git', ['show', `2fbee534d62bc861ed33906ec99e929eef887d64:${relative}`], { cwd: root, encoding: 'utf8' }), loader: relative.endsWith('jsx') ? 'jsx' : 'js' };
    });
  } }]
})).outputFiles[0].text;
const bundles = { '/interactive.js': await compile('scripts/fixtures/d4c/browser-interactions.jsx', true),
  '/gate-prod.js': await compile('src/main.jsx', false), '/gate-dev.js': await compile('src/main.jsx', true) };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
  if (bundles[pathname]) { res.end(bundles[pathname]); return; }
  const entry = pathname.startsWith('/gate-prod') ? '/gate-prod.js' : pathname.startsWith('/gate-dev') ? '/gate-dev.js' : '/interactive.js';
  res.end(`<!doctype html><div id="root"></div><script>
    window.__d4cDbCalls=0; window.confirm=()=>true;
    Object.defineProperty(window,'indexedDB',{value:new Proxy({},{get(){window.__d4cDbCalls++;throw Error('D4C forbids IndexedDB');}})});
    </script><script type="module">import * as suite from '${entry}'; window.runD4c=suite.runD4cBrowserInteractions;</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-d4c-edge-'));
const browser = spawn(process.env.D4C_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!port) throw Error('Browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(); let nextId = 0;
  socket.onmessage = event => { const msg = JSON.parse(event.data); const target = pending.get(msg.id); if (target) { pending.delete(msg.id); msg.error ? target.reject(Error(JSON.stringify(msg.error))) : target.resolve(msg.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const navigate = async url => { await call('Page.navigate', { url: origin + url }); await new Promise(resolve => setTimeout(resolve, 400)); };
  const gates = [];
  for (const [route, visible] of [['/gate-prod?qa=conversation-editor', false], ['/gate-prod#qa-conversation-editor', false], ['/gate-dev?qa=conversation-editor', true], ['/gate-dev#qa-conversation-editor', true]]) {
    await navigate(route);
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate('Boolean(document.querySelector("[data-conversation-qa-preview]")) || document.body.textContent.includes("D4C safe App stub")')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const actual = await evaluate('Boolean(document.querySelector("[data-conversation-qa-preview]"))');
    const calls = await evaluate('window.__d4cDbCalls');
    gates.push({ route, expectedVisible: visible, actualVisible: actual, indexedDbCalls: calls, ok: actual === visible && calls === 0 });
  }
  await navigate('/interactive');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  const result = await Promise.race([evaluate('window.runD4c()'), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('D4C browser timeout')), 45000); timer.unref(); })]);
  let productionArtifacts = null;
  if (process.argv.includes('--check-production')) {
    const assets = await fs.readdir(path.join(root, 'dist/assets'));
    const js = assets.filter(file => file.endsWith('.js'));
    const sources = await Promise.all(js.map(file => fs.readFile(path.join(root, 'dist/assets', file), 'utf8')));
    productionArtifacts = { files: js, qaPreviewAbsent: !assets.some(file => file.includes('TextConversationEditorQaPreview'))
      && sources.every(source => !source.includes('data-conversation-qa-preview')) };
  }
  const report = { baseline, ...result, gates, productionArtifacts };
  console.log(JSON.stringify(report, null, 2));
  if (result.failed || result.indexedDbCalls || gates.some(g => !g.ok) || productionArtifacts?.qaPreviewAbsent === false) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); console.log(`Disposable profile: ${profile}`); }
