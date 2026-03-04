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
 *   7. Self-tail-call → while loop (no stack overflow for tail recursion)
 */

import type { Term, Book, Oper, Ctr, Tele } from '@/term/form'
import type { AsyncMeta } from '@/term/desugar'

// ---- Emit Context ----

type ParamType = { name: string; type: string }
type FuncType = { params: ParamType[]; ret: string }

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  arityMap: Map<string, number>
  ctrToEnum: Map<string, string>
  headParams: Map<string, string[]>
  typeInfo: Map<string, FuncType>
  riskSet: Set<string>
  book: Book
}

/** Check if a form name is the maybe/optional type. */
function isMaybe(name: string): boolean {
  return name === 'maybe'
}

/** Tail-call context: tracks the current function for self-tail-call optimization. */
type TailCtx = {
  refName: string    // original book name (to match Ref nodes)
  params: string[]   // parameter variable names (for reassignment)
} | null

// ---- Public API ----

export type DockLoad = { path: string; name?: string }

export function castBook(input: { book: Book; dock?: DockLoad[]; asyncMeta?: AsyncMeta; stripTypes?: boolean }): string {
  const ctx = analyze({ book: input.book })
  const asyncMeta = input.asyncMeta ?? new Map()
  const emitTypes = !input.stripTypes
  const lines: string[] = []

  for (const load of input.dock ?? []) {
    const name = load.name ? sanitizeName(load.name) : ''
    if (name) {
      lines.push(`import ${name} from '${load.path}'`)
    }
  }

  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (isTypeOnly(val)) continue

    const safeName = sanitizeName(name)
    const isAsync = asyncMeta.get(name) === true

    if (val.form === 'lam') {
      const heads = ctx.headParams.get(name) ?? []
      const genericStr = heads.length > 0 ? `<${heads.map(h => capitalize(h)).join(', ')}>` : ''

      // Skip head param lambdas to get to value params
      let valTerm: Term = val
      let headDep = 0
      for (let i = 0; i < heads.length; i++) {
        if (valTerm.form === 'lam') {
          valTerm = valTerm.bod({ form: 'var', name: valTerm.name, idx: headDep })
          headDep++
        }
      }

      const { params, body } = unwrapLam({ term: valTerm, dep: headDep })
      const totalDep = headDep + params.length
      const funcType = ctx.typeInfo.get(name)
      const paramStr = params.map((p, i) => {
        if (!emitTypes) return p.name
        const typeAnn = funcType?.params[i]?.type
        if (typeAnn && typeAnn !== 'any') return `${p.name}: ${typeAnn}`
        return p.name
      }).join(', ')
      const retAnn = emitTypes && funcType?.ret && funcType.ret !== 'any' ? `: ${funcType.ret}` : ''
      const paramNames = params.map(p => p.name)
      const isTailRec = hasSelfTailCall({
        term: body, refName: name, arity: totalDep, dep: totalDep,
      })
      const tail: TailCtx = isTailRec ? { refName: name, params: paramNames } : null
      const bodyLines: string[] = []
      const bodyIndent = isTailRec ? 2 : 1
      castStmt({ term: body, dep: totalDep, ctx, lines: bodyLines, indent: bodyIndent, tail })
      const asyncPrefix = isAsync ? 'async ' : ''
      if (isTailRec) {
        lines.push(`export ${asyncPrefix}function ${safeName}${genericStr}(${paramStr})${retAnn} {\n  while (true) {\n${bodyLines.join('\n')}\n  }\n}`)
      } else {
        lines.push(`export ${asyncPrefix}function ${safeName}${genericStr}(${paramStr})${retAnn} {\n${bodyLines.join('\n')}\n}`)
      }
    } else {
      const expr = castExpr({ term: val, dep: 0, ctx })
      lines.push(`export const ${safeName} = ${expr};`)
    }
  }

  return lines.join('\n\n')
}

/**
 * Multi-file output: emit one TS string per source file.
 *
 * Takes a mapping of file paths to definition names so each file gets
 * only its own definitions. Shared analysis (tag maps, type info) is
 * computed once across all definitions.
 */
