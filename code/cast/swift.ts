/**
 * Swift code generation from Core Terms.
 *
 * Two-phase codegen (same architecture as TypeScript backend):
 *   Phase A: Analyze the Book to build tag/field/arity maps.
 *   Phase B: Emit using statement mode and expression mode.
 *
 * Swift-specific patterns:
 *   - ADTs → enums with associated values
 *   - Pattern matching → switch with case let bindings
 *   - Lambdas → closures { params in body }
 *   - Tail recursion → while true { ... } with reassignment
 *   - Numbers → Int / Double
 *   - Strings → String (native)
 */

import type { Term, Book, Oper, Tele } from '@/term/form'
import type { TraitMeta } from '@/cast/trait'
import type { AsyncMeta } from '@/term/desugar'

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  arityMap: Map<string, number>
  ctrToEnum: Map<string, string>
  headParams: Map<string, string[]>
  book: Book
}

type TailCtx = {
  refName: string
  params: string[]
} | null

/** Check if a form name is the maybe/optional type. */
function isMaybe(name: string): boolean {
  return name === 'maybe'
}

// ---- Public API ----

export function castBook(input: { book: Book; traits?: TraitMeta; asyncMeta?: AsyncMeta }): string {
  const ctx = analyze({ book: input.book })
  const asyncMeta = input.asyncMeta ?? new Map()
  const lines: string[] = []

  // Build set of method names that belong to impl blocks
  const implMethods = new Set<string>()
  for (const impl of input.traits?.impls ?? []) {
    for (const m of impl.methods) implMethods.add(m)
  }

  // Phase 1: Error type (emitted if any function uses halt)
  let needsError = false
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form !== 'adt' && !isTypeOnly(val)) {
      if (hasHaltCall({ term: val, dep: 0 })) {
        needsError = true
        break
      }
    }
  }
  if (needsError) {
    lines.push(`struct SeedError: Error {\n    let message: String\n}`)
  }

  // Phase 2: Enums
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      if (isMaybe(name)) continue
      lines.push(castEnum({ name, term: val, ctx }))
    }
  }

  // Phase 3: Protocols (from masks)
  for (const mask of input.traits?.masks ?? []) {
    lines.push(castProtocol({ mask }))
  }

  // Phase 4: Extensions (from impls)
  for (const impl of input.traits?.impls ?? []) {
    lines.push(castExtension({ impl, ctx, masks: input.traits?.masks ?? [] }))
  }

  // Phase 5: Standalone functions (skip impl methods)
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)

    if (val.form === 'adt') continue
    if (isTypeOnly(val)) continue
    if (implMethods.has(name)) continue

    const safeName = camelCase(name)

    if (val.form === 'lam') {
      const isAsync = asyncMeta.get(name) === true
      lines.push(castFunction({ name, safeName, term: val, ctx, isAsync }))
    } else {
      const expr = castExpr({ term: val, dep: 0, ctx })
      lines.push(`let ${safeName}: Any = ${expr}`)
    }
  }

  return lines.join('\n\n')
}

function castFunction(input: {
  name: string
  safeName: string
  term: Term & { form: 'lam' }
  ctx: EmitCtx
  isAsync?: boolean
}): string {
  const { name, safeName, ctx, isAsync } = input
  const heads = ctx.headParams.get(name) ?? []
  const genericStr = heads.length > 0 ? `<${heads.map(h => capitalize(h)).join(', ')}>` : ''

  // Skip head param lambdas
  let valTerm: Term = input.term
  let headDep = 0
  for (let i = 0; i < heads.length; i++) {
    if (valTerm.form === 'lam') {
      valTerm = valTerm.bod({ form: 'var', name: valTerm.name, idx: headDep })
      headDep++
    }
  }

  const { params, body } = unwrapLam({ term: valTerm, dep: headDep })
  const totalDep = headDep + params.length
  const usesHalt = hasHaltCall({ term: body, dep: totalDep })
  const paramStr = params.map(p => `_ ${p.name}: Any`).join(', ')
  const paramNames = params.map(p => p.name)
  const isTailRec = hasSelfTailCall({
    term: body,
    refName: name,
    arity: totalDep,
    dep: totalDep,
  })
  const tail: TailCtx = isTailRec
    ? { refName: name, params: paramNames }
    : null
  const bodyLines: string[] = []
  const bodyIndent = isTailRec ? 2 : 1
  castStmt({
    term: body,
    dep: totalDep,
    ctx,
    lines: bodyLines,
    indent: bodyIndent,
    tail,
  })
  const asyncSuffix = isAsync ? ' async' : ''
  const throwsSuffix = usesHalt ? ' throws' : ''
  if (isTailRec) {
    const varParamStr = params
      .map(p => `_ ${p.name}: Any`)
      .join(', ')
    return `func ${safeName}${genericStr}(${varParamStr})${asyncSuffix}${throwsSuffix} -> Any {\n    var ${paramNames.map(p => `${p} = ${p}`).join('; var ')};\n    while true {\n${bodyLines.join('\n')}\n    }\n}`
  }
  return `func ${safeName}${genericStr}(${paramStr})${asyncSuffix}${throwsSuffix} -> Any {\n${bodyLines.join('\n')}\n}`
}

