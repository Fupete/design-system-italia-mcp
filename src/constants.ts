// ─── Costanti condivise ───────────────────────────────────────────────────────
// Punto unico per aggiornare branch, URL base e warning
// quando cambiano le sorgenti upstream.
//
// REGOLA: non duplicare queste costanti nei loader.
// Se una sorgente cambia struttura, aggiornare solo il loader
// corrispondente. Se cambia branch o URL base, aggiornare qui.

// ─── Alpha warning ────────────────────────────────────────────────────────────
// Usato in ping (index.ts) e in meta.warnings dei tool che espongono dati da
// sorgenti alpha (token CSS, Dev Kit Italia).
//
// Sorgenti alpha:   #3 BSI custom_properties.json, #6 Dev Kit index, #7 Dev Kit stories
// Sorgenti stabili: #1 #2 BSI markup/status, #4 Designers YAML, #5 DTI, #8 GitHub Issues

export const ALPHA_WARNING =
  'Token layer alpha: Bootstrap Italia ' + VERSION_BSI_HINT() + ' e Dev Kit Italia usano BSI 3.x (alpha). ' +
  'Markup HTML e stato componenti sono stabili. ' +
  'Token CSS (--bsi-*) e web component Dev Kit possono avere breaking changes prima della release stabile.'

function VERSION_BSI_HINT(): string {
  return '3.x'
}

// ─── Bootstrap Italia — sorgenti #1 #2 #3 ────────────────────────────────────

/** Branch attivo con API token strutturate — non presenti in 2.x */
export const BSI_BRANCH = '3.x'

const BSI_RAW_BASE =
  `https://raw.githubusercontent.com/italia/bootstrap-italia/${BSI_BRANCH}`

/** Lista ~55 componenti con stato, accessibilità, note issue */
export const BSI_STATUS_URL =
  `${BSI_RAW_BASE}/api/components_status.json`

/** Token CSS --bsi-* per-componente con descrizioni semantiche ⚠️ alpha */
export const BSI_CUSTOM_PROPERTIES_URL =
  `${BSI_RAW_BASE}/api/custom_properties.json`

/** Markup HTML varianti per componente */
export const BSI_COMPONENT_URL = (slug: string): string =>
  `${BSI_RAW_BASE}/api/componenti/${slug}.json`

/** Bridge --bsi-* → --it-* (necessario per valueResolved) */
export const BSI_ROOT_SCSS_URL =
  `${BSI_RAW_BASE}/src/scss/_root.scss`

/** Versione BSI per meta.versions.bootstrapItalia */
export const BSI_PACKAGE_JSON_URL =
  `${BSI_RAW_BASE}/package.json`

/**
* URL base documentazione componenti BSI
* TODO: aggiornare a URL stabile docs v3 quando disponibile
* (attualmente solo preview che rimanda alla v2 — URL potrebbe variare)
*/
export const BSI_DOC_BASE =
  'https://italia.github.io/bootstrap-italia/docs/componenti'

// ─── Designers Italia — sorgenti #4 + parte di #9 ────────────────────────────

const DESIGNERS_RAW_BASE =
  'https://raw.githubusercontent.com/italia/designers.italia.it/main'

/** Linee guida d'uso, accessibilità, stato redazionale, quando/come usare */
export const DESIGNERS_COMPONENT_URL = (slug: string): string =>
  `${DESIGNERS_RAW_BASE}/src/data/content/design-system/componenti/${slug}.yaml`

/** Nav YAML — versioni DS + URL verificati componenti + foundations[] */
export const DESIGNERS_DSNAV_URL =
  `${DESIGNERS_RAW_BASE}/src/data/dsnav.yaml`

/** URL base sito — per costruire URL assoluti da voci nav relative */
export const DESIGNERS_SITE_BASE = 'https://designers.italia.it'

// ─── Design Tokens Italia — sorgente #5 ──────────────────────────────────────

/** Token globali --it-* con valori concreti (per valueResolved) */
export const DTI_VARIABLES_SCSS_URL =
  'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss'

// ─── Dev Kit Italia — sorgenti #6 #7 + parte di #9 ──────────────────────────

const DEVKIT_RAW_BASE =
  'https://raw.githubusercontent.com/italia/dev-kit-italia/main'

/**
 * Indice Storybook: tag stato, varianti IT, importPath → path esatto stories.ts ⚠️ alpha
 * GitHub Pages URL — non raw GitHub
 */
export const DEVKIT_INDEX_URL =
  'https://italia.github.io/dev-kit-italia/index.json'

/** URL base Storybook — per costruire i link /docs/{id} */
export const DEVKIT_STORYBOOK_BASE =
  'https://italia.github.io/dev-kit-italia'

/**
 * Stories per componente — path da importPath in index.json ⚠️ alpha
 * Usare sempre importPath dal loader, non assumere il pattern dal nome.
 * importPath ha prefisso "./" — viene rimosso qui.
 */
export const DEVKIT_STORIES_URL = (importPath: string): string =>
  `${DEVKIT_RAW_BASE}/${importPath.replace(/^\.\//, '')}`

/**
 * Versione Dev Kit per meta.versions.devKitItalia
 * NOTA: il package.json root ha "version": "0.0.0" (monorepo workspace) — non usarlo.
 */
export const DEVKIT_PACKAGE_JSON_URL =
  `${DEVKIT_RAW_BASE}/packages/dev-kit-italia/package.json`


// ─── GitHub REST API — sorgente #8 ───────────────────────────────────────────

/** Endpoint search issues */
export const GITHUB_SEARCH_ISSUES_URL =
  'https://api.github.com/search/issues'

/**
 * Repo monitorati per le issue
 * Ordine: principale → kit → dipendenze
 */
export const GITHUB_WATCHED_REPOS = [
  'italia/bootstrap-italia',
  'italia/design-ui-kit',
  'italia/dev-kit-italia',
  'italia/design-tokens-italia',
] as const