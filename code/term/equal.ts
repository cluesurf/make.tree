/**
 * Term equality checking with unification.
 *
 * Modeled after Kind's Equal.hs. Checks if two terms are equal by:
 * 1. Try syntactic identity (identical)
 * 2. Reduce both to WHNF and compare structurally (similar)
 *
 * When a metavar is encountered, unify it with the other side via
 * pattern unification: (?X a b c) = K → X := λa.λb.λc.K (if valid).
 */

import type { Term, Book, Fill } from '@/term/form'
import type { Env } from '@/term/env'
import {
  envPure,
  envBind,
  envFail,
  envGetBook,
  envGetFill,
  envFill,
} from '@/term/env'
import { reduce } from '@/term/reduce'

/**
 * Check if two terms are equal at a given depth.
 * Returns true if equal (possibly solving metavars), false otherwise.
 */
export function equal(input: {
  a: Term
  b: Term
  dep: number
}): Env<boolean> {
  const { a, b, dep } = input

  // First try syntactic identity (fast path, handles metavar unification)
  return envBind({
    env: identical({ a, b, dep }),
    fn: same => {
      if (same) return envPure(true)

      // Reduce both sides to WHNF and try structural comparison
      return envBind({
        env: envGetBook(),
        fn: book =>
          envBind({
            env: envGetFill(),
            fn: fill => {
              const aWhnf = reduce({ book, fill, lv: 2, term: a })
              const bWhnf = reduce({ book, fill, lv: 2, term: b })

              // Try identity again after reduction
              return envBind({
                env: identical({ a: aWhnf, b: bWhnf, dep }),
                fn: same2 => {
                  if (same2) return envPure(true)
                  // Structural comparison
                  return similar({ a: aWhnf, b: bWhnf, dep })
                },
              })
            },
          }),
      })
    },
  })
}

/**
 * Syntactic identity check. Handles metavar unification.
 * Does NOT reduce terms.
 */
function identical(input: {
  a: Term
  b: Term
  dep: number
}): Env<boolean> {
  const { a, b, dep } = input

  // Metavar on the left: unify
  if (a.form === 'met') {
    return envBind({
      env: envGetFill(),
      fn: fill => {
        if (fill.has(a.uid)) return envPure(false) // already solved, let similar handle
        return unify({ uid: a.uid, ctx: a.ctx, term: b, dep })
      },
    })
  }

  // Metavar on the right: unify
  if (b.form === 'met') {
    return envBind({
      env: envGetFill(),
      fn: fill => {
        if (fill.has(b.uid)) return envPure(false) // already solved, let similar handle
        return unify({ uid: b.uid, ctx: b.ctx, term: a, dep })
      },
    })
  }

  // Same constructor, same immediate data
  if (a.form !== b.form) return envPure(false)

  switch (a.form) {
    case 'all': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.inp, b: b_.inp, dep }),
        fn: inpEq => {
          if (!inpEq) return envPure(false)
          const v: Term = { form: 'var', name: a.name, idx: dep }
          return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
        },
      })
    }

    case 'lam': {
      const b_ = b as typeof a
      const v: Term = { form: 'var', name: a.name, idx: dep }
      return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
    }

    case 'app': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.func, b: b_.func, dep }),
        fn: funcEq => {
          if (!funcEq) return envPure(false)
          return equal({ a: a.argm, b: b_.argm, dep })
        },
      })
    }

    case 'slf': {
      // Following Kind2: only compare bodies, not typ annotation.
      // The typ is just metadata for the checker. Comparing it can
      // cause infinite recursion with self-referential types like Equal.
      const b_ = b as typeof a
      const v: Term = { form: 'var', name: a.name, idx: dep }
      return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
    }

    case 'var':
      return envPure(a.idx === (b as typeof a).idx)

    case 'ref':
      return envPure(a.name === (b as typeof a).name)

    case 'num':
      return envPure(a.val === (b as typeof a).val)

    case 'txt':
      return envPure(a.val === (b as typeof a).val)

    case 'nat':
      return envPure(a.val === (b as typeof a).val)

    case 'set':
      return envPure(true)
    case 'int':
      return envPure(a.size === (b as typeof a).size && a.sign === (b as typeof a).sign)
    case 'flt':
      return envPure(a.size === (b as typeof a).size)

    case 'hol':
      return envPure(a.name === (b as typeof a).name)

    case 'met':
      return envPure(a.uid === (b as typeof a).uid)

    default:
      return envPure(false)
  }
}

