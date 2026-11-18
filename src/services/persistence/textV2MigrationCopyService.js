import { assertDisposableQaDatabaseName } from './textContentUnitPersistenceService.js';
import { readDisposableTextManagementDatabaseState, seedDisposableTextManagementDatabase } from './textDataManagementPersistenceService.js';
import { planTextV2MigrationCopy } from '../../domain/text/textV2MigrationCopyDomain.js';

/** QA-only copy migration. The source is read in one transaction and never upgraded or written. */
export const migrateDisposableTextLibraryCopy = async ({ sourceDbName, targetDbName, now = Date.now(), onBeforeCommit = null }) => {
  const source = assertDisposableQaDatabaseName(sourceDbName), target = assertDisposableQaDatabaseName(targetDbName);
  if (source === target) throw Error('Migration destination must be a separately named disposable database');
  const state = await readDisposableTextManagementDatabaseState({ dbName: source });
  const plan = planTextV2MigrationCopy({ snapshot: state.snapshot, metaRecords: state.metaRecords, now });
  await seedDisposableTextManagementDatabase({ dbName: target, snapshot: plan.snapshot, metaRecords: plan.metaRecords, createOnly: true, onBeforeCommit });
  const committed = await readDisposableTextManagementDatabaseState({ dbName: target });
  if (committed.snapshotFingerprint !== plan.snapshotFingerprint) throw Error('Migration destination verification failed');
  return { plan, committed };
};
