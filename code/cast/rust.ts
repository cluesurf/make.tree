/**
 * Rust code generation from Core Terms.
 *
 * Two-phase codegen (same architecture as TypeScript backend):
 *   Phase A: Analyze the Book to build tag/field/arity maps.
 *   Phase B: Emit using statement mode and expression mode.
 *
 * Rust-specific patterns:
 *   - ADTs → enums with named fields
 *   - Pattern matching → match expressions
 *   - Lambdas → closures |x| body
 *   - Multi-use variables → .clone() calls (future: usage analysis)
 *   - Tail recursion → loop { ... } with reassignment
 */

import type { Term, Book, Oper, Tele } from '@/term/form'

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  arityMap: Map<string, number>
  ctrToEnum: Map<string, string>
  enumNames: Set<string>
  book: Book
}

type TailCtx = {
  refName: string
  params: string[]
} | null

// ---- Public API ----

export function castBook(input: { book: Book }): string {
  const ctx = analyze({ book: input.book })
  const lines: string[] = []

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)

    if (val.form === 'adt') {
      lines.push(castEnum({ name, term: val, ctx }))
      continue
    }

    if (isTypeOnly(val)) continue

    const safeName = snakeCase(name)
    const paramTypes = extractParamTypes({ term, ctx })
    const returnType = inferReturnType({ term, ctx })

    if (val.form === 'lam') {
      const { params, body } = unwrapLam({ term: val, dep: 0 })
      const paramStr = params
        .map((p, i) => {
          const typ = paramTypes[i] ?? 'impl Clone'
          return `${p.name}: ${typ}`
        })
        .join(', ')
      const paramNames = params.map(p => p.name)
      const isTailRec = hasSelfTailCall({
        term: body,
        refName: name,
        arity: params.length,
        dep: params.length,
      })
      const tail: TailCtx = isTailRec
        ? { refName: name, params: paramNames }
        : null
      const bodyLines: string[] = []
      const bodyIndent = isTailRec ? 2 : 1
      castStmt({
        term: body,
        dep: params.length,
        ctx,
        lines: bodyLines,
        indent: bodyIndent,
        tail,
      })
      if (isTailRec) {
        lines.push(
          `fn ${safeName}(${paramStr}) -> ${returnType} {\n    loop {\n${bodyLines.join('\n')}\n    }\n}`,
        )
      } else {
        lines.push(
          `fn ${safeName}(${paramStr}) -> ${returnType} {\n${bodyLines.join('\n')}\n}`,
        )
      }
    } else {
      const expr = castExpr({ term: val, dep: 0, ctx })
      lines.push(`fn ${safeName}() -> ${returnType} { ${expr} }`)
    }
  }

  return lines.join('\n\n')
}

// ---- Enum Generation ----

function castEnum(input: {
  name: string
  term: Term & { form: 'adt' }
  ctx: EmitCtx
}): string {
  const { term } = input
  const enumName = pascalCase(input.name)
  const lines: string[] = []
  lines.push(`#[derive(Clone, Debug, PartialEq)]`)
  lines.push(`enum ${enumName} {`)
  for (const ctr of term.ctrs) {
    const fields = teleToFieldNames(ctr.tele)
    const ctrName = pascalCase(ctr.name)
    if (fields.length === 0) {
      lines.push(`    ${ctrName},`)
    } else {
      const fieldStr = fields
        .map(f => `${snakeCase(f)}: Box<dyn std::any::Any>`)
        .join(', ')
      lines.push(`    ${ctrName} { ${fieldStr} },`)
    }
  }
  lines.push('}')
  return lines.join('\n')
}

// ---- Type Resolution ----

function extractParamTypes(input: {
  term: Term
  ctx: EmitCtx
}): string[] {
  const { term, ctx } = input
  if (term.form !== 'ann') return []
  let typ = term.typ
  const types: string[] = []
  while (typ.form === 'all') {
    types.push(resolveRustType({ term: typ.inp, ctx }))
    typ = typ.bod({ form: 'var', name: typ.name, idx: 0 })
  }
  return types
}

function inferReturnType(input: {
  term: Term
  ctx: EmitCtx
}): string {
  const { term, ctx } = input
  const val = unwrapAnn(term)

  let body = val
  while (body.form === 'lam') {
    body = body.bod({ form: 'var', name: body.name, idx: 0 })
  }

  const adts = new Set<string>()
  collectConstructorADTs({ term: body, ctx, adts })

  if (adts.size === 1) {
    const formName = [...adts][0]!
    return pascalCase(formName)
  }

  const paramTypes = extractParamTypes({ term, ctx })
  const enumParamTypes = paramTypes.filter(
    t => t !== 'impl Clone' && t !== 'u64' && t !== 'f64',
  )
  if (enumParamTypes.length > 0) {
    const first = enumParamTypes[0]!
    if (enumParamTypes.every(t => t === first)) {
      return first
    }
  }

  return 'impl Clone'
}

