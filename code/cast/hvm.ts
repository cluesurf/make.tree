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
import type { AsyncMeta } from '@/term/desugar'
import { reduce } from '@/term/reduce'

/** IO magic sentinel for distinguishing IO nodes from regular constructors. */
const IO_MAGIC = '0xD0CA11'

/**
 * Generate HVM source text for an entire Book.
 * Each definition becomes `@name = body`.
 */
export function castBook(input: { book: Book; asyncMeta?: AsyncMeta }): string {
  const { book } = input
  const asyncMeta = input.asyncMeta ?? new Map()
  const lines: string[] = []

  // Emit IO/bind helper if any async definitions exist
  if (asyncMeta.size > 0) {
    lines.push(`@IO_bind = λa λb match a { #IO_Done { magic expr }: (b expr); #IO_Call { magic func argm cont }: #IO_Call { magic: ${IO_MAGIC} func: func argm: argm cont: λx (@IO_bind (cont x) b) } }`)
  }

  for (const [name, term] of book) {
    const isAsync = asyncMeta.get(name) === true
    const body = castDef({ name, term, book, isAsync })
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
  isAsync?: boolean
}): string | null {
  const { term, book, isAsync } = input

  // Unwrap Ann to get the value (erase the type)
  const val = unwrapAnn(term)

  // Pure type definitions are erased
  if (isTypeOnly(val)) return null

  const body = castTerm({ term: val, dep: 0, isAsync })

  // Wrap async function results in IO/Done
  if (isAsync && val.form === 'lam') {
    return wrapAsyncBody({ term: val, dep: 0 })
  }

  return body
}

/** Wrap an async function body so the final value is IO/Done. */
function wrapAsyncBody(input: { term: Term; dep: number }): string {
  const { term, dep } = input
  if (term.form !== 'lam') {
    return `#IO_Done { magic: ${IO_MAGIC} expr: ${castTerm({ term, dep })} }`
  }
  const name = varName({ name: term.name, dep })
  const body = wrapAsyncBody({
    term: term.bod({ form: 'var', name, idx: dep }),
    dep: dep + 1,
  })
  return `λ${name} ${body}`
}

/**
 * Convert a Core Term to HVM text at a given depth.
 * Depth is used for generating fresh variable names from HOAS.
 */
export function castTerm(input: { term: Term; dep: number; isAsync?: boolean }): string {
  const { term, dep, isAsync } = input

  switch (term.form) {
    case 'lam': {
      const name = varName({ name: term.name, dep })
      const body = castTerm({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        isAsync,
      })
      return `λ${name} ${body}`
    }

    case 'app': {
      const { func, args } = unwrapApp(term)
      // .wait → IO/Call in async context, transparent otherwise
      if (func.form === 'ref' && func.name === '.wait' && args.length === 1) {
        if (isAsync) {
          // In IO context, .wait wraps the inner call as IO/Call
          const inner = args[0]!
          if (inner.form === 'app') {
            const { func: innerFunc, args: innerArgs } = unwrapApp(inner)
            if (innerFunc.form === 'ref') {
              const funcName = sanitizeName(innerFunc.name)
              const argStr = innerArgs.length > 0
                ? castTerm({ term: innerArgs[0]!, dep, isAsync })
                : '*'
              return `#IO_Call { magic: ${IO_MAGIC} func: "${funcName}" argm: ${argStr} cont: λresult result }`
            }
          }
          return castTerm({ term: inner, dep, isAsync })
        }
        return castTerm({ term: args[0]!, dep, isAsync })
      }
      const funcStr = castTerm({ term: func, dep, isAsync })
      const argsStr = args
        .map(a => castTerm({ term: a, dep, isAsync }))
        .join(' ')
      return `(${funcStr} ${argsStr})`
    }

    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castTerm({ term: term.val, dep, isAsync })
      const body = castTerm({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        isAsync,
      })
      return `let ${name} = ${val}; ${body}`
    }

    case 'use':
      return castTerm({
        term: term.bod(term.val),
        dep,
        isAsync,
      })

    case 'ref':
      return `@${sanitizeName(term.name)}`

    case 'var':
      return term.name

    case 'num':
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
          const val = castTerm({ term: t, dep, isAsync })
          return field ? `${field}: ${val}` : val
        })
        .join(' ')
      return `#${term.name} { ${fields} }`
    }

    case 'mat': {
      const arms = term.arms
        .map(([name, bod]) => {
          const bodStr = castTerm({ term: bod, dep, isAsync })
          return `#${name}: ${bodStr}`
        })
        .join('; ')
      return `λx match x { ${arms} }`
    }

    case 'swi': {
      const zero = castTerm({ term: term.zero, dep, isAsync })
      const succ = castTerm({ term: term.succ, dep, isAsync })
      return `λx switch x { 0: ${zero}; _: ${succ} }`
    }

    case 'op2': {
      const op = castOper(term.oper)
      const a = castTerm({ term: term.a, dep, isAsync })
      const b = castTerm({ term: term.b, dep, isAsync })
      return `(${op} ${a} ${b})`
    }

    case 'lst': {
      if (term.list.length === 0) return '#Nil'
      const items = term.list.map(t => castTerm({ term: t, dep, isAsync }))
      let result = '#Nil'
      for (let i = items.length - 1; i >= 0; i--) {
        result = `#Cons { head: ${items[i]} tail: ${result} }`
      }
      return result
    }

    case 'log': {
      const msg = castTerm({ term: term.msg, dep, isAsync })
      const val = castTerm({ term: term.val, dep, isAsync })
      return `log(${msg}) ${val}`
    }

    case 'rst': {
      const val = castTerm({ term: term.val, dep, isAsync })
      return val
    }

    case 'hlt': {
      const msg = castTerm({ term: term.msg, dep, isAsync })
      return `log(${msg}) *`
    }

    case 'nxt':
      return '*'

    // Type-level terms are erased in HVM
    case 'all':
    case 'set':
    case 'int':
    case 'flt':
    case 'slf':
      return '*'

    case 'ann':
      return castTerm({ term: term.val, dep, isAsync })

    case 'ins':
      return castTerm({ term: term.val, dep, isAsync })

    case 'src':
      return castTerm({ term: term.val, dep, isAsync })

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
    case 'int':
    case 'flt':
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