export function castBookToFiles(input: {
  book: Book
  fileMap: Map<string, string[]>
  dock?: DockLoad[]
  asyncMeta?: AsyncMeta
}): Map<string, string> {
  const ctx = analyze({ book: input.book })
  const asyncMeta = input.asyncMeta ?? new Map()
  const result = new Map<string, string>()

  for (const [file, defNames] of input.fileMap) {
    const fileBook: Book = new Map()
    for (const name of defNames) {
      const term = input.book.get(name)
      if (term) fileBook.set(name, term)
    }

    const fileLines: string[] = []

    // Add dock imports only to the first/main file
    if (input.dock && result.size === 0) {
      for (const load of input.dock) {
        const name = load.name ? sanitizeName(load.name) : ''
        if (name) {
          fileLines.push(`import ${name} from '${load.path}'`)
        }
      }
    }

    for (const [name, term] of fileBook) {
      const val = unwrapAnn(term)
      if (isTypeOnly(val)) continue

      const safeName = sanitizeName(name)
      const isAsync = asyncMeta.get(name) === true

      if (val.form === 'lam') {
        const heads = ctx.headParams.get(name) ?? []
        const genericStr = heads.length > 0 ? `<${heads.map(h => capitalize(h)).join(', ')}>` : ''

        let valTerm: Term = val
        let headDep = 0
        for (let i = 0; i < heads.length; i++) {
          if (valTerm.form === 'lam') {
            valTerm = valTerm.bod({ form: 'var', name: valTerm.name, idx: headDep })
            headDep++
          }
        }

        const { params, body } = unwrapLam({ term: valTerm, dep: headDep })
        const totalDep = headDep + params.length
        const funcType = ctx.typeInfo.get(name)
        const paramStr = params.map((p, i) => {
          const typeAnn = funcType?.params[i]?.type
          if (typeAnn && typeAnn !== 'any') return `${p.name}: ${typeAnn}`
          return p.name
        }).join(', ')
        const retAnn = funcType?.ret && funcType.ret !== 'any' ? `: ${funcType.ret}` : ''
        const paramNames = params.map(p => p.name)
        const isTailRec = hasSelfTailCall({
          term: body, refName: name, arity: totalDep, dep: totalDep,
        })
        const tail: TailCtx = isTailRec ? { refName: name, params: paramNames } : null
        const bodyLines: string[] = []
        const bodyIndent = isTailRec ? 2 : 1
        castStmt({ term: body, dep: totalDep, ctx, lines: bodyLines, indent: bodyIndent, tail })
        const asyncPrefix = isAsync ? 'async ' : ''
        if (isTailRec) {
          fileLines.push(`export ${asyncPrefix}function ${safeName}${genericStr}(${paramStr})${retAnn} {\n  while (true) {\n${bodyLines.join('\n')}\n  }\n}`)
        } else {
          fileLines.push(`export ${asyncPrefix}function ${safeName}${genericStr}(${paramStr})${retAnn} {\n${bodyLines.join('\n')}\n}`)
        }
      } else {
        const expr = castExpr({ term: val, dep: 0, ctx })
        fileLines.push(`export const ${safeName} = ${expr};`)
      }
    }

    result.set(file, fileLines.join('\n\n'))
  }

  return result
}

export function castTerm(input: { term: Term; dep: number }): string {
  const ctx: EmitCtx = {
    tagMap: new Map(),
    fieldMap: new Map(),
    arityMap: new Map(),
    ctrToEnum: new Map(),
    headParams: new Map(),
    typeInfo: new Map(),
    riskSet: new Set(),
    book: new Map(),
  }
  return castExpr({ term: input.term, dep: input.dep, ctx })
}

// ---- Phase A: Analyze ----

