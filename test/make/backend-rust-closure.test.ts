/**
 * Rust backend closure/higher-order function codegen tests.
 *
 * Verifies that closure-test.tree compiles to Rust with impl Fn types.
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
  const { book } = desugarCard({ card })
  return castBook({ book })
}

describe('rust: closure codegen', () => {
  const rs = compileFile('closure-test.tree')

  it('generates apply function', () => {
    expect(rs).toContain('fn apply(')
  })

  it('generates impl Fn type for function parameter', () => {
    expect(rs).toContain('impl Fn')
  })

  it('generates double function', () => {
    expect(rs).toContain('fn double(')
  })

  it('generates main function', () => {
    expect(rs).toContain('fn main(')
  })

  it('calls f parameter in apply body', () => {
    expect(rs).toContain('f(')
  })
})
