import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets Cloudflare quick tunnels (used for cross-device testing) reach the dev server.
    allowedHosts: [".trycloudflare.com"],
  },
})
