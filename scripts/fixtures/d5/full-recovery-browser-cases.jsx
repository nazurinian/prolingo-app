import React, { useEffect, useState } from 'react';
import TextConversationEditor from '../../../src/components/text/conversation/TextConversationEditor.jsx';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../src/domain/text/textStructuredSplitFullDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata } from '../../../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from '../../../src/services/playback/textStructuredAudioRuntimeService.js';
import { createD5AudioFixture } from './conversation-audio-fixture.js';

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
const until = async (predicate, message) => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await tick(20);
  }
  throw new Error(message);
};
const click = label => {
  const element = document.querySelector(`[aria-label="${label}"]`);
  assert(element, `Missing ${label}`);
  element.click();
};
const wavBlob = () => {
  const buffer = new ArrayBuffer(44 + 960 * 2);
  const view = new DataView(buffer);
  const tag = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true);
  return new Blob([buffer], { type: 'audio/wav' });
};
const voices = [{ name: 'en-GB-RyanNeural', lang: 'en-GB' }, { name: 'en-GB-SoniaNeural', lang: 'en-GB' }];
let mountId = 0;

// All bytes, metadata and bindings here are disposable memory fixtures. No storage service is used.
const fixture = () => {
  const data = createD5AudioFixture();
  const document = data.snapshot.documents.find(doc => doc.id === data.ids.documentId);
  const bob = data.snapshot.contentUnits.find(unit => unit.id === data.ids.bobTurnId);
  const metadata = buildTextStructuredPlaybackRateProfileMetadata({ metadata: document.metadata, speakerId: bob.speakerId, channel: 'text', rate: 1.4 });
  let snapshot = applyTextLibraryCommand(data.snapshot, { type: 'document.update', payload: { id: document.id, metadata } }, 401).snapshot;
  const tree = resolveTextLibraryDocumentTree(snapshot, document.id);
  const block = tree.blocks.find(card => card.id === data.ids.sceneId);
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: tree, block, audioVariants: snapshot.audioVariants, preferences: data.preferences, representationMode: 'full' });
  // A pre-existing exact schedule, not a call to the rate-limited WAV composer.
  const artifact = buildTextStructuredFullArtifactRecord({ block, channel: 'text', composition: plan.composition, source: 'derived', mimeType: 'audio/wav' });
  snapshot = applyTextLibraryCommand(snapshot, { type: 'fullAudioArtifact.upsert', payload: { blockId: block.id, artifact } }, 402).snapshot;
  const fullBlob = new Blob(['deliberately corrupt disposable WAV'], { type: 'audio/wav' });
  const localBlob = wavBlob();
  const fullUrl = URL.createObjectURL(fullBlob);
  const localUrl = URL.createObjectURL(localBlob);
  const local = snapshot.audioVariants.find(variant => variant.segmentId === data.ids.secondSentenceId && variant.channel === 'text');
  return {
    ...data, snapshot, artifact, plan,
    runtimeFullAudio: { [artifact.fullArtifactFingerprint]: { blob: fullBlob, url: fullUrl, fullArtifactFingerprint: artifact.fullArtifactFingerprint } },
    runtimeAudioUrls: { [local.id]: { blob: localBlob, url: localUrl, renderFingerprint: local.metadata.audioRenderFingerprintV1 } },
    dispose: () => { URL.revokeObjectURL(fullUrl); URL.revokeObjectURL(localUrl); }
  };
};

