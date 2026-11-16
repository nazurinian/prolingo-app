import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  TEXT_CARD_BILINGUAL_LAYOUTS
} from '../src/domain/text/textCardPresentationStateDomain.js';
import { resolveTextCardPresentationCursor } from '../src/domain/text/textCardPresentationCursorDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from '../src/domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import {
  TEXT_CARD_PRESENTATION_PREFERENCE_STORAGE_KEY,
  loadTextCardPresentationPreferences,
  resetTextCardPresentationPreferences,
  saveTextCardPresentationPreferences
} from '../src/services/persistence/textCardPresentationPreferenceService.js';
import {
  createA2ParagraphReaderFixture,
  createA2V1CompatibilityParagraphFixture
} from './fixtures/shared-card-a2/paragraph-reader-fixture.js';

let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, {
  get() {
    dbCalls += 1;
    throw new Error('A2 forbids IndexedDB');
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const transpile = (source, absPath) => esbuild.transformSync(source, {
  loader: absPath.endsWith('.jsx') ? 'jsx' : 'js',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic'
}).code;

let hookValues = [];
let hookSlot = 0;
const resetHooks = () => {
  hookValues = [];
  hookSlot = 0;
};
const mockReact = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children }
  }),
  useState: initial => {
    const at = hookSlot++;
    if (!(at in hookValues)) hookValues[at] = typeof initial === 'function' ? initial() : initial;
    return [hookValues[at], value => { hookValues[at] = typeof value === 'function' ? value(hookValues[at]) : value; }];
  },
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  memo: fn => fn
};
const fakeIcons = new Proxy({}, { get: (_, key) => typeof key === 'string' ? function Icon() { return null; } : null });
const moduleCache = new Map();
const loadModule = absPath => {
  const normalized = path.normalize(absPath);
  if (moduleCache.has(normalized)) return moduleCache.get(normalized);
  const exportsObj = {};
  const mod = { exports: exportsObj };
  moduleCache.set(normalized, exportsObj);
  const source = fs.readFileSync(normalized, 'utf8');
  const code = transpile(source, normalized);
  const localRequire = specifier => {
    if (specifier === 'react' || specifier === 'react/jsx-runtime') {
      if (specifier === 'react/jsx-runtime') {
        const jsx = (type, props, key) => ({ type, props: props || {}, key });
        return { jsx, jsxs: jsx, Fragment: mockReact.Fragment };
      }
      return mockReact;
    }
    if (specifier === 'lucide-react') return fakeIcons;
    const base = path.dirname(normalized);
    for (const candidate of [specifier, `${specifier}.js`, `${specifier}.jsx`]) {
      const target = path.resolve(base, candidate);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) return loadModule(target);
    }
    return require(specifier);
  };
  const fn = new Function('require', 'module', 'exports', code);
  fn(localRequire, mod, exportsObj);
  moduleCache.set(normalized, mod.exports);
  return mod.exports;
};

const renderTree = node => {
  if (node == null || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map(renderTree);
  if (typeof node !== 'object') return node;
  if (typeof node.type === 'function') return renderTree(node.type(node.props || {}));
  const rawChildren = node.props?.children;
  const children = Array.isArray(rawChildren)
    ? rawChildren.flat(Infinity).map(renderTree)
    : (rawChildren !== undefined ? [renderTree(rawChildren)] : []);
  return { ...node, children };
};

const collectNodes = (node, predicate, out = []) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodes(child, predicate, out);
  }
  return out;
};

const extractText = node => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  return Array.isArray(node.children) ? extractText(node.children) : '';
};

const {
  SharedParagraphWorkspaceReader,
  SharedCardReadingSurface
} = loadModule(path.join(root, 'src/components/text/presentation/SharedParagraphCardReader.jsx'));
const utils = loadModule(path.join(root, 'src/components/text/presentation/sharedCardPresentationUtils.js'));

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
};

const v2 = createA2ParagraphReaderFixture();
const v2Original = JSON.stringify(v2.snapshot);
const v2Pres = selectTextCardPresentation(v2.snapshot, { documentId: v2.ids.documentId });

const v1 = createA2V1CompatibilityParagraphFixture();
const v1Original = JSON.stringify(v1.snapshot);
const v1Pres = selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId });

