/**
 * Swift backend end-to-end test.
 *
 * Compiles stdlib-bool.tree to Swift, appends a main harness,
 * writes to a temp file, compiles with swiftc, and verifies output.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-swift-run')

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

func printResult(_ name: String, _ val: Any) {
    if let b = val as? Bool {
        switch b {
        case .\`true\`:
            print("\\(name)=0")
        case .\`false\`:
            print("\\(name)=1")
        }
    }
}

let t: Any = Bool.\`true\`
let f: Any = Bool.\`false\`

printResult("not_t", boolNot(t))
printResult("not_f", boolNot(f))
printResult("and_tt", boolAnd(t, t))
printResult("and_tf", boolAnd(t, f))
printResult("or_ff", boolOr(f, f))
printResult("or_ft", boolOr(f, t))
printResult("xor_tt", boolXor(t, t))
printResult("xor_tf", boolXor(t, f))
printResult("eq_tt", boolEq(t, t))
printResult("eq_tf", boolEq(t, f))
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

describe('swift: E2E Bool compilation', () => {
  let generatedSwift = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedSwift = compileTreeToSwift('stdlib-bool.tree')
    const fullSource = generatedSwift + MAIN_HARNESS
    writeFileSync(resolve(TMP, 'main.swift'), fullSource)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('generates valid Swift source', () => {
    expect(generatedSwift).toContain('enum Bool')
    expect(generatedSwift).toContain('func boolNot(')
  })

  it('generates enum cases', () => {
    expect(generatedSwift).toContain('case `true`')
    expect(generatedSwift).toContain('case `false`')
  })

  it('generates switch statements', () => {
    expect(generatedSwift).toContain('switch')
    expect(generatedSwift).toContain('case .`true`')
  })

  it('compiles with swiftc', () => {
    const result = run({
      cmd: 'swiftc',
      args: [
        resolve(TMP, 'main.swift'),
        '-o',
        resolve(TMP, 'test_bool'),
      ],
    })
    if (result.code !== 0) {
      console.error('swiftc stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
  }, 60_000)

  it('not(true) = false', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('not_t=1')
  })

  it('not(false) = true', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('not_f=0')
  })

  it('and(t,t) = true', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('and_tt=0')
  })

  it('and(t,f) = false', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('and_tf=1')
  })

  it('or(f,f) = false', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('or_ff=1')
  })

  it('or(f,t) = true', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('or_ft=0')
  })

  it('xor(t,t) = false', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('xor_tt=1')
  })

  it('xor(t,f) = true', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('xor_tf=0')
  })

  it('eq(t,t) = true', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('eq_tt=0')
  })

  it('eq(t,f) = false', () => {
    const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] })
    expect(result.stdout).toContain('eq_tf=1')
  })
})