function capitalize(name: string): string {
  if (!name) return name
  return name[0]!.toUpperCase() + name.slice(1)
}

// ---- Protocol / Extension Generation ----

function castProtocol(input: {
  mask: import('@/cast/trait').MaskInfo
}): string {
  const { mask } = input
  const protocolName = pascalCase(mask.name)
  const lines: string[] = []
  lines.push(`protocol ${protocolName} {`)
  for (const method of mask.methods) {
    const safeName = camelCase(method.name)
    const params: string[] = []
    for (const p of method.params) {
      if (p.name === 'self') continue
      params.push(`_ ${camelCase(p.name)}: Any`)
    }
    lines.push(`    func ${safeName}(${params.join(', ')}) -> Any`)
  }
  lines.push('}')
  return lines.join('\n')
}

function castExtension(input: {
  impl: import('@/cast/trait').ImplInfo
  ctx: EmitCtx
  masks: import('@/cast/trait').MaskInfo[]
}): string {
  const { ctx, masks } = input
  const implInfo = input.impl
  const formName = pascalCase(implInfo.formName)
  const lines: string[] = []

  if (implInfo.maskName) {
    const maskName = pascalCase(implInfo.maskName)
    lines.push(`extension ${formName}: ${maskName} {`)
  } else {
    lines.push(`extension ${formName} {`)
  }

  for (const bookKey of implInfo.methods) {
    const term = ctx.book.get(bookKey)
    if (!term) continue

    const shortName = bookKey.includes('/') ? bookKey.split('/').pop()! : bookKey
    const safeName = camelCase(shortName)
    const val = unwrapAnn(term)

    if (val.form === 'lam') {
      const { params, body } = unwrapLam({ term: val, dep: 0 })

      // Skip self param (implicit in Swift extensions)
      const hasSelfParam = params.length > 0 && params[0]!.name === 'self'
      const startIdx = hasSelfParam ? 1 : 0
      const methodParams: string[] = []
      for (let i = startIdx; i < params.length; i++) {
        methodParams.push(`_ ${params[i]!.name}: Any`)
      }
      const paramStr = methodParams.join(', ')

      const bodyLines: string[] = []
      castStmt({
        term: body,
        dep: params.length,
        ctx,
        lines: bodyLines,
        indent: 2,
      })
      lines.push(
        `    func ${safeName}(${paramStr}) -> Any {\n${bodyLines.join('\n')}\n    }`,
      )
    }
  }

  lines.push('}')
  return lines.join('\n')
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
  lines.push(`enum ${enumName} {`)
  for (const ctr of term.ctrs) {
    const fields = teleToFieldNames(ctr.tele)
    const ctrName = swiftIdent(camelCase(ctr.name))
    if (fields.length === 0) {
      lines.push(`    case ${ctrName}`)
    } else {
      const fieldStr = fields
        .map(f => `${camelCase(f)}: Any`)
        .join(', ')
      lines.push(`    case ${ctrName}(${fieldStr})`)
    }
  }
  lines.push('}')
  return lines.join('\n')
}

// ---- Phase A: Analyze ----

function analyze(input: { book: Book }): EmitCtx {
  const tagMap = new Map<string, number>()
  const fieldMap = new Map<string, string[]>()
  const arityMap = new Map<string, number>()
  const ctrToEnum = new Map<string, string>()
  const headParams = new Map<string, string[]>()

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
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
    const heads = extractHeadParams(term)
    if (heads.length > 0) {
      headParams.set(name, heads)
    }
  }

  return { tagMap, fieldMap, arityMap, ctrToEnum, headParams, book: input.book }
}

