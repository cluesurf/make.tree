/**
 * HVM code generation from Core Terms.
 *
 * Converts type-checked Core Terms to HVM interaction net text format.
 * Types are erased at this stage (Set, All, Ann, Slf, Ins vanish).
 * Only runtime-relevant terms remain: Lam, App, Con, Mat, Let, Op2, etc.
 *
 * HVM text format:
 *   @name = body
 *   λx body
 *   (func arg)
 *   #Con { field: value }
 *   match x { #Case: body; ... }
 *   let x = val; body
 *   (+ a b)
 *
 * Uses HOAS → named variables conversion via de Bruijn levels.
 */

import type { Term, Book, Oper } from '@/term/form'
import { reduce } from '@/term/reduce'

/**
 * Generate HVM source text for an entire Book.
 * Each definition becomes `@name = body`.
 */
export function castBook(input: { book: Book }): string {
  const { book } = input
  const lines: string[] = []

  for (const [name, term] of book) {
    const body = castDef({ name, term, book })
    if (body !== null) {
      lines.push(`@${sanitizeName(name)} = ${body}`)
    }
  }

  return lines.join('\n\n')
}

/**
 * Generate HVM for a single definition.
 * Returns null if the definition is type-only (erased).
 */
function castDef(input: {
  name: string
  term: Term
  book: Book
}): string | null {
  const { term, book } = input

  // Unwrap Ann to get the value (erase the type)
  const val = unwrapAnn(term)

  // Pure type definitions are erased
  if (isTypeOnly(val)) return null

  return castTerm({ term: val, dep: 0 })
}

/**
 * Convert a Core Term to HVM text at a given depth.
 * Depth is used for generating fresh variable names from HOAS.
 */
export function castTerm(input: { term: Term; dep: number }): string {
  const { term, dep } = input

  switch (term.form) {
    case 'lam': {
      const name = varName({ name: term.name, dep })
      const body = castTerm({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
      })
      return `λ${name} ${body}`
    }

    case 'app': {
      const { func, args } = unwrapApp(term)
      // .wait → transparent in HVM (parallel by default)
      if (func.form === 'ref' && func.name === '.wait' && args.length === 1) {
        return castTerm({ term: args[0]!, dep })
      }
      const funcStr = castTerm({ term: func, dep })
      const argsStr = args
        .map(a => castTerm({ term: a, dep }))
        .join(' ')
      return `(${funcStr} ${argsStr})`
    }

    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castTerm({ term: term.val, dep })
      const body = castTerm({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
      })
      return `let ${name} = ${val}; ${body}`
    }

    case 'use':
      return castTerm({
        term: term.bod(term.val),
        dep,
      })

    case 'ref':
      return `@${sanitizeName(term.name)}`

    case 'var':
      return term.name

    case 'num':
      return String(term.val)

    case 'flt':
      return String(term.val)

    case 'txt':
      return castString(term.val)

    case 'nat':
      return castNat(term.val)

    case 'con': {
      if (term.args.length === 0) {
        return `#${term.name}`
      }
      const fields = term.args
        .map(([field, t]) => {
          const val = castTerm({ term: t, dep })
          return field ? `${field}: ${val}` : val
        })
        .join(' ')
      return `#${term.name} { ${fields} }`
    }

    case 'mat': {
      const arms = term.arms
        .map(([name, bod]) => {
          const bodStr = castTerm({ term: bod, dep })
          return `#${name}: ${bodStr}`
        })
        .join('; ')
      return `λx match x { ${arms} }`
    }

    case 'swi': {
      const zero = castTerm({ term: term.zero, dep })
      const succ = castTerm({ term: term.succ, dep })
      return `λx switch x { 0: ${zero}; _: ${succ} }`
    }

    case 'op2': {
      const op = castOper(term.oper)
      const a = castTerm({ term: term.a, dep })
      const b = castTerm({ term: term.b, dep })
      return `(${op} ${a} ${b})`
    }

    case 'lst': {
      if (term.list.length === 0) return '#Nil'
      const items = term.list.map(t => castTerm({ term: t, dep }))
      let result = '#Nil'
      for (let i = items.length - 1; i >= 0; i--) {
        result = `#Cons { head: ${items[i]} tail: ${result} }`
      }
      return result
    }

    case 'log': {
      const msg = castTerm({ term: term.msg, dep })
      const val = castTerm({ term: term.val, dep })
      return `log(${msg}) ${val}`
    }

    // Type-level terms are erased in HVM
    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
      return '*'

    case 'ann':
      return castTerm({ term: term.val, dep })

    case 'ins':
      return castTerm({ term: term.val, dep })

    case 'src':
      return castTerm({ term: term.val, dep })

    case 'adt':
      return '*' // ADT type definition is erased

    case 'hol':
      return `?${term.name}`

    case 'met':
      return `_${term.uid}`

    default:
      return '*'
  }
}

// ---- Helpers ----

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

/** Strip Ann wrappers from a term. */
function unwrapAnn(term: Term): Term {
  if (term.form === 'ann') return unwrapAnn(term.val)
  if (term.form === 'src') return unwrapAnn(term.val)
  return term
}

/** Check if a term is type-only (should be erased). */
function isTypeOnly(term: Term): boolean {
  switch (term.form) {
    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
    case 'adt':
      return true
    default:
      return false
  }
}

/** Generate a variable name from a base name and depth. */
function varName(input: { name: string; dep: number }): string {
  const { name, dep } = input
  if (name === '_') return `_${dep}`
  return name
}

/** Sanitize a definition name for HVM (replace special chars). */
function sanitizeName(name: string): string {
  return name.replace(/[/.-]/g, '_')
}

/** Convert an operator to HVM syntax. */
function castOper(oper: Oper): string {
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

/** Encode a string as HVM Cons/Nil chain of char codes. */
function castString(val: string): string {
  if (val.length === 0) return '#Nil'
  let result = '#Nil'
  for (let i = val.length - 1; i >= 0; i--) {
    result = `#Cons { head: ${val.charCodeAt(i)} tail: ${result} }`
  }
  return result
}

/** Encode a natural number as HVM Succ/Zero chain. */
function castNat(val: number): string {
  if (val === 0) return '#Zero'
  let result = '#Zero'
  for (let i = 0; i < val; i++) {
    result = `#Succ { pred: ${result} }`
  }
  return result
}
