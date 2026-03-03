/**
 * Rust backend end-to-end test: Fibonacci with Nat type.
 *
 * Compiles nat-fib.tree to Rust, appends a main() harness,
 * writes to a temp file, compiles with rustc, and verifies output.
 *
 * Tests: recursive ADT (Nat with Box<Nat> field), pattern matching
 * with field destructuring, recursive function calls, and
 * constructor creation with Box::new().
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-fib')

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

fn nat_from_u64(n: u64) -> Nat {
    if n == 0 {
        Nat::Zero
    } else {
        Nat::Succ { pred: Box::new(nat_from_u64(n - 1)) }
    }
}

fn nat_to_u64(n: Nat) -> u64 {
    match n {
        Nat::Zero => 0,
        Nat::Succ { pred } => 1 + nat_to_u64(*pred),
    }
}

fn main() {
    println!("is_zero_0={}", nat_is_zero(nat_from_u64(0)) == Bool::True);
    println!("is_zero_3={}", nat_is_zero(nat_from_u64(3)) == Bool::False);

    println!("add_2_3={}", nat_to_u64(nat_add(nat_from_u64(2), nat_from_u64(3))));

    println!("fib_0={}", nat_to_u64(nat_fib(nat_from_u64(0))));
    println!("fib_1={}", nat_to_u64(nat_fib(nat_from_u64(1))));
    println!("fib_2={}", nat_to_u64(nat_fib(nat_from_u64(2))));
    println!("fib_3={}", nat_to_u64(nat_fib(nat_from_u64(3))));
    println!("fib_4={}", nat_to_u64(nat_fib(nat_from_u64(4))));
    println!("fib_5={}", nat_to_u64(nat_fib(nat_from_u64(5))));
    println!("fib_6={}", nat_to_u64(nat_fib(nat_from_u64(6))));
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

describe('rust: E2E Fibonacci with Nat', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('nat-fib.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates Nat enum with Box field', () => {
    expect(generatedRust).toContain('enum Nat')
    expect(generatedRust).toContain('Succ { pred: Box<Nat> }')
  })

  it('generates qualified constructors', () => {
    expect(generatedRust).toContain('Nat::Zero')
    expect(generatedRust).toContain('Nat::Succ')
    expect(generatedRust).toContain('Box::new(')
  })

  it('generates nat_fib function', () => {
    expect(generatedRust).toContain('fn nat_fib(')
  })

  it('generates nat_add function', () => {
    expect(generatedRust).toContain('fn nat_add(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_fib'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('nat_is_zero works', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('is_zero_0=true')
    expect(result.stdout).toContain('is_zero_3=true')
  })

  it('nat_add(2, 3) = 5', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('add_2_3=5')
  })

  it('fib(0) = 0', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_0=0')
  })

  it('fib(1) = 1', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_1=1')
  })

  it('fib(2) = 1', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_2=1')
  })

  it('fib(3) = 2', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_3=2')
  })

  it('fib(4) = 3', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_4=3')
  })

  it('fib(5) = 5', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_5=5')
  })

  it('fib(6) = 8', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_6=8')
  })
})
