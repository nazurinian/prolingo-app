import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const header = read('src/components/layout/Header.jsx');
const shell = read('src/components/layout/MainAppShellView.jsx');
const mobile = read('src/components/controls/MobileDataControls.jsx');
const desktop = read('src/components/controls/DesktopDataActions.jsx');
const sidebar = read('src/components/layout/SidebarShell.jsx');
const landing = read('src/components/landing/LandingPage.jsx');
const metadata = read('src/constants/appMetadata.js');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`PASS ${passed}: ${label}`); }

check('The only CSV input is mounted in Header (always present on mobile)', () => {
  assert.match(header, /data-csv-import-input="true"/);
  assert.match(header, /data-csv-import-input="true" className="sr-only" tabIndex=\{-1\}/);
  assert.match(header, /ref=\{csvInputRef\}[^>]+onChange=\{handleCSVUpload\}/);
  assert.equal((header.match(/ref=\{csvInputRef\}/g) || []).length, 1);
  assert.doesNotMatch(desktop, /ref=\{csvInputRef\}/);
  assert.match(sidebar, /if \(isMobile\) return null/);
});
check('The always-present Header receives CSV input ref and upload handler through MainAppShellView', () => {
  assert.match(shell, /<Header\b[\s\S]*?csvInputRef=\{csvInputRef\}[\s\S]*?handleCSVUpload=\{handleCSVUpload\}/);
  assert.match(header, /csvInputRef,\s+handleCSVUpload,/);
});
check('Both mobile and desktop CSV buttons target the same input ref', () => {
  assert.match(mobile, /onClick=\{\(\) => csvInputRef\.current\?\.click\(\)\}/);
  assert.match(desktop, /onClick=\{\(\) => csvInputRef\.current\?\.click\(\)\}/);
  assert.match(header, /accept="\.csv,\.tsv,\.txt"/);
});
check('Long technical version and checkpoint are hidden at mobile breakpoints', () => {
  assert.match(header, /hidden md:inline text-indigo-500/);
  assert.match(header, /hidden md:block text-\[8px\]/);
  assert.match(header, /gap-2 md:gap-3 min-w-0 flex-1 md:flex-none/);
  assert.match(header, /leading-tight truncate/);
  assert.match(landing, /hidden md:inline text-indigo-500/);
});
check('Checkpoint is HF3 and core identity stays unchanged', () => {
  assert.match(metadata, /6\.0\.3-beta\.8-p7-hf3/);
  assert.match(metadata, /V6\.0\.3-BETA8-P7-HF3-MOBILE-UI/);
  assert.equal(pkg.version, '6.0.3-beta.8-p7-hf3');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.doesNotMatch(header, /handleCSVUpload\?\./);
});
check('Edge TTS remains the existing installed lock version', () => {
  assert.equal(pkg.dependencies['msedge-tts'], '^2.1.1');
  assert.equal(lock.packages['node_modules/msedge-tts']?.version, '2.1.1');
});
console.log(`Mobile HF3 audit complete: ${passed}/${passed} passed`);
