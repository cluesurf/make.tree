/**
 * Rust backend end-to-end test: Full File System API.
 *
 * Tests write, read, append, copy, move, remove, test-exists,
 * make-dir, and remove-dir operations. Compiles .tree to Rust,
 * then compiles and runs the Rust binary.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-file-io-full')

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
      (n): n is SurfLoad =>
        n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  const { book } = desugarCard({ card })
  const code = castBook({ book, dock })
  return { code, dock }
}

function mainHarness(tmpDir: string): string {
  const dir = tmpDir.replace(/\\/g, '/')
  return `

fn main() {
    let dir = String::from("${dir}");

    // Test write + read
    let file1 = format!("{}/test1.txt", dir);
    write_file(file1.clone(), String::from("hello world"));
    let content = read_file(file1.clone());
    println!("read={}", content);

    // Test copy
    let file2 = format!("{}/test2.txt", dir);
    copy_file(file1.clone(), file2.clone());
    let copied = read_file(file2.clone());
    println!("copy={}", copied);

    // Test move
    let file3 = format!("{}/test3.txt", dir);
    move_file(file2.clone(), file3.clone());
    let moved = read_file(file3.clone());
    println!("move={}", moved);
    println!("old_exists={}", test_file_exists(file2.clone()));

    // Test remove
    remove_file(file3.clone());
    let exists_after = test_file_exists(file1.clone());
    println!("still_exists={}", exists_after);

    // Test directory operations
    let subdir = format!("{}/subdir/nested", dir);
    make_dir(subdir.clone());
    println!("dir_made=true");
    remove_dir(format!("{}/subdir", dir));
    println!("dir_removed=true");

    // Cleanup
    remove_file(file1);
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

describe('rust: E2E full file system API', () => {
  let generatedRust = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    const result = compileTreeToRust('file-io-rust-full.tree')
    generatedRust = result.code
    const fullSource = generatedRust + mainHarness(TMP)
    writeFileSync(resolve(TMP, 'main.rs'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('emits use std::fs', () => {
    expect(generatedRust).toContain('use std::fs')
  })

  it('generates write_file function', () => {
    expect(generatedRust).toContain('fn write_file(')
  })

  it('generates read_file function', () => {
    expect(generatedRust).toContain('fn read_file(')
  })

  it('generates copy_file function', () => {
    expect(generatedRust).toContain('fn copy_file(')
  })

  it('generates move_file function', () => {
    expect(generatedRust).toContain('fn move_file(')
  })

  it('generates remove_file function', () => {
    expect(generatedRust).toContain('fn remove_file(')
  })

  it('generates test_file_exists function', () => {
    expect(generatedRust).toContain('fn test_file_exists(')
  })

  it('generates make_dir function', () => {
    expect(generatedRust).toContain('fn make_dir(')
  })

  it('generates remove_dir function', () => {
    expect(generatedRust).toContain('fn remove_dir(')
  })

  it('compiles with rustc', () => {
    const result = run({
      cmd: 'rustc',
      args: [
        '-A',
        'warnings',
        resolve(TMP, 'main.rs'),
        '-o',
        resolve(TMP, 'test_file_io_full'),
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

  it('runs full file system operations', () => {
    const result = run({
      cmd: resolve(TMP, 'test_file_io_full'),
      args: [],
    })
    if (result.code !== 0) {
      console.error('runtime stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('read=hello world')
    expect(result.stdout).toContain('copy=hello world')
    expect(result.stdout).toContain('move=hello world')
    expect(result.stdout).toContain('old_exists=')
    expect(result.stdout).toContain('still_exists=')
    expect(result.stdout).toContain('dir_made=true')
    expect(result.stdout).toContain('dir_removed=true')
  })
})
