// src/fetch.ts
// ─── Shared fetch helpers for loaders ────────────────────────────────────────
// Scripts (snapshot-static, snapshot-devkit) have their own fetch helpers
// with timeout and auth headers — kept separate intentionally.

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  return res.text()
}