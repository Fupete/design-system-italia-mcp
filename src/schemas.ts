import { z } from 'zod'

// ─── Shared ───────────────────────────────────────────────────────────────────

export const ZMeta = z.object({
  dataFetchedAt: z.string().nullable(),
  sourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
  stability: z.enum(['alpha', 'stable']),
})

export const ZCssToken = z.object({
  name: z.string(),
  value: z.string(),
  valueType: z.enum(['token-reference', 'scss-expression', 'literal']),
  valueResolved: z.string().nullable(),
  resolvedVia: z.array(z.string()),
  description: z.string().nullable(),
})

// ─── get_component_tokens ─────────────────────────────────────────────────────

export const ZGetComponentTokensOutput = z.object({
  component: z.string(),
  total: z.number(),
  tokens: z.array(ZCssToken),
  summary: z.object({
    tokenReference: z.number(),
    literal: z.number(),
    scssExpression: z.number(),
  }),
  meta: ZMeta.extend({
    note: z.string(),
  }),
})

// ─── get_component ─────────────────────────────────────────────────────────

export const ZStoryVariants = z.object({
  count: z.number(),
  available: z.array(z.string()),
  variants: z.array(z.object({
    name: z.string(),
    html: z.string(),
  })),
})

export const ZGetComponentOutput = z.object({
  name: z.string(),
  slug: z.string(),
  variantsCount: z.number(),
  variantsAvailable: z.array(z.string()),
  variants: z.array(z.object({
    name: z.string(),
    html: z.string(),
  })),
  devKit: z.object({
    slug: z.string(),
    tags: z.array(z.string()),
    storybookUrl: z.string(),
    pattern: z.enum(['dedicated', 'bundle']),
    componentType: z.enum(['web-component', 'html-bsi']),
    description: z.string().nullable(),
    storyVariants: ZStoryVariants.nullable(),
  }).nullable(),
  meta: ZMeta,
})

// ─── get_component_variant ─────────────────────────────────────────────────

export const ZGetComponentVariantOutput = z.object({
  component: z.string(),
  variantName: z.string(),
  results: z.array(z.object({
    name: z.string(),
    html: z.string(),
    source: z.enum(['bsi', 'devkit-story']),
  })),
  meta: ZMeta,
})

// ––– get status and guidelines ––––––––––––––––––––––––––––––––––––––––––––––––

export const ZStatusValue = z.enum([
  'PRONTO', 'DA RIVEDERE A11Y', 'DA RIVEDERE', 'IN REVIEW',
  'DA COMPLETARE VARIANTI', 'NON PRESENTE', 'DA FARE', 'N/D',
])

export const ZComponentStatus = z.object({
  slug: z.string(),
  name: z.string(),
  libraryStatus: z.object({
    bootstrapItalia: ZStatusValue,
    uiKitItalia: ZStatusValue,
  }),
  accessibility: z.object({
    visivamenteAccessibile: ZStatusValue,
    amichevoleConLettoriDiSchermo: ZStatusValue,
    navigabile: ZStatusValue,
    comprensibile: ZStatusValue,
    checkCompleted: z.boolean(),
  }),
  knownIssueUrls: z.array(z.string()),
  notes: z.string().nullable(),
  sourceUrls: z.object({
    bsiDoc: z.string().nullable(),
    figma: z.string().nullable(),
  }),
})

export const ZComponentGuidelines = z.object({
  description: z.string().nullable(),
  categories: z.array(z.string()),
  whenToUse: z.string().nullable(),
  howToUse: z.string().nullable(),
})

// ─── get_component_full ───────────────────────────────────────────────────────

export const ZGetComponentFullOutput = z.object({
  name: z.string(),
  slug: z.string(),
  status: ZComponentStatus.nullable(),
  variantsCount: z.number(),
  variantsAvailable: z.array(z.string()),
  variants: z.array(z.object({
    name: z.string(),
    html: z.string(),
  })),
  guidelines: ZComponentGuidelines.nullable(),
  tokens: z.array(ZCssToken),
  devKit: z.object({
    entry: z.object({
      slug: z.string(),
      tags: z.array(z.string()),
      storybookUrl: z.string(),
      importPath: z.string(),
      variants: z.array(z.string()),
      pattern: z.enum(['dedicated', 'bundle']),
      componentType: z.enum(['web-component', 'html-bsi']),
    }).nullable(),
    component: z.object({
      tagName: z.string(),
      props: z.array(z.object({
        name: z.string(),
        type: z.string(),
        description: z.string().nullable(),
        default: z.string().nullable(),
        options: z.array(z.string()),
      })),
      subcomponents: z.array(z.object({
        tagName: z.string(),
        props: z.array(z.object({
          name: z.string(),
          type: z.string(),
          description: z.string().nullable(),
          default: z.string().nullable(),
          options: z.array(z.string()),
        })),
      })),
    }).nullable(),
    description: z.string().nullable(),
    storyVariants: ZStoryVariants.nullable(),
  }),
  openIssues: z.array(z.object({
    title: z.string(),
    url: z.string(),
    repo: z.string(),
    state: z.enum(['open', 'closed']),
    createdAt: z.string(),
    labels: z.array(z.string()),
  })),
  meta: ZMeta.extend({
    versions: z.object({
      designSystem: z.string(),
      bootstrapItalia: z.string(),
      devKitItalia: z.string(),
    }).optional(),
    designersUrl: z.string().nullable().optional(),
  }),
  sources_available: z.array(z.string()),
})