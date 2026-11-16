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
import {
  applyTextConversationEditorCommand,
  selectTextConversationEditorState
} from '../src/domain/text/textConversationEditorDomain.js';
import { createD4aConversationFixture } from './fixtures/d4a/conversation-editor-fixture.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let indexedDbAccessCount = 0;
globalThis.indexedDB = new Proxy({}, {
  get(_target, prop) {
    indexedDbAccessCount += 1;
    throw new Error(`D4-B UI audit forbidden IndexedDB access: ${String(prop)}`);
  }
});

let confirmCalls = 0;
globalThis.confirm = () => {
  confirmCalls += 1;
  return true;
};

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
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
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
      if (newNode.parentNode && typeof newNode.parentNode.removeChild === 'function') {
        newNode.parentNode.removeChild(newNode);
      }
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
      this.selectionStart = 0;
      this.selectionEnd = 0;
    }
    get value() {
      if (this._value !== undefined) return this._value;
      return this.attributes.get('value') ?? '';
    }
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

const findByText = (container, tagSelector, needle) => {
  const items = container.querySelectorAll(tagSelector);
  return items.find(el => el.textContent.includes(needle)) || null;
};

const triggerClick = async el => {
  assert.ok(el, 'Expected clickable element');
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

const triggerCheckbox = async (el, checked) => {
  assert.ok(el, 'Expected checkbox element');
  el.checked = Boolean(checked);
  const props = getReactProps(el);
  assert.ok(typeof props?.onChange === 'function', 'Expected checkbox onChange handler');
  await React.act(async () => {
    await props.onChange({
      target: { checked: Boolean(checked), value: el.value },
      currentTarget: { checked: Boolean(checked), value: el.value },
      preventDefault() {},
      stopPropagation() {}
    });
  });
};

const triggerSelectCursor = async (el, offset) => {
  assert.ok(el, 'Expected selectable textarea element');
  el.selectionStart = offset;
  el.selectionEnd = offset;
  const props = getReactProps(el);
  assert.ok(typeof props?.onSelect === 'function', 'Expected onSelect handler');
  await React.act(async () => {
    props.onSelect({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} });
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

// 1. Canonical DB / Schema safety
await runTest('Canonical DB constants remain v1 and QA UI never touches IndexedDB', async () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(indexedDbAccessCount, 0);
});

// 2. Render full hierarchy including Empty Scene Card and Empty Speaker Turn
await runTest('Renders persistent Scene Cards, empty Scene, Speaker Turns, empty Turn, Sentences, and Audio Meta badges', async () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);

  await React.act(async () => {
    rootNode.render(React.createElement(TextConversationEditor, { snapshot, documentId: ids.documentId }));
  });

  const sceneEl = host.querySelector(`[data-conversation-scene-id="${ids.sceneId}"]`);
  const zeroSceneEl = host.querySelector(`[data-conversation-scene-id="${ids.zeroSceneId}"]`);
  const emptyTurnEl = host.querySelector(`[data-conversation-turn-id="${ids.emptyTurnId}"]`);
  const firstSentenceEl = host.querySelector(`[data-conversation-sentence-id="${ids.firstSentenceId}"]`);

  assert.ok(sceneEl, 'Should render primary Scene Card');
  assert.ok(zeroSceneEl, 'Should render zero-unit empty Scene Card');
  assert.ok(zeroSceneEl.textContent.includes('ZERO UNITS'), 'Empty Scene should advertise ZERO UNITS');
  assert.ok(emptyTurnEl, 'Should render zero-sentence Empty Turn');
  assert.ok(emptyTurnEl.textContent.includes('EMPTY TURN'), 'Empty Turn should advertise EMPTY TURN');
  assert.ok(emptyTurnEl.textContent.includes('Alice'), 'Empty Turn should keep Alice speaker label');
  assert.ok(firstSentenceEl.textContent.includes('RF Recorded'), 'Should show logical RF Recorded badge without audio engine playback');

  await React.act(async () => rootNode.unmount());
  host.parentNode?.removeChild(host);
});

