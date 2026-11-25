import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { selectTextCardPresentation } from '../src/domain/text/textCardPresentationDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  TEXT_CARD_BILINGUAL_LAYOUTS,
  TEXT_CARD_PART_LAYOUTS,
  TEXT_CARD_PRESENTATION_LEVELS
} from '../src/domain/text/textCardPresentationStateDomain.js';
import { TEXT_AUDIO_COVERAGE_STATUS } from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import {
  createA2ParagraphReaderFixture,
  createA2V1CompatibilityParagraphFixture
} from './fixtures/shared-card-a2/paragraph-reader-fixture.js';

let dbCalls = 0;
globalThis.indexedDB = new Proxy({}, {
  get() {
    dbCalls += 1;
    throw new Error('A3 forbids IndexedDB');
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
  createContext: value => ({ value }),
  useContext: context => context.value,
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
    if (specifier.endsWith('.css') || specifier.startsWith('swiper/css')) return {};
    if (specifier === 'swiper/modules') return { A11y: {} };
    if (specifier === 'swiper/react') {
      const Swiper = ({ children, ...rest }) => mockReact.createElement('div', rest, children);
      const SwiperSlide = ({ children, ...rest }) => mockReact.createElement('div', rest, children);
      return { Swiper, SwiperSlide };
    }
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
const SharedBilingualLayoutToolbar = loadModule(
  path.join(root, 'src/components/text/presentation/SharedBilingualLayoutToolbar.jsx')
).default;
const utils = loadModule(path.join(root, 'src/components/text/presentation/sharedCardPresentationUtils.js'));
const selectionStoreHelpers = loadModule(
  path.join(root, 'src/components/text/presentation/useSharedReaderSelectionStore.js')
);

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
};

const v2 = createA2ParagraphReaderFixture();
const v2Pres = selectTextCardPresentation(v2.snapshot, { documentId: v2.ids.documentId });
const storyCard = v2Pres.cards[1];
const emptyCard = v2Pres.cards[3];

const v1 = createA2V1CompatibilityParagraphFixture();
const v1Pres = selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId });
const v1StoryCard = v1Pres.cards[1];

test('Canonical Text DB/schema constants remain v1 and option sets match A1 state domain', () => {
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.deepEqual(utils.SHARED_LEVEL_OPTIONS.map(o => o.id), TEXT_CARD_PRESENTATION_LEVELS);
  assert.deepEqual(utils.SHARED_PART_LAYOUT_OPTIONS.map(o => o.id), TEXT_CARD_PART_LAYOUTS);
  assert.deepEqual(utils.SHARED_BILINGUAL_LAYOUT_OPTIONS.map(o => o.id), TEXT_CARD_BILINGUAL_LAYOUTS);
});

test('buildCardUnitLookup and Prev/Next step helpers preserve empty Section and blank Meaning segments', () => {
  const storyLookup = utils.buildCardUnitLookup(storyCard);
  assert.equal(storyLookup.units.length, 3);
  assert.equal(storyLookup.entries.length, 5);
  assert.equal(storyLookup.entries[2].logicalIndex, 2);
  assert.equal(storyLookup.entries[2].unit.id, v2.ids.storySection2Id);

  const step1 = utils.stepCardUnitViewKey({
    units: storyLookup.units,
    currentViewKey: storyLookup.units[0].viewKey,
    delta: -1
  });
  assert.equal(step1.atStart, true);
  assert.equal(step1.nextIndex, 0);

  const stepToEmpty = utils.stepCardUnitViewKey({
    units: storyLookup.units,
    currentViewKey: storyLookup.units[1].viewKey,
    delta: 1
  });
  assert.equal(stepToEmpty.atEnd, true);
  assert.equal(stepToEmpty.nextViewKey, storyLookup.units[2].viewKey);

  const segStepToMissing = utils.stepCardSegmentId({
    entries: storyLookup.entries,
    currentSegmentId: v2.ids.s2FirstSegId,
    delta: 1
  });
  assert.equal(segStepToMissing.nextSegmentId, v2.ids.missingMeaningSegId);
  assert.equal(segStepToMissing.nextIndex, 3);

  const emptyLookup = utils.buildCardUnitLookup(emptyCard);
  assert.equal(emptyLookup.units.length, 0);
  assert.equal(emptyLookup.entries.length, 0);
  assert.equal(utils.stepCardUnitViewKey({ units: emptyLookup.units, currentViewKey: null, delta: 1 }).nextViewKey, null);
  assert.equal(utils.stepCardSegmentId({ entries: emptyLookup.entries, currentSegmentId: null, delta: 1 }).nextSegmentId, null);

  const v1Lookup = utils.buildCardUnitLookup(v1StoryCard);
  assert.equal(v1Lookup.units.length, 1);
  assert.equal(v1Lookup.units[0].identitySource, 'v1-paragraph-compat');
});

