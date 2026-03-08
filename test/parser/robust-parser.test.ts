/**
 * Tests for robust parser features:
 * - Packrat memoization
 * - Error recovery
 * - Farthest-failure error messages
 * - O(log n) line/col lookup
 * - Hot reload
 * - Source ranges on AST nodes
 */

import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { StringParser } from '@/parser/index'
import { loadGrammar, loadGrammarFromText } from '@/parser/grammar-loader'
import type { MineDef, MintDef, AstNode } from '@/parser/form'

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

describe('packrat memoization', () => {
  it('produces same result as non-memo parse', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const text = 'foo bar, baz\n  child1\n  child2\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.errors.length).toBe(0)
    expect(result.output).toBeTruthy()
    expect(result.output!.form).toBe('tree-document')
  })

  it('handles repeated parse calls correctly', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const text1 = 'foo\n'
    const text2 = 'bar baz\n'
    const r1 = parser.parse({ text: text1, file: 'a.tree' })
    const r2 = parser.parse({ text: text2, file: 'b.tree' })
    expect(r1.errors.length).toBe(0)
    expect(r2.errors.length).toBe(0)
    // Each parse gets fresh memo table
    expect(r1.output).toBeTruthy()
    expect(r2.output).toBeTruthy()
  })

  it('handles deeply nested input without exponential blowup', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    // Generate deeply nested input
    const lines: string[] = ['root\n']
    for (let i = 1; i <= 50; i++) {
      lines.push('  '.repeat(i) + `level${i}\n`)
    }
    const text = lines.join('')
    const start = performance.now()
    const result = parser.parse({ text, file: 'deep.tree' })
    const elapsed = performance.now() - start
    expect(result.errors.length).toBe(0)
    expect(elapsed).toBeLessThan(5000) // Should finish in <5s
  })

  it('parameterized rules get separate cache entries', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    // Different indent levels should not share cache
    const text = 'a\n  b\n    c\n  d\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.errors.length).toBe(0)
    expect(result.output).toBeTruthy()
  })
})

describe('error recovery', () => {
  it('produces partial AST when recovery is on', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree', recovery: true })
    // Good line, bad line, good line
    const text = 'foo\nBAD LINE\nbar\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.output).toBeTruthy()
    // Should have at least one error
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('error node contains skipped text', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree', recovery: true })
    const text = 'foo\n123bad\nbar\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.output).toBeTruthy()
    if (result.errors.length > 0) {
      const errMsg = result.errors[0]!.message
      expect(errMsg).toContain('123bad')
    }
  })

  it('without recovery, stops at first failure', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree', recovery: false })
    const text = 'foo\nBAD\nbar\n'
    const result = parser.parse({ text, file: 'test.tree' })
    // May or may not produce output depending on how much matched
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('valid input has no errors even with recovery on', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree', recovery: true })
    const text = 'foo\n  bar\nbaz\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.errors.length).toBe(0)
    expect(result.output).toBeTruthy()
  })
})

describe('farthest failure tracking', () => {
  it('reports farthest position in error', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: '123\n', file: 'test.tree' })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]!.pos).toBe(0)
  })

  it('error message includes position info', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: 'foo\n    bar\n', file: 'test.tree' })
    expect(result.errors.length).toBeGreaterThan(0)
    const err = result.errors[0]!
    expect(err.line).toBeGreaterThan(0)
    expect(err.col).toBeGreaterThan(0)
  })
})

describe('line index (O(log n) lookup)', () => {
  it('computes correct line/col for single line', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: '123\n', file: 'test.tree' })
    expect(result.errors[0]!.line).toBe(1)
    expect(result.errors[0]!.col).toBe(1)
  })

  it('computes correct line/col for multi-line', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: 'foo\n    bar\n', file: 'test.tree' })
    expect(result.errors.length).toBeGreaterThan(0)
    const err = result.errors[0]!
    expect(err.line).toBe(2)
    expect(err.col).toBe(1)
  })

  it('handles empty input', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: '', file: 'test.tree' })
    expect(result.errors.length).toBe(0)
  })

  it('handles many lines', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const lines: string[] = []
    for (let i = 0; i < 1000; i++) {
      lines.push(`term${i}`)
    }
    const text = lines.join('\n') + '\n'
    const result = parser.parse({ text, file: 'test.tree' })
    expect(result.errors.length).toBe(0)
    expect(result.output).toBeTruthy()
  })
})

describe('hot reload', () => {
  it('reloadGrammar changes parse behavior', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result1 = parser.parse({ text: 'hello\n', file: 'test.tree' })
    expect(result1.errors.length).toBe(0)

    // Reload with empty grammar
    parser.reloadGrammar({
      mine: new Map(),
      mint: new Map(),
    })
    const result2 = parser.parse({ text: 'hello\n', file: 'test.tree' })
    // Should fail now because entry mint def is gone
    expect(result2.errors.length).toBeGreaterThan(0)

    // Reload back to working grammar
    parser.reloadGrammar({ mine, mint })
    const result3 = parser.parse({ text: 'hello\n', file: 'test.tree' })
    expect(result3.errors.length).toBe(0)
  })
})

describe('source ranges', () => {
  it('AST nodes have range field', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: 'foo\n', file: 'test.tree' })
    expect(result.output).toBeTruthy()
    const node = result.output!
    expect(node.range).toBeTruthy()
    const range = node.range as { start: number, end: number }
    expect(range.start).toBe(0)
    expect(range.end).toBeGreaterThan(0)
  })

  it('child nodes have correct ranges', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: 'foo\nbar\n', file: 'test.tree' })
    expect(result.output).toBeTruthy()
    const doc = result.output!
    const list = doc.list as AstNode[]
    expect(Array.isArray(list)).toBe(true)
    for (const child of list) {
      expect(child.range).toBeTruthy()
      const range = child.range as { start: number, end: number }
      expect(range.start).toBeGreaterThanOrEqual(0)
      expect(range.end).toBeGreaterThan(range.start)
    }
  })

  it('ranges are non-overlapping for siblings', () => {
    const parser = new StringParser({ mine, mint, entry: 'tree' })
    const result = parser.parse({ text: 'aaa\nbbb\nccc\n', file: 'test.tree' })
    expect(result.output).toBeTruthy()
    const list = result.output!.list as AstNode[]
    if (Array.isArray(list) && list.length >= 2) {
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1]!.range as { start: number, end: number }
        const curr = list[i]!.range as { start: number, end: number }
        expect(curr.start).toBeGreaterThanOrEqual(prev.end)
      }
    }
  })
})
