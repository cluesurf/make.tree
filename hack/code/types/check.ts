import {
  Ctr,
  Var,
  All,
  Lam,
  SetType,
  App,
  Ann,
  Slf,
  Ins,
  ADT,
  Con,
  Mat,
  Swi,
  Let,
  Use,
  Op2,
  MapType,
  KVs,
  Get,
  Put,
  Lst,
  Src,
  Log,
  TRet,
  TExt,
  Bnd,
  Met,
  Ref,
  Num,
  Txt,
  Nat,
  Sub,
  Hol,
  Error,
  Cod,
  Term,
  U64,
  F64,
  Flt,
  Nil,
  Done,
  Tele,
  Oper,
  Found,
} from '.'
import {
  envFail,
  envGetBook,
  envGetFill,
  envLog,
  Env,
  envSusp,
  envTakeSusp,
} from './env'
import { reduce } from './reduce'
import { equal, incompatible, replace } from './equal'
import {
  checkValidType,
  getDatIndices,
  getOpReturnType,
  getType,
  teleToTerms,
  teleToType,
} from './util'

// Type-Checking
// -------------

// Modes:
// - sus=True  : suspended checks on / better unification / won't return annotated term
// - sus=False : suspended checks off / worse unification / will return annotated term

export function infer(
  sus: boolean,
  src: Cod | null,
  term: Term,
  dep: number,
): Env<Term> {
  return go(term)

  function go(term: Term): Env<Term> {
    switch (term.tag) {
      case 'All': {
        return envGetBook().bind(book =>
          checkLater(sus, src, term.paramType, new SetType(), dep).bind(
            inpA =>
              checkLater(
                sus,
                src,
                term.bodyFn(
                  new Ann(
                    false,
                    new Var(term.name, dep),
                    term.paramType,
                  ),
                ),
                new SetType(),
                dep + 1,
              ).bind(
                bodA =>
                  new Env(state => ({
                    state,
                    tag: 'Done',
                    value: new Ann(
                      false,
                      new All(term.name, inpA, x => bodA),
                      new SetType(),
                    ),
                  })),
              ),
          ),
        )
      }

      case 'App': {
        return infer(sus, src, term.func, dep).bind(funA =>
          envGetBook().bind(book =>
            envGetFill().bind(fill => {
              const reduced = reduce(book, fill, 2, getType(funA))
              if (reduced.tag === 'All') {
                return checkLater(
                  sus,
                  src,
                  term.arg,
                  reduced.paramType,
                  dep,
                ).bind(
                  argA =>
                    new Env(state => ({
                      state,
                      tag: 'Done',
                      value: new Ann(
                        false,
                        new App(funA, argA),
                        reduced.bodyFn(term.arg),
                      ),
                    })),
                )
              } else {
                return envLog(
                  new Error(
                    src,
                    new Ref('function'),
                    getType(funA),
                    term,
                    dep,
                  ),
                ).bind(() => envFail())
              }
            }),
          ),
        )
      }

      case 'Ann': {
        if (term.flag) {
          return check(sus, src, term.expr, term.type, dep)
        }
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, term.expr, term.type),
        }))
      }

      case 'Slf': {
        return checkLater(
          sus,
          src,
          term.paramType,
          new SetType(),
          dep,
        ).bind(typA =>
          checkLater(
            sus,
            src,
            term.bodyFn(
              new Ann(false, new Var(term.name, dep), term.paramType),
            ),
            new SetType(),
            dep + 1,
          ).bind(
            bodA =>
              new Env(state => ({
                state,
                tag: 'Done',
                value: new Ann(
                  false,
                  new Slf(term.name, typA, x => bodA),
                  new SetType(),
                ),
              })),
          ),
        )
      }

      case 'Ins': {
        return infer(sus, src, term.term, dep).bind(valA =>
          envGetBook().bind(book =>
            envGetFill().bind(fill => {
              const reduced = reduce(book, fill, 2, getType(valA))
              if (reduced.tag === 'Slf') {
                return new Env(state => ({
                  state,
                  tag: 'Done',
                  value: new Ann(
                    false,
                    new Ins(valA),
                    reduced.bodyFn(new Ins(valA)),
                  ),
                }))
              } else {
                return envLog(
                  new Error(
                    src,
                    new Ref('Self'),
                    getType(valA),
                    term,
                    dep,
                  ),
                ).bind(() => envFail())
              }
            }),
          ),
        )
      }

      case 'Ref': {
        return envGetBook().bind(book => {
          const val = book.get(term.name)
          if (val) {
            return infer(sus, src, val, dep).bind(
              valA =>
                new Env(state => ({
                  state,
                  tag: 'Done',
                  value: new Ann(
                    false,
                    new Ref(term.name),
                    getType(valA),
                  ),
                })),
            )
          } else {
            return envLog(
              new Error(
                src,
                new Ref('expression'),
                new Ref('undefined'),
                term,
                dep,
              ),
            ).bind(() => envFail())
          }
        })
      }

      case 'Set':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, new SetType(), new SetType()),
        }))

      case 'U64':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, new U64(), new SetType()),
        }))

      case 'F64':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, new F64(), new SetType()),
        }))

      case 'Num':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, new Num(term.value), new U64()),
        }))

      case 'Flt':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, new Flt(term.value), new F64()),
        }))

      case 'Op2': {
        return infer(sus, src, term.left, dep).bind(fstT =>
          infer(sus, src, term.right, dep).bind(sndT => {
            const validTypes = [new F64(), new U64()]
            return checkValidType(getType(fstT), validTypes, dep).bind(
              isValidType => {
                if (!isValidType) {
                  return envLog(
                    new Error(
                      src,
                      new Ref('Valid numeric type'),
                      getType(fstT),
                      term,
                      dep,
                    ),
                  ).bind(() => envFail())
                }
                return equal(getType(fstT), getType(sndT), dep).bind(
                  typesEqual => {
                    if (!typesEqual) {
                      return envLog(
                        new Error(
                          src,
                          getType(fstT),
                          getType(sndT),
                          term,
                          dep,
                        ),
                      ).bind(() => envFail())
                    }
                    return envGetBook().bind(book =>
                      envGetFill().bind(fill => {
                        const reducedFst = reduce(
                          book,
                          fill,
                          1,
                          getType(fstT),
                        )
                        const returnType = getOpReturnType(
                          term.operator,
                          reducedFst,
                        )
                        return new Env(state => ({
                          state,
                          tag: 'Done',
                          value: new Ann(
                            false,
                            new Op2(term.operator, fstT, sndT),
                            returnType,
                          ),
                        }))
                      }),
                    )
                  },
                )
              },
            )
          }),
        )
      }

      case 'Swi':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('switch'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Map':
        return checkLater(
          sus,
          src,
          term.elemType,
          new SetType(),
          dep,
        ).bind(
          typA =>
            new Env(state => ({
              state,
              tag: 'Done',
              value: new Ann(false, new MapType(typA), new SetType()),
            })),
        )

      case 'KVs': {
        return infer(sus, src, term.defaultValue, dep).bind(dftA => {
          const entries = Array.from(term.entries.entries())
          return entries
            .reduce<Env<Array<[number, Term]>>>(
              (acc, [key, val]) =>
                acc.bind(results =>
                  check(sus, src, val, getType(dftA), dep).bind(
                    valA =>
                      new Env(
                        state =>
                          new Done(state, [
                            ...results,
                            [key, valA] as [number, Term],
                          ]),
                      ),
                  ),
                ),
              new Env(
                state => new Done(state, [] as Array<[number, Term]>),
              ),
            )
            .bind(
              kvsA =>
                new Env(
                  state =>
                    new Done(
                      state,
                      new Ann(
                        false,
                        new KVs(new Map(kvsA), dftA),
                        new MapType(getType(dftA)),
                      ),
                    ),
                ),
            )
        })
      }

      case 'Get':
        return infer(sus, src, term.map, dep).bind(mapA =>
          envGetBook().bind(book =>
            envGetFill().bind(fill => {
              const reduced = reduce(book, fill, 2, getType(mapA))
              if (reduced.tag === 'Map') {
                const got_ann = new Ann(
                  false,
                  new Var(term.got, dep),
                  reduced.elemType,
                )
                const nam_ann = new Ann(
                  false,
                  new Var(term.name, dep),
                  new MapType(reduced.elemType),
                )
                return check(sus, src, term.key, new U64(), dep).bind(
                  keyA =>
                    infer(
                      sus,
                      src,
                      term.bodyFn(got_ann, nam_ann),
                      dep,
                    ).bind(
                      bodA =>
                        new Env(state => ({
                          state,
                          tag: 'Done',
                          value: new Ann(
                            false,
                            new Get(
                              term.got,
                              term.name,
                              mapA,
                              keyA,
                              (g, m) => bodA,
                            ),
                            getType(bodA),
                          ),
                        })),
                    ),
                )
              } else {
                return envLog(
                  new Error(
                    src,
                    new Ref('Map'),
                    getType(mapA),
                    term,
                    dep,
                  ),
                ).bind(() => envFail())
              }
            }),
          ),
        )

      case 'Put':
        return infer(sus, src, term.map, dep).bind(mapA =>
          envGetBook().bind(book =>
            envGetFill().bind(fill => {
              const reduced = reduce(book, fill, 2, getType(mapA))
              if (reduced.tag === 'Map') {
                return check(
                  sus,
                  src,
                  term.value,
                  reduced.elemType,
                  dep,
                ).bind(valA => {
                  const got_ann = new Ann(
                    false,
                    new Var(term.got, dep),
                    reduced.elemType,
                  )
                  const nam_ann = new Ann(
                    false,
                    new Var(term.name, dep),
                    new MapType(reduced.elemType),
                  )
                  return check(sus, src, term.key, new U64(), dep).bind(
                    keyA =>
                      infer(
                        sus,
                        src,
                        term.bodyFn(got_ann, nam_ann),
                        dep,
                      ).bind(
                        bodA =>
                          new Env(state => ({
                            state,
                            tag: 'Done',
                            value: new Ann(
                              false,
                              new Put(
                                term.got,
                                term.name,
                                mapA,
                                keyA,
                                valA,
                                (g, m) => bodA,
                              ),
                              getType(bodA),
                            ),
                          })),
                      ),
                  )
                })
              } else {
                return envLog(
                  new Error(
                    src,
                    new Ref('Map'),
                    getType(mapA),
                    term,
                    dep,
                  ),
                ).bind(() => envFail())
              }
            }),
          ),
        )

      case 'Let':
        return infer(sus, src, term.value, dep).bind(valA =>
          infer(
            sus,
            src,
            term.bodyFn(
              new Ann(false, new Var(term.name, dep), getType(valA)),
            ),
            dep,
          ).bind(
            bodA =>
              new Env(
                state =>
                  new Done(
                    state,
                    new Ann(
                      false,
                      new Let(term.name, valA, x => bodA),
                      getType(bodA),
                    ),
                  ),
              ),
          ),
        )

      case 'Use':
        return infer(sus, src, term.bodyFn(term.value), dep)

      case 'ADT': {
        return term.constructors
          .reduce<Env<void>>(
            (acc, ctr) =>
              acc.bind(() =>
                checkTele(sus, src, ctr.tele, new SetType(), dep).bind(
                  () => new Env(state => new Done(state, undefined)),
                ),
              ),
            new Env(state => new Done(state, undefined)),
          )
          .bind(
            () =>
              new Env(
                state =>
                  new Done(state, new Ann(false, term, new SetType())),
              ),
          )
      }

      case 'Con':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('constructor'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Mat':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('match'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Lam':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('lambda'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Hol':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('hole'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Met':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('meta'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Log':
        return infer(sus, src, term.message, dep).bind(msgA =>
          infer(sus, src, term.next, dep).bind(
            nxtA =>
              new Env(state => ({
                state,
                tag: 'Done',
                value: new Ann(
                  false,
                  new Log(msgA, nxtA),
                  getType(nxtA),
                ),
              })),
          ),
        )

      case 'Var':
        return envLog(
          new Error(
            src,
            new Ref('annotation'),
            new Ref('variable'),
            term,
            dep,
          ),
        ).bind(() => envFail())

      case 'Src':
        return infer(sus, src ? src : null, term.term, dep)

      case 'Txt':
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, term, new Ref('String')),
        }))

      case 'Nat': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => go(reduce(book, fill, 2, term))),
        )
      }

      case 'Lst': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => go(reduce(book, fill, 2, term))),
        )
      }

      default:
        return envFail()
    }
  }
}

