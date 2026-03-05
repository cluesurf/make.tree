/**
 * HVM backend IO protocol tests.
 *
 * Verifies that async functions compile to IO/Call and IO/Done
 * action trees in the HVM backend.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/hvm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): string {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book, asyncMeta } = desugarCard({ card })
  return castBook({ book, asyncMeta })
}

describe('hvm: IO protocol for async functions', () => {
  const hvm = compileFile('async-test.tree')

  it('emits IO_bind helper', () => {
    expect(hvm).toContain('@IO_bind')
    expect(hvm).toContain('#IO_Done')
    expect(hvm).toContain('#IO_Call')
  })

  it('wraps async function result in IO_Done', () => {
    expect(hvm).toContain('IO_Done')
    expect(hvm).toContain('magic:')
  })

  it('generates non-async functions normally', () => {
    expect(hvm).toContain('@process')
    expect(hvm).not.toContain('IO_Done { magic: 0xD0CA11 expr: @process')
  })
})

describe('hvm: non-async functions', () => {
  const hvm = compileFile('fibonacci.tree')

  it('generates pure function without IO wrapping', () => {
    expect(hvm).toContain('@fib')
    expect(hvm).not.toContain('IO_bind')
    expect(hvm).not.toContain('IO_Done')
  })

  it('uses lambda and match for fibonacci', () => {
    expect(hvm).toContain('λ')
    expect(hvm).toContain('match')
  })
})
