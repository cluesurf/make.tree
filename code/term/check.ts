/**
 * Bidirectional type checker with self-types.
 *
 * Modeled after Kind's Check.hs. Uses two modes:
 * - infer: determine the type of a term, return annotated term
 * - check: verify a term has a given type, return annotated term
 *
 * The checker returns Ann nodes: { form: 'ann', done: false, val, typ }
 * where typ is the inferred/checked type.
 *
 * Supports suspended checks (sus mode) for better metavar unification.
 * In sus mode, type checks are deferred until metavars are solved.
 */

import type {
  Term,
  Ctr,
  Tele,
  Book,
  Fill,
  State,
  Info,
  Susp,
} from '@/term/form'
import type { Site } from '@/kink/site'
import type { Env } from '@/term/env'
import {
  envPure,
  envBind,
  envFail,
  envRun,
  envInit,
  envLog,
  envGetBook,
  envGetFill,
  envSusp,
  envTakeSusp,
} from '@/term/env'
import { reduce } from '@/term/reduce'
import { equal } from '@/term/equal'

/** Extract the type from an annotated term. */
function getType(term: Term): Term {
  if (term.form === 'ann') return term.typ
  return { form: 'hol', name: 'unknown', ctx: [] }
}

/** Make an annotation node. */
function ann(input: { val: Term; typ: Term }): Term {
  return { form: 'ann', done: false, val: input.val, typ: input.typ }
}

/**
 * Type-check a top-level definition.
 * Entry point: checks Ann(val, typ) or infers standalone terms.
 */
export function check(input: {
  term: Term
  book: Book
}): { state: State; value: Term } | null {
  const state = envInit({ book: input.book })
  return envRun({
    env: checkGo({ sus: true, term: input.term }),
    state,
  })
}

/** Inner entry for check. */
function checkGo(input: { sus: boolean; term: Term }): Env<Term> {
  const { sus, term } = input
  switch (term.form) {
    case 'ann':
      return envBind({
        env: verify({
          sus,
          src: null,
          term: term.typ,
          typx: { form: 'set' },
          dep: 0,
        }),
        fn: () =>
          verify({
            sus,
            src: null,
            term: term.val,
            typx: term.typ,
            dep: 0,
          }),
      })
    case 'src':
      return checkGo({ sus, term: term.val })
    case 'ref':
      return envBind({
        env: envGetBook(),
        fn: book => {
          const def = book.get(term.name)
          if (def) return checkGo({ sus, term: def })
          return envBind({
            env: envLog({
              form: 'error',
              site: null,
              need: { form: 'ref', name: 'expression' },
              have: { form: 'ref', name: 'undefined' },
              term,
              dep: 0,
            }),
            fn: () => envFail<Term>(),
          })
        },
      })
    default:
      return infer({ sus: true, src: null, term, dep: 0 })
  }
}

/**
 * Infer the type of a term.
 * Returns an annotated term: Ann { val, typ }.
 */