function extractHeadParams(term: Term): string[] {
  let typ: Term = term
  if (typ.form === 'ann') typ = typ.typ
  if (typ.form === 'src') typ = (typ as any).val
  const params: string[] = []
  while (typ.form === 'all' && typ.inp.form === 'set') {
    params.push(typ.name)
    typ = typ.bod({ form: 'var', name: typ.name, idx: 0 })
  }
  return params
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
      lines.push(`${pad}let ${name} = ${val}`)
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
      // .test(Mat, condition) → if/else on native boolean
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        castBoolTestStmt({
          arms: args[0]!.arms,
          scrutinee: args[1]!,
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
          lines.push(`${pad}for ${name} in ${iterExpr} {`)
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
          lines.push(`${pad}${tail.params[0]} = ${argExpr}`)
        } else {
          for (let i = 0; i < args.length; i++) {
            const argExpr = castExpr({ term: args[i]!, dep, ctx })
            lines.push(`${pad}let next_${tail.params[i]} = ${argExpr}`)
          }
          for (let i = 0; i < tail.params.length; i++) {
            lines.push(
              `${pad}${tail.params[i]} = next_${tail.params[i]}`,
            )
          }
        }
        lines.push(`${pad}continue`)
        return
      }
      break
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}print(${msg})`)
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
    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}throw SeedError(message: "\\(${msg})")`)
      return
    }
    case 'rst': {
      lines.push(`${pad}// breakpoint`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    }
    case 'nxt': {
      lines.push(`${pad}continue`)
      return
    }
  }

  const expr = castExpr({ term, dep, ctx })
  lines.push(`${pad}return ${expr}`)
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

  // Detect maybe type for native optional matching
  const firstCtr = arms[0]?.[0]
  const firstEnumType = firstCtr ? ctx.ctrToEnum.get(firstCtr) : undefined
  const isMaybeMatch = firstEnumType !== undefined && isMaybe(firstEnumType)

  if (isMaybeMatch) {
    // Native optional: if let value = expr { ... } else { ... }
    const someArm = arms.find(([n]) => n === 'some')
    const noneArm = arms.find(([n]) => n === 'none')
    if (someArm) {
      let armBod = someArm[1]
      let armDep = dep
      const paramNames: string[] = []
      while (armBod.form === 'lam') {
        const paramName = varName({ name: armBod.name, dep: armDep })
        paramNames.push(paramName)
        armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
        armDep++
      }
      const bindName = paramNames.length > 0 ? paramNames[0]! : '_'
      lines.push(`${pad}if let ${bindName} = ${scrExpr} {`)
      castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 1, tail })
      lines.push(`${pad}} else {`)
    } else {
      lines.push(`${pad}if ${scrExpr} != nil {`)
      lines.push(`${pad}} else {`)
    }
    if (noneArm) {
      let armBod = noneArm[1]
      let armDep = dep
      while (armBod.form === 'lam') {
        const paramName = varName({ name: armBod.name, dep: armDep })
        armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
        armDep++
      }
      castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 1, tail })
    }
    lines.push(`${pad}}`)
    return
  }

  // Determine the enum type from the first arm's constructor
  const enumType = firstCtr ? ctx.ctrToEnum.get(firstCtr) : undefined
  const castExprStr = enumType
    ? `${scrExpr} as! ${pascalCase(enumType)}`
    : scrExpr

  lines.push(`${pad}switch ${castExprStr} {`)
  for (const [name, bod] of arms) {
    const ctrName = swiftIdent(camelCase(name))
    const fields = ctx.fieldMap.get(name) ?? []

    let armBod = bod
    let armDep = dep
    const bindings: string[] = []

    if (armBod.form === 'lam') {
      let fieldIdx = 0
      while (armBod.form === 'lam') {
        const fieldName = fields[fieldIdx] ?? `_${fieldIdx}`
        const paramName = varName({ name: armBod.name, dep: armDep })
        bindings.push(`${camelCase(fieldName)}: let ${paramName}`)
        armBod = armBod.bod({
          form: 'var',
          name: paramName,
          idx: armDep,
        })
        armDep++
        fieldIdx++
      }
    }

    const prefix = `.${ctrName}`
    const bindStr =
      bindings.length > 0 ? `(${bindings.join(', ')})` : ''
    lines.push(`${pad}    case ${prefix}${bindStr}:`)
    castStmt({
      term: armBod,
      dep: armDep,
      ctx,
      lines,
      indent: indent + 2,
      tail,
    })
  }
  lines.push(`${pad}}`)
}

