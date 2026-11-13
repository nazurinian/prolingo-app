import assert from 'node:assert/strict';

import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from '../src/domain/text/textGlobalIdentityDomain.js';
import {
  TEXT_LIBRARY_COMMAND_TYPES,
  applyTextLibraryCommand
} from '../src/domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextBlockAudioMetadata,
  buildResetTextSegmentAudioMetadata,
  buildResetTextSpeakerAudioMetadata,
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalBrowserTtsPreferences,
  buildResetTextStructuredGlobalEdgeAndBulkPreferences,
  buildResetTextStructuredGlobalEdgePreferences,
  buildResetTextStructuredGlobalPlaybackPreferences,
  buildResetTextWorkspaceAudioMetadata
} from '../src/domain/text/textStructuredResetDomain.js';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  TEXT_STRUCTURED_RESUME_MODES
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import { TEXT_STRUCTURED_GENERATION_DEFAULTS } from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import { resolveTextStructuredEffectivePlaybackRate } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { resolveTextStructuredBrowserVoiceResolution } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
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

const createMockLocalStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  let clearedCount = 0;
  return {
    get clearedCount() {
      return clearedCount;
    },
    snapshot() {
      return Object.fromEntries(store.entries());
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      clearedCount += 1;
      store.clear();
    }
  };
};