// 3. Error recovery rendering & workspace switching via QA Preview
await runTest('QA Preview renders typed error codes (MIGRATION_REQUIRED, INVALID_SNAPSHOT, UNSUPPORTED_WORKSPACE, WORKSPACE_NOT_FOUND) and switches workspaces without touching activeDocumentId', async () => {
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);

  await React.act(async () => {
    rootNode.render(React.createElement(TextConversationEditorQaPreview));
  });

  const mixedBtn = findByText(host, 'button', 'Mixed Workspace');
  await triggerClick(mixedBtn);
  assert.ok(host.querySelector('[data-mixed-card-order]'), 'Switching to Mixed Workspace should show Mixed Card Order panel');
  assert.ok(host.textContent.includes('activeDocumentId='), 'QA Inspector shows activeDocumentId');

  await triggerClick(findByText(host, 'button', 'Test: v1 Migration Guard'));
  assert.ok(host.querySelector('[data-conversation-editor-fatal-error="MIGRATION_REQUIRED"]'), 'v1 Snapshot triggers MIGRATION_REQUIRED recovery card');

  await triggerClick(findByText(host, 'button', 'Test: Corrupt Integrity Guard'));
  assert.ok(host.querySelector('[data-conversation-editor-fatal-error="INVALID_SNAPSHOT"]'), 'Corrupt snapshot triggers INVALID_SNAPSHOT card');

  await triggerClick(findByText(host, 'button', 'Test: Unsupported Workspace'));
  assert.ok(host.querySelector('[data-conversation-editor-fatal-error="UNSUPPORTED_WORKSPACE"]'), 'Paragraph workspace triggers UNSUPPORTED_WORKSPACE card');

  const recoveryBtn = findByText(host, 'button', 'conversation (');
  await triggerClick(recoveryBtn);
  assert.ok(host.querySelector('[data-conversation-editor="true"]'), 'Clicking workspace recovery button returns to live editor');

  await triggerClick(findByText(host, 'button', 'Test: Missing Workspace'));
  assert.ok(host.querySelector('[data-conversation-editor-fatal-error="WORKSPACE_NOT_FOUND"]'), 'Missing workspace triggers WORKSPACE_NOT_FOUND');

  await React.act(async () => rootNode.unmount());
  host.parentNode?.removeChild(host);
});

const mountStatefulEditor = async ({ initialSnapshot, documentId }) => {
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);
  let latestSnapshot = initialSnapshot;
  function StatefulHarness() {
    const [snapshot, setSnapshot] = React.useState(initialSnapshot);
    return React.createElement(TextConversationEditor, {
      snapshot,
      documentId,
      onStateChange: outcome => {
        latestSnapshot = outcome.snapshot;
        setSnapshot(outcome.snapshot);
      }
    });
  }
  await React.act(async () => {
    rootNode.render(React.createElement(StatefulHarness));
  });
  return {
    host,
    getSnapshot: () => latestSnapshot,
    unmount: async () => {
      await React.act(async () => rootNode.unmount());
      host.parentNode?.removeChild(host);
    }
  };
};