/**
 * Structural comparison after WHNF reduction.
 * Both terms are already in WHNF.
 */
function similar(input: {
  a: Term
  b: Term
  dep: number
}): Env<boolean> {
  const { a, b, dep } = input

  if (a.form !== b.form) return envPure(false)

  switch (a.form) {
    case 'all': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.inp, b: b_.inp, dep }),
        fn: inpEq => {
          if (!inpEq) return envPure(false)
          const v: Term = { form: 'var', name: a.name, idx: dep }
          return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
        },
      })
    }

    case 'lam': {
      const b_ = b as typeof a
      const v: Term = { form: 'var', name: a.name, idx: dep }
      return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
    }

    case 'app': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.func, b: b_.func, dep }),
        fn: funcEq => {
          if (!funcEq) return envPure(false)
          return equal({ a: a.argm, b: b_.argm, dep })
        },
      })
    }

    case 'ann':
      return equal({ a: a.val, b: (b as typeof a).val, dep })

    case 'slf': {
      // Following Kind2: only compare bodies, not typ annotation.
      const b_ = b as typeof a
      const v: Term = { form: 'var', name: a.name, idx: dep }
      return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
    }

    case 'ins':
      return equal({ a: a.val, b: (b as typeof a).val, dep })

    case 'con': {
      const b_ = b as typeof a
      if (a.name !== b_.name) return envPure(false)
      if (a.args.length !== b_.args.length) return envPure(false)
      return argsEqual({ aArgs: a.args, bArgs: b_.args, idx: 0, dep })
    }

    case 'mat': {
      const b_ = b as typeof a
      if (a.arms.length !== b_.arms.length) return envPure(false)
      return armsEqual({ aArms: a.arms, bArms: b_.arms, idx: 0, dep })
    }

    case 'let': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.val, b: b_.val, dep }),
        fn: valEq => {
          if (!valEq) return envPure(false)
          const v: Term = { form: 'var', name: a.name, idx: dep }
          return equal({ a: a.bod(v), b: b_.bod(v), dep: dep + 1 })
        },
      })
    }

    case 'op2': {
      const b_ = b as typeof a
      if (a.oper !== b_.oper) return envPure(false)
      return envBind({
        env: equal({ a: a.a, b: b_.a, dep }),
        fn: aEq => {
          if (!aEq) return envPure(false)
          return equal({ a: a.b, b: b_.b, dep })
        },
      })
    }

    case 'swi': {
      const b_ = b as typeof a
      return envBind({
        env: equal({ a: a.zero, b: b_.zero, dep }),
        fn: zeroEq => {
          if (!zeroEq) return envPure(false)
          return equal({ a: a.succ, b: b_.succ, dep })
        },
      })
    }

    case 'var':
      return envPure(a.idx === (b as typeof a).idx)

    case 'ref':
      return envPure(a.name === (b as typeof a).name)

    case 'num':
      return envPure(a.val === (b as typeof a).val)

    case 'txt':
      return envPure(a.val === (b as typeof a).val)

    case 'nat':
      return envPure(a.val === (b as typeof a).val)

    case 'set':
      return envPure(true)
    case 'int':
      return envPure(a.size === (b as typeof a).size && a.sign === (b as typeof a).sign)
    case 'flt':
      return envPure(a.size === (b as typeof a).size)

    case 'hol':
      return envPure(a.name === (b as typeof a).name)

    case 'met':
      return envPure(a.uid === (b as typeof a).uid)

    default:
      return envPure(false)
  }
}

