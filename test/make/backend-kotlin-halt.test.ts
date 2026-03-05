/**
 * Kotlin backend E2E test for error handling (halt → throw).
 *
 * Compiles halt-test.tree to Kotlin, appends a main harness,
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-kotlin-halt')

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

fun main() {
    // Test safe division: divide by non-zero should succeed
    try {
        val result = safeDiv(10L as Any, 2L as Any)
        println("div_ok=\${result as Long}")
    } catch (e: SeedError) {
        println("div_ok=error")
    }

    // Test safe division: divide by zero should throw
    try {
        safeDiv(10L as Any, 0L as Any)
        println("div_zero=no_error")
    } catch (e: SeedError) {
        println("div_zero=caught")
    }
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

describe('kotlin: E2E halt/throw compilation', () => {
  let generatedKotlin = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedKotlin = compileTreeToKotlin('halt-test.tree')
    const fullSource = generatedKotlin + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.kt'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates SeedError class', () => {
    expect(generatedKotlin).toContain('class SeedError')
  })

  it('generates safeDiv function', () => {
    expect(generatedKotlin).toContain('fun safeDiv(')
  })

  it('uses throw SeedError for halt', () => {
    expect(generatedKotlin).toContain('throw SeedError')
  })

  it('compiles with kotlinc', () => {
    const result = run({
      cmd: 'kotlinc',
      args: [
        resolve(TMP, 'main.kt'),
        '-include-runtime',
        '-d',
        resolve(TMP, 'test_halt.jar'),
      ],
    })
    if (result.code !== 0) {
      console.error('kotlinc stderr:', result.stderr)
      console.error('generated:', generatedKotlin)
    }
    expect(result.code).toBe(0)
  }, 120_000)

  it('safe_div(10, 2) succeeds', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_halt.jar')] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('div_ok=5')
  })

  it('safe_div(10, 0) throws', () => {
    const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_halt.jar')] })
    expect(result.stdout).toContain('div_zero=caught')
  })
})