test('resolveEffectiveCardSelection enforces explicit manual-follow policy, transient search restoration, deleted-segment recovery, empty units, Full Card honesty, and Workspace isolation', () => {
  const lookup = utils.buildCardUnitLookup(storyCard);
  const s1ViewKey = lookup.units[0].viewKey;
  const s2ViewKey = lookup.units[1].viewKey;
  const s3EmptyViewKey = lookup.units[2].viewKey;
  const wsKey = `${v2.ids.documentId}:uid`;

  const playingS1Cursor = {
    sessionId: 7,
    state: 'playing',
    precision: 'segment',
    cardId: storyCard.id,
    segmentId: v2.ids.longSegId,
    channel: 'text'
  };

  // Tier 1: Transient Search focus wins while active WITHOUT destroying prior manualAnchor
  const priorManualAnchor = {
    workspaceKey: wsKey,
    unitViewKey: s2ViewKey,
    segmentId: v2.ids.duplicateSeg2Id,
    pinnedManual: true
  };
  const searchSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: playingS1Cursor,
    focusTarget: {
      documentId: v2.ids.documentId,
      blockId: storyCard.id,
      segmentId: v2.ids.missingMeaningSegId,
      nonce: 11
    },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: priorManualAnchor,
    dismissedFocusNonce: null
  });
  assert.equal(searchSel.source, 'search');
  assert.equal(searchSel.selectedUnitViewKey, s2ViewKey);
  assert.equal(searchSel.selectedSegmentId, v2.ids.missingMeaningSegId);
  assert.equal(searchSel.audibleUnitViewKey, s1ViewKey);
  assert.equal(searchSel.unitDivergedFromAudible, true);

  // After search reveal is consumed (focusTarget becomes null), prior manual selection is restored intact!
  const restoredAfterSearch = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: playingS1Cursor,
    focusTarget: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: priorManualAnchor,
    dismissedFocusNonce: null
  });
  assert.equal(restoredAfterSearch.source, 'manual');
  assert.equal(restoredAfterSearch.selectedUnitViewKey, s2ViewKey);
  assert.equal(restoredAfterSearch.selectedSegmentId, v2.ids.duplicateSeg2Id);

  // Tier 2: Empty Unit manual selection NEVER borrows another Unit's Segment and flags divergence from playing audio
  const emptyUnitManualSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: playingS1Cursor,
    focusTarget: {
      documentId: v2.ids.documentId,
      blockId: storyCard.id,
      segmentId: v2.ids.missingMeaningSegId,
      nonce: 11
    },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: {
      workspaceKey: wsKey,
      unitViewKey: s3EmptyViewKey,
      segmentId: null,
      pinnedManual: true
    },
    dismissedFocusNonce: 11
  });
  assert.equal(emptyUnitManualSel.source, 'manual');
  assert.equal(emptyUnitManualSel.selectedUnitViewKey, s3EmptyViewKey);
  assert.equal(emptyUnitManualSel.selectedSegmentId, null, 'Empty Unit must never borrow another Unit segment');
  assert.equal(emptyUnitManualSel.unitDivergedFromAudible, true);
  assert.equal(emptyUnitManualSel.segmentDivergedFromAudible, true);

  // Explicit manual-follow policy: Playback advancing to a DIFFERENT Segment (even with manualGraceActive=false)
  // MUST NOT steal the user's manual selection!
  const advancingAudioHeldSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: { ...playingS1Cursor, segmentId: v2.ids.duplicateSeg2Id },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: {
      workspaceKey: wsKey,
      unitViewKey: s1ViewKey,
      segmentId: v2.ids.longSegId,
      pinnedManual: true
    },
    manualGraceActive: false
  });
  assert.equal(advancingAudioHeldSel.source, 'manual', 'Advancing audio must NEVER override explicit manual selection');
  assert.equal(advancingAudioHeldSel.selectedUnitViewKey, s1ViewKey);
  assert.equal(advancingAudioHeldSel.selectedSegmentId, v2.ids.longSegId);
  assert.equal(advancingAudioHeldSel.audibleUnitViewKey, s2ViewKey);
  assert.equal(advancingAudioHeldSel.audibleSegmentId, v2.ids.duplicateSeg2Id);
  assert.equal(advancingAudioHeldSel.unitDivergedFromAudible, true);
  assert.equal(advancingAudioHeldSel.segmentDivergedFromAudible, true);

  // Tier 3: Explicit Return to Playing (manualAnchor cleared to null) immediately resumes following audible Segment
  const followedSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: { ...playingS1Cursor, segmentId: v2.ids.duplicateSeg2Id },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: null
  });
  assert.equal(followedSel.source, 'audible');
  assert.equal(followedSel.selectedUnitViewKey, s2ViewKey);
  assert.equal(followedSel.selectedSegmentId, v2.ids.duplicateSeg2Id);
  assert.equal(followedSel.unitDivergedFromAudible, false);
  assert.equal(followedSel.segmentDivergedFromAudible, false);

  // Deleted Segment safe recovery: deleted Segment inside surviving Unit recovers to first valid Segment in that Unit
  const deletedSegSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: {
      workspaceKey: wsKey,
      unitViewKey: s2ViewKey,
      segmentId: 'deleted-segment-id',
      pinnedManual: true
    }
  });
  assert.equal(deletedSegSel.source, 'manual');
  assert.equal(deletedSegSel.selectedUnitViewKey, s2ViewKey);
  assert.equal(deletedSegSel.selectedSegmentId, v2.ids.s2FirstSegId, 'Deleted segment must safely recover to valid segment in surviving Unit');

  // Deleted Unit AND deleted Segment recovers cleanly to default/first valid Unit without nonexistent IDs
  const deletedBothSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    manualAnchor: {
      workspaceKey: wsKey,
      unitViewKey: 'deleted-unit-key',
      segmentId: 'deleted-segment-id',
      pinnedManual: true
    }
  });
  assert.equal(deletedBothSel.source, 'default');
  assert.equal(deletedBothSel.selectedUnitViewKey, s1ViewKey);
  assert.equal(deletedBothSel.selectedSegmentId, v2.ids.longSegId);

  // Tier 4/5: Cached Full Card playback NEVER spoofs an audible section or segment
  const fullCardSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    cursor: {
      sessionId: 8,
      state: 'playing',
      precision: 'card',
      cardId: storyCard.id,
      segmentId: null,
      channel: 'text'
    },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey
  });
  assert.equal(fullCardSel.isCardPrecisionPlaying, true);
  assert.equal(fullCardSel.audibleUnitViewKey, null);
  assert.equal(fullCardSel.audibleSegmentId, null);
  assert.equal(fullCardSel.source, 'default');
  assert.equal(fullCardSel.selectedUnitViewKey, s1ViewKey);

  // Cross-workspace isolation: stale manualAnchor + cross-doc focusTarget are ignored
  const isolatedSel = utils.resolveEffectiveCardSelection({
    card: storyCard,
    lookup,
    focusTarget: {
      documentId: 'other-doc',
      blockId: storyCard.id,
      segmentId: v2.ids.missingMeaningSegId,
      nonce: 99
    },
    workspaceId: v2.ids.documentId,
    workspaceKey: `${v2.ids.documentId}:uid-2`,
    manualAnchor: {
      workspaceKey: `${v2.ids.documentId}:uid-1`,
      unitViewKey: s3EmptyViewKey,
      segmentId: v2.ids.duplicateSeg2Id
    }
  });
  assert.equal(isolatedSel.source, 'default');
  assert.equal(isolatedSel.selectedUnitViewKey, s1ViewKey);
  assert.equal(isolatedSel.selectedSegmentId, v2.ids.longSegId);
});

