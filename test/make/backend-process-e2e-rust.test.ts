/**
 * Rust E2E process tests: compile Rust source, execute binary, verify output.
 *
 * Tests real child process spawning with stdio piping using Rust's
 * std::process. Validates spawn + stdout read and stdin write + read.
 *
 * Skips if rustc is not available.
 */

import { execFileSync } from 'child_process'
import {
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-process-e2e-rust')

let hasRustc = false

function run(input: {
  cmd: string
  args: string[]
  cwd?: string
  timeout?: number
}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(input.cmd, input.args, {
      cwd: input.cwd ?? TMP,
      encoding: 'utf-8',
      timeout: input.timeout ?? 120_000,
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

beforeAll(() => {
  const check = run({ cmd: 'rustc', args: ['--version'], cwd: '/' })
  hasRustc = check.code === 0
  if (hasRustc) {
    mkdirSync(TMP, { recursive: true })
  }
})

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true })
  }
})

describe('rust E2E: spawn echo and read stdout', () => {
  it('spawns echo hello, reads stdout', () => {
    if (!hasRustc) return

    const src = `
use std::process::Command;

fn main() {
    let output = Command::new("echo")
        .arg("hello")
        .output()
        .expect("failed to spawn echo");

    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    println!("code={}", code);
    println!("stdout={}", stdout);
    println!("stderr={}", stderr);
}
`
    writeFileSync(resolve(TMP, 'spawn_echo.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: ['-A', 'warnings', resolve(TMP, 'spawn_echo.rs'), '-o', resolve(TMP, 'spawn_echo')],
    })
    if (compile.code !== 0) {
      console.error('rustc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'spawn_echo'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('code=0')
    expect(result.stdout).toContain('stdout=hello')
  }, 60_000)
})

describe('rust E2E: spawn cat, write stdin, read stdout', () => {
  it('pipes data through cat via stdin/stdout', () => {
    if (!hasRustc) return

    const src = `
use std::io::Write;
use std::process::{Command, Stdio};

fn main() {
    let mut child = Command::new("cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to spawn cat");

    {
        let stdin = child.stdin.as_mut().expect("failed to open stdin");
        stdin.write_all(b"hello from stdin").expect("failed to write");
    }

    let output = child.wait_with_output().expect("failed to wait");
    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    println!("code={}", code);
    println!("stdout={}", stdout);
}
`
    writeFileSync(resolve(TMP, 'stdin_cat.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: ['-A', 'warnings', resolve(TMP, 'stdin_cat.rs'), '-o', resolve(TMP, 'stdin_cat')],
    })
    if (compile.code !== 0) {
      console.error('rustc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'stdin_cat'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('code=0')
    expect(result.stdout).toContain('stdout=hello from stdin')
  }, 60_000)
})
