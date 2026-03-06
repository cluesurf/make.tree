/**
 * Proof verification tests for the dependent type checker.
 *
 * Tests that the type checker can verify proofs using self-type
 * encodings following the Calculus of Constructions with self-types
 * (as in Kind/HVM).
 *
 * Proofs tested:
 * - Self-type encoded Nat (Zero, Succ) type-checks
 * - Self-type encoded Bool (True, False) type-checks
 * - add function type-checks
 * - Equal type, refl, cong type-check
 * - add-zero-right: n + 0 = n
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { check } from '@/term/check'
import { reduce } from '@/term/reduce'
import { equal } from '@/term/equal'
import { envResetMeta, envInit, envRun } from '@/term/env'
import { encodeSelfType, buildEqualType } from '@/term/adt'
import type { Term, Book } from '@/term/form'

// Helper: apply Equal to 3 args
function EqualApp(A: Term, a: Term, b: Term): Term {
  return {
    form: 'app',
    func: {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: 'Equal' }, argm: A },
      argm: a,
    },
    argm: b,
  }
}

function reflApp(A: Term, a: Term): Term {
  return {
    form: 'app',
    func: { form: 'app', func: { form: 'ref', name: 'refl' }, argm: A },
    argm: a,
  }
}

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

// Build a book with self-type encoded Nat
function natBook(): Book {
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

  return book
}

// Build a book with Nat + Equal + refl
function proofBook(): Book {
  const book = natBook()
  const { Equal, refl } = buildEqualType()

  book.set('Equal', Equal)
  book.set('refl', refl)

  // add : Nat -> Nat -> Nat
  // add = \n \m (~n (\_ Nat) m (\pred \rec Succ(rec)))
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

  return book
}

describe('term/proof', () => {
  beforeEach(() => {
    envResetMeta()
  })

  describe('self-type Nat encoding', () => {
    it('Nat : * type-checks', () => {
      const book = natBook()
      const result = check({ term: ref('Nat'), book })
      expect(result).not.toBeNull()
      if (result && result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('set')
      }
    })

    it('Zero : Nat type-checks', () => {
      const book = natBook()
      const result = check({ term: ref('Zero'), book })
      expect(result).not.toBeNull()
    })

    it('Succ : Nat -> Nat type-checks', () => {
      const book = natBook()
      const result = check({ term: ref('Succ'), book })
      expect(result).not.toBeNull()
    })

    it('Succ(Zero) : Nat type-checks', () => {
      const book = natBook()
      const term: Term = app(ref('Succ'), ref('Zero'))
      book.set('one', ann(term, ref('Nat')))
      const result = check({ term: ref('one'), book })
      expect(result).not.toBeNull()
    })

    it('Nat elimination reduces correctly', () => {
      const book = natBook()
      const fill = new Map()

      // (~Zero (\_ Nat) zero_val succ_fn) should reduce to zero_val
      const zeroElim: Term = app(
        app(
          app(
            { form: 'ins', val: ref('Zero') },
            lam('_', () => ref('Nat')),
          ),
          ref('Zero'), // zero case value
        ),
        lam('p', () => lam('r', r => app(ref('Succ'), r))),
      )

      // Verify via equal: the elimination should equal Zero
      const state = envInit({ book })
      const eqResult = envRun({
        env: equal({ a: zeroElim, b: ref('Zero'), dep: 0 }),
        state,
      })
      expect(eqResult).not.toBeNull()
      expect(eqResult!.value).toBe(true)
    })
  })

  describe('self-type Bool encoding', () => {
    function boolBook(): Book {
      const boolDesc = {
        name: 'Bool',
        indices: [],
        ctrs: [
          { name: 'True', fields: [] },
          { name: 'False', fields: [] },
        ],
      }

      const { typeDef, ctrs } = encodeSelfType({ adt: boolDesc })
      const trueCtr = ctrs.find(c => c.name === 'True')!
      const falseCtr = ctrs.find(c => c.name === 'False')!

      const book: Book = new Map()
      book.set('Bool', ann(typeDef, set()))
      book.set('True', ann(trueCtr.term, trueCtr.typ))
      book.set('False', ann(falseCtr.term, falseCtr.typ))

      return book
    }

    it('Bool : * type-checks', () => {
      const book = boolBook()
      const result = check({ term: ref('Bool'), book })
      expect(result).not.toBeNull()
    })

    it('True : Bool type-checks', () => {
      const book = boolBook()
      const result = check({ term: ref('True'), book })
      expect(result).not.toBeNull()
    })

    it('False : Bool type-checks', () => {
      const book = boolBook()
      const result = check({ term: ref('False'), book })
      expect(result).not.toBeNull()
    })

    it('not : Bool -> Bool type-checks', () => {
      const book = boolBook()

      // not = \b (~b (\_ Bool) False True)
      const notTerm: Term = lam('b', b =>
        app(
          app(
            app(
              { form: 'ins', val: b },
              lam('_', () => ref('Bool')),
            ),
            ref('False'),
          ),
          ref('True'),
        ),
      )

      const notType: Term = all('b', ref('Bool'), () => ref('Bool'))
      book.set('not', ann(notTerm, notType))

      const result = check({ term: ref('not'), book })
      expect(result).not.toBeNull()
    })

    it('Bool elimination reduces True correctly', () => {
      const book = boolBook()
      const fill = new Map()

      // (~True (\_ Bool) false_val true_val) should reduce to false_val?
      // Actually, True = ~\P \true \false true
      // So (~True P t f) = t
      const trueElim: Term = app(
        app(
          app(
            { form: 'ins', val: ref('True') },
            lam('_', () => ref('Bool')),
          ),
          { form: 'num', val: 1 }, // true case
        ),
        { form: 'num', val: 0 }, // false case
      )

      const result = reduce({ book, fill, lv: 2, term: trueElim })
      expect(result.form).toBe('num')
      if (result.form === 'num') expect(result.val).toBe(1)
    })
  })

  describe('Equal and refl', () => {
    it('Equal : * -> * -> * -> * type-checks', () => {
      const book = proofBook()
      const result = check({ term: ref('Equal'), book })
      expect(result).not.toBeNull()
    })

    it('refl type-checks', () => {
      const book = proofBook()
      const result = check({ term: ref('refl'), book })
      expect(result).not.toBeNull()
    })

    it('refl(Nat, Zero) : Equal(Nat, Zero, Zero) type-checks', () => {
      const book = proofBook()
      const term = ann(reflApp(ref('Nat'), ref('Zero')), EqualApp(ref('Nat'), ref('Zero'), ref('Zero')))
      book.set('test', term)
      const result = check({ term: ref('test'), book })
      expect(result).not.toBeNull()
    })
  })

  describe('add function', () => {
    it('add : Nat -> Nat -> Nat type-checks', () => {
      const book = proofBook()
      const result = check({ term: ref('add'), book })
      expect(result).not.toBeNull()
    })

    it('add(Zero, Zero) equals Zero', () => {
      const book = proofBook()
      // Use the equal function which handles reduction + structural comparison
      const state = envInit({ book })
      const a = app(app(ref('add'), ref('Zero')), ref('Zero'))
      const b = ref('Zero')
      const result = envRun({ env: equal({ a, b, dep: 0 }), state })
      expect(result).not.toBeNull()
      expect(result!.value).toBe(true)
    })

    it('add(Succ(Zero), Zero) equals Succ(Zero)', () => {
      const book = proofBook()
      const state = envInit({ book })
      const one = app(ref('Succ'), ref('Zero'))
      const a = app(app(ref('add'), one), ref('Zero'))
      const b = one
      const result = envRun({ env: equal({ a, b, dep: 0 }), state })
      expect(result).not.toBeNull()
      expect(result!.value).toBe(true)
    })
  })

  describe('proofs', () => {
    it('add-zero-right: forall(n: Nat) Equal(Nat, add(n, 0), n)', () => {
      const book = proofBook()

      // cong helper defined inline in the proof
      // cong(f, e) = ~e (\x Equal(Nat, f(a), f(x))) refl(Nat, f(a))

      // add-zero-right = \n (~n
      //   (\x Equal(Nat, add(x, Zero), x))   -- motive
      //   refl(Nat, Zero)                     -- base: add(Zero, Zero) = Zero
      //   (\pred \ih                          -- step
      //     ~ih (\x Equal(Nat, Succ(add(pred, Zero)), Succ(x)))
      //         refl(Nat, Succ(add(pred, Zero)))
      //   )
      // )
      //
      // In the step case:
      //   ih : Equal(Nat, add(pred, Zero), pred)
      //   We need: Equal(Nat, add(Succ(pred), Zero), Succ(pred))
      //   Since add(Succ(pred), Zero) reduces to Succ(add(pred, Zero)):
      //   We need: Equal(Nat, Succ(add(pred, Zero)), Succ(pred))
      //   Using cong with Succ:
      //     ~ih (\x Equal(Nat, Succ(add(pred, Zero)), Succ(x)))
      //         refl(Nat, Succ(add(pred, Zero)))
      //   This works because ~ih is the J eliminator:
      //     ~ih : forall(P: Nat -> *) P(add(pred, Zero)) -> P(pred)
      //   With P = \x Equal(Nat, Succ(add(pred, Zero)), Succ(x)):
      //     We get: Equal(Nat, Succ(add(pred, Zero)), Succ(add(pred, Zero))) ->
      //             Equal(Nat, Succ(add(pred, Zero)), Succ(pred))
      //     And refl(Nat, Succ(add(pred, Zero))) proves the first.

      const addApp = (n: Term, m: Term): Term =>
        app(app(ref('add'), n), m)

      const proofTerm: Term = lam('n', n =>
        app(
          app(
            app(
              { form: 'ins', val: n },
              // Motive: \x Equal(Nat, add(x, Zero), x)
              lam('x', x =>
                EqualApp(ref('Nat'), addApp(x, ref('Zero')), x),
              ),
            ),
            // Base case: refl(Nat, Zero)
            // add(Zero, Zero) = Zero, so Equal(Nat, Zero, Zero)
            reflApp(ref('Nat'), ref('Zero')),
          ),
          // Step case: \pred \ih -> cong Succ ih
          lam('pred', pred =>
            lam('ih', ih =>
              app(
                app(
                  { form: 'ins', val: ih },
                  // P = \x Equal(Nat, Succ(add(pred, Zero)), Succ(x))
                  lam('x', x =>
                    EqualApp(
                      ref('Nat'),
                      app(ref('Succ'), addApp(pred, ref('Zero'))),
                      app(ref('Succ'), x),
                    ),
                  ),
                ),
                // refl(Nat, Succ(add(pred, Zero)))
                reflApp(
                  ref('Nat'),
                  app(ref('Succ'), addApp(pred, ref('Zero'))),
                ),
              ),
            ),
          ),
        ),
      )

      const proofType: Term = all('n', ref('Nat'), n =>
        EqualApp(ref('Nat'), addApp(n, ref('Zero')), n),
      )

      book.set('add-zero-right', ann(proofTerm, proofType))

      const result = check({ term: ref('add-zero-right'), book })
      expect(result).not.toBeNull()
      if (result === null) {
        expect.fail('add-zero-right proof failed to type-check')
      }
    })

    it('add-succ-right: forall(n m: Nat) Equal(Nat, add(n, Succ(m)), Succ(add(n, m)))', () => {
      const book = proofBook()

      const addApp = (n: Term, m: Term): Term =>
        app(app(ref('add'), n), m)

      // add-succ-right = \n \m (~n
      //   (\x Equal(Nat, add(x, Succ(m)), Succ(add(x, m))))
      //   refl(Nat, Succ(m))
      //   (\pred \ih ~ih
      //     (\y Equal(Nat, Succ(add(pred, Succ(m))), Succ(y)))
      //     refl(Nat, Succ(add(pred, Succ(m))))
      //   )
      // )
      const proofTerm: Term = lam('n', n =>
        lam('m', m =>
          app(
            app(
              app(
                { form: 'ins', val: n },
                lam('x', x =>
                  EqualApp(
                    ref('Nat'),
                    addApp(x, app(ref('Succ'), m)),
                    app(ref('Succ'), addApp(x, m)),
                  ),
                ),
              ),
              // base: add(Zero, Succ(m)) = Succ(m) = Succ(add(Zero, m))
              reflApp(ref('Nat'), app(ref('Succ'), m)),
            ),
            lam('pred', pred =>
              lam('ih', ih =>
                app(
                  app(
                    { form: 'ins', val: ih },
                    lam('y', y =>
                      EqualApp(
                        ref('Nat'),
                        app(
                          ref('Succ'),
                          addApp(pred, app(ref('Succ'), m)),
                        ),
                        app(ref('Succ'), y),
                      ),
                    ),
                  ),
                  reflApp(
                    ref('Nat'),
                    app(
                      ref('Succ'),
                      addApp(pred, app(ref('Succ'), m)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      )

      const proofType: Term = all('n', ref('Nat'), n =>
        all('m', ref('Nat'), m =>
          EqualApp(
            ref('Nat'),
            addApp(n, app(ref('Succ'), m)),
            app(ref('Succ'), addApp(n, m)),
          ),
        ),
      )

      book.set('add-succ-right', ann(proofTerm, proofType))

      const result = check({ term: ref('add-succ-right'), book })
      expect(result).not.toBeNull()
      if (result === null) {
        expect.fail('add-succ-right proof failed to type-check')
      }
    })

    it('add-comm: forall(a b: Nat) Equal(Nat, add(a, b), add(b, a))', () => {
      const book = proofBook()

      const addApp = (n: Term, m: Term): Term =>
        app(app(ref('add'), n), m)

      // First register helpers
      // add-zero-right
      const azrTerm: Term = lam('n', n =>
        app(
          app(
            app(
              { form: 'ins', val: n },
              lam('x', x =>
                EqualApp(ref('Nat'), addApp(x, ref('Zero')), x),
              ),
            ),
            reflApp(ref('Nat'), ref('Zero')),
          ),
          lam('pred', pred =>
            lam('ih', ih =>
              app(
                app(
                  { form: 'ins', val: ih },
                  lam('x', x =>
                    EqualApp(
                      ref('Nat'),
                      app(ref('Succ'), addApp(pred, ref('Zero'))),
                      app(ref('Succ'), x),
                    ),
                  ),
                ),
                reflApp(
                  ref('Nat'),
                  app(ref('Succ'), addApp(pred, ref('Zero'))),
                ),
              ),
            ),
          ),
        ),
      )
      const azrType: Term = all('n', ref('Nat'), n =>
        EqualApp(ref('Nat'), addApp(n, ref('Zero')), n),
      )
      book.set('add-zero-right', ann(azrTerm, azrType))

      // add-succ-right
      const asrTerm: Term = lam('n', n =>
        lam('m', m =>
          app(
            app(
              app(
                { form: 'ins', val: n },
                lam('x', x =>
                  EqualApp(
                    ref('Nat'),
                    addApp(x, app(ref('Succ'), m)),
                    app(ref('Succ'), addApp(x, m)),
                  ),
                ),
              ),
              reflApp(ref('Nat'), app(ref('Succ'), m)),
            ),
            lam('pred', pred =>
              lam('ih', ih =>
                app(
                  app(
                    { form: 'ins', val: ih },
                    lam('y', y =>
                      EqualApp(
                        ref('Nat'),
                        app(
                          ref('Succ'),
                          addApp(pred, app(ref('Succ'), m)),
                        ),
                        app(ref('Succ'), y),
                      ),
                    ),
                  ),
                  reflApp(
                    ref('Nat'),
                    app(
                      ref('Succ'),
                      addApp(pred, app(ref('Succ'), m)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
      const asrType: Term = all('n', ref('Nat'), n =>
        all('m', ref('Nat'), m =>
          EqualApp(
            ref('Nat'),
            addApp(n, app(ref('Succ'), m)),
            app(ref('Succ'), addApp(n, m)),
          ),
        ),
      )
      book.set('add-succ-right', ann(asrTerm, asrType))

      // add-comm = \a \b (~a
      //   (\x Equal(Nat, add(x, b), add(b, x)))
      //   add-zero-right(b)             -- base: add(0, b) = b = add(b, 0)
      //   (\pred \ih
      //     -- ih : Equal(Nat, add(pred, b), add(b, pred))
      //     -- need: Equal(Nat, add(Succ(pred), b), add(b, Succ(pred)))
      //     --     = Equal(Nat, Succ(add(pred, b)), add(b, Succ(pred)))
      //     -- By add-succ-right(b, pred): add(b, Succ(pred)) = Succ(add(b, pred))
      //     -- So need: Equal(Nat, Succ(add(pred, b)), Succ(add(b, pred)))
      //     -- By cong Succ ih: Equal(Nat, Succ(add(pred, b)), Succ(add(b, pred)))
      //     -- Then transport via add-succ-right
      //
      //     Use sym to flip add-zero-right for base, and chain for step
      //   )
      // )

      // For add-comm, we need sym and trans (or just careful use of ~)
      // sym : Equal(A, a, b) -> Equal(A, b, a) = \e ~e (\x Equal(A, x, a)) refl
      const symTerm: Term = lam('A', A =>
        lam('a', a =>
          lam('b', () =>
            lam('e', e =>
              app(
                app(
                  { form: 'ins', val: e },
                  lam('x', x => EqualApp(A, x, a)),
                ),
                reflApp(A, a),
              ),
            ),
          ),
        ),
      )
      const symType: Term = all('A', set(), A =>
        all('a', A, a =>
          all('b', A, b =>
            all('_', EqualApp(A, a, b), () => EqualApp(A, b, a)),
          ),
        ),
      )
      book.set('sym', ann(symTerm, symType))

      // trans : Equal(A, a, b) -> Equal(A, b, c) -> Equal(A, a, c)
      const transTerm: Term = lam('A', A =>
        lam('a', a =>
          lam('b', () =>
            lam('c', () =>
              lam('e1', e1 =>
                lam('e2', e2 =>
                  app(
                    app(
                      { form: 'ins', val: e2 },
                      lam('x', x => EqualApp(A, a, x)),
                    ),
                    e1,
                  ),
                ),
              ),
            ),
          ),
        ),
      )
      const transType: Term = all('A', set(), A =>
        all('a', A, a =>
          all('b', A, b =>
            all('c', A, c =>
              all('_', EqualApp(A, a, b), () =>
                all('_', EqualApp(A, b, c), () => EqualApp(A, a, c)),
              ),
            ),
          ),
        ),
      )
      book.set('trans', ann(transTerm, transType))

      // For a simpler approach to add-comm, use the chain:
      // Step proof needs:
      //   ih : Equal(Nat, add(pred, b), add(b, pred))
      //   cong Succ ih : Equal(Nat, Succ(add(pred, b)), Succ(add(b, pred)))
      //   add-succ-right(b, pred) : Equal(Nat, add(b, Succ(pred)), Succ(add(b, pred)))
      //   sym(add-succ-right(b, pred)) : Equal(Nat, Succ(add(b, pred)), add(b, Succ(pred)))
      //   trans(cong Succ ih, sym(asr)) : Equal(Nat, Succ(add(pred, b)), add(b, Succ(pred)))

      const addCommTerm: Term = lam('a', a =>
        lam('b', b =>
          app(
            app(
              app(
                { form: 'ins', val: a },
                lam('x', x =>
                  EqualApp(ref('Nat'), addApp(x, b), addApp(b, x)),
                ),
              ),
              // base: add(0, b) = b, add(b, 0) = b (by add-zero-right)
              // Need Equal(Nat, add(Zero, b), add(b, Zero))
              // add(Zero, b) = b (by definition)
              // add(b, Zero) = b (by add-zero-right)
              // So need: Equal(Nat, b, add(b, Zero))
              // = sym(add-zero-right(b))
              app(
                app(
                  app(
                    app(ref('sym'), ref('Nat')),
                    addApp(b, ref('Zero')),
                  ),
                  b,
                ),
                app(ref('add-zero-right'), b),
              ),
            ),
            // step: \pred \ih -> ...
            lam('pred', pred =>
              lam('ih', ih => {
                // ih : Equal(Nat, add(pred, b), add(b, pred))
                // cong Succ ih : Equal(Nat, Succ(add(pred, b)), Succ(add(b, pred)))
                const congSuccIh: Term = app(
                  app(
                    { form: 'ins', val: ih },
                    lam('y', y =>
                      EqualApp(
                        ref('Nat'),
                        app(ref('Succ'), addApp(pred, b)),
                        app(ref('Succ'), y),
                      ),
                    ),
                  ),
                  reflApp(
                    ref('Nat'),
                    app(ref('Succ'), addApp(pred, b)),
                  ),
                )

                // add-succ-right(b, pred) : Equal(Nat, add(b, Succ(pred)), Succ(add(b, pred)))
                const asr: Term = app(
                  app(ref('add-succ-right'), b),
                  pred,
                )

                // sym(asr) : Equal(Nat, Succ(add(b, pred)), add(b, Succ(pred)))
                const symAsr: Term = app(
                  app(
                    app(app(ref('sym'), ref('Nat')), addApp(b, app(ref('Succ'), pred))),
                    app(ref('Succ'), addApp(b, pred)),
                  ),
                  asr,
                )

                // trans(congSuccIh, symAsr) : Equal(Nat, Succ(add(pred, b)), add(b, Succ(pred)))
                return app(
                  app(
                    app(
                      app(
                        app(
                          app(ref('trans'), ref('Nat')),
                          app(ref('Succ'), addApp(pred, b)),
                        ),
                        app(ref('Succ'), addApp(b, pred)),
                      ),
                      addApp(b, app(ref('Succ'), pred)),
                    ),
                    congSuccIh,
                  ),
                  symAsr,
                )
              }),
            ),
          ),
        ),
      )

      const addCommType: Term = all('a', ref('Nat'), a =>
        all('b', ref('Nat'), b =>
          EqualApp(ref('Nat'), addApp(a, b), addApp(b, a)),
        ),
      )

      book.set('add-comm', ann(addCommTerm, addCommType))

      const result = check({ term: ref('add-comm'), book })
      expect(result).not.toBeNull()
      if (result === null) {
        expect.fail('add-comm proof failed to type-check')
      }
    })
  })
})
