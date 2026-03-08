/**
 * Rust backend test: halt code (debugger breakpoint).
 *
 * Tests that the `halt code` keyword compiles and runs without error
 * in Rust (emitted as a comment, no-op).
 */

import { execFileSync } from 'child_process'
import {
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/rust'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-rest')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToRust(name: string): string {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book } = desugarCard({ card })
  return castBook({ book })
}

const MAIN_HARNESS = `

fn main() {
    let result = debug_add(3, 4);
    println!("result={}", result);
}
`

function run(input: {
  cmd: string
  args: string[]
  cwd?: string
}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(input.cmd, input.args, {
      cwd: input.cwd ?? TMP,
      encoding: 'utf-8',
      timeout: 120_000,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e: unknown) {
    const err = e as {
      status?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

describe('rust: E2E rest (debugger breakpoint)', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('rest-test.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates a breakpoint comment', () => {
    expect(generatedRust).toContain('breakpoint')
  })

  it('generates the debug_add function', () => {
    expect(generatedRust).toContain('fn debug_add(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_rest'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error('generated rust:', generatedRust)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('runs and computes correctly despite breakpoint', () => {
    const result = run({ cmd: resolve(TMP, 'test_rest'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('result=7')
  })
})
