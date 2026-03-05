/**
 * Kotlin backend E2E test for fib.
 *
 * Compiles fib.tree to Kotlin, appends a main harness,
 * compiles with kotlinc, and verifies output.
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
import { castBook } from '@/cast/kotlin'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-kotlin-fib')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToKotlin(name: string): string {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book } = desugarCard({ card })
  return castBook({ book })
}

const MAIN_HARNESS = `

fun natOf(n: Int): Any {
    var result: Any = Nat.Zero
    for (i in 0 until n) {
        result = Nat.Succ(pred = result)
    }
    return result
}

fun main() {
    println("fib_0=\${fib(natOf(0)) as Long}")
    println("fib_1=\${fib(natOf(1)) as Long}")
    println("fib_5=\${fib(natOf(5)) as Long}")
    println("fib_10=\${fib(natOf(10)) as Long}")
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

describe('kotlin: E2E fib compilation', () => {
  let generatedKotlin = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedKotlin = compileTreeToKotlin('fib.tree')
    const fullSource = generatedKotlin + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.kt'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates fib function', () => {
    expect(generatedKotlin).toContain('fun fib(')
  })

  it('uses while (true) for tail recursion', () => {
    expect(generatedKotlin).toContain('while (true)')
  })

  it('compiles with kotlinc', () => {
    const result = run({
      cmd: 'kotlinc',
      args: [
        resolve(TMP, 'main.kt'),
        '-include-runtime',
        '-d',
        resolve(TMP, 'test_fib.jar'),
      ],
    })
    if (result.code !== 0) {
      console.error('kotlinc stderr:', result.stderr)
      console.error('generated:', generatedKotlin)
    }
    expect(result.code).toBe(0)
  }, 120_000)

  it('fib(0) = 0', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_fib.jar')] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('fib_0=0')
  })

  it('fib(1) = 1', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_fib.jar')] })
    expect(result.stdout).toContain('fib_1=1')
  })

  it('fib(5) = 5', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_fib.jar')] })
    expect(result.stdout).toContain('fib_5=5')
  })

  it('fib(10) = 55', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_fib.jar')] })
    expect(result.stdout).toContain('fib_10=55')
  })
})
