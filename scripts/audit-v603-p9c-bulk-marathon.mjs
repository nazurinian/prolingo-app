import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');

const createModuleLoader = () => {
  const cache = new Map();
  const loadModule = absPath => {
    const resolvedAbs = path.resolve(absPath);
    if (cache.has(resolvedAbs)) return cache.get(resolvedAbs).exports;
    const source = fs.readFileSync(resolvedAbs, 'utf8');
    const mod = { exports: {} };
    cache.set(resolvedAbs, mod);
    const req = specifier => {
      if (specifier === 'react') return { Fragment: Symbol('F'), default: {} };
      if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
      const resolved = path.resolve(path.dirname(resolvedAbs), specifier);
      for (const candidate of [resolved, `${resolved}.jsx`, `${resolved}.js`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return loadModule(candidate);
      }
      throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
    };
    const transformed = esbuild.transformSync(source, {
      loader: resolvedAbs.endsWith('.jsx') ? 'jsx' : 'js',
      format: 'cjs',
      target: 'es2022',
      jsx: 'transform'
    }).code;
    new Function('require', 'module', 'exports', transformed)(req, mod, mod.exports);
    return mod.exports;
  };
  return loadModule;
};

const loadMod = relPath => createModuleLoader()(path.join(root, relPath));

const {
  TEXT_AUDIO_COVERAGE_STATUS,
  buildTextStructuredAudioCoverageMap
} = await import('../src/domain/text/textStructuredAudioCoverageDomain.js');
const {
  buildTextStructuredAudioRenderDescriptor,
  buildTextStructuredAudioRenderFingerprint
} = await import('../src/domain/text/textStructuredAudioRenderFingerprintDomain.js');
const {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata,
  resolveTextStructuredFullArtifactReadiness,
  TEXT_STRUCTURED_ARTIFACT_READINESS
} = await import('../src/domain/text/textStructuredSplitFullDomain.js');
const {
  buildTextStructuredBulkGenerationPlan,
  selectTextStructuredBulkGenerationRequirements,
  TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS
} = await import('../src/domain/text/textStructuredBulkGenerationDomain.js');
const {
  buildTextStructuredBulkExportPlan,
  TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES
} = await import('../src/domain/text/textStructuredBulkExportDomain.js');
const {
  buildTextStructuredBatchSelection,
  buildTextStructuredBatchWorkspaceSelection,
  normalizeTextStructuredBatchScope,
  resolveTextStructuredBatchTargetWorkspaceIds
} = await import('../src/domain/text/textStructuredBatchDomain.js');
const { buildTextStructuredRuntimeAudioKey } = await import('../src/domain/text/textStructuredAudioRuntimeDomain.js');
const {
  buildProLingoTextAudioManifest,
  parseProLingoTextAudioManifestJson,
  TEXT_AUDIO_MANIFEST_FILENAME
} = await import('../src/domain/text/textAudioManifestDomain.js');
const {
  buildCanonicalTextFullArtifactFilename,
  buildCanonicalTextRenderAudioFilename
} = await import('../src/domain/text/textFilenameDomain.js');
const {
  buildTextStructuredAudioContentFingerprint
} = await import('../src/domain/text/textStructuredAudioIdentityDomain.js');
const { applyTextLibraryCommand, TEXT_LIBRARY_COMMAND_TYPES } = await import('../src/domain/text/textLibraryCommandDomain.js');

const { planTextAudioStagingGarbage } = loadMod('src/services/persistence/textAudioStagingGcService.js');
const { resolveTextAudioStagingPhysicalIdentity, summarizeTextAudioStaging } = loadMod('src/services/persistence/textAudioStagingService.js');
const { scanTextStructuredAudioZipFiles } = loadMod('src/services/audio/textStructuredAudioZipArchiveService.js');
const { buildStoredZipBlob } = loadMod('src/services/audio/browserZipService.js');
const { buildDerivedTextFullAudioFilename, buildDerivedTextFullAudioWav } = loadMod('src/services/audio/textStructuredFullAudioExportService.js');

const results = [];
const runCheck = async (area, kind, title, fn) => {
  try {
    await fn();
    results.push({ area, kind, title, ok: true });
    console.log(`PASS [${area}][${kind}] ${title}`);
  } catch (error) {
    results.push({ area, kind, title, ok: false, error: error?.message || String(error) });
    console.log(`FAIL [${area}][${kind}] ${title}\n   -> ${error?.message || error}`);
  }
};

const readRepoText = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

const makeFixtureWorld = () => {
  const docPara = {
    id: 'TEXT_DOC_P',
    uid: 'doc_uid_p',
    title: 'Paragraph Practice',
    collectionId: 'COL_1',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {},
    blocks: [
      {
        id: 'TEXT_000001',
        uid: 'blk_uid_1',
        documentId: 'TEXT_DOC_P',
        order: 1,
        blockType: 'paragraph',
        title: 'Card One',
        metadata: {},
        segments: [
          { id: 'SEGMENT_000001', uid: 'seg_uid_1', documentId: 'TEXT_DOC_P', blockId: 'TEXT_000001', order: 1, text: 'Good morning.', meaning: 'Selamat pagi.', metadata: {} },
          { id: 'SEGMENT_000002', uid: 'seg_uid_2', documentId: 'TEXT_DOC_P', blockId: 'TEXT_000001', order: 2, text: 'How are you?', meaning: 'Apa kabar?', metadata: {} }
        ]
      },
      {
        id: 'TEXT_000002',
        uid: 'blk_uid_2',
        documentId: 'TEXT_DOC_P',
        order: 2,
        blockType: 'paragraph',
        title: 'Card Two Duplicate Phrase',
        metadata: {},
        segments: [
          { id: 'SEGMENT_000003', uid: 'seg_uid_3', documentId: 'TEXT_DOC_P', blockId: 'TEXT_000002', order: 1, text: 'Good morning.', meaning: 'Selamat pagi.', metadata: {} },
          { id: 'SEGMENT_000004', uid: 'seg_uid_4', documentId: 'TEXT_DOC_P', blockId: 'TEXT_000002', order: 2, text: 'How are you?', meaning: 'Apa kabar?', metadata: {} }
        ]
      }
    ]
  };
  const docMixed = {
    id: 'TEXT_DOC_M',
    uid: 'doc_uid_m',
    title: 'Mixed Convo',
    collectionId: 'COL_1',
    editorModel: 'structured-v1',
    documentType: 'mixed',
    metadata: {},
    blocks: [
      {
        id: 'TEXT_000003',
        uid: 'blk_uid_3',
        documentId: 'TEXT_DOC_M',
        order: 1,
        blockType: 'conversation',
        title: 'Dialogue',
        metadata: {},
        segments: [
          { id: 'SEGMENT_000005', uid: 'seg_uid_5', documentId: 'TEXT_DOC_M', blockId: 'TEXT_000003', order: 1, speaker: 'Alice', text: 'Coffee?', meaning: 'Kopi?', metadata: {} }
        ]
      },
      {
        id: 'TEXT_000004',
        uid: 'blk_uid_4',
        documentId: 'TEXT_DOC_M',
        order: 2,
        blockType: 'paragraph',
        title: 'Narration',
        metadata: {},
        segments: [
          { id: 'SEGMENT_000006', uid: 'seg_uid_6', documentId: 'TEXT_DOC_M', blockId: 'TEXT_000004', order: 1, text: 'Thank you.', meaning: 'Terima kasih.', metadata: {} }
        ]
      }
    ]
  };
  return { docPara, docMixed };
};

const computeRf = args => buildTextStructuredAudioRenderFingerprint(args).renderFingerprint;

const makeStagingSplitRecord = ({ variantId, segmentId, channel, voiceId, content, rate = 0, pitch = 0, bytes = 2048, blobType = 'audio/mpeg' }) => {
  const rf = computeRf({
    channel, content, engine: 'edge', voiceId, rate, pitch
  });
  const filename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf, engine: 'edge', voiceId });
  return {
    id: `text|${variantId}`,
    mode: 'text',
    mapKey: variantId,
    part: channel,
    engine: 'edge',
    voiceId,
    size: bytes,
    hasBlob: true,
    status: 'staged',
    filename,
    mimeType: blobType,
    renderFingerprint: rf,
    rf,
    metadata: {
      audioVariantId: variantId,
      segmentId,
      channel,
      renderFingerprint: rf,
      audioRenderFingerprintV1: rf,
      audioRenderDescriptorV1: buildTextStructuredAudioRenderDescriptor({ channel, content, engine: 'edge', voiceId, rate, pitch })
    }
  };
};

