import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { applyTextConversationEditorCommand } from '../src/domain/text/textConversationEditorDomain.js';
import { selectTextConversationReaderPresentation } from '../src/domain/text/textConversationReaderDomain.js';
import {
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import { createA4hShowcaseConversationFixture } from './fixtures/shared-card-a4h/conversation-ux-fixture.js';

let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, {
  get() {
    dbCalls += 1;
    throw new Error('A4-H2 forbids IndexedDB');
  }
});

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    clearTimeout: id => clearTimeout(id),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    matchMedia: () => ({ matches: false })
  };
}

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
  if (node == null || typeof node === 'object') {
    if (node == null) return out;
  } else {
    return out;
  }
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
const SharedBilingualLayoutToolbar = loadModule(
  path.join(root, 'src/components/text/presentation/SharedBilingualLayoutToolbar.jsx')
).default;
const utils = loadModule(path.join(root, 'src/components/text/presentation/sharedCardPresentationUtils.js'));

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
};

const fixture = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
const presentation = selectTextConversationReaderPresentation(fixture.snapshot, {
  documentId: fixture.ids.documentId
});
const scene1Card = presentation.cardById[fixture.ids.scene1Id];
const emptySceneCard = presentation.cardById[fixture.ids.zeroSceneId];

test('Canonical Text DB/schema constants remain v1 and zero IndexedDB accesses occur', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(dbCalls, 0);
});

test('Speaker visual palette is keyed by registry UID/ID, distinct per scene speaker, and stable across rename + reorder', () => {
  const initialMap = utils.buildCardSpeakerAppearanceMap(scene1Card);
  const baristaUnit = scene1Card.units[0];
  const mayaUnit = scene1Card.units[1];
  const unassignedUnit = scene1Card.units[4];
  const tariUnit = scene1Card.units[5];

  const baristaInfo = utils.resolveTurnSpeakerPresentation({ unit: baristaUnit, appearanceMap: initialMap });
  const mayaInfo = utils.resolveTurnSpeakerPresentation({ unit: mayaUnit, appearanceMap: initialMap });
  const tariInfo = utils.resolveTurnSpeakerPresentation({ unit: tariUnit, appearanceMap: initialMap });
  const unassignedInfo = utils.resolveTurnSpeakerPresentation({ unit: unassignedUnit, appearanceMap: initialMap });

  assert.equal(baristaInfo.isAssigned, true);
  assert.notEqual(baristaInfo.palette.id, mayaInfo.palette.id);
  assert.notEqual(mayaInfo.palette.id, tariInfo.palette.id);
  assert.notEqual(baristaInfo.palette.id, tariInfo.palette.id);
  assert.equal(unassignedInfo.isAssigned, false);
  assert.equal(unassignedInfo.displayName, 'Unassigned speaker');
  assert.equal(unassignedInfo.monogram, '?');
  assert.equal(unassignedInfo.palette.id, 'neutral');

  // Rename Maya -> Maya Putri and reorder Turns -> palette IDs MUST NOT change
  const renamed = applyTextConversationEditorCommand(
    fixture.snapshot,
    {
      type: 'speaker.rename',
      payload: { documentId: fixture.ids.documentId, speakerId: mayaUnit.speakerId, label: 'Maya Putri' }
    },
    { documentId: fixture.ids.documentId }
  ).snapshot;
  const reordered = applyTextConversationEditorCommand(
    renamed,
    {
      type: 'contentUnit.reorder',
      payload: {
        blockId: fixture.ids.scene1Id,
        orderedIds: [
          fixture.ids.tariTurnId,
          fixture.ids.mayaTurn1Id,
          fixture.ids.baristaTurn1Id,
          fixture.ids.mayaTurn2ConsecutiveId,
          fixture.ids.baristaEmptyTurnId,
          fixture.ids.unassignedTurnId,
          fixture.ids.mayaTurn3DupId
        ]
      }
    },
    { documentId: fixture.ids.documentId }
  ).snapshot;

  const afterPres = selectTextConversationReaderPresentation(reordered, { documentId: fixture.ids.documentId });
  const afterCard = afterPres.cardById[fixture.ids.scene1Id];
  const afterMap = utils.buildCardSpeakerAppearanceMap(afterCard);

  const afterMaya = utils.resolveTurnSpeakerPresentation({
    unit: afterPres.unitById[fixture.ids.mayaTurn1Id],
    appearanceMap: afterMap
  });
  const afterBarista = utils.resolveTurnSpeakerPresentation({
    unit: afterPres.unitById[fixture.ids.baristaTurn1Id],
    appearanceMap: afterMap
  });
  const afterTari = utils.resolveTurnSpeakerPresentation({
    unit: afterPres.unitById[fixture.ids.tariTurnId],
    appearanceMap: afterMap
  });

  assert.equal(afterMaya.palette.id, mayaInfo.palette.id);
  assert.equal(afterMaya.displayName, 'Maya Putri');
  assert.equal(afterMaya.monogram, 'MP');
  assert.equal(afterBarista.palette.id, baristaInfo.palette.id);
  assert.equal(afterTari.palette.id, tariInfo.palette.id);
});