let pass = 0;
const test = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${label}`);
};

// 1. Global Browser TTS & Playback reset + persistence + Table/Legacy isolation
test('D1-01 — Global Browser TTS & Playback resets cleanly, persists round-trip, is idempotent, and leaves Table/Legacy storage untouched', () => {
  const tableAndLegacySentinel = {
    prolingo_playback_sequence_v511: '{"order":["word","sentence"]}',
    prolingo_playback_delays_v511: '{"word":300}',
    prolingo_vocabulary_play_order_v511: 'sequential',
    TABLE_LOCAL_AUDIO_PLAYBACK_PREF_KEY: '{"mode":"custom"}',
    prolingo_text_identity_v1: '{"documentId":"DOC_LEGACY"}',
    pronunciation_decks: '[{"id":"DECK_1"}]',
    prolingo_mastery_state_v1: '{"mastered":12}',
    prolingo_study_activity_v1: '{"streak":4}'
  };
  const mockStorage = createMockLocalStorage(tableAndLegacySentinel);
  globalThis.window = { localStorage: mockStorage };

  try {
    const dirtyPrefs = {
      ...DEFAULT_TEXT_STRUCTURED_PREFERENCES,
      displayMode: 'text-only',
      playbackChannelMode: 'text-then-meaning',
      browserTextVoiceName: 'Microsoft Libby Online (Natural)',
      browserMeaningVoiceName: 'Microsoft Gadis Online (Natural)',
      browserTextRate: 1.5,
      browserMeaningRate: 0.7,
      browserRatesLinked: false,
      browserTtsRate: 1.5,
      audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
      manualSegmentRepeatCount: 9,
      manualCardRepeatCount: 6,
      resumeMode: TEXT_STRUCTURED_RESUME_MODES.RESTART,
      channelDelayMs: 1000,
      segmentDelayMs: 500,
      globalAudioPlaybackOrderV1: {
        version: 1,
        channels: {
          text: [{ engine: 'edge', voiceId: 'en-GB-RyanNeural' }],
          meaning: [{ engine: 'edge', voiceId: 'id-ID-ArdiNeural' }]
        },
        ttsOnly: true
      }
    };

    const ttsOnlyReset = buildResetTextStructuredGlobalBrowserTtsPreferences(dirtyPrefs);
    assert.equal(ttsOnlyReset.browserTextVoiceName, null);
    assert.equal(ttsOnlyReset.browserMeaningVoiceName, null);
    assert.equal(ttsOnlyReset.browserTextRate, 1);
    assert.equal(ttsOnlyReset.browserMeaningRate, 1);
    assert.equal(ttsOnlyReset.browserRatesLinked, true);
    assert.equal(ttsOnlyReset.playbackRepresentationMode, 'full', 'partial Browser TTS reset preserves playback mode');
    assert.equal(ttsOnlyReset.playbackOrderMode, 'shuffle', 'partial Browser TTS reset preserves shuffle');

    const persisted = resetTextStructuredPreferences(dirtyPrefs, {
      scope: TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS_AND_PLAYBACK
    });
    const reloaded = loadTextStructuredPreferences();
    assert.deepEqual(reloaded, persisted);
    assert.equal(reloaded.browserTextVoiceName, null);
    assert.equal(reloaded.browserMeaningVoiceName, null);
    assert.equal(reloaded.browserTextRate, 1);
    assert.equal(reloaded.browserMeaningRate, 1);
    assert.equal(reloaded.browserRatesLinked, true);
    assert.equal(reloaded.audioSourceMode, TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST);
    assert.equal(reloaded.playbackRepresentationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT);
    assert.equal(reloaded.playbackOrderMode, TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL);
    assert.equal(reloaded.repeatMode, TEXT_STRUCTURED_REPEAT_MODES.ONCE);
    assert.equal(reloaded.resumeMode, TEXT_STRUCTURED_RESUME_MODES.CONTINUE);
    assert.equal(reloaded.channelDelayMs, 0);
    assert.equal(reloaded.segmentDelayMs, 0);
    assert.deepEqual(reloaded.globalAudioPlaybackOrderV1, {
      version: 1,
      channels: { text: [], meaning: [] },
      ttsOnly: null
    });

    const rawBefore = mockStorage.getItem(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY);
    resetTextStructuredPreferences(reloaded, {
      scope: TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS_AND_PLAYBACK
    });
    const rawAfter = mockStorage.getItem(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY);
    assert.equal(rawAfter, rawBefore, 'second global playback reset is byte-identical');
    assert.equal(mockStorage.clearedCount, 0, 'never calls localStorage.clear()');

    Object.entries(tableAndLegacySentinel).forEach(([key, val]) => {
      assert.equal(mockStorage.getItem(key), val, `Table/Legacy key ${key} remains untouched`);
    });
  } finally {
    delete globalThis.window;
  }
});

// 2. Global Edge & Bulk Generation defaults independence (Sonia/Gadis vs Libby/Tuti)
test('D1-02 — Global Edge & Bulk reset preserves Sonia/Gadis vs Libby/Tuti split & supports partial + combined resets', () => {
  const mockStorage = createMockLocalStorage();
  globalThis.window = { localStorage: mockStorage };

  try {
    const dirtyGen = {
      engine: 'gemini',
      edgeTextVoiceId: 'en-US-GuyNeural',
      edgeMeaningVoiceId: 'id-ID-ArdiNeural',
      geminiVoiceName: 'Fenrir',
      edgeRate: 30,
      edgePitch: -15,
      generateText: false,
      generateMeaning: true,
      bulkTextVoiceIds: ['en-US-JennyNeural', 'en-AU-NatashaNeural'],
      bulkMeaningVoiceIds: ['jv-ID-DimasNeural'],
      bulkGenerateSplit: false,
      bulkGenerateFull: true,
      bulkAutoExport: true,
      bulkExportFormat: 'audio-only-zip',
      bulkExportVoicePolicy: 'preferred',
      bulkExportTextVoiceId: 'en-US-JennyNeural',
      bulkExportMeaningVoiceId: 'jv-ID-DimasNeural',
      bulkExportRepresentation: 'full'
    };

    const edgeOnly = buildResetTextStructuredGlobalEdgePreferences(dirtyGen);
    assert.equal(edgeOnly.edgeTextVoiceId, 'en-GB-SoniaNeural');
    assert.equal(edgeOnly.edgeMeaningVoiceId, 'id-ID-GadisNeural');
    assert.equal(edgeOnly.edgeRate, 0);
    assert.equal(edgeOnly.edgePitch, 0);
    assert.equal(edgeOnly.generateText, true);
    assert.deepEqual(edgeOnly.bulkTextVoiceIds, ['en-US-JennyNeural', 'en-AU-NatashaNeural']);

    const bulkOnly = buildResetTextStructuredBulkGenerationPreferences(dirtyGen);
    assert.equal(bulkOnly.edgeTextVoiceId, 'en-US-GuyNeural');
    assert.deepEqual(bulkOnly.bulkTextVoiceIds, ['en-GB-LibbyNeural']);
    assert.deepEqual(bulkOnly.bulkMeaningVoiceIds, ['su-ID-TutiNeural']);
    assert.equal(bulkOnly.bulkGenerateSplit, true);
    assert.equal(bulkOnly.bulkGenerateFull, false);
    assert.equal(bulkOnly.bulkAutoExport, false);
    assert.equal(bulkOnly.bulkExportFormat, 'portable-zip');

    const persistedAll = resetTextStructuredAudioGenerationPreferences(dirtyGen, {
      scope: TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_EDGE_AND_BULK
    });
    const reloadedAll = loadTextStructuredAudioGenerationPreferences();
    assert.deepEqual(reloadedAll, persistedAll);
    assert.equal(reloadedAll.edgeTextVoiceId, 'en-GB-SoniaNeural');
    assert.equal(reloadedAll.edgeMeaningVoiceId, 'id-ID-GadisNeural');
    assert.deepEqual(reloadedAll.bulkTextVoiceIds, ['en-GB-LibbyNeural']);
    assert.deepEqual(reloadedAll.bulkMeaningVoiceIds, ['su-ID-TutiNeural']);
    assert.equal(reloadedAll.bulkExportTextVoiceId, 'en-GB-LibbyNeural');
    assert.equal(reloadedAll.bulkExportMeaningVoiceId, 'su-ID-TutiNeural');
    assert.equal(reloadedAll.defaultsVersion, TEXT_STRUCTURED_GENERATION_DEFAULTS.defaultsVersion ?? reloadedAll.defaultsVersion);

    const raw1 = mockStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY);
    resetTextStructuredAudioGenerationPreferences(buildResetTextStructuredGlobalEdgeAndBulkPreferences());
    assert.equal(mockStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY), raw1);
  } finally {
    delete globalThis.window;
  }
});

// 3. Atomic Workspace, Speaker, Card & Segment resets preserve protected identities, artifacts & variants
test('D1-03 — Workspace, Speaker, Card & Segment resets strip overrides without empty shells or 1.0x pins & preserve all protected metadata', () => {
  const colUid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.COLLECTION);
  const docUid1 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.WORKSPACE);
  const docUid2 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.WORKSPACE);
  const blkUid1 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD);
  const blkUid2 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD);
  const segUid1 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT);
  const segUid2 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT);
  const segUid3 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT);
  const audUid1 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT);
  const audUid2 = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT);

  const snapshot = normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: 'DOC_000001',
    counters: { collection: 1, document: 2, text: 2, segment: 3, audioVariant: 2 },
    collections: [
      { id: 'COLL_000001', uid: colUid, title: 'Stories', order: 1, metadata: { externalCollectionHintV1: { collectionKey: 'c1' } } }
    ],
    documents: [
      {
        id: 'DOC_000001',
        uid: docUid1,
        collectionId: 'COLL_000001',
        order: 1,
        title: 'Mixed Lesson',
        documentType: 'mixed',
        editorModel: 'structured-v1',
        metadata: {
          speakerRegistryV1: [
            { id: 'SPK_1', label: 'Alice', normalizedKey: 'alice', order: 1 },
            { id: 'SPK_2', label: 'Bob', normalizedKey: 'bob', order: 2 }
          ],
          externalSourceV1: { packageId: 'ext-1', version: 2 },
          speakerVoiceProfileV2: { text: { SPK_1: 'Microsoft Sonia', SPK_2: 'Microsoft Ryan' }, meaning: { SPK_1: 'Microsoft Gadis' } },
          speakerVoiceMapV1: { text: { alice: 'Microsoft Sonia', bob: 'Microsoft Ryan' }, meaning: {} },
          audioPlaybackSyncProfileV1: { voice: { text: true, meaning: false }, rate: { text: true, meaning: false } },
          audioVoiceOverrideV1: { channels: { text: 'Microsoft Libby', meaning: 'Microsoft Ardi' }, speakers: {}, speakerIds: {} },
          audioDownloadProfileV1: {
            modes: { text: 'custom', meaning: 'follow-player' },
            channels: { text: 'en-US-JennyNeural', meaning: null },
            speakers: {},
            speakerIds: { text: { SPK_1: 'en-GB-RyanNeural', SPK_2: 'en-GB-MaisieNeural' }, meaning: {} }
          },
          audioPlaybackOrderV1: { version: 1, channels: { text: [{ engine: 'edge', voiceId: 'en-GB-SoniaNeural' }], meaning: [] }, ttsOnly: null },
          localAudioPlaybackProfileV1: { channels: { text: 'en-GB-SoniaNeural', meaning: null }, speakerIds: { text: { SPK_1: 'en-GB-RyanNeural' }, meaning: {} }, speakers: {} },
          audioPlaybackRateProfileV1: { channels: { text: 1.2, meaning: 1.0 }, speakerIds: { text: { SPK_1: 1.4 }, meaning: {} }, speakers: {} }
        }
      },
      {
        id: 'DOC_000002',
        uid: docUid2,
        collectionId: null,
        order: 2,
        title: 'Legacy Doc',
        documentType: 'mixed',
        editorModel: 'legacy-line-v1',
        metadata: { legacyAudioPref: { preserveMe: true } }
      }
    ],
    blocks: [
      {
        id: 'TEXT_000001',
        uid: blkUid1,
        documentId: 'DOC_000001',
        order: 1,
        blockType: 'paragraph',
        title: 'Card 1',
        metadata: {
          paragraphRoleV1: 'paragraph',
          externalEntityV1: { cardKey: 'card-1' },
          fullAudioArtifactsV1: {
            'full_fp_1': { fullArtifactFingerprint: 'full_fp_1', channel: 'text', voiceId: 'en-GB-SoniaNeural', physicalKey: 'phys_full_1' }
          },
          audioVoiceOverrideV1: { channels: { text: 'Card Voice', meaning: null }, speakers: {}, speakerIds: {} },
          audioDownloadProfileV1: { modes: { text: 'custom', meaning: null }, channels: { text: 'en-AU-NatashaNeural', meaning: null }, speakers: {}, speakerIds: {} },
          audioPlaybackOrderV1: { version: 1, channels: { text: [{ engine: 'edge', voiceId: 'en-AU-NatashaNeural' }], meaning: [] }, ttsOnly: null },
          localAudioPlaybackProfileV1: { channels: { text: 'en-AU-NatashaNeural', meaning: null }, speakerIds: {}, speakers: {} },
          audioPlaybackRateProfileV1: { channels: { text: 1.0, meaning: 1.5 }, speakerIds: {}, speakers: {} }
        }
      },
      {
        id: 'TEXT_000002',
        uid: blkUid2,
        documentId: 'DOC_000001',
        order: 2,
        blockType: 'conversation',
        title: 'Card 2',
        metadata: {
          externalEntityV1: { cardKey: 'card-2' },
          audioVoiceOverrideV1: { channels: { text: null, meaning: null }, speakers: {}, speakerIds: { text: { SPK_1: 'Card Alice Voice' }, meaning: {} } },
          audioDownloadProfileV1: { modes: { text: null, meaning: null }, channels: { text: null, meaning: null }, speakers: {}, speakerIds: { text: { SPK_1: 'en-US-AriaNeural' }, meaning: {} } }
        }
      }
    ],
    segments: [
      {
        id: 'SEGMENT_000001',
        uid: segUid1,
        documentId: 'DOC_000001',
        blockId: 'TEXT_000001',
        order: 1,
        text: 'Hello world.',
        meaning: 'Halo dunia.',
        metadata: {
          sentenceAuthoringV1: { operation: 'split', sourceSegmentIds: ['SEGMENT_000001'] },
          contentInvalidatedV1: { invalidated: false },
          externalEntityV1: { segmentKey: 'seg-1' },
          audioVoiceOverrideV1: { channels: { text: 'Seg Voice', meaning: null }, speakers: {}, speakerIds: {} },
          audioDownloadProfileV1: { modes: { text: 'custom', meaning: null }, channels: { text: 'en-IE-EmilyNeural', meaning: null }, speakers: {}, speakerIds: {} },
          audioPlaybackRateProfileV1: { channels: { text: 1.8, meaning: null }, speakerIds: {}, speakers: {} }
        }
      },
      {
        id: 'SEGMENT_000002',
        uid: segUid2,
        documentId: 'DOC_000001',
        blockId: 'TEXT_000002',
        order: 1,
        text: 'Hi Alice.',
        meaning: 'Hai Alice.',
        speaker: 'Alice',
        metadata: {
          speakerIdentityV1: 'SPK_1',
          audioVoiceOverrideV1: { channels: { text: 'Seg Alice Voice', meaning: null }, speakers: {}, speakerIds: {} }
        }
      },
      {
        id: 'SEGMENT_000003',
        uid: segUid3,
        documentId: 'DOC_000001',
        blockId: 'TEXT_000002',
        order: 2,
        text: 'Hi Bob.',
        meaning: 'Hai Bob.',
        speaker: 'Bob',
        metadata: { speakerIdentityV1: 'SPK_2' }
      }
    ],
    audioVariants: [
      { id: 'TXTAUDIO_000001', uid: audUid1, segmentId: 'SEGMENT_000001', channel: 'text', engine: 'edge', source: 'generated', voiceId: 'en-IE-EmilyNeural', metadata: { renderFingerprint: 'rf_1' } },
      { id: 'TXTAUDIO_000002', uid: audUid2, segmentId: 'SEGMENT_000002', channel: 'text', engine: 'edge', source: 'generated', voiceId: 'en-GB-SoniaNeural', metadata: { renderFingerprint: 'rf_2' } }
    ]
  });

  // Verify pure unit builders first
  const clearedSegMeta = buildResetTextSegmentAudioMetadata(snapshot.segments[0].metadata);
  assert.deepEqual(clearedSegMeta, {
    sentenceAuthoringV1: { operation: 'split', sourceSegmentIds: ['SEGMENT_000001'] },
    contentInvalidatedV1: { invalidated: false },
    externalEntityV1: { segmentKey: 'seg-1' }
  });

  const clearedBlockMeta = buildResetTextBlockAudioMetadata(snapshot.blocks[0].metadata);
  assert.deepEqual(Object.keys(clearedBlockMeta).sort(), ['externalEntityV1', 'fullAudioArtifactsV1', 'paragraphRoleV1']);

  const clearedSingleSpk = buildResetTextSpeakerAudioMetadata(snapshot.documents[0].metadata, {
    speakerId: 'SPK_1',
    speaker: 'Alice',
    includeSync: true,
    isDocument: true
  });
  assert.equal(clearedSingleSpk.speakerVoiceProfileV2.text.SPK_1, undefined, 'SPK_1 stripped');
  assert.equal(clearedSingleSpk.speakerVoiceProfileV2.text.SPK_2, 'Microsoft Ryan', 'SPK_2 preserved');
  assert.equal(clearedSingleSpk.audioDownloadProfileV1.channels.text, 'en-US-JennyNeural', 'workspace download channel preserved');
  assert.equal(clearedSingleSpk.audioDownloadProfileV1.speakerIds.text.SPK_1, undefined);
  assert.equal(clearedSingleSpk.audioDownloadProfileV1.speakerIds.text.SPK_2, 'en-GB-MaisieNeural');

  const clearedWsNoSpk = buildResetTextWorkspaceAudioMetadata(snapshot.documents[0].metadata, { includeSpeakers: false });
  assert.equal(clearedWsNoSpk.audioVoiceOverrideV1, undefined);
  assert.equal(clearedWsNoSpk.audioPlaybackOrderV1, undefined);
  assert.equal(clearedWsNoSpk.audioDownloadProfileV1.channels.text, null);
  assert.equal(clearedWsNoSpk.audioDownloadProfileV1.speakerIds.text.SPK_1, 'en-GB-RyanNeural', 'speaker download preserved when includeSpeakers=false');
  assert.equal(clearedWsNoSpk.audioPlaybackRateProfileV1.channels.text, null);
  assert.equal(clearedWsNoSpk.audioPlaybackRateProfileV1.speakerIds.text.SPK_1, 1.4);

  // Command: Legacy refusal
  assert.throws(() => applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE, documentId: 'DOC_000002' }
  }, 5000), /Structured command refused for legacy Text document/);

  // Command: Segment reset on SEGMENT_000002 preserves speakerIdentityV1
  const segStep = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SEGMENT, segmentId: 'SEGMENT_000002' }
  }, 5001);
  const seg2After = segStep.snapshot.segments.find(s => s.id === 'SEGMENT_000002');
  assert.deepEqual(seg2After.metadata, { speakerIdentityV1: 'SPK_1' });
  assert.equal(seg2After.uid, segUid2);
  assert.equal(seg2After.speaker, 'Alice');
  assert.equal(segStep.snapshot.audioVariants.length, 2, 'audioVariants preserved');

  // Command: Card reset on TEXT_000001 clears block + SEGMENT_000001 overrides cleanly
  const cardStep = applyTextLibraryCommand(segStep.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.CARD, blockId: 'TEXT_000001', includeSegments: true }
  }, 5002);
  const card1After = cardStep.snapshot.blocks.find(b => b.id === 'TEXT_000001');
  const seg1After = cardStep.snapshot.segments.find(s => s.id === 'SEGMENT_000001');
  assert.equal(card1After.metadata.paragraphRoleV1, 'paragraph');
  assert.equal(card1After.metadata.fullAudioArtifactsV1.full_fp_1.physicalKey, 'phys_full_1');
  assert.equal(card1After.metadata.audioPlaybackRateProfileV1, undefined, 'no 1.0x or empty rate shell');
  assert.equal(card1After.metadata.audioVoiceOverrideV1, undefined);
  assert.equal(card1After.metadata.audioDownloadProfileV1, undefined);
  assert.equal(seg1After.metadata.audioVoiceOverrideV1, undefined);
  assert.equal(seg1After.metadata.sentenceAuthoringV1.operation, 'split');

  // Verify inheritance cascade! Card 1 rate now cascades cleanly to Document/Global rate
  const docTreeDuringDocOverride = {
    ...cardStep.snapshot.documents[0],
    blocks: [card1After]
  };
  const effectiveCardRate = resolveTextStructuredEffectivePlaybackRate({
    documentTree: docTreeDuringDocOverride,
    block: card1After,
    segment: seg1After,
    channel: 'text',
    globalRate: 1.6
  });
  assert.equal(effectiveCardRate, 1.2, 'cleared Card/Segment overrides cascade to Workspace 1.2x instead of explicit 1.0x');

  // Command: Single Speaker reset SPK_1 clears SPK_1 across doc & TEXT_000002 while keeping SPK_2 & speakerRegistryV1
  const singleSpkStep = applyTextLibraryCommand(cardStep.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SPEAKERS, documentId: 'DOC_000001', speakerId: 'SPK_1', speaker: 'Alice' }
  }, 5003);
  const docAfterSingleSpk = singleSpkStep.snapshot.documents[0];
  const card2AfterSingleSpk = singleSpkStep.snapshot.blocks.find(b => b.id === 'TEXT_000002');
  assert.equal(docAfterSingleSpk.metadata.speakerRegistryV1.length, 2, 'speakerRegistryV1 preserved');
  assert.equal(docAfterSingleSpk.metadata.speakerVoiceProfileV2.text.SPK_1, undefined);
  assert.equal(docAfterSingleSpk.metadata.speakerVoiceProfileV2.text.SPK_2, 'Microsoft Ryan');
  assert.equal(card2AfterSingleSpk.metadata.audioVoiceOverrideV1, undefined, 'SPK_1 card speaker voice removed + empty shell deleted');
  assert.equal(card2AfterSingleSpk.metadata.audioDownloadProfileV1, undefined, 'SPK_1 card speaker download removed + empty shell deleted');

  // Command: All Speakers reset clears sync + SPK_2 while keeping doc channels & speakerRegistryV1
  const allSpkStep = applyTextLibraryCommand(singleSpkStep.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SPEAKERS, documentId: 'DOC_000001' }
  }, 5004);
  const docAfterAllSpk = allSpkStep.snapshot.documents[0];
  assert.equal(docAfterAllSpk.metadata.speakerVoiceProfileV2, undefined);
  assert.equal(docAfterAllSpk.metadata.speakerVoiceMapV1, undefined);
  assert.equal(docAfterAllSpk.metadata.audioPlaybackSyncProfileV1, undefined);
  assert.equal(docAfterAllSpk.metadata.audioVoiceOverrideV1.channels.text, 'Microsoft Libby');
  assert.equal(docAfterAllSpk.metadata.speakerRegistryV1.length, 2);

  // Command: Workspace reset clears doc channels & rates -> now Card 1 cascades all the way to Global!
  const wsStep = applyTextLibraryCommand(allSpkStep.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE, documentId: 'DOC_000001' }
  }, 5005);
  const docAfterWs = wsStep.snapshot.documents[0];
  assert.deepEqual(Object.keys(docAfterWs.metadata).sort(), ['externalSourceV1', 'speakerRegistryV1']);
  assert.equal(docAfterWs.uid, docUid1);
  assert.equal(docAfterWs.collectionId, 'COLL_000001');

  const docTreeFinal = { ...docAfterWs, blocks: wsStep.snapshot.blocks.filter(b => b.documentId === 'DOC_000001') };
  assert.equal(resolveTextStructuredEffectivePlaybackRate({
    documentTree: docTreeFinal,
    block: card1After,
    segment: seg1After,
    channel: 'text',
    globalRate: 1.6
  }), 1.6, 'after Workspace reset, Card & Segment cascade cleanly to Global 1.6x');

  const globalBrowserVoice = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docTreeFinal,
    block: card1After,
    segment: seg1After,
    channel: 'text',
    globalVoiceName: 'Google UK English Female',
    availableBrowserVoices: [{ name: 'Google UK English Female', lang: 'en-GB' }]
  });
  assert.equal(globalBrowserVoice.effectiveVoiceName, 'Google UK English Female', 'Browser TTS cascades to Global');

  const globalDownloadVoice = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: docTreeFinal,
    block: card1After,
    segment: seg1After,
    channel: 'text',
    preferences: TEXT_STRUCTURED_GENERATION_DEFAULTS
  });
  assert.equal(globalDownloadVoice.voiceId, 'en-GB-SoniaNeural', 'Download cascades to Global Edge default');
  assert.equal(wsStep.snapshot.audioVariants.length, 2, 'AudioVariants remain intact after all resets');
  assert.equal(wsStep.snapshot.documents[1].metadata.legacyAudioPref.preserveMe, true, 'Legacy document untouched');

  // Idempotency check
  const secondWsStep = applyTextLibraryCommand(wsStep.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE, documentId: 'DOC_000001' }
  }, 5999);
  assert.equal(secondWsStep.result.changedCount, 0, 'repeated workspace reset reports 0 changes');
  assert.deepEqual(secondWsStep.snapshot, wsStep.snapshot, 'repeated workspace reset is idempotent');
});

console.log(`\nROUND D1 RESET PREFERENCES AUDIT COMPLETE — ${pass} PASS, 0 FAIL`);
