import { describe, it, expect, beforeEach } from 'vitest'
import { check, infer, verify } from '@/term/check'
import { envRun, envInit, envResetMeta } from '@/term/env'
import { encodeSelfType, buildEqualType, buildCong } from '@/term/adt'
import { reduce } from '@/term/reduce'
import { equal } from '@/term/equal'
import { showTerm } from '@/term/show'
import { checkTotal } from '@/term/total'
import type { Term, Book, Ctr, Tele } from '@/term/form'
import type { AdtDesc } from '@/term/adt'

function bookWith(defs: Record<string, Term>): Book {
  return new Map(Object.entries(defs))
}

// Term helpers
function ref(name: string): Term { return { form: 'ref', name } }
function app(func: Term, argm: Term): Term { return { form: 'app', func, argm } }
function lam(name: string, bod: (x: Term) => Term): Term { return { form: 'lam', name, bod } }
function all(name: string, inp: Term, bod: (x: Term) => Term): Term { return { form: 'all', name, inp, bod } }
function ann(val: Term, typ: Term): Term { return { form: 'ann', done: false, val, typ } }
function set(): Term { return { form: 'set' } }
function ins(val: Term): Term { return { form: 'ins', val } }

function EqualApp(A: Term, a: Term, b: Term): Term {
  return app(app(app(ref('Equal'), A), a), b)
}
function reflApp(A: Term, a: Term): Term {
  return app(app(ref('refl'), A), a)
}

function natDesc(): AdtDesc {
  return {
    name: 'Nat',
    indices: [],
    ctrs: [
      { name: 'Zero', fields: [] },
      { name: 'Succ', fields: [{ name: 'pred', typ: ref('Nat') }] },
    ],
  }
}

function buildNatBook(): Book {
  const adt = natDesc()
  const { typeDef, ctrs } = encodeSelfType({ adt })

  const book: Book = new Map()
  book.set('Nat', typeDef)
  for (const ctr of ctrs) {
    book.set(ctr.name, ann(ctr.term, ctr.typ))
  }

  // add : Nat -> Nat -> Nat
  // add = \a \b (~a (\_ Nat) b (\pred \ih (Succ ih)))
  const addType: Term = all('a', ref('Nat'), () => all('b', ref('Nat'), () => ref('Nat')))
  const addVal: Term = lam('a', a =>
    lam('b', b =>
      app(app(app(ins(a), lam('_', () => ref('Nat'))), b),
        lam('pred', () => lam('ih', ih => app(ref('Succ'), ih))))))
  book.set('add', ann(addVal, addType))

  return book
}

function buildProofBook(): Book {
  const book = buildNatBook()
  const { Equal, refl } = buildEqualType()
  book.set('Equal', Equal)
  book.set('refl', refl)
  book.set('cong', buildCong())

  // sym : forall(A: *)(a b: A) Equal(A, a, b) -> Equal(A, b, a)
  const symVal: Term = lam('A', A => lam('a', a => lam('b', () =>
    lam('e', e => app(app(ins(e), lam('x', x => EqualApp(A, x, a))), reflApp(A, a))))))
  const symType: Term = all('A', set(), A =>
    all('a', A, a => all('b', A, b => all('_', EqualApp(A, a, b), () => EqualApp(A, b, a)))))
  book.set('sym', ann(symVal, symType))

  // trans : forall(A: *)(a b c: A) Equal(A, a, b) -> Equal(A, b, c) -> Equal(A, a, c)
  const transVal: Term = lam('A', A => lam('a', a => lam('b', () => lam('c', () =>
    lam('e1', e1 => lam('e2', e2 => app(app(ins(e2), lam('x', x => EqualApp(A, a, x))), e1)))))))
  const transType: Term = all('A', set(), A =>
    all('a', A, a => all('b', A, b => all('c', A, c =>
      all('_', EqualApp(A, a, b), () => all('_', EqualApp(A, b, c), () => EqualApp(A, a, c)))))))
  book.set('trans', ann(transVal, transType))

  return book
}

