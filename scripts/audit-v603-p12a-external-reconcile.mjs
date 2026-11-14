import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
  TEXT_EXTERNAL_ENTITY_METADATA_KEY,
  planProLingoTextExternalInitialImport,
  validateProLingoTextExternalPackage
} from '../src/domain/text/textExternalJsonDomain.js';
import {
  inspectTextExternalReconciliation,
  planTextExternalUpdateExisting
} from '../src/domain/text/textExternalReconciliationDomain.js';
import {
  TEXT_LIBRARY_COMMAND_TYPES,
  applyTextLibraryCommand
} from '../src/domain/text/textLibraryCommandDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';
import { collectTextGlobalUidDiagnostics, createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from '../src/domain/text/textGlobalIdentityDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY,
  buildTextStructuredUpsertSpeakerRegistryMetadata,
  getTextStructuredSpeakerRegistry
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures/p12a');
const loadFixture = name => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));

const emptySnapshot = () => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1,
  initialized: true,
  activeDocumentId: null,
  counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
  collections: [],
  documents: [],
  blocks: [],
  segments: [],
  audioVariants: []
});

const ext = record => record?.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY] || null;
const bySegKey = (snapshot, documentId) => new Map(
  snapshot.segments
    .filter(item => item.documentId === documentId)
    .map(item => [ext(item)?.segmentKey || ext(item)?.entryKey || item.id, item])
);

const run = (label, fn) => {
  try {
    fn();
    console.log(`PASS ${label}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${label}: ${error?.stack || error}`);
    return false;
  }
};

let allPassed = true;

// Stage A0: Validate all four P12-A JSON fixtures using the real importer validator.
allPassed &= run('A0-fixtures-valid', () => {
  const fixtureFiles = [
    'P12_Conversation_Only_Additional_Test_v1.json',
    'P12A_Reimport_Preserve_And_Rename_v2.json',
    'P12A_Speaker_Conflict_Base_v1.json',
    'P12A_Speaker_Conflict_Incoming_v2.json'
  ];
  for (const file of fixtureFiles) {
    const validated = validateProLingoTextExternalPackage(loadFixture(file)).package;
    assert.equal(validated.packageType, PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE);
    assert.equal(validated.workspace.workspaceType, 'conversation');
    assert.equal(validated.workspace.conversationMode, 'conversation-only');
    assert.equal(validated.workspace.speakers.length, 3);
    assert.equal(validated.workspace.cards.length, 3);
    const totalSegments = validated.workspace.cards.reduce((sum, card) => sum + card.segments.length, 0);
    assert.equal(totalSegments, 13);
  }
});