// ============================================================================
// AREA 1 & 3: Single vs Bulk Split+Full Planning & Multi-voice Dedup
// ============================================================================
await runCheck('C1', 'CONTRACT', 'Bulk generation plans Split + Full across Paragraph cards, skips Conversation blocks, deduplicates identical physical renders, separates Stale', () => {
  const { docPara, docMixed } = makeFixtureWorld();
  const prefs = {
    generateText: true,
    generateMeaning: true,
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    bulkGenerateSplit: true,
    bulkGenerateFull: true,
    bulkTextVoiceIds: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural'],
    bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
    edgeRate: 0,
    edgePitch: 0
  };
  const selection = buildTextStructuredBatchWorkspaceSelection({ documentTrees: [docPara, docMixed], preferences: prefs });
  const plan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [docPara, docMixed],
    selection,
    preferences: prefs,
    audioVariants: [],
    runtimeAudioUrls: {},
    runtimeFullAudio: {},
    stagingRecords: []
  });

  // Card 1 and Card 2 have identical segments & identical joined card content:
  // Paragraph eligible blocks: 2 in docPara + 1 in docMixed (Conversation card TEXT_000003 skipped!).
  assert.equal(plan.coverage.eligibleBlockCount, 3);
  assert.equal(plan.coverage.skippedConversationBlockCount, 1);

  // Split slots: docPara (4 segments -> TEXT_000001 x2 segs + TEXT_000002 x2 segs) + docMixed (1 seg) = 5 segs
  // EN voices=2 (5 * 2 = 10 split EN), ID voices=1 (5 * 1 = 5 split ID) => 15 Split logical requirements!
  // Full blocks: 3 eligible blocks x (2 EN + 1 ID) = 9 Full logical requirements!
  assert.equal(plan.coverage.splitLogical, 15);
  assert.equal(plan.coverage.fullLogical, 9);
  assert.equal(plan.coverage.logicalRequirements, 24);

  // Physical dedup: Card 1 & Card 2 in docPara have IDENTICAL segment & card text -> share physical RF & Full fingerprints!
  // Unique Split physical: (2 unique docPara EN + 1 docMixed EN)*2 voices + (2+1 ID)*1 voice = 6 + 3 = 9
  // Unique Full physical: (1 unique docPara Full + 1 docMixed Full)*(2 EN + 1 ID) = 2 * 3 = 6 => Total 15 unique physical vs 24 logical!
  assert.equal(plan.coverage.uniquePhysicalRequirements, 15);
  assert.equal(selectTextStructuredBulkGenerationRequirements(plan, { mode: 'missing' }).length, 24);
  assert.equal(selectTextStructuredBulkGenerationRequirements(plan, { mode: 'missing-stale' }).length, 24);
});

