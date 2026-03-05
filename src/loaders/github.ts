import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify } from '../slugify.js'
import type { ComponentIssue, BoardStatus } from '../types.js'
import { GITHUB_SEARCH_ISSUES_URL, GITHUB_WATCHED_REPOS } from '../constants.js'

// ─── Fetch helper ─────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 403) {
    const reset = res.headers.get('X-RateLimit-Reset')
    const resetTime = reset ? new Date(parseInt(reset) * 1000).toISOString() : 'unknown'
    throw new Error(`GitHub rate limit exceeded. Reset at: ${resetTime}`)
  }
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

// ─── Source #8 — GitHub Issues REST search ────────────────────────────────────

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

export async function loadComponentIssues(slug: string): Promise<ComponentIssue[]> {
  const normalized = slugify(slug)
  const key = CACHE_KEYS.githubIssues(normalized)
  const cached = cache.get<ComponentIssue[]>(key)
  if (cached) return cached

  const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join(' ')
  const q = encodeURIComponent(`${normalized} ${repoFilter} is:issue is:open`)
  const url = `${GITHUB_SEARCH_ISSUES_URL}?q=${q}&sort=updated&per_page=20`

  try {
    const raw = await fetchJson<SearchResult>(url)

    const issues: ComponentIssue[] = raw.items
      // Filter only the 4 relevant repositories
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

    cache.set(key, issues, TTL.githubIssues)
    return issues
  } catch (err) {
    // Rate limit or network error — return empty array with warning
    console.warn(`GitHub issues loader: ${err}`)
    return []
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
      'Use get_component_issues for component-specific issues.',
  }
}