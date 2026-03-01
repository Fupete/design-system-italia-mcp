// ─── Slug matching tra sorgenti eterogenee ────────────────────────────────────
//
// Le sorgenti usano nomi diversi per lo stesso componente:
//   components_status.json → `Accordion`  (backtick, Title Case)
//   BSI API                → accordion    (lowercase)
//   Designers Italia YAML  → accordion    (lowercase)
//   Dev Kit index.json     → componenti-accordion--documentazione (id Storybook)
//   Dev Kit stories path   → packages/accordion/stories/it-accordion.stories.ts
//
// Normalizzazione canonica: lowercase + trim + strip backtick + hyphenated

export function slugify(name: string): string {
  return name
    .replace(/`/g, '')           // strip backtick: `Accordion` → Accordion
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')        // spazi → trattini
    .replace(/[^a-z0-9-]/g, '')  // rimuovi caratteri non validi
}

// components_status.json: title può essere `Accordion` o `Accordion Group`
export function slugFromStatusTitle(title: string): string {
  return slugify(
    title
      .replace(/`/g, '')
      .replace(/\s*-\s*check\s+a11y\s+e\s+status\s*/i, '')
      .trim()
  )
}

// Dev Kit index.json: id è "componenti-accordion--documentazione"
// → estrae "accordion"
export function slugFromStorybookId(id: string): string {
  const match = id.match(/^componenti-(.+?)--/)
  if (!match) return ''
  return match[1]  // già lowercase e hyphenated
}

// Dev Kit importPath: "./packages/accordion/stories/it-accordion.stories.ts"
// → estrae "accordion"
export function slugFromImportPath(importPath: string): string {
  // pattern package dedicato: packages/{slug}/stories/
  const dedicated = importPath.match(/^\.\/packages\/([^/]+)\/stories\//)
  if (dedicated && dedicated[1] !== 'dev-kit-italia') {
    return dedicated[1]
  }
  // pattern bundle: packages/dev-kit-italia/stories/components/{slug}.stories.ts
  const bundle = importPath.match(/\/components\/([^/]+)\.stories\.ts$/)
  if (bundle) return bundle[1]
  return ''
}

// Confronto fuzzy: "accordion group" ≈ "accordion-group"
export function slugsMatch(a: string, b: string): boolean {
  return slugify(a) === slugify(b)
}

// ─── Alias cross-sorgente ─────────────────────────────────────────────────────
//
// Alcune sorgenti usano slug diversi per lo stesso componente.
// Aggiungere nuovi casi man mano che emergono inconsistenze.
//
//   'buttons' → Dev Kit usa "button" (senza s)
//   'modal'   → BSI salva il file come "modale.json"
//
const SLUG_ALIASES: Record<string, string[]> = {
  'buttons': ['button'],
  'modal':   ['modale'],
}

// Dato uno slug canonico, restituisce tutti gli slug da provare in ordine
export function getSlugAliases(slug: string): string[] {
  return SLUG_ALIASES[slug] ?? []
}

// Restituisce slug + tutti gli alias: utile per loop di fallback nei loader
export function slugsToTry(slug: string): string[] {
  return [slug, ...getSlugAliases(slug)]
}

// Dev Kit importPath → URL raw GitHub
export function importPathToRawUrl(importPath: string): string {
  const clean = importPath.replace(/^\.\//, '')
  return `https://raw.githubusercontent.com/italia/dev-kit-italia/main/${clean}`
}