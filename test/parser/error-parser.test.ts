/**
 * Error/negative tests for the string parser.
 *
 * Tests that invalid input produces parse errors.
 * Includes fixtures from deck/tree/test/file/kink/ plus
 * additional edge cases for thorough coverage.
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

  describe('kink fixtures', () => {
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

  // ---- Invalid first character ----

  describe('invalid first character', () => {
    it('uppercase letter', () => {
      expectError({ text: 'Foo\n' })
    })

    it('digit as first character', () => {
      expectError({ text: '1abc\n' })
    })

    it('dash as first character', () => {
      expectError({ text: '-foo\n' })
    })

    it('dot without slash', () => {
      expectError({ text: '.foo\n' })
    })

    it('comma', () => {
      expectError({ text: ',foo\n' })
    })

    it('close paren', () => {
      expectError({ text: ')foo\n' })
    })

    it('close angle', () => {
      expectError({ text: '>foo\n' })
    })

    it('colon', () => {
      expectError({ text: ':foo\n' })
    })

    it('hash without valid code', () => {
      // # followed by space is a comment, but bare # with nothing is not
      expectError({ text: '#\n' })
    })
  })

  // ---- Indentation errors ----

  describe('indentation errors', () => {
    it('tab indentation', () => {
      expectError({ text: 'foo\n\tbar\n' })
    })

    it('odd number of spaces', () => {
      expectError({ text: 'foo\n bar\n' })
    })

    it('triple indent jump (0 to 3)', () => {
      expectError({ text: 'foo\n      bar\n' })
    })

    it('double indent jump (0 to 2)', () => {
      expectError({ text: 'foo\n    bar\n' })
    })

    it('only whitespace line', () => {
      expectError({ text: '   \n' })
    })

    it('leading spaces on first line', () => {
      expectError({ text: '  foo\n' })
    })
  })

  // ---- Unclosed delimiters ----

  describe('unclosed delimiters', () => {
    it('unclosed template', () => {
      expectError({ text: 'foo <hello\n' })
    })

    it('unclosed parenthesis', () => {
      expectError({ text: 'foo(bar\n' })
    })

    it('unmatched close paren after term', () => {
      expectError({ text: 'foo bar)\n' })
    })

    it('unmatched close angle after term', () => {
      expectError({ text: 'foo bar>\n' })
    })
  })

  // ---- Invalid inline values ----

  describe('invalid inline values', () => {
    it('comma without space after', () => {
      expectError({ text: 'foo bar,baz\n' })
    })

    it('double space separator', () => {
      expectError({ text: 'foo  bar\n' })
    })

    it('trailing comma', () => {
      expectError({ text: 'foo bar,\n' })
    })

    it('leading comma', () => {
      expectError({ text: 'foo , bar\n' })
    })

    it('empty parens', () => {
      expectError({ text: 'foo()\n' })
    })
  })

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('completely empty input', () => {
      // Empty input should parse as empty document, no error
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