test('buildSharedSegmentRenderFlags styles paused channel strictly on actual paused channel and keeps selected/focused independent', () => {
  const seg = storyCard.units[0].segments[0];
  const enPausedCursor = {
    sessionId: 12,
    state: 'paused',
    precision: 'segment',
    cardId: storyCard.id,
    segmentId: seg.id,
    channel: 'text'
  };
  const enFlagsWhenEnPaused = utils.buildSharedSegmentRenderFlags({
    segment: seg,
    logicalIndex: 0,
    channel: 'text',
    cursor: enPausedCursor,
    isSpeakingCard: true
  });
  const idFlagsWhenEnPaused = utils.buildSharedSegmentRenderFlags({
    segment: seg,
    logicalIndex: 0,
    channel: 'meaning',
    cursor: enPausedCursor,
    isSpeakingCard: true
  });
  assert.equal(enFlagsWhenEnPaused.paused, true, 'EN channel must be paused when cursor.channel is text');
  assert.equal(enFlagsWhenEnPaused.speaking, false);
  assert.equal(enFlagsWhenEnPaused.dataAttributes['data-shared-segment-paused'], 'true');
  assert.ok(enFlagsWhenEnPaused.className.includes('amber'), 'Paused EN span must carry amber paused highlight');

  assert.equal(idFlagsWhenEnPaused.paused, false, 'ID channel must NOT be styled as paused when cursor.channel is text');
  assert.equal(idFlagsWhenEnPaused.speaking, false);
  assert.equal(idFlagsWhenEnPaused.dataAttributes['data-shared-segment-paused'], undefined);
  assert.ok(!idFlagsWhenEnPaused.className.includes('amber'), 'Non-paused ID span must NOT receive amber paused classes');

  const idPausedCursor = { ...enPausedCursor, channel: 'meaning' };
  const enFlagsWhenIdPaused = utils.buildSharedSegmentRenderFlags({
    segment: seg,
    logicalIndex: 0,
    channel: 'text',
    cursor: idPausedCursor,
    isSpeakingCard: true,
    selectedSegmentId: seg.id,
    focusSegmentId: seg.id
  });
  const idFlagsWhenIdPaused = utils.buildSharedSegmentRenderFlags({
    segment: seg,
    logicalIndex: 0,
    channel: 'meaning',
    cursor: idPausedCursor,
    isSpeakingCard: true,
    selectedSegmentId: seg.id,
    focusSegmentId: seg.id
  });
  assert.equal(enFlagsWhenIdPaused.paused, false, 'EN channel must NOT be styled as paused when cursor.channel is meaning');
  assert.equal(enFlagsWhenIdPaused.selected, true);
  assert.equal(enFlagsWhenIdPaused.focused, true);
  assert.equal(enFlagsWhenIdPaused.dataAttributes['data-shared-segment-paused'], undefined);
  assert.equal(enFlagsWhenIdPaused.dataAttributes['data-shared-segment-selected'], 'true');
  assert.ok(!enFlagsWhenIdPaused.className.includes('amber'));

  assert.equal(idFlagsWhenIdPaused.paused, true, 'ID channel must be paused when cursor.channel is meaning');
  assert.equal(idFlagsWhenIdPaused.selected, true);
  assert.equal(idFlagsWhenIdPaused.dataAttributes['data-shared-segment-paused'], 'true');
  assert.equal(idFlagsWhenIdPaused.dataAttributes['data-shared-segment-selected'], 'true');
  assert.ok(idFlagsWhenIdPaused.className.includes('amber'));
});

