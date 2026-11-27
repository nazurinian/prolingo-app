import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTextStructuredAudioPlaybackOrderMetadata,
  buildTextStructuredGlobalAudioPlaybackOrderPreference,
  getTextStructuredGlobalAudioPlaybackOrder,
  resolveTextStructuredEffectivePlaybackOrder,
  resolveTextStructuredEffectiveTtsOnly
} from '../src/domain/text/textStructuredAudioPlaybackOrderDomain.js';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  normalizeTextStructuredPreferences
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import { resolveBrowserTtsVoiceState, isLikelyUkFemaleBrowserVoice } from '../src/domain/audio/browserTtsVoiceDecisionDomain.js';
import {
  TEXT_STRUCTURED_GENERATION_DEFAULTS,
  TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION,
  normalizeTextStructuredAudioGenerationPreferences
} from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import { resolveTextStructuredRuntimePlaybackOrder } from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { loadTextStructuredAudioGenerationPreferences } from '../src/services/persistence/textStructuredAudioGenerationPreferenceService.js';
import { resolveTextStructuredBrowserVoiceState } from '../src/domain/text/textStructuredVoiceDomain.js';

let pass = 0, fail = 0;
const voiceOnly = process.argv.includes('--voice-policy');
const check = (name, fn, voicePolicy = false) => {
  if (voiceOnly && !voicePolicy) return;
  try { fn(); pass++; console.log(`PASS ${name}`); }
  catch (error) { fail++; console.error(`FAIL ${name} (${error.code || error.name})`); }
};
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/App.jsx');
const bottom = read('src/components/layout/BottomPlayerBar.jsx');
const playerControls = read('src/components/text/TextStructuredPlaybackControls.jsx');
const audioControls = read('src/components/text/TextStructuredAudioControls.jsx');
const cardAudio = read('src/components/text/TextStructuredCardAudioPanel.jsx');
const prefService = read('src/services/persistence/textStructuredPreferenceService.js');
const mainState = read('src/hooks/useMainAppPrimaryState.js');
const bulkExportSource = read('src/domain/text/textStructuredBulkExportDomain.js');
const runtimeSource = read('src/domain/text/textStructuredRuntimePlaybackPlanDomain.js');
const runtimeStatusSource = read('src/domain/text/textStructuredAudioRuntimeDomain.js');
const metadata = read('src/constants/appMetadata.js');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

const legacyDocumentMetadata = buildTextStructuredAudioPlaybackOrderMetadata({
  metadata: {}, channel: 'text', profiles: ['en-GB-MaisieNeural']
});
const documentA = { id: 'DOC_A', metadata: legacyDocumentMetadata };
const documentB = { id: 'DOC_B', metadata: {} };
const block = { id: 'BLOCK_A', metadata: {} };
const globalPrefs = buildTextStructuredGlobalAudioPlaybackOrderPreference({
  preferences: DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  channel: 'text',
  profiles: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural']
});
const globalOrder = getTextStructuredGlobalAudioPlaybackOrder(globalPrefs);

check('Split remains the normalized global default representation', () => {
  assert.equal(DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackRepresentationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT);
  assert.equal(normalizeTextStructuredPreferences({}).playbackRepresentationMode, 'split');
});

