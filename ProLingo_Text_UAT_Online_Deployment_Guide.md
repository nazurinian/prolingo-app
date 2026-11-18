# ProLingo Text v2 UAT — online deployment guide

Release **6.0.3-beta.9-uat.1**, channel **Isolated Beta Testing**, branch **test/text-v2-uat**. Accepted parent: 8166ac68daa2adea693a99fdf551cf8e1e64149f. The release checkpoint is the commit containing this guide; its exact hash is supplied in the completion message and rendered by each UAT build. Use git rev-parse HEAD to pin it before pushing.

## Separate Vercel project

Create a **new** Vercel project named **prolingo-text-uat**, connected to nazurinian/prolingo-app. Do not reuse/link production or v6-beta projects/domains.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | Repository root |
| Install | npm ci |
| Build command | npm run build:uat |
| Output directory | dist-uat |
| Node | 24.x (locally verified 24.11.1; select supported matching runtime in dashboard) |
| Production branch of this separate project | test/text-v2-uat |
| Public build flag | VITE_ENABLE_TEXT_UAT=true |
| Server/build-only project marker | TEXT_UAT_PROJECT=prolingo-text-uat |
| System environment exposure | Enable; VERCEL_GIT_COMMIT_REF must equal test/text-v2-uat |

Scope these variables only to the new project/environments intended for UAT. A UAT build fails on the wrong Vercel branch, absent flag or incorrect project marker. Other projects keep npm run build / dist. The marker and flag are deployment configuration checks, **not authentication**. Vercel's Git and environment behavior is documented in [Git deployments](https://vercel.com/docs/git) and [system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Vercel documents Node 24 availability for builds/functions in its [Node 24 release notice](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions). No package-wide engine policy or existing project's runtime setting was changed.

Before exposing any deployment, configure **Deployment Protection** (Vercel Authentication or another plan-supported access policy) for all relevant deployment URLs and the custom domain. Confirm unauthorized requests cannot reach the UI or /api endpoints. Do not add auth secrets as VITE_* variables. [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) describes coverage; actual account/plan settings have not been configured or verified here.

No Vercel project was created, linked or deployed by this task. After review, the user pushes only test/text-v2-uat and configures the new project.

From the integration worktree, after reviewing the local checkpoint:

```powershell
git switch test/text-v2-uat
git status --short
git rev-parse HEAD
git push -u origin test/text-v2-uat
```

No force option is required. If the remote rejects the push, inspect the divergence instead of overwriting it. This preparation did not execute the push.

## Build and local preview

PowerShell:

    $env:VITE_ENABLE_TEXT_UAT = 'true'
    npm ci
    npm run build:uat
    npx vite preview --outDir dist-uat --host 127.0.0.1

Build on the dedicated branch. Vercel builds additionally require the branch/project checks above. Public metadata includes version, short commit and UTC build timestamp only; no secret is needed for display.

Normal npm run build still produces dist with QA excluded, even if VITE_ENABLE_TEXT_UAT=true. UAT mode without the explicit flag fails. Do not use the ordinary build as this project's release command.

## Routes, PWA and API

- Online entry: **https://text-uat.prolingo.web.id/?qa=text-beta** after DNS/HTTPS setup.
- Root / shows a safe UAT landing page and explicit entry link; it never starts the canonical App lifecycle.
- Other QA queries in a UAT build show the same landing page; old development QA modules are not exposed.
- Normal production builds cannot enable UAT via a query string.
- UAT document title: ProLingo Text v2 UAT; manifest /manifest-text-uat.json; application id /text-v2-uat; start_url /?qa=text-beta; distinct Text UAT 192/512 PNG icons.
- Stable public/manifest.json identity/start URL remain unchanged. No offline service worker/cache is added. Installability and host-auth behavior on a real mobile PWA still need manual acceptance.
- vercel.json and /api/* functions remain unchanged. No catch-all SPA rewrite was added; query-based root navigation needs none.

## DNS and origins

Add only **text-uat.prolingo.web.id** to the new project's Domains. At the authoritative DNS provider add the **text-uat CNAME** using the exact project-specific target Vercel displays. Add a verification TXT record only if requested. Do not change apex/www/production/beta records, nameservers or their project assignments. Wait for domain validation and HTTPS.

Do not hardcode a historical Vercel CNAME target; [Vercel's custom-domain instructions](https://vercel.com/docs/domains/working-with-domains/add-a-domain) specify project-specific records.

IndexedDB belongs to an origin/profile/device. Generated preview URLs and the eventual custom domain have separate QA storage. Export JSON before changing origins; use the explicit fresh-copy recovery workflow to move QA records. Original/canonical data is not copied automatically.

## Audio online

Browser TTS uses Web Speech on the device, after an explicit Play gesture; voice availability, language and pause/resume behavior vary by browser/OS. Test desktop and Android audibly over HTTPS; headless/injected providers do not certify actual device voices.

Existing api/tts.js invokes server/edgeTtsService.js and msedge-tts in a Node function. It does not require the local Express process for a Vercel request. Vite's localhost:3001 proxy is development/preview-only; it is not an online backend. Preserve API routing and the existing Node dependencies. /api/health returning 200 proves routing only, **not** upstream TTS connectivity.

After deployment, separately verify POST /api/tts with a short test utterance, expected Content-Type audio/mpeg, nonempty decodable audio, latency and error response. Microsoft upstream connectivity, outbound network access and Vercel execution/resource limits are **not verified online**. The isolated Beta adds no Edge generation UI; Browser TTS and selected local ZIP playback remain independently testable. Existing /api/gemini-* functions are preserved, not newly configured or certified.

ZIP binding uses the existing RF matcher against existing QA metadata; files stay session-only. JSON backup does not contain audio binaries. No global Staging, canonical audio store, physical deletion or generation side effect is added.

## UAT checklist and rollback

1. Confirm hosting authentication first. Open / and ?qa=text-beta; verify version/channel/SHA/time, isolated QA v2, unchanged canonical v1 and Not Stable notice.
2. Opt in and initialize a fresh named QA DB; test empty-library authoring and optional demo across Paragraph/Conversation/Mixed, both readers, editor, EN/ID and Split/Full.
3. Save edits, reload, restart browser, reconnect. Test conflict recovery in two tabs; keep drafts and inspect committed outcomes before retrying.
4. Export JSON, validate the file, recover into a new QA name. Reject malformed files/existing destinations; reselect ZIP binaries after restart.
5. Test touch, zoom, portrait/landscape, PWA install/start URL, real voices and audio fallback on actual devices. Human/device acceptance remains pending.
6. Verify old QA routes unavailable, /api/health is JSON rather than HTML, and normal production/beta sites remain unchanged.

Rollback only the new project's deployment through Vercel after review; do not reset source branches or clear browser databases automatically. Export QA data first. Removing a deployment/domain does not migrate or erase local QA data.