/** Check constructor args equal one by one. */
function argsEqual(input: {
  aArgs: [string | null, Term][]
  bArgs: [string | null, Term][]
  idx: number
  dep: number
}): Env<boolean> {
  const { aArgs, bArgs, idx, dep } = input
  if (idx >= aArgs.length) return envPure(true)
  return envBind({
    env: equal({ a: aArgs[idx]![1], b: bArgs[idx]![1], dep }),
    fn: eq => {
      if (!eq) return envPure(false)
      return argsEqual({ aArgs, bArgs, idx: idx + 1, dep })
    },
  })
}

/** Check match arms equal one by one. */
function armsEqual(input: {
  aArms: [string, Term][]
  bArms: [string, Term][]
  idx: number
  dep: number
}): Env<boolean> {
  const { aArms, bArms, idx, dep } = input
  if (idx >= aArms.length) return envPure(true)
  if (aArms[idx]![0] !== bArms[idx]![0]) return envPure(false)
  return envBind({
    env: equal({ a: aArms[idx]![1], b: bArms[idx]![1], dep }),
    fn: eq => {
      if (!eq) return envPure(false)
      return armsEqual({ aArms, bArms, idx: idx + 1, dep })
    },
  })
}

/**
 * Pattern unification: solve ?X where (?X a1 ... an) = term.
 *
 * Checks that the spine (ctx) is a list of distinct bound variables,
 * then generates X := λa1...λan. term (with occur check).
 */
function unify(input: {
  uid: number
  ctx: Term[]
  term: Term
  dep: number
}): Env<boolean> {
  const { uid, ctx, term, dep } = input

  // Check spine: all args must be distinct variables
  if (!validSpine(ctx)) return envPure(false)

  // Occur check: term must not mention this metavar
  if (occurs({ uid, term })) return envPure(false)

  // Build the solution: λa1...λan. term
  const solution = buildSolution({ ctx, term })

  return envBind({
    env: envFill({ uid, term: solution }),
    fn: () => envPure(true),
  })
}

/** Check that all spine entries are distinct variables. */
function validSpine(ctx: Term[]): boolean {
  const seen = new Set<number>()
  for (const t of ctx) {
    if (t.form !== 'var') return false
    if (seen.has(t.idx)) return false
    seen.add(t.idx)
  }
  return true
}

/** Check if a metavar uid occurs in a term (simple syntactic check). */
function occurs(input: { uid: number; term: Term }): boolean {
  const { uid, term } = input
  switch (term.form) {
    case 'met':
      return term.uid === uid
    case 'app':
      return (
        occurs({ uid, term: term.func }) ||
        occurs({ uid, term: term.argm })
      )
    case 'ann':
      return (
        occurs({ uid, term: term.val }) ||
        occurs({ uid, term: term.typ })
      )
    case 'ins':
      return occurs({ uid, term: term.val })
    case 'op2':
      return (
        occurs({ uid, term: term.a }) || occurs({ uid, term: term.b })
      )
    case 'con':
      return term.args.some(([, t]) => occurs({ uid, term: t }))
    case 'mat':
      return term.arms.some(([, t]) => occurs({ uid, term: t }))
    case 'swi':
      return (
        occurs({ uid, term: term.zero }) ||
        occurs({ uid, term: term.succ })
      )
    case 'lst':
      return term.list.some(t => occurs({ uid, term: t }))
    case 'log':
      return (
        occurs({ uid, term: term.msg }) ||
        occurs({ uid, term: term.val })
      )
    case 'src':
      return occurs({ uid, term: term.val })
    // HOAS forms: we can't look inside bod functions, so be conservative
    case 'all':
      return occurs({ uid, term: term.inp })
    case 'lam':
      return false // can't inspect bod
    case 'slf':
      return occurs({ uid, term: term.typ })
    case 'let':
      return occurs({ uid, term: term.val })
    case 'use':
      return occurs({ uid, term: term.val })
    default:
      return false
  }
}

/**
 * Build solution λa1...λan. term from a spine of variables.
 *
 * When (?X v0 v1 ... vn) = K, the solution is:
 *   X := λx0.λx1...λxn. K[v0:=x0, v1:=x1, ..., vn:=xn]
 *
 * The lambda body must substitute occurrences of spine variables
 * in K with the corresponding lambda parameters.
 */