test('selection mutations only affect their current Workspace generation and keep viewport follow explicit', () => {
  resetHooks();
  const workspaceA = 'DOC_000001:workspace-a';
  const workspaceB = 'DOC_000001:workspace-b';
  const renderStore = key => {
    hookSlot = 0;
    const state = selectionStoreHelpers.useSharedReaderSelectionStore(key);
    if (hookValues[0].workspaceKey === state.workspaceKey && hookValues[0].byCardId !== state.byCardId) {
      // The real hook retries its render immediately after the render-phase reset.
      hookSlot = 0;
      return selectionStoreHelpers.useSharedReaderSelectionStore(key);
    }
    return state;
  };
  const lookup = utils.buildCardUnitLookup(storyCard);
  const segmentId = v2.ids.duplicateSeg2Id;
  const payload = { card: storyCard, lookup, segmentId };
  const firstA = renderStore(workspaceA);
  firstA.selectCardSegment({ ...payload, activePlaybackSessionId: 41 });
  assert.equal(renderStore(workspaceA).manualBrowseSessionId, 41);

  const currentB = renderStore(workspaceB);
  currentB.selectCardSegment(payload);
  assert.equal(renderStore(workspaceB).manualBrowseSessionId, null);
  const staleActions = [
    () => firstA.selectCardUnit({ ...payload, unitViewKey: lookup.units[0].viewKey, activePlaybackSessionId: 93 }),
    () => firstA.selectCardSegment({ ...payload, activePlaybackSessionId: 93 }),
    () => firstA.clearCardManualSelection(storyCard.id),
    () => firstA.clearAllManualSelections(),
    () => firstA.resumeViewportFollow()
  ];
  const assertStaleActionsAreIgnored = key => {
    const before = hookValues[0];
    for (const action of staleActions) {
      action();
      assert.equal(hookValues[0], before, 'Stale callback must leave the entire state intact');
    }
    assert.equal(renderStore(key).getCardSelectionState(storyCard.id).manualAnchor.segmentId, segmentId);
  };
  assertStaleActionsAreIgnored(workspaceB);

  const nextA = renderStore(workspaceA);
  assert.equal(nextA.manualBrowseSessionId, null);
  assert.equal(nextA.getCardSelectionState(storyCard.id).manualAnchor, null);
  nextA.selectCardSegment({ ...payload, activePlaybackSessionId: 42 });
  const otherCard = { ...storyCard, id: 'TEXT_OTHER' };
  nextA.selectCardSegment({ ...payload, card: otherCard });
  assertStaleActionsAreIgnored(workspaceA);
  nextA.clearCardManualSelection(storyCard.id);
  const returned = renderStore(workspaceA);
  assert.equal(returned.getCardSelectionState(storyCard.id).manualAnchor, null);
  assert.equal(returned.getCardSelectionState(otherCard.id).manualAnchor.segmentId, segmentId);
  assert.equal(returned.manualBrowseSessionId, 42, 'Clearing one Card must preserve viewport suppression');
  returned.resumeViewportFollow();
  assert.equal(renderStore(workspaceA).manualBrowseSessionId, null);
});

