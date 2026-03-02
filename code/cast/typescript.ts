/**
 * Optimal TypeScript code generation from Core Terms.
 *
 * Two-phase codegen:
 *   Phase A: Analyze the Book to build tag/field/arity maps.
 *   Phase B: Emit using statement mode (function bodies) and
 *            expression mode (values, arguments).
 *
 * Key optimizations over naive codegen:
 *   1. Lam chains → multi-param functions (no intermediate closures)
 *   2. Let → flat const statements (no IIFEs in statement mode)
 *   3. App(Mat, x) → inline switch/if-else (no closure for match)
 *   4. App(Swi, x) → inline if/else (no closure for nat switch)
 *   5. Numeric constructor tags for O(1) jump table dispatch
 *   6. Two-mode emission: statement vs expression context
 */

import type { Term, Book, Oper, Ctr, Tele } from '@/term/form'

// ---- Emit Context ----

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  arityMap: Map<string, number>
  book: Book
}

// ---- Public API ----

export function castBook(input: { book: Book }): string {
  const ctx = analyze({ book: input.book })
  const lines: string[] = []

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (isTypeOnly(val)) continue

    const safeName = sanitizeName(name)

    if (val.form === 'lam') {
      const { params, body } = unwrapLam({ term: val, dep: 0 })
      const paramStr = params.map(p => p.name).join(', ')
      const bodyLines: string[] = []
      castStmt({ term: body, dep: params.length, ctx, lines: bodyLines, indent: 1 })
      lines.push(`export function ${safeName}(${paramStr}) {\n${bodyLines.join('\n')}\n}`)
    } else {
      const expr = castExpr({ term: val, dep: 0, ctx })
      lines.push(`export const ${safeName} = ${expr};`)
    }
  }

  return lines.join('\n\n')
}

export function castTerm(input: { term: Term; dep: number }): string {
  const ctx: EmitCtx = {
    tagMap: new Map(),
    fieldMap: new Map(),
    arityMap: new Map(),
    book: new Map(),
  }
  return castExpr({ term: input.term, dep: input.dep, ctx })
}

// ---- Phase A: Analyze ----

function analyze(input: { book: Book }): EmitCtx {
  const tagMap = new Map<string, number>()
  const fieldMap = new Map<string, string[]>()
  const arityMap = new Map<string, number>()

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)

    if (val.form === 'adt') {
      let localTag = 0
      for (const ctr of val.ctrs) {
        tagMap.set(ctr.name, localTag++)
        fieldMap.set(ctr.name, teleToFieldNames(ctr.tele))
      }
    }

    if (val.form === 'lam') {
      arityMap.set(name, countLamDepth(val))
    }
  }

  return { tagMap, fieldMap, arityMap, book: input.book }
}

function teleToFieldNames(tele: Tele): string[] {
  const names: string[] = []
  let cur = tele
  while (cur.form === 'ext') {
    names.push(cur.name)
    cur = cur.bod({ form: 'var', name: cur.name, idx: 0 })
  }
  return names
}

function countLamDepth(term: Term): number {
  let count = 0
  let cur = term
  while (cur.form === 'lam') {
    count++
    cur = cur.bod({ form: 'var', name: cur.name, idx: count })
  }
  return count
}

// ---- Phase B: Statement Mode ----

