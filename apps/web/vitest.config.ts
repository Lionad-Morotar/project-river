import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '~/': path.resolve(__dirname, './'),
      '@project-river/db/client': path.resolve(__dirname, '../../packages/db/src/client.ts'),
      '@project-river/db/schema': path.resolve(__dirname, '../../packages/db/src/schema/index.ts'),
    },
  },
})
