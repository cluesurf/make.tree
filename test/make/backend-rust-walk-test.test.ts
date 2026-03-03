/**
 * Rust backend end-to-end test: walk test (while loops).
 *
 * Compiles walk-test.tree to Rust. The .tree file uses `walk test`
 * with comparison operators to produce native while loops in Rust.
 *
 * Tests: walk test → while, let mut for mutable variables,
 * reassignment inside loop body, u64 return type inference.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-walk-test')

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

function mainHarness(): string {
  return `

fn main() {
    // count_to tests
    println!("count_to(5)={}", count_to(5));
    println!("count_to(0)={}", count_to(0));
    println!("count_to(10)={}", count_to(10));

    // factorial tests
    println!("factorial(0)={}", factorial(0));
    println!("factorial(1)={}", factorial(1));
    println!("factorial(5)={}", factorial(5));
    println!("factorial(10)={}", factorial(10));

    // count_down tests
    println!("count_down(5)={}", count_down(5));
    println!("count_down(0)={}", count_down(0));
}
`
}

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

describe('rust: E2E walk test (while loops)', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('walk-test.tree')
    const fullSource = generatedRust + mainHarness()
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates while loops instead of recursion', () => {
    expect(generatedRust).toContain('while ')
    expect(generatedRust).not.toContain('loop {')
  })

  it('generates let mut for mutable variables', () => {
    expect(generatedRust).toMatch(/let mut total/)
    expect(generatedRust).toMatch(/let mut i/)
    expect(generatedRust).toMatch(/let mut result/)
  })

  it('generates reassignment inside while body', () => {
    // Inside the while body, save → assignment (not let)
    expect(generatedRust).toMatch(/^\s+total = /m)
    expect(generatedRust).toMatch(/^\s+i = /m)
  })

  it('generates native arithmetic operators', () => {
    expect(generatedRust).toMatch(/\(total \+ i\)/)
    expect(generatedRust).toMatch(/\(i \+ 1/)
  })

  it('generates count_to function with u64 params', () => {
    expect(generatedRust).toContain('fn count_to(n: u64)')
  })

  it('generates factorial function', () => {
    expect(generatedRust).toContain('fn factorial(n: u64)')
  })

  it('generates count_down function', () => {
    expect(generatedRust).toContain('fn count_down(n: u64)')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_walk'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error(
        'Generated source:\n',
        readFileSync(resolve(TMP, 'main.rs'), 'utf8'),
      )
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('count_to returns correct values', () => {
    const result = run({ cmd: resolve(TMP, 'test_walk'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('count_to(5)=10')
    expect(result.stdout).toContain('count_to(0)=0')
    expect(result.stdout).toContain('count_to(10)=45')
  })

  it('factorial returns correct values', () => {
    const result = run({ cmd: resolve(TMP, 'test_walk'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('factorial(0)=1')
    expect(result.stdout).toContain('factorial(1)=1')
    expect(result.stdout).toContain('factorial(5)=120')
    expect(result.stdout).toContain('factorial(10)=3628800')
  })

  it('count_down returns correct values', () => {
    const result = run({ cmd: resolve(TMP, 'test_walk'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('count_down(5)=0')
    expect(result.stdout).toContain('count_down(0)=0')
  })
})