// 4. Scene CRUD + Mixed Workspace card order preservation
await runTest('Supports Scene Card create, edit metadata note, Mixed Workspace reorder, and delete', async () => {
  const initial = createD4aConversationFixture();
  const currentDocId = initial.ids.mixedDocumentId;
  const harness = await mountStatefulEditor({ initialSnapshot: initial.snapshot, documentId: currentDocId });
  const { host, getSnapshot } = harness;

  // Create new Scene in Mixed Workspace
  await triggerClick(findByText(host, 'button', 'Scene Card'));
  await triggerChange(host.querySelector('[aria-label="New Scene Card Title"]'), 'Mixed Second Scene');
  await triggerChange(host.querySelector('[aria-label="New Scene metadata note"]'), 'Mixed Note');
  await triggerClick(findByText(host, 'button', 'Create Scene Card'));

  const mixedStateAfterCreate = selectTextConversationEditorState(getSnapshot(), { documentId: currentDocId });
  assert.equal(mixedStateAfterCreate.scenes.length, 2);
  const createdScene = mixedStateAfterCreate.scenes[1];
  assert.equal(createdScene.title, 'Mixed Second Scene');
  assert.equal(createdScene.metadata?.note, 'Mixed Note');

  // Edit Scene title & metadata note preserving key check
  await triggerClick(host.querySelector(`[aria-label="Edit Scene ${createdScene.id}"]`));
  await triggerChange(host.querySelector('[aria-label="Scene Card Title"]'), 'Mixed Scene Edited');
  await triggerChange(host.querySelector('[aria-label="Scene metadata note"]'), 'Updated Scene Note');
  await triggerClick(findByText(host, 'button', 'Save Scene'));

  const mixedStateAfterEdit = selectTextConversationEditorState(getSnapshot(), { documentId: currentDocId });
  assert.equal(mixedStateAfterEdit.scenes[1].title, 'Mixed Scene Edited');
  assert.equal(mixedStateAfterEdit.scenes[1].metadata?.note, 'Updated Scene Note');

  // Reorder Scene 2 up in Mixed Workspace preserving Paragraph Card ID in cardOrderIds
  await triggerClick(host.querySelector(`[aria-label="Move Scene ${createdScene.id} up"]`));
  const mixedStateAfterReorder = selectTextConversationEditorState(getSnapshot(), { documentId: currentDocId });
  assert.equal(mixedStateAfterReorder.scenes[0].id, createdScene.id);
  assert.ok(
    mixedStateAfterReorder.cardOrderIds.includes(initial.ids.paragraphId),
    'Mixed Workspace reorder must keep existing Paragraph Card in cardOrderIds'
  );

  // Delete created Scene
  await triggerClick(host.querySelector(`[aria-label="Delete Scene ${createdScene.id}"]`));
  const mixedStateAfterDelete = selectTextConversationEditorState(getSnapshot(), { documentId: currentDocId });
  assert.equal(mixedStateAfterDelete.scenes.length, 1);

  await harness.unmount();
});

