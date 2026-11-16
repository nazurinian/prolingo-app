import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextConversationEditor from '../../../src/components/text/conversation/TextConversationEditor.jsx';
import TextConversationEditorQaPreview from '../../../src/components/text/conversation/TextConversationEditorQaPreview.jsx';
import { createD5AudioFixture } from './conversation-audio-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const query = (sel, scope = document) => {
  const el = scope.querySelector(sel);
  assert(el, `Missing ${sel}`);
  return el;
};
const button = (text, scope = document) => {
  const el = [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === text || item.textContent.includes(text));
  assert(el, `Missing button "${text}"`);
  return el;
};
const click = async (el, wait = 40) => {
  el.click();
  await tick(wait);
};
const input = async (el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(25);
};

export const runD5UiBrowserInteractions = async () => {
  const results = [];
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error?.stack || error?.message || String(error) });
    }
  };

  await test('QA Preview Ready WAVs composes real 48 kHz Full WAV and toggles Split vs Full cached playback', async () => {
    root.render(<React.StrictMode><TextConversationEditorQaPreview /></React.StrictMode>);
    await tick(60);

    await click(button('D5 Audio: Ready WAVs'), 60);
    const strip = query('[data-conversation-audio-readiness]');
    assert(strip.textContent.includes('Ready 6/6'), `Expected 6/6 Ready, got ${strip.textContent}`);

    const composeBtn = query('[aria-label="Compose Full WAV TEXT_000001 text"]');
    assert(!composeBtn.disabled, 'Compose Full WAV must be enabled on ready 1.0x inputs');
    await click(composeBtn, 250);

    const compCard = query('[data-conversation-full-composition="TEXT_000001:text"]');
    assert(compCard.textContent.includes('48000 Hz'), `Expected 48000 Hz assembled preview, got ${compCard.textContent}`);
    assert(compCard.textContent.includes('4 segments'), 'Expected 4 segments composed');

    await click(button('Full (Scene / Fallback)'), 60);
    assert(compCard.textContent.includes('full-local (Cached WAV)'), `Expected full-local route, got ${compCard.textContent}`);

    await click(button('Split (Sentence)'), 60);
    assert(compCard.textContent.includes('route: split'), 'Expected split route after toggle');
  });

  await test('Mixed Readiness, Non-Unit Rate (1.2x), and Unavailable Binary fallback render accurate states', async () => {
    root.render(<React.StrictMode><TextConversationEditorQaPreview /></React.StrictMode>);
    await tick(60);

    await click(button('D5 Audio: Mixed Readiness'), 60);
    const bodyText = document.body.textContent;
    for (const label of ['EN • READY', 'EN • META-ONLY', 'EN • STALE', 'EN • MISSING']) {
      assert(bodyText.includes(label), `Missing readiness label: ${label}`);
    }
    assert(query('[aria-label="Compose Full WAV TEXT_000001 text"]').disabled, 'Mixed Readiness must disable Full WAV composition');

    await click(button('D5 Audio: Non-Unit Rate (1.2x)'), 60);
    assert(query('[data-conversation-rate-readout]').textContent.includes('1.2x'), 'Expected 1.2x readout');
    const rateBtn = query('[aria-label="Compose Full WAV TEXT_000001 text"]');
    assert(rateBtn.disabled, 'Non-unit 1.2x rate must disable Full WAV composition');
    assert(query('[data-conversation-full-composition="TEXT_000001:text"]').textContent.includes('non-unit rate (1.2x)'), 'Missing non-unit rate explanation');

    await click(button('D5 Audio: Unavailable Binary'), 60);
    await click(query('[aria-label="Play sentence SEGMENT_000001"]'), 240);
    assert(
      query('[data-conversation-sentence-readiness="SEGMENT_000001"]').textContent.includes('UNAVAILABLE BINARY'),
      `Expected UNAVAILABLE BINARY badge after invalid URL failure, got: ${query('[data-conversation-sentence-readiness="SEGMENT_000001"]').textContent}`
    );
  });

  await test('Editing invalidates Sentence to STALE while Pause/Stop/Resume/Cancel work via session executor', async () => {
    const d5 = createD5AudioFixture();
    const played = [];
    const gates = [];
    function SessionHarness() {
      const [snapshot, setSnapshot] = useState(d5.snapshot);
      const hooks = React.useMemo(() => ({
        executeRuntimeAudio: ({ item }) => new Promise(resolve => {
          played.push(item.id);
          gates.push({ finish: () => resolve({ status: 'played' }), stop: () => resolve({ status: 'stopped' }) });
        })
      }), []);
      return (
        <TextConversationEditor
          snapshot={snapshot}
          documentId={d5.ids.documentId}
          runtimeAudioUrls={d5.runtimeAudioUrls}
          audioConfig={{ preferences: d5.preferences, playbackRepresentationMode: 'full' }}
          onStateChange={outcome => setSnapshot(outcome.snapshot)}
          audioRuntimeHooks={hooks}
        />
      );
    }

    root.render(<React.StrictMode><SessionHarness /></React.StrictMode>);
    await tick(60);

    await click(query(`[aria-label="Play Scene ${d5.ids.sceneId}"]`), 160);
    assert(played.length === 1 && played[0] === d5.ids.firstSentenceId, 'Step 1 started');

    await click(query('[aria-label="Pause playback"]'), 40);
    gates[0].finish();
    await tick(80);
    assert(played.length === 1, 'Pause gate prevented step 2');

    await click(query('[aria-label="Resume playback"]'), 60);
    assert(played.length === 2 && played[1] === d5.ids.secondSentenceId, 'Resume continued to step 2');

    await click(query(`[aria-label="Edit sentence ${d5.ids.firstSentenceId}"]`), 30);
    await input(query('[aria-label="Edit Sentence Text"]'), 'Browser edit stops playback.');
    await click(button('Save Sentence'), 60);
    gates[1].stop();
    await tick(40);

    assert(!document.querySelector('[aria-label="Stop playback"]'), 'Editor mutation must cancel active playback');
    assert(
      query(`[data-conversation-sentence-readiness="${d5.ids.firstSentenceId}"]`).textContent.includes('EN • STALE'),
      'Edited Sentence must show EN • STALE immediately'
    );
  });

  return {
    browser: navigator.userAgent,
    results,
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    indexedDbCalls: window.__d5UiDbCalls || 0
  };
};
