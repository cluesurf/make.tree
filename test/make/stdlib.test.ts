/**
 * Stdlib compilation tests.
 *
 * Compiles core data type .tree files through the full pipeline
 * and verifies the TypeScript output is correct and functional.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): string {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book } = desugarCard({ card })
  return castBook({ book })
}

describe('stdlib: Bool', () => {
  const ts = compileFile('stdlib-bool.tree')

  it('generates bool-not with pattern match', () => {
    expect(ts).toContain('export function boolNot(a)')
    // 2-case ADTs use if/else, not switch
    expect(ts).toContain('.$ === 0')
  })

  it('generates bool-and with two parameters', () => {
    expect(ts).toContain('export function boolAnd(a, b)')
  })

  it('generates bool-or with two parameters', () => {
    expect(ts).toContain('export function boolOr(a, b)')
  })

  it('generates bool-xor', () => {
    expect(ts).toContain('export function boolXor(a, b)')
  })

  it('generates bool-eq', () => {
    expect(ts).toContain('export function boolEq(a, b)')
  })

  it('uses numeric constructor tags for true/false', () => {
    expect(ts).toContain('{ $: 0 }')
    expect(ts).toContain('{ $: 1 }')
  })
})

describe('stdlib: Maybe', () => {
  const ts = compileFile('stdlib-maybe.tree')

  it('generates maybe-map', () => {
    expect(ts).toContain('export function maybeMap(m, f)')
  })

  it('generates maybe-unwrap with fallback', () => {
    expect(ts).toContain('export function maybeUnwrap(m, fallback)')
  })

  it('generates maybe-is-some', () => {
    expect(ts).toContain('export function maybeIsSome(m)')
  })

  it('generates maybe-is-none', () => {
    expect(ts).toContain('export function maybeIsNone(m)')
  })

  it('generates maybe-from-wave (conditional constructor)', () => {
    expect(ts).toContain('export function maybeFromWave(cond, value)')
  })

  it('pattern matches on some/none constructors', () => {
    expect(ts).toContain('.$ === 0')
  })
})

describe('stdlib: Pair', () => {
  const ts = compileFile('stdlib-pair.tree')

  it('generates make-pair constructor', () => {
    expect(ts).toContain('export function makePair(a, b)')
  })

  it('generates pair-fst accessor', () => {
    expect(ts).toContain('export function pairFst(p)')
  })

  it('generates pair-snd accessor', () => {
    expect(ts).toContain('export function pairSnd(p)')
  })

  it('generates pair-swap', () => {
    expect(ts).toContain('export function pairSwap(p)')
  })

  it('generates pair-map-fst', () => {
    expect(ts).toContain('export function pairMapFst(p, f)')
  })

  it('generates pair-map-snd', () => {
    expect(ts).toContain('export function pairMapSnd(p, f)')
  })
})

describe('stdlib: Either', () => {
  const ts = compileFile('stdlib-either.tree')

  it('generates either-map-right', () => {
    expect(ts).toContain('export function eitherMapRight(e, f)')
  })

  it('generates either-map-left', () => {
    expect(ts).toContain('export function eitherMapLeft(e, f)')
  })

  it('generates either-unwrap-right with fallback', () => {
    expect(ts).toContain('export function eitherUnwrapRight(e, fallback)')
  })

  it('generates either-unwrap-left with fallback', () => {
    expect(ts).toContain('export function eitherUnwrapLeft(e, fallback)')
  })

  it('generates either-is-left', () => {
    expect(ts).toContain('export function eitherIsLeft(e)')
  })

  it('generates either-is-right', () => {
    expect(ts).toContain('export function eitherIsRight(e)')
  })

  it('matches on left/right constructors', () => {
    expect(ts).toContain('.$ === 0')
  })
})

describe('stdlib: Order', () => {
  const ts = compileFile('stdlib-order.tree')

  it('generates order-reverse', () => {
    expect(ts).toContain('export function orderReverse(o)')
  })

  it('generates order-is-less', () => {
    expect(ts).toContain('export function orderIsLess(o)')
  })

  it('generates order-is-equal', () => {
    expect(ts).toContain('export function orderIsEqual(o)')
  })

  it('generates order-is-more', () => {
    expect(ts).toContain('export function orderIsMore(o)')
  })

  it('generates compare-u64 with nested matching', () => {
    expect(ts).toContain('export function compareU64(a, b)')
  })

  it('has three-case switch for less/equal/more', () => {
    expect(ts).toContain('case 0:')
    expect(ts).toContain('case 1:')
    expect(ts).toContain('case 2:')
  })
})
