import { build } from 'esbuild';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compile = async (entry, dev, stub = false) => (await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, jsx: 'automatic', format: 'esm', loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': String(dev), 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  plugins: stub ? [{ name: 'safe-app', setup(b) { b.onResolve({ filter: /^\.\/App\.jsx$/ }, () => ({ path: 'stub', namespace: 'safe' })); b.onLoad({ filter: /.*/, namespace: 'safe' }, () => ({ contents: 'export default function App(){return "Safe production App stub"}', loader: 'js' })); } }] : [] })).outputFiles[0].text;
const assets = await fs.readdir(path.join(root, 'dist/assets'));
const css = await fs.readFile(path.join(root, 'dist/assets', assets.find(s => s.endsWith('.css'))));
const bundles = { '/cases.js': await compile('scripts/fixtures/p15-integrated/beta-browser-cases.jsx', true), '/dev.js': await compile('src/main.jsx', true, true),
  '/real.js': await compile('src/main.jsx', true), '/prod.js': await compile('src/main.jsx', false, true) };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (bundles[url.pathname]) { res.setHeader('Content-Type', 'text/javascript'); res.end(bundles[url.pathname]); return; }
  if (url.pathname === '/style.css') { res.end(css); return; }
  const entry = url.pathname.startsWith('/prod') ? '/prod.js' : url.pathname.startsWith('/real') ? '/real.js' : url.pathname.startsWith('/dev') ? '/dev.js' : '/cases.js';
  res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><div id="root"></div><script>
  window.qaOpens=0;window.canonicalTouches=0;const op=indexedDB.open.bind(indexedDB);
  indexedDB.open=(name,...rest)=>{if(!String(name).startsWith('prolingo_text_library_d3b_qa_')){window.canonicalTouches++;throw Error('Non-QA database blocked');} window.qaOpens++;return op(name,...rest);};
  </script>${entry === '/cases.js' ? '<script type="module">import * as tests from "/cases.js";window.tests=tests;</script>' : '<script type="module" src="' + entry + '"></script>'}`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port, profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-r3-beta-'));
let processHandle, socket;
const launch = async () => {
  processHandle = spawn(process.env.P15_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 150; i++) { try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); const response = await fetch('http://127.0.0.1:' + port + '/json/list'); if (response.ok) break; } catch { port = null; } await new Promise(r => setTimeout(r, 100)); }
  if (!port) throw Error('Edge did not start');
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); socket = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
  let id = 0; const requests = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => { requests.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = event => { const msg = JSON.parse(event.data), target = requests.get(msg.id); if (target) { requests.delete(msg.id); msg.error ? target.reject(Error(JSON.stringify(msg.error))) : target.resolve(msg.result); } };
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await call('Runtime.enable');
  const navigate = async url => { await call('Page.navigate', { url: origin + url }); await evaluate('(async()=>{const end=performance.now()+15000;while(!window.tests && !document.querySelector("[data-structured-text-beta]") && !document.querySelector("[data-unified-text-demo]") && !document.body.textContent.includes("Safe production App stub")){if(performance.now()>end)throw Error("Load timeout");await new Promise(requestAnimationFrame)}})()'); };
  const close = async () => { const exiting = new Promise(r => processHandle.once('exit', r)); await call('Browser.close').catch(() => {}); socket.close(); await Promise.race([exiting, new Promise(r => setTimeout(r, 5000))]); };
  return { call, evaluate, navigate, close };
};
try {
  let browser = await launch(); await browser.navigate('/');
  const report = await browser.evaluate('window.tests.runBetaFirst()');
  if (report.failed) throw Error(JSON.stringify(report));
  await browser.call('Page.reload'); await browser.evaluate('(async()=>{while(!window.tests)await new Promise(requestAnimationFrame);return true})()');
  report.pageReload = await browser.evaluate('window.tests.verifyBetaReload(' + JSON.stringify(report.expected) + ')');
  await browser.close();
  // A genuinely new Edge process, same temporary profile, not just a React remount.
  browser = await launch(); await browser.navigate('/');
  report.browserRestart = await browser.evaluate('window.tests.verifyBetaReload(' + JSON.stringify(report.expected) + ')');
  await browser.evaluate('window.tests.cleanupBeta()');
  report.canonicalTouches = await browser.evaluate('window.canonicalTouches');
  const gates = [];
  for (const [prefix, qa, marker, visible] of [['/prod', 'text-beta', 'data-structured-text-beta', false], ['/dev', 'text-beta', 'data-structured-text-beta', true], ['/prod', 'structured-text', 'data-unified-text-demo', false], ['/dev', 'structured-text', 'data-unified-text-demo', true],
    ['/real', 'text-beta', 'data-structured-text-beta', true], ['/real', 'structured-text', 'data-unified-text-demo', true]]) {
    await browser.navigate(prefix + '?qa=' + qa);
    const actual = await browser.evaluate('Boolean(document.querySelector("[' + marker + ']"))');
    const opens = await browser.evaluate('window.qaOpens');
    gates.push({ qa, prefix, visible: actual, expected: visible, opens });
    if (actual !== visible || opens !== 0) throw Error('DEV route/opt-in gate failed');
  }
  report.gates = gates; delete report.expected;
  report.productionExcluded = (await Promise.all(assets.filter(s => s.endsWith('.js')).map(s => fs.readFile(path.join(root, 'dist/assets', s), 'utf8')))).every(s => !s.includes('data-structured-text-beta') && !s.includes('data-unified-text-demo'));
  console.log(JSON.stringify(report, null, 2));
  if (!report.productionExcluded || report.canonicalTouches) process.exitCode = 1;
  await browser.close();
} finally { socket?.close(); processHandle?.kill(); server.closeAllConnections(); server.close(); console.log('Isolated Edge profile: ' + profile); }
