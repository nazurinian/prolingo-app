import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config.js';
import { bindNowPlayingRuntime, readOwnedNowPlaying } from '../src/domain/playback/nowPlayingDomain.js';
import { presentGlobalPlayer, resolveGlobalPlayerTransport } from '../src/domain/playback/globalPlayerPresentationDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = createJourneyToLondonFixture();
const london = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
assert.deepEqual([london.blocks.length, london.blocks.flatMap(block => block.units).length, london.blocks.flatMap(block => block.segments).length], [4, 11, 37]);
const [p1, c1, p2, c2] = london.blocks;
const select = snapshot => selectTextCardPresentation(snapshot, { documentId: fixture.ids.documentId });
const conversationCardIds = new Set([c1.id, c2.id]);
const conversationSnapshot = {
  ...fixture.snapshot,
  documents: fixture.snapshot.documents.map(document => ({ ...document, documentType: 'conversation' })),
  blocks: fixture.snapshot.blocks.filter(card => conversationCardIds.has(card.id)),
  contentUnits: fixture.snapshot.contentUnits.filter(unit => conversationCardIds.has(unit.blockId)),
  segments: fixture.snapshot.segments.filter(segment => conversationCardIds.has(segment.blockId))
};
const [sg1, sg2] = c1.units[1].segments;
const session = { sessionId: 1, context: 'text-structured', documentTree: london, nowPlayingCardOrder: [c2.id, p2.id, p1.id, c1.id],
  restart: () => {}, scope: 'from-here', boundary: 'document', playbackRepresentationMode: 'full', savedPlaybackRepresentationMode: 'full', requestedRepresentation: 'full' };
const refs = { playbackContextRef: { current: session }, playbackSessionRef: { current: 1 }, stopSignalRef: { current: false }, pauseStateRef: { current: false } };
const view = () => {
  const nowPlaying = readOwnedNowPlaying(refs, 'audit', { isPlaying: true });
  return presentGlobalPlayer({ nowPlaying, transport: resolveGlobalPlayerTransport({ session, audible: nowPlaying.precision !== 'none', paused: refs.pauseStateRef.current }) });
};
const start = (card, segment, representation, channel = 'text') => bindNowPlayingRuntime(refs, { cardId: card.id, segmentId: segment?.id, representation, channel });
start(c1, sg2, 'split', 'meaning')({ source: 'tts', provider: 'browser-tts', voice: 'ID voice', rate: 1.25 });
assert.equal(view().title, 'A Journey to London');
assert.match(view().context, /^Card 2\/4 · C1 · T2\/4 · .* · SG2\/3$/u);
assert.equal(Object.fromEntries(view().details).Queue, 'card 4/4');
assert.equal(Object.fromEntries(view().details).Segment, sg2.meaning);
assert.match(view().status, /ID · Split · TTS · Runtime Full → Split fallback/u);
assert.equal(view().navLabel, 'card');
assert.equal(view().timeline, null);
start(p2, p2.segments[1], 'split')({ source: 'local-rf' });
assert.match(view().context, /^Card 3\/4 · P2 · SC1\/1 · SG2\/5$/u);
start(c1, sg1, 'full')({ source: 'full-artifact' });
assert.equal(view().context, 'Card 2/4 · C1 · Full');
assert.equal(Object.fromEntries(view().details).Speaker, undefined);
assert.equal(Object.fromEntries(view().details).Segment, undefined);
session.nowPlayingCardOrder = null;
session.orderedList = [{ id: sg2.id }];
session.playbackRepresentationMode = 'split';
const stalePublish = start(c1, sg2, 'split');
stalePublish({ source: 'tts' });
assert.match(view().status, /Temporary Split/u);
assert.equal(view().canNavigate, false);
refs.playbackSessionRef.current++;
stalePublish({ source: 'stale' });
assert.equal(readOwnedNowPlaying(refs, 'audit').state, 'idle');
console.log('PASS projection metadata, authored/queue order, Full precision, temporary Split, fallback and stale evidence');
if (process.argv.includes('--node-only')) process.exit(0);

