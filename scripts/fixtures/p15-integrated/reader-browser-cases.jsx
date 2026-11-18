import React from 'react';
import { createRoot } from 'react-dom/client';
import StructuredWorkspacePlayer from '../../../src/components/text/presentation/StructuredWorkspacePlayer.jsx';
import { createStructuredTestingFixture } from './structured-fixture.js';
const frame = () => new Promise(r => requestAnimationFrame(r));
const until = async test => { const end = performance.now() + 6000; while (performance.now() < end) { if (test()) return; await frame(); } throw Error('Reader condition timed out'); };
const assert = (ok, message) => { if (!ok) throw Error(message); };
const click = label => { const el = [...document.querySelectorAll('button')].find(e => e.textContent === label); assert(el, label); el.click(); };
export async function runP15A2BrowserCases() {
  const f = createStructuredTestingFixture(), root = createRoot(document.getElementById('root')), results = [];
  const original = JSON.stringify(f.snapshot), events = []; let cancellations = 0;
  const hooks = { speechSynth: { getVoices: () => [], speak() {}, pause() {}, resume() {}, cancel() { cancellations++; } },
    executeBrowserTts: args => new Promise(resolve => events.push({ args, resolve })), executeRuntimeAudio: args => new Promise(resolve => events.push({ args, resolve })) };
  const test = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, error: e.message }); } };
  for (const id of [f.ids.paragraphId, f.ids.conversationId, f.ids.documentId]) {
    root.render(<StructuredWorkspacePlayer snapshot={f.snapshot} documentId={id} preferences={f.preferences} audioRuntimeHooks={hooks} />);
    await until(() => document.querySelector('[data-structured-workspace-player]')?.dataset.structuredWorkspacePlayer === id);
    await test('Both reader modes preserve ' + id + ' without replacing the player', async () => {
      click('Tampilan Lama'); await until(() => document.querySelector('[data-unified-reader=classic]'));
      const player = document.querySelector('[data-structured-workspace-player]');
      const cards = f.snapshot.blocks.filter(c => c.documentId === id).sort((a, b) => a.order - b.order);
      assert([...document.querySelectorAll('[data-classic-card]')].map(e => e.dataset.classicCard).join() === cards.map(c => c.id).join(), 'Classic Card order');
      for (const unit of f.snapshot.contentUnits.filter(u => u.documentId === id)) assert(document.querySelector('[data-classic-unit="' + unit.id + '"]'), 'Lost Unit ' + unit.id);
      click('Shared UI (Beta)'); await until(() => document.querySelector('[data-unified-reader=shared]'));
      assert(document.querySelector('[data-structured-workspace-player]') === player, 'Playback host replaced');
      assert(document.querySelector('[data-shared-card-level]'), 'Shared Cards absent');
    });
    await test('Switching modes/levels during audio retains current session for ' + id, async () => {
      const initial = events.length; click('Play Workspace'); await until(() => events.length > initial);
      // The injected callback can run before React commits source telemetry.
      // Capture the session only after the active step is actually published.
      await until(() => {
        const status = JSON.parse(document.querySelector('[data-unified-source-status]').textContent);
        return status?.documentId === id && status.mode === 'tts' && status.sessionId && status.segmentId;
      });
      const count = events.length, stopped = cancellations, source = document.querySelector('[data-unified-source-status]').textContent;
      click('Tampilan Lama'); await frame(); click('Shared UI (Beta)'); await frame();
      document.querySelector('[data-shared-card-level-option=part]').click(); await frame();
      document.querySelector('[data-shared-card-level-option=segment]').click(); await frame();
      assert(events.length === count && cancellations === stopped, 'View change restarted/stopped playback');
      assert(document.querySelector('[data-unified-source-status]').textContent === source, 'Source/session status changed: before=' + source + '; after=' + document.querySelector('[data-unified-source-status]').textContent);
      click('Pause'); await frame(); click('Tampilan Lama'); await frame(); click('Resume'); await frame();
      assert(events.length === count, 'Resume duplicated pending audio');
      click('Stop'); events.slice(initial).forEach(e => e.resolve({ status: 'stopped' })); await frame();
    });
  }
  await test('Source snapshot and canonical persistence remain untouched', async () => assert(JSON.stringify(f.snapshot) === original, 'Mutated fixture'));
  root.unmount();
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, canonicalDbTouches: window.__p15A2CanonicalDbTouches, hasCanonicalDb: false, remainingDisposableDbs: 0 };
}
