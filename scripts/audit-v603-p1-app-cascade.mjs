import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTextStructuredAudioContentFingerprintV2,
  buildTextStructuredAudioRenderDescriptor,
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildCanonicalSha256Fingerprint } from '../src/domain/text/textCanonicalFingerprintDomain.js';
import {
  TEXT_AUDIO_COVERAGE_STATUS,
  buildTextStructuredAudioCoverageMap,
  resolveTextStructuredAudioCoverageSlot
} from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES,
  buildTextStructuredAudioDownloadProfileMetadata,
  getTextStructuredTreeFollowPlayerUsage,
  getTextStructuredTreesFollowPlayerUsage,
  resolveTextStructuredEffectiveDownloadVoice
} from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  TEXT_STRUCTURED_BULK_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS,
  buildTextStructuredBulkGenerationPlan
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredBatchWorkspaceSelection } from '../src/domain/text/textStructuredBatchDomain.js';
import { initialEdgeVoices } from '../src/constants/voiceConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

const runCheck = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS [${name}]`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL [${name}]: ${error?.stack || error}`);
  }
};

runCheck('P1-1: Memoized SHA-256 content & render fingerprints remain bit-identical across >4096 cache eviction', () => {
  const sampleText = 'She has been studying consistently every morning.';
  const directContentHash = buildCanonicalSha256Fingerprint({
    version: 2,
    channel: 'text',
    content: sampleText
  }, 'sha256');
  const firstHash = buildTextStructuredAudioContentFingerprintV2({ channel: 'text', content: `  ${sampleText}  ` });
  assert.equal(firstHash, directContentHash);

  const render1 = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: sampleText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const directDescriptor = buildTextStructuredAudioRenderDescriptor({
    channel: 'text',
    content: sampleText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const directRf = buildCanonicalSha256Fingerprint(directDescriptor, 'rf-sha256');
  assert.equal(render1.renderFingerprint, directRf);

  // Fill past 4096 cache cap so FIFO eviction runs cleanly without key aliasing or drift.
  for (let index = 0; index < 4250; index += 1) {
    const content = `Bounded eviction probe sentence #${index}`;
    const result = buildTextStructuredAudioRenderFingerprint({
      channel: 'text',
      content,
      language: 'en',
      engine: 'edge',
      voiceId: index % 2 === 0 ? 'en-GB-SoniaNeural' : 'en-GB-LibbyNeural',
      rate: (index % 3) * 10,
      pitch: 0
    });
    assert.ok(result.renderFingerprint.startsWith('rf-sha256-'));
  }

  // Re-verify evicted entry still recomputes bit-identically and never aliases mutated params.
  const renderAfterEviction = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: sampleText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const renderDifferentRate = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: sampleText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 10,
    pitch: 0
  });
  assert.equal(renderAfterEviction.renderFingerprint, directRf);
  assert.notEqual(renderDifferentRate.renderFingerprint, directRf);
  assert.notEqual(render1, renderAfterEviction);
  renderAfterEviction.descriptor.voiceId = 'MUTATED_LOCAL';
  const freshAfterExternalMutation = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: sampleText,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  assert.equal(freshAfterExternalMutation.descriptor.voiceId, 'en-GB-SoniaNeural');
});

