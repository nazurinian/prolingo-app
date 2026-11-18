# Text v2 UAT release preparation

**CONDITIONAL GO for a separately protected online UAT deployment after user review. No deployment performed.**

Version: **6.0.3-beta.9-uat.1**. Display: **ProLingo Text v2 UAT**. Channel: **Isolated Beta Testing**.
Branch: **test/text-v2-uat**, created from exact clean accepted 8166ac68daa2adea693a99fdf551cf8e1e64149f in the existing integration worktree. The release checkpoint containing this report is pinned by the exact SHA in delivery; built public metadata displays the checked-out commit (or Vercel's public Git SHA).

## Changes

- Dedicated text-uat mode / build:uat command, explicit enable flag and Vercel branch/project marker checks. Local builds also require the dedicated branch.
- Only the persistent text-beta entry is enabled in UAT artifacts; unsupported queries/root use a safe landing page instead of mounting App. Normal production mode ignores the flag and excludes QA.
- Package/lock root version and active app information updated; historical changelog/contracts/test expectations preserved.
- Generated UAT-only manifest/title, independent application id/start URL and PNG icons. Stable manifest unchanged.
- Whitelisted public version/label/channel/commit/time information in the UAT page. No entire environment object is serialized; an unused VITE secret canary is absent from client output.
- Existing App.jsx, canonical lifecycle, database/schema constants, vercel.json, API functions, audio engine, Legacy/Table/AI Voice remain unchanged.

## Verification

Verified npm run build and explicitly enabled npm run build:uat. Normal build also tested with the enable flag set: UAT remains excluded. Missing-flag/local-wrong-branch/Vercel-wrong-branch/wrong-project cases reject in build guard tests; correct Vercel context passes.

- scripts/audit-text-uat-release.mjs: build guard, normal/UAT artifact isolation, title/manifest identity, version metadata and unused-secret-canary exclusion PASS.
- scripts/audit-text-uat-browser.mjs: real Edge persistent Beta **8/8**, page reload and new browser process persistence, JSON backup/recovery, both presentations/all three Workspace types, Full/rate/cursor behavior and conflict recovery PASS. DEV/production route gates pass.
- Actual built-artifact gates: UAT text-beta renders public identity with zero pre-opt-in DB access; root, data-management and conversation-editor remain on landing with zero DB access; normal artifact ?qa=text-beta does not activate UAT.
- Focused real IndexedDB regressions: H3-S **5/5**, Reader **7/7**, R2 migration/recovery **5/5** PASS. Scoped ESLint PASS; normal/UAT production builds PASS with existing bundle-size/browser-mapping notices.
- PWA stable manifest equality and distinct UAT manifest id/start URL verified. PNG icons generated at 192/512. Actual mobile installation is pending.
- Actual built UAT entry at 375px and 320px: content width equals viewport, no horizontal overflow. This is headless layout evidence, not Android acceptance.
- Existing Node API modules load: health returns 200 and TTS GET rejects with 405 without upstream synthesis. Online Edge generation remains unverified.

Evidence logs are local under C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-integrated-18c86330 (uat-* files). The first artifact harness waited for a header on the normal App landing screen; corrected its readiness predicate, with route/isolation assertions retained. No product assertion was weakened.

The five historical Node source/hash/version failures were not edited or disguised; this task ran focused impacted suites, not another full historical audit. Active release version changes are intentional.

## Deployment boundary / limitations

Use the companion **ProLingo_Text_UAT_Online_Deployment_Guide.md** for exact Vercel settings, build commands, DNS, authentication and UAT checklist. Target project prolingo-text-uat, source branch test/text-v2-uat, output dist-uat; custom domain text-uat.prolingo.web.id only after user DNS setup. Existing production/beta deployments and domains were not accessed or linked.

The flag/project marker is not authentication. Hosting protection, custom-domain HTTPS, deployed API behavior and actual Edge TTS upstream synthesis remain unverified until user deployment. Existing Node API routing was preserved; local Browser TTS/ZIP pathways are independently usable. No server secret is required for public build identity; no new client secret was added.

Canonical DB/schema remain **1**. No canonical open/import/upgrade/write is introduced by the UAT entry. Persistence is isolated QA v2 within the current origin/profile; JSON has no binaries; transient ZIP bindings and unsaved drafts do not survive restart. Actual desktop/mobile visual/auditory acceptance and hosting authentication still require human verification.

All prior branches/backups and the AI Voice worktree are preserved. Final checkpoint is local only; no push, deployment, stable merge, physical audio deletion or canonical v2 activation.
