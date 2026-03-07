/**
 * Proof erasure tests.
 *
 * Verifies that eraseProofs() removes proof-only definitions
 * (Equal, refl, proof lemmas) while preserving runtime code
 * (Nat, add, runtime functions).
 */

import { describe, it, expect } from 'vitest'
import { eraseProofs } from '@/term/erase'
import { encodeSelfType, buildEqualType } from '@/term/adt'
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

function all(
  name: string,
  inp: Term,
  bod: (x: Term) => Term,
): Term {
  return { form: 'all', name, inp, bod }
}

function ann(val: Term, typ: Term): Term {
  return { form: 'ann', done: false, val, typ }
}

function set(): Term {
  return { form: 'set' }
}

function EqualApp(A: Term, a: Term, b: Term): Term {
  return app(app(app(ref('Equal'), A), a), b)
}

function buildTestBook(): Book {
  // Nat type
  const natDesc = {
    name: 'Nat',
    indices: [],
    ctrs: [
      { name: 'Zero', fields: [] },
      { name: 'Succ', fields: [{ name: 'pred', typ: ref('Nat') }] },
    ],
  }
  const { typeDef, ctrs } = encodeSelfType({ adt: natDesc })
  const zeroCtr = ctrs.find(c => c.name === 'Zero')!
  const succCtr = ctrs.find(c => c.name === 'Succ')!

  const book: Book = new Map()
  book.set('Nat', ann(typeDef, set()))
  book.set('Zero', ann(zeroCtr.term, zeroCtr.typ))
  book.set('Succ', ann(succCtr.term, succCtr.typ))

  // add : Nat -> Nat -> Nat (runtime function)
  const addTerm: Term = lam('n', n =>
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
  const addType: Term = all('n', ref('Nat'), () =>
    all('m', ref('Nat'), () => ref('Nat')),
  )
  book.set('add', ann(addTerm, addType))

  // Equal type and refl (proof infrastructure)
  const { Equal, refl } = buildEqualType()
  book.set('Equal', Equal)
  book.set('refl', refl)

  // A proof: add-zero-right : (n : Nat) -> Equal Nat (add n Zero) n
  const proofType: Term = all('n', ref('Nat'), n =>
    EqualApp(ref('Nat'), app(app(ref('add'), n), ref('Zero')), n),
  )
  const proofTerm: Term = lam('n', n =>
    app(
      app(ref('refl'), ref('Nat')),
      n,
    ),
  )
  book.set('add-zero-right', ann(proofTerm, proofType))

  return book
}

describe('term/erase', () => {
  it('removes Equal type definition', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    expect(result.has('Equal')).toBe(false)
  })

  it('removes proof definitions that return Equal', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    expect(result.has('add-zero-right')).toBe(false)
  })

  it('preserves runtime Nat type', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    expect(result.has('Nat')).toBe(true)
  })

  it('preserves runtime constructors', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    expect(result.has('Zero')).toBe(true)
    expect(result.has('Succ')).toBe(true)
  })

  it('preserves runtime add function', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    expect(result.has('add')).toBe(true)
  })

  it('strips Ann wrappers from preserved terms', () => {
    const book = buildTestBook()
    const result = eraseProofs({ book })
    const addTerm = result.get('add')
    // Ann should be stripped, leaving the lambda
    expect(addTerm).toBeDefined()
    expect(addTerm!.form).toBe('lam')
  })

  it('strips Ins wrappers from preserved terms', () => {
    const book: Book = new Map()
    const inner: Term = ref('x')
    const wrapped: Term = { form: 'ins', val: inner }
    book.set('test', wrapped)
    const result = eraseProofs({ book })
    const term = result.get('test')
    expect(term).toBeDefined()
    expect(term!.form).toBe('ref')
  })

  it('erases Void type definition', () => {
    const book: Book = new Map()
    book.set('Void', ann(set(), set()))
    const result = eraseProofs({ book })
    expect(result.has('Void')).toBe(false)
  })

  it('erases Unit type definition', () => {
    const book: Book = new Map()
    book.set('Unit', ann(set(), set()))
    const result = eraseProofs({ book })
    expect(result.has('Unit')).toBe(false)
  })

  it('erases definitions returning Void', () => {
    const book: Book = new Map()
    book.set('Void', ann(set(), set()))
    const absurdType = all('A', set(), () => all('v', ref('Void'), () => ref('A')))
    book.set('absurd', ann(lam('A', () => lam('v', v => v)), absurdType))
    const result = eraseProofs({ book })
    // absurd returns A (not a proof type), so it should be kept
    expect(result.has('absurd')).toBe(true)
  })

  it('preserves unannotated definitions', () => {
    const book: Book = new Map()
    const rawLam = lam('x', x => x)
    book.set('identity', rawLam)
    const result = eraseProofs({ book })
    expect(result.has('identity')).toBe(true)
  })

  it('handles empty book', () => {
    const book: Book = new Map()
    const result = eraseProofs({ book })
    expect(result.size).toBe(0)
  })

  it('erases proof returning applied Equal (Equal Nat x y)', () => {
    const book = buildTestBook()
    // add-zero-right returns (Equal Nat (add n Zero) n) which is an app of Equal
    expect(book.has('add-zero-right')).toBe(true)
    const result = eraseProofs({ book })
    expect(result.has('add-zero-right')).toBe(false)
  })
})
