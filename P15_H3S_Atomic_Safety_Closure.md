# H3-S atomic safety closure

Baseline a1a95cd1d5d3050d6bd384ec6c306a8dc80f5ec4; feature/p15-structured-data-management. GO for the next isolated phase.

Ordinary Initialize now passes createOnly:true. Only the connection observing onupgradeneeded oldVersion=0 may initialize; opening any existing database is rejected without upgrading it. All entity/meta stores are counted inside the same readwrite transaction, and staging runs synchronously in its last count callback. A concurrent writer's rows cause abort, never clear. Explicit confirmed overwrite keeps createOnly:false and existing semantics.

The missing-database reader now aborts its initial versionchange instead of committing/deleting a temporary DB; this removes a second creation/deletion race. Schema creators are reused unchanged (the existing v1 schema builder is exported, not duplicated). Canonical guards and version constants stay 1.

Real Edge regression: before 1 PASS / 4 FAIL; after **5/5 PASS**: repeated create, existing empty/partial/incompatible schemas, independent-realm initializer race, writer inserted before count/write, noncreating missing probe and explicit reseed. Zero canonical touches, no remaining disposable test DBs. Original A2 Edge 6/6, H2 8/8, H3 5/5 and scoped ESLint pass. Logs: C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-integrated-18c86330.

Test: node scripts/audit-v603-p15-a2-persistence-browser.mjs --h3-s.
No canonical migration, live data copy, push or deployment.
