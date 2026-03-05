/**
 * Swift backend E2E test for fib.
 *
 * Compiles fib.tree to Swift, appends a main harness,
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-swift-fib')

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

func natOf(_ n: Int) -> Any {
    var result: Any = Nat.zero
    for _ in 0..<n {
        result = Nat.succ(pred: result)
    }
    return result
}

print("fib_0=\\(fib(natOf(0)) as! Int)")
print("fib_1=\\(fib(natOf(1)) as! Int)")
print("fib_5=\\(fib(natOf(5)) as! Int)")
print("fib_10=\\(fib(natOf(10)) as! Int)")
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

describe('swift: E2E fib compilation', () => {
  let generatedSwift = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedSwift = compileTreeToSwift('fib.tree')
    const fullSource = generatedSwift + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.swift'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates fib function', () => {
    expect(generatedSwift).toContain('func fib(')
  })

  it('uses while true for tail recursion', () => {
    expect(generatedSwift).toContain('while true')
  })

  it('compiles with swiftc', () => {
    const result = run({
      cmd: 'swiftc',
      args: [
        resolve(TMP, 'main.swift'),
        '-o',
        resolve(TMP, 'test_fib'),
      ],
    })
    if (result.code !== 0) {
      console.error('swiftc stderr:', result.stderr)
      console.error('generated:', generatedSwift)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('fib(0) = 0', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('fib_0=0')
  })

  it('fib(1) = 1', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_1=1')
  })

  it('fib(5) = 5', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_5=5')
  })

  it('fib(10) = 55', () => {
    const result = run({ cmd: resolve(TMP, 'test_fib'), args: [] })
    expect(result.stdout).toContain('fib_10=55')
  })
})