// Stage A1 (EXT-01): Preserve local-only Cards, Segments, and Speakers during external update-existing.
allPassed &= run('A1-ext01-preserve-local-cards-segments-speakers', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const v2 = loadFixture('P12A_Reimport_Preserve_And_Rename_v2.json');

  // Seed unrelated workspace first so cross-workspace isolation is checked too.
  let state = emptySnapshot();
  const otherDocCreate = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_DOCUMENT,
    payload: { title: 'Unrelated Workspace', documentType: 'conversation', textLanguage: 'en-GB', meaningLanguage: 'id' }
  }, 900);
  state = otherDocCreate.snapshot;
  const otherDocId = otherDocCreate.result.id;
  const otherBlockCreate = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
    payload: { documentId: otherDocId, blockType: 'conversation', title: 'Other Card' }
  }, 910);
  state = otherBlockCreate.snapshot;
  const otherSegCreate = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: { blockId: otherBlockCreate.result.id, text: 'Stay untouched.', meaning: 'Tetap utuh.', speaker: 'Other' }
  }, 920);
  state = otherSegCreate.snapshot;
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: otherSegCreate.result.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-LibbyNeural', language: 'en-GB', filename: 'other.mp3', mimeType: 'audio/mpeg' }
  }, 930).snapshot;

  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: state,
    package: v1,
    fileName: 'P12_Conversation_Only_Additional_Test_v1.json',
    now: 1000
  });
  state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);

  // Add local-only speaker "Jordan" (no externalKey).
  const registryMetaWithJordan = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: doc.metadata,
    documentId: docId,
    label: 'Jordan'
  });
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: registryMetaWithJordan }
  }, 1100).snapshot;
  const jordanSpeaker = getTextStructuredSpeakerRegistry(state.documents.find(item => item.id === docId)).find(item => item.label === 'Jordan');
  assert.ok(jordanSpeaker, 'Local-only speaker Jordan should exist before update');
  assert.equal(Boolean(jordanSpeaker.externalKey), false);

  // Add local-only Segment inside existing external Card "planning".
  const planningCard = state.blocks.find(item => item.documentId === docId && ext(item)?.cardKey === 'planning');
  assert.ok(planningCard);
  const ameliaSpeaker = getTextStructuredSpeakerRegistry(state.documents.find(item => item.id === docId)).find(item => item.externalKey === 'amelia');
  const localSegInExternalCardCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: planningCard.id,
      text: 'One extra reminder before we start.',
      meaning: 'Satu pengingat tambahan sebelum kita mulai.',
      speaker: jordanSpeaker.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: jordanSpeaker.id }
    }
  }, 1200);
  state = localSegInExternalCardCmd.snapshot;
  const localSegInPlanningId = localSegInExternalCardCmd.result.id;

  // Add local-only Card with two local-only Segments and an audio variant.
  const localCardCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
    payload: { documentId: docId, blockType: 'conversation', title: 'Local Wrap-Up' }
  }, 1300);
  state = localCardCmd.snapshot;
  const localCardId = localCardCmd.result.id;

  const localCardSeg1Cmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: localCardId,
      text: 'How did everyone feel today?',
      meaning: 'Bagaimana perasaan semua hari ini?',
      speaker: jordanSpeaker.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: jordanSpeaker.id }
    }
  }, 1310);
  state = localCardSeg1Cmd.snapshot;
  const localCardSeg2Cmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: localCardId,
      text: 'I feel ready for tomorrow.',
      meaning: 'Aku merasa siap untuk besok.',
      speaker: ameliaSpeaker.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: ameliaSpeaker.id }
    }
  }, 1320);
  state = localCardSeg2Cmd.snapshot;

  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: localCardSeg1Cmd.result.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-RyanNeural', language: 'en-GB', filename: 'local-seg.mp3', mimeType: 'audio/mpeg' }
  }, 1330).snapshot;

  const plan01 = bySegKey(state, docId).get('plan-01');
  const plan04 = bySegKey(state, docId).get('plan-04');
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: plan01.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-SoniaNeural', language: 'en-GB', filename: 'plan01.mp3', mimeType: 'audio/mpeg' }
  }, 1340).snapshot;
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: plan04.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-RyanNeural', language: 'en-GB', filename: 'plan04.mp3', mimeType: 'audio/mpeg' }
  }, 1350).snapshot;

  const inspection = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: v2,
    existingImport: initial.importRecord
  });
  assert.equal(inspection.status, 'decision-required');

  const updated = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: v2,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    fileName: 'P12A_Reimport_Preserve_And_Rename_v2.json',
    now: 2000
  });

  const nextDoc = updated.snapshot.documents.find(item => item.id === docId);
  const nextRegistry = getTextStructuredSpeakerRegistry(nextDoc);

  // 1. Local-only Speaker survives with same ID and UID and no externalKey.
  const keptJordan = nextRegistry.find(item => item.id === jordanSpeaker.id);
  assert.ok(keptJordan, 'Local-only speaker Jordan must be preserved after external update');
  assert.equal(keptJordan.uid, jordanSpeaker.uid);
  assert.equal(keptJordan.label, 'Jordan');
  assert.equal(Boolean(keptJordan.externalKey), false);

  // 2. Local-only Card and its child Segments & audio variant survive with exact IDs/UIDs.
  const keptLocalCard = updated.snapshot.blocks.find(item => item.id === localCardId);
  assert.ok(keptLocalCard, 'Local-only card must be preserved after external update');
  assert.equal(keptLocalCard.documentId, docId);
  assert.equal(keptLocalCard.title, 'Local Wrap-Up');

  const keptLocalCardSegs = updated.snapshot.segments.filter(item => item.blockId === localCardId).sort((a, b) => a.order - b.order);
  assert.equal(keptLocalCardSegs.length, 2);
  assert.equal(keptLocalCardSegs[0].id, localCardSeg1Cmd.result.id);
  assert.equal(keptLocalCardSegs[1].id, localCardSeg2Cmd.result.id);
  const keptLocalAudio = updated.snapshot.audioVariants.find(item => item.segmentId === localCardSeg1Cmd.result.id);
  assert.ok(keptLocalAudio, 'Audio variant of local-only segment must be preserved');
  assert.equal(Boolean(keptLocalAudio.metadata?.contentInvalidatedV1), false);

  // 3. Local-only Segment inside existing external Card "planning" survives with same blockId/id/speakerIdentityV1.
  const keptPlanExtra = updated.snapshot.segments.find(item => item.id === localSegInPlanningId);
  assert.ok(keptPlanExtra, 'Local-only segment inside external card must be preserved');
  assert.equal(keptPlanExtra.blockId, planningCard.id);
  assert.equal(keptPlanExtra.speaker, 'Jordan');
  assert.equal(keptPlanExtra.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], jordanSpeaker.id);

  // 4. External update on plan-04 took effect while audio on unrelated segment stayed valid.
  const nextPlan04 = bySegKey(updated.snapshot, docId).get('plan-04');
  assert.equal(nextPlan04.id, plan04.id);
  assert.equal(nextPlan04.text, 'I need to review five new words before we start.');
  const plan04Audio = updated.snapshot.audioVariants.find(item => item.segmentId === plan04.id);
  assert.ok(plan04Audio?.metadata?.contentInvalidatedV1, 'Updated external segment plan-04 audio should be invalidated');
  const plan01Audio = updated.snapshot.audioVariants.find(item => item.segmentId === plan01.id);
  assert.equal(Boolean(plan01Audio?.metadata?.contentInvalidatedV1), false, 'Unchanged external segment plan-01 audio must stay valid');

  // 5. Unrelated workspace stayed 100% untouched.
  const afterOtherSeg = updated.snapshot.segments.find(item => item.id === otherSegCreate.result.id);
  assert.ok(afterOtherSeg);
  assert.equal(afterOtherSeg.text, 'Stay untouched.');
  assert.ok(updated.snapshot.audioVariants.find(item => item.segmentId === afterOtherSeg.id));

  // 6. Stats stay truthful: no false deletions recorded when only local additions exist, UID diagnostics remain valid.
  assert.equal(updated.stats.deleted, 0);
  assert.ok(updated.stats.preservedLocal >= 3);
  assert.equal(collectTextGlobalUidDiagnostics(updated.snapshot).valid, true);
});