check('Global EN order is stored in Structured Text preferences, not Document metadata', () => {
  assert.deepEqual(globalOrder.channels.text.map(item => item.voiceId), ['en-GB-SoniaNeural', 'en-GB-LibbyNeural']);
  assert.equal(globalOrder.ttsOnly, null);
  assert.match(prefService, /localStorage\.setItem\(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY/);
});

check('Effective precedence is Card override > Global > legacy Document > compatibility fallback', () => {
  const cardMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: {}, channel: 'text', profiles: ['en-GB-LibbyNeural'] });
  let order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: documentA, block: { ...block, metadata: cardMeta }, channel: 'text', globalProfiles: globalOrder.channels.text, fallbackProfiles: ['en-GB-RyanNeural'] });
  assert.equal(order.source, 'card-order');
  assert.equal(order.profiles[0].voiceId, 'en-GB-LibbyNeural');
  order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: documentA, block, channel: 'text', globalProfiles: globalOrder.channels.text, fallbackProfiles: ['en-GB-RyanNeural'] });
  assert.equal(order.source, 'global-order');
  assert.equal(order.profiles[0].voiceId, 'en-GB-SoniaNeural');
  order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: documentA, block, channel: 'text', globalProfiles: [], fallbackProfiles: ['en-GB-RyanNeural'] });
  assert.equal(order.source, 'document-order-legacy');
  order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: documentB, block, channel: 'text', globalProfiles: [], fallbackProfiles: ['en-GB-RyanNeural'] });
  assert.equal(order.source, 'compatibility-fallback');
});

check('The same Global order wins across different Documents', () => {
  const a = resolveTextStructuredRuntimePlaybackOrder({ documentTree: documentA, block, channel: 'text', globalPlaybackOrder: globalOrder, fallbackVoiceId: 'en-GB-RyanNeural' });
  const b = resolveTextStructuredRuntimePlaybackOrder({ documentTree: documentB, block, channel: 'text', globalPlaybackOrder: globalOrder, fallbackVoiceId: 'en-GB-RyanNeural' });
  assert.equal(a.source, 'global-order');
  assert.equal(b.source, 'global-order');
  assert.deepEqual(a.profiles.map(item => item.voiceId), b.profiles.map(item => item.voiceId));
});

check('Legacy Document TTS Only cannot silently alter normal global runtime', () => {
  const metadataWithTts = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: legacyDocumentMetadata, ttsOnly: true });
  const normal = resolveTextStructuredEffectiveTtsOnly({ documentTree: { ...documentA, metadata: metadataWithTts }, block, globalTtsOnly: false });
  assert.deepEqual(normal, { enabled: false, source: 'global' });
  const legacy = resolveTextStructuredEffectiveTtsOnly({ documentTree: { ...documentA, metadata: metadataWithTts }, block, globalTtsOnly: false, allowLegacyMetadata: true });
  assert.equal(legacy.enabled, true);
  assert.equal(legacy.source, 'document-legacy');
});

check('Global TTS Only remains one preference source through audioSourceMode', () => {
  const prefs = normalizeTextStructuredPreferences({ audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY });
  assert.equal(prefs.audioSourceMode, 'tts-only');
  assert.deepEqual(resolveTextStructuredEffectiveTtsOnly({ globalTtsOnly: true }), { enabled: true, source: 'global' });
  assert.match(app, /handleStructuredTextGlobalTtsOnlyChange/);
  assert.match(app, /audioSourceMode:\s*enabled \? TEXT_STRUCTURED_AUDIO_SOURCE_MODES\.TTS_ONLY : TEXT_STRUCTURED_AUDIO_SOURCE_MODES\.LOCAL_FIRST/);
});

check('Global order handler updates preferences and does not write active Document metadata', () => {
  const handler = app.match(/const handleStructuredTextGlobalPlaybackOrderChange[\s\S]*?\n\s*}, \[forceStopAll, addLog\]\);/)?.[0] || '';
  assert.match(handler, /setTextStructuredPreferences/);
  assert.match(handler, /buildTextStructuredGlobalAudioPlaybackOrderPreference/);
  assert.doesNotMatch(handler, /UPDATE_DOCUMENT/);
});

check('Runtime Split/Full fallback and readiness paths receive the true Global order', () => {
  assert.match(runtimeSource, /globalPlaybackOrder/);
  assert.match(runtimeSource, /globalProfiles:\s*globalPlaybackOrder\?\.channels/);
  assert.match(runtimeStatusSource, /globalProfiles:\s*globalPlaybackOrder\?\.channels\?\.\[channel\]/);
  assert.match(app, /globalPlaybackOrder:\s*structuredTextGlobalAudioPlaybackOrder/);
});