function collectConstructorADTs(input: {
  term: Term
  ctx: EmitCtx
  adts: Set<string>
}): void {
  const { term, ctx, adts } = input
  switch (term.form) {
    case 'con': {
      const adt = ctx.ctrToEnum.get(term.name)
      if (adt) adts.add(adt)
      for (const [, arg] of term.args) {
        collectConstructorADTs({ term: arg, ctx, adts })
      }
      break
    }
    case 'app':
      collectConstructorADTs({ term: term.func, ctx, adts })
      collectConstructorADTs({ term: term.argm, ctx, adts })
      break
    case 'let':
      collectConstructorADTs({ term: term.val, ctx, adts })
      collectConstructorADTs({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
      })
      break
    case 'mat':
      for (const [, bod] of term.arms) {
        collectConstructorADTs({ term: bod, ctx, adts })
      }
      break
    case 'lam':
      collectConstructorADTs({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
      })
      break
    case 'ann':
      collectConstructorADTs({ term: term.val, ctx, adts })
      break
    case 'ins':
      collectConstructorADTs({ term: term.val, ctx, adts })
      break
    case 'src':
      collectConstructorADTs({ term: term.val, ctx, adts })
      break
    case 'use':
      collectConstructorADTs({
        term: term.bod(term.val),
        ctx,
        adts,
      })
      break
    case 'log':
      collectConstructorADTs({ term: term.val, ctx, adts })
      break
    case 'swi':
      collectConstructorADTs({ term: term.zero, ctx, adts })
      collectConstructorADTs({ term: term.succ, ctx, adts })
      break
  }
}

function resolveRustType(input: { term: Term; ctx: EmitCtx }): string {
  const { term, ctx } = input
  if (term.form === 'ref') {
    if (ctx.enumNames.has(term.name)) return pascalCase(term.name)
    return pascalCase(term.name)
  }
  if (term.form === 'u64') return 'u64'
  if (term.form === 'f64') return 'f64'
  return 'impl Clone'
}

// ---- Phase A: Analyze ----

function analyze(input: { book: Book }): EmitCtx {
  const tagMap = new Map<string, number>()
  const fieldMap = new Map<string, string[]>()
  const arityMap = new Map<string, number>()
  const ctrToEnum = new Map<string, string>()
  const enumNames = new Set<string>()

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      enumNames.add(name)
      let localTag = 0
      for (const ctr of val.ctrs) {
        tagMap.set(ctr.name, localTag++)
        fieldMap.set(ctr.name, teleToFieldNames(ctr.tele))
        ctrToEnum.set(ctr.name, name)
      }
    }
    if (val.form === 'lam') {
      arityMap.set(name, countLamDepth(val))
    }
  }

  return {
    tagMap,
    fieldMap,
    arityMap,
    ctrToEnum,
    enumNames,
    book: input.book,
  }
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

function hasSelfTailCall(input: {
  term: Term
  refName: string
  arity: number
  dep: number
}): boolean {
  const { term, refName, arity, dep } = input
  switch (term.form) {
    case 'let':
      return hasSelfTailCall({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        refName,
        arity,
        dep: dep + 1,
      })
    case 'app': {
      const { func, args } = unwrapApp(term)
      if (
        func.form === 'ref' &&
        func.name === refName &&
        args.length === arity
      )
        return true
      if (func.form === 'mat' && args.length === 1) {
        return func.arms.some(([, bod]) => {
          let inner = bod
          let d = dep
          while (inner.form === 'lam') {
            inner = inner.bod({ form: 'var', name: inner.name, idx: d })
            d++
          }
          return hasSelfTailCall({
            term: inner,
            refName,
            arity,
            dep: d,
          })
        })
      }
      if (func.form === 'swi' && args.length === 1) {
        const zeroHas = hasSelfTailCall({
          term: func.zero,
          refName,
          arity,
          dep,
        })
        let succHas = false
        if (func.succ.form === 'lam') {
          succHas = hasSelfTailCall({
            term: func.succ.bod({
              form: 'var',
              name: func.succ.name,
              idx: dep,
            }),
            refName,
            arity,
            dep: dep + 1,
          })
        }
        return zeroHas || succHas
      }
      return false
    }
    case 'ann':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })
    case 'ins':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })
    case 'src':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })
    case 'use':
      return hasSelfTailCall({
        term: term.bod(term.val),
        refName,
        arity,
        dep,
      })
    case 'log':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })
    default:
      return false
  }
}

// ---- Phase B: Statement Mode ----