allPassed &= run('A1-ext01-external-deletion-vs-local-child-protection', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const initial = planProLingoTextExternalInitialImport({ localSnapshot: emptySnapshot(), package: v1, now: 1000 });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;

  // Add a local-only segment inside card "clarifying", while leaving card "closing" completely unmodified.
  const clarifyingCard = state.blocks.find(item => item.documentId === docId && ext(item)?.cardKey === 'clarifying');
  const farahSpeaker = getTextStructuredSpeakerRegistry(state.documents.find(item => item.id === docId)).find(item => item.externalKey === 'farah');
  const localInClarifying = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: clarifyingCard.id,
      text: 'Local note attached to clarifying card.',
      meaning: 'Catatan lokal di kartu clarifying.',
      speaker: farahSpeaker.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: farahSpeaker.id }
    }
  }, 1100);
  state = localInClarifying.snapshot;

  // Incoming removes BOTH "closing" (unmodified) AND "clarifying" (has a local-only child segment).
  const incomingTrimmed = structuredClone(v1);
  incomingTrimmed.workspace.cards = incomingTrimmed.workspace.cards.filter(card => card.cardKey === 'planning');

  const updated = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: incomingTrimmed,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });

  // Unmodified external card "closing" and its segments are removed.
  assert.equal(updated.snapshot.blocks.some(item => ext(item)?.cardKey === 'closing'), false);
  assert.equal(updated.snapshot.segments.some(item => ext(item)?.segmentKey === 'close-01'), false);

  // Local-only segment inside deleted external card "clarifying" survives safely without orphan error.
  const keptChild = updated.snapshot.segments.find(item => item.id === localInClarifying.result.id);
  assert.ok(keptChild, 'Local-only child segment must survive even if its parent external card was removed externally');
  const keptParent = updated.snapshot.blocks.find(item => item.id === clarifyingCard.id);
  assert.ok(keptParent, 'Parent block holding preserved local-only child segment must remain valid and detached from deleted external source');
  assert.equal(ext(keptParent), null);
  assert.equal(updated.snapshot.segments.some(item => ext(item)?.segmentKey === 'clarify-01'), false);
  assert.equal(updated.snapshot.segments.some(item => item.text === 'What does the word confident mean?'), false);
  assert.equal(collectTextGlobalUidDiagnostics(updated.snapshot).valid, true);
});

