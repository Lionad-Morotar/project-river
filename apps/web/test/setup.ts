import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  getRouterParams,
  getValidatedQuery,
} from 'h3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load root .env so DATABASE_URL is available in tests
function loadEnv() {
  if (!process.env.DATABASE_URL) {
    import('dotenv').then(({ config }) => {
      config({ path: path.resolve(__dirname, '../../../.env') })
    }).catch(() => {
      // dotenv not available; ignore
    })
  }
}
loadEnv()

// Provide Nitro/H3 globals for direct route handler imports in tests
Object.assign(globalThis, {
  defineEventHandler,
  getRouterParam,
  getRouterParams,
  getValidatedQuery,
  getQuery,
  createError,
})
