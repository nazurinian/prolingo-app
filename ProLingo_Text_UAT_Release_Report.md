# Text v2 UAT release preparation

**UAT-2 is prepared for Preview on the existing `prolingo-app` project.**

Active release **6.0.3-beta.9-uat.2**. See the [deployment guide](ProLingo_Text_UAT_Online_Deployment_Guide.md) for the verified branch-domain assignment and release steps.

## UAT-2 verification on 24 November 2026

The remote UAT branch was at the accepted `787711ddbd53b8920953411bff753d9c0e7b6b08`. The clean local worktree already contained its descendant `a74c095f0eac268b12874e38bd7c509141972d2e` with the branch's `vercel.json` overrides and the `prolingo-app` Preview guard. UAT-2 retains that commit, synchronizes package, lockfile, app and build metadata, and updates the deployment guide.

The build log for `dpl_6Dz5rdRCM9QaSyjm5nkJPmTiQUcY` shows `npm run build` and `vite build`. Vercel readback confirmed the existing `text-uat.prolingo.web.id` domain is verified and assigned to `test/text-v2-uat`. Both environment values matched exactly under Preview for that branch: `VITE_ENABLE_TEXT_UAT=true` and `TEXT_UAT_PROJECT=prolingo-app`.

| Check | Result |
| --- | --- |
| Normal build with the valid UAT Preview variables present | PASS, `dist` excludes UAT |
| UAT build using the verified Preview values and expected system variables | PASS, `dist-uat` |
| Actual builds with flag disabled, wrong branch, old project marker or Production target | All rejected |
| Release audit | PASS for metadata, normal and UAT artifact isolation, distinct PWA identity, unchanged API rewrite, and DB/schema constants at 1 |
| Existing API modules | Health GET response path returns 200, TTS GET returns 405 without synthesis |
| Edge browser | 8/8, reload and browser restart, six DEV/production route checks and five built-artifact route checks |
| Canonical storage and narrow viewports | Zero canonical accesses in isolated flows, no horizontal overflow at 320px and 375px |
| Scoped ESLint and Git whitespace checks | PASS |

The deployable source is ready for a new Git Preview after review. Online acceptance still requires checking the new build log, deployed SHA, branch-domain route and API responses. Existing online Edge TTS and device acceptance limits still apply. This checkpoint was prepared locally using read-only Vercel checks.

## UAT-1 and original release evidence

Version: **6.0.3-beta.9-uat.1**. Display: **ProLingo Text v2 UAT**. Channel: **Isolated Beta Testing**.
Branch: **test/text-v2-uat**, created from exact clean accepted 8166ac68daa2adea693a99fdf551cf8e1e64149f in the existing integration worktree. The release checkpoint containing this report is pinned by the exact SHA in delivery; built public metadata displays the checked-out commit (or Vercel's public Git SHA).

## Changes

- Dedicated text-uat mode / build:uat command, explicit enable flag and Vercel branch/project marker checks. Local builds also require the dedicated branch.
- Only the persistent text-beta entry is enabled in UAT artifacts; unsupported queries/root use a safe landing page instead of mounting App. Normal production mode ignores the flag and excludes QA.
- Package/lock root version and active app information updated; historical changelog/contracts/test expectations preserved.
- Generated UAT-only manifest/title, independent application id/start URL and PNG icons. Stable manifest unchanged.
- Whitelisted public version/label/channel/commit/time information in the UAT page. No entire environment object is serialized; an unused VITE secret canary is absent from client output.
- Existing App.jsx, canonical lifecycle, database/schema constants, API functions, audio engine, Legacy/Table/AI Voice remain unchanged. The later Preview update changes only build/output in this branch's vercel.json, preserving the API rewrite.

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

Use the companion **ProLingo_Text_UAT_Online_Deployment_Guide.md** for current settings and the UAT checklist. Target **existing project prolingo-app**, **Preview branch test/text-v2-uat**, output **dist-uat**. The target **text-uat.prolingo.web.id → that Preview branch** remains deferred. No new project is needed. The Preview update only adds the two UAT variables scoped to this branch; existing Stable/Beta configuration and domains stay unchanged.

The flag/project marker is not authentication. Hosting protection, custom-domain HTTPS, deployed API behavior and actual Edge TTS upstream synthesis remain unverified until user deployment. Existing Node API routing was preserved; local Browser TTS/ZIP pathways are independently usable. No server secret is required for public build identity; no new client secret was added.

Canonical DB/schema remain **1**. No canonical open/import/upgrade/write is introduced by the UAT entry. Persistence is isolated QA v2 within the current origin/profile; JSON has no binaries; transient ZIP bindings and unsaved drafts do not survive restart. Actual desktop/mobile visual/auditory acceptance and hosting authentication still require human verification.

All prior branches/backups and the AI Voice worktree are preserved. Final checkpoint is local only; no push, deployment, stable merge, physical audio deletion or canonical v2 activation.

## Interrupted-session recovery

Recovered clean checkpoint **7b08aced5e17888c5d170396b81f22fd4fcabd66**, whose parent is the accepted 8166ac68daa2adea693a99fdf551cf8e1e64149f. All release implementation, documentation and prior focused IndexedDB results were intact; no branch or feature was recreated.

Rebuilt normal and UAT artifacts from the recovered checkpoint and verified the public commit SHA, build guards, API method guards, artifact exclusion, secret canary exclusion and scoped ESLint. The browser rerun exposed a harness-only readiness race: immediately after navigation, document.body can still be null. Both readiness predicates now wait safely for body creation using their existing bounded animation-frame polling. Assertions and production source are unchanged.

Two consecutive corrected browser runs each pass **8/8**, reload/new-process persistence, six DEV/production route checks, five actual build route checks, zero canonical access and 320/375px overflow checks. Resume evidence uses uat-resume-* logs in the same temporary evidence directory above. A local follow-up checkpoint contains this small harness correction and recovery documentation; its exact final SHA is supplied at delivery. Hosting authentication, DNS, upstream Edge TTS and human/device acceptance remain outstanding deployment prerequisites.
