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
  valueResolved: string | null  // 1.5rem — da Design Tokens Italia
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
  importPath: string     // path esatto stories.ts
  variants: string[]     // nomi export stories in italiano
  pattern: 'dedicated' | 'bundle'
}

export interface WebComponentProp {
  name: string           // nome attributo HTML (es. background-active)
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
  description: string | null
}

// ─── GitHub Issues ────────────────────────────────────────────────────────────

export interface ComponentIssue {
  title: string
  url: string
  repo: string
  state: 'open' | 'closed'
  createdAt: string
  labels: string[]
}

// ─── Design System — metadati navigazione e versioni ─────────────────────────

export interface DsVersions {
  designSystem: string        // da dsnav.yaml, es. "v1.10.1"
  bootstrapItalia: string     // da BSI package.json, es. "3.0.0-alpha.2"
  devKitItalia: string        // da Dev Kit package.json
}

export interface DsNavEntry {
  label: string
  url: string                 // URL relativo
  absoluteUrl: string         // https://designers.italia.it/...
}

// ─── Risposta aggregata get_component_full ────────────────────────────────────

export type StabilityLevel = 'alpha' | 'stable'

export interface ComponentFull {
  name: string
  slug: string

  // da ComponentStatus
  status: ComponentStatus | null

  // da api/componenti/{slug}.json
  variants: ComponentVariant[]

  // da ComponentGuidelines
  guidelines: ComponentGuidelines | null

  // da custom_properties.json
  tokens: CssToken[]

  // da Dev Kit Italia
  devKit: {
    entry: DevKitEntry | null
    component: DevKitComponent | null
  }

  // da GitHub Issues
  openIssues: ComponentIssue[]

  // meta sempre presente
  meta: {
    fetchedAt: string
    sourceUrls: string[]
    warnings: string[]
    stability: StabilityLevel
    versions?: DsVersions        
    designersUrl?: string | null 
  }
}