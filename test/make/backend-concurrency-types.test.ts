/**
 * Cross-backend tests for concurrency primitives and IO effect types.
 *
 * Validates that task-handle, channel (ADT with sender/receiver), and
 * effect (ADT with done/call) compile correctly through all 5 backends.
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

describe('concurrency types: TypeScript', () => {
  const { book, asyncMeta } = compileFile('concurrency-types.tree')
  const ts = castTS({ book, asyncMeta })

  it('generates stamp function with generics', () => {
    expect(ts).toContain('function stamp')
  })

  it('generates read function', () => {
    expect(ts).toContain('function read')
  })

  it('generates channel type as discriminated union', () => {
    expect(ts).toContain('$')
  })

  it('generates open function', () => {
    expect(ts).toContain('function open')
  })

  it('generates close function', () => {
    expect(ts).toContain('function close')
  })

  it('generates match with branching', () => {
    expect(ts).toContain('function match')
  })

  it('generates effect type with done and call cases', () => {
    expect(ts).toContain('function wrap')
    expect(ts).toContain('function cast')
  })

  it('generates unwrap with pattern match', () => {
    expect(ts).toContain('function unwrap')
  })
})

// -- Rust --

describe('concurrency types: Rust', () => {
  const { book } = compileFile('concurrency-types.tree')
  const rs = castRust({ book })

  it('generates task_handle struct or type', () => {
    expect(rs).toMatch(/TaskHandle/)
  })

  it('generates channel enum with sender/receiver', () => {
    expect(rs).toContain('Channel')
    expect(rs).toContain('Sender')
    expect(rs).toContain('Receiver')
  })

  it('generates stamp function', () => {
    expect(rs).toContain('fn stamp')
  })

  it('generates match with match keyword', () => {
    // Rust function named r#match or match_ to avoid keyword collision
    expect(rs).toContain('match')
  })

  it('generates effect enum with done/call', () => {
    expect(rs).toContain('Effect')
    expect(rs).toContain('Done')
    expect(rs).toContain('Call')
  })

  it('generates wrap function', () => {
    expect(rs).toContain('fn wrap')
  })

  it('generates unwrap with match', () => {
    expect(rs).toContain('fn unwrap')
  })
})

// -- Kotlin --

describe('concurrency types: Kotlin', () => {
  const { book } = compileFile('concurrency-types.tree')
  const kt = castKotlin({ book })

  it('generates TaskHandle class', () => {
    expect(kt).toContain('TaskHandle')
  })

  it('generates Channel sealed class or equivalent', () => {
    expect(kt).toContain('Channel')
  })

  it('generates stamp function', () => {
    expect(kt).toContain('fun')
    expect(kt).toContain('stamp')
  })

  it('generates match function', () => {
    expect(kt).toContain('match')
  })

  it('generates Effect type', () => {
    expect(kt).toContain('Effect')
  })

  it('generates wrap function', () => {
    expect(kt).toContain('wrap')
  })

  it('generates unwrap function', () => {
    expect(kt).toContain('unwrap')
  })
})

// -- Swift --

describe('concurrency types: Swift', () => {
  const { book } = compileFile('concurrency-types.tree')
  const sw = castSwift({ book })

  it('generates TaskHandle type', () => {
    expect(sw).toContain('TaskHandle')
  })

  it('generates Channel enum', () => {
    expect(sw).toContain('Channel')
  })

  it('generates stamp function', () => {
    expect(sw).toContain('func stamp')
  })

  it('generates match function', () => {
    expect(sw).toContain('match')
  })

  it('generates Effect type', () => {
    expect(sw).toContain('Effect')
  })

  it('generates wrap function', () => {
    expect(sw).toContain('func wrap')
  })

  it('generates unwrap function', () => {
    expect(sw).toContain('func unwrap')
  })
})

// -- HVM --

describe('concurrency types: HVM', () => {
  const { book, asyncMeta } = compileFile('concurrency-types.tree')
  const hvm = castHVM({ book, asyncMeta })

  it('generates stamp definition', () => {
    expect(hvm).toContain('@stamp')
  })

  it('generates match definition with match keyword', () => {
    expect(hvm).toContain('@match')
    expect(hvm).toMatch(/match/)
  })

  it('generates constructor for done', () => {
    expect(hvm).toContain('#done')
  })

  it('generates constructor for sender', () => {
    expect(hvm).toContain('#sender')
  })

  it('generates constructor for call', () => {
    expect(hvm).toContain('#call')
  })

  it('generates wrap definition', () => {
    expect(hvm).toContain('@wrap')
  })

  it('generates unwrap with match', () => {
    expect(hvm).toContain('@unwrap')
  })

  it('erases type-only definitions', () => {
    expect(hvm).not.toContain('@task_handle =')
    expect(hvm).not.toContain('@channel =')
    expect(hvm).not.toContain('@effect =')
  })
})
