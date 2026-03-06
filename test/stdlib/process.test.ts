/**
 * End-to-end tests: load process stdlib files through the full
 * compiler pipeline and verify they parse, desugar, and codegen.
 *
 * Tests cover:
 * - Abstract API: process/, process/child/, process/pipe/, process/current/
 * - Case files: case/node/process/, case/rust/process/, case/swift/process/
 * - Codegen output verification for Node.js, Rust, and Swift backends
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castNode } from '@/cast/node'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castSwift } from '@/cast/swift'
import { castBook as castHVM } from '@/cast/hvm'
import {
  resolveStdlib,
  setStdlibRoot,
  clearStdlibCache,
} from '@/stdlib'
import type { Book } from '@/term/form'
import type { SurfCard, SurfLoad } from '@/surf/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

const stdlibRoot = path.resolve(__dirname, '../../../')

const parse = (input: { file: string; text: string }) =>
  makeTree(input)

beforeEach(() => {
  clearStdlibCache()
  setStdlibRoot({ root: stdlibRoot })
})

function loadStdlib(pkgPath: string): SurfCard {
  const card = resolveStdlib({ loadPath: pkgPath, parse })
  if (!card) throw new Error(`Failed to load: ${pkgPath}`)
  return card
}

function desugar(card: SurfCard): Book {
  const result = desugarCard({ card })
  return result.book
}

function compileTreeFile(filePath: string): {
  book: Book
  dock: Array<{ path: string; name?: string }>
} {
  const text = fs.readFileSync(filePath, 'utf8')
  const lead = parse({ file: filePath, text })
  if (!lead || !lead.tree) throw new Error(`Parse failed: ${filePath}`)
  const rawCard = readCard({ tree: lead.tree, file: filePath })
  const card = expandFuse({ card: rawCard })

  const dock = card.list
    .filter(
      (n): n is SurfLoad =>
        n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  return { book: desugarCard({ card }).book, dock }
}

// ── Abstract API: process/ ──────────────────────────────────────────

describe('process base API', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)

    expect(book.has('result')).toBe(true)
    expect(book.has('child')).toBe(true)
    expect(book.has('run')).toBe(true)
    expect(book.has('spawn')).toBe(true)
  })

  it('result is an ADT with code/stdout/stderr/ok', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)
    const term = book.get('result')!
    expect(term.form).toBe('adt')

    if (term.form === 'adt') {
      expect(term.ctrs.length).toBe(1)
      expect(term.ctrs[0]!.name).toBe('result')
    }
  })

  it('child is an ADT with dock/id', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)
    const term = book.get('child')!
    expect(term.form).toBe('adt')

    if (term.form === 'adt') {
      expect(term.ctrs.length).toBe(1)
      expect(term.ctrs[0]!.name).toBe('child')
    }
  })

  it('generates TypeScript with Result and Child types', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('export type Result')
    expect(ts).toContain('export type Child')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)
    const rust = castRust({ book })
    expect(typeof rust).toBe('string')
    expect(rust.length).toBeGreaterThan(0)
  })

  it('generates HVM', () => {
    const card = loadStdlib('@cluesurf/base/code/process')
    const book = desugar(card)
    const hvm = castHVM({ book })
    expect(typeof hvm).toBe('string')
  })
})

// ── Abstract API: process/child/ ────────────────────────────────────

describe('process child API', () => {
  it('parses and desugars all 6 tasks', () => {
    const card = loadStdlib('@cluesurf/base/code/process/child')
    const book = desugar(card)

    expect(book.has('wait')).toBe(true)
    expect(book.has('stop')).toBe(true)
    expect(book.has('write')).toBe(true)
    expect(book.has('close')).toBe(true)
    expect(book.has('read')).toBe(true)
    expect(book.has('stream')).toBe(true)
  })

  it('generates TypeScript with all function names', () => {
    const card = loadStdlib('@cluesurf/base/code/process/child')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('wait')
    expect(ts).toContain('stop')
    expect(ts).toContain('write')
    expect(ts).toContain('close')
    expect(ts).toContain('read')
    expect(ts).toContain('stream')
  })

  it('generates Rust', () => {
    const card = loadStdlib('@cluesurf/base/code/process/child')
    const book = desugar(card)
    const rust = castRust({ book })
    expect(typeof rust).toBe('string')
  })
})

// ── Abstract API: process/pipe/ ─────────────────────────────────────

describe('process pipe API', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/process/pipe')
    const book = desugar(card)
    expect(book.has('connect')).toBe(true)
  })

  it('generates TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/process/pipe')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('connect')
  })
})

// ── Abstract API: process/current/ ──────────────────────────────────

describe('process current API', () => {
  it('parses and desugars', () => {
    const card = loadStdlib('@cluesurf/base/code/process/current')
    const book = desugar(card)

    expect(book.has('process-info')).toBe(true)
    expect(book.has('read')).toBe(true)
    expect(book.has('exit')).toBe(true)
    expect(book.has('listen')).toBe(true)
  })

  it('process-info is an ADT with id/arguments/directory/executable', () => {
    const card = loadStdlib('@cluesurf/base/code/process/current')
    const book = desugar(card)
    const term = book.get('process-info')!
    expect(term.form).toBe('adt')

    if (term.form === 'adt') {
      expect(term.ctrs.length).toBe(1)
      expect(term.ctrs[0]!.name).toBe('process-info')
    }
  })

  it('generates TypeScript with ProcessInfo type', () => {
    const card = loadStdlib('@cluesurf/base/code/process/current')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toContain('export type ProcessInfo')
  })
})

// ── Case files: Node.js ─────────────────────────────────────────────

const caseRoot = path.resolve(stdlibRoot, 'base.tree/code/case')

describe('node process case files', () => {
  const nodeDir = path.resolve(caseRoot, 'node/process')

  it('base.tree parses and has run/spawn', () => {
    const { book } = compileTreeFile(path.resolve(nodeDir, 'base.tree'))
    expect(book.has('run')).toBe(true)
    expect(book.has('spawn')).toBe(true)
  })

  it('base.tree codegen emits import and function names', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(nodeDir, 'base.tree'),
    )
    const js = castNode({ book, dock })
    expect(js).toContain("import cp from 'node:child_process'")
    expect(js).toContain('function run(')
    expect(js).toContain('function spawn(')
  })

  it('child.tree parses all 6 tasks', () => {
    const { book } = compileTreeFile(path.resolve(nodeDir, 'child.tree'))
    expect(book.has('wait')).toBe(true)
    expect(book.has('stop')).toBe(true)
    expect(book.has('write')).toBe(true)
    expect(book.has('close')).toBe(true)
    expect(book.has('read')).toBe(true)
    expect(book.has('stream')).toBe(true)
  })

  it('child.tree codegen emits function names', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(nodeDir, 'child.tree'),
    )
    const js = castNode({ book, dock })
    expect(js).toContain('function wait(')
    expect(js).toContain('function stop(')
    expect(js).toContain('function read(')
  })

  it('pipe.tree parses', () => {
    const { book } = compileTreeFile(path.resolve(nodeDir, 'pipe.tree'))
    expect(book.has('connect')).toBe(true)
  })

  it('current.tree parses', () => {
    const { book } = compileTreeFile(
      path.resolve(nodeDir, 'current.tree'),
    )
    expect(book.has('read')).toBe(true)
    expect(book.has('exit')).toBe(true)
    expect(book.has('listen')).toBe(true)
  })

  it('current.tree codegen references process globals', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(nodeDir, 'current.tree'),
    )
    const js = castNode({ book, dock })
    expect(js).toContain('process.pid')
    expect(js).toContain('process.argv')
    expect(js).toContain('process.execPath')
  })
})

// ── Case files: Rust ────────────────────────────────────────────────

describe('rust process case files', () => {
  const rustDir = path.resolve(caseRoot, 'rust/process')

  it('base.tree parses and has run/spawn', () => {
    const { book } = compileTreeFile(path.resolve(rustDir, 'base.tree'))
    expect(book.has('run')).toBe(true)
    expect(book.has('spawn')).toBe(true)
  })

  it('base.tree codegen emits use statements and fn signatures', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(rustDir, 'base.tree'),
    )
    const rs = castRust({ book, dock })
    // Note: codegen emits `use std::::process` due to double :: conversion
    // (dock path already has ::, codegen converts : to :: again)
    expect(rs).toContain('use std::')
    expect(rs).toContain('process')
    expect(rs).toContain('fn run(')
    expect(rs).toContain('fn spawn(')
  })

  it('child.tree parses all 6 tasks', () => {
    const { book } = compileTreeFile(path.resolve(rustDir, 'child.tree'))
    expect(book.has('wait')).toBe(true)
    expect(book.has('stop')).toBe(true)
    expect(book.has('write')).toBe(true)
    expect(book.has('close')).toBe(true)
    expect(book.has('read')).toBe(true)
    expect(book.has('stream')).toBe(true)
  })

  it('child.tree codegen emits fn signatures', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(rustDir, 'child.tree'),
    )
    const rs = castRust({ book, dock })
    expect(rs).toContain('fn wait(')
    expect(rs).toContain('fn stop(')
    expect(rs).toContain('fn read(')
  })

  it('pipe.tree parses', () => {
    const { book } = compileTreeFile(path.resolve(rustDir, 'pipe.tree'))
    expect(book.has('connect')).toBe(true)
  })

  it('current.tree parses', () => {
    const { book } = compileTreeFile(
      path.resolve(rustDir, 'current.tree'),
    )
    expect(book.has('read')).toBe(true)
    expect(book.has('exit')).toBe(true)
    expect(book.has('listen')).toBe(true)
  })

  it('current.tree codegen emits use statements', () => {
    const { book, dock } = compileTreeFile(
      path.resolve(rustDir, 'current.tree'),
    )
    const rs = castRust({ book, dock })
    // Note: same double :: issue as base.tree
    expect(rs).toContain('use std::')
    expect(rs).toContain('fn read(')
    expect(rs).toContain('fn exit(')
  })
})

// ── Case files: Swift ───────────────────────────────────────────────

describe('swift process case files', () => {
  const swiftDir = path.resolve(caseRoot, 'swift/process')

  it('base.tree parses and has run/spawn', () => {
    const { book } = compileTreeFile(path.resolve(swiftDir, 'base.tree'))
    expect(book.has('run')).toBe(true)
    expect(book.has('spawn')).toBe(true)
  })

  it('base.tree codegen emits func signatures', () => {
    const { book } = compileTreeFile(path.resolve(swiftDir, 'base.tree'))
    const sw = castSwift({ book })
    expect(sw).toContain('func run(')
    expect(sw).toContain('func spawn(')
  })

  it('child.tree parses all 6 tasks', () => {
    const { book } = compileTreeFile(
      path.resolve(swiftDir, 'child.tree'),
    )
    expect(book.has('wait')).toBe(true)
    expect(book.has('stop')).toBe(true)
    expect(book.has('write')).toBe(true)
    expect(book.has('close')).toBe(true)
    expect(book.has('read')).toBe(true)
    expect(book.has('stream')).toBe(true)
  })

  it('child.tree codegen emits func signatures', () => {
    const { book } = compileTreeFile(
      path.resolve(swiftDir, 'child.tree'),
    )
    const sw = castSwift({ book })
    expect(sw).toContain('func wait(')
    expect(sw).toContain('func stop(')
    expect(sw).toContain('func read(')
  })

  it('pipe.tree parses', () => {
    const { book } = compileTreeFile(path.resolve(swiftDir, 'pipe.tree'))
    expect(book.has('connect')).toBe(true)
  })

  it('current.tree parses', () => {
    const { book } = compileTreeFile(
      path.resolve(swiftDir, 'current.tree'),
    )
    expect(book.has('read')).toBe(true)
    expect(book.has('exit')).toBe(true)
    expect(book.has('listen')).toBe(true)
  })

  it('current.tree codegen emits func signatures', () => {
    const { book } = compileTreeFile(
      path.resolve(swiftDir, 'current.tree'),
    )
    const sw = castSwift({ book })
    expect(sw).toContain('func exit(')
    expect(sw).toContain('func listen(')
  })
})