// 5. Turn Create (Empty), Speaker Reassign/Reset, Reorder, Rejected Mismatch Merge, Metadata Preservation
await runTest('Supports Turn create (empty), speaker reset/assign, metadata preservation, Turn reorder, and rejected Turn merge alert', async () => {
  const initial = createD4aConversationFixture();
  // Seed custom non-note metadata key on emptyTurnId to prove metadata preservation
  const seeded = applyTextConversationEditorCommand(
    initial.snapshot,
    { type: 'contentUnit.update', payload: { id: initial.ids.emptyTurnId, metadata: { note: 'Initial turn note', externalTag: 'KEEP_ME' } } },
    { documentId: initial.ids.documentId }
  );
  const harness = await mountStatefulEditor({ initialSnapshot: seeded.snapshot, documentId: initial.ids.documentId });
  const { host, getSnapshot } = harness;

  // Add an Empty Turn under primary Scene
  const sceneEl = host.querySelector(`[data-conversation-scene-id="${initial.ids.sceneId}"]`);
  await triggerClick(findByText(sceneEl, 'button', 'Add Speaker Turn'));
  await triggerChange(host.querySelector('[aria-label="New Turn Speaker"]'), '__custom__');
  await triggerChange(host.querySelector('[aria-label="Custom New Turn Speaker"]'), 'Carla');
  await triggerClick(findByText(host, 'button', 'Create Empty Turn'));

  let stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  const carlaTurn = stateNow.scenes[0].turns.find(t => t.speaker === 'Carla');
  assert.ok(carlaTurn && carlaTurn.empty, 'Should create persisted empty Turn for Carla');

  // Reorder Carla empty Turn up
  await triggerClick(host.querySelector(`[aria-label="Move Turn ${carlaTurn.id} up"]`));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns[stateNow.scenes[0].turns.length - 2].id, carlaTurn.id);

  // Edit emptyTurnId metadata note (must keep externalTag: 'KEEP_ME') and reset speaker
  await triggerClick(host.querySelector(`[aria-label="Edit Turn ${initial.ids.emptyTurnId}"]`));
  await triggerChange(host.querySelector('[aria-label="Turn Speaker Choice"]'), '__none__');
  await triggerChange(host.querySelector('[aria-label="Turn metadata note"]'), 'Revised Empty Turn');
  await triggerClick(findByText(host, 'button', 'Save Turn'));

  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  const updatedEmptyTurn = stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId);
  assert.equal(updatedEmptyTurn.speaker, null);
  assert.equal(updatedEmptyTurn.speakerId, null);
  assert.equal(updatedEmptyTurn.metadata?.externalTag, 'KEEP_ME');
  assert.equal(updatedEmptyTurn.metadata?.note, 'Revised Empty Turn');

  // Reject mismatched multi-select Turn merge cleanly without crashing or corrupting snapshot
  await triggerCheckbox(host.querySelector(`[aria-label="Select Turn ${initial.ids.aliceTurnId} for merge"]`), true);
  await triggerCheckbox(host.querySelector(`[aria-label="Select Turn ${initial.ids.bobTurnId} for merge"]`), true);
  await triggerClick(findByText(host, 'button', 'Merge Selected Turns'));

  const errorBanner = host.querySelector('[data-conversation-error-code="COMMAND_REJECTED"]');
  assert.ok(errorBanner, 'Mismatched Turn merge must render typed COMMAND_REJECTED alert');
  await triggerClick(findByText(sceneEl, 'button', 'Clear'));

  // Delete Carla Turn
  await triggerClick(host.querySelector(`[aria-label="Delete Turn ${carlaTurn.id}"]`));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.ok(!stateNow.scenes[0].turns.some(t => t.id === carlaTurn.id));

  await harness.unmount();
});

