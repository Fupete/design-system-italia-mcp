// ─── Slug matching across heterogeneous sources ───────────────────────────────
//
// Sources use different names for the same component:
//   components_status.json → `Accordion`  (backtick, Title Case)
//   BSI API                → accordion    (lowercase)
//   Designers Italia YAML  → accordion    (lowercase)
//   Dev Kit index.json     → title "Componenti/Form/Checkbox" (last segment → slug)
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

// Fuzzy comparison: "accordion group" ≈ "accordion-group"
export function slugsMatch(a: string, b: string): boolean {
  return slugify(a) === slugify(b)
}

// Dev Kit index.json: title is "Componenti/Form/Checkbox" or "Componenti/Accordion"
// → extracts last segment as slug: "checkbox", "accordion"
export function slugFromStorybookTitle(title: string): string {
  const parts = title.split('/')
  return parts[parts.length - 1].toLowerCase().replace(/\s+/g, '-')
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
  'buttons': ['button', 'btn'],
  'modal': ['modale'],
}

// Given a canonical slug, returns all known aliases
export function getSlugAliases(slug: string): string[] {
  return SLUG_ALIASES[slug] ?? []
}

// Returns slug + all aliases: useful for fallback loops in loaders
export function slugsToTry(slug: string): string[] {
  return [slug, ...getSlugAliases(slug)]
}