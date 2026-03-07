/**
 * Core Term pretty printer.
 *
 * Modeled after Kind's Show.hs. Prints Core Terms (All, Lam, App,
 * Slf, etc.) to readable format. Used for --show-core debug flag
 * and error messages showing inferred types.
 *
 * Uses HOAS: to print a lambda body, we create a fresh Var with
 * the current depth and pass it to the body function.
 */

import type { Term, Ctr, Tele, Oper } from '@/term/form'

/** Print a Core Term to string. */
export function showTerm(term: Term): string {
  return showTermGo({ term, small: true, dep: 0 })
}

/** Print a Core Term with type annotations visible. */
export function showTermFull(term: Term): string {
  return showTermGo({ term, small: false, dep: 0 })
}

/** Core printer with depth tracking and small mode. */
function showTermGo(input: {
  term: Term
  small: boolean
  dep: number
}): string {
  const { term, small, dep } = input

  // Try sugar forms first
  const sugar = pretty(term)
  if (sugar !== undefined) return sugar

  switch (term.form) {
    case 'all': {
      const inp = showTermGo({ term: term.inp, small, dep })
      const bod = showTermGo({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        small,
        dep: dep + 1,
      })
      return `∀(${term.name}: ${inp}) ${bod}`
    }

    case 'lam': {
      const bod = showTermGo({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        small,
        dep: dep + 1,
      })
      return `λ${term.name} ${bod}`
    }

    case 'app': {
      const { func, args } = unwrapApp(term)
      const funcStr = showTermGo({ term: func, small, dep })
      const argsStr = args
        .map(a => showTermGo({ term: a, small, dep }))
        .join(' ')
      return `(${funcStr} ${argsStr})`
    }

    case 'ann': {
      if (small) return showTermGo({ term: term.val, small, dep })
      const val = showTermGo({ term: term.val, small, dep })
      const typ = showTermGo({ term: term.typ, small, dep })
      return `{${val}: ${typ}}`
    }

    case 'slf': {
      const typ = showTermGo({ term: term.typ, small, dep })
      const bod = showTermGo({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        small,
        dep: dep + 1,
      })
      return `$(${term.name}: ${typ}) ${bod}`
    }

    case 'ins': {
      const val = showTermGo({ term: term.val, small, dep })
      return `~${val}`
    }

    case 'adt': {
      const scp = term.indx
        .map(x => showTermGo({ term: x, small, dep }))
        .join(' ')
      const cts = term.ctrs
        .map(
          c => `#${c.name} ${showTeleGo({ tele: c.tele, small, dep })}`,
        )
        .join(' ')
      const typ = showTermGo({ term: term.type, small, dep })
      return `#[${scp}]{ ${cts} } : ${typ}`
    }

    case 'con': {
      const args = term.args
        .map(([field, t]) => {
          const val = showTermGo({ term: t, small, dep })
          return field ? `${field}: ${val}` : val
        })
        .join(' ')
      return `#${term.name}{${args}}`
    }

    case 'mat': {
      const arms = term.arms
        .map(([name, bod]) => {
          const bodStr = showTermGo({ term: bod, small, dep })
          return `#${name}: ${bodStr}`
        })
        .join(' ')
      return `λ{ ${arms} }`
    }

    case 'ref':
      return term.name

    case 'let': {
      const val = showTermGo({ term: term.val, small, dep })
      const bod = showTermGo({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        small,
        dep: dep + 1,
      })
      return `let ${term.name} = ${val} ${bod}`
    }

    case 'use': {
      const val = showTermGo({ term: term.val, small, dep })
      const bod = showTermGo({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        small,
        dep: dep + 1,
      })
      return `use ${term.name} = ${val} ${bod}`
    }

    case 'set':
      return '*'
    case 'int': {
      if (term.size === 0) return 'Integer'
      return `${term.sign ? 'I' : 'U'}${term.size}`
    }
    case 'flt': {
      if (term.size === 0) return 'Float'
      return `F${term.size}`
    }
    case 'num':
      return String(term.val)
    case 'op2': {
      const op = showOper(term.oper)
      const a = showTermGo({ term: term.a, small, dep })
      const b = showTermGo({ term: term.b, small, dep })
      return `(${op} ${a} ${b})`
    }

    case 'swi': {
      const zero = showTermGo({ term: term.zero, small, dep })
      const succ = showTermGo({ term: term.succ, small, dep })
      return `λ{ 0: ${zero} _: ${succ} }`
    }

    case 'txt':
      return `"${term.val}"`
    case 'lst': {
      const items = term.list
        .map(x => showTermGo({ term: x, small, dep }))
        .join(' ')
      return `[${items}]`
    }
    case 'nat':
      return `#${term.val}`

    case 'hol':
      return `?${term.name}`
    case 'met':
      return `_${term.uid}`
    case 'var':
      return term.name

    case 'src': {
      if (small) return showTermGo({ term: term.val, small, dep })
      return `!${showTermGo({ term: term.val, small, dep })}`
    }

    case 'log': {
      const msg = showTermGo({ term: term.msg, small, dep })
      const val = showTermGo({ term: term.val, small, dep })
      return `log ${msg} ${val}`
    }
  }
}