// 6. Sentence Create in Empty Turn, Edit + Draft Retention on Invalid Submit, Metadata Preservation, Move to Empty Turn, Reorder, Turn Split/Merge, Delete retaining Empty Turn
await runTest('Supports Sentence create in empty Turn, failed-draft preservation, metadata retention, move, reorder, Turn split & merge, and delete preserving Empty Turn', async () => {
  const initial = createD4aConversationFixture();
  const harness = await mountStatefulEditor({ initialSnapshot: initial.snapshot, documentId: initial.ids.documentId });
  const { host, getSnapshot } = harness;

  // Add Sentence to Empty Turn: first submit invalid blank text to ensure draft form remains open with inline error
  const emptyTurnCard = host.querySelector(`[data-conversation-turn-id="${initial.ids.emptyTurnId}"]`);
  await triggerClick(findByText(emptyTurnCard, 'button', 'Add Sentence'));
  await triggerChange(host.querySelector('[aria-label="New Sentence Meaning"]'), 'Kalimat baru untuk turn kosong.');
  await triggerClick(findByText(host.querySelector(`[data-conversation-add-sentence="${initial.ids.emptyTurnId}"]`), 'button', 'Add Sentence'));
  assert.ok(host.querySelector(`[data-conversation-add-sentence="${initial.ids.emptyTurnId}"] [role="alert"]`), 'Failed validation keeps add form open with alert');
  assert.equal(host.querySelector('[aria-label="New Sentence Meaning"]').value, 'Kalimat baru untuk turn kosong.');

  await triggerChange(host.querySelector('[aria-label="New Sentence Text"]'), 'New sentence inside empty turn.');
  await triggerClick(findByText(host.querySelector(`[data-conversation-add-sentence="${initial.ids.emptyTurnId}"]`), 'button', 'Add Sentence'));

  let stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  let emptyTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId);
  assert.equal(emptyTurnNow.empty, false);
  assert.equal(emptyTurnNow.sentences.length, 1);

  // Delete that sentence and assert Empty Turn survives intact
  const tempSegId = emptyTurnNow.sentences[0].id;
  await triggerClick(host.querySelector(`[aria-label="Delete sentence ${tempSegId}"]`));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  emptyTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId);
  assert.ok(emptyTurnNow && emptyTurnNow.empty, 'Deleting last Sentence must preserve parent Empty Turn');

  // Edit firstSentenceId note, check metadata preservation (e.g. sourceTag: 'D4A' & speakerIdentityV1)
  await triggerClick(host.querySelector(`[aria-label="Edit sentence ${initial.ids.firstSentenceId}"]`));
  await triggerChange(host.querySelector('[aria-label="Sentence metadata note"]'), 'Verified D4-B Note');
  await triggerClick(findByText(host, 'button', 'Save Sentence'));
  const editedFirst = getSnapshot().segments.find(s => s.id === initial.ids.firstSentenceId);
  assert.equal(editedFirst.metadata?.note, 'Verified D4-B Note');
  assert.equal(editedFirst.metadata?.sourceTag, 'D4A');
  assert.ok(editedFirst.metadata?.speakerIdentityV1, 'Updating Sentence note must preserve speakerIdentityV1');

  // Split Alice Turn at secondSentenceId, then merge adjacent identical-speaker Turns back
  const secondSentenceEl = host.querySelector(`[data-conversation-sentence-id="${initial.ids.secondSentenceId}"]`);
  await triggerClick(findByText(secondSentenceEl, 'button', 'Split Turn Here'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  const splitAliceTurn = stateNow.scenes[0].turns[1];
  assert.equal(stateNow.scenes[0].turns[0].sentences.length, 1);
  assert.equal(splitAliceTurn.sentences[0].id, initial.ids.secondSentenceId);

  const firstTurnEl = host.querySelector(`[data-conversation-turn-id="${initial.ids.aliceTurnId}"]`);
  await triggerClick(findByText(firstTurnEl, 'button', 'Merge Next'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns[0].sentences.length, 2);

  // Move secondSentenceId into emptyTurnId, verify Turn ordering/inheritance, then move back and reorder inside Alice Turn
  await triggerClick(findByText(host.querySelector(`[data-conversation-sentence-id="${initial.ids.secondSentenceId}"]`), 'button', 'Move Turn'));
  await triggerChange(host.querySelector('[aria-label="Destination Turn"]'), initial.ids.emptyTurnId);
  await triggerClick(findByText(host, 'button', 'Move Sentence'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId).sentences[0].id, initial.ids.secondSentenceId);

  // Move back to Alice Turn
  await triggerClick(findByText(host.querySelector(`[data-conversation-sentence-id="${initial.ids.secondSentenceId}"]`), 'button', 'Move Turn'));
  await triggerChange(host.querySelector('[aria-label="Destination Turn"]'), initial.ids.aliceTurnId);
  await triggerClick(findByText(host, 'button', 'Move Sentence'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns[0].sentences.length, 2);
  assert.equal(stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId).empty, true);

  // Reorder inside Alice Turn
  await triggerClick(host.querySelector(`[aria-label="Move sentence ${initial.ids.secondSentenceId} up"]`));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns[0].sentences[0].id, initial.ids.secondSentenceId);

  await harness.unmount();
});