runCheck('P1-2: Pre-indexed coverage map & bulk generation plan match slot-level resolution identically', () => {
  const rfSeg1 = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: 'First segment text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const contentHashSeg1 = rfSeg1.contentFingerprintV2;
  const rfStaleSeg2 = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: 'Old wording for second segment',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });

  const documentTree = {
    id: 'DOC_P1',
    title: 'P1 Regression Doc',
    textLanguage: 'en',
    meaningLanguage: 'id',
    metadata: {},
    blocks: [
      {
        id: 'BLOCK_P1',
        blockType: 'paragraph',
        metadata: {},
        segments: [
          { id: 'SEGMENT_1', text: 'First segment text', meaning: 'Arti pertama', metadata: {} },
          { id: 'SEGMENT_2', text: 'Updated second segment', meaning: 'Arti kedua', metadata: {} },
          { id: 'SEGMENT_3', text: 'Third missing segment', meaning: '', metadata: {} }
        ]
      }
    ]
  };

  const audioVariants = [
    {
      id: 'TXTAUDIO_1',
      segmentId: 'SEGMENT_1',
      channel: 'text',
      source: 'generated',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      updatedAt: 200,
      filename: 'seg1.mp3',
      metadata: {
        audioRenderFingerprintV1: rfSeg1.renderFingerprint,
        audioContentFingerprintV1: contentHashSeg1
      }
    },
    {
      id: 'TXTAUDIO_2',
      segmentId: 'SEGMENT_2',
      channel: 'text',
      source: 'generated',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      updatedAt: 100,
      filename: 'seg2-old.mp3',
      metadata: {
        audioRenderFingerprintV1: rfStaleSeg2.renderFingerprint
      }
    },
    {
      id: 'TXTAUDIO_3',
      segmentId: 'SEGMENT_2',
      channel: 'meaning',
      source: 'generated',
      engine: 'edge',
      voiceId: 'id-ID-ArdiNeural',
      updatedAt: 150,
      filename: 'seg2-other-voice.mp3',
      metadata: {
        audioRenderFingerprintV1: 'rf-sha256-otherprofile'
      }
    }
  ];

  const runtimeAudioUrls = {
    TXTAUDIO_1: { stagingBacked: true, stagingId: 'stg_1', filename: 'seg1.mp3' }
  };
  const preferences = {
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    edgeRate: 0,
    pitch: 0,
    edgePitch: 0,
    generateText: true,
    generateMeaning: true,
    bulkTextVoiceIds: ['en-GB-SoniaNeural'],
    bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
    bulkGenerateSplit: true,
    bulkGenerateFull: false,
    edgeVoices: initialEdgeVoices
  };

  const map = buildTextStructuredAudioCoverageMap({ documentTree, audioVariants, runtimeAudioUrls, preferences });
  assert.equal(map[buildTextStructuredRuntimeAudioKey('SEGMENT_1', 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.READY);
  assert.equal(map[buildTextStructuredRuntimeAudioKey('SEGMENT_2', 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.STALE);
  assert.equal(map[buildTextStructuredRuntimeAudioKey('SEGMENT_2', 'meaning')].status, TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE);
  assert.equal(map[buildTextStructuredRuntimeAudioKey('SEGMENT_3', 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.MISSING);
  assert.equal(map[buildTextStructuredRuntimeAudioKey('SEGMENT_1', 'meaning')].status, TEXT_AUDIO_COVERAGE_STATUS.MISSING);

  // Verify parity with direct per-slot call.
  const directSeg1 = resolveTextStructuredAudioCoverageSlot({
    audioVariants,
    runtimeAudioUrls,
    segmentId: 'SEGMENT_1',
    channel: 'text',
    content: 'First segment text',
    requiredVoiceId: 'en-GB-SoniaNeural',
    requiredVoiceSource: 'global-download',
    expectedRenderFingerprint: rfSeg1.renderFingerprint
  });
  assert.deepEqual(map[buildTextStructuredRuntimeAudioKey('SEGMENT_1', 'text')], directSeg1);

  const plan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [documentTree],
    selection: { documents: [{ id: 'DOC_P1', scope: { blockIds: ['BLOCK_P1'] } }] },
    preferences,
    audioVariants,
    runtimeAudioUrls,
    stagingRecords: [{ id: 'stg_1', hasBlob: true, metadata: { renderFingerprint: rfSeg1.renderFingerprint } }]
  });
  const bySlot = new Map(plan.requirements.map(req => [`${req.segmentId}__${req.channel}`, req.status]));
  assert.equal(bySlot.get('SEGMENT_1__text'), TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY);
  assert.equal(bySlot.get('SEGMENT_2__text'), TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE);
  assert.equal(bySlot.get('SEGMENT_3__text'), TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);
  assert.equal(bySlot.get('SEGMENT_1__meaning'), TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);
  assert.equal(plan.coverage.ready, 1);
  assert.equal(plan.coverage.stale, 1);
  assert.equal(plan.coverage.missing, 3);
  assert.equal(plan.coverage.splitLogical, 5);
});

runCheck('P1-3: FOLLOW_PLAYER usage gating accurately detects document, card, and segment follow-player modes', () => {
  const baseTree = {
    id: 'DOC_BASE',
    metadata: {},
    blocks: [{ id: 'B1', blockType: 'paragraph', metadata: {}, segments: [{ id: 'S1', text: 'Hello', meaning: 'Halo', metadata: {} }] }]
  };
  assert.deepEqual(getTextStructuredTreeFollowPlayerUsage(baseTree), { text: false, meaning: false, any: false });

  // Custom/Default do NOT activate FOLLOW_PLAYER
  const customTree = {
    ...baseTree,
    metadata: buildTextStructuredAudioDownloadProfileMetadata({ metadata: {}, channel: 'text', voiceId: 'en-US-JennyNeural' })
  };
  assert.deepEqual(getTextStructuredTreeFollowPlayerUsage(customTree), { text: false, meaning: false, any: false });

  // FOLLOW_PLAYER on segment meaning triggers meaning only
  const segFollowTree = {
    ...baseTree,
    blocks: [{
      id: 'B1',
      blockType: 'paragraph',
      metadata: {},
      segments: [{
        id: 'S1',
        text: 'Hello',
        meaning: 'Halo',
        metadata: buildTextStructuredAudioDownloadProfileMetadata({ metadata: {}, channel: 'meaning', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER })
      }]
    }]
  };
  assert.deepEqual(getTextStructuredTreeFollowPlayerUsage(segFollowTree), { text: false, meaning: true, any: true });
  assert.deepEqual(getTextStructuredTreesFollowPlayerUsage([baseTree, segFollowTree]), { text: false, meaning: true, any: true });

  // Without FOLLOW_PLAYER, changing Browser TTS keeps effective download resolution identical.
  const a = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: baseTree,
    block: baseTree.blocks[0],
    segment: baseTree.blocks[0].segments[0],
    channel: 'text',
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', playbackTextVoiceName: 'Google UK English Female', edgeVoices: initialEdgeVoices }
  });
  const b = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: baseTree,
    block: baseTree.blocks[0],
    segment: baseTree.blocks[0].segments[0],
    channel: 'text',
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', playbackTextVoiceName: null, edgeVoices: null }
  });
  assert.deepEqual(a, b);
});

