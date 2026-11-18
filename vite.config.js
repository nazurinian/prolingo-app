import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { assertTextUatBuild, publicTextUatMetadata } from './scripts/text-uat-config.mjs'
import react from '@vitejs/plugin-react'

const stableTestIgnored = [
  '**/.backup/**',
  '**/tests/**',
  '**/*.md',
  '**/*.csv',
  '**/*.zip',
  '**/*.mp3',
  '**/*.wav',
]

// Default `npm run dev` uses mode `stable-test` so mobile/background testing
// does not inherit Vite's HMR WebSocket reconnect -> full-page reload behavior.
// Use `npm run dev:hmr` while actively editing source and hot reload is desired.
export default defineConfig(({ mode }) => {
  const stableTesting = mode === 'stable-test'
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  const uat = assertTextUatBuild({ mode, env, branch: env.VERCEL === '1' ? env.VERCEL_GIT_COMMIT_REF : execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() })
  const metadata = uat ? publicTextUatMetadata() : null

  return {
    plugins: [react(), ...(uat ? [{
      name: 'isolated-text-uat-identity',
      transformIndexHtml(html) { return html.replace('<title>Prolingo</title>', '<title>ProLingo Text v2 UAT</title>').replace('/manifest.json', '/manifest-text-uat.json') },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest-text-uat.json', source: JSON.stringify({
        id: '/text-v2-uat', name: metadata.label, short_name: 'Text UAT', start_url: '/?qa=text-beta', scope: '/', display: 'standalone',
        background_color: '#ffffff', theme_color: '#4338ca', icons: [192, 512].map(size => ({ src: '/text-uat-icon-' + size + '.png', sizes: size + 'x' + size, type: 'image/png', purpose: 'any' }))
      }) }) }
    }] : [])],
    define: { __TEXT_UAT_ENABLED__: JSON.stringify(uat), __TEXT_UAT_METADATA__: JSON.stringify(metadata) },
    build: { outDir: uat ? 'dist-uat' : 'dist' },
    server: {
      host: true, // Listen on all network interfaces (LAN & Tailscale IP)
      port: 5173,
      strictPort: true,
      hmr: stableTesting ? false : true,
      watch: stableTesting ? { ignored: stableTestIgnored } : undefined,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001', // Local Server Express
          changeOrigin: true,
          secure: false,
        }
      }
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
