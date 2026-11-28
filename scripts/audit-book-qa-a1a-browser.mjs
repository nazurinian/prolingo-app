import assert from 'node:assert/strict';
import { checkBookQaHostBoundaries } from './fixtures/p15-integrated/book-qa-hf1-browser.mjs';
import { checkBookQaAudioStorage, bookAudioAuditLibraries } from './fixtures/a1b-1a/check-book-qa-audio.mjs';
import { checkBookBodyAudio, bodyAuditLibraries } from './fixtures/a1b-1b/check-body-audio.mjs';
import { checkBookHeadingAudio, headingAuditLibraries } from './fixtures/a1b-1c/check-heading-audio.mjs';
import { checkBookPortableAudio, portableAuditLibraries } from './fixtures/a1b-2a/check-portable-audio.mjs';
import { checkBookNormalAudio, normalAuditLibraries } from './fixtures/a1b-2b/check-normal-audio.mjs';
import { checkBookAudioHardening, hardeningAuditLibraries } from './fixtures/a1b-g/check-hardening.mjs';
import { checkBookHardeningPlayback } from './fixtures/a1b-g/check-hardening-playback.mjs';
import { checkPersistentBookQaDemo, demoAuditLibraries } from './fixtures/book-qa/check-persistent-demo.mjs';
import { checkBookQaReaderRefinement, readerRefinementLibraries } from './fixtures/book-qa/check-reader-refinement.mjs';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uatRoot = process.env.BOOK_QA_HF1_BUILD || path.join(root, 'dist-uat');
const productionRoot = path.join(root, 'dist');
const qaDbName = 'prolingo_text_library_d3b_qa_a1a_browser';
const qaPrefix = 'prolingo_text_library_d3b_qa_';
const canonicalName = 'prolingo_text_library';
const audioAudit = process.env.BOOK_QA_AUDIO_AUDIT === '1';
const bodyAudit = process.env.BOOK_QA_BODY_AUDIO_AUDIT === '1';
const headingAudit = process.env.BOOK_QA_HEADING_AUDIO_AUDIT === '1';
const portableAudit = process.env.BOOK_QA_PORTABLE_AUDIO_AUDIT === '1';
const hardeningAudit = process.env.BOOK_QA_HARDENING_AUDIT === '1';
const demoAudit = process.env.BOOK_QA_A2_AUDIT === '1';
const readerRefinement = process.env.BOOK_QA_HF1_READER_AUDIT;
const nativeSpeech = ['native', 'hf2-native'].includes(readerRefinement);
const companionByLibrary = { ...(audioAudit ? bookAudioAuditLibraries : {}), ...(bodyAudit ? bodyAuditLibraries : {}),
  ...(headingAudit ? headingAuditLibraries : {}), ...(portableAudit ? { ...portableAuditLibraries, ...normalAuditLibraries } : {}),
  ...(hardeningAudit ? hardeningAuditLibraries : {}), ...(demoAudit ? demoAuditLibraries : {}),
  ...(readerRefinement ? readerRefinementLibraries : {}) };
const bodyRequests = [];
const evidenceDir = process.env.BOOK_QA_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-book-qa-evidence-'));
const evidenceFile = path.join(evidenceDir, 'a1a-bookqa-main-app.png');

const assertDir = async directory => {
  try { await fs.access(directory); } catch { throw new Error(`Required build output is missing: ${directory}`); }
};
await assertDir(uatRoot);
await assertDir(productionRoot);