export const runD5FullRecoveryBrowserCases = async ({ root, test }) => {
  const mount = async (data, hooks, config = {}, installedVoices = voices) => {
    let change;
    let state;
    const report = next => { state = next; };
    function Harness() {
      const [model, setModel] = useState({ snapshot: data.snapshot, documentId: data.ids.documentId,
        config: { preferences: data.preferences, playbackRepresentationMode: 'full', ...config } });
      useEffect(() => { change = setModel; }, []);
      return <TextConversationEditor snapshot={model.snapshot} documentId={model.documentId}
        runtimeAudioUrls={data.runtimeAudioUrls} runtimeFullAudio={data.runtimeFullAudio}
        audioConfig={model.config} availableBrowserVoices={installedVoices} audioRuntimeHooks={hooks}
        onAudioStateReport={report} />;
    }
    root.render(<React.StrictMode><Harness key={++mountId} /></React.StrictMode>);
    await tick(60);
    return { get state() { return state; }, change: update => change(update) };
  };
  const unmount = async data => { root.render(null); await tick(); data.dispose(); };

  await test('Corrupt Cached Full really fails HTMLAudio then recovers ordered local/TTS Sentences with two voices and rates', async () => {
    const data = fixture();
    const before = JSON.stringify(data.snapshot);
    const events = [];
    let fullResult;
    const hooks = {
      executeRuntimeAudio: async args => {
        events.push({ kind: 'local', segmentId: args.step.segmentId, rate: args.playbackRate });
        const result = await executeStructuredTextRuntimeAudioPlaybackService(args);
        if (args.step.type === 'full-local') fullResult = result.status;
        else assert(result.status === 'played', 'Valid Sentence WAV must play');
        return result;
      },
      executeBrowserTts: async args => events.push({ kind: 'tts', segmentId: args.step.segmentId, unitId: args.step.unitId,
        voice: args.targetVoiceName, rate: args.rate, channel: args.channel, text: args.textToRead })
    };
    try {
      const h = await mount(data, hooks);
      assert(h.state.audioPlans.bySceneId[data.ids.sceneId].text.route === 'full-local', 'Fixture must begin with exact ready Cached Full');
      click(`Play Scene ${data.ids.sceneId}`);
      await until(() => fullResult && !h.state.isPlaying, 'Recovery did not complete');
      assert(fullResult === 'error', 'Real corrupt HTMLAudio must fail');
      const third = data.snapshot.segments.find(segment => segment.unitId === data.ids.nextAliceTurnId).id;
      equal(events.map(event => [event.kind, event.segmentId, event.rate]), [
        ['local', null, 1], ['tts', data.ids.firstSentenceId, 1], ['local', data.ids.secondSentenceId, 1],
        ['tts', third, 1], ['tts', data.ids.bobSentenceId, 1.4]
      ], 'Exact recovery order with no collapsed utterance or duplicates');
      equal(events.filter(event => event.kind === 'tts').map(event => event.voice), ['en-GB-RyanNeural', 'en-GB-RyanNeural', 'en-GB-SoniaNeural'], 'Installed speaker voices');
      assert(events.filter(event => event.kind === 'tts').every(event => event.unitId && event.channel === 'text'), 'Persistent identity and channel required');
      assert(JSON.stringify(data.snapshot) === before, 'Failure must not mutate artifacts, RFs or snapshot metadata');
      const cacheStatus = document.querySelector(`[data-conversation-full-composition="${data.ids.sceneId}:text"]`).textContent;
      assert(cacheStatus.includes('Full Cache: unavailable-binary'), 'Known failed Full binding must not keep advertising Ready');
      assert(cacheStatus.includes('full fallback (Per-Sentence)'), 'Route indicator must reflect per-Sentence recovery');
    } finally { await unmount(data); }
  });

  await test('Successful Cached Full plays once at contracted rate 1 without Sentence replay', async () => {
    const data = fixture();
    const events = [];
    try {
      const h = await mount(data, {
        executeRuntimeAudio: async args => { events.push([args.step.type, args.playbackRate]); return { status: 'played' }; },
        executeBrowserTts: async () => { throw new Error('No TTS on successful Full'); }
      });
      click(`Play Scene ${data.ids.sceneId}`);
      await until(() => events.length && !h.state.isPlaying, 'Full did not finish');
      equal(events, [['full-local', 1]], 'Cached Full success path');
    } finally { await unmount(data); }
  });

  await test('Actual Browser TTS service receives native utterances through the safe synth wrapper', async () => {
    const data = fixture();
    const utterances = [];
    const speechSynth = { cancel() {}, pause() {}, resume() {}, getVoices: () => [], speak(utterance) {
      utterances.push({ text: utterance.text, rate: utterance.rate, native: utterance instanceof SpeechSynthesisUtterance });
      queueMicrotask(() => utterance.onend?.());
    } };
    try {
      const h = await mount(data, { speechSynth }, { audioSourceMode: 'tts-only' }, []);
      click(`Play Scene ${data.ids.sceneId}`);
      await tick(250);
      await until(() => !h.state.isPlaying, 'Native utterance service did not finish');
      equal(utterances.map(utterance => utterance.text), data.plan.entries.map(entry => entry.content), 'Native service Sentence traversal');
      assert(utterances.every(utterance => utterance.native), 'Use real browser SpeechSynthesisUtterance objects');
      assert(Math.abs(utterances.at(-1).rate - 1.4) < 0.001, 'Native service must preserve Bob rate');
    } finally { await unmount(data); }
  });

  await test('Cached Full error while paused waits, resumes once per Sentence, and Stop cancels pending recovery', async () => {
    const data = fixture();
    const events = [];
    const gates = [];
    try {
      const h = await mount(data, {
        executeRuntimeAudio: args => new Promise(resolve => { events.push(args.step.type); gates.push(resolve); }),
        executeBrowserTts: async args => events.push(args.step.segmentId)
      });
      click(`Play Scene ${data.ids.sceneId}`);
      await until(() => gates.length, 'Full did not start');
      click('Pause playback'); await tick(); gates[0]({ status: 'error' }); await tick(150);
      equal(events, ['full-local'], 'Paused failure must not start fallback');
      click('Resume playback');
      await until(() => gates.length === 2, 'Sentence local recovery did not start');
      equal(events, ['full-local', data.ids.firstSentenceId, 'split-local'], 'Resume plays first TTS then local Sentence');
      click('Pause playback'); await tick(); gates[1]({ status: 'error' }); await tick(150);
      assert(events.length === 3, 'Paused local error must not start Sentence TTS');
      click('Stop playback'); await tick(130);
      assert(!h.state.isPlaying && events.length === 3, 'Stop must cancel waiting recovery');
    } finally { await unmount(data); }
  });

  await test('Repeated passes do not retry failed Full or failed Sentence binaries captured by the active session', async () => {
    const data = fixture();
    const local = [];
    const spoken = [];
    try {
      const h = await mount(data, {
        executeRuntimeAudio: async args => { local.push(args.step.type); return { status: 'error' }; },
        executeBrowserTts: async args => spoken.push(args.step.segmentId)
      }, { repeatMode: 'twice' });
      click(`Play Scene ${data.ids.sceneId}`);
      await until(() => spoken.length && !h.state.isPlaying, 'Repeated recovery did not finish');
      equal(local, ['full-local', 'split-local'], 'Each unusable binding attempted only once');
      equal(spoken, [...data.plan.entries, ...data.plan.entries].map(entry => entry.segmentId), 'Two explicit passes, each Sentence exactly once');
    } finally { await unmount(data); }
  });

  await test('Stop during recovery retains the current Sentence cursor; Resume does not replay completed Sentences', async () => {
    const data = fixture();
    const spoken = [];
    let finishLocal;
    try {
      const h = await mount(data, {
        executeRuntimeAudio: args => args.step.type === 'full-local' ? Promise.resolve({ status: 'error' })
          : new Promise(resolve => { finishLocal = resolve; }),
        executeBrowserTts: async args => spoken.push(args.step.segmentId)
      });
      click(`Play Scene ${data.ids.sceneId}`);
      await until(() => finishLocal, 'Local Sentence recovery did not start');
      equal(spoken, [data.ids.firstSentenceId], 'First Sentence already completed');
      assert(h.state.resumeCursorSegmentId === data.ids.secondSentenceId, 'Recovery cursor must track the active Sentence');
      click('Stop playback'); await tick(); finishLocal({ status: 'stopped' }); await tick();
      click('Resume from cursor');
      await tick(180); finishLocal({ status: 'played' });
      await until(() => !h.state.isPlaying, 'Resume did not finish');
      equal(spoken, [data.ids.firstSentenceId, ...data.plan.entries.slice(2).map(entry => entry.segmentId)], 'Completed first Sentence never replayed');
    } finally { await unmount(data); }
  });

  for (const changeKind of ['snapshot', 'configuration', 'Workspace', 'reset']) {
    await test(`${changeKind} change cancels deferred Full failure before stale recovery`, async () => {
      const data = fixture();
      const spoken = [];
      let fail;
      try {
        const h = await mount(data, {
          executeRuntimeAudio: () => new Promise(resolve => { fail = resolve; }),
          executeBrowserTts: async args => spoken.push(args.step.segmentId)
        });
        click(`Play Scene ${data.ids.sceneId}`);
        await until(() => fail, 'Full did not start');
        h.change(model => changeKind === 'configuration' ? { ...model, config: { ...model.config, globalPlaybackRate: 1.2 } }
          : changeKind === 'Workspace' ? { ...model, documentId: data.ids.mixedDocumentId }
            : { ...model, snapshot: changeKind === 'reset' ? createD5AudioFixture().snapshot : structuredClone(model.snapshot) });
        await tick(50); fail({ status: 'error' }); await tick(160);
        assert(!h.state.isPlaying && spoken.length === 0, 'Stale completion must not recover or restart');
      } finally { await unmount(data); }
    });
  }

  for (const changeKind of ['snapshot', 'configuration']) {
    await test(`${changeKind} change cancels Play during the 120 ms pending transition`, async () => {
      const data = fixture();
      const events = [];
      try {
        await mount(data, {
          executeRuntimeAudio: async args => { events.push(args.step.type); return { status: 'played' }; },
          executeBrowserTts: async () => events.push('tts')
        }).then(h => {
          click(`Play Scene ${data.ids.sceneId}`);
          h.change(model => changeKind === 'configuration' ? { ...model, config: { ...model.config, globalPlaybackRate: 1.2 } }
            : { ...model, snapshot: structuredClone(model.snapshot) });
        });
        await tick(300);
        equal(events, [], 'Captured pre-change plan must never start');
      } finally { await unmount(data); }
    });
  }
};
