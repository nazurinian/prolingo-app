import { buildTextStructuredFullRepresentation, getTextStructuredFullAudioArtifacts } from '../../domain/text/textStructuredSplitFullDomain.js';
import { listTextAudioStagingMetadata, releaseTextAudioStagingRecords, resolveTextAudioStagingPhysicalIdentity } from './textAudioStagingService.js';

const clean = value => String(value ?? '').trim();
const rf = value => clean(value).toLowerCase();

export const collectReferencedTextAudioRenderFingerprints = snapshot => {
  const referenced = new Set();
  (Array.isArray(snapshot?.audioVariants) ? snapshot.audioVariants : []).forEach(variant => {
    if (variant?.metadata?.contentInvalidatedV1) return;
    const value = rf(variant?.metadata?.audioRenderFingerprintV1);
    if (value.startsWith('rf-sha256-')) referenced.add(value);
  });
  return referenced;
};

export const collectReferencedTextFullArtifactFingerprints = snapshot => {
  const referenced = new Set();
  const segmentsByBlock = new Map();
  (Array.isArray(snapshot?.segments) ? snapshot.segments : []).forEach(segment => {
    const blockId = String(segment?.blockId || '').toUpperCase();
    if (!blockId) return;
    const list = segmentsByBlock.get(blockId) || [];
    list.push(segment);
    segmentsByBlock.set(blockId, list);
  });
  (Array.isArray(snapshot?.blocks) ? snapshot.blocks : []).forEach(block => {
    const blockTree = { ...block, segments: segmentsByBlock.get(String(block?.id || '').toUpperCase()) || [] };
    getTextStructuredFullAudioArtifacts(block).forEach(artifact => {
      const value = rf(artifact?.fullArtifactFingerprint);
      const channel = artifact?.descriptor?.channel === 'meaning' ? 'meaning' : 'text';
      const current = buildTextStructuredFullRepresentation({ block: blockTree, channel });
      if (value.startsWith('full-sha256-') && current.contentFingerprint === artifact?.descriptor?.contentFingerprint) referenced.add(value);
    });
  });
  return referenced;
};

export const collectReferencedTextAudioPhysicalIdentities = snapshot => new Set([
  ...collectReferencedTextAudioRenderFingerprints(snapshot),
  ...collectReferencedTextFullArtifactFingerprints(snapshot)
]);

export const planTextAudioStagingGarbage = ({ snapshot, records = [] } = {}) => {
  const referenced = collectReferencedTextAudioPhysicalIdentities(snapshot);
  const active = (records || []).filter(row => row?.hasBlob);
  const splitRecords = [];
  const fullRecords = [];
  const legacyRecords = [];
  const orphanRecords = [];
  const referencedRecords = [];

  active.forEach(record => {
    const physical = resolveTextAudioStagingPhysicalIdentity(record);
    if (!physical.identity || physical.representation === 'legacy') {
      legacyRecords.push(record);
      return;
    }
    if (physical.representation === 'full') fullRecords.push(record);
    else splitRecords.push(record);
    if (referenced.has(physical.identity)) referencedRecords.push(record);
    else orphanRecords.push(record);
  });

  const sumBytes = rows => rows.reduce((sum, record) => sum + Number(record?.size || 0), 0);
  return {
    referencedFingerprints: referenced,
    activeCount: active.length,
    rfCount: splitRecords.length,
    fullCount: fullRecords.length,
    referencedCount: referencedRecords.length,
    orphanCount: orphanRecords.length,
    legacyCount: legacyRecords.length,
    orphanBytes: sumBytes(orphanRecords),
    legacyBytes: sumBytes(legacyRecords),
    referencedRecords,
    orphanRecords,
    legacyRecords,
    splitRecords,
    fullRecords
  };
};

export const auditTextAudioStagingGarbage = async snapshot => {
  const rows = await listTextAudioStagingMetadata({ includeReleased: false });
  return planTextAudioStagingGarbage({ snapshot, records: rows });
};

export const executeTextAudioStagingGarbageCollection = async (snapshot, { reason = 'text-physical-gc' } = {}) => {
  const audit = await auditTextAudioStagingGarbage(snapshot);
  const released = audit.orphanRecords.length
    ? await releaseTextAudioStagingRecords(audit.orphanRecords, reason)
    : 0;
  return { ...audit, released };
};
