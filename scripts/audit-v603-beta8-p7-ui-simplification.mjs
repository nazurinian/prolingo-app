import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('src/App.jsx');
const player = read('src/components/text/TextStructuredPlayer.jsx');
const controls = read('src/components/text/TextStructuredPlaybackControls.jsx');
const cardAudio = read('src/components/text/TextStructuredCardAudioPanel.jsx');
const batch = read('src/components/text/TextBatchPopup.jsx');
const audioData = read('src/components/text/TextAudioDataPanel.jsx');
const metadata = read('src/constants/appMetadata.js');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));

check('App wires global representation mode into Structured Text Player', () => {
  assert.match(app, /playbackRepresentationMode=\{textStructuredPreferences\.playbackRepresentationMode\}/);
  assert.match(app, /onPlaybackRepresentationModeChange=\{handleStructuredTextPlaybackRepresentationModeChange\}/);
});
check('App wires Workspace local playback order + TTS Only + local voice inventory', () => {
  assert.match(app, /playbackOrder=\{structuredTextAudioPlaybackOrder\}/);
  assert.match(app, /availableLocalVoices=\{structuredTextAvailableLocalVoices\}/);
  assert.match(app, /onDocumentPlaybackOrderChange=\{handleStructuredTextDocumentPlaybackOrderChange\}/);
  assert.match(app, /onDocumentTtsOnlyChange=\{handleStructuredTextDocumentTtsOnlyChange\}/);
});
check('TextStructuredPlayer accepts and forwards global playback controls', () => {
  assert.match(player, /playbackRepresentationMode,/);
  assert.match(player, /playbackOrder = null,/);
  assert.match(player, /availableLocalVoices = null,/);
  assert.match(player, /<TextStructuredPlaybackControls[\s\S]*playbackRepresentationMode=\{playbackRepresentationMode\}[\s\S]*onDocumentTtsOnlyChange=\{onDocumentTtsOnlyChange\}/);
});
check('Player Settings exposes Split / Full as one global representation control', () => {
  assert.match(controls, /data-text-global-playback-mode="true"/);
  assert.match(controls, /TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES\.SPLIT/);
  assert.match(controls, /TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES\.FULL/);
});
check('Player Settings exposes Workspace TTS Only bypass without deleting audio', () => {
  assert.match(controls, /data-text-global-tts-only="true"/);
  assert.match(controls, /local audio bypassed/);
  assert.match(controls, /onDocumentTtsOnlyChange/);
});
check('Workspace EN and ID local voice priority editors are explicit and ordered', () => {
  assert.match(controls, /data-text-global-playback-order-editor="true"/);
  assert.match(controls, /first Ready wins/);
  assert.match(controls, /channel="text"/);
  assert.match(controls, /channel="meaning"/);
  assert.match(controls, /Move up/);
  assert.match(controls, /Move down/);
});
check('Generation/export selection remains described as independent from playback priority', () => {
  assert.match(controls, /Generation\/export selections stay independent/);
  assert.match(batch, /Generation selection never changes playback priority/);
});
check('Advanced Card playback order override is wired without becoming a normal per-Card requirement', () => {
  assert.match(player, /onCardPlaybackOrderChange=\{onCardPlaybackOrderChange\}/);
  assert.match(cardAudio, /data-text-card-playback-advanced="true"/);
  assert.match(cardAudio, /INHERIT WORKSPACE/);
  assert.match(cardAudio, /onCardPlaybackOrderChange\?\.\(block\.id, profiles, channel\)/);
});
check('Card surface exposes compact Ready/Missing state', () => {
  assert.match(player, /data-text-card-compact-readiness="true"/);
  assert.match(player, />READY \{cardCoverage\.covered\}\/\{cardCoverage\.total\}</);
  assert.match(player, /MISSING \{cardCoverage\.needDownload\}/);
});
check('Workspace header exposes compact Ready/Missing state', () => {
  assert.match(player, /data-text-workspace-compact-readiness="true"/);
  assert.match(player, /READY \{documentCoverage\?\.covered \|\| 0\}/);
});
check('Normal Card Audio workflow is generation-first and sends scope exports to Bulk Audio', () => {
  assert.match(cardAudio, /Card Audio State/);
  assert.match(cardAudio, /GENERATE MISSING/);
  assert.match(cardAudio, /exports are centralized in Bulk Audio/);
  assert.doesNotMatch(cardAudio, />SPLIT ZIP</);
  assert.doesNotMatch(cardAudio, />FULL EN WAV</);
  assert.doesNotMatch(cardAudio, />FULL ID WAV</);
});
check('Granular Segment single-file tool remains available under Advanced Segment overrides', () => {
  assert.match(cardAudio, /Segment overrides/);
  assert.match(cardAudio, /onExportSegmentAudio/);
  assert.match(cardAudio, /single-file tools/);
});
check('Bulk Audio uses phase-neutral Generate and Export surfaces', () => {
  assert.match(batch, />Generate Plan</);
  assert.match(batch, />Generation Coverage</);
  assert.match(batch, />Export \/ Auto Export</);
  assert.doesNotMatch(batch, />P5 Multi-Voice Plan</);
  assert.doesNotMatch(batch, />P5 Generation Coverage</);
  assert.doesNotMatch(batch, />P6 Export \/ Auto Export</);
});
check('Duplicated legacy scope-export panel is removed from normal Bulk UI', () => {
  assert.doesNotMatch(batch, /Existing Split Export/);
  assert.doesNotMatch(batch, /EXPORT READY MP3/);
  assert.doesNotMatch(batch, /BUILD FULL CONSOLIDATED ZIP/);
  assert.doesNotMatch(batch, /EXPORT PARTIAL ZIP/);
});
check('P6 final export choices remain visible after UI simplification', () => {
  assert.match(batch, /Audio-Only • Direct files/);
  assert.match(batch, /Audio-Only • One ZIP/);
  assert.match(batch, /Portable ProLingo ZIP/);
  assert.match(batch, /Preferred playback voice/);
  assert.match(batch, /Split \+ Full/);
});
check('Folder stays visibly Deprecated / Locked', () => {
  assert.match(audioData, /Audio Folder • Deprecated/);
  assert.match(audioData, />LOCKED</);
});
check('P7 release metadata and package metadata are aligned', () => {
  assert.match(metadata, /APP_VERSION = '6\.0\.3-beta\.8-p7(?:-[^']+)?'/);
  assert.match(metadata, /v6\.0\.3-beta\.8-p7 completes beta\.8 Paragraph UI simplification/);
  assert.match(packageJson.version, /^6\.0\.3-beta\.8-p7(?:-.+)?$/);
  assert.match(packageLock.version, /^6\.0\.3-beta\.8-p7(?:-.+)?$/);
  assert.match(packageLock.packages?.['']?.version || '', /^6\.0\.3-beta\.8-p7(?:-.+)?$/);
});
check('Text DB remains v1 and Table tree remains frozen inside this checkpoint', () => {
  const dbSource = [read('src/constants/textDatabaseConstants.js'), read('src/services/persistence/textLibraryIndexedDbService.js')].join('\n');
  assert.match(dbSource, /(?:DB_VERSION|TEXT_DB_VERSION|version)\s*=\s*1|open\([^,]+,\s*1\)/i);
  const tableRoot = path.join(root, 'src/components/table');
  const hash = crypto.createHash('sha256');
  const files = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else files.push(full);
  });
  walk(tableRoot);
  files.sort().forEach(file => { hash.update(path.relative(tableRoot, file)); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); });
  assert.equal(hash.digest('hex'), '02b6c4a29647a161e483172ed6d9819985e63110cdfd55f29a282b1c28dda811');
});

console.log(`\nP7 targeted audit: ${pass} PASS`);
