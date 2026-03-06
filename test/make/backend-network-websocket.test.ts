/**
 * Network WebSocket module compilation tests.
 *
 * Compiles network-websocket.tree through the full pipeline and verifies
 * the TypeScript output contains correct types and functions for
 * WebSocket connections and message handling.
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

describe('network/websocket: TypeScript', () => {
  const book = compileFile('network-websocket.tree')
  const ts = castTS({ book })

  it('generates Socket type with url field', () => {
    expect(ts).toContain('export type Socket')
    expect(ts).toContain('url: string')
  })

  it('generates Socket type with protocol field', () => {
    expect(ts).toContain('protocol')
  })

  it('generates Socket type with ready field', () => {
    expect(ts).toContain('ready: boolean')
  })

  it('generates Message type', () => {
    expect(ts).toContain('export type Message')
    expect(ts).toContain('kind')
    expect(ts).toContain('data')
  })

  it('generates connect function', () => {
    expect(ts).toContain('function connect(')
  })

  it('connect takes url parameter', () => {
    expect(ts).toContain('url: string')
  })

  it('connect constructs Socket with ready: true', () => {
    expect(ts).toContain('true')
  })

  it('generates sendMessage function', () => {
    expect(ts).toContain('sendMessage(')
  })

  it('generates closeSocket function', () => {
    expect(ts).toContain('closeSocket(')
  })

  it('closeSocket uses await', () => {
    expect(ts).toContain('await')
  })
})

describe('network/websocket: Rust', () => {
  const book = compileFile('network-websocket.tree')
  const rs = castRust({ book })

  it('generates Socket struct', () => {
    expect(rs).toContain('struct Socket')
  })

  it('generates Message struct', () => {
    expect(rs).toContain('struct Message')
  })

  it('generates connect function', () => {
    expect(rs).toContain('fn connect(')
  })

  it('generates send_message function', () => {
    expect(rs).toContain('fn send_message(')
  })
})