describe('dependent types: Nat self-type encoding', () => {
  beforeEach(() => { envResetMeta() })

  it('Nat self-type is well-typed (Nat : *)', () => {
    const book = buildNatBook()
    const result = check({ term: book.get('Nat')!, book })
    expect(result).not.toBeNull()
  })

  it('Zero constructor type-checks (Zero : Nat)', () => {
    const result = check({ term: ref('Zero'), book: buildNatBook() })
    expect(result).not.toBeNull()
  })

  it('Succ constructor type-checks (Succ : Nat -> Nat)', () => {
    const result = check({ term: ref('Succ'), book: buildNatBook() })
    expect(result).not.toBeNull()
  })

  it('add function type-checks (add : Nat -> Nat -> Nat)', () => {
    const result = check({ term: ref('add'), book: buildNatBook() })
    expect(result).not.toBeNull()
  })

  it('add(Zero, n) reduces to n', () => {
    const book = buildNatBook()
    const n: Term = { form: 'var', name: 'n', idx: 0 }
    const result = reduce({ book, fill: new Map(), lv: 2,
      term: app(app(ref('add'), ref('Zero')), n) })
    expect(result.form).toBe('var')
    if (result.form === 'var') expect(result.name).toBe('n')
  })

  it('add(Succ(Zero), Zero) reduces to Succ(Zero)', () => {
    const book = buildNatBook()
    const state = envInit({ book })
    const a = app(app(ref('add'), app(ref('Succ'), ref('Zero'))), ref('Zero'))
    const b = app(ref('Succ'), ref('Zero'))
    const result = envRun({ env: equal({ a, b, dep: 0 }), state })
    expect(result).not.toBeNull()
    expect(result!.value).toBe(true)
  })
})

