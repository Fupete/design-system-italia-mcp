// ─── Shared constants ────────────────────────────────────────────────────────
// Single place to update branch, base URLs and warnings
// when upstream sources change.
//
// RULE: do not duplicate these constants in loaders.
// If a source changes structure, update only the corresponding loader.
// If a branch or base URL changes, update here.

// ─── Alpha warning ────────────────────────────────────────────────────────────
// Used in ping (index.ts) and in meta.warnings for tools exposing data from
// alpha sources (CSS tokens, Dev Kit Italia).
//
// Alpha sources:  #3 BSI custom_properties.json, #7 Dev Kit index, #8 Dev Kit stories, #9 Dev Kit props
// Stable sources: #1 #2 BSI markup/status, #4 BSI root.scss, #5 Designers YAML, #6 DTI, #10 GitHub Issues

export const ALPHA_WARNING =
  'Bootstrap Italia 3.x and Dev Kit Italia are in alpha. ' +
  'CSS tokens (--bsi-*), and web components may have breaking changes before stable release. ' +
  'HTML markup and component status are a little more reliable.'

// ─── Bootstrap Italia — sources #1 #2 #3 #4 ─────────────────────────────────

/** Active branch with structured token APIs — not present in 2.x */
export const BSI_BRANCH = '3.x'

/**
 * Branch containing updated API markup and custom properties for BSI 3.x.
 * Using feature/update-examples-api-v3 until it merges into 3.x.
 * TODO: switch back to BSI_BRANCH when feature/update-examples-api-v3 is merged into 3.x
 */
export const BSI_API_MARKUP_BRANCH = 'feature/update-examples-api-v3'

const BSI_RAW_BASE =
  `https://raw.githubusercontent.com/italia/bootstrap-italia/${BSI_BRANCH}`

const BSI_API_MARKUP_BASE =
  `https://raw.githubusercontent.com/italia/bootstrap-italia/${BSI_API_MARKUP_BRANCH}`

/** List of ~55 components with status, accessibility, known issues */
export const BSI_STATUS_URL =
  `${BSI_RAW_BASE}/api/components_status.json`

/** Per-component CSS tokens --bsi-* with semantic descriptions ⚠️ alpha */
export const BSI_CUSTOM_PROPERTIES_URL =
  `${BSI_API_MARKUP_BASE}/api/custom_properties.json`


/** HTML markup variants per component — subfolder varies by category */
export const BSI_COMPONENT_URL = (subfolder: string, slug: string): string =>
  `${BSI_API_MARKUP_BASE}/api/${subfolder}/${slug}.json`

/** Default subfolder for components without a bsiDocUrl */
export const BSI_COMPONENT_DEFAULT_SUBFOLDER = 'componenti'

// Extracts API subfolder from BSI doc URL
// "https://italia.github.io/bootstrap-italia/docs/menu-di-navigazione/footer/"
// → "menu-di-navigazione"
export function subfolderFromDocUrl(bsiDocUrl: string): string {
  const match = bsiDocUrl.match(/\/docs\/([^/]+)\/[^/]+\/?$/)
  return match?.[1] ?? BSI_COMPONENT_DEFAULT_SUBFOLDER
}

/** Bridge --bsi-* → --it-* (required for valueResolved) */
export const BSI_ROOT_SCSS_URL =
  `${BSI_RAW_BASE}/src/scss/base/_root.scss`

/** BSI version for meta.versions.bootstrapItalia */
export const BSI_PACKAGE_JSON_URL =
  `${BSI_RAW_BASE}/package.json`

/**
 * Bootstrap Italia component docs base URL
 * TODO: update to stable v3 docs URL when available
 * (currently preview only, redirects to v2 — URL may change)
 */
export const BSI_DOC_BASE =
  'https://italia.github.io/bootstrap-italia/docs/componenti'

// ─── Designers Italia — sources #5 + part of #11 ─────────────────────────────

const DESIGNERS_RAW_BASE =
  'https://raw.githubusercontent.com/italia/designers.italia.it/main'

/** Usage guidelines, accessibility, editorial status, when/how to use */
export const DESIGNERS_COMPONENT_URL = (slug: string): string =>
  `${DESIGNERS_RAW_BASE}/src/data/content/design-system/componenti/${slug}.yaml`

/** Nav YAML — DS versions + verified component URLs + foundations[] */
export const DESIGNERS_DSNAV_URL =
  `${DESIGNERS_RAW_BASE}/src/data/dsnav.yaml`

/** Site base URL — to build absolute URLs from relative nav entries */
export const DESIGNERS_SITE_BASE = 'https://designers.italia.it'

