/**
 * Tests for CST (Concrete Syntax Tree) builder and utilities.
 */

import { describe, it, expect } from 'vitest'
import { CstBuilder, cstToText, cstErrors, cstMissing, findRecoveryPoint, indentAtPos } from '@/parser/cst'
import type { CstTree, CstToken, CstError, CstMissing } from '@/parser/form'

describe('CstBuilder', () => {
  it('builds a flat token sequence', () => {
    const b = new CstBuilder({ source: 'hello world' })
    b.token({ kind: 'word', start: 0, end: 5 })
    b.token({ kind: 'word', start: 6, end: 11 })
    const tree = b.build({ form: 'root' })
    expect(tree.form).toBe('root')
    expect(tree.children.length).toBe(2)
    expect((tree.children[0] as CstToken).text).toBe('hello')
    expect((tree.children[1] as CstToken).text).toBe('world')
  })

  it('builds nested tree nodes', () => {
    const b = new CstBuilder({ source: 'a b' })
    b.startNode({ form: 'pair', start: 0 })
    b.token({ kind: 'word', start: 0, end: 1 })
    b.token({ kind: 'word', start: 2, end: 3 })
    b.finishNode({ end: 3 })
    const tree = b.build({ form: 'root' })
    expect(tree.children.length).toBe(1)
    const pair = tree.children[0] as CstTree
    expect(pair.form).toBe('pair')
    expect(pair.children.length).toBe(2)
  })

  it('attaches leading trivia to tokens', () => {
    const b = new CstBuilder({ source: '  hello' })
    b.trivia({ form: 'whitespace', start: 0, end: 2 })
    b.token({ kind: 'word', start: 2, end: 7 })
    const tree = b.build({ form: 'root' })
    const tok = tree.children[0] as CstToken
    expect(tok.lead.length).toBe(1)
    expect(tok.lead[0]!.form).toBe('whitespace')
    expect(tok.lead[0]!.text).toBe('  ')
  })

  it('records error nodes', () => {
    const b = new CstBuilder({ source: 'good ??? bad' })
    b.token({ kind: 'word', start: 0, end: 4 })
    b.error({ start: 5, end: 8, expected: ['word'] })
    b.token({ kind: 'word', start: 9, end: 12 })
    const tree = b.build({ form: 'root' })
    expect(tree.children.length).toBe(3)
    expect(tree.children[1]!.form).toBe('error')
  })

  it('records missing nodes', () => {
    const b = new CstBuilder({ source: '()' })
    b.token({ kind: 'paren-open', start: 0, end: 1 })
    b.missing({ expected: 'expression', pos: 1 })
    b.token({ kind: 'paren-close', start: 1, end: 2 })
    const tree = b.build({ form: 'root' })
    expect(tree.children.length).toBe(3)
    expect(tree.children[1]!.form).toBe('missing')
    expect((tree.children[1] as CstMissing).expected).toBe('expression')
  })

  it('flushes trailing trivia to EOF token', () => {
    const b = new CstBuilder({ source: 'hello\n' })
    b.token({ kind: 'word', start: 0, end: 5 })
    b.trivia({ form: 'newline', start: 5, end: 6 })
    const tree = b.build({ form: 'root' })
    // The pending newline trivia goes to the EOF token
    const eof = tree.children[tree.children.length - 1] as CstToken
    expect(eof.kind).toBe('eof')
    expect(eof.lead.length).toBe(1)
    expect(eof.lead[0]!.form).toBe('newline')
  })
})

describe('cstToText', () => {
  it('round-trips a simple tree', () => {
    const b = new CstBuilder({ source: 'hello world' })
    b.trivia({ form: 'whitespace', start: 0, end: 0 }) // empty leading
    b.token({ kind: 'word', start: 0, end: 5 })
    b.trivia({ form: 'whitespace', start: 5, end: 6 })
    b.token({ kind: 'word', start: 6, end: 11 })
    const tree = b.build({ form: 'root' })
    expect(cstToText(tree)).toBe('hello world')
  })

  it('round-trips with comments', () => {
    const source = '# comment\nhello\n'
    const b = new CstBuilder({ source })
    b.trivia({ form: 'comment', start: 0, end: 9 })
    b.trivia({ form: 'newline', start: 9, end: 10 })
    b.token({ kind: 'word', start: 10, end: 15 })
    b.trivia({ form: 'newline', start: 15, end: 16 })
    const tree = b.build({ form: 'root' })
    expect(cstToText(tree)).toBe(source)
  })

  it('round-trips error nodes', () => {
    const source = 'good ??? more'
    const b = new CstBuilder({ source })
    b.token({ kind: 'word', start: 0, end: 4 })
    b.trivia({ form: 'whitespace', start: 4, end: 5 })
    b.error({ start: 5, end: 8, expected: ['word'] })
    b.trivia({ form: 'whitespace', start: 8, end: 9 })
    b.token({ kind: 'word', start: 9, end: 13 })
    const tree = b.build({ form: 'root' })
    expect(cstToText(tree)).toBe(source)
  })

  it('missing nodes produce empty text', () => {
    const source = '()'
    const b = new CstBuilder({ source })
    b.token({ kind: 'paren-open', start: 0, end: 1 })
    b.missing({ expected: 'expression', pos: 1 })
    b.token({ kind: 'paren-close', start: 1, end: 2 })
    const tree = b.build({ form: 'root' })
    expect(cstToText(tree)).toBe(source)
  })
})

