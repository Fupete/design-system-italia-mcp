// src/loaders/devkit-parser.ts
// ─── Dev Kit web component props parser ──────────────────────────────────────
// Extracts tagName, props (argTypes) and subcomponents from stories.ts files.
// Used by both the loader (runtime fallback) and snapshot-static.ts (CI).

import type { DevKitComponent, WebComponentProp } from '../types.js'

function extractArgTypesBlock(source: string, exportName?: string): string | null {
  const pattern = exportName
    ? new RegExp(`export const ${exportName}[\\s\\S]*?argTypes:\\s*\\{`, 's')
    : /const meta[\s\S]*?argTypes:\s*\{/s
  const startMatch = source.match(pattern)
  if (!startMatch) return null
  const startIdx = (startMatch.index ?? 0) + startMatch[0].length - 1
  let depth = 0, i = startIdx
  while (i < source.length) {
    if (source[i] === '{') depth++
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(startIdx, i + 1) }
    i++
  }
  return null
}

function extractExportBlock(source: string, exportName: string): string | null {
  const start = source.indexOf(`export const ${exportName}`)
  if (start === -1) return null
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) return null
  let depth = 0, i = braceStart
  while (i < source.length) {
    if (source[i] === '{') depth++
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(braceStart, i + 1) }
    i++
  }
  return null
}

function findArgTypesInBlock(block: string): string | null {
  const match = block.match(/argTypes:\s*\{/)
  if (!match) return null
  const startIdx = (match.index ?? 0) + match[0].length - 1
  let depth = 0, i = startIdx
  while (i < block.length) {
    if (block[i] === '{') depth++
    if (block[i] === '}') { depth--; if (depth === 0) return block.slice(startIdx, i + 1) }
    i++
  }
  return null
}

function parseProp(name: string, block: string): WebComponentProp | null {
  const propPattern = new RegExp(`${name}:\\s*\\{`, 's')
  const startMatch = block.match(propPattern)
  if (!startMatch) return null
  const startIdx = (startMatch.index ?? 0) + startMatch[0].length - 1
  let depth = 0, i = startIdx
  while (i < block.length) {
    if (block[i] === '{') depth++
    if (block[i] === '}') { depth--; if (depth === 0) break }
    i++
  }
  const propBlock = block.slice(startIdx, i + 1)
  if (propBlock.includes('disable: true')) return null
  const descMatch = propBlock.match(/description:\s*("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)/)
  const desc = descMatch ? descMatch[1].slice(1, -1).trim() : null
  const control = propBlock.match(/control:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    propBlock.match(/control:\s*\{[^}]*type:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    'text'
  const defaultVal = propBlock.match(/summary:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? null
  const optionsMatch = propBlock.match(/options:\s*\[([^\]]+)\]/)
  const options = optionsMatch
    ? optionsMatch[1].match(/['"`]([^'"`]+)['"`]/g)?.map((s) => s.replace(/['"`]/g, '')) ?? []
    : []
  const htmlName = propBlock.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? name
  return { name: htmlName, type: control, description: desc, default: defaultVal, options }
}

function extractPropKeys(argTypesBlock: string): string[] {
  const keys: string[] = []
  const matches = argTypesBlock.matchAll(/^\s{2,4}(\w+):\s*\{/gm)
  for (const m of matches) keys.push(m[1])
  return keys
}

function extractSubcomponentExports(source: string): string[] {
  const exports: string[] = []
  const matches = source.matchAll(/^export const (\w+)\s*=/gm)
  for (const m of matches) {
    if (m[1] !== 'default' && /^[A-Z]/.test(m[1])) exports.push(m[1])
  }
  return exports
}

function extractTagName(source: string): string | null {
  return source.match(/^\s*component:\s*['"`](it-[a-z0-9-]+)['"`]\s*,?$/m)?.[1] ?? null
}

function extractSubTagNames(source: string, exportName: string): string[] {
  const block = extractExportBlock(source, exportName) ?? ''
  const tags = new Set<string>()
  const matches = block.matchAll(/<(it-[a-z0-9-]+)/g)
  for (const m of matches) tags.add(m[1])
  return [...tags]
}

export function parseStories(source: string): DevKitComponent | null {
  const tagName = extractTagName(source)
  if (!tagName) return null
  const metaArgTypes = extractArgTypesBlock(source)
  const mainProps: WebComponentProp[] = []
  if (metaArgTypes) {
    const keys = extractPropKeys(metaArgTypes)
    for (const key of keys) {
      const prop = parseProp(key, metaArgTypes)
      if (prop) mainProps.push(prop)
    }
  }
  const subExports = extractSubcomponentExports(source)
  const subcomponents: DevKitComponent['subcomponents'] = []
  for (const exportName of subExports) {
    const exportBlock = extractExportBlock(source, exportName)
    const argTypesBlock = exportBlock ? findArgTypesInBlock(exportBlock) : null
    if (!argTypesBlock) continue
    const subTagNames = extractSubTagNames(source, exportName)
    const subTagName = subTagNames.find((t) => t !== tagName)
    if (!subTagName) continue
    const subProps: WebComponentProp[] = []
    const keys = extractPropKeys(argTypesBlock)
    for (const key of keys) {
      const prop = parseProp(key, argTypesBlock)
      if (prop) subProps.push(prop)
    }
    if (subProps.length > 0) subcomponents.push({ tagName: subTagName, props: subProps })
  }
  const desc = source.match(/component:\s*`([\s\S]*?)`/)?.[1]?.trim() ?? null
  return { tagName, props: mainProps, subcomponents, description: desc }
}