export function infer(input: {
  sus: boolean
  src: Site | null
  term: Term
  dep: number
}): Env<Term> {
  const { sus, src, term, dep } = input

  switch (term.form) {
    case 'all': {
      const inpA = checkLater({
        sus,
        src,
        term: term.inp,
        typx: { form: 'set' },
        dep,
      })
      return envBind({
        env: inpA,
        fn: inpChecked => {
          const bodA = checkLater({
            sus,
            src,
            term: term.bod(
              ann({
                val: { form: 'var', name: term.name, idx: dep },
                typ: term.inp,
              }),
            ),
            typx: { form: 'set' },
            dep: dep + 1,
          })
          return envBind({
            env: bodA,
            fn: bodChecked =>
              envPure(
                ann({
                  val: {
                    form: 'all',
                    name: term.name,
                    inp: inpChecked,
                    bod: () => bodChecked,
                  },
                  typ: { form: 'set' },
                }),
              ),
          })
        },
      })
    }

    case 'app': {
      return envBind({
        env: infer({ sus, src, term: term.func, dep }),
        fn: funA =>
          envBind({
            env: envGetBook(),
            fn: book =>
              envBind({
                env: envGetFill(),
                fn: fill => {
                  const funTyp = reduce({
                    book,
                    fill,
                    lv: 2,
                    term: getType(funA),
                  })
                  if (funTyp.form === 'all') {
                    return envBind({
                      env: checkLater({
                        sus,
                        src,
                        term: term.argm,
                        typx: funTyp.inp,
                        dep,
                      }),
                      fn: argA =>
                        envPure(
                          ann({
                            val: {
                              form: 'app',
                              func: funA,
                              argm: argA,
                            },
                            typ: funTyp.bod(term.argm),
                          }),
                        ),
                    })
                  }
                  return envBind({
                    env: envLog({
                      form: 'error',
                      site: src,
                      need: { form: 'ref', name: 'function' },
                      have: getType(funA),
                      term: {
                        form: 'app',
                        func: term.func,
                        argm: term.argm,
                      },
                      dep,
                    }),
                    fn: () => envFail<Term>(),
                  })
                },
              }),
          }),
      })
    }

    case 'ann': {
      if (term.done) {
        return verify({ sus, src, term: term.val, typx: term.typ, dep })
      }
      return envPure(ann({ val: term.val, typ: term.typ }))
    }

    case 'slf': {
      return envBind({
        env: checkLater({
          sus,
          src,
          term: term.typ,
          typx: { form: 'set' },
          dep,
        }),
        fn: typA => {
          const bodA = checkLater({
            sus,
            src,
            term: term.bod(
              ann({
                val: { form: 'var', name: term.name, idx: dep },
                typ: term.typ,
              }),
            ),
            typx: { form: 'set' },
            dep: dep + 1,
          })
          return envBind({
            env: bodA,
            fn: bodChecked =>
              envPure(
                ann({
                  val: {
                    form: 'slf',
                    name: term.name,
                    typ: typA,
                    bod: () => bodChecked,
                  },
                  typ: { form: 'set' },
                }),
              ),
          })
        },
      })
    }

    case 'ins': {
      return envBind({
        env: infer({ sus, src, term: term.val, dep }),
        fn: valA =>
          envBind({
            env: envGetBook(),
            fn: book =>
              envBind({
                env: envGetFill(),
                fn: fill => {
                  const valTyp = reduce({
                    book,
                    fill,
                    lv: 2,
                    term: getType(valA),
                  })
                  if (valTyp.form === 'slf') {
                    return envPure(
                      ann({
                        val: { form: 'ins', val: valA },
                        typ: valTyp.bod({ form: 'ins', val: valA }),
                      }),
                    )
                  }
                  return envBind({
                    env: envLog({
                      form: 'error',
                      site: src,
                      need: { form: 'ref', name: 'Self' },
                      have: getType(valA),
                      term: { form: 'ins', val: term.val },
                      dep,
                    }),
                    fn: () => envFail<Term>(),
                  })
                },
              }),
          }),
      })
    }

    case 'ref': {
      return envBind({
        env: envGetBook(),
        fn: book => {
          const def = book.get(term.name)
          if (def) {
            return envBind({
              env: infer({ sus, src, term: def, dep }),
              fn: valA =>
                envPure(ann({ val: term, typ: getType(valA) })),
            })
          }
          return envBind({
            env: envLog({
              form: 'error',
              site: src,
              need: { form: 'ref', name: 'expression' },
              have: { form: 'ref', name: 'undefined' },
              term,
              dep,
            }),
            fn: () => envFail<Term>(),
          })
        },
      })
    }

    case 'set':
      return envPure(
        ann({ val: { form: 'set' }, typ: { form: 'set' } }),
      )

    case 'u64':
      return envPure(
        ann({ val: { form: 'u64' }, typ: { form: 'set' } }),
      )

    case 'f64':
      return envPure(
        ann({ val: { form: 'f64' }, typ: { form: 'set' } }),
      )

    case 'num':
      return envPure(ann({ val: term, typ: { form: 'u64' } }))

    case 'txt':
      return envPure(
        ann({ val: term, typ: { form: 'ref', name: 'String' } }),
      )

    case 'op2': {
      return envBind({
        env: infer({ sus, src, term: term.a, dep }),
        fn: fstA =>
          envBind({
            env: infer({ sus, src, term: term.b, dep }),
            fn: sndA =>
              envBind({
                env: equal({ a: getType(fstA), b: getType(sndA), dep }),
                fn: typesEq => {
                  if (!typesEq) {
                    return envBind({
                      env: envLog({
                        form: 'error',
                        site: src,
                        need: getType(fstA),
                        have: getType(sndA),
                        term: {
                          form: 'op2',
                          oper: term.oper,
                          a: term.a,
                          b: term.b,
                        },
                        dep,
                      }),
                      fn: () => envFail<Term>(),
                    })
                  }
                  const retType = getOpReturnType({
                    oper: term.oper,
                    inputType: getType(fstA),
                  })
                  return envPure(
                    ann({
                      val: {
                        form: 'op2',
                        oper: term.oper,
                        a: fstA,
                        b: sndA,
                      },
                      typ: retType,
                    }),
                  )
                },
              }),
          }),
      })
    }

    case 'let': {
      return envBind({
        env: infer({ sus, src, term: term.val, dep }),
        fn: valA => {
          const varAnn = ann({
            val: { form: 'var', name: term.name, idx: dep },
            typ: getType(valA),
          })
          return envBind({
            env: infer({ sus, src, term: term.bod(varAnn), dep }),
            fn: bodA =>
              envPure(
                ann({
                  val: {
                    form: 'let',
                    name: term.name,
                    val: valA,
                    bod: () => bodA,
                  },
                  typ: getType(bodA),
                }),
              ),
          })
        },
      })
    }

    case 'use':
      return infer({ sus, src, term: term.bod(term.val), dep })

    case 'adt': {
      return envPure(ann({ val: term, typ: { form: 'set' } }))
    }

    case 'log': {
      return envBind({
        env: infer({ sus, src, term: term.msg, dep }),
        fn: msgA =>
          envBind({
            env: infer({ sus, src, term: term.val, dep }),
            fn: nxtA =>
              envPure(
                ann({
                  val: { form: 'log', msg: msgA, val: nxtA },
                  typ: getType(nxtA),
                }),
              ),
          }),
      })
    }

    case 'src':
      return infer({ sus, src: term.site, term: term.val, dep })

    case 'nat': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill =>
              infer({
                sus,
                src,
                term: reduce({ book, fill, lv: 2, term }),
                dep,
              }),
          }),
      })
    }

    case 'lst': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill =>
              infer({
                sus,
                src,
                term: reduce({ book, fill, lv: 2, term }),
                dep,
              }),
          }),
      })
    }

    // Cannot infer these without annotation
    case 'lam':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'lambda' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'con':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'constructor' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'mat':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'match' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'swi':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'switch' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'hol':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'hole' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'met':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'meta' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    case 'var':
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'ref', name: 'annotation' },
          have: { form: 'ref', name: 'variable' },
          term,
          dep,
        }),
        fn: () => envFail<Term>(),
      })

    default:
      return envFail<Term>()
  }
}

