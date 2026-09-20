import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCanonicalTextRenderAudioFilename,
  parseCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  validateProLingoTextAudioManifest
} from '../src/domain/text/textAudioManifestDomain.js';
import { buildTextStructuredBatchWorkspaceSelection } from '../src/domain/text/textStructuredBatchDomain.js';
import { buildDerivedTextFullAudioWav, buildDerivedTextFullAudioFilename } from '../src/services/audio/textStructuredFullAudioExportService.js';

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };

const rf = `rf-sha256-${'ab'.repeat(32)}`;
const filename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf, engine: 'edge', voiceId: 'en-GB-RyanNeural', extension: 'mp3' });
ok(filename.startsWith(`RF_${'AB'.repeat(32)}__EDGE__Ryan`), 'RF filename must be physical-RF centric');
const parsed = parseCanonicalTextRenderAudioFilename(filename);
ok(parsed?.renderFingerprint === rf, 'RF filename round-trip');

const manifest = buildProLingoTextAudioManifest({ entries: [{ rf, filename, mimeType: 'audio/mpeg', size: 10, references: [{ segmentId: 'SEGMENT_000001' }, { segmentId: 'SEGMENT_000002' }] }] });
const validated = validateProLingoTextAudioManifest(manifest);
ok(validated.entries.length === 1, 'manifest stores one physical RF entry');
ok(validated.entries[0].references.length === 2, 'manifest preserves multiple logical references to one RF');

const doc = {
  id: 'DOC_000001', uid: 'WSUID_test', title: 'Workspace', editorModel: 'structured-v1', documentType: 'paragraph', textLanguage: 'en', meaningLanguage: 'id',
  blocks: [{ id: 'TEXT_000001', uid: 'CARDUID_test', blockType: 'paragraph', title: 'Card', metadata: {}, segments: [
    { id: 'SEGMENT_000001', uid: 'SEGUID_a', text: 'Same sentence.', meaning: '', order: 1, metadata: {} },
    { id: 'SEGMENT_000002', uid: 'SEGUID_b', text: 'Same sentence.', meaning: '', order: 2, metadata: {} }
  ] }]
};
const selection = buildTextStructuredBatchWorkspaceSelection({ documentTrees: [doc], preferences: { edgeTextVoiceId: 'en-GB-RyanNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', generateText: true, generateMeaning: false }, coverageMapsByDocument: {}, activeDocumentId: doc.id, activeScope: { scopeMode: 'workspace' } });
ok(selection.slots.length === 2, 'batch preserves two logical Segment slots');
ok(selection.slots.every(slot => slot.documentUid === 'WSUID_test'), 'batch slots carry Workspace UID diagnostics');
ok(selection.slots.every(slot => slot.cardUid === 'CARDUID_test'), 'batch slots carry Card UID diagnostics');
ok(selection.slots.map(slot => slot.segmentUid).join(',') === 'SEGUID_a,SEGUID_b', 'batch slots carry Segment UID diagnostics');

class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.calls = 0; }
  async decodeAudioData() {
    this.calls += 1;
    const length = this.calls === 1 ? 4 : 3;
    const data = new Float32Array(length).fill(this.calls === 1 ? 0.25 : -0.25);
    return { length, numberOfChannels: 1, sampleRate: 48000, duration: length / 48000, getChannelData: () => data };
  }
  async close() {}
}
globalThis.AudioContext = FakeAudioContext;
const full = await buildDerivedTextFullAudioWav({ blobs: [new Blob(['a'], { type: 'audio/mpeg' }), new Blob(['b'], { type: 'audio/mpeg' })] });
ok(full.segmentCount === 2, 'Full derived audio composes ordered Segment binaries');
ok(full.blob.type === 'audio/wav', 'Full derived output is WAV');
ok(full.blob.size === 44 + (7 * 1 * 2), 'Full WAV contains one header plus ordered PCM frames');
ok(buildDerivedTextFullAudioFilename({ documentTitle: 'My Text', blockId: 'TEXT_000001', channel: 'meaning' }).endsWith('__FULL_ID__DERIVED.wav'), 'Full ID naming is explicit and derived');

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panelSource = fs.readFileSync(new URL('../src/components/text/TextStructuredCardAudioPanel.jsx', import.meta.url), 'utf8');
const popupSource = fs.readFileSync(new URL('../src/components/text/TextBatchPopup.jsx', import.meta.url), 'utf8');
ok(appSource.includes('physicalByRf') && appSource.includes('buildProLingoTextAudioManifest'), 'Card/Batch ZIP production path RF-deduplicates and emits manifest');
ok(appSource.includes('reusedPhysical: reused'), 'Batch telemetry separates RF reuse from new generation');
ok((panelSource.includes('SELECTED ZIP') && panelSource.includes('segmentIds: selectedSegmentIds')) || (panelSource.includes('Scope exports now live in Bulk Audio') && panelSource.includes('onExportSegmentAudio')), 'DL1 granular Segment export remains reachable while P7 centralizes scope export in Bulk Audio');
ok((panelSource.includes('FULL EN') && panelSource.includes('FULL ID')) || (popupSource.includes('Split + Full') && popupSource.includes('Audio-Only')), 'DL2 Full export remains available through the final Split/Full Bulk export surface');
ok((popupSource.includes('unique physical RF') && popupSource.includes('Text Audio Manifest')) || (popupSource.includes('Unique physical') && popupSource.includes('Portable ProLingo ZIP')), 'Batch UI exposes physical dedup and canonical Portable export behavior');

console.log(`PASS DL1/DL2/B1 download-batch audit: ${checks} checks`);