// ============================================================================
// AREA 2: Edge Rate / Pitch / Voice RF Identity
// ============================================================================
await runCheck('C2', 'CONTRACT', 'Render fingerprint (Split RF & Full artifact) changes whenever content, voice, engine, rate, or pitch changes', () => {
  const block = makeFixtureWorld().docPara.blocks[0];
  const baseRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const rateRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 10, pitch: 0 });
  const pitchRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: -5 });
  const voiceRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 });
  const textRf = computeRf({ channel: 'text', content: 'Good afternoon.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  assert.equal(new Set([baseRf, rateRf, pitchRf, voiceRf, textRf]).size, 5);

  const fullA = buildTextStructuredFullArtifactRecord({ block, channel: 'text', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const fullB = buildTextStructuredFullArtifactRecord({ block, channel: 'text', voiceId: 'en-GB-SoniaNeural', rate: 5, pitch: 0 });
  assert.notEqual(fullA.fullArtifactFingerprint, fullB.fullArtifactFingerprint);
});

// ============================================================================
// AREA 4: Staging Isolation & GC Preserving Active Split + Full Physical Refs
// ============================================================================
await runCheck('C4', 'CONTRACT', 'Staging physical GC keeps active Split RF & Full artifact blobs, separates Table/Text records, and detects true orphans', () => {
  const { docPara } = makeFixtureWorld();
  const block1 = docPara.blocks[0];
  const fullArt = buildTextStructuredFullArtifactRecord({ block: block1, channel: 'text', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  block1.metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArt });

  const activeSplitRec = makeStagingSplitRecord({ variantId: 'TXTAUDIO_000001', segmentId: 'SEGMENT_000001', channel: 'text', voiceId: 'en-GB-SoniaNeural', content: 'Good morning.' });
  const orphanSplitRec = makeStagingSplitRecord({ variantId: 'TXTAUDIO_000999', segmentId: 'SEGMENT_000999', channel: 'text', voiceId: 'en-GB-SoniaNeural', content: 'Deleted line.' });
  const activeFullRec = {
    id: `text|full|${fullArt.fullArtifactFingerprint}`,
    mode: 'text',
    mapKey: fullArt.fullArtifactFingerprint,
    part: 'full-text',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    size: 4096,
    hasBlob: true,
    status: 'staged',
    filename: buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: fullArt.fullArtifactFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' }),
    metadata: {
      representation: 'full',
      fullArtifactFingerprint: fullArt.fullArtifactFingerprint,
      fullArtifactDescriptorV1: fullArt.descriptor
    }
  };

  const snapshot = {
    documents: [docPara],
    blocks: docPara.blocks,
    segments: docPara.blocks.flatMap(b => b.segments),
    audioVariants: [{
      id: 'TXTAUDIO_000001',
      segmentId: 'SEGMENT_000001',
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      metadata: {
        audioRenderFingerprintV1: activeSplitRec.rf,
        audioRenderDescriptorV1: activeSplitRec.metadata.audioRenderDescriptorV1,
        contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: 'Good morning.' })
      }
    }]
  };

  const gcPlan = planTextAudioStagingGarbage({ snapshot, records: [activeSplitRec, activeFullRec, orphanSplitRec] });
  assert.equal(gcPlan.rfCount, 2);
  assert.equal(gcPlan.fullCount, 1);
  assert.equal(gcPlan.referencedCount, 2);
  assert.equal(gcPlan.referencedRecords.length, 2);
  assert.deepEqual(gcPlan.orphanRecords.map(r => r.id), [orphanSplitRec.id]);
  assert.equal(resolveTextAudioStagingPhysicalIdentity(activeFullRec).representation, 'full');
  assert.equal(summarizeTextAudioStaging([activeSplitRec, activeFullRec]).count, 2);
});

