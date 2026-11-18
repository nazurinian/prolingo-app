# R2 v1 → v2 migration dry-run

**GO for the isolated Beta v2 environment. CONDITIONAL GO for migration readiness; NO-GO for automatic/in-place canonical activation.**

The dry-run uses separate named disposable source and destination databases. One consistent v1 snapshot + all metaRecords is read; existing global UID and Content Unit backfills produce a detached plan; createOnly atomically writes a fresh v2 destination; a separate readonly transaction verifies its fingerprint. The v1 source is never upgraded or written. Canonical names are rejected before access.

The dormant existing runDisposableContentUnitMigration upgrades schema before its record transaction. A record abort cannot roll that separate schema upgrade back. This is why this gate validates copy-to-new-database migration rather than claiming safe in-place canonical rollback. Production needs a separately authorized database-switch/recovery design and representative user-supplied backup testing.

Verified:

- Root/Collection/Workspace and global Card order, retained Card/Segment IDs/UIDs, EN/ID/joinAfter and existing audio/RF/Full/source metadata.
- Persistent Paragraph Sections and native one-Sentence Turns for v1 Conversation records. V1 has no authoritative authored multi-Sentence Turn grouping; migration does not infer one from labels or punctuation.
- Existing valid UIDs retained, missing UIDs allocated by existing backfill; duplicate/invalid UIDs reject instead of silent repair. Content Unit counter and persistent parents validate.
- Nonempty Text Pack attachment and External registry metadata, unknown metadata and legacyMigration retained.
- Legacy Workspace records/Segments retained, zero Legacy Content Units created.
- Native postmigration Mixed authoring succeeds.
- Backup-before and backup-after independently recover to matching fingerprints, with no audio binary inclusion.
- Repeated copy cannot overwrite; source=target and canonical sources reject; interrupted destination write leaves source intact and its before-backup recoverable. Failed fresh destinations are protected partial QA databases, requiring a new destination or explicit confirmed cleanup.

Node identity/immutability/idempotency/invalid-input regression PASS. Real Edge **5/5 PASS**, zero canonical touches and no remaining disposable test DBs. Scoped ESLint PASS. Tests:

    node scripts/audit-v603-p15-r2-migration.mjs
    node scripts/audit-v603-p15-a2-persistence-browser.mjs --r2

APIs: src/domain/text/textV2MigrationCopyDomain.js (pure plan), src/services/persistence/textV2MigrationCopyService.js (guarded QA-copy execution). No source-sync apply, physical audio cleanup, startup migration or real-data copying.

Optional representative-data workflow: the user may explicitly export JSON using the existing app's backup action, select that file in the isolated Beta verification workflow, and explicitly create a fresh QA copy. The original database is not read or changed by the Beta. Missing binaries remain unavailable; JSON metadata is not an audio archive. No real canonical export/copy was performed in this gate.
