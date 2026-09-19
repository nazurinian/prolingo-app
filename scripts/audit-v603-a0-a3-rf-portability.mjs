import assert from 'node:assert/strict';
import {
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildCanonicalTextRenderAudioFilename,
  parseCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  parseProLingoTextAudioManifestJson,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../src/domain/text/textAudioManifestDomain.js';
import { scanTextStructuredAudioFolderFiles } from '../src/services/audio/textStructuredAudioFolderService.js';
import { scanTextStructuredAudioZipFiles } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';

let checks = 0;
const pass = fn => { fn(); checks += 1; };
const base = { channel: 'text', content: 'Good morning.', language: 'en-GB', engine: 'edge', voiceId: 'en-GB-RyanNeural', rate: 0, pitch: 0 };
const a = buildTextStructuredAudioRenderFingerprint(base);
const b = buildTextStructuredAudioRenderFingerprint({ ...base });
pass(() => assert.equal(a.renderFingerprint, b.renderFingerprint));
pass(() => assert.ok(/^rf-sha256-[0-9a-f]{64}$/.test(a.renderFingerprint)));
pass(() => assert.notEqual(a.renderFingerprint, buildTextStructuredAudioRenderFingerprint({ ...base, content: 'Good evening.' }).renderFingerprint));
pass(() => assert.notEqual(a.renderFingerprint, buildTextStructuredAudioRenderFingerprint({ ...base, voiceId: 'en-GB-SoniaNeural' }).renderFingerprint));
pass(() => assert.notEqual(a.renderFingerprint, buildTextStructuredAudioRenderFingerprint({ ...base, rate: -10 }).renderFingerprint));
pass(() => assert.notEqual(a.renderFingerprint, buildTextStructuredAudioRenderFingerprint({ ...base, pitch: 5 }).renderFingerprint));

const filename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: a.renderFingerprint, engine: 'edge', voiceId: base.voiceId, extension: 'mp3' });
const parsed = parseCanonicalTextRenderAudioFilename(filename);
pass(() => assert.equal(parsed.renderFingerprint, a.renderFingerprint));
pass(() => assert.equal(parsed.version, 2));

const requirements = [
  { segmentId: 'SEGMENT_A', channel: 'text', engine: 'edge', voiceId: base.voiceId, content: base.content, renderFingerprint: a.renderFingerprint, contentFingerprintV2: a.contentFingerprintV2, renderDescriptor: a.descriptor },
  { segmentId: 'SEGMENT_B', channel: 'text', engine: 'edge', voiceId: base.voiceId, content: base.content, renderFingerprint: a.renderFingerprint, contentFingerprintV2: a.contentFingerprintV2, renderDescriptor: a.descriptor }
];
const fakeAudioFile = { name: filename, size: 1234, lastModified: 1, type: 'audio/mpeg' };
const folderScan = await scanTextStructuredAudioFolderFiles({ files: [fakeAudioFile], audioVariants: [], segments: [], requirements });
pass(() => assert.equal(folderScan.matches.length, 2));
pass(() => assert.deepEqual(new Set(folderScan.matches.map(m => m.requirement.segmentId)), new Set(['SEGMENT_A', 'SEGMENT_B'])));
pass(() => assert.equal(folderScan.orphans.length, 0));

const manifest = buildProLingoTextAudioManifest({ entries: [{ rf: a.renderFingerprint, filename, mimeType: 'audio/mpeg', size: 1234, render: a.descriptor }] });
const parsedManifest = parseProLingoTextAudioManifestJson(JSON.stringify(manifest));
pass(() => assert.equal(parsedManifest.entries[0].rf, a.renderFingerprint));

const audioBlob = new Blob([new Uint8Array([1,2,3,4])], { type: 'audio/mpeg' });
const manifestBlob = new Blob([JSON.stringify(buildProLingoTextAudioManifest({ entries: [{ rf: a.renderFingerprint, filename, mimeType: 'audio/mpeg', size: audioBlob.size, render: a.descriptor }] }))], { type: 'application/json' });
const zipBlob = await buildStoredZipBlob([{ filename, blob: audioBlob }, { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: manifestBlob }]);
Object.defineProperty(zipBlob, 'name', { value: 'rf-portability.zip' });
Object.defineProperty(zipBlob, 'lastModified', { value: 2 });
const zipScan = await scanTextStructuredAudioZipFiles({ files: [zipBlob], audioVariants: [], segments: [], requirements });
pass(() => assert.equal(zipScan.archiveCount, 1));
pass(() => assert.equal(zipScan.matches.length, 2));
pass(() => assert.equal(zipScan.orphanCount, 0));
pass(() => assert.equal(zipScan.archives[0].manifestPresent, true));

const unmatchedRf = buildTextStructuredAudioRenderFingerprint({ ...base, content: 'Different content.' });
const unmatchedFilename = buildCanonicalTextRenderAudioFilename({ renderFingerprint: unmatchedRf.renderFingerprint, engine: 'edge', voiceId: base.voiceId });
const orphanScan = await scanTextStructuredAudioFolderFiles({ files: [{ name: unmatchedFilename, size: 100, type: 'audio/mpeg' }], audioVariants: [], segments: [], requirements });
pass(() => assert.equal(orphanScan.orphans.length, 1));
pass(() => assert.equal(orphanScan.orphans[0].reason, 'unmatched-rf'));

console.log(`PASS A0-A3 RF portability audit: ${checks} checks`);
