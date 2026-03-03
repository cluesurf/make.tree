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
import type { TraitMeta } from '@/cast/trait'

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  arityMap: Map<string, number>
  ctrToEnum: Map<string, string>
  enumNames: Set<string>
  dockNames: Set<string>
  book: Book
}

type TailCtx = {
  refName: string
  params: string[]
} | null

// ---- Public API ----

export type DockLoad = { path: string; name?: string }

/** Names that map to Rust built-in types (skip enum generation). */
const RUST_BUILTIN_FORMS = new Set(['result'])

export function castBook(input: {
  book: Book
  dock?: DockLoad[]
  traits?: TraitMeta
}): string {
  const dockNames = new Set<string>()
  for (const load of input.dock ?? []) {
    if (load.name) dockNames.add(load.name)
  }

  const ctx = analyze({ book: input.book, dockNames })
  const lines: string[] = []

  // Build set of method names that belong to impl blocks
  const implMethods = new Set<string>()
  for (const impl of input.traits?.impls ?? []) {
    for (const m of impl.methods) implMethods.add(m)
  }

  // Phase 1: Dock imports
  for (const load of input.dock ?? []) {
    const path = load.path.replace(/:/g, '::')
    lines.push(`use ${path};`)
  }

  // Phase 2: Enums
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      if (RUST_BUILTIN_FORMS.has(name)) continue
      lines.push(castEnum({ name, term: val, ctx }))
    }
  }

  // Phase 3: Trait definitions
  for (const mask of input.traits?.masks ?? []) {
    lines.push(castTraitDef({ mask }))
  }

  // Phase 4: Impl blocks
  for (const impl of input.traits?.impls ?? []) {
    lines.push(castImplBlock({ impl, ctx, masks: input.traits?.masks ?? [] }))
  }

  // Phase 5: Standalone functions (skip impl methods)
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)

    if (val.form === 'adt') continue
    if (isTypeOnly(val)) continue
    if (implMethods.has(name)) continue

    const safeName = snakeCase(name)
    const paramTypes = extractParamTypes({ term, ctx })
    const baseReturnType = inferReturnType({ term, ctx })

    if (val.form === 'lam') {
      const { params, body } = unwrapLam({ term: val, dep: 0 })
      const usesHalt = hasHaltCall({ term: body, dep: params.length })
      const returnType = usesHalt
        ? `Result<${baseReturnType}, Box<dyn std::error::Error>>`
        : baseReturnType
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
        okWrap: usesHalt,
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
      const usesHalt = hasHaltCall({ term: val, dep: 0 })
      const returnType = usesHalt
        ? `Result<${baseReturnType}, Box<dyn std::error::Error>>`
        : baseReturnType
      const expr = castExpr({ term: val, dep: 0, ctx })
      if (usesHalt) {
        lines.push(`fn ${safeName}() -> ${returnType} { Ok(${expr}) }`)
      } else {
        lines.push(`fn ${safeName}() -> ${returnType} { ${expr} }`)
      }
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
        .map(f => `${snakeCase(f)}: Box<${enumName}>`)
        .join(', ')
      lines.push(`    ${ctrName} { ${fieldStr} },`)
    }
  }
  lines.push('}')
  return lines.join('\n')
}

// ---- Trait / Impl Generation ----

function castTraitDef(input: {
  mask: import('@/cast/trait').MaskInfo
}): string {
  const { mask } = input
  const traitName = pascalCase(mask.name)
  const lines: string[] = []
  lines.push(`trait ${traitName} {`)
  for (const method of mask.methods) {
    const safeName = snakeCase(method.name)
    const params: string[] = []
    for (const p of method.params) {
      if (p.name === 'self') {
        params.push('&self')
      } else {
        const typ = resolveTraitTypeName(p.typeName)
        params.push(`${snakeCase(p.name)}: ${typ}`)
      }
    }
    const ret = resolveTraitTypeName(method.returnType)
    lines.push(`    fn ${safeName}(${params.join(', ')}) -> ${ret};`)
  }
  lines.push('}')
  return lines.join('\n')
}

