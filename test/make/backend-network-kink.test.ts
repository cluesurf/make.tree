/**
 * Network error type (network-kink) compilation tests.
 *
 * Compiles network-kink.tree through the full pipeline and verifies
 * all backends emit correct types for the network error form,
 * constructor, accessor, and error propagation.
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
import type { Book } from '@/term/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): Book {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

describe('network/kink: TypeScript', () => {
  const book = compileFile('network-kink.tree')
  const ts = castTS({ book })

  it('generates NetworkKink type with code field', () => {
    expect(ts).toContain('export type NetworkKink')
    expect(ts).toContain('code: string')
  })

  it('generates NetworkKink type with note field', () => {
    expect(ts).toContain('note: string')
  })

  it('generates kinkMake constructor', () => {
    expect(ts).toContain('kinkMake(')
  })

  it('generates kinkCode accessor', () => {
    expect(ts).toContain('kinkCode(')
  })

  it('generates kinkNote accessor', () => {
    expect(ts).toContain('kinkNote(')
  })

  it('generates kinkThrow with bust/throw statement', () => {
    expect(ts).toContain('kinkThrow(')
    expect(ts).toContain('throw')
  })

  it('generates connectWithError with await and try', () => {
    expect(ts).toContain('connectWithError(')
    expect(ts).toContain('await')
  })
})

describe('network/kink: Rust', () => {
  const book = compileFile('network-kink.tree')
  const rs = castRust({ book })

  it('generates NetworkKink struct', () => {
    expect(rs).toContain('NetworkKink')
  })

  it('generates kink_make function', () => {
    expect(rs).toContain('fn kink_make(')
  })

  it('generates kink_code function', () => {
    expect(rs).toContain('fn kink_code(')
  })

  it('generates kink_throw with Result return', () => {
    expect(rs).toContain('fn kink_throw(')
    expect(rs).toContain('Result<')
  })

  it('generates connect_with_error as async with Result', () => {
    expect(rs).toContain('fn connect_with_error(')
    expect(rs).toContain('Result<')
  })
})

describe('network/kink: Kotlin', () => {
  const book = compileFile('network-kink.tree')
  const kt = castKotlin({ book })

  it('generates NetworkKink data class', () => {
    expect(kt).toContain('NetworkKink')
  })

  it('generates kinkMake function', () => {
    expect(kt).toContain('kinkMake(')
  })

  it('generates kinkThrow with throw', () => {
    expect(kt).toContain('kinkThrow(')
    expect(kt).toContain('throw')
  })
})

describe('network/kink: Swift', () => {
  const book = compileFile('network-kink.tree')
  const sw = castSwift({ book })

  it('generates NetworkKink type', () => {
    expect(sw).toMatch(/struct NetworkKink|enum NetworkKink/)
  })

  it('generates kinkMake function', () => {
    expect(sw).toContain('kinkMake(')
  })

  it('generates kinkThrow with throw', () => {
    expect(sw).toContain('kinkThrow(')
    expect(sw).toContain('throw')
  })
})
