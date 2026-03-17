// src/loaders/devkit-parser.test.ts

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { parseStories } from './devkit-parser.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unclosedBraces(n = 20_000): string {
  return '{'.repeat(n)
}

function validStories(extra = ''): string {
  return `
const meta = {
  component: 'it-button',
  argTypes: {
    label: {
      description: 'Testo del bottone',
      control: 'text',
      table: { defaultValue: { summary: 'Click me' } },
    },
    disabled: {
      description: 'Disabilita il bottone',
      control: 'boolean',
      table: { defaultValue: { summary: 'false' } },
    },
    variant: {
      description: 'Variante visiva',
      control: 'select',
      options: ['primary', 'secondary', 'danger'],
    },
  },
}
${extra}
`
}

function storiesWithSub(): string {
  return validStories(`
export const WithIcon = {
  argTypes: {
    icon: {
      name: 'icon',
      description: 'Nome icona',
      control: 'text',
    },
  },
  render: () => \`<it-button><it-icon></it-icon></it-button>\`,
}
`)
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('parseStories — happy path', () => {
  it('estrae tagName', () => {
    const result = parseStories(validStories())
    assert.equal(result?.tagName, 'it-button')
  })

  it('estrae props principali', () => {
    const result = parseStories(validStories())
    const names = result?.props.map((p) => p.name) ?? []
    assert.ok(names.includes('label'))
    assert.ok(names.includes('disabled'))
    assert.ok(names.includes('variant'))
  })

  it('estrae description', () => {
    const result = parseStories(validStories())
    const label = result?.props.find((p) => p.name === 'label')
    assert.equal(label?.description, 'Testo del bottone')
  })

  it('estrae default value', () => {
    const result = parseStories(validStories())
    const label = result?.props.find((p) => p.name === 'label')
    assert.equal(label?.default, 'Click me')
  })

  it('estrae options per select', () => {
    const result = parseStories(validStories())
    const variant = result?.props.find((p) => p.name === 'variant')
    assert.deepEqual(variant?.options, ['primary', 'secondary', 'danger'])
  })

  it('estrae subcomponente', () => {
    const result = parseStories(storiesWithSub())
    assert.ok((result?.subcomponents?.length ?? 0) > 0)
  })

  it('restituisce null se manca component:', () => {
    const source = `
const meta = {
  argTypes: { label: { control: 'text' } },
}
`
    assert.equal(parseStories(source), null)
  })
})

// ─── MAX_ITERATIONS guard ─────────────────────────────────────────────────────

describe('parseStories — MAX_ITERATIONS guard', () => {
  let warnMessages: string[] = []
  const originalWarn = console.warn

  before(() => {
    console.warn = (...args: unknown[]) => {
      warnMessages.push(String(args[0]))
    }
  })

  after(() => {
    console.warn = originalWarn
  })

  beforeEach(() => {
    warnMessages = []
  })

  it('non logga warning con input valido', () => {
    parseStories(validStories())
    assert.equal(
      warnMessages.filter((m) => m.includes('[devkit-parser]')).length,
      0,
    )
  })

  it('non crasha con brace mai chiuse nel source', () => {
    const source = `
const meta = {
  component: 'it-alert',
  argTypes: ${unclosedBraces()},
}
`
    assert.doesNotThrow(() => parseStories(source))
  })

  it('logga console.warn quando scatta il limite', () => {
    const source = `
const meta = {
  component: 'it-alert',
  argTypes: ${unclosedBraces()},
}
`
    parseStories(source)
    assert.ok(warnMessages.some((m) => m.includes('[devkit-parser]')))
  })

  it('restituisce almeno tagName anche con argTypes corrotto', () => {
    const source = `
const meta = {
  component: 'it-alert',
  argTypes: ${unclosedBraces()},
}
`
    const result = parseStories(source)
    assert.equal(result?.tagName, 'it-alert')
  })

  it('non crasha con export block mai chiuso', () => {
    const source = validStories() + `\nexport const Broken = ${unclosedBraces()}`
    assert.doesNotThrow(() => parseStories(source))
  })

  it('restituisce props parziali se meta è ok ma un export è corrotto', () => {
    const source = validStories() + `\nexport const Broken = ${unclosedBraces()}`
    const result = parseStories(source)
    assert.ok((result?.props.length ?? 0) > 0)
    assert.notEqual(result?.subcomponents, undefined)
  })

  it('non crasha con prop con brace mai chiusa', () => {
    const source = `
const meta = {
  component: 'it-input',
  argTypes: {
    broken: ${unclosedBraces()},
    label: {
      description: 'Label',
      control: 'text',
    },
  },
}
`
    assert.doesNotThrow(() => parseStories(source))
  })
})

// ─── File malformati generici ─────────────────────────────────────────────────

describe('parseStories — input malformati', () => {
  it('stringa vuota → null', () => {
    assert.equal(parseStories(''), null)
  })

  it('source con solo spazi → null', () => {
    assert.equal(parseStories('   \n\t  '), null)
  })

  it('component: presente ma argTypes assente → props vuote', () => {
    const source = `
const meta = {
  component: 'it-badge',
}
`
    const result = parseStories(source)
    assert.equal(result?.tagName, 'it-badge')
    assert.deepEqual(result?.props, [])
  })

  it('prop con disable: true viene scartata', () => {
    const source = `
const meta = {
  component: 'it-card',
  argTypes: {
    hidden: {
      control: 'text',
      table: { disable: true },
    },
    title: {
      description: 'Titolo card',
      control: 'text',
    },
  },
}
`
    const result = parseStories(source)
    const names = result?.props.map((p) => p.name) ?? []
    assert.ok(!names.includes('hidden'))
    assert.ok(names.includes('title'))
  })

  it('subcomponente senza argTypes viene skippato silenziosamente', () => {
    const source =
      validStories() +
      `\nexport const NoArgTypes = { render: () => '<it-button></it-button>' }`
    assert.doesNotThrow(() => parseStories(source))
  })
})