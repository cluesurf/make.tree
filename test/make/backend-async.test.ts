/**
 * Cross-backend async codegen tests.
 *
 * Verifies that async-test.tree compiles correctly for all backends:
 * - TypeScript: async function + await
 * - Rust: async fn + .await
 * - Kotlin: suspend fun
 * - Swift: func ... async
 * - HVM: IO/Call + IO/Done
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): { book: ReturnType<typeof desugarCard>['book']; asyncMeta: ReturnType<typeof desugarCard>['asyncMeta'] } {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card })
}

describe('async codegen: TypeScript', () => {
  const { book, asyncMeta } = compileFile('async-test.tree')
  const ts = castTS({ book, asyncMeta })

  it('generates async function for fetch-data', () => {
    expect(ts).toContain('async function fetchData(')
  })

  it('generates await for async calls', () => {
    expect(ts).toContain('await')
  })

  it('generates regular function for process', () => {
    expect(ts).toContain('function process(')
    expect(ts).not.toMatch(/async function process\(/)
  })
})

describe('async codegen: Rust', () => {
  const { book, asyncMeta } = compileFile('async-test.tree')
  const rs = castRust({ book, asyncMeta })

  it('generates async fn for fetch-data', () => {
    expect(rs).toContain('async fn fetch_data(')
  })

  it('generates regular fn for process', () => {
    expect(rs).toContain('fn process(')
    expect(rs).not.toMatch(/async fn process\(/)
  })
})

describe('async codegen: Kotlin', () => {
  const { book, asyncMeta } = compileFile('async-test.tree')
  const kt = castKotlin({ book, asyncMeta })

  it('generates suspend fun for fetch-data', () => {
    expect(kt).toContain('suspend fun fetchData(')
  })

  it('generates regular fun for process', () => {
    expect(kt).toContain('fun process(')
    expect(kt).not.toMatch(/suspend fun process\(/)
  })
})

describe('async codegen: Swift', () => {
  const { book, asyncMeta } = compileFile('async-test.tree')
  const sw = castSwift({ book, asyncMeta })

  it('generates async func for fetch-data', () => {
    expect(sw).toContain('func fetchData(')
    expect(sw).toContain('async')
  })

  it('generates regular func for process', () => {
    expect(sw).toContain('func process(')
  })
})

describe('async codegen: HVM', () => {
  const { book, asyncMeta } = compileFile('async-test.tree')
  const hvm = castHVM({ book, asyncMeta })

  it('emits IO_bind for async programs', () => {
    expect(hvm).toContain('@IO_bind')
  })

  it('wraps async function in IO', () => {
    expect(hvm).toContain('IO_Done')
  })

  it('generates pure function for process', () => {
    expect(hvm).toContain('@process')
  })
})