allPassed &= run('A1-ext01-legacy-local-entry-preserved', () => {
  const legacyV1 = {
    packageType: PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
    packageVersion: 1,
    externalSourceKey: 'p12a-legacy-preserve-test',
    source: { sourceKind: 'manual-notes', title: 'Legacy v1' },
    workspace: {
      workspaceKey: 'main',
      title: 'Legacy Doc',
      workspaceType: 'legacy',
      textLanguage: 'en-GB',
      meaningLanguage: 'id',
      entries: [
        { entryKey: 'entry-01', order: 1, text: 'First external line.' },
        { entryKey: 'entry-02', order: 2, text: 'Second external line.' }
      ]
    }
  };
  const initial = planProLingoTextExternalInitialImport({ localSnapshot: emptySnapshot(), package: legacyV1, now: 1000 });
  const docId = initial.importRecord.documentId;
  const legacyBlock = initial.snapshot.blocks.find(item => item.documentId === docId);

  // Simulate user-added local-only legacy segment (no externalEntityV1).
  const snapshotWithLocal = normalizeTextLibraryRuntimeSnapshot({
    ...initial.snapshot,
    counters: { ...initial.snapshot.counters, segment: initial.snapshot.counters.segment + 1 },
    segments: [
      ...initial.snapshot.segments,
      {
        id: `SEGMENT_${String(initial.snapshot.counters.segment + 1).padStart(6, '0')}`,
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId: docId,
        blockId: legacyBlock.id,
        order: 3,
        text: 'User-added local legacy line.',
        meaning: '',
        speaker: null,
        joinAfter: 'line',
        createdAt: 1100,
        updatedAt: 1100,
        metadata: {}
      }
    ]
  });

  const legacyV2 = structuredClone(legacyV1);
  legacyV2.workspace.entries[1].text = 'Second external line updated.';
  const updated = planTextExternalUpdateExisting({
    localSnapshot: snapshotWithLocal,
    package: legacyV2,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });
  assert.ok(updated.snapshot.segments.some(item => item.documentId === docId && item.text === 'User-added local legacy line.'));
  assert.ok(updated.snapshot.segments.some(item => item.documentId === docId && item.text === 'Second external line updated.'));
});

// Stage A2 (EXT-02): Speaker reassignment fingerprinting and conflict detection.
allPassed &= run('A2-ext02-speaker-reassignment-conflict-keep-local-and-use-incoming', () => {
  const basePkg = loadFixture('P12A_Speaker_Conflict_Base_v1.json');
  const incomingPkg = loadFixture('P12A_Speaker_Conflict_Incoming_v2.json');

  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: basePkg,
    fileName: 'P12A_Speaker_Conflict_Base_v1.json',
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);
  const registry = getTextStructuredSpeakerRegistry(doc);
  const amelia = registry.find(item => item.externalKey === 'amelia');
  const farah = registry.find(item => item.externalKey === 'farah');
  const plan02 = bySegKey(state, docId).get('plan-02');
  assert.ok(amelia && farah && plan02);
  assert.equal(plan02.speaker, 'Ben');

  // Attach an audio variant on plan-02 to check conflict audio behavior too.
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: plan02.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-SoniaNeural', language: 'en-GB', filename: 'plan02.mp3', mimeType: 'audio/mpeg' }
  }, 1050).snapshot;

  // User reassigns plan-02 speaker locally from Ben -> Amelia (just like TextStructuredEditor SegmentEditor).
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: plan02.id,
      speaker: amelia.label,
      metadata: {
        ...plan02.metadata,
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: amelia.id
      }
    }
  }, 1100).snapshot;

  const inspection = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord
  });
  assert.equal(inspection.status, 'decision-required');
  assert.equal(inspection.summary.conflicts, 1, 'Local Ben->Amelia vs incoming Ben->Farah on plan-02 must surface 1 conflict');
  assert.ok(
    inspection.conflicts.some(c => c.kind === 'segments' && c.key === 'plan-02' && c.classification === 'conflict'),
    'Conflicts list must contain plan-02 segment speaker conflict'
  );

  // keep-local preserves Amelia and keeps local audio valid.
  const keepLocal = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });
  const keepLocalPlan02 = bySegKey(keepLocal.snapshot, docId).get('plan-02');
  assert.equal(keepLocalPlan02.speaker, 'Amelia');
  assert.equal(keepLocalPlan02.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], amelia.id);
  assert.ok(keepLocal.conflicts.some(c => c.kind === 'segments' && c.key === 'plan-02'));
  const keepLocalAudio = keepLocal.snapshot.audioVariants.find(v => v.segmentId === plan02.id);
  assert.equal(Boolean(keepLocalAudio?.metadata?.contentInvalidatedV1), false);

  // use-incoming applies Farah, updates speakerIdentityV1 & externalEntityV1.speakerKey, and invalidates stale audio.
  const useIncoming = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord,
    conflictPolicy: 'use-incoming',
    now: 2100
  });
  const incomingPlan02 = bySegKey(useIncoming.snapshot, docId).get('plan-02');
  assert.equal(incomingPlan02.speaker, 'Farah');
  assert.equal(incomingPlan02.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], farah.id);
  assert.equal(ext(incomingPlan02)?.speakerKey, 'farah');
  const incomingAudio = useIncoming.snapshot.audioVariants.find(v => v.segmentId === plan02.id);
  assert.ok(incomingAudio?.metadata?.contentInvalidatedV1, 'Switching speaker under use-incoming should invalidate stale plan-02 audio');
});