// 7. Bilingual Split Warning & Confirmation Gate + Manual Cursor Split + Auto Split + Sentence Merge
await runTest('Enforces bilingual translation warning & blank confirmation gate before conversationSegment.split, supports manual cursor split, auto split, and conversationSegments.merge', async () => {
  const initial = createD4aConversationFixture();
  // Prepare a two-sentence EN + single-sentence ID mismatched Sentence on Bob's Turn
  const mismatchSeed = applyTextConversationEditorCommand(
    initial.snapshot,
    {
      type: 'segment.update',
      payload: {
        id: initial.ids.bobSentenceId,
        text: 'Hello there. Welcome to Jakarta.',
        meaning: 'Selamat datang ke Jakarta.'
      }
    },
    { documentId: initial.ids.documentId }
  );
  const harness = await mountStatefulEditor({ initialSnapshot: mismatchSeed.snapshot, documentId: initial.ids.documentId });
  const { host, getSnapshot } = harness;

  // Open Split panel on bobSentenceId: Auto Split must be blocked with mismatch warning
  const bobSegEl = host.querySelector(`[data-conversation-sentence-id="${initial.ids.bobSentenceId}"]`);
  await triggerClick(findByText(bobSegEl, 'button', 'Split'));
  const splitPanel = host.querySelector(`[data-conversation-sentence-id="${initial.ids.bobSentenceId}"] [data-conversation-sentence-split="true"]`);
  assert.ok(splitPanel.textContent.includes('Auto Split is blocked'), 'Mismatched EN/ID counts must block Auto Split');

  // Switch to Edit Parts manually: blank meaning on part 2 disables submit and shows warning until explicit confirmation
  await triggerClick(findByText(splitPanel, 'button', 'Review & Align Bilingual Parts Manually'));
  const applySplitBtnBefore = findByText(splitPanel, 'button', 'Apply Split');
  assert.equal(applySplitBtnBefore.disabled, true, 'Blank Meaning without confirmation checkbox must keep Apply Split disabled');
  assert.ok(splitPanel.textContent.includes('currently have an empty Meaning'), 'Must show explicit blank Meaning warning');

  // Confirm blank checkbox enables Apply Split and succeeds retaining bobSentenceId
  const confirmCb = splitPanel.querySelector('input[type="checkbox"]');
  await triggerCheckbox(confirmCb, true);
  assert.equal(findByText(splitPanel, 'button', 'Apply Split').disabled, false, 'Confirming checkbox enables Apply Split');
  await triggerClick(findByText(splitPanel, 'button', 'Apply Split'));

  let stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  let bobTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.bobTurnId);
  assert.equal(bobTurnNow.sentences.length, 2);
  assert.equal(bobTurnNow.sentences[0].id, initial.ids.bobSentenceId);

  // Merge split sentences back using Merge Next (conversationSegments.merge)
  await triggerClick(findByText(host.querySelector(`[data-conversation-sentence-id="${initial.ids.bobSentenceId}"]`), 'button', 'Merge Next'));
  await triggerClick(findByText(host, 'button', 'Confirm Merge'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  bobTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.bobTurnId);
  assert.equal(bobTurnNow.sentences.length, 1);

  // Test aligned bilingual Auto Split
  await triggerClick(host.querySelector(`[aria-label="Edit sentence ${initial.ids.bobSentenceId}"]`));
  await triggerChange(host.querySelector('[aria-label="Edit Sentence Text"]'), 'Good morning. Have some coffee.');
  await triggerChange(host.querySelector('[aria-label="Edit Sentence Meaning"]'), 'Selamat pagi. Silakan minum kopi.');
  await triggerClick(findByText(host, 'button', 'Save Sentence'));

  await triggerClick(findByText(host.querySelector(`[data-conversation-sentence-id="${initial.ids.bobSentenceId}"]`), 'button', 'Split'));
  const autoSplitPanel = host.querySelector(`[data-conversation-sentence-id="${initial.ids.bobSentenceId}"] [data-conversation-sentence-split="true"]`);
  assert.ok(autoSplitPanel.textContent.includes('Bilingual alignment check passed'));
  await triggerClick(findByText(autoSplitPanel, 'button', 'Apply Auto Split'));

  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  bobTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.bobTurnId);
  assert.equal(bobTurnNow.sentences.length, 2);
  assert.equal(bobTurnNow.sentences[0].text, 'Good morning.');
  assert.equal(bobTurnNow.sentences[1].meaning, 'Silakan minum kopi.');

  // Also test Manual Split Here cursor positioning on newly split second sentence
  const secondChildId = bobTurnNow.sentences[1].id;
  await triggerClick(findByText(host.querySelector(`[data-conversation-sentence-id="${secondChildId}"]`), 'button', 'Split'));
  const manualPanel = host.querySelector(`[data-conversation-sentence-id="${secondChildId}"] [data-conversation-sentence-split="true"]`);
  await triggerClick(findByText(manualPanel, 'button', 'Split Here'));
  await triggerSelectCursor(manualPanel.querySelector('[aria-label="Select EN split cursor"]'), 9);
  await triggerSelectCursor(manualPanel.querySelector('[aria-label="Select Meaning split cursor"]'), 8);
  await triggerClick(findByText(manualPanel, 'button', 'Apply Split Here'));

  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  bobTurnNow = stateNow.scenes[0].turns.find(t => t.id === initial.ids.bobTurnId);
  assert.equal(bobTurnNow.sentences.length, 3);

  await harness.unmount();
});

