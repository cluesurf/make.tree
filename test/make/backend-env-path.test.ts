/**
 * E2E test: environment path dispatch via fork roll.
 *
 * Compiles env-variable.tree to JS, runs with node. The fixture
 * defines a single `task get` that takes a kind string and dispatches
 * to the correct os module call via fork roll.
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
import { castBook } from '@/cast/node'
import type { SurfLoad } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-env-path')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToJS(name: string): string {
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

  const { book } = desugarCard({ card })
  return castBook({ book, dock })
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
      timeout: 30_000,
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

describe('node: E2E environment get(kind) dispatch', () => {
  let generatedJS = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedJS = compileTreeToJS('env-variable.tree')

    const driver = `
console.log("home=" + get("home"))
console.log("tmp=" + get("temporary"))
console.log("hostname=" + get("hostname"))
console.log("platform=" + get("platform"))
console.log("arch=" + get("arch"))
console.log("fallback=" + get("nonsense"))
`
    writeFileSync(resolve(TMP, 'main.mjs'), generatedJS + driver)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('emits import os from node:os', () => {
    expect(generatedJS).toContain("import os from 'node:os'")
  })

  it('generates a single get function with kind param', () => {
    expect(generatedJS).toContain('function get(')
  })

  it('calls os module methods in the dispatch', () => {
    expect(generatedJS).toContain('os.homedir()')
    expect(generatedJS).toContain('os.tmpdir()')
    expect(generatedJS).toContain('os.hostname()')
    expect(generatedJS).toContain('os.platform()')
    expect(generatedJS).toContain('os.arch()')
  })

  it('returns a valid home directory starting with /', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('Generated:\n', generatedJS)
    }
    expect(result.code).toBe(0)
    const match = result.stdout.match(/home=(.+)/)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(/^\//)
  })

  it('returns a non-empty tmp directory', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    const match = result.stdout.match(/tmp=(.+)/)
    expect(match).not.toBeNull()
    expect(match![1].length).toBeGreaterThan(0)
  })

  it('returns a non-empty hostname', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    const match = result.stdout.match(/hostname=(.+)/)
    expect(match).not.toBeNull()
    expect(match![1].length).toBeGreaterThan(0)
  })

  it('returns a valid platform string', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/platform=(linux|darwin|win32|freebsd|openbsd|sunos|aix)/)
  })

  it('returns a valid architecture string', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/arch=(x64|arm64|arm|ia32|ppc64|s390x)/)
  })

  it('returns unknown for unrecognized kind', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('fallback=unknown')
  })
})