allPassed &= run('A2-ext02-reassignment-to-local-only-speaker-detected', () => {
  const basePkg = loadFixture('P12A_Speaker_Conflict_Base_v1.json');
  const incomingPkg = loadFixture('P12A_Speaker_Conflict_Incoming_v2.json');

  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: basePkg,
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);

  const metaWithJordan = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: doc.metadata,
    documentId: docId,
    label: 'Jordan'
  });
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: metaWithJordan }
  }, 1050).snapshot;
  const jordan = getTextStructuredSpeakerRegistry(state.documents.find(item => item.id === docId)).find(item => item.label === 'Jordan');
  const plan02 = bySegKey(state, docId).get('plan-02');

  // Reassign plan-02 to local-only speaker Jordan (no externalKey).
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: plan02.id,
      speaker: jordan.label,
      metadata: {
        ...plan02.metadata,
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: jordan.id
      }
    }
  }, 1100).snapshot;

  // Against an incoming package that only updates plan-04 (leaving plan-02 as ben), plan-02 must be classified localOnly (NOT overwritten).
  const onlyPlan04Changed = structuredClone(basePkg);
  onlyPlan04Changed.workspace.cards[0].segments[3].text = 'I need to review six new words.';
  const nonConflictInspect = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: onlyPlan04Changed,
    existingImport: initial.importRecord
  });
  assert.equal(nonConflictInspect.summary.conflicts, 0);
  assert.ok(nonConflictInspect.summary.localOnly >= 1, 'Local reassignment to local-only speaker Jordan must register as localOnly change');

  // Against incomingPkg (changing plan-02 ben -> farah), conflict must trigger and keep-local must keep Jordan + use-incoming must switch to Farah.
  const conflictInspect = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord
  });
  assert.equal(conflictInspect.summary.conflicts, 1);
  assert.ok(conflictInspect.conflicts.some(c => c.kind === 'segments' && c.key === 'plan-02'));

  const keepJordan = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });
  assert.equal(bySegKey(keepJordan.snapshot, docId).get('plan-02').speaker, 'Jordan');
  assert.equal(bySegKey(keepJordan.snapshot, docId).get('plan-02').metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], jordan.id);

  const takeFarah = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: incomingPkg,
    existingImport: initial.importRecord,
    conflictPolicy: 'use-incoming',
    now: 2100
  });
  assert.equal(bySegKey(takeFarah.snapshot, docId).get('plan-02').speaker, 'Farah');
});

