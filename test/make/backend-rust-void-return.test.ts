/**
 * Rust backend test: void return type.
 *
 * Verifies that functions with no explicit return value emit no
 * return type annotation (Rust defaults to `()`) instead of `-> String`.
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

describe('rust: void return type', () => {
  let code = ''

  it('compiles without error', () => {
    code = compileTreeToRust('rust-void-return.tree')
    expect(code).toBeTruthy()
  })

  it('write_file has no return type annotation', () => {
    expect(code).toMatch(/fn write_file\([^)]+\) \{/)
    expect(code).not.toMatch(/fn write_file\([^)]+\) -> /)
  })

  it('remove_file has no return type annotation', () => {
    expect(code).toMatch(/fn remove_file\([^)]+\) \{/)
    expect(code).not.toMatch(/fn remove_file\([^)]+\) -> /)
  })

  it('does not emit return statement for void functions', () => {
    // Void functions should not have `return "done"` or similar
    expect(code).not.toMatch(/return "done"/)
    expect(code).not.toMatch(/return String::from/)
  })
})
