import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const React = require('react');
const ReactDOMClient = require('react-dom/client');

import { initialEdgeVoices } from '../src/constants/voiceConstants.js';

let passed = 0;
const run = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS: ${name}`);
};

const matchesSimpleSelector = (el, sel) => {
  const attrMatch = /^([a-zA-Z*][a-zA-Z0-9-]*)?\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (attrMatch) {
    const [, tag, attr, expected] = attrMatch;
    if (tag && tag !== '*' && el.tagName !== tag.toUpperCase()) return false;
    if (!el.hasAttribute(attr)) return false;
    return expected === undefined ? true : el.getAttribute(attr) === expected;
  }
  return el.tagName === sel.toUpperCase();
};

const matchesSelector = (el, selector) => {
  const tokens = selector.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  const matchAt = (node, idx) => {
    if (!node || node.nodeType !== 1) return false;
    if (tokens[idx] === '>') return matchAt(node, idx - 1);
    if (!matchesSimpleSelector(node, tokens[idx])) return false;
    if (idx === 0) return true;
    if (tokens[idx - 1] === '>') return matchAt(node.parentNode, idx - 2);
    let cur = node.parentNode;
    while (cur && cur.nodeType === 1) {
      if (matchAt(cur, idx - 1)) return true;
      cur = cur.parentNode;
    }
    return false;
  };
  return matchAt(el, tokens.length - 1);
};

const installMinimalDom = () => {
  const noop = () => {};
  const makeStyle = () => ({
    setProperty: noop,
    removeProperty: noop,
    getPropertyValue: () => ''
  });

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
      this.style = makeStyle();
      this.attributes = new Map();
      this.checked = false;
      this.disabled = false;
      this.selected = false;
      this.defaultSelected = false;
    }
    get value() {
      if (this._value !== undefined) return this._value;
      return this.attributes.get('value') ?? '';
    }
    set value(v) { this._value = String(v ?? ''); }
    get className() { return this.attributes.get('class') || ''; }
    set className(v) { this.attributes.set('class', String(v ?? '')); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    removeAttribute(k) { this.attributes.delete(k); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    hasAttribute(k) { return this.attributes.has(k); }
    getBoundingClientRect() { return { top: 0, bottom: 700, left: 0, right: 1200, width: 1200, height: 700 }; }
    focus() {}
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
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
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
  class FakeIFrame extends FakeElement {}

  const fakeDoc = {
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
      if (upper === 'IFRAME') return new FakeIFrame('iframe');
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
  globalThis.HTMLIFrameElement = FakeIFrame;
  globalThis.Node = FakeNode;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.getComputedStyle = () => makeStyle();
  globalThis.visualViewport = {
    height: 900,
    width: 1440,
    offsetTop: 0,
    addEventListener: noop,
    removeEventListener: noop
  };
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

const { TextStructuredCardAudioPanel } = loadWithRealReact(
  path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx')
);

const getReactProps = el => {
  const key = Object.keys(el || {}).find(k => k.startsWith('__reactProps$'));
  return key ? el[key] : null;
};

const triggerClick = async el => {
  assert.ok(el, 'Expected clickable element');
  const props = getReactProps(el);
  assert.ok(typeof props?.onClick === 'function', `Expected onClick handler on <${el.tagName}>`);
  await React.act(async () => {
    props.onClick({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} });
  });
};

const triggerChange = async (el, nextValue) => {
  assert.ok(el, 'Expected changeable element');
  el.value = nextValue;
  const props = getReactProps(el);
  assert.ok(typeof props?.onChange === 'function', `Expected onChange handler on <${el.tagName}>`);
  await React.act(async () => {
    props.onChange({ target: { value: nextValue }, currentTarget: { value: nextValue }, preventDefault() {}, stopPropagation() {} });
  });
};

const englishVoices = [
  { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' }
];
const indonesianVoices = [
  { name: 'Google Bahasa Indonesia', lang: 'id-ID' },
  { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }
];

const buildFixtureState = () => {
  const seg1 = {
    id: 'seg-p1-1',
    text: 'First paragraph sentence.',
    meaning: 'Kalimat paragraf pertama.',
    metadata: { audioVoiceOverrideV1: { text: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', meaning: null } }
  };
  const seg2 = {
    id: 'seg-p1-2',
    text: 'Second paragraph sentence.',
    meaning: 'Kalimat paragraf kedua.',
    metadata: {}
  };
  const blockPara1 = {
    id: 'block-para-1',
    blockType: 'paragraph',
    title: 'Paragraph Alpha',
    segments: [seg1, seg2],
    metadata: { audioVoiceOverrideV1: { channels: { text: null, meaning: null }, speakers: { text: {}, meaning: {} }, speakerIds: { text: {}, meaning: {} } } }
  };
  const blockPara2 = {
    id: 'block-para-2',
    blockType: 'paragraph',
    title: 'Paragraph Beta',
    segments: [{ id: 'seg-p2-1', text: 'Next card line.', meaning: 'Baris kartu berikut.', metadata: {} }],
    metadata: {}
  };
  const blockConv = {
    id: 'block-conv-1',
    blockType: 'conversation',
    title: 'Cafe Dialogue',
    segments: [
      { id: 'seg-c1', speaker: 'Alya', text: 'Hi Ben!', meaning: 'Hai Ben!', metadata: { speakerIdentityV1: 'spk_alya' } },
      { id: 'seg-c2', speaker: 'Ben', text: 'Hello Alya!', meaning: 'Halo Alya!', metadata: { speakerIdentityV1: 'spk_ben' } }
    ],
    metadata: {}
  };
  return {
    blockPara1,
    blockPara2,
    blockConv,
    documentTree: {
      id: 'doc-1',
      title: 'Lesson Doc',
      metadata: {},
      blocks: [blockPara1, blockPara2, blockConv]
    }
  };
};

await run('1. Initial mount executes 1 commit (no double-mount effect reset) for both Paragraph and Conversation cards', async () => {
  const { blockPara1, blockConv, documentTree } = buildFixtureState();
  for (const [label, block] of [['paragraph', blockPara1], ['conversation', blockConv]]) {
    const container = fakeDoc.createElement('div');
    const reactRoot = ReactDOMClient.createRoot(container);
    const profilerEvents = [];
    await React.act(async () => {
      reactRoot.render(React.createElement(
        React.Profiler,
        { id: `Mount-${label}`, onRender: (id, phase, actualDuration) => profilerEvents.push({ id, phase, actualDuration }) },
        React.createElement(TextStructuredCardAudioPanel, {
          documentTree,
          block,
          englishVoices,
          indonesianVoices,
          defaultTextVoiceName: englishVoices[0].name,
          defaultMeaningVoiceName: indonesianVoices[0].name,
          edgeGenerationVoices: initialEdgeVoices.slice(0, 10),
          onClose: () => {}
        })
      ));
    });
    assert.equal(profilerEvents.length, 1, `Expected single mount commit for ${label} panel, got ${profilerEvents.length}`);
    assert.equal(profilerEvents[0].phase, 'mount');
    await React.act(async () => { reactRoot.unmount(); });
  }
});

await run('2. Unsaved Card/Segment Player draft survives unrelated parent object churn & Download tab edits while keeping sticky header min-h-6', async () => {
  const fixture = buildFixtureState();
  const container = fakeDoc.createElement('div');
  const reactRoot = ReactDOMClient.createRoot(container);
  const profilerEvents = [];
  let setExternalProps = null;

  const Harness = () => {
    const [propsState, setPropsState] = React.useState({
      documentTree: fixture.documentTree,
      block: fixture.blockPara1,
      audioCoverageMap: { 'seg-p1-1::text': { status: 'missing' } },
      runtimeFullAudio: {},
      generationPreferences: { edgeEnVoiceId: 'en-GB-LibbyNeural', edgeIdVoiceId: 'id-ID-GadisNeural' }
    });
    setExternalProps = setPropsState;
    return React.createElement(
      React.Profiler,
      { id: 'DraftPreservation', onRender: (id, phase, actualDuration) => profilerEvents.push({ id, phase, actualDuration }) },
      React.createElement(TextStructuredCardAudioPanel, {
        documentTree: propsState.documentTree,
        block: propsState.block,
        englishVoices,
        indonesianVoices,
        defaultTextVoiceName: englishVoices[0].name,
        defaultMeaningVoiceName: indonesianVoices[0].name,
        edgeGenerationVoices: initialEdgeVoices.slice(0, 10),
        audioCoverageMap: propsState.audioCoverageMap,
        runtimeFullAudio: propsState.runtimeFullAudio,
        generationPreferences: propsState.generationPreferences,
        cardCoverage: { ready: 0, total: 4 },
        onClose: () => {}
      })
    );
  };

  await React.act(async () => {
    reactRoot.render(React.createElement(Harness));
  });
  assert.equal(profilerEvents.length, 1);

  // Dirty badge absent before editing
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null);

  // Edit Card Player EN voice + Segment #2 ID voice
  const cardEnSelect = container.querySelector('[data-text-voice-override-select="block-para-1:text"]');
  const seg2IdSelect = container.querySelector('[data-text-voice-override-select="seg-p1-2:meaning"]');
  await triggerChange(cardEnSelect, englishVoices[2].name);
  await triggerChange(seg2IdSelect, indonesianVoices[1].name);

  const badge = container.querySelector('[data-text-card-player-dirty-badge="true"]');
  assert.ok(badge, 'Unsaved Draft badge must appear after editing Player draft');
  assert.ok(badge.parentNode.className.includes('min-h-6'), 'Sticky header badge row keeps min-h-6 to avoid wrap shift');
  assert.ok(badge.parentNode.className.includes('flex-nowrap'), 'Sticky header badge row keeps flex-nowrap');

  // Switch to Download tab and back, then simulate coverage/runtime/cloned block identity churn
  const downloadTab = container.querySelector('[data-text-card-audio-tab="download"]');
  const playerTab = container.querySelector('[data-text-card-audio-tab="player"]');
  await triggerClick(downloadTab);
  await triggerClick(playerTab);

  profilerEvents.length = 0;
  await React.act(async () => {
    setExternalProps(prev => ({
      ...prev,
      documentTree: { ...prev.documentTree, blocks: prev.documentTree.blocks.map(b => ({ ...b })) },
      block: {
        ...prev.block,
        metadata: {
          ...prev.block.metadata,
          audioDownloadProfileV1: { mode: 'custom', channels: { text: 'en-US-GuyNeural', meaning: null } }
        },
        segments: prev.block.segments.map(s => ({ ...s, metadata: { ...s.metadata } }))
      },
      audioCoverageMap: { 'seg-p1-1::text': { status: 'ready' } },
      runtimeFullAudio: { 'block-para-1': { text: { status: 'ready' } } },
      generationPreferences: { ...prev.generationPreferences }
    }));
  });

  // Single update commit (not a double commit from useEffect clobbering playerDraft!)
  assert.equal(profilerEvents.length, 1, `Expected 1 commit on non-player prop churn, got ${profilerEvents.length}`);
  assert.ok(container.querySelector('[data-text-card-player-dirty-badge="true"]'), 'Unsaved Draft badge must survive prop identity churn');
  assert.equal(
    container.querySelector('[data-text-voice-override-select="block-para-1:text"]')?.value,
    englishVoices[2].name,
    'Card draft EN voice must remain edited after prop identity churn'
  );
  assert.equal(
    container.querySelector('[data-text-voice-override-select="seg-p1-2:meaning"]')?.value,
    indonesianVoices[1].name,
    'Segment #2 draft ID voice must remain edited after prop identity churn'
  );

  // Clicking "Reset Changes" discards unsaved draft without touching saved props
  const resetDraftBtn = container.querySelector('[data-text-card-player-reset="true"]');
  await triggerClick(resetDraftBtn);
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null, 'Discard Changes clears Unsaved Draft badge');
  assert.equal(container.querySelector('[data-text-voice-override-select="block-para-1:text"]')?.value, '');
  assert.equal(container.querySelector('[data-text-voice-override-select="seg-p1-2:meaning"]')?.value, '');

  await React.act(async () => { reactRoot.unmount(); });
});

await run('3. Conversation speaker draft edit, Apply reconciliation, Block ID switch, Card Reset & Segment Reset work cleanly', async () => {
  const fixture = buildFixtureState();
  const container = fakeDoc.createElement('div');
  const reactRoot = ReactDOMClient.createRoot(container);
  let setHostState = null;
  const appliedCalls = [];
  const cardResetCalls = [];
  const segResetCalls = [];

  const Harness = () => {
    const [state, setState] = React.useState({
      documentTree: fixture.documentTree,
      block: fixture.blockConv
    });
    setHostState = setState;
    return React.createElement(TextStructuredCardAudioPanel, {
      documentTree: state.documentTree,
      block: state.block,
      englishVoices,
      indonesianVoices,
      defaultTextVoiceName: englishVoices[0].name,
      defaultMeaningVoiceName: indonesianVoices[0].name,
      edgeGenerationVoices: initialEdgeVoices.slice(0, 10),
      onClose: () => {},
      onApplyCardPlayerChanges: (blockId, payload) => {
        appliedCalls.push({ blockId, payload });
        setState(prev => ({
          ...prev,
          block: {
            ...prev.block,
            metadata: {
              ...prev.block.metadata,
              audioVoiceOverrideV1: {
                channels: { ...payload.cardChannels },
                speakers: { text: { ...payload.speakers.text }, meaning: { ...payload.speakers.meaning } },
                speakerIds: { text: { ...payload.speakerIds.text }, meaning: { ...payload.speakerIds.meaning } }
              }
            }
          }
        }));
      },
      onResetCardAudioPreferences: blockId => {
        cardResetCalls.push(blockId);
        setState(prev => ({
          ...prev,
          block: {
            ...prev.block,
            metadata: {},
            segments: prev.block.segments.map(seg => ({ ...seg, metadata: seg.metadata?.speakerIdentityV1 ? { speakerIdentityV1: seg.metadata.speakerIdentityV1 } : {} }))
          }
        }));
      },
      onResetSegmentAudioPreferences: segId => {
        segResetCalls.push(segId);
        setState(prev => ({
          ...prev,
          block: {
            ...prev.block,
            segments: prev.block.segments.map(seg => (seg.id === segId ? { ...seg, metadata: seg.metadata?.speakerIdentityV1 ? { speakerIdentityV1: seg.metadata.speakerIdentityV1 } : {} } : seg))
          }
        }));
      }
    });
  };

  await React.act(async () => {
    reactRoot.render(React.createElement(Harness));
  });

  // Expand speaker spk_alya and edit its EN voice
  const alyaBtn = container.querySelector('[data-text-mobile-speaker-card="spk_alya"] button');
  await triggerClick(alyaBtn);
  const alyaEnSelect = container.querySelector('[data-text-voice-override-select="block-conv-1:spk_alya:text"]');
  await triggerChange(alyaEnSelect, englishVoices[2].name);
  assert.ok(container.querySelector('[data-text-card-player-dirty-badge="true"]'), 'Conversation speaker edit triggers Unsaved Draft');

  // Apply Changes reconciles saved state -> dirty clears and saved value sticks
  const applyBtn = container.querySelector('[data-text-card-player-apply="true"]');
  await triggerClick(applyBtn);
  assert.equal(appliedCalls.length, 1);
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null, 'Apply clears Unsaved Draft');
  assert.equal(
    container.querySelector('[data-text-voice-override-select="block-conv-1:spk_alya:text"]')?.value,
    englishVoices[2].name,
    'Saved speaker voice remains selected after Apply'
  );

  // Edit Alya again -> Card Reset confirmation clears both draft & saved override
  await triggerChange(container.querySelector('[data-text-voice-override-select="block-conv-1:spk_alya:text"]'), englishVoices[1].name);
  assert.ok(container.querySelector('[data-text-card-player-dirty-badge="true"]'));
  await triggerClick(container.querySelector('[data-text-reset-card-audio="true"]'));
  const confirmResetBtn = container
    .querySelectorAll('div[role="dialog"] button')
    .filter(btn => !btn.hasAttribute('data-text-card-player-reset') && !btn.hasAttribute('data-text-reset-segment-audio') && btn.textContent.trim() === 'Reset')
    .at(-1);
  assert.ok(confirmResetBtn, 'Card Reset SafetyConfirmDialog Reset button must render');
  await triggerClick(confirmResetBtn);
  assert.deepEqual(cardResetCalls, ['block-conv-1']);
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null);
  assert.equal(container.querySelector('[data-text-voice-override-select="block-conv-1:spk_alya:text"]')?.value, '');

  // Switch to Paragraph block #1 -> dirty draft on para1 -> switch to para2 clears old card draft
  await React.act(async () => {
    setHostState({ documentTree: fixture.documentTree, block: fixture.blockPara1 });
  });
  await triggerChange(container.querySelector('[data-text-voice-override-select="block-para-1:text"]'), englishVoices[2].name);
  assert.ok(container.querySelector('[data-text-card-player-dirty-badge="true"]'));
  await React.act(async () => {
    setHostState({ documentTree: fixture.documentTree, block: fixture.blockPara2 });
  });
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null, 'Switching block.id initializes clean baseline for new card');

  // Switch back to para1, edit seg-p1-1 unsaved draft, go to Download -> Segment overrides -> Reset Segment #1
  await React.act(async () => {
    setHostState({ documentTree: fixture.documentTree, block: fixture.blockPara1 });
  });
  await triggerChange(container.querySelector('[data-text-voice-override-select="seg-p1-1:text"]'), englishVoices[2].name);
  assert.ok(container.querySelector('[data-text-card-player-dirty-badge="true"]'));
  await triggerClick(container.querySelector('[data-text-card-audio-tab="download"]'));
  const segAccordionBtn = container.querySelector('div[data-text-segment-voice-overrides="true"] > button');
  await triggerClick(segAccordionBtn);
  await triggerClick(container.querySelector('[data-text-reset-segment-audio="seg-p1-1"]'));
  const segConfirmBtn = container
    .querySelectorAll('div[role="dialog"] button')
    .filter(btn => !btn.hasAttribute('data-text-card-player-reset') && !btn.hasAttribute('data-text-reset-segment-audio') && btn.textContent.trim() === 'Reset')
    .at(-1);
  assert.ok(segConfirmBtn, 'Segment Reset confirmation button must render');
  await triggerClick(segConfirmBtn);
  assert.deepEqual(segResetCalls, ['seg-p1-1']);
  await triggerClick(container.querySelector('[data-text-card-audio-tab="player"]'));
  assert.equal(
    container.querySelector('[data-text-voice-override-select="seg-p1-1:text"]')?.value,
    '',
    'Segment Reset clears both saved and draft override for seg-p1-1'
  );
  assert.equal(container.querySelector('[data-text-card-player-dirty-badge="true"]'), null);

  await React.act(async () => { reactRoot.unmount(); });
});

console.log(`\nP3 CARD DRAFT SUMMARY: ${passed} PASS, 0 FAIL`);
