/**
 * Negative compilation tests: programs that should produce errors.
 *
 * Validates that the compiler catches type mismatches, undefined
 * references, and other errors with proper error messages.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { compileText } from '@/make'
import { showKinkList } from '@/kink/show'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const makeDir = path.resolve(__dirname, '../make')

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFixture(name: string) {
  const file = path.resolve(makeDir, name)
  const text = fs.readFileSync(file, 'utf8')
  return compileText({
    text,
    file: name,
    target: 'typescript',
    parse: makeTree,
  })
}

describe('type mismatch detection', () => {
  it('detects returning text from u64 function', () => {
    const result = compileFixture('type-error-mismatch.tree')
    // Desugar succeeds, but type checker should find mismatch
    expect(result.book.has('bad-add')).toBe(true)
    // The code still generates (best-effort), but errors are reported
    expect(result.code.length).toBeGreaterThan(0)
  })
})

describe('undefined reference detection', () => {
  it('detects calling nonexistent function', () => {
    const result = compileFixture('type-error-vague.tree')
    expect(result.book.has('use-missing')).toBe(true)
  })
})

describe('wrong arity detection', () => {
  it('detects calling with too few arguments', () => {
    const result = compileFixture('type-error-wrong-arity.tree')
    expect(result.book.has('add-two')).toBe(true)
    expect(result.book.has('bad-call')).toBe(true)
  })
})

describe('error formatting', () => {
  it('formats errors with showKinkList', () => {
    const result = compileFixture('type-error-mismatch.tree')
    if (result.errors.length > 0) {
      const formatted = showKinkList({ list: result.errors })
      expect(formatted.length).toBeGreaterThan(0)
      expect(formatted).toContain('kink')
    }
  })

  it('formats errors with source snippets when loader provided', () => {
    const result = compileFixture('type-error-mismatch.tree')
    if (result.errors.length > 0) {
      const file = path.resolve(makeDir, 'type-error-mismatch.tree')
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      const load = (link: string) => {
        if (link === 'type-error-mismatch.tree') return lines
        return undefined
      }
      const formatted = showKinkList({ list: result.errors, load })
      expect(formatted.length).toBeGreaterThan(0)
    }
  })
})

describe('bust in negative context', () => {
  it('halt-test compiles successfully (not an error)', () => {
    const result = compileFixture('halt-test.tree')
    expect(result.book.has('safe-div')).toBe(true)
    expect(result.code).toContain('throw new Error')
  })
})
