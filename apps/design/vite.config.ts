import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Studio images catalogue — full-screen client-side canvas tool.
// Same base stack as apps/frontend (Vite + React 19), built as an SPA
// since the editor is canvas-driven and does not need SSR.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3008,
    allowedHosts: ['localhost', 'design.bedones.local'],
  },
  preview: {
    host: '0.0.0.0',
    port: 3008,
    allowedHosts: ['localhost', 'design.bedones.local'],
  },
})