/**
 * Verify that a term has a given type.
 * Returns an annotated term.
 */
export function verify(input: {
  sus: boolean
  src: Site | null
  term: Term
  typx: Term
  dep: number
}): Env<Term> {
  const { sus, src, term, typx, dep } = input

  switch (term.form) {
    case 'lam': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const typ = reduce({ book, fill, lv: 2, term: typx })
              if (typ.form === 'all') {
                const varAnn = ann({
                  val: { form: 'var', name: term.name, idx: dep },
                  typ: typ.inp,
                })
                return envBind({
                  env: verify({
                    sus,
                    src,
                    term: term.bod(varAnn),
                    typx: typ.bod(varAnn),
                    dep: dep + 1,
                  }),
                  fn: bodA =>
                    envPure(
                      ann({
                        val: {
                          form: 'lam',
                          name: term.name,
                          bod: () => bodA,
                        },
                        typ: typx,
                      }),
                    ),
                })
              }
              // Fallback to infer
              return inferAndCompare({ sus, src, term, typx, dep })
            },
          }),
      })
    }

    case 'ins': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const typ = reduce({ book, fill, lv: 2, term: typx })
              if (typ.form === 'slf') {
                return envBind({
                  env: verify({
                    sus,
                    src,
                    term: term.val,
                    typx: typ.bod({ form: 'ins', val: term.val }),
                    dep,
                  }),
                  fn: valA =>
                    envPure(
                      ann({
                        val: { form: 'ins', val: valA },
                        typ: typx,
                      }),
                    ),
                })
              }
              return inferAndCompare({ sus, src, term, typx, dep })
            },
          }),
      })
    }

    case 'con': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const typ = reduce({ book, fill, lv: 2, term: typx })
              if (typ.form === 'adt') {
                const ctr = typ.ctrs.find(c => c.name === term.name)
                if (ctr) {
                  return envBind({
                    env: checkConArgs({
                      sus,
                      src,
                      args: term.args,
                      tele: ctr.tele,
                      dep,
                    }),
                    fn: argsA =>
                      envPure(
                        ann({
                          val: {
                            form: 'con',
                            name: term.name,
                            args: argsA,
                          },
                          typ: typx,
                        }),
                      ),
                  })
                }
                return envBind({
                  env: envLog({
                    form: 'error',
                    site: src,
                    need: {
                      form: 'hol',
                      name: `constructor:${term.name}`,
                      ctx: [],
                    },
                    have: { form: 'hol', name: 'not_found', ctx: [] },
                    term,
                    dep,
                  }),
                  fn: () => envFail<Term>(),
                })
              }
              return inferAndCompare({ sus, src, term, typx, dep })
            },
          }),
      })
    }

    case 'mat': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const typ = reduce({ book, fill, lv: 2, term: typx })
              if (typ.form === 'all') {
                const inpTyp = reduce({
                  book,
                  fill,
                  lv: 2,
                  term: typ.inp,
                })
                if (inpTyp.form === 'adt') {
                  return checkMatArms({
                    sus,
                    src,
                    arms: term.arms,
                    ctrs: inpTyp.ctrs,
                    typBod: typ.bod,
                    typInp: typ.inp,
                    dep,
                  })
                }
              }
              return inferAndCompare({ sus, src, term, typx, dep })
            },
          }),
      })
    }

    case 'swi': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const typ = reduce({ book, fill, lv: 2, term: typx })
              if (typ.form === 'all') {
                const inpTyp = reduce({
                  book,
                  fill,
                  lv: 2,
                  term: typ.inp,
                })
                if (inpTyp.form === 'u64') {
                  // zero case: typBod(0)
                  const zerAnn = ann({
                    val: { form: 'num', val: 0 },
                    typ: { form: 'u64' },
                  })
                  return envBind({
                    env: verify({
                      sus,
                      src,
                      term: term.zero,
                      typx: typ.bod(zerAnn),
                      dep,
                    }),
                    fn: zerA => {
                      // succ case: forall(n: U64) typBod(1 + n)
                      const sucTyp: Term = {
                        form: 'all',
                        name: 'n',
                        inp: { form: 'u64' },
                        bod: x =>
                          typ.bod({
                            form: 'op2',
                            oper: 'add',
                            a: { form: 'num', val: 1 },
                            b: x,
                          }),
                      }
                      return envBind({
                        env: verify({
                          sus,
                          src,
                          term: term.succ,
                          typx: sucTyp,
                          dep,
                        }),
                        fn: sucA =>
                          envPure(
                            ann({
                              val: {
                                form: 'swi',
                                zero: zerA,
                                succ: sucA,
                              },
                              typ: typx,
                            }),
                          ),
                      })
                    },
                  })
                }
              }
              return inferAndCompare({ sus, src, term, typx, dep })
            },
          }),
      })
    }

    case 'let': {
      return envBind({
        env: infer({ sus, src, term: term.val, dep }),
        fn: valA => {
          const varAnn = ann({
            val: { form: 'var', name: term.name, idx: dep },
            typ: getType(valA),
          })
          return envBind({
            env: verify({ sus, src, term: term.bod(varAnn), typx, dep }),
            fn: bodA =>
              envPure(
                ann({
                  val: {
                    form: 'let',
                    name: term.name,
                    val: valA,
                    bod: () => bodA,
                  },
                  typ: typx,
                }),
              ),
          })
        },
      })
    }

    case 'use':
      return verify({ sus, src, term: term.bod(term.val), typx, dep })

    case 'hol': {
      return envBind({
        env: envLog({
          form: 'found',
          name: term.name,
          term: typx,
          ctx: term.ctx,
          dep,
        }),
        fn: () => envPure(ann({ val: term, typ: typx })),
      })
    }

    case 'met':
      return envPure(ann({ val: term, typ: typx }))

    case 'log': {
      return envBind({
        env: infer({ sus, src, term: term.msg, dep }),
        fn: msgA =>
          envBind({
            env: verify({ sus, src, term: term.val, typx, dep }),
            fn: nxtA =>
              envPure(
                ann({
                  val: { form: 'log', msg: msgA, val: nxtA },
                  typ: typx,
                }),
              ),
          }),
      })
    }

    case 'ann': {
      if (term.done) {
        return envBind({
          env: compareTypes({
            src,
            expected: term.typ,
            detected: typx,
            term: term.val,
            dep,
          }),
          fn: () =>
            verify({ sus, src, term: term.val, typx: term.typ, dep }),
        })
      }
      return envBind({
        env: compareTypes({
          src,
          expected: term.typ,
          detected: typx,
          term: term.val,
          dep,
        }),
        fn: () => envPure(ann({ val: term.val, typ: term.typ })),
      })
    }

    case 'src':
      return verify({ sus, src: term.site, term: term.val, typx, dep })

    case 'nat': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill =>
              verify({
                sus,
                src,
                term: reduce({ book, fill, lv: 2, term }),
                typx,
                dep,
              }),
          }),
      })
    }

    case 'lst': {
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill =>
              verify({
                sus,
                src,
                term: reduce({ book, fill, lv: 2, term }),
                typx,
                dep,
              }),
          }),
      })
    }

    default:
      return inferAndCompare({ sus, src, term, typx, dep })
  }
}

