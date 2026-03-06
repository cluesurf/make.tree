/**
 * Network TCP module compilation tests.
 *
 * Compiles network-tcp.tree through the full pipeline and verifies
 * the TypeScript output contains correct types and functions for
 * TCP connections, listeners, and operations.
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

describe('network/tcp: TypeScript', () => {
  const book = compileFile('network-tcp.tree')
  const ts = castTS({ book })

  it('generates Connection type with host field', () => {
    expect(ts).toContain('export type Connection')
    expect(ts).toContain('host: string')
  })

  it('generates Connection type with port field', () => {
    expect(ts).toContain('port: number')
  })

  it('generates Connection type with secure field', () => {
    expect(ts).toContain('secure: boolean')
  })

  it('generates Listener type', () => {
    expect(ts).toContain('export type Listener')
  })

  it('generates connect function', () => {
    expect(ts).toContain('function connect(')
  })

  it('connect uses await for async calls', () => {
    expect(ts).toContain('await')
  })

  it('connect constructs Connection', () => {
    expect(ts).toContain('dock')
    expect(ts).toContain('host')
    expect(ts).toContain('port')
  })

  it('generates readConnection function', () => {
    expect(ts).toContain('readConnection(')
  })

  it('generates writeConnection function', () => {
    expect(ts).toContain('writeConnection(')
  })

  it('generates closeConnection function', () => {
    expect(ts).toContain('closeConnection(')
  })

  it('generates acceptListener function', () => {
    expect(ts).toContain('acceptListener(')
  })
})

describe('network/tcp: Rust', () => {
  const book = compileFile('network-tcp.tree')
  const rs = castRust({ book })

  it('generates Connection struct', () => {
    expect(rs).toContain('struct Connection')
  })

  it('generates Listener struct', () => {
    expect(rs).toContain('struct Listener')
  })

  it('generates connect function', () => {
    expect(rs).toContain('fn connect(')
  })

  it('generates accept_listener function', () => {
    expect(rs).toContain('fn accept_listener(')
  })
})

describe('network/tcp: Kotlin', () => {
  const book = compileFile('network-tcp.tree')
  const kt = castKotlin({ book })

  it('generates Connection data class', () => {
    expect(kt).toContain('Connection')
  })

  it('generates connect function', () => {
    expect(kt).toContain('connect(')
  })
})

describe('network/tcp: Swift', () => {
  const book = compileFile('network-tcp.tree')
  const sw = castSwift({ book })

  it('generates Connection type', () => {
    expect(sw).toContain('Connection')
  })

  it('generates connect function', () => {
    expect(sw).toContain('connect(')
  })
})