test('useSharedReaderSelectionStore reducers preserve per-Unit memory, empty Units, and preview excerpts respect joinAfter', () => {
  const lookup = utils.buildCardUnitLookup(storyCard);
  const s1ViewKey = lookup.units[0].viewKey;
  const s2ViewKey = lookup.units[1].viewKey;
  const s3EmptyViewKey = lookup.units[2].viewKey;
  const wsKey = `${v2.ids.documentId}:uid`;

  let state = selectionStoreHelpers.EMPTY_CARD_SELECTION_STATE;
  state = selectionStoreHelpers.applySegmentSelectionToCardState({
    cardState: state,
    workspaceKey: wsKey,
    card: storyCard,
    lookup,
    segmentId: v2.ids.duplicateSeg2Id
  });
  assert.equal(state.manualAnchor.unitViewKey, s2ViewKey);
  assert.equal(state.manualAnchor.segmentId, v2.ids.duplicateSeg2Id);
  assert.equal(state.byUnitViewKey[s2ViewKey], v2.ids.duplicateSeg2Id);

  // Switch to empty Section 3 -> segmentId must be null, NOT borrowed from Section 2
  state = selectionStoreHelpers.applyUnitSelectionToCardState({
    cardState: state,
    workspaceKey: wsKey,
    card: storyCard,
    lookup,
    unitViewKey: s3EmptyViewKey
  });
  assert.equal(state.manualAnchor.unitViewKey, s3EmptyViewKey);
  assert.equal(state.manualAnchor.segmentId, null);

  // Return to Section 2 -> restores remembered duplicateSeg2Id
  state = selectionStoreHelpers.applyUnitSelectionToCardState({
    cardState: state,
    workspaceKey: wsKey,
    card: storyCard,
    lookup,
    unitViewKey: s2ViewKey
  });
  assert.equal(state.manualAnchor.segmentId, v2.ids.duplicateSeg2Id);

  // Return to Playing clears manualAnchor while retaining Unit segment memory
  state = selectionStoreHelpers.clearCardManualSelectionState(state);
  assert.equal(state.manualAnchor, null);
  assert.equal(state.byUnitViewKey[s2ViewKey], v2.ids.duplicateSeg2Id);
  assert.ok(s1ViewKey);

  // buildUnitPreviewExcerpt preserves joinAfter=none and joinAfter=line
  const excerpt = utils.buildUnitPreviewExcerpt({
    segments: [
      { text: 'Platform 4', joinAfter: 'none' },
      { text: '—direct express service.', joinAfter: 'line' },
      { text: 'Please board promptly.', joinAfter: 'space' }
    ]
  }, 'interlinear', 200);
  assert.equal(excerpt, 'Platform 4—direct express service.\nPlease board promptly.');
});

test('resolveSegmentCoverageStatuses preserves HF1 accuracy (only READY counts as Ready)', () => {
  const seg = storyCard.units[1].segments[0];
  const statuses = utils.resolveSegmentCoverageStatuses({
    segment: seg,
    audioCoverageMap: {
      [buildTextStructuredRuntimeAudioKey(seg.id, 'text')]: { status: TEXT_AUDIO_COVERAGE_STATUS.READY },
      [buildTextStructuredRuntimeAudioKey(seg.id, 'meaning')]: { status: TEXT_AUDIO_COVERAGE_STATUS.STALE }
    }
  });
  assert.equal(statuses.text, 'READY');
  assert.equal(statuses.meaning, 'STALE');

  const missingStatuses = utils.resolveSegmentCoverageStatuses({
    segment: storyCard.units[1].segments[1],
    audioCoverageMap: {
      [buildTextStructuredRuntimeAudioKey(storyCard.units[1].segments[1].id, 'text')]: { status: TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE }
    }
  });
  assert.equal(missingStatuses.text, 'OTHER PROFILE');
  assert.equal(missingStatuses.meaning, null);
});

