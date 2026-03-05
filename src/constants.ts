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
// Alpha sources:  #3 BSI custom_properties.json, #6 Dev Kit index, #7 Dev Kit stories
// Stable sources: #1 #2 BSI markup/status, #4 Designers YAML, #5 DTI, #8 GitHub Issues

export const ALPHA_WARNING =
  'Bootstrap Italia 3.x and Dev Kit Italia are in alpha. ' +
  'CSS tokens (--bsi-*), and web components may have breaking changes before stable release. ' +
  'HTML markup and component status are a little more reliable.'

// ─── Bootstrap Italia — sources #1 #2 #3 ────────────────────────────────────

/** Active branch with structured token APIs — not present in 2.x */
export const BSI_BRANCH = '3.x'

const BSI_RAW_BASE =
  `https://raw.githubusercontent.com/italia/bootstrap-italia/${BSI_BRANCH}`

/** List of ~55 components with status, accessibility, known issues */
export const BSI_STATUS_URL =
  `${BSI_RAW_BASE}/api/components_status.json`

/** Per-component CSS tokens --bsi-* with semantic descriptions ⚠️ alpha */
export const BSI_CUSTOM_PROPERTIES_URL =
  `${BSI_RAW_BASE}/api/custom_properties.json`

/** HTML markup variants per component — subfolder varies by category */
export const BSI_COMPONENT_URL = (subfolder: string, slug: string): string =>
  `${BSI_RAW_BASE}/api/${subfolder}/${slug}.json`

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
  `${BSI_RAW_BASE}/src/scss/_root.scss`

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

// ─── Designers Italia — sources #4 + part of #9 ─────────────────────────────

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

// ─── Design Tokens Italia — source #5 ───────────────────────────────────────

/** Global --it-* tokens with concrete values (for valueResolved) */
export const DTI_VARIABLES_SCSS_URL =
  'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss'

// ─── Dev Kit Italia — sources #6 #7 + part of #9 ────────────────────────────

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

// ─── GitHub REST API — source #8 ─────────────────────────────────────────────

/** Issues search endpoint */
export const GITHUB_SEARCH_ISSUES_URL =
  'https://api.github.com/search/issues'

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