const probeSource = `
export * from './scripts/fixtures/a1b-1a/audio-browser-probe.js';
export * from './scripts/fixtures/a1b-2a/portable-browser-probe.js';
export * from './scripts/fixtures/a1b-2b/normal-browser-probe.js';
export * from './scripts/fixtures/a1b-g/hardening-browser-probe.js';
export * from './scripts/fixtures/book-qa/hf2-browser-probe.js';
import { createTextDataManagementPersistenceAdapter } from './src/services/persistence/textDataManagementPersistenceService.js';
import { createTextDataManagementSession } from './src/services/textDataManagementSession.js';
import { createBookQaConnection } from './src/services/bookQaSessionService.js';

const bookAdapter = dbName => createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable', permissions: ['catalog', 'content'], bookAuthoring: true });

const connect = async (dbName, execute = null) => {
  const adapter = createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable', permissions: ['catalog', 'content'] });
  const loaded = await adapter.loadState();
  const first = loaded.snapshot.documents.find(d => d.editorModel === 'structured-v1' && ['paragraph', 'conversation', 'mixed'].includes(d.documentType));
  const session = createTextDataManagementSession({ ...loaded, selection: first ? { workspaceId: first.id } : {}, boundary: 'disposable', permissions: ['catalog', 'content'], execute: execute || adapter.execute });
  return { adapter, session, loaded };
};
export const readLibrary = async dbName => {
  const adapter = createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable', permissions: ['catalog', 'content'] });
  const loaded = await adapter.loadState();
  const s = loaded.snapshot;
  return { schemaVersion: s.schemaVersion, counts: { collections: s.collections.length, documents: s.documents.length, blocks: s.blocks.length, contentUnits: (s.contentUnits || []).length, segments: s.segments.length, audioVariants: s.audioVariants.length }, documents: s.documents.map(d => ({ id: d.id, title: d.title, documentType: d.documentType })), segmentTexts: s.segments.map(segment => segment.text), collections: s.collections.map(c => c.title) };
};
export const readCompleteLibrary = dbName => createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable' }).loadState();
export const executeExternal = async (dbName, selection, command) => {
  const { session } = await connect(dbName);
  try { session.navigate(selection); return await session.dispatch(command); }
  finally { session.dispose(); }
};
export const executeBookTransaction = async (dbName, workspaceId, command) => {
  const adapter = bookAdapter(dbName);
  const loaded = await adapter.loadState();
  try {
    return await adapter.execute(command, { selection: { workspaceId }, expectedSnapshotFingerprint: loaded.snapshotFingerprint });
  } catch (error) {
    if (!error.code) throw error;
    return { ok: false, error: { code: error.code, message: error.message } };
  }
};
export const runBookTitleReceiptReview = async (dbName, workspaceId) => {
  const adapter = bookAdapter(dbName);
  const before = await adapter.loadState();
  const context = { selection: { workspaceId }, expectedSnapshotFingerprint: before.snapshotFingerprint };
  const titleUpdate = en => ({ type: 'document.update', payload: { id: workspaceId, mainTitle: { mode: 'custom', en } } });
  const winner = await adapter.execute(titleUpdate('T1 conflict winner'), context);
  let stale;
  try { await adapter.execute(titleUpdate('T1 stale writer'), context); }
  catch (error) { stale = error.code; }
  const winnerState = await adapter.loadState();
  let calls = 0;
  const distortedReceipt = async (command, scope) => {
    calls += 1;
    const receipt = await adapter.execute(command, scope);
    return { ...receipt, previousFingerprint: 'invalid-receipt' };
  };
  Object.defineProperty(distortedReceipt, 'authoritativeTransaction', { value: true });
  const connection = createBookQaConnection({ ...adapter, execute: distortedReceipt }, winnerState);
  try {
    connection.session.navigate({ workspaceId });
    const rejected = await connection.session.dispatch(titleUpdate('T1 committed without accepted receipt'));
    const fromSnapshot = snapshot => snapshot.documents.find(item => item.id === workspaceId).metadata.bookMainTitleV1;
    const beforeRefresh = fromSnapshot(connection.session.getSnapshot());
    const blocked = await connection.session.dispatch(titleUpdate('T1 must not replay'));
    await connection.refresh();
    const afterRefresh = fromSnapshot(connection.session.getSnapshot());
    const persisted = fromSnapshot((await adapter.loadState()).snapshot);
    return { calls, winner: winner.ok, stale, rejected: rejected.error, blocked: blocked.error, beforeRefresh, afterRefresh, persisted };
  } finally { connection.session.dispose(); }
};
const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export const setMetaValue = async (name, key, value) => {
  const db = await requestResult(indexedDB.open(name));
  try {
    const tx = db.transaction(['meta'], 'readwrite'), store = tx.objectStore('meta');
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    const row = await requestResult(store.get(key));
    store.put({ ...row, key, value });
    await done;
  } finally { db.close(); }
};
export const checkSentinels = async (names, seed) => {
  return Promise.all(names.map(async name => {
    const request = window.__bookQaNativeOpen(name);
    if (seed) request.onupgradeneeded = () => request.result.createObjectStore('sentinel').put({ key: name, content: 'keep this unchanged' }, 'seed');
    const db = await requestResult(request);
    try { return { name, version: db.version, rows: await requestResult(db.transaction(['sentinel']).objectStore('sentinel').getAll()) }; }
    finally { db.close(); }
  }));
};
export const runConflict = async dbName => {
  const left = await connect(dbName), right = await connect(dbName);
  left.session.navigate({}); right.session.navigate({});
  const first = await left.session.dispatch({ type: 'collection.create', payload: { title: 'A1a Conflict Winner' } });
  const stale = await right.session.dispatch({ type: 'collection.create', payload: { title: 'A1a Conflict Loser' } });
  const persisted = await readLibrary(dbName);
  left.session.dispose(); right.session.dispose();
  return { first: { ok: first.ok, error: first.error || null }, stale: { ok: stale.ok, error: stale.error || null }, persisted };
};
export const runCommittedStaleReceipt = async dbName => {
  const adapter = createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable', permissions: ['catalog', 'content'] });
  const loaded = await adapter.loadState();
  let notifyCommitted, releaseResult;
  const committed = new Promise(resolve => { notifyCommitted = resolve; });
  const gate = new Promise(resolve => { releaseResult = resolve; });
  const delayedExecute = async (command, context) => {
    const receipt = await adapter.execute(command, context);
    notifyCommitted(receipt);
    await gate;
    return receipt;
  };
  Object.defineProperty(delayedExecute, 'authoritativeTransaction', { value: true });
  const session = createTextDataManagementSession({ ...loaded, selection: {}, boundary: 'disposable', permissions: ['catalog', 'content'], execute: delayedExecute });
  const pending = session.dispatch({ type: 'collection.create', payload: { title: 'A1a Stale Receipt Commit' } });
  const receipt = await committed;
  session.dispose();
  releaseResult();
  const result = await pending;
  const persisted = await readLibrary(dbName);
  return { receipt: { ok: receipt.ok, authoritative: receipt.authoritative }, result: { ok: result.ok, error: result.error || null }, persisted };
};
export const runUnsupportedAudioCommand = async dbName => {
  const { session } = await connect(dbName);
  const before = session.getSnapshot().audioVariants.length;
  const result = await session.dispatch({ type: 'audioVariant.upsert', payload: {} });
  const after = session.getSnapshot().audioVariants.length;
  session.dispose();
  return { ok: result.ok, error: result.error || null, before, after };
};
`;
const probeBundle = (await build({
  absWorkingDir: root,
  stdin: { contents: probeSource, resolveDir: root, sourcefile: 'book-qa-a1a-probe.js', loader: 'js' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022'
})).outputFiles[0].text;

const mimeFor = file => ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
}[path.extname(file)] || 'application/octet-stream');
const servers = [];
const auditByOrigin = new Map();
const startServer = async (serveRoot, uatMode) => {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (uatMode && pathname === '/__a1a_probe.js') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(probeBundle);
        return;
      }
      if (uatMode && (audioAudit || bodyAudit || headingAudit || portableAudit || hardeningAudit) && ['/__book_audio_440.mp3', '/__book_audio_660.mp3'].includes(pathname)) {
        const frequency = pathname.includes('440') ? '440' : '660';
        response.setHeader('Content-Type', 'audio/mpeg');
        response.end(await fs.readFile(path.join(root, 'scripts/fixtures/a1b-1a', 'tone-' + frequency + '.mp3')));
        return;
      }
      if (uatMode && (bodyAudit || headingAudit || portableAudit || hardeningAudit || demoAudit || readerRefinement) && pathname === '/api/tts' && request.method === 'POST') {
        const buffers = [];
        for await (const chunk of request) buffers.push(chunk);
        const body = JSON.parse(Buffer.concat(buffers).toString());
        bodyRequests.push(body);
        if (body.rate === '+13%') {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ code: 'FIXTURE_RENDER_REJECTED', error: 'Fixture provider rejected the render' }));
          return;
        }
        if (readerRefinement && body.rate === '+16%') {
          response.writeHead(503, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ code: 'FIXTURE_PROVIDER_OFFLINE', error: 'Provider unreachable' }));
          return;
        }
        if (['+14%', '+15%'].includes(body.rate)) await new Promise(resolve => setTimeout(resolve, 900));
        const tone = await fs.readFile(path.join(root, 'scripts/fixtures/a1b-1a',
          (readerRefinement ? /Ryan/u : /Ryan|Libby/u).test(body.voice) ? 'tone-660.mp3' : 'tone-440.mp3'));
        response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        response.end(Buffer.concat(Array(18).fill(tone)));
        return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const target = path.resolve(serveRoot, relative);
      if (target !== serveRoot && !target.startsWith(serveRoot + path.sep)) throw new Error('Invalid static path');
      const bytes = await fs.readFile(target);
      response.setHeader('Content-Type', mimeFor(target));
      response.setHeader('Cache-Control', 'no-store');
      response.end(bytes);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(uatMode ? Number(process.env.BOOK_QA_AUDIT_PORT || 4173) : 0, '127.0.0.1', resolve);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
};

