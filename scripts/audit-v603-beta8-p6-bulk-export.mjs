import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTextStructuredAudioGenerationPreferences } from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import { buildTextStructuredBulkGenerationPlan } from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import {
  TEXT_STRUCTURED_BULK_EXPORT_FORMATS,
  TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES,
  buildTextStructuredBulkExportPlan
} from '../src/domain/text/textStructuredBulkExportDomain.js';
import { buildTextStructuredAudioContentFingerprint } from '../src/domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredFullAudioArtifactsMetadata, buildTextStructuredFullArtifactRecord } from '../src/domain/text/textStructuredSplitFullDomain.js';

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`); };
const seg = (id, text, meaning = '') => ({ id, text, meaning, order: Number(id.replace(/\D/g, '')) || 1, joinAfter: 'space', metadata: {} });
const a = { id: 'TEXT_000001', blockType: 'paragraph', title: 'Morning A', order: 1, metadata: {}, segments: [seg('SEGMENT_000001', 'Same sentence.'), seg('SEGMENT_000002', 'Second sentence.')] };
const b = { id: 'TEXT_000002', blockType: 'paragraph', title: 'Morning B', order: 2, metadata: {}, segments: [seg('SEGMENT_000003', 'Same sentence.'), seg('SEGMENT_000004', 'Second sentence.')] };
const tree = {
  id: 'DOC_000001', title: 'P6 Audit', collectionId: null, documentType: 'paragraph', editorModel: 'structured-v1', textLanguage: 'en-GB', meaningLanguage: 'id-ID',
  metadata: { audioPlaybackOrderV1: { version: 1, channels: { text: [{ engine: 'edge', voiceId: 'en-GB-MaisieNeural' }, { engine: 'edge', voiceId: 'en-GB-LibbyNeural' }], meaning: [] }, ttsOnly: false } },
  blocks: [a, b]
};
const selection = { documents: [{ id: tree.id, title: tree.title, scope: { blockIds: tree.blocks.map(block => block.id) } }] };
const basePrefs = normalizeTextStructuredAudioGenerationPreferences({
  generateText: true, generateMeaning: false, edgeRate: 0, edgePitch: 0,
  bulkTextVoiceIds: ['en-GB-LibbyNeural', 'en-GB-MaisieNeural'], bulkGenerateSplit: true, bulkGenerateFull: true,
  bulkExportVoicePolicy: 'all-selected', bulkExportRepresentation: 'both', bulkAutoExport: false
});
const generation = buildTextStructuredBulkGenerationPlan({ documentTrees: [tree], selection, preferences: basePrefs });
const splitReqs = generation.requirements.filter(item => item.representation === 'split');
const fullReqs = generation.requirements.filter(item => item.representation === 'full');

const variants = splitReqs.map((req, index) => ({
  id: `AUDIO_${String(index + 1).padStart(6, '0')}`, segmentId: req.segmentId, channel: req.channel, engine: 'edge', voiceId: req.voiceId,
  metadata: {
    contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: req.channel, content: req.content }),
    contentFingerprintV2: req.contentFingerprintV2,
    audioRenderFingerprintV1: req.physicalKey,
    audioRenderDescriptorV1: req.renderDescriptor
  }
}));
const fullByBlock = new Map();
for (const block of [a, b]) {
  let metadata = block.metadata || {};
  for (const req of fullReqs.filter(item => item.blockId === block.id)) {
    const artifact = buildTextStructuredFullArtifactRecord({ block, channel: req.channel, language: req.language, engine: 'edge', voiceId: req.voiceId, rate: 0, pitch: 0 });
    metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata, artifact });
  }
  fullByBlock.set(block.id, { ...block, metadata });
}
const readyTree = { ...tree, blocks: [fullByBlock.get(a.id), fullByBlock.get(b.id)] };
const physicalKeys = [...new Set(generation.requirements.map(item => item.physicalKey))];
const staging = physicalKeys.map((key, index) => ({
  id: `STAGE_${index + 1}`, hasBlob: true, mapKey: key, filename: `${key}.mp3`, mimeType: 'audio/mpeg', size: 1000,
  metadata: key.startsWith('full-sha256-') ? { representation: 'full', fullArtifactFingerprint: key } : { representation: 'split', renderFingerprint: key }
}));

check('P6 preferences keep Auto Export OFF by default', () => {
  assert.equal(normalizeTextStructuredAudioGenerationPreferences({}).bulkAutoExport, false);
});
check('P6 export format normalization accepts all three frozen formats', () => {
  for (const format of Object.values(TEXT_STRUCTURED_BULK_EXPORT_FORMATS)) assert.equal(normalizeTextStructuredAudioGenerationPreferences({ bulkExportFormat: format }).bulkExportFormat, format);
});

const allPlan = buildTextStructuredBulkExportPlan({ documentTrees: [readyTree], selection, preferences: basePrefs, audioVariants: variants, stagingRecords: staging });
check('All-selected + Both exposes Split and Full logical Ready rows', () => {
  assert.ok(allPlan.coverage.splitLogical > 0);
  assert.ok(allPlan.coverage.fullLogical > 0);
  assert.equal(allPlan.coverage.logicalReady, 12);
});
check('P6 physical export plan deduplicates shared logical RF / Full identities', () => {
  assert.equal(allPlan.coverage.logicalReady, 12);
  assert.equal(allPlan.coverage.uniquePhysicalReady, 6);
});
check('All selected generation voices coexist in one export plan', () => {
  assert.deepEqual(new Set(allPlan.logical.map(item => item.voiceId)), new Set(['en-GB-LibbyNeural', 'en-GB-MaisieNeural']));
});

const splitPlan = buildTextStructuredBulkExportPlan({ documentTrees: [readyTree], selection, preferences: { ...basePrefs, bulkExportRepresentation: 'split' }, audioVariants: variants, stagingRecords: staging });
check('Split-only export excludes Full physical artifacts', () => {
  assert.ok(splitPlan.physical.length > 0);
  assert.ok(splitPlan.physical.every(item => item.representation === 'split'));
});
const fullPlan = buildTextStructuredBulkExportPlan({ documentTrees: [readyTree], selection, preferences: { ...basePrefs, bulkExportRepresentation: 'full' }, audioVariants: variants, stagingRecords: staging });
check('Full-only export excludes Split RF binaries', () => {
  assert.ok(fullPlan.physical.length > 0);
  assert.ok(fullPlan.physical.every(item => item.representation === 'full'));
});

const selectedPlan = buildTextStructuredBulkExportPlan({
  documentTrees: [readyTree], selection,
  preferences: { ...basePrefs, bulkExportVoicePolicy: TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.SELECTED, bulkExportTextVoiceId: 'en-GB-LibbyNeural' },
  audioVariants: variants, stagingRecords: staging
});
check('Selected voice policy exports exactly the chosen voice', () => {
  assert.ok(selectedPlan.logical.length > 0);
  assert.ok(selectedPlan.logical.every(item => item.voiceId === 'en-GB-LibbyNeural'));
});
const preferredPlan = buildTextStructuredBulkExportPlan({
  documentTrees: [readyTree], selection,
  preferences: { ...basePrefs, bulkExportVoicePolicy: TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.PREFERRED },
  audioVariants: variants, stagingRecords: staging
});
check('Preferred policy follows Workspace playback order without mutating it', () => {
  assert.ok(preferredPlan.logical.length > 0);
  assert.ok(preferredPlan.logical.every(item => item.voiceId === 'en-GB-MaisieNeural'));
  assert.equal(readyTree.metadata.audioPlaybackOrderV1.channels.text[0].voiceId, 'en-GB-MaisieNeural');
});

const staleTree = { ...readyTree, blocks: readyTree.blocks.map((block, index) => index === 0 ? { ...block, segments: block.segments.map((item, i) => i === 0 ? { ...item, text: 'Edited current text.' } : item) } : block) };
const stalePlan = buildTextStructuredBulkExportPlan({ documentTrees: [staleTree], selection, preferences: basePrefs, audioVariants: variants, stagingRecords: staging });
check('Stale Split and Full content fail closed instead of exporting old Staging audio', () => {
  assert.ok(stalePlan.coverage.logicalReady < allPlan.coverage.logicalReady);
  assert.ok(!stalePlan.logical.some(item => item.blockId === a.id && item.segmentId === 'SEGMENT_000001'));
  assert.ok(!stalePlan.logical.some(item => item.blockId === a.id && item.representation === 'full'));
});
const profileMismatch = buildTextStructuredBulkExportPlan({ documentTrees: [readyTree], selection, preferences: { ...basePrefs, edgeRate: 10 }, audioVariants: variants, stagingRecords: staging });
check('Different current rate/pitch profile does not export old-profile physical binaries', () => {
  assert.equal(profileMismatch.coverage.logicalReady, 0);
  assert.equal(profileMismatch.coverage.uniquePhysicalReady, 0);
});

const missingStage = buildTextStructuredBulkExportPlan({ documentTrees: [readyTree], selection, preferences: basePrefs, audioVariants: variants, stagingRecords: staging.slice(1) });
check('Logical metadata without its physical Staging binary is not export Ready', () => {
  assert.ok(missingStage.coverage.logicalReady < allPlan.coverage.logicalReady);
  assert.ok(missingStage.coverage.uniquePhysicalReady < allPlan.coverage.uniquePhysicalReady);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const popupSource = fs.readFileSync(path.join(root, 'src/components/text/TextBatchPopup.jsx'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'src/constants/appMetadata.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

check('P6 UI exposes Auto Export OFF/ON, voice policy, representation, and three output formats', () => {
  assert.match(popupSource, /Auto Export/);
  assert.match(popupSource, /Preferred playback voice/);
  assert.match(popupSource, /Split \+ Full/);
  assert.match(popupSource, /Audio-Only • Direct files/);
  assert.match(popupSource, /Audio-Only • One ZIP/);
  assert.match(popupSource, /Portable ProLingo ZIP/);
});
check('P6 App separates logical Ready from unique physical telemetry and produces manifest + AUDIO_INDEX', () => {
  const start = appSource.indexOf('const handleStructuredTextBulkExport');
  const end = appSource.indexOf('const handleStructuredTextEdgeHealthCheck', start);
  const section = appSource.slice(start, end);
  assert.match(section, /logicalReady/);
  assert.match(section, /unique physical/);
  assert.match(section, /TEXT_AUDIO_MANIFEST_FILENAME/);
  assert.match(section, /TEXT_AUDIO_INDEX_FILENAME/);
  assert.match(section, /buildTextBulkAudioOnlyFilename/);
});
check('Auto Export is edge-triggered after generation/Staging reconciliation, not setTimeout-driven', () => {
  const runStart = appSource.indexOf('const runStructuredTextAudioGenerationBatch');
  const runEnd = appSource.indexOf('const handleStructuredTextCancelGeneration', runStart);
  const run = appSource.slice(runStart, runEnd);
  assert.match(run, /setStructuredTextPendingAutoExport/);
  assert.doesNotMatch(run, /structuredTextBulkAutoExportRef/);
  assert.match(appSource, /if \(!structuredTextPendingAutoExport \|\| structuredTextAudioGenerationState\.running\) return/);
});
check('P6 release lineage remains recorded and current release metadata stays internally aligned', () => {
  assert.match(metadataSource, /v6\.0\.3-beta\.8-p6 adds Paragraph Bulk Export \/ Auto Export/);
  const appVersion = metadataSource.match(/APP_VERSION = '([^']+)'/)?.[1];
  assert.ok(appVersion?.startsWith('6.0.3-beta.8-p'));
  assert.equal(packageJson.version, appVersion);
  assert.equal(packageLock.version, appVersion);
  assert.equal(packageLock.packages?.['']?.version, appVersion);
});
check('Text DB remains v1', () => {
  const source = [path.join(root, 'src/constants/textDatabaseConstants.js'), path.join(root, 'src/services/persistence/textLibraryIndexedDbService.js')]
    .filter(fs.existsSync).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /(?:DB_VERSION|TEXT_DB_VERSION|version)\s*=\s*1|open\([^,]+,\s*1\)/i);
});

console.log(`\nP6 targeted audit: ${pass} PASS`);
