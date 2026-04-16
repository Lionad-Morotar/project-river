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
    alias: {
      '~': path.resolve(__dirname, './app'),
      '~/': path.resolve(__dirname, './app/'),
      '~/components': path.resolve(__dirname, './app/components'),
      '~/composables': path.resolve(__dirname, './app/composables'),
      '~/utils': path.resolve(__dirname, './app/utils'),
      '@project-river/db/client': path.resolve(__dirname, '../../packages/db/src/client.ts'),
      '@project-river/db/schema': path.resolve(__dirname, '../../packages/db/src/schema/index.ts'),
    },
  },
})