function castStmt(input: {
  term: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { term, dep, ctx, lines, indent } = input
  const pad = '  '.repeat(indent)

  switch (term.form) {
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      lines.push(`${pad}const ${name} = ${val};`)
      const bodTerm = term.bod({ form: 'var', name, idx: dep })
      castStmt({ term: bodTerm, dep: dep + 1, ctx, lines, indent })
      return
    }

    case 'app': {
      // Detect App(Mat, scrutinee) → inline switch/if-else
      const { func, args } = unwrapApp(term)
      if (func.form === 'mat' && args.length === 1) {
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep, ctx, lines, indent,
        })
        return
      }
      // Detect App(Swi, scrutinee) → inline if/else
      if (func.form === 'swi' && args.length === 1) {
        castSwiStmt({
          zero: func.zero,
          succ: func.succ,
          scrutinee: args[0]!,
          dep, ctx, lines, indent,
        })
        return
      }
      // Fall through to return expression
      break
    }

    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}console.log(${msg});`)
      castStmt({ term: term.val, dep, ctx, lines, indent })
      return
    }

    case 'ann':
      castStmt({ term: term.val, dep, ctx, lines, indent })
      return

    case 'ins':
      castStmt({ term: term.val, dep, ctx, lines, indent })
      return

    case 'src':
      castStmt({ term: term.val, dep, ctx, lines, indent })
      return

    case 'use':
      castStmt({ term: term.bod(term.val), dep, ctx, lines, indent })
      return

    default:
      break
  }

  // Default: emit as return expression
  const expr = castExpr({ term, dep, ctx })
  lines.push(`${pad}return ${expr};`)
}

function castMatchStmt(input: {
  arms: Array<[string, Term]>
  scrutinee: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { arms, scrutinee, dep, ctx, lines, indent } = input
  const pad = '  '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })
  const scrVar = `$$m`
  lines.push(`${pad}const ${scrVar} = ${scrExpr};`)

  const useTag = ctx.tagMap.size > 0
  const tagField = useTag ? '$' : 'tag'

  if (arms.length === 2) {
    // if/else for 2 arms
    const [arm0, arm1] = [arms[0]!, arms[1]!]
    const tag0 = useTag ? ctx.tagMap.get(arm0[0]) : undefined
    const tag0Str = tag0 !== undefined ? String(tag0) : JSON.stringify(arm0[0])

    lines.push(`${pad}if (${scrVar}.${tagField} === ${tag0Str}) {`)
    castArmBody({ name: arm0[0], bod: arm0[1], scrVar, dep, ctx, lines, indent: indent + 1 })
    lines.push(`${pad}} else {`)
    castArmBody({ name: arm1[0], bod: arm1[1], scrVar, dep, ctx, lines, indent: indent + 1 })
    lines.push(`${pad}}`)
  } else {
    // switch for 3+ arms
    lines.push(`${pad}switch (${scrVar}.${tagField}) {`)
    for (const [name, bod] of arms) {
      const tag = useTag ? ctx.tagMap.get(name) : undefined
      const tagStr = tag !== undefined ? String(tag) : JSON.stringify(name)
      lines.push(`${pad}  case ${tagStr}: {`)
      castArmBody({ name, bod, scrVar, dep, ctx, lines, indent: indent + 2 })
      lines.push(`${pad}  }`)
    }
    lines.push(`${pad}  default: throw new Error("no match");`)
    lines.push(`${pad}}`)
  }
}

function castArmBody(input: {
  name: string
  bod: Term
  scrVar: string
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { name, bod, scrVar, dep, ctx, lines, indent } = input
  const pad = '  '.repeat(indent)

  let armBod = bod
  let armDep = dep

  if (armBod.form === 'lam') {
    const fields = ctx.fieldMap.get(name) ?? []
    let fieldIdx = 0
    while (armBod.form === 'lam') {
      const fieldName = fields[fieldIdx] ?? `_${fieldIdx}`
      const paramName = varName({ name: armBod.name, dep: armDep })
      lines.push(`${pad}const ${paramName} = ${scrVar}.${fieldName};`)
      armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
      armDep++
      fieldIdx++
    }
  }

  castStmt({ term: armBod, dep: armDep, ctx, lines, indent })
}

function castSwiStmt(input: {
  zero: Term
  succ: Term
  scrutinee: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { zero, succ, scrutinee, dep, ctx, lines, indent } = input
  const pad = '  '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })
  const scrVar = `$$n`
  lines.push(`${pad}const ${scrVar} = ${scrExpr};`)
  lines.push(`${pad}if (${scrVar} === 0) {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1 })

  if (succ.form === 'lam') {
    const pName = varName({ name: succ.name, dep })
    const innerPad = '  '.repeat(indent + 1)
    lines.push(`${pad}} else {`)
    lines.push(`${innerPad}const ${pName} = ${scrVar} - 1;`)
    const succBod = succ.bod({ form: 'var', name: pName, idx: dep })
    castStmt({ term: succBod, dep: dep + 1, ctx, lines, indent: indent + 1 })
  } else {
    lines.push(`${pad}} else {`)
    const succExpr = castExpr({ term: succ, dep, ctx })
    const innerPad = '  '.repeat(indent + 1)
    lines.push(`${innerPad}return (${succExpr})(${scrVar} - 1);`)
  }

  lines.push(`${pad}}`)
}

// ---- Phase B: Expression Mode ----

