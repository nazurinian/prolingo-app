import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const dbName = 'prolingo_text_library_d3b_qa_audio_hardening';
const q = JSON.stringify;
export const hardeningAuditLibraries = {
  [dbName]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(dbName).digest('hex')
};
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const status = 'document.querySelector("[data-book-body-audio-status]")?.textContent';

export async function checkBookAudioHardening({ navigate, evaluate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, bodyRequests }) {
  const groups = [];
  const pass = message => { groups.push(message); console.log('PASS', message); };
  await navigate(uatOrigin, '/?qa=book-qa&db=' + dbName);
  await waitFor(`location.search.includes(${q(dbName)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
  await chooseOptIn();
  const { workspaceId, conversationId } = await probe(`module.seedBookAudioHardening(${q(dbName)})`);
  await clickButton('Load / Connect existing v2 library');
  await waitFor('document.querySelector("[data-book-body-audio] summary")');

  const batching = await probe(`module.exerciseGenerationSequence(${host}, ${q(workspaceId)}, async () => {
    const result = await module.executeExternal(${q(dbName)}, {}, {type:'collection.create',payload:{title:'External batch boundary writer'}});
    if (!result.ok) throw new Error(result.error.message);
  })`);
  assert.equal(batching.count32.committed, 32);
  assert.equal(batching.count33.committed, 33);
  assert.equal(batching.peerRetry.alreadyAvailable, 64);
  pass('Generation at 32, 33 and 67 logical entries preserves order, reuses shared RFs and resumes after cancellation, quota, stale and uncertain results');
  const byteBoundary = await probe(`module.exerciseGenerationByteBoundary(${host}, ${q(workspaceId)})`);
  assert.equal(byteBoundary.calls, 3);
  pass('Generation fills an exact 64 MiB batch and carries the next verified render into its own batch without re-rendering');

  const recovery = await probe(`module.exerciseDamagedProvisional(${host}, ${q(workspaceId)})`);
  assert.equal(recovery.recovered.committed, 1);
  assert.notEqual(recovery.recoveredDigest, recovery.firstDigest);
  pass('Generation restores one proven damaged provisional asset and fences protected, conflicting and uncertain ownership');

  const selectWorkspace = async id => {
    await evaluate(`(() => {
    const select = document.querySelector('[data-app-header] select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${q(id)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(`${host}.session.getState().view.selection.workspaceId === ${q(id)}`);
  };
  await selectWorkspace(workspaceId);
  await evaluate('document.querySelector("[data-book-body-audio] summary").click()');
  await waitFor('document.querySelector("[data-book-body-audio-status]")');
  await clickButton('Generate Card Split');
  await waitFor(`${status}?.includes('67 committed, 0 already available')`, 30000);
  const card = await evaluate(status);
  await clickButton('Generate Workspace Split');
  await waitFor(`${status}?.includes('4 committed, 67 already available')`, 30000);
  const workspace = await evaluate(status);
  const afterWork = bodyRequests.length;
  await clickButton('Generate Workspace Split');
  await waitFor(`${status}?.includes('0 committed, 71 already available')`, 30000);
  const repeat = await evaluate(status);
  assert.equal(bodyRequests.length, afterWork, 'Existing verified recordings triggered synthesis');
  pass('The actual QA panel supports 67- and 71-Sentence Card and Workspace operations and verifies repeat requests without rendering');

  const click = selector => evaluate(`document.querySelector(${q(selector)}).click()`);
  const transport = label => click(`[data-global-player] button[aria-label="${label}"]`);
  const saved = '[data-text-global-player-controls] button';
  await transport('Expand player details');
  await waitFor(`document.querySelector(${q(saved)})?.getClientRects().length`);
  if (!(await evaluate(`document.querySelector(${q(saved)}).textContent.includes('Saved Full')`))) await click(saved);
  await waitFor(`document.querySelector(${q(saved)}).textContent.includes('Saved Full')`);
  await transport('Collapse player details');
  const paragraph = await evaluate(`(() => {
    const snapshot = ${host}.session.getSnapshot();
    const card = snapshot.blocks.find(row => row.documentId === ${q(workspaceId)});
    return { cardId: card.id, first: snapshot.segments.find(row => row.blockId === card.id).id };
  })()`);
  await click(`[data-text-player-card="${paragraph.cardId}"] button[data-text-card-play-compact]`);
  await waitFor(`${player}.nowPlaying.segment?.id === ${q(paragraph.first)} && ${player}.nowPlaying.actualRepresentation === 'split'`);
  const paragraphPlayback = await evaluate(`${player}.nowPlaying`);
  assert.equal(paragraphPlayback.requestedRepresentation, 'full');
  assert.equal(paragraphPlayback.source, 'generated');
  assert.equal(paragraphPlayback.scope, 'card');
  await transport('Stop playback');

  const conversation = await probe(`module.populateStandaloneConversation(${host}, ${q(conversationId)})`);
  await selectWorkspace(conversationId);
  await click(`[data-text-player-card="${conversation.cardId}"] button[data-text-card-play-compact]`);
  await waitFor(`${player}.nowPlaying.heading?.key === 'scene' && ${player}.nowPlaying.source === 'tts'`);
  const sceneHeading = await evaluate(`${player}.nowPlaying`);
  assert.equal(sceneHeading.card.id, conversation.cardId);
  assert.equal(sceneHeading.heading.content, 'Bilingual scene');
  await evaluate('window.speechSynthesis.finish()');
  const audible = async id => {
    try { await waitFor(`${player}.nowPlaying.segment?.id === ${q(id)} && ${player}.media?.duration > 0`); }
    catch (cause) {
      const state = await evaluate(`({ nowPlaying: ${player}.nowPlaying, speech: window.__bookQaSpeech.slice(-6) })`);
      throw new Error('Expected standalone Conversation Sentence ' + id + ' ' + q(state), { cause });
    }
  };
  const observed = [];
  for (const [index, id] of conversation.segments.entries()) {
    await audible(id);
    const current = await evaluate(`${player}.nowPlaying`);
    assert.equal(current.requestedRepresentation, 'full');
    assert.equal(current.actualRepresentation, 'split');
    assert.equal(current.source, 'generated');
    assert.equal(current.unit.id, conversation.units[index][0]);
    assert.equal(current.speaker.id, conversation.units[index][1]);
    assert.equal(current.voice, conversation.voices[index]);
    observed.push({ unit: current.unit.id, speaker: current.speaker.id, voice: current.voice });
    if (index !== conversation.segments.length - 1) await evaluate(`${player}.media?.dispatchEvent(new Event('ended'))`);
  }
  await transport('Stop playback');
  pass('Pure Paragraph and Conversation report Split fallback, while consecutive same-Speaker Turns and independent channel readiness retain exact identities');
  return { groups, batching, byteBoundary, recovery, ui: { card, workspace, repeat }, paragraphPlayback, conversation: { ...conversation, sceneHeading, observed } };
}
