/**
 * Rust backend test: standalone bust (panic/throw).
 *
 * Tests that the `bust` keyword with a message compiles to
 * `panic!()` in Rust and panics at runtime when reached.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-halt-panic')

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
    // Normal path: 10 / 2 = 5
    let result = safe_div(10, 2);
    println!("div={}", result);

    // Panic path: 10 / 0 should panic
    let _bad = safe_div(10, 0);
    println!("should not reach here");
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

describe('rust: E2E standalone bust (panic)', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('halt-test.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates panic! in the halt path', () => {
    expect(generatedRust).toContain('panic!')
    expect(generatedRust).toContain('division by zero')
  })

  it('generates the safe_div function', () => {
    expect(generatedRust).toContain('fn safe_div(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_halt_panic'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error('generated rust:', generatedRust)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('executes normal path correctly', () => {
    const result = run({ cmd: resolve(TMP, 'test_halt_panic'), args: [] })
    // The program will panic on the second call, but the first println should appear
    expect(result.stdout).toContain('div=5')
  })

  it('panics on division by zero', () => {
    const result = run({ cmd: resolve(TMP, 'test_halt_panic'), args: [] })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('division by zero')
  })
})