function castStmt(input: {
  term: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  tail?: TailCtx
}): void {
  const { term, dep, ctx, lines, indent, tail } = input
  const pad = '    '.repeat(indent)

  switch (term.form) {
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      lines.push(`${pad}let ${name} = ${val};`)
      castStmt({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
        lines,
        indent,
        tail,
      })
      return
    }
    case 'app': {
      const { func, args } = unwrapApp(term)
      if (func.form === 'mat' && args.length === 1) {
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep,
          ctx,
          lines,
          indent,
          tail,
        })
        return
      }
      if (func.form === 'swi' && args.length === 1) {
        castSwiStmt({
          zero: func.zero,
          succ: func.succ,
          scrutinee: args[0]!,
          dep,
          ctx,
          lines,
          indent,
          tail,
        })
        return
      }
      if (
        func.form === 'ref' &&
        func.name === '.for' &&
        args.length === 2 &&
        args[1]!.form === 'lam'
      ) {
        const lam = args[1]
        if (lam.form === 'lam') {
          const name = varName({ name: lam.name, dep })
          const iterExpr = castExpr({ term: args[0]!, dep, ctx })
          lines.push(`${pad}for ${name} in ${iterExpr}.iter() {`)
          const bodTerm = lam.bod({ form: 'var', name, idx: dep })
          castStmt({
            term: bodTerm,
            dep: dep + 1,
            ctx,
            lines,
            indent: indent + 1,
          })
          lines.push(`${pad}}`)
        }
        return
      }
      if (
        tail &&
        func.form === 'ref' &&
        func.name === tail.refName &&
        args.length === tail.params.length
      ) {
        if (args.length === 1) {
          const argExpr = castExpr({ term: args[0]!, dep, ctx })
          lines.push(`${pad}${tail.params[0]} = ${argExpr};`)
        } else {
          for (let i = 0; i < args.length; i++) {
            const argExpr = castExpr({ term: args[i]!, dep, ctx })
            lines.push(`${pad}let next_${tail.params[i]} = ${argExpr};`)
          }
          for (let i = 0; i < tail.params.length; i++) {
            lines.push(
              `${pad}${tail.params[i]} = next_${tail.params[i]};`,
            )
          }
        }
        lines.push(`${pad}continue;`)
        return
      }
      break
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}println!("{}", ${msg});`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    }
    case 'ann':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    case 'ins':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    case 'src':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    case 'use':
      castStmt({
        term: term.bod(term.val),
        dep,
        ctx,
        lines,
        indent,
        tail,
      })
      return
  }

  const expr = castExpr({ term, dep, ctx })
  lines.push(`${pad}return ${expr};`)
}

function castMatchStmt(input: {
  arms: [string, Term][]
  scrutinee: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  tail?: TailCtx
}): void {
  const { arms, scrutinee, dep, ctx, lines, indent, tail } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })

  lines.push(`${pad}match ${scrExpr} {`)
  for (const [name, bod] of arms) {
    const ctrName = pascalCase(name)
    const formName = ctx.ctrToEnum.get(name)
    const qualifiedName = formName
      ? `${pascalCase(formName)}::${ctrName}`
      : ctrName
    const fields = ctx.fieldMap.get(name) ?? []

    let armBod = bod
    let armDep = dep
    const bindings: string[] = []

    if (armBod.form === 'lam') {
      let fieldIdx = 0
      while (armBod.form === 'lam') {
        const fieldName = fields[fieldIdx] ?? `_${fieldIdx}`
        const paramName = varName({ name: armBod.name, dep: armDep })
        bindings.push(`${snakeCase(fieldName)}: ${paramName}`)
        armBod = armBod.bod({
          form: 'var',
          name: paramName,
          idx: armDep,
        })
        armDep++
        fieldIdx++
      }
    }

    const bindStr =
      bindings.length > 0 ? ` { ${bindings.join(', ')} }` : ''
    lines.push(`${pad}    ${qualifiedName}${bindStr} => {`)
    castStmt({
      term: armBod,
      dep: armDep,
      ctx,
      lines,
      indent: indent + 2,
      tail,
    })
    lines.push(`${pad}    }`)
  }
  lines.push(`${pad}}`)
}

function castSwiStmt(input: {
  zero: Term
  succ: Term
  scrutinee: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  tail?: TailCtx
}): void {
  const { zero, succ, scrutinee, dep, ctx, lines, indent, tail } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })

  lines.push(`${pad}if ${scrExpr} == 0 {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail })

  if (succ.form === 'lam') {
    const pName = varName({ name: succ.name, dep })
    lines.push(`${pad}} else {`)
    lines.push(`${pad}    let ${pName} = ${scrExpr} - 1;`)
    castStmt({
      term: succ.bod({ form: 'var', name: pName, idx: dep }),
      dep: dep + 1,
      ctx,
      lines,
      indent: indent + 1,
      tail,
    })
  } else {
    lines.push(`${pad}} else {`)
    const succExpr = castExpr({ term: succ, dep, ctx })
    lines.push(`${pad}    return (${succExpr})(${scrExpr} - 1);`)
  }
  lines.push(`${pad}}`)
}

