/**
 * Cross-backend tests for command parsing stdlib types.
 *
 * Validates that command schema, flag, argument, and result types
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

describe('command module: TypeScript', () => {
  const book = compileFile('stdlib-command.tree')
  const ts = castTS({ book })

  it('generates CommandSchema type', () => {
    expect(ts).toContain('export type CommandSchema')
    expect(ts).toContain('name: string')
    expect(ts).toContain('note: string')
    expect(ts).toContain('version: string')
  })

  it('generates commandFlag function with typed params', () => {
    expect(ts).toContain('export function commandFlag(')
    expect(ts).toContain('name: string')
  })

  it('generates commandArgument function with typed params', () => {
    expect(ts).toContain('export function commandArgument(')
  })

  it('generates CommandResult type with okay and error cases', () => {
    expect(ts).toContain('export type CommandResult')
  })

  it('generates commandDefine constructor', () => {
    expect(ts).toContain('export function commandDefine(')
  })

  it('generates commandFlag constructor', () => {
    expect(ts).toContain('export function commandFlag(')
  })

  it('generates commandArgument constructor', () => {
    expect(ts).toContain('export function commandArgument(')
  })

  it('generates commandResultIsOkay', () => {
    expect(ts).toContain('export function commandResultIsOkay(')
  })

  it('generates commandResultCommand accessor', () => {
    expect(ts).toContain('export function commandResultCommand(')
  })

  it('generates commandResultFlags accessor', () => {
    expect(ts).toContain('export function commandResultFlags(')
  })

  it('generates commandResultErrors accessor', () => {
    expect(ts).toContain('export function commandResultErrors(')
  })
})

describe('command module: Rust', () => {
  const book = compileFile('stdlib-command.tree')
  const rs = castRust({ book })

  it('generates command_define function', () => {
    expect(rs).toContain('fn command_define(')
  })

  it('generates command_flag function', () => {
    expect(rs).toContain('fn command_flag(')
  })

  it('generates command_result_is_okay function', () => {
    expect(rs).toContain('fn command_result_is_okay(')
  })
})

describe('command module: Kotlin', () => {
  const book = compileFile('stdlib-command.tree')
  const kt = castKotlin({ book })

  it('generates commandDefine function', () => {
    expect(kt).toContain('commandDefine')
  })

  it('generates commandFlag function', () => {
    expect(kt).toContain('commandFlag')
  })

  it('generates commandResultIsOkay function', () => {
    expect(kt).toContain('commandResultIsOkay')
  })
})

describe('command module: Swift', () => {
  const book = compileFile('stdlib-command.tree')
  const sw = castSwift({ book })

  it('generates commandDefine function', () => {
    expect(sw).toContain('commandDefine')
  })

  it('generates commandFlag function', () => {
    expect(sw).toContain('commandFlag')
  })
})

describe('command module: HVM', () => {
  const book = compileFile('stdlib-command.tree')
  const hvm = castHVM({ book })

  it('generates command_define definition', () => {
    expect(hvm).toContain('@command_define')
  })

  it('generates command_flag definition', () => {
    expect(hvm).toContain('@command_flag')
  })

  it('generates command_result_is_okay definition', () => {
    expect(hvm).toContain('@command_result_is_okay')
  })
})