/** Infer then compare with expected type. Fallback path for check. */
function inferAndCompare(input: {
  sus: boolean
  src: Site | null
  term: Term
  typx: Term
  dep: number
}): Env<Term> {
  const { sus, src, term, typx, dep } = input
  return envBind({
    env: infer({ sus, src, term, dep }),
    fn: termA =>
      envBind({
        env: compareTypes({
          src,
          expected: typx,
          detected: getType(termA),
          term,
          dep,
        }),
        fn: () => envPure(termA),
      }),
  })
}

/** Compare expected and detected types. Log error and fail if not equal. */
function compareTypes(input: {
  src: Site | null
  expected: Term
  detected: Term
  term: Term
  dep: number
}): Env<null> {
  const { src, expected, detected, term, dep } = input
  return envBind({
    env: equal({ a: expected, b: detected, dep }),
    fn: eq => {
      if (eq) {
        // Flush suspended checks
        return envBind({
          env: envTakeSusp(),
          fn: susps => flushSusps(susps),
        })
      }
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: expected,
          have: detected,
          term,
          dep,
        }),
        fn: () => envFail<null>(),
      })
    },
  })
}

/** Re-check all suspended checks. */
function flushSusps(susps: Susp[]): Env<null> {
  if (susps.length === 0) return envPure(null)
  const [first, ...rest] = susps
  return envBind({
    env: verify({
      sus: false,
      src: null,
      term: first!.need,
      typx: first!.have,
      dep: first!.dep,
    }),
    fn: () => flushSusps(rest),
  })
}

