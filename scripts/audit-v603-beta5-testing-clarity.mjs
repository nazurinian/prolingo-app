import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
const check = (condition, label) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2,'0')} • ${label}`);
};

const app = read('src/App.jsx');
const audioControls = read('src/components/text/TextStructuredAudioControls.jsx');
const cardAudio = read('src/components/text/TextStructuredCardAudioPanel.jsx');
const audioData = read('src/components/text/TextAudioDataPanel.jsx');
const library = read('src/components/text/TextLibraryShell.jsx');
const batch = read('src/components/text/TextBatchPopup.jsx');
const desktopData = read('src/components/controls/DesktopDataActions.jsx');
const mobileData = read('src/components/controls/MobileDataControls.jsx');

check(app.includes("const externalOrigin = reusableExternalRuntime.folderBacked ? 'folder' : 'zip';"), 'generation has exact-RF Folder/ZIP reuse branch');
check(app.includes('TTS skipped.'), 'external RF reuse explicitly skips TTS');
check(app.includes('renderFingerprint: render.renderFingerprint'), 'generated/reused runtime entries retain render fingerprint');
check(app.includes('const playbackSessionId = playbackSessionRef.current;'), 'structured playback captures session generation token');
check(app.includes('if (!playbackStillCurrent()) return;'), 'async structured playback validates active session before play/fallback');
check(app.includes('retryFailed: handleStructuredTextRetryFailedGeneration'), 'Retry Failed is wired into structured bulk controls');
check(audioData.includes('window.confirm') && audioData.includes('app-owned staged audio'), 'Staging clear is confirmation-gated');
check(audioData.includes('Original ZIP files will not be deleted'), 'ZIP clear explains external source is not deleted');
check(audioControls.includes('SETUP & SOURCES'), 'Audio sidebar separates Setup & Sources from playback/export');
check(audioControls.includes('Bulk Audio'), 'Audio helper points scope-level work to Bulk Audio');
check(cardAudio.includes('Card Generate & Export') || (cardAudio.includes('Card Audio State') && cardAudio.includes('Bulk Audio')), 'Card workflow has a clear generation surface and directs scope export to Bulk Audio');
check(cardAudio.includes('workflowExpanded'), 'Card workflow is collapsible to avoid fixed-footer crowding');
check(library.includes('Workspace Text Packs are standalone scope packages') && library.includes('Unfiled / Library Root'), 'Transfer explains standalone Workspace pack destination');
check(library.includes('Load DB Backup accepts only files exported by') && library.includes('Export DB'), 'Transfer explains strict DB Backup type');
check(library.includes('Delete Workspace'), 'Manage exposes explicit Workspace delete wording');
check(batch.includes('Bulk Audio • Structured Text'), 'scope-level Batch renamed Bulk Audio');
check(batch.includes('RETRY FAILED ONLY'), 'Bulk UI exposes retry-failed-only action');
check(batch.includes('/-ID$/i.test'), 'Meaning fallback limits voices to Indonesia locale family');
check(desktopData.includes('BULK AUDIO') && mobileData.includes('BULK AUDIO'), 'desktop/mobile scope-level control consistently says Bulk Audio');

console.log(`\nBeta.5 testing-clarity audit PASS • ${pass} checks`);
