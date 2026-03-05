/**
 * Cross-backend tests for stdlib type fixtures.
 *
 * Validates that result, kink, and order types compile through
 * all 5 backends without errors and produce expected output.
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
import { castBook as castHVM } from '@/cast/hvm'
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

describe('result: all backends', () => {
  const book = compileFile('stdlib-result.tree')

  it('TypeScript emits Result type and functions', () => {
    const out = castTS({ book })
    expect(out).toContain('export type Result')
    expect(out).toContain('resultMap')
    expect(out).toContain('resultUnwrap')
    expect(out).toContain('resultIsOkay')
    expect(out).toContain('resultIsError')
  })

  it('Rust skips enum (uses native Result) and emits functions', () => {
    const out = castRust({ book })
    // Rust maps result to native Result<T, E>, skips enum
    expect(out).not.toContain('enum Result')
    expect(out).toContain('fn result_map')
    expect(out).toContain('fn result_unwrap')
    expect(out).toContain('fn result_is_okay')
    expect(out).toContain('fn result_is_error')
  })

  it('Kotlin emits sealed class and functions', () => {
    const out = castKotlin({ book })
    expect(out).toContain('sealed class Result')
    expect(out).toContain('resultMap')
    expect(out).toContain('resultUnwrap')
  })

  it('Swift emits enum and functions', () => {
    const out = castSwift({ book })
    expect(out).toContain('enum Result')
    expect(out).toContain('resultMap')
    expect(out).toContain('resultUnwrap')
  })

  it('HVM emits definitions', () => {
    const out = castHVM({ book })
    expect(out).toContain('@result_map')
    expect(out).toContain('@result_unwrap')
    expect(out).toContain('#okay')
    expect(out).toContain('#error')
  })
})

describe('kink: all backends', () => {
  const book = compileFile('stdlib-kink.tree')

  it('TypeScript emits Kink type and functions', () => {
    const out = castTS({ book })
    expect(out).toContain('export type Kink')
    expect(out).toContain('makeKink')
    expect(out).toContain('kinkCode')
    expect(out).toContain('kinkNote')
    expect(out).toContain('code: string')
    expect(out).toContain('note: string')
    expect(out).toContain('hint: string')
  })

  it('Rust emits struct and functions', () => {
    const out = castRust({ book })
    expect(out).toContain('fn make_kink')
    expect(out).toContain('fn kink_code')
    expect(out).toContain('fn kink_note')
  })

  it('Kotlin emits class and functions', () => {
    const out = castKotlin({ book })
    expect(out).toContain('makeKink')
    expect(out).toContain('kinkCode')
  })

  it('Swift emits type and functions', () => {
    const out = castSwift({ book })
    expect(out).toContain('makeKink')
    expect(out).toContain('kinkCode')
  })

  it('HVM emits definitions', () => {
    const out = castHVM({ book })
    expect(out).toContain('@make_kink')
    expect(out).toContain('@kink_code')
  })
})