// Stage A3 (EXT-03): External speaker display-name rename synchronizes retained and local Segments.
allPassed &= run('A3-ext03-external-speaker-rename-syncs-retained-segments', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const v2 = loadFixture('P12A_Reimport_Preserve_And_Rename_v2.json');

  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: v1,
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const amelia = getTextStructuredSpeakerRegistry(state.documents.find(item => item.id === docId)).find(item => item.externalKey === 'amelia');
  assert.ok(amelia);
  assert.equal(amelia.label, 'Amelia');

  // Attach TTS audio on plan-01 (unchanged text/meaning, speaker Amelia).
  const plan01 = bySegKey(state, docId).get('plan-01');
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: { segmentId: plan01.id, channel: 'text', engine: 'edge', source: 'cloud', voiceId: 'en-GB-SoniaNeural', language: 'en-GB', filename: 'plan01.mp3', mimeType: 'audio/mpeg' }
  }, 1050).snapshot;

  // Locally edit text of clarify-02 (still spoken by Amelia) so clarify-02 takes local branch during reconcile.
  const clarify02 = bySegKey(state, docId).get('clarify-02');
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: clarify02.id,
      text: 'Locally edited explanation about feeling sure.',
      meaning: 'Penjelasan yang diubah secara lokal.',
      speaker: amelia.label,
      metadata: { ...clarify02.metadata, [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: amelia.id }
    }
  }, 1060).snapshot;

  // Add a local-only Card + local-only Segment both referencing amelia.id.
  const planningCard = state.blocks.find(b => b.documentId === docId && ext(b)?.cardKey === 'planning');
  const localSegExtCardCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: planningCard.id,
      text: 'Local segment by Amelia inside planning card.',
      meaning: 'Segmen lokal Amelia.',
      speaker: amelia.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: amelia.id }
    }
  }, 1070);
  state = localSegExtCardCmd.snapshot;

  const localCardCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
    payload: { documentId: docId, blockType: 'conversation', title: 'Local Extra Card' }
  }, 1080);
  state = localCardCmd.snapshot;
  const localSegOwnCardCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: localCardCmd.result.id,
      text: 'Local card line spoken by Amelia.',
      meaning: 'Baris kartu lokal Amelia.',
      speaker: amelia.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: amelia.id }
    }
  }, 1090);
  state = localSegOwnCardCmd.snapshot;

  const inspection = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: v2,
    existingImport: initial.importRecord
  });
  assert.equal(inspection.status, 'decision-required');
  assert.equal(inspection.summary.conflicts, 0);

  const updated = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: v2,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });

  const nextRegistry = getTextStructuredSpeakerRegistry(updated.snapshot.documents.find(item => item.id === docId));
  const nextAmelia = nextRegistry.find(item => item.id === amelia.id);
  assert.ok(nextAmelia);
  assert.equal(nextAmelia.label, 'Amy');
  assert.equal(nextAmelia.uid, amelia.uid);

  const segMap = bySegKey(updated.snapshot, docId);
  for (const key of ['plan-01', 'plan-03', 'clarify-02', 'clarify-05', 'close-03']) {
    const seg = segMap.get(key);
    assert.equal(seg.speaker, 'Amy', `Retained external segment ${key} must sync speaker name to Amy`);
    assert.equal(seg.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], amelia.id);
  }
  assert.equal(segMap.get('clarify-02').text, 'Locally edited explanation about feeling sure.');
  assert.equal(updated.snapshot.segments.find(s => s.id === localSegExtCardCmd.result.id)?.speaker, 'Amy');
  assert.equal(updated.snapshot.segments.find(s => s.id === localSegOwnCardCmd.result.id)?.speaker, 'Amy');
  assert.equal(segMap.get('plan-02').speaker, 'Ben');
  assert.equal(segMap.get('clarify-01').speaker, 'Farah');

  // Renaming speaker display label should not needlessly invalidate audio of unchanged text segments.
  const plan01Audio = updated.snapshot.audioVariants.find(v => v.segmentId === plan01.id);
  assert.equal(Boolean(plan01Audio?.metadata?.contentInvalidatedV1), false);
});

allPassed &= run('A3-ext03-local-speaker-rename-conflict-respects-policy', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const v2 = loadFixture('P12A_Reimport_Preserve_And_Rename_v2.json');
  const v2WithPlan01Edit = structuredClone(v2);
  v2WithPlan01Edit.workspace.cards[0].segments[0].text = 'Good morning! Are you ready for our practice today?';

  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: v1,
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);
  const amelia = getTextStructuredSpeakerRegistry(doc).find(item => item.externalKey === 'amelia');

  // Local rename Amelia -> Mei (registry + segments).
  const renamedMeta = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: doc.metadata,
    documentId: docId,
    speakerId: amelia.id,
    label: 'Mei'
  });
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: renamedMeta }
  }, 1050).snapshot;
  for (const seg of state.segments.filter(s => s.documentId === docId && s.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY] === amelia.id)) {
    state = applyTextLibraryCommand(state, {
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
      payload: { id: seg.id, speaker: 'Mei', metadata: seg.metadata }
    }, 1060).snapshot;
  }

  const inspection = inspectTextExternalReconciliation({
    localSnapshot: state,
    package: v2WithPlan01Edit,
    existingImport: initial.importRecord
  });
  assert.equal(inspection.summary.conflicts, 1);
  assert.ok(inspection.conflicts.some(c => c.kind === 'speakers' && c.key === 'amelia'));

  // keep-local preserves 'Mei' across registry and both unchanged & incoming-updated segments.
  const keepLocal = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: v2WithPlan01Edit,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2000
  });
  const keepLocalAmelia = getTextStructuredSpeakerRegistry(keepLocal.snapshot.documents.find(d => d.id === docId)).find(s => s.id === amelia.id);
  assert.equal(keepLocalAmelia.label, 'Mei');
  assert.equal(bySegKey(keepLocal.snapshot, docId).get('plan-01').speaker, 'Mei');
  assert.equal(bySegKey(keepLocal.snapshot, docId).get('plan-01').text, 'Good morning! Are you ready for our practice today?');
  assert.equal(bySegKey(keepLocal.snapshot, docId).get('plan-03').speaker, 'Mei');

  // use-incoming takes 'Amy' and synchronizes all retained segments pointing to amelia.id.
  const useIncoming = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: v2WithPlan01Edit,
    existingImport: initial.importRecord,
    conflictPolicy: 'use-incoming',
    now: 2100
  });
  const useIncomingAmelia = getTextStructuredSpeakerRegistry(useIncoming.snapshot.documents.find(d => d.id === docId)).find(s => s.id === amelia.id);
  assert.equal(useIncomingAmelia.label, 'Amy');
  for (const key of ['plan-01', 'plan-03', 'clarify-02', 'clarify-05', 'close-03']) {
    assert.equal(bySegKey(useIncoming.snapshot, docId).get(key).speaker, 'Amy');
  }
});

