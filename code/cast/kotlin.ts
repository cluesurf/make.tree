/**
 * Kotlin code generation from Core Terms.
 *
 * Four-phase codegen:
 *   Phase A: Analyze the Book to build tag/field/arity/ctrToEnum maps.
 *   Phase B: Emit sealed classes, interfaces, impl methods, standalone fns.
 *
 * Kotlin-specific patterns:
 *   - ADTs → sealed class with data class variants
 *   - Traits → interface with method signatures
 *   - Impls → methods inside sealed class body (override fun)
 *   - Pattern matching → when (x) { is Variant -> ... }
 *   - Lambdas → { params -> body }
 *   - Tail recursion → while (true) { ... } with reassignment
 *   - Numbers → Long / Double
 *   - Strings → String (native)
 */

import type { Term, Book, Oper, Tele } from '@/term/form'
import type { TraitMeta, MaskInfo, ImplInfo } from '@/cast/trait'
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
  const implMethodSet = new Set<string>()
  for (const impl of input.traits?.impls ?? []) {
    for (const m of impl.methods) implMethodSet.add(m)
  }

  // Build map: formName → list of impls for that form
  const formImpls = new Map<string, ImplInfo[]>()
  for (const impl of input.traits?.impls ?? []) {
    const list = formImpls.get(impl.formName) ?? []
    list.push(impl)
    formImpls.set(impl.formName, list)
  }

  // Phase 0: Error class (emitted if any function uses halt)
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
    lines.push(`class SeedError(message: String) : Exception(message)`)
  }

  // Phase 1: Sealed classes (with interface conformance + methods)
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      if (isMaybe(name)) continue
      const impls = formImpls.get(name) ?? []
      lines.push(castSealed({
        name,
        term: val,
        ctx,
        impls,
        masks: input.traits?.masks ?? [],
      }))
    }
  }

  // Phase 2: Interfaces (from masks)
  for (const mask of input.traits?.masks ?? []) {
    lines.push(castInterface({ mask }))
  }

  // Phase 3: Standalone functions (skip ADTs, type-only, impl methods)
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)

    if (val.form === 'adt') continue
    if (isTypeOnly(val)) continue
    if (implMethodSet.has(name)) continue

    const safeName = camelCase(name)

    if (val.form === 'lam') {
      const isAsync = asyncMeta.get(name) === true
      lines.push(castFunction({ name, safeName, term: val, ctx, isAsync }))
    } else {
      const expr = castExpr({ term: val, dep: 0, ctx })
      lines.push(`val ${safeName}: Any = ${expr}`)
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
  const genericStr = heads.length > 0 ? `<${heads.map(h => capitalize(h)).join(', ')}> ` : ''

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
  const paramStr = params
    .map(p => `${p.name}: Any`)
    .join(', ')
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
  const suspendPrefix = isAsync ? 'suspend ' : ''
  if (isTailRec) {
    const varDecls = paramNames
      .map(p => `    var ${p} = ${p}`)
      .join('\n')
    return `${suspendPrefix}fun ${genericStr}${safeName}(${paramStr}): Any {\n${varDecls}\n    while (true) {\n${bodyLines.join('\n')}\n    }\n}`
  }
  return `${suspendPrefix}fun ${genericStr}${safeName}(${paramStr}): Any {\n${bodyLines.join('\n')}\n}`
}

function capitalize(name: string): string {
  if (!name) return name
  return name[0]!.toUpperCase() + name.slice(1)
}

// ---- Sealed Class Generation ----

function castSealed(input: {
  name: string
  term: Term & { form: 'adt' }
  ctx: EmitCtx
  impls: ImplInfo[]
  masks: MaskInfo[]
}): string {
  const { term, ctx, impls, masks } = input
  const className = pascalCase(input.name)
  const lines: string[] = []

  // Collect interface names this sealed class implements
  const ifaceNames: string[] = []
  for (const impl of impls) {
    if (impl.maskName) {
      ifaceNames.push(pascalCase(impl.maskName))
    }
  }

  const conformance = ifaceNames.length > 0
    ? ` : ${ifaceNames.join(', ')}`
    : ''
  lines.push(`sealed class ${className}${conformance} {`)

  for (const ctr of term.ctrs) {
    const fields = teleToFieldNames(ctr.tele)
    const ctrName = pascalCase(ctr.name)
    if (fields.length === 0) {
      lines.push(`    object ${ctrName} : ${className}()`)
    } else {
      const fieldStr = fields
        .map(f => `val ${camelCase(f)}: Any`)
        .join(', ')
      lines.push(
        `    data class ${ctrName}(${fieldStr}) : ${className}()`,
      )
    }
  }

  // Emit impl methods inside the sealed class
  for (const impl of impls) {
    const isOverride = impl.maskName !== null
    for (const bookKey of impl.methods) {
      const methodTerm = ctx.book.get(bookKey)
      if (!methodTerm) continue

      const shortName = bookKey.includes('/')
        ? bookKey.split('/').pop()!
        : bookKey
      const safeName = camelCase(shortName)
      const val = unwrapAnn(methodTerm)

      if (val.form === 'lam') {
        // Manually unwrap lambdas, binding 'self' to 'this'
        const methodParamNames: string[] = []
        const methodParams: string[] = []
        let cur: Term = val
        let d = 0
        while (cur.form === 'lam') {
          const pName = cur.name === 'self' ? 'this' : varName({ name: cur.name, dep: d })
          if (cur.name !== 'self') {
            methodParams.push(`${pName}: Any`)
          }
          methodParamNames.push(pName)
          cur = cur.bod({ form: 'var', name: pName, idx: d })
          d++
        }
        const paramStr = methodParams.join(', ')

        const bodyLines: string[] = []
        castStmt({
          term: cur,
          dep: d,
          ctx,
          lines: bodyLines,
          indent: 2,
        })

        const prefix = isOverride ? 'override ' : ''
        lines.push(
          `    ${prefix}fun ${safeName}(${paramStr}): Any {\n${bodyLines.join('\n')}\n    }`,
        )
      }
    }
  }

  lines.push('}')
  return lines.join('\n')
}

