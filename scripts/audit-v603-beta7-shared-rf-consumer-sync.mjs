import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const meta = fs.readFileSync(path.join(root, 'src/constants/appMetadata.js'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/text/TextStructuredPlayer.jsx'), 'utf8');
const checks = [];
const check = (label, ok) => { if (!ok) throw new Error(`FAIL — ${label}`); checks.push(label); console.log(`PASS ${String(checks.length).padStart(2,'0')} • ${label}`); };

check('beta7+ lineage metadata', meta.includes("APP_VERSION = '6.0.3-beta.7'") || meta.includes("APP_VERSION = '6.0.3-beta.8"));
check('RF bulk materialization supports deferred snapshot', app.includes('deferSnapshot = false') && app.includes('structuredTextAudioPendingVariantRef.current.set'));
check('Shared RF fan-out supports deferred runtime state', app.includes('deferRuntimeState = false') && app.includes('(deferred batch sync)'));
check('Deferred fan-out queues runtime entries instead of forcing per-job render', app.includes('queueStructuredTextRuntimeEntry(variant.id, buildRuntime(variant), { immediate: false })'));
check('Fresh generated blobs fan out even in deferred Card/Bulk generation', !app.includes('if (!deferRuntimeState && generationVoiceState.renderFingerprint && runtimeEntry)') && app.includes('deferRuntimeState\n        });'));
check('Staging RF reuse path fans out to sibling logical slots', app.includes("deliveryStatus: 'staging-shared-rf-ready'") && app.includes('Shared RF reuse fan-out failed'));
check('Folder/ZIP RF reuse path fans out to sibling logical slots', app.includes('Shared external RF fan-out failed') && app.includes('externalOrigin}-shared-rf-ready'));
check('Shared staged release detects all logical consumers', app.includes('sharedRuntimeIds') && app.includes('shared by ${sharedRuntimeIds.length} logical audio slot(s)'));
check('Shared staged release removes every runtime consumer of the physical staging/RF', app.includes('Object.entries(prev || {}).forEach(([variantKey, entry]) =>') && app.includes('samePhysical'));
check('Shared staged release also clears deferred runtime consumers', app.includes('structuredTextAudioPendingRuntimeRef.current.delete(pendingId)'));
check('Shared release keeps logical metadata/history instead of deleting entities', app.includes('Core audio metadata/history remains; coverage is now metadata-only'));
check('Segment Release tooltip explains shared physical behaviour', player.includes('all shared logical slots update together'));
check('Full RF identity remains canonical; no short-RF rewrite introduced', app.includes('renderFingerprint: render.renderFingerprint') && !app.includes('renderFingerprint.slice(0, 10)'));

console.log(`\nBeta.7 Shared RF consumer sync audit PASS • ${checks.length} checks`);
