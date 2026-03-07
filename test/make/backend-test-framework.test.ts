/**
 * Cross-backend tests for the test framework stdlib types.
 *
 * Validates that report, failure, and mock forms plus their
 * associated tasks compile correctly through all 5 backends.
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

function compileFile(name: string): {
  book: Book
  asyncMeta: Map<string, boolean>
} {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card })
}

// -- TypeScript --

describe('test framework: TypeScript', () => {
  const { book, asyncMeta } = compileFile('stdlib-test-framework.tree')
  const ts = castTS({ book, asyncMeta })

  it('generates report type', () => {
    expect(ts).toContain('Report')
    expect(ts).toContain('passed')
    expect(ts).toContain('failed')
    expect(ts).toContain('skipped')
    expect(ts).toContain('duration')
  })

  it('generates failure type', () => {
    expect(ts).toContain('Failure')
    expect(ts).toContain('name')
    expect(ts).toContain('message')
  })

  it('generates mock type', () => {
    expect(ts).toContain('Mock')
    expect(ts).toContain('count')
  })

  it('generates make function', () => {
    expect(ts).toContain('function make')
  })

  it('generates passed function', () => {
    expect(ts).toContain('function passed')
  })

  it('generates total function', () => {
    expect(ts).toContain('function total')
  })

  it('generates fail function', () => {
    expect(ts).toContain('function fail')
  })

  it('generates name function', () => {
    expect(ts).toContain('function name')
  })

  it('generates stamp definition', () => {
    expect(ts).toContain('stamp')
  })

  it('generates count function', () => {
    expect(ts).toContain('function count')
  })
})

// -- Rust --

describe('test framework: Rust', () => {
  const { book } = compileFile('stdlib-test-framework.tree')
  const rs = castRust({ book })

  it('generates Report struct', () => {
    expect(rs).toContain('Report')
    expect(rs).toContain('passed')
    expect(rs).toContain('failed')
  })

  it('generates Failure struct', () => {
    expect(rs).toContain('Failure')
  })

  it('generates Mock struct', () => {
    expect(rs).toContain('Mock')
  })

  it('generates fn make', () => {
    expect(rs).toContain('fn make')
  })

  it('generates fn total', () => {
    expect(rs).toContain('fn total')
  })

  it('generates fn fail', () => {
    expect(rs).toContain('fn fail')
  })

  it('generates fn stamp', () => {
    expect(rs).toContain('fn stamp')
  })

  it('generates fn count', () => {
    expect(rs).toContain('fn count')
  })
})

// -- Kotlin --

describe('test framework: Kotlin', () => {
  const { book } = compileFile('stdlib-test-framework.tree')
  const kt = castKotlin({ book })

  it('generates Report class', () => {
    expect(kt).toContain('Report')
    expect(kt).toContain('passed')
  })

  it('generates Failure class', () => {
    expect(kt).toContain('Failure')
  })

  it('generates Mock class', () => {
    expect(kt).toContain('Mock')
  })

  it('generates fun make', () => {
    expect(kt).toContain('fun')
    expect(kt).toContain('make')
  })

  it('generates fun total', () => {
    expect(kt).toContain('total')
  })

  it('generates fun stamp', () => {
    expect(kt).toContain('stamp')
  })

  it('generates fun count', () => {
    expect(kt).toContain('count')
  })
})

// -- Swift --

describe('test framework: Swift', () => {
  const { book } = compileFile('stdlib-test-framework.tree')
  const sw = castSwift({ book })

  it('generates Report type', () => {
    expect(sw).toContain('Report')
    expect(sw).toContain('passed')
  })

  it('generates Failure type', () => {
    expect(sw).toContain('Failure')
  })

  it('generates Mock type', () => {
    expect(sw).toContain('Mock')
  })

  it('generates func make', () => {
    expect(sw).toContain('func make')
  })

  it('generates func total', () => {
    expect(sw).toContain('func total')
  })

  it('generates func fail', () => {
    expect(sw).toContain('func fail')
  })

  it('generates stamp definition', () => {
    expect(sw).toContain('stamp')
  })

  it('generates func count', () => {
    expect(sw).toContain('func count')
  })
})

// -- HVM --

describe('test framework: HVM', () => {
  const { book, asyncMeta } = compileFile('stdlib-test-framework.tree')
  const hvm = castHVM({ book, asyncMeta })

  it('generates @make definition', () => {
    expect(hvm).toContain('@make')
  })

  it('generates @passed definition', () => {
    expect(hvm).toContain('@passed')
  })

  it('generates @total definition', () => {
    expect(hvm).toContain('@total')
  })

  it('generates @fail definition', () => {
    expect(hvm).toContain('@fail')
  })

  it('generates @stamp definition', () => {
    expect(hvm).toContain('@stamp')
  })

  it('generates @count definition', () => {
    expect(hvm).toContain('@count')
  })

  it('generates match for report destructuring', () => {
    expect(hvm).toContain('match')
  })
})