const entry = `
import React, { useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App.jsx';
import { renderMainAppShellView } from './src/components/layout/MainAppShellView.jsx';
import { TextStructuredPlayer } from './src/components/text/TextStructuredPlayer.jsx';
import { bindNowPlayingRuntime, readOwnedNowPlaying, readOwnedNowPlayingMedia } from './src/domain/playback/nowPlayingDomain.js';
import { resolveGlobalPlayerTransport } from './src/domain/playback/globalPlayerPresentationDomain.js';
import { readOwnedPlaybackSession, navigateOwnedPlayback, executeSafePlayTransition } from './src/services/playback/playbackRuntimeControlService.js';
const tree = ${JSON.stringify(london)};
const conversation = ${JSON.stringify(resolveTextLibraryDocumentTree(conversationSnapshot, fixture.ids.documentId))};
const londonPresentation = ${JSON.stringify(select(fixture.snapshot))};
const conversationPresentation = ${JSON.stringify(select(conversationSnapshot))};
const [p1, c1, p2, c2] = tree.blocks;
const noop = () => {};
const refs = { playbackContextRef: { current: null }, stopSignalRef: { current: true }, playbackSessionRef: { current: 0 }, pauseStateRef: { current: false } };
let publish, tone, renders = 0;
function ShellFixture() {
  renders++;
  const [, refresh] = useReducer(value => value + 1, 0);
  refs.onChange = refresh;
  const [mode, setMode] = useState('text');
  const [conversationOnly, setConversationOnly] = useState(false);
  const [saved, setSaved] = useState('full');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stop = () => {
    refs.playbackSessionRef.current++; refs.playbackContextRef.current = null;
    refs.stopSignalRef.current = true; refs.pauseStateRef.current = false;
    tone?.pause(); refresh();
  };
  const start = (card, segment, channel = 'text', audioRepresentation = 'split', media = false, documentTree = tree) => {
    const queue = documentTree === conversation ? [c2, c1] : [c2, p2, p1, c1];
    const pendingSession = { context: 'text-structured', documentTree, scope: 'document', orderedList: queue.map(entry => ({ id: entry.segments[0].id, blockId: entry.id })),
      nowPlayingCardOrder: queue.map(entry => entry.id), blockId: card.id, requestedRepresentation: 'full', savedPlaybackRepresentationMode: saved, playbackRepresentationMode: 'full',
      restart: item => start(documentTree.blocks.find(block => block.id === item.blockId), null, 'text', 'full', false, documentTree) };
    return executeSafePlayTransition({ ...refs, forceStopAll: stop, pendingSession, onPending: refresh, actionCallback: () => {
      refs.playbackContextRef.current = { ...pendingSession, sessionId: refs.playbackSessionRef.current };
      publish = bindNowPlayingRuntime(refs, { cardId: card.id, segmentId: segment?.id, channel, representation: audioRepresentation });
      if (media) { tone = new Audio('/audio.wav'); tone.onplaying = () => publish({ media: tone, source: 'full-artifact', voice: 'Local voice' }); tone.play(); }
      else publish({ source: 'tts', provider: 'browser-tts', voice: channel === 'text' ? 'English voice' : 'ID voice', rate: 1.25 });
    } });
  };
  window.fixture = { start: () => start(c1, c1.units[1].segments[1], 'meaning'), media: () => start(p1, null, 'text', 'full', true),
    paragraph: () => start(p2, p2.segments[0], 'text'),
    conversation: () => { setConversationOnly(true); start(c2, c2.segments[0], 'meaning', 'split', false, conversation); },
    gap: () => publish(null), browse: setMode, renders: () => renders, settingsOpen, oldPublish: () => publish,
    changeMediaTime: () => { tone.currentTime = 3; tone.dispatchEvent(new Event('timeupdate')); } };
  const readPlayer = () => {
    const nowPlaying = readOwnedNowPlaying(refs, 'main', { isPlaying: true });
    return { nowPlaying, media: readOwnedNowPlayingMedia(refs), transport: resolveGlobalPlayerTransport({ session: readOwnedPlaybackSession(refs), paused: refs.pauseStateRef.current, audible: nowPlaying.precision !== 'none', structuredView: mode === 'text', savedRepresentation: saved }) };
  };
  return renderMainAppShellView({ mode, isMobile: innerWidth < 768, mobileTab: 'player', sidebarSection: 'player', theme: 'light',
    renderWorkspaceTabs: noop,
    renderPlaylist: () => innerWidth < 768 && mode === 'text' && <TextStructuredPlayer
      documentTree={conversationOnly ? conversation : tree} sharedPresentation={conversationOnly ? conversationPresentation : londonPresentation}
      useSharedCardReader readPlayer={readPlayer} sharedReaderMode="full"
      playbackPreferences={{ cardExpansionMode: 'all' }} playbackChannelMode="text-meaning" playbackRepresentationMode="split" />,
    renderMobileTools: noop, renderControlSectionTabs: noop, renderStatusBadge: noop,
    structuredTextModeActive: mode === 'text', savedDecks: {}, readGlobalPlayer: readPlayer,
    handleSmartNav: direction => navigateOwnedPlayback(readOwnedPlaybackSession(refs), direction),
    handleGlobalPlay: () => { refs.pauseStateRef.current = !refs.pauseStateRef.current; refresh(); }, forceStopAll: stop,
    playbackMode: 'once', cyclePlaybackMode: noop, setPlaybackMode: noop, textPlaybackRepresentationMode: saved,
    textPlaybackChannelMode: 'text-meaning', onTextPlaybackRepresentationModeChange: setSaved, onOpenTextPlayer: () => setSettingsOpen(true) });
}
if (location.pathname === '/app') {
  sessionStorage.setItem('prolingo:view:v1', 'app');
  const instrumentMedia = new URLSearchParams(location.search).has('media-session');
  if (instrumentMedia) {
    const handlers = {};
    const position = [];
    const session = { metadata: null, playbackState: 'none', setActionHandler(action, callback) { handlers[action] = callback; }, setPositionState(value) { position.push(value); } };
    window.mediaAudit = { session, handlers, position, constructions: 0 };
    Object.defineProperty(navigator, 'mediaSession', { value: session });
    window.MediaMetadata = class { constructor(value) { window.mediaAudit.constructions++; Object.assign(this, value); } };
  }
  const utterances = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const voices = [{ name: 'QA English', lang: 'en-US', voiceURI: 'qa-en', localService: true }, { name: 'QA Indonesian', lang: 'id-ID', voiceURI: 'qa-id', localService: true }];
  Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, paused: false, pending: false,
    speak(utterance) { this.speaking = true; utterances.push(utterance); utterance.onstart?.(); },
    cancel() { this.speaking = false; if (instrumentMedia) utterances.at(-1)?.onend?.(); },
    pause() { this.paused = true; }, resume() { this.paused = false; }, getVoices() { return voices; }, addEventListener() {}, removeEventListener() {} } });
  window.utterances = utterances;
}
const appRoot = createRoot(document.getElementById('root'));
window.unmountAuditApp = () => appRoot.unmount();
appRoot.render(location.pathname === '/app' ? <App/> : <ShellFixture/>);
`;
const [bundle, styles, artwork] = await Promise.all([
  build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'esm', jsx: 'automatic',
    loader: { '.css': 'empty', '.mp3': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' }, define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } }),
  fs.readFile(path.join(root, 'src/index.css'), 'utf8').then(source => postcss([tailwindcss({ ...tailwindConfig, content: [path.join(root, 'src/**/*.{js,jsx}')] })]).process(source, { from: path.join(root, 'src/index.css') })),
  fs.readFile(path.join(root, 'public/text-uat-icon-512.png'))
]);
const audio = Buffer.alloc(44 + 8 * 8000 * 2); // Eight seconds of real PCM media in Chromium.
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
const server = http.createServer((req, res) => {
  const [type, body] = ({ '/app.js': ['text/javascript', bundle.outputFiles[0].contents], '/style.css': ['text/css', styles.css],
    '/audio.wav': ['audio/wav', audio], '/text-uat-icon-512.png': ['image/png', artwork] })[req.url]
    ?? ['text/html', '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>window.auditErrors=[]; addEventListener("error", e=>auditErrors.push(e.message)); addEventListener("unhandledrejection", e=>auditErrors.push(String(e.reason)));</script><script type="module" src="/app.js"></script>'];
  res.writeHead(200, { 'Content-Type': type }); res.end(body);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4f1-evidence-'));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prolingo-uat4-4f1-profile-'));
let browser, socket, call;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = spawn(process.env.UAT4_BROWSER_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--autoplay-policy=no-user-gesture-required', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browser.on('error', error => { launchError = error; });
  let port;
  for (let attempt = 0; attempt < 150 && !port; attempt++) {
    if (launchError) throw launchError;
    port = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').then(value => Number(value.split('\n')[0])).catch(() => null);
    if (!port) await sleep(100);
  }
  assert.ok(port, 'Chrome remote debugging is available');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  call = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, method === 'Browser.close' ? 2500 : 10000);
    pending.set(id, ({ result, error }) => { clearTimeout(timer); if (error) reject(new Error(error.message)); else resolve(result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = ({ data }) => { const message = JSON.parse(data); pending.get(message.id)?.(message); pending.delete(message.id); };
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const until = async (expression, label = expression) => {
    for (let i = 0; i < 160; i++) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(40); }
    const diagnostics = await evaluate(`({ errors: window.auditErrors, player: document.querySelector('[data-global-player]')?.innerText, utterances: window.utterances?.map(utterance => utterance.text), rows: [...document.querySelectorAll('[id^="row-"]')].slice(0, 3).map(row => row.innerText), mode: document.querySelector('[data-mobile-mode-switch]')?.textContent, text: document.body.innerText.slice(-2000) })`);
    assert.fail('Timed out waiting for ' + label + ' ' + JSON.stringify(diagnostics));
  };
  const tap = label => evaluate(`document.querySelector('[data-global-player] button[aria-label="${label}"]').click()`);
  const phase = value => until(`document.querySelector('[data-global-player]')?.dataset.playerPhase === '${value}'`);
  const title = value => until(`document.querySelector('[data-player-title]')?.textContent === ${JSON.stringify(value)}`);
  const size = (width, height, mobile = false) => call('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
  const capture = async filename => {
    const clip = await evaluate(`(() => { const r = document.querySelector('[data-global-player]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`);
    const shot = await call('Page.captureScreenshot', { format: 'png', clip });
    await fs.writeFile(path.join(artifacts, filename), Buffer.from(shot.data, 'base64'));
  };
  await size(1100, 760);
  await call('Page.navigate', { url: origin + '/fixture' });
  await until('window.fixture');
  await phase('idle');
  await evaluate('window.fixture.start(); true');
  await phase('pending');
  assert.equal(await evaluate(`document.querySelector('[data-player-context]') === null`), true);
  await phase('playing');
  await tap('Expand player details');
  await until(`document.querySelector('[data-player-detail="Voice"]').textContent === 'ID voice'`);
  await capture('desktop-split-expanded.png');
  await evaluate(`document.querySelector('[data-text-global-player-controls] button').click()`);
  await until(`document.querySelector('[data-text-global-player-controls] button').textContent === 'Saved Split'`);
  await evaluate(`document.querySelectorAll('[data-text-global-player-controls] button')[1].click()`);
  await until('window.fixture.settingsOpen');
  await until(`document.querySelector('[aria-label="Expand player details"]')`);
  await phase('playing');
  await evaluate(`window.fixture.browse('table'); window.old = window.fixture.oldPublish()`);
  await title('A Journey to London');
  await tap('Expand player details');
  await tap('Pause playback');
  await phase('paused');
  await tap('Resume playback');
  await phase('playing');
  await evaluate('window.fixture.gap()');
  await phase('waiting');
  assert.equal(await evaluate(`document.querySelector('[data-player-detail="Segment"]') === null`), true);
  await tap('Next card');
  await until(`document.querySelector('[data-player-context]')?.textContent === 'Card 4/4 · C2 · Full'`);
  await evaluate(`window.old({source:'stale'})`);
  assert.equal(await evaluate(`document.querySelector('[data-player-status]').textContent.includes('stale')`), false);
  await evaluate(`window.fixture.media(); true`);
  await until(`document.querySelector('[data-player-timeline] progress')?.max === 8`);
  const renders = await evaluate('window.fixture.renders()');
  await evaluate('window.fixture.changeMediaTime()');
  await until(`document.querySelector('[data-player-timeline] progress').value >= 3`);
  assert.equal(await evaluate('window.fixture.renders()'), renders);
  await tap('Stop playback'); await phase('idle');
  assert.equal(await evaluate(`document.querySelector('[data-player-timeline]') === null`), true);
  await size(390, 844, true);
  await call('Page.navigate', { url: origin + '/fixture' });
  await until('window.fixture');
  const workspaceStatus = label => until(`document.querySelector('[data-mobile-workspace-playback-status]')?.textContent === ${JSON.stringify(label)}`);
  await evaluate('window.fixture.start(); true'); await phase('playing');
  await workspaceStatus('C1 · ID');
  await capture('mobile-compact.png');
  await call('Page.bringToFront');
  assert.equal(await evaluate(`(() => { const button = document.querySelector('[data-global-player] [aria-label="Expand player details"]'); button.focus(); return document.activeElement === button; })()`), true);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await until(`document.querySelector('[data-player-detail="Queue"]')`);
  assert.equal(await evaluate(`(() => {const bar = document.querySelector('[data-global-player]'); const button = bar.querySelector('[aria-expanded=true]'); return bar.scrollWidth <= 390 && document.getElementById(button.getAttribute('aria-controls')).scrollWidth <= 390;})()`), true);
  await capture('mobile-expanded.png');
  await tap('Collapse player details');
  await tap('Pause playback'); await workspaceStatus('C1 · Paused · ID');
  await tap('Resume playback'); await workspaceStatus('C1 · ID');
  await evaluate('window.fixture.paragraph(); true'); await workspaceStatus('Starting playback…'); await workspaceStatus('P2 · EN');
  await evaluate('window.fixture.gap()'); await workspaceStatus('Waiting for audio…');
  await evaluate('window.fixture.conversation(); true'); await workspaceStatus('C2 · ID');
  await tap('Stop playback'); await phase('idle');
  assert.equal(await evaluate(`document.querySelector('[data-mobile-workspace-playback-status]')`), null);
  console.log('PASS mobile Workspace status follows authored Mixed P2/C1 and Conversation C2, actual EN/ID, Pending, Paused, Waiting and Idle');
  console.log('PASS Main App shell London fixture, handoff/gap, owned transport, local timeline refresh, desktop and 390px mobile');

  await size(1100, 760);
  const mediaAudit = process.argv.includes('--media-session');
  await call('Page.navigate', { url: origin + '/app' + (mediaAudit ? '?media-session=1' : '') });
  await until(`document.querySelector('[data-csv-import-input]')`);
  const csv = ['VOCAB_ID,NO,WORDS,PART OF SPEECH,MEANING,INFO,EN,IDN,EXP1_EN,EXP1_IDN',
    'VOCAB_12,12,abandon,verb,meninggalkan,,We abandon it.,Kami meninggalkannya.,Abandon ship!,Tinggalkan kapal!',
    'VOCAB_13,13,ability,noun,kemampuan,,She has ability.,Dia mampu.'].join('\n');
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(csv)}], 'audit.csv', {type:'text/csv'})); const input = document.querySelector('[data-csv-import-input]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await until(`[...document.querySelectorAll('[id^="row-"]')].some(row => row.innerText.includes('Abandon') && row.innerText.includes('We abandon it.'))`);
  const firstRow = '[id^="row-"]';
  const playPart = async (selector, context, channel, spoken) => {
    const previous = await evaluate('window.utterances.length');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await until(`window.utterances.length === ${previous + 1} && document.querySelector('[data-player-context]')?.textContent === ${JSON.stringify(`Word 12 · ${context}`)}`);
    assert.deepEqual(await evaluate(`({ domain: document.querySelector('[data-global-player]').dataset.playerDomain, channel: document.querySelector('[data-global-player]').dataset.playerChannel, spoken: window.utterances.at(-1).text })`), { domain: 'table', channel, spoken });
    await tap('Stop playback'); await phase('idle');
  };
  await playPart(`${firstRow} [title="Play word translation"]`, 'Word meaning', 'meaning', 'meninggalkan');
  await playPart(`${firstRow} [aria-label="Play sentence"]`, 'Example sentence', 'text', 'We abandon it.');
  await evaluate(`document.querySelector(${JSON.stringify(`${firstRow} [title="Open INFO + EXP1–EXP5"]`)}).click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'SHOW FULL').click()`);
  await playPart('div:has(> [aria-label="Close advanced expressions"]) [aria-label="Play meaning"]', 'Sentence meaning', 'meaning', 'Kami meninggalkannya.');
  await playPart('[aria-label="Play exp1_en"]', 'Expression 1', 'text', 'Abandon ship!');
  await playPart('[aria-label="Play exp1_idn"]', 'Expression 1', 'meaning', 'Tinggalkan kapal!');
  await evaluate(`document.querySelector('[aria-label="Close advanced expressions"]').click()`);
  console.log('PASS production Table Word meaning, Sentence and EXP retain vocabulary 12, actual channel and spoken content');
  await tap('Start playback'); await title('Abandon');
  assert.match(await evaluate(`document.querySelector('[data-player-context]').textContent`), /Word 12/u);
  await until(`navigator.mediaSession?.metadata?.title === 'Abandon'`);
  assert.equal(await evaluate(`navigator.mediaSession.metadata.artwork[0].src.endsWith('/text-uat-icon-512.png')`), true);
  if (mediaAudit) {
    assert.equal(await evaluate('window.mediaAudit.session.metadata.title'), 'Abandon');
    await evaluate('window.oldNextTrack = window.mediaAudit.handlers.nexttrack; window.notificationBeforeBrowse = window.mediaAudit.session.metadata');
  }
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Text').click()`);
  await title('Abandon');
  if (mediaAudit) {
    assert.equal(await evaluate('window.mediaAudit.session.metadata === window.notificationBeforeBrowse'), true);
    await evaluate('window.mediaAudit.handlers.play(); window.mediaAudit.handlers.play()');
    await phase('playing');
    await evaluate('window.mediaAudit.handlers.nexttrack()');
    await title('Ability');
    const utterances = await evaluate('window.utterances.length');
    await evaluate('window.oldNextTrack()');
    await title('Ability');
    assert.equal(await evaluate('window.utterances.length'), utterances);
    await evaluate('window.mediaAudit.handlers.previoustrack()');
    await title('Abandon');
  } else {
    await tap('Next item'); await title('Ability');
    await tap('Previous item'); await title('Abandon');
  }
  await tap('Expand player details');
  assert.equal(await evaluate(`document.querySelector('[data-player-timeline]') === null`), true);
  await capture('desktop-table-expanded.png');
  const utteranceCount = await evaluate('window.utterances.length');
  await evaluate(`(() => { const select = document.querySelector('[data-global-player] select'); select.value = 'sequence'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await title('Abandon');
  assert.equal(await evaluate('window.utterances.length'), utteranceCount);
  await evaluate(`(() => { const select = document.querySelector('[data-global-player] select'); select.value = 'once'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  if (mediaAudit) await evaluate('window.mediaAudit.handlers.stop()');
  else await tap('Stop playback');
  await phase('idle');
  await tap('Start playback'); await title('Hello world.');
  if (mediaAudit) {
    const count = await evaluate('window.utterances.length');
    const constructions = await evaluate('window.mediaAudit.constructions');
    assert.equal(await evaluate(`window.mediaAudit.position.every(position => !('duration' in position))`), true, 'TTS never borrows the silent anchor timeline');
    await evaluate('window.mediaAudit.handlers.pause(); window.mediaAudit.handlers.pause()'); await phase('paused');
    await evaluate('window.mediaAudit.handlers.play(); window.mediaAudit.handlers.play()'); await phase('playing');
    await until(`window.utterances.length === ${count + 1}`, 'system Resume replays the same logical TTS part');
    assert.deepEqual(await evaluate('window.utterances.slice(-2).map(utterance => utterance.text)'), ['Hello world.', 'Hello world.']);
    assert.equal(await evaluate('window.mediaAudit.constructions'), constructions, 'Pause and replay keep the same notification metadata');
  } else {
    await tap('Pause playback'); await phase('paused');
    await tap('Resume playback'); await phase('playing');
  }
  await evaluate('window.utterances.at(-1).onend?.()');
  await phase('waiting');
  await phase('idle');
  assert.equal(await evaluate('navigator.mediaSession.metadata'), null);
  if (mediaAudit) {
    assert.equal(await evaluate('window.mediaAudit.session.metadata'), null);
    await tap('Start playback'); await title('Hello world.');
    await evaluate('window.unmountAuditApp()');
    await until(`window.mediaAudit.session.metadata === null && window.mediaAudit.session.playbackState === 'none' && Object.values(window.mediaAudit.handlers).every(handler => handler == null)`);
    console.log('PASS production Main App Media Session metadata, idempotent actions, stale callbacks, TTS replay without timeline, completion and unmount');
  }
  assert.deepEqual(await evaluate('window.auditErrors'), []);
  if (mediaAudit) {
    await fs.writeFile(path.join(artifacts, '4f2-media-session-browser.json'), JSON.stringify({
      status: 'PASS', platform: 'Chrome, production Main App with instrumented Media Session and TTS',
      checks: ['passive browsing', 'owned Prev/Next', 'stale actions', 'idempotent Play/Pause', 'logical TTS replay', 'completion and unmount'],
      hardwareAndroid: 'NOT TESTED'
    }, null, 2));
  }
  console.log('PASS production Main App Table/Legacy, passive mode browse, cross-tab Next, Pause/Resume, and natural completion');
} finally {
  await call?.('Browser.close').catch(() => {});
  socket?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill();
  server.closeAllConnections(); server.close();
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  console.log(`Disposable profile removed. Evidence ${artifacts}`);
}
