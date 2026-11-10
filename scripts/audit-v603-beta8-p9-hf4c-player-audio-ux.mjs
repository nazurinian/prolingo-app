import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES as DEFAULT,
  TEXT_STRUCTURED_MANUAL_INHERIT_GLOBAL as FOLLOW,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES as CHANNEL,
  normalizeTextStructuredPreferences,
  resolveTextStructuredManualPlaybackProfile
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  TEXT_CARD_EXPANSION_MODES as EXPAND,
  resolveActiveTextCardId,
  resolveExpandedTextCardIds
} from '../src/domain/text/textStructuredCardExpansionDomain.js';
import { APP_VERSION, APP_CHECKPOINT_ID } from '../src/constants/appMetadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('src/App.jsx');
const card = read('src/components/text/TextStructuredPlayer.jsx');
const paragraph = read('src/components/text/TextParagraphUnifiedReading.jsx');
const settings = read('src/components/text/TextStructuredPlaybackControls.jsx');
const audio = read('src/components/text/TextStructuredAudioControls.jsx');
const library = read('src/components/text/TextAudioDataPanel.jsx');
const session = read('src/services/playback/textStructuredPlaybackSessionService.js');
const metadata = read('src/constants/appMetadata.js');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
let pass = 0;
const test = (name, fn) => { fn(); console.log(`PASS ${++pass}: ${name}`); };