function castImplBlock(input: {
  impl: import('@/cast/trait').ImplInfo
  ctx: EmitCtx
  masks: import('@/cast/trait').MaskInfo[]
}): string {
  const { ctx, masks } = input
  const implInfo = input.impl
  const formName = pascalCase(implInfo.formName)
  const lines: string[] = []

  // Look up the corresponding mask for return type info
  const mask = implInfo.maskName
    ? masks.find(m => m.name === implInfo.maskName)
    : undefined

  if (implInfo.maskName) {
    const maskName = pascalCase(implInfo.maskName)
    lines.push(`impl ${maskName} for ${formName} {`)
  } else {
    lines.push(`impl ${formName} {`)
  }

  for (const methodName of implInfo.methods) {
    const term = ctx.book.get(methodName)
    if (!term) continue

    const safeName = snakeCase(methodName)
    const paramTypes = extractParamTypes({ term, ctx })

    // Use mask's declared return type if available
    const maskMethod = mask?.methods.find(m => m.name === methodName)
    const baseReturnType = maskMethod?.returnType
      ? resolveTraitTypeName(maskMethod.returnType)
      : inferReturnType({ term, ctx })

    const val = unwrapAnn(term)

    if (val.form === 'lam') {
      const { params, body } = unwrapLam({ term: val, dep: 0 })
      const usesHalt = hasHaltCall({ term: body, dep: params.length })
      const returnType = usesHalt
        ? `Result<${baseReturnType}, Box<dyn std::error::Error>>`
        : baseReturnType

      // Build param string, replacing "self" with "&self"
      const hasSelfParam =
        params.length > 0 && params[0]!.name === 'self'
      const paramParts: string[] = []
      const startIdx = hasSelfParam ? 1 : 0
      if (hasSelfParam) {
        paramParts.push('&self')
      }
      for (let i = startIdx; i < params.length; i++) {
        const typ = paramTypes[i] ?? 'impl Clone'
        paramParts.push(`${params[i]!.name}: ${typ}`)
      }
      const paramStr = paramParts.join(', ')

      const bodyLines: string[] = []
      castStmt({
        term: body,
        dep: params.length,
        ctx,
        lines: bodyLines,
        indent: 2,
        okWrap: usesHalt,
      })
      lines.push(
        `    fn ${safeName}(${paramStr}) -> ${returnType} {\n${bodyLines.join('\n')}\n    }`,
      )
    }
  }

  lines.push('}')
  return lines.join('\n')
}

function resolveTraitTypeName(name: string | null): string {
  if (!name) return 'impl Clone'
  switch (name) {
    case 'u64':
      return 'u64'
    case 'f64':
      return 'f64'
    case 'text':
      return 'String'
    default:
      return pascalCase(name)
  }
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
  const literals = { hasNum: false, hasFlt: false }
  collectReturnInfo({ term: body, ctx, adts, literals })

  if (adts.size === 1 && !literals.hasNum && !literals.hasFlt) {
    const formName = [...adts][0]!
    return pascalCase(formName)
  }

  if (literals.hasNum && adts.size === 0) return 'u64'
  if (literals.hasFlt && adts.size === 0) return 'f64'

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

  // Fallback: if all params are same numeric type and body returns
  // variable references (e.g. fork test returning a param), use that type
  if (paramTypes.length > 0) {
    if (paramTypes.every(t => t === 'u64')) return 'u64'
    if (paramTypes.every(t => t === 'f64')) return 'f64'
  }

  return 'impl Clone'
}

