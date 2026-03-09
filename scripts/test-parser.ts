#!/usr/bin/env tsx
import { parseStoryVariants } from '../src/loaders/devkit.js'

// P1 — inline render
const p1 = `
import { html } from 'lit';
type Story = any;
export const Base: Story = {
  name: 'Sidebar semplice',
  render: () => html\`<div class="sidebar">contenuto</div>\`,
};
export const ConIcone: Story = {
  name: 'Con icone',
  render: () => html\`<div class="sidebar icon">\${'test'}</div>\`,
};
`

// P2 — function body
const p2 = `
import { html } from 'lit';
type Story = any;
export const Chiusura: Story = {
  name: 'Alert chiudibile',
  render: () => {
    function handleClose() { console.log('close') }
    return html\`<div class="alert">\${handleClose}</div>\`
  },
};
`

// P3 — variable reference
const p3 = `
import { html } from 'lit';
type Story = any;
const basicTable = html\`<table class="table"><tr><td>cella</td></tr></table>\`;
export const TabellaBase: Story = {
  name: 'Tabella base',
  render: () => html\`\${basicTable}\`,
};
`

// Skip !dev
const skip = `
import { html } from 'lit';
type Story = any;
export const Placeholder: Story = {
  tags: ['!autodocs', '!dev'],
  render: () => html\`<div>hidden</div>\`,
};
export const Visibile: Story = {
  name: 'Visibile',
  render: () => html\`<div>shown</div>\`,
};
`

// Sticky — args-driven, no render in stories → 0 variants is correct
const sticky = `
import { html } from 'lit';
type Story = any;
const meta = {
  render: (args: any) => html\`<it-sticky>\${args}</it-sticky>\`,
};
export default meta;
export const Offset: Story = {
  args: { paddingTop: 50 },
};
export const Fixed: Story = {
  tags: ['!dev'],
};
`

function test(label: string, source: string, expected: number) {
  const result = parseStoryVariants(source)
  const ok = result.length === expected
  console.log(`${ok ? '✅' : '❌'} ${label}: ${result.length} variants (expected ${expected})`)
  for (const v of result) {
    console.log(`   "${v.name}" → ${v.html.slice(0, 60)}...`)
  }
  if (!ok) process.exitCode = 1
}

test('P1 inline', p1, 2)
test('P2 function body', p2, 1)
test('P3 variable ref', p3, 1)
test('Skip !dev', skip, 1)
test('Sticky args-driven (0 is correct)', sticky, 0)

// ─── Live check — real upstream stories.ts ───────────────────────────────────

if (process.argv.includes('--live')) {
  const { loadDevKitIndex } = await import('../src/loaders/devkit.js')
  const { DEVKIT_STORIES_URL } = await import('../src/constants.js')

  const index = await loadDevKitIndex()
  let passed = 0, failed = 0

  for (const [slug, entry] of index) {
    const url = DEVKIT_STORIES_URL(entry.importPath)
    try {
      const res = await fetch(url)
      if (!res.ok) { console.log(`⚠️  ${slug}: HTTP ${res.status}`); continue }
      const source = await res.text()
      const variants = parseStoryVariants(source)
      if (variants.length > 0) {
        console.log(`✅ ${slug} (${entry.pattern}): ${variants.length} story variants`)
        passed++
      } else {
        console.log(`❌ ${slug} (${entry.pattern}): 0 story variants — possible new pattern (or not)`)
        failed++
      }
    } catch (err) {
      console.log(`⚠️  ${slug}: ${(err as Error).message}`)
    }
  }

  console.log(`\n${passed}/${passed + failed} components parsed`)
  if (failed > 0) process.exitCode = 1
}