// ============================================================================
// AREA 5: Portable ZIP Export -> Manifest v2 -> Binary ZIP Round-Trip Import
// ============================================================================
await runCheck('C5', 'CONTRACT', 'Portable ZIP buildStoredZipBlob -> scanTextStructuredAudioZipFiles parses manifest v2, Split+Full binaries, Shared RF fan-out & orphans', async () => {
  const { docPara } = makeFixtureWorld();
  const block1 = docPara.blocks[0];
  const block2 = docPara.blocks[1];
  const seg1 = block1.segments[0];
  const splitRf = computeRf({ channel: 'text', content: seg1.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const splitFilename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: splitRf, engine: 'edge', voiceId: 'en-GB-SoniaNeural' });
  const fullArt = buildTextStructuredFullArtifactRecord({ block: block1, channel: 'text', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const fullFilename = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: fullArt.fullArtifactFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' });

  const splitBytes = new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3])], { type: 'audio/mpeg' });
  const fullBytes = new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00, 9, 8, 7, 6])], { type: 'audio/mpeg' });
  const orphanBytes = new Blob([new Uint8Array([0xff, 0xfb, 0x10, 0x20])], { type: 'audio/mpeg' });

  const manifest = buildProLingoTextAudioManifest({
    entries: [
      {
        representation: 'split',
        rf: splitRf,
        filename: splitFilename,
        mimeType: 'audio/mpeg',
        size: splitBytes.size,
        render: buildTextStructuredAudioRenderDescriptor({ channel: 'text', content: seg1.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 }),
        references: [{ segmentId: seg1.id, channel: 'text' }]
      },
      {
        representation: 'full',
        fullArtifactFingerprint: fullArt.fullArtifactFingerprint,
        filename: fullFilename,
        mimeType: 'audio/mpeg',
        size: fullBytes.size,
        render: fullArt.descriptor,
        references: [{ blockId: block1.id, channel: 'text' }]
      }
    ],
    source: { kind: 'p9c-roundtrip-test' }
  });
  const parsedManifest = parseProLingoTextAudioManifestJson(JSON.stringify(manifest));
  assert.equal(parsedManifest.entries.length, 2);

  const zipBlob = await buildStoredZipBlob([
    { filename: splitFilename, blob: splitBytes },
    { filename: fullFilename, blob: fullBytes },
    { filename: 'SEGMENT_009999__TEXT__EDGE__NoVoice__TXTAUDIO_999999.mp3', blob: orphanBytes },
    { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }
  ]);
  // Attach File-like metadata (Node 24 Blob supports .slice/.arrayBuffer)
  const zipFile = Object.assign(zipBlob, { name: 'roundtrip.zip', lastModified: Date.now() });

  const scan = await scanTextStructuredAudioZipFiles({
    files: [zipFile],
    audioVariants: [],
    segments: [...block1.segments, ...block2.segments],
    requirements: [],
    blocks: [block1, block2],
    documents: [docPara]
  });

  // Both seg1 & block2.segments[0] have text="Good morning." -> dynamic manifest requirement fans 1 physical Split entry to 2 logical segments!
  // Both block1 & block2 have identical text -> 1 physical Full entry resolves to 2 matching Full blocks!
  assert.equal(scan.splitMatchedCount, 2, 'splitMatchedCount');
  assert.equal(scan.fullMatchedCount, 2, 'fullMatchedCount');
  assert.equal(scan.orphanCount, 1, 'orphanCount');
});

