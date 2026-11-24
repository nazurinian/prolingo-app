# ProLingo Text v2 UAT — online deployment guide

Release **6.0.3-beta.9-uat.2**, channel **Isolated Beta Testing**, branch **test/text-v2-uat**. The accepted UAT-1 checkpoint is `787711ddbd53b8920953411bff753d9c0e7b6b08`. Use `git rev-parse HEAD` to pin the release checkpoint before pushing and compare its SHA with the deployed UAT information.

## Existing Vercel project, isolated Preview branch

Use the **existing `prolingo-app`** project in team **`hikamseifs-projects`**, connected to `nazurinian/prolingo-app`. Project ID `prj_FvB4rMUWZZ9aAsqEfHsiedjKXW4E`. The project serves several domains. The verified **`text-uat.prolingo.web.id`** domain follows Preview deployments from **`test/text-v2-uat`**. The build and output overrides come from that branch's committed `vercel.json` for each deployment.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | Repository root |
| Install | npm ci |
| Build command | npm run build:uat, from this branch's vercel.json only |
| Output directory | dist-uat, from this branch's vercel.json only |
| Node | Existing 24.x, unchanged (locally verified 24.11.1) |
| Deployment environment / Git branch | Preview / test/text-v2-uat |
| Public build flag | VITE_ENABLE_TEXT_UAT=true; Preview, Git branch test/text-v2-uat only |
| Server/build-only project marker | TEXT_UAT_PROJECT=prolingo-app; Preview, Git branch test/text-v2-uat only |
| Required system variables | VERCEL=1, VERCEL_ENV=preview, VERCEL_GIT_COMMIT_REF=test/text-v2-uat |