function collectReturnInfo(input: {
  term: Term
  ctx: EmitCtx
  adts: Set<string>
  literals: { hasNum: boolean; hasFlt: boolean }
}): void {
  const { term, ctx, adts, literals } = input
  switch (term.form) {
    case 'con': {
      const adt = ctx.ctrToEnum.get(term.name)
      if (adt) adts.add(adt)
      for (const [, arg] of term.args) {
        collectReturnInfo({ term: arg, ctx, adts, literals })
      }
      break
    }
    case 'num':
    case 'nat':
      literals.hasNum = true
      break
    case 'flt':
      literals.hasFlt = true
      break
    case 'app':
      collectReturnInfo({ term: term.func, ctx, adts, literals })
      collectReturnInfo({ term: term.argm, ctx, adts, literals })
      break
    case 'let':
      collectReturnInfo({ term: term.val, ctx, adts, literals })
      collectReturnInfo({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
        literals,
      })
      break
    case 'mat':
      for (const [, bod] of term.arms) {
        collectReturnInfo({ term: bod, ctx, adts, literals })
      }
      break
    case 'lam':
      collectReturnInfo({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
        literals,
      })
      break
    case 'ann':
      collectReturnInfo({ term: term.val, ctx, adts, literals })
      break
    case 'ins':
      collectReturnInfo({ term: term.val, ctx, adts, literals })
      break
    case 'src':
      collectReturnInfo({ term: term.val, ctx, adts, literals })
      break
    case 'use':
      collectReturnInfo({
        term: term.bod(term.val),
        ctx,
        adts,
        literals,
      })
      break
    case 'log':
      collectReturnInfo({ term: term.val, ctx, adts, literals })
      break
    case 'swi':
      collectReturnInfo({ term: term.zero, ctx, adts, literals })
      collectReturnInfo({ term: term.succ, ctx, adts, literals })
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

function analyze(input: { book: Book; dockNames: Set<string> }): EmitCtx {
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
    dockNames: input.dockNames,
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
      // .test(mat, condition) → check both branches for tail calls
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        const mat = args[0]!
        if (mat.form === 'mat') {
          return mat.arms.some(([, bod]) =>
            hasSelfTailCall({ term: bod, refName, arity, dep }),
          )
        }
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
  okWrap?: boolean
}): void {
  const { term, dep, ctx, lines, indent, tail, okWrap } = input
  const pad = '    '.repeat(indent)

  switch (term.form) {
    case 'let': {
      // Check for .while as the Let value → emit while loop, then continue
      if (isWhileApp(term.val)) {
        castWhileStmt({ term: term.val, dep, ctx, lines, indent })
        castStmt({
          term: term.bod({ form: 'var', name: '_', idx: dep }),
          dep: dep + 1,
          ctx,
          lines,
          indent,
          tail,
          okWrap,
        })
        return
      }
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
        okWrap,
      })
      return
    }
    case 'app': {
      const { func, args } = unwrapApp(term)
      // walk test → while loop: .while(condition)(body)
      if (
        func.form === 'ref' &&
        func.name === '.while' &&
        args.length === 2 &&
        args[1]!.form === 'lam'
      ) {
        castWhileStmt({ term, dep, ctx, lines, indent })
        return
      }
      // fork test → if/else: .test(mat, condition)
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        const mat = args[0]!
        const condition = args[1]!
        if (mat.form === 'mat') {
          const trueArm = mat.arms.find(([n]) => n === 'true')?.[1]
          const falseArm = mat.arms.find(([n]) => n === 'false')?.[1]
          if (trueArm && falseArm) {
            castTestStmt({
              condition,
              trueArm,
              falseArm,
              dep,
              ctx,
              lines,
              indent,
              tail,
              okWrap,
            })
            return
          }
        }
      }
      if (func.form === 'mat' && args.length === 1) {
        castMatchStmt({
          arms: func.arms,
          scrutinee: args[0]!,
          dep,
          ctx,
          lines,
          indent,
          tail,
          okWrap,
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
          okWrap,
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
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap })
      return
    }
    case 'ann':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap })
      return
    case 'ins':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap })
      return
    case 'src':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap })
      return
    case 'use':
      castStmt({
        term: term.bod(term.val),
        dep,
        ctx,
        lines,
        indent,
        tail,
        okWrap,
      })
      return
  }

  const expr = castExpr({ term, dep, ctx })
  if (okWrap) {
    lines.push(`${pad}return Ok(${expr});`)
  } else {
    lines.push(`${pad}return ${expr};`)
  }
}

