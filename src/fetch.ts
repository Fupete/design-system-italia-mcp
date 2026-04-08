// src/fetch.ts
// ─── Shared fetch helpers for loaders ────────────────────────────────────────
// Scripts (snapshot-static, snapshot-devkit) have their own fetch helpers
// with timeout and auth headers — kept separate intentionally.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// reads own package.json for User-Agent version string — not user input, so safe
const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
)
const VERSION = packageJson.version as string

export function getUserAgent(): string {
  return `design-system-italia-mcp/${VERSION} (+https://github.com/Fupete/design-system-italia-mcp)`
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': getUserAgent(),
    },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': getUserAgent(),
    },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  return res.text()
}