// ---- Phase B: Expression Mode ----

function castExpr(input: {
  term: Term
  dep: number
  ctx: EmitCtx
}): string {
  const { term, dep, ctx } = input

  switch (term.form) {
    case 'lam': {
      const { params, body } = unwrapLam({ term, dep })
      const paramStr = params.map(p => p.name).join(', ')
      const bodyExpr = castExpr({
        term: body,
        dep: dep + params.length,
        ctx,
      })
      return `|${paramStr}| ${bodyExpr}`
    }
    case 'app': {
      const { func, args } = unwrapApp(term)
      if (func.form === 'mat' && args.length === 1) {
        const bodyLines: string[] = []
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep,
          ctx,
          lines: bodyLines,
          indent: 1,
        })
        return `{\n${bodyLines.join('\n')}\n}`
      }
      if (func.form === 'ref' && func.name.startsWith('.')) {
        const prim = func.name.slice(1)
        if (prim === 'safe' && args.length === 1) {
          return castExpr({ term: args[0]!, dep, ctx })
        }
        if (args.length >= 1) {
          const obj = castExpr({ term: args[0]!, dep, ctx })
          const methodName = snakeCase(prim)
          if (args.length === 1) return `${obj}.${methodName}()`
          const methodArgs = args
            .slice(1)
            .map(a => castExpr({ term: a, dep, ctx }))
          return `${obj}.${methodName}(${methodArgs.join(', ')})`
        }
      }
      const funcStr = castExpr({ term: func, dep, ctx })
      const argsStr = args.map(a => castExpr({ term: a, dep, ctx }))
      return `${funcStr}(${argsStr.join(', ')})`
    }
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      const body = castExpr({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
      })
      return `{ let ${name} = ${val}; ${body} }`
    }
    case 'use':
      return castExpr({ term: term.bod(term.val), dep, ctx })
    case 'ref':
      return snakeCase(term.name)
    case 'var':
      return term.name
    case 'num':
      return `${term.val}_u64`
    case 'flt': {
      const s = String(term.val)
      if (s.includes('.')) return `${s}_f64`
      return `${s}.0_f64`
    }
    case 'txt':
      return `String::from(${JSON.stringify(term.val)})`
    case 'nat':
      return `${term.val}_u64`
    case 'con': {
      const ctrName = pascalCase(term.name)
      const formName = ctx.ctrToEnum.get(term.name)
      const qualifiedName = formName
        ? `${pascalCase(formName)}::${ctrName}`
        : ctrName
      if (term.args.length === 0) return qualifiedName
      const fields = term.args
        .map(([field, t]) => {
          const val = castExpr({ term: t, dep, ctx })
          const key = field ? snakeCase(field) : '_'
          return `${key}: ${val}`
        })
        .join(', ')
      return `${qualifiedName} { ${fields} }`
    }
    case 'op2': {
      const op = castOper(term.oper)
      const a = castExpr({ term: term.a, dep, ctx })
      const b = castExpr({ term: term.b, dep, ctx })
      return `(${a} ${op} ${b})`
    }
    case 'lst': {
      if (term.list.length === 0) return 'vec![]'
      const items = term.list.map(t => castExpr({ term: t, dep, ctx }))
      return `vec![${items.join(', ')}]`
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      const val = castExpr({ term: term.val, dep, ctx })
      return `{ println!("{}", ${msg}); ${val} }`
    }
    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
    case 'adt':
      return '()'
    case 'ann':
      return castExpr({ term: term.val, dep, ctx })
    case 'ins':
      return castExpr({ term: term.val, dep, ctx })
    case 'src':
      return castExpr({ term: term.val, dep, ctx })
    case 'hol':
      return `panic!(${JSON.stringify(`hole: ${term.name}`)})`
    case 'met':
      return `() /* meta ${term.uid} */`
    default:
      return '()'
  }
}

// ---- Helpers ----

function unwrapLam(input: { term: Term; dep: number }): {
  params: { name: string }[]
  body: Term
} {
  const params: { name: string }[] = []
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
  if (input.name === '_') return `_${input.dep}`
  return snakeCase(input.name)
}

function snakeCase(name: string): string {
  return name.replace(/[/.]/g, '_').replace(/-/g, '_')
}

function pascalCase(name: string): string {
  return name.replace(/(^|[/.\-])(.)/g, (_, __, c) => c.toUpperCase())
}

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
