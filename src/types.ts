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
  }
}

// ─── BSI — api/componenti/{slug}.json ────────────────────────────────────────

export interface ComponentVariant {
  name: string
  html: string
}

// ─── BSI — api/custom_properties.json ────────────────────────────────────────

export interface CssToken {
  name: string          // --bsi-accordion-body-padding-x
  value: string         // var(--bsi-spacing-m)
  valueType: 'token-reference' | 'scss-expression' | 'literal'
  resolvedVia?: string | null  // --it-* design token from Design Tokens Italia, e.g. "--it-spacing-m"
  valueResolved: string | null  // 1.5rem — from Design Tokens Italia
  description: string | null
}

// ─── Designers Italia — {slug}.yaml ──────────────────────────────────────────

export interface ComponentGuidelines {
  description: string | null
  categories: string[]
  whenToUse: string | null
  howToUse: string | null
  accessibilityNotes: string | null
}

// ─── Dev Kit Italia ───────────────────────────────────────────────────────────

export interface DevKitEntry {
  slug: string
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
  devKitItalia: string        // from Dev Kit package.json
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
}

// ─── Snapshot metadata — data-fetched/snapshot-meta.json ─────────────────────

export interface SnapshotSourceMeta {
  ok: boolean
  fetchedAt: string
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
  fetchedAt: string
  devkitUrl: string
  description: string | null
  variants: DevKitStoryVariant[]
}

// ─── Dev Kit props snapshot — data-fetched/devkit/props/{slug}.json ───────────

export interface DevKitPropsSnapshot {
  slug: string
  fetchedAt: string
  tagName: string
  props: WebComponentProp[]
  subcomponents: Array<{
    tagName: string
    props: WebComponentProp[]
  }>
}

// ─── Aggregated response get_component_full ───────────────────────────────────

export type StabilityLevel = 'alpha' | 'stable'

export interface ComponentFull {
  name: string
  slug: string

  // from ComponentStatus
  status: ComponentStatus | null

  // from api/componenti/{slug}.json
  variantsCount: number
  variantsAvailable: string[]
  variants: ComponentVariant[]  // truncated to maxVariants

  // from ComponentGuidelines
  guidelines: ComponentGuidelines | null

  // from custom_properties.json
  tokens: CssToken[]

  // from Dev Kit Italia
  devKit: {
    entry: DevKitEntry | null
    component: DevKitComponent | null
    description: string | null
    storyVariants: {
      count: number
      available: string[]
      variants: ComponentVariant[]
    } | null
  }

  // from GitHub Issues
  openIssues: ComponentIssue[]

  // always present
  meta: {
    dataFetchedAt: string | null // sources snapshot date
    sourceUrls: string[]
    warnings: string[]
    stability: StabilityLevel
    versions?: DsVersions
    designersUrl?: string | null
  }
}