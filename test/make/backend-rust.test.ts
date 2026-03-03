/**
 * Rust backend compilation tests.
 *
 * Compiles core data type .tree files through the full pipeline
 * and verifies the Rust output has correct structure.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/rust'

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
  const book = desugarCard({ card })
  return castBook({ book })
}

describe('rust: Bool', () => {
  const rs = compileFile('stdlib-bool.tree')

  it('generates enum for Bool', () => {
    expect(rs).toContain('#[derive(Clone, Debug)]')
    expect(rs).toContain('pub enum Bool')
  })

  it('generates bool_not with match', () => {
    expect(rs).toContain('pub fn bool_not(')
    expect(rs).toContain('match')
  })

  it('generates bool_and with two parameters', () => {
    expect(rs).toContain('pub fn bool_and(')
  })

  it('generates bool_or with two parameters', () => {
    expect(rs).toContain('pub fn bool_or(')
  })

  it('generates bool_xor', () => {
    expect(rs).toContain('pub fn bool_xor(')
  })

  it('generates bool_eq', () => {
    expect(rs).toContain('pub fn bool_eq(')
  })

  it('uses PascalCase for constructor names', () => {
    expect(rs).toContain('True')
    expect(rs).toContain('False')
  })
})

describe('rust: Maybe', () => {
  const rs = compileFile('stdlib-maybe.tree')

  it('generates enum for Maybe', () => {
    expect(rs).toContain('pub enum Maybe')
  })

  it('generates maybe_map', () => {
    expect(rs).toContain('pub fn maybe_map(')
  })

  it('generates maybe_unwrap', () => {
    expect(rs).toContain('pub fn maybe_unwrap(')
  })

  it('generates maybe_is_some', () => {
    expect(rs).toContain('pub fn maybe_is_some(')
  })

  it('generates maybe_is_none', () => {
    expect(rs).toContain('pub fn maybe_is_none(')
  })

  it('uses match for pattern matching', () => {
    expect(rs).toContain('match')
  })
})

describe('rust: Pair', () => {
  const rs = compileFile('stdlib-pair.tree')

  it('generates make_pair', () => {
    expect(rs).toContain('pub fn make_pair(')
  })

  it('generates pair_fst', () => {
    expect(rs).toContain('pub fn pair_fst(')
  })

  it('generates pair_snd', () => {
    expect(rs).toContain('pub fn pair_snd(')
  })

  it('generates pair_swap', () => {
    expect(rs).toContain('pub fn pair_swap(')
  })

  it('generates pair_map_fst', () => {
    expect(rs).toContain('pub fn pair_map_fst(')
  })

  it('generates pair_map_snd', () => {
    expect(rs).toContain('pub fn pair_map_snd(')
  })
})

describe('rust: Either', () => {
  const rs = compileFile('stdlib-either.tree')

  it('generates enum for Either', () => {
    expect(rs).toContain('pub enum Either')
  })

  it('generates either_map_right', () => {
    expect(rs).toContain('pub fn either_map_right(')
  })

  it('generates either_map_left', () => {
    expect(rs).toContain('pub fn either_map_left(')
  })

  it('generates either_unwrap_right', () => {
    expect(rs).toContain('pub fn either_unwrap_right(')
  })

  it('generates either_unwrap_left', () => {
    expect(rs).toContain('pub fn either_unwrap_left(')
  })

  it('generates either_is_left', () => {
    expect(rs).toContain('pub fn either_is_left(')
  })

  it('generates either_is_right', () => {
    expect(rs).toContain('pub fn either_is_right(')
  })

  it('matches on Left/Right constructors', () => {
    expect(rs).toContain('Left')
    expect(rs).toContain('Right')
  })
})

describe('rust: Order', () => {
  const rs = compileFile('stdlib-order.tree')

  it('generates enum for Order', () => {
    expect(rs).toContain('pub enum Order')
  })

  it('generates order_reverse', () => {
    expect(rs).toContain('pub fn order_reverse(')
  })

  it('generates order_is_less', () => {
    expect(rs).toContain('pub fn order_is_less(')
  })

  it('generates order_is_equal', () => {
    expect(rs).toContain('pub fn order_is_equal(')
  })

  it('generates order_is_more', () => {
    expect(rs).toContain('pub fn order_is_more(')
  })

  it('generates compare_u64', () => {
    expect(rs).toContain('pub fn compare_u64(')
  })

  it('has Less/Equal/More constructors', () => {
    expect(rs).toContain('Less')
    expect(rs).toContain('Equal')
    expect(rs).toContain('More')
  })
})
