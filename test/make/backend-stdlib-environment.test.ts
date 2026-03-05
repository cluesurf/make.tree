/**
 * Cross-backend tests for environment stdlib types.
 *
 * Validates that environment-info and locale-info types compile
 * through all backends without errors.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import { castBook as castHVM } from '@/cast/hvm'
import type { Book } from '@/term/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): Book {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

describe('environment module: TypeScript', () => {
  const book = compileFile('stdlib-environment.tree')
  const ts = castTS({ book })

  it('generates EnvironmentInfo type', () => {
    expect(ts).toContain('export type EnvironmentInfo')
    expect(ts).toContain('system: string')
    expect(ts).toContain('architecture: string')
    expect(ts).toContain('cores: number')
    expect(ts).toContain('memory: number')
  })

  it('generates LocaleInfo type', () => {
    expect(ts).toContain('export type LocaleInfo')
    expect(ts).toContain('language: string')
    expect(ts).toContain('region: string')
  })

  it('generates environmentMakeInfo constructor', () => {
    expect(ts).toContain('export function environmentMakeInfo(')
  })

  it('generates field accessors', () => {
    expect(ts).toContain('export function environmentInfoSystem(')
    expect(ts).toContain('export function environmentInfoArchitecture(')
    expect(ts).toContain('export function environmentInfoCores(')
    expect(ts).toContain('export function environmentInfoMemory(')
  })

  it('generates locale constructor and accessors', () => {
    expect(ts).toContain('export function localeMake(')
    expect(ts).toContain('export function localeLanguage(')
    expect(ts).toContain('export function localeRegion(')
  })
})

describe('environment module: Rust', () => {
  const book = compileFile('stdlib-environment.tree')
  const rs = castRust({ book })

  it('generates environment_make_info function', () => {
    expect(rs).toContain('fn environment_make_info(')
  })

  it('generates accessor functions', () => {
    expect(rs).toContain('fn environment_info_system(')
    expect(rs).toContain('fn environment_info_architecture(')
  })

  it('generates locale functions', () => {
    expect(rs).toContain('fn locale_make(')
    expect(rs).toContain('fn locale_language(')
  })
})

describe('environment module: Kotlin', () => {
  const book = compileFile('stdlib-environment.tree')
  const kt = castKotlin({ book })

  it('generates environmentMakeInfo function', () => {
    expect(kt).toContain('environmentMakeInfo')
  })

  it('generates localeMake function', () => {
    expect(kt).toContain('localeMake')
  })
})

describe('environment module: Swift', () => {
  const book = compileFile('stdlib-environment.tree')
  const sw = castSwift({ book })

  it('generates environmentMakeInfo function', () => {
    expect(sw).toContain('environmentMakeInfo')
  })

  it('generates localeMake function', () => {
    expect(sw).toContain('localeMake')
  })
})

describe('environment module: HVM', () => {
  const book = compileFile('stdlib-environment.tree')
  const hvm = castHVM({ book })

  it('generates environment_make_info definition', () => {
    expect(hvm).toContain('@environment_make_info')
  })

  it('generates locale_make definition', () => {
    expect(hvm).toContain('@locale_make')
  })
})