function analyze(input: { book: Book }): EmitCtx {
  const tagMap = new Map<string, number>()
  const fieldMap = new Map<string, string[]>()
  const arityMap = new Map<string, number>()
  const ctrToEnum = new Map<string, string>()
  const headParams = new Map<string, string[]>()
  const typeInfo = new Map<string, FuncType>()
  const riskSet = new Set<string>()

  // First pass: collect form names for type resolution
  const formNames = new Set<string>()
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      formNames.add(name)
    }
  }

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

    // Extract head (type) params from Ann's type annotation
    const heads = extractHeadParams(term)
    if (heads.length > 0) {
      headParams.set(name, heads)
    }

    // Extract parameter and return types from type annotation
    const funcType = extractFuncType({ term, heads, formNames, ctrToEnum })
    if (funcType) {
      typeInfo.set(name, funcType)
    }
  }

  return { tagMap, fieldMap, arityMap, ctrToEnum, headParams, typeInfo, riskSet, book: input.book }
}

/** Resolve a Core Term type to a TypeScript type string. */
function resolveType(input: { term: Term; heads: string[]; formNames: Set<string>; ctrToEnum: Map<string, string> }): string {
  const { term, heads, formNames, ctrToEnum } = input

  switch (term.form) {
    case 'u64':
    case 'num':
      return 'number'
    case 'f64':
    case 'flt':
      return 'number'
    case 'set':
      return 'any'
    case 'ref': {
      const n = term.name
      if (n === 'String' || n === 'Text' || n === 'text') return 'string'
      if (n === 'Bool' || n === 'boolean' || n === 'bool') return 'boolean'
      if (n === 'Nat' || n === 'nat') return 'number'
      if (formNames.has(n)) return capitalize(sanitizeName(n))
      if (n === 'void' || n === 'Void') return 'void'
      return 'any'
    }
    case 'var': {
      // Check if this is a type parameter
      if (heads.includes(term.name)) {
        return capitalize(term.name)
      }
      return 'any'
    }
    case 'all': {
      // Function type: (x: A) => B
      const params: string[] = []
      let cur: Term = term
      while (cur.form === 'all') {
        const pType = resolveType({ term: cur.inp, heads, formNames, ctrToEnum })
        params.push(`${cur.name}: ${pType}`)
        cur = cur.bod({ form: 'var', name: cur.name, idx: 0 })
      }
      const ret = resolveType({ term: cur, heads, formNames, ctrToEnum })
      return `(${params.join(', ')}) => ${ret}`
    }
    case 'app': {
      // Application of type constructor (e.g., List<T>, Map<K,V>)
      const { func, args } = unwrapApp(term)
      if (func.form === 'ref') {
        if (func.name === 'maybe') {
          const inner = args.length > 0
            ? resolveType({ term: args[0]!, heads, formNames, ctrToEnum })
            : 'any'
          return `${inner} | null`
        }
      }
      return 'any'
    }
    case 'ann':
      return resolveType({ term: term.typ, heads, formNames, ctrToEnum })
    case 'src':
      return resolveType({ term: term.val, heads, formNames, ctrToEnum })
    default:
      return 'any'
  }
}

/** Strip Ann/Src wrappers to get to the actual type. */
function stripWrappers(term: Term): Term {
  let cur = term
  while (true) {
    if (cur.form === 'ann') { cur = cur.typ; continue }
    if (cur.form === 'src') { cur = cur.val; continue }
    if (cur.form === 'ins') { cur = cur.val; continue }
    break
  }
  return cur
}

/** Extract function parameter types and return type from a term's type annotation. */
function extractFuncType(input: {
  term: Term
  heads: string[]
  formNames: Set<string>
  ctrToEnum: Map<string, string>
}): FuncType | null {
  const { term, heads, formNames, ctrToEnum } = input

  let typ = stripWrappers(term)

  // Skip head params (type params have inp: Set)
  while (typ.form === 'all' && stripWrappers(typ.inp).form === 'set') {
    typ = typ.bod({ form: 'var', name: typ.name, idx: 0 })
    typ = stripWrappers(typ)
  }

  // Now typ should be the function type: All(name, inp, bod)
  if (typ.form !== 'all') return null

  const params: ParamType[] = []
  let cur: Term = typ
  while (cur.form === 'all') {
    const inp = stripWrappers(cur.inp)
    const typeStr = resolveType({ term: inp, heads, formNames, ctrToEnum })
    params.push({ name: cur.name, type: typeStr })
    cur = cur.bod({ form: 'var', name: cur.name, idx: 0 })
    cur = stripWrappers(cur)
  }

  const ret = resolveType({ term: cur, heads, formNames, ctrToEnum })
  return { params, ret }
}