export function check(
  sus: boolean,
  src: Cod | null,
  term: Term,
  typx: Term,
  dep: number,
): Env<Term> {
  // return debug(
  //   `check`,
  // `check:${sus ? '* ' : ' '}${showTermGo(
  //   false,
  //   term,
  //   dep,
  // )}\n    :: ${showTermGo(true, typx, dep)}`,
  // go(term),
  // )
  return go(term)

  function go(term: Term): Env<Term> {
    switch (term.tag) {
      case 'App': {
        if (term.func.tag === 'Src') {
          return go(new App(term.func.term, term.arg))
        }

        if (term.func.tag === 'Mat') {
          return infer(sus, src, term.arg, dep).bind(argA =>
            infer(
              sus,
              src,
              new App(
                new Ann(
                  true,
                  new Mat((term.func as Mat).cases),
                  new All('x', getType(argA), x =>
                    replace(term.arg, x, typx, dep),
                  ),
                ),
                term.arg,
              ),
              dep,
            ),
          )
        }

        if (term.func.tag === 'Swi') {
          return infer(sus, src, term.arg, dep).bind(argA =>
            infer(
              sus,
              src,
              new App(
                new Ann(
                  true,
                  new Swi(
                    (term.func as Swi).zero,
                    (term.func as Swi).succ,
                  ),
                  new All('x', getType(argA), x =>
                    replace(term.arg, x, typx, dep),
                  ),
                ),
                term.arg,
              ),
              dep,
            ),
          )
        }
        // Continue with default case...
      }

      case 'Lam': {
        const termLam = term as Lam
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'All') {
              const ann = new Ann(
                false,
                new Var(termLam.name, dep),
                reducedType.paramType,
              )
              return check(
                sus,
                src,
                termLam.bodyFn(ann),
                reducedType.bodyFn(ann),
                dep + 1,
              ).bind(
                bodA =>
                  new Env(state => ({
                    state,
                    tag: 'Done',
                    value: new Ann(
                      false,
                      new Lam(termLam.name, x => bodA),
                      typx,
                    ),
                  })),
              )
            } else {
              return infer(
                sus,
                src,
                new Lam(termLam.name, termLam.bodyFn),
                dep,
              )
            }
          }),
        )
      }

      case 'Ins': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'Slf') {
              return check(
                sus,
                src,
                term.term,
                reducedType.bodyFn(new Ins(term.term)),
                dep,
              ).bind(
                valA =>
                  new Env(state => ({
                    state,
                    tag: 'Done',
                    value: new Ann(false, new Ins(valA), typx),
                  })),
              )
            } else {
              return infer(sus, src, new Ins(term.term), dep)
            }
          }),
        )
      }

      case 'Con': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'ADT') {
              const constructor = reducedType.constructors.find(
                c => c.name === term.name,
              )
              if (constructor) {
                return checkConstructor(
                  src,
                  term.params,
                  constructor.tele,
                  dep,
                ).bind(
                  argA =>
                    new Env(state => ({
                      state,
                      tag: 'Done',
                      value: new Ann(
                        false,
                        new Con(term.name, argA),
                        typx,
                      ),
                    })),
                )
              } else {
                return envLog(
                  new Error(
                    src,
                    new Hol(`constructor_not_found:${term.name}`, []),
                    new Hol('unknown_type', []),
                    term,
                    dep,
                  ),
                ).bind(() => envFail())
              }
            } else {
              return infer(sus, src, term, dep)
            }
          }),
        )
      }
      case 'Mat': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'All') {
              const reducedInput = reduce(
                book,
                fill,
                2,
                reducedType.paramType,
              )
              if (reducedInput.tag === 'ADT') {
                // Create constructor map
                const adtCtsMap = new Map<string, Tele>()

                reducedInput.constructors.forEach(ctr => {
                  adtCtsMap.set(ctr.name, ctr.tele)
                })

                const coveredCases = new Map<string, Term>()
                term.cases.forEach(c => {
                  coveredCases.set(c.name, c.value)
                })

                // Check each case
                const checkCases = term.cases.map(cse => {
                  if (cse.name === '_') {
                    const uncoveredCases = Array.from(
                      adtCtsMap.keys(),
                    ).filter(k => !coveredCases.has(k))
                    if (uncoveredCases.length === 0) {
                      return checkUnreachable(
                        null,
                        cse.name,
                        cse.value,
                        dep,
                      )
                    } else {
                      return check(
                        sus,
                        src,
                        cse.value,
                        new All(
                          '',
                          reducedType.paramType,
                          reducedType.bodyFn,
                        ),
                        dep,
                      ).bind(
                        cBodA =>
                          new Env(state => ({
                            state,
                            tag: 'Done',
                            value: [cse.name, cBodA] as [string, Term],
                          })),
                      )
                    }
                  } else {
                    const cTel = adtCtsMap.get(cse.name)

                    if (cTel) {
                      const [args, ret] = teleToTerms(cTel, dep)
                      const inputIndices = getDatIndices(
                        reduce(book, fill, 2, reducedType.paramType),
                      )
                      const returnIndices = getDatIndices(
                        reduce(book, fill, 2, ret),
                      )
                      const eqs = inputIndices.map((a, i) => [
                        a,
                        returnIndices[i],
                      ])

                      let rt0 = teleToType(
                        cTel,
                        reducedType.bodyFn(
                          new Ann(
                            false,
                            new Con(cse.name, args),
                            reducedType.paramType,
                          ),
                        ),
                        dep,
                      )

                      const rt1 = eqs.reduce(
                        (ty, [a, b]) => replace(a!, b!, ty, dep),
                        rt0,
                      )

                      if (
                        eqs.some(([a, b]) => incompatible(a!, b!, dep))
                      ) {
                        return checkUnreachable(
                          null,
                          cse.name,
                          cse.value,
                          dep,
                        )
                      } else {
                        return check(
                          sus,
                          src,
                          cse.value,
                          rt1,
                          dep,
                        ).bind(
                          cBodA =>
                            new Env(state => ({
                              state,
                              tag: 'Done',
                              value: [cse.name, cBodA] as [
                                string,
                                Term,
                              ],
                            })),
                        )
                      }
                    } else {
                      return envLog(
                        new Error(
                          src,
                          new Hol(
                            `constructor_not_found:${cse.name}`,
                            [],
                          ),
                          new Hol('unknown_type', []),
                          term,
                          dep,
                        ),
                      ).bind(() => envFail())
                    }
                  }
                })

                // Check coverage
                return sequence(checkCases).bind(checkedCases => {
                  // Verify all constructors are covered
                  const missingCase = reducedInput.constructors.find(
                    ctr =>
                      !coveredCases.has(ctr.name) &&
                      !coveredCases.has('_'),
                  )
                  if (missingCase) {
                    return envLog(
                      new Error(
                        src,
                        new Hol(`missing_case:${missingCase.name}`, []),
                        new Hol('incomplete_match', []),
                        term,
                        dep,
                      ),
                    ).bind(() => envFail())
                  }

                  return new Env(state => ({
                    state,
                    tag: 'Done',
                    value: new Ann(
                      false,
                      new Mat(
                        checkedCases.map(
                          ({ name, value }) => new Bnd(name, value),
                        ),
                      ),
                      typx,
                    ),
                  }))
                })
              }
            }
            return infer(sus, src, term, dep)
          }),
        )
      }
      case 'Swi': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'All') {
              const reducedInput = reduce(
                book,
                fill,
                2,
                reducedType.paramType,
              )
              if (reducedInput.tag === 'U64') {
                // Check zero case
                const zerAnn = new Ann(false, new Num(0), new U64())
                return check(
                  sus,
                  src,
                  term.zero,
                  reducedType.bodyFn(zerAnn),
                  dep,
                ).bind(zerA => {
                  // Check successor case
                  const sucAnn = new Ann(
                    false,
                    new Var('n', dep),
                    new U64(),
                  )
                  const sucTyp = new All('n', new U64(), x =>
                    reducedType.bodyFn(
                      new Op2(Oper.ADD, new Num(1), x),
                    ),
                  )
                  return check(sus, src, term.succ, sucTyp, dep).bind(
                    sucA =>
                      new Env(state => ({
                        state,
                        tag: 'Done',
                        value: new Ann(
                          false,
                          new Swi(zerA, sucA),
                          typx,
                        ),
                      })),
                  )
                })
              }
            }
            return infer(sus, src, term, dep)
          }),
        )
      }

      case 'KVs': {
        return envGetBook().bind(book =>
          envGetFill().bind(fill => {
            const reducedType = reduce(book, fill, 2, typx)
            if (reducedType.tag === 'Map') {
              return check(
                sus,
                src,
                term.defaultValue,
                reducedType.elemType,
                dep,
              ).bind(dftA => {
                const entries = Array.from(term.entries.entries())
                return entries
                  .reduce<Env<Array<[number, Term]>>>(
                    (acc, [key, val]) =>
                      acc.bind(results =>
                        check(
                          sus,
                          src,
                          val,
                          reducedType.elemType,
                          dep,
                        ).bind(
                          valA =>
                            new Env(
                              state =>
                                new Done(state, [
                                  ...results,
                                  [key, valA] as [number, Term],
                                ]),
                            ),
                        ),
                      ),
                    new Env(
                      state =>
                        new Done(state, [] as Array<[number, Term]>),
                    ),
                  )
                  .bind(
                    kvsA =>
                      new Env(
                        state =>
                          new Done(
                            state,
                            new Ann(
                              false,
                              new KVs(new Map(kvsA), dftA),
                              typx,
                            ),
                          ),
                      ),
                  )
              })
            }
            return infer(sus, src, term, dep)
          }),
        )
      }

      case 'Hol': {
        return envLog(new Found(dep, term.name, typx, term.terms)).bind(
          () =>
            new Env(state => ({
              state,
              tag: 'Done',
              value: new Ann(false, term, typx),
            })),
        )
      }

      case 'Met': {
        return new Env(state => ({
          state,
          tag: 'Done',
          value: new Ann(false, term, typx),
        }))
      }

      case 'Ann': {
        if (term.flag) {
          return cmp(src, term.expr, term.type, typx, dep).bind(() =>
            check(sus, src, term.expr, term.type, dep),
          )
        }
        return cmp(src, term.expr, term.type, typx, dep).bind(
          () =>
            new Env(state => ({
              state,
              tag: 'Done',
              value: new Ann(false, term.expr, term.type),
            })),
        )
      }

      case 'Src': {
        return check(sus, src ? src : null, term.term, typx, dep)
      }

      default: {
        return infer(sus, src, term, dep).bind(termA =>
          cmp(src, term, typx, getType(termA), dep).bind(() => termA),
        )
      }
    }
  }

  function cmp(
    src: Cod | null,
    term: Term,
    expected: Term,
    detected: Term,
    dep: number,
  ): Env<void> {
    return equal(expected, detected, dep).bind(isEqual => {
      if (isEqual) {
        return envTakeSusp().bind(susp =>
          sequence(
            susp.map(({ src, actual, code, count }) =>
              check(sus, src, actual, code, count),
            ),
          ).bind(
            () =>
              new Env(state => ({
                state,
                tag: 'Done',
                value: undefined,
              })),
          ),
        )
      } else {
        return envLog(
          new Error(src, expected, detected, term, dep),
        ).bind(() => envFail())
      }
    })
  }

  function checkConstructor(
    src: Cod | null,
    args: Array<Bnd>,
    tele: Tele,
    dep: number,
  ): Env<Array<Bnd>> {
    if (tele.tag === 'TRet') {
      if (args.length === 0) {
        return cmp(src, term, tele.term, typx, dep).bind(
          () =>
            new Env(state => ({
              state,
              tag: 'Done',
              value: [],
            })),
        )
      } else {
        return envLog(
          new Error(
            src,
            new Hol('arity_mismatch', []),
            new Hol('unknown_type', []),
            new Hol('constructor', []),
            dep,
          ),
        ).bind(() => envFail())
      }
    }

    if (args.length === 0) {
      return envLog(
        new Error(
          src,
          new Hol('arity_mismatch', []),
          new Hol('unknown_type', []),
          new Hol('constructor', []),
          dep,
        ),
      ).bind(() => envFail())
    }

    const [arg, ...restArgs] = args
    if (arg.name !== null && arg.name !== tele.name) {
      return envLog(
        new Error(
          src,
          new Hol(`expected:${tele.name}`, []),
          new Hol(`detected:${arg.name}`, []),
          new Hol('field_mismatch', []),
          dep,
        ),
      ).bind(() => envFail())
    }

    return check(sus, src, arg.value, tele.paramType, dep).bind(argA =>
      checkConstructor(
        src,
        restArgs,
        tele.bodyFn(arg.value),
        dep + 1,
      ).bind(
        restArgsA =>
          new Env(state => ({
            state,
            tag: 'Done',
            value: [new Bnd(arg.name, argA), ...restArgsA],
          })),
      ),
    )
  }

  function checkUnreachable(
    src: Cod | null,
    name: string,
    body: Term,
    dep: number,
  ): Env<[string, Term]> {
    // This typically would log a warning that the case is unreachable
    // For now just return the case unchanged
    return new Env(state => ({
      state,
      tag: 'Done',
      value: [name, body],
    }))
  }

  function sequence<T>(envs: Array<Env<T>>): Env<Array<T>> {
    return envs.reduce(
      (acc, curr) =>
        acc.bind(results =>
          curr.bind(
            result =>
              new Env(state => ({
                state,
                tag: 'Done',
                value: [...results, result],
              })),
          ),
        ),
      new Env(state => ({ state, tag: 'Done', value: [] as Array<T> })),
    )
  }
}

