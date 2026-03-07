/**
 * Node.js E2E process tests: write JS scripts, run with node, verify output.
 *
 * Tests real child process spawning with stdio piping and signal
 * handling using Node.js child_process module.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-process-e2e-node')

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
  mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true })
  }
})

describe('node E2E: spawn echo and read stdout', () => {
  it('spawns echo hello, collects stdout', () => {
    const src = `
const { execFileSync } = require('child_process');

const result = execFileSync('echo', ['hello'], { encoding: 'utf-8' });
const stdout = result.trim();

console.log('stdout=' + stdout);
`
    const scriptPath = resolve(TMP, 'spawn_echo.cjs')
    writeFileSync(scriptPath, src)

    const result = run({
      cmd: 'node',
      args: [scriptPath],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('node stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('stdout=hello')
  }, 30_000)
})

describe('node E2E: spawn cat, write stdin, read stdout', () => {
  it('pipes data through cat via stdin/stdout', () => {
    const src = `
const { spawn } = require('child_process');

const child = spawn('cat', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});

child.stdin.write('hello from stdin');
child.stdin.end();

child.on('close', (code) => {
  console.log('code=' + code);
  console.log('stdout=' + stdout.trim());
});
`
    const scriptPath = resolve(TMP, 'stdin_cat.cjs')
    writeFileSync(scriptPath, src)

    const result = run({
      cmd: 'node',
      args: [scriptPath],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('node stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('code=0')
    expect(result.stdout).toContain('stdout=hello from stdin')
  }, 30_000)
})

describe('node E2E: signal handling', () => {
  it('registers SIGINT handler, sends signal to self, verifies handler', () => {
    const src = `
let signalReceived = false;

process.on('SIGINT', () => {
  signalReceived = true;
  console.log('signal_received=true');
  process.exit(0);
});

setTimeout(() => {
  process.kill(process.pid, 'SIGINT');
}, 100);

setTimeout(() => {
  console.log('signal_received=' + signalReceived);
  process.exit(1);
}, 2000);
`
    const scriptPath = resolve(TMP, 'signal_test.cjs')
    writeFileSync(scriptPath, src)

    const result = run({
      cmd: 'node',
      args: [scriptPath],
      timeout: 15_000,
    })
    expect(result.stdout).toContain('signal_received=true')
  }, 30_000)
})
