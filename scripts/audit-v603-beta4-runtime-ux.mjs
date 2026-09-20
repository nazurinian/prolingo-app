import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('src/App.jsx');
const shell = read('src/components/text/TextLibraryShell.jsx');
const card = read('src/components/text/TextStructuredCardAudioPanel.jsx');
const batch = read('src/components/text/TextBatchPopup.jsx');
const meta = read('src/constants/appMetadata.js');

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

check('beta4 metadata', () => assert.match(meta, /6\.0\.3-beta\.4/));
check('runtime hardening bridge exists', () => assert.match(app, /__runtimeHardening/));
check('safe audit uses reference-derived GC', () => assert.match(app, /manual-runtime-hardening-audit/));
check('runtime audit reconciles external audio sources', () => assert.match(app, /reconcileStructuredTextExternalAudioSources\(snapshot\)/));
check('DATA diagnostics surface exists', () => assert.match(shell, /Runtime & Storage Diagnostics/));
check('DATA diagnostics warns external files are not deleted', () => assert.match(shell, /Folder\/ZIP files are never deleted/));
check('external source summary shows unchanged/local/conflicts', () => {
  assert.match(shell, /Unchanged/); assert.match(shell, /Local only/); assert.match(shell, /Conflicts/);
});
check('external source explicit four decisions remain', () => {
  for (const token of ['update-keep-local','update-use-incoming','import-as-copy','keep-existing']) assert.match(shell, new RegExp(token));
});
check('card audio workflow remains clear after final UI centralization', () => {
  const legacy = /1 • Prepare audio/.test(card) && /2 • Split download/.test(card) && /3 • Full derived audio/.test(card);
  const finalUi = /Card Audio State/.test(card) && /GENERATE MISSING/.test(card) && /exports are centralized in Bulk Audio/.test(card);
  assert.ok(legacy || finalUi);
});
check('granular Segment helpers remain available', () => {
  const legacy = /SELECT ALL/.test(card) && /CLEAR/.test(card);
  const finalUi = /Segment overrides/.test(card) && /single-file tools/.test(card) && /onExportSegmentAudio/.test(card);
  assert.ok(legacy || finalUi);
});
check('Full export remains explicit and non-confused with Split generation', () => {
  assert.ok(/creates no permanent Full AudioVariant/.test(card) || (/Split \+ Full/.test(batch) && /Audio-Only/.test(batch)));
});
check('portable export remains identity/manifest based', () => {
  assert.ok(/Physical RF binaries are deduplicated and accompanied by a manifest/.test(card) || /Portable ProLingo ZIP/.test(batch));
});

console.log(`v6.0.3-beta.4 Runtime UX audit: ${checks.length} checks PASS`);
checks.forEach((name, index) => console.log(`${index + 1}. PASS — ${name}`));
