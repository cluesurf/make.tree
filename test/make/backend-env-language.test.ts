/**
 * E2E test: locale type construction and field access.
 *
 * Compiles env-language.tree to JS, runs with node. Tests that
 * locale form can be constructed and all fields read back correctly.
 * Also verifies cross-backend codegen (TS, Rust, Kotlin, Swift).
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
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import type { SurfLoad } from '@/surf/form'
import type { Book } from '@/term/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-env-language')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): Book {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

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

describe('locale: cross-backend codegen', () => {
  const book = compileFile('env-language.tree')

  it('TypeScript: generates Locale type and constructor', () => {
    const ts = castTS({ book })
    expect(ts).toContain('export type Locale')
    expect(ts).toContain('language: string')
    expect(ts).toContain('region: string')
    expect(ts).toContain('tag: string')
    expect(ts).toContain('timezone: string')
    expect(ts).toContain('export function makeLocale(')
  })

  it('TypeScript: generates accessor functions', () => {
    const ts = castTS({ book })
    expect(ts).toContain('function localeLanguage(')
    expect(ts).toContain('function localeRegion(')
    expect(ts).toContain('function localeTag(')
    expect(ts).toContain('function localeTimezone(')
  })

  it('Rust: generates locale functions', () => {
    const rs = castRust({ book })
    expect(rs).toContain('fn make_locale(')
    expect(rs).toContain('fn locale_language(')
    expect(rs).toContain('fn locale_region(')
  })

  it('Kotlin: generates locale functions', () => {
    const kt = castKotlin({ book })
    expect(kt).toContain('makeLocale')
    expect(kt).toContain('localeLanguage')
  })

  it('Swift: generates locale functions', () => {
    const sw = castSwift({ book })
    expect(sw).toContain('makeLocale')
    expect(sw).toContain('localeLanguage')
  })
})

describe('locale: E2E construct and read fields', () => {
  let generatedJS = ''

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    generatedJS = compileTreeToJS('env-language.tree')

    const driver = `
const _loc = makeLocale("en", "US", "en-US", "America/New_York")
console.log("lang=" + localeLanguage(_loc))
console.log("region=" + localeRegion(_loc))
console.log("tag=" + localeTag(_loc))
console.log("tz=" + localeTimezone(_loc))

const _loc2 = makeLocale("fr", "FR", "fr-FR", "Europe/Paris")
console.log("lang2=" + localeLanguage(_loc2))
console.log("region2=" + localeRegion(_loc2))
console.log("tag2=" + localeTag(_loc2))
console.log("tz2=" + localeTimezone(_loc2))
`
    writeFileSync(resolve(TMP, 'main.mjs'), generatedJS + driver)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('constructs locale and reads language', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
      console.error('Generated:\n', generatedJS)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('lang=en')
  })

  it('reads region, tag, and timezone', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('region=US')
    expect(result.stdout).toContain('tag=en-US')
    expect(result.stdout).toContain('tz=America/New_York')
  })

  it('constructs a second locale with different values', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'main.mjs')],
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('lang2=fr')
    expect(result.stdout).toContain('region2=FR')
    expect(result.stdout).toContain('tag2=fr-FR')
    expect(result.stdout).toContain('tz2=Europe/Paris')
  })
})
