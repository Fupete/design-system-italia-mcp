// ─── Status values ────────────────────────────────────────────────────────────

export type StatusValue =
  | 'PRONTO'
  | 'DA RIVEDERE A11Y'
  | 'DA RIVEDERE'
  | 'IN REVIEW'
  | 'DA COMPLETARE VARIANTI'
  | 'NON PRESENTE'
  | 'DA FARE'
  | 'N/D'

// ─── BSI — components_status.json ────────────────────────────────────────────

export interface ComponentStatus {
  slug: string
  name: string
  libraryStatus: {
    bootstrapItalia: StatusValue
    uiKitItalia: StatusValue
    devKitItalia: StatusValue
  }
  accessibility: {
    visivamenteAccessibile: StatusValue
    amichevoleConLettoriDiSchermo: StatusValue
    navigabile: StatusValue
    comprensibile: StatusValue
    checkCompleted: boolean
  }
  knownIssueUrls: string[]
  notes: string | null
  sourceUrls: {
    bsiDoc: string | null
    figma: string | null
    devKitDoc: string | null // via components_status.json, to compare with devKit.storybookUrl one
  }
}

// ─── BSI — api/componenti/{slug}.json ────────────────────────────────────────

export interface ComponentVariant {
  name: string
  html: string
}

// ─── BSI — api/custom_properties.json ────────────────────────────────────────

export type TokenRole = 'bsi-component' | 'bsi-global' | 'dti'

export interface ResolvedHop {
  name: string                                  // normalized internal key
  sourceName: string                            // "$it-spacing-6x" for dti, "--bsi-spacing-m" for bsi-*
  form: 'css-custom-property' | 'sass-variable'
  role: TokenRole
  overridable: boolean   // true for --bsi-* (project-overridable at runtime), false for --it-*/$it-* (central, not overridable per-project)
}

export interface ComposedRef {
  ref: string               // raw text as found embedded in the value, e.g. "$it-shadow-blur-s" or "var(--bsi-shadow-x)"
  name: string               // normalized token name, e.g. "--it-shadow-blur-s"
  value: string | null       // null if this specific embedded reference doesn't resolve
  resolvedVia: ResolvedHop[]
}

export interface CssToken {
  name: string
  value: string
  valueType: 'token-reference' | 'scss-expression' | 'literal' | 'composite'
  resolvedVia: ResolvedHop[]
  valueResolved: string | null
  valueResolvedNote?: string    // present for scss-expression tokens, or composite tokens with a partial resolution
  composedOf?: ComposedRef[]    // present only for composite tokens — one entry per embedded reference found
  description: string | null
}

// ─── Designers Italia — {slug}.yaml ──────────────────────────────────────────

export interface ComponentGuidelines {
  description: string | null
  categories: string[]
  whenToUse: string | null
  howToUse: string | null
}

// ─── Dev Kit Italia ───────────────────────────────────────────────────────────

export interface DevKitEntry {
  slug: string
  id: string              // Storybook entry id — the one guaranteed-unique identifier
  displayName: string    // human-readable name, from Storybook title's last segment (e.g. "Video player")
  tags: string[]         // ['a11y-ok', 'web-component', 'alpha'…]
  storybookUrl: string
  importPath: string     // exact stories.ts path
  variants: string[]     // story export names in Italian
  pattern: 'dedicated' | 'bundle'
  componentType: 'web-component' | 'html-bsi'
}

export interface WebComponentProp {
  name: string           // HTML attribute name (e.g. background-active)
  type: string
  description: string | null
  default: string | null
  options: string[]
}

export interface DevKitComponent {
  tagName: string        // it-accordion
  props: WebComponentProp[]
  subcomponents: Array<{
    tagName: string      // it-accordion-item
    props: WebComponentProp[]
  }>
}

// ─── GitHub Issues and board status ───────────────────────────────────────────

export interface ComponentIssue {
  title: string
  url: string
  repo: string
  state: 'open' | 'closed'
  createdAt: string
  labels: string[]
}

export interface ComponentIssuesResult {
  issues: ComponentIssue[]
  error?: string
}

export interface BoardStatus {
  repos: Array<{
    repo: string
    openIssuesUrl: string
  }>
  note: string
}

// ─── Design System — navigation metadata and versions ────────────────────────

export interface DsVersions {
  designSystem: string        // from dsnav.yaml, e.g. "v1.10.1"
  bootstrapItalia: string     // from BSI package.json, e.g. "3.0.0-alpha.2"
  devKitItalia: string        // from Dev Kit package.json, e.g. "1.0.0-alpha.5"
  designTokensItalia: string  // from DTI package.json, e.g. "1.3.2"
}

export interface DsNavEntry {
  label: string
  url: string                 // relative URL
  absoluteUrl: string         // https://designers.italia.it/...
}

export interface DsMeta {
  versions: DsVersions
  components: Map<string, DsNavEntry>   // slug → entry
  foundations: DsNavEntry[]             // foundations list
  fetchedAt: string
  ok: boolean                           // false if snapshot-meta.json fetch failed — versions/fetchedAt are fallback values, not real snapshot data
}

// ─── Snapshot metadata — data-fetched/snapshot-meta.json ─────────────────────

export interface SnapshotSourceMeta {
  ok: boolean
  error?: string
}

export interface SnapshotMeta {
  fetchedAt: string
  versions: DsVersions
  stats: {
    total: number
    ok: number
    failed: number
  }
  sources: Record<string, SnapshotSourceMeta>
}

// ─── Dev Kit story snapshot — data-fetched/devkit/stories/{slug}.json ─────────

export interface DevKitStoryVariant {
  name: string   // heading id, e.g. "elemento-richiudibile"
  html: string   // clean copy-paste HTML markup
}

export interface DevKitStorySnapshot {
  slug: string
  devkitUrl: string
  description: string | null
  variants: DevKitStoryVariant[]
}

// ─── Dev Kit props snapshot — data-fetched/devkit/props/{slug}.json ───────────

export interface DevKitPropsSnapshot {
  slug: string
  tagName: string
  props: WebComponentProp[]
  subcomponents: Array<{
    tagName: string
    props: WebComponentProp[]
  }>
}

// ─── Shared stability level ─────────────────────────────────────────────────

export type StabilityLevel = 'beta' | 'stable'
