import { listTextAudioStagingMetadata, releaseTextAudioStagingRecords } from './textAudioStagingService.js';

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

export const planTextAudioStagingGarbage = ({ snapshot, records = [] } = {}) => {
  const referenced = collectReferencedTextAudioRenderFingerprints(snapshot);
  const active = (records || []).filter(row => row?.hasBlob);
  const rfRecords = [];
  const legacyRecords = [];
  const orphanRecords = [];
  const referencedRecords = [];

  active.forEach(record => {
    const value = rf(record?.metadata?.renderFingerprint || record?.mapKey);
    if (!value.startsWith('rf-sha256-')) {
      legacyRecords.push(record);
      return;
    }
    rfRecords.push(record);
    if (referenced.has(value)) referencedRecords.push(record);
    else orphanRecords.push(record);
  });

  const sumBytes = records => records.reduce((sum, record) => sum + Number(record?.size || 0), 0);
  return {
    referencedFingerprints: referenced,
    activeCount: active.length,
    rfCount: rfRecords.length,
    referencedCount: referencedRecords.length,
    orphanCount: orphanRecords.length,
    legacyCount: legacyRecords.length,
    orphanBytes: sumBytes(orphanRecords),
    legacyBytes: sumBytes(legacyRecords),
    referencedRecords,
    orphanRecords,
    legacyRecords
  };
};

export const auditTextAudioStagingGarbage = async snapshot => {
  const rows = await listTextAudioStagingMetadata({ includeReleased: false });
  return planTextAudioStagingGarbage({ snapshot, records: rows });
};

export const executeTextAudioStagingGarbageCollection = async (snapshot, { reason = 'text-rf-gc' } = {}) => {
  const audit = await auditTextAudioStagingGarbage(snapshot);
  const released = audit.orphanRecords.length
    ? await releaseTextAudioStagingRecords(audit.orphanRecords, reason)
    : 0;
  return { ...audit, released };
};