describe('cstErrors', () => {
  it('collects error nodes from tree', () => {
    const b = new CstBuilder({ source: 'a ??? b @@@ c' })
    b.token({ kind: 'word', start: 0, end: 1 })
    b.error({ start: 2, end: 5, expected: ['word'] })
    b.token({ kind: 'word', start: 6, end: 7 })
    b.error({ start: 8, end: 11, expected: ['number'] })
    b.token({ kind: 'word', start: 12, end: 13 })
    const tree = b.build({ form: 'root' })
    const errors = cstErrors(tree)
    expect(errors.length).toBe(2)
    expect(errors[0]!.expected).toEqual(['word'])
    expect(errors[1]!.expected).toEqual(['number'])
  })

  it('returns empty for clean tree', () => {
    const b = new CstBuilder({ source: 'hello' })
    b.token({ kind: 'word', start: 0, end: 5 })
    const tree = b.build({ form: 'root' })
    expect(cstErrors(tree).length).toBe(0)
  })
})

describe('cstMissing', () => {
  it('collects missing nodes', () => {
    const b = new CstBuilder({ source: '()[]' })
    b.token({ kind: 'paren-open', start: 0, end: 1 })
    b.missing({ expected: 'expr', pos: 1 })
    b.token({ kind: 'paren-close', start: 1, end: 2 })
    b.token({ kind: 'bracket-open', start: 2, end: 3 })
    b.missing({ expected: 'index', pos: 3 })
    b.token({ kind: 'bracket-close', start: 3, end: 4 })
    const tree = b.build({ form: 'root' })
    const missing = cstMissing(tree)
    expect(missing.length).toBe(2)
  })
})

describe('indentAtPos', () => {
  it('returns 0 for unindented line', () => {
    expect(indentAtPos({ source: 'hello', pos: 0 })).toBe(0)
  })

  it('returns indent count for indented line', () => {
    expect(indentAtPos({ source: 'hello\n  world', pos: 8 })).toBe(2)
  })

  it('handles position in middle of line', () => {
    expect(indentAtPos({ source: '    foo bar', pos: 7 })).toBe(4)
  })
})

describe('findRecoveryPoint', () => {
  it('finds next line at same indent', () => {
    const source = 'aaa\n  bad\nbbb\n'
    const pos = findRecoveryPoint({ source, pos: 4, maxIndent: 0 })
    expect(source.slice(pos, pos + 3)).toBe('bbb')
  })

  it('skips deeper-indented lines', () => {
    const source = 'aaa\n  x\n    y\n  z\nbbb\n'
    const pos = findRecoveryPoint({ source, pos: 4, maxIndent: 0 })
    expect(source.slice(pos, pos + 3)).toBe('bbb')
  })

  it('returns source length when no recovery point found', () => {
    const source = 'aaa\n  x\n  y\n'
    const pos = findRecoveryPoint({ source, pos: 4, maxIndent: 0 })
    expect(pos).toBe(source.length)
  })

  it('respects maxIndent for nested recovery', () => {
    const source = 'aaa\n  bbb\n    bad\n  ccc\nddd\n'
    const pos = findRecoveryPoint({ source, pos: 14, maxIndent: 2 })
    expect(source.slice(pos, pos + 3)).toBe('  c')
  })

  it('skips blank lines', () => {
    const source = 'aaa\n  bad\n\nbbb\n'
    const pos = findRecoveryPoint({ source, pos: 4, maxIndent: 0 })
    expect(source.slice(pos, pos + 3)).toBe('bbb')
  })
})
