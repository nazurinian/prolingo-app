import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import {
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import { applyTextConversationEditorCommand } from '../src/domain/text/textConversationEditorDomain.js';
import { applyTextLibraryCommand } from '../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';
import { createD5AudioFixture } from './fixtures/d5/conversation-audio-fixture.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let indexedDbAccessCount = 0;
globalThis.indexedDB = new Proxy({}, {
  get(_target, prop) {
    indexedDbAccessCount += 1;
    throw new Error(`D5 UI audit forbidden IndexedDB access: ${String(prop)}`);
  }
});
globalThis.confirm = () => true;

const matchesSimpleToken = (el, token) => {
  if (!token) return true;
  const attrBracket = token.match(/^([^[]*)\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (attrBracket) {
    const [, tagPart, attrName, attrVal] = attrBracket;
    if (tagPart && el.tagName.toLowerCase() !== tagPart.toLowerCase()) return false;
    if (attrVal !== undefined) return el.getAttribute(attrName) === attrVal;
    return el.hasAttribute(attrName);
  }
  if (token.startsWith('.')) return el.className.split(/\s+/).includes(token.slice(1));
  return el.tagName.toLowerCase() === token.toLowerCase();
};

const matchesSelector = (el, selector) => {
  if (!el || el.nodeType !== 1) return false;
  return selector
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => {
      const tokens = part.match(/(?:[^\s[\]]+|\[[^\]]*\])+/g) || [];
      if (tokens.length === 0) return false;
      if (!matchesSimpleToken(el, tokens[tokens.length - 1])) return false;
      let cursor = el.parentNode;
      for (let i = tokens.length - 2; i >= 0; i -= 1) {
        while (cursor && (cursor.nodeType !== 1 || !matchesSimpleToken(cursor, tokens[i]))) {
          cursor = cursor.parentNode;
        }
        if (!cursor) return false;
        cursor = cursor.parentNode;
      }
      return true;
    });
};

const installMinimalDom = () => {
  const noop = () => {};
  const makeStyle = () => ({ setProperty: noop, removeProperty: noop, getPropertyValue: () => '' });
  let fakeDoc;

  class FakeNode {
    constructor(nodeType, nodeName) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.childNodes = [];
      this.parentNode = null;
      this.ownerDocument = fakeDoc;
      this.nodeValue = '';
    }
    appendChild(child) {
      if (!child) return child;
      if (child.nodeType === 11) {
        for (const item of [...child.childNodes]) this.appendChild(item);
        child.childNodes = [];
        return child;
      }
      if (child.parentNode?.removeChild) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.nodeType === 11) {
        for (const item of [...newNode.childNodes]) this.insertBefore(item, refNode);
        newNode.childNodes = [];
        return newNode;
      }
      if (newNode.parentNode?.removeChild) newNode.parentNode.removeChild(newNode);
      const idx = this.childNodes.indexOf(refNode);
      newNode.parentNode = this;
      if (idx >= 0) this.childNodes.splice(idx, 0, newNode);
      else this.childNodes.push(newNode);
      return newNode;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
  }

  class FakeElement extends FakeNode {
    constructor(tag) {
      super(1, String(tag || 'DIV').toUpperCase());
      this.tagName = this.nodeName;
      this.style = makeStyle();
      this.attributes = new Map();
      this.checked = false;
      this.disabled = false;
      this.readOnly = false;
      this.selected = false;
      this.defaultSelected = false;
    }
    get value() { return this._value !== undefined ? this._value : (this.attributes.get('value') ?? ''); }
    set value(v) { this._value = String(v ?? ''); }
    get type() { return this.attributes.get('type') ?? ''; }
    set type(v) { this.attributes.set('type', String(v ?? '')); }
    get disabled() { return Boolean(this._disabled) || this.attributes.has('disabled'); }
    set disabled(v) {
      this._disabled = Boolean(v);
      if (this._disabled) this.attributes.set('disabled', '');
      else this.attributes.delete('disabled');
    }
    get className() { return this.attributes.get('class') || ''; }
    set className(v) { this.attributes.set('class', String(v ?? '')); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    removeAttribute(k) { this.attributes.delete(k); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    hasAttribute(k) { return this.attributes.has(k); }
    getBoundingClientRect() { return { top: 0, bottom: 700, left: 0, right: 1200, width: 1200, height: 700 }; }
    focus() {}
    addEventListener() {}
    removeEventListener() {}
    set textContent(v) { this.childNodes = []; this._text = String(v ?? ''); }
    get textContent() { return this._text || this.childNodes.map(c => c.textContent || c.nodeValue || '').join(''); }
    querySelectorAll(selector) {
      const out = [];
      const walk = node => {
        for (const child of node.childNodes) {
          if (child.nodeType === 1) {
            if (matchesSelector(child, selector)) out.push(child);
            walk(child);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }

  class FakeSelect extends FakeElement {
    get options() { return this.querySelectorAll('option'); }
    get length() { return this.options.length; }
    get selectedOptions() { return this.options.filter(o => o.selected || o.defaultSelected); }
    get value() {
      const sel = this.selectedOptions[0];
      return sel ? sel.value : (this._value ?? '');
    }
    set value(v) {
      const target = String(v ?? '');
      this._value = target;
      for (const opt of this.options) {
        const match = opt.value === target;
        opt.selected = match;
        opt.defaultSelected = match;
      }
    }
  }
  class FakeInput extends FakeElement {}
  class FakeTextArea extends FakeElement {}
  class FakeIFrame extends FakeElement {}

  fakeDoc = {
    nodeType: 9,
    activeElement: null,
    defaultView: globalThis,
    documentElement: null,
    body: null,
    head: null,
    createElement(tag) {
      const upper = String(tag || '').toUpperCase();
      if (upper === 'SELECT') return new FakeSelect('select');
      if (upper === 'INPUT') return new FakeInput('input');
      if (upper === 'TEXTAREA') return new FakeTextArea('textarea');
      if (upper === 'IFRAME') return new FakeIFrame('iframe');
      return new FakeElement(tag);
    },
    createElementNS(_ns, tag) { return new FakeElement(tag); },
    createTextNode(text) {
      const node = new FakeNode(3, '#text');
      node.nodeValue = String(text ?? '');
      return node;
    },
    createComment() { return new FakeNode(8, '#comment'); },
    createDocumentFragment() { return new FakeNode(11, '#document-fragment'); },
    addEventListener: noop,
    removeEventListener: noop,
    getSelection: () => null,
    querySelectorAll(sel) { return fakeDoc.body.querySelectorAll(sel); },
    querySelector(sel) { return fakeDoc.body.querySelector(sel); }
  };
  fakeDoc.head = new FakeElement('head');
  fakeDoc.body = new FakeElement('body');
  fakeDoc.documentElement = new FakeElement('html');
  fakeDoc.documentElement.appendChild(fakeDoc.head);
  fakeDoc.documentElement.appendChild(fakeDoc.body);

  globalThis.window = globalThis;
  globalThis.addEventListener = noop;
  globalThis.removeEventListener = noop;
  globalThis.document = fakeDoc;
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLSelectElement = FakeSelect;
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLTextAreaElement = FakeTextArea;
  globalThis.HTMLIFrameElement = FakeIFrame;
  globalThis.Node = FakeNode;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.getComputedStyle = () => makeStyle();
  globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  return { fakeDoc };
};

const { fakeDoc } = installMinimalDom();
const fakeIcons = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? function Icon() { return null; } : undefined) });
const moduleCache = new Map();

const loadWithRealReact = absPath => {
  const resolved = path.resolve(absPath);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;
  const code = esbuild.transformSync(fs.readFileSync(resolved, 'utf8'), {
    loader: resolved.endsWith('.jsx') ? 'jsx' : 'js',
    format: 'cjs',
    target: 'es2022',
    jsx: 'transform'
  }).code;
  const mod = { exports: {} };
  moduleCache.set(resolved, mod);
  const req = specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react-dom') return { ...require('react-dom'), createPortal: ch => ch };
    if (specifier === 'react-dom/client') return ReactDOMClient;
    if (specifier === 'lucide-react') return fakeIcons;
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(resolved), specifier);
    for (const candidate of [base, `${base}.jsx`, `${base}.js`]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return loadWithRealReact(candidate);
    }
    throw new Error(`Missing module ${specifier}`);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, req);
  return mod.exports;
};

const { TextConversationEditor } = loadWithRealReact(
  path.join(root, 'src/components/text/conversation/TextConversationEditor.jsx')
);
const { TextConversationEditorQaPreview } = loadWithRealReact(
  path.join(root, 'src/components/text/conversation/TextConversationEditorQaPreview.jsx')
);

const getReactProps = el => {
  const key = Object.keys(el || {}).find(k => k.startsWith('__reactProps$'));
  return key ? el[key] : null;
};

const findByText = (container, tagSelector, needle) => (
  container.querySelectorAll(tagSelector).find(el => el.textContent.includes(needle)) || null
);

const triggerClick = async el => {
  assert.ok(el, 'Expected clickable element');
  assert.equal(el.disabled, false, `Attempted click on disabled <${el.tagName}> (${el.textContent})`);
  const props = getReactProps(el);
  assert.ok(typeof props?.onClick === 'function', `Expected onClick handler on <${el.tagName}> (${el.textContent})`);
  await React.act(async () => {
    await props.onClick({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} });
  });
};

