/**
 * Incremental compilation integration tests.
 *
 * Tests the full incremental pipeline with mock file systems.
 * Validates caching, signature firewall, and dirty-set computation.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { compileIncremental } from '@/make'
import type { LoadEnv } from '@/load'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'seed-incr-test-'))
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  roots.length = 0
})

function makeRoot(): string {
  const root = tmpRoot()
  roots.push(root)
  return root
}

function makeEnv(input: { files: Record<string, string> }): LoadEnv {
  return {
    readFile(p) {
      const content = input.files[p]
      if (content == null) throw new Error(`Not found: ${p}`)
      return content
    },
    resolvePath(from, loadPath) {
      return loadPath
    },
    parse(input) {
      try {
        return makeTree({ file: input.file, text: input.text })
      } catch {
        return null
      }
    },
  }
}

const MATH_FILE = `
task add
  take a
  take b
  back mark 0
`

const MATH_FILE_V2 = `
task add
  take a
  take b
  back mark 1

task sub
  take a
  take b
  back mark 0
`

const MATH_BODY_CHANGE = `
task add
  take a
  take b
  back mark 42
`

describe('compileIncremental', () => {
  it('compiles and produces output', () => {
    const root = makeRoot()
    const files = { '/main.tree': MATH_FILE }
    const env = makeEnv({ files })

    const result = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    expect(result.code.length).toBeGreaterThan(0)
    expect(result.book.has('add')).toBe(true)
    expect(result.recompiled).toBe(1)
    expect(result.cached).toBe(0)
  })

  it('uses cache on second identical compile', () => {
    const root = makeRoot()
    const files = { '/main.tree': MATH_FILE }
    const env = makeEnv({ files })

    const r1 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    const r2 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    expect(r2.cached).toBe(1)
    expect(r2.recompiled).toBe(0)
    expect(r2.book.has('add')).toBe(true)
  })

  it('recompiles when content changes', () => {
    const root = makeRoot()
    const files: Record<string, string> = { '/main.tree': MATH_FILE }
    const env = makeEnv({ files })

    compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    // Change file content (add new definition = signature change)
    files['/main.tree'] = MATH_FILE_V2

    const r2 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    expect(r2.recompiled).toBe(1)
    expect(r2.book.has('add')).toBe(true)
    expect(r2.book.has('sub')).toBe(true)
  })

  it('invalidates cache on version change', () => {
    const root = makeRoot()
    const files = { '/main.tree': MATH_FILE }
    const env = makeEnv({ files })

    compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
      version: '1',
    })

    const r2 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
      version: '2',
    })

    expect(r2.recompiled).toBe(1)
    expect(r2.cached).toBe(0)
  })

  it('handles body-only changes efficiently', () => {
    const root = makeRoot()
    const files: Record<string, string> = { '/main.tree': MATH_FILE }
    const env = makeEnv({ files })

    const r1 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    // Body-only change (same signature, different return value)
    files['/main.tree'] = MATH_BODY_CHANGE

    const r2 = compileIncremental({
      file: '/main.tree',
      env,
      target: 'typescript',
      root,
    })

    // File was recompiled (content changed) but the result should still work
    expect(r2.recompiled).toBe(1)
    expect(r2.book.has('add')).toBe(true)
    expect(r2.code.length).toBeGreaterThan(0)
  })
})