// ============================================================================
// AREA 6 & 11: Export Planners + Card/Full Export Gap Probes
// ============================================================================
await runCheck('C6', 'CONTRACT', 'buildTextStructuredBulkExportPlan filters Stale, respects voicePolicy (preferred/selected/all-selected) & deduplicates physical keys', () => {
  const { docPara } = makeFixtureWorld();
  const block1 = docPara.blocks[0];
  const seg1 = block1.segments[0];
  const seg3 = docPara.blocks[1].segments[0]; // Same text "Good morning."
  const soniaRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const libbyRf = computeRf({ channel: 'text', content: 'Good morning.', engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 });
  const staleRf = computeRf({ channel: 'text', content: 'Old text.', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });

  const variants = [
    { id: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', engine: 'edge', voiceId: 'en-GB-SoniaNeural', metadata: { audioRenderFingerprintV1: soniaRf, contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg1.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } } },
    { id: 'TXTAUDIO_000002', segmentId: seg3.id, channel: 'text', engine: 'edge', voiceId: 'en-GB-SoniaNeural', metadata: { audioRenderFingerprintV1: soniaRf, contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg3.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } } },
    { id: 'TXTAUDIO_000003', segmentId: seg1.id, channel: 'text', engine: 'edge', voiceId: 'en-GB-LibbyNeural', metadata: { audioRenderFingerprintV1: libbyRf, contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg1.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 } } },
    { id: 'TXTAUDIO_000004', segmentId: block1.segments[1].id, channel: 'text', engine: 'edge', voiceId: 'en-GB-SoniaNeural', metadata: { audioRenderFingerprintV1: staleRf, contentFingerprint: 'stale-cf', audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } } }
  ];
  const stagingRecords = [
    makeStagingSplitRecord({ variantId: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', voiceId: 'en-GB-SoniaNeural', content: 'Good morning.' }),
    makeStagingSplitRecord({ variantId: 'TXTAUDIO_000003', segmentId: seg1.id, channel: 'text', voiceId: 'en-GB-LibbyNeural', content: 'Good morning.' }),
    makeStagingSplitRecord({ variantId: 'TXTAUDIO_000004', segmentId: block1.segments[1].id, channel: 'text', voiceId: 'en-GB-SoniaNeural', content: 'Old text.' })
  ];
  const selection = buildTextStructuredBatchWorkspaceSelection({ documentTrees: [docPara], preferences: { generateText: true, generateMeaning: false } });

  const planAll = buildTextStructuredBulkExportPlan({
    documentTrees: [docPara], selection,
    preferences: {
      generateText: true, generateMeaning: false,
      edgeTextVoiceId: 'en-GB-SoniaNeural',
      bulkTextVoiceIds: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural'],
      bulkExportVoicePolicy: TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.ALL_SELECTED,
      bulkExportRepresentation: TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS.SPLIT
    },
    audioVariants: variants, stagingRecords
  });
  // Logical ready: seg1(Sonia), seg3(Sonia), seg1(Libby) [Wait: seg3 doesn't have Libby variant so 3 logical, 2 physical!] + stale TXTAUDIO_000004 excluded
  assert.equal(planAll.coverage.uniquePhysicalReady, 2);
  assert.equal(planAll.coverage.logicalReady, 3);

  const planPreferred = buildTextStructuredBulkExportPlan({
    documentTrees: [docPara], selection,
    preferences: {
      generateText: true, generateMeaning: false,
      edgeTextVoiceId: 'en-GB-SoniaNeural',
      bulkTextVoiceIds: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural'],
      bulkExportVoicePolicy: TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.PREFERRED,
      bulkExportRepresentation: TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS.SPLIT
    },
    audioVariants: variants, stagingRecords
  });
  assert.equal(planPreferred.coverage.uniquePhysicalReady, 1);
  assert.equal(planPreferred.physical[0].voiceId, 'en-GB-SoniaNeural');
});

