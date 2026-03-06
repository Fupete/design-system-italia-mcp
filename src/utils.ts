// ─── Shared utilities ─────────────────────────────────────────────────────────

// Returns ISO 8601 UTC timestamp
export function formatTimestamp(): string {
  return new Date().toISOString()
}