const uatOrigin = await startServer(uatRoot, true);
const productionOrigin = await startServer(productionRoot, false);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-a1a-bookqa-'));
const browserPath = process.env.P15_BROWSER_PATH || process.env.A1_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const launchBrowser = () => spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  ...(bodyAudit || headingAudit || portableAudit || demoAudit || readerRefinement ? ['--autoplay-policy=no-user-gesture-required'] : []),
  `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
const waitForBrowserExit = browser => new Promise(resolve => {
  if (browser.exitCode !== null || browser.signalCode !== null) resolve(true);
  else browser.once('exit', () => resolve(true));
});
let browser = launchBrowser();
let browserExit = waitForBrowserExit(browser);

let socket;
const runtimeErrors = [];
const qaApiRequests = [];
const instrumentation = `(() => {
  const key = '__prolingo_a1a_idb_audit_v1';
  let audit;
  try { audit = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { audit = {}; }
  audit.storage ||= []; audit.opens ||= []; audit.deletes ||= []; audit.writes ||= []; audit.upgrades ||= []; audit.violations ||= [];
  const qaMode = location.origin === ${JSON.stringify(uatOrigin)};
  const qaPrefix = ${JSON.stringify(qaPrefix)};
  const selected = new URLSearchParams(location.search).get('db');
  const companion = ${JSON.stringify(companionByLibrary)}[selected];
  const permitted = name => (name.startsWith(qaPrefix) && name === selected) || (companion && name === companion);
  const save = () => {
    window.__bookQaAudit = audit;
    try { window.__a1aIdbAudit(JSON.stringify({ origin: location.origin, audit })); } catch {}
    try { sessionStorage.setItem(key, JSON.stringify(audit)); } catch {}
  };
  window.__bookQaAudit = audit;
  const originalOpen = IDBFactory.prototype.open;
  window.__bookQaNativeOpen = name => originalOpen.call(indexedDB, name);
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
    const native = Storage.prototype[method];
    Storage.prototype[method] = function(...args) {
      if (qaMode && args[0] !== key && !window.__bookQaSentinelSetup) {
        audit.storage.push({ method, key: args[0], store: this === localStorage ? 'local' : 'session' });
        save();
      }
      return native.apply(this, args);
    };
  }
  window.__bookQaSpeech = [];
  if (${JSON.stringify(nativeSpeech)}) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      const voice = utterance.voice?.name;
      window.__bookQaSpeech.push(['speak', utterance.text, voice, performance.now()]);
      for (const event of ['start', 'end', 'error']) {
        utterance.addEventListener(event, details => window.__bookQaSpeech.push([event, utterance.text, voice, performance.now(), details.error]));
      }
      return speak(utterance);
    };
  } else {
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { value: {
    speaking: false, paused: false, pending: false,
    getVoices: () => [{ name: 'Fixture EN', lang: 'en-US', voiceURI: 'fixture-en', localService: true },
      { name: 'Fixture ID', lang: 'id-ID', voiceURI: 'fixture-id', localService: true },
      ...(${Boolean(readerRefinement)} ? [
        { name: 'Fixture Speaker EN', lang: 'en-GB', voiceURI: 'fixture-speaker-en', localService: true },
        { name: 'Fixture Speaker ID', lang: 'id-ID', voiceURI: 'fixture-speaker-id', localService: true }
      ] : [])],
    speak(utterance) { this.speaking = true; this.utterance = utterance; window.__bookQaSpeech.push(
      ${Boolean(readerRefinement)} ? ['speak', utterance.text, utterance.voice?.name, performance.now()] : ['speak', utterance.text, utterance.voice?.name]
    ); utterance.onstart?.(); },
    finish() { this.speaking = false; this.utterance?.onend?.(); },
    pause() { this.paused = true; window.__bookQaSpeech.push(['pause']); },
    resume() { this.paused = false; window.__bookQaSpeech.push(['resume']); },
    cancel() { this.speaking = false; this.paused = false; window.__bookQaSpeech.push(['cancel']); }
  } });
  }
  if (qaMode) {
    window.__bookQaProps = (selector, prop, currentOnly = false) => {
      const node = document.querySelector(selector);
      let fiber = node?.[Object.keys(node).find(name => name.startsWith('__reactFiber$'))];
      if (currentOnly && fiber?.alternate) {
        let root = fiber;
        while (root.return) root = root.return;
        if (root.stateNode?.current !== root) fiber = fiber.alternate;
      }
      while (fiber) {
        if (fiber.memoizedProps && Object.hasOwn(fiber.memoizedProps, prop)) return fiber.memoizedProps;
        fiber = fiber.return;
      }
      throw Error('Missing callback ' + prop + ' on ' + selector);
    };
  }
  IDBFactory.prototype.open = function(name, ...args) {
    const dbName = String(name);
    audit.opens.push({ name: dbName, requestedVersion: args[0] ?? null, selected, origin: location.origin }); save();
    if (qaMode && !permitted(dbName)) { audit.violations.push({ kind: 'open', name: dbName }); save(); throw Error('Book QA harness blocked non-QA database: ' + dbName); }
    const entry = audit.opens[audit.opens.length - 1];
    const request = originalOpen.call(this, name, ...args);
    request.addEventListener('upgradeneeded', event => { audit.upgrades.push({ name: dbName, oldVersion: event.oldVersion, newVersion: event.newVersion }); save(); }, { once: true });
    request.addEventListener('success', () => { entry.openedVersion = request.result.version; save(); }, { once: true });
    return request;
  };
  const originalDelete = IDBFactory.prototype.deleteDatabase;
  IDBFactory.prototype.deleteDatabase = function(name) {
    const dbName = String(name);
    audit.deletes.push({ name: dbName, origin: location.origin }); save();
    if (qaMode) { audit.violations.push({ kind: 'delete', name: dbName }); save(); throw Error('Delete is blocked by Book QA audit harness'); }
    return originalDelete.call(this, name);
  };
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(storeNames, mode = 'readonly', ...args) {
    if (mode === 'readwrite') {
      const names = Array.isArray(storeNames) ? [...storeNames] : [String(storeNames)];
      audit.writes.push({ name: this.name, stores: names, selected, origin: location.origin }); save();
      if (qaMode && !permitted(this.name)) { audit.violations.push({ kind: 'write', name: this.name, stores: names }); save(); throw Error('Book QA harness blocked non-QA write: ' + this.name); }
    }
    return originalTransaction.call(this, storeNames, mode, ...args);
  };
})();`;

const cleanup = async () => {
  try { await socket?.send?.(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {}
  try { socket?.close(); } catch {}
  let exited = browser.exitCode !== null || browser.signalCode !== null;
  if (!exited) {
    try { browser.kill(); } catch {}
    exited = await Promise.race([browserExit, new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
  }
  if (!exited) {
    try { browser.kill('SIGKILL'); } catch {}
    exited = await Promise.race([browserExit, new Promise(resolve => setTimeout(() => resolve(false), 2000))]);
  }
  for (const server of servers) {
    try { server.closeAllConnections(); server.close(); } catch {}
  }
  let profileRemoved = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
    try { await fs.access(profile); } catch { profileRemoved = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  if (!exited) throw new Error('Headless Edge did not exit after bounded close/kill retries.');
  if (!profileRemoved) throw new Error('Disposable Edge profile remained after four bounded cleanup attempts.');
};

const connectBrowserSocket = async () => {
  let debuggingPort = null;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      debuggingPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if ((await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).ok) break;
      debuggingPort = null;
    } catch { debuggingPort = null; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!debuggingPort) throw new Error('Edge did not start with a DevTools endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  const browserSocket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { browserSocket.onopen = resolve; browserSocket.onerror = reject; });
  return browserSocket;
};

try {
  let nextId = 0;
  const pending = new Map();
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const onMessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith(uatOrigin + '/api/')) qaApiRequests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.text || 'browser runtime exception');
    if (message.method === 'Runtime.bindingCalled' && message.params.name === '__a1aIdbAudit') {
      try {
        const payload = JSON.parse(message.params.payload);
        auditByOrigin.set(payload.origin, payload.audit);
      } catch {}
    }
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id); pending.delete(message.id);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    }
  };
  const evaluate = async (expression, sessionId) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true,
      ...(nativeSpeech ? { userGesture: true } : {}) }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const attachBrowser = async () => {
    socket = await connectBrowserSocket();
    socket.onmessage = onMessage;
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Runtime.addBinding', { name: '__a1aIdbAudit' });
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  };
  await attachBrowser();
  const restartBrowser = async () => {
    const previousPid = browser.pid;
    let timeout;
    try {
      const exited = await Promise.race([
        Promise.all([call('Browser.close'), browserExit]).then(() => true),
        new Promise(resolve => { timeout = setTimeout(() => resolve(false), 15000); })
      ]);
      assert(exited, 'Browser did not exit for A2 restart');
    } finally { clearTimeout(timeout); }
    await fs.rm(path.join(profile, 'DevToolsActivePort'), { force: true });
    browser = launchBrowser();
    browserExit = waitForBrowserExit(browser);
    await attachBrowser();
    assert.notEqual(browser.pid, previousPid);
  };

  const navigate = async (origin, route) => call('Page.navigate', { url: origin + route });
  const waitFor = async (expression, timeoutMs = 15000) => evaluate(`(async () => {
    const end = performance.now() + ${timeoutMs};
    while (performance.now() < end) { if (${expression}) return true; await new Promise(requestAnimationFrame); }
    throw Error('Browser wait timed out: ' + ${JSON.stringify(expression)});
  })()`);
  const clickButton = async textValue => evaluate(`(() => {
    const wanted = ${JSON.stringify(textValue.toLowerCase())};
    const button = [...document.querySelectorAll('button')].find(item => (item.innerText || item.textContent || '').trim().toLowerCase() === wanted);
    if (!button) throw Error('Button not found: ' + wanted);
    if (button.disabled) throw Error('Button is disabled: ' + wanted);
    button.click(); return true;
  })()`);
  const clickDemoButton = async textValue => evaluate(`(() => {
    const wanted = ${JSON.stringify(textValue.toLowerCase())};
    const button = [...document.querySelectorAll('[data-text-library-demos] button')].find(item => (item.innerText || '').trim().toLowerCase() === wanted);
    if (!button || button.disabled) throw Error('Sample button unavailable: ' + wanted);
    button.click(); return true;
  })()`);
  const chooseOptIn = () => evaluate(`(() => {
    const checkbox = document.querySelector('input[aria-label="Opt in to isolated Book QA storage"]');
    if (!checkbox) throw Error('Book QA opt-in checkbox missing');
    if (!checkbox.checked) checkbox.click();
    return checkbox.checked;
  })()`);
  const readAudit = async () => {
    const pageAudit = await evaluate(`({ origin: location.origin, audit: window.__bookQaAudit || JSON.parse(sessionStorage.getItem('__prolingo_a1a_idb_audit_v1') || '{}') })`);
    return auditByOrigin.get(pageAudit.origin) || pageAudit.audit || {};
  };
  const probe = async expression => evaluate(`(async () => { const module = window.__bookQaProbe || await import('/__a1a_probe.js'); window.__bookQaProbe = module; return ${expression}; })()`);
  if (readerRefinement) {
    const result = await checkBookQaReaderRefinement({
      mode: readerRefinement, evaluate, navigate, waitFor, chooseOptIn, clickButton, uatOrigin, call, bodyRequests, probe
    });
    const audit = await readAudit();
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.deletes, []);
    assert.deepEqual(runtimeErrors, []);
    assert(qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
    const evidence = { browser: await call('Browser.getVersion'), ...result, runtimeErrors, qaRequests: qaApiRequests.length };
    if (process.env.BOOK_QA_HF1_RESULT) await fs.writeFile(process.env.BOOK_QA_HF1_RESULT, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
  } else {
  const withPeerTab = async (url, run) => {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank', background: true });
    try {
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
      await call('Page.enable', {}, sessionId);
      await call('Runtime.enable', {}, sessionId);
      await call('Network.enable', {}, sessionId);
      await call('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation }, sessionId);
      await call('Page.navigate', { url }, sessionId);
      const evaluatePeer = expression => evaluate(expression, sessionId);
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if (await evaluatePeer(`Boolean(document.querySelector('[data-book-qa-host="disconnected"]'))`)) return await run(evaluatePeer);
        } catch (error) {
          if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Competing tab did not reach its isolated host');
    } finally { await call('Target.closeTarget', { targetId }); }
  };

  const report = { uatOrigin, database: qaDbName, host: {}, shell: {}, library: {}, isolation: {}, transactions: {} };
  await navigate(uatOrigin, `/?qa=book-qa&db=${qaDbName}`);
  await waitFor(`Boolean(document.querySelector('[data-book-qa-host="disconnected"]'))`);
  report.host.optInRequired = await evaluate(`!document.querySelector('input[aria-label="Opt in to isolated Book QA storage"]').checked`);
  report.host.zeroDatabaseOpensBeforeOptIn = (await readAudit()).opens?.length === 0;
  assert(report.host.optInRequired && report.host.zeroDatabaseOpensBeforeOptIn, 'Host must require opt-in before it opens IndexedDB');

  const sentinelNames = [canonicalName, 'prolingo_audio_staging_v1', 'prolingo_text_structured_audio_folder_v1', 'prolingo_audio_folder_handles_v1'];
  const sentinels = await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, true)`);
  const storageKeys = ['theme', 'gemini_api_key', 'prolingo_gemini_byok_key_v1', 'pronunciation_decks',
    'prolingo_text_identity_v1', 'prolingo_text_main_reader_v1', 'prolingo_text_structured_preferences_v1',
    'prolingo_text_structured_audio_generation_preferences_v1', 'prolingo_control_section_v5116',
    'prolingo_playback_sequence_v511', 'prolingo_playback_delays_v511', 'prolingo_vocabulary_play_order_v511',
    'prolingo_table_local_audio_playback_v1', 'prolingo_study_activity_v1', 'prolingo_mastery_state_v1', 'prolingo_audio_download_history_v1'];
  const storageState = seed => evaluate(`(() => {
    window.__bookQaSentinelSetup = true;
    try {
      const keys = ${JSON.stringify(storageKeys)};
      if (${seed}) {
        keys.forEach(key => localStorage.setItem(key, 'fixture:' + key));
        sessionStorage.setItem('prolingo:view:v1', 'fixture:app-view');
      }
      return [keys.map(key => localStorage.getItem(key)), sessionStorage.getItem('prolingo:view:v1')];
    } finally { window.__bookQaSentinelSetup = false; }
  })()`);
  const expectedStorage = await storageState(true);
  await chooseOptIn();
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Book QA database name"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(canonicalName)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await clickButton('Load / Connect existing v2 library');
  await waitFor(`Boolean(document.querySelector('[role="alert"][data-book-qa-error]'))`);
  report.host.rejectsCanonicalName = (await evaluate(`document.querySelector('[data-book-qa-error]')?.textContent || ''`)).includes('INVALID_DATABASE_NAME');
  report.host.zeroOpensAfterInvalidName = (await readAudit()).opens?.length === 0;
  assert(report.host.rejectsCanonicalName && report.host.zeroOpensAfterInvalidName, 'Invalid canonical name must be rejected before any IndexedDB open');

  await navigate(uatOrigin, `/?qa=book-qa&db=${qaDbName}`);
  await waitFor(`Boolean(document.querySelector('[data-book-qa-host="disconnected"]'))`);
  await chooseOptIn();
  await clickButton('Initialize clean demo library');
  await waitFor(`Boolean(document.querySelector('[data-app-header]'))`);
  await waitFor(`Boolean(document.querySelector('[data-text-structured-player]'))`);
  report.shell = await evaluate(`({
    header: Boolean(document.querySelector('[data-app-header]')),
    sidebar: Boolean(document.querySelector('.w-72')),
    reader: Boolean(document.querySelector('[data-text-structured-player]')),
    globalPlayer: Boolean(document.querySelector('[data-global-player]')),
    qaIndicator: Boolean(document.querySelector('[data-book-qa-indicator]')),
    tableSwitchDisabled: [...document.querySelectorAll('[data-mobile-mode-switch],button[title*="Table mode is unavailable"]')].every(button => button.disabled),
    audioAuthoringControlsAbsent: ![...document.querySelectorAll('button')].some(button => /generate|attach file|release staged/i.test(button.innerText || ''))
  })`);
  assert(report.shell.header && report.shell.sidebar && report.shell.reader && report.shell.globalPlayer && report.shell.qaIndicator, 'Book QA must mount the real AppBar, Sidebar, Reader, and Global Player');

  const initial = await probe(`module.readLibrary(${JSON.stringify(qaDbName)})`);
  report.library.initial = initial;
  assert(initial.schemaVersion === 2 && initial.counts.audioVariants === 0, 'Demo initialization must create v2 structured data without audio readiness');

  await fs.mkdir(evidenceDir, { recursive: true });
  const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(evidenceFile, Buffer.from(screenshot.data, 'base64'));
  report.shell.screenshot = path.relative(root, evidenceFile);

  await clickButton('OPEN DATA WORKSPACE');
  await waitFor(`Boolean(document.querySelector('[data-text-data-workspace]'))`);
  await clickButton('CREATE');
  await waitFor(`Boolean(document.querySelector('[data-text-library-demos]'))`);
  await clickDemoButton('Mixed');
  await waitFor(`document.body.innerText.includes('I practise English every day.')`, 30000);
  await waitFor(`[...document.querySelectorAll('[data-text-library-demos] button')].some(button => (button.innerText || '').trim() === 'Mixed' && !button.disabled)`, 30000);
  report.library.mixedWorkspaceProjected = await evaluate(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.trim() === 'Book QA · Mixed sample' && document.querySelector('[data-text-structured-player]')?.innerText.includes('I practise English every day.')`);
  assert(report.library.mixedWorkspaceProjected, 'Mixed sample must project through the Reader from the connected session');

  await clickDemoButton('Paragraph');
  await waitFor(`[...document.querySelectorAll('[data-text-library-demos] button')].some(button => (button.innerText || '').trim() === 'Paragraph' && !button.disabled)`, 30000);
  await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.trim() === 'Book QA · Paragraph sample'`);
  report.library.paragraphWorkspaceProjected = await evaluate(`document.querySelector('[data-text-structured-player]')?.innerText.includes('I practise English every day.')`);
  assert(report.library.paragraphWorkspaceProjected, 'Paragraph sample must project through the Reader from the connected session');

  await clickDemoButton('Conversation • 3');
  await waitFor(`[...document.querySelectorAll('[data-text-library-demos] button')].some(button => (button.innerText || '').trim() === 'Conversation • 3' && !button.disabled)`, 30000);
  await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.trim() === 'Book QA · Conversation sample'`);
  report.library.conversationWorkspaceProjected = await evaluate(`document.querySelector('[data-text-structured-player]')?.innerText.includes('Hi, shall we start our practice?')`);
  assert(report.library.conversationWorkspaceProjected, 'Conversation sample must project through the Reader from the connected session');

  const afterDemo = await probe(`module.readLibrary(${JSON.stringify(qaDbName)})`);
  report.library.afterNativeSamples = afterDemo;
  const completeBeforeRefusal = await probe(`module.readCompleteLibrary(${JSON.stringify(qaDbName)})`);
  assert(afterDemo.counts.documents > initial.counts.documents && afterDemo.counts.contentUnits > initial.counts.contentUnits && afterDemo.counts.segments > initial.counts.segments, 'UI sample creation must commit v2 Workspace/Card/Unit/Speaker/Segment records');
  assert(afterDemo.counts.audioVariants === 0, 'Clean demo and native content commands must not fabricate audio metadata');

  const opensBeforeReload = (await readAudit()).opens?.length || 0;
  await call('Page.reload');
  await waitFor(`Boolean(document.querySelector('[data-book-qa-host="disconnected"]'))`);
  const opensAfterReload = (await readAudit()).opens?.length || 0;
  report.host.reloadRequiresConnect = opensAfterReload === opensBeforeReload;
  await chooseOptIn();
  await clickButton('Initialize clean demo library');
  await waitFor(`Boolean(document.querySelector('[role="alert"][data-book-qa-error]'))`);
  report.host.existingDatabaseProtected = (await evaluate(`document.querySelector('[data-book-qa-error]')?.textContent || ''`)).includes('EXISTING_DB_PROTECTED');
  const afterBlockedInitialize = await probe(`module.readLibrary(${JSON.stringify(qaDbName)})`);
  report.host.existingDataUnchanged = JSON.stringify(afterBlockedInitialize.counts) === JSON.stringify(afterDemo.counts);
  assert(report.host.reloadRequiresConnect && report.host.existingDatabaseProtected && report.host.existingDataUnchanged, 'Reload must require reconnect; Initialize must refuse to overwrite an existing library');
  assert.deepEqual(await probe(`module.readCompleteLibrary(${JSON.stringify(qaDbName)})`), completeBeforeRefusal);
  await clickButton('Load / Connect existing v2 library');
  await waitFor(`Boolean(document.querySelector('[data-app-header]') && document.querySelector('[data-text-structured-player]'))`);
  report.host.reconnectRetainsMixedContent = (await probe(`module.readLibrary(${JSON.stringify(qaDbName)})`)).segmentTexts.includes('I practise English every day.');
  assert(report.host.reconnectRetainsMixedContent, 'Reconnect must retain the committed mixed Workspace content');

  report.transactions.conflictingSnapshots = await probe(`module.runConflict(${JSON.stringify(qaDbName)})`);
  assert(report.transactions.conflictingSnapshots.first.ok, 'First transaction against a snapshot should commit');
  assert(!report.transactions.conflictingSnapshots.stale.ok && report.transactions.conflictingSnapshots.stale.error?.reloadRequired, 'Stale concurrent transaction must reject and require reload');
  assert(report.transactions.conflictingSnapshots.persisted.collections.includes('A1a Conflict Winner') && !report.transactions.conflictingSnapshots.persisted.collections.includes('A1a Conflict Loser'), 'Conflicting transaction must not replay or persist the loser');

  report.transactions.staleCommittedReceipt = await probe(`module.runCommittedStaleReceipt(${JSON.stringify(qaDbName)})`);
  assert(report.transactions.staleCommittedReceipt.receipt.ok && report.transactions.staleCommittedReceipt.receipt.authoritative, 'Stale-receipt scenario must reach a committed authoritative transaction');
  assert(!report.transactions.staleCommittedReceipt.result.ok && report.transactions.staleCommittedReceipt.result.error?.committed && report.transactions.staleCommittedReceipt.result.error?.reloadRequired, 'Disposed session must reject the committed result and require explicit reconciliation');
  assert(report.transactions.staleCommittedReceipt.persisted.collections.filter(title => title === 'A1a Stale Receipt Commit').length === 1, 'Uncertain committed result must not be replayed');

  await evaluate(`document.querySelector('[aria-label="Refresh isolated Book QA library"]')?.click()`);
  await waitFor(`document.querySelector('[aria-label="Refresh isolated Book QA library"]')?.disabled === false`);
  await clickButton('OPEN DATA WORKSPACE');
  await waitFor(`Boolean(document.querySelector('[data-text-data-workspace]'))`);
  await clickButton('MANAGE');
  await waitFor(`document.body.innerText.includes('A1a Stale Receipt Commit')`);
  report.transactions.explicitRefreshReconciles = true;
  report.transactions.unsupportedAudioCommand = await probe(`module.runUnsupportedAudioCommand(${JSON.stringify(qaDbName)})`);
  assert(!report.transactions.unsupportedAudioCommand.ok && report.transactions.unsupportedAudioCommand.before === report.transactions.unsupportedAudioCommand.after, 'Unsupported audio metadata command must reject at the session permission boundary');

  report.hf1 = await checkBookQaHostBoundaries({ call, evaluate, waitFor, clickButton, navigate, chooseOptIn, readAudit, probe, qaDbName, uatOrigin });
  assert.deepEqual(await storageState(false), expectedStorage, 'Shared storage sentinels changed');
  assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
  assert.deepEqual(qaApiRequests, [], 'QA must not reach backend endpoints');
  report.isolation = await readAudit();
  assert.deepEqual(report.isolation.storage, [], 'QA must not even read shared browser storage');
  assert(report.isolation.opens.every(item => item.name === item.selected));
  assert(report.isolation.writes.every(item => item.name === item.selected));
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
  report.isolation.nonQaOpenCount = report.isolation.violations.filter(item => item.kind === 'open').length;
  report.isolation.nonQaWriteCount = report.isolation.violations.filter(item => item.kind === 'write').length;
  assert(report.isolation.deletes.length === 0, 'Book QA must not delete any IndexedDB database');
  assert(report.isolation.nonQaOpenCount === 0 && report.isolation.nonQaWriteCount === 0, 'Book QA must not open or write a non-QA IndexedDB database');
  assert(report.isolation.opens.every(item => item.name.startsWith(qaPrefix)), 'All IndexedDB opens in Book QA must target explicit QA names');
  assert(report.isolation.writes.every(item => item.name.startsWith(qaPrefix)), 'All IndexedDB writes in Book QA must target explicit QA names');
  assert(report.transactions.explicitRefreshReconciles, 'Refresh must reconcile the accepted committed receipt');

  if (audioAudit) {
    report.audio = await checkBookQaAudioStorage({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, readAudit, uatOrigin, withPeerTab });
    assert.deepEqual(await storageState(false), expectedStorage);
    assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
    assert.deepEqual(qaApiRequests, []);
    const audit = await readAudit();
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.deletes, []);
    assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
  }
  if (bodyAudit) {
    report.bodyAudio = await checkBookBodyAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, readAudit, uatOrigin, call, bodyRequests });
    assert.deepEqual(await storageState(false), expectedStorage);
    assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
    assert(qaApiRequests.length > 0 && qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
    const audit = await readAudit();
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.deletes, []);
    assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
  }
  if (headingAudit) {
    report.headingAudio = await checkBookHeadingAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, call, bodyRequests });
    const audit = await readAudit();
    assert.deepEqual(await storageState(false), expectedStorage);
    assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
    assert(qaApiRequests.length > 0 && qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.deletes, []);
    assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
  }
  if (portableAudit) {
    report.portableAudio = await checkBookPortableAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, call });
    report.normalAudio = await checkBookNormalAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin });
    if (hardeningAudit) {
      report.audioPlaybackHardening = await checkBookHardeningPlayback({ evaluate, waitFor, probe, call,
        workspaceId: report.normalAudio.workspaceId, bilingual: report.normalAudio.bilingual });
    }
    const audit = await readAudit();
    assert.deepEqual(await storageState(false), expectedStorage);
    assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
    assert(qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.deletes, []);
    assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
  }
  if (hardeningAudit) {
    report.audioHardening = await checkBookAudioHardening({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, bodyRequests });
    const audit = await readAudit();
    assert.deepEqual(await storageState(false), expectedStorage);
    assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
    assert(qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
    assert.deepEqual(audit.violations, []);
    assert.deepEqual(audit.storage, []);
    assert.deepEqual(audit.deletes, []);
    assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
  }

  if (demoAudit) {
    const verifyIsolation = async storage => {
      const audit = await readAudit();
      assert.deepEqual(await storageState(false), storage);
      assert.deepEqual(await probe(`module.checkSentinels(${JSON.stringify(sentinelNames)}, false)`), sentinels);
      assert.deepEqual(audit.violations, []);
      assert.deepEqual(audit.storage, []);
      assert.deepEqual(audit.deletes, []);
      assert([...audit.opens, ...audit.writes].every(row => row.name === row.selected || row.name === companionByLibrary[row.selected]));
    };
    report.persistentDemo = await checkPersistentBookQaDemo({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, bodyRequests,
      restartBrowser: async () => { await verifyIsolation(expectedStorage); await restartBrowser(); } });
    await verifyIsolation([expectedStorage[0], null]);
    assert(qaApiRequests.every(url => url === uatOrigin + '/api/tts'));
  }

  const productionScripts = (await fs.readdir(path.join(productionRoot, 'assets'))).filter(name => name.endsWith('.js'));
  const productionSources = await Promise.all(productionScripts.map(name => fs.readFile(path.join(productionRoot, 'assets', name), 'utf8')));
  report.production = {
    qaHostChunkAbsent: !productionScripts.some(name => name.includes('BookQaHost')),
    qaHostModuleAbsent: productionSources.every(source => !source.includes('data-book-qa-host="disconnected"'))
  };
  assert(report.production.qaHostChunkAbsent && report.production.qaHostModuleAbsent, 'Production output must exclude the Book QA host module');
  if (demoAudit) assert(productionSources.every(source => !source.includes('Initialize A2 demo library')), 'Production must exclude the A2 initializer');
  if (bodyAudit) {
    report.production.bookBodyAudioPanelAbsent = productionSources.every(source => !source.includes('data-book-body-audio-status'));
    assert(report.production.bookBodyAudioPanelAbsent, 'Production output must exclude the Book QA Body audio panel');
  }
  if (headingAudit) {
    report.production.bookHeadingPanelAbsent = productionSources.every(source => !source.includes('data-book-heading-status'));
    assert(report.production.bookHeadingPanelAbsent, 'Production output must exclude the Book QA Heading audio panel');
  }
  if (portableAudit) {
    report.production.bookPortablePanelAbsent = productionSources.every(source => !source.includes('data-book-portable-status'));
    assert(report.production.bookPortablePanelAbsent, 'Production output must exclude the Book QA Portable Audio panel');
  }
  if (hardeningAudit) {
    report.production.bookAudioExecutorAbsent = productionSources.every(source => !source.includes('NORMAL_AUDIO_LIMIT')
      && !source.includes('Damaged scoped audio has no confirmed uncommitted owner'));
    assert(report.production.bookAudioExecutorAbsent, 'Production output must exclude scoped Book QA export and recovery executors');
  }

  await navigate(productionOrigin, '/?qa=book-qa');
  await waitFor(`document.body.innerText.includes('Mulai Latihan')`);
  await evaluate(`localStorage.setItem('gemini_api_key', 'fixture:legacy'); localStorage.setItem('prolingo_gemini_byok_key_v1', 'fixture:legacy')`);
  report.production.qaRouteFallsBackToNormalApp = !(await evaluate(`Boolean(document.querySelector('[data-book-qa-host]'))`));
  await clickButton('Mulai Latihan');
  await waitFor(`Boolean(document.querySelector('[data-app-header]'))`);
  await waitFor(`(JSON.parse(sessionStorage.getItem('__prolingo_a1a_idb_audit_v1') || '{}').opens || []).some(item => item.name === ${JSON.stringify(canonicalName)} && item.openedVersion === 1)`, 15000);
  report.production.normalMainAppOpensCanonicalV1 = (await readAudit()).opens.some(item => item.name === canonicalName && item.openedVersion === 1);
  report.production.normalMainAppMounted = await evaluate(`Boolean(document.querySelector('[data-app-header]'))`);
  assert(report.production.qaRouteFallsBackToNormalApp && report.production.normalMainAppMounted && report.production.normalMainAppOpensCanonicalV1, 'Production ?qa=book-qa must preserve normal Main App behavior and canonical v1 schema');
  const play = '[data-global-player] button[aria-label="Start playback"]';
  const stop = '[data-global-player] button[aria-label="Stop playback"]';
  await evaluate(`document.querySelector(${JSON.stringify(play)}).click(); true`);
  await waitFor('window.__bookQaSpeech.some(([type, text]) => type === "speak" && text === "abandon")');
  await evaluate(`document.querySelector(${JSON.stringify(stop)}).click(); true`);
  await clickButton('Text');
  await clickButton('DATA');
  await clickButton('OPEN DATA WORKSPACE');
  await waitFor(`Boolean(document.querySelector('[data-text-library-content-editor="legacy"]'))`);
  await evaluate(`document.querySelector('[aria-label="Close Text Data workspace"]').click(); true`);
  await evaluate(`document.querySelector(${JSON.stringify(play)}).click(); true`);
  await waitFor('window.__bookQaSpeech.some(([type, text]) => type === "speak" && text === "Hello world.")');
  await evaluate(`document.querySelector(${JSON.stringify(stop)}).click(); true`);
  assert.equal(await evaluate(`['gemini_api_key', 'prolingo_gemini_byok_key_v1'].every(key => localStorage.getItem(key) === null)`), true);
  report.production.tableAndLegacyPlayback = true;
  report.production.normalCredentialCleanup = true;

  report.browserRuntimeErrors = runtimeErrors;
  assert(runtimeErrors.length === 0, 'Browser emitted runtime exceptions');
  console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error('Book QA audit failed:', error.message);
  throw error;
} finally {
  await cleanup();
}