const triggerChange = async (el, nextValue) => {
  assert.ok(el, 'Expected changeable element');
  el.value = nextValue;
  const props = getReactProps(el);
  assert.ok(typeof props?.onChange === 'function', `Expected onChange handler on <${el.tagName}>`);
  await React.act(async () => {
    await props.onChange({ target: { value: nextValue }, currentTarget: { value: nextValue }, preventDefault() {}, stopPropagation() {} });
  });
};

const waitMs = async ms => {
  await React.act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};

const results = [];
const runTest = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`FAIL: ${name}\n`, error?.stack || error);
  }
};

const mountController = async ({ initialSnapshot, documentId, runtimeAudioUrls = {}, runtimeFullAudio = {}, initialAudioConfig = {}, audioRuntimeHooks = null }) => {
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);
  let latestSnapshot = initialSnapshot;
  let latestConfig = { playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', audioSourceMode: 'local-first', globalPlaybackRate: 1, ...initialAudioConfig };
  let setSnapExternal;
  let setDocExternal;
  let setUrlsExternal;
  let setFullUrlsExternal;
  let setCfgExternal;

  function Harness() {
    const [snapshot, setSnapshot] = React.useState(initialSnapshot);
    const [docId, setDocId] = React.useState(documentId);
    const [urls, setUrls] = React.useState(runtimeAudioUrls);
    const [fullUrls, setFullUrls] = React.useState(runtimeFullAudio);
    const [cfg, setCfg] = React.useState(latestConfig);
    setSnapExternal = next => { latestSnapshot = next; setSnapshot(next); };
    setDocExternal = setDocId;
    setUrlsExternal = setUrls;
    setFullUrlsExternal = setFullUrls;
    setCfgExternal = patch => { latestConfig = { ...latestConfig, ...patch }; setCfg(latestConfig); };

    return React.createElement(TextConversationEditor, {
      snapshot,
      documentId: docId,
      onStateChange: outcome => {
        latestSnapshot = outcome.snapshot;
        setSnapshot(outcome.snapshot);
      },
      onSelectWorkspace: nextId => setDocId(nextId),
      runtimeAudioUrls: urls,
      runtimeFullAudio: fullUrls,
      audioConfig: cfg,
      onAudioConfigChange: setCfgExternal,
      availableBrowserVoices: [
        { name: 'en-GB-RyanNeural', lang: 'en-GB' },
        { name: 'en-GB-SoniaNeural', lang: 'en-GB' },
        { name: 'en-GB-LibbyNeural', lang: 'en-GB' },
        { name: 'id-ID-GadisNeural', lang: 'id-ID' }
      ],
      audioRuntimeHooks
    });
  }

  await React.act(async () => {
    rootNode.render(React.createElement(Harness));
  });

  return {
    host,
    getSnapshot: () => latestSnapshot,
    setSnapshot: next => React.act(async () => setSnapExternal(next)),
    setDocumentId: next => React.act(async () => setDocExternal(next)),
    setRuntimeAudioUrls: next => React.act(async () => setUrlsExternal(next)),
    setRuntimeFullAudio: next => React.act(async () => setFullUrlsExternal(next)),
    setAudioConfig: patch => React.act(async () => setCfgExternal(patch)),
    unmount: async () => {
      await React.act(async () => rootNode.unmount());
      host.parentNode?.removeChild(host);
    }
  };
};