await runCheck('C6', 'DEFECT', '[DEFECT P9C-C] Card-level export handlers (handleStructuredTextExportCardZip & ExportFullCardAudio) ignore Ready Edge Full artifacts', () => {
  const appSource = readRepoText('src/App.jsx');
  const cardZipSlice = appSource.slice(appSource.indexOf('const handleStructuredTextExportCardZip ='), appSource.indexOf('const handleStructuredTextExportFullCardAudio ='));
  const fullCardSlice = appSource.slice(appSource.indexOf('const handleStructuredTextExportFullCardAudio ='), appSource.indexOf('const handleStructuredTextBatchExportReadyMp3 ='));
  assert.match(cardZipSlice, /structuredTextFullAudioRuntimeUrls|getTextStructuredFullAudioArtifacts/, 'handleStructuredTextExportCardZip ignores Full audio artifacts and only zips Split variants');
  assert.match(fullCardSlice, /structuredTextFullAudioRuntimeUrls|fullAudioArtifacts/, 'handleStructuredTextExportFullCardAudio always rebuilds WAV from Split segments instead of checking Ready Edge Full MP3');
});

await runCheck('C11', 'CONTRACT', 'Derived Full WAV helper enforces AudioContext requirement cleanly and formats canonical filename', async () => {
  assert.equal(buildDerivedTextFullAudioFilename({ documentTitle: 'Unit 1', blockId: 'TEXT_000001', channel: 'text' }), 'Unit_1__TEXT_000001__FULL_EN__DERIVED.wav');
  await assert.rejects(() => buildDerivedTextFullAudioWav({ blobs: [new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })] }), /AudioContext/);
});

// ============================================================================
// AREA 7: Coverage Transitions When Preferences / Content Change
// ============================================================================
await runCheck('C7', 'CONTRACT', 'Preference change -> OTHER_VOICE / OTHER_PROFILE and text edit -> STALE while Staging physical blobs remain untouched until explicit release/GC', () => {
  const { docPara } = makeFixtureWorld();
  const block1 = docPara.blocks[0];
  const seg1 = block1.segments[0];
  const soniaRf = computeRf({ channel: 'text', content: seg1.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const fullArt = buildTextStructuredFullArtifactRecord({ block: block1, channel: 'text', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  block1.metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArt });

  const audioVariants = [{
    id: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural',
    metadata: {
      audioRenderFingerprintV1: soniaRf,
      audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 },
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg1.text })
    }
  }];
  const runtimeAudioUrls = { TXTAUDIO_000001: { stagingBacked: true, stagingId: 'text|TXTAUDIO_000001', renderFingerprint: soniaRf } };
  const runtimeFullAudio = { [fullArt.fullArtifactFingerprint]: { stagingBacked: true, stagingId: `text|full|${fullArt.fullArtifactFingerprint}` } };

  // Switch preferred voice Sonia -> Libby (Split RF-era = OTHER_PROFILE, Full = OTHER_PROFILE)
  const covOther = buildTextStructuredAudioCoverageMap({
    documentTree: docPara, audioVariants, runtimeAudioUrls,
    preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false }
  });
  const seg1TextKey = buildTextStructuredRuntimeAudioKey(seg1.id, 'text');
  assert.equal(covOther[seg1TextKey].status, TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE);

  const fullOther = resolveTextStructuredFullArtifactReadiness({
    block: block1, channel: 'text', profile: { voiceId: 'en-GB-LibbyNeural', engine: 'edge', rate: 0, pitch: 0 }, runtimeFullAudio
  });
  assert.equal(fullOther.status, TEXT_STRUCTURED_ARTIFACT_READINESS.OTHER_PROFILE);

  // Edit segment text -> STALE
  const editedBlock1 = { ...block1, segments: [{ ...seg1, text: 'Good evening.' }, block1.segments[1]] };
  const covStale = buildTextStructuredAudioCoverageMap({
    documentTree: { ...docPara, blocks: [editedBlock1] }, audioVariants, runtimeAudioUrls,
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false }
  });
  assert.equal(covStale[seg1TextKey].status, TEXT_AUDIO_COVERAGE_STATUS.STALE);

  const fullStale = resolveTextStructuredFullArtifactReadiness({
    block: editedBlock1, channel: 'text', profile: { voiceId: 'en-GB-SoniaNeural', engine: 'edge', rate: 0, pitch: 0 }, runtimeFullAudio
  });
  assert.equal(fullStale.status, TEXT_STRUCTURED_ARTIFACT_READINESS.STALE);
});

