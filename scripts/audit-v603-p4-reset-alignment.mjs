import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  TEXT_STRUCTURED_RESUME_MODES,
  normalizeTextStructuredPreferences,
  resolveTextStructuredPlaybackRate
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  TEXT_STRUCTURED_GENERATION_DEFAULTS,
  normalizeTextStructuredAudioGenerationPreferences
} from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import {
  resolveTextStructuredBrowserVoiceState,
  resolveTextStructuredVoicePreferencePatch
} from '../src/domain/text/textStructuredVoiceDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalBrowserTtsPreferences,
  buildResetTextStructuredGlobalEdgePreferences,
  buildResetTextStructuredGlobalPlaybackPreferences
} from '../src/domain/text/textStructuredResetDomain.js';
import {
  TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY,
  loadTextStructuredPreferences,
  resetTextStructuredPreferences
} from '../src/services/persistence/textStructuredPreferenceService.js';
import {
  TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY,
  loadTextStructuredAudioGenerationPreferences,
  resetTextStructuredAudioGenerationPreferences
} from '../src/services/persistence/textStructuredAudioGenerationPreferenceService.js';
import {
  buildTextStructuredVoiceOverrideMetadata,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceProfile
} from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES,
  buildTextStructuredAudioDownloadProfileMetadata,
  resolveTextStructuredEffectiveDownloadVoice
} from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  buildTextStructuredPlaybackRateProfileMetadata,
  resolveTextStructuredEffectivePlaybackRate
} from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import {
  buildTextStructuredLocalAudioProfileMetadata,
  resolveTextStructuredEffectiveCustomLocalVoice
} from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import {
  buildTextStructuredAudioPlaybackOrderMetadata,
  buildTextStructuredGlobalAudioPlaybackOrderPreference,
  resolveTextStructuredEffectivePlaybackOrder
} from '../src/domain/text/textStructuredAudioPlaybackOrderDomain.js';
import { buildTextStructuredSpeakerVoiceProfileV2Metadata } from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredAudioSyncProfileMetadata } from '../src/domain/text/textStructuredAudioSyncProfileDomain.js';
import { buildTextStructuredBulkGenerationPlan } from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import {
  TEXT_LIBRARY_COMMAND_TYPES,
  applyTextLibraryCommand
} from '../src/domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const run = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
};

const createMockWindow = () => {
  const store = new Map();
  return {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, val) => store.set(String(key), String(val)),
      removeItem: key => store.delete(String(key))
    }
  };
};

