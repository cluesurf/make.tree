/**
 * Node.js backend E2E test: File system stdlib.
 *
 * Compiles base.tree/test/file/*.tree fixtures to JavaScript,
 * then runs them with Node.js to verify correctness of:
 * - read/write/append/copy/move/remove/test
 * - file handle open/read/write/close/truncate/flush
 * - symlink/hardlink/readlink
 * - stat/lstat/chmod
 * - mkdir, mkdtemp
 * - halt kink error propagation
 * - async (wait true) with fs/promises
 */

import { execFileSync } from 'child_process'
import {
  mkdirSync,
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/node'
import { loadBindNames, mergeBindNames } from '@/load/bind'
import type { SurfLoad } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const BASE_TREE_ROOT = resolve(MAKE_ROOT, '..', 'base.tree')
const BIND_TREE_ROOT = resolve(MAKE_ROOT, '..', 'bind.tree')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-file-stdlib')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function loadNativeNames(): Map<string, string> {
  const fsBindFile = resolve(BIND_TREE_ROOT, 'code', 'node', 'fs', 'base.tree')
  const fsNames = loadBindNames({
    file: fsBindFile,
    name: 'node/fs/base.tree',
    makeTree,
  })
  return mergeBindNames([fsNames])
}

const nativeNames = loadNativeNames()

function compileTreeToJS(input: {
  file: string
  name: string
}): {
  code: string
  dock: Array<{ path: string; name?: string }>
} {
  const text = readFileSync(input.file, 'utf8')
  const lead = makeTree({ file: input.name, text })
  const rawCard = readCard({ tree: lead.tree, file: input.name })
  const card = expandFuse({ card: rawCard })

  const dock = card.list
    .filter(
      (n): n is SurfLoad =>
        n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  const { book, asyncMeta } = desugarCard({ card })
  const code = castBook({ book, dock, asyncMeta, nativeNames })
  return { code, dock }
}

function compileAndWrite(input: {
  fixture: string
  output: string
}): string {
  const file = resolve(BASE_TREE_ROOT, 'test', 'file', input.fixture)
  const result = compileTreeToJS({ file, name: input.fixture })
  const driver = `${result.code}\nrunTests("x").catch(e => { console.error(e); process.exit(1) })\n`
  writeFileSync(resolve(TMP, input.output), driver)
  return result.code
}

function run(script: string): {
  code: number
  stdout: string
  stderr: string
} {
  try {
    const stdout = execFileSync('node', [resolve(TMP, script)], {
      cwd: TMP,
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

describe('file stdlib: core operations', () => {
  let js = ''
  let output = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    js = compileAndWrite({
      fixture: 'core.tree',
      output: 'core.mjs',
    })
    const result = run('core.mjs')
    output = result.stdout
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('source:\n', readFileSync(resolve(TMP, 'core.mjs'), 'utf8'))
    }
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('compiles with async and fs/promises import', () => {
    expect(js).toContain('async function')
    expect(js).toContain('node:fs/promises')
    expect(js).toContain('await')
  })

  it('read-write-text', () => {
    expect(output).toContain('pass: read-write-text')
  })

  it('append', () => {
    expect(output).toContain('pass: append')
  })

  it('copy', () => {
    expect(output).toContain('pass: copy')
  })

  it('move', () => {
    expect(output).toContain('pass: move')
  })

  it('make-dir', () => {
    expect(output).toContain('pass: make-dir')
  })

  it('completes', () => {
    expect(output).toContain('done')
  })
})

describe('file stdlib: handle operations', () => {
  let output = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    compileAndWrite({
      fixture: 'handle.tree',
      output: 'handle.mjs',
    })
    const result = run('handle.mjs')
    output = result.stdout
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('source:\n', readFileSync(resolve(TMP, 'handle.mjs'), 'utf8'))
    }
  })

  it('handle-write-read', () => {
    expect(output).toContain('pass: handle-write-read')
  })

  it('handle-truncate', () => {
    expect(output).toContain('pass: handle-truncate')
  })

  it('handle-flush', () => {
    expect(output).toContain('pass: handle-flush')
  })

  it('completes', () => {
    expect(output).toContain('done')
  })
})

describe('file stdlib: links', () => {
  let output = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    compileAndWrite({
      fixture: 'link.tree',
      output: 'link.mjs',
    })
    const result = run('link.mjs')
    output = result.stdout
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('source:\n', readFileSync(resolve(TMP, 'link.mjs'), 'utf8'))
    }
  })

  it('symlink-read', () => {
    expect(output).toContain('pass: symlink-read')
  })

  it('readlink', () => {
    expect(output).toContain('pass: readlink')
  })

  it('hard-link-read', () => {
    expect(output).toContain('pass: hard-link-read')
  })

  it('completes', () => {
    expect(output).toContain('done')
  })
})

describe('file stdlib: metadata and permissions', () => {
  let output = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    compileAndWrite({
      fixture: 'metadata.tree',
      output: 'metadata.mjs',
    })
    const result = run('metadata.mjs')
    output = result.stdout
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('source:\n', readFileSync(resolve(TMP, 'metadata.mjs'), 'utf8'))
    }
  })

  it('stat-is-file', () => {
    expect(output).toContain('pass: stat-is-file')
  })

  it('stat-size', () => {
    expect(output).toContain('pass: stat-size')
  })

  it('stat-is-directory', () => {
    expect(output).toContain('pass: stat-is-directory')
  })

  it('lstat-is-link', () => {
    expect(output).toContain('pass: lstat-is-link')
  })

  it('chmod', () => {
    expect(output).toContain('pass: chmod')
  })

  it('completes', () => {
    expect(output).toContain('done')
  })
})