runCheck('P1-4: App.jsx isolates Single-Profile, Bulk Generation, Bulk Export deps & keeps synchronous fallback for closed Batch Popup', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

  // 1. Single-profile slice excludes Bulk fields
  const singleMatch = appSource.match(/const structuredTextSingleEdgePreferences = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[([\s\S]*?)\]\);/);
  assert.ok(singleMatch, 'structuredTextSingleEdgePreferences memo must exist');
  for (const excluded of ['bulkTextVoiceIds', 'bulkMeaningVoiceIds', 'bulkGenerateSplit', 'bulkGenerateFull', 'bulkAutoExport', 'bulkExportFormat', 'bulkExportVoicePolicy', 'generateText', 'generateMeaning']) {
    assert.ok(!singleMatch[1].includes(excluded) && !singleMatch[2].includes(excluded), `structuredTextSingleEdgePreferences must not depend on ${excluded}`);
  }

  // 2. Active coverage map follows FOLLOW_PLAYER usage gating
  assert.match(appSource, /const activeTreeFollowPlayerUsage = useMemo\([\s\S]*getTextStructuredTreeFollowPlayerUsage\(activeTextDocumentTree\)/);
  assert.match(appSource, /const resolvedStructuredFollowTextVoiceId = activeTreeFollowPlayerUsage\.text \? defaultStructuredTextVoiceId : null;/);
  assert.match(appSource, /const resolvedStructuredFollowMeaningVoiceId = activeTreeFollowPlayerUsage\.meaning \? defaultStructuredMeaningVoiceId : null;/);
  assert.match(appSource, /const resolvedStructuredFollowEdgeVoices = activeTreeFollowPlayerUsage\.any \? edgeVoices : null;/);

  // 3. Batch plans gated by structuredTextBatchActive and decoupled between Generation & Export
  assert.match(appSource, /const structuredTextBatchActive = Boolean\(\s*structuredTextModeActive && \(\s*effectiveIsBatchOpen\s*\|\| structuredTextAudioGenerationState\.running\s*\|\| structuredTextPendingAutoExport\s*\)\s*\);/);

  const genSliceMatch = appSource.match(/const structuredTextBulkGenerationPreferences = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[([\s\S]*?)\]\);/);
  assert.ok(genSliceMatch, 'structuredTextBulkGenerationPreferences memo must exist');
  for (const excluded of ['bulkAutoExport', 'bulkExportFormat', 'bulkExportVoicePolicy', 'bulkExportTextVoiceId', 'bulkExportMeaningVoiceId', 'bulkExportRepresentation', 'playbackTextVoiceName', 'playbackMeaningVoiceName']) {
    assert.ok(!genSliceMatch[2].includes(excluded), `structuredTextBulkGenerationPreferences must not depend on ${excluded}`);
  }

  const exportSliceMatch = appSource.match(/const structuredTextBulkExportPreferences = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[([\s\S]*?)\]\);/);
  assert.ok(exportSliceMatch, 'structuredTextBulkExportPreferences memo must exist');
  for (const excluded of ['bulkGenerateSplit', 'bulkGenerateFull', 'bulkAutoExport', 'bulkExportFormat']) {
    assert.ok(!exportSliceMatch[2].includes(excluded), `structuredTextBulkExportPreferences must not depend on ${excluded}`);
  }

  // 4. Synchronous on-demand resolver used by batch/export handlers even when Batch Popup is closed
  assert.match(appSource, /const resolveLiveStructuredTextBatchContext = useCallback\(/);
  assert.match(appSource, /runStructuredTextAudioGenerationBatch = useCallback[\s\S]*resolveLiveStructuredTextBatchContext\(\)/);
  assert.match(appSource, /handleStructuredTextBatchExportReadyMp3 = useCallback[\s\S]*resolveLiveStructuredTextBatchContext\(\)/);
  assert.match(appSource, /handleStructuredTextBatchExportConsolidatedZip = useCallback[\s\S]*resolveLiveStructuredTextBatchContext\(\)/);
  assert.match(appSource, /handleStructuredTextBulkExport = useCallback[\s\S]*resolveLiveStructuredTextBatchContext\(\)/);
});

