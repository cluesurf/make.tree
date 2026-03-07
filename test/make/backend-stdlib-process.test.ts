/**
 * Cross-backend tests for process spawn/child stdlib types.
 *
 * Validates that process-result, process-child, exit-code constants,
 * run/spawn/child-wait/child-write/child-read/signal-listen functions
 * compile through all backends without errors.
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

describe('process module: TypeScript', () => {
  const book = compileFile('stdlib-process-spawn.tree')
  const ts = castTS({ book })

  it('generates ProcessResult type', () => {
    expect(ts).toContain('ProcessResult')
  })

  it('generates ProcessChild type', () => {
    expect(ts).toContain('ProcessChild')
  })

  it('generates run function', () => {
    expect(ts).toContain('export function run(')
  })

  it('generates spawn function', () => {
    expect(ts).toContain('export function spawn(')
  })

  it('generates childWait function', () => {
    expect(ts).toContain('export function childWait(')
  })

  it('generates childWrite function', () => {
    expect(ts).toContain('export function childWrite(')
  })

  it('generates childRead function', () => {
    expect(ts).toContain('export function childRead(')
  })

  it('generates signalListen function', () => {
    expect(ts).toContain('export function signalListen(')
  })

  it('generates isSuccess function', () => {
    expect(ts).toContain('export function isSuccess(')
  })
})

describe('process module: Rust', () => {
  const book = compileFile('stdlib-process-spawn.tree')
  const rs = castRust({ book })

  it('generates ProcessResult struct', () => {
    expect(rs).toContain('struct ProcessResult')
  })

  it('generates ProcessChild struct', () => {
    expect(rs).toContain('struct ProcessChild')
  })

  it('generates run function', () => {
    expect(rs).toContain('fn run(')
  })

  it('generates spawn function', () => {
    expect(rs).toContain('fn spawn(')
  })

  it('generates child_wait function', () => {
    expect(rs).toContain('fn child_wait(')
  })

  it('generates child_read function', () => {
    expect(rs).toContain('fn child_read(')
  })

  it('generates signal_listen function with closure', () => {
    expect(rs).toContain('fn signal_listen(')
    expect(rs).toContain('impl Fn')
  })

  it('generates is_success function', () => {
    expect(rs).toContain('fn is_success(')
  })
})

describe('process module: Kotlin', () => {
  const book = compileFile('stdlib-process-spawn.tree')
  const kt = castKotlin({ book })

  it('generates ProcessResult class', () => {
    expect(kt).toContain('ProcessResult')
  })

  it('generates ProcessChild class', () => {
    expect(kt).toContain('ProcessChild')
  })

  it('generates run function', () => {
    expect(kt).toContain('run')
  })

  it('generates spawn function', () => {
    expect(kt).toContain('spawn')
  })

  it('generates childWait function', () => {
    expect(kt).toContain('childWait')
  })

  it('generates signalListen function', () => {
    expect(kt).toContain('signalListen')
  })

  it('generates isSuccess function', () => {
    expect(kt).toContain('isSuccess')
  })
})

describe('process module: Swift', () => {
  const book = compileFile('stdlib-process-spawn.tree')
  const sw = castSwift({ book })

  it('generates ProcessResult struct', () => {
    expect(sw).toContain('ProcessResult')
  })

  it('generates ProcessChild struct', () => {
    expect(sw).toContain('ProcessChild')
  })

  it('generates run function', () => {
    expect(sw).toContain('run')
  })

  it('generates spawn function', () => {
    expect(sw).toContain('spawn')
  })

  it('generates childWait function', () => {
    expect(sw).toContain('childWait')
  })

  it('generates signalListen function', () => {
    expect(sw).toContain('signalListen')
  })
})

describe('process module: HVM', () => {
  const book = compileFile('stdlib-process-spawn.tree')
  const hvm = castHVM({ book })

  it('generates run definition', () => {
    expect(hvm).toContain('@run')
  })

  it('generates spawn definition', () => {
    expect(hvm).toContain('@spawn')
  })

  it('generates child_wait definition', () => {
    expect(hvm).toContain('@child_wait')
  })

  it('generates signal_listen definition', () => {
    expect(hvm).toContain('@signal_listen')
  })

  it('generates is_success definition', () => {
    expect(hvm).toContain('@is_success')
  })
})
