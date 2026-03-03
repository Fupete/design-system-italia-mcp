// ─── Slug matching across heterogeneous sources ───────────────────────────────
//
// Sources use different names for the same component:
//   components_status.json → `Accordion`  (backtick, Title Case)
//   BSI API                → accordion    (lowercase)
//   Designers Italia YAML  → accordion    (lowercase)
//   Dev Kit index.json     → componenti-accordion--documentazione (Storybook id)
//   Dev Kit stories path   → packages/accordion/stories/it-accordion.stories.ts
//
// Canonical normalization: lowercase + trim + strip backtick + hyphenated

export function slugify(name: string): string {
  return name
    .replace(/`/g, '')           // strip backtick: `Accordion` → Accordion
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')        // spaces → dashes
    .replace(/[^a-z0-9-]/g, '')  // remove invalid chars
}

// components_status.json: title can be `Accordion` or `Accordion Group`
export function slugFromStatusTitle(title: string): string {
  return slugify(
    title
      .replace(/`/g, '')
      .replace(/\s*-\s*check\s+a11y\s+e\s+status\s*/i, '')
      .trim()
  )
}

// Dev Kit index.json: id is "componenti-accordion--documentazione"
// → extracts "accordion"
export function slugFromStorybookId(id: string): string {
  const match = id.match(/^componenti-(.+?)--/)
  if (!match) return ''
  return match[1]  // already lowercase and hyphenated
}

// Dev Kit importPath: "./packages/accordion/stories/it-accordion.stories.ts"
// → extracts "accordion"
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

// Fuzzy comparison: "accordion group" ≈ "accordion-group"
export function slugsMatch(a: string, b: string): boolean {
  return slugify(a) === slugify(b)
}

// ─── Cross-source aliases ─────────────────────────────────────────────────────
//
// Some sources use different slugs for the same component.
// Add new cases as inconsistencies emerge.
//
//   'buttons' → Dev Kit uses "button" (without s)
//   'modal'   → BSI saves the file as "modale.json"
//
const SLUG_ALIASES: Record<string, string[]> = {
  'buttons': ['button'],
  'modal':   ['modale'],
}

// Given a canonical slug, returns all known aliases
export function getSlugAliases(slug: string): string[] {
  return SLUG_ALIASES[slug] ?? []
}

// Returns slug + all aliases: useful for fallback loops in loaders
export function slugsToTry(slug: string): string[] {
  return [slug, ...getSlugAliases(slug)]
}