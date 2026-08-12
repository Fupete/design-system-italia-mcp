import { z } from 'zod'

// ─── Shared ───────────────────────────────────────────────────────────────────

const ZVersions = z.object({
  designSystem: z.string(),
  bootstrapItalia: z.string(),
  devKitItalia: z.string(),
  designTokensItalia: z.string(),
})

export const ZMeta = z.object({
  dataFetchedAt: z.string().nullable(),
  sourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
  stability: z.enum(['beta', 'stable']),
  versions: ZVersions.optional(),
  designersUrl: z.string().optional(),
})

export const ZResolvedHop = z.object({
  name: z.string(),
  sourceName: z.string(),
  form: z.enum(['css-custom-property', 'sass-variable']),
  role: z.enum(['bsi-component', 'bsi-global', 'dti']),
  overridable: z.boolean(),
})

export const ZComposedRef = z.object({
  ref: z.string(),
  name: z.string(),
  value: z.string().nullable(),
  resolvedVia: z.array(ZResolvedHop),
})

const ZAmbiguousDeclaration = z.object({
  value: z.string(),
  description: z.string().nullable(),
  valueResolved: z.string().nullable(),
  resolvedVia: z.array(ZResolvedHop),
})

export const ZCssToken = z.object({
  name: z.string(),
  value: z.string(),
  valueType: z.enum(['token-reference', 'scss-expression', 'literal', 'composite']),
  valueResolved: z.string().nullable(),
  resolvedVia: z.array(ZResolvedHop),
  description: z.string().nullable(),
  valueResolvedNote: z.string().optional(),
  composedOf: z.array(ZComposedRef).optional(),
  declaredTimes: z.number().optional(),
  ambiguousValues: z.array(ZAmbiguousDeclaration).optional(),
})



// ─── get_component_tokens ─────────────────────────────────────────────────────

export const ZTokensListComponentVarsOutput = z.object({
  component: z.string(),
  total: z.number(),
  tokens: z.array(ZCssToken),
  summary: z.object({
    tokenReference: z.number(),
    literal: z.number(),
    scssExpression: z.number(),
    composite: z.number(),
    ambiguous: z.number(),
  }),
  meta: ZMeta.extend({
    note: z.string(),
    versions: ZVersions.optional(),
  }),
})

// ─── bsi_get_component_markup ─────────────────────────────────────────────────

export const ZBsiGetComponentMarkupOutput = z.object({
  component: z.string(),
  variant: z.string().nullable(),
  result: z.object({
    name: z.string(),
    html: z.string(),
  }).nullable(),
  meta: ZMeta,
})

// ─── devkit_get_component_markup ──────────────────────────────────────────────

export const ZDevkitGetComponentMarkupOutput = z.object({
  component: z.string(),
  variant: z.string().nullable(),
  result: z.object({
    name: z.string(),
    html: z.string(),
  }).nullable(),
  meta: ZMeta,
})

// ─── github_get_project_repo_links ────────────────────────────────────────────

export const ZGithubGetProjectRepoLinksOutput = z.object({
  board: z.object({
    repos: z.array(z.object({
      repo: z.string(),
      openIssuesUrl: z.string(),
    })),
    note: z.string(),
  }),
  projectBoard: z.object({
    url: z.string(),
    note: z.string(),
  }),
  meta: ZMeta,
})

// ─── Shared: status values, union rows, token pairs ───────────────────────────

const ZStatusValue = z.enum([
  'PRONTO', 'DA RIVEDERE A11Y', 'DA RIVEDERE', 'IN REVIEW',
  'DA COMPLETARE VARIANTI', 'NON PRESENTE', 'DA FARE', 'N/D',
])

// ─── bsi_list_component_variants / devkit_list_component_variants ─────────────
// Identical output shape — same schema, two names (mirrors the two tools).