test('SharedBilingualLayoutToolbar adapts terminology and aria-labels for unitKind=turn without Section leaks', () => {
  const tree = renderTree(mockReact.createElement(SharedBilingualLayoutToolbar, {
    unitKind: 'turn',
    presentationState: { level: 'part', bilingualLayout: 'separated', partLayout: 'horizontal-focus' },
    onChangePresentationState: () => {},
    onResetView: () => {}
  }));
  const partGroup = collectNodes(tree, n => n.props?.role === 'group' && String(n.props?.['aria-label'] || '').includes('Part'));
  assert.equal(partGroup.length, 1);
  assert.equal(partGroup[0].props['aria-label'], 'Part speaker turn layout (display only)');
  const allButtons = collectNodes(tree, n => n.type === 'button');
  for (const btn of allButtons) {
    assert.ok(!String(btn.props?.title || '').toLowerCase().includes('section'), `Found section leak in button title: ${btn.props?.title}`);
  }
});

test('Full View renders Scene Cast, distinct consecutive same-speaker Turns, Unassigned Turn, Empty Turn, and Separated speaker headers without Section wording', () => {
  for (const bilingualLayout of ['interlinear', 'separated', 'text-only', 'meaning-only']) {
    resetHooks();
    const tree = renderTree(mockReact.createElement(SharedParagraphWorkspaceReader, {
      presentation,
      presentationState: { level: 'full', bilingualLayout, partLayout: 'vertical-list' }
    }));
    const fullText = extractText(tree).toLowerCase();
    assert.ok(!fullText.includes('section'), `Conversation DOM must not contain "section" in ${bilingualLayout}`);
    assert.ok(collectNodes(tree, n => n.props?.['data-shared-scene-cast'] === fixture.ids.scene1Id).length === 1);
    const unitSections = collectNodes(tree, n => Boolean(n.props?.['data-shared-card-unit-id']));
    if (bilingualLayout === 'separated') {
      assert.equal(unitSections.length, 18, 'Separated preserves all 9 Turns across both EN and ID dialogue flows');
    }
    const headers = collectNodes(tree, n => Boolean(n.props?.['data-shared-turn-header']));
    assert.ok(headers.length >= 9);
    const consecutive = extractText(tree).toLowerCase().includes('consecutive turn');
    assert.ok(consecutive, 'Adjacent same-speaker Turn should indicate consecutive turn');
  }
});

