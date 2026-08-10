import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseGuidelines } from './designers.js'
import type { RawDesignersJson } from './designers.js'

// ─── Fixtures ───────────────────────────────────────────────────────────────

function rawWithTabs(tabs: RawDesignersJson['tabs']): RawDesignersJson {
  return {
    components: {
      hero: {
        subtitle: 'A short description',
        kangaroo: { tagsDesignSystem: ['Messaggi'] },
      },
    },
    tabs,
  }
}

const usageTabContent: NonNullable<RawDesignersJson['tabs']>[number] = {
  title: 'Uso e accessibilità',
  sectionsEditorial: [
    {
      components: [
        { name: 'TextImageCta', title: 'Quando usarlo', text: 'When to use it' },
        { name: 'TextImageCta', title: 'Come usarlo', text: 'How to use it' },
      ],
    },
  ],
}

// ─── Tab matched by title — no fallback, no warning ────────────────────────

describe('parseGuidelines — tab matched by title', () => {
  it('extracts whenToUse/howToUse and sets tabWarning to null', () => {
    const raw = rawWithTabs([
      { title: 'Progettazione', sectionsEditorial: [] },
      usageTabContent,
      { title: 'Sviluppo', sectionsEditorial: [] },
    ])
    const { guidelines, tabWarning } = parseGuidelines(raw)

    assert.equal(tabWarning, null)
    assert.equal(guidelines.whenToUse, 'When to use it')
    assert.equal(guidelines.howToUse, 'How to use it')
    assert.equal(guidelines.description, 'A short description')
    assert.deepEqual(guidelines.categories, ['Messaggi'])
  })

  it('matches on "accessibilit" alone, title casing does not matter', () => {
    const raw = rawWithTabs([
      { title: 'ACCESSIBILITÀ E ALTRO', sectionsEditorial: usageTabContent.sectionsEditorial },
    ])
    const { tabWarning } = parseGuidelines(raw)
    assert.equal(tabWarning, null)
  })
})

// ─── Tab renamed upstream — fallback to first tab, warning surfaced ────────

describe('parseGuidelines — tab title match fails', () => {
  it('falls back to the first tab and returns a non-null tabWarning', () => {
    // Upstream renamed "Uso e accessibilità" to something that doesn't match
    // 'uso'/'accessibilit' — this is the #27 regression case: the fallback
    // used to run silently (dead warning check), now it must surface.
    const raw = rawWithTabs([
      { title: 'Panoramica', sectionsEditorial: usageTabContent.sectionsEditorial },
      { title: 'Sviluppo', sectionsEditorial: [] },
    ])
    const { guidelines, tabWarning } = parseGuidelines(raw)

    assert.notEqual(tabWarning, null)
    assert.match(tabWarning!, /Panoramica/)
    assert.match(tabWarning!, /not found by title/)
    // Fallback picked the first tab, which happens to still have the right
    // content in this fixture — the point is the warning fires regardless.
    assert.equal(guidelines.whenToUse, 'When to use it')
  })

  it('lists all tab titles seen in the warning, not just the fallback one', () => {
    const raw = rawWithTabs([
      { title: 'Panoramica', sectionsEditorial: [] },
      { title: 'Dettagli tecnici', sectionsEditorial: [] },
    ])
    const { tabWarning } = parseGuidelines(raw)
    assert.match(tabWarning!, /Panoramica/)
    assert.match(tabWarning!, /Dettagli tecnici/)
  })
})

// ─── No tabs at all — not a fallback case, no warning ──────────────────────

describe('parseGuidelines — no tabs present', () => {
  it('returns null whenToUse/howToUse and tabWarning null (nothing to fall back to)', () => {
    const raw = rawWithTabs([])
    const { guidelines, tabWarning } = parseGuidelines(raw)

    assert.equal(tabWarning, null)
    assert.equal(guidelines.whenToUse, null)
    assert.equal(guidelines.howToUse, null)
  })

  it('handles tabs entirely absent from the raw payload', () => {
    const raw: RawDesignersJson = { components: { hero: { subtitle: 'x' } } }
    const { guidelines, tabWarning } = parseGuidelines(raw)

    assert.equal(tabWarning, null)
    assert.equal(guidelines.whenToUse, null)
  })
})