// Checks telescope types
export function checkTele(
  sus: boolean,
  src: Cod | null,
  tele: Tele,
  typ: Term,
  dep: number,
): Env<Tele> {
  if (tele.tag === 'TRet') {
    return check(sus, src, tele.term, typ, dep).bind(
      termA =>
        new Env(state => ({
          state,
          tag: 'Done',
          value: new TRet(termA),
        })),
    )
  } else {
    return check(sus, src, tele.paramType, new SetType(), dep).bind(
      inpA =>
        checkTele(
          sus,
          src,
          tele.bodyFn(
            new Ann(false, new Var(tele.name, dep), tele.paramType),
          ),
          typ,
          dep + 1,
        ).bind(
          bodA =>
            new Env(state => ({
              state,
              tag: 'Done',
              value: new TExt(tele.name, inpA, x => bodA),
            })),
        ),
    )
  }
}

// Checks unreachable pattern matches
export function checkUnreachable(
  src: Cod | null,
  cNam: string,
  term: Term,
  dep: number,
): Env<[string, Term]> {
  function go(
    src: Cod | null,
    cNam: string,
    term: Term,
    dep: number,
  ): Env<[string, Term]> {
    switch (term.tag) {
      case 'Lam':
        return go(src, cNam, term.bodyFn(new Con('void', [])), dep + 1)

      case 'Let':
        return go(src, cNam, term.bodyFn(new Con('void', [])), dep + 1)

      case 'Use':
        return go(src, cNam, term.bodyFn(new Con('void', [])), dep + 1)

      case 'Src':
        return go(term.code, cNam, term.term, dep)

      case 'Hol':
        return envLog(
          new Found(
            dep,
            term.name,
            new Hol('unreachable', []),
            term.terms,
          ),
        ).bind(() => go(src, cNam, new SetType(), dep))

      default:
        return new Env(state => ({
          state,
          tag: 'Done',
          value: [cNam, new Ann(false, new SetType(), new U64())],
        }))
    }
  }

  return go(src, cNam, term, dep)
}

