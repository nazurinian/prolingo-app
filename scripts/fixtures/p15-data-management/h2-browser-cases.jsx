import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TEXT_LIBRARY_DB_NAME } from '../../../src/constants/textDatabaseConstants.js';
import { canonicalJsonStringify } from '../../../src/domain/text/textCanonicalFingerprintDomain.js';
import { TEXT_GLOBAL_UID_KINDS, TEXT_GLOBAL_UID_PREFIXES } from '../../../src/domain/text/textGlobalIdentityDomain.js';
import { createTextDataManagementSession } from '../../../src/services/textDataManagementSession.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import {
  createTextDataManagementPersistenceAdapter,
  readDisposableTextManagementDatabaseState,
  seedDisposableTextManagementDatabase
} from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import TextDataManagementQaPreview from '../../../src/components/text/management/TextDataManagementQaPreview.jsx';
import { createP15ExtendedQaFixtures } from './fixture.js';

const containerEl = document.getElementById('root');
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async (predicate, label = 'H2 UI condition timed out') => {
  const end = performance.now() + 9000;
  while (performance.now() < end) {
    if (predicate()) return;
    await frame();
  }
  throw new Error(label);
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const q = (selector, scope = document) => scope.querySelector(selector);
const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

let controlSeq = 0;
const setViewport = (width, height) => new Promise(resolve => {
  const id = ++controlSeq;
  window.__p15H2InputPending[id] = resolve;
  window.p15H2BrowserControl(JSON.stringify({ type: 'viewport', id, width, height }));
});
const captureShot = name => new Promise(resolve => {
  const id = ++controlSeq;
  window.__p15H2InputPending[id] = resolve;
  window.p15H2BrowserControl(JSON.stringify({ type: 'screenshot', id, name }));
});

const setInputValue = async (el, value) => {
  assert(el, 'Missing form control for setInputValue');
  const proto = el.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await frame();
};

const clickEl = async el => {
  assert(el && !el.disabled, `Missing or disabled button: ${el?.outerHTML?.slice(0, 140) || 'null'}`);
  el.click();
  await frame();
};

const mountQaPreview = () => {
  const host = document.createElement('div');
  containerEl.replaceChildren(host);
  const r = createRoot(host);
  r.render(<StrictMode><TextDataManagementQaPreview /></StrictMode>);
  return () => r.unmount();
};

export async function runP15H2BrowserCases() {
  const results = [];
  const createdDbs = [
    'prolingo_text_library_d3b_qa_h2_primary',
    'prolingo_text_library_d3b_qa_h2_secondary',
    'prolingo_text_library_d3b_qa_h2_custom',
    'prolingo_text_library_d3b_qa_h2_v1_slot',
    'prolingo_text_library_d3b_qa_h2_disposal'
  ];

  // Clean slate in disposable H2 QA slots before running tests
  for (const name of createdDbs) {
    await deleteDisposableTextLibraryDatabase({ dbName: name }).catch(() => {});
  }

  const run = async (name, fn) => {
    await fn();
    results.push({ name, ok: true });
  };

  const fixtures = createP15ExtendedQaFixtures();
  const { ids } = fixtures.base;
  const v2Preset = fixtures.presets['v2-external-sources'];
  let unmountQa = null;
  let capturedV2CollectionId = null;
  let capturedV2WorkspaceId = null;
  let capturedV2CardId = null;

  try {
    await run('H2-1: Default DEV preview stays In-Memory (fixture preview) while Disposable IDB rejects canonical DB and explicitly initializes uninitialized QA DBs', async () => {
      unmountQa = mountQaPreview();
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="in-memory"]'));

      // Verify In-Memory transfer backup labels
      await clickEl(q('[data-dm-tab="transfers"]'));
      await until(() => q('[data-dm-backup-origin-badge="in-memory-preview"]'));
      assert(q('[data-dm-backup-policy-labels]').textContent.includes('No Physical Audio Binaries'), 'Missing No Physical Audio Binaries badge');
      assert(q('[data-dm-backup-policy-labels]').textContent.includes('Canonical Backup Unavailable in H2'), 'Missing Canonical Backup Unavailable in H2 badge');
      await clickEl(q('[data-dm-export-backup]'));
      await until(() => q('[data-dm-export-output="database-backup"][data-dm-export-origin="in-memory-preview"]'));
      await clickEl(q('[data-dm-tab="all"]'));

      // Switch to disposable-idb -> default h2_primary is UNINITIALIZED
      await setInputValue(q('[data-dm-qa-storage-select]'), 'disposable-idb');
      await until(() => q('[data-dm-page="connection-error"][data-dm-connection-error="UNINITIALIZED"]'), 'Expected UNINITIALIZED connection error');
      assert(q('[data-dm-connection-seed-db]'), 'Explicit DB seed CTA must appear when UNINITIALIZED');

      // Guard check: attempting canonical prolingo_text_library fails with CANONICAL_DB_PROTECTED & zero touches
      await setInputValue(q('[data-dm-qa-db-select]'), '__custom__');
      await until(() => q('[data-dm-qa-db-custom-input]'));
      await setInputValue(q('[data-dm-qa-db-custom-input]'), TEXT_LIBRARY_DB_NAME);
      await until(() => q('[data-dm-connection-error="CANONICAL_DB_PROTECTED"]'), 'Canonical DB must be rejected cleanly in UI');
      assert((window.__p15H2CanonicalDbTouches || 0) === 0, 'Canonical DB must never be touched');

      // Switch back to h2_primary and explicitly initialize with v2-external-sources
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_primary');
      await until(() => q('[data-dm-connection-error="UNINITIALIZED"]') && q('[data-dm-connection-seed-db]'));
      await setInputValue(q('[data-dm-qa-preset-select]'), 'v2-external-sources');
      await clickEl(q('[data-dm-connection-seed-db]'));
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="disposable-idb"]'));
      assert(q('[data-dm-storage-badge]').textContent.includes('h2_primary'), 'Disposable DB badge missing DB name');
      assert(q('[data-dm-ready-reload-source]'), 'Ready-state Reload Authoritative Source button must be rendered');
    });

    await run('H2-2: Real disposable IDB Collection, Workspace, Card, Turn, Sentence & Speaker operations survive full UI remount without silent overwrite', async () => {
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => q('[data-dm-mode-badge="disposable"]') && !q('[data-dm-toggle-create-collection]').disabled);

      // 1. Create Collection
      await clickEl(q('[data-dm-toggle-create-collection]'));
      await setInputValue(q('[aria-label="New Collection title"]'), 'H2 Persisted Col');
      await clickEl(q('[data-dm-submit-create-collection]'));
      await until(() => qa('[data-dm-collection]').some(el => el.textContent.includes('H2 Persisted Col')));
      capturedV2CollectionId = qa('[data-dm-collection]').find(el => el.textContent.includes('H2 Persisted Col')).dataset.dmCollection;
      await clickEl(q(`[data-dm-collection="${capturedV2CollectionId}"]`));
      await until(() => q('[data-dm-current-selection]')?.textContent.includes(capturedV2CollectionId));

      // 2. Create Workspace in new Collection
      await clickEl(q('[data-dm-toggle-create-workspace]'));
      await setInputValue(q('[aria-label="New Workspace title"]'), 'H2 Conversation Doc');
      await setInputValue(q('[aria-label="New Workspace type"]'), 'conversation');
      await clickEl(q('[data-dm-submit-create-workspace]'));
      await until(() => qa('[data-dm-workspace]').some(el => el.textContent.includes('H2 Conversation Doc')));
      capturedV2WorkspaceId = qa('[data-dm-workspace]').find(el => el.textContent.includes('H2 Conversation Doc')).dataset.dmWorkspace;

      // 3. Edit Mixed Workspace Card, Turn, Sentence & Speaker
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[data-dm-structured-editor="${ids.documentId}"]`));

      await setInputValue(q('[aria-label="New Card kind"]'), 'conversation');
      await setInputValue(q('[aria-label="New Card title"]'), 'H2 Persistent Scene');
      await clickEl(q('[data-dm-create-card-submit]'));
      await until(() => qa('[data-dm-card-id]').some(el => el.textContent.includes('H2 Persistent Scene')));
      capturedV2CardId = qa('[data-dm-card-id]').find(el => el.textContent.includes('H2 Persistent Scene')).dataset.dmCardId;

      await clickEl(q(`[data-dm-open-create-unit="${capturedV2CardId}"]`));
      await setInputValue(q(`[aria-label="New Turn speaker ${capturedV2CardId}"]`), '__none__');
      await clickEl(q(`[data-dm-create-unit-submit="${capturedV2CardId}"]`));
      await until(() => q(`[data-dm-card-id="${capturedV2CardId}"] [data-dm-empty-unit]`));
      const newTurnId = q(`[data-dm-card-id="${capturedV2CardId}"] [data-dm-unit-id]`).dataset.dmUnitId;

      await setInputValue(q(`[aria-label="Add Sentence text ${newTurnId}"]`), 'Persisted Turn EN.');
      await setInputValue(q(`[aria-label="Add Sentence meaning ${newTurnId}"]`), 'Giliran tersimpan ID.');
      await clickEl(q(`[data-dm-add-sentence-submit="${newTurnId}"]`));
      await until(() => q(`[data-dm-unit-id="${newTurnId}"] [data-dm-segment-id]`));

      // Rename an existing speaker via ConversationSpeakerPanel
      await clickEl(q('[data-conversation-speaker-registry] button'));
      await setInputValue(q('[aria-label="New speaker label"]'), 'Narrator H2');
      const regBtn = [...q('[data-conversation-speaker-registry]').querySelectorAll('button')].find(b => b.textContent.includes('Register'));
      await clickEl(regBtn);
      await until(() => q('[data-dm-speaker-uid-list]')?.textContent?.includes('Narrator H2'));

      // Verify IDs & UIDs directly in IndexedDB match UI
      const dbBeforeRemount = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      assert(dbBeforeRemount.snapshot.collections.some(c => c.id === capturedV2CollectionId && c.uid?.startsWith(TEXT_GLOBAL_UID_PREFIXES[TEXT_GLOBAL_UID_KINDS.COLLECTION])), 'Collection UID persisted');
      assert(dbBeforeRemount.snapshot.documents.some(d => d.id === capturedV2WorkspaceId && d.uid?.startsWith(TEXT_GLOBAL_UID_PREFIXES[TEXT_GLOBAL_UID_KINDS.WORKSPACE])), 'Workspace UID persisted');
      assert(dbBeforeRemount.snapshot.blocks.some(b => b.id === capturedV2CardId && b.uid?.startsWith(TEXT_GLOBAL_UID_PREFIXES[TEXT_GLOBAL_UID_KINDS.CARD])), 'Card UID persisted');
      assert(dbBeforeRemount.snapshot.contentUnits.some(u => u.id === newTurnId && u.uid?.startsWith(TEXT_GLOBAL_UID_PREFIXES[TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT])), 'Turn UID persisted');
      assert(dbBeforeRemount.sourceAttachments.length === v2Preset.sourceAttachments.length, 'Source attachments preserved');
      assert(dbBeforeRemount.externalImports.length === v2Preset.externalImports.length, 'External imports preserved');
      assert(dbBeforeRemount.snapshot.audioVariants.length === v2Preset.snapshot.audioVariants.length, 'AudioVariants preserved');

      // Full unmount + remount: default preset is v2-complete, yet connecting to h2_primary MUST NOT overwrite it!
      unmountQa();
      await frame();
      unmountQa = mountQaPreview();
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="in-memory"]'));
      await setInputValue(q('[data-dm-qa-storage-select]'), 'disposable-idb');
      await until(() => q('[data-dm-page="ready"]') && q(`[data-dm-collection="${capturedV2CollectionId}"]`), 'Previously initialized DB must reload persisted Collection without silent overwrite');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => qa('[data-dm-card-id]').some(el => el.dataset.dmCardId === capturedV2CardId), 'Previously persisted Card must survive UI remount');
    });

    await run('H2-3: Adapter switch loads v1-paragraph secondary DB with read-only virtual Sections and zero cross-database writes', async () => {
      const primaryBefore = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });

      // Switch to secondary DB -> uninitialized -> seed with v1-paragraph
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_secondary');
      await until(() => q('[data-dm-connection-error="UNINITIALIZED"]'));
      await setInputValue(q('[data-dm-qa-preset-select]'), 'v1-paragraph');
      await clickEl(q('[data-dm-connection-seed-db]'));
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge]').textContent.includes('h2_secondary'));

      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      const v1DocId = q('[data-dm-workspace]').dataset.dmWorkspace;
      await clickEl(q(`[data-dm-workspace="${v1DocId}"]`));
      await until(() => q(`[data-dm-workspace-inspector="${v1DocId}"]`) && q('[data-dm-virtual-unit]') && q('[data-dm-v1-unit-disabled]'));

      const v1CardId = q('[data-dm-card-id]').dataset.dmCardId;
      await setInputValue(q(`[aria-label="Add Sentence text ${v1CardId}"]`), 'H2 v1 persisted line.');
      await clickEl(q(`[data-dm-add-sentence-submit="${v1CardId}"]`));
      await until(() => qa(`[data-dm-card-id="${v1CardId}"] [data-dm-segment-id]`).length === 3);

      const secondaryAfter = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_secondary' });
      assert(secondaryAfter.dbVersion === 1 && secondaryAfter.schemaVersion === 1, 'v1 secondary DB stayed v1');
      assert(secondaryAfter.snapshot.contentUnits === undefined, 'v1 secondary DB has no contentUnits');
      assert(secondaryAfter.snapshot.segments.some(s => s.text === 'H2 v1 persisted line.'), 'v1 edit persisted to h2_secondary');

      // Primary DB must remain byte-for-byte untouched!
      const primaryAfter = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      assert(primaryAfter.snapshotFingerprint === primaryBefore.snapshotFingerprint, 'Cross-database isolation violated');

      // Switch back to primary DB -> must reload authoritative primary DB before edits
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_primary');
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge]').textContent.includes('h2_primary') && q(`[data-dm-collection="${capturedV2CollectionId}"]`));
    });

    await run('H2-4: Adapter read-only and catalog-only permission ceilings cannot be escalated via UI configuration', async () => {
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[data-dm-segment-save="${ids.firstSentenceId}"]`) && !q(`[data-dm-segment-save="${ids.firstSentenceId}"]`).disabled);

      // Clamp to read-only ceiling while UI mode stays disposable-full
      await setInputValue(q('[data-dm-qa-adapter-ceiling-select]'), 'read-only');
      await until(() => q('[data-dm-ceiling-clamped="true"]') && q('[data-dm-effective-permissions="none"]'));
      assert(q('[data-dm-mode-badge="read-only"]'), 'Read-only ceiling must force Read-Only badge');
      assert(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`).disabled, 'Read-only ceiling must disable save');
      assert(q('[data-dm-toggle-create-collection]').disabled, 'Read-only ceiling must disable catalog create');

      // Clamp to catalog-only ceiling while UI mode stays disposable-full
      await setInputValue(q('[data-dm-qa-adapter-ceiling-select]'), 'catalog');
      await until(() => q('[data-dm-ceiling-clamped="true"]') && q('[data-dm-effective-permissions="catalog"]'));
      assert(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`).disabled, 'Catalog-only ceiling must disable content save');
      await clickEl(q('[data-dm-nav-library]'));
      await until(() => !q('[data-dm-toggle-create-collection]').disabled, 'Catalog-only ceiling permits Collection create in {}');

      // Restore match-mode
      await setInputValue(q('[data-dm-qa-adapter-ceiling-select]'), 'match-mode');
      await until(() => !q('[data-dm-ceiling-clamped="true"]') && q('[data-dm-effective-permissions="catalog,content"]'));
    });

    await run('H2-5: Cross-context pre-commit STALE_RESULT distinguishes no DB write, preserves drafts, and reloads without duplicate submission', async () => {
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`) && q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`));

      await setInputValue(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`), 'H2 Pre-Commit Preserved Draft');
      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'Stale UI Attempt');

      // External concurrent writer commits metadata note to IndexedDB
      await clickEl(q('[data-dm-qa-simulate-conflict]'));
      await until(() => q('[data-dm-qa-controls]').textContent.includes('External QA writer update'));
      const dbBeforeConflictSave = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });

      // Attempt save in UI -> pre-commit STALE_RESULT
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-page-error="STALE_RESULT"][data-dm-conflict-kind="pre-commit-stale"]'));
      assert(q('[data-dm-error-committed="false"]'), 'Pre-commit conflict must show data-dm-error-committed="false"');
      assert(q('[data-dm-reload-required="true"]'), 'Pre-commit conflict must set reloadRequired');
      assert(q('[data-dm-page-error]').textContent.includes('PRE-COMMIT CONFLICT — NO DATABASE WRITE'), 'Pre-commit banner copy missing');

      const dbAfterRejectedSave = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      assert(dbAfterRejectedSave.snapshotFingerprint === dbBeforeConflictSave.snapshotFingerprint, 'Rejected pre-commit write touched DB');

      // Reload Authoritative Source -> clears conflict, keeps drafts, no duplicate submit!
      await captureShot('p15-h2-precommit-stale');
      await clickEl(q('[data-dm-reload-valid-source]'));
      await until(() => q('[data-dm-page="ready"]') && !q('[data-dm-page-error]') && q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`), 'Expected ready workspace after pre-commit reload');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H2 Pre-Commit Preserved Draft', 'Draft lost across pre-commit reload');
      assert(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'Stale UI Attempt', 'Attempted draft lost across reload');
      const dbAfterReload = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      assert(dbAfterReload.snapshotFingerprint === dbAfterRejectedSave.snapshotFingerprint, 'Reload unexpectedly replayed stale command');
    });

    await run('H2-6: Committed-but-unaccepted receipt (committed:true, reloadRequired:true) across navigation, permission change, loading transition & disposal', async () => {
      // 1. Committed receipt + Navigation while pending
      await setInputValue(q('[data-dm-qa-transport-select]'), 'defer');
      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'H2 Committed Nav Value.');
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-pending-status="pending"]') && q('[data-dm-qa-release-deferred]'));

      await clickEl(q(`[data-dm-workspace="${ids.paragraphId}"]`));
      await until(() => q(`[data-dm-workspace-inspector="${ids.paragraphId}"]`));
      await clickEl(q('[data-dm-qa-release-deferred]'));

      await until(() => q('[data-dm-page-error="STALE_RESULT"][data-dm-conflict-kind="committed-reload-required"]'));
      assert(q('[data-dm-error-committed="true"]'), 'Committed receipt conflict must set data-dm-error-committed="true"');
      assert(q('[data-dm-reload-required="true"]'), 'Committed receipt conflict must set data-dm-reload-required="true"');
      assert(q('[data-dm-page-error]').textContent.includes('DATABASE COMMITTED — UI RECEIPT NOT ACCEPTED'), 'Missing committed banner label');

      await captureShot('p15-h2-committed-conflict');

      await clickEl(q('[data-dm-reload-valid-source]'));
      await until(() => q('[data-dm-page="ready"]') && !q('[data-dm-page-error]'));
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[data-dm-segment-id="${ids.firstSentenceId}"]`));
      await clickEl(q(`[data-dm-segment-clear-draft="${ids.firstSentenceId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'H2 Committed Nav Value.');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H2 Pre-Commit Preserved Draft', 'Unrelated draft lost after committed reconciliation');

      // 2. Committed receipt + Permission change + Loading toggle while pending
      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'H2 Committed Perm-Load Value.');
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-pending-status="pending"]') && q('[data-dm-qa-release-deferred]'));
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-catalog');
      await clickEl(q('[data-dm-qa-toggle-loading]'));
      await until(() => q('[data-dm-loading="true"]'));
      await clickEl(q('[data-dm-qa-toggle-loading]'));
      await until(() => q('[data-dm-page="ready"]'));
      await clickEl(q('[data-dm-qa-release-deferred]'));

      await until(() => q('[data-dm-page-error="STALE_RESULT"][data-dm-error-committed="true"][data-dm-reload-required="true"]'));
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await clickEl(q('[data-dm-ready-reload-source]'));
      await until(() => q('[data-dm-page="ready"]') && !q('[data-dm-page-error]') && q(`[data-dm-segment-clear-draft="${ids.firstSentenceId}"]`));
      await clickEl(q(`[data-dm-segment-clear-draft="${ids.firstSentenceId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'H2 Committed Perm-Load Value.');
      await clickEl(q(`[data-dm-segment-clear-draft="${ids.secondSentenceId}"]`));
      await setInputValue(q('[data-dm-qa-transport-select]'), 'accept');

      // 3. Explicit disposal while authoritative DB transaction is pending reports committed:true + reloadRequired:true
      const disposalDb = 'prolingo_text_library_d3b_qa_h2_disposal';
      const primaryState = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      await seedDisposableTextManagementDatabase({
        dbName: disposalDb,
        snapshot: primaryState.snapshot,
        metaRecords: primaryState.metaRecords
      });
      const dispAdapter = createTextDataManagementPersistenceAdapter({ dbName: disposalDb, boundary: 'disposable', permissions: ['content'] });
      let relDisp = null;
      const dispExec = async (cmd, ctx) => {
        const receipt = await dispAdapter.execute(cmd, ctx);
        return new Promise(resolve => { relDisp = () => resolve(receipt); });
      };
      dispExec.authoritativeTransaction = true;
      const dispSession = createTextDataManagementSession({
        snapshot: primaryState.snapshot,
        metaRecords: primaryState.metaRecords,
        selection: { workspaceId: ids.documentId },
        boundary: 'disposable',
        permissions: ['content'],
        execute: dispExec
      });
      const pendingDisp = dispSession.dispatch({
        type: 'segment.update',
        payload: { id: ids.firstSentenceId, text: 'Committed Before Dispose.' }
      });
      await until(() => relDisp);
      dispSession.dispose();
      relDisp();
      const dispOutcome = await pendingDisp;
      assert(!dispOutcome.ok && dispOutcome.error.committed === true && dispOutcome.error.reloadRequired === true, 'Disposal while committed must report committed:true & reloadRequired:true');
      const dispDbState = await readDisposableTextManagementDatabaseState({ dbName: disposalDb });
      assert(dispDbState.snapshot.segments.find(s => s.id === ids.firstSentenceId)?.text === 'Committed Before Dispose.', 'DB commit persisted despite session disposal');
    });

    await run('H2-7: Transfers backup uses adapter.exportBackup() from live IDB with honest origin labels and disabled Restore/Apply', async () => {
      // Create an external DB metadata update NOT yet reloaded into UI session props to prove live IDB read!
      await clickEl(q('[data-dm-qa-simulate-conflict]'));
      await until(() => q('[data-dm-qa-controls]').textContent.includes('External QA writer update'));

      await clickEl(q('[data-dm-tab="transfers"]'));
      await until(() => q('[data-dm-backup-origin-badge="authoritative-disposable-idb"]'));
      assert(q('[data-dm-backup-origin-badge]').textContent.includes('Authoritative disposable QA JSON backup'), 'Missing authoritative backup badge');
      assert(q('[data-dm-backup-policy-labels]').textContent.includes('No Physical Audio Binaries'), 'Missing audio label');
      assert(q('[data-dm-backup-policy-labels]').textContent.includes('Canonical Backup Unavailable in H2'), 'Missing canonical unavailability label');

      await clickEl(q('[data-dm-export-backup]'));
      await until(() => q('[data-dm-export-output="database-backup"][data-dm-export-origin="authoritative-disposable-idb"]'));
      const exportedJsonText = q('[data-dm-transfer-json-input]').value;
      const parsedExport = JSON.parse(exportedJsonText);
      assert(parsedExport.audioBinaryIncluded === false, 'Backup embedded audio binaries');
      const livePrimary = await readDisposableTextManagementDatabaseState({ dbName: 'prolingo_text_library_d3b_qa_h2_primary' });
      const liveDocNote = livePrimary.snapshot.documents.find(d => d.id === ids.documentId)?.metadata?.note;
      const exportedDocNote = parsedExport.stores.documents.find(d => d.id === ids.documentId)?.metadata?.note;
      assert(exportedDocNote === liveDocNote && exportedDocNote.includes('External QA writer update'), 'Backup did not reflect live DB via adapter.exportBackup()');

      // Missing metadata verification still fails cleanly with METADATA_REQUIRED
      await clickEl(q('[data-dm-export-backup-missing-meta]'));
      await until(() => q('[data-dm-transfer-error]')?.textContent?.includes('METADATA_REQUIRED'));

      // Restore / apply / GC buttons must remain strictly disabled
      const disabledButtons = qa('[data-dm-transfer-disabled-apply] button');
      assert(disabledButtons.length >= 3 && disabledButtons.every(btn => btn.disabled), 'Destructive transfer buttons must stay disabled in H2');
    });

    await run('H2-8: Responsive Desktop/375px/320px viewports, Dark Mode, Keyboard tab navigation & zero horizontal overflow', async () => {
      await clickEl(q('[data-dm-tab="all"]'));
      await clickEl(q('[data-dm-ready-reload-source]'));
      await until(() => q('[data-dm-page="ready"]') && !q('[data-dm-page-error]') && q('[data-dm-tab="all"]'));

      const firstTab = q('[data-dm-tab="all"]');
      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await until(() => q('[data-dm-tab="editor"][aria-selected="true"]'));
      q('[data-dm-tab="editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await until(() => q('[data-dm-tab="all"][aria-selected="true"]'));

      await setViewport(1280, 900);
      await until(() => window.innerWidth === 1280);
      await captureShot('p15-h2-desktop-disposable-idb');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `1280px overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      await setViewport(375, 812);
      await until(() => window.innerWidth === 375);
      await captureShot('p15-h2-mobile-375-idb');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `375px overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      await clickEl(q('[data-dm-mobile-explorer-toggle]'));
      await clickEl(q('[data-dm-qa-dark-toggle]'));
      await setViewport(320, 740);
      await until(() => window.innerWidth === 320);
      await new Promise(resolve => setTimeout(resolve, 220));
      await captureShot('p15-h2-mobile-320-dark-idb');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `320px overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      await clickEl(q('[data-dm-qa-dark-toggle]'));
      await setViewport(1280, 800);
      assert(canonicalJsonStringify(fixtures.presets['v2-external-sources'].snapshot).length > 0, 'Sanity check');
    });
  } finally {
    try { unmountQa?.(); } catch { /* already unmounted */ }
    await deleteDisposableTextLibraryDatabase({ dbName: 'prolingo_text_library_d3b_qa_h2_disposal' }).catch(() => {});
    for (const name of createdDbs) {
      await deleteDisposableTextLibraryDatabase({ dbName: name }).catch(() => {});
    }
  }

  const remainingDbs = typeof indexedDB?.databases === 'function' ? await indexedDB.databases() : [];
  return {
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
    canonicalDbTouches: window.__p15H2CanonicalDbTouches || 0,
    hasCanonicalDb: remainingDbs.some(d => d?.name === TEXT_LIBRARY_DB_NAME),
    remainingDisposableDbs: remainingDbs.filter(d => d?.name?.startsWith('prolingo_text_library_d3b_qa_')).length
  };
}