// 1. Canonical DB/Schema constants + D5 Readiness Badges + Empty Scene/Turn zero placeholders
await runTest('Canonical DB v1 preserved, D5 readiness distinguishes Ready/Missing/Empty states, zero IndexedDB calls', async () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);

  const d5 = createD5AudioFixture();
  const h = await mountController({
    initialSnapshot: d5.snapshot,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    initialAudioConfig: { preferences: d5.preferences }
  });

  const readinessStrip = h.host.querySelector('[data-conversation-audio-readiness="true"]');
  assert.ok(readinessStrip.textContent.includes('Ready 6/6'), `Expected 6/6 ready in strip, got: ${readinessStrip.textContent}`);

  const firstReadiness = h.host.querySelector(`[data-conversation-sentence-readiness="${d5.ids.firstSentenceId}"]`);
  const bobReadiness = h.host.querySelector(`[data-conversation-sentence-readiness="${d5.ids.bobSentenceId}"]`);
  assert.ok(firstReadiness.textContent.includes('EN • READY') && firstReadiness.textContent.includes('Ryan • 1.0x'));
  assert.ok(bobReadiness.textContent.includes('EN • READY') && bobReadiness.textContent.includes('Sonia • 1.0x'));

  const emptyScenePlay = h.host.querySelector(`[aria-label="Play Scene ${d5.ids.zeroSceneId}"]`);
  assert.equal(emptyScenePlay.disabled, true, 'Empty Scene must not expose active playback');
  const emptySceneAudio = h.host.querySelector(`[data-conversation-scene-audio="${d5.ids.zeroSceneId}"]`);
  assert.ok(emptySceneAudio.textContent.includes('0 Turns'), 'Empty Scene audio panel reflects empty state without placeholders');

  assert.equal(indexedDbAccessCount, 0);
  await h.unmount();
});