function castExpr(input: { term: Term; dep: number; ctx: EmitCtx }): string {
  const { term, dep, ctx } = input

  switch (term.form) {
    case 'lam': {
      const { params, body } = unwrapLam({ term, dep })
      const paramStr = params.map(p => p.name).join(', ')
      const bodyExpr = castExpr({ term: body, dep: dep + params.length, ctx })
      if (params.length === 1) return `(${paramStr}) => ${bodyExpr}`
      return `(${paramStr}) => ${bodyExpr}`
    }

    case 'app': {
      const { func, args } = unwrapApp(term)

      // App(Mat, scrutinee) in expression context → IIFE with switch
      if (func.form === 'mat' && args.length === 1) {
        const bodyLines: string[] = []
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep, ctx, lines: bodyLines, indent: 1,
        })
        return `(() => {\n${bodyLines.join('\n')}\n})()`
      }

      // App(Swi, scrutinee) in expression context → ternary
      if (func.form === 'swi' && args.length === 1) {
        const scrExpr = castExpr({ term: args[0]!, dep, ctx })
        const zeroExpr = castExpr({ term: func.zero, dep, ctx })
        if (func.succ.form === 'lam') {
          const pName = varName({ name: func.succ.name, dep })
          const succBod = func.succ.bod({ form: 'var', name: pName, idx: dep })
          const succExpr = castExpr({ term: succBod, dep: dep + 1, ctx })
          return `(${scrExpr} === 0 ? ${zeroExpr} : ((${pName}) => ${succExpr})(${scrExpr} - 1))`
        }
        const succExpr = castExpr({ term: func.succ, dep, ctx })
        return `(${scrExpr} === 0 ? ${zeroExpr} : (${succExpr})(${scrExpr} - 1))`
      }

      // Multi-arg call
      const funcStr = castExpr({ term: func, dep, ctx })
      const argsStr = args.map(a => castExpr({ term: a, dep, ctx }))
      return `${funcStr}(${argsStr.join(', ')})`
    }

    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      const body = castExpr({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1, ctx,
      })
      return `(() => { const ${name} = ${val}; return ${body}; })()`
    }

    case 'use':
      return castExpr({ term: term.bod(term.val), dep, ctx })

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
      const useTag = ctx.tagMap.size > 0
      const tag = useTag ? ctx.tagMap.get(term.name) : undefined

      if (term.args.length === 0) {
        if (tag !== undefined) return `({ $: ${tag} })`
        return `({ tag: ${JSON.stringify(term.name)} })`
      }
      const fields = term.args
        .map(([field, t], i) => {
          const val = castExpr({ term: t, dep, ctx })
          const key = field ?? `_${i}`
          return `${key}: ${val}`
        })
        .join(', ')
      if (tag !== undefined) return `({ $: ${tag}, ${fields} })`
      return `({ tag: ${JSON.stringify(term.name)}, ${fields} })`
    }

    case 'mat': {
      // Mat without application (standalone match function)
      const useTag = ctx.tagMap.size > 0
      const tagField = useTag ? '$' : 'tag'
      const arms = term.arms
        .map(([name, bod]) => {
          const tag = useTag ? ctx.tagMap.get(name) : undefined
          const tagStr = tag !== undefined ? String(tag) : JSON.stringify(name)
          const bodStr = castExpr({ term: bod, dep, ctx })
          return `    case ${tagStr}: return ${bodStr};`
        })
        .join('\n')
      return [
        '($$v) => {',
        `  switch ($$v.${tagField}) {\n${arms}`,
        '    default: throw new Error("no match");',
        '  }',
        '}',
      ].join('\n')
    }

    case 'swi': {
      const zero = castExpr({ term: term.zero, dep, ctx })
      const succ = castExpr({ term: term.succ, dep, ctx })
      return `($$n) => ($$n === 0 ? ${zero} : (${succ})($$n - 1))`
    }

    case 'op2': {
      const op = castOper(term.oper)
      const a = castExpr({ term: term.a, dep, ctx })
      const b = castExpr({ term: term.b, dep, ctx })
      return `(${a} ${op} ${b})`
    }

    case 'lst': {
      if (term.list.length === 0) return '[]'
      const items = term.list.map(t => castExpr({ term: t, dep, ctx }))
      return `[${items.join(', ')}]`
    }

    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      const val = castExpr({ term: term.val, dep, ctx })
      return `(console.log(${msg}), ${val})`
    }

    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
      return 'undefined'

    case 'ann':
      return castExpr({ term: term.val, dep, ctx })

    case 'ins':
      return castExpr({ term: term.val, dep, ctx })

    case 'src':
      return castExpr({ term: term.val, dep, ctx })

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

function unwrapLam(input: { term: Term; dep: number }): {
  params: Array<{ name: string }>
  body: Term
} {
  const params: Array<{ name: string }> = []
  let cur = input.term
  let d = input.dep
  while (cur.form === 'lam') {
    const name = varName({ name: cur.name, dep: d })
    params.push({ name })
    cur = cur.bod({ form: 'var', name, idx: d })
    d++
  }
  return { params, body: cur }
}

function unwrapApp(term: Term): { func: Term; args: Term[] } {
  const args: Term[] = []
  let cur = term
  while (cur.form === 'app') {
    args.unshift(cur.argm)
    cur = cur.func
  }
  return { func: cur, args }
}

function unwrapAnn(term: Term): Term {
  if (term.form === 'ann') return unwrapAnn(term.val)
  if (term.form === 'src') return unwrapAnn(term.val)
  return term
}

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

function varName(input: { name: string; dep: number }): string {
  const { name, dep } = input
  if (name === '_') return `_${dep}`
  return name
}

function sanitizeName(name: string): string {
  return name.replace(/[/.-]/g, '_')
}

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
