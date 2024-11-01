import {
  Term,
  Book,
  Tele,
  Ctr,
  Oper,
  SetType,
  All,
  Var,
  U64,
  F64,
} from '.'
import { equal } from './equal'
import { Env } from './env'

// Gets dependencies of a term
export function getDeps(term: Term): Array<string> {
  switch (term.tag) {
    case 'Ref':
      return [term.name]
    case 'All':
      return [
        ...getDeps(term.paramType),
        ...getDeps(term.bodyFn(new SetType())),
      ]
    case 'Lam':
      return getDeps(term.bodyFn(new SetType()))
    case 'App':
      return [...getDeps(term.func), ...getDeps(term.arg)]
    case 'Ann':
      return [...getDeps(term.expr), ...getDeps(term.type)]
    case 'Slf':
      return [
        ...getDeps(term.paramType),
        ...getDeps(term.bodyFn(new SetType())),
      ]
    case 'Ins':
      return getDeps(term.term)
    case 'ADT':
      return [
        ...term.indices.flatMap(getDeps),
        ...term.constructors.flatMap(getDepsCtr),
        ...getDeps(term.term),
      ]
    case 'Con':
      return term.params.flatMap(param => getDeps(param.value))
    case 'Mat':
      return term.cases.flatMap(cse => getDeps(cse.value))
    case 'Let':
      return [
        ...getDeps(term.value),
        ...getDeps(term.bodyFn(new SetType())),
      ]
    case 'Use':
      return [
        ...getDeps(term.value),
        ...getDeps(term.bodyFn(new SetType())),
      ]
    case 'Op2':
      return [...getDeps(term.left), ...getDeps(term.right)]
    case 'Swi':
      return [...getDeps(term.zero), ...getDeps(term.succ)]
    case 'Map':
      return getDeps(term.elemType)
    case 'KVs':
      return [
        ...Array.from(term.entries.values()).flatMap(getDeps),
        ...getDeps(term.defaultValue),
      ]
    case 'Get':
      return [
        ...getDeps(term.map),
        ...getDeps(term.key),
        ...getDeps(term.bodyFn(new SetType(), new SetType())),
      ]
    case 'Put':
      return [
        ...getDeps(term.map),
        ...getDeps(term.key),
        ...getDeps(term.value),
        ...getDeps(term.bodyFn(new SetType(), new SetType())),
      ]
    case 'Src':
      return getDeps(term.term)
    case 'Hol':
      return term.terms.flatMap(getDeps)
    case 'Met':
      return term.terms.flatMap(getDeps)
    case 'Log':
      return [...getDeps(term.message), ...getDeps(term.next)]
    case 'Var':
    case 'Set':
    case 'U64':
    case 'F64':
    case 'Num':
    case 'Flt':
    case 'Txt':
    case 'Nat':
      return []
    case 'Lst':
      return term.items.flatMap(getDeps)
    default:
      return []
  }
}

// Gets dependencies of a constructor
function getDepsCtr(ctr: Ctr): Array<string> {
  return getDepsTele(ctr.tele)
}

// Gets dependencies of a telescope
function getDepsTele(tele: Tele): Array<string> {
  if (tele.tag === 'TRet') {
    return getDeps(tele.term)
  } else {
    return [
      ...getDeps(tele.paramType),
      ...getDepsTele(tele.bodyFn(new SetType())),
    ]
  }
}

// Gets all dependencies (direct and indirect) of a term
export function getAllDeps(book: Book, name: string): Set<string> {
  function go(visited: Set<string>, names: Array<string>): Set<string> {
    if (names.length === 0) {
      return visited
    }
    let [_x, ..._xs] = names
    const x = _x!
    const xs = _xs!

    if (visited.has(x)) {
      return go(visited, xs)
    }

    const term = book.get(x)
    if (term) {
      return go(visited.add(x), [...getDeps(term), ...xs])
    }
    return go(visited.add(x), xs)
  }

  return go(new Set(), [name])
}

