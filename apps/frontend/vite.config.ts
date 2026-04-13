import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['localhost', 'moderator.bedones.local'],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    svgr(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
