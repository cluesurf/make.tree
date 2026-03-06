/**
 * Tests for purity analysis: classifying definitions as pure or effectful.
 */

import { describe, it, expect } from 'vitest'
import { analyzePurity, type PurityMap } from '@/term/purity'
import type { Term, Book } from '@/term/form'
import type { AsyncMeta } from '@/term/desugar'

function num(val: number): Term {
  return { form: 'num', val }
}

function ref(name: string): Term {
  return { form: 'ref', name }
}

function lam(name: string, bod: (x: Term) => Term): Term {
  return { form: 'lam', name, bod }
}

function app(func: Term, argm: Term): Term {
  return { form: 'app', func, argm }
}

function letTerm(name: string, val: Term, bod: (x: Term) => Term): Term {
  return { form: 'let', name, val, bod }
}

function op2(oper: 'add' | 'mul', a: Term, b: Term): Term {
  return { form: 'op2', oper, a, b }
}

function log(msg: Term, val: Term): Term {
  return { form: 'log', msg, val }
}

function hlt(msg: Term): Term {
  return { form: 'hlt', msg }
}

function rst(val: Term): Term {
  return { form: 'rst', val }
}

function nxt(): Term {
  return { form: 'nxt' }
}

function waitCall(name: string, arg: Term): Term {
  return app(ref('.wait'), app(ref(name), arg))
}

describe('purity analysis', () => {
  it('classifies pure arithmetic as pure', () => {
    const book: Book = new Map([
      ['add-one', lam('x', x => op2('add', x, num(1)))],
      ['double', lam('x', x => op2('mul', x, num(2)))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('add-one')).toBe('pure')
    expect(result.get('double')).toBe('pure')
  })

  it('classifies log as effectful', () => {
    const book: Book = new Map([
      ['noisy', lam('x', x => log(x, num(0)))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('noisy')).toBe('effectful')
  })

  it('classifies halt as effectful', () => {
    const book: Book = new Map([
      ['crasher', lam('x', x => hlt(x))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('crasher')).toBe('effectful')
  })

  it('classifies rest (breakpoint) as effectful', () => {
    const book: Book = new Map([
      ['debug-me', lam('x', x => rst(x))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('debug-me')).toBe('effectful')
  })

  it('classifies next as effectful', () => {
    const book: Book = new Map([
      ['skipper', lam('_', () => nxt())],
    ])

    const result = analyzePurity({ book })
    expect(result.get('skipper')).toBe('effectful')
  })

  it('classifies .wait calls as effectful', () => {
    const book: Book = new Map([
      ['read-file', lam('path', path => waitCall('fs-read', path))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('read-file')).toBe('effectful')
  })

  it('marks async defs as effectful via asyncMeta', () => {
    const book: Book = new Map([
      ['fetch-data', lam('url', url => app(ref('http-get'), url))],
    ])
    const asyncMeta: AsyncMeta = new Map([['fetch-data', true]])

    const result = analyzePurity({ book, asyncMeta })
    expect(result.get('fetch-data')).toBe('effectful')
  })

  it('propagates effectfulness through refs', () => {
    const book: Book = new Map([
      ['impure', lam('x', x => log(x, num(0)))],
      ['caller', lam('x', x => app(ref('impure'), x))],
      ['wrapper', lam('x', x => app(ref('caller'), x))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('impure')).toBe('effectful')
    expect(result.get('caller')).toBe('effectful')
    expect(result.get('wrapper')).toBe('effectful')
  })

  it('does not propagate to unrelated defs', () => {
    const book: Book = new Map([
      ['impure', lam('x', x => log(x, num(0)))],
      ['pure-fn', lam('x', x => op2('add', x, num(1)))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('impure')).toBe('effectful')
    expect(result.get('pure-fn')).toBe('pure')
  })

  it('handles let bindings correctly', () => {
    const book: Book = new Map([
      ['with-let', lam('x', x =>
        letTerm('y', op2('add', x, num(1)), y =>
          op2('mul', y, num(2))
        )
      )],
    ])

    const result = analyzePurity({ book })
    expect(result.get('with-let')).toBe('pure')
  })

  it('detects effect inside let body', () => {
    const book: Book = new Map([
      ['let-log', lam('x', x =>
        letTerm('y', num(1), y => log(y, x))
      )],
    ])

    const result = analyzePurity({ book })
    expect(result.get('let-log')).toBe('effectful')
  })

  it('handles constructors and match as pure', () => {
    const book: Book = new Map([
      ['make-pair', lam('a', a => lam('b', b => ({
        form: 'con' as const,
        name: 'Pair',
        args: [['fst', a], ['snd', b]] as Array<[string | null, Term]>,
      })))],
      ['match-bool', lam('x', () => ({
        form: 'mat' as const,
        arms: [['True', num(1)], ['False', num(0)]] as Array<[string, Term]>,
      }))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('make-pair')).toBe('pure')
    expect(result.get('match-bool')).toBe('pure')
  })

  it('handles empty book', () => {
    const result = analyzePurity({ book: new Map() })
    expect(result.size).toBe(0)
  })

  it('handles self-referential pure def', () => {
    const book: Book = new Map([
      ['fib', lam('n', n => op2('add', app(ref('fib'), op2('sub', n, num(1))), app(ref('fib'), op2('sub', n, num(2)))))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('fib')).toBe('pure')
  })

  it('handles mixed book with multiple chains', () => {
    const book: Book = new Map([
      ['pure-a', lam('x', x => op2('add', x, num(1)))],
      ['pure-b', lam('x', x => app(ref('pure-a'), x))],
      ['io-base', lam('x', x => log(x, num(0)))],
      ['io-mid', lam('x', x => app(ref('io-base'), x))],
      ['io-top', lam('x', x => app(ref('io-mid'), x))],
    ])

    const result = analyzePurity({ book })
    expect(result.get('pure-a')).toBe('pure')
    expect(result.get('pure-b')).toBe('pure')
    expect(result.get('io-base')).toBe('effectful')
    expect(result.get('io-mid')).toBe('effectful')
    expect(result.get('io-top')).toBe('effectful')
  })
})
