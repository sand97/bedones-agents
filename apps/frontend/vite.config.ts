import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  envDir: '../../',
  server: {
    allowedHosts: ['localhost', 'moderator.bedones.local'],
  },
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    svgr(),
    tailwindcss(),
    tanstackStart({ target: 'server' }),
    viteReact(),
  ],
})