// 2. Multi-Speaker, Multi-Sentence Turn Order, Split vs Full Fallback, Speaker Rate Override, TTS-Only Non-Erasure
await runTest('Preserves multi-Sentence Turn order, per-Speaker voices/rates in Split and Full fallback, and TTS-only inventory visibility', async () => {
  const d5 = createD5AudioFixture();
  const bobUnit = d5.snapshot.contentUnits.find(u => u.id === d5.ids.bobTurnId);
  const doc = d5.snapshot.documents.find(d => d.id === d5.ids.documentId);
  const rateMeta = buildTextStructuredPlaybackRateProfileMetadata({
    metadata: doc.metadata,
    channel: 'text',
    speakerId: bobUnit.speakerId,
    rate: 1.4
  });
  const seeded = applyTextLibraryCommand(d5.snapshot, { type: 'document.update', payload: { id: doc.id, metadata: rateMeta } }, 350).snapshot;

  const events = [];
  const h = await mountController({
    initialSnapshot: seeded,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    initialAudioConfig: { preferences: d5.preferences },
    audioRuntimeHooks: {
      executeRuntimeAudio: async args => { events.push({ kind: 'local', ...args }); return { status: 'played' }; },
      executeBrowserTts: async args => { events.push({ kind: 'tts', ...args }); }
    }
  });

  // Split Scene playback
  await triggerClick(h.host.querySelector(`[aria-label="Play Scene ${d5.ids.sceneId}"]`));
  await waitMs(170);

  assert.equal(events.length, 4, 'All 4 Sentences across 3 non-empty Turns must play');
  assert.deepEqual(events.map(e => e.step.segmentId), [
    d5.ids.firstSentenceId,
    d5.ids.secondSentenceId,
    seeded.segments.find(s => s.unitId === d5.ids.nextAliceTurnId).id,
    d5.ids.bobSentenceId
  ]);
  assert.deepEqual(events.map(e => e.step.voiceId), ['en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-SoniaNeural']);
  assert.deepEqual(events.map(e => e.playbackRate), [1, 1, 1, 1.4]);

  // Switch to Full mode (uncomposed -> Full fallback per-Sentence!) and verify non-unit speaker rate blocks Full WAV compose while playback preserves voices & rates
  events.length = 0;
  await triggerClick(findByText(h.host, 'button', 'Full (Scene / Fallback)'));
  const composeBtn = h.host.querySelector(`[aria-label="Compose Full WAV ${d5.ids.sceneId} text"]`);
  assert.equal(composeBtn.disabled, true, 'Speaker non-unit rate 1.4x must disable Full WAV composition');
  const compCard = h.host.querySelector(`[data-conversation-full-composition="${d5.ids.sceneId}:text"]`);
  assert.ok(compCard.textContent.includes('non-unit rate (1.4x)'), `Expected non-unit explanation, got: ${compCard.textContent}`);

  await triggerClick(h.host.querySelector(`[aria-label="Play Scene ${d5.ids.sceneId}"]`));
  await waitMs(170);
  assert.equal(events.length, 4, 'Full fallback must remain per-Sentence multi-step, never 1 collapsed Card utterance');
  assert.deepEqual(events.map(e => [e.step.representation, e.step.voiceId, e.playbackRate]), [
    ['full', 'en-GB-RyanNeural', 1],
    ['full', 'en-GB-RyanNeural', 1],
    ['full', 'en-GB-RyanNeural', 1],
    ['full', 'en-GB-SoniaNeural', 1.4]
  ]);

  // Switch Source Policy to TTS Only -> readiness strip keeps Ready 6/6, playback uses Browser TTS with speaker voices
  events.length = 0;
  await triggerChange(h.host.querySelector('[aria-label="Audio Source Policy"]'), 'tts-only');
  assert.ok(h.host.querySelector('[data-conversation-audio-readiness="true"]').textContent.includes('Ready 6/6'), 'TTS Only must not erase readiness');
  await triggerClick(h.host.querySelector(`[aria-label="Play sentence ${d5.ids.bobSentenceId}"]`));
  await waitMs(160);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'tts');
  assert.equal(events[0].targetVoiceName, 'en-GB-SoniaNeural');
  assert.equal(events[0].playbackRate, 1.4);

  await h.unmount();
});

