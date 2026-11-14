import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isTextGlobalBrowserTtsDirty,
  isTextGlobalEdgeDirty,
  isTextWorkspaceAudioDirty,
  isTextSpeakerAudioDirty
} from '../src/domain/text/textStructuredResetPresentationDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata } from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';

const checks = [];
const check = (name, work) => {
  work();
  checks.push(name);
  console.log(`PASS ${name}`);
};

check('Browser TTS Reset is disabled at canonical default, enabled when dirty, disabled again at default', () => {
  assert.equal(isTextGlobalBrowserTtsDirty({}), false);
  assert.equal(isTextGlobalBrowserTtsDirty({ browserTextRate: 1.4 }), true);
  assert.equal(isTextGlobalBrowserTtsDirty({ browserTextRate: 1, browserMeaningRate: 1 }), false);
  assert.equal(isTextGlobalBrowserTtsDirty({ browserTextVoiceName: 'An installed custom voice' }), true);
  assert.equal(isTextGlobalBrowserTtsDirty({ browserTextVoiceName: null }), false);
  assert.equal(isTextGlobalBrowserTtsDirty({ browserRatesLinked: false }), true);
});

check('Edge Reset follows canonical Sonia/Gadis + 0%/0Hz, independent of Stale coverage', () => {
  assert.equal(isTextGlobalEdgeDirty({}), false);
  assert.equal(isTextGlobalEdgeDirty({ edgeRate: 10 }), true);
  assert.equal(isTextGlobalEdgeDirty({ edgePitch: -5 }), true);
  assert.equal(isTextGlobalEdgeDirty({ edgeRate: 0, edgePitch: 0 }), false);
  assert.equal(isTextGlobalEdgeDirty({ edgeTextVoiceId: 'en-GB-LibbyNeural' }), true);
});

check('Workspace Reset is driven by saved overrides, not transient busy state', () => {
  assert.equal(isTextWorkspaceAudioDirty({ metadata: {} }), false);
  const overridden = buildTextStructuredPlaybackRateProfileMetadata({ metadata: {}, channel: 'text', rate: 1.4 });
  assert.equal(isTextWorkspaceAudioDirty({ metadata: overridden }), true);
  const restored = buildTextStructuredPlaybackRateProfileMetadata({ metadata: overridden, channel: 'text', rate: null });
  assert.equal(isTextWorkspaceAudioDirty({ metadata: restored }), false);
});

check('Speaker reset is scoped separately from Workspace and can return to inherited default', () => {
  const speakerId = 'speaker-1';
  const saved = buildTextStructuredPlaybackRateProfileMetadata({ metadata: {}, speakerId, channel: 'meaning', rate: 1.5 });
  assert.equal(isTextSpeakerAudioDirty({ metadata: {} }, { speakerId }), false);
  assert.equal(isTextSpeakerAudioDirty({ metadata: saved }, { speakerId }), true);
  assert.equal(isTextWorkspaceAudioDirty({ metadata: saved }), false);
});

check('Range component has pointer, keyboard, blur final-commit; slider input never directly persists', () => {
  const code = readFileSync(new URL('../src/components/common/CommitOnReleaseRange.jsx', import.meta.url), 'utf8');
  assert.match(code, /onChange=\{preview\}/);
  assert.match(code, /onPointerUp=\{commit\}/);
  assert.match(code, /onKeyUp=\{commit\}/);
  assert.match(code, /onBlur=\{commit\}/);
  assert.match(code, /if \(next === savedValue\)/);
});

check('Workspace Reset only dims when clean; Edge rate/pitch route through final commit', () => {
  const code = readFileSync(new URL('../src/components/text/TextStructuredAudioControls.jsx', import.meta.url), 'utf8');
  assert.match(code, /disabled=\{disabled \|\| resetDisabled \|\| !workspaceAudioDirty\}/);
  assert.match(code, /workspaceAudioDirty \? 'opacity-100' : 'opacity-40'/);
  assert.match(code, /onCommit=\{value => onGenerationPreferencesChange\?\.\(\{ edgeRate: value \}\)\}/);
  assert.match(code, /onCommit=\{value => onGenerationPreferencesChange\?\.\(\{ edgePitch: value \}\)\}/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /const rateOverride = rateValue === null \|\|/);
});

console.log(`RESET DIRTY + RELEASE REGRESSION: ${checks.length} PASS, 0 FAIL`);
