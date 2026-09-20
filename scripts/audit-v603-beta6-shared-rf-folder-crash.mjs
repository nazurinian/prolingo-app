import fs from 'node:fs';
import path from 'node:path';
import { buildTextStructuredAudioRenderFingerprint } from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildCanonicalTextRenderAudioFilename } from '../src/domain/text/textFilenameDomain.js';
import { scanTextStructuredAudioFolderFiles } from '../src/services/audio/textStructuredAudioFolderService.js';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
const check = (condition, label) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2,'0')} • ${label}`);
};

const app = read('src/App.jsx');
const commandService = read('src/services/persistence/textLibraryCommandService.js');
const dataPanel = read('src/components/text/TextAudioDataPanel.jsx');
const filenameDomain = read('src/domain/text/textFilenameDomain.js');

check(commandService.includes('executeTextAudioVariantBulkUpsert'), 'Folder/ZIP RF fan-out has one-transaction bulk AudioVariant upsert');
check(app.includes('materializeStructuredTextExternalRfRequirementsBulk'), 'App uses bulk RF logical-slot materialization');
check(app.includes('fanOutStructuredTextSharedRfLogicalSlots'), 'one generated physical RF auto-links other identical logical slots');
check(app.includes('Shared RF auto-linked'), 'shared-RF fan-out is observable in runtime log');
check(app.includes('Remembered Audio Folder detected') && app.includes('Reconnect explicitly'), 'startup remembers Folder but does not auto-scan it');
check(!app.includes('if (!cancelled) await applyStructuredTextAudioFolderFiles(files, result.name);'), 'startup restore path no longer recursively scans/materializes Folder files');
check(dataPanel.includes('RF file') && dataPanel.includes('logical slot'), 'Folder UI separates physical RF count from logical coverage count');
check(dataPanel.includes('explicit Reconnect'), 'Folder UI documents post-refresh reconnect requirement');
check(filenameDomain.includes('[0-9A-F]{64}') && filenameDomain.includes('rf-sha256-'), 'full SHA-256 RF remains canonical identity; no unsafe 10-char truncation');

const makeRequirement = ({ segmentId, channel, content, voiceId, language }) => {
  const render = buildTextStructuredAudioRenderFingerprint({ channel, content, language, engine: 'edge', voiceId, rate: 0, pitch: 0 });
  return { segmentId, channel, content, voiceId, language, engine: 'edge', renderFingerprint: render.renderFingerprint, contentFingerprintV2: render.contentFingerprintV2, renderDescriptor: render.descriptor };
};
const requirements = [
  makeRequirement({ segmentId:'SEG_A', channel:'text', content:'This sentence should reuse exactly the same audio.', voiceId:'en-GB-LibbyNeural', language:'en-GB' }),
  makeRequirement({ segmentId:'SEG_B', channel:'text', content:'This sentence should reuse exactly the same audio.', voiceId:'en-GB-LibbyNeural', language:'en-GB' }),
  makeRequirement({ segmentId:'SEG_A', channel:'meaning', content:'Kalimat ini seharusnya menggunakan ulang audio yang sama persis.', voiceId:'su-ID-TutiNeural', language:'id' }),
  makeRequirement({ segmentId:'SEG_B', channel:'meaning', content:'Kalimat ini seharusnya menggunakan ulang audio yang sama persis.', voiceId:'su-ID-TutiNeural', language:'id' })
];
const uniqueByRf = [...new Map(requirements.map(req => [req.renderFingerprint, req])).values()];
const files = uniqueByRf.map(req => ({
  name: buildCanonicalTextRenderAudioFilename({ renderFingerprint:req.renderFingerprint, engine:'edge', voiceId:req.voiceId }),
  size: 1234,
  lastModified: 1,
  type: 'audio/mpeg'
}));
const scan = await scanTextStructuredAudioFolderFiles({ files, audioVariants:[], segments:[], requirements });
check(files.length === 2, 'fixture has two physical files (EN + ID)');
check(scan.physicalRfCount === 2 && scan.physicalAudioCount === 2, 'Folder scanner reports two physical RF/audio files');
check(scan.matches.length === 4, 'two physical RF files fan out to four logical Segment/channel matches');
check(scan.orphans.length === 0, 'shared-RF fixture produces no orphan');
check(Math.max(...files.map(file => file.name.length)) < 128, 'canonical full-RF filenames remain well below common 255-char filename limit in representative case');

console.log(`\nBeta.6 shared-RF/folder-crash audit PASS • ${pass} checks`);
