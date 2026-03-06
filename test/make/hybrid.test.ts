/**
 * Tests for hybrid compilation: splitting pure/effectful defs
 * and SSA verification.
 */

import { describe, it, expect } from 'vitest'
import { analyzePurity } from '@/term/purity'
import { compileHybrid } from '@/cast/hybrid'
import { checkSSA } from '@/term/ssa'
import type { Term, Book } from '@/term/form'

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

describe('hybrid compilation', () => {
  it('splits pure defs to HVM and effectful to native', () => {
    const book: Book = new Map([
      ['add-one', lam('x', x => op2('add', x, num(1)))],
      ['double', lam('x', x => op2('mul', x, num(2)))],
      ['log-it', lam('x', x => log(x, num(0)))],
    ])

    const purityMap = analyzePurity({ book })
    const result = compileHybrid({
      book,
      purityMap,
      nativeTarget: 'typescript',
    })

    expect(result.pureDefs).toContain('add-one')
    expect(result.pureDefs).toContain('double')
    expect(result.effectfulDefs).toContain('log-it')
    expect(result.hvmCode).toContain('@add_one')
    expect(result.hvmCode).toContain('@double')
    expect(result.hvmCode).not.toContain('log_it')
  })

  it('identifies bridge names for cross-boundary calls', () => {
    const book: Book = new Map([
      ['helper', lam('x', x => op2('add', x, num(1)))],
      ['main', lam('x', x => log(app(ref('helper'), x), num(0)))],
    ])

    const purityMap = analyzePurity({ book })
    const result = compileHybrid({
      book,
      purityMap,
      nativeTarget: 'typescript',
    })

    expect(result.pureDefs).toContain('helper')
    expect(result.effectfulDefs).toContain('main')
    expect(result.bridgeNames).toContain('helper')
  })

  it('produces empty HVM when all defs are effectful', () => {
    const book: Book = new Map([
      ['noisy', lam('x', x => log(x, num(0)))],
    ])

    const purityMap = analyzePurity({ book })
    const result = compileHybrid({
      book,
      purityMap,
      nativeTarget: 'rust',
    })

    expect(result.hvmCode).toBe('')
    expect(result.effectfulDefs).toContain('noisy')
    expect(result.pureDefs).toHaveLength(0)
  })

  it('produces empty native when all defs are pure', () => {
    const book: Book = new Map([
      ['inc', lam('x', x => op2('add', x, num(1)))],
    ])

    const purityMap = analyzePurity({ book })
    const result = compileHybrid({
      book,
      purityMap,
      nativeTarget: 'kotlin',
    })

    expect(result.nativeCode).toBe('')
    expect(result.pureDefs).toContain('inc')
    expect(result.effectfulDefs).toHaveLength(0)
  })

  it('works with all native targets', () => {
    const book: Book = new Map([
      ['pure-fn', lam('x', x => op2('add', x, num(1)))],
      ['io-fn', lam('x', x => log(x, num(0)))],
    ])

    const purityMap = analyzePurity({ book })

    for (const target of ['typescript', 'rust', 'kotlin', 'swift'] as const) {
      const result = compileHybrid({ book, purityMap, nativeTarget: target })
      expect(result.pureDefs).toHaveLength(1)
      expect(result.effectfulDefs).toHaveLength(1)
      expect(result.hvmCode.length).toBeGreaterThan(0)
      expect(result.nativeCode.length).toBeGreaterThan(0)
    }
  })
})

describe('SSA verification', () => {
  it('passes for simple let bindings', () => {
    const term = lam('x', x =>
      letTerm('y', op2('add', x, num(1)), y =>
        op2('mul', y, num(2))
      )
    )

    const result = checkSSA({ term, name: 'test' })
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('passes for nested let with same name (shadowing)', () => {
    const term = lam('x', x =>
      letTerm('y', num(1), () =>
        letTerm('y', num(2), y =>
          op2('add', y, x)
        )
      )
    )

    const result = checkSSA({ term, name: 'test' })
    expect(result.ok).toBe(true)
  })

  it('passes for lambda bindings', () => {
    const term = lam('x', x => lam('y', y => op2('add', x, y)))
    const result = checkSSA({ term, name: 'test' })
    expect(result.ok).toBe(true)
  })

  it('passes for complex nested terms', () => {
    const term = lam('n', n =>
      letTerm('a', op2('add', n, num(1)), a =>
        letTerm('b', op2('mul', a, num(2)), b =>
          letTerm('c', op2('add', a, b), c => c)
        )
      )
    )

    const result = checkSSA({ term, name: 'test' })
    expect(result.ok).toBe(true)
  })
})