// Topologically sorts a book
export function topoSortBook(book: Book): Array<[string, Term]> {
  function go(
    mustInclude: Set<string>,
    done: Array<[string, Term]>,
  ): Array<[string, Term]> {
    const name = Array.from(mustInclude)[0]
    if (!name) {
      return done.reverse()
    }

    const [mustInclude_, done_] = include(mustInclude, done, name)
    return go(mustInclude_, done_)
  }

  function include(
    mustInclude: Set<string>,
    done: Array<[string, Term]>,
    name: string,
  ): [Set<string>, Array<[string, Term]>] {
    if (!mustInclude.has(name)) {
      return [mustInclude, done]
    }

    const term = book.get(name)
    if (!term) {
      throw new Error(`unbound:${name}`)
    }

    const deps = getDeps(term)
    const mustInclude_ = new Set(mustInclude)
    mustInclude_.delete(name)

    return includeDeps(mustInclude_, [[name, term], ...done], deps)
  }

  function includeDeps(
    mustInclude: Set<string>,
    done: Array<[string, Term]>,
    deps: Array<string>,
  ): [Set<string>, Array<[string, Term]>] {
    if (deps.length === 0) {
      return [mustInclude, done]
    }
    const [_dep, ..._rest] = deps
    const dep = _dep!
    const rest = _rest!
    const [mustInclude_, done_] = include(mustInclude, done, dep)
    return includeDeps(mustInclude_, done_, rest)
  }

  return go(new Set(book.keys()), [])
}

// Converts telescope to type
export function teleToType(tele: Tele, ret: Term, dep: number): Term {
  if (tele.tag === 'TRet') {
    return ret
  }

  return new All(tele.name, tele.paramType, x =>
    teleToType(tele.bodyFn(x), ret, dep + 1),
  )
}

// Converts telescope to terms
export function teleToTerms(
  tele: Tele,
  dep: number,
): [Array<[string | null, Term]>, Term] {
  function go(
    tele: Tele,
    args: Array<[string | null, Term]>,
    dep: number,
  ): [Array<[string | null, Term]>, Term] {
    if (tele.tag === 'TRet') {
      return [args.reverse(), tele.term]
    }
    return go(
      tele.bodyFn(new Var(tele.name, dep)),
      [[tele.name, new Var(tele.name, dep)], ...args],
      dep + 1,
    )
  }
  return go(tele, [], dep)
}

export function getTeleNames(
  tele: Tele,
  dep: number,
  acc: Array<string> = [],
): Array<string> {
  if (tele.tag === 'TRet') {
    return acc.reverse()
  }
  return getTeleNames(tele.bodyFn(new Var(tele.name, dep)), dep + 1, [
    tele.name,
    ...acc,
  ])
}

export function getDatIndices(term: Term): Array<Term> {
  return term.tag === 'ADT' ? term.indices : []
}

export function getType(term: Term): Term {
  if (term.tag === 'Ann') {
    return term.type
  }
  throw new Error('Not an annotated term')
}

export function getTerm(term: Term): Term {
  if (term.tag === 'Ann') {
    return term.expr
  }
  throw new Error('Not an annotated term')
}

export function getCtrName(ctr: Ctr): string {
  return ctr.name
}

export function getADTCts(term: Term): Array<[string, Ctr]> {
  if (term.tag === 'ADT') {
    return term.constructors.map(ctr => [getCtrName(ctr), ctr])
  }
  if (term.tag === 'Src') {
    return getADTCts(term.term)
  }
  throw new Error(`not-an-adt:${JSON.stringify(term)}`)
}

export function getArgNames(term: Term): Array<string> {
  if (term.tag === 'Ann') {
    return getForallNames(term.type)
  }
  if (term.tag === 'Src') {
    return getArgNames(term.term)
  }
  return []
}

export function getForallNames(term: Term): Array<string> {
  if (term.tag === 'All') {
    return [term.name, ...getForallNames(term.bodyFn(new SetType()))]
  }
  if (term.tag === 'Src') {
    return getForallNames(term.term)
  }
  return []
}

export function getOpReturnType(op: Oper, term: Term): Term {
  if (term.tag === 'U64') {
    switch (op) {
      case Oper.ADD:
      case Oper.SUB:
      case Oper.MUL:
      case Oper.DIV:
      case Oper.MOD:
      case Oper.AND:
      case Oper.OR:
      case Oper.XOR:
      case Oper.LSH:
      case Oper.RSH:
        return new U64()
    }
  }

  if (term.tag === 'F64') {
    switch (op) {
      case Oper.ADD:
      case Oper.SUB:
      case Oper.MUL:
      case Oper.DIV:
      case Oper.MOD:
        return new F64()
    }
  }

  switch (op) {
    case Oper.EQ:
    case Oper.NE:
    case Oper.LT:
    case Oper.GT:
    case Oper.LTE:
    case Oper.GTE:
      return new U64()
  }

  throw new Error(
    `Invalid operator: ${op} Invalid operand type: ${term.tag}`,
  )
}

export function checkValidType(
  typ: Term,
  validTypes: Array<Term>,
  dep: number,
): Env<boolean> {
  return validTypes.reduce(
    (acc, t) =>
      acc.bind(isValid =>
        isValid
          ? new Env(s => ({ state: s, tag: 'Done', value: true }))
          : equal(typ, t, dep),
      ),
    new Env(s => ({ state: s, tag: 'Done', value: false })),
  )
}