describe('dependent types: Equal + proofs', () => {
  beforeEach(() => { envResetMeta() })

  it('Equal type is well-typed', () => {
    const book = buildProofBook()
    const result = check({ term: ref('Equal'), book })
    expect(result).not.toBeNull()
  })

  it('refl is well-typed', () => {
    const book = buildProofBook()
    const result = check({ term: ref('refl'), book })
    expect(result).not.toBeNull()
  })

  it('sym is well-typed', () => {
    const book = buildProofBook()
    const result = check({ term: ref('sym'), book })
    expect(result).not.toBeNull()
  })

  it('trans is well-typed', () => {
    const book = buildProofBook()
    const result = check({ term: ref('trans'), book })
    expect(result).not.toBeNull()
  })

  it('add-zero-right: forall(n: Nat) Equal(Nat, add(n, Zero), n)', () => {
    const book = buildProofBook()
    const addApp = (a: Term, b: Term) => app(app(ref('add'), a), b)

    const proofType: Term = all('n', ref('Nat'), n =>
      EqualApp(ref('Nat'), addApp(n, ref('Zero')), n))

    const proofVal: Term = lam('n', n =>
      app(app(app(ins(n),
        lam('x', x => EqualApp(ref('Nat'), addApp(x, ref('Zero')), x))),
        reflApp(ref('Nat'), ref('Zero'))),
        lam('pred', pred => lam('ih', ih =>
          app(app(ins(ih),
            lam('x', x => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, ref('Zero'))),
              app(ref('Succ'), x)))),
            reflApp(ref('Nat'), app(ref('Succ'), addApp(pred, ref('Zero')))))))))

    book.set('add-zero-right', ann(proofVal, proofType))
    const result = check({ term: ref('add-zero-right'), book })
    expect(result).not.toBeNull()
  })

  it('add-succ-right: forall(a b: Nat) Equal(Nat, add(a, Succ(b)), Succ(add(a, b)))', () => {
    const book = buildProofBook()
    const addApp = (a: Term, b: Term) => app(app(ref('add'), a), b)

    const proofType: Term = all('a', ref('Nat'), a =>
      all('b', ref('Nat'), b =>
        EqualApp(ref('Nat'), addApp(a, app(ref('Succ'), b)), app(ref('Succ'), addApp(a, b)))))

    const proofVal: Term = lam('a', a => lam('b', b =>
      app(app(app(ins(a),
        lam('x', x => EqualApp(ref('Nat'),
          addApp(x, app(ref('Succ'), b)),
          app(ref('Succ'), addApp(x, b))))),
        reflApp(ref('Nat'), app(ref('Succ'), b))),
        lam('pred', pred => lam('ih', ih =>
          app(app(ins(ih),
            lam('y', y => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, app(ref('Succ'), b))),
              app(ref('Succ'), y)))),
            reflApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, app(ref('Succ'), b))))))))))

    book.set('add-succ-right', ann(proofVal, proofType))
    const result = check({ term: ref('add-succ-right'), book })
    expect(result).not.toBeNull()
  })

  it('add-comm: forall(a b: Nat) Equal(Nat, add(a, b), add(b, a))', () => {
    const book = buildProofBook()
    const addApp = (a: Term, b: Term) => app(app(ref('add'), a), b)

    // Register add-zero-right
    const azrType = all('n', ref('Nat'), n => EqualApp(ref('Nat'), addApp(n, ref('Zero')), n))
    const azrVal = lam('n', n =>
      app(app(app(ins(n),
        lam('x', x => EqualApp(ref('Nat'), addApp(x, ref('Zero')), x))),
        reflApp(ref('Nat'), ref('Zero'))),
        lam('pred', pred => lam('ih', ih =>
          app(app(ins(ih),
            lam('x', x => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, ref('Zero'))),
              app(ref('Succ'), x)))),
            reflApp(ref('Nat'), app(ref('Succ'), addApp(pred, ref('Zero')))))))))
    book.set('add-zero-right', ann(azrVal, azrType))

    // Register add-succ-right
    const asrType = all('n', ref('Nat'), n =>
      all('m', ref('Nat'), m =>
        EqualApp(ref('Nat'), addApp(n, app(ref('Succ'), m)), app(ref('Succ'), addApp(n, m)))))
    const asrVal = lam('n', n => lam('m', m =>
      app(app(app(ins(n),
        lam('x', x => EqualApp(ref('Nat'),
          addApp(x, app(ref('Succ'), m)),
          app(ref('Succ'), addApp(x, m))))),
        reflApp(ref('Nat'), app(ref('Succ'), m))),
        lam('pred', pred => lam('ih', ih =>
          app(app(ins(ih),
            lam('y', y => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, app(ref('Succ'), m))),
              app(ref('Succ'), y)))),
            reflApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, app(ref('Succ'), m))))))))))
    book.set('add-succ-right', ann(asrVal, asrType))

    // add-comm by induction on a
    const commType = all('a', ref('Nat'), a =>
      all('b', ref('Nat'), b =>
        EqualApp(ref('Nat'), addApp(a, b), addApp(b, a))))

    const commVal = lam('a', a => lam('b', b =>
      app(app(app(ins(a),
        lam('x', x => EqualApp(ref('Nat'), addApp(x, b), addApp(b, x)))),
        // Base: add(Zero, b) = b = add(b, Zero) → sym(add-zero-right(b))
        app(app(app(app(ref('sym'), ref('Nat')), addApp(b, ref('Zero'))), b),
          app(ref('add-zero-right'), b))),
        // Step: \pred \ih -> trans(cong Succ ih, sym(add-succ-right(b, pred)))
        lam('pred', pred => lam('ih', ih => {
          // cong Succ ih : Equal(Nat, Succ(add(pred, b)), Succ(add(b, pred)))
          const congSuccIh = app(app(ins(ih),
            lam('y', y => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, b)),
              app(ref('Succ'), y)))),
            reflApp(ref('Nat'), app(ref('Succ'), addApp(pred, b))))

          // sym(add-succ-right(b, pred)) : Equal(Nat, Succ(add(b, pred)), add(b, Succ(pred)))
          const symAsr = app(
            app(app(app(ref('sym'), ref('Nat')),
              addApp(b, app(ref('Succ'), pred))),
              app(ref('Succ'), addApp(b, pred))),
            app(app(ref('add-succ-right'), b), pred))

          // trans : Equal(Nat, Succ(add(pred, b)), add(b, Succ(pred)))
          return app(app(app(app(app(app(ref('trans'), ref('Nat')),
            app(ref('Succ'), addApp(pred, b))),
            app(ref('Succ'), addApp(b, pred))),
            addApp(b, app(ref('Succ'), pred))),
            congSuccIh), symAsr)
        })))))

    book.set('add-comm', ann(commVal, commType))
    const result = check({ term: ref('add-comm'), book })
    expect(result).not.toBeNull()
  })
})

