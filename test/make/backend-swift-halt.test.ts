/**
 * Swift backend E2E test for error handling (halt → throws).
 *
 * Compiles halt-test.tree to Swift, appends a main harness,
 * compiles with swiftc, and verifies output.
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
import { castBook } from '@/cast/swift'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-swift-halt')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToSwift(name: string): string {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book } = desugarCard({ card })
  return castBook({ book })
}

const MAIN_HARNESS = `

// Test safe division: divide by non-zero should succeed
do {
    let result = try safeDiv(10, 2)
    print("div_ok=\\(result as! Int)")
} catch {
    print("div_ok=error")
}

// Test safe division: divide by zero should throw
do {
    let _ = try safeDiv(10, 0)
    print("div_zero=no_error")
} catch {
    print("div_zero=caught")
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
      timeout: 60_000,
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

describe('swift: E2E halt/throws compilation', () => {
  let generatedSwift = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedSwift = compileTreeToSwift('halt-test.tree')
    const fullSource = generatedSwift + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.swift'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates SeedError struct', () => {
    expect(generatedSwift).toContain('struct SeedError: Error')
  })

  it('generates safeDiv function with throws', () => {
    expect(generatedSwift).toContain('func safeDiv(')
    expect(generatedSwift).toContain('throws')
  })

  it('uses throw SeedError for halt', () => {
    expect(generatedSwift).toContain('throw SeedError')
  })

  it('compiles with swiftc', () => {
    const result = run({
      cmd: 'swiftc',
      args: [
        resolve(TMP, 'main.swift'),
        '-o',
        resolve(TMP, 'test_halt'),
      ],
    })
    if (result.code !== 0) {
      console.error('swiftc stderr:', result.stderr)
      console.error('generated:', generatedSwift)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('safe_div(10, 2) succeeds', () => {
    const result = run({ cmd: resolve(TMP, 'test_halt'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('div_ok=5')
  })

  it('safe_div(10, 0) throws', () => {
    const result = run({ cmd: resolve(TMP, 'test_halt'), args: [] })
    expect(result.stdout).toContain('div_zero=caught')
  })
})