test('Fixture snapshots stay immutable and v2 multi-section + v1 compat structure are intact', () => {
  assert.equal(v2Pres.cards.length, 4);
  assert.equal(v2Pres.cards[0].paragraphRole, 'title');
  assert.equal(v2Pres.cards[1].units.length, 3);
  assert.equal(v2Pres.cards[1].units[2].segments.length, 0);
  assert.equal(v2Pres.cards[3].units.length, 0);
  assert.equal(v1Pres.cards[1].units[0].identitySource, 'v1-paragraph-compat');
  assert.equal(v1Pres.cards[1].units[0].id, null);
  assert.equal(JSON.stringify(v2.snapshot), v2Original);
  assert.equal(JSON.stringify(v1.snapshot), v1Original);
});

test('Interlinear default renders paired EN + ID from exact same Segment records without nested boxes', () => {
  resetHooks();
  const tree = renderTree(mockReact.createElement(SharedParagraphWorkspaceReader, {
    presentation: v2Pres,
    audioCoverageMap: v2.audioCoverageMap
  }));
  const pairs = collectNodes(tree, n => Boolean(n.props?.['data-shared-card-segment-pair']));
  assert.equal(pairs.length, 7);
  const dup1 = pairs.find(n => n.props['data-shared-card-segment-pair'] === v2.ids.duplicateSeg1Id);
  const dup2 = pairs.find(n => n.props['data-shared-card-segment-pair'] === v2.ids.duplicateSeg2Id);
  assert.match(extractText(dup1), /Pintu kereta itu/);
  assert.match(extractText(dup2), /Pintu gerbang stasiun/);
  assert.doesNotMatch(extractText(dup1), /Pintu gerbang stasiun/);
  assert.equal(collectNodes(tree, n => n.props?.['data-shared-card-empty-section'] === v2Pres.cards[1].units[2].viewKey).length, 1);
  assert.equal(collectNodes(tree, n => n.props?.['data-shared-card-empty'] === 'zero-units').length, 1);
});

test('All four bilingual layouts preserve Section/Segment identity, Missing Meaning, and TITLE role', () => {
  for (const layout of TEXT_CARD_BILINGUAL_LAYOUTS) {
    resetHooks();
    const tree = renderTree(mockReact.createElement(SharedParagraphWorkspaceReader, {
      presentation: v2Pres,
      presentationState: { level: 'full', bilingualLayout: layout, partLayout: 'vertical-list' }
    }));
    const titleCards = collectNodes(tree, n => n.props?.['data-shared-card-role'] === 'title');
    assert.equal(titleCards.length, 1, `Title role must survive ${layout}`);
    const segTargets = collectNodes(tree, n => Boolean(n.props?.['data-shared-card-segment']));
    if (layout === 'interlinear' || layout === 'separated') {
      assert.ok(segTargets.some(n => n.props['data-shared-card-channel'] === 'text'));
      assert.ok(segTargets.some(n => n.props['data-shared-card-channel'] === 'meaning'));
    } else if (layout === 'text-only') {
      assert.ok(segTargets.every(n => n.props['data-shared-card-channel'] === 'text'));
    } else if (layout === 'meaning-only') {
      assert.ok(segTargets.every(n => n.props['data-shared-card-channel'] === 'meaning'));
      assert.equal(collectNodes(tree, n => n.props?.['data-shared-card-missing-meaning'] === v2.ids.missingMeaningSegId).length, 1);
    }
  }
});

test('Separated layout skips blank Meaning cleanly without renumbering subsequent Segments', () => {
  resetHooks();
  const tree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: v2Pres.cards[1],
    index: 1,
    workspace: v2Pres.workspace,
    bilingualLayout: 'separated'
  }));
  const meaningTargets = collectNodes(tree, n => n.props?.['data-shared-card-channel'] === 'meaning');
  assert.equal(meaningTargets.length, 4);
  const lastMeaning = meaningTargets.find(n => n.props['data-shared-card-segment'] === v2.ids.duplicateSeg2Id);
  assert.equal(lastMeaning.props['data-shared-card-index'], 5, 'Duplicate Segment #5 index must never shift when #4 meaning is blank');
});