const englishBrowserVoices = [
  { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' }
];
const indonesianBrowserVoices = [
  { name: 'Microsoft Ardi Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' },
  { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }
];

const buildTreeFromSnapshot = (snapshot, documentId = 'DOC_000001') => {
  const doc = snapshot.documents.find(d => d.id === documentId);
  const blocks = snapshot.blocks
    .filter(b => b.documentId === documentId)
    .map(b => ({
      ...b,
      segments: snapshot.segments.filter(s => s.blockId === b.id)
    }));
  return { ...doc, blocks };
};

run('1. Global Browser TTS & Global Playback: Dropdown default path produces identical state & resolved voice/rate to Reset', () => {
  const dirtyPrefs = normalizeTextStructuredPreferences({
    displayMode: 'text-only',
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
    browserTextVoiceName: 'Microsoft Guy Online (Natural) - English (United States)',
    browserMeaningVoiceName: 'Microsoft Ardi Online (Natural) - Indonesian (Indonesia)',
    browserTextRate: 1.5,
    browserMeaningRate: 0.8,
    browserRatesLinked: false,
    browserTtsRate: 1.5,
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY,
    globalAudioPlaybackOrderV1: { version: 1, channels: { text: ['en-US-GuyNeural'], meaning: ['id-ID-ArdiNeural'] }, ttsOnly: null },
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
    resumeMode: TEXT_STRUCTURED_RESUME_MODES.RESTART,
    channelDelayMs: 500,
    segmentDelayMs: 300
  });

  // Dropdown path picking "Auto" (null) and 1.0x linked through shared preference patcher + normalizer
  const dropdownAutoBrowserTts = normalizeTextStructuredPreferences({
    ...dirtyPrefs,
    ...resolveTextStructuredVoicePreferencePatch({ channel: 'text', voice: { name: '' } }),
    ...resolveTextStructuredVoicePreferencePatch({ channel: 'meaning', voice: null }),
    browserTextRate: 1,
    browserMeaningRate: 1,
    browserRatesLinked: true,
    browserTtsRate: 1
  });
  const resetBrowserTtsOnly = buildResetTextStructuredGlobalBrowserTtsPreferences(dirtyPrefs);
  assert.deepEqual(resetBrowserTtsOnly, dropdownAutoBrowserTts);

  // Effective Browser TTS resolver gives identical Sonia / Gadis resolution
  const effDropdown = resolveTextStructuredBrowserVoiceState({
    englishVoices: englishBrowserVoices,
    indonesianVoices: indonesianBrowserVoices,
    preferences: dropdownAutoBrowserTts
  });
  const effReset = resolveTextStructuredBrowserVoiceState({
    englishVoices: englishBrowserVoices,
    indonesianVoices: indonesianBrowserVoices,
    preferences: resetBrowserTtsOnly
  });
  assert.equal(effReset.textVoice?.name, 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
  assert.equal(effReset.meaningVoice?.name, 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)');
  assert.deepEqual(effReset, effDropdown);

  // Playback Reset matches selecting canonical defaults + empty global order while keeping Browser TTS
  let viaDropdownPlayback = normalizeTextStructuredPreferences({
    ...dirtyPrefs,
    displayMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.displayMode,
    playbackChannelMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackChannelMode,
    audioSourceMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.audioSourceMode,
    playbackRepresentationMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackRepresentationMode,
    playbackOrderMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackOrderMode,
    repeatMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.repeatMode,
    manualSegmentPlaybackChannelMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualSegmentPlaybackChannelMode,
    manualSegmentRepeatMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualSegmentRepeatMode,
    manualSegmentRepeatCount: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualSegmentRepeatCount,
    manualCardPlaybackChannelMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualCardPlaybackChannelMode,
    manualCardRepeatMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualCardRepeatMode,
    manualCardRepeatCount: DEFAULT_TEXT_STRUCTURED_PREFERENCES.manualCardRepeatCount,
    resumeMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.resumeMode,
    cardExpansionMode: DEFAULT_TEXT_STRUCTURED_PREFERENCES.cardExpansionMode,
    channelDelayMs: DEFAULT_TEXT_STRUCTURED_PREFERENCES.channelDelayMs,
    segmentDelayMs: DEFAULT_TEXT_STRUCTURED_PREFERENCES.segmentDelayMs
  });
  viaDropdownPlayback = normalizeTextStructuredPreferences(
    buildTextStructuredGlobalAudioPlaybackOrderPreference({ preferences: viaDropdownPlayback, channel: 'text', profiles: [] })
  );
  viaDropdownPlayback = normalizeTextStructuredPreferences(
    buildTextStructuredGlobalAudioPlaybackOrderPreference({ preferences: viaDropdownPlayback, channel: 'meaning', profiles: [] })
  );

  const resetPlaybackOnly = buildResetTextStructuredGlobalPlaybackPreferences(dirtyPrefs, { includeBrowserTts: false });
  assert.deepEqual(resetPlaybackOnly, viaDropdownPlayback);

  // Persistence service equivalence
  const mockWin = createMockWindow();
  globalThis.window = mockWin;
  try {
    const persisted = resetTextStructuredPreferences(dirtyPrefs, { scope: TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS });
    assert.deepEqual(persisted, dropdownAutoBrowserTts);
    assert.deepEqual(loadTextStructuredPreferences(), dropdownAutoBrowserTts);
    assert.ok(mockWin.localStorage.getItem(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY));
  } finally {
    delete globalThis.window;
  }
});

run('2. Global Edge & Bulk Generation: Dropdown defaults equal Reset output and produce identical generation plan & voice resolution', () => {
  const dirtyGen = normalizeTextStructuredAudioGenerationPreferences({
    engine: 'gemini',
    edgeTextVoiceId: 'en-US-GuyNeural',
    edgeMeaningVoiceId: 'id-ID-ArdiNeural',
    edgeRate: 25,
    edgePitch: -15,
    generateText: true,
    generateMeaning: false,
    bulkTextVoiceIds: ['en-US-AriaNeural', 'en-AU-NatashaNeural'],
    bulkMeaningVoiceIds: ['id-ID-ArdiNeural'],
    bulkGenerateSplit: false,
    bulkGenerateFull: true,
    bulkAutoExport: true,
    bulkExportFormat: 'direct-mp3-folder',
    bulkExportVoicePolicy: 'explicit',
    bulkExportTextVoiceId: 'en-US-AriaNeural',
    bulkExportMeaningVoiceId: 'id-ID-ArdiNeural',
    bulkExportRepresentation: 'full'
  });

  const dropdownEdgeDefault = normalizeTextStructuredAudioGenerationPreferences({
    ...dirtyGen,
    engine: TEXT_STRUCTURED_GENERATION_DEFAULTS.engine,
    edgeTextVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeTextVoiceId,
    edgeMeaningVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeMeaningVoiceId,
    geminiVoiceName: TEXT_STRUCTURED_GENERATION_DEFAULTS.geminiVoiceName,
    edgeRate: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeRate,
    edgePitch: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgePitch,
    generateText: TEXT_STRUCTURED_GENERATION_DEFAULTS.generateText,
    generateMeaning: TEXT_STRUCTURED_GENERATION_DEFAULTS.generateMeaning
  });
  const resetEdge = buildResetTextStructuredGlobalEdgePreferences(dirtyGen);
  assert.deepEqual(resetEdge, dropdownEdgeDefault);

  const dropdownBulkDefault = normalizeTextStructuredAudioGenerationPreferences({
    ...dirtyGen,
    bulkTextVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds],
    bulkMeaningVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkMeaningVoiceIds],
    bulkGenerateSplit: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkGenerateSplit,
    bulkGenerateFull: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkGenerateFull,
    bulkAutoExport: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkAutoExport,
    bulkExportFormat: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportFormat,
    bulkExportVoicePolicy: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportVoicePolicy,
    bulkExportTextVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportTextVoiceId,
    bulkExportMeaningVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportMeaningVoiceId,
    bulkExportRepresentation: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportRepresentation
  });
  const resetBulk = buildResetTextStructuredBulkGenerationPreferences(dirtyGen);
  assert.deepEqual(resetBulk, dropdownBulkDefault);

  const sampleDoc = {
    id: 'DOC_G',
    title: 'Sample',
    documentType: 'paragraph',
    editorModel: 'structured-v1',
    metadata: {},
    blocks: [{
      id: 'BLK_G',
      documentId: 'DOC_G',
      blockType: 'paragraph',
      order: 1,
      title: 'Card G',
      metadata: {},
      segments: [{ id: 'SEG_G1', documentId: 'DOC_G', blockId: 'BLK_G', order: 1, text: 'Hello.', meaning: 'Halo.', metadata: {} }]
    }]
  };
  const selection = { documents: [{ id: 'DOC_G', scope: { blockIds: ['BLK_G'] } }] };
  const planViaDropdown = buildTextStructuredBulkGenerationPlan({ documentTrees: [sampleDoc], selection, preferences: dropdownBulkDefault });
  const planViaReset = buildTextStructuredBulkGenerationPlan({ documentTrees: [sampleDoc], selection, preferences: resetBulk });
  assert.deepEqual(planViaReset.requirements, planViaDropdown.requirements);

  const mockWin = createMockWindow();
  globalThis.window = mockWin;
  try {
    const persistedBulk = resetTextStructuredAudioGenerationPreferences(dirtyGen, { scope: TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BULK });
    assert.deepEqual(persistedBulk, dropdownBulkDefault);
    assert.deepEqual(loadTextStructuredAudioGenerationPreferences(), dropdownBulkDefault);
    assert.ok(mockWin.localStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY));
  } finally {
    delete globalThis.window;
  }
});

