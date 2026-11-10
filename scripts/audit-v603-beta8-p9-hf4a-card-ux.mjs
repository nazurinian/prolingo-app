import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEXT_CARD_EXPANSION_MODES as MODE,
  normalizeTextCardExpansionMode,
  resolveActiveTextCardId,
  resolveExpandedTextCardIds,
  toggleTextCardExpandedId
} from '../src/domain/text/textStructuredCardExpansionDomain.js';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  normalizeTextStructuredPreferences
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import { APP_VERSION, APP_CHECKPOINT_ID } from '../src/constants/appMetadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const player = read('src/components/text/TextStructuredPlayer.jsx');
const paragraph = read('src/components/text/TextParagraphUnifiedReading.jsx');
const app = read('src/App.jsx');
const fullSession = read('src/services/playback/textStructuredPlaybackSessionService.js');
const blocks = [
  { id: 'C1', segments: [{ id: 'S1' }, { id: 'S2' }] },
  { id: 'C2', segments: [{ id: 'S3' }] },
  { id: 'C3', segments: [{ id: 'S4' }] }
];
let passed = 0;
const check = (description, fn) => { fn(); passed += 1; console.log(`PASS ${passed}: ${description}`); };

check('Legacy preferences safely default to Follow Playback', () => {
  assert.equal(DEFAULT_TEXT_STRUCTURED_PREFERENCES.cardExpansionMode, MODE.FOLLOW);
  assert.equal(normalizeTextStructuredPreferences({ playbackChannelMode: 'text-meaning' }).cardExpansionMode, MODE.FOLLOW);
  assert.equal(normalizeTextCardExpansionMode('unknown'), MODE.FOLLOW);
});
check('New expansion mode persists through existing preference normalization', () => {
  for (const mode of Object.values(MODE)) assert.equal(normalizeTextStructuredPreferences({ cardExpansionMode: mode }).cardExpansionMode, mode);
});
check('Split follows playingIndex only (sentence highlight cursor)', () => {
  assert.equal(resolveActiveTextCardId({ blocks, playingIndex: 'S1', activeCursorSegmentId: 'S3', isSessionActive: true }), 'C1');
  assert.equal(resolveActiveTextCardId({ blocks, playingIndex: null, activeCursorSegmentId: 'S3', isSessionActive: true }), null);
});
check('Full uses currentIndex cursor even when playingIndex is deliberately null', () => {
  assert.equal(resolveActiveTextCardId({ blocks, playingIndex: null, activeCursorSegmentId: 'S3', playbackRepresentationMode: 'full', isSessionActive: true }), 'C2');
  assert.equal(resolveActiveTextCardId({ blocks, playingIndex: 'S1', activeCursorSegmentId: 'S4', playbackRepresentationMode: 'full', isSessionActive: true }), 'C3');
});
check('Stop and non-Text sessions have no active-card highlight', () => {
  assert.equal(resolveActiveTextCardId({ blocks, playingIndex: 'S2', activeCursorSegmentId: 'S2', isSessionActive: false }), null);
});
check('Follow Playback opens only active, then preserves the last card after Stop', () => {
  const playing = resolveExpandedTextCardIds({ mode: MODE.FOLLOW, blocks, activeBlockId: 'C2', lastActiveBlockId: 'C1' });
  assert.deepEqual([...playing], ['C2']);
  const stopped = resolveExpandedTextCardIds({ mode: MODE.FOLLOW, blocks, activeBlockId: null, lastActiveBlockId: 'C2' });
  assert.deepEqual([...stopped], ['C2']);
});
check('Expand All opens every card', () => {
  assert.deepEqual([...resolveExpandedTextCardIds({ mode: MODE.ALL, blocks })], ['C1','C2','C3']);
});
check('Custom preserves manual selections and supports opening and closing', () => {
  const open = resolveExpandedTextCardIds({ mode: MODE.CUSTOM, blocks, customExpandedIds: new Set(['C1','C3']) });
  assert.deepEqual([...open], ['C1','C3']);
  assert.deepEqual([...toggleTextCardExpandedId(open,'C1')], ['C3']);
  assert.deepEqual([...toggleTextCardExpandedId(open,'C2')], ['C1','C3','C2']);
});
check('Expansion mode toolbar and manual click→Custom are wired', () => {
  assert.match(player, /data-text-card-expansion-toolbar="true"/);
  for (const label of ['Follow Playback','Expand All','Custom']) assert.ok(player.includes(label),label);
  assert.match(player, /onToggleCardExpanded=\{onToggleCardExpanded\}/);
  assert.match(player, /cardExpansionMode: TEXT_CARD_EXPANSION_MODES\.CUSTOM/);
  assert.match(player, /lastActiveBlockId/);
  assert.match(player, /lastProcessedActiveBlockIdRef\.current === activeBlockId/);
  assert.match(player, /A mode change alone must not reopen a Card/);
});
check('Full active-card cursor is passed without audio-session changes', () => {
  assert.match(app, /activeCursorSegmentId=\{playbackContextRef\.current\?\.context/);
  assert.match(app, /activeSessionRepresentationMode=\{playbackContextRef\.current\?\.context/);
  assert.match(player, /effectiveRepresentationMode = structuredSessionActive && activeSessionRepresentationMode/);
  assert.match(app, /playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES\.SPLIT/);
  assert.match(player, /resolveActiveTextCardId\(/);
  assert.match(player, /isActiveCard=\{activeBlockId === block\.id\}/);
  assert.match(fullSession, /setPlayingIndex\(step\.highlight \?/);
  assert.match(fullSession, /setCurrentIndex\(step\.segmentId \|\| item\?\.id \|\| null\)/);
});
check('Full channel highlight is separate from Split sentence highlight', () => {
  assert.match(player, /activeSegmentId=\{isActiveCard && !isFullRepresentation \? playingIndex : null\}/);
  assert.match(player, /fullCardActive=\{isActiveCard && isFullRepresentation\}/);
  assert.match(paragraph, /data-text-full-active=/);
  assert.match(paragraph, /activeMeaningOnly && !fullCardActive/);
});
check('HF4-A version metadata and package versions agree', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[''].version, APP_VERSION);
  assert.equal(APP_VERSION, '6.0.3-beta.8-p9-hf4a');
  assert.equal(APP_CHECKPOINT_ID, 'V6.0.3-BETA8-P9-HF4A-CARD-UX');
});
check('HF3 mobile header + CSV picker regression stays intact', () => {
  const header = read('src/components/layout/Header.jsx');
  const shell = read('src/components/layout/MainAppShellView.jsx');
  const mobile = read('src/components/controls/MobileDataControls.jsx');
  const desktop = read('src/components/controls/DesktopDataActions.jsx');
  const landing = read('src/components/landing/LandingPage.jsx');
  assert.match(header, /data-csv-import-input="true"/);
  assert.match(header, /ref=\{csvInputRef\}[^>]+onChange=\{handleCSVUpload\}/);
  assert.doesNotMatch(desktop, /ref=\{csvInputRef\}/);
  assert.match(shell, /<Header\b[\s\S]*?csvInputRef=\{csvInputRef\}[\s\S]*?handleCSVUpload=\{handleCSVUpload\}/);
  assert.match(mobile, /onClick=\{\(\) => csvInputRef\.current\?\.click\(\)\}/);
  assert.match(landing, /hidden md:inline text-indigo-500/);
});
check('Edge TTS lock and HF2 global playback state are retained', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const bottomBar = read('src/components/layout/BottomPlayerBar.jsx');
  assert.equal(pkg.dependencies['msedge-tts'], '^2.1.1');
  assert.equal(lock.packages['node_modules/msedge-tts']?.version, '2.1.1');
  assert.match(bottomBar, /data-text-global-player-controls="true"/);
  assert.match(bottomBar, /LOCAL FIRST/);
  assert.match(bottomBar, /TTS ONLY/);
});
console.log(`HF4-A source + state audit: ${passed}/${passed} PASS`);