check('Preferred Bulk export resolves through the true Global playback order', () => {
  assert.match(bulkExportSource, /globalPlaybackOrder/);
  assert.match(bulkExportSource, /globalProfiles:\s*globalPlaybackOrder\?\.channels\?\.\[channel\]/);
});

check('Chrome-style Browser EN selects Google UK English Female deterministically', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English' },
    { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'Google UK English Male' },
    { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'Google UK English Female' }
  ];
  const state = resolveBrowserTtsVoiceState(voices, { userAgent: 'Chrome/140' });
  assert.equal(state.defaultEng.name, 'Google UK English Female');
  assert.equal(isLikelyUkFemaleBrowserVoice(state.defaultEng), true);
}, true);

check('Browser EN gracefully falls back to another en-GB voice when no female-labelled voice exists', () => {
  const state = resolveBrowserTtsVoiceState([
    { name: 'English US', lang: 'en-US' },
    { name: 'British English', lang: 'en-GB' }
  ]);
  assert.equal(state.defaultEng.lang, 'en-GB');
}, true);

check('Normal/manual Edge defaults are Sonia EN and Gadis ID', () => {
  const prefs = normalizeTextStructuredAudioGenerationPreferences({});
  assert.equal(TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION, 2);
  assert.equal(prefs.edgeTextVoiceId, 'en-GB-SoniaNeural');
  assert.equal(prefs.edgeMeaningVoiceId, 'id-ID-GadisNeural');
  assert.match(mainState, /setEdgeVoice\] = useState\(DEFAULT_EDGE_EN_VOICE_ID\)/);
  assert.match(mainState, /setEdgeIndonesianVoice\] = useState\(DEFAULT_EDGE_ID_VOICE_ID\)/);
}, true);

check('Bulk generation and preferred export default to Sonia and Gadis independently of manual selections', () => {
  const prefs = normalizeTextStructuredAudioGenerationPreferences({ edgeTextVoiceId: 'en-GB-RyanNeural', edgeMeaningVoiceId: 'id-ID-ArdiNeural' });
  assert.deepEqual(prefs.bulkTextVoiceIds, ['en-GB-SoniaNeural']);
  assert.deepEqual(prefs.bulkMeaningVoiceIds, ['id-ID-GadisNeural']);
  assert.equal(prefs.bulkExportTextVoiceId, 'en-GB-SoniaNeural');
  assert.equal(prefs.bulkExportMeaningVoiceId, 'id-ID-GadisNeural');
  assert.deepEqual(TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds, ['en-GB-SoniaNeural']);
}, true);

check('Old saved manual, bulk and export voices survive preference load', () => {
  const saved = { defaultsVersion: 1, edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'su-ID-TutiNeural',
    bulkTextVoiceIds: ['en-GB-RyanNeural'], bulkExportMeaningVoiceId: 'id-ID-ArdiNeural' };
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(saved) } };
  try {
    const { defaultsVersion, ...voices } = saved;
    const loaded = loadTextStructuredAudioGenerationPreferences();
    for (const [key, value] of Object.entries(voices)) assert.deepEqual(loaded[key], value);
    assert.deepEqual(loaded.bulkMeaningVoiceIds, ['id-ID-GadisNeural']);
    assert.equal(loaded.bulkExportTextVoiceId, 'en-GB-RyanNeural');
  } finally { delete globalThis.window; }
}, true);