/** In sus mode, defer the check. Otherwise, check immediately. */
function checkLater(input: {
  sus: boolean
  src: Site | null
  term: Term
  typx: Term
  dep: number
}): Env<Term> {
  const { sus, src, term, typx, dep } = input
  if (!sus) {
    return verify({ sus: false, src, term, typx, dep })
  }
  return envBind({
    env: envSusp({ need: term, have: typx, dep }),
    fn: () => envPure({ form: 'met', uid: 0, ctx: [] } as Term),
  })
}

/** Check constructor arguments against a telescope. */
function checkConArgs(input: {
  sus: boolean
  src: Site | null
  args: [string | null, Term][]
  tele: Tele
  dep: number
}): Env<[string | null, Term][]> {
  const { sus, src, args, tele, dep } = input

  if (tele.form === 'ret') {
    return envPure([])
  }

  if (args.length === 0) {
    return envBind({
      env: envLog({
        form: 'error',
        site: src,
        need: { form: 'hol', name: 'arity_mismatch', ctx: [] },
        have: { form: 'hol', name: 'too_few_args', ctx: [] },
        term: { form: 'hol', name: 'constructor', ctx: [] },
        dep,
      }),
      fn: () => envFail(),
    })
  }

  const [field, arg] = args[0]!
  const restArgs = args.slice(1)

  return envBind({
    env: verify({ sus, src, term: arg, typx: tele.typ, dep }),
    fn: argA =>
      envBind({
        env: checkConArgs({
          sus,
          src,
          args: restArgs,
          tele: tele.bod(arg),
          dep: dep + 1,
        }),
        fn: restA =>
          envPure([[field, argA] as [string | null, Term], ...restA]),
      }),
  })
}