runCheck('P1-5: Selection scope matches full workspace selection for Bulk Generation & Export plans', () => {
  const treeA = {
    id: 'DOC_A',
    title: 'Doc A',
    editorModel: 'structured-v1',
    textLanguage: 'en',
    meaningLanguage: 'id',
    blocks: [
      { id: 'B1', blockType: 'paragraph', segments: [{ id: 'S1', text: 'One', meaning: 'Satu' }] },
      { id: 'B2', blockType: 'conversation', segments: [{ id: 'S2', text: 'Two', meaning: 'Dua' }] }
    ]
  };
  const prefs = {
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    bulkTextVoiceIds: ['en-GB-SoniaNeural'],
    bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
    bulkGenerateSplit: true,
    bulkGenerateFull: true,
    edgeVoices: initialEdgeVoices
  };
  const fullSelection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [treeA],
    preferences: prefs,
    coverageMapsByDocument: { DOC_A: {} },
    activeDocumentId: 'DOC_A',
    activeScope: { cardId: 'B1' }
  });
  const scopeOnlySelection = {
    documents: fullSelection.documents.map(doc => ({ id: doc.id, title: doc.title, scope: doc.scope }))
  };
  const planFromFull = buildTextStructuredBulkGenerationPlan({ documentTrees: [treeA], selection: fullSelection, preferences: prefs });
  const planFromScope = buildTextStructuredBulkGenerationPlan({ documentTrees: [treeA], selection: scopeOnlySelection, preferences: prefs });
  assert.deepEqual(planFromScope.coverage, planFromFull.coverage);
  assert.equal(planFromScope.requirements.length, planFromFull.requirements.length);
  assert.equal(TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL, 'full');
});

console.log(`\nP1 APP CASCADE REMEDIATION SUMMARY: ${passed} PASS, ${failed} FAIL (${passed + failed} total)`);
if (failed > 0) process.exit(1);
