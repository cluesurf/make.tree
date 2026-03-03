/**
 * Rust backend end-to-end test: trait methods with extra parameters.
 *
 * Tests trait methods beyond the simple &self-only pattern:
 * - Methods with &self plus additional typed parameters
 * - Methods without self (static methods)
 * - Methods with &self plus two extra parameters
 * - Multiple trait impls with varied method signatures
 *
 * Tests: trait method codegen, param types in impl blocks,
 * static method codegen (no &self), multi-param methods.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-trait-params')

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
    let p1 = make_point(3, 4);
    let p2 = make_point(10, 20);

    // distance_to: &self + other param
    println!("dist={}", p1.distance_to(p2.clone()));

    // from_value: static method (no &self)
    let p3 = <Point as Measurable>::from_value(7);
    println!("from_x={}", p3.x);
    println!("from_y={}", p3.y);

    // scale: &self + factor param
    let p4 = p1.scale(3);
    println!("scale_x={}", p4.x);
    println!("scale_y={}", p4.y);

    // add_to: &self + other + offset (3 params)
    let p5 = p1.add_to(p2.clone(), 100);
    println!("add_x={}", p5.x);
    println!("add_y={}", p5.y);
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

describe('rust: E2E trait methods with extra params', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('trait-params.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  // -- Structural: trait definitions --

  it('generates trait Measurable with distance_to and from_value', () => {
    expect(generatedRust).toContain('trait Measurable')
    expect(generatedRust).toMatch(/fn distance_to\(&self.*\) -> u64;/)
    expect(generatedRust).toMatch(/fn from_value\(.*\) -> /)
  })

  it('generates trait Scalable with scale and add_to', () => {
    expect(generatedRust).toContain('trait Scalable')
    expect(generatedRust).toMatch(/fn scale\(&self.*\) -> /)
    expect(generatedRust).toMatch(/fn add_to\(&self.*\) -> /)
  })

  it('distance_to trait method has &self plus other param', () => {
    expect(generatedRust).toMatch(/fn distance_to\(&self, other: /)
  })

  it('from_value trait method has no &self (static method)', () => {
    // from_value should NOT have &self since the first param is "value", not "self"
    expect(generatedRust).toMatch(/fn from_value\(value: u64\)/)
  })

  it('add_to has &self plus two extra params', () => {
    expect(generatedRust).toMatch(/fn add_to\(&self, other: .+, offset: u64\)/)
  })

  // -- Structural: impl blocks --

  it('generates impl Measurable for Point', () => {
    expect(generatedRust).toContain('impl Measurable for Point')
  })

  it('generates impl Scalable for Point', () => {
    expect(generatedRust).toContain('impl Scalable for Point')
  })

  it('no standalone distance_to or scale functions', () => {
    expect(generatedRust).not.toMatch(/^fn distance_to\(/m)
    expect(generatedRust).not.toMatch(/^fn scale\(/m)
    expect(generatedRust).not.toMatch(/^fn from_value\(/m)
    expect(generatedRust).not.toMatch(/^fn add_to\(/m)
  })

  it('standalone make_point exists', () => {
    expect(generatedRust).toMatch(/^fn make_point\(/m)
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
        resolve(TMP, 'test_trait_params'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error('generated rust:', generatedRust)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  // -- Runtime: &self + other param --

  it('distance_to computes correctly', () => {
    // distance_to just adds self.x + other.x = 3 + 10 = 13
    const result = run({ cmd: resolve(TMP, 'test_trait_params'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('dist=13')
  })

  // -- Runtime: static method --

  it('from_value creates point with both coords equal', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait_params'), args: [] })
    expect(result.stdout).toContain('from_x=7')
    expect(result.stdout).toContain('from_y=7')
  })

  // -- Runtime: &self + factor --

  it('scale multiplies both coords', () => {
    // scale(3): x = 3*3 = 9, y = 4*3 = 12
    const result = run({ cmd: resolve(TMP, 'test_trait_params'), args: [] })
    expect(result.stdout).toContain('scale_x=9')
    expect(result.stdout).toContain('scale_y=12')
  })

  // -- Runtime: &self + other + offset (3 params) --

  it('add_to combines self + other + offset', () => {
    // add_to(p2, 100): x = (3+10)+100 = 113, y = (4+20)+100 = 124
    const result = run({ cmd: resolve(TMP, 'test_trait_params'), args: [] })
    expect(result.stdout).toContain('add_x=113')
    expect(result.stdout).toContain('add_y=124')
  })
})
