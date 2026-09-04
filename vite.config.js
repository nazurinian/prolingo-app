import { defineConfig } from 'vite'
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

  return {
    plugins: [react()],
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
