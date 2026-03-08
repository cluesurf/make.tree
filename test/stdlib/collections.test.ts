/**
 * End-to-end tests: load collection stdlib files (list, maybe, result,
 * pair, boolean, walk) through the full compiler pipeline and verify
 * they parse, desugar, and codegen with all new kindbook-ported operations.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import { castBook as castHVM } from '@/cast/hvm'
import {
  resolveStdlib,
  setStdlibRoot,
  clearStdlibCache,
} from '@/stdlib'
import type { Book } from '@/term/form'
import type { SurfCard } from '@/surf/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

const stdlibRoot = path.resolve(__dirname, '../../../')

const parse = (input: { file: string; text: string }) =>
  makeTree(input)

beforeEach(() => {
  clearStdlibCache()
  setStdlibRoot({ root: stdlibRoot })
})

function loadStdlib(pkgPath: string): SurfCard {
  const card = resolveStdlib({ loadPath: pkgPath, parse })
  if (!card) throw new Error(`Failed to load: ${pkgPath}`)
  return card
}

function desugar(card: SurfCard): Book {
  return desugarCard({ card }).book
}

// ── List ────────────────────────────────────────────────────────────

describe('list form', () => {
  it('parses and desugars with all task signatures', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    // Existing tasks
    expect(book.has('push')).toBe(true)
    expect(book.has('pop')).toBe(true)
    expect(book.has('get')).toBe(true)
    expect(book.has('set')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('is-empty')).toBe(true)
    expect(book.has('map')).toBe(true)
    expect(book.has('filter')).toBe(true)
    expect(book.has('reduce')).toBe(true)
    expect(book.has('reverse')).toBe(true)
    expect(book.has('sort')).toBe(true)
    expect(book.has('concat')).toBe(true)
    expect(book.has('has')).toBe(true)
    expect(book.has('get-first')).toBe(true)
    expect(book.has('get-last')).toBe(true)
    expect(book.has('insert')).toBe(true)
    expect(book.has('remove')).toBe(true)
    expect(book.has('join')).toBe(true)
    expect(book.has('slice')).toBe(true)
  })

  it('has new kindbook-ported search tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    expect(book.has('find')).toBe(true)
    expect(book.has('find-index')).toBe(true)
    expect(book.has('any')).toBe(true)
    expect(book.has('all')).toBe(true)
  })

  it('has new kindbook-ported slice tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    expect(book.has('take')).toBe(true)
    expect(book.has('drop')).toBe(true)
    expect(book.has('take-while')).toBe(true)
    expect(book.has('drop-while')).toBe(true)
    expect(book.has('split-at')).toBe(true)
    expect(book.has('chunks')).toBe(true)
  })

  it('has new kindbook-ported transform tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    expect(book.has('flatten')).toBe(true)
    expect(book.has('flat-map')).toBe(true)
    expect(book.has('zip')).toBe(true)
    expect(book.has('zip-with')).toBe(true)
    expect(book.has('unzip')).toBe(true)
    expect(book.has('enumerate')).toBe(true)
    expect(book.has('dedup')).toBe(true)
    expect(book.has('intersperse')).toBe(true)
    expect(book.has('swap')).toBe(true)
  })

  it('has new kindbook-ported comparison tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    expect(book.has('starts-with')).toBe(true)
    expect(book.has('ends-with')).toBe(true)
  })

  it('has new kindbook-ported aggregate tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)

    expect(book.has('min')).toBe(true)
    expect(book.has('max')).toBe(true)
    expect(book.has('sum')).toBe(true)
    expect(book.has('product')).toBe(true)
  })

  it('generates TypeScript output', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts.length).toBeGreaterThan(0)
    expect(ts).toContain('List')
  })

  it('generates Rust output', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })

  it('generates HVM output', () => {
    const card = loadStdlib('@cluesurf/base/code/list')
    const book = desugar(card)
    const hvm = castHVM({ book })
    expect(typeof hvm).toBe('string')
  })
})

// ── Maybe ───────────────────────────────────────────────────────────

describe('maybe form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has ADT with some/none cases', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)
    const term = book.get('maybe')!
    expect(term.form).toBe('adt')
    if (term.form === 'adt') {
      const names = term.ctrs.map(c => c.name)
      expect(names).toContain('some')
      expect(names).toContain('none')
    }
  })

  it('has kindbook-ported operations', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)

    expect(book.has('map')).toBe(true)
    expect(book.has('bind')).toBe(true)
    expect(book.has('unwrap')).toBe(true)
    expect(book.has('unwrap-or')).toBe(true)
    expect(book.has('unwrap-or-else')).toBe(true)
    expect(book.has('is-some')).toBe(true)
    expect(book.has('is-none')).toBe(true)
    expect(book.has('filter')).toBe(true)
    expect(book.has('flatten')).toBe(true)
    expect(book.has('to-list')).toBe(true)
    expect(book.has('to-result')).toBe(true)
    expect(book.has('or')).toBe(true)
  })

  it('generates TypeScript with Maybe type', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Maybe')
  })

  it('generates Rust output', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })

  it('generates HVM output', () => {
    const card = loadStdlib('@cluesurf/base/code/maybe')
    const book = desugar(card)
    const hvm = castHVM({ book })
    expect(typeof hvm).toBe('string')
  })
})

// ── Result ──────────────────────────────────────────────────────────

describe('result form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/result')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has ADT with okay/error cases', () => {
    const card = loadStdlib('@cluesurf/base/code/result')
    const book = desugar(card)
    const term = book.get('result')!
    expect(term.form).toBe('adt')
    if (term.form === 'adt') {
      const names = term.ctrs.map(c => c.name)
      expect(names).toContain('okay')
      expect(names).toContain('error')
    }
  })

  it('has kindbook-ported operations', () => {
    const card = loadStdlib('@cluesurf/base/code/result')
    const book = desugar(card)

    expect(book.has('map')).toBe(true)
    expect(book.has('map-error')).toBe(true)
    expect(book.has('bind')).toBe(true)
    expect(book.has('unwrap')).toBe(true)
    expect(book.has('unwrap-or')).toBe(true)
    expect(book.has('unwrap-error')).toBe(true)
    expect(book.has('is-okay')).toBe(true)
    expect(book.has('is-error')).toBe(true)
    expect(book.has('to-maybe')).toBe(true)
    expect(book.has('flatten')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/result')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Result')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/result')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })
})

// ── Boolean ─────────────────────────────────────────────────────────

describe('boolean form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has ADT with true/false cases', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)
    const term = book.get('boolean')!
    expect(term.form).toBe('adt')
    if (term.form === 'adt') {
      const names = term.ctrs.map(c => c.name)
      expect(names).toContain('true')
      expect(names).toContain('false')
    }
  })

  it('has kindbook-ported operations', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)

    expect(book.has('and')).toBe(true)
    expect(book.has('or')).toBe(true)
    expect(book.has('not')).toBe(true)
    expect(book.has('xor')).toBe(true)
    expect(book.has('nand')).toBe(true)
    expect(book.has('to-text')).toBe(true)
  })

  it('generates TypeScript with Boolean type', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Boolean')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })

  it('generates HVM', () => {
    const card = loadStdlib('@cluesurf/base/code/boolean')
    const book = desugar(card)
    const hvm = castHVM({ book })
    expect(typeof hvm).toBe('string')
  })
})

// ── Pair ────────────────────────────────────────────────────────────

describe('pair form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/pair')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has kindbook-ported operations', () => {
    const card = loadStdlib('@cluesurf/base/code/pair')
    const book = desugar(card)

    expect(book.has('map-first')).toBe(true)
    expect(book.has('map-second')).toBe(true)
    expect(book.has('swap')).toBe(true)
    expect(book.has('to-list')).toBe(true)
    expect(book.has('map-both')).toBe(true)
  })

  it('generates TypeScript with Pair type', () => {
    const card = loadStdlib('@cluesurf/base/code/pair')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Pair')
    expect(ts).toContain('first')
    expect(ts).toContain('second')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/pair')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })
})

// ── Walk (Iterator) ─────────────────────────────────────────────────

describe('walk form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/walk')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has existing iterator tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/walk')
    const book = desugar(card)

    expect(book.has('get-next')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('map')).toBe(true)
    expect(book.has('filter')).toBe(true)
    expect(book.has('collect')).toBe(true)
    expect(book.has('reduce')).toBe(true)
    expect(book.has('zip')).toBe(true)
    expect(book.has('flatten')).toBe(true)
    expect(book.has('get-first')).toBe(true)
    expect(book.has('partition')).toBe(true)
    expect(book.has('test-all')).toBe(true)
    expect(book.has('test-any')).toBe(true)
  })

  it('has new kindbook-ported iterator tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/walk')
    const book = desugar(card)

    expect(book.has('take')).toBe(true)
    expect(book.has('drop')).toBe(true)
    expect(book.has('take-while')).toBe(true)
    expect(book.has('drop-while')).toBe(true)
    expect(book.has('enumerate')).toBe(true)
    expect(book.has('chain')).toBe(true)
    expect(book.has('find')).toBe(true)
    expect(book.has('count')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/walk')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Walk')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/walk')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })
})

// ── Ordered Set ─────────────────────────────────────────────────────

describe('ordered-set form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/list/ordered-set')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has all set operations', () => {
    const card = loadStdlib('@cluesurf/base/code/list/ordered-set')
    const book = desugar(card)

    expect(book.has('make')).toBe(true)
    expect(book.has('insert')).toBe(true)
    expect(book.has('remove')).toBe(true)
    expect(book.has('contains')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('is-empty')).toBe(true)
    expect(book.has('union')).toBe(true)
    expect(book.has('intersect')).toBe(true)
    expect(book.has('difference')).toBe(true)
    expect(book.has('to-list')).toBe(true)
    expect(book.has('min')).toBe(true)
    expect(book.has('max')).toBe(true)
    expect(book.has('filter')).toBe(true)
    expect(book.has('fold')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/list/ordered-set')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('OrderedSet')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/list/ordered-set')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })
})

// ── Trees ───────────────────────────────────────────────────────────

describe('red-black-tree form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/red-black-tree')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has all tree operations', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/red-black-tree')
    const book = desugar(card)

    expect(book.has('get')).toBe(true)
    expect(book.has('set')).toBe(true)
    expect(book.has('has')).toBe(true)
    expect(book.has('remove')).toBe(true)
    expect(book.has('keys')).toBe(true)
    expect(book.has('values')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('is-empty')).toBe(true)
    expect(book.has('min')).toBe(true)
    expect(book.has('max')).toBe(true)
    expect(book.has('clear')).toBe(true)
    expect(book.has('to-list')).toBe(true)
    expect(book.has('fold')).toBe(true)
    expect(book.has('filter')).toBe(true)
    expect(book.has('map-values')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/red-black-tree')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('RedBlackTree')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/red-black-tree')
    const book = desugar(card)
    const rs = castRust({ book })
    expect(rs.length).toBeGreaterThan(0)
  })
})

describe('trie form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/trie')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has all trie operations', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/trie')
    const book = desugar(card)

    expect(book.has('get')).toBe(true)
    expect(book.has('set')).toBe(true)
    expect(book.has('has')).toBe(true)
    expect(book.has('remove')).toBe(true)
    expect(book.has('keys')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('is-empty')).toBe(true)
    expect(book.has('starts-with')).toBe(true)
    expect(book.has('clear')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/trie')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('Trie')
  })
})

describe('b-plus-tree form', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/b-plus-tree')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('has all b-plus-tree operations', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/b-plus-tree')
    const book = desugar(card)

    expect(book.has('get')).toBe(true)
    expect(book.has('set')).toBe(true)
    expect(book.has('has')).toBe(true)
    expect(book.has('remove')).toBe(true)
    expect(book.has('range')).toBe(true)
    expect(book.has('get-size')).toBe(true)
    expect(book.has('is-empty')).toBe(true)
    expect(book.has('min')).toBe(true)
    expect(book.has('max')).toBe(true)
    expect(book.has('clear')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/tree/b-plus-tree')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('BPlusTree')
  })
})

// ── Parser ──────────────────────────────────────────────────────────

describe('parser forms', () => {
  it('parses parser/state', () => {
    const card = loadStdlib('@cluesurf/base/code/parser/state')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('parses parser/error', () => {
    const card = loadStdlib('@cluesurf/base/code/parser/error')
    const book = desugar(card)
    expect(book.size).toBeGreaterThan(0)
  })

  it('state has input and index fields', () => {
    const card = loadStdlib('@cluesurf/base/code/parser/state')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('input')
    expect(ts).toContain('index')
  })

  it('error has index and note fields', () => {
    const card = loadStdlib('@cluesurf/base/code/parser/error')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('index')
    expect(ts).toContain('note')
  })
})
