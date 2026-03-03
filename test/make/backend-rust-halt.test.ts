/**
 * Rust backend end-to-end test: halt kink (error propagation).
 *
 * Compiles file-io-halt.tree to Rust. The .tree file uses `halt kink`
 * on call sites to propagate errors. The compiled Rust should use the
 * `?` operator, `Result<T, E>` return types, and `Ok(..)` wrapping.
 *
 * Tests: halt kink → ? operator, Result return type inference,
 * Ok() wrapping of final return values.
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
import type { SurfLoad } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-halt')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToRust(name: string): {
  code: string
  dock: Array<{ path: string; name?: string }>
} {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })

  const dock = card.list
    .filter(
      (n): n is SurfLoad => n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  const book = desugarCard({ card })
  const code = castBook({ book, dock })
  return { code, dock }
}

function mainHarness(tmpDir: string): string {
  const testFile = resolve(tmpDir, 'test.txt').replace(/\\/g, '/')
  return `

fn main() {
    let path = String::from("${testFile}");
    let content = String::from("hello from tree-lang");
    write_file(path.clone(), content).unwrap();
    let result = read_file(path).unwrap();
    println!("content={}", result);
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

describe('rust: E2E halt kink (error propagation with ?)', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    const result = compileTreeToRust('file-io-halt.tree')
    generatedRust = result.code
    const fullSource = generatedRust + mainHarness(TMP)
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('emits use statement from dock load', () => {
    expect(generatedRust).toContain('use std::fs;')
  })

  it('generates ? operator instead of .unwrap()', () => {
    expect(generatedRust).toContain('?')
    expect(generatedRust).not.toContain('.unwrap()')
  })

  it('generates Result return type', () => {
    expect(generatedRust).toContain('Result<String, Box<dyn std::error::Error>>')
  })

  it('wraps final return values in Ok()', () => {
    expect(generatedRust).toContain('Ok(')
  })

  it('generates write_file with Result return', () => {
    expect(generatedRust).toContain('fn write_file(')
    expect(generatedRust).toMatch(/fn write_file\([^)]+\) -> Result</)
  })

  it('generates read_file with Result return', () => {
    expect(generatedRust).toContain('fn read_file(')
    expect(generatedRust).toMatch(/fn read_file\([^)]+\) -> Result</)
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_halt'),
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

  it('reads back written content', () => {
    const result = run({ cmd: resolve(TMP, 'test_halt'), args: [] })
    if (result.code !== 0) {
      console.error('runtime stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('content=hello from tree-lang')
  })
})
