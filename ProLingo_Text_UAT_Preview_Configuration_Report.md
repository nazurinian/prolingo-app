# Text v2 UAT: existing-project Preview configuration

This report records the 18 November configuration checkpoint. See the [online deployment guide](ProLingo_Text_UAT_Online_Deployment_Guide.md) for the UAT-2 release and verified domain assignment.

Prepared on **18 November 2026** from **787711ddbd53b8920953411bff753d9c0e7b6b08**, on **test/text-v2-uat**. The final local commit is supplied in the completion message.

**Result: local build and isolation checks PASS. No push, deployment, new project, or domain change.**

## Deployment target and changes

- Existing Vercel project: **prolingo-app**, ID `prj_FvB4rMUWZZ9aAsqEfHsiedjKXW4E`, team **hikamseifs-projects**.
- Environment: **Preview**, Git branch **test/text-v2-uat**. The project's Production branch and dashboard build/output defaults were not changed.
- This branch's `vercel.json` selects **npm run build:uat** and **dist-uat**. Its existing `/api/(.*)` → `/api/$1` rewrite is preserved exactly. No SPA catch-all, project-level route, or function change was added.
- `TEXT_UAT_PROJECT` now requires **prolingo-app**. A Vercel UAT build also requires **VERCEL_ENV=preview**, **VERCEL_GIT_COMMIT_REF=test/text-v2-uat**, and **VITE_ENABLE_TEXT_UAT=true**. Local UAT still requires the dedicated Git branch and explicit flag. Other Vite modes remain outside UAT.
- The deployment guide now describes this existing-project Preview workflow. Keep this branch-specific Vercel configuration out of Stable/Beta merges.

Vercel documents [deployment-specific build/output overrides](https://vercel.com/docs/project-configuration/vercel-json) and [branch-scoped Preview variables](https://vercel.com/docs/environment-variables#preview-environment-variables).

## Environment variables applied and read back

| Key | Value | Target | Git branch |
| --- | --- | --- | --- |
| VITE_ENABLE_TEXT_UAT | true | Preview only | test/text-v2-uat |
| TEXT_UAT_PROJECT | prolingo-app | Preview only | test/text-v2-uat |

Both records were added directly to the existing project with `target=["preview"]` and `gitBranch="test/text-v2-uat"`, then read back and checked. No UAT variable was added to all Preview branches, Production, or Development. No secrets were read/decrypted or copied.

All **six existing environment records** were compared before/after and remain identical, including their scopes and update timestamps. Returned project settings, domain list, and latest deployment are unchanged; only the project's `updatedAt` advanced after the two environment additions. No project-update, deployment, domain, or DNS mutation was called.

## Verification

Node **24.11.1**, npm **11.6.2**, existing installed dependencies.

| Check | Result |
| --- | --- |
| Normal `npm run build`, simulated Stable (`main` / Production) context | PASS, output dist |
| Normal `npm run build`, simulated Beta (`v6-beta` / Preview) context | PASS, output dist |
| Normal `npm run build`, all UAT flags enabled in valid Preview context | PASS, UAT remains excluded |
| SHA256 of every output file across those three normal builds | Identical |
| Local `npm run build:uat` on the dedicated branch with explicit flag | PASS, output dist-uat |
| `npm run build:uat` with the intended Vercel Preview context | PASS, output dist-uat |
| Actual UAT build: missing flag, main branch, v6-beta branch, old project marker, Production target | All five reject with the expected guard error |
| Release audit: local/Vercel branch, flag, project, Preview guards; API rewrite; artifacts; metadata; manifest; secret canary | PASS |
| API modules: health returns 200; TTS GET returns 405 without upstream synthesis | PASS |
| Syntax checks for both changed scripts; scoped ESLint for Vite config; git diff --check | PASS |
| Edge browser: persistent Beta cases | 8/8 PASS |
| Page reload and new-browser-process persistence | PASS |
| Six DEV/production route checks and five actual built-artifact route checks | PASS |
| Canonical DB accesses in isolated flows | 0 |
| UAT viewport/content widths at 320px and 375px | No horizontal overflow |

These normal builds use the current UAT source in simulated Vercel contexts; Stable/Beta branches were not checked out or modified. Their local/remote-tracking refs were checked against the initial snapshot. Their existing `vercel.json` still contains only the API rewrite, and their normal build command remains `vite build`. Only `test/text-v2-uat` advances for the local commit; no remote ref is pushed.

`src/`, `api/`, `server/`, `package.json`, `package-lock.json`, `vite.config.js`, and the Stable manifest are unchanged from `787711dd`. Existing bundle-size and browser-data-age build notices remain; no dependency upgrade is included.

Local evidence: `C:/Users/HIKAMS~1/AppData/Local/Temp/prolingo-uat-preview-9uX2nj/`. It contains per-build logs (including the five expected rejections), normal-build SHA256 hashes, release and browser audit logs, branch-ref baseline, source-isolation check, and sanitized remote-scope verification. Secret values are excluded.

## Deferred target

**text-uat.prolingo.web.id → prolingo-app → Preview branch test/text-v2-uat** is the intended future assignment. No domain/DNS change, Preview deployment, push, Production promotion, or Stable/Beta deployment was performed. Online API routing/TTS, HTTPS, access-policy acceptance, and real mobile/PWA acceptance remain unverified until a later authorized deployment.
