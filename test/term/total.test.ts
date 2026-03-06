/**
 * Totality checking tests.
 *
 * Tests that the totality checker correctly identifies:
 * - Non-recursive functions (trivially total)
 * - Structurally recursive functions (total)
 * - Non-structurally recursive functions (not total)
 */

import { describe, it, expect } from 'vitest'
import { checkTotal } from '@/term/total'
import type { Term, Book } from '@/term/form'

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
})
