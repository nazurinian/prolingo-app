/* eslint-disable react-refresh/only-export-components -- Standalone browser audit entry, never a production/HMR module. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextConversationEditor from '../../../src/components/text/conversation/TextConversationEditor.jsx';
import TextConversationEditorQaPreview from '../../../src/components/text/conversation/TextConversationEditorQaPreview.jsx';
import { createD4aConversationFixture } from '../d4a/conversation-editor-fixture.js';
import { applyTextConversationEditorCommand, TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS } from '../../../src/domain/text/textConversationEditorDomain.js';

const root = createRoot(document.getElementById('root'));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
let control;
const createBrowserFixture = () => {
  const fixture = createD4aConversationFixture();
  const first = fixture.snapshot.segments.find(s => s.id === fixture.ids.firstSentenceId);
  first.metadata = { ...first.metadata, externalEntityV1: { segmentKey: 'd4c-original' },
    prolingoTextPackSource: { sourceId: first.id, attachmentId: 'd4c-source', ownership: 'attached' } };
  return fixture;
};
function Harness() {
  const [fixture, setFixture] = useState(createBrowserFixture);
  const [snapshot, setSnapshot] = useState(fixture.snapshot);
  const [documentId, setDocumentId] = useState(fixture.ids.documentId);
  const [mode, setMode] = useState('normal');
  const [revision, setRevision] = useState(0);
  useEffect(() => { control = { ...control, snapshot, ids: fixture.ids, documentId, setDocumentId,
    setMode: value => { setMode(value); setRevision(n => n + 1); },
    reset: () => { const fresh = createBrowserFixture(); setFixture(fresh); setSnapshot(fresh.snapshot); setDocumentId(fresh.ids.documentId); },
    commits: control?.commits || [], commands: control?.commands || [] }; }, [snapshot, fixture.ids, documentId]);
  const onCommand = async command => {
    control.commands.push(command);
    const outcome = applyTextConversationEditorCommand(snapshot, { type: command.type, payload: command.payload }, { documentId });
    if (mode === 'defer') return new Promise(resolve => { control.resolve = () => resolve({ ok: true, ...outcome, qaCommandType: command.type }); });
    if (mode === 'throw') throw new Error('D4C async rejection');
    if (mode === 'reject') return { ok: false, error: { code: 'COMMAND_REJECTED', message: 'D4C rejected' } };
    if (mode === 'undefined') return undefined;
    if (mode === 'false') return false;
    if (mode === 'error-only') return { error: { code: 'COMMAND_REJECTED', message: 'D4C error without success' } };
    if (mode === 'ack-only') return { ok: true };
    if (mode === 'invalid-snapshot') return { ok: true, ...outcome, snapshot: { schemaVersion: 1 } };
    if (mode === 'invalid-receipt') return { ok: true, ...outcome, result: { documentId } };
    if (mode === 'wrong-identity') return { ok: true, ...outcome, snapshot: { ...outcome.snapshot,
      documents: outcome.snapshot.documents.map(d => d.id === documentId ? { ...d, uid: d.uid.replace(/.$/, c => c === 'a' ? 'b' : 'a') } : d) } };
    if (mode === 'merge-reject' && command.type === 'conversationSegments.merge') return { ok: false, error: { code: 'COMMAND_REJECTED', message: 'D4C merge rejected' } };
    return { ok: true, ...outcome, qaCommandType: command.type };
  };
  return <div data-revision={revision}><TextConversationEditor snapshot={snapshot} documentId={documentId}
    onCommand={onCommand} onSelectWorkspace={setDocumentId} onStateChange={outcome => {
      if (mode === 'receiver-reject') return Promise.reject(new Error('D4C receiver rejection'));
      control.commits.push(outcome); setSnapshot(outcome.snapshot);
    }} /></div>;
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const query = (selector, scope = document) => { const el = scope.querySelector(selector); assert(el, `Missing ${selector}`); return el; };
const button = (text, scope = document) => {
  const el = [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  assert(el, `Missing button "${text}"`); return el;
};
const starts = (text, scope = document) => {
  const found = [...scope.querySelectorAll('button')].find(el => el.textContent.trim().startsWith(text));
  assert(found, `Missing button starting ${text}`); return found;
};
const click = async el => {
  const before = control?.commits.length || 0;
  el.click(); await tick();
  const committed = control?.commits.length > before ? control.commits.at(-1).snapshot : null;
  if (committed) await waitForCommittedState(() => control.snapshot === committed);
};
const waitForCommittedState = async predicate => {
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  throw new Error('D4 committed state did not settle within 3 seconds');
};
const input = async (el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  await tick();
};
const label = (text, scope = document) => query(`[aria-label="${text}"]`, scope);
const scene = id => query(`[data-conversation-scene-id="${id}"]`);
const turn = id => query(`[data-conversation-turn-id="${id}"]`);
const sentence = id => query(`[data-conversation-sentence-id="${id}"]`);
let generation = 0;
const mount = async () => { control = null; root.render(<React.StrictMode><Harness key={++generation} /></React.StrictMode>); await tick(); };
const addSceneDraft = async title => {
  await click(button('Scene Card')); await input(label('New Scene Card Title'), title);
};

export const runD4cBrowserInteractions = async () => {
  const results = [];
  const commandsCovered = new Set();
  const successfulCommands = new Set();
  const test = async (name, fn) => {
    try { await mount(); await fn(); control?.commands.forEach(c => commandsCovered.add(c.type)); control?.commits.forEach(c => { if (c.qaCommandType) successfulCommands.add(c.qaCommandType); }); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack }); }
  };
  await test('malformed async responses preserve drafts and do not publish state', async () => {
    for (const mode of ['undefined', 'false', 'error-only', 'ack-only', 'invalid-snapshot', 'invalid-receipt', 'wrong-identity', 'reject', 'throw', 'receiver-reject']) {
      await mount(); control.setMode(mode); await tick(); await addSceneDraft(`Keep ${mode}`);
      await click(button('Create Scene Card'));
      assert(document.querySelector('[data-conversation-add-scene]'), `${mode} closed the draft`);
      assert(label('New Scene Card Title').value === `Keep ${mode}`, `${mode} lost draft text`);
      assert(control.commits.length === 0, `${mode} published invalid response`);
      assert(document.querySelector('[role="alert"]'), `${mode} lacks visible failure`);
    }
  });
  await test('pending lock rejects repeated same-tick clicks and disables controls', async () => {
    control.setMode('defer'); await tick(); await addSceneDraft('Only once');
    const submit = button('Create Scene Card'); submit.click(); submit.click(); await tick();
    assert(control.commands.length === 1, 'Repeated click invoked two commands');
    assert(submit.disabled && label('New Scene Card Title').disabled, 'Pending controls remain active');
    control.resolve(); await tick();
    assert(control.snapshot.blocks.filter(b => b.title === 'Only once').length === 1, 'Creation was lost/duplicated');
    assert(!document.querySelector('[data-conversation-add-scene]'), 'Successful deferred command did not close');
  });
  await test('Workspace switching resets drafts and ignores stale completions', async () => {
    const ids = control.ids; control.setMode('defer'); await tick(); await addSceneDraft('Old Workspace');
    await click(button('Create Scene Card')); const resolve = control.resolve;
    control.setDocumentId(ids.mixedDocumentId); await tick(); resolve(); await tick();
    assert(control.commits.length === 0, 'Old Workspace response was published');
    control.setDocumentId(ids.documentId); await tick();
    assert(!document.querySelector('[data-conversation-add-scene]'), 'Old draft resurfaced after Workspace switch');
  });
  await test('fixture identity reset ignores stale responses and resets local forms', async () => {
    control.setMode('defer'); await tick(); await addSceneDraft('Old fixture');
    await click(button('Create Scene Card')); const resolve = control.resolve;
    control.reset(); await tick(); resolve(); await tick();
    assert(control.commits.length === 0, 'Old fixture response overwrote reset');
    assert(!document.querySelector('[data-conversation-add-scene]'), 'Old fixture draft remained open');
    assert(!control.snapshot.blocks.some(b => b.title === 'Old fixture'), 'Old fixture data returned');
  });
  await test('real QA preview reset discards same-ID drafts', async () => {
    root.render(<TextConversationEditorQaPreview />); await tick();
    await addSceneDraft('Discard after Reset Fixture'); await click(button('Reset Fixture'));
    assert(!document.querySelector('[data-conversation-add-scene]'), 'Reset Fixture kept stale form');
    await click(label('Mobile layout preview')); await click(label('Toggle QA dark theme'));
    assert(document.querySelector('[data-conversation-editor]'), 'Compact/dark transition lost editor');
    for (const [mode, code] of [['Test: v1 Migration Guard', 'MIGRATION_REQUIRED'], ['Test: Corrupt Integrity Guard', 'INVALID_SNAPSHOT'], ['Test: Unsupported Workspace', 'UNSUPPORTED_WORKSPACE'], ['Test: Missing Workspace', 'WORKSPACE_NOT_FOUND']]) {
      await click(button(mode)); assert(document.querySelector(`[data-conversation-editor-fatal-error="${code}"]`), `Missing recovery ${code}`);
    }
    await click(button('Live Fixture (v2)')); assert(document.querySelector('[data-conversation-editor]'), 'Recovery lost valid editor');
  });
  await test('failed Sentence merge keeps its correction panel', async () => {
    control.setMode('merge-reject'); await tick();
    await click(button('Merge Next', sentence(control.ids.firstSentenceId)));
    const panel = query('[data-conversation-sentence-merge]');
    await click(button('Confirm Merge (1 + 2)', panel));
    assert(document.querySelector('[data-conversation-sentence-merge]'), 'Rejected merge closed correction panel');
  });
  await test('missing state receiver cannot pretend a local edit was saved', async () => {
    const fixture = createBrowserFixture(); root.render(<TextConversationEditor snapshot={fixture.snapshot} documentId={fixture.ids.documentId} />); await tick();
    await addSceneDraft('No receiver'); await click(button('Create Scene Card'));
    assert(document.querySelector('[data-conversation-add-scene]') && document.querySelector('[role="alert"]'), 'Discarded edit reported success');
  });
  await test('Scene CRUD and Mixed reordering preserve Paragraph boundaries and zero-Scene states', async () => {
    const ids = control.ids; const paragraph = control.snapshot.blocks.find(b => b.id === ids.paragraphId);
    control.setDocumentId(ids.mixedDocumentId); await tick(); await addSceneDraft('Browser Scene');
    await click(button('Create Scene Card')); const created = control.commits.at(-1).result.id;
    assert(scene(created).textContent.includes('Zero Turns persisted'), 'New Scene contains implicit Turns');
    await click(label(`Edit Scene ${created}`)); await input(label('Scene Card Title'), 'Renamed Scene');
    await input(label('Scene metadata note'), 'Browser note'); await click(button('Save Scene'));
    assert(control.snapshot.blocks.find(b => b.id === created).metadata.note === 'Browser note', 'Scene metadata lost');
    await click(label(`Move Scene ${created} up`));
    const afterParagraph = control.snapshot.blocks.find(b => b.id === ids.paragraphId);
    assert(JSON.stringify({ ...afterParagraph, updatedAt: paragraph.updatedAt }) === JSON.stringify(paragraph), 'Mixed reorder changed Paragraph identity/content/slot');
    await click(label(`Delete Scene ${created}`)); assert(!document.querySelector(`[data-conversation-scene-id="${created}"]`), 'Deleted Scene remains');
    await click(label(`Delete Scene ${ids.mixedSceneId}`)); assert(document.querySelector('[data-conversation-empty-workspace]'), 'Empty Workspace missing');
  });
  await test('Turn and Sentence operations preserve identity, empty Units, ordering and logical audio', async () => {
    const ids = control.ids;
    const audio = JSON.stringify(control.snapshot.audioVariants);
    const empty = control.snapshot.contentUnits.find(u => u.id === ids.emptyTurnId);
    await click(label(`Move sentence ${ids.firstSentenceId} down`));
    assert(control.snapshot.contentUnits.find(u => u.id === empty.id).order === empty.order, 'Sentence reorder displaced empty Turn');
    await click(label(`Move sentence ${ids.firstSentenceId} up`));
    await click(starts('Split Turn Here', sentence(ids.secondSentenceId)));
    const splitTurn = control.commits.at(-1).result.createdId;
    const mergeButton = button('Merge Next', turn(ids.aliceTurnId));
    const beforeMerge = { disabled: mergeButton.disabled, connected: mergeButton.isConnected };
    await click(mergeButton);
    // The receipt is synchronous, but Harness publishes control.snapshot from a
    // React effect. A fixed 20ms tick can observe the preceding split snapshot.
    await waitForCommittedState(() => !control.snapshot.contentUnits.some(u => u.id === splitTurn)
      && !document.querySelector(`[data-conversation-turn-id="${splitTurn}"]`));
    assert(!control.snapshot.contentUnits.some(u => u.id === splitTurn), 'Turn merge failed: ' + JSON.stringify({ beforeMerge,
      commands: control.commands.slice(-3).map(c => c.type), receipts: control.commits.slice(-3).map(c => c.result), alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent) }));
    await click(label(`Move Turn ${ids.bobTurnId} up`));
    const bobSpeaker = control.snapshot.contentUnits.find(u => u.id === ids.bobTurnId).speakerId;
    await click(label(`Edit Turn ${ids.aliceTurnId}`)); await input(label('Turn Speaker Choice'), bobSpeaker); await click(button('Save Turn'));
    assert(control.snapshot.segments.filter(s => s.unitId === ids.aliceTurnId).every(s => s.speaker === 'Bob'), 'Speaker reassignment did not synchronize children');
    await click(label(`Edit Turn ${ids.aliceTurnId}`)); await input(label('Turn Speaker Choice'), '__none__'); await click(button('Save Turn'));
    assert(control.snapshot.segments.filter(s => s.unitId === ids.aliceTurnId).every(s => s.speaker === null), 'Speaker reset failed');
    await click(button('Move Turn', sentence(ids.firstSentenceId))); await input(label('Destination Turn'), ids.emptyTurnId);
    await click(button('Move Sentence')); assert(control.snapshot.segments.find(s => s.id === ids.firstSentenceId).unitId === ids.emptyTurnId, 'Sentence move failed');
    assert(JSON.stringify(control.snapshot.audioVariants) === audio, 'Structural edit changed Split metadata/RF');
    const bobUid = control.snapshot.contentUnits.find(u => u.id === ids.bobTurnId).uid;
    await click(label(`Delete sentence ${ids.bobSentenceId}`));
    assert(control.snapshot.contentUnits.find(u => u.id === ids.bobTurnId)?.uid === bobUid, 'Audio-backed last Sentence deletion lost Turn identity');
    assert(!control.snapshot.audioVariants.some(v => v.segmentId === ids.bobSentenceId), 'Deleted Sentence retained logical audio references');
    await click(button('Add Speaker Turn', scene(ids.zeroSceneId))); await click(button('Create Empty Turn'));
    const newTurn = control.commits.at(-1).result.id; const uid = control.snapshot.contentUnits.find(u => u.id === newTurn).uid;
    for (const text of ['One sentence.', 'Second sentence.']) {
      await click(button('Add Sentence', turn(newTurn))); await input(label('New Sentence Text'), text); await click(button('Add Sentence', query('[data-conversation-add-sentence]')));
    }
    const children = control.snapshot.segments.filter(s => s.unitId === newTurn);
    assert(children.length === 2, 'Multi-Sentence Turn not preserved');
    await click(label(`Edit sentence ${children[0].id}`)); await input(label('Edit Sentence Text'), 'Changed sentence.'); await click(button('Save Sentence'));
    for (const child of children) await click(label(`Delete sentence ${child.id}`));
    assert(control.snapshot.contentUnits.find(u => u.id === newTurn)?.uid === uid && turn(newTurn).textContent.includes('Empty Turn preserved'), 'Last deletion lost empty Turn identity');
    await click(label(`Delete Turn ${newTurn}`)); assert(!document.querySelector(`[data-conversation-turn-id="${newTurn}"]`), 'Deleted Turn remains');
    // Empty child/card boundaries remain intact despite selections and deletions.
    assert(control.snapshot.blocks.some(b => b.id === ids.zeroSceneId), 'Explicit Turn deletion removed its Scene');
  });
  await test('real bilingual split/merge retains source identity and retires only selected logical references', async () => {
    const ids = control.ids; const before = control.snapshot.segments.find(s => s.id === ids.firstSentenceId);
    const audioBefore = structuredClone(control.snapshot.audioVariants);
    await click(button('Split', sentence(before.id))); await click(starts('Apply Auto Split'));
    const created = control.commits.at(-1).result.createdIds[0];
    const retained = control.snapshot.segments.find(s => s.id === before.id); const child = control.snapshot.segments.find(s => s.id === created);
    assert(retained.uid === before.uid && child.unitId === before.unitId && child.speaker === before.speaker, 'Split changed identity/speaker');
    assert(retained.metadata.externalEntityV1.segmentKey === 'd4c-original' && !child.metadata.externalEntityV1, 'Split duplicated/lost external identity');
    assert(child.metadata.prolingoTextPackSource.ownership === 'detached-local', 'Split child retained attached ownership');
    assert(!control.snapshot.audioVariants.some(v => v.segmentId === child.id), 'New child copied audio');
    for (const original of audioBefore) {
      const after = control.snapshot.audioVariants.find(v => v.id === original.id);
      assert(after.uid === original.uid && after.metadata.audioRenderFingerprintV1 === original.metadata.audioRenderFingerprintV1, 'Split changed existing audio RF');
      if (original.segmentId === before.id) assert(after.metadata.contentInvalidatedV1, 'Retained audio not invalidated');
    }
    await click(button('Merge Next', sentence(before.id))); await click(starts('Confirm Merge', query('[data-conversation-sentence-merge]')));
    assert(!control.snapshot.segments.some(s => s.id === created), 'Merge left explicitly retired child');
    assert(control.snapshot.segments.find(s => s.id === before.id).text === before.text, 'Merge did not restore joined text');
    // Mismatch must block Auto Split; explicit blank meanings need confirmation.
    await click(label(`Edit sentence ${before.id}`)); await input(label('Edit Sentence Meaning'), 'Single translation.'); await click(button('Save Sentence'));
    await click(button('Split', sentence(before.id)));
    assert(document.body.textContent.includes('Translation alignment warning'), 'Missing translation mismatch warning');
    assert(![...document.querySelectorAll('button')].some(b => b.textContent.includes('Apply Auto Split')), 'Mismatch allowed auto apply');
    await click(button('Review & Align Bilingual Parts Manually'));
    const count = control.commands.length; await click(starts('Apply Split'));
    assert(control.commands.length === count, 'Blank meaning bypassed confirmation');
    await click(query('[data-conversation-sentence-split] input[type="checkbox"]')); await click(starts('Apply Split'));
    assert(control.commands.length === count + 1, 'Confirmed explicit blank split did not dispatch');
  });
  await test('speaker registry rename preserves speaker UID across populated and empty Turns', async () => {
    const ids = control.ids; const original = control.snapshot.contentUnits.find(u => u.id === ids.emptyTurnId);
    const originalSpeaker = control.snapshot.documents.find(d => d.id === ids.documentId).metadata.speakerRegistryV1.find(s => s.id === original.speakerId);
    await click(query('[data-conversation-speaker-registry] > button'));
    await input(label('New speaker label'), 'Disposable speaker'); await click(button('Register'));
    const speakerId = control.commits.at(-1).result.id;
    await click(label('Edit speaker Alice')); await input(label('Rename Alice'), 'Dr Alice'); await click(label('Save speaker name'));
    assert(control.snapshot.contentUnits.find(u => u.id === original.id).speakerId === original.speakerId, 'Rename changed speaker identity');
    assert(control.snapshot.documents.find(d => d.id === ids.documentId).metadata.speakerRegistryV1.find(s => s.id === original.speakerId).uid === originalSpeaker.uid, 'Rename changed speaker UID');
    assert(turn(original.id).textContent.includes('Dr Alice'), 'Rename missed empty Turn');
    await click(label('Remove speaker Dr Alice'));
    assert(document.querySelector('[role="alert"]') && control.snapshot.documents.find(d => d.id === ids.documentId).metadata.speakerRegistryV1.some(s => s.id === original.speakerId), 'In-use speaker removal bypassed core guard');
    await click(label('Remove speaker Disposable speaker'));
    assert(!control.snapshot.documents.find(d => d.id === ids.documentId).metadata.speakerRegistryV1.some(s => s.id === speakerId), 'Unused speaker not removed');
  });
  await test('browser cursor selections require both translated split boundaries', async () => {
    const ids = control.ids;
    await click(button('Split', sentence(ids.firstSentenceId))); await click(button('Split Here'));
    const selectCursor = async (el, offset) => {
      el.focus(); el.setSelectionRange(offset, offset);
      document.dispatchEvent(new Event('selectionchange'));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })); await tick();
    };
    await selectCursor(label('Select EN split cursor'), 6);
    assert(![...document.querySelectorAll('button')].some(b => b.textContent.trim().startsWith('Apply Split Here')), 'Manual split applied without Meaning cursor');
    await selectCursor(label('Select Meaning split cursor'), 5);
    assert([...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Apply Split Here'), query('[data-conversation-sentence-split]').textContent);
    await click(starts('Apply Split Here'));
    const childId = control.commits.at(-1).result.createdIds[0];
    assert(control.snapshot.segments.find(s => s.id === childId).meaning === 'Selamat datang.', 'Browser meaning cursor misaligned the split');
  });
  const missingCommands = Object.keys(TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS).filter(type => !successfulCommands.has(type));
  results.push({ name: 'all 20 D4-A commands committed through browser UI', ok: missingCommands.length === 0, missingCommands });
  return { browser: navigator.userAgent, results, commandsCovered: [...commandsCovered], successfulCommands: [...successfulCommands], supportedCommands: Object.keys(TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS),
    passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, indexedDbCalls: window.__d4cDbCalls || 0 };
};