test('HF4-C package, lock and app metadata match; msedge-tts remains unchanged', () => {
  assert.equal(APP_VERSION, '6.0.3-beta.8-p9-hf4c');
  assert.equal(APP_CHECKPOINT_ID, 'V6.0.3-BETA8-P9-HF4C-PLAYER-AUDIO-UX');
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[''].version, APP_VERSION);
  assert.equal(pkg.dependencies['msedge-tts'], '^2.1.1');
  assert.equal(lock.packages['node_modules/msedge-tts'].version, '2.1.1');
});
test('HF4-A expansion policy and Stop preservation remain unchanged', () => {
  const blocks = [{id:'C1',segments:[{id:'S1'}]},{id:'C2',segments:[{id:'S2'}]}];
  assert.equal(resolveActiveTextCardId({blocks,playingIndex:null,activeCursorSegmentId:'S2',playbackRepresentationMode:'full',isSessionActive:true}),'C2');
  assert.deepEqual([...resolveExpandedTextCardIds({mode:EXPAND.FOLLOW,blocks,activeBlockId:null,lastActiveBlockId:'C2'})],['C2']);
  assert.match(card,/data-text-card-expansion-toolbar="true"/);
});
test('Full highlights TEXT contents, not just its surrounding panel', () => {
  assert.match(paragraph,/data-text-full-text-highlight=/);
  assert.match(paragraph,/const classes = fullChannelHighlighted/);
  assert.ok(paragraph.includes("channel === 'meaning' ? 'bg-emerald-200/80"));
  assert.match(paragraph,/fullChannelHighlighted=\{fullCardActive && speakingPart === 'text'\}/);
  assert.match(paragraph,/fullChannelHighlighted=\{fullCardActive && speakingPart === 'meaning'\}/);
  assert.match(card,/activeSegmentId=\{isActiveCard && !isFullRepresentation \? playingIndex : null\}/);
  assert.match(session,/setPlayingIndex\(step\.highlight \?/);
});
test('Header quick-play controls exist for EN and ID with explicit labels', () => {
  assert.match(paragraph,/data-text-paragraph-play-channel="text"/);
  assert.match(paragraph,/data-text-paragraph-play-channel="meaning"/);
  assert.match(paragraph,/Play EN/);
  assert.match(paragraph,/Play ID/);
});
test('Quick-play uses one-shot Card scope with channel override; no persisted preference writes', () => {
  assert.match(card,/onPlayChannel=\{channel => onPlayCard\?\.\(block\.id/);
  assert.match(app,/handleStructuredTextPlayCard = \(blockId, channelOverride = null\)/);
  assert.match(app,/requestedChannel === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES\.TEXT_ONLY/);
  assert.match(app,/requestedChannel === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES\.MEANING_ONLY/);
  assert.match(app,/scope: TEXT_STRUCTURED_PLAYBACK_SCOPES\.CARD,\s*playbackChannelMode: oneShotChannel/);
  assert.doesNotMatch(app.slice(app.indexOf('const handleStructuredTextPlayCard ='),app.indexOf('const handleStructuredTextStartFromSegment =')),/onPlaybackFeelChange|setTextStructuredPreferences/);
});
test('Legacy manual defaults remain explicit and separate', () => {
  assert.equal(DEFAULT.manualCardPlaybackChannelMode,CHANNEL.TEXT_ONLY);
  assert.equal(DEFAULT.manualSegmentPlaybackChannelMode,CHANNEL.TEXT_ONLY);
  const legacy=normalizeTextStructuredPreferences({playbackChannelMode:CHANNEL.MEANING_ONLY,manualCardPlaybackChannelMode:CHANNEL.TEXT_ONLY});
  assert.equal(resolveTextStructuredManualPlaybackProfile(legacy,'card').playbackChannelMode,CHANNEL.TEXT_ONLY);
});
test('Optional Follow Global manual mode is explicit, persisted and resolved', () => {
  const p=normalizeTextStructuredPreferences({playbackChannelMode:CHANNEL.MEANING_THEN_TEXT,manualCardPlaybackChannelMode:FOLLOW,manualSegmentPlaybackChannelMode:FOLLOW});
  assert.equal(p.manualCardPlaybackChannelMode,FOLLOW);
  assert.equal(resolveTextStructuredManualPlaybackProfile(p,'card').playbackChannelMode,CHANNEL.MEANING_THEN_TEXT);
  assert.equal(resolveTextStructuredManualPlaybackProfile(p,'segment').playbackChannelMode,CHANNEL.MEANING_THEN_TEXT);
  assert.match(card,/resolveTextStructuredManualPlaybackProfile\(playbackPreferences, 'card'\)/);
  assert.match(card,/resolveTextStructuredManualPlaybackProfile\(playbackPreferences, 'segment'\)/);
});
test('Player Settings has 3 navigable tabs and retains existing callbacks', () => {
  assert.match(settings,/data-text-player-settings-tabs="true"/);
  for(const word of ['Playback','Manual Play','Display','Global Playback Behaviour','When playback is stopped']) assert.ok(settings.includes(word),word);
  for(const prop of ['onPlaybackRepresentationModeChange','onPlaybackChannelModeChange','onGlobalTtsOnlyChange','onGlobalPlaybackOrderChange','onPlaybackFeelChange','onDisplayModeChange']) assert.ok(settings.includes(prop),prop);
  assert.match(settings,/data-text-global-tts-only="true"/);
  assert.match(settings,/data-text-global-playback-order-editor="true"/);
});
test('Short option selectors now use one-tap buttons; delay presets preserve millisecond inputs', () => {
  assert.match(settings,/const ChoiceGroup =/);
  assert.match(settings,/aria-pressed=\{value === optionValue\}/);
  assert.match(settings,/const DELAY_PRESETS = \[0, 500, 1000, 2000\]/);
  assert.match(settings,/onPlaybackFeelChange\?\.\(\{ channelDelayMs: value \}\)/);
  assert.match(settings,/onPlaybackFeelChange\?\.\(\{ segmentDelayMs: value \}\)/);
});
test('Audio sidebar is split into Playback Voices / Generate Audio / Audio Library', () => {
  for(const label of ['Playback Voices','Generate Audio','Audio Library']) assert.ok(audio.includes(label));
  assert.match(audio,/\[\['playback', 'Playback Voices'\], \['download', 'Generate Audio'\], \['library', 'Audio Library'\]\]/);
  assert.match(audio,/data-text-playback-audio-settings="true"/);
  assert.match(audio,/data-text-download-defaults="true"/);
  assert.match(audio,/data-text-audio-library-surface="true"/);
});
test('Voice priority is present and wired to the same app-global preference callbacks', () => {
  assert.match(audio,/data-text-audio-local-voice-priority="true"/);
  assert.match(audio,/PlaybackProfileOrderEditor channel="text"/);
  assert.match(audio,/PlaybackProfileOrderEditor channel="meaning"/);
  assert.match(app,/onGlobalPlaybackOrderChange: handleStructuredTextGlobalPlaybackOrderChange/);
  assert.match(settings,/first Ready local voice is used/);
});
test('TTS Only remains a single global source; Generate is independent from playback', () => {
  assert.match(audio,/data-text-global-tts-status="true"/);
  assert.doesNotMatch(audio, /onGlobalTtsOnlyChange\?\.\(/);
  assert.match(audio,/onGenerationPreferencesChange/);
  assert.match(audio,/onDocumentDownloadModeChange/);
  assert.match(metadata,/Text DB v1/);
});
test('Audio inventory explains History versus Ready, and ZIP remains in Library', () => {
  assert.match(library,/data-text-audio-history-explanation="true"/);
  assert.match(library,/History.*local binary may be absent/);
  assert.match(audio,/audioSurface === 'library'/);
  assert.match(audio,/<TextAudioDataPanel audioLibrary=\{audioLibrary\}/);
});
test('HF3 mobile CSV and bottom Global Player remain untouched', () => {
  const header=read('src/components/layout/Header.jsx');
  const bottom=read('src/components/layout/BottomPlayerBar.jsx');
  assert.match(header,/data-csv-import-input="true"/);
  assert.match(bottom,/data-text-global-player-controls="true"/);
  assert.match(bottom,/LOCAL FIRST/);
  assert.match(bottom,/TTS ONLY/);
  assert.match(bottom,/displayPlayingIndex = \(isPlaying \|\| isPaused\)/);
  assert.match(app,/textActiveCursorSegmentId: playingContext === TEXT_STRUCTURED_PLAYBACK_CONTEXT/);
});
console.log(`HF4-C targeted source + domain audit: ${pass}/${pass} PASS`);
