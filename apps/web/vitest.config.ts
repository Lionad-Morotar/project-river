import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.spec.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: [
      // Longer/more-specific prefixes MUST come first to avoid shorter ones matching greedily
      { find: '~/server', replacement: path.resolve(__dirname, './server') },
      { find: '~/components', replacement: path.resolve(__dirname, './app/components') },
      { find: '~/composables', replacement: path.resolve(__dirname, './app/composables') },
      { find: '~/utils', replacement: path.resolve(__dirname, './app/utils') },
      { find: '~/server/utils', replacement: path.resolve(__dirname, './server/utils') },
      { find: '~/', replacement: path.resolve(__dirname, './app/') },
      { find: '~', replacement: path.resolve(__dirname, './app') },
      { find: '@project-river/db/client', replacement: path.resolve(__dirname, '../../packages/db/src/client.ts') },
      { find: '@project-river/db/schema', replacement: path.resolve(__dirname, '../../packages/db/src/schema/index.ts') },
    ],
  },
})
