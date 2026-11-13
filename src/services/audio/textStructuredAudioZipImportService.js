import {
  buildTextStructuredAudioContentFingerprint,
  getTextStructuredAudioVariantKey
} from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredAudioRequirementsForSnapshot } from '../../domain/text/textStructuredAudioRequirementDomain.js';
import {
  readTextStructuredAudioZipRuntimeBlob,
  scanTextStructuredAudioZipFiles
} from './textStructuredAudioZipArchiveService.js';
import {
  getTextAudioStagingSnapshot,
  getTextFullAudioStagingSnapshot,
  putTextAudioStagingBlob,
  putTextFullAudioStagingBlob,
  rollbackTextAudioStagingBatch
} from '../persistence/textAudioStagingService.js';
import {
  executeTextAudioImportRollback,
  executeTextZipImportMetadataCommit
} from '../persistence/textLibraryCommandService.js';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const upper = value => clean(value).toUpperCase();

const assertNotAborted = signal => {
  if (signal?.aborted) {
    const error = new Error('Portable ZIP import was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};

const buildZipImportRecoverySummary = ({
  aborted = false,
  metadataCommitAttempted = false,
  stagingWriteAttempted = false,
  metadataRollback = null,
  metadataRollbackError = null,
  stagingRollback = null,
  stagingRollbackError = null
} = {}) => {
  const metaStatus = metadataRollback || (metadataCommitAttempted ? 'pending' : 'not-needed');
  const stageStatus = stagingRollback || (stagingWriteAttempted ? 'pending' : 'not-needed');
  const cleanRollback = metaStatus !== 'failed' && stageStatus !== 'failed';
  return {
    aborted: Boolean(aborted),
    metadataCommitAttempted: Boolean(metadataCommitAttempted),
    stagingWriteAttempted: Boolean(stagingWriteAttempted),
    metadataRollback: metaStatus,
    metadataRollbackError: metadataRollbackError || null,
    stagingRollback: stageStatus,
    stagingRollbackError: stagingRollbackError || null,
    cleanRollback,
    residualRisk: !cleanRollback
  };
};

const attachZipImportRecovery = (error, recovery) => {
  const normalized = error instanceof Error ? error : new Error(String(error || 'Portable ZIP import failed.'));
  try {
    normalized.zipImportRecovery = recovery;
  } catch {
    const wrapped = new Error(normalized.message);
    wrapped.name = normalized.name;
    wrapped.cause = normalized;
    wrapped.zipImportRecovery = recovery;
    return wrapped;
  }
  return normalized;
};

/** Merge committed Split AudioVariants and Full Block Artifacts into a caller snapshot without waiting for UI render commit. */
export const mergeTextLibraryZipMetadataCommitIntoSnapshot = (snapshot, metadataCommit) => {
  if (!snapshot) return snapshot;
  const hasVariants = Array.isArray(metadataCommit?.audioVariants) && metadataCommit.audioVariants.length > 0;
  const hasBlocks = Array.isArray(metadataCommit?.blocks) && metadataCommit.blocks.length > 0;
  if (!hasVariants && !hasBlocks) return snapshot;

  let nextVariants = snapshot.audioVariants || [];
  let nextCounters = snapshot.counters;
  let nextBlocks = snapshot.blocks || [];
  if (hasVariants) {
    const variantUpdates = new Map(metadataCommit.audioVariants.map(record => [record.id, record]));
    const seen = new Set(nextVariants.map(record => record.id));
    nextVariants = nextVariants.map(record => variantUpdates.get(record.id) || record);
    metadataCommit.audioVariants.forEach(record => {
      if (!seen.has(record.id)) nextVariants.push(record);
    });
    if (metadataCommit.counters) nextCounters = metadataCommit.counters;
  }
  if (hasBlocks) {
    const blockUpdates = new Map(metadataCommit.blocks.map(block => [block.id, block]));
    nextBlocks = nextBlocks.map(block => blockUpdates.get(block.id) || block);
  }
  return { ...snapshot, counters: nextCounters, audioVariants: nextVariants, blocks: nextBlocks };
};

/**
 * Serialize Portable ZIP imports and coordinate workspace/mode cancellation so concurrent
 * imports never interleave Staging IDB or Text Library IDB mutations/rollbacks.
 */
export const createTextStructuredAudioZipImportCoordinator = () => {
  let tail = Promise.resolve();
  let activeTask = null;
  let epoch = 0;

  const cancelActive = (reason = 'Portable ZIP import cancelled due to workspace or mode change.') => {
    epoch += 1;
    if (activeTask) {
      activeTask.cancelled = true;
      try { activeTask.controller.abort(new Error(reason)); } catch { /* noop */ }
    }
    return epoch;
  };

  const runExclusive = ({ getContextVersion = null, run } = {}) => {
    const startEpoch = epoch;
    const startContext = typeof getContextVersion === 'function' ? getContextVersion() : null;
    const execute = async () => {
      if (epoch !== startEpoch || (typeof getContextVersion === 'function' && getContextVersion() !== startContext)) {
        const error = new Error('Portable ZIP import cancelled before start.');
        error.name = 'AbortError';
        throw attachZipImportRecovery(error, buildZipImportRecoverySummary({ aborted: true }));
      }
      const controller = new AbortController();
      const task = { controller, cancelled: false };
      activeTask = task;
      try {
        return await run({
          signal: controller.signal,
          isStaleContext: () => task.cancelled
            || controller.signal.aborted
            || epoch !== startEpoch
            || (typeof getContextVersion === 'function' && getContextVersion() !== startContext)
        });
      } finally {
        if (activeTask === task) activeTask = null;
      }
    };
    const next = tail.then(execute, execute);
    tail = next.catch(() => {});
    return next;
  };

  return {
    runExclusive,
    cancelActive,
    isActive: () => Boolean(activeTask),
    getEpoch: () => epoch
  };
};

const buildRequirementKey = requirement => (
  requirement?.segmentId && requirement?.channel && requirement?.renderFingerprint
    ? `${upper(requirement.segmentId)}|${lower(requirement.channel)}|${lower(requirement.renderFingerprint)}`
    : null
);

const buildVariantPayloadFromRequirement = ({ requirement, filename = null, mimeType = null, deliveryStatus = 'zip-imported-staging-ready' }) => ({
  segmentId: requirement.segmentId,
  channel: requirement.channel,
  source: 'generated',
  engine: requirement.engine || 'edge',
  voiceId: requirement.voiceId,
  language: requirement.language || (requirement.channel === 'meaning' ? 'id' : 'en'),
  filename,
  mimeType,
  metadata: {
    generatedBy: 'TEXT_RF_RECONNECT_V2',
    generatedAt: null,
    engineVoiceId: requirement.voiceId,
    downloadProfileVoiceId: requirement.voiceId,
    playbackProfileVoiceId: null,
    assignmentSource: requirement.voiceSource || 'rf-reconnect',
    contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: requirement.channel, content: requirement.content }),
    contentFingerprintV2: requirement.contentFingerprintV2 || null,
    audioRenderFingerprintV1: requirement.renderFingerprint,
    audioRenderDescriptorV1: requirement.renderDescriptor || null,
    profileMatched: true,
    externalRfReconnected: true,
    reusedPhysicalRender: true,
    deliveryStatus
  }
});

/**
 * Import Portable Text Audio ZIP files across Audio Staging IDB and Text Library IDB
 * using extract-and-validate first, staging writes second, atomic single-TX metadata
 * commit third, and full compensating rollback on any error or abort.
 */
export const executeTextStructuredAudioZipImport = async ({
  files,
  snapshot,
  preferences,
  signal = null,
  readZipEntryBlob = readTextStructuredAudioZipRuntimeBlob,
  scanZipFiles = scanTextStructuredAudioZipFiles,
  getSplitStagingSnapshot = getTextAudioStagingSnapshot,
  getFullStagingSnapshot = getTextFullAudioStagingSnapshot,
  putSplitStaging = putTextAudioStagingBlob,
  putFullStaging = putTextFullAudioStagingBlob,
  rollbackStaging = rollbackTextAudioStagingBatch,
  commitMetadata = executeTextZipImportMetadataCommit,
  rollbackMetadata = executeTextAudioImportRollback
} = {}) => {
  const selected = Array.from(files || []).filter(file => /\.zip$/i.test(file?.name || '') || String(file?.type || '').includes('zip'));
  if (!selected.length) return { status: 'no-files' };
  assertNotAborted(signal);

  const requirements = buildTextStructuredAudioRequirementsForSnapshot({ snapshot, preferences });
  const scan = await scanZipFiles({
    files: selected,
    audioVariants: snapshot?.audioVariants || [],
    segments: snapshot?.segments || [],
    requirements,
    blocks: snapshot?.blocks || [],
    documents: snapshot?.documents || []
  });
  assertNotAborted(signal);

  const segmentsById = new Map((snapshot?.segments || []).map(item => [upper(item?.id), item]));
  const plannedMatches = [];
  const seenLogicalKeys = new Set();
  const missingByReqKey = new Map();

  for (const match of (scan.matches || [])) {
    const rf = lower(match.renderFingerprint || match.variant?.metadata?.audioRenderFingerprintV1 || match.requirement?.renderFingerprint);
    if (!rf) continue;
    const reqKey = buildRequirementKey(match.requirement);
    if (match.variant) {
      const logicalKey = `var:${upper(match.variant.id)}|${rf}`;
      if (seenLogicalKeys.has(logicalKey)) continue;
      seenLogicalKeys.add(logicalKey);
      plannedMatches.push({ ...match, rf, reqKey });
    } else if (match.requirement && reqKey) {
      if (!missingByReqKey.has(reqKey)) {
        missingByReqKey.set(reqKey, {
          requirement: match.requirement,
          filename: match.filename || null,
          mimeType: match.mimeType || null
        });
      }
      const logicalKey = `req:${reqKey}`;
      if (seenLogicalKeys.has(logicalKey)) continue;
      seenLogicalKeys.add(logicalKey);
      plannedMatches.push({ ...match, rf, reqKey });
    }
  }

  const splitGroups = new Map();
  plannedMatches.forEach(match => {
    const list = splitGroups.get(match.rf) || [];
    list.push(match);
    splitGroups.set(match.rf, list);
  });

  const uniqueFullLogical = new Map();
  (scan.fullMatches || []).forEach(match => {
    const fingerprint = lower(match.fullArtifactFingerprint);
    if (!fingerprint || !match.block?.id) return;
    const key = `${upper(match.block.id)}|${fingerprint}`;
    if (!uniqueFullLogical.has(key)) uniqueFullLogical.set(key, match);
  });
  const fullLogical = [...uniqueFullLogical.values()];
  const fullGroups = new Map();
  fullLogical.forEach(match => {
    const fingerprint = lower(match.fullArtifactFingerprint);
    const list = fullGroups.get(fingerprint) || [];
    list.push(match);
    fullGroups.set(fingerprint, list);
  });

  // Phase 1: Decompress and validate every unique physical audio entry BEFORE any DB write.
  const preparedSplitEntries = [];
  for (const [rf, group] of splitGroups.entries()) {
    assertNotAborted(signal);
    const first = group[0];
    const blob = await readZipEntryBlob({
      archiveFile: first.archiveFile,
      entry: first.entry,
      filename: first.filename,
      mimeType: first.mimeType
    });
    if (!blob || !Number(blob.size)) {
      throw new Error(`ZIP audio entry is empty or unreadable: ${first.filename || rf}`);
    }
    preparedSplitEntries.push({ rf, group, first, blob });
  }

  const preparedFullEntries = [];
  for (const [fingerprint, group] of fullGroups.entries()) {
    assertNotAborted(signal);
    const first = group[0];
    const blob = await readZipEntryBlob({
      archiveFile: first.archiveFile,
      entry: first.entry,
      filename: first.filename,
      mimeType: first.mimeType
    });
    if (!blob || !Number(blob.size)) {
      throw new Error(`ZIP Full audio entry is empty or unreadable: ${first.filename || fingerprint}`);
    }
    preparedFullEntries.push({ fingerprint, group, first, blob });
  }

  // Phase 2 & Phase 3: Stage blobs first (with pre-existing snapshot preservation),
  // then atomically commit Text Library metadata; roll back cleanly on any failure.
  const createdStagingIds = [];
  const overwrittenStagingSnapshots = new Map();
  const stagedSplitByRf = new Map();
  const stagedFullByFingerprint = new Map();
  const stagedSplitRecords = [];
  const stagedFullRecords = [];
  let metadataCommit = null;

  try {
    for (const { rf, first, blob } of preparedSplitEntries) {
      assertNotAborted(signal);
      const variant = first.variant;
      const req = first.requirement;
      const segmentId = variant?.segmentId || req?.segmentId;
      const segment = segmentsById.get(upper(segmentId)) || null;
      const channel = variant?.channel || req?.channel || 'text';
      const engine = variant?.engine || req?.engine || 'edge';
      const voiceId = variant?.voiceId || req?.voiceId || null;
      const documentId = segment?.documentId || null;

      const prior = await getSplitStagingSnapshot({
        audioVariantId: variant?.id || null,
        renderFingerprint: rf,
        documentId,
        engine,
        voiceId
      });
      assertNotAborted(signal);

      const baseMetadata = variant?.metadata || {
        contentFingerprint: req
          ? buildTextStructuredAudioContentFingerprint({ channel, content: req.content })
          : null,
        audioRenderFingerprintV1: rf,
        audioRenderDescriptorV1: req?.renderDescriptor || null
      };

      const stagingRecord = await putSplitStaging({
        audioVariantId: variant?.id || null,
        renderFingerprint: rf,
        documentId,
        segmentId,
        channel,
        engine,
        voiceId,
        filename: first.filename || variant?.filename || null,
        mimeType: blob.type || first.mimeType || variant?.mimeType || null,
        blob,
        metadata: {
          ...baseMetadata,
          deliveryStatus: 'zip-imported-staging-ready',
          importedFromPortableZip: true,
          sourceArchiveName: first.archiveName || null,
          sourceArchiveId: first.archiveId || null
        }
      });
      if (stagingRecord?.id) {
        if (prior?.meta) {
          if (!overwrittenStagingSnapshots.has(stagingRecord.id)) {
            overwrittenStagingSnapshots.set(stagingRecord.id, prior);
          }
        } else if (!createdStagingIds.includes(stagingRecord.id)) {
          createdStagingIds.push(stagingRecord.id);
        }
      }
      stagedSplitByRf.set(rf, stagingRecord);
      stagedSplitRecords.push(stagingRecord);
    }

    for (const { fingerprint, group, first, blob } of preparedFullEntries) {
      assertNotAborted(signal);
      const descriptor = first.artifact?.descriptor || null;
      const documentId = first.block?.documentId || first.document?.id || null;
      const engine = descriptor?.engine || 'edge';
      const voiceId = descriptor?.voiceId || null;

      const prior = await getFullStagingSnapshot({
        fullArtifactFingerprint: fingerprint,
        documentId,
        engine,
        voiceId
      });
      assertNotAborted(signal);

      const stagingRecord = await putFullStaging({
        fullArtifactFingerprint: fingerprint,
        documentId,
        blockId: first.block?.id,
        channel: descriptor?.channel || 'text',
        engine,
        voiceId,
        filename: first.filename || first.artifact?.filename || null,
        mimeType: blob.type || first.mimeType || first.artifact?.mimeType || null,
        blob,
        descriptor,
        metadata: {
          deliveryStatus: 'zip-imported-staging-ready',
          importedFromPortableZip: true,
          sourceArchiveName: first.archiveName || null,
          sourceArchiveId: first.archiveId || null,
          consumerBlockIds: group.map(item => item.block?.id).filter(Boolean)
        }
      });
      if (stagingRecord?.id) {
        if (prior?.meta) {
          if (!overwrittenStagingSnapshots.has(stagingRecord.id)) {
            overwrittenStagingSnapshots.set(stagingRecord.id, prior);
          }
        } else if (!createdStagingIds.includes(stagingRecord.id)) {
          createdStagingIds.push(stagingRecord.id);
        }
      }
      stagedFullByFingerprint.set(fingerprint, stagingRecord);
      stagedFullRecords.push(stagingRecord);
    }

    assertNotAborted(signal);
    const variantPayloads = [...missingByReqKey.values()].map(item => buildVariantPayloadFromRequirement(item));
    const fullPayloads = fullLogical.map(match => ({ blockId: match.block.id, artifact: match.artifact }));

    metadataCommit = await commitMetadata({ variantPayloads, fullPayloads });
    assertNotAborted(signal);

    const committedByIdentity = new Map(
      (metadataCommit?.audioVariants || []).map(record => [getTextStructuredAudioVariantKey(record), record])
    );
    const boundMatches = [];
    const finalizedSlotKeys = new Set();
    for (const match of plannedMatches) {
      let variant = match.variant || null;
      if (!variant && match.requirement) {
        const identityKey = getTextStructuredAudioVariantKey({
          segmentId: match.requirement.segmentId,
          channel: match.requirement.channel,
          engine: match.requirement.engine || 'edge',
          source: 'generated',
          voiceId: match.requirement.voiceId
        });
        variant = committedByIdentity.get(identityKey) || null;
      }
      if (!variant) continue;
      const slotKey = `${upper(variant.id)}|${match.rf}`;
      if (finalizedSlotKeys.has(slotKey)) continue;
      finalizedSlotKeys.add(slotKey);
      boundMatches.push({ ...match, variant, renderFingerprint: match.rf });
    }

    return {
      status: 'added',
      scan,
      boundMatches,
      fullLogical,
      splitGroups,
      fullGroups,
      stagedSplitByRf,
      stagedFullByFingerprint,
      stagedSplitRecords,
      stagedFullRecords,
      createdIds: createdStagingIds,
      previousSnapshots: [...overwrittenStagingSnapshots.values()],
      metadataCommit
    };
  } catch (error) {
    const recovery = buildZipImportRecoverySummary({
      aborted: error?.name === 'AbortError' || Boolean(signal?.aborted),
      metadataCommitAttempted: Boolean(metadataCommit),
      stagingWriteAttempted: Boolean(createdStagingIds.length || overwrittenStagingSnapshots.size)
    });
    if (metadataCommit) {
      try {
        await rollbackMetadata({
          createdVariantIds: metadataCommit.createdVariantIds,
          previousVariants: metadataCommit.previousVariants,
          previousBlocks: metadataCommit.previousBlocks,
          previousCounters: metadataCommit.previousCounters,
          expectedCounters: metadataCommit.counters
        });
        recovery.metadataRollback = 'rolled-back';
      } catch (rollbackMetaErr) {
        recovery.metadataRollback = 'failed';
        recovery.metadataRollbackError = rollbackMetaErr?.message || String(rollbackMetaErr);
        recovery.cleanRollback = false;
        recovery.residualRisk = true;
        console.error('Failed to roll back Text Library ZIP metadata:', rollbackMetaErr);
      }
    }
    if (createdStagingIds.length || overwrittenStagingSnapshots.size) {
      try {
        await rollbackStaging({
          createdIds: createdStagingIds,
          previousSnapshots: [...overwrittenStagingSnapshots.values()]
        });
        recovery.stagingRollback = 'rolled-back';
      } catch (rollbackStageErr) {
        recovery.stagingRollback = 'failed';
        recovery.stagingRollbackError = rollbackStageErr?.message || String(rollbackStageErr);
        recovery.cleanRollback = false;
        recovery.residualRisk = true;
        console.error('Failed to roll back Audio Staging ZIP writes:', rollbackStageErr);
      }
    }
    throw attachZipImportRecovery(error, recovery);
  }
};

/**
 * Compensating rollback helper for an already-returned import result when a
 * document/mode switch or abort lands after commitMetadata returned.
 */
export const rollbackCompletedTextStructuredAudioZipImport = async (
  imported,
  {
    rollbackStaging = rollbackTextAudioStagingBatch,
    rollbackMetadata = executeTextAudioImportRollback
  } = {}
) => {
  const metadataCommit = imported?.metadataCommit || null;
  const createdIds = Array.isArray(imported?.createdIds) ? imported.createdIds : [];
  const previousSnapshots = Array.isArray(imported?.previousSnapshots) ? imported.previousSnapshots : [];
  const recovery = buildZipImportRecoverySummary({
    aborted: true,
    metadataCommitAttempted: Boolean(metadataCommit),
    stagingWriteAttempted: Boolean(createdIds.length || previousSnapshots.length)
  });
  if (metadataCommit) {
    try {
      await rollbackMetadata({
        createdVariantIds: metadataCommit.createdVariantIds,
        previousVariants: metadataCommit.previousVariants,
        previousBlocks: metadataCommit.previousBlocks,
        previousCounters: metadataCommit.previousCounters,
        expectedCounters: metadataCommit.counters
      });
      recovery.metadataRollback = 'rolled-back';
    } catch (err) {
      recovery.metadataRollback = 'failed';
      recovery.metadataRollbackError = err?.message || String(err);
      recovery.cleanRollback = false;
      recovery.residualRisk = true;
    }
  }
  if (createdIds.length || previousSnapshots.length) {
    try {
      await rollbackStaging({ createdIds, previousSnapshots });
      recovery.stagingRollback = 'rolled-back';
    } catch (err) {
      recovery.stagingRollback = 'failed';
      recovery.stagingRollbackError = err?.message || String(err);
      recovery.cleanRollback = false;
      recovery.residualRisk = true;
    }
  }
  return recovery;
};
