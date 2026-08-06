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
  stability: z.enum(['alpha', 'stable']),
  versions: ZVersions.optional(),
})

const ZResolvedHop = z.object({
  name: z.string(),
  sourceName: z.string(),
  form: z.enum(['css-custom-property', 'sass-variable']),
  role: z.enum(['bsi-component', 'bsi-global', 'dti']),
  overridable: z.boolean(),
})

export const ZCssToken = z.object({
  name: z.string(),
  value: z.string(),
  valueType: z.enum(['token-reference', 'scss-expression', 'literal']),
  valueResolved: z.string().nullable(),
  resolvedVia: z.array(ZResolvedHop),
  description: z.string().nullable(),
  valueResolvedNote: z.string().optional(),
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