// ---- Interface Generation ----

function castInterface(input: { mask: MaskInfo }): string {
  const { mask } = input
  const ifaceName = pascalCase(mask.name)
  const lines: string[] = []
  lines.push(`interface ${ifaceName} {`)
  for (const method of mask.methods) {
    const safeName = camelCase(method.name)
    const params: string[] = []
    for (const p of method.params) {
      if (p.name === 'self') continue
      params.push(`${camelCase(p.name)}: Any`)
    }
    lines.push(`    fun ${safeName}(${params.join(', ')}): Any`)
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
      lines.push(`${pad}val ${name} = ${val}`)
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
          lines.push(`${pad}for (${name} in ${iterExpr} as List<Any>) {`)
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
            lines.push(`${pad}val next_${tail.params[i]} = ${argExpr}`)
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
      lines.push(`${pad}println(${msg})`)
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
      lines.push(`${pad}throw SeedError(${msg}.toString())`)
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
  const firstEnumType = arms.length > 0 ? (ctx.ctrToEnum.get(arms[0]![0]) ?? null) : null
  const isMaybeMatch = firstEnumType !== null && isMaybe(firstEnumType)

  if (isMaybeMatch) {
    // Native optional: if (x != null) { ... } else { ... }
    const someArm = arms.find(([n]) => n === 'some')
    const noneArm = arms.find(([n]) => n === 'none')
    lines.push(`${pad}if (${scrExpr} != null) {`)
    if (someArm) {
      let armBod = someArm[1]
      let armDep = dep
      const innerPad = '    '.repeat(indent + 1)
      while (armBod.form === 'lam') {
        const paramName = varName({ name: armBod.name, dep: armDep })
        lines.push(`${innerPad}val ${paramName} = ${scrExpr}`)
        armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
        armDep++
      }
      castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 1, tail })
    }
    lines.push(`${pad}} else {`)
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

  lines.push(`${pad}when (${scrExpr}) {`)
  for (const [name, bod] of arms) {
    const fields = ctx.fieldMap.get(name) ?? []
    const enumType = ctx.ctrToEnum.get(name) ?? null
    const ctrName = pascalCase(name)
    const qualName = enumType
      ? `${pascalCase(enumType)}.${ctrName}`
      : ctrName

    let armBod = bod
    let armDep = dep

    if (armBod.form === 'lam' && fields.length > 0) {
      lines.push(`${pad}    is ${qualName} -> {`)
      let fieldIdx = 0
      while (armBod.form === 'lam') {
        const fieldName = fields[fieldIdx] ?? `_${fieldIdx}`
        const paramName = varName({ name: armBod.name, dep: armDep })
        lines.push(
          `${pad}        val ${paramName} = (${scrExpr} as ${qualName}).${camelCase(fieldName)}`,
        )
        armBod = armBod.bod({
          form: 'var',
          name: paramName,
          idx: armDep,
        })
        armDep++
        fieldIdx++
      }
      castStmt({
        term: armBod,
        dep: armDep,
        ctx,
        lines,
        indent: indent + 2,
        tail,
      })
      lines.push(`${pad}    }`)
    } else {
      lines.push(`${pad}    is ${qualName} -> {`)
      // unwrap lambdas even without fields
      while (armBod.form === 'lam') {
        const paramName = varName({ name: armBod.name, dep: armDep })
        armBod = armBod.bod({
          form: 'var',
          name: paramName,
          idx: armDep,
        })
        armDep++
      }
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
  }
  // Always emit else clause - Kotlin only recognizes exhaustive when
  // as an expression (return when), not as a statement
  lines.push(`${pad}    else -> throw Error("no match")`)
  lines.push(`${pad}}`)
}

/** Emit if/else for boolean test (fork test). Scrutinee is a native Boolean. */
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

  lines.push(`${pad}if (${scrExpr} as Boolean) {`)
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

  lines.push(`${pad}if ((${scrExpr} as Long) == 0L) {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail })

  if (succ.form === 'lam') {
    const pName = varName({ name: succ.name, dep })
    lines.push(`${pad}} else {`)
    lines.push(`${pad}    val ${pName} = (${scrExpr} as Long) - 1L`)
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
      `${pad}    return (${succExpr} as (Any) -> Any)((${scrExpr} as Long) - 1L)`,
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
      const paramStr = params
        .map(p => `${p.name}: Any`)
        .join(', ')
      const bodyExpr = castExpr({
        term: body,
        dep: dep + params.length,
        ctx,
      })
      return `{ ${paramStr} -> ${bodyExpr} }`
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
        return `run {\n${bodyLines.join('\n')}\n}`
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
        return `run {\n${bodyLines.join('\n')}\n}`
      }
      if (func.form === 'ref' && (func.name.startsWith('.') || func.name.startsWith('!'))) {
        const prim = func.name.slice(1)
        // .wait → no special syntax in Kotlin (suspend functions are called normally)
        if (prim === 'wait' && args.length === 1) {
          return castExpr({ term: args[0]!, dep, ctx })
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
      // Direct call for known top-level functions
      if (func.form === 'ref' && (ctx.arityMap.has(func.name) || ctx.book.has(func.name))) {
        const funcStr = camelCase(func.name)
        const argsStr = args.map(a => castExpr({ term: a, dep, ctx }))
        return `${funcStr}(${argsStr.join(', ')})`
      }
      const funcStr = castExpr({ term: func, dep, ctx })
      const argsStr = args.map(a => castExpr({ term: a, dep, ctx }))
      return `(${funcStr} as (${args.map(() => 'Any').join(', ')}) -> Any)(${argsStr.join(', ')})`
    }
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      const body = castExpr({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
      })
      return `run { val ${name} = ${val}; ${body} }`
    }
    case 'use':
      return castExpr({ term: term.bod(term.val), dep, ctx })
    case 'ref':
      if (term.name === '.true') return 'true'
      if (term.name === '.false') return 'false'
      return camelCase(term.name)
    case 'var':
      return term.name
    case 'num':
      return `${term.val}L`
    case 'txt':
      return JSON.stringify(term.val)
    case 'nat':
      return `${term.val}L`
    case 'con': {
      const enumType = ctx.ctrToEnum.get(term.name) ?? null
      // Native optional: maybe → null/value
      if (enumType && isMaybe(enumType)) {
        if (term.name === 'none') return 'null'
        if (term.name === 'some' && term.args.length > 0) {
          return castExpr({ term: term.args[0]![1], dep, ctx })
        }
      }
      const ctrName = pascalCase(term.name)
      const qualName = enumType
        ? `${pascalCase(enumType)}.${ctrName}`
        : ctrName
      if (term.args.length === 0) return qualName
      const fields = term.args
        .map(([field, t]) => {
          const val = castExpr({ term: t, dep, ctx })
          const key = field ? camelCase(field) : '_'
          return `${key} = ${val}`
        })
        .join(', ')
      return `${qualName}(${fields})`
    }
    case 'op2': {
      const op = castOper(term.oper)
      const a = castExpr({ term: term.a, dep, ctx })
      const b = castExpr({ term: term.b, dep, ctx })
      return `((${a} as Long) ${op} (${b} as Long))`
    }
    case 'lst': {
      if (term.list.length === 0) return 'listOf<Any>()'
      const items = term.list.map(t => castExpr({ term: t, dep, ctx }))
      return `listOf(${items.join(', ')})`
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      const val = castExpr({ term: term.val, dep, ctx })
      return `run { println(${msg}); ${val} }`
    }
    case 'all':
    case 'set':
    case 'int':
    case 'flt':
    case 'slf':
    case 'adt':
      return 'Unit'
    case 'ann':
      return castExpr({ term: term.val, dep, ctx })
    case 'ins':
      return castExpr({ term: term.val, dep, ctx })
    case 'src':
      return castExpr({ term: term.val, dep, ctx })
    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      return `run { throw SeedError(${msg}.toString()) }`
    }
    case 'rst': {
      const val = castExpr({ term: term.val, dep, ctx })
      return `run { /* breakpoint */ ${val} }`
    }
    case 'nxt':
      return 'Unit /* continue */'
    case 'hol':
      return `throw Error(${JSON.stringify(`hole: ${term.name}`)})`
    case 'met':
      return `Unit /* meta ${term.uid} */`
    default:
      return 'Unit'
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
    case 'int':
    case 'flt':
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
    and: 'and',
    or: 'or',
    xor: 'xor',
    lsh: 'shl',
    rsh: 'shr',
  }
  return map[oper]
}
