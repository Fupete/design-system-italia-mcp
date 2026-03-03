import { z } from 'zod'

// ─── Shared ───────────────────────────────────────────────────────────────────

export const ZMeta = z.object({
  fetchedAt: z.string(),
  sourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
  stability: z.enum(['alpha', 'stable']),
})

export const ZCssToken = z.object({
  name: z.string(),
  value: z.string(),
  valueType: z.enum(['token-reference', 'scss-expression', 'literal']),
  valueResolved: z.string().nullable(),
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

// ─── get_component_full ───────────────────────────────────────────────────────

export const ZGetComponentFullOutput = z.object({
  name: z.string(),
  slug: z.string(),
  status: z.any().nullable(),
  variants: z.array(z.object({
    name: z.string(),
    html: z.string(),
  })),
  guidelines: z.any().nullable(),
  tokens: z.array(ZCssToken),
  devKit: z.object({
    entry: z.any().nullable(),
    component: z.any().nullable(),
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