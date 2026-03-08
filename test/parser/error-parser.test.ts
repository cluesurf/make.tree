/**
 * Error/negative tests for the string parser.
 *
 * Tests that invalid input produces parse errors.
 * Includes fixtures from file/kink/ plus additional edge cases.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { StringParser } from '@/parser/index'
import { loadGrammar } from '@/parser/grammar-loader'
import type { MineDef, MintDef } from '@/parser/form'

const GRAMMAR_DIR = resolve(__dirname, '../../../code.tree/code/tree')
const KINK_DIR = resolve(__dirname, 'file/kink')

let parser: StringParser

beforeAll(() => {
  const grammar = loadGrammar({
    minePath: resolve(GRAMMAR_DIR, 'mine.tree'),
    mintPath: resolve(GRAMMAR_DIR, 'mint.tree'),
  })
  parser = new StringParser({
    mine: grammar.mine,
    mint: grammar.mint,
    entry: 'tree',
  })
})

function loadKinkFixture(name: string): { input: string, expectedError: string } {
  const content = readFileSync(resolve(KINK_DIR, name), 'utf-8')
  const [input, expectedError] = content.split(/\n---\n/).map(s => s.trim())
  if (!input || !expectedError) {
    throw new Error(`Kink fixture ${name} missing input or expected error`)
  }
  return { input, expectedError }
}

function assertKinkFixture(name: string) {
  const { input } = loadKinkFixture(name)
  const result = parser.parse({ text: input + '\n', file: name })
  expect(result.errors.length).toBeGreaterThan(0)
}

function expectError(input: { text: string }) {
  const result = parser.parse({ text: input.text, file: 'test.tree' })
  expect(result.errors.length).toBeGreaterThan(0)
  return result
}

function expectNoError(input: { text: string }) {
  const result = parser.parse({ text: input.text, file: 'test.tree' })
  expect(result.errors.length).toBe(0)
  return result
}

describe('error cases', () => {
  // ---- Kink fixtures (loaded from file/kink/*.tree) ----

  describe('kink fixtures (original)', () => {
    it('invalid-leading-space.tree', () => {
      assertKinkFixture('invalid-leading-space.tree')
    })

    it('invalid-nested-term.tree', () => {
      assertKinkFixture('invalid-nested-term.tree')
    })

    it('invalid-term.tree', () => {
      assertKinkFixture('invalid-term.tree')
    })

    it('invalid-leading-dash.tree', () => {
      assertKinkFixture('invalid-leading-dash.tree')
    })

    it('invalid-question-mark.tree', () => {
      assertKinkFixture('invalid-question-mark.tree')
    })
  })

  describe('kink fixtures (indentation)', () => {
    it('tab-indent.tree', () => {
      assertKinkFixture('tab-indent.tree')
    })

    it('odd-spaces.tree', () => {
      assertKinkFixture('odd-spaces.tree')
    })

    it('double-indent-jump.tree', () => {
      assertKinkFixture('double-indent-jump.tree')
    })

    it('triple-indent-jump.tree', () => {
      assertKinkFixture('triple-indent-jump.tree')
    })

    it('leading spaces on first line', () => {
      expectError({ text: '  foo\n' })
    })
  })

  describe('kink fixtures (invalid first character)', () => {
    it('uppercase-start.tree', () => {
      assertKinkFixture('uppercase-start.tree')
    })

    it('digit-start.tree', () => {
      assertKinkFixture('digit-start.tree')
    })

    it('colon-start.tree', () => {
      assertKinkFixture('colon-start.tree')
    })

    it('dot-without-slash.tree', () => {
      assertKinkFixture('dot-without-slash.tree')
    })

    it('bare-hash.tree', () => {
      assertKinkFixture('bare-hash.tree')
    })
  })

  describe('kink fixtures (delimiters)', () => {
    it('unclosed-template.tree', () => {
      assertKinkFixture('unclosed-template.tree')
    })

    it('unclosed-paren.tree', () => {
      assertKinkFixture('unclosed-paren.tree')
    })

    it('unmatched-close-paren.tree', () => {
      assertKinkFixture('unmatched-close-paren.tree')
    })

    it('unmatched-close-angle.tree', () => {
      assertKinkFixture('unmatched-close-angle.tree')
    })
  })

  describe('kink fixtures (inline values)', () => {
    it('double-space.tree', () => {
      assertKinkFixture('double-space.tree')
    })

    it('trailing-comma.tree', () => {
      assertKinkFixture('trailing-comma.tree')
    })

    it('leading-comma.tree', () => {
      assertKinkFixture('leading-comma.tree')
    })

    it('empty-parens.tree', () => {
      assertKinkFixture('empty-parens.tree')
    })

    it('comma-no-space.tree', () => {
      assertKinkFixture('comma-no-space.tree')
    })
  })

  describe('whitespace errors', () => {
    it('whitespace-only line', () => {
      expectError({ text: '   \n' })
    })
  })

  // ---- Additional inline error cases ----

  describe('additional invalid first character', () => {
    it('close paren', () => {
      expectError({ text: ')foo\n' })
    })

    it('close angle', () => {
      expectError({ text: '>foo\n' })
    })

    it('comma', () => {
      expectError({ text: ',foo\n' })
    })

    it('dash as first character', () => {
      expectError({ text: '-foo\n' })
    })
  })

  // ---- Edge cases (valid inputs) ----

  describe('valid edge cases', () => {
    it('completely empty input', () => {
      expectNoError({ text: '' })
    })

    it('only newlines', () => {
      expectNoError({ text: '\n\n\n' })
    })

    it('valid single term', () => {
      expectNoError({ text: 'hello\n' })
    })

    it('valid nested', () => {
      expectNoError({ text: 'foo\n  bar\n' })
    })

    it('valid inline', () => {
      expectNoError({ text: 'foo bar\n' })
    })

    it('valid comment', () => {
      expectNoError({ text: '# this is a comment\n' })
    })

    it('valid number value', () => {
      expectNoError({ text: 'foo 123\n' })
    })

    it('valid negative number', () => {
      expectNoError({ text: 'foo -42\n' })
    })

    it('valid float', () => {
      expectNoError({ text: 'foo 3.14\n' })
    })

    it('valid code literal', () => {
      expectNoError({ text: 'foo #b101\n' })
    })

    it('valid path', () => {
      expectNoError({ text: 'foo ./bar/baz\n' })
    })

    it('valid template', () => {
      expectNoError({ text: 'foo <hello world>\n' })
    })

    it('valid comma separated', () => {
      expectNoError({ text: 'foo bar, baz\n' })
    })

    it('valid parenthesized', () => {
      expectNoError({ text: 'foo(bar, baz)\n' })
    })

    it('valid deep nesting', () => {
      expectNoError({ text: 'a\n  b\n    c\n      d\n' })
    })

    it('valid comment between terms', () => {
      expectNoError({ text: 'foo\n# comment\nbar\n' })
    })

    it('valid hyphenated name', () => {
      expectNoError({ text: 'foo-bar baz-qux\n' })
    })

    it('valid at-path', () => {
      expectNoError({ text: 'load @cluesurf/base\n' })
    })

    it('valid hex code', () => {
      expectNoError({ text: 'color #xff\n' })
    })

    it('valid multiple top level', () => {
      expectNoError({ text: 'alpha\nbeta\ngamma\n' })
    })

    it('valid siblings', () => {
      expectNoError({ text: 'parent\n  child1\n  child2\n' })
    })
  })

  // ---- Error position accuracy ----

  describe('error positions', () => {
    it('reports correct position for unconsumed input', () => {
      const result = parser.parse({ text: 'foo\n    bar\n', file: 'test.tree' })
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]!.pos).toBe(4)
    })

    it('reports correct position for invalid start', () => {
      const result = parser.parse({ text: '123\n', file: 'test.tree' })
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]!.pos).toBe(0)
    })

    it('reports correct line and column', () => {
      const result = parser.parse({ text: 'foo\n    bar\n', file: 'test.tree' })
      expect(result.errors.length).toBeGreaterThan(0)
      const err = result.errors[0]!
      expect(err.line).toBe(2)
      expect(err.col).toBe(1)
    })
  })
})
