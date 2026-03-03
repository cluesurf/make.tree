/**
 * Rust backend end-to-end test: Traits (mask/wear/suit).
 *
 * Compiles trait-test.tree to Rust, appends a main() harness,
 * writes to a temp file, compiles with rustc, and verifies output.
 *
 * Tests: trait definition, impl block, &self parameter, match on
 * self inside impl, standalone functions remain outside impl.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-trait')

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
  const book = desugarCard({ card })
  return castBook({ book, traits })
}

const MAIN_HARNESS = `

fn main() {
    let r = make_red();
    let g = make_green();
    println!("red={}", r.to_text());
    println!("green={}", g.to_text());
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

describe('rust: E2E Traits (mask/wear)', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedRust = compileTreeToRust('trait-test.tree')
    const fullSource = generatedRust + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates trait Printable', () => {
    expect(generatedRust).toContain('trait Printable')
  })

  it('generates trait method with &self', () => {
    expect(generatedRust).toContain('fn to_text(&self) -> String;')
  })

  it('generates impl Printable for Color', () => {
    expect(generatedRust).toContain('impl Printable for Color')
  })

  it('does not emit standalone to_text function', () => {
    // to_text should only appear inside impl block, not as a standalone fn
    const standalone = generatedRust.match(/^fn to_text\(/m)
    expect(standalone).toBeNull()
  })

  it('generates standalone make_red function', () => {
    expect(generatedRust).toContain('fn make_red(')
  })

  it('generates standalone make_green function', () => {
    expect(generatedRust).toContain('fn make_green(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_trait'),
      ],
    })
    if (result.code !== 0) {
      console.error('rustc stderr:', result.stderr)
      console.error('generated rust:', generatedRust)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('to_text returns correct string for red', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('red=red')
  })

  it('to_text returns correct string for green', () => {
    const result = run({ cmd: resolve(TMP, 'test_trait'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('green=green')
  })
})
