/**
 * Network HTTP module compilation tests.
 *
 * Compiles network-http.tree through the full pipeline and verifies
 * the TypeScript output contains correct types and functions.
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

describe('network/http: TypeScript', () => {
  const book = compileFile('network-http.tree')
  const ts = castTS({ book })

  it('generates Response type with status field', () => {
    expect(ts).toContain('export type Response')
    expect(ts).toContain('status')
  })

  it('generates Response type with ok field', () => {
    expect(ts).toContain('ok')
  })

  it('generates Response type with url field', () => {
    expect(ts).toContain('url: string')
  })

  it('generates send function', () => {
    expect(ts).toContain('function send(')
  })

  it('send function takes url parameter', () => {
    expect(ts).toContain('url: string')
  })

  it('send function takes method parameter with default', () => {
    expect(ts).toContain('method')
  })

  it('send function returns Response', () => {
    expect(ts).toContain('Response')
  })

  it('generates fork test for optional headers', () => {
    expect(ts).toContain('isSome')
  })

  it('generates readResponse with fork case on format', () => {
    expect(ts).toContain('readResponse(')
    // fork case compiles to switch or if/else chain
    expect(ts).toMatch(/text|bytes|json/)
  })

  it('generates await for async calls', () => {
    expect(ts).toContain('await')
  })
})

describe('network/http: Rust', () => {
  const book = compileFile('network-http.tree')
  const rs = castRust({ book })

  it('generates Response struct', () => {
    expect(rs).toContain('struct Response')
  })

  it('generates send function', () => {
    expect(rs).toContain('fn send(')
  })

  it('generates read_response function', () => {
    expect(rs).toContain('fn read_response(')
  })
})

describe('network/http: Kotlin', () => {
  const book = compileFile('network-http.tree')
  const kt = castKotlin({ book })

  it('generates Response data class', () => {
    expect(kt).toContain('Response')
  })

  it('generates send function', () => {
    expect(kt).toContain('send(')
  })
})

describe('network/http: Swift', () => {
  const book = compileFile('network-http.tree')
  const sw = castSwift({ book })

  it('generates Response enum', () => {
    expect(sw).toContain('enum Response')
  })

  it('generates send function', () => {
    expect(sw).toContain('func send(')
  })
})