/** Emit if/else for boolean test (fork test). Scrutinee is a native Bool. */
function castBoolTestStmt(input: {
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

  const trueArm = arms.find(([n]) => n === 'true')
  const falseArm = arms.find(([n]) => n === 'false')

  lines.push(`${pad}if ${scrExpr} as! Bool {`)
  if (trueArm) {
    let armBod = trueArm[1]
    let armDep = dep
    while (armBod.form === 'lam') {
      armBod = armBod.bod({ form: 'var', name: armBod.name, idx: armDep })
      armDep++
    }
    castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 1, tail })
  }
  lines.push(`${pad}} else {`)
  if (falseArm) {
    let armBod = falseArm[1]
    let armDep = dep
    while (armBod.form === 'lam') {
      armBod = armBod.bod({ form: 'var', name: armBod.name, idx: armDep })
      armDep++
    }
    castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 1, tail })
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

  lines.push(`${pad}if ${scrExpr} as! Int == 0 {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail })

  if (succ.form === 'lam') {
    const pName = varName({ name: succ.name, dep })
    lines.push(`${pad}} else {`)
    lines.push(`${pad}    let ${pName} = (${scrExpr} as! Int) - 1`)
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
    lines.push(
      `${pad}    return (${succExpr} as! (Any) -> Any)((${scrExpr} as! Int) - 1)`,
    )
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
      const paramStr = params.map(p => `${p.name}: Any`).join(', ')
      const bodyExpr = castExpr({
        term: body,
        dep: dep + params.length,
        ctx,
      })
      return `{ (${paramStr}) -> Any in ${bodyExpr} }`
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
        return `{\n${bodyLines.join('\n')}\n}()`
      }
      // .test(Mat, condition) → inline if/else expression on native boolean
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        const bodyLines: string[] = []
        castBoolTestStmt({
          arms: args[0]!.arms,
          scrutinee: args[1]!,
          dep,
          ctx,
          lines: bodyLines,
          indent: 1,
        })
        return `{\n${bodyLines.join('\n')}\n}()`
      }
      if (func.form === 'ref' && (func.name.startsWith('.') || func.name.startsWith('!'))) {
        const prim = func.name.slice(1)
        // .wait → await expr
        if (prim === 'wait' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx })
          return `await ${inner}`
        }
        if (prim === 'safe' && args.length === 1) {
          return castExpr({ term: args[0]!, dep, ctx })
        }
        if (prim === 'and' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx }))
          return `(${parts.join(' && ')})`
        }
        if (prim === 'or' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx }))
          return `(${parts.join(' || ')})`
        }
        if (args.length >= 1) {
          const obj = castExpr({ term: args[0]!, dep, ctx })
          const methodName = camelCase(prim)
          if (args.length === 1) return `${obj}.${methodName}()`
          const methodArgs = args
            .slice(1)
            .map(a => castExpr({ term: a, dep, ctx }))
          return `${obj}.${methodName}(${methodArgs.join(', ')})`
        }
      }
      const funcStr = castExpr({ term: func, dep, ctx })
      const argsStr = args.map(a => castExpr({ term: a, dep, ctx }))
      return `(${funcStr} as! (${args.map(() => 'Any').join(', ')}) -> Any)(${argsStr.join(', ')})`
    }
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      const body = castExpr({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
      })
      return `{ let ${name} = ${val}; return ${body} }()`
    }
    case 'use':
      return castExpr({ term: term.bod(term.val), dep, ctx })
    case 'ref':
      return camelCase(term.name)
    case 'var':
      return term.name
    case 'num':
      return String(term.val)
    case 'txt':
      return JSON.stringify(term.val)
    case 'nat':
      return String(term.val)
    case 'con': {
      const enumType = findEnumForCtr({ name: term.name, ctx })
      // Native optional: maybe → nil/value
      if (enumType && isMaybe(enumType)) {
        if (term.name === 'none') return 'nil'
        if (term.name === 'some' && term.args.length > 0) {
          return castExpr({ term: term.args[0]![1], dep, ctx })
        }
      }
      const ctrName = swiftIdent(camelCase(term.name))
      const prefix = enumType
        ? `${pascalCase(enumType)}.${ctrName}`
        : `.${ctrName}`
      if (term.args.length === 0) return prefix
      const fields = term.args
        .map(([field, t]) => {
          const val = castExpr({ term: t, dep, ctx })
          const key = field ? camelCase(field) : '_'
          return `${key}: ${val}`
        })
        .join(', ')
      return `${prefix}(${fields})`
    }
    case 'op2': {
      const op = castOper(term.oper)
      const a = castExpr({ term: term.a, dep, ctx })
      const b = castExpr({ term: term.b, dep, ctx })
      return `((${a} as! Int) ${op} (${b} as! Int))`
    }
    case 'lst': {
      if (term.list.length === 0) return '[Any]()'
      const items = term.list.map(t => castExpr({ term: t, dep, ctx }))
      return `[${items.join(', ')}] as [Any]`
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      const val = castExpr({ term: term.val, dep, ctx })
      return `{ print(${msg}); return ${val} }()`
    }
    case 'all':
    case 'set':
    case 'u64':
    case 'f64':
    case 'slf':
    case 'adt':
      return '() as Any'
    case 'ann':
      return castExpr({ term: term.val, dep, ctx })
    case 'ins':
      return castExpr({ term: term.val, dep, ctx })
    case 'src':
      return castExpr({ term: term.val, dep, ctx })
    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      return `{ throw SeedError(message: "\\(${msg})") }()`
    }
    case 'rst': {
      const val = castExpr({ term: term.val, dep, ctx })
      return `{ /* breakpoint */ return ${val} }()`
    }
    case 'nxt':
      return '() as Any /* continue */'
    case 'hol':
      return `fatalError(${JSON.stringify(`hole: ${term.name}`)})`
    case 'met':
      return `() as Any /* meta ${term.uid} */`
    default:
      return '() as Any'
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
  return camelCase(input.name)
}

function camelCase(name: string): string {
  return name.replace(/[/.\-](.)/g, (_, c) => c.toUpperCase())
}

function pascalCase(name: string): string {
  return name.replace(/(^|[/.\-])(.)/g, (_, __, c) => c.toUpperCase())
}

function findEnumForCtr(input: {
  name: string
  ctx: EmitCtx
}): string | null {
  return input.ctx.ctrToEnum.get(input.name) ?? null
}

const SWIFT_KEYWORDS = new Set([
  'true', 'false', 'nil', 'self', 'Self', 'super',
  'class', 'struct', 'enum', 'protocol', 'extension',
  'func', 'var', 'let', 'import', 'return', 'if', 'else',
  'switch', 'case', 'default', 'for', 'while', 'repeat',
  'break', 'continue', 'in', 'is', 'as', 'try', 'throw',
  'throws', 'catch', 'where', 'guard', 'do', 'init', 'deinit',
  'typealias', 'associatedtype', 'operator', 'subscript',
])

/** Escape Swift reserved keywords with backticks. */
function swiftIdent(name: string): string {
  if (SWIFT_KEYWORDS.has(name)) return `\`${name}\``
  return name
}