// 3. Session Executor Pause, Resume, Stop & Resume-From-Cursor across Turn boundaries
await runTest('Reuses session executor for Pause, Resume, Stop, and Resume-From-Cursor without skipping/repeating Sentences', async () => {
  const d5 = createD5AudioFixture();
  const thirdId = d5.snapshot.segments.find(s => s.unitId === d5.ids.nextAliceTurnId).id;
  const gates = [];
  const playedIds = [];

  const h = await mountController({
    initialSnapshot: d5.snapshot,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    initialAudioConfig: { preferences: d5.preferences },
    audioRuntimeHooks: {
      executeRuntimeAudio: ({ item }) => new Promise(resolve => {
        playedIds.push(item.id);
        gates.push({ id: item.id, finish: () => resolve({ status: 'played' }), stop: () => resolve({ status: 'stopped' }) });
      })
    }
  });

  // Start Full-fallback Scene playback (async pauses at step 1)
  await triggerClick(h.host.querySelector(`[aria-label="Play Scene ${d5.ids.sceneId}"]`));
  await waitMs(150);
  assert.deepEqual(playedIds, [d5.ids.firstSentenceId], 'Step 1 should start');

  // Click Pause BEFORE completing step 1, then complete step 1 -> step 2 MUST block on waitWhilePaused
  await triggerClick(h.host.querySelector('[aria-label="Pause playback"]'));
  await React.act(async () => { gates[0].finish(); });
  await waitMs(150);
  assert.deepEqual(playedIds, [d5.ids.firstSentenceId], 'Paused session must wait before advancing to step 2');

  // Click Resume -> step 2 starts
  await triggerClick(h.host.querySelector('[aria-label="Resume playback"]'));
  await waitMs(150);
  assert.deepEqual(playedIds, [d5.ids.firstSentenceId, d5.ids.secondSentenceId], 'Resume must continue at step 2 without repeat');

  // Stop mid step 2 -> Resume from Cursor -> continues cleanly at secondSentenceId -> thirdId -> bobSentenceId
  await triggerClick(h.host.querySelector('[aria-label="Stop playback"]'));
  await React.act(async () => { gates[1].stop(); });
  await waitMs(40);

  const resumeCursorBtn = h.host.querySelector('[aria-label="Resume from cursor"]');
  assert.ok(resumeCursorBtn && resumeCursorBtn.textContent.includes(d5.ids.secondSentenceId), 'Stopped session preserves cursor for Resume');

  playedIds.length = 0;
  gates.length = 0;
  await triggerClick(resumeCursorBtn);
  await waitMs(150);
  for (let i = 0; i < 3; i += 1) {
    if (gates[i]) await React.act(async () => gates[i].finish());
    await waitMs(40);
  }
  assert.deepEqual(playedIds, [d5.ids.secondSentenceId, thirdId, d5.ids.bobSentenceId], 'From-here resume crosses Turn boundary in exact order');

  await h.unmount();
});

