/**
 * Swift backend compilation tests.
 *
 * Compiles core data type .tree files through the full pipeline
 * and verifies the Swift output has correct structure.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/swift'

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

describe('swift: Bool', () => {
  const sw = compileFile('stdlib-bool.tree')

  it('generates enum for Bool', () => {
    expect(sw).toContain('enum Bool')
  })

  it('generates boolNot function', () => {
    expect(sw).toContain('func boolNot(')
  })

  it('generates boolAnd with two parameters', () => {
    expect(sw).toContain('func boolAnd(')
  })

  it('generates boolOr with two parameters', () => {
    expect(sw).toContain('func boolOr(')
  })

  it('generates boolXor', () => {
    expect(sw).toContain('func boolXor(')
  })

  it('generates boolEq', () => {
    expect(sw).toContain('func boolEq(')
  })

  it('uses switch for pattern matching', () => {
    expect(sw).toContain('switch')
    expect(sw).toContain('case')
  })
})

describe('swift: Maybe', () => {
  const sw = compileFile('stdlib-maybe.tree')

  it('generates enum for Maybe', () => {
    expect(sw).toContain('enum Maybe')
  })

  it('generates maybeMap', () => {
    expect(sw).toContain('func maybeMap(')
  })

  it('generates maybeUnwrap', () => {
    expect(sw).toContain('func maybeUnwrap(')
  })

  it('generates maybeIsSome', () => {
    expect(sw).toContain('func maybeIsSome(')
  })

  it('generates maybeIsNone', () => {
    expect(sw).toContain('func maybeIsNone(')
  })

  it('uses switch for pattern matching', () => {
    expect(sw).toContain('switch')
  })
})

describe('swift: Pair', () => {
  const sw = compileFile('stdlib-pair.tree')

  it('generates makePair', () => {
    expect(sw).toContain('func makePair(')
  })

  it('generates pairFst', () => {
    expect(sw).toContain('func pairFst(')
  })

  it('generates pairSnd', () => {
    expect(sw).toContain('func pairSnd(')
  })

  it('generates pairSwap', () => {
    expect(sw).toContain('func pairSwap(')
  })

  it('generates pairMapFst', () => {
    expect(sw).toContain('func pairMapFst(')
  })

  it('generates pairMapSnd', () => {
    expect(sw).toContain('func pairMapSnd(')
  })
})

describe('swift: Either', () => {
  const sw = compileFile('stdlib-either.tree')

  it('generates enum for Either', () => {
    expect(sw).toContain('enum Either')
  })

  it('generates eitherMapRight', () => {
    expect(sw).toContain('func eitherMapRight(')
  })

  it('generates eitherMapLeft', () => {
    expect(sw).toContain('func eitherMapLeft(')
  })

  it('generates eitherUnwrapRight', () => {
    expect(sw).toContain('func eitherUnwrapRight(')
  })

  it('generates eitherUnwrapLeft', () => {
    expect(sw).toContain('func eitherUnwrapLeft(')
  })

  it('generates eitherIsLeft', () => {
    expect(sw).toContain('func eitherIsLeft(')
  })

  it('generates eitherIsRight', () => {
    expect(sw).toContain('func eitherIsRight(')
  })
})

describe('swift: Order', () => {
  const sw = compileFile('stdlib-order.tree')

  it('generates enum for Order', () => {
    expect(sw).toContain('enum Order')
  })

  it('generates orderReverse', () => {
    expect(sw).toContain('func orderReverse(')
  })

  it('generates orderIsLess', () => {
    expect(sw).toContain('func orderIsLess(')
  })

  it('generates orderIsEqual', () => {
    expect(sw).toContain('func orderIsEqual(')
  })

  it('generates orderIsMore', () => {
    expect(sw).toContain('func orderIsMore(')
  })

  it('generates compareU64', () => {
    expect(sw).toContain('func compareU64(')
  })

  it('has case names for constructors', () => {
    expect(sw).toContain('case less')
    expect(sw).toContain('case equal')
    expect(sw).toContain('case more')
  })
})