function castMatchStmt(input: {
  arms: [string, Term][]
  scrutinee: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  tail?: TailCtx
  okWrap?: boolean
}): void {
  const { arms, scrutinee, dep, ctx, lines, indent, tail, okWrap } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })

  lines.push(`${pad}match ${scrExpr}.clone() {`)
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
    if (bindings.length > 0) {
      const innerPad = '    '.repeat(indent + 2)
      for (const binding of bindings) {
        const paramName = binding.split(': ')[1]!
        lines.push(`${innerPad}let ${paramName} = *${paramName};`)
      }
    }
    castStmt({
      term: armBod,
      dep: armDep,
      ctx,
      lines,
      indent: indent + 2,
      tail,
      okWrap,
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
  okWrap?: boolean
}): void {
  const { zero, succ, scrutinee, dep, ctx, lines, indent, tail, okWrap } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx })

  lines.push(`${pad}if ${scrExpr} == 0 {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail, okWrap })

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
      okWrap,
    })
  } else {
    lines.push(`${pad}} else {`)
    const succExpr = castExpr({ term: succ, dep, ctx })
    if (okWrap) {
      lines.push(`${pad}    return Ok((${succExpr})(${scrExpr} - 1));`)
    } else {
      lines.push(`${pad}    return (${succExpr})(${scrExpr} - 1);`)
    }
  }
  lines.push(`${pad}}`)
}

/** Check if a term is a .while application: App(App(Ref ".while") cond) body */
function isWhileApp(term: Term): boolean {
  if (term.form !== 'app') return false
  const { func, args } = unwrapApp(term)
  return (
    func.form === 'ref' &&
    func.name === '.while' &&
    args.length === 2 &&
    args[1]!.form === 'lam'
  )
}

/** Collect Let binding names from a while body term (skip "_" bindings). */
function collectWhileBodyLetNames(input: {
  term: Term
  dep: number
}): string[] {
  const { term, dep } = input
  const names: string[] = []
  let cur = term
  let d = dep
  while (cur.form === 'let') {
    if (cur.name !== '_') {
      names.push(varName({ name: cur.name, dep: d }))
    }
    cur = cur.bod({ form: 'var', name: cur.name, idx: d })
    d++
  }
  return names
}

/** Emit a while loop statement from a .while application. */
function castWhileStmt(input: {
  term: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
}): void {
  const { term, dep, ctx, lines, indent } = input
  const pad = '    '.repeat(indent)
  const { args } = unwrapApp(term)
  const condition = args[0]!
  const lam = args[1]!

  if (lam.form !== 'lam') return

  const bodTerm = lam.bod({ form: 'var', name: '_', idx: dep })

  // Collect Let names from the while body (these are reassignments)
  const mutNames = collectWhileBodyLetNames({ term: bodTerm, dep: dep + 1 })

  // Retroactively convert outer `let name =` to `let mut name =`
  for (const mutName of mutNames) {
    const letPattern = `let ${mutName} = `
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trimStart().startsWith(letPattern)) {
        lines[i] = lines[i]!.replace(`let ${mutName} = `, `let mut ${mutName} = `)
        break
      }
    }
  }

  const condExpr = castExpr({ term: condition, dep, ctx })
  lines.push(`${pad}while ${condExpr} {`)

  // Emit while body: Let bindings that match mutNames → assignment
  castWhileBody({
    term: bodTerm,
    dep: dep + 1,
    ctx,
    lines,
    indent: indent + 1,
    mutNames: new Set(mutNames),
  })

  lines.push(`${pad}}`)
}

/** Emit the body of a while loop, converting reassignments. */
function castWhileBody(input: {
  term: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  mutNames: Set<string>
}): void {
  const { term, dep, ctx, lines, indent, mutNames } = input
  const pad = '    '.repeat(indent)

  if (term.form === 'let') {
    const name = varName({ name: term.name, dep })
    if (term.name === '_') {
      // Wrapper Let from ensureLetUnit: emit value as side-effect
      const val = castExpr({ term: term.val, dep, ctx })
      if (mutNames.has(val)) {
        // Unlikely, but handle
        lines.push(`${pad}${val};`)
      }
      // Continue to body (should be Unit)
      castWhileBody({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
        lines,
        indent,
        mutNames,
      })
      return
    }
    const val = castExpr({ term: term.val, dep, ctx })
    if (mutNames.has(name)) {
      // Reassignment of mutable variable
      lines.push(`${pad}${name} = ${val};`)
    } else {
      lines.push(`${pad}let ${name} = ${val};`)
    }
    castWhileBody({
      term: term.bod({ form: 'var', name, idx: dep }),
      dep: dep + 1,
      ctx,
      lines,
      indent,
      mutNames,
    })
    return
  }

  // Skip Unit at the end of while body
  if (term.form === 'con' && term.name === 'Unit') return

  // Other statements (e.g., if/else inside loop)
  castStmt({ term, dep, ctx, lines, indent })
}

function castTestStmt(input: {
  condition: Term
  trueArm: Term
  falseArm: Term
  dep: number
  ctx: EmitCtx
  lines: string[]
  indent: number
  tail?: TailCtx
  okWrap?: boolean
}): void {
  const { condition, trueArm, falseArm, dep, ctx, lines, indent, tail, okWrap } = input
  const pad = '    '.repeat(indent)
  const condExpr = castExpr({ term: condition, dep, ctx })

  lines.push(`${pad}if ${condExpr} {`)
  castStmt({ term: trueArm, dep, ctx, lines, indent: indent + 1, tail, okWrap })
  lines.push(`${pad}} else {`)
  castStmt({ term: falseArm, dep, ctx, lines, indent: indent + 1, tail, okWrap })
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
      // fork test → if/else expression: .test(mat, condition)
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        const mat = args[0]!
        const condition = args[1]!
        if (mat.form === 'mat') {
          const trueArm = mat.arms.find(([n]) => n === 'true')?.[1]
          const falseArm = mat.arms.find(([n]) => n === 'false')?.[1]
          if (trueArm && falseArm) {
            const condExpr = castExpr({ term: condition, dep, ctx })
            const trueExpr = castExpr({ term: trueArm, dep, ctx })
            const falseExpr = castExpr({ term: falseArm, dep, ctx })
            return `if ${condExpr} { ${trueExpr} } else { ${falseExpr} }`
          }
        }
      }
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
        if (prim === 'halt' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx })
          return `${inner}?`
        }
        if (prim === 'safe' && args.length === 1) {
          return castExpr({ term: args[0]!, dep, ctx })
        }
        if (args.length >= 1) {
          const obj = castExpr({ term: args[0]!, dep, ctx })
          const methodName = snakeCase(prim)
          // Dock module calls use :: (module-level functions)
          const isDockModule = args[0]!.form === 'ref' && ctx.dockNames.has(args[0]!.name)
          const sep = isDockModule ? '::' : '.'
          if (args.length === 1) return `${obj}${sep}${methodName}()`
          const methodArgs = args
            .slice(1)
            .map(a => castExpr({ term: a, dep, ctx }))
          return `${obj}${sep}${methodName}(${methodArgs.join(', ')})`
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
          return `${key}: Box::new(${val})`
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

/** Check if a term tree contains any .halt (error propagation) calls. */
function hasHaltCall(input: { term: Term; dep: number }): boolean {
  const { term, dep } = input
  switch (term.form) {
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
