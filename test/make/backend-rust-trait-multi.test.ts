/**
 * Rust backend end-to-end test: Multiple traits, bare impl, suit blocks.
 *
 * Tests:
 * - Two mask traits (printable + numeric) on the same form
 * - Bare impl block (wear without matching mask)
 * - Suit block (standalone impl outside the form)
 * - All methods grouped into correct impl blocks
 * - Standalone functions remain outside impl blocks
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
import { collectTraits } from '@/cast/trait'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-trait-multi')

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
  const traits = collectTraits({ card })
  const { book } = desugarCard({ card })
  return castBook({ book, traits })
}

const MAIN_HARNESS = `

fn main() {
    // Test multiple trait impls on Color
    let r = make_red();
    let g = make_green();
    let b = make_blue();
    println!("r_text={}", r.to_text());
    println!("g_text={}", g.to_text());
    println!("r_num={}", r.to_number());
    println!("g_num={}", g.to_number());
    println!("b_num={}", b.to_number());

    // Test bare impl (warmth)
    println!("r_warm={}", r.warmth());
    println!("g_warm={}", g.warmth());
    println!("b_warm={}", b.warmth());

    // Test suit impl (to_text on Shape via Printable)
    let c = make_circle();
    let s = make_square();
    println!("c_text={}", c.to_text());
    println!("s_text={}", s.to_text());
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

describe('rust: E2E Multiple traits, bare impl, suit', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('trait-multi.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  // -- Structural: two mask traits --

  it('generates trait Printable', () => {
    expect(generatedRust).toContain('trait Printable')
    expect(generatedRust).toContain('fn to_text(&self) -> String;')
  })

  it('generates trait Numeric', () => {
    expect(generatedRust).toContain('trait Numeric')
    expect(generatedRust).toContain('fn to_number(&self) -> u64;')
  })

  // -- Structural: two trait impls on Color --

  it('generates impl Printable for Color', () => {
    expect(generatedRust).toContain('impl Printable for Color')
  })

  it('generates impl Numeric for Color', () => {
    expect(generatedRust).toContain('impl Numeric for Color')
  })

  // -- Structural: bare impl block --

  it('generates bare impl Color (no trait name)', () => {
    expect(generatedRust).toMatch(/impl Color \{/)
  })

  it('bare impl contains warmth method', () => {
    // warmth should be inside impl Color { ... }, not standalone
    const standalone = generatedRust.match(/^fn warmth\(/m)
    expect(standalone).toBeNull()
    expect(generatedRust).toContain('fn warmth(')
  })

  // -- Structural: suit impl on Shape --

  it('generates impl Printable for Shape', () => {
    expect(generatedRust).toContain('impl Printable for Shape')
  })

  it('suit to_text method is not standalone', () => {
    // to_text for Shape should only appear inside impl block
    const standalone = generatedRust.match(/^fn to_text\(/m)
    expect(standalone).toBeNull()
  })

  // -- Structural: standalone functions remain outside --

  it('generates standalone make functions', () => {
    expect(generatedRust).toMatch(/^fn make_red\(/m)
    expect(generatedRust).toMatch(/^fn make_green\(/m)
    expect(generatedRust).toMatch(/^fn make_blue\(/m)
    expect(generatedRust).toMatch(/^fn make_circle\(/m)
    expect(generatedRust).toMatch(/^fn make_square\(/m)
  })

  // -- Compilation --

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_trait_multi'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error('generated rust:', generatedRust)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  // -- Runtime: multiple trait impls --

  it('to_text works for Color', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait_multi'), args: [] })
    expect(result.stdout).toContain('r_text=red')
    expect(result.stdout).toContain('g_text=green')
  })

  it('to_number works for Color', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait_multi'), args: [] })
    expect(result.stdout).toContain('r_num=1')
    expect(result.stdout).toContain('g_num=2')
    expect(result.stdout).toContain('b_num=3')
  })

  // -- Runtime: bare impl --

  it('warmth works for Color', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait_multi'), args: [] })
    expect(result.stdout).toContain('r_warm=1')
    expect(result.stdout).toContain('g_warm=0')
    expect(result.stdout).toContain('b_warm=0')
  })

  // -- Runtime: suit impl --

  it('to_text works for Shape via suit', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait_multi'), args: [] })
    expect(result.stdout).toContain('c_text=circle')
    expect(result.stdout).toContain('s_text=square')
  })
})
