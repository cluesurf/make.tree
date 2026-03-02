/**
 * TypeScript code generation from Core Terms.
 *
 * Converts type-checked Core Terms to TypeScript source text for
 * browser or Node execution. Types are erased at runtime but can
 * optionally be emitted as JSDoc or TS type annotations.
 *
 * Generated output:
 *   export const name = (x) => body
 *   (func)(arg)
 *   { tag: "Con", field: value }
 *   (x) => { switch(x.tag) { case "C0": ...; case "C1": ... } }
 *   (() => { const x = val; return body })()
 *   (a + b)
 *
 * ADT constructors become tagged objects: { tag: "Name", ...fields }.
 * Pattern matching becomes switch statements on the tag field.
 * Nat/Txt/Lst sugar is expanded to native JS equivalents.
 *
 * Uses HOAS to named variables conversion via de Bruijn levels.
 */

import type { Term, Book, Oper } from '@/term/form'

/**
 * Generate TypeScript source for an entire Book.
 * Each definition becomes `export const name = body`.
 */
export function castBook(input: { book: Book }): string {
  const { book } = input
  const lines: string[] = []

  for (const [name, term] of book) {
    const body = castDef({ name, term })
    if (body !== null) {
      lines.push(`export const ${sanitizeName(name)} = ${body};`)
    }
  }

  return lines.join('\n\n')
}

/**
 * Generate TypeScript for a single definition.
 * Returns null if the definition is type-only (erased).
 */
function castDef(input: { name: string; term: Term }): string | null {
  const val = unwrapAnn(input.term)
  if (isTypeOnly(val)) return null
  return castTerm({ term: val, dep: 0 })
}

/**
 * Convert a Core Term to TypeScript expression text at a given depth.
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
      return `(${name}) => ${body}`
    }

    case 'app': {
      const { func, args } = unwrapApp(term)
      const funcStr = castTerm({ term: func, dep })
      const argsStr = args.map(a => castTerm({ term: a, dep }))
      let result = funcStr
      for (const arg of argsStr) {
        result = `${result}(${arg})`
      }
      return result
    }

    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castTerm({ term: term.val, dep })
      const body = castTerm({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
      })
      return `(() => { const ${name} = ${val}; return ${body}; })()`
    }

    case 'use':
      return castTerm({ term: term.bod(term.val), dep })

    case 'ref':
      return sanitizeName(term.name)

    case 'var':
      return term.name

    case 'num':
      return String(term.val)

    case 'flt': {
      const s = String(term.val)
      if (s.includes('.') || s.includes('e') || s.includes('E')) return s
      return `${s}.0`
    }

    case 'txt':
      return JSON.stringify(term.val)

    case 'nat':
      return String(term.val)

    case 'con': {
      if (term.args.length === 0) {
        return `({ tag: ${JSON.stringify(term.name)} })`
      }
      const fields = term.args
        .map(([field, t], i) => {
          const val = castTerm({ term: t, dep })
          const key = field ?? `_${i}`
          return `${key}: ${val}`
        })
        .join(', ')
      return `({ tag: ${JSON.stringify(term.name)}, ${fields} })`
    }

    case 'mat': {
      const arms = term.arms
        .map(([name, bod]) => {
          const bodStr = castTerm({ term: bod, dep })
          return `    case ${JSON.stringify(name)}: return ${bodStr};`
        })
        .join('\n')
      return [
        '($$v) => {',
        `  switch ($$v.tag) {\n${arms}`,
        '    default: throw new Error("no match");',
        '  }',
        '}',
      ].join('\n')
    }

    case 'swi': {
      const zero = castTerm({ term: term.zero, dep })
      const succ = castTerm({ term: term.succ, dep })
      return `($$n) => ($$n === 0 ? ${zero} : (${succ})($$n - 1))`
    }

    case 'op2': {
      const op = castOper(term.oper)
      const a = castTerm({ term: term.a, dep })
      const b = castTerm({ term: term.b, dep })
      return `(${a} ${op} ${b})`
    }

    case 'lst': {
      if (term.list.length === 0) return '[]'
      const items = term.list.map(t => castTerm({ term: t, dep }))
      return `[${items.join(', ')}]`
    }

    case 'log': {
      const msg = castTerm({ term: term.msg, dep })
      const val = castTerm({ term: term.val, dep })
      return `(() => { console.log(${msg}); return ${val}; })()`
    }

    // Type-level terms are erased
    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
      return 'undefined'

    case 'ann':
      return castTerm({ term: term.val, dep })

    case 'ins':
      return castTerm({ term: term.val, dep })

    case 'src':
      return castTerm({ term: term.val, dep })

    case 'adt':
      return 'undefined'

    case 'hol':
      return `(() => { throw new Error(${JSON.stringify(`hole: ${term.name}`)}); })()`

    case 'met':
      return `undefined /* meta ${term.uid} */`

    default:
      return 'undefined'
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

/** Strip Ann and Src wrappers from a term. */
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

/** Sanitize a definition name for TypeScript (replace special chars). */
function sanitizeName(name: string): string {
  return name.replace(/[/.-]/g, '_')
}

/** Convert an operator to TypeScript syntax. */
function castOper(oper: Oper): string {
  const map: Record<Oper, string> = {
    add: '+',
    sub: '-',
    mul: '*',
    div: '/',
    mod: '%',
    eq: '===',
    ne: '!==',
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
