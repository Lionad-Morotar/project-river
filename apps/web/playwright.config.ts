import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Load .env so E2E tests can check NUXT_AGENT_LLM_API_KEY for skip logic
try {
  const envPath = path.join(__dirname, '.env')
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (/^[A-Z_]\w*$/i.test(key) && !process.env[key])
        process.env[key] = value
    }
  }
}
catch { /* .env may not exist in CI */ }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:10400',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
