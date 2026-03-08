/**
 * Tests for the generic string parser engine.
 *
 * Loads the tree grammar from code.tree/code/tree/ .tree files,
 * then parses input and serializes output for comparison.
 */

import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { StringParser } from '@/parser/index'
import { loadGrammar } from '@/parser/grammar-loader'
import { showTree } from '@/parser/tree-show'
import type { MineDef, MintDef } from '@/parser/form'

const GRAMMAR_DIR = resolve(__dirname, '../../../code.tree/code/tree')

let mine: Map<string, MineDef>
let mint: Map<string, MintDef>

beforeAll(() => {
  const grammar = loadGrammar({
    minePath: resolve(GRAMMAR_DIR, 'mine.tree'),
    mintPath: resolve(GRAMMAR_DIR, 'mint.tree'),
  })
  mine = grammar.mine
  mint = grammar.mint
})

function makeTreeParser() {
  return new StringParser({ mine, mint, entry: 'tree' })
}

/** Parse and serialize, comparing against expected output. */
function assertParse(input: string, expected: string) {
  const parser = makeTreeParser()
  const result = parser.parse({ text: input, file: 'test.tree' })
  expect(result.output).toBeTruthy()
  const output = showTree(result.output ?? undefined).trim()
  expect(output).toBe(expected.trim())
}

describe('StringParser', () => {
  describe('grammar loading', () => {
    it('should load mine definitions from .tree files', () => {
      expect(mine.size).toBeGreaterThan(0)
      expect(mine.has('tree')).toBe(true)
      expect(mine.has('indented-term')).toBe(true)
      expect(mine.has('name')).toBe(true)
    })

    it('should load mint definitions from .tree files', () => {
      expect(mint.size).toBeGreaterThan(0)
      expect(mint.has('tree')).toBe(true)
      expect(mint.has('indented-term')).toBe(true)
    })
  })

  describe('basic parsing', () => {
    it('should parse a single term', () => {
      const parser = makeTreeParser()
      const result = parser.parse({ text: 'hello\n', file: 'test.tree' })
      expect(result.output).toBeTruthy()
      expect(result.output?.form).toBe('tree-document')
    })

    it('should parse a kebab-case name', () => {
      const parser = makeTreeParser()
      const result = parser.parse({ text: 'foo-bar\n', file: 'test.tree' })
      const first = Array.isArray(result.output!.list) ? result.output!.list[0] : result.output!.list
      expect((first as { text: string }).text).toBe('foo-bar')
    })

    it('should parse two terms', () => {
      const parser = makeTreeParser()
      const result = parser.parse({ text: 'hello\nworld\n', file: 'test.tree' })
      const list = result.output!.list
      expect(Array.isArray(list)).toBe(true)
      expect((list as unknown[]).length).toBe(2)
    })
  })

  describe('inline values', () => {
    it('should parse a term with inline term', () => {
      assertParse('form two\n', 'form\n  two')
    })

    it('should parse comma-separated values', () => {
      assertParse('foo bar, baz\n', 'foo\n  bar\n  baz')
    })

    it('should parse a number', () => {
      assertParse('foo 123\n', 'foo\n  123')
    })

    it('should parse a float', () => {
      assertParse('foo 3.14\n', 'foo\n  3.14')
    })

    it('should parse inline template', () => {
      assertParse('foo <hello>\n', 'foo\n  <hello>')
    })

    it('should parse code literal', () => {
      assertParse('foo #b101\n', 'foo\n  #b101')
    })
  })

  describe('nested content', () => {
    it('should parse indented children', () => {
      assertParse('parent\n  child\n', 'parent\n  child')
    })

    it('should parse deeply nested content', () => {
      assertParse(
        'a\n  b\n    c\n',
        'a\n  b\n    c',
      )
    })

    it('should parse multiple children', () => {
      assertParse(
        'parent\n  child1\n  child2\n',
        'parent\n  child1\n  child2',
      )
    })
  })

  describe('space-separated nesting', () => {
    it('should chain space-separated terms', () => {
      assertParse('a b c d\n', 'a\n  b\n    c\n      d')
    })
  })

  describe('fixture: nesting-basic', () => {
    it('should parse inline + nested combined', () => {
      assertParse(
        'a b c d\n  x y z\n',
        'a\n  b\n    c\n      d\n  x\n    y\n      z',
      )
    })

    it('should match nesting-basic fixture', () => {
      assertParse(
        'a b c d e f g a sd f\n  x y z w y\n    abc\n',
        [
          'a',
          '  b',
          '    c',
          '      d',
          '        e',
          '          f',
          '            g',
          '              a',
          '                sd',
          '                  f',
          '  x',
          '    y',
          '      z',
          '        w',
          '          y',
          '    abc',
        ].join('\n'),
      )
    })
  })

  describe('fixture: line', () => {
    it('should parse path value', () => {
      assertParse('deck @termsurf/wolf\n', 'deck\n  @termsurf/wolf')
    })
  })

  describe('fixture: paths', () => {
    it('should parse relative path', () => {
      assertParse('bear ./code\n', 'bear\n  ./code')
    })

    it('should parse nested path', () => {
      assertParse('foo ./bar/baz\n', 'foo\n  ./bar/baz')
    })

    it('should parse @ path with dots', () => {
      assertParse('foo @another/thing.link\n', 'foo\n  @another/thing.link')
    })
  })

  describe('multiple top-level terms', () => {
    it('should parse two blocks with children', () => {
      assertParse(
        'foo\n  bar\nbaz\n  qux\n',
        'foo\n  bar\nbaz\n  qux',
      )
    })
  })

  describe('mixed inline and nested', () => {
    it('should parse inline values then nested children', () => {
      assertParse(
        'deck @termsurf/wolf\n  bear ./code\n  test ./test\n',
        'deck\n  @termsurf/wolf\n  bear\n    ./code\n  test\n    ./test',
      )
    })
  })
})
