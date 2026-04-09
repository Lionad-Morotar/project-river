import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {},
  resolve: {
    alias: {
      '@project-river/db/client': path.resolve(__dirname, '../db/src/client.ts'),
      '@project-river/db/schema': path.resolve(__dirname, '../db/src/schema/index.ts'),
    },
  },
})
