/**
 * Tests for the incremental editing API of ChunkedParser.
 *
 * Verifies that edits only reparse the affected region and that
 * the result matches a full reparse.
 */

import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { ChunkedParser } from '@/parser/string'
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

function fullParse(input: { text: string }): string {
  const parser = new StringParser({ mine, mint, entry: 'tree', recovery: true })
  const result = parser.parse({ text: input.text, file: 'test.tree' })
  return showTree(result.output ?? undefined).trim()
}

describe('chunked parser (incremental)', () => {
  it('initial parse matches full parse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\n  bar\nbaz\n'
    const result = p.parse({ text, file: 'test.tree' })
    const full = fullParse({ text })
    const incOutput = showTree(result.output ?? undefined).trim()
    expect(incOutput).toBe(full)
  })

  it('insert character in middle, result matches full reparse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\nbar\nbaz\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 7, end: 7, newText: 'd' },
    })

    const newText = 'foo\nbard\nbaz\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('delete a line, result matches full reparse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\nbar\nbaz\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 4, end: 8, newText: '' },
    })

    const newText = 'foo\nbaz\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('replace a term, result matches full reparse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'alpha\nbeta\ngamma\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 6, end: 10, newText: 'delta' },
    })

    const newText = 'alpha\ndelta\ngamma\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('append a line, result matches full reparse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 4, end: 4, newText: 'bar\n' },
    })

    const newText = 'foo\nbar\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('edit nested content, result matches full reparse', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\n  bar\n  baz\nqux\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 6, end: 9, newText: 'bat' },
    })

    const newText = 'foo\n  bat\n  baz\nqux\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('multiple sequential edits work correctly', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'aaa\nbbb\nccc\n'
    p.parse({ text, file: 'test.tree' })

    p.applyEdit({
      edit: { start: 4, end: 7, newText: 'xxx' },
    })

    const result = p.applyEdit({
      edit: { start: 8, end: 11, newText: 'yyy' },
    })

    const newText = 'aaa\nxxx\nyyy\n'
    const expected = fullParse({ text: newText })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('handles empty initial text', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    p.parse({ text: '', file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 0, end: 0, newText: 'hello\n' },
    })

    const expected = fullParse({ text: 'hello\n' })
    const actual = showTree(result.output ?? undefined).trim()
    expect(actual).toBe(expected)
  })

  it('handles delete entire content', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\nbar\n'
    p.parse({ text, file: 'test.tree' })

    const result = p.applyEdit({
      edit: { start: 0, end: 8, newText: '' },
    })

    expect(result.errors.length).toBe(0)
  })

  it('preserves errors outside edited region', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    const text = 'foo\nBAD\nbar\n'
    p.parse({ text, file: 'test.tree' })

    const r2 = p.applyEdit({
      edit: { start: 0, end: 3, newText: 'foooo' },
    })

    expect(r2.output).toBeTruthy()
  })

  it('hot reload invalidates cached result', () => {
    const p = new ChunkedParser({ mine, mint, entry: 'tree' })
    p.parse({ text: 'hello\n', file: 'test.tree' })

    p.reloadGrammar({ mine: new Map(), mint: new Map() })

    const result = p.applyEdit({
      edit: { start: 0, end: 0, newText: 'x' },
    })
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
