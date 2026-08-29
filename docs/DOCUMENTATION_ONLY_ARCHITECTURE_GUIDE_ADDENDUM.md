# Documentation-Only Architecture Guide Addendum

**Runtime baseline:** Phase 3G.2 FINAL MODULARIZATION FREEZE  
**Change type:** documentation only  
**Runtime source modification:** NONE

This documented edition adds:

1. `START_HERE_PROLINGO_ARCHITECTURE_GUIDE.md` — human-readable architecture and maintenance guide.
2. `PROLINGO_SOURCE_MODULE_INDEX.csv` — searchable/filterable index for every file under `src/`.
3. `DOCUMENTATION_ONLY_ARCHITECTURE_GUIDE_ADDENDUM.md` — this note.

The guide maps all 89 files under `src/` and includes:

- quick routing: “if you want to change X, open Y”;
- ACTIVE / QUARANTINED / UNUSED status;
- layer and risk level;
- responsibility of every file;
- key exported functions/components;
- when the file should be edited;
- cautions/invariants;
- state/ref ownership;
- localStorage/settings ownership;
- playback/audio/dataset/persistence/navigation system flows.

No file under `src/` was edited for this documentation edition. The runtime remains the Phase 3G.2 final modularization freeze.
