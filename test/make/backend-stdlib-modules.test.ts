/**
 * Cross-backend tests for stdlib module types.
 *
 * Validates that clock, log, process, test, debug, and console
 * types compile through all backends without errors.
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

describe('clock module: all backends', () => {
  const book = compileFile('stdlib-clock.tree')

  it('TypeScript generates ClockMark type and functions', () => {
    const ts = castTS({ book })
    expect(ts).toContain('export type ClockMark')
    expect(ts).toContain('export function clockMeasurementStart(')
    expect(ts).toContain('export function clockMeasurementRead(')
    expect(ts).toContain('export function clockMarkStart(')
  })

  it('Rust generates clock functions', () => {
    const rs = castRust({ book })
    expect(rs).toContain('fn clock_measurement_start(')
    expect(rs).toContain('fn clock_measurement_read(')
  })

  it('Kotlin generates clock functions', () => {
    const kt = castKotlin({ book })
    expect(kt).toContain('clockMeasurementStart')
    expect(kt).toContain('clockMeasurementRead')
  })

  it('Swift generates clock functions', () => {
    const sw = castSwift({ book })
    expect(sw).toContain('clockMeasurementStart')
    expect(sw).toContain('clockMeasurementRead')
  })

  it('HVM generates clock definitions', () => {
    const hvm = castHVM({ book })
    expect(hvm).toContain('@clock_measurement_start')
    expect(hvm).toContain('@clock_measurement_read')
  })
})

describe('log module: all backends', () => {
  const book = compileFile('stdlib-log.tree')

  it('TypeScript generates log types and functions', () => {
    const ts = castTS({ book })
    expect(ts).toContain('export type LogRecord')
    expect(ts).toContain('export type LogLevel')
    expect(ts).toContain('export function logRecordMake(')
    expect(ts).toContain('export function logRecordLevel(')
    expect(ts).toContain('export function logRecordMessage(')
    expect(ts).toContain('export function logLevelRank(')
    expect(ts).toContain('export function logLevelIsAbove(')
  })

  it('Rust generates log functions', () => {
    const rs = castRust({ book })
    expect(rs).toContain('fn log_record_make(')
    expect(rs).toContain('fn log_level_rank(')
    expect(rs).toContain('fn log_level_is_above(')
  })

  it('HVM generates log definitions', () => {
    const hvm = castHVM({ book })
    expect(hvm).toContain('@log_record_make')
    expect(hvm).toContain('@log_level_rank')
  })
})

describe('process module: all backends', () => {
  const book = compileFile('stdlib-process.tree')

  it('TypeScript generates process types and functions', () => {
    const ts = castTS({ book })
    expect(ts).toContain('export function processResultMake(')
    expect(ts).toContain('export function processResultOk(')
    expect(ts).toContain('export function processResultCode(')
    expect(ts).toContain('export function processResultStdout(')
    expect(ts).toContain('export function processResultStderr(')
    expect(ts).toContain('export function processInfoMake(')
    expect(ts).toContain('export function processInfoId(')
  })

  it('Rust generates process functions', () => {
    const rs = castRust({ book })
    expect(rs).toContain('fn process_result_make(')
    expect(rs).toContain('fn process_result_ok(')
    expect(rs).toContain('fn process_info_make(')
  })

  it('HVM generates process definitions', () => {
    const hvm = castHVM({ book })
    expect(hvm).toContain('@process_result_make')
    expect(hvm).toContain('@process_info_make')
  })
})

describe('test framework module: all backends', () => {
  const book = compileFile('stdlib-test-framework.tree')

  it('TypeScript generates test types and functions', () => {
    const ts = castTS({ book })
    expect(ts).toContain('function make')
    expect(ts).toContain('function passed')
    expect(ts).toContain('function total')
    expect(ts).toContain('function fail')
    expect(ts).toContain('function name')
    expect(ts).toContain('stamp')
    expect(ts).toContain('function count')
  })

  it('Rust generates test functions', () => {
    const rs = castRust({ book })
    expect(rs).toContain('fn make')
    expect(rs).toContain('fn total')
    expect(rs).toContain('stamp')
  })

  it('HVM generates test definitions', () => {
    const hvm = castHVM({ book })
    expect(hvm).toContain('@make')
    expect(hvm).toContain('@stamp')
  })
})