// Checks terms that may need to be checked later
export function checkLater(
  sus: boolean,
  src: Cod | null,
  term: Term,
  typx: Term,
  dep: number,
): Env<Term> {
  if (!sus) {
    return check(false, src, term, typx, dep)
  }
  return envSusp(new Check(src, term, typx, dep)).bind(
    () =>
      new Env(state => ({
        state,
        tag: 'Done',
        value: new Met(0, []),
      })),
  )
}

// Checks a term in a specific checking mode
export function doCheckMode(sus: boolean, term: Term): Env<Term> {
  switch (term.tag) {
    case 'Ann':
      return check(sus, null, term.type, new SetType(), 0).bind(() =>
        check(sus, null, term.expr, term.type, 0),
      )

    case 'Src':
      return doCheckMode(sus, term.term)

    case 'Ref':
      return envGetBook().bind(book => {
        const val = book.get(term.name)
        if (val) {
          return doCheckMode(sus, val)
        }
        return envLog(
          new Error(
            null,
            new Ref('expression'),
            new Ref('undefined'),
            term,
            0,
          ),
        ).bind(() => envFail())
      })

    default:
      return infer(true, null, term, 0)
  }
}

// Main checking function
export function doCheck(term: Term): Env<Term> {
  return doCheckMode(true, term)
}

// Annotates a term with its inferred types
export function doAnnotate(term: Term): Env<[Term, Fill]> {
  return doCheckMode(true, term)
    .bind(() => doCheckMode(false, term))
    .bind(checkedTerm =>
      envGetFill().bind(
        fill =>
          new Env(state => ({
            state,
            tag: 'Done',
            value: [bind(checkedTerm, []), fill] as [Term, Fill],
          })),
      ),
    )
}