test('Part View adapts all three layouts cleanly for Speaker Turns, Start/End of scene, and zero-Turn empty Scene', () => {
  for (const partLayout of ['horizontal-focus', 'vertical-focus', 'vertical-list']) {
    resetHooks();
    const tree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
      card: scene1Card,
      index: 0,
      workspace: presentation.workspace,
      presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout },
      playbackCursor: {
        workspaceId: fixture.ids.documentId,
        workspaceUid: presentation.workspace.uid,
        sessionId: 5,
        state: 'playing',
        precision: 'segment',
        cardId: fixture.ids.scene1Id,
        unitId: fixture.ids.mayaTurn1Id,
        segmentId: fixture.ids.mayaS3Id,
        channel: 'text'
      }
    }));
    const text = extractText(tree).toLowerCase();
    assert.ok(!text.includes('section'), `Part layout ${partLayout} must not leak "section"`);
    assert.ok(text.includes('speaker turn'), `Part layout ${partLayout} must show "Speaker Turn"`);
    if (partLayout === 'vertical-focus') {
      assert.ok(text.includes('previous'), 'Vertical focus shows Previous turn neighbor');
      assert.ok(text.includes('next'), 'Vertical focus shows Next turn neighbor');
    }
  }

  // Start & End of scene boundaries on Scene 2 (2 turns)
  const s2Card = presentation.cardById[fixture.ids.scene2Id];
  resetHooks();
  const boundaryTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: s2Card,
    index: 1,
    workspace: presentation.workspace,
    presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout: 'vertical-focus' }
  }));
  const startBoundary = collectNodes(boundaryTree, n => n.props?.['data-shared-part-boundary'] === 'start');
  assert.equal(startBoundary.length, 1);
  assert.ok(extractText(startBoundary[0]).includes('Start of scene · Speaker Turn 1 of 2'));

  // Zero-Turn Empty Scene
  resetHooks();
  const emptyTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: emptySceneCard,
    index: 2,
    workspace: presentation.workspace,
    presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout: 'vertical-list' }
  }));
  const emptyNode = collectNodes(emptyTree, n => n.props?.['data-shared-part-empty'] === 'zero-units');
  assert.equal(emptyNode.length, 1);
  assert.ok(extractText(emptyNode[0]).includes('No speaker turns in this scene to focus.'));
});

test('Segment Focus uses Speaker Turn fallback even with cleared label, renders Speaker Spotlight, Turn line counter, and Full Scene notice', () => {
  // Clone Scene 1 card and erase unit.label on Unit 0 to specifically verify fallback fix in SharedPartAndSegmentViews
  const strippedCard = {
    ...scene1Card,
    units: scene1Card.units.map((u, i) => (i === 0 ? { ...u, label: '' } : u))
  };
  resetHooks();
  const segTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: strippedCard,
    index: 0,
    workspace: presentation.workspace,
    presentationState: { level: 'segment', bilingualLayout: 'interlinear', partLayout: 'vertical-list' },
    playbackCursor: {
      workspaceId: fixture.ids.documentId,
      workspaceUid: presentation.workspace.uid,
      sessionId: 9,
      state: 'playing',
      precision: 'card',
      cardId: scene1Card.id,
      segmentId: null,
      channel: 'text'
    }
  }));
  const unitCtx = collectNodes(segTree, n => n.props?.['data-shared-segment-unit-context'] === 'true');
  assert.equal(unitCtx.length, 1);
  const ctxText = extractText(unitCtx[0]);
  assert.ok(ctxText.includes('Speaker Turn 1'), `Expected Speaker Turn fallback, got "${ctxText}"`);
  assert.ok(!ctxText.toLowerCase().includes('section'), 'Fallback must not say Section for Conversation Turn');
  assert.ok(ctxText.includes('Line 1 of 2'), 'Multi-sentence Turn must show line counter within Turn');

  const speakerStage = collectNodes(segTree, n => n.props?.['data-shared-segment-speaker-stage'] === 'true');
  assert.equal(speakerStage.length, 1);
  assert.ok(extractText(speakerStage[0]).includes('Barista'));

  const fullNotice = collectNodes(segTree, n => n.props?.['data-shared-segment-full-notice'] === 'true');
  assert.equal(fullNotice.length, 1);
  assert.ok(extractText(fullNotice[0]).includes('Playing Full Scene audio'));
});

console.log(`ALL A4-H2 NODE CHECKS PASSED (${passed}/${passed})`);
