/**
 * Rust backend end-to-end test: File I/O.
 *
 * Compiles file-io-rust.tree to Rust, prepends native wrapper functions
 * (needed because Rust's fs functions return Result which we can't
 * express in treecode yet), appends a main() harness, compiles with
 * rustc, and verifies file read/write roundtrip.
 *
 * Tests: String parameter types, function calls with named args,
 * String return type inference, dock load → use statement emission,
 * and native function interop.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-file-io')

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

/**
 * Minimal native wrappers. These exist because Rust's fs functions
 * return Result<T>, which treecode can't express yet. Once the type
 * system supports Result/Option, these can move to treecode.
 */
const NATIVE_WRAPPERS = `
fn native_write_file(path: String, content: String) -> String {
    fs::write(&path, &content).unwrap();
    path
}

fn native_read_file(path: String) -> String {
    fs::read_to_string(&path).unwrap()
}
`

function mainHarness(tmpDir: string): string {
  const testFile = resolve(tmpDir, 'test.txt').replace(/\\/g, '/')
  return `

fn main() {
    let path = String::from("${testFile}");
    let content = String::from("hello from tree-lang");
    write_file(path.clone(), content);
    let result = read_file(path);
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

describe('rust: E2E File I/O', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    const result = compileTreeToRust('file-io-rust.tree')
    generatedRust = result.code
    const fullSource = generatedRust + '\n' + NATIVE_WRAPPERS + mainHarness(TMP)
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

  it('generates write_file function with String params', () => {
    expect(generatedRust).toContain('fn write_file(')
    expect(generatedRust).toContain('String')
  })

  it('generates read_file function with String param', () => {
    expect(generatedRust).toContain('fn read_file(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_file_io'),
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
    const result = run({ cmd: resolve(TMP, 'test_file_io'), args: [] })
    if (result.code !== 0) {
      console.error('runtime stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('content=hello from tree-lang')
  })
})
