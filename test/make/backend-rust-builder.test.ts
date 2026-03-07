/**
 * Rust backend test: builder patterns.
 *
 * Tests chained method calls (single expression) and split-statement
 * builder patterns (requires `let mut`).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/rust'
import type { SurfLoad } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToRust(name: string): string {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })

  const dock = card.list
    .filter(
      (n): n is SurfLoad =>
        n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  const { book, voidMeta } = desugarCard({ card })
  return castBook({ book, dock, voidMeta })
}

describe('rust: builder patterns', () => {
  let code = ''

  it('compiles without error', () => {
    code = compileTreeToRust('builder-rust.tree')
    expect(code).toBeTruthy()
  })

  it('emits chained method calls as single expression', () => {
    // append_chained should have open_options::new().append(...).open(...)
    expect(code).toMatch(/open_options::new\(\)\.append\(/)
    expect(code).toMatch(/\.open\(/)
  })

  it('emits let mut for split-statement builder', () => {
    // append_split should have `let mut opts`
    expect(code).toMatch(/let mut \w*opts/)
  })

  it('emits method call on mutable variable', () => {
    // opts.append(true) should appear
    expect(code).toMatch(/opts\.append\(/)
  })
})