// Stage A4: Edge-case guards (up-to-date skip, import-as-copy, missing workspace, speaker removal vs local detach).
allPassed &= run('A4-ext-up-to-date-copy-and-missing-workspace', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: v1,
    now: 1000
  });

  const upToDate = inspectTextExternalReconciliation({
    localSnapshot: initial.snapshot,
    package: structuredClone(v1),
    existingImport: initial.importRecord
  });
  assert.equal(upToDate.status, 'up-to-date');
  assert.equal(upToDate.summary.conflicts, 0);

  // Import-as-copy creates independent workspace + UIDs without disturbing original doc.
  const copyPackage = {
    ...structuredClone(v1),
    externalSourceKey: `${v1.externalSourceKey}.copy.qa1`
  };
  const copied = planProLingoTextExternalInitialImport({
    localSnapshot: initial.snapshot,
    package: copyPackage,
    existingImports: [initial.importRecord],
    now: 1500
  });
  assert.notEqual(copied.importRecord.documentId, initial.importRecord.documentId);
  assert.equal(copied.snapshot.documents.length, 2);
  assert.equal(collectTextGlobalUidDiagnostics(copied.snapshot).valid, true);

  // Missing local workspace is safely flagged before attempting update.
  const withoutOriginalDoc = applyTextLibraryCommand(copied.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.DELETE_DOCUMENT,
    payload: { id: initial.importRecord.documentId }
  }, 1600).snapshot;
  const missingLocal = inspectTextExternalReconciliation({
    localSnapshot: withoutOriginalDoc,
    package: v1,
    existingImport: initial.importRecord
  });
  assert.equal(missingLocal.status, 'missing-local-workspace');
});

allPassed &= run('A4-ext-removed-speaker-detach-and-clean-removal', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: v1,
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);
  const farah = getTextStructuredSpeakerRegistry(doc).find(s => s.externalKey === 'farah');

  // Incoming deletes Farah cleanly (unmodified locally).
  const withoutFarahPkg = structuredClone(v1);
  withoutFarahPkg.workspace.speakers = withoutFarahPkg.workspace.speakers.filter(s => s.speakerKey !== 'farah');
  withoutFarahPkg.workspace.cards = withoutFarahPkg.workspace.cards.map(card => ({
    ...card,
    segments: card.segments.map(seg => seg.speakerKey === 'farah' ? { ...seg, speakerKey: 'ben' } : seg)
  }));
  for (const policy of ['keep-local', 'use-incoming']) {
    const cleanRemoved = planTextExternalUpdateExisting({
      localSnapshot: state,
      package: withoutFarahPkg,
      existingImport: initial.importRecord,
      conflictPolicy: policy,
      now: policy === 'keep-local' ? 2000 : 2050
    });
    const regAfterCleanRemove = getTextStructuredSpeakerRegistry(cleanRemoved.snapshot.documents.find(d => d.id === docId));
    assert.equal(regAfterCleanRemove.some(s => s.id === farah.id), false, `(${policy}) Genuinely unreferenced removed speaker must still delete`);
  }

  // If Farah was locally renamed before incoming removed her, keep-local detaches her (no externalKey) so she survives subsequent updates too.
  const metaRenamedFarah = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: doc.metadata,
    documentId: docId,
    speakerId: farah.id,
    label: 'Farah K.'
  });
  state = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: metaRenamedFarah }
  }, 1100).snapshot;

  const detachedPlan = planTextExternalUpdateExisting({
    localSnapshot: state,
    package: withoutFarahPkg,
    existingImport: initial.importRecord,
    conflictPolicy: 'keep-local',
    now: 2100
  });
  const regAfterDetach = getTextStructuredSpeakerRegistry(detachedPlan.snapshot.documents.find(d => d.id === docId));
  const detachedFarah = regAfterDetach.find(s => s.id === farah.id);
  assert.ok(detachedFarah, 'Locally modified removed external speaker must detach and survive');
  assert.equal(detachedFarah.label, 'Farah K.');
  assert.equal(Boolean(detachedFarah.externalKey), false);

  // Subsequent external update must preserve the detached speaker as local-only.
  const followUpPkg = structuredClone(withoutFarahPkg);
  followUpPkg.workspace.cards[0].segments[0].text = 'Good morning everyone!';
  const followUpPlan = planTextExternalUpdateExisting({
    localSnapshot: detachedPlan.snapshot,
    package: followUpPkg,
    existingImport: detachedPlan.importRecord,
    conflictPolicy: 'keep-local',
    now: 2200
  });
  const regAfterFollowUp = getTextStructuredSpeakerRegistry(followUpPlan.snapshot.documents.find(d => d.id === docId));
  assert.ok(regAfterFollowUp.some(s => s.id === farah.id && s.label === 'Farah K.'));
});

