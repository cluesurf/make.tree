/**
 * E2E test: environment read function.
 *
 * Compiles env-read.tree to JS, runs with node, verifies that
 * os.platform(), os.arch(), os.cpus().length, etc. are returned
 * in a structured info object.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-env-read')

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

describe('node: E2E environment read', () => {
  let generatedJS = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedJS = compileTreeToJS('env-read.tree')

    // readEnv is a const (no params), so it's already the result value
    const driver = `
const _info = readEnv
const _system = infoSystem(_info)
const _arch = infoArchitecture(_info)
const _cores = infoCores(_info)
const _memory = infoMemory(_info)
const _endian = infoEndian(_info)
console.log("system=" + _system)
console.log("arch=" + _arch)
console.log("cores=" + _cores)
console.log("memory=" + _memory)
console.log("endian=" + _endian)
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

  it('generates readEnv const (no-param task becomes const)', () => {
    expect(generatedJS).toContain('export const readEnv')
  })

  it('generates info accessor functions', () => {
    expect(generatedJS).toContain('function infoSystem(')
    expect(generatedJS).toContain('function infoArchitecture(')
    expect(generatedJS).toContain('function infoCores(')
    expect(generatedJS).toContain('function infoMemory(')
    expect(generatedJS).toContain('function infoEndian(')
  })

  it('calls os.platform and os.arch', () => {
    expect(generatedJS).toContain('os.platform()')
    expect(generatedJS).toContain('os.arch()')
  })

  it('runs and returns valid system string', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    if (result.code !== 0) {
      console.error('node stderr:', result.stderr)
      console.error('Generated:\n', generatedJS)
    }
    expect(result.code).toBe(0)
    // system should be one of: linux, darwin, win32, etc.
    expect(result.stdout).toMatch(/system=(linux|darwin|win32|freebsd|openbsd|sunos|aix)/)
  })

  it('runs and returns valid architecture', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/arch=(x64|arm64|arm|ia32|ppc64|s390x)/)
  })

  it('runs and returns positive core count', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    const match = result.stdout.match(/cores=(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(0)
  })

  it('runs and returns positive memory', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    const match = result.stdout.match(/memory=(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(0)
  })

  it('runs and returns valid endianness', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/endian=(LE|BE)/)
  })
})
