import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.A6_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-a6-evidence-'));
await fs.mkdir(evidence, { recursive: true });
const compiled = (await build({
  absWorkingDir: root, entryPoints: ['scripts/fixtures/main-reader-a6/browser-app.jsx'],
  bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.css': 'empty', '.svg': 'dataurl' },
  define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"development"' }
})).outputFiles[0].text;
const assets = await fs.readdir(path.join(root, 'dist/assets'));
const css = await fs.readFile(path.join(root, 'dist/assets', assets.find(n => /^index-.*\.css$/.test(n))));
const bootstrap = `
window.a6Writes = []; window.a6Opens = []; window.a6Errors = []; window.a6Speech = [];
window.addEventListener('error', e => window.a6Errors.push(e.message));
const nativeIDB = window.indexedDB;
Object.defineProperty(window, 'indexedDB', { value: {
  open(name, version) {
    if (version !== 1) throw Error('A6 forbids non-v1 database opens');
    const isolated = 'prolingo_text_library_d3b_qa_a6_' + (location.pathname === '/corrupt' ? 'corrupt_' : '') + name;
    window.a6Opens.push({ requested: name, actual: isolated, version });
    return nativeIDB.open(isolated, version);
  },
  deleteDatabase() { throw Error('A6 forbids database deletion'); }
}});
for (const method of ['put', 'add', 'delete', 'clear']) {
  const original = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function(...args) {
    window.a6Writes.push({ db: this.transaction.db.name, store: this.name, method });
    return original.apply(this, args);
  };
}
class Utterance { constructor(text) { this.text = text; } }
window.SpeechSynthesisUtterance = Utterance;
const voices = [{ name: 'A6 English', lang: 'en-US', voiceURI: 'a6-en', localService: true }, { name: 'A6 Indonesian', lang: 'id-ID', voiceURI: 'a6-id', localService: true }];
window.a6Synth = {
  speaking: false, paused: false, pending: false, getVoices: () => voices,
  addEventListener() {}, removeEventListener() {},
  speak(utterance) { this.speaking = true; this.current = utterance; window.a6Speech.push({ type: 'speak', text: utterance.text, voice: utterance.voice?.name, rate: utterance.rate }); utterance.onstart?.(); },
  cancel() { window.a6Speech.push({ type: 'cancel' }); this.speaking = false; this.current = null; },
  pause() { this.paused = true; window.a6Speech.push({ type: 'pause' }); },
  resume() { this.paused = false; window.a6Speech.push({ type: 'resume' }); }
};
Object.defineProperty(window, 'speechSynthesis', { value: window.a6Synth });
window.a6Media = [];
window.a6ContentAudio = null;
class ControlledAudio extends EventTarget {
  constructor(url) { super(); this.src = url || ''; this.currentTime = 0; this.duration = 60; this.paused = true; this.readyState = 4; this.playbackRate = 1; }
  play() { this.paused = false; if (!this.loop) window.a6ContentAudio = this; window.a6Media.push({ type: 'play', src: this.src, rate: this.playbackRate, loop: Boolean(this.loop) }); this.onplay?.(); this.onplaying?.(); return Promise.resolve(); }
  pause() { this.paused = true; window.a6Media.push({ type: 'pause', src: this.src, time: this.currentTime }); this.onpause?.(); }
  load() {}
  removeAttribute() {}
}
window.Audio = ControlledAudio;
`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(compiled); }
  if (pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
  if (pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); return res.end('{}'); }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>${bootstrap}</script><script type="module" src="/app.js"></script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-a6-profile-'));