run('3. Workspace, Speaker, Card & Segment: Dropdown "Inherit/Default" vs RESET_AUDIO_PREFERENCES produce identical effective resolution', () => {
  let docMeta = {
    speakerRegistryV1: [{ id: 'SPK_1', label: 'Alya', normalizedKey: 'alya', order: 1 }],
    externalSourceV1: { packageId: 'pkg-align' }
  };
  docMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: docMeta, channel: 'text', voiceName: 'Microsoft Guy Online (Natural) - English (United States)' });
  docMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: docMeta, channel: 'meaning', voiceName: 'Microsoft Ardi Online (Natural) - Indonesian (Indonesia)' });
  docMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: docMeta, channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM, voiceId: 'en-US-GuyNeural' });
  docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, channel: 'text', rate: 1.4 });
  docMeta = buildTextStructuredLocalAudioProfileMetadata({ metadata: docMeta, channel: 'text', voiceId: 'en-US-GuyNeural' });
  docMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: docMeta, channel: 'text', profiles: [{ engine: 'edge', voiceId: 'en-US-GuyNeural' }] });
  docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, speakerId: 'SPK_1', channel: 'text', voiceName: 'Microsoft Guy Online (Natural) - English (United States)' });
  docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'voice', channel: 'text', enabled: true });

  let blkMeta = {
    paragraphRoleV1: 'paragraph',
    externalEntityV1: { cardKey: 'card-align' },
    fullAudioArtifactsV1: { fp_1: { fullArtifactFingerprint: 'fp_1', channel: 'text', voiceId: 'en-GB-SoniaNeural', physicalKey: 'pk_1' } }
  };
  blkMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: blkMeta, channel: 'text', voiceName: 'Microsoft Guy Online (Natural) - English (United States)' });
  blkMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: blkMeta, channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM, voiceId: 'en-US-AriaNeural' });
  blkMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: blkMeta, channel: 'text', profiles: [{ engine: 'edge', voiceId: 'en-US-AriaNeural' }] });

  let segMeta = { speakerIdentityV1: 'SPK_1', sentenceAuthoringV1: { source: 'manual' } };
  segMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: segMeta, channel: 'text', voiceName: 'Microsoft Guy Online (Natural) - English (United States)' });
  segMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: segMeta, channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM, voiceId: 'en-AU-NatashaNeural' });

  const baseSnapshot = normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: 'DOC_000001',
    counters: { collection: 0, document: 1, text: 1, segment: 1, audioVariant: 0 },
    collections: [],
    documents: [{
      id: 'DOC_000001',
      title: 'Align Doc',
      documentType: 'paragraph',
      editorModel: 'structured-v1',
      order: 1,
      metadata: docMeta
    }],
    blocks: [{
      id: 'TEXT_000001',
      documentId: 'DOC_000001',
      blockType: 'paragraph',
      order: 1,
      title: 'Card 1',
      metadata: blkMeta
    }],
    segments: [{
      id: 'SEGMENT_000001',
      documentId: 'DOC_000001',
      blockId: 'TEXT_000001',
      order: 1,
      speaker: 'Alya',
      text: 'Test sentence.',
      meaning: 'Kalimat uji.',
      metadata: segMeta
    }],
    audioVariants: []
  });

  // Path A: User manually sets every single dropdown back to Inherit / Auto / 1.0x / OFF
  let inheritedSnap = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: 'SEGMENT_000001',
      metadata: buildTextStructuredAudioDownloadProfileMetadata({
        metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: segMeta, channel: 'text', voiceName: null }),
        channel: 'text',
        mode: 'default',
        voiceId: null
      })
    }
  }, 5001).snapshot;

  let clearedBlkMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: blkMeta, channel: 'text', voiceName: null });
  clearedBlkMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: clearedBlkMeta, channel: 'text', mode: 'default', voiceId: null });
  clearedBlkMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: clearedBlkMeta, channel: 'text', profiles: [] });
  inheritedSnap = applyTextLibraryCommand(inheritedSnap, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_BLOCK,
    payload: { id: 'TEXT_000001', metadata: clearedBlkMeta }
  }, 5002).snapshot;

  let clearedDocMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: docMeta, channel: 'text', voiceName: null });
  clearedDocMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: clearedDocMeta, channel: 'meaning', voiceName: null });
  clearedDocMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: clearedDocMeta, channel: 'text', mode: 'default', voiceId: null });
  clearedDocMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: clearedDocMeta, channel: 'text', rate: null });
  clearedDocMeta = buildTextStructuredLocalAudioProfileMetadata({ metadata: clearedDocMeta, channel: 'text', voiceId: null });
  clearedDocMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: clearedDocMeta, channel: 'text', profiles: [] });
  clearedDocMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: clearedDocMeta, speakerId: 'SPK_1', channel: 'text', voiceName: null });
  clearedDocMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: clearedDocMeta, kind: 'voice', channel: 'text', enabled: false });
  inheritedSnap = applyTextLibraryCommand(inheritedSnap, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: 'DOC_000001', metadata: clearedDocMeta }
  }, 5003).snapshot;

  // Path B: User invokes Reset commands (Workspace with speakers+cards, Card, Segment)
  const resetSnap = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: {
      scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE,
      documentId: 'DOC_000001',
      includeSpeakers: true,
      includeCardsAndSegments: true
    }
  }, 5004).snapshot;

  const treeInherited = buildTreeFromSnapshot(inheritedSnap);
  const treeReset = buildTreeFromSnapshot(resetSnap);
  const blkInherited = treeInherited.blocks[0];
  const blkReset = treeReset.blocks[0];
  const segInherited = blkInherited.segments[0];
  const segReset = blkReset.segments[0];

  const genPrefs = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };

  assert.deepEqual(
    resolveTextStructuredEffectiveVoiceProfile({ documentTree: treeReset, block: blkReset, segment: segReset, channel: 'text', defaultVoiceName: englishBrowserVoices[1].name }),
    resolveTextStructuredEffectiveVoiceProfile({ documentTree: treeInherited, block: blkInherited, segment: segInherited, channel: 'text', defaultVoiceName: englishBrowserVoices[1].name })
  );
  assert.deepEqual(
    resolveTextStructuredBrowserVoiceResolution({ documentTree: treeReset, block: blkReset, segment: segReset, channel: 'text', globalVoiceName: englishBrowserVoices[1].name, availableBrowserVoices: englishBrowserVoices }),
    resolveTextStructuredBrowserVoiceResolution({ documentTree: treeInherited, block: blkInherited, segment: segInherited, channel: 'text', globalVoiceName: englishBrowserVoices[1].name, availableBrowserVoices: englishBrowserVoices })
  );
  assert.deepEqual(
    resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeReset, block: blkReset, segment: segReset, channel: 'text', preferences: genPrefs }),
    resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeInherited, block: blkInherited, segment: segInherited, channel: 'text', preferences: genPrefs })
  );
  assert.equal(
    resolveTextStructuredEffectivePlaybackRate({ documentTree: treeReset, block: blkReset, segment: segReset, channel: 'text', globalRate: resolveTextStructuredPlaybackRate(DEFAULT_TEXT_STRUCTURED_PREFERENCES, 'text') }),
    resolveTextStructuredEffectivePlaybackRate({ documentTree: treeInherited, block: blkInherited, segment: segInherited, channel: 'text', globalRate: resolveTextStructuredPlaybackRate(DEFAULT_TEXT_STRUCTURED_PREFERENCES, 'text') })
  );
  assert.equal(
    resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: treeReset, block: blkReset, segment: segReset, channel: 'text' }),
    resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: treeInherited, block: blkInherited, segment: segInherited, channel: 'text' })
  );
  assert.deepEqual(
    resolveTextStructuredEffectivePlaybackOrder({ documentTree: treeReset, block: blkReset, channel: 'text' }),
    resolveTextStructuredEffectivePlaybackOrder({ documentTree: treeInherited, block: blkInherited, channel: 'text' })
  );

  // Protected keys remain completely untouched in Reset output
  assert.deepEqual(treeReset.metadata.speakerRegistryV1, docMeta.speakerRegistryV1);
  assert.deepEqual(treeReset.metadata.externalSourceV1, docMeta.externalSourceV1);
  assert.deepEqual(blkReset.metadata.fullAudioArtifactsV1, blkMeta.fullAudioArtifactsV1);
  assert.equal(segReset.metadata.speakerIdentityV1, 'SPK_1');
  assert.deepEqual(segReset.metadata.sentenceAuthoringV1, segMeta.sentenceAuthoringV1);
});