/** Check match arms against ADT constructors. */
function checkMatArms(input: {
  sus: boolean
  src: Site | null
  arms: [string, Term][]
  ctrs: Ctr[]
  typBod: (x: Term) => Term
  typInp: Term
  dep: number
}): Env<Term> {
  const { sus, src, arms, ctrs, typBod, typInp, dep } = input

  const ctrMap = new Map(ctrs.map(c => [c.name, c]))
  const coveredNames = new Set(arms.map(([name]) => name))

  // Check each arm
  const checkArm = (
    idx: number,
    checked: [string, Term][],
  ): Env<[string, Term][]> => {
    if (idx >= arms.length) return envPure(checked)
    const [name, bod] = arms[idx]!
    const ctr = ctrMap.get(name)

    if (!ctr) {
      // Wildcard or unknown constructor
      if (name === '_') {
        return envBind({
          env: verify({
            sus,
            src,
            term: bod,
            typx: { form: 'all', name: '', inp: typInp, bod: typBod },
            dep,
          }),
          fn: bodA => checkArm(idx + 1, [...checked, [name, bodA]]),
        })
      }
      return envBind({
        env: envLog({
          form: 'error',
          site: src,
          need: { form: 'hol', name: `constructor:${name}`, ctx: [] },
          have: { form: 'hol', name: 'not_found', ctx: [] },
          term: { form: 'mat', arms },
          dep,
        }),
        fn: () => envFail(),
      })
    }

    // Build the type for this arm's body by wrapping tele params around the return type
    const armType = teleToType({
      tele: ctr.tele,
      retType: typBod(
        ann({
          val: {
            form: 'con',
            name,
            args: teleToArgs({ tele: ctr.tele, dep }),
          },
          typ: typInp,
        }),
      ),
      dep,
    })

    return envBind({
      env: verify({ sus, src, term: bod, typx: armType, dep }),
      fn: bodA => checkArm(idx + 1, [...checked, [name, bodA]]),
    })
  }

  return envBind({
    env: checkArm(0, []),
    fn: armsA => {
      // Check coverage: all constructors must be covered (or _ present)
      if (!coveredNames.has('_')) {
        for (const ctr of ctrs) {
          if (!coveredNames.has(ctr.name)) {
            return envBind({
              env: envLog({
                form: 'error',
                site: src,
                need: {
                  form: 'hol',
                  name: `missing_case:${ctr.name}`,
                  ctx: [],
                },
                have: {
                  form: 'hol',
                  name: 'incomplete_match',
                  ctx: [],
                },
                term: { form: 'mat', arms },
                dep,
              }),
              fn: () => envFail<Term>(),
            })
          }
        }
      }
      return envPure(
        ann({
          val: { form: 'mat', arms: armsA },
          typ: { form: 'all', name: '', inp: typInp, bod: typBod },
        }),
      )
    },
  })
}

/** Convert a telescope into a nested All type wrapping a return type. */
function teleToType(input: {
  tele: Tele
  retType: Term
  dep: number
}): Term {
  const { tele, retType, dep } = input
  if (tele.form === 'ret') return retType
  return {
    form: 'all',
    name: tele.name,
    inp: tele.typ,
    bod: x => teleToType({ tele: tele.bod(x), retType, dep: dep + 1 }),
  }
}

/** Generate fresh args from a telescope (for building Con in match checking). */
function teleToArgs(input: {
  tele: Tele
  dep: number
}): [string | null, Term][] {
  if (input.tele.form === 'ret') return []
  const v: Term = { form: 'var', name: input.tele.name, idx: input.dep }
  return [
    [input.tele.name, v],
    ...teleToArgs({ tele: input.tele.bod(v), dep: input.dep + 1 }),
  ]
}

/** Determine the return type of a binary operation. */
function getOpReturnType(input: {
  oper: string
  inputType: Term
}): Term {
  // Comparison ops always return U64 (0 or 1)
  const cmpOps = new Set(['eq', 'ne', 'lt', 'gt', 'lte', 'gte'])
  if (cmpOps.has(input.oper)) return { form: 'u64' }
  return input.inputType
}