Both UAT variable values and their Preview-only branch scope were verified through Vercel on 24 November 2026. Leave those values scoped to that branch. [Vercel environment variables](https://vercel.com/docs/environment-variables#preview-environment-variables)

A UAT build fails on the wrong branch, absent flag, incorrect project marker, or non-Preview Vercel environment. The branch's `vercel.json` overrides build/output for that deployment without changing dashboard defaults; see [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json). Keep this UAT configuration on `test/text-v2-uat`; do not merge/cherry-pick it into Stable/Beta. Normal `npm run build` remains `vite build` / `dist`. The marker and flag are deployment configuration checks, **not authentication**. Required Git/system variables must be exposed by the existing project; do not replace them with manually hardcoded branch values. See [system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Hosting protection and online access acceptance remain a separate release decision. This preparation does not change authentication or project-wide protection settings. Do not add auth secrets as VITE_* variables. See [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) for available controls.

Deployment `dpl_6Dz5rdRCM9QaSyjm5nkJPmTiQUcY` was built from the earlier `787711dd` checkpoint. Its log shows `npm run build` and the standard `dist` output. The corrected release needs a new Git Preview deployment from the reviewed commit so Vercel reads the corrected branch configuration.

For a later authorized release, review the checkpoint in this worktree:

```powershell
git switch test/text-v2-uat
git status --short
git rev-parse HEAD
```

After review, push the UAT branch to trigger a new Git Preview deployment.

```powershell
git push -u origin test/text-v2-uat
```

In Vercel, verify the new deployment's commit SHA and Preview branch. Its build log should show `npm run build:uat`, `vite build --mode text-uat`, and `dist-uat` output. Once Ready, load `https://text-uat.prolingo.web.id/?qa=text-beta` and confirm the UAT version and SHA. Rebuilding the old commit would reuse its old build configuration.

## Build and local preview

PowerShell:

    $env:VITE_ENABLE_TEXT_UAT = 'true'
    npm ci
    npm run build:uat
    npx vite preview --outDir dist-uat --host 127.0.0.1

Build on the dedicated branch. Vercel builds additionally require the Preview/branch/project checks above. Public metadata includes version, short commit and UTC build timestamp only; no secret is needed for display.

Normal npm run build still produces dist with QA excluded, even if VITE_ENABLE_TEXT_UAT=true. UAT mode without the explicit flag fails. The UAT branch's release command is selected by its vercel.json; leave the existing project's dashboard build settings unchanged.

## Routes, PWA and API

- Online entry after the corrected Preview deployment is Ready: **https://text-uat.prolingo.web.id/?qa=text-beta**.
- Root / shows a safe UAT landing page and explicit entry link; it never starts the canonical App lifecycle.
- Other QA queries in a UAT build show the same landing page; old development QA modules are not exposed.
- Normal production builds cannot enable UAT via a query string.
- UAT document title: ProLingo Text v2 UAT; manifest /manifest-text-uat.json; application id /text-v2-uat; start_url /?qa=text-beta; distinct Text UAT 192/512 PNG icons.
- Stable public/manifest.json identity/start URL remain unchanged. No offline service worker/cache is added. Installability and host-auth behavior on a real mobile PWA still need manual acceptance.
- vercel.json changes only buildCommand and outputDirectory. The existing /api/(.*) → /api/$1 rewrite and /api/* functions remain unchanged. No catch-all SPA rewrite was added; query-based root navigation needs none.

## DNS and origins

Vercel reports **`text-uat.prolingo.web.id` verified** and assigned to **`test/text-v2-uat`** in **`prolingo-app`**. Use the existing DNS record and branch assignment. Verify HTTPS and the deployed build after the new Preview is Ready.

IndexedDB belongs to an origin/profile/device. Generated Preview URLs and the custom domain have separate QA storage. Export JSON before changing origins and use the explicit fresh-copy recovery workflow to move QA records.

## Audio online

Browser TTS uses Web Speech on the device, after an explicit Play gesture; voice availability, language and pause/resume behavior vary by browser/OS. Test desktop and Android audibly over HTTPS; headless/injected providers do not certify actual device voices.

Existing api/tts.js invokes server/edgeTtsService.js and msedge-tts in a Node function. It does not require the local Express process for a Vercel request. Vite's localhost:3001 proxy is development/preview-only; it is not an online backend. Preserve API routing and the existing Node dependencies. /api/health returning 200 proves routing only, **not** upstream TTS connectivity.

After deployment, separately verify POST /api/tts with a short test utterance, expected Content-Type audio/mpeg, nonempty decodable audio, latency and error response. Microsoft upstream connectivity, outbound network access and Vercel execution/resource limits are **not verified online**. The isolated Beta adds no Edge generation UI; Browser TTS and selected local ZIP playback remain independently testable. Existing /api/gemini-* functions are preserved, not newly configured or certified.

ZIP binding uses the existing RF matcher against existing QA metadata; files stay session-only. JSON backup does not contain audio binaries. No global Staging, canonical audio store, physical deletion or generation side effect is added.

## UAT checklist and rollback

1. Confirm the authorized Preview project/branch, branch-scoped variables, and intended access policy. Open / and ?qa=text-beta; verify version/channel/SHA/time, isolated QA v2, unchanged canonical v1 and Not Stable notice.
2. Opt in and initialize a fresh named QA DB; test empty-library authoring and optional demo across Paragraph/Conversation/Mixed, both readers, editor, EN/ID and Split/Full.
3. Save edits, reload, restart browser, reconnect. Test conflict recovery in two tabs; keep drafts and inspect committed outcomes before retrying.
4. Export JSON, validate the file, recover into a new QA name. Reject malformed files/existing destinations; reselect ZIP binaries after restart.
5. Test touch, zoom, portrait/landscape, PWA install/start URL, real voices and audio fallback on actual devices. Human/device acceptance remains pending.
6. Verify old QA routes unavailable, /api/health is JSON rather than HTML, and normal production/beta sites remain unchanged.

If a future UAT release needs rollback, act only on that UAT Preview deployment and its branch-domain assignment after review. Do not roll back/promote the existing project's Production deployment, reset source branches, or clear browser databases automatically. Export QA data first. Removing a deployment/domain does not migrate or erase local QA data.
