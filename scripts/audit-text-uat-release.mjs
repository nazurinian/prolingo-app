import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { assertTextUatBuild } from './text-uat-config.mjs';
const good = { mode: 'text-uat', env: { VITE_ENABLE_TEXT_UAT: 'true' }, branch: 'test/text-v2-uat' };
const preview = { ...good.env, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: good.branch, TEXT_UAT_PROJECT: 'prolingo-app' };
assert.equal(assertTextUatBuild(good), true);
for (const mode of ['production', 'stable-test', 'beta']) {
  for (const branch of ['main', 'v6-beta', good.branch]) {
    assert.equal(assertTextUatBuild({ mode, branch, env: { ...preview, VERCEL_GIT_COMMIT_REF: branch } }), false);
  }
}
for (const branch of ['main', 'v6-beta', '', undefined]) {
  assert.throws(() => assertTextUatBuild({ ...good, branch }));
  assert.throws(() => assertTextUatBuild({ ...good, env: { ...preview, VERCEL_GIT_COMMIT_REF: branch } }));
}
for (const flag of [undefined, '', 'false', 'TRUE']) {
  assert.throws(() => assertTextUatBuild({ ...good, env: { VITE_ENABLE_TEXT_UAT: flag } }));
  assert.throws(() => assertTextUatBuild({ ...good, env: { ...preview, VITE_ENABLE_TEXT_UAT: flag } }));
}
for (const project of [undefined, '', 'other', 'prolingo-text-uat']) {
  assert.throws(() => assertTextUatBuild({ ...good, env: { ...preview, TEXT_UAT_PROJECT: project } }));
}
for (const target of [undefined, 'production', 'development']) {
  assert.throws(() => assertTextUatBuild({ ...good, env: { ...preview, VERCEL_ENV: target } }));
}
assert.equal(assertTextUatBuild({ ...good, env: preview }), true);
const vercel = JSON.parse(await fs.readFile('vercel.json', 'utf8'));
assert.equal(vercel.buildCommand, 'npm run build:uat');
assert.equal(vercel.outputDirectory, 'dist-uat');
assert.deepEqual(vercel.rewrites, [{ source: '/api/(.*)', destination: '/api/$1' }]);
assert.equal(vercel.env, undefined);
assert.equal(vercel.build?.env, undefined);
const normal = await fs.readFile('dist/index.html', 'utf8'), uat = await fs.readFile('dist-uat/index.html', 'utf8');
assert.ok(normal.includes('/manifest.json') && !normal.includes('/manifest-text-uat.json'));
assert.ok(uat.includes('<title>ProLingo Text v2 UAT</title>') && uat.includes('/manifest-text-uat.json'));
const manifest = JSON.parse(await fs.readFile('dist-uat/manifest-text-uat.json'));
assert.equal(manifest.start_url, '/?qa=text-beta'); assert.equal(manifest.id, '/text-v2-uat');
assert.deepEqual(JSON.parse(await fs.readFile('dist/manifest.json')), JSON.parse(await fs.readFile('public/manifest.json')));
const files = await fs.readdir('dist/assets'), normalJs = (await Promise.all(files.filter(f => f.endsWith('.js')).map(f => fs.readFile('dist/assets/' + f, 'utf8')))).join('');
assert.ok(!normalJs.includes('data-structured-text-beta'));
assert.ok(!normalJs.includes('UAT_SECRET_CANARY'));
const uatFiles = await fs.readdir('dist-uat/assets'), uatJs = (await Promise.all(uatFiles.filter(f => f.endsWith('.js')).map(f => fs.readFile('dist-uat/assets/' + f, 'utf8')))).join('');
for (const forbidden of ['data-dm-qa-storage-mode', 'data-mixed-workspace-qa-preview', 'data-conversation-qa-preview', 'UAT_SECRET_CANARY']) assert.ok(!uatJs.includes(forbidden), forbidden);
assert.ok(uatJs.includes('data-text-uat-info') && uatJs.includes('6.0.3-beta.9-uat.1'));
console.log('PASS UAT flags/branch/project guards, artifact isolation, public metadata, secret canary exclusion and PWA identity');
const health = (await import('../api/health.js')).default, tts = (await import('../api/tts.js')).default;
const response = { status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, setHeader() {} };
health({}, response); assert.equal(response.code, 200);
await tts({ method: 'GET' }, response); assert.equal(response.code, 405);
console.log('PASS existing Node API modules load; health and TTS method guard execute without upstream synthesis');