// 8. Speaker Registry register / rename / remove (blocked in-use, allowed unused)
await runTest('Speaker Registry registers, renames across empty & populated Turns, blocks in-use removal, and removes unused speakers', async () => {
  const initial = createD4aConversationFixture();
  const harness = await mountStatefulEditor({ initialSnapshot: initial.snapshot, documentId: initial.ids.documentId });
  const { host, getSnapshot } = harness;

  const registryEl = host.querySelector('[data-conversation-speaker-registry="true"]');
  await triggerClick(registryEl.querySelector('button'));

  // Register Elena
  await triggerChange(registryEl.querySelector('[aria-label="New speaker label"]'), 'Elena');
  await triggerClick(findByText(registryEl, 'button', 'Register'));
  let stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.ok(stateNow.speakerRegistry.some(s => s.label === 'Elena'));

  // Rename Alice -> Host Alice (must update emptyTurnId too!)
  await triggerClick(registryEl.querySelector('[aria-label="Edit speaker Alice"]'));
  await triggerChange(registryEl.querySelector('[aria-label="Rename Alice"]'), 'Host Alice');
  await triggerClick(registryEl.querySelector('[aria-label="Save speaker name"]'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.equal(stateNow.scenes[0].turns.find(t => t.id === initial.ids.emptyTurnId).speaker, 'Host Alice');

  // Attempt remove in-use Host Alice -> shows typed COMMAND_REJECTED alert
  await triggerClick(registryEl.querySelector('[aria-label="Remove speaker Host Alice"]'));
  assert.ok(registryEl.querySelector('[role="alert"]').textContent.includes('COMMAND_REJECTED'));

  // Remove unused Elena -> succeeds
  await triggerClick(registryEl.querySelector('[aria-label="Remove speaker Elena"]'));
  stateNow = selectTextConversationEditorState(getSnapshot(), { documentId: initial.ids.documentId });
  assert.ok(!stateNow.speakerRegistry.some(s => s.label === 'Elena'));

  await harness.unmount();
});

// 9. Compact Mobile Responsive Mode + confirm IndexedDB never touched
await runTest('Compact mobile layout renders responsive Scene drawer and zero IndexedDB touches occurred', async () => {
  const { snapshot, ids } = createD4aConversationFixture();
  const host = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(host);
  const rootNode = ReactDOMClient.createRoot(host);

  await React.act(async () => {
    rootNode.render(React.createElement(TextConversationEditor, { snapshot, documentId: ids.documentId, compact: true }));
  });

  const moreBtn = host.querySelector('[aria-label="Scene actions"]');
  assert.ok(moreBtn, 'Compact layout must render mobile Scene actions overflow button');
  await triggerClick(moreBtn);
  assert.ok(host.querySelector('[data-conversation-mobile-scene-actions="true"]'), 'Compact layout opens mobile Scene action drawer');

  assert.equal(indexedDbAccessCount, 0, 'IndexedDB must never be touched during D4-B UI tests');
  assert.ok(confirmCalls > 0, 'Destructive UI delete actions must trigger confirmation');

  await React.act(async () => rootNode.unmount());
  host.parentNode?.removeChild(host);
});

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\nD4B UI SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
