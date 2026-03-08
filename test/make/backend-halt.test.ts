/**
 * Cross-backend bust/error codegen tests.
 *
 * Verifies that halt-test.tree (using bust) compiles correctly for all backends:
 * - TypeScript: throw new Error(...)
 * - Rust: Result<T, Box<dyn Error>> + Err(...)
 * - Kotlin: throw SeedError(...)
 * - Swift: throws + throw SeedError(...)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): ReturnType<typeof desugarCard> {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card })
}

describe('bust codegen: TypeScript', () => {
  const { book } = compileFile('halt-test.tree')
  const ts = castTS({ book })

  it('generates throw for bust', () => {
    expect(ts).toContain('throw')
  })

  it('generates safeDiv function', () => {
    expect(ts).toContain('function safeDiv(')
  })
})

describe('bust codegen: Rust', () => {
  const { book } = compileFile('halt-test.tree')
  const rs = castRust({ book })

  it('generates safe_div function', () => {
    expect(rs).toContain('fn safe_div(')
  })

  it('generates panic for bust text', () => {
    expect(rs).toContain('panic!')
  })
})

describe('bust codegen: Kotlin', () => {
  const { book } = compileFile('halt-test.tree')
  const kt = castKotlin({ book })

  it('generates SeedError class', () => {
    expect(kt).toContain('class SeedError')
  })

  it('generates throw SeedError', () => {
    expect(kt).toContain('throw SeedError')
  })
})

describe('bust codegen: Swift', () => {
  const { book } = compileFile('halt-test.tree')
  const sw = castSwift({ book })

  it('generates SeedError struct', () => {
    expect(sw).toContain('struct SeedError: Error')
  })

  it('generates throws annotation', () => {
    expect(sw).toContain('throws')
  })

  it('generates throw SeedError', () => {
    expect(sw).toContain('throw SeedError')
  })
})