// ============================================================================
// AREA 8 & 9: Hydration After Backup Restore + Non-atomic ZIP Import
// ============================================================================
await runCheck('C8', 'DEFECT', '[DEFECT P9C-A] handleTextDatabaseBackupRestore / Pack Sync never re-hydrate Staging runtime URLs because structuredTextAudioStagingHydratedRef stays latched true', () => {
  const appSource = readRepoText('src/App.jsx');
  const restoreSlice = appSource.slice(appSource.indexOf('const handleTextDatabaseBackupRestore ='), appSource.indexOf('const handleStructuredTextRuntimeHardeningAudit ='));
  assert.match(restoreSlice, /structuredTextAudioStagingHydratedRef\.current\s*=\s*false|listTextAudioStagingMetadata/, 'handleTextDatabaseBackupRestore runs GC & ZIP reconcile but leaves structuredTextAudioStagingHydratedRef=true and never clears/re-hydrates runtime maps from Staging IDB');
});

await runCheck('C9', 'DEFECT', '[DEFECT P9C-B] Two-DB ZIP import writes Text Library metadata before reading/staging ZIP blobs without rollback on mid-stream failure', () => {
  const appSource = readRepoText('src/App.jsx');
  const zipFn = appSource.slice(appSource.indexOf('const handleStructuredTextAddAudioZipFiles ='), appSource.indexOf('const reconcileStructuredTextExternalAudioSources ='));
  const firstWritePos = zipFn.indexOf('materializeStructuredTextExternalRfRequirementsBulk');
  const firstReadPos = zipFn.indexOf('readTextStructuredAudioZipRuntimeBlob');
  assert.ok(firstWritePos > 0 && firstReadPos > firstWritePos);
  assert.match(zipFn, /catch[\s\S]*(DELETE_AUDIO_VARIANT|DELETE_FULL_AUDIO_ARTIFACT|rollback)/i, 'ZIP import materializes AudioVariants & FullArtifacts in Text Library IDB before extracting/staging blobs with no rollback on extraction error');
});

await runCheck('C9', 'CONTRACT', 'Repeated generation requirement selection does not duplicate physical/reusable counts in bulk selection', () => {
  const { docPara } = makeFixtureWorld();
  const block1 = docPara.blocks[0];
  const seg1 = block1.segments[0];
  const soniaRf = computeRf({ channel: 'text', content: seg1.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const stagingRec = makeStagingSplitRecord({ variantId: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', voiceId: 'en-GB-SoniaNeural', content: seg1.text });
  const selection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [docPara],
    preferences: { generateText: true, generateMeaning: false }
  });
  const plan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [docPara],
    selection,
    preferences: {
      generateText: true, generateMeaning: false, bulkGenerateSplit: true, bulkGenerateFull: false,
      bulkTextVoiceIds: ['en-GB-SoniaNeural'], bulkMeaningVoiceIds: []
    },
    audioVariants: [],
    runtimeAudioUrls: {},
    runtimeFullAudio: {},
    stagingRecords: [stagingRec]
  });
  // seg1 & seg3 have "Good morning." -> REUSABLE because physical stagingRec matches RF!
  const reusable = plan.requirements.filter(r => r.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE);
  assert.equal(reusable.length, 2);
  assert.equal(plan.coverage.reusable, 2);
  assert.equal(plan.coverage.missing, 2);
});