allPassed &= run('A4-ext-removed-speaker-referenced-by-local-segment-preserved', () => {
  const v1 = loadFixture('P12_Conversation_Only_Additional_Test_v1.json');
  const initial = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: v1,
    now: 1000
  });
  let state = initial.snapshot;
  const docId = initial.importRecord.documentId;
  const doc = state.documents.find(item => item.id === docId);
  const farah = getTextStructuredSpeakerRegistry(doc).find(s => s.externalKey === 'farah');
  const planningCard = state.blocks.find(b => b.documentId === docId && ext(b)?.cardKey === 'planning');
  assert.ok(farah && planningCard);

  // Add one local-only Segment inside external Card "planning" assigned to Farah via speakerIdentityV1 (do NOT rename Farah).
  const localFarahSegCmd = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      blockId: planningCard.id,
      text: 'Quick follow-up question from Farah.',
      meaning: 'Pertanyaan lanjutan singkat dari Farah.',
      speaker: farah.label,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: farah.id }
    }
  }, 1100);
  state = localFarahSegCmd.snapshot;
  const localSegId = localFarahSegCmd.result.id;

  // Incoming removes Farah from workspace.speakers and reassigns every source-owned Farah segment to Ben, retaining planning.
  const withoutFarahPkg = structuredClone(v1);
  withoutFarahPkg.workspace.speakers = withoutFarahPkg.workspace.speakers.filter(s => s.speakerKey !== 'farah');
  withoutFarahPkg.workspace.cards = withoutFarahPkg.workspace.cards.map(card => ({
    ...card,
    segments: card.segments.map(seg => seg.speakerKey === 'farah' ? { ...seg, speakerKey: 'ben' } : seg)
  }));

  for (const policy of ['keep-local', 'use-incoming']) {
    const updated = planTextExternalUpdateExisting({
      localSnapshot: state,
      package: withoutFarahPkg,
      existingImport: initial.importRecord,
      conflictPolicy: policy,
      now: policy === 'keep-local' ? 2000 : 2100
    });

    const keptLocalSeg = updated.snapshot.segments.find(s => s.id === localSegId);
    assert.ok(keptLocalSeg, `(${policy}) Local-only Segment referencing Farah must survive`);
    assert.equal(keptLocalSeg.blockId, planningCard.id);
    assert.equal(keptLocalSeg.speaker, 'Farah');
    assert.equal(keptLocalSeg.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], farah.id);

    const nextRegistry = getTextStructuredSpeakerRegistry(updated.snapshot.documents.find(d => d.id === docId));
    const keptFarah = nextRegistry.find(s => s.id === farah.id);
    assert.ok(keptFarah, `(${policy}) Speaker registry entry referenced by surviving local Segment must survive`);
    assert.equal(keptFarah.uid, farah.uid);
    assert.equal(keptFarah.label, 'Farah');
    assert.equal(Boolean(keptFarah.externalKey), false);
    assert.equal(Object.hasOwn(keptFarah, 'externalKey'), false);
    assert.equal(updated.stats.deleted, 0);

    // Incoming external Farah segments moved cleanly to Ben.
    for (const segKey of ['clarify-01', 'clarify-04', 'close-02']) {
      assert.equal(bySegKey(updated.snapshot, docId).get(segKey)?.speaker, 'Ben');
    }

    // Subsequent external update continues preserving both local segment and detached Farah speaker.
    const followUpPkg = structuredClone(withoutFarahPkg);
    followUpPkg.workspace.cards[0].segments[3].text = 'I need to review six new words.';
    const followUp = planTextExternalUpdateExisting({
      localSnapshot: updated.snapshot,
      package: followUpPkg,
      existingImport: updated.importRecord,
      conflictPolicy: policy,
      now: 2500
    });
    const regAfterFollowUp = getTextStructuredSpeakerRegistry(followUp.snapshot.documents.find(d => d.id === docId));
    assert.ok(regAfterFollowUp.some(s => s.id === farah.id && s.label === 'Farah' && !s.externalKey));
    assert.equal(followUp.snapshot.segments.find(s => s.id === localSegId)?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY], farah.id);
  }
});

if (!allPassed) {
  console.error('P12-A reconciliation audit FAILED');
  process.exit(1);
}
console.log('PASS P12-A external reconciliation audit');
