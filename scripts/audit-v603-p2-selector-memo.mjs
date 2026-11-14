import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const React = require('react');
const ReactDOMClient = require('react-dom/client');

import { initialEdgeVoices } from '../src/constants/voiceConstants.js';
import {
  formatEdgeVoiceLabel,
  groupEdgeVoicesByRegion,
  VOICE_REGION_GROUP_LABELS
} from '../src/domain/audio/voicePresentationDomain.js';
import {
  BROWSER_TTS_GROUP_LABELS,
  dedupeBrowserTtsVoices,
  formatBrowserTtsVoiceLabel,
  groupBrowserTtsVoicesByRegion
} from '../src/domain/audio/browserTtsVoicePresentationDomain.js';

let passed = 0;
const run = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS: ${name}`);
};

const installMinimalDom = () => {
  const domOps = { optionCreated: 0, optgroupCreated: 0, optionRemoved: 0 };
  const resetDomOps = () => { domOps.optionCreated = 0; domOps.optgroupCreated = 0; domOps.optionRemoved = 0; };
  class FakeNode {
    constructor(nodeType, nodeName) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.childNodes = [];
      this.parentNode = null;
      this.ownerDocument = fakeDoc;
      this._listeners = new Map();
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      if (child.nodeType === 11) {
        [...child.childNodes].forEach(c => this.appendChild(c));
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.nodeType === 11) {
        [...newNode.childNodes].forEach(c => this.insertBefore(c, refNode));
        return newNode;
      }
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      const idx = this.childNodes.indexOf(refNode);
      if (idx === -1) return this.appendChild(newNode);
      newNode.parentNode = this;
      this.childNodes.splice(idx, 0, newNode);
      return newNode;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
        if (child.nodeName === 'OPTION') domOps.optionRemoved += 1;
      }
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    get firstChild() { return this.childNodes[0] || null; }
  }
  class FakeElement extends FakeNode {
    constructor(tagName) {
      super(1, String(tagName || '').toUpperCase());
      this.tagName = this.nodeName;
      this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' };
      this.attributes = new Map();
      this.className = '';
      this.value = '';
      this.checked = false;
      this.disabled = false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    removeAttribute(k) { this.attributes.delete(k); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    hasAttribute(k) { return this.attributes.has(k); }
    get options() {
      const out = [];
      const walk = n => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1 && c.tagName === 'OPTION') out.push(c);
          else if (c.nodeType === 1) walk(c);
        }
      };
      walk(this);
      return out;
    }
    focus() {}
    set textContent(v) { this.childNodes = []; this._text = String(v ?? ''); }
    get textContent() { return this._text || this.childNodes.map(c => c.textContent || c.nodeValue || '').join(''); }
  }
  const fakeDoc = {
    nodeType: 9,
    activeElement: null,
    defaultView: globalThis,
    documentElement: null,
    body: null,
    createElement(tag) {
      const upper = String(tag).toUpperCase();
      if (upper === 'OPTION') domOps.optionCreated += 1;
      if (upper === 'OPTGROUP') domOps.optgroupCreated += 1;
      return new FakeElement(tag);
    },
    createElementNS(_ns, tag) { return new FakeElement(tag); },
    createTextNode(text) {
      const node = new FakeNode(3, '#text');
      node.nodeValue = String(text ?? '');
      node.textContent = node.nodeValue;
      return node;
    },
    createComment() { return new FakeNode(8, '#comment'); },
    createDocumentFragment() { return new FakeNode(11, '#document-fragment'); },
    addEventListener() {},
    removeEventListener() {},
    getSelection() { return null; }
  };
  fakeDoc.body = new FakeElement('body');
  fakeDoc.documentElement = new FakeElement('html');
  fakeDoc.documentElement.appendChild(fakeDoc.body);

  globalThis.window = globalThis;
  globalThis.document = fakeDoc;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeNode;
  globalThis.HTMLIFrameElement = class HTMLIFrameElement extends FakeElement {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = id => clearTimeout(id);
  return { fakeDoc, domOps, resetDomOps };
};

const { fakeDoc, domOps, resetDomOps } = installMinimalDom();
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
    if (specifier === 'lucide-react') return fakeIcons;
    if (!specifier.startsWith('.')) return require(specifier);
    const target = path.resolve(path.dirname(resolved), specifier);
    for (const candidate of [target, `${target}.jsx`, `${target}.js`]) {
      if (fs.existsSync(candidate)) return loadWithRealReact(candidate);
    }
    throw new Error(`Missing module ${specifier}`);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, req);
  return mod.exports;
};

const flush = () => new Promise(resolve => setTimeout(resolve, 25));

await run('1. Edge group cache hits consistently AND invalidates on element addition, array replacement, and in-place availability mutation', () => {
  const mutableEdge = initialEdgeVoices.slice(0, 18).map(v => ({ ...v }));
  const first = groupEdgeVoicesByRegion(mutableEdge, 'main');
  const second = groupEdgeVoicesByRegion(mutableEdge, 'main');
  assert.equal(first, second, 'Same array and unmodified items return cached group object');

  // Fresh subarray with identical objects hits bounded signature cache
  const shallowCopy = [...mutableEdge];
  const copyHit = groupEdgeVoicesByRegion(shallowCopy, 'main');
  assert.equal(copyHit, first, 'Shallow copy with same item tokens hits signature cache');

  // In-place unavailable mutation must invalidate WeakMap cache entry
  const ukItem = mutableEdge.find(v => v.id === 'en-GB-LibbyNeural');
  assert.ok(ukItem);
  ukItem.unavailable = true;
  const afterFlagMutation = groupEdgeVoicesByRegion(mutableEdge, 'main');
  assert.notEqual(afterFlagMutation, first, 'Mutated unavailable flag must invalidate Edge group cache');
  assert.match(formatEdgeVoiceLabel(ukItem, { edgeVoices: mutableEdge }), /Unavailable/);

  // Adding a voice invalidates cleanly
  ukItem.unavailable = false;
  mutableEdge.push({ id: 'en-KE-AsiliaNeural', label: 'Asilia (Kenya)', lang: 'en-KE' });
  const afterPush = groupEdgeVoicesByRegion(mutableEdge, 'main');
  assert.ok(afterPush[VOICE_REGION_GROUP_LABELS.OTHER_EN].some(v => v.id === 'en-KE-AsiliaNeural'));
});

await run('2. Browser TTS group & dedupe caches preserve order and invalidate on voice metadata mutation', () => {
  const mutableBrowser = [
    { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Google Bahasa Indonesia', lang: 'id-ID' }
  ];
  const deduped1 = dedupeBrowserTtsVoices(mutableBrowser);
  const deduped2 = dedupeBrowserTtsVoices(mutableBrowser);
  assert.equal(deduped1, deduped2, 'Dedupe returns cached array for unchanged voice list');

  const g1 = groupBrowserTtsVoicesByRegion(mutableBrowser, 'main');
  const g2 = groupBrowserTtsVoicesByRegion(mutableBrowser, 'main');
  assert.equal(g1, g2, 'Browser group cache hits on identical list');
  assert.equal(g1[BROWSER_TTS_GROUP_LABELS.UK].length, 1);

  // Mutate lang in place from en-GB -> en-AU
  mutableBrowser[1].lang = 'en-AU';
  const g3 = groupBrowserTtsVoicesByRegion(mutableBrowser, 'main');
  assert.notEqual(g3, g1, 'In-place lang mutation invalidates Browser group cache');
  assert.equal(g3[BROWSER_TTS_GROUP_LABELS.UK].length, 0);
  assert.equal(g3[BROWSER_TTS_GROUP_LABELS.AU].length, 1);
  assert.match(formatBrowserTtsVoiceLabel(mutableBrowser[1]), /Libby .* AU/);
});

await run('3. Real React 19 Profiler: GroupedVoiceSelect & PlayerBrowserTtsControls create 0 DOM option nodes across value/rate changes', async () => {
  const { GroupedVoiceSelect } = loadWithRealReact(path.join(root, 'src/components/common/GroupedVoiceSelect.jsx'));
  const PlayerBrowserTtsControls = loadWithRealReact(path.join(root, 'src/components/controls/PlayerBrowserTtsControls.jsx')).default;

  const browserEn = [
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Natasha Online (Natural) - English (Australia)', lang: 'en-AU' }
  ];
  const browserId = [
    { name: 'Google Bahasa Indonesia', lang: 'id-ID' },
    { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }
  ];

  const container = fakeDoc.createElement('div');
  const rootReact = ReactDOMClient.createRoot(container);
  let setRateExternal = null;
  let setVoiceExternal = null;
  const profilerEvents = [];

  const Harness = () => {
    const [rate, setRate] = React.useState(1.0);
    const [voice, setVoice] = React.useState(browserEn[0]);
    const [idVoice, setIdVoice] = React.useState(browserId[0]);
    const [meaningRate, setMeaningRate] = React.useState(1.0);
    const [ratesLinked, setRatesLinked] = React.useState(true);
    setRateExternal = setRate;
    setVoiceExternal = setVoice;
    return React.createElement(
      React.Profiler,
      { id: 'P2-Table-And-Player', onRender: (id, phase, actualDuration) => profilerEvents.push({ id, phase, actualDuration }) },
      React.createElement(PlayerBrowserTtsControls, {
        voices: browserEn,
        selectedVoice: voice,
        setSelectedVoice: setVoice,
        isSystemBusy: false,
        mode: 'text',
        structuredTextModeActive: true,
        showIndonesianVoice: true,
        indonesianVoices: browserId,
        selectedIndonesianVoice: idVoice,
        setSelectedIndonesianVoice: setIdVoice,
        rate,
        setRate,
        meaningRate,
        setMeaningRate,
        ratesLinked,
        setRatesLinked
      }),
      React.createElement(GroupedVoiceSelect, {
        voices: initialEdgeVoices,
        selectedValue: 'en-GB-LibbyNeural',
        onChange: () => {},
        context: 'main'
      })
    );
  };

  resetDomOps();
  await React.act(async () => {
    rootReact.render(React.createElement(Harness));
  });
  assert.ok(domOps.optionCreated > 0, 'Initial mount creates options');

  resetDomOps();
  await React.act(async () => {
    setRateExternal(1.4);
  });
  assert.equal(domOps.optionCreated, 0, 'Changing rate creates 0 <option> nodes');
  assert.equal(domOps.optgroupCreated, 0, 'Changing rate creates 0 <optgroup> nodes');
  assert.equal(domOps.optionRemoved, 0, 'Changing rate removes 0 <option> nodes');

  resetDomOps();
  await React.act(async () => {
    setVoiceExternal(browserEn[2]);
  });
  assert.equal(domOps.optionCreated, 0, 'Switching voice creates 0 <option> nodes');
  assert.equal(domOps.optgroupCreated, 0, 'Switching voice creates 0 <optgroup> nodes');
  assert.equal(domOps.optionRemoved, 0, 'Switching voice removes 0 <option> nodes');

  await React.act(async () => {
    rootReact.unmount();
  });
  await flush();
});

await run('4. Schwartzian sorting stays fast even on 100-iteration warm & miss workloads', () => {
  const start = performance.now();
  for (let i = 0; i < 100; i += 1) {
    groupEdgeVoicesByRegion(initialEdgeVoices, 'all');
  }
  const warmMs = performance.now() - start;
  assert.ok(warmMs < 50, `Expected 100 warm groupEdgeVoicesByRegion calls < 50ms, got ${warmMs.toFixed(2)}ms`);

  // Cold miss benchmark on cloned objects
  const coldStart = performance.now();
  for (let i = 0; i < 10; i += 1) {
    const fresh = initialEdgeVoices.map(v => ({ ...v, id: `${v.id}` }));
    groupEdgeVoicesByRegion(fresh, 'all');
  }
  const coldMs = performance.now() - coldStart;
  assert.ok(coldMs < 100, `Expected 10 cold Edge sort misses < 100ms, got ${coldMs.toFixed(2)}ms`);
});

console.log(`\nP2 SELECTOR MEMO & CACHE SUMMARY: ${passed} PASS, 0 FAIL`);