function hasHaltCall(input: { term: Term; dep: number }): boolean {
  const { term, dep } = input
  switch (term.form) {
    case 'hlt':
      return true
    case 'app': {
      const { func, args } = unwrapApp(term)
      if (func.form === 'ref' && func.name === '.halt') return true
      if (hasHaltCall({ term: func, dep })) return true
      return args.some(a => hasHaltCall({ term: a, dep }))
    }
    case 'let':
      return (
        hasHaltCall({ term: term.val, dep }) ||
        hasHaltCall({
          term: term.bod({ form: 'var', name: term.name, idx: dep }),
          dep: dep + 1,
        })
      )
    case 'lam':
      return hasHaltCall({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        dep: dep + 1,
      })
    case 'ann':
    case 'ins':
    case 'src':
      return hasHaltCall({ term: term.val, dep })
    case 'use':
      return hasHaltCall({ term: term.bod(term.val), dep })
    case 'log':
      return (
        hasHaltCall({ term: term.msg, dep }) ||
        hasHaltCall({ term: term.val, dep })
      )
    case 'rst':
      return hasHaltCall({ term: term.val, dep })
    case 'mat':
      return term.arms.some(([, bod]) => hasHaltCall({ term: bod, dep }))
    case 'swi':
      return (
        hasHaltCall({ term: term.zero, dep }) ||
        hasHaltCall({ term: term.succ, dep })
      )
    default:
      return false
  }
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