run('4. Segment Reset clears only Segment overrides and converges identically to Dropdown "Inherit" while keeping Card overrides intact', () => {
  let blkMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Microsoft Libby Online (Natural) - English (United Kingdom)' });
  let segMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: { speakerIdentityV1: 'SPK_2' }, channel: 'text', voiceName: 'Microsoft Guy Online (Natural) - English (United States)' });
  segMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: segMeta, channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM, voiceId: 'en-US-GuyNeural' });

  const baseSnap = normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: 'DOC_000002',
    counters: { collection: 0, document: 2, text: 2, segment: 2, audioVariant: 0 },
    documents: [{ id: 'DOC_000002', title: 'Seg Doc', documentType: 'paragraph', editorModel: 'structured-v1', order: 1, metadata: {} }],
    blocks: [{ id: 'TEXT_000002', documentId: 'DOC_000002', blockType: 'paragraph', order: 1, title: 'Card S', metadata: blkMeta }],
    segments: [{ id: 'SEGMENT_000002', documentId: 'DOC_000002', blockId: 'TEXT_000002', order: 1, text: 'Line 1', meaning: 'Baris 1', metadata: segMeta }],
    audioVariants: []
  });

  const viaDropdown = applyTextLibraryCommand(baseSnap, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: 'SEGMENT_000002',
      metadata: buildTextStructuredAudioDownloadProfileMetadata({
        metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: segMeta, channel: 'text', voiceName: null }),
        channel: 'text',
        mode: 'default',
        voiceId: null
      })
    }
  }, 5010).snapshot;

  const viaReset = applyTextLibraryCommand(baseSnap, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SEGMENT, segmentId: 'SEGMENT_000002' }
  }, 5011).snapshot;

  const treeA = buildTreeFromSnapshot(viaDropdown, 'DOC_000002');
  const treeB = buildTreeFromSnapshot(viaReset, 'DOC_000002');
  assert.deepEqual(
    resolveTextStructuredEffectiveVoiceProfile({ documentTree: treeB, block: treeB.blocks[0], segment: treeB.blocks[0].segments[0], channel: 'text', defaultVoiceName: englishBrowserVoices[1].name }),
    resolveTextStructuredEffectiveVoiceProfile({ documentTree: treeA, block: treeA.blocks[0], segment: treeA.blocks[0].segments[0], channel: 'text', defaultVoiceName: englishBrowserVoices[1].name })
  );
  assert.deepEqual(
    resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeB, block: treeB.blocks[0], segment: treeB.blocks[0].segments[0], channel: 'text', preferences: TEXT_STRUCTURED_GENERATION_DEFAULTS }),
    resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeA, block: treeA.blocks[0], segment: treeA.blocks[0].segments[0], channel: 'text', preferences: TEXT_STRUCTURED_GENERATION_DEFAULTS })
  );
  assert.equal(treeB.blocks[0].metadata.audioVoiceOverrideV1?.channels?.text, 'Microsoft Libby Online (Natural) - English (United Kingdom)');
});