check('Edge and Chrome choose their available EN/ID defaults in shared and structured playback', () => {
  const englishVoices = [{ name: 'Microsoft Sonia Online', lang: 'en-GB' }, { name: 'Google UK English Female', lang: 'en-GB' }];
  const indonesianVoices = [{ name: 'Microsoft Gadis Online', lang: 'id-ID' }, { name: 'Google Bahasa Indonesia', lang: 'id-ID' }];
  for (const [agent, index] of [['Chrome/140 Edg/140', 0], ['Chrome/140', 1]]) {
    const browser = { userAgent: agent };
    const shared = resolveBrowserTtsVoiceState([...englishVoices, ...indonesianVoices], browser);
    const structured = resolveTextStructuredBrowserVoiceState({ englishVoices, indonesianVoices, browser });
    assert.deepEqual([shared.defaultEng, shared.defaultId], [englishVoices[index], indonesianVoices[index]]);
    assert.deepEqual([structured.textVoice, structured.meaningVoice], [shared.defaultEng, shared.defaultId]);
  }
  const browser = { userAgent: 'Chrome/140' };
  const selected = resolveTextStructuredBrowserVoiceState({ englishVoices, indonesianVoices, browser,
    preferences: { browserTextVoiceName: englishVoices[0].name, browserMeaningVoiceName: indonesianVoices[0].name } });
  assert.deepEqual([selected.textVoice, selected.meaningVoice], [englishVoices[0], indonesianVoices[0]]);
  assert.equal(resolveBrowserTtsVoiceState(englishVoices, browser).defaultId, null);
}, true);

check('Bottom Global Player visibly exposes Split/Full and Local/TTS state', () => {
  assert.match(bottom, /data-text-global-player-controls="true"/);
  assert.match(bottom, /Toggle global Split \/ Full/);
  assert.match(bottom, /Toggle global TTS Only/);
  assert.match(bottom, /LOCAL FIRST/);
  assert.match(bottom, /TTS ONLY/);
});

check('Bottom Global Player visibly exposes effective EN and ID local order', () => {
  assert.match(bottom, /EN \{globalOrderLabel\('text'\)\} • ID \{globalOrderLabel\('meaning'\)\}/);
  assert.match(app, /textPlaybackOrder:\s*structuredTextAudioPlaybackOrder/);
});

check('Player Settings edits Global order and mirrors the same Global TTS state', () => {
  assert.match(playerControls, /Global representation and local voice priority across Structured Text documents/);
  assert.match(playerControls, /onGlobalPlaybackOrderChange/);
  assert.match(playerControls, /onGlobalTtsOnlyChange/);
  assert.match(playerControls, /Global EN \/ ID order/);
});

check('Audio sidebar no longer owns a second TTS Only switch', () => {
  assert.match(audioControls, /GLOBAL PLAYER/);
  assert.match(audioControls, /TTS Only is controlled globally from the bottom Global Player/);
  assert.doesNotMatch(audioControls, /onClick=\{\(\) => onAudioSourceModeChange\?\.\(localAudioEnabled \? TEXT_STRUCTURED_AUDIO_SOURCE_MODES\.TTS_ONLY/);
});

check('Advanced Card override explicitly inherits Global order', () => {
  assert.match(cardAudio, /INHERIT GLOBAL/);
  assert.match(cardAudio, /Inherits Global/);
  assert.match(cardAudio, /Empty lists inherit the Global Text playback order/);
});

check('HF2 package + app metadata are aligned and keep HF1 history', () => {
  assert.equal(pkg.version, '6.0.3-beta.8-p7-hf2');
  assert.equal(lock.version, '6.0.3-beta.8-p7-hf2');
  assert.equal(lock.packages?.['']?.version, '6.0.3-beta.8-p7-hf2');
  assert.match(metadata, /APP_VERSION = '6\.0\.3-beta\.8-p7-hf2'/);
  assert.match(metadata, /p7-hf2 aligns the frozen beta\.8 global-player contract/);
  assert.match(metadata, /p7-hf1 fixes the runtime blank-screen regression/);
});

console.log(`\nP7 HF2 ${voiceOnly ? 'VOICE POLICY' : 'GLOBAL PLAYER + DEFAULTS'} AUDIT — ${pass} PASS, ${fail} FAIL`);
if (fail) process.exitCode = 1;
