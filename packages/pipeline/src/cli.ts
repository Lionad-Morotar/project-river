#!/usr/bin/env bun

import process from 'node:process'
import { parseArgs } from 'node:util'
import { analyzeRepo } from './db/analyze.ts'

export async function runAnalyze(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: analyze <repo-path> [project-name]

Options:
  --batch-size <n>   Number of rows per batch insert (default: 2000)
  --force            Delete and re-analyze existing project
  --incremental      Append new commits to existing project
  --no-ignore        Disable .gitignore filtering for commit files
  -h, --help         Show this help message`)
    return
  }

  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      'batch-size': { type: 'string', default: '2000' },
      'force': { type: 'boolean', default: false },
      'incremental': { type: 'boolean', default: false },
      'no-ignore': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: true,
  })

  if (!positionals[0]) {
    throw new Error('Usage: analyze <repo-path> [project-name]')
  }

  const batchSize = Number.parseInt(values['batch-size'] as string, 10)
  if (Number.isNaN(batchSize) || batchSize < 1) {
    throw new Error(`Invalid batch size: ${values['batch-size']}. Must be a positive integer.`)
  }

  if (values.force as boolean && values.incremental as boolean) {
    throw new Error('--force and --incremental are mutually exclusive. Use --force to re-analyze from scratch, or --incremental to append new commits.')
  }

  const ignoreEnabled = !(values['no-ignore'] as boolean)

  await analyzeRepo(
    positionals[0],
    positionals[1],
    {
      batchSize,
      force: values.force as boolean,
      incremental: values.incremental as boolean,
      ignore: ignoreEnabled,
    },
  )
}

if (import.meta.main) {
  runAnalyze(Bun.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