const browser = spawn(process.env.A6_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let socket;
let diagnose;
const results = [];
try {
  let port;
  for (let i = 0; i < 200; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await new Promise(r => setTimeout(r, 100)); }
  }
  if (!port) throw Error('Edge did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(); let nextId = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data); const target = pending.get(message.id);
    if (target) { pending.delete(message.id); if (message.error) target.reject(Error(JSON.stringify(message.error))); else target.resolve(message.result); }
  };
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  diagnose = async error => {
    await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({
      error: String(error), text: await evaluate('document.body.innerText'), errors: await evaluate('window.a6Errors'),
      activeElement: await evaluate('document.activeElement?.outerHTML.slice(0, 400)'),
      ancestors: await evaluate(`(() => { const list=[]; let el=document.querySelector('[data-shared-card-level-option]'); while(el) { const s=getComputedStyle(el); const r=el.getBoundingClientRect(); list.push({tag:el.tagName,classes:el.className,width:r.width,left:r.left,minWidth:s.minWidth,display:s.display,overflow:s.overflow}); el=el.parentElement; } return list; })()`)
    }, null, 2));
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(evidence, 'failure.png'), Buffer.from(shot.data, 'base64'));
  };
  const until = async (expression, label = expression) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(r => setTimeout(r, 40)); }
    throw Error('Timeout: ' + label);
  };
  const check = (value, message) => { if (!value) throw Error(message); };
  const run = async (name, fn) => { await fn(); results.push({ name, ok: true }); console.log('PASS', name); };
  const click = selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) throw Error('Missing/disabled: ' + ${JSON.stringify(selector)}); el.click(); })()`);
  const textButton = (label, exact = true) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => ${exact ? 'b.textContent.trim() ===' : 'b.textContent.includes'}(${JSON.stringify(label)}) && !b.disabled); if (!b) throw Error('Missing button '+${JSON.stringify(label)}); b.click(); })()`);
  const mode = value => click(`[data-text-main-reader-option="${value}"]`);
  const readerMode = value => click(`[data-shared-reader-mode-option="${value === 'part' ? 'focus' : value}"]`);
  const openDesktopReading = async () => {
    const toggle = '[data-shared-reading-settings-toggle]';
    if (!await evaluate(`document.querySelector(${JSON.stringify(toggle)})?.getAttribute('aria-expanded') === 'true'`)) await click(toggle);
  };
  const playerDetails = '[data-global-player] button[aria-controls][aria-expanded]';
  const playbackSettings = '[data-player-open-text-settings]';
  const expandPlayer = async () => {
    await until(`document.querySelector(${JSON.stringify(playerDetails)})`);
    if (await evaluate(`document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'false'`)) await click(playerDetails);
    await until(`document.querySelector(${JSON.stringify(playbackSettings)})?.getClientRects().length`);
  };
  const selectWorkspace = async key => {
    await evaluate(`(() => {
      const id = window.a6.ids[${JSON.stringify(key)}];
      const select = [...document.querySelectorAll('header select, select')].find(s=>[...s.options].some(o=>o.value === id));
      if (!select) throw Error('Missing real Workspace selector');
      select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await until(`document.querySelector('select option[value="' + window.a6.ids[${JSON.stringify(key)}] + '"]:checked')`);
  };
  const screenshot = async name => {
    const data = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(evidence, name + '.png'), Buffer.from(data.data, 'base64'));
  };
  const readingToggle = '[data-mobile-workspace-toolbar] [data-shared-reading-settings-toggle]';
  const readingOverlay = '[data-shared-reading-settings-mobile-overlay]';
  const statusBadge = '[data-mobile-workspace-playback-status]';
  const visible = selector => `document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`;
  const key = async (name, windowsVirtualKeyCode, modifiers = 0) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode, modifiers });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode, modifiers });
  };
  const pointerClick = async selector => {
    await until(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })()`, `Pointer ready: ${selector}`);
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const r = element.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      if (!element.contains(document.elementFromPoint(x, y))) throw Error('Pointer obstructed: ' + ${JSON.stringify(selector)});
      return {x, y};
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { ...point, type, button: 'left', clickCount: 1 });
  };
  const resize = async (mobile, width = mobile ? 390 : 1440) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 1000, deviceScaleFactor: 1, mobile });
    await until(`innerWidth === ${width}`);
  };

  const checkMobileHistory = async () => {
    await resize(true);
    await until(visible(readingToggle));
    const navigateHistory = async delta => {
      const { entries, currentIndex } = await call('Page.getNavigationHistory');
      await call('Page.navigateToHistoryEntry', { entryId: entries[currentIndex + delta].id });
    };
    const settled = '!history.state?.prolingoOverlay';
    const closed = `!(${visible(readingOverlay)}) && ${settled}`;
    const assertAtBase = async baseIndex => {
      await until(closed);
      let current = await call('Page.getNavigationHistory');
      for (let attempt = 0; current.currentIndex !== baseIndex && attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
        current = await call('Page.getNavigationHistory');
      }
      check(current.currentIndex === baseIndex && new URL(current.entries[baseIndex].url).search === '?a6=base', 'Overlay dismissal changed browser position');
    };
    await evaluate('history.replaceState({ route: "before" }, "", "?a6=before"); history.pushState({ route: "base" }, "", "?a6=base")');
    const baseIndex = (await call('Page.getNavigationHistory')).currentIndex;
    const open = async () => {
      await pointerClick(readingToggle);
      await until(`${visible(readingOverlay)} && history.state?.prolingoOverlay`);
    };
    await open();
    await navigateHistory(-1);
    await assertAtBase(baseIndex);
    await navigateHistory(1);
    await until(closed);
    check(await evaluate('history.state?.route === "base" && location.search === "?a6=base"'), 'Forward restored an active overlay marker or lost route state');
    await navigateHistory(-1);
    await assertAtBase(baseIndex);

    await open();
    await key('Tab', 9, 8);
    await until('document.activeElement.closest("[data-shared-reading-overlay-anchored]")');
    await key('Tab', 9);
    check(await evaluate('Boolean(document.activeElement.closest("[data-shared-reading-overlay-anchored]"))'), 'Tab escaped Reading View');
    const beforeScroll = await evaluate('scrollY');
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 1, y: 300, deltaX: 0, deltaY: 480 });
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    check(await evaluate(`scrollY === ${beforeScroll}`), 'Backdrop scroll moved the Reader');
    await screenshot('4h1-reading-view-focused');
    await pointerClick(`${readingOverlay} [data-shared-reading-settings-close]`);
    await assertAtBase(baseIndex);
    await until(`document.activeElement.matches(${JSON.stringify(readingToggle)})`);

    await open(); await key('Escape', 27); await assertAtBase(baseIndex);
    await open();
    for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { x: 1, y: 300, type, button: 'left', clickCount: 1 });
    await assertAtBase(baseIndex);

    await open();
    // Two committed inputs enqueued in the same task before History's async traversal settles.
    await evaluate(`(() => {
      const close = document.querySelector('[data-shared-reading-settings-close]');
      close.click();
      queueMicrotask(() => document.querySelector(${JSON.stringify(readingToggle)}).click());
    })()`);
    await until(`${visible(readingOverlay)} && history.state?.prolingoOverlay`);
    await key('Escape', 27); await assertAtBase(baseIndex);

    await open(); await resize(false); await assertAtBase(baseIndex);
    await resize(true); await open();
    await click('[data-text-main-reader-option="legacy"]');
    await until('document.querySelector("[data-text-main-reader=legacy]")');
    await assertAtBase(baseIndex);
    await mode('shared');
    await open();
    await click('[data-mobile-mode-switch]');
    await until('document.querySelector("[data-mobile-mode-switch]")?.textContent.trim() === "Text"');
    await assertAtBase(baseIndex);
    await click('[data-mobile-mode-switch]');
    await until(visible(readingToggle));
    await open();
    await evaluate(`([...document.querySelectorAll('[data-mobile-overlay-workspace-switcher] button')].find(button => button.textContent.includes('Other Paragraph'))).click()`);
    await until('document.querySelector("[data-mobile-workspace-title]")?.textContent.includes("Other Paragraph")');
    await assertAtBase(baseIndex);
    await open();
    await evaluate(`([...document.querySelectorAll('[data-mobile-overlay-workspace-switcher] button')].find(button => !button.disabled && button.getAttribute('aria-pressed') === 'false' && !button.textContent.includes('unavailable'))).click()`);
    await until('!document.querySelector("[data-mobile-workspace-title]")?.textContent.includes("Other Paragraph")');
    await assertAtBase(baseIndex);
    await navigateHistory(-1);
    await until('location.search === "?a6=before" && history.state?.route === "before"');
    await navigateHistory(1);
    await assertAtBase(baseIndex);
    await resize(true, 360);
    await pointerClick('[data-mobile-appbar-overflow]');
    await pointerClick('[data-mobile-appbar-overflow-menu] [role="menuitemradio"][aria-checked="false"]:last-child');
    await key('Escape', 27);
    await open();
    check(await evaluate(`(() => {
      const panel = document.querySelector('[data-shared-reading-overlay-anchored]');
      const rect = panel.getBoundingClientRect();
      return document.documentElement.classList.contains('dark') && rect.left >= 0 && rect.right <= 360 && panel.scrollWidth <= panel.clientWidth;
    })()`), '360px Dark Reading View overflowed');
    await screenshot('4h1-reading-view-dark-360');
    await key('Escape', 27);
    await assertAtBase(baseIndex);
    await open();
    const previousDocument = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: `${origin}/?a6=second-page` });
    await until(`performance.timeOrigin !== ${previousDocument} && location.search === '?a6=second-page' && window.a6`);
    await navigateHistory(-1);
    await until(`location.search === '?a6=base' && window.a6 && (${closed})`);
    await navigateHistory(-1);
    await assertAtBase(baseIndex);
    if (await evaluate('document.querySelector("[data-mobile-mode-switch]")?.textContent.trim() === "Text"')) await click('[data-mobile-mode-switch]');
    await until(visible(readingToggle));
    await resize(false);
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin });
  await until('window.a6 && document.querySelector("button")', 'real App mounted');
  await textButton('Mulai Latihan');
  await until('[...document.querySelectorAll("button")].some(b=>/text/i.test(b.textContent))');
  await textButton('Text');
  await until('document.querySelector("[data-text-structured-player]") && !document.querySelector("[data-text-main-reader-option=shared]").disabled', 'Paragraph hydrated');
  await run('Real App Text defaults to Tampilan Lama with original Paragraph content', async () => {
    check(await evaluate('document.querySelector("[data-text-main-reader=legacy]") && !document.querySelector("[data-shared-card-embedded]")'), 'Old reader not default');
    await click('[data-text-card-expansion-mode="all"]');
    await until('document.querySelector("[data-text-paragraph-unified]")', 'old Paragraph');
    await evaluate('(async () => { window.a6Baseline = JSON.stringify(await window.a6.readSnapshot()); window.a6WriteBaseline = window.a6Writes.length; })()');
    await screenshot('a6-main-text-old-desktop');
  });
  await run('Opt-in uses the same Card and Segment identities; original audio/download controls stay mounted', async () => {
    await evaluate('window.a6PlayerNode = document.querySelector("[data-text-structured-player]"); window.a6OldCards = [...document.querySelectorAll("[data-text-player-card]")].map(e=>e.dataset.textPlayerCard); window.a6OldSegments = [...new Set([...document.querySelectorAll("[data-text-paragraph-sentence]")].map(e=>e.dataset.textParagraphSentence))].sort()');
    await mode('shared'); await until('document.querySelector("[data-shared-card-embedded]")');
    check(await evaluate('window.a6PlayerNode === document.querySelector("[data-text-structured-player]") && JSON.stringify(window.a6OldCards) === JSON.stringify([...document.querySelectorAll("[data-text-player-card]")].map(e=>e.dataset.textPlayerCard))'), 'Host or identity changed');
    check(await evaluate('[...document.querySelectorAll("[data-shared-card-segment]")].some(e => e.dataset.sharedCardSegment === window.a6.ids.seg1Id)'), 'Shared Segment mismatch');
    check(await evaluate('JSON.stringify(window.a6OldSegments) === JSON.stringify([...new Set([...document.querySelectorAll("[data-shared-card-segment]")].map(e=>e.dataset.sharedCardSegment))].sort())'), 'Sentence identities differ between readers');
    check(await evaluate(`!!document.querySelector('[aria-label="Open card audio controls"]') && !!document.querySelector(${JSON.stringify(playerDetails)})`), 'Card Audio and Global Player Details must be available');
    await screenshot('a6-main-text-shared-desktop');
  });
  await run('Existing Player settings and Card download surfaces still open without content/audio writes', async () => {
    const before = await evaluate('window.a6Writes.length');
    await expandPlayer();
    await click(playbackSettings);
    await until('document.querySelector("[data-text-player-workspace]")');
    check(await evaluate(`document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'false'`), 'Playback Settings did not close Global Player Details');
    await evaluate(`[...document.querySelectorAll('[data-text-player-workspace] button')].find(b=>b.textContent.trim()==='Close').click()`);
    await click('[aria-label="Open card audio controls"]');
    await until('document.querySelector("[data-text-card-audio-panel]")');
    await click('[data-text-card-audio-tab="download"]');
    await until('document.querySelector("[data-text-card-audio-tab=download]").getAttribute("aria-selected")==="true"');
    check(await evaluate(`[...document.querySelectorAll('[data-text-card-audio-panel] button')].some(b=>b.textContent.includes('EN Full MP3')) && document.querySelector('[data-text-card-audio-panel]').textContent.includes('MP3 export')`), 'Download/export actions missing');
    await click('[aria-label="Close audio settings"]');
    check(before === await evaluate('window.a6Writes.length'), 'Opening controls wrote content or audio');
  });
  await run('4H1 native Chromium history, modal focus/scroll, and Reader, Workspace, mode and resize transitions', checkMobileHistory);
  await run('4H1 production Paragraph owned status and presentation handoffs preserve active playback', async () => {
    await resize(true);
    const cardAudio = '[aria-label="Open card audio controls"]';
    const cardAudioPanel = '[data-text-card-audio-panel] [role="dialog"]';
    const playbackPanel = '[data-text-player-workspace] [role="dialog"]';
    const appbarMenu = '[data-mobile-appbar-overflow-menu]';
    const tools = '[data-mobile-tools-surface]';
    const exactStatus = value => `document.querySelector(${JSON.stringify(statusBadge)})?.textContent === ${JSON.stringify(value)}`;

    await click('[data-mobile-workspace-play]');
    await until(exactStatus('Starting playback…'));
    await until(exactStatus('P1 · EN'));
    const playing = await evaluate('JSON.stringify({ speech: window.a6Speech, media: window.a6Media })');
    // Owned playback auto-follow hides the fixed bar. Let that state settle,
    // then reveal it with the same scroll-to-top affordance used by the App.
    const revealAppBar = async () => {
      await evaluate('window.scrollTo(0, 100); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await evaluate('window.scrollTo(0, 0)');
    };
    await until('document.querySelector("[data-app-header]")?.classList.contains("-translate-y-full")');
    await revealAppBar();
    await pointerClick(playerDetails);
    await pointerClick('[data-mobile-appbar-overflow]');
    await until(`${visible(appbarMenu)} && document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'false'`);
    check(await evaluate('document.elementFromPoint(5, 300)?.getAttribute("aria-label") === "Close app menu"'), 'AppBar backdrop does not shield Reader content');
    await key('Tab', 9);
    await until('document.activeElement.closest("[data-mobile-appbar-overflow-menu]")');
    await key('Escape', 27);
    await until(`!(${visible(appbarMenu)}) && document.activeElement.matches('[data-mobile-appbar-overflow]')`);
    await pointerClick(playerDetails);
    await revealAppBar();
    await pointerClick('[data-mobile-controls-toggle]');
    await until(`${visible(tools)} && document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'false'`);
    await pointerClick(playerDetails);
    await until(`!(${visible(tools)}) && document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'true'`);
    await expandPlayer();
    await click(playbackSettings);
    await until(`${visible(playbackPanel)} && document.activeElement.matches(${JSON.stringify(playbackPanel)})`);
    await key('Tab', 9, 8);
    await until('document.activeElement.closest("[data-text-player-workspace]")');
    await key('Escape', 27);
    await until(`!(${visible(playbackPanel)}) && document.activeElement.matches(${JSON.stringify(playerDetails)})`);
    await pointerClick(readingToggle);
    await until(visible(readingOverlay));
    await evaluate(`([...document.querySelectorAll('[data-mobile-overlay-workspace-switcher] button')].find(button => button.textContent.includes('Other Paragraph'))).click()`);
    await until(`document.querySelector('[data-mobile-workspace-title]')?.textContent.includes('Other Paragraph') && !document.querySelector(${JSON.stringify(statusBadge)})`);
    check(await evaluate(`JSON.stringify({ speech: window.a6Speech, media: window.a6Media }) === ${JSON.stringify(playing)}`), 'Overlay or Workspace browsing interrupted owned audio');
    check(await evaluate('document.querySelector("[data-global-player]").dataset.playerPhase === "playing"'), 'Workspace switch changed transport');
    await click('[aria-label="Stop playback"]');
    await resize(false);
    await selectWorkspace('documentId');
    await until('document.querySelector(\'[data-shared-card-id="\' + window.a6.ids.cardId + \'"]\')');
    await click('[data-shared-reader-mode-option="card"]');
    await expandPlayer();
    await click(cardAudio);
    await until(`${visible(cardAudioPanel)} && document.activeElement.matches(${JSON.stringify(cardAudioPanel)})`);
    check(await evaluate(`document.querySelector(${JSON.stringify(playerDetails)}).getAttribute('aria-expanded') === 'false'`), 'Embedded Card Audio left Player Details open');
    await key('Tab', 9, 8);
    await until('document.activeElement.closest("[data-text-card-audio-panel]")');
    await key('Escape', 27);
    await until(`!(${visible(cardAudioPanel)})`);
    await click('[data-shared-reader-mode-option="full"]');
  });
  await run('Full Book Page, Card Mode, Part/Segment, bilingual layouts and Workspace Style remain view-only', async () => {
    const before = await evaluate('JSON.stringify({ writes: window.a6Writes.length, speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1") })');
    check(await evaluate('Boolean(document.querySelector("[data-shared-book-page=true]"))'), 'Default Shared view is not continuous Book Page');
    await click('[data-shared-reader-mode-option="card"]');
    await until('!document.querySelector("[data-shared-book-page=true]") && Boolean(document.querySelector("[data-text-card-expansion-toolbar=true]"))');
    await openDesktopReading();
    await click('[data-shared-reading-settings-tab="workspace"]');
    await click('[data-shared-workspace-align-option="left"]');
    await click('[data-shared-workspace-indent-toggle="true"]');
    await click('[data-shared-workspace-accents-toggle="true"]');
    check(await evaluate('document.querySelector("[data-shared-workspace-style-reset]").disabled === false'), 'Reset Style did not enable when dirty');
    await click('[data-shared-workspace-style-reset="true"]');
    check(await evaluate('document.querySelector("[data-shared-workspace-style-reset]").disabled === true'), 'Reset Style did not disable after reset');
    await click('[data-shared-reading-settings-tab="reading"]');
    for (const level of ['full', 'part', 'segment']) {
      await readerMode(level);
      if (level === 'full') {
        await until('Boolean(document.querySelector("[data-shared-book-page=true]"))');
      } else {
        await until(`document.querySelector('[data-shared-card-embedded][data-shared-card-level="${level}"]')`);
      }
      for (const layout of ['interlinear', 'separated', 'text-only', 'meaning-only']) {
        if (level === 'segment' && layout === 'separated') {
          check(await evaluate('document.querySelector("[data-shared-bilingual-style-option=separated]").disabled'), 'Segment context allows Separated');
          continue;
        }
        await click(`[data-shared-card-layout-option="${layout}"]`);
        await until(`document.querySelector('[data-shared-card-embedded][data-shared-card-layout="${layout}"]')`);
      }
      if (level === 'part') for (const layout of ['vertical-focus', 'horizontal-focus']) {
        await click(`[data-shared-card-part-layout-option="${layout}"]`);
        await until(`document.querySelector('[data-shared-card-embedded][data-shared-card-part-layout="${layout}"]')`);
      }
    }
    await evaluate(`[...document.querySelectorAll('[data-study-box-local-segment]')].find(button => button.textContent.trim() === '2' && !button.disabled).click()`);
    check(before === await evaluate('JSON.stringify({ writes: window.a6Writes.length, speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1") })'), 'View change wrote audio/content or invoked playback');
    await readerMode('full'); await click('[data-shared-card-layout-option="interlinear"]');
    await key('Escape', 27);
  });
  // Additional scenarios below use the actual existing toolbar and sidebar actions.
  await run('Split playback survives old/shared and layout changes, pause, resume and stop', async () => {
    await click('[title="Play Workspace from start"]');
    await until('window.a6Synth.speaking && document.querySelector("[data-shared-card-precision=segment]")', 'actual Split audio');
    await evaluate('window.a6PlayingUtterance = window.a6Synth.current');
    const before = await evaluate('JSON.stringify({ speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1"), writes: window.a6Writes.length })');
    await mode('legacy'); await until('document.querySelector("[data-text-paragraph-unified]") && !document.querySelector("[data-shared-card-embedded]")');
    await mode('shared'); await openDesktopReading(); await click('[data-shared-card-layout-option="separated"]');
    await key('Escape', 27);
    check(before === await evaluate('JSON.stringify({ speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1"), writes: window.a6Writes.length })'), 'Mode change interrupted Split');
    check(await evaluate('window.a6PlayingUtterance === window.a6Synth.current'), 'Mode switch replaced the active utterance');
    await click('[aria-label="Pause playback"]'); await until('window.a6Synth.paused');
    const paused = await evaluate('JSON.stringify(window.a6Speech)');
    await mode('legacy'); await mode('shared');
    check(paused === await evaluate('JSON.stringify(window.a6Speech)'), 'Mode change resumed/cancelled pause');
    await click('[aria-label="Resume playback"]'); await until('!window.a6Synth.paused');
    await click('[aria-label="Stop playback"]');
    await until('![...document.querySelectorAll("[data-shared-card-precision]")].some(e=>e.dataset.sharedCardPrecision !== "none")');
  });
  await run('Explicit Sentence and one-shot ID Card actions retain existing host signatures and channel semantics', async () => {
    await evaluate(`document.querySelector('[data-shared-card-segment="' + window.a6.ids.seg3Id + '"][data-shared-card-channel="text"]').click()`);
    await until('window.a6Synth.current?.text.includes("The third sentence") && document.querySelector("[data-shared-card-precision=segment]")');
    await click('[aria-label="Stop playback"]');
    await evaluate(`document.querySelector('[data-shared-card-id="' + window.a6.ids.cardId + '"] [data-shared-card-play-channel="meaning"]').click()`);
    await until('window.a6Synth.current?.voice?.name === "A6 Indonesian" && document.querySelector("[data-shared-card-precision=segment]")');
    await click('[aria-label="Stop playback"]');
  });
  await run('Real Cached Full binding keeps Card precision and continuous media across mode switches', async () => {
    await expandPlayer();
    await click('[data-text-global-player-controls] button');
    await until(`document.querySelector('[data-text-global-player-controls] button').textContent === 'Saved Full'`);
    await click(playerDetails);
    await evaluate('document.querySelector(\'[data-text-player-card="\' + window.a6.ids.cardId + \'"] [data-text-card-play-compact]\').click()');
    await until('window.a6Media.some(m=>m.type==="play" && !m.loop && m.src.startsWith("blob:")) && document.querySelector("[data-shared-card-precision=card]")', 'Cached Full actual artifact');
    await evaluate('window.a6PlayingFull = window.a6ContentAudio; window.a6PlayingFull.currentTime = 12.5');
    const before = await evaluate('JSON.stringify({ speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1"), writes: window.a6Writes.length })');
    await mode('legacy'); await mode('shared'); await readerMode('part');
    await until('document.querySelector("[data-shared-card-precision=card]")');
    check(before === await evaluate('JSON.stringify({ speech: window.a6Speech, media: window.a6Media, audio: localStorage.getItem("prolingo_text_structured_preferences_v1"), writes: window.a6Writes.length })'), 'Cached Full restarted or reconfigured');
    check(await evaluate('!document.querySelector("[data-shared-card-precision=segment]")'), 'Cached Full fabricated Sentence timing');
    check(await evaluate('window.a6PlayingFull === window.a6ContentAudio && window.a6ContentAudio.currentTime === 12.5 && !window.a6ContentAudio.paused'), 'Mode/layout switch replaced or reset active media position');
    await click('[aria-label="Pause playback"]');
    const paused = await evaluate('JSON.stringify(window.a6Media)');
    await mode('legacy'); await mode('shared');
    check(paused === await evaluate('JSON.stringify(window.a6Media)'), 'Paused Full changed media');
    await click('[aria-label="Resume playback"]'); await click('[aria-label="Stop playback"]');
  });
  await run('Search in actual DATA Workspace reveals matching Sentence in Full, Part and Segment', async () => {
    await textButton('DATA');
    const geometries = [];
    for (const level of ['full', 'part', 'segment']) {
      await readerMode(level);
      await openDesktopReading();
      await click('[data-shared-card-layout-option="interlinear"]');
      await key('Escape', 27);
      await evaluate('window.a6.stableLayout()');
      await textButton('OPEN DATA WORKSPACE');
      await until('document.querySelector("[data-text-library-search-input]")');
      await evaluate(`(() => { const input = document.querySelector('[data-text-library-search-input]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'A6 unique search destination'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await until('document.querySelector("[data-text-library-search-result]")');
      await click('[data-text-library-search-result] button');
      await click('[aria-label="Close Text Data workspace"]');
      await until('!document.querySelector("[data-text-data-workspace]")');
      geometries.push({ level, geometry: await evaluate('window.a6.completedReveal("SEGMENT_000016")') });
    }
    await fs.writeFile(path.join(evidence, 'completed-reveals.json'), JSON.stringify(geometries, null, 2));
  });
  await run('Workspace switches recompute eligibility with no stale presentation or audible cursor', async () => {
    for (const key of ['conversationId', 'mixedId', 'legacyId']) {
      await selectWorkspace(key);
      await until('document.querySelector("[data-text-main-reader-option=shared]").disabled && !document.querySelector("[data-shared-card-embedded]")');
      check(await evaluate('Boolean(document.querySelector("#text-main-reader-unavailable")?.textContent)'), 'No fallback explanation');
      check(await evaluate('Boolean(document.querySelector("[data-text-main-reader=legacy]"))'), 'Fallback not old reader');
    }
    await selectWorkspace('secondId');
    await until('document.querySelector("[data-shared-card-embedded]")');
    check(await evaluate('[...document.querySelectorAll("[data-shared-card-id]")].every(c=>c.dataset.sharedCardId === window.a6.ids.secondCardId)'), 'Foreign Workspace presentation reused');
    await selectWorkspace('documentId');
    await until('document.querySelector("[data-shared-card-id]")?.dataset.sharedCardId === window.a6.ids.titleCardId');
  });
  await run('Native mobile viewport keeps both choices readable and accessible', async () => {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await until('window.innerWidth === 390');
    await evaluate('window.a6.stableLayout()');
    await pointerClick(readingToggle);
    await until(visible(readingOverlay));
    const size = await evaluate(`[...document.querySelectorAll('${readingOverlay} [data-text-main-reader-option]')].map(e=>{const r=e.getBoundingClientRect(); const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {left:r.left,right:r.right,height:r.height,hit:e.contains(target),pressed:e.getAttribute('aria-pressed')};})`);
    check(size.length === 2 && size.every(s=>s.left>=0 && s.right<=390 && s.height>=32 && s.hit) && size.filter(s => s.pressed === 'true').length === 1, 'Mobile Reader choices are clipped or unreachable');
    const toolbar = await evaluate(`[...document.querySelectorAll('[data-shared-card-level-option], [data-shared-card-layout-option]')].map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent,left:r.left,right:r.right};})`);
    await fs.writeFile(path.join(evidence, 'mobile-toolbar.json'), JSON.stringify(toolbar, null, 2));
    check(toolbar.every(s=>s.left>=0 && s.right<=390), 'Mobile Shared toolbar clipped');
    await screenshot('a6-main-text-shared-mobile');
    await pointerClick(`${readingOverlay} [data-text-main-reader-option="legacy"]`);
    await until('document.querySelector("[data-text-main-reader=legacy]")');
    await screenshot('a6-main-text-old-mobile');
    // The Classic surface starts with a different document geometry. Return
    // to its top controls before testing the native pointer hit.
    await evaluate('window.scrollTo({ top: 0, behavior: "instant" })');
    await evaluate('window.a6.stableLayout()');
    await pointerClick('[data-text-main-reader-option="shared"]');
    await until(visible(readingToggle), 'Mobile Shared Reader mounted after Classic return');
    await resize(false);
  });
  await run('Reload restores only safe reader/view preferences and no audio or content mutation', async () => {
    await openDesktopReading();
    await readerMode('segment');
    await click('[data-shared-card-layout-option="meaning-only"]');
    const audio = await evaluate('localStorage.getItem("prolingo_text_structured_preferences_v1")');
    const content = await evaluate('(async()=>{const s=await window.a6.readSnapshot(); return JSON.stringify({documents:s.documents,blocks:s.blocks,segments:s.segments,audioVariants:s.audioVariants,counters:s.counters});})()');
    const previousOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(`performance.timeOrigin !== ${previousOrigin} && window.a6 && document.querySelector("button")`);
    if (await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Mulai Latihan")')) await textButton('Mulai Latihan');
    await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Text")'); await textButton('Text');
    await until('document.querySelector("[data-text-main-reader=shared]") && document.querySelector("[data-shared-card-level=segment][data-shared-card-layout=meaning-only]")');
    check(audio === await evaluate('localStorage.getItem("prolingo_text_structured_preferences_v1")'), 'View reload changed audio configuration');
    check(content === await evaluate('(async()=>{const s=await window.a6.readSnapshot(); return JSON.stringify({documents:s.documents,blocks:s.blocks,segments:s.segments,audioVariants:s.audioVariants,counters:s.counters});})()'), 'Reload changed document data');
    check(await evaluate('!window.a6Speech.some(s=>s.type==="speak") && !window.a6Media.some(m=>m.type==="play" && !m.loop && m.src.startsWith("blob:"))'), 'Reload started audio');
    check(await evaluate('window.a6Opens.every(o=>o.version===1 && o.actual.startsWith("prolingo_text_library_d3b_qa_a6_"))'), 'Unsafe database open');
  });
  const ordinaryOpens = await evaluate('window.a6Opens');
  await run('Corrupt disposable snapshot fails closed with a readable existing view/error gate', async () => {
    const previousOrigin = await evaluate('performance.timeOrigin');
    await call('Page.navigate', { url: origin + '/corrupt' });
    await until(`performance.timeOrigin !== ${previousOrigin} && window.a6 && document.querySelector("button")`);
    if (await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Mulai Latihan")')) await textButton('Mulai Latihan');
    await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Text")'); await textButton('Text');
    await until('document.querySelector("[data-text-main-reader-option=shared]")?.disabled && /Snapshot|gagal dimuat/.test(document.querySelector("#text-main-reader-unavailable")?.textContent)', 'committed corruption rejection, not a loading state');
    check(await evaluate('!document.querySelector("[data-shared-card-embedded]") && document.body.innerText.includes("Tampilan Lama")'), 'Corrupt input created a Shared or blank page');
    check(await evaluate('!window.a6Speech.some(s=>s.type==="speak")'), 'Corruption fallback started audio');
  });
  await fs.writeFile(path.join(evidence, 'interim-dom.txt'), await evaluate('document.body.innerText'));
  await screenshot('a6-current');
  const report = { passed: results.length, results, errors: await evaluate('window.a6Errors'), opens: [...ordinaryOpens, ...await evaluate('window.a6Opens')], profile, evidence };
  await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} catch (error) {
  console.error(error); process.exitCode = 1;
  await diagnose?.(error).catch(console.error);
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  console.log('Evidence:', evidence, 'Disposable profile:', profile);
}
