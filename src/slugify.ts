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

// ─── Cross-source aliases + user-facing synonyms ──────────────────────────────
//
// Centralizes all slug variations in one place.
// slugsToTry() resolves bidirectionally and transitively —
// any alias can be used as input, regardless of which is the key.
//
// Three layers:
//   1. Cross-source — BSI ↔ Dev Kit ↔ BSI JSON filenames (e.g. tables↔tabelle)
//   2. EN plurals/synonyms — user writes "dialog", system finds "modal"
//   3. IT synonyms — user writes "fisarmonica", system finds "accordion"
const SLUG_ALIASES: Record<string, string[]> = {
  'accordion': ['accordions', 'fisarmonica'],
  'alert': ['avviso'],
  'autocomplete': ['autocompletamento'],
  'back': ['torna-indietro'],
  'back-to-top': ['torna-su', 'scroll-to-top'],
  'badge': ['etichetta'],
  'breadcrumbs': ['breadcrumb', 'briciole', 'briciole-di-pane', 'percorso', 'path'],
  'buttons': ['button', 'btn', 'bottone', 'pulsante', 'bottoni', 'pulsanti'],
  'card': ['cards', 'scheda'],
  'carousel': ['carousels', 'carosello'],
  'chips': ['chip', 'tag'],
  'collapse': ['collapses', 'espandibile'],
  'datepicker': ['input-calendario', 'date-picker', 'calendar', 'input-data'],
  'dropdown': ['dropdowns', 'menu-a-tendina'],
  'footer': ['pie-di-pagina', 'piede'],
  'form': ['introduzione', 'modulo'],
  'header': ['headers', 'intestazione', 'testata'],
  'hero': ['heroes', 'banner'],
  'list': ['liste', 'lista'],
  'megamenu': ['megamenus'],
  'modal': ['modale', 'dialog', 'finestra-modale'],
  'notifications': ['notifiche', 'notifica', 'toast', 'toasts'],
  'number-input': ['input-numerico', 'numeric-input'],
  'overlay': ['sovrapposizione'],
  'pagination': ['paginazione', 'pages'],
  'popover': ['popovers'],
  'progress-indicators': ['progress', 'spinner', 'loader'],
  'rating': ['valutazione', 'stelle'],
  'sections': ['section', 'sezione'],
  'sidebar': ['barra-laterale'],
  'skiplinks': ['skip-links'],
  'steppers': ['stepper', 'steps'],
  'tables': ['table', 'tabelle', 'tabella'],
  'tabs': ['tab'],
  'timeline': ['timelines'],
  'timepicker': ['input-ora', 'time-picker'],
  'toggles': ['toggle', 'switch', 'switches'],
  'tooltip': ['tooltips', 'suggerimento'],
  'video-player': ['video', 'player'],
}

// Given a canonical slug, returns all known aliases
export function getSlugAliases(slug: string): string[] {
  return SLUG_ALIASES[slug] ?? []
}

// Returns slug + all aliases: useful for fallback loops in loaders
export function slugsToTry(slug: string): string[] {
  const result = new Set<string>([slug])

  // Direct aliases
  for (const alias of SLUG_ALIASES[slug] ?? []) {
    result.add(alias)
  }

  // Reverse: slug appears as a value
  for (const [key, aliases] of Object.entries(SLUG_ALIASES)) {
    if (aliases.includes(slug)) {
      result.add(key)
      // Transitive: also add all aliases of the matched key
      for (const alias of aliases) {
        result.add(alias)
      }
    }
  }

  return [...result]
}