test('SharedBilingualLayoutToolbar renders Level & Bilingual Layout independently and shows Part Style only in part level', () => {
  const fullTree = renderTree(mockReact.createElement(SharedBilingualLayoutToolbar, {
    presentationState: DEFAULT_TEXT_CARD_PRESENTATION_STATE,
    onChangePresentationState: () => {},
    onResetView: () => {}
  }));
  assert.equal(collectNodes(fullTree, n => Boolean(n.props?.['data-shared-card-level-option'])).length, 3);
  assert.equal(collectNodes(fullTree, n => Boolean(n.props?.['data-shared-card-layout-option'])).length, 4);
  assert.equal(collectNodes(fullTree, n => n.props?.['data-shared-part-layout-bar'] === 'true').length, 0);

  const partTree = renderTree(mockReact.createElement(SharedBilingualLayoutToolbar, {
    presentationState: { level: 'part', bilingualLayout: 'separated', partLayout: 'vertical-focus' },
    onChangePresentationState: () => {},
    onResetView: () => {}
  }));
  assert.equal(collectNodes(partTree, n => n.props?.['data-shared-part-layout-bar'] === 'true').length, 1);
  assert.equal(collectNodes(partTree, n => Boolean(n.props?.['data-shared-card-part-layout-option'])).length, 3);
  assert.equal(collectNodes(partTree, n => n.props?.['data-shared-card-reset-view'] === 'true').length, 1);
});

test('Part View renders all 3 styles (Horizontal Focus, Vertical Focus, Vertical List), preserves empty & v1 compat, and keeps logical sentence indices', () => {
  for (const partLayout of ['horizontal-focus', 'vertical-focus', 'vertical-list']) {
    resetHooks();
    const tree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
      card: storyCard,
      index: 1,
      workspace: v2Pres.workspace,
      presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout },
      playbackCursor: {
        sessionId: 2,
        state: 'playing',
        precision: 'segment',
        cardId: storyCard.id,
        segmentId: v2.ids.duplicateSeg2Id,
        channel: 'text'
      },
      audioCoverageMap: v2.audioCoverageMap
    }));

    assert.ok(collectNodes(tree, n => n.props?.['data-shared-part-layout'] === partLayout).length === 1, `Missing layout ${partLayout}`);
    const sectionSegments = collectNodes(tree, n => Boolean(n.props?.['data-shared-card-segment-index'] || n.props?.['data-shared-card-index']));
    assert.ok(sectionSegments.some(n => n.props['data-shared-card-index'] === 5), `${partLayout} must keep logical sentence index #5 on Section 2`);

    if (partLayout === 'vertical-focus') {
      assert.equal(collectNodes(tree, n => n.props?.['data-shared-part-neighbor'] === 'previous').length, 1);
      assert.equal(collectNodes(tree, n => n.props?.['data-shared-part-neighbor'] === 'next').length, 1);
    }
    if (partLayout === 'vertical-list') {
      assert.equal(collectNodes(tree, n => n.props?.['data-shared-part-audible'] === 'true').length, 1);
    }
  }

  // Zero-unit card explicit empty state + v1 compat badge
  resetHooks();
  const emptyTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: emptyCard,
    index: 3,
    workspace: v2Pres.workspace,
    presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout: 'vertical-focus' }
  }));
  assert.equal(collectNodes(emptyTree, n => n.props?.['data-shared-part-empty'] === 'zero-units').length, 1);

  resetHooks();
  const compatTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: v1StoryCard,
    index: 1,
    workspace: v1Pres.workspace,
    presentationState: { level: 'part', bilingualLayout: 'interlinear', partLayout: 'horizontal-focus' }
  }));
  assert.equal(collectNodes(compatTree, n => n.props?.['data-shared-part-compat-badge'] === 'true').length, 1);
});

