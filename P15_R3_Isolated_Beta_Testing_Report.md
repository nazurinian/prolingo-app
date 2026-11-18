# R3 opt-in persistent v2 Beta

**GO for extensive isolated user acceptance testing.** DEV-only route: **?qa=text-beta**. No database is opened until the user opts in and clicks Connect/Initialize. Default QA name: prolingo_text_library_d3b_qa_structured_beta. The selected name is retained in the URL for reconnection after reload; initialization never overwrites an existing database.

Initialize an empty library to author arbitrary Paragraph/Conversation/Mixed Workspaces, or explicitly initialize the three-type demo. The full-page accepted Data Management UI uses one authoritative persistent command session. The Reader subscribes to the same accepted snapshot, outside the editor's command lifecycle. One existing D5 host serves all types and both presentations; hiding the Reader does not unmount that host.

Capabilities:

- Native Collection/Workspace/Card/Section/Turn/Sentence/speaker authoring through the accepted scoped command path, including empty entities and global Mixed Card order.
- Tampilan Lama and Shared UI Beta; Shared Full/Part/Segment and four bilingual layouts; Split/Full, EN/ID channel order, rate, play/pause/resume/stop, Card and Sentence actions.
- Persistent records across page reload and browser restart; conflict reload retains drafts and does not replay a committed command.
- Consistent JSON export; strict raw metadata verification for user-selected JSON; independently read-back-verified recovery into a fresh QA database only. V1 files use the R2 detached conversion plan after explicit confirmation. Original DB/file stays unchanged.
- Optional user-selected portable ZIP binds only existing exact-RF/Full records via the existing archive scanner and D5 Blob runtime. No metadata, canonical folder, global Staging or physical deletion. Binding is memory-only and must be reselected after restart. Decoder failure still falls back through D5; binary presence does not prove successful playback.

Verification:

- Node portable ZIP exact-RF binding / immutable snapshot / no false Full binding PASS.
- Real Edge **7/7 UI cases PASS**, including opt-in/no pre-access, three persisted types and both readers, real Data Management edit reflected in Reader, playback continuity, concurrent-writer conflict/reload, JSON file recovery, and blank-library creation of all three Workspace types.
- Page reload PASS. **A separate new Edge process with the same temporary profile reloaded both original and recovered QA libraries at the expected fingerprints: PASS.**
- Four real DEV/production route gates for text-beta/structured-text PASS, zero opens before opt-in and production exclusion PASS. Zero canonical touches.
- Original A2 Edge 6/6 and R2 5/5 PASS after strict-backup validator reuse; scoped ESLint and production build PASS.

Scripts: audit-v603-p15-r3-beta.mjs and audit-v603-p15-r3-beta-browser.mjs. The test's isolated profile and logs are under C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-integrated-18c86330 (profile paths in browser logs). The early harness incorrectly inspected button.disabled instead of native inherited fieldset :disabled; corrected to assert actual browser disabled state. No product safety assertion was weakened.

Limits: JSON contains no physical audio; this gate adds no TTS generation, WAV assembly, production route, canonical reads/writes or automatic migrations. Stored speaker voice profiles and the existing browser voice resolver are reused; installed voices may differ by device. Existing rate-aware-assembly-required composition restriction remains. Android/real-device UX and actual installed-voice audibility require human acceptance.

Manual entry: run the existing Vite development command (npm run dev -- --host 127.0.0.1), open ?qa=text-beta, opt in, initialize a fresh QA name, and use the Workspace selector / Data Management toggle. Reconnect to the same URL/database after restart. Never use an existing DB as an initialization target; use a new name for recovery. Canonical DB/schema constants remain 1.
