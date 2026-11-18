import { validateTextManagementSnapshot, freezeTextManagementView, TextDataManagementError } from './textDataManagementDomain.js';
import { backfillTextGlobalUids, collectTextGlobalUidDiagnostics } from './textGlobalIdentityDomain.js';
import { backfillTextContentUnits } from './textContentUnitDomain.js';
import { exportTextManagementData, inspectTextManagementTransfer } from './textDataManagementTransferDomain.js';
import { canonicalJsonStringify } from './textCanonicalFingerprintDomain.js';

/** Pure migration plan, suitable for an explicitly selected exported backup. No DB access. */
export const planTextV2MigrationCopy = ({ snapshot: candidate, metaRecords, now = Date.now() }) => {
  const source = validateTextManagementSnapshot(candidate);
  if (source.schemaVersion !== 1) throw new TextDataManagementError('UNSUPPORTED_SCHEMA', 'Migration copy expects a complete v1 source');
  const diagnostics = collectTextGlobalUidDiagnostics(source);
  if (Object.values(diagnostics).some(d => d && typeof d === 'object' && (d.invalid || d.duplicate))) {
    throw new TextDataManagementError('INVALID_SNAPSHOT', 'Existing invalid/duplicate UIDs cannot be repaired by migration');
  }
  const backupBefore = exportTextManagementData(source, { kind: 'database-backup', metaRecords, now });
  if (canonicalJsonStringify(inspectTextManagementTransfer({ kind: 'database-backup', data: backupBefore }).snapshot.counters) !== canonicalJsonStringify(source.counters)) {
    throw new TextDataManagementError('INVALID_SNAPSHOT', 'Source counters are below persistent IDs');
  }
  const uidFill = backfillTextGlobalUids(source);
  const migrated = backfillTextContentUnits(uidFill.snapshot, { now });
  const snapshot = validateTextManagementSnapshot(migrated.snapshot);
  const meta = new Map(structuredClone(metaRecords).map(record => [record.key, record]));
  for (const [key, value] of Object.entries({ schemaVersion: 2, idCounters: snapshot.counters, contentUnitMigration: snapshot.contentUnitMigration })) {
    meta.set(key, { key, value, updatedAt: now });
  }
  const nextMeta = [...meta.values()];
  const backupAfter = exportTextManagementData(snapshot, { kind: 'database-backup', metaRecords: nextMeta, now });
  return freezeTextManagementView({ snapshot, metaRecords: nextMeta, backupBefore, backupAfter,
    sourceFingerprint: canonicalJsonStringify(source), snapshotFingerprint: canonicalJsonStringify(snapshot),
    createdUnitCount: migrated.createdUnitCount, uidBackfill: uidFill.counts });
};