test('Full cached playback cursor renders Card precision without falsely highlighting Segment #1', () => {
  const fullCursor = resolveTextCardPresentationCursor({
    presentation: v2Pres,
    playback: {
      workspaceId: v2Pres.workspace.id,
      workspaceUid: v2Pres.workspace.uid,
      sessionId: 7,
      playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
      isPlaying: true,
      isPaused: false,
      playbackRepresentationMode: 'full',
      playingIndex: v2.ids.longSegId,
      currentIndex: v2.ids.longSegId,
      activeBlockId: v2.ids.storyCardId,
      speakingPart: 'text',
      playbackSourceStatus: {
        sessionId: 7,
        documentId: v2Pres.workspace.id,
        workspaceUid: v2Pres.workspace.uid,
        blockId: v2.ids.storyCardId,
        segmentId: null,
        channel: 'text',
        mode: 'full-local'
      }
    }
  });
  assert.equal(fullCursor.precision, 'card');
  resetHooks();
  const tree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: v2Pres.cards[1],
    index: 1,
    workspace: v2Pres.workspace,
    bilingualLayout: 'interlinear',
    playbackCursor: fullCursor
  }));
  const statusPill = collectNodes(tree, n => n.props?.['data-shared-card-status-pill'] === 'true')[0];
  assert.match(extractText(statusPill), /Full Card/);
  const activeNodes = collectNodes(tree, n => n.props?.['data-text-player-segment-active'] === 'true');
  assert.equal(activeNodes.length, 0, 'Cached Full must not pretend Sentence #1 is speaking');
  assert.equal(collectNodes(tree, n => n.props?.['data-shared-card-segment'] === v2.ids.longSegId && n.props?.['data-shared-card-channel'] === 'text').length, 1);
});

test('Coverage summary reads host coverageMap faithfully and resolves joinAfter separators cleanly', () => {
  const { orderedSegments } = utils.buildCardSegmentIndexMap(v2Pres.cards[1]);
  const summary = utils.summarizeCardPresentationCoverage({ orderedSegments, audioCoverageMap: v2.audioCoverageMap });
  assert.equal(summary.ready, 2);
  assert.equal(summary.stale, 1);
  assert.equal(summary.otherVoice, 1);
  assert.equal(utils.resolveSegmentJoinSeparator('none'), '');
  assert.equal(utils.resolveSegmentJoinSeparator('line'), '\n');
  assert.equal(utils.resolveSegmentJoinSeparator('paragraph'), ' ');
});

test('Guarded presentation preference service isolates view storage and handles denied/corrupt localStorage', () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, val) => { store.set(key, String(val)); }
    }
  };
  store.set('prolingo_text_structured_preferences_v1', '{"playbackRepresentationMode":"split","displayMode":"text-meaning"}');
  const saved = saveTextCardPresentationPreferences({
    level: 'full',
    bilingualLayout: 'separated',
    playbackRepresentationMode: 'full',
    displayMode: 'text-active-meaning'
  });
  assert.deepEqual(saved, { level: 'full', bilingualLayout: 'separated', partLayout: 'vertical-list' });
  assert.equal(loadTextCardPresentationPreferences().bilingualLayout, 'separated');
  assert.equal(store.get('prolingo_text_structured_preferences_v1'), '{"playbackRepresentationMode":"split","displayMode":"text-meaning"}');

  store.set(TEXT_CARD_PRESENTATION_PREFERENCE_STORAGE_KEY, '{not-json');
  assert.deepEqual(loadTextCardPresentationPreferences(), DEFAULT_TEXT_CARD_PRESENTATION_STATE);

  resetTextCardPresentationPreferences();
  assert.deepEqual(loadTextCardPresentationPreferences(), DEFAULT_TEXT_CARD_PRESENTATION_STATE);

  globalThis.window = {
    localStorage: {
      getItem() { throw new Error('Storage denied'); },
      setItem() { throw new Error('QuotaExceeded'); }
    }
  };
  assert.deepEqual(loadTextCardPresentationPreferences(), DEFAULT_TEXT_CARD_PRESENTATION_STATE);
  assert.deepEqual(saveTextCardPresentationPreferences({ bilingualLayout: 'text-only' }), {
    level: 'full',
    bilingualLayout: 'text-only',
    partLayout: 'vertical-list'
  });
  delete globalThis.window;
});

test('Canonical DB and schema versions remain 1 and zero IndexedDB access occurred', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(dbCalls, 0);
});

console.log(`A2 NODE SUMMARY: ${passed} PASS, 0 FAIL; IndexedDB calls: ${dbCalls}`);