/** Print a telescope. */
function showTeleGo(input: {
  tele: Tele
  small: boolean
  dep: number
}): string {
  const { tele, small, dep } = input
  if (tele.form === 'ret') {
    const term = showTermGo({ term: tele.term, small, dep })
    return `}: ${term}`
  }
  const typ = showTermGo({ term: tele.typ, small, dep })
  const rest = showTeleGo({
    tele: tele.bod({ form: 'var', name: tele.name, idx: dep }),
    small,
    dep: dep + 1,
  })
  return `${tele.name}: ${typ} ${rest}`
}

/** Unwrap nested App into (func, [arg1, arg2, ...]). */
function unwrapApp(term: Term): { func: Term; args: Term[] } {
  const args: Term[] = []
  let cur = term
  while (cur.form === 'app') {
    args.unshift(cur.argm)
    cur = cur.func
  }
  return { func: cur, args }
}

/** Show an operator symbol. */
function showOper(oper: Oper): string {
  const map: Record<Oper, string> = {
    add: '+',
    sub: '-',
    mul: '*',
    div: '/',
    mod: '%',
    eq: '==',
    ne: '!=',
    lt: '<',
    gt: '>',
    lte: '<=',
    gte: '>=',
    and: '&',
    or: '|',
    xor: '^',
    lsh: '<<',
    rsh: '>>',
  }
  return map[oper]
}

/** Try sugar forms: nat, list, string, equality. */
function pretty(term: Term): string | undefined {
  return prettyNat(term) ?? prettyList(term)
}

function prettyNat(term: Term): string | undefined {
  if (term.form !== 'con') return undefined
  if (term.name === 'Zero' && term.args.length === 0) return '#0'
  let n = 0
  let cur: Term = term
  while (
    cur.form === 'con' &&
    cur.name === 'Succ' &&
    cur.args.length === 1
  ) {
    n++
    cur = cur.args[0]![1]
  }
  if (
    cur.form === 'con' &&
    cur.name === 'Zero' &&
    cur.args.length === 0
  ) {
    return `#${n}`
  }
  return undefined
}

function prettyList(term: Term): string | undefined {
  const items: Term[] = []
  let cur: Term = term
  while (
    cur.form === 'con' &&
    cur.name === 'Cons' &&
    cur.args.length === 2
  ) {
    items.push(cur.args[0]![1])
    cur = cur.args[1]![1]
  }
  if (
    cur.form === 'con' &&
    cur.name === 'Nil' &&
    cur.args.length === 0 &&
    items.length > 0
  ) {
    const strs = items.map(x =>
      showTermGo({ term: x, small: true, dep: 0 }),
    )
    return `[${strs.join(' ')}]`
  }
  return undefined
}