// ============================================================================
// AREA 10 & 13: Shared RF Delete/Release + Blob URL Revocation Hygiene
// ============================================================================
await runCheck('C10', 'CONTRACT', 'DELETE_BLOCK & DELETE_DOCUMENT commands cascade child segments & audioVariants cleanly so GC reclaims orphan blobs', () => {
  const { docPara } = makeFixtureWorld();
  const seg1 = docPara.blocks[0].segments[0];
  const snapshot = {
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: docPara.id,
    counters: { collection: 1, document: 1, block: 2, segment: 4, audioVariant: 1 },
    collections: [{ id: 'COL_1', title: 'Default', order: 1 }],
    documents: [docPara],
    blocks: docPara.blocks,
    segments: docPara.blocks.flatMap(b => b.segments),
    audioVariants: [{
      id: 'TXTAUDIO_000001',
      segmentId: seg1.id,
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      metadata: {
        audioRenderFingerprintV1: computeRf({ channel: 'text', content: seg1.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 })
      }
    }]
  };
  const { snapshot: afterDelete } = applyTextLibraryCommand(snapshot, { type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_BLOCK, payload: { id: 'TEXT_000001' } }, 1000);
  assert.equal(afterDelete.blocks.length, 1);
  assert.equal(afterDelete.audioVariants.length, 0);

  const stagingRec = makeStagingSplitRecord({ variantId: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', voiceId: 'en-GB-SoniaNeural', content: seg1.text });
  const gcAfterDelete = planTextAudioStagingGarbage({ snapshot: afterDelete, records: [stagingRec] });
  assert.equal(gcAfterDelete.orphanRecords.length, 1);
});

await runCheck('C13', 'DEFECT', '[DEFECT P9C-D] Portable ZIP Split import overwrites runtime entries without revoking prior blob URLs', () => {
  const appSource = readRepoText('src/App.jsx');
  const zipFn = appSource.slice(appSource.indexOf('const handleStructuredTextAddAudioZipFiles ='), appSource.indexOf('const reconcileStructuredTextExternalAudioSources ='));
  const runtimeSetSlice = zipFn.slice(zipFn.indexOf('setStructuredTextAudioRuntimeUrls(prev =>'), zipFn.indexOf('// Full entries use block-level'));
  assert.match(runtimeSetSlice, /URL\.revokeObjectURL/, 'ZIP import overwrites prev[match.variant.id] without revoking previous?.url');
});

await runCheck('C13', 'DEFECT', '[DEFECT P9C-E] Multi-part Bulk Export ZIP loop triggers multiple downloads without browser throttling pause', () => {
  const appSource = readRepoText('src/App.jsx');
  const bulkExportFn = appSource.slice(appSource.indexOf('const handleStructuredTextBulkExport ='), appSource.indexOf('const handleStructuredTextEdgeHealthCheck ='));
  const zipLoop = bulkExportFn.slice(bulkExportFn.indexOf('for (let chunkIndex = 0; chunkIndex < chunks.length;'));
  assert.match(zipLoop, /setTimeout/, 'Multi-part Bulk ZIP loop triggers consecutive triggerBrowserZipDownload calls without any wave yield');
});

// ============================================================================
// AREA 12: Scope Resolution & Empty Voice Guard
// ============================================================================
await runCheck('C12', 'CONTRACT', 'Batch target workspace resolution & card scope clamp behave deterministically across workspace/collection/selected/all', () => {
  const opts = [
    { id: 'D1', collectionId: 'C1' },
    { id: 'D2', collectionId: 'C1' },
    { id: 'D3', collectionId: 'C2' }
  ];
  assert.deepEqual(resolveTextStructuredBatchTargetWorkspaceIds({ workspaceOptions: opts, activeWorkspaceId: 'D1', activeCollectionId: 'C1', scope: { scopeMode: 'workspace' } }), ['D1']);
  assert.deepEqual(resolveTextStructuredBatchTargetWorkspaceIds({ workspaceOptions: opts, activeWorkspaceId: 'D1', activeCollectionId: 'C1', scope: { scopeMode: 'collection' } }), ['D1', 'D2']);
  assert.deepEqual(resolveTextStructuredBatchTargetWorkspaceIds({ workspaceOptions: opts, activeWorkspaceId: 'D1', activeCollectionId: 'C1', scope: { scopeMode: 'all' } }), ['D1', 'D2', 'D3']);
  assert.deepEqual(resolveTextStructuredBatchTargetWorkspaceIds({ workspaceOptions: opts, activeWorkspaceId: 'D1', scope: { scopeMode: 'selected', selectedDocumentIds: ['D3', 'MISSING'] } }), ['D3']);

  const { docPara } = makeFixtureWorld();
  assert.equal(normalizeTextStructuredBatchScope({ documentTree: docPara, scope: { cardId: 'TEXT_000002' } }).cardId, 'TEXT_000002');
});

await runCheck('C12', 'CONTRACT', 'buildTextStructuredBulkGenerationPlan allows explicit allowEmptyVoiceSelection=true for UI zeroing while defaulting empty non-UI drafts safely', () => {
  const { docPara } = makeFixtureWorld();
  const blockedPlan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [docPara],
    preferences: {
      generateText: true, generateMeaning: false, bulkGenerateSplit: true, bulkGenerateFull: false,
      edgeTextVoiceId: 'en-GB-SoniaNeural',
      bulkTextVoiceIds: [], bulkMeaningVoiceIds: [],
      allowEmptyVoiceSelection: true
    }
  });
  assert.equal(blockedPlan.coverage.logicalRequirements, 0);
  assert.equal(blockedPlan.selectedVoices.text.length, 0);
});

const passCount = results.filter(r => r.ok).length;
const failCount = results.filter(r => !r.ok).length;
console.log(`\nP9-C MARATHON SUMMARY: ${passCount} PASS, ${failCount} FAIL (${results.length} total)`);
if (failCount > 0) process.exitCode = 1;
