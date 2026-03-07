/**
 * Cross-backend tests for environment submodule stdlib types.
 *
 * Validates that variable, path, directory, and language tasks
 * compile through all backends without errors.
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

describe('environment submodules: TypeScript', () => {
  const book = compileFile('stdlib-environment-submodules.tree')
  const ts = castTS({ book })

  it('generates Locale type', () => {
    expect(ts).toContain('export type Locale')
    expect(ts).toContain('language: string')
    expect(ts).toContain('region: string')
    expect(ts).toContain('tag: string')
    expect(ts).toContain('timezone: string')
  })

  it('generates variable functions', () => {
    expect(ts).toContain('export function variableGet(')
    expect(ts).toContain('export function variableSet(')
    expect(ts).toContain('export function variableRemove(')
    expect(ts).toContain('variableList')
    expect(ts).toContain('export function variableCheck(')
  })

  it('generates path function', () => {
    expect(ts).toContain('export function pathGet(')
  })

  it('generates directory functions', () => {
    expect(ts).toContain('directoryGet')
    expect(ts).toContain('export function directorySet(')
  })

  it('generates language functions', () => {
    expect(ts).toContain('languageRead')
    expect(ts).toContain('languageList')
  })

  it('generates languageRead with locale construction', () => {
    expect(ts).toContain('language:')
    expect(ts).toContain('region:')
    expect(ts).toContain('tag:')
    expect(ts).toContain('timezone:')
  })
})

describe('environment submodules: Rust', () => {
  const book = compileFile('stdlib-environment-submodules.tree')
  const rs = castRust({ book })

  it('generates Locale struct', () => {
    expect(rs).toContain('Locale')
  })

  it('generates variable functions', () => {
    expect(rs).toContain('fn variable_get(')
    expect(rs).toContain('fn variable_set(')
    expect(rs).toContain('fn variable_remove(')
    expect(rs).toContain('fn variable_list(')
    expect(rs).toContain('fn variable_check(')
  })

  it('generates path function', () => {
    expect(rs).toContain('fn path_get(')
  })

  it('generates directory functions', () => {
    expect(rs).toContain('fn directory_get(')
    expect(rs).toContain('fn directory_set(')
  })

  it('generates language functions', () => {
    expect(rs).toContain('fn language_read(')
    expect(rs).toContain('fn language_list(')
  })
})

describe('environment submodules: Kotlin', () => {
  const book = compileFile('stdlib-environment-submodules.tree')
  const kt = castKotlin({ book })

  it('generates variable functions', () => {
    expect(kt).toContain('variableGet')
    expect(kt).toContain('variableSet')
    expect(kt).toContain('variableRemove')
    expect(kt).toContain('variableList')
    expect(kt).toContain('variableCheck')
  })

  it('generates path function', () => {
    expect(kt).toContain('pathGet')
  })

  it('generates directory functions', () => {
    expect(kt).toContain('directoryGet')
    expect(kt).toContain('directorySet')
  })

  it('generates language functions', () => {
    expect(kt).toContain('languageRead')
    expect(kt).toContain('languageList')
  })
})

describe('environment submodules: Swift', () => {
  const book = compileFile('stdlib-environment-submodules.tree')
  const sw = castSwift({ book })

  it('generates variable functions', () => {
    expect(sw).toContain('variableGet')
    expect(sw).toContain('variableSet')
    expect(sw).toContain('variableRemove')
    expect(sw).toContain('variableList')
    expect(sw).toContain('variableCheck')
  })

  it('generates path function', () => {
    expect(sw).toContain('pathGet')
  })

  it('generates directory functions', () => {
    expect(sw).toContain('directoryGet')
    expect(sw).toContain('directorySet')
  })

  it('generates language functions', () => {
    expect(sw).toContain('languageRead')
    expect(sw).toContain('languageList')
  })
})

describe('environment submodules: HVM', () => {
  const book = compileFile('stdlib-environment-submodules.tree')
  const hvm = castHVM({ book })

  it('generates variable definitions', () => {
    expect(hvm).toContain('@variable_get')
    expect(hvm).toContain('@variable_set')
    expect(hvm).toContain('@variable_remove')
    expect(hvm).toContain('@variable_list')
    expect(hvm).toContain('@variable_check')
  })

  it('generates path definition', () => {
    expect(hvm).toContain('@path_get')
  })

  it('generates directory definitions', () => {
    expect(hvm).toContain('@directory_get')
    expect(hvm).toContain('@directory_set')
  })

  it('generates language definitions', () => {
    expect(hvm).toContain('@language_read')
    expect(hvm).toContain('@language_list')
  })
})
