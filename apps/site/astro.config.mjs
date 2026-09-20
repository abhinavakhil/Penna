import { defineConfig } from 'astro/config'
export default defineConfig({
  site: 'https://penna.dev',
  vite: { optimizeDeps: { exclude: ['@abhinavakhil/penna-core', '@abhinavakhil/penna-ai', '@abhinavakhil/penna-element'] } },
})