// ─── Design Tokens Italia — source #6 ───────────────────────────────────────

/** Global --it-* tokens with concrete values (for valueResolved) */
export const DTI_VARIABLES_SCSS_URL =
  'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss'

// ─── Dev Kit Italia — sources #7 #8 #9 + part of #11 ────────────────────────────

const DEVKIT_RAW_BASE =
  'https://raw.githubusercontent.com/italia/dev-kit-italia/main'

/**
 * Storybook index: status tags, Italian variants, importPath → exact stories.ts path ⚠️ alpha
 * GitHub Pages URL — not raw GitHub
 */
export const DEVKIT_INDEX_URL =
  'https://italia.github.io/dev-kit-italia/index.json'

/** Storybook base URL — to build /docs/{id} links */
export const DEVKIT_STORYBOOK_BASE =
  'https://italia.github.io/dev-kit-italia'

/**
 * Component stories — path from importPath in index.json ⚠️ alpha
 * Always use importPath from loader, do not assume pattern from name.
 * importPath has "./" prefix — removed here.
 */
export const DEVKIT_STORIES_URL = (importPath: string): string =>
  `${DEVKIT_RAW_BASE}/${importPath.replace(/^\.\//, '')}`

/**
 * Dev Kit version for meta.versions.devKitItalia
 * NOTE: root package.json has "version": "0.0.0" (monorepo workspace) — do not use it.
 */
export const DEVKIT_PACKAGE_JSON_URL =
  `${DEVKIT_RAW_BASE}/packages/dev-kit-italia/package.json`

// ─── Snapshot branch — data-fetched ──────────────────────────────────────────
// Loaders read from here instead of upstream live sources.
// Populated nightly by upstream-snapshot workflow.
// Only GitHub Issues remain live at runtime.

const DATA_FETCHED_RAW_BASE =
  'https://raw.githubusercontent.com/fupete/design-system-italia-mcp/data-fetched'

export const SNAPSHOT_BSI_STATUS_URL =
  `${DATA_FETCHED_RAW_BASE}/bsi/components-status.json`

export const SNAPSHOT_BSI_COMPONENT_URL = (slug: string): string =>
  `${DATA_FETCHED_RAW_BASE}/bsi/components/${slug}.json`

export const SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL =
  `${DATA_FETCHED_RAW_BASE}/bsi/custom-properties.json`

export const SNAPSHOT_BSI_ROOT_SCSS_URL =
  `${DATA_FETCHED_RAW_BASE}/bsi/root.scss`

export const SNAPSHOT_DTI_VARIABLES_SCSS_URL =
  `${DATA_FETCHED_RAW_BASE}/design-tokens/variables.scss`

export const DTI_PACKAGE_JSON_URL =
  'https://raw.githubusercontent.com/italia/design-tokens-italia/main/package.json'

export const SNAPSHOT_DEVKIT_INDEX_URL =
  `${DATA_FETCHED_RAW_BASE}/devkit/index.json`

export const SNAPSHOT_DEVKIT_PROPS_URL = (slug: string): string =>
  `${DATA_FETCHED_RAW_BASE}/devkit/props/${slug}.json`

export const SNAPSHOT_DEVKIT_STORY_URL = (slug: string): string =>
  `${DATA_FETCHED_RAW_BASE}/devkit/stories/${slug}.json`

export const SNAPSHOT_DESIGNERS_COMPONENT_URL = (slug: string): string =>
  `${DATA_FETCHED_RAW_BASE}/designers/components/${slug}.json`

export const SNAPSHOT_DSNAV_URL =
  `${DATA_FETCHED_RAW_BASE}/dsnav.json`

export const SNAPSHOT_META_URL =
  `${DATA_FETCHED_RAW_BASE}/snapshot-meta.json`

// ─── GitHub REST API ─────────────────────────────────────────────

/** Issues search endpoint */
export const GITHUB_SEARCH_ISSUES_URL =
  'https://api.github.com/search/issues'

/** Canary: Dev Kit stories file count in data-fetched branch
*  Note: requires GITHUB_TOKEN for reliable rate limits (60/h without, 5000/h with) */
export const GITHUB_CONTENTS_DEVKIT_STORIES_URL =
  'https://api.github.com/repos/fupete/design-system-italia-mcp/contents/devkit/stories?ref=data-fetched'

/**
 * Monitored repos for issues
 * Order: main → kit → dependencies
 */
export const GITHUB_WATCHED_REPOS = [
  'italia/bootstrap-italia',
  'italia/design-ui-kit',
  'italia/dev-kit-italia',
  'italia/design-tokens-italia',
] as const