import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TEXT_LIBRARY_DB_NAME } from '../../../src/constants/textDatabaseConstants.js';
import { deleteDisposableTextLibraryDatabase } from '../../../src/services/persistence/textContentUnitPersistenceService.js';
import {
  readDisposableTextManagementDatabaseState
} from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import TextDataManagementQaPreview from '../../../src/components/text/management/TextDataManagementQaPreview.jsx';
import { createP15ExtendedQaFixtures } from './fixture.js';

const containerEl = document.getElementById('root');
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const until = async (predicate, label = 'H3 UI condition timed out') => {
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
  window.__p15H3InputPending[id] = resolve;
  window.p15H3BrowserControl(JSON.stringify({ type: 'viewport', id, width, height }));
});
const captureShot = name => new Promise(resolve => {
  const id = ++controlSeq;
  window.__p15H3InputPending[id] = resolve;
  window.p15H3BrowserControl(JSON.stringify({ type: 'screenshot', id, name }));
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

const setCheckbox = async (el, checked) => {
  assert(el && el.type === 'checkbox', 'Missing checkbox control');
  if (el.checked !== checked) {
    el.click();
    await frame();
  }
  assert(el.checked === checked, `Failed to set checkbox state to ${checked}`);
};

const clickEl = async el => {
  assert(el && !el.disabled, `Missing or disabled button: ${el?.outerHTML?.slice(0, 140) || 'null'}`);
  el.click();
  await frame();
};

/** Opens raw IndexedDB to construct corrupted/partial/version-mismatched QA states safely. */
const createRawDisposableDb = (dbName, version, onUpgrade) => new Promise((resolve, reject) => {
  const req = indexedDB.open(dbName, version);
  req.onupgradeneeded = event => {
    onUpgrade(req.result, event.target.transaction);
  };
  req.onsuccess = () => {
    const db = req.result;
    db.close();
    resolve();
  };
  req.onerror = () => reject(req.error || new Error(`Failed creating raw DB ${dbName}`));
});

export async function runP15H3BrowserCases() {
  const results = [];
  const createdDbs = [
    'prolingo_text_library_d3b_qa_h3_missing',
    'prolingo_text_library_d3b_qa_h3_corrupted_meta',
    'prolingo_text_library_d3b_qa_h3_existing_uninit',
    'prolingo_text_library_d3b_qa_h3_version_mismatch',
    'prolingo_text_library_d3b_qa_h3_concurrent',
    'prolingo_text_library_d3b_qa_h2_primary',
    'prolingo_text_library_d3b_qa_h2_secondary'
  ];
  for (const name of createdDbs) {
    await deleteDisposableTextLibraryDatabase({ dbName: name }).catch(() => {});
  }

  const run = async (name, fn) => {
    await fn();
    results.push({ name, ok: true });
  };

  const fixtures = createP15ExtendedQaFixtures();
  const { ids } = fixtures.base;

  let forceParentRerender = null;
  let unmountQa = null;
  const mountQaStrict = () => {
    const host = document.createElement('div');
    containerEl.replaceChildren(host);
    const root = createRoot(host);
    const Harness = () => {
      const [tick, setTick] = React.useState(0);
      React.useEffect(() => {
        forceParentRerender = () => setTick(v => v + 1);
        return () => { forceParentRerender = null; };
      }, []);
      return (
        <div data-dm-h3-host-tick={tick}>
          <TextDataManagementQaPreview />
        </div>
      );
    };
    root.render(<StrictMode><Harness /></StrictMode>);
    return () => root.unmount();
  };

  try {
    await run('H3-1 (H3-S): Initialization safety distinguishes absent DB from existing, existing-uninitialized, version-mismatch & corrupted DBs', async () => {
      unmountQa = mountQaStrict();
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="in-memory"]'));

      // 1a. Switch to Disposable IDB -> genuinely absent DB (`h2_primary`) allows ordinary Initialize
      await setInputValue(q('[data-dm-qa-storage-select]'), 'disposable-idb');
      await until(() => q('[data-dm-page="connection-error"][data-dm-connection-error="UNINITIALIZED"][data-dm-database-missing="true"][data-dm-existing-db-protected="false"]'), '1a absent DB check timed out');
      assert(q('[data-dm-qa-seed-db]') && q('[data-dm-connection-seed-db]'), 'Absent DB must allow ordinary Initialize');

      // 1b. Canonical DB name is blocked with zero touches
      await setInputValue(q('[data-dm-qa-db-select]'), '__custom__');
      await until(() => q('[data-dm-qa-db-custom-input]'), '1b custom DB input timed out');
      await setInputValue(q('[data-dm-qa-db-custom-input]'), TEXT_LIBRARY_DB_NAME);
      await until(() => q('[data-dm-connection-error="CANONICAL_DB_PROTECTED"][data-dm-database-missing="false"]'), '1b canonical DB rejection timed out');
      assert(!q('[data-dm-qa-seed-db]') && !q('[data-dm-connection-seed-db]'), 'Failed canonical connection must never expose Initialize');
      assert((window.__p15H3CanonicalDbTouches || 0) === 0, 'Canonical DB touched during rejection');

      // 1c. Corrupted existing DB (has collections store with existing sentinel record, missing meta store -> UNINITIALIZED databaseMissing:false)
      const uninitExistingDb = 'prolingo_text_library_d3b_qa_h3_existing_uninit';
      await createRawDisposableDb(uninitExistingDb, 1, db => {
        const colStore = db.createObjectStore('collections', { keyPath: 'id' });
        colStore.put({ id: 'COL_SENTINEL', uid: 'COLUID_SENTINEL', title: 'Existing Partial Sentinel', order: 0 });
      });
      await setInputValue(q('[data-dm-qa-db-custom-input]'), uninitExistingDb);
      await until(() => q('[data-dm-connection-error="UNINITIALIZED"][data-dm-database-missing="false"][data-dm-existing-db-protected="true"]'), '1c existing uninitialized DB check timed out');
      assert(!q('[data-dm-qa-seed-db]') && !q('[data-dm-connection-seed-db]'), 'Existing DB with UNINITIALIZED (databaseMissing:false) must NOT expose ordinary Initialize');

      // 1d. Existing DB with corrupted metadata (METADATA_REQUIRED / meta missing keys, all v2 stores present)
      const corruptedMetaDb = 'prolingo_text_library_d3b_qa_h3_corrupted_meta';
      await createRawDisposableDb(corruptedMetaDb, 1, db => {
        const meta = db.createObjectStore('meta', { keyPath: 'key' });
        meta.put({ key: 'initialized', value: true });
        // Missing schemaVersion/idCounters/activeDocumentId -> METADATA_REQUIRED!
        const cols = db.createObjectStore('collections', { keyPath: 'id' });
        cols.put({ id: 'COL_CORRUPT_PRESERVED', uid: 'COLUID_CORRUPT', title: 'Keep Corrupted Sentinel', order: 0 });
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('blocks', { keyPath: 'id' });
        db.createObjectStore('contentUnits', { keyPath: 'id' });
        db.createObjectStore('segments', { keyPath: 'id' });
        db.createObjectStore('audioVariants', { keyPath: 'id' });
      });
      await setInputValue(q('[data-dm-qa-db-custom-input]'), corruptedMetaDb);
      await until(() => q('[data-dm-connection-error="METADATA_REQUIRED"][data-dm-database-missing="false"][data-dm-existing-db-protected="true"]'), '1d METADATA_REQUIRED DB check timed out');
      assert(!q('[data-dm-qa-seed-db]') && !q('[data-dm-connection-seed-db]'), 'Corrupted METADATA_REQUIRED DB must block ordinary Initialize');

      // Open explicit two-step overwrite confirmation, verify button disabled until checkbox checked, cancel leaves corrupted DB untouched
      await clickEl(q('[data-dm-connection-open-overwrite-confirm]'));
      await until(() => q('[data-dm-qa-overwrite-confirm-panel]'));
      assert(q('[data-dm-qa-confirm-overwrite]').disabled, 'Overwrite confirmation button must stay disabled until checkbox checked');
      await setCheckbox(q('[data-dm-qa-confirm-overwrite-checkbox]'), true);
      assert(!q('[data-dm-qa-confirm-overwrite]').disabled, 'Overwrite button must enable only after explicit checkbox confirmation');
      await captureShot('p15-h3-overwrite-confirm-guard');
      await clickEl(q('[data-dm-qa-cancel-overwrite]'));
      await until(() => !q('[data-dm-qa-overwrite-confirm-panel]'));

      // Verify sentinel record in corruptedMetaDb was NOT overwritten
      const preservedCheck = await new Promise((resolve, reject) => {
        const req = indexedDB.open(corruptedMetaDb);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('collections', 'readonly');
          const getReq = tx.objectStore('collections').get('COL_CORRUPT_PRESERVED');
          getReq.onsuccess = () => { db.close(); resolve(getReq.result); };
          getReq.onerror = () => { db.close(); reject(getReq.error); };
        };
        req.onerror = () => reject(req.error);
      });
      assert(preservedCheck?.title === 'Keep Corrupted Sentinel', 'Cancelled overwrite modified existing corrupted DB data');

      // 1e. Existing incompatible / partial v9 store DB (`INVALID_SNAPSHOT`, databaseMissing: false)
      const versionMismatchDb = 'prolingo_text_library_d3b_qa_h3_version_mismatch';
      await createRawDisposableDb(versionMismatchDb, 9, db => {
        db.createObjectStore('meta', { keyPath: 'key' }).put({ key: 'initialized', value: true });
      });
      await setInputValue(q('[data-dm-qa-db-custom-input]'), versionMismatchDb);
      await until(() => q('[data-dm-connection-error="INVALID_SNAPSHOT"][data-dm-existing-db-protected="true"]'), '1e incompatible store DB check timed out');
      assert(!q('[data-dm-qa-seed-db]') && !q('[data-dm-connection-seed-db]'), 'Existing INVALID_SNAPSHOT DB must block ordinary Initialize');

      // Intentional explicit overwrite recovers corruptedMetaDb cleanly when checkbox + confirm are used
      await setInputValue(q('[data-dm-qa-db-custom-input]'), corruptedMetaDb);
      await until(() => q('[data-dm-connection-error="METADATA_REQUIRED"]'), '1f reload METADATA_REQUIRED timed out');
      await clickEl(q('[data-dm-connection-open-overwrite-confirm]'));
      await setCheckbox(q('[data-dm-qa-confirm-overwrite-checkbox]'), true);
      await clickEl(q('[data-dm-qa-confirm-overwrite]'));
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="disposable-idb"]').textContent.includes(corruptedMetaDb), '1f explicit overwrite recovery timed out');
      assert(!q('[data-dm-qa-seed-db]'), 'Initialized DB must never display ordinary Initialize button');
    });

    await run('H3-2 (H3-S): Repeated & concurrent initialization clicks reject safely without overwriting', async () => {
      const concurrentDb = 'prolingo_text_library_d3b_qa_h3_concurrent';
      await setInputValue(q('[data-dm-qa-db-custom-input]'), concurrentDb);
      await until(() => q('[data-dm-connection-error="UNINITIALIZED"][data-dm-database-missing="true"]') && q('[data-dm-qa-seed-db]'), 'H3-2 missing concurrentDb timed out');

      // Simultaneous click on both ordinary Initialize buttons before React disables them!
      const headerSeedBtn = q('[data-dm-qa-seed-db]');
      const connSeedBtn = q('[data-dm-connection-seed-db]');
      headerSeedBtn.click();
      connSeedBtn.click();
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge="disposable-idb"]').textContent.includes(concurrentDb), 'H3-2 concurrent init settle timed out');
      await until(() => q('[data-dm-qa-controls]').textContent.includes('CONCURRENT_INIT'), 'H3-2 CONCURRENT_INIT status note timed out');

      // Verify DB loaded validly, ordinary Initialize is gone, and explicit overwrite dialog is required to replace it
      const state = await readDisposableTextManagementDatabaseState({ dbName: concurrentDb });
      assert(state.snapshot.documents.length > 0 && !q('[data-dm-qa-seed-db]'), 'Concurrent initialization failed to settle cleanly');
    });

    await run('H3-3 (H3-R): Draft continuity across rejected edit, navigation, DB switch, permissions, StrictMode rerenders, loading & authoritative reload', async () => {
      // Seed clean primary DB via ordinary missing-DB Initialize on slot h2_primary
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_primary');
      await until(() => q('[data-dm-connection-error="UNINITIALIZED"][data-dm-database-missing="true"]') && q('[data-dm-connection-seed-db]'), 'H3-3 missing h2_primary timed out');
      await setInputValue(q('[data-dm-qa-preset-select]'), 'v2-external-sources');
      await clickEl(q('[data-dm-connection-seed-db]'));
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge]').textContent.includes('h2_primary'), 'H3-3 seed h2_primary timed out');

      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => q('[data-dm-mode-badge="disposable"]'), 'H3-3 mode disposable timed out');

      // Open workspace and enter an uncommitted draft on second sentence
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[data-dm-segment-id="${ids.secondSentenceId}"]`), 'H3-3 segment render timed out');
      const secondTextInput = q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`);
      await setInputValue(secondTextInput, 'H3 Continuous Draft Value');
      await until(() => q('[data-dm-draft-count]')?.dataset.dmDraftCount === '1', 'H3-3 draft count=1 timed out');

      // (1) Rejected edit preserves draft
      await setInputValue(q('[data-dm-qa-transport-select]'), 'reject');
      await clickEl(q(`[data-dm-segment-save="${ids.secondSentenceId}"]`));
      await until(() => q('[data-dm-page-error="QA_REJECTED"][data-dm-conflict-kind="rejected"]'), 'H3-3 QA_REJECTED timed out');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'Draft lost on rejected edit');
      await setInputValue(q('[data-dm-qa-transport-select]'), 'accept');

      // (2) Workspace navigation preserves draft
      await clickEl(q(`[data-dm-workspace="${ids.paragraphId}"]`));
      await until(() => q(`[data-dm-workspace-inspector="${ids.paragraphId}"]`), 'H3-3 nav paragraph timed out');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'H3-3 nav back draft check timed out');

      // (3) DB switching (to uninitialized h2_secondary -> Retained Drafts visible in State 1b -> back to h2_primary) preserves draft
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_secondary');
      await until(() => q('[data-dm-page="connection-error"]') && q('[data-dm-retained-drafts]'), 'H3-3 switch secondary State 1b retained drafts timed out');
      assert(q('[data-dm-retained-drafts]').textContent.includes('H3 Continuous Draft Value'), 'Retained draft missing in State 1b after DB switch');
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_primary');
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge]').textContent.includes('h2_primary'), 'H3-3 switch back h2_primary timed out');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'H3-3 draft after switch back timed out');

      // (4) Permission changes preserve draft in BOTH Disposable IDB AND In-Memory modes!
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-catalog');
      await until(() => q(`[data-dm-segment-save="${ids.secondSentenceId}"]`).disabled, 'H3-3 catalog ceiling timed out');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => !q(`[data-dm-segment-save="${ids.secondSentenceId}"]`).disabled, 'H3-3 full unlock timed out');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'Draft lost across IDB permission changes');

      // (5) React parent rerender under StrictMode preserves draft
      forceParentRerender?.();
      await frame();
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'Draft lost after StrictMode host rerender');

      // (6) Loading transition + deferred committed conflict -> keyboard focusable Reload Authoritative Source -> no auto-replay
      await setInputValue(q('[data-dm-qa-transport-select]'), 'defer');
      await setInputValue(q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`), 'H3 Committed Before Conflict');
      await clickEl(q(`[data-dm-segment-save="${ids.firstSentenceId}"]`));
      await until(() => q('[data-dm-pending-status="pending"]') && q('[data-dm-qa-release-deferred]'), 'H3-3 deferred pending timed out');
      await clickEl(q('[data-dm-qa-toggle-loading]'));
      await until(() => q('[data-dm-loading="true"]'), 'H3-3 loading=true timed out');
      await clickEl(q('[data-dm-qa-toggle-loading]'));
      await until(() => q('[data-dm-page="ready"]'), 'H3-3 exit loading timed out');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'Draft lost across loading transition');

      // Navigate while deferred DB commit finishes -> committed:true & reloadRequired:true
      await clickEl(q(`[data-dm-workspace="${ids.paragraphId}"]`));
      await until(() => q(`[data-dm-workspace-inspector="${ids.paragraphId}"]`), 'H3-3 nav paragraph before deferred release timed out');
      await clickEl(q('[data-dm-qa-release-deferred]'));
      await until(() => q('[data-dm-page-error="STALE_RESULT"][data-dm-error-committed="true"][data-dm-reload-required="true"][data-dm-conflict-kind="committed-reload-required"]'), 'H3-3 STALE_RESULT committed timed out');
      assert(q('[data-dm-page-error]').getAttribute('role') === 'alert', 'Conflict banner must have role="alert"');
      await captureShot('p15-h3-recovery-conflict');

      // Keyboard focus on recovery reload button
      const reloadBtn = q('[data-dm-reload-valid-source]');
      reloadBtn.focus();
      assert(document.activeElement === reloadBtn, 'Reload recovery button is not keyboard-focusable');
      await clickEl(reloadBtn);
      await until(() => q('[data-dm-page="ready"]') && !q('[data-dm-page-error]'), 'H3-3 reload after conflict timed out');

      // (7) Explicit authoritative reload keeps preserved draft
      await clickEl(q('[data-dm-ready-reload-source]'));
      await until(() => q('[data-dm-page="ready"]'), 'H3-3 ready reload timed out');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.firstSentenceId}"]`).value === 'H3 Committed Before Conflict', 'H3-3 committed text check timed out');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 Continuous Draft Value', 'Draft lost after explicit authoritative reload');

      // Also verify permission switch preserves draft in In-Memory mode!
      await setInputValue(q('[data-dm-qa-storage-select]'), 'in-memory');
      await until(() => q('[data-dm-storage-badge="in-memory"]'), 'H3-3 switch in-memory timed out');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`), 'H3-3 in-memory workspace load timed out');
      await setInputValue(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`), 'H3 In-Memory Permission Draft');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-catalog');
      await until(() => q(`[data-dm-segment-save="${ids.secondSentenceId}"]`).disabled, 'H3-3 in-memory catalog lock timed out');
      assert(q(`[aria-label="Sentence text ${ids.secondSentenceId}"]`).value === 'H3 In-Memory Permission Draft', 'In-memory mode lost draft across permission change');
      await setInputValue(q('[data-dm-qa-storage-select]'), 'disposable-idb');
      await setInputValue(q('[data-dm-qa-db-select]'), 'prolingo_text_library_d3b_qa_h2_primary');
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-storage-badge]').textContent.includes('h2_primary'), 'H3-3 switch back IDB timed out');
      await setInputValue(q('[data-dm-qa-transport-select]'), 'accept');
    });

    await run('H3-4 (H3-B): Export scope clarity, pure JSON download, audio exclusion honesty & disabled destructive controls', async () => {
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => q('[data-dm-page="ready"]') && q('[data-dm-tab="transfers"]'), 'H3-4 tab=transfers ready timed out');
      await clickEl(q('[data-dm-tab="transfers"]'));
      await until(() => q('[data-dm-export-backup]'), 'H3-4 export-backup button timed out');

      // Intercept Blob + anchor click purely in-page to verify real JSON download content without writing to FS
      let capturedDownload = null;
      const origCreateObjUrl = URL.createObjectURL.bind(URL);
      const origAnchorClick = HTMLAnchorElement.prototype.click;
      let lastBlob = null;
      URL.createObjectURL = blob => {
        lastBlob = blob;
        return origCreateObjUrl(blob);
      };
      HTMLAnchorElement.prototype.click = function interceptedClick() {
        if (this.hasAttribute('download')) {
          capturedDownload = { filename: this.getAttribute('download'), blob: lastBlob };
          return undefined;
        }
        return origAnchorClick.call(this);
      };
      try {
        await clickEl(q('[data-dm-export-backup]'));
        await until(
          () => q('[data-dm-download-exported-json]') || q('[data-dm-transfer-error]'),
          'H3-4 export backup settle timed out'
        );
        const errEl = q('[data-dm-transfer-error]');
        assert(!errEl, `H3-4 unexpected transfer error: ${errEl?.textContent}`);
        assert(q('[data-dm-export-scope-summary="database-backup"]').textContent.includes('Physical audio binaries NOT included'), 'Missing explicit no-audio disclaimer on export card');
        assert(q('[data-dm-export-scope-summary="database-backup"]').textContent.includes('Whole Disposable QA Library'), 'Missing backup scope description');

        const revBeforeDownload = q('[data-dm-revision]').dataset.dmRevision;
        await clickEl(q('[data-dm-download-exported-json]'));
        await until(() => q('[data-dm-export-downloaded]') && capturedDownload, 'H3-4 download status timed out');
        assert(capturedDownload.filename.endsWith('.no-audio.json'), `Expected honest .no-audio.json suffix, got ${capturedDownload.filename}`);
        assert(q('[data-dm-export-downloaded]').getAttribute('role') === 'status', 'Download status must use role="status"');
        const blobJson = JSON.parse(await capturedDownload.blob.text());
        assert(blobJson.audioBinaryIncluded === false && blobJson.metaRecords?.length > 0, 'Downloaded backup JSON invalid');
        assert(q('[data-dm-revision]').dataset.dmRevision === revBeforeDownload, 'Download mutated session state');
        await captureShot('p15-h3-transfers-download');
      } finally {
        URL.createObjectURL = origCreateObjUrl;
        HTMLAnchorElement.prototype.click = origAnchorClick;
      }

      const disabledBtns = qa('[data-dm-transfer-disabled-apply] button');
      assert(disabledBtns.length >= 3 && disabledBtns.every(b => b.disabled), 'Destructive apply/restore/GC controls must stay strictly disabled');
    });

    await run('H3-5 & H3-6 (H3-UI & H3-QA): v1/v2 fixtures, ceilings, a11y labels/focus, 1280px/375px/320px Light/Dark & 200% text scale overflow', async () => {
      // Check visible v2 Editor + form labels + keyboard focus visibility
      await clickEl(q('[data-dm-tab="all"]'));
      await clickEl(q(`[data-dm-workspace="${ids.documentId}"]`));
      await until(() => q(`[data-dm-segment-id="${ids.firstSentenceId}"]`), 'H3-5 workspace open timed out');

      const desktopControls = qa('input, select, textarea').filter(el => el.offsetParent !== null);
      for (const ctrl of desktopControls) {
        const hasLabel = Boolean(ctrl.getAttribute('aria-label') || ctrl.closest('label')?.textContent?.trim());
        assert(hasLabel, `Input/Select missing accessible label or aria-label: ${ctrl.outerHTML.slice(0, 120)}`);
      }

      // Check real focus visibility & keyboard tab navigation
      const firstTab = q('[data-dm-tab="all"]');
      firstTab.focus();
      const firstTabFocusStyle = getComputedStyle(firstTab);
      assert(
        firstTab.className.includes('focus-visible:outline-2') && (!firstTab.matches(':focus-visible') || firstTabFocusStyle.outlineStyle !== 'none'),
        `Missing keyboard focus-visible ring style: ${firstTabFocusStyle.outlineStyle}`
      );
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await until(() => q('[data-dm-tab="editor"][aria-selected="true"]'), 'H3-5 tab ArrowRight timed out');
      q('[data-dm-tab="editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await until(() => q('[data-dm-tab="transfers"][aria-selected="true"]'), 'H3-5 tab End timed out');
      q('[data-dm-tab="transfers"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await until(() => q('[data-dm-tab="all"][aria-selected="true"]'), 'H3-5 tab Home timed out');

      // Check permission ceilings (`read-only`, `catalog`, `content`)
      await setInputValue(q('[data-dm-qa-mode-select]'), 'read-only');
      await until(() => q('[data-dm-mode-badge="read-only"]') && q('[data-dm-reader-preview="true"]'), 'H3-5 read-only Shared Reader timed out');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-content');
      await until(() => q('[data-dm-toggle-create-collection]').disabled && !q(`[data-dm-segment-save="${ids.firstSentenceId}"]`).disabled, 'H3-5 content-only ceiling timed out');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => q('[data-dm-mode-badge="disposable"]'), 'H3-5 disposable unlock timed out');

      // Check 1280px Desktop Light + 200% text scaling
      await setViewport(1280, 900);
      await until(() => window.innerWidth === 1280, 'H3-6 1280px viewport timed out');
      await captureShot('p15-h3-desktop-light');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `1280px light overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      document.documentElement.style.fontSize = '200%';
      await frame();
      await frame();
      await captureShot('p15-h3-desktop-200pct');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `1280px 200% zoom overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      // Check 375px Mobile Light 200% text scaling + touch targets
      await setViewport(375, 812);
      await until(() => window.innerWidth === 375, 'H3-6 375px viewport timed out');
      await frame();
      await captureShot('p15-h3-mobile-375-200pct');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `375px 200% zoom overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      const smallReorderBtns = qa('[data-dm-collection-reorder-up], [data-dm-workspace-reorder-up]');
      for (const btn of smallReorderBtns) {
        if (btn.offsetParent !== null) {
          const rect = btn.getBoundingClientRect();
          assert(rect.width >= 44 && rect.height >= 44, `Mobile touch target < 44px (${rect.width}x${rect.height}): ${btn.getAttribute('aria-label')}`);
        }
      }

      // Check 320px Narrow Mobile Dark + 200% zoom with Explorer hidden and visible
      await clickEl(q('[data-dm-qa-dark-toggle]'));
      await setViewport(320, 740);
      await until(() => window.innerWidth === 320, 'H3-6 320px viewport timed out');
      await frame();
      await captureShot('p15-h3-mobile-320-200pct-dark');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `320px 200% dark overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      await clickEl(q('[data-dm-mobile-explorer-toggle]'));
      await frame();
      await captureShot('p15-h3-mobile-320-collapsed-dark');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `320px collapsed 200% dark overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      // Scroll to Structured Editor on 320px 200% dark mode to visually inspect cards/units/inputs below QA banner
      q(`[data-dm-structured-editor="${ids.documentId}"]`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      await frame();
      await captureShot('p15-h3-mobile-320-editor-200pct-dark');
      assert(document.documentElement.scrollWidth <= window.innerWidth, `320px editor scrolled 200% dark overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

      // Reset scaling/theme/viewport & also check v1-paragraph fixture + Read-Only Shared Reader preview
      document.documentElement.style.fontSize = '';
      await clickEl(q('[data-dm-qa-dark-toggle]'));
      await setViewport(1280, 900);
      await setInputValue(q('[data-dm-qa-storage-select]'), 'in-memory');
      await until(() => q('[data-dm-storage-badge="in-memory"]'), 'H3-6 in-memory reset timed out');
      await setInputValue(q('[data-dm-qa-preset-select]'), 'v1-paragraph');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'disposable-full');
      await until(() => qa('[data-dm-workspace]').length > 0, 'H3-6 v1 workspaces load timed out');
      await clickEl(qa('[data-dm-workspace]')[0]);
      await until(() => q('[data-dm-v1-unit-disabled]'), 'H3-6 v1 virtual unit banner timed out');
      await setInputValue(q('[data-dm-qa-mode-select]'), 'read-only');
      await until(() => q('[data-dm-mode-badge="read-only"]') && q('[data-dm-reader-preview="true"]'), 'H3-6 v1 Shared Reader timed out');
    });
  } finally {
    document.documentElement.style.fontSize = '';
    try { unmountQa?.(); } catch { /* already unmounted */ }
    for (const name of createdDbs) {
      await deleteDisposableTextLibraryDatabase({ dbName: name }).catch(() => {});
    }
  }

  const remainingDbs = typeof indexedDB?.databases === 'function' ? await indexedDB.databases() : [];
  return {
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
    canonicalDbTouches: window.__p15H3CanonicalDbTouches || 0,
    hasCanonicalDb: remainingDbs.some(d => d?.name === TEXT_LIBRARY_DB_NAME),
    remainingDisposableDbs: remainingDbs.filter(d => d?.name?.startsWith('prolingo_text_library_d3b_qa_')).length
  };
}