test('Segment Study Box keeps primary reading context, bilingual Study Box, HF1 coverage honesty, Cached Full Card honesty, and Missing Meaning empty notice', () => {
  const layouts = ['interlinear', 'separated', 'text-only', 'meaning-only'];
  for (const bilingualLayout of layouts) {
    resetHooks();
    const tree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
      card: storyCard,
      index: 1,
      workspace: v2Pres.workspace,
      presentationState: { level: 'segment', bilingualLayout, partLayout: 'horizontal-focus' },
      focusTarget: {
        documentId: v2.ids.documentId,
        blockId: storyCard.id,
        segmentId: v2.ids.missingMeaningSegId,
        nonce: 5
      },
      audioCoverageMap: v2.audioCoverageMap
    }));

    const studyBoxes = collectNodes(tree, n => n.props?.['data-shared-segment-study-box'] === storyCard.id);
    assert.equal(studyBoxes.length, 1, `Exactly one Study Box per Card in layout ${bilingualLayout}`);
    const contextNodes = collectNodes(tree, n => n.props?.['data-shared-segment-context'] === storyCard.id);
    assert.equal(contextNodes.length, 1, `Complete reading context rendered above Study Box in layout ${bilingualLayout}`);
    assert.equal(
      contextNodes[0].props['data-shared-segment-context-channel'],
      bilingualLayout === 'meaning-only' ? 'meaning' : 'text'
    );
    const focusNode = collectNodes(tree, n => n.props?.['data-shared-segment-focus'] === v2.ids.missingMeaningSegId);
    assert.equal(focusNode.length, 1, `Segment Study Box missing target in layout ${bilingualLayout}`);
    const textBlocks = collectNodes(tree, n => n.props?.['data-shared-segment-channel-block'] === 'text');
    const meaningBlocks = collectNodes(tree, n => n.props?.['data-shared-segment-channel-block'] === 'meaning');
    assert.equal(textBlocks.length, 1, 'Study Box always renders EN channel block');
    assert.equal(meaningBlocks.length, 1, 'Study Box always renders ID channel block');
    assert.ok(extractText(meaningBlocks[0]).includes('No Indonesian meaning for this sentence.'));
  }

  // Cached Full Card notice + zero fake active sentence
  resetHooks();
  const fullAudioSegTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: storyCard,
    index: 1,
    workspace: v2Pres.workspace,
    presentationState: { level: 'segment', bilingualLayout: 'interlinear', partLayout: 'horizontal-focus' },
    playbackCursor: {
      sessionId: 9,
      state: 'playing',
      precision: 'card',
      cardId: storyCard.id,
      segmentId: null,
      channel: 'text'
    },
    audioCoverageMap: v2.audioCoverageMap
  }));
  assert.equal(collectNodes(fullAudioSegTree, n => n.props?.['data-shared-segment-full-notice'] === 'true').length, 1);
  const buttons = collectNodes(fullAudioSegTree, n => n.props?.['data-shared-card-segment'] !== undefined);
  assert.equal(buttons.filter(b => b.props['data-shared-segment-active'] === 'true').length, 0);

  // Zero-segment empty state
  resetHooks();
  const emptySegTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: emptyCard,
    index: 3,
    workspace: v2Pres.workspace,
    presentationState: { level: 'segment', bilingualLayout: 'interlinear', partLayout: 'horizontal-focus' }
  }));
  assert.equal(collectNodes(emptySegTree, n => n.props?.['data-shared-segment-empty'] === 'true').length, 1);
});