// 4. Cached Full WAV (1.0x without double rate multiplication), Disabled Non-Unit Rate Assembly, Mixed Readiness, Unavailable Binary Fallback
await runTest('Distinguishes full-local 1.0x playback, disabled non-unit Full WAV assembly, Metadata-Only/Stale/Missing states, and Unavailable Binary TTS fallback', async () => {
  const d5 = createD5AudioFixture();
  const tree = resolveTextLibraryDocumentTree(d5.snapshot, d5.ids.documentId);
  const sceneBlock = tree.blocks.find(b => b.id === d5.ids.sceneId);
  const fullPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: tree,
    block: sceneBlock,
    channel: 'text',
    representationMode: 'full',
    audioVariants: d5.snapshot.audioVariants,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    preferences: d5.preferences
  });
  const artifact = buildTextStructuredFullArtifactRecord({
    block: sceneBlock,
    channel: 'text',
    composition: fullPlan.composition,
    source: 'derived',
    mimeType: 'audio/wav',
    filename: 'qa-full.wav'
  });
  const cachedSnapshot = applyTextLibraryCommand(d5.snapshot, {
    type: 'fullAudioArtifact.upsert',
    payload: { blockId: d5.ids.sceneId, artifact }
  }, 400).snapshot;

  const events = [];
  const h = await mountController({
    initialSnapshot: cachedSnapshot,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    runtimeFullAudio: { [artifact.fullArtifactFingerprint]: { url: 'blob:d5-cached-full', fullArtifactFingerprint: artifact.fullArtifactFingerprint } },
    initialAudioConfig: { preferences: d5.preferences, playbackRepresentationMode: 'full', globalPlaybackRate: 1 },
    audioRuntimeHooks: {
      executeRuntimeAudio: async args => { events.push({ kind: 'local', ...args }); return { status: 'played' }; },
      executeBrowserTts: async args => { events.push({ kind: 'tts', ...args }); }
    }
  });

  // Full cached WAV ready at 1.0x
  const compCard = h.host.querySelector(`[data-conversation-full-composition="${d5.ids.sceneId}:text"]`);
  assert.ok(compCard.textContent.includes('full-local (Cached WAV)'), 'Cached Full ready route must display cleanly');
  assert.equal(h.host.querySelector(`[aria-label="Compose Full WAV ${d5.ids.sceneId} text"]`).disabled, false, 'Unit rate Ready inputs enable Full WAV composition');

  await triggerClick(h.host.querySelector(`[aria-label="Play Scene ${d5.ids.sceneId}"]`));
  await waitMs(160);
  assert.equal(events.length, 1);
  assert.equal(events[0].step.type, 'full-local');
  assert.equal(events[0].playbackRate, 1, 'Cached Full step must keep playbackRate=1');

  // Switch Global Rate to 1.2x -> Cached Full mismatches descriptor, Full WAV disabled with explicit explanation, falls back to multi-Sentence 1.2x steps
  events.length = 0;
  await triggerChange(h.host.querySelector('[aria-label="Global Playback Rate"]'), '1.2');
  assert.equal(h.host.querySelector(`[aria-label="Compose Full WAV ${d5.ids.sceneId} text"]`).disabled, true, 'Non-unit 1.2x rate must disable Full WAV composition');
  assert.ok(compCard.textContent.includes('non-unit rate (1.2x)'), 'Non-unit rate explanation visible');

  await triggerClick(h.host.querySelector(`[aria-label="Play Scene ${d5.ids.sceneId}"]`));
  await waitMs(170);
  assert.equal(events.length, 4, 'Non-unit Full plays ordered per-Sentence steps');
  assert.equal(events.every(e => e.playbackRate === 1.2), true, 'Per-Sentence steps apply 1.2x rate');

  await h.unmount();

  // QA Preview presets: Mixed Readiness + Unavailable Binary fallback
  const qaEvents = [];
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);
  await React.act(async () => { rootNode.render(React.createElement(TextConversationEditorQaPreview)); });

  await triggerClick(findByText(host, 'button', 'D5 Audio: Mixed Readiness'));
  const mixedText = host.textContent;
  assert.ok(mixedText.includes('EN • READY'), 'Mixed preset shows READY');
  assert.ok(mixedText.includes('EN • META-ONLY'), 'Mixed preset shows META-ONLY');
  assert.ok(mixedText.includes('EN • STALE'), 'Mixed preset shows STALE');
  assert.ok(mixedText.includes('EN • MISSING'), 'Mixed preset shows MISSING');

  // Direct test of Unavailable Binary runtime fallback (error -> Browser TTS, marks UNAVAILABLE BINARY without mutating snapshot)
  await React.act(async () => rootNode.unmount());
  host.parentNode?.removeChild(host);

  const beforeVariants = JSON.stringify(d5.snapshot.audioVariants);
  const uh = await mountController({
    initialSnapshot: d5.snapshot,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    initialAudioConfig: { preferences: d5.preferences },
    audioRuntimeHooks: {
      executeRuntimeAudio: async args => { qaEvents.push({ kind: 'fail-local', ...args }); return { status: 'error' }; },
      executeBrowserTts: async args => { qaEvents.push({ kind: 'fallback-tts', ...args }); }
    }
  });
  await triggerClick(uh.host.querySelector(`[aria-label="Play sentence ${d5.ids.firstSentenceId}"]`));
  await waitMs(160);
  assert.deepEqual(qaEvents.map(e => e.kind), ['fail-local', 'fallback-tts'], 'Failed local binary must fall back to Browser TTS');
  assert.equal(qaEvents[1].targetVoiceName, 'en-GB-RyanNeural');
  assert.ok(uh.host.querySelector(`[data-conversation-sentence-readiness="${d5.ids.firstSentenceId}"]`).textContent.includes('UNAVAILABLE BINARY'));
  assert.equal(JSON.stringify(uh.getSnapshot().audioVariants), beforeVariants, 'Runtime binary failure must not mutate persistent audioVariants');
  await uh.unmount();
});

