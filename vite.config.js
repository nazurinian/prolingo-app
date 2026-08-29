import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces (LAN & Tailscale IP)
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001', // Local Server Express
        changeOrigin: true,
        secure: false,
      }
    }
  }
})