describe('dependent types: ADT Mat/Con path', () => {
  beforeEach(() => { envResetMeta() })

  function adtBoolBook(): Book {
    const book: Book = new Map()

    // Bool as a built-in ADT (not self-type encoded)
    const boolAdt: Term = {
      form: 'adt',
      indx: [],
      ctrs: [
        { name: 'True', tele: { form: 'ret', term: ref('Bool') } },
        { name: 'False', tele: { form: 'ret', term: ref('Bool') } },
      ],
      type: set(),
    }
    book.set('Bool', ann(boolAdt, set()))
    return book
  }

  it('Bool ADT type-checks', () => {
    const book = adtBoolBook()
    const result = check({ term: ref('Bool'), book })
    expect(result).not.toBeNull()
  })

  it('Con True : Bool type-checks against ADT', () => {
    const book = adtBoolBook()
    const term: Term = ann({ form: 'con', name: 'True', args: [] }, ref('Bool'))
    book.set('myTrue', term)
    const result = check({ term: ref('myTrue'), book })
    expect(result).not.toBeNull()
  })

  it('Con False : Bool type-checks against ADT', () => {
    const book = adtBoolBook()
    const term: Term = ann({ form: 'con', name: 'False', args: [] }, ref('Bool'))
    book.set('myFalse', term)
    const result = check({ term: ref('myFalse'), book })
    expect(result).not.toBeNull()
  })

  it('Mat with dependent return type (Bool -> U64)', () => {
    const book = adtBoolBook()

    // not : Bool -> Bool via Mat
    const notType: Term = all('b', ref('Bool'), () => ref('Bool'))
    const notMat: Term = {
      form: 'mat',
      arms: [
        ['True', { form: 'con', name: 'False', args: [] }],
        ['False', { form: 'con', name: 'True', args: [] }],
      ],
    }
    const notVal: Term = lam('b', b => app(notMat, b))
    // We need Ann for the Mat to get the right type context
    book.set('not', ann(notVal, notType))
    const result = check({ term: ref('not'), book })
    expect(result).not.toBeNull()
  })

  it('Mat coverage checking: missing arm fails', () => {
    const book = adtBoolBook()
    const matType: Term = all('b', ref('Bool'), () => { return { form: 'int', size: 64, sign: false } })
    const matTerm: Term = {
      form: 'mat',
      arms: [['True', { form: 'num', val: 1 }]],
      // Missing 'False' arm
    }
    const val = lam('b', b => app(matTerm, b))
    book.set('partial', ann(val, matType))
    const result = check({ term: ref('partial'), book })
    // Should fail due to incomplete match
    expect(result).toBeNull()
  })

  function adtNatBook(): Book {
    const book: Book = new Map()
    const natAdt: Term = {
      form: 'adt',
      indx: [],
      ctrs: [
        { name: 'Zero', tele: { form: 'ret', term: ref('Nat') } as Tele },
        {
          name: 'Succ',
          tele: {
            form: 'ext', name: 'pred', typ: ref('Nat'),
            bod: () => ({ form: 'ret', term: ref('Nat') } as Tele),
          } as Tele,
        },
      ],
      type: set(),
    }
    book.set('Nat', ann(natAdt, set()))
    return book
  }

  it('Nat ADT with Con(Succ, [pred]) type-checks', () => {
    const book = adtNatBook()
    const zero: Term = { form: 'con', name: 'Zero', args: [] }
    const one: Term = { form: 'con', name: 'Succ', args: [['pred', zero]] }
    book.set('one', ann(one, ref('Nat')))
    const result = check({ term: ref('one'), book })
    expect(result).not.toBeNull()
  })

  it('Mat on Nat ADT with dependent return type', () => {
    const book = adtNatBook()

    // is-zero : Nat -> U64 via Mat
    const isZeroType: Term = all('n', ref('Nat'), () => ({ form: 'int', size: 64, sign: false }))
    const isZeroMat: Term = {
      form: 'mat',
      arms: [
        ['Zero', { form: 'num', val: 1 }],
        ['Succ', lam('pred', () => ({ form: 'num', val: 0 }))],
      ],
    }
    const isZeroVal: Term = lam('n', n => app(isZeroMat, n))
    book.set('is-zero', ann(isZeroVal, isZeroType))
    const result = check({ term: ref('is-zero'), book })
    expect(result).not.toBeNull()
  })

  it('Mat reduction: is-zero(Zero) = 1', () => {
    const book = adtNatBook()
    const isZeroMat: Term = {
      form: 'mat',
      arms: [
        ['Zero', { form: 'num', val: 1 }],
        ['Succ', lam('pred', () => ({ form: 'num', val: 0 }))],
      ],
    }
    const zero: Term = { form: 'con', name: 'Zero', args: [] }
    const result = reduce({ book, fill: new Map(), lv: 2,
      term: app(isZeroMat, zero) })
    expect(result.form).toBe('num')
    if (result.form === 'num') expect(result.val).toBe(1)
  })

  it('Mat reduction: is-zero(Succ(Zero)) = 0', () => {
    const book = adtNatBook()
    const isZeroMat: Term = {
      form: 'mat',
      arms: [
        ['Zero', { form: 'num', val: 1 }],
        ['Succ', lam('pred', () => ({ form: 'num', val: 0 }))],
      ],
    }
    const one: Term = { form: 'con', name: 'Succ', args: [['pred', { form: 'con', name: 'Zero', args: [] }]] }
    const result = reduce({ book, fill: new Map(), lv: 2,
      term: app(isZeroMat, one) })
    expect(result.form).toBe('num')
    if (result.form === 'num') expect(result.val).toBe(0)
  })
})

