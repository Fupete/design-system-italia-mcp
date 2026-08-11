import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify } from '../slugify.js'
import type { ComponentIssue, ComponentIssuesResult, BoardStatus } from '../types.js'
import { GITHUB_SEARCH_ISSUES_URL, GITHUB_WATCHED_REPOS } from '../constants.js'
import { getUserAgent, FETCH_TIMEOUT_MS } from '../fetch.js'

// ─── Fetch helper ─────────────────────────────────────────────────────────────
// Kept separate from fetch.ts's shared fetchJson — needs GitHub-specific
// headers (Accept, API version, optional bearer auth) and 403 rate-limit
// detection that the generic helper doesn't have.

function authHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': getUserAgent(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (res.status === 403) {
    const reset = res.headers.get('X-RateLimit-Reset')
    const resetTime = reset ? new Date(parseInt(reset) * 1000).toISOString() : 'unknown'
    throw new Error(`GitHub rate limit exceeded. Reset at: ${resetTime}`)
  }
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

// ─── Source GitHub Issues REST search ────────────────────────────────────

interface RawIssue {
  title: string
  html_url: string
  repository_url: string
  state: 'open' | 'closed'
  created_at: string
  labels: Array<{ name: string }>
}

interface SearchResult {
  total_count: number
  items: RawIssue[]
}

function repoFromUrl(repositoryUrl: string): string {
  // https://api.github.com/repos/italia/bootstrap-italia → italia/bootstrap-italia
  return repositoryUrl.replace('https://api.github.com/repos/', '')
}

export async function loadComponentIssues(slug: string): Promise<ComponentIssuesResult> {
  const normalized = slugify(slug)
  const key = CACHE_KEYS.githubIssues(normalized)
  const cached = cache.get<ComponentIssuesResult>(key)
  if (cached) return cached

  const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join(' ')
  const q = encodeURIComponent(`${normalized} ${repoFilter} is:issue is:open`)
  const url = `${GITHUB_SEARCH_ISSUES_URL}?q=${q}&sort=updated&per_page=20`

  try {
    const raw = await fetchJson<SearchResult>(url)

    const issues: ComponentIssue[] = raw.items
      // Filter only the 4 relevant repos
      .filter((item) =>
        GITHUB_WATCHED_REPOS.some((r) => item.repository_url.endsWith(r))
      )
      .map((item) => ({
        title: item.title,
        url: item.html_url,
        repo: repoFromUrl(item.repository_url),
        state: item.state,
        createdAt: item.created_at,
        labels: item.labels.map((l) => l.name),
      }))

    const result: ComponentIssuesResult = { issues }
    cache.set(key, result, TTL.githubIssues)
    return result
  } catch (err) {
    // Rate limit or network error: cache the failure too, same TTL as
    // a success. Without this, every call for the same slug during a rate
    // limit window re-hits GitHub and gets another 403, wasting the budget
    // instead of backing off.
    console.warn(`GitHub issues loader: ${err}`)
    const result: ComponentIssuesResult = { issues: [], error: (err as Error).message }
    cache.set(key, result, TTL.githubIssues)
    return result
  }
}

// ─── Aggregated board status ──────────────────────────────────────────────────
//
// No GraphQL Projects v2 (requires read:project, unstable API).
// Returns aggregate from known issues in components_status.json
// + live issue count per repo.

export function getProjectBoardStatus(): BoardStatus {
  return {
    repos: GITHUB_WATCHED_REPOS.map((repo) => ({
      repo,
      openIssuesUrl: `https://github.com/${repo}/issues`,
    })),
    note:
      'GitHub Projects v2 board (project #17) not integrated — ' +
      'requires read:project scope. ' +
      'Use github_get_component_issues for component-specific issues.',
  }
}