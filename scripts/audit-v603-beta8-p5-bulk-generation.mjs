import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeTextStructuredAudioGenerationPreferences
} from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import {
  TEXT_STRUCTURED_BULK_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS,
  buildTextStructuredBulkGenerationPlan,
  selectTextStructuredBulkGenerationRequirements,
  summarizeTextStructuredBulkPhysicalWork
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredFullArtifactRecord, buildTextStructuredFullAudioArtifactsMetadata } from '../src/domain/text/textStructuredSplitFullDomain.js';

let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`);
};

const seg = (id, text, meaning = '') => ({ id, text, meaning, order: Number(id.replace(/\D/g, '')) || 1, joinAfter: 'space', metadata: {} });
const paragraphA = { id: 'TEXT_000001', blockType: 'paragraph', title: 'A', order: 1, metadata: {}, segments: [seg('SEGMENT_000001', 'Same sentence.'), seg('SEGMENT_000002', 'Second sentence.')] };
const paragraphB = { id: 'TEXT_000002', blockType: 'paragraph', title: 'B', order: 2, metadata: {}, segments: [seg('SEGMENT_000003', 'Same sentence.'), seg('SEGMENT_000004', 'Second sentence.')] };
const conversation = { id: 'TEXT_000003', blockType: 'conversation', title: 'Later', order: 3, metadata: {}, segments: [seg('SEGMENT_000005', 'Do not include in P5.')] };
const tree = {
  id: 'DOC_000001', title: 'P5 Audit', collectionId: null, documentType: 'paragraph', editorModel: 'structured-v1',
  textLanguage: 'en-GB', meaningLanguage: 'id-ID', blocks: [paragraphA, paragraphB, conversation]
};
const selection = { documents: [{ id: tree.id, scope: { blockIds: tree.blocks.map(block => block.id) } }] };
const prefs = normalizeTextStructuredAudioGenerationPreferences({
  edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'su-ID-TutiNeural',
  bulkTextVoiceIds: ['en-GB-LibbyNeural', 'en-GB-MaisieNeural', 'en-GB-LibbyNeural'],
  generateText: true, generateMeaning: false, bulkGenerateSplit: true, bulkGenerateFull: true
});

check('P5 preference normalization keeps multiple unique voices and Split+Full', () => {
  assert.deepEqual(prefs.bulkTextVoiceIds, ['en-GB-LibbyNeural', 'en-GB-MaisieNeural']);
  assert.equal(prefs.bulkGenerateSplit, true);
  assert.equal(prefs.bulkGenerateFull, true);
});

check('P5 preference normalization prevents both representations being OFF', () => {
  const normalized = normalizeTextStructuredAudioGenerationPreferences({ bulkGenerateSplit: false, bulkGenerateFull: false });
  assert.equal(normalized.bulkGenerateSplit, true);
  assert.equal(normalized.bulkGenerateFull, false);
});

const plan = buildTextStructuredBulkGenerationPlan({ documentTrees: [tree], selection, preferences: prefs });
check('Split + Full + two voices create the expected logical requirements', () => {
  assert.equal(plan.coverage.splitLogical, 8);
  assert.equal(plan.coverage.fullLogical, 4);
  assert.equal(plan.coverage.logicalRequirements, 12);
  assert.deepEqual(new Set(plan.requirements.map(item => item.voiceId)), new Set(['en-GB-LibbyNeural', 'en-GB-MaisieNeural']));
});

check('Shared Split RF deduplicates identical content/profile physically', () => {
  const split = plan.requirements.filter(item => item.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.SPLIT);
  assert.equal(split.length, 8);
  assert.equal(new Set(split.map(item => item.physicalKey)).size, 4);
});

check('Identical Full content/profile fans out through one physical Full identity', () => {
  const full = plan.requirements.filter(item => item.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL);
  assert.equal(full.length, 4);
  assert.equal(new Set(full.map(item => item.physicalKey)).size, 2);
});

check('P5 remains Paragraph-first and explicitly skips Conversation blocks', () => {
  assert.equal(plan.coverage.eligibleBlockCount, 2);
  assert.equal(plan.coverage.skippedConversationBlockCount, 1);
  assert.ok(plan.requirements.every(item => item.blockId !== conversation.id));
});

check('Logical-vs-physical coverage is distinct', () => {
  assert.equal(plan.coverage.logicalRequirements, 12);
  assert.equal(plan.coverage.uniquePhysicalRequirements, 6);
  assert.equal(plan.coverage.uniquePhysicalMissing, 6);
});

const sharedSplit = plan.requirements.find(item => item.representation === 'split' && item.segmentId === 'SEGMENT_000001' && item.voiceId === 'en-GB-LibbyNeural');
const stagingPlan = buildTextStructuredBulkGenerationPlan({
  documentTrees: [tree], selection, preferences: prefs,
  stagingRecords: [{ id: 'stage-rf', hasBlob: true, mapKey: sharedSplit.physicalKey, metadata: { renderFingerprint: sharedSplit.physicalKey } }]
});
check('Existing physical Split RF is reusable for every matching logical consumer without TTS', () => {
  const matching = stagingPlan.requirements.filter(item => item.physicalKey === sharedSplit.physicalKey);
  assert.equal(matching.length, 2);
  assert.ok(matching.every(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE));
  assert.equal(stagingPlan.coverage.uniquePhysicalReady, 1);
});

const sharedFull = plan.requirements.find(item => item.representation === 'full' && item.blockId === paragraphA.id && item.voiceId === 'en-GB-LibbyNeural');
const fullStagingPlan = buildTextStructuredBulkGenerationPlan({
  documentTrees: [tree], selection, preferences: prefs,
  stagingRecords: [{ id: 'stage-full', hasBlob: true, mapKey: sharedFull.physicalKey, metadata: { representation: 'full', fullArtifactFingerprint: sharedFull.physicalKey } }]
});
check('Existing physical Full Artifact is reusable across identical Cards', () => {
  const matching = fullStagingPlan.requirements.filter(item => item.physicalKey === sharedFull.physicalKey);
  assert.equal(matching.length, 2);
  assert.ok(matching.every(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE));
});

const staleVariant = {
  id: 'TXTAUDIO_STALE', segmentId: paragraphA.segments[0].id, channel: 'text', engine: 'edge', voiceId: 'en-GB-LibbyNeural',
  metadata: { audioRenderFingerprintV1: 'rf-sha256-stale' }
};
const staleFullArtifact = buildTextStructuredFullArtifactRecord({
  block: { ...paragraphA, segments: paragraphA.segments.map((item, index) => index === 1 ? { ...item, text: 'Old full content.' } : item) },
  channel: 'text', language: 'en-GB', engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0
});
const treeWithStale = {
  ...tree,
  blocks: [
    { ...paragraphA, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: staleFullArtifact }) },
    paragraphB,
    conversation
  ]
};
const stalePlan = buildTextStructuredBulkGenerationPlan({ documentTrees: [treeWithStale], selection, preferences: prefs, audioVariants: [staleVariant] });
check('Stale Split/Full requirements are classified separately from Missing', () => {
  assert.ok(stalePlan.coverage.stale >= 2);
  assert.ok(stalePlan.coverage.missing > 0);
});

check('Generate Missing excludes Stale while Missing + Stale includes it', () => {
  const missing = selectTextStructuredBulkGenerationRequirements(stalePlan, { mode: 'missing' });
  const withStale = selectTextStructuredBulkGenerationRequirements(stalePlan, { mode: 'missing-and-stale' });
  assert.ok(missing.every(item => item.status === 'missing' || item.status === 'reusable-physical'));
  assert.ok(withStale.some(item => item.status === 'stale'));
  assert.equal(withStale.length, missing.length + stalePlan.coverage.stale);
});

check('Physical work summary never counts shared logical consumers as duplicate binaries', () => {
  const summary = summarizeTextStructuredBulkPhysicalWork(plan.requirements);
  assert.equal(summary.logicalRequirements, 12);
  assert.equal(summary.uniquePhysicalRequirements, 6);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const popupSource = fs.readFileSync(path.join(root, 'src/components/text/TextBatchPopup.jsx'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'src/constants/appMetadata.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

check('App P5 Full generation is Staging-first before logical Full Artifact commit', () => {
  const start = appSource.indexOf('const generateStructuredTextFullAudioJob');
  const end = appSource.indexOf('const runStructuredTextAudioGenerationBatch', start);
  const section = appSource.slice(start, end);
  const putIndex = section.lastIndexOf('putTextFullAudioStagingBlob(');
  const commitAfterPut = section.indexOf('commitArtifact(', putIndex);
  assert.ok(putIndex >= 0);
  assert.ok(commitAfterPut > putIndex);
});

check('P5 Bulk runner preserves physical telemetry and does not directly export from the generation loop', () => {
  const start = appSource.indexOf('const runStructuredTextAudioGenerationBatch');
  const end = appSource.indexOf('const handleStructuredTextCancelGeneration', start);
  const section = appSource.slice(start, end);
  assert.match(section, /generatedPhysical/);
  assert.match(section, /reusedPhysical/);
  assert.match(section, /logicalRequirements/);
  assert.doesNotMatch(section, /exportTextAudioStagingZipChunks\s*\(/);
  assert.doesNotMatch(section, /handleStructuredTextBulkExport\s*\(/);
});

check('P5 UI exposes multi-voice, Split/Full, Generate Missing and separate stale action', () => {
  assert.match(popupSource, /data-text-bulk-en-voices/);
  assert.match(popupSource, /data-text-bulk-representations/);
  assert.match(popupSource, /GENERATE MISSING/);
  assert.match(popupSource, /GENERATE MISSING \+ STALE/);
});

check('P5 release lineage remains recorded and current release metadata stays internally aligned', () => {
  assert.match(metadataSource, /v6\.0\.3-beta\.8-p5 adds Paragraph-first Bulk Multi-Voice generation/);
  assert.match(metadataSource, /v6\.0\.3-beta\.8-p4 completes Staging-first Portable ZIP/);
  assert.match(metadataSource, /v6\.0\.3-beta\.8-p3 adds persisted Split\/Full runtime playback/);
  const appVersion = metadataSource.match(/APP_VERSION = '([^']+)'/)?.[1];
  assert.ok(appVersion?.startsWith('6.0.3-beta.8-p'));
  assert.equal(packageJson.version, appVersion);
  assert.equal(packageLock.version, appVersion);
  assert.equal(packageLock.packages?.['']?.version, appVersion);
});

check('Text DB schema remains v1', () => {
  const files = [
    path.join(root, 'src/constants/textDatabaseConstants.js'),
    path.join(root, 'src/services/persistence/textLibraryIndexedDbService.js')
  ].filter(fs.existsSync);
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /(?:DB_VERSION|TEXT_DB_VERSION|version)\s*=\s*1|open\([^,]+,\s*1\)/i);
});

console.log(`\nP5 targeted audit: ${pass} PASS`);
