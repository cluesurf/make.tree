/**
 * Cross-backend tests for error/result stdlib types.
 *
 * Validates that error handling types compile through
 * all backends without errors and produce expected output.
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

describe('error module: TypeScript', () => {
  const book = compileFile('stdlib-error.tree')
  const ts = castTS({ book })

  it('generates Kink type with code, note, hint fields', () => {
    expect(ts).toContain('export type Kink')
    expect(ts).toContain('code: string')
    expect(ts).toContain('note: string')
  })

  it('generates Result type with okay and error cases', () => {
    expect(ts).toContain('export type Result')
  })

  it('generates errorMake constructor', () => {
    expect(ts).toContain('export function errorMake(')
  })

  it('generates errorWrap to create successful result', () => {
    expect(ts).toContain('export function errorWrap(')
  })

  it('generates errorFail to create failed result', () => {
    expect(ts).toContain('export function errorFail(')
  })

  it('generates errorCode accessor', () => {
    expect(ts).toContain('export function errorCode(')
  })

  it('generates errorNote accessor', () => {
    expect(ts).toContain('export function errorNote(')
  })

  it('generates errorMatchTest for code matching', () => {
    expect(ts).toContain('export function errorMatchTest(')
  })

  it('generates resultMap', () => {
    expect(ts).toContain('export function resultMap(')
  })

  it('generates resultUnwrap', () => {
    expect(ts).toContain('export function resultUnwrap(')
  })

  it('generates resultIsOkay', () => {
    expect(ts).toContain('export function resultIsOkay(')
  })

  it('generates resultIsError', () => {
    expect(ts).toContain('export function resultIsError(')
  })
})

describe('error module: Rust', () => {
  const book = compileFile('stdlib-error.tree')
  const rs = castRust({ book })

  it('generates error_make function', () => {
    expect(rs).toContain('fn error_make(')
  })

  it('generates error_wrap function', () => {
    expect(rs).toContain('fn error_wrap(')
  })

  it('generates error_fail function', () => {
    expect(rs).toContain('fn error_fail(')
  })

  it('generates error_code accessor', () => {
    expect(rs).toContain('fn error_code(')
  })

  it('generates result_map function', () => {
    expect(rs).toContain('fn result_map(')
  })

  it('generates result_is_okay function', () => {
    expect(rs).toContain('fn result_is_okay(')
  })
})

describe('error module: Kotlin', () => {
  const book = compileFile('stdlib-error.tree')
  const kt = castKotlin({ book })

  it('generates errorMake function', () => {
    expect(kt).toContain('errorMake')
  })

  it('generates errorWrap function', () => {
    expect(kt).toContain('errorWrap')
  })

  it('generates resultMap function', () => {
    expect(kt).toContain('resultMap')
  })
})

describe('error module: Swift', () => {
  const book = compileFile('stdlib-error.tree')
  const sw = castSwift({ book })

  it('generates errorMake function', () => {
    expect(sw).toContain('errorMake')
  })

  it('generates errorWrap function', () => {
    expect(sw).toContain('errorWrap')
  })

  it('generates resultMap function', () => {
    expect(sw).toContain('resultMap')
  })
})

describe('error module: HVM', () => {
  const book = compileFile('stdlib-error.tree')
  const hvm = castHVM({ book })

  it('generates error_make definition', () => {
    expect(hvm).toContain('@error_make')
  })

  it('generates error_wrap definition', () => {
    expect(hvm).toContain('@error_wrap')
  })

  it('generates result_map definition', () => {
    expect(hvm).toContain('@result_map')
  })

  it('generates okay and error constructors', () => {
    expect(hvm).toContain('#okay')
    expect(hvm).toContain('#error')
  })
})