describe('dependent types: totality checking', () => {
  beforeEach(() => { envResetMeta() })

  it('self-type add is total (no explicit recursion)', () => {
    const book = buildNatBook()
    const addDef = book.get('add')!
    const body = addDef.form === 'ann' ? addDef.val : addDef
    const result = checkTotal({ name: 'add', term: body, book })
    // Self-type elimination provides structural recursion by construction.
    // No Ref("add") calls exist, so it's trivially total.
    expect(result.ok).toBe(true)
  })

  it('non-recursive function is total', () => {
    const book = buildNatBook()
    const identity = ann(lam('n', n => n), all('n', ref('Nat'), () => ref('Nat')))
    book.set('id', identity)
    const result = checkTotal({ name: 'id', term: identity, book })
    expect(result.ok).toBe(true)
  })

  it('self-type proof function is total', () => {
    const book = buildProofBook()
    const addApp = (a: Term, b: Term) => app(app(ref('add'), a), b)

    // add-zero-right proof term
    const azrVal = lam('n', n =>
      app(app(app(ins(n),
        lam('x', x => EqualApp(ref('Nat'), addApp(x, ref('Zero')), x))),
        reflApp(ref('Nat'), ref('Zero'))),
        lam('pred', pred => lam('ih', ih =>
          app(app(ins(ih),
            lam('x', x => EqualApp(ref('Nat'),
              app(ref('Succ'), addApp(pred, ref('Zero'))),
              app(ref('Succ'), x)))),
            reflApp(ref('Nat'), app(ref('Succ'), addApp(pred, ref('Zero')))))))))

    const result = checkTotal({ name: 'add-zero-right', term: azrVal, book })
    // No explicit recursive calls, total by self-type construction
    expect(result.ok).toBe(true)
  })

  it('Mat-based recursive function with structural recursion is total', () => {
    // double = \n match n { Zero -> Zero, Succ(pred) -> Succ(Succ(double(pred))) }
    const book: Book = new Map()
    const doubleVal = lam('n', n =>
      app({ form: 'mat', arms: [
        ['Zero', { form: 'con', name: 'Zero', args: [] }],
        ['Succ', lam('pred', pred =>
          app(ref('Succ'), app(ref('Succ'), app(ref('double'), pred))))],
      ] }, n))

    book.set('double', ann(doubleVal, all('n', ref('Nat'), () => ref('Nat'))))
    const result = checkTotal({ name: 'double', term: doubleVal, book })
    expect(result.ok).toBe(true)
  })

  it('non-structural recursion fails totality', () => {
    // bad = \n bad(n) -- infinite loop
    const book: Book = new Map()
    const badVal = lam('n', n => app(ref('bad'), n))
    book.set('bad', ann(badVal, all('n', ref('Nat'), () => ref('Nat'))))
    const result = checkTotal({ name: 'bad', term: badVal, book })
    expect(result.ok).toBe(false)
  })
})