const ZComponentVariantsList = z.object({
  component: z.string(),
  total: z.number(),
  variantsAvailable: z.array(z.string()),
  meta: ZMeta,
})
export const ZBsiListComponentVariantsOutput = ZComponentVariantsList
export const ZDevkitListComponentVariantsOutput = ZComponentVariantsList

// ─── devkit_list_component_props ───────────────────────────────────────────────

const ZWebComponentProp = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  default: z.string().nullable(),
  options: z.array(z.string()),
})

export const ZDevkitListComponentPropsOutput = z.object({
  component: z.string(),
  tagName: z.string().nullable(),
  props: z.array(ZWebComponentProp),
  subcomponents: z.array(z.object({
    tagName: z.string(),
    props: z.array(ZWebComponentProp),
  })),
  meta: ZMeta,
})

// ─── tokens_resolve ─────────────────────────────────────────────────────────────

const ZLiteralAmbiguous = z.object({
  component: z.string(),
  value: z.string(),
})

export const ZTokensResolveOutput = z.object({
  input: z.string(),
  normalizedName: z.string(),
  value: z.string().nullable(),
  resolvedVia: z.array(ZResolvedHop),
  ambiguousValues: z.array(ZLiteralAmbiguous).optional(),
  composedOf: z.array(ZComposedRef).optional(),
  meta: ZMeta,
})

// ─── tokens_find_components ─────────────────────────────────────────────────────

const ZTokenComponentMatch = z.object({
  component: z.string(),
  token: z.string(),
  resolvedVia: z.array(ZResolvedHop),
  valueResolved: z.string().nullable(),
  composedOf: z.array(ZComposedRef).optional(),
})

export const ZTokensFindComponentsOutput = z.object({
  query: z.string(),
  total: z.number(),
  results: z.array(ZTokenComponentMatch),
  meta: ZMeta,
})

// ─── docs_get_component_guide ───────────────────────────────────────────────────

export const ZDocsGetComponentGuideOutput = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  categories: z.array(z.string()),
  status: z.object({
    libraryStatus: z.object({
      bootstrapItalia: ZStatusValue,
      uiKitItalia: ZStatusValue,
      devKitItalia: ZStatusValue,
    }),
    accessibility: z.object({
      visivamenteAccessibile: ZStatusValue,
      amichevoleConLettoriDiSchermo: ZStatusValue,
      navigabile: ZStatusValue,
      comprensibile: ZStatusValue,
      checkCompleted: z.boolean(),
    }),
    notes: z.string().nullable(),
    knownIssueUrls: z.array(z.string()),
  }).nullable(),
  guidelines: z.object({
    whenToUse: z.string().nullable(),
    howToUse: z.string().nullable(),
  }).nullable(),
  devKit: z.object({
    slug: z.string(),
    tags: z.array(z.string()),
    storybookUrl: z.string(),
  }).nullable(),
  sourceUrls: z.object({
    designersItalia: z.string(),
    bsiDoc: z.string().nullable(),
    figma: z.string().nullable(),
    devKitDoc: z.string().nullable(),
  }),
  meta: ZMeta,
})

// ─── bsi_list_components_by_status ─────────────────────────────────────────────

export const ZBsiListComponentsByStatusOutput = z.object({
  status: z.string(),   // echoes the free-text query param, not validated against ZStatusValue
  total: z.number(),
  results: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    status: ZStatusValue,
    docUrl: z.string().nullable(),
  })),
  meta: ZMeta,
})

// ─── github_get_component_issues ───────────────────────────────────────────────

const ZComponentIssue = z.object({
  title: z.string(),
  url: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed']),
  createdAt: z.string(),
  labels: z.array(z.string()),
})

export const ZGithubGetComponentIssuesOutput = z.object({
  component: z.string(),
  name: z.string(),
  issues: z.object({
    live: z.object({
      total: z.number().nullable(),
      results: z.array(ZComponentIssue),
    }),
    known: z.object({
      total: z.number(),
      urls: z.array(z.string()),
      note: z.string(),
    }),
  }),
  meta: ZMeta,
})