test('4C1 Per-Unit Separated, ID-EN reversal, single Workspace Contextual target, Segment capability rules, and Appearance typography', () => {
  // 1. Per-Unit Separated renders primary -> secondary WITHIN each authored Unit (not card-level separated)
  resetHooks();
  const sepTree = renderTree(mockReact.createElement(SharedCardReadingSurface, {
    card: storyCard,
    index: 1,
    workspace: v2Pres.workspace,
    presentationState: {
      level: 'full',
      readingLanguage: 'id-en',
      bilingualStyle: 'separated',
      appearance: {
        primaryFontSize: 'lg',
        secondaryFontSize: 'md',
        fontFamily: 'serif',
        lineHeight: 'loose',
        translationContrast: 'high',
        textSpacing: 'relaxed'
      }
    }
  }));
  const unitBlocks = collectNodes(sepTree, n => Boolean(n.props?.['data-shared-unit-separated']));
  assert.equal(unitBlocks.length, 2, 'Two non-empty Sections must each render their own per-Unit separated block');
  const firstUnitBodies = collectNodes(unitBlocks[0], n => n.props?.['data-shared-reading-body'] === 'true');
  assert.equal(firstUnitBodies.length, 2, 'Each authored Unit has primary followed by secondary');
  assert.equal(firstUnitBodies[0].props['data-shared-reading-channel'], 'meaning', 'ID-EN puts ID primary first inside Unit 1');
  assert.equal(firstUnitBodies[1].props['data-shared-reading-channel'], 'text', 'ID-EN puts EN secondary second inside Unit 1');
  assert.ok(String(firstUnitBodies[0].props.style?.fontFamily).includes('Georgia'), 'Serif font family must apply');
  assert.equal(firstUnitBodies[0].props.style?.lineHeight, '2', 'Loose line height must apply');

  // 2. resolveWorkspaceContextualTarget maintains ONE target, restores prior manual after transient Search,
  //    ignores untimed Full Audio, and flags divergence from Split playback
  const wsKey = `${v2.ids.documentId}:uid`;
  const manualSel = {
    workspaceKey: wsKey,
    cardId: storyCard.id,
    unitViewKey: storyCard.units[0].viewKey,
    segmentId: v2.ids.longSegId,
    pinnedManual: true
  };
  const splitPlayingCursor = {
    workspaceId: v2.ids.documentId,
    sessionId: 19,
    state: 'playing',
    precision: 'segment',
    cardId: storyCard.id,
    segmentId: v2.ids.duplicateSeg2Id,
    channel: 'text'
  };
  // Transient search reveals searched segment without mutating manualSel
  const ctxSearch = utils.resolveWorkspaceContextualTarget({
    cards: v2Pres.cards,
    cursor: splitPlayingCursor,
    focusTarget: { documentId: v2.ids.documentId, blockId: storyCard.id, segmentId: v2.ids.missingMeaningSegId, nonce: 77 },
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    activeContextualSelection: manualSel
  });
  assert.equal(ctxSearch.source, 'search');
  assert.equal(ctxSearch.target.segmentId, v2.ids.missingMeaningSegId);
  assert.equal(ctxSearch.divergedFromAudible, true);

  // Consuming search restores prior manual selection intact even while Split audio plays elsewhere
  const ctxRestored = utils.resolveWorkspaceContextualTarget({
    cards: v2Pres.cards,
    cursor: splitPlayingCursor,
    focusTarget: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    activeContextualSelection: manualSel
  });
  assert.equal(ctxRestored.source, 'manual');
  assert.equal(ctxRestored.target.segmentId, v2.ids.longSegId);
  assert.equal(ctxRestored.divergedFromAudible, true);
  assert.equal(ctxRestored.audibleTarget.segmentId, v2.ids.duplicateSeg2Id);

  // Clearing manual selection (Return to Playing) follows Split audio immediately
  const ctxAudible = utils.resolveWorkspaceContextualTarget({
    cards: v2Pres.cards,
    cursor: splitPlayingCursor,
    focusTarget: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    activeContextualSelection: null
  });
  assert.equal(ctxAudible.source, 'audible');
  assert.equal(ctxAudible.target.segmentId, v2.ids.duplicateSeg2Id);
  assert.equal(ctxAudible.divergedFromAudible, false);

  // Untimed Full Audio (precision='card') NEVER fabricates an active Segment
  const ctxFullAudio = utils.resolveWorkspaceContextualTarget({
    cards: v2Pres.cards,
    cursor: { ...splitPlayingCursor, precision: 'card', segmentId: null },
    focusTarget: null,
    workspaceId: v2.ids.documentId,
    workspaceKey: wsKey,
    activeContextualSelection: null
  });
  assert.equal(ctxFullAudio.isCardPrecisionPlaying, true);
  assert.equal(ctxFullAudio.target, null, 'Untimed Full Audio must never fabricate a Contextual Segment');
  assert.equal(ctxFullAudio.audibleTarget, null);

  // 3. Toolbar exposes Reading Language (4) & Bilingual Style (3, NO Notebook) and disables Separated/Contextual in Segment Mode
  resetHooks();
  const segToolbarTree = renderTree(mockReact.createElement(SharedBilingualLayoutToolbar, {
    readerMode: 'segment',
    presentationState: { level: 'segment', readingLanguage: 'en-id', bilingualStyle: 'contextual', contextualPlacement: 'above' },
    onChangePresentationState: () => {},
    onChangeReaderMode: () => {},
    onResetView: () => {}
  }));
  assert.equal(collectNodes(segToolbarTree, n => Boolean(n.props?.['data-shared-reading-language-option'])).length, 4);
  const styleBtns = collectNodes(segToolbarTree, n => Boolean(n.props?.['data-shared-bilingual-style-option']));
  assert.deepEqual(styleBtns.map(b => b.props['data-shared-bilingual-style-option']), ['separated', 'interlinear', 'contextual']);
  assert.equal(styleBtns.find(b => b.props['data-shared-bilingual-style-option'] === 'separated').props.disabled, true);
  assert.equal(styleBtns.find(b => b.props['data-shared-bilingual-style-option'] === 'contextual').props.disabled, true);
  assert.equal(styleBtns.find(b => b.props['data-shared-bilingual-style-option'] === 'interlinear').props.disabled, false);
  assert.equal(collectNodes(segToolbarTree, n => n.props?.['data-shared-bilingual-fallback-notice'] === 'true').length, 1);
  assert.equal(collectNodes(segToolbarTree, n => n.props?.['data-shared-contextual-placement-bar'] === 'true').length, 0);
});

assert.equal(dbCalls, 0);
console.log(`ALL A3 NODE CHECKS PASSED (${passed}/${passed})`);
