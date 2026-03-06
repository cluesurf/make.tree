/**
 * Network UDP module compilation tests.
 *
 * Compiles network-udp.tree through the full pipeline and verifies
 * the TypeScript output contains correct types and functions for
 * UDP sockets, datagrams, and operations.
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

describe('network/udp: TypeScript', () => {
  const book = compileFile('network-udp.tree')
  const ts = castTS({ book })

  it('generates Socket type with host and port', () => {
    expect(ts).toContain('export type Socket')
    expect(ts).toContain('host: string')
    expect(ts).toContain('port: number')
  })

  it('generates Datagram type with data', () => {
    expect(ts).toContain('export type Datagram')
    expect(ts).toContain('data')
  })

  it('generates open function', () => {
    expect(ts).toContain('function open(')
  })

  it('open has fork test for optional port', () => {
    expect(ts).toContain('isSome')
  })

  it('open constructs Socket', () => {
    expect(ts).toContain('host')
    expect(ts).toContain('port')
  })

  it('generates sendDatagram function', () => {
    expect(ts).toContain('sendDatagram(')
  })

  it('generates receiveDatagram function', () => {
    expect(ts).toContain('receiveDatagram(')
  })

  it('receiveDatagram uses await', () => {
    expect(ts).toContain('await')
  })

  it('generates closeSocket function', () => {
    expect(ts).toContain('closeSocket(')
  })
})

describe('network/udp: Rust', () => {
  const book = compileFile('network-udp.tree')
  const rs = castRust({ book })

  it('generates Socket struct', () => {
    expect(rs).toContain('struct Socket')
  })

  it('generates Datagram struct', () => {
    expect(rs).toContain('struct Datagram')
  })

  it('generates open function', () => {
    expect(rs).toContain('fn open(')
  })

  it('generates send_datagram function', () => {
    expect(rs).toContain('fn send_datagram(')
  })

  it('generates receive_datagram function', () => {
    expect(rs).toContain('fn receive_datagram(')
  })
})