function buildSolution(input: { ctx: Term[]; term: Term }): Term {
  const { ctx, term } = input
  if (ctx.length === 0) return term

  // Collect spine variable indices for substitution
  const spineIdxs: number[] = []
  for (const v of ctx) {
    if (v.form === 'var') spineIdxs.push(v.idx)
  }

  let result = term
  for (let i = ctx.length - 1; i >= 0; i--) {
    const v = ctx[i]!
    const name = v.form === 'var' ? v.name : `x${i}`
    const varIdx = v.form === 'var' ? v.idx : -1
    const inner = result
    result = {
      form: 'lam',
      name,
      bod: (x: Term) =>
        varIdx >= 0 ? substVar({ term: inner, varIdx, replacement: x }) : inner,
    }
  }
  return result
}

/**
 * Substitute a variable (by de Bruijn level/index) in a term.
 * Since HOAS bod functions can't be traversed, this only handles
 * the first-order parts of the term tree.
 */
function substVar(input: {
  term: Term
  varIdx: number
  replacement: Term
}): Term {
  const { term, varIdx, replacement } = input
  switch (term.form) {
    case 'var':
      return term.idx === varIdx ? replacement : term
    case 'app':
      return {
        form: 'app',
        func: substVar({ term: term.func, varIdx, replacement }),
        argm: substVar({ term: term.argm, varIdx, replacement }),
      }
    case 'ann':
      return {
        form: 'ann',
        done: term.done,
        val: substVar({ term: term.val, varIdx, replacement }),
        typ: substVar({ term: term.typ, varIdx, replacement }),
      }
    case 'ins':
      return {
        form: 'ins',
        val: substVar({ term: term.val, varIdx, replacement }),
      }
    case 'op2':
      return {
        form: 'op2',
        oper: term.oper,
        a: substVar({ term: term.a, varIdx, replacement }),
        b: substVar({ term: term.b, varIdx, replacement }),
      }
    case 'con':
      return {
        form: 'con',
        name: term.name,
        args: term.args.map(([f, t]) => [
          f,
          substVar({ term: t, varIdx, replacement }),
        ]),
      }
    case 'mat':
      return {
        form: 'mat',
        arms: term.arms.map(([n, t]) => [
          n,
          substVar({ term: t, varIdx, replacement }),
        ]),
      }
    case 'swi':
      return {
        form: 'swi',
        zero: substVar({ term: term.zero, varIdx, replacement }),
        succ: substVar({ term: term.succ, varIdx, replacement }),
      }
    case 'lst':
      return {
        form: 'lst',
        list: term.list.map(t =>
          substVar({ term: t, varIdx, replacement }),
        ),
      }
    case 'log':
      return {
        form: 'log',
        msg: substVar({ term: term.msg, varIdx, replacement }),
        val: substVar({ term: term.val, varIdx, replacement }),
      }
    case 'src':
      return {
        form: 'src',
        site: term.site,
        val: substVar({ term: term.val, varIdx, replacement }),
      }
    // HOAS forms: can't traverse bod, but we can handle the non-bod parts
    case 'all':
      return {
        form: 'all',
        name: term.name,
        inp: substVar({ term: term.inp, varIdx, replacement }),
        bod: x =>
          substVar({ term: term.bod(x), varIdx, replacement }),
      }
    case 'lam':
      return {
        form: 'lam',
        name: term.name,
        bod: x =>
          substVar({ term: term.bod(x), varIdx, replacement }),
      }
    case 'slf':
      return {
        form: 'slf',
        name: term.name,
        typ: substVar({ term: term.typ, varIdx, replacement }),
        bod: x =>
          substVar({ term: term.bod(x), varIdx, replacement }),
      }
    case 'let':
      return {
        form: 'let',
        name: term.name,
        val: substVar({ term: term.val, varIdx, replacement }),
        bod: x =>
          substVar({ term: term.bod(x), varIdx, replacement }),
      }
    case 'use':
      return {
        form: 'use',
        name: term.name,
        val: substVar({ term: term.val, varIdx, replacement }),
        bod: x =>
          substVar({ term: term.bod(x), varIdx, replacement }),
      }
    default:
      return term
  }
}
