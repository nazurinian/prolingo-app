import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/App.jsx');
const cardPanel = read('src/components/text/TextStructuredCardAudioPanel.jsx');

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push([name, true]); }
  catch (error) { checks.push([name, false, error?.message || String(error)]); }
};

check('App MainApp has no hook dependency-array TDZ against later top-level const declarations', () => {
  const lines = app.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith('const MainApp'));
  const end = lines.findIndex((line, index) => index > start && line.startsWith('// --- APP WRAPPER'));
  assert.ok(start >= 0 && end > start, 'MainApp range not found');

  const decls = new Map();
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    let match = line.match(/^  const\s+([A-Za-z_$][\w$]*)\s*=/);
    if (match && !decls.has(match[1])) decls.set(match[1], index + 1);
    match = line.match(/^  const\s+\[\s*([A-Za-z_$][\w$]*)/);
    if (match && !decls.has(match[1])) decls.set(match[1], index + 1);
  }

  const violations = [];
  for (let index = start; index < end; index += 1) {
    if (!lines[index].includes('}, [')) continue;
    let span = lines[index];
    let cursor = index;
    while (!span.includes(']);') && cursor + 1 < end && cursor - index < 12) {
      cursor += 1;
      span += `\n${lines[cursor]}`;
    }
    const depText = span.split('}, [')[1]?.split(']);')[0] || '';
    const ids = new Set(depText.match(/\b[A-Za-z_$][\w$]*\b/g) || []);
    for (const id of ids) {
      const declaredAt = decls.get(id);
      if (declaredAt && declaredAt > index + 1) {
        violations.push(`${id}: dependency at L${index + 1}, declaration at L${declaredAt}`);
      }
    }
  }
  assert.deepEqual(violations, [], `TDZ-prone hook dependency(s): ${violations.join('; ')}`);
});

check('Playback representation handler does not read forceStopAll in a pre-declaration dependency array', () => {
  assert.doesNotMatch(app, /handleStructuredTextPlaybackRepresentationModeChange\s*=\s*useCallback[\s\S]{0,500}?\},\s*\[forceStopAll\]\)/);
  assert.match(app, /const handleStructuredTextPlaybackRepresentationModeChange = \(playbackRepresentationMode\) => \{/);
});

check('Card Audio compact manual coverage has a live cardChannelCoverage definition', () => {
  const declaration = cardPanel.indexOf('const cardChannelCoverage = useMemo(() =>');
  const use = cardPanel.indexOf('const info = cardChannelCoverage[channel]');
  assert.ok(declaration >= 0, 'cardChannelCoverage declaration missing');
  assert.ok(use > declaration, 'cardChannelCoverage is used before definition');
});

check('P7 Card Audio no longer references removed Selected Split export state', () => {
  assert.doesNotMatch(cardPanel, /selectedSegmentIds|setSelectedSegmentIds/);
});

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${detail ? ` :: ${detail}` : ''}`);
}
console.log(`\nRuntime boot guard: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