/** Extract type parameter names from a term's type annotation. */
function extractHeadParams(term: Term): string[] {
  // Task terms are Ann(val, typ) where typ is an All chain
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

/**
 * Detect whether a term contains a self-tail-call in tail position.
 * Walks only tail positions (let body, match arms, switch branches).
 */
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
        refName, arity, dep: dep + 1,
      })

    case 'app': {
      const { func, args } = unwrapApp(term)

      // Direct self-tail-call: App(Ref name, args...) with matching arity
      if (func.form === 'ref' && func.name === refName && args.length === arity) {
        return true
      }

      // Tail call inside match arms
      if (func.form === 'mat' && args.length === 1) {
        return func.arms.some(([, bod]) => {
          let inner = bod
          let d = dep
          while (inner.form === 'lam') {
            inner = inner.bod({ form: 'var', name: inner.name, idx: d })
            d++
          }
          return hasSelfTailCall({ term: inner, refName, arity, dep: d })
        })
      }

      // Tail call inside numeric switch
      if (func.form === 'swi' && args.length === 1) {
        const zeroHas = hasSelfTailCall({ term: func.zero, refName, arity, dep })
        let succHas = false
        if (func.succ.form === 'lam') {
          const succBod = func.succ.bod({ form: 'var', name: func.succ.name, idx: dep })
          succHas = hasSelfTailCall({ term: succBod, refName, arity, dep: dep + 1 })
        } else {
          succHas = hasSelfTailCall({ term: func.succ, refName, arity, dep })
        }
        return zeroHas || succHas
      }

      return false
    }

    case 'log':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })

    case 'rst':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })

    case 'ann':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })

    case 'ins':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })

    case 'src':
      return hasSelfTailCall({ term: term.val, refName, arity, dep })

    case 'use':
      return hasSelfTailCall({ term: term.bod(term.val), refName, arity, dep })

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
  const pad = '  '.repeat(indent)

  switch (term.form) {
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx })
      lines.push(`${pad}const ${name} = ${val};`)
      const bodTerm = term.bod({ form: 'var', name, idx: dep })
      castStmt({ term: bodTerm, dep: dep + 1, ctx, lines, indent, tail })
      return
    }

    case 'app': {
      // Detect App(Mat, scrutinee) → inline switch/if-else
      const { func, args } = unwrapApp(term)
      if (func.form === 'mat' && args.length === 1) {
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep, ctx, lines, indent, tail,
        })
        return
      }
      // Detect App(Swi, scrutinee) → inline if/else
      if (func.form === 'swi' && args.length === 1) {
        castSwiStmt({
          zero: func.zero,
          succ: func.succ,
          scrutinee: args[0]!,
          dep, ctx, lines, indent, tail,
        })
        return
      }

      // Runtime primitive: .for in statement mode → for-of loop
      if (func.form === 'ref' && func.name === '.for' && args.length === 2 && args[1]!.form === 'lam') {
        castForStmt({ iter: args[0]!, lam: args[1]!, dep, ctx, lines, indent })
        return
      }

      // Self-tail-call → reassign params + continue
      if (tail && func.form === 'ref' && func.name === tail.refName && args.length === tail.params.length) {
        if (args.length === 1) {
          // Single param: no aliasing possible, assign directly
          const argExpr = castExpr({ term: args[0]!, dep, ctx })
          lines.push(`${pad}${tail.params[0]} = ${argExpr};`)
        } else {
          // Multiple params: use named temps to prevent aliasing
          for (let i = 0; i < args.length; i++) {
            const argExpr = castExpr({ term: args[i]!, dep, ctx })
            lines.push(`${pad}const next_${tail.params[i]} = ${argExpr};`)
          }
          for (let i = 0; i < tail.params.length; i++) {
            lines.push(`${pad}${tail.params[i]} = next_${tail.params[i]};`)
          }
        }
        lines.push(`${pad}continue;`)
        return
      }

      // Fall through to return expression
      break
    }

    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}console.log(${msg});`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    }

    case 'rst': {
      lines.push(`${pad}debugger;`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail })
      return
    }

    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      lines.push(`${pad}throw new Error(${msg});`)
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
      castStmt({ term: term.bod(term.val), dep, ctx, lines, indent, tail })
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
  tail?: TailCtx
}): void {
  const { arms, scrutinee, dep, ctx, lines, indent, tail } = input
  const pad = '  '.repeat(indent)

  // Elide temp when scrutinee is a simple variable
  let scrVar: string
  if (scrutinee.form === 'var' || scrutinee.form === 'ref') {
    scrVar = castExpr({ term: scrutinee, dep, ctx })
  } else {
    scrVar = `match${dep}`
    const scrExpr = castExpr({ term: scrutinee, dep, ctx })
    lines.push(`${pad}const ${scrVar} = ${scrExpr};`)
  }

  // Detect maybe type for native optional matching
  const firstFormName = arms.length > 0 ? ctx.ctrToEnum.get(arms[0]![0]) : undefined
  const isMaybeMatch = firstFormName !== undefined && isMaybe(firstFormName)

  if (isMaybeMatch) {
    // Native optional: if (x !== null) { ... } else { ... }
    const someArm = arms.find(([n]) => n === 'some')
    const noneArm = arms.find(([n]) => n === 'none')
    lines.push(`${pad}if (${scrVar} !== null) {`)
    if (someArm) {
      let armBod = someArm[1]
      let armDep = dep
      const innerPad = '  '.repeat(indent + 1)
      while (armBod.form === 'lam') {
        const paramName = varName({ name: armBod.name, dep: armDep })
        lines.push(`${innerPad}const ${paramName} = ${scrVar};`)
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

  const useTag = ctx.tagMap.size > 0
  const tagField = useTag ? '$' : 'tag'

  if (arms.length === 2) {
    // if/else for 2 arms
    const [arm0, arm1] = [arms[0]!, arms[1]!]
    const tag0 = useTag ? ctx.tagMap.get(arm0[0]) : undefined
    const tag0Str = tag0 !== undefined ? String(tag0) : JSON.stringify(arm0[0])

    lines.push(`${pad}if (${scrVar}.${tagField} === ${tag0Str}) {`)
    castArmBody({ name: arm0[0], bod: arm0[1], scrVar, dep, ctx, lines, indent: indent + 1, tail })
    lines.push(`${pad}} else {`)
    castArmBody({ name: arm1[0], bod: arm1[1], scrVar, dep, ctx, lines, indent: indent + 1, tail })
    lines.push(`${pad}}`)
  } else {
    // switch for 3+ arms
    lines.push(`${pad}switch (${scrVar}.${tagField}) {`)
    for (const [name, bod] of arms) {
      const tag = useTag ? ctx.tagMap.get(name) : undefined
      const tagStr = tag !== undefined ? String(tag) : JSON.stringify(name)
      lines.push(`${pad}  case ${tagStr}: {`)
      castArmBody({ name, bod, scrVar, dep, ctx, lines, indent: indent + 2, tail })
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
  tail?: TailCtx
}): void {
  const { name, bod, scrVar, dep, ctx, lines, indent, tail } = input
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

  castStmt({ term: armBod, dep: armDep, ctx, lines, indent, tail })
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
  const pad = '  '.repeat(indent)

  // Elide temp when scrutinee is a simple variable
  let scrVar: string
  if (scrutinee.form === 'var' || scrutinee.form === 'ref') {
    scrVar = castExpr({ term: scrutinee, dep, ctx })
  } else {
    scrVar = `num${dep}`
    const scrExpr = castExpr({ term: scrutinee, dep, ctx })
    lines.push(`${pad}const ${scrVar} = ${scrExpr};`)
  }
  lines.push(`${pad}if (${scrVar} === 0) {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail })

  if (succ.form === 'lam') {
    const pName = varName({ name: succ.name, dep })
    const innerPad = '  '.repeat(indent + 1)
    lines.push(`${pad}} else {`)
    lines.push(`${innerPad}const ${pName} = ${scrVar} - 1;`)
    const succBod = succ.bod({ form: 'var', name: pName, idx: dep })
    castStmt({ term: succBod, dep: dep + 1, ctx, lines, indent: indent + 1, tail })
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

      // Runtime primitives: Ref names starting with "."
      if (func.form === 'ref' && func.name.startsWith('.')) {
        const prim = func.name.slice(1)

        // .wait → await expr
        if (prim === 'wait' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx })
          return `await ${inner}`
        }

        // .safe → (val ?? null)
        if (prim === 'safe' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx })
          return `(${inner} ?? null)`
        }

        // .and → (a && b && ...)
        if (prim === 'and' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx }))
          return `(${parts.join(' && ')})`
        }

        // .or → (a || b || ...)
        if (prim === 'or' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx }))
          return `(${parts.join(' || ')})`
        }

        // .map → new Map(entries)
        if (prim === 'map' && args.length === 1) {
          const entries = args[0]!
          if (entries.form === 'lst' && entries.list.length === 0) return 'new Map()'
          const entriesExpr = castExpr({ term: entries, dep, ctx })
          return `new Map(${entriesExpr})`
        }

        // .for → IIFE wrapping for-of (expression context)
        if (prim === 'for' && args.length === 2 && args[1]!.form === 'lam') {
          const bodyLines: string[] = []
          castForStmt({ iter: args[0]!, lam: args[1]!, dep, ctx, lines: bodyLines, indent: 1 })
          return `(() => {\n${bodyLines.join('\n')}\n})()`
        }

        // Method/property dispatch: .save, .read, .size, etc.
        if (args.length >= 1) {
          const obj = castExpr({ term: args[0]!, dep, ctx })
          const methodName = mapMethodName(prim)
          if (args.length === 1) return `${obj}.${methodName}`
          const methodArgs = args.slice(1).map(a => castExpr({ term: a, dep, ctx }))
          return `${obj}.${methodName}(${methodArgs.join(', ')})`
        }
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
      // Native optional: maybe → null/value
      const formName = ctx.ctrToEnum.get(term.name)
      if (formName && isMaybe(formName)) {
        if (term.name === 'none') return 'null'
        if (term.name === 'some' && term.args.length > 0) {
          return castExpr({ term: term.args[0]![1], dep, ctx })
        }
      }
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
        '(val) => {',
        `  switch (val.${tagField}) {\n${arms}`,
        '    default: throw new Error("no match");',
        '  }',
        '}',
      ].join('\n')
    }

    case 'swi': {
      const zero = castExpr({ term: term.zero, dep, ctx })
      const succ = castExpr({ term: term.succ, dep, ctx })
      return `(num) => (num === 0 ? ${zero} : (${succ})(num - 1))`
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

    case 'rst': {
      const val = castExpr({ term: term.val, dep, ctx })
      return `(debugger, ${val})`
    }

    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx })
      return `(() => { throw new Error(${msg}); })()`
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

/** Emit a for-of loop from a .for runtime primitive (App(App(Ref ".for") iter) lam). */
function castForStmt(input: {
  iter: Term
  lam: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { iter, lam, dep, ctx, lines, indent } = input
  const pad = '  '.repeat(indent)
  if (lam.form !== 'lam') return
  const name = varName({ name: lam.name, dep })
  const iterExpr = castExpr({ term: iter, dep, ctx })
  lines.push(`${pad}for (const ${name} of ${iterExpr}) {`)
  const bodTerm = lam.bod({ form: 'var', name, idx: dep })
  castStmt({ term: bodTerm, dep: dep + 1, ctx, lines, indent: indent + 1 })
  lines.push(`${pad}}`)
}

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
  return name.replace(/[/.-](.)/g, (_, c) => c.toUpperCase())
}

function capitalize(name: string): string {
  if (!name) return name
  return name[0]!.toUpperCase() + name.slice(1)
}

/** Map tree-lang method names to JS equivalents. */
function mapMethodName(name: string): string {
  const map: Record<string, string> = {
    save: 'set',
    read: 'get',
    push: 'push',
    halt: 'end',
  }
  return map[name] ?? sanitizeName(name)
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
