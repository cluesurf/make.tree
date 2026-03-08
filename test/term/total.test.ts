/**
 * Totality checking tests.
 *
 * Tests that the totality checker correctly identifies:
 * - Non-recursive functions (trivially total)
 * - Structurally recursive functions (total)
 * - Non-structurally recursive functions (not total)
 */

import { describe, it, expect } from 'vitest'
import { checkTotal, checkPositivity } from '@/term/total'
import type { Term, Book } from '@/term/form'
import type { AdtDesc } from '@/term/adt'

function ref(name: string): Term {
  return { form: 'ref', name }
}

function app(func: Term, argm: Term): Term {
  return { form: 'app', func, argm }
}

function lam(name: string, bod: (x: Term) => Term): Term {
  return { form: 'lam', name, bod }
}

function ann(val: Term, typ: Term): Term {
  return { form: 'ann', done: false, val, typ }
}

function natBook(): Book {
  const book: Book = new Map()
  // Minimal ADT info for Nat
  book.set(
    'Nat',
    ann(
      {
        form: 'adt',
        indx: [],
        ctrs: [
          {
            name: 'Zero',
            tele: { form: 'ret', term: ref('Nat') },
          },
          {
            name: 'Succ',
            tele: {
              form: 'ext',
              name: 'pred',
              typ: ref('Nat'),
              bod: () => ({ form: 'ret', term: ref('Nat') }),
            },
          },
        ],
        type: { form: 'set' },
      },
      { form: 'set' },
    ),
  )
  return book
}

describe('term/total', () => {
  it('non-recursive function is total', () => {
    // id = \x x
    const term: Term = lam('x', x => x)
    const result = checkTotal({ name: 'id', term, book: new Map() })
    expect(result.ok).toBe(true)
  })

  it('constant function is total', () => {
    // const = \x \y x
    const term: Term = lam('x', x => lam('y', () => x))
    const result = checkTotal({ name: 'const', term, book: new Map() })
    expect(result.ok).toBe(true)
  })

  it('structurally recursive function with Mat is total', () => {
    const book = natBook()
    // add = \n \m App(Mat([Zero: m, Succ: \pred \rec Succ(rec)]), n)
    const term: Term = lam('n', n =>
      lam('m', m =>
        app(
          {
            form: 'mat',
            arms: [
              ['Zero', m],
              [
                'Succ',
                lam('pred', pred =>
                  lam('rec', rec => app(ref('Succ'), rec)),
                ),
              ],
            ],
          },
          n,
        ),
      ),
    )
    // Note: the "rec" here is the recursive call result, not an actual
    // recursive call to "add". For self-type encoding, recursion happens
    // through self-instantiation.
    const result = checkTotal({ name: 'add', term, book })
    expect(result.ok).toBe(true)
  })

  it('self-type recursive function with sub-component arg is total', () => {
    const book = natBook()
    // add via self-type elimination:
    // add = \n \m (~n (\_ Nat) m (\pred \rec Succ(rec)))
    const term: Term = lam('n', n =>
      lam('m', m =>
        app(
          app(
            app(
              { form: 'ins', val: n },
              lam('_', () => ref('Nat')),
            ),
            m,
          ),
          lam('pred', () => lam('rec', rec => app(ref('Succ'), rec))),
        ),
      ),
    )
    // This is not recursive (no call to 'add'), so it's trivially total
    const result = checkTotal({ name: 'add', term, book })
    expect(result.ok).toBe(true)
  })

  it('detects non-structural recursion', () => {
    const book = natBook()
    // bad = \n bad(n)  -- recursive with same arg, no pattern match
    const term: Term = lam('n', n => app(ref('bad'), n))
    const result = checkTotal({ name: 'bad', term, book })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain(
      'no parameter is pattern-matched',
    )
  })

  it('wrapped in Ann is still checked', () => {
    // Ann(id, some-type) should be total
    const term: Term = ann(lam('x', x => x), { form: 'set' })
    const result = checkTotal({ name: 'id', term, book: new Map() })
    expect(result.ok).toBe(true)
  })

  describe('firm purity', () => {
    it('rejects halt (exceptions) in firm functions', () => {
      const term: Term = lam('x', () => ({
        form: 'hlt',
        msg: { form: 'txt', val: 'error' },
      }))
      const result = checkTotal({ name: 'bad', term, book: new Map() })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('cannot throw exceptions')
    })

    it('rejects turn next (nxt) in firm functions', () => {
      const term: Term = lam('x', () => ({ form: 'nxt' }))
      const result = checkTotal({ name: 'bad', term, book: new Map() })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('control flow')
    })

    it('rejects breakpoints (rst) in firm functions', () => {
      const term: Term = lam('x', x => ({
        form: 'rst',
        val: x,
      }))
      const result = checkTotal({ name: 'bad', term, book: new Map() })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('breakpoints')
    })

    it('rejects async (.wait) in firm functions', () => {
      const term: Term = lam('x', x =>
        app({ form: 'ref', name: '.wait' }, x),
      )
      const result = checkTotal({ name: 'bad', term, book: new Map() })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('async')
    })

    it('accepts pure firm function', () => {
      const term: Term = lam('x', x => x)
      const result = checkTotal({ name: 'id', term, book: new Map() })
      expect(result.ok).toBe(true)
    })

    it('rejects halt nested inside let binding', () => {
      const term: Term = lam('x', x => ({
        form: 'let',
        name: 'y',
        val: x,
        bod: () => ({ form: 'hlt', msg: { form: 'txt', val: 'error' } }),
      }))
      const result = checkTotal({ name: 'bad', term, book: new Map() })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('cannot throw exceptions')
    })
  })

  describe('positivity checking', () => {
    it('accepts Nat (positive recursive occurrence)', () => {
      const adt: AdtDesc = {
        name: 'Nat',
        indices: [],
        ctrs: [
          { name: 'Zero', fields: [] },
          { name: 'Succ', fields: [{ name: 'pred', typ: ref('Nat') }] },
        ],
      }
      const result = checkPositivity({ adt })
      expect(result.ok).toBe(true)
    })

    it('rejects negative occurrence (type in function input)', () => {
      // form bad, case mk, take f, like (bad -> bool)
      const adt: AdtDesc = {
        name: 'Bad',
        indices: [],
        ctrs: [
          {
            name: 'mk',
            fields: [{
              name: 'f',
              typ: {
                form: 'all',
                name: 'x',
                inp: ref('Bad'),
                bod: () => ref('Bool'),
              },
            }],
          },
        ],
      }
      const result = checkPositivity({ adt })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('negative position')
    })

    it('accepts positive occurrence in container (list Bad)', () => {
      // form good, case mk, take items, like (list good)
      const adt: AdtDesc = {
        name: 'Good',
        indices: [],
        ctrs: [
          {
            name: 'mk',
            fields: [{
              name: 'items',
              typ: app(ref('List'), ref('Good')),
            }],
          },
        ],
      }
      const result = checkPositivity({ adt })
      expect(result.ok).toBe(true)
    })

    it('accepts type with no recursive fields', () => {
      const adt: AdtDesc = {
        name: 'Bool',
        indices: [],
        ctrs: [
          { name: 'True', fields: [] },
          { name: 'False', fields: [] },
        ],
      }
      const result = checkPositivity({ adt })
      expect(result.ok).toBe(true)
    })
  })
})
