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
      metadataCommit
    };
  } catch (error) {
    if (metadataCommit) {
      try {
        await rollbackMetadata({
          createdVariantIds: metadataCommit.createdVariantIds,
          previousVariants: metadataCommit.previousVariants,
          previousBlocks: metadataCommit.previousBlocks,
          previousCounters: metadataCommit.previousCounters,
          expectedCounters: metadataCommit.counters
        });
      } catch (rollbackMetaErr) {
        console.error('Failed to roll back Text Library ZIP metadata:', rollbackMetaErr);
      }
    }
    if (createdStagingIds.length || overwrittenStagingSnapshots.size) {
      try {
        await rollbackStaging({
          createdIds: createdStagingIds,
          previousSnapshots: [...overwrittenStagingSnapshots.values()]
        });
      } catch (rollbackStageErr) {
        console.error('Failed to roll back Audio Staging ZIP writes:', rollbackStageErr);
      }
    }
    throw error;
  }
};
