import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionRows, devKitUrlMismatch } from './helpers.js'
import type { ComponentStatus, DevKitEntry } from '../types.js'

// ─── Fixtures ───────────────────────────────────────────────────────────────

function status(slug: string, name: string): ComponentStatus {
  return {
    slug,
    name,
    libraryStatus: { bootstrapItalia: 'PRONTO', uiKitItalia: 'PRONTO', devKitItalia: 'PRONTO' },
    accessibility: {
      visivamenteAccessibile: 'PRONTO',
      amichevoleConLettoriDiSchermo: 'PRONTO',
      navigabile: 'PRONTO',
      comprensibile: 'PRONTO',
      checkCompleted: true,
    },
    sourceUrls: { bsiDoc: null, figma: null, devKitDoc: null },
    notes: null,
    knownIssueUrls: [],
  }
}

function devKitEntry(overrides: Partial<DevKitEntry> & Pick<DevKitEntry, 'slug' | 'id'>): DevKitEntry {
  return {
    displayName: overrides.slug,
    tags: [],
    storybookUrl: `https://example/${overrides.slug}`,
    importPath: `./stories/${overrides.slug}.mdx`,
    variants: [],
    pattern: 'dedicated',
    componentType: 'web-component',
    ...overrides,
  }
}

// ─── Identity is entry.id, not slug ────────────────────────────────────────

describe('unionRows — identity by entry.id', () => {
  it('matches BSI to Dev Kit via slugsToTry alias', () => {
    const statuses = new Map([['buttons', status('buttons', 'Buttons')]])
    const devKit = new Map([['button', devKitEntry({ slug: 'button', id: 'componenti-button--documentazione' })]])
    const rows = unionRows(statuses, devKit)
    assert.equal(rows.length, 1)
    assert.ok(rows[0].devkit)
    assert.equal(rows[0].bsi?.status.bootstrapItalia, 'PRONTO')
  })

  it('does not swallow a real, distinct Dev Kit entry that merely shares an alias slug', () => {
    // "chips" aliases to "chip" via slugsToTry, but a genuine separate "tag"
    // entry also aliases to "chips" in the alias table — they must not collapse.
    const statuses = new Map([['chips', status('chips', 'Chips')]])
    const devKit = new Map([
      ['chip', devKitEntry({ slug: 'chip', id: 'componenti-chip--documentazione' })],
      ['tag', devKitEntry({ slug: 'tag', id: 'componenti-tag--documentazione' })],
    ])
    const rows = unionRows(statuses, devKit)
    // Both Dev Kit entries must appear: one matched to "chips", one standalone.
    const devkitRows = rows.filter((r) => r.devkit !== null)
    assert.equal(devkitRows.length, 2)
  })

  it('two BSI slugs aliasing to the same Dev Kit entry do not duplicate it', () => {
    const statuses = new Map([
      ['sections', status('sections', 'Sections')],
      ['section', status('section', 'Section')],
    ])
    const devKit = new Map([['section', devKitEntry({ slug: 'section', id: 'componenti-section--documentazione' })]])
    const rows = unionRows(statuses, devKit)
    const devkitRows = rows.filter((r) => r.devkit !== null)
    assert.equal(devkitRows.length, 1)
  })

  it('every Dev Kit entry appears in exactly one row', () => {
    const statuses = new Map([['accordion', status('accordion', 'Accordion')]])
    const devKit = new Map([
      ['accordion', devKitEntry({ slug: 'accordion', id: 'componenti-accordion--documentazione' })],
      ['icon', devKitEntry({ slug: 'icon', id: 'componenti-icon--documentazione' })],
    ])
    const rows = unionRows(statuses, devKit)
    const devkitRows = rows.filter((r) => r.devkit !== null)
    assert.equal(devkitRows.length, devKit.size)
  })

  it('exact slug match wins over an alias match, regardless of iteration order', () => {
    // Dev Kit has "button" (exact match for BSI "button") but BSI also
    // has "buttons", which aliases to "button" too. "button" must win.
    const statuses = new Map([
      ['buttons', status('buttons', 'Buttons')],
      ['button', status('button', 'Button')],
    ])
    const devKit = new Map([['button', devKitEntry({ slug: 'button', id: 'componenti-button--documentazione' })]])
    const rows = unionRows(statuses, devKit)
    const withDevkit = rows.filter((r) => r.devkit !== null)
    assert.equal(withDevkit.length, 1)
    assert.equal(withDevkit[0].slug, 'button')   // exact match, not the alias "buttons"
  })
})

// ─── DevKit-only rows ───────────────────────────────────────────────────────

describe('unionRows — Dev Kit-only components', () => {
  it('a Dev Kit entry with no BSI counterpart appears with bsi: null', () => {
    const statuses = new Map<string, ComponentStatus>()
    const devKit = new Map([['icon', devKitEntry({ slug: 'icon', id: 'componenti-icon--documentazione', displayName: 'Icon' })]])
    const rows = unionRows(statuses, devKit)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].bsi, null)
    assert.equal(rows[0].name, 'Icon')
  })
})

// ─── devKitUrlMismatch ──────────────────────────────────────────────────────

describe('devKitUrlMismatch', () => {
  it('returns null when URLs match', () => {
    assert.equal(devKitUrlMismatch('accordion', 'https://a', 'https://a'), null)
  })

  it('flags a mismatch between board and Storybook URL', () => {
    const result = devKitUrlMismatch('accordion', 'https://board/accordion', 'https://storybook/accordion')
    assert.match(result!, /mismatch/)
    assert.match(result!, /accordion/)
  })

  it('returns null when either URL is missing — nothing to compare', () => {
    assert.equal(devKitUrlMismatch('accordion', null, 'https://storybook/accordion'), null)
    assert.equal(devKitUrlMismatch('accordion', 'https://board/accordion', undefined), null)
    assert.equal(devKitUrlMismatch('accordion', null, null), null)
  })
})