run('5. App.jsx converges Global Browser TTS Dropdowns onto one shared handler & uses memo-safe useCallback Reset props', () => {
  const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  assert.ok(appSource.includes('const handleStructuredTextGlobalBrowserTtsVoiceChange = useCallback('));
  assert.ok(appSource.includes('onGlobalBrowserTtsVoiceChange: handleStructuredTextGlobalBrowserTtsVoiceChange'));
  assert.ok(appSource.includes("handleStructuredTextGlobalBrowserTtsVoiceChange(voice, 'text')"));
  assert.ok(appSource.includes("handleStructuredTextGlobalBrowserTtsVoiceChange(voice, 'meaning')"));
  assert.ok(appSource.includes('const handleStructuredTextResetGlobalBrowserTts = useCallback('));
  assert.ok(appSource.includes('onResetGlobalBrowserTts: handleStructuredTextResetGlobalBrowserTts'));
  assert.ok(appSource.includes('onResetGlobalEdge: handleStructuredTextResetGlobalEdgeOnly'));
  assert.ok(appSource.includes('onResetWorkspaceAudio: handleStructuredTextResetWorkspaceDefault'));
  assert.ok(appSource.includes('onResetPlaybackPreferences={handleStructuredTextResetGlobalPlaybackOnly}'));
  assert.ok(appSource.includes('resetPreferences: handleStructuredTextResetBulkOnly'));
  assert.equal(appSource.includes('buildTextStructuredBatchSelection,'), false, 'Unused buildTextStructuredBatchSelection import removed');
});

console.log(`\nP4 RESET ALIGNMENT SUMMARY: ${passed} PASS, 0 FAIL`);