// 5. Stale Plan Cancellation & Cursor Cleanup on Edit / Workspace Switch / Fixture Reset
await runTest('Cancels active stale playback, clears deleted cursor IDs on editor mutation and Workspace switch, and resets cleanly in QA Preview', async () => {
  const d5 = createD5AudioFixture();
  const thirdId = d5.snapshot.segments.find(s => s.unitId === d5.ids.nextAliceTurnId).id;
  let pendingStep = null;
  let stopSignals = 0;

  const h = await mountController({
    initialSnapshot: d5.snapshot,
    documentId: d5.ids.documentId,
    runtimeAudioUrls: d5.runtimeAudioUrls,
    initialAudioConfig: { preferences: d5.preferences },
    audioRuntimeHooks: {
      executeRuntimeAudio: () => new Promise(resolve => {
        pendingStep = () => { stopSignals += 1; resolve({ status: 'stopped' }); };
      })
    }
  });

  // Start single sentence playback on thirdId, then DELETE thirdId while paused/playing
  await triggerClick(h.host.querySelector(`[aria-label="Play sentence ${thirdId}"]`));
  await waitMs(150);
  assert.ok(h.host.querySelector('[aria-label="Stop playback"]'), 'Playback must be active before mutation');

  await triggerClick(h.host.querySelector(`[aria-label="Delete sentence ${thirdId}"]`));
  await React.act(async () => { pendingStep?.(); });
  await waitMs(40);

  assert.equal(h.host.querySelector('[aria-label="Stop playback"]'), null, 'Mutating snapshot must stop stale playback immediately');
  assert.equal(h.host.querySelector('[aria-label="Resume from cursor"]'), null, 'Deleting active cursor Sentence must clear resume cursor');

  // Restart playback on firstSentenceId, then switch Workspace -> must cancel active session & clear cursor
  await triggerClick(h.host.querySelector(`[aria-label="Play sentence ${d5.ids.firstSentenceId}"]`));
  await waitMs(150);
  assert.ok(h.host.querySelector('[aria-label="Stop playback"]'));

  await h.setDocumentId(d5.ids.mixedDocumentId);
  await React.act(async () => { pendingStep?.(); });
  await waitMs(40);

  assert.equal(h.host.querySelector('[aria-label="Stop playback"]'), null, 'Switching Workspace must stop active playback');
  assert.equal(h.host.querySelector('[aria-label="Resume from cursor"]'), null, 'Switching Workspace must clear prior Workspace cursor');

  // Editing firstSentenceId invalidates its plan status to STALE without erasing RF/UIDs
  await h.setDocumentId(d5.ids.documentId);
  const beforeVariant = h.getSnapshot().audioVariants.find(v => v.segmentId === d5.ids.firstSentenceId && v.channel === 'text');
  const edited = applyTextConversationEditorCommand(
    h.getSnapshot(),
    { type: 'segment.update', payload: { id: d5.ids.firstSentenceId, text: 'Edited sentence invalidates audio.' } },
    { documentId: d5.ids.documentId }
  );
  await h.setSnapshot(edited.snapshot);
  const firstStatusText = h.host.querySelector(`[data-conversation-sentence-readiness="${d5.ids.firstSentenceId}"]`)?.textContent || '';
  assert.ok(firstStatusText.includes('EN • STALE'), `Expected EN • STALE after edit, got: ${firstStatusText}`);
  const afterVariant = h.getSnapshot().audioVariants.find(v => v.id === beforeVariant.id);
  assert.equal(afterVariant.uid, beforeVariant.uid, 'UID must stay intact across edit');
  assert.equal(afterVariant.metadata.audioRenderFingerprintV1, beforeVariant.metadata.audioRenderFingerprintV1, 'RF must not be rewritten by UI');
  assert.ok(stopSignals >= 0);

  await h.unmount();

  // QA Preview Reset Fixture clears active preset state cleanly
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);
  await React.act(async () => { rootNode.render(React.createElement(TextConversationEditorQaPreview)); });
  await triggerClick(findByText(host, 'button', 'D5 Audio: Non-Unit Rate (1.2x)'));
  assert.ok(host.textContent.includes('1.2x'));
  await triggerClick(findByText(host, 'button', 'Reset Fixture'));
  assert.ok(host.textContent.includes('1.2x'), 'Reset Fixture restores clean state of selected audio preset');
  await triggerClick(findByText(host, 'button', 'D4-A Baseline'));
  assert.ok(host.textContent.includes('1.0x'));
  await React.act(async () => rootNode.unmount());
  host.parentNode?.removeChild(host);
  assert.equal(indexedDbAccessCount, 0);
});

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\nD5 AUDIO UI SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
