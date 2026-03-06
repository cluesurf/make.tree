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
 *   - Multi-use variables → .clone() on all-but-last use, move on last
 *   - Tail recursion → loop { ... } with reassignment
 */

import type { Term, Book, Oper, Tele } from '@/term/form'
import type { TraitMeta } from '@/cast/trait'
import type { AsyncMeta } from '@/term/desugar'

type EmitCtx = {
  tagMap: Map<string, number>
  fieldMap: Map<string, string[]>
  fieldTypeMap: Map<string, Array<{ name: string; typ: string }>>
  arityMap: Map<string, number>
  ctrToEnum: Map<string, string>
  headParams: Map<string, string[]>
  enumNames: Set<string>
  structNames: Set<string>
  dockNames: Set<string>
  book: Book
}

type TailCtx = {
  refName: string
  params: string[]
} | null

/**
 * Tracks remaining uses per variable for clone/move analysis.
 * Each time a variable is referenced, its count is decremented.
 * If remaining > 0: emit .clone() (not the last use).
 * If remaining == 0: emit bare name (last use = move).
 */
type UsageCtx = Map<string, number>

// ---- Public API ----

export type DockLoad = { path: string; name?: string }

/** Names that map to Rust built-in types (skip enum generation). */
const RUST_BUILTIN_FORMS = new Set(['result', 'maybe'])

/** Check if a form name is the maybe/optional type. */
function isMaybe(name: string): boolean {
  return name === 'maybe'
}

export function castBook(input: {
  book: Book
  dock?: DockLoad[]
  traits?: TraitMeta
  asyncMeta?: AsyncMeta
}): string {
  const dockNames = new Set<string>()
  for (const load of input.dock ?? []) {
    if (load.name) dockNames.add(load.name)
  }

  const ctx = analyze({ book: input.book, dockNames })
  const asyncMeta = input.asyncMeta ?? new Map()
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
    const isAsync = asyncMeta.get(name) === true

    if (val.form === 'lam') {
      const heads = ctx.headParams.get(name) ?? []
      const genericStr = heads.length > 0 ? `<${heads.map(h => capitalize(h)).join(', ')}>` : ''

      // Skip head param lambdas
      let valTerm: Term = val
      let headDep = 0
      for (let i = 0; i < heads.length; i++) {
        if (valTerm.form === 'lam') {
          valTerm = valTerm.bod({ form: 'var', name: valTerm.name, idx: headDep })
          headDep++
        }
      }
      // Also skip head param types from paramTypes
      const valueParamTypes = paramTypes.slice(heads.length)

      const { params, body } = unwrapLam({ term: valTerm, dep: headDep })
      const totalDep = headDep + params.length
      const usesHalt = hasHaltCall({ term: body, dep: totalDep })
      const returnType = usesHalt
        ? `Result<${baseReturnType}, Box<dyn std::error::Error>>`
        : baseReturnType
      const paramStr = params
        .map((p, i) => {
          const typ = valueParamTypes[i] ?? 'impl Clone'
          return `${p.name}: ${typ}`
        })
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
      const usage = buildUsageMap({ term: body, dep: totalDep })
      castStmt({
        term: body,
        dep: totalDep,
        ctx,
        lines: bodyLines,
        indent: bodyIndent,
        tail,
        okWrap: usesHalt,
        usage,
      })
      const asyncPrefix = isAsync ? 'async ' : ''
      if (isTailRec) {
        lines.push(
          `${asyncPrefix}fn ${safeName}${genericStr}(${paramStr}) -> ${returnType} {\n    loop {\n${bodyLines.join('\n')}\n    }\n}`,
        )
      } else {
        lines.push(
          `${asyncPrefix}fn ${safeName}${genericStr}(${paramStr}) -> ${returnType} {\n${bodyLines.join('\n')}\n}`,
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
  const { term, ctx } = input
  const typeName = pascalCase(input.name)
  const isStruct = ctx.structNames.has(input.name)
  const lines: string[] = []
  lines.push(`#[derive(Clone, Debug, PartialEq)]`)

  if (isStruct) {
    // Single-constructor form → emit as struct
    const ctr = term.ctrs[0]!
    const fieldTypes = ctx.fieldTypeMap.get(ctr.name) ?? []
    if (fieldTypes.length === 0) {
      lines.push(`struct ${typeName};`)
    } else {
      lines.push(`struct ${typeName} {`)
      for (const ft of fieldTypes) {
        const typ = resolveFieldType({ typ: ft.typ, parentName: input.name, ctx })
        lines.push(`    ${snakeCase(ft.name)}: ${typ},`)
      }
      lines.push('}')
    }
  } else {
    // Multi-constructor form → enum
    lines.push(`enum ${typeName} {`)
    for (const ctr of term.ctrs) {
      const fieldTypes = ctx.fieldTypeMap.get(ctr.name) ?? []
      const ctrName = pascalCase(ctr.name)
      if (fieldTypes.length === 0) {
        lines.push(`    ${ctrName},`)
      } else {
        const fieldStr = fieldTypes
          .map(ft => {
            const typ = resolveFieldType({ typ: ft.typ, parentName: input.name, ctx })
            return `${snakeCase(ft.name)}: ${typ}`
          })
          .join(', ')
        lines.push(`    ${ctrName} { ${fieldStr} },`)
      }
    }
    lines.push('}')
  }
  return lines.join('\n')
}

/** Resolve a field type string for use in struct/enum field declarations.
 * Boxes ADT types for recursion, falls back to Box<parentType> for untyped fields. */
function resolveFieldType(input: { typ: string; parentName: string; ctx: EmitCtx }): string {
  const { typ, parentName, ctx } = input
  // Unresolved type (from untyped link) → Box<ParentType>
  if (typ === 'impl Clone') return `Box<${pascalCase(parentName)}>`
  if (isBoxedField({ typ, ctx })) return `Box<${typ}>`
  return typ
}

/** Check whether a field type needs Box wrapping (ADT types need it). */
function isBoxedField(input: { typ: string; ctx: EmitCtx }): boolean {
  const { typ, ctx } = input
  if (typ === 'impl Clone') return true
  for (const name of ctx.enumNames) {
    if (pascalCase(name) === typ) return true
  }
  return false
}

/** Check if a dotted access name is a known field of a struct type. */
function isStructFieldAccess(input: { fieldName: string; ctx: EmitCtx }): boolean {
  const { fieldName, ctx } = input
  for (const structName of ctx.structNames) {
    const term = ctx.book.get(structName)
    if (!term) continue
    const val = unwrapAnn(term)
    if (val.form !== 'adt') continue
    for (const ctr of val.ctrs) {
      const fields = ctx.fieldMap.get(ctr.name) ?? []
      if (fields.includes(fieldName)) return true
    }
  }
  return false
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

  for (const bookKey of implInfo.methods) {
    const term = ctx.book.get(bookKey)
    if (!term) continue

    // bookKey may be "formName/methodName", emit just the method name
    const shortName = bookKey.includes('/') ? bookKey.split('/').pop()! : bookKey
    const safeName = snakeCase(shortName)
    const paramTypes = extractParamTypes({ term, ctx })

    // Use mask's declared return type if available
    const maskMethod = mask?.methods.find(m => m.name === shortName)
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
    case 'maybe':
      return 'Option<impl Clone>'
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
  const literals = { hasNum: false, hasFlt: false, hasText: false }
  collectReturnInfo({ term: body, ctx, adts, literals })

  if (adts.size === 1 && !literals.hasNum && !literals.hasFlt && !literals.hasText) {
    const formName = [...adts][0]!
    if (isMaybe(formName)) return 'Option<impl Clone>'
    return pascalCase(formName)
  }

  if (literals.hasText && adts.size === 0 && !literals.hasNum && !literals.hasFlt) return 'String'
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
  literals: { hasNum: boolean; hasFlt: boolean; hasText: boolean }
  fieldVars?: Map<string, string>
}): void {
  const { term, ctx, adts, literals, fieldVars } = input
  switch (term.form) {
    case 'con': {
      const adt = ctx.ctrToEnum.get(term.name)
      if (adt) adts.add(adt)
      for (const [, arg] of term.args) {
        collectReturnInfo({ term: arg, ctx, adts, literals, fieldVars })
      }
      break
    }
    case 'num':
    case 'nat':
      literals.hasNum = true
      break
    case 'txt':
      literals.hasText = true
      break
    case 'var': {
      // If this variable was bound from a mat arm field, use its field type
      if (fieldVars) {
        const fieldType = fieldVars.get(term.name)
        if (fieldType) {
          switch (fieldType) {
            case 'u8': case 'u16': case 'u32': case 'u64': case 'u128':
            case 'i8': case 'i16': case 'i32': case 'i64': case 'i128':
            case 'nat':
              literals.hasNum = true
              break
            case 'f32': case 'f64':
              literals.hasFlt = true
              break
            case 'text':
              literals.hasText = true
              break
            default: {
              if (ctx.enumNames.has(fieldType)) adts.add(fieldType)
              break
            }
          }
        }
      }
      break
    }
    case 'app':
      collectReturnInfo({ term: term.func, ctx, adts, literals, fieldVars })
      collectReturnInfo({ term: term.argm, ctx, adts, literals, fieldVars })
      break
    case 'let':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      collectReturnInfo({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
        literals,
        fieldVars,
      })
      break
    case 'mat': {
      for (const [ctrName, bod] of term.arms) {
        // Build field variable type map from constructor field types
        const ctrFieldTypes = ctx.fieldTypeMap.get(ctrName) ?? []
        const armFieldVars = new Map(fieldVars ?? [])
        let armBod = bod
        let fieldIdx = 0
        while (armBod.form === 'lam') {
          const ft = ctrFieldTypes[fieldIdx]
          const varName = armBod.name
          if (ft) armFieldVars.set(varName, ft.typ)
          armBod = armBod.bod({ form: 'var', name: varName, idx: 0 })
          fieldIdx++
        }
        collectReturnInfo({ term: armBod, ctx, adts, literals, fieldVars: armFieldVars })
      }
      break
    }
    case 'lam':
      collectReturnInfo({
        term: term.bod({ form: 'var', name: term.name, idx: 0 }),
        ctx,
        adts,
        literals,
        fieldVars,
      })
      break
    case 'ann':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      break
    case 'ins':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      break
    case 'src':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      break
    case 'use':
      collectReturnInfo({
        term: term.bod(term.val),
        ctx,
        adts,
        literals,
        fieldVars,
      })
      break
    case 'log':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      break
    case 'rst':
      collectReturnInfo({ term: term.val, ctx, adts, literals, fieldVars })
      break
    case 'hlt':
      break
    case 'swi':
      collectReturnInfo({ term: term.zero, ctx, adts, literals, fieldVars })
      collectReturnInfo({ term: term.succ, ctx, adts, literals, fieldVars })
      break
    case 'op2':
      literals.hasNum = true
      break
  }
}

function resolveRustType(input: { term: Term; ctx: EmitCtx }): string {
  const { term, ctx } = input
  if (term.form === 'ref') {
    if (isMaybe(term.name)) {
      // Look up the some constructor's value field type
      const someFields = ctx.fieldTypeMap.get('some')
      if (someFields && someFields.length > 0 && someFields[0]!.typ !== 'impl Clone') {
        return `Option<${someFields[0]!.typ}>`
      }
      return 'Option<impl Clone>'
    }
    if (ctx.enumNames.has(term.name)) return pascalCase(term.name)
    return pascalCase(term.name)
  }
  if (term.form === 'u64') return 'u64'
  if (term.form === 'f64') return 'f64'
  // All (pi type) → impl Fn(A, B, ...) -> R for function-typed params
  if (term.form === 'all') {
    const paramTypes: string[] = []
    let cur: Term = term
    while (cur.form === 'all') {
      paramTypes.push(resolveRustType({ term: cur.inp, ctx }))
      cur = cur.bod({ form: 'var', name: cur.name, idx: 0 })
    }
    const retType = resolveRustType({ term: cur, ctx })
    return `impl Fn(${paramTypes.join(', ')}) -> ${retType}`
  }
  return 'impl Clone'
}

// ---- Phase A: Analyze ----

function analyze(input: { book: Book; dockNames: Set<string> }): EmitCtx {
  const tagMap = new Map<string, number>()
  const fieldMap = new Map<string, string[]>()
  const fieldTypeMap = new Map<string, Array<{ name: string; typ: string }>>()
  const arityMap = new Map<string, number>()
  const ctrToEnum = new Map<string, string>()
  const enumNames = new Set<string>()
  const structNames = new Set<string>()

  // First pass: collect all ADT names so we can resolve types
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      enumNames.add(name)
    }
  }

  // Partial ctx for type resolution during analysis
  const partialCtx = { enumNames, structNames } as EmitCtx

  // Second pass: build all maps
  for (const [name, term] of input.book) {
    const val = unwrapAnn(term)
    if (val.form === 'adt') {
      // Single-constructor form with matching name → struct
      if (val.ctrs.length === 1 && val.ctrs[0]!.name === name) {
        structNames.add(name)
      }
      let localTag = 0
      for (const ctr of val.ctrs) {
        tagMap.set(ctr.name, localTag++)
        fieldMap.set(ctr.name, teleToFieldNames(ctr.tele))
        fieldTypeMap.set(ctr.name, teleToFieldTypes({ tele: ctr.tele, ctx: partialCtx }))
        ctrToEnum.set(ctr.name, name)
      }
    }
    if (val.form === 'lam') {
      arityMap.set(name, countLamDepth(val))
    }
  }

  // Extract head (type) params from Ann type annotations
  const headParams = new Map<string, string[]>()
  for (const [name, term] of input.book) {
    const heads = extractHeadParams(term)
    if (heads.length > 0) {
      headParams.set(name, heads)
    }
  }

  return {
    tagMap,
    fieldMap,
    fieldTypeMap,
    arityMap,
    ctrToEnum,
    headParams,
    enumNames,
    structNames,
    dockNames: input.dockNames,
    book: input.book,
  }
}

/** Extract type parameter names from a term's type annotation. */
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

function teleToFieldTypes(input: {
  tele: Tele
  ctx: EmitCtx
}): Array<{ name: string; typ: string }> {
  const fields: Array<{ name: string; typ: string }> = []
  let cur = input.tele
  while (cur.form === 'ext') {
    fields.push({
      name: cur.name,
      typ: resolveRustType({ term: cur.typ, ctx: input.ctx }),
    })
    cur = cur.bod({ form: 'var', name: cur.name, idx: 0 })
  }
  return fields
}

/** Count how many times a variable name appears in a term tree. */
function countVarUses(input: { name: string; term: Term; dep: number }): number {
  const { name, term, dep } = input
  switch (term.form) {
    case 'var':
      return term.name === name ? 1 : 0
    case 'ref':
    case 'num':
    case 'nat':
    case 'txt':
    case 'set':
    case 'u64':
    case 'f64':
    case 'nxt':
      return 0
    case 'lam':
      return countVarUses({
        name,
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        dep: dep + 1,
      })
    case 'app':
      return (
        countVarUses({ name, term: term.func, dep }) +
        countVarUses({ name, term: term.argm, dep })
      )
    case 'let':
      return (
        countVarUses({ name, term: term.val, dep }) +
        countVarUses({
          name,
          term: term.bod({ form: 'var', name: term.name, idx: dep }),
          dep: dep + 1,
        })
      )
    case 'op2':
      return (
        countVarUses({ name, term: term.a, dep }) +
        countVarUses({ name, term: term.b, dep })
      )
    case 'mat':
      return term.arms.reduce((sum, [, bod]) => {
        let inner: Term = bod
        let d = dep
        while (inner.form === 'lam') {
          inner = inner.bod({ form: 'var', name: inner.name, idx: d })
          d++
        }
        return sum + countVarUses({ name, term: inner, dep: d })
      }, 0)
    case 'swi':
      return (
        countVarUses({ name, term: term.zero, dep }) +
        countVarUses({ name, term: term.succ, dep })
      )
    case 'con':
      return term.args.reduce(
        (sum, [, arg]) => sum + countVarUses({ name, term: arg, dep }),
        0,
      )
    case 'ann':
      return countVarUses({ name, term: term.val, dep })
    case 'all':
      return (
        countVarUses({ name, term: term.inp, dep }) +
        countVarUses({
          name,
          term: term.bod({ form: 'var', name: term.name, idx: dep }),
          dep: dep + 1,
        })
      )
    case 'log':
      return (
        countVarUses({ name, term: term.msg, dep }) +
        countVarUses({ name, term: term.val, dep })
      )
    case 'rst':
      return countVarUses({ name, term: term.val, dep })
    case 'hlt':
      return countVarUses({ name, term: term.msg, dep })
    case 'adt':
      return 0
    default:
      return 0
  }
}

/**
 * Build a usage map for all variables in a term body.
 * Walks the entire tree and counts how many times each variable name
 * appears. This is the pre-pass for clone/move analysis.
 */
function buildUsageMap(input: { term: Term; dep: number }): UsageCtx {
  const map: UsageCtx = new Map()
  collectVarUses({ term: input.term, dep: input.dep, map })
  return map
}

function collectVarUses(input: {
  term: Term
  dep: number
  map: UsageCtx
}): void {
  const { term, dep, map } = input
  if (!term || !term.form) return
  switch (term.form) {
    case 'var':
      map.set(term.name, (map.get(term.name) ?? 0) + 1)
      return
    case 'ref':
    case 'num':
    case 'nat':
    case 'txt':
    case 'set':
    case 'u64':
    case 'f64':
    case 'nxt':
    case 'hol':
    case 'met':
      return
    case 'lam':
      collectVarUses({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        dep: dep + 1,
        map,
      })
      return
    case 'app':
      collectVarUses({ term: term.func, dep, map })
      collectVarUses({ term: term.argm, dep, map })
      return
    case 'let':
      collectVarUses({ term: term.val, dep, map })
      collectVarUses({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        dep: dep + 1,
        map,
      })
      return
    case 'op2':
      collectVarUses({ term: term.a, dep, map })
      collectVarUses({ term: term.b, dep, map })
      return
    case 'mat':
      for (const [, bod] of term.arms) {
        let inner: Term = bod
        let d = dep
        while (inner.form === 'lam') {
          inner = inner.bod({ form: 'var', name: inner.name, idx: d })
          d++
        }
        collectVarUses({ term: inner, dep: d, map })
      }
      return
    case 'swi':
      collectVarUses({ term: term.zero, dep, map })
      collectVarUses({ term: term.succ, dep, map })
      return
    case 'con':
      for (const [, arg] of term.args) {
        collectVarUses({ term: arg, dep, map })
      }
      return
    case 'ann':
      collectVarUses({ term: term.val, dep, map })
      return
    case 'all':
      collectVarUses({ term: term.inp, dep, map })
      collectVarUses({
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
        dep: dep + 1,
        map,
      })
      return
    case 'log':
      collectVarUses({ term: term.msg, dep, map })
      collectVarUses({ term: term.val, dep, map })
      return
    case 'rst':
      collectVarUses({ term: term.val, dep, map })
      return
    case 'hlt':
      collectVarUses({ term: term.msg, dep, map })
      return
    case 'lst':
      for (const item of term.list) {
        collectVarUses({ term: item, dep, map })
      }
      return
    case 'ins':
      collectVarUses({ term: term.val, dep, map })
      return
    case 'src':
      collectVarUses({ term: term.val, dep, map })
      return
    case 'use':
      collectVarUses({ term: term.bod(term.val), dep, map })
      return
    case 'adt':
    case 'slf':
      return
    default:
      return
  }
}

/**
 * Use a variable from the usage map.
 * Decrements remaining count and returns whether this use needs .clone().
 * Returns true if this is NOT the last use (needs clone).
 * Returns false if this IS the last use (move) or if the variable is not cloneable.
 */
function useVar(input: { name: string; usage: UsageCtx }): boolean {
  const { name, usage } = input
  const remaining = usage.get(name)
  if (remaining === undefined || remaining <= 1) {
    usage.set(name, 0)
    return false
  }
  usage.set(name, remaining - 1)
  return true
}

/** Check if a type is Copy (primitives that don't need clone/move). */
function isCopyType(name: string): boolean {
  return name.startsWith('_') || name === 'true' || name === 'false'
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
    case 'rst':
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
  usage?: UsageCtx
}): void {
  const { term, dep, ctx, lines, indent, tail, okWrap, usage } = input
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
          usage,
        })
        return
      }
      const name = varName({ name: term.name, dep })
      const bodTerm = term.bod({ form: 'var', name, idx: dep })
      // Count uses of this variable in the body for unused-var handling
      const varUses = usage
        ? (usage.get(name) ?? 0)
        : countVarUses({ name, term: bodTerm, dep: dep + 1 })
      const val = castExpr({ term: term.val, dep, ctx, usage })
      const displayName = varUses === 0 ? `_${name}` : name
      lines.push(`${pad}let ${displayName} = ${val};`)
      castStmt({
        term: bodTerm,
        dep: dep + 1,
        ctx,
        lines,
        indent,
        tail,
        okWrap,
        usage,
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
              usage,
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
          usage,
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
          usage,
        })
        return
      }
      // .test(Mat, condition) → if/else
      if (
        func.form === 'ref' &&
        func.name === '.test' &&
        args.length === 2 &&
        args[0]!.form === 'mat'
      ) {
        castMatchStmt({
          arms: (args[0]! as any).arms,
          scrutinee: args[1]!,
          dep,
          ctx,
          lines,
          indent,
          tail,
          okWrap,
          usage,
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
          const iterExpr = castExpr({ term: args[0]!, dep, ctx, usage })
          lines.push(`${pad}for ${name} in ${iterExpr}.iter() {`)
          const bodTerm = lam.bod({ form: 'var', name, idx: dep })
          castStmt({
            term: bodTerm,
            dep: dep + 1,
            ctx,
            lines,
            indent: indent + 1,
            usage,
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
          const argExpr = castExpr({ term: args[0]!, dep, ctx, usage })
          lines.push(`${pad}${tail.params[0]} = ${argExpr};`)
        } else {
          for (let i = 0; i < args.length; i++) {
            const argExpr = castExpr({ term: args[i]!, dep, ctx, usage })
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
      const msg = castExpr({ term: term.msg, dep, ctx, usage })
      lines.push(`${pad}println!("{}", ${msg});`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap, usage })
      return
    }
    case 'rst': {
      // Rust has no debugger statement; emit a comment
      lines.push(`${pad}// breakpoint`)
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap, usage })
      return
    }
    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx, usage })
      if (term.term === 'fork') {
        lines.push(`${pad}break;`)
      } else {
        lines.push(`${pad}panic!("{}", ${msg});`)
      }
      return
    }
    case 'nxt': {
      lines.push(`${pad}continue;`)
      return
    }
    case 'ann':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap, usage })
      return
    case 'ins':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap, usage })
      return
    case 'src':
      castStmt({ term: term.val, dep, ctx, lines, indent, tail, okWrap, usage })
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
        usage,
      })
      return
  }

  const expr = castExpr({ term, dep, ctx, usage })
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
  usage?: UsageCtx
}): void {
  const { arms, scrutinee, dep, ctx, lines, indent, tail, okWrap, usage } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx, usage })

  // Detect maybe type for native optional matching
  const firstFormName = arms.length > 0 ? ctx.ctrToEnum.get(arms[0]![0]) : undefined
  const isMaybeMatch = firstFormName !== undefined && isMaybe(firstFormName)

  // Usage-aware clone: only clone if the variable has more uses remaining
  const needsClone = scrutinee.form === 'var' && usage
    ? (usage.get(scrutinee.name) ?? 0) > 0
    : scrutinee.form === 'var'
  const scrStr = needsClone ? `${scrExpr}.clone()` : scrExpr
  lines.push(`${pad}match ${scrStr} {`)
  for (const [name, bod] of arms) {
    const formName = ctx.ctrToEnum.get(name)

    let armBod = bod
    let armDep = dep

    if (isMaybeMatch) {
      // Native optional pattern: Some(value) / None
      if (name === 'some') {
        const paramNames: string[] = []
        while (armBod.form === 'lam') {
          const paramName = varName({ name: armBod.name, dep: armDep })
          paramNames.push(paramName)
          armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
          armDep++
        }
        const bindStr = paramNames.length > 0 ? `(${paramNames.join(', ')})` : ''
        lines.push(`${pad}    Some${bindStr} => {`)
      } else {
        // none arm: skip lambda unwrapping
        while (armBod.form === 'lam') {
          const paramName = varName({ name: armBod.name, dep: armDep })
          armBod = armBod.bod({ form: 'var', name: paramName, idx: armDep })
          armDep++
        }
        lines.push(`${pad}    None => {`)
      }
      castStmt({ term: armBod, dep: armDep, ctx, lines, indent: indent + 2, tail, okWrap, usage })
      lines.push(`${pad}    }`)
      continue
    }

    const ctrName = pascalCase(name)
    const isStruct = formName ? ctx.structNames.has(formName) : false
    const qualifiedName = isStruct
      ? pascalCase(formName!)
      : formName
        ? `${pascalCase(formName)}::${ctrName}`
        : ctrName
    const fields = ctx.fieldMap.get(name) ?? []
    const bindings: string[] = []

    const fieldTypes = ctx.fieldTypeMap.get(name) ?? []

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
      for (let bi = 0; bi < bindings.length; bi++) {
        const paramName = bindings[bi]!.split(': ')[1]!
        const ft = fieldTypes[bi]
        const needsDeref = ft ? isBoxedField({ typ: ft.typ, ctx }) : true
        if (needsDeref) {
          lines.push(`${innerPad}let ${paramName} = *${paramName};`)
        }
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
      usage,
    })
    lines.push(`${pad}    }`)
  }

  // Add wildcard arm if the match does not cover all constructors
  if (isMaybeMatch) {
    // Maybe has 2 constructors (some, none). If not both present, add wildcard.
    const hasSome = arms.some(([n]) => n === 'some')
    const hasNone = arms.some(([n]) => n === 'none')
    if (!hasSome || !hasNone) {
      lines.push(`${pad}    _ => { unreachable!() }`)
    }
  } else if (arms.length > 0) {
    const firstCtr = arms[0]![0]
    const formName = ctx.ctrToEnum.get(firstCtr)
    if (formName) {
      const adtTerm = ctx.book.get(formName)
      const adt = adtTerm ? unwrapAnn(adtTerm) : undefined
      if (adt && adt.form === 'adt' && arms.length < adt.ctrs.length) {
        lines.push(`${pad}    _ => { unreachable!() }`)
      }
    }
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
  usage?: UsageCtx
}): void {
  const { zero, succ, scrutinee, dep, ctx, lines, indent, tail, okWrap, usage } = input
  const pad = '    '.repeat(indent)
  const scrExpr = castExpr({ term: scrutinee, dep, ctx, usage })

  lines.push(`${pad}if ${scrExpr} == 0 {`)
  castStmt({ term: zero, dep, ctx, lines, indent: indent + 1, tail, okWrap, usage })

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
      usage,
    })
  } else {
    lines.push(`${pad}} else {`)
    const succExpr = castExpr({ term: succ, dep, ctx, usage })
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
  usage?: UsageCtx
}): void {
  const { condition, trueArm, falseArm, dep, ctx, lines, indent, tail, okWrap, usage } = input
  const pad = '    '.repeat(indent)
  const condExpr = castExpr({ term: condition, dep, ctx, usage })

  lines.push(`${pad}if ${condExpr} {`)
  castStmt({ term: trueArm, dep, ctx, lines, indent: indent + 1, tail, okWrap, usage })
  lines.push(`${pad}} else {`)
  castStmt({ term: falseArm, dep, ctx, lines, indent: indent + 1, tail, okWrap, usage })
  lines.push(`${pad}}`)
}

// ---- Phase B: Expression Mode ----

function castExpr(input: {
  term: Term
  dep: number
  ctx: EmitCtx
  usage?: UsageCtx
}): string {
  const { term, dep, ctx, usage } = input

  switch (term.form) {
    case 'lam': {
      const { params, body } = unwrapLam({ term, dep })
      const paramStr = params.map(p => p.name).join(', ')
      const bodyExpr = castExpr({
        term: body,
        dep: dep + params.length,
        ctx,
        usage,
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
            const condExpr = castExpr({ term: condition, dep, ctx, usage })
            const trueExpr = castExpr({ term: trueArm, dep, ctx, usage })
            const falseExpr = castExpr({ term: falseArm, dep, ctx, usage })
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
          usage,
        })
        return `{\n${bodyLines.join('\n')}\n}`
      }
      if (func.form === 'ref' && func.name.startsWith('.')) {
        const prim = func.name.slice(1)
        if (prim === 'wait' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx, usage })
          return `${inner}.await`
        }
        if (prim === 'halt' && args.length === 1) {
          const inner = castExpr({ term: args[0]!, dep, ctx, usage })
          return `${inner}?`
        }
        if (prim === 'safe' && args.length === 1) {
          return castExpr({ term: args[0]!, dep, ctx, usage })
        }
        if (prim === 'and' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx, usage }))
          return `(${parts.join(' && ')})`
        }
        if (prim === 'or' && args.length >= 2) {
          const parts = args.map(a => castExpr({ term: a, dep, ctx, usage }))
          return `(${parts.join(' || ')})`
        }
        if (args.length >= 1) {
          const obj = castExpr({ term: args[0]!, dep, ctx, usage })
          const methodName = snakeCase(prim)
          // Dock module calls use :: (module-level functions)
          const isDockModule = args[0]!.form === 'ref' && ctx.dockNames.has(args[0]!.name)
          const sep = isDockModule ? '::' : '.'
          if (args.length === 1) {
            // Check if this is a struct field access (no parens needed)
            if (isStructFieldAccess({ fieldName: prim, ctx })) {
              return `${obj}${sep}${methodName}`
            }
            return `${obj}${sep}${methodName}()`
          }
          const methodArgs = args
            .slice(1)
            .map(a => castExpr({ term: a, dep, ctx, usage }))
          return `${obj}${sep}${methodName}(${methodArgs.join(', ')})`
        }
      }
      const funcStr = castExpr({ term: func, dep, ctx, usage })
      const argsStr = args.map(a => castExpr({ term: a, dep, ctx, usage }))
      return `${funcStr}(${argsStr.join(', ')})`
    }
    case 'let': {
      const name = varName({ name: term.name, dep })
      const val = castExpr({ term: term.val, dep, ctx, usage })
      const body = castExpr({
        term: term.bod({ form: 'var', name, idx: dep }),
        dep: dep + 1,
        ctx,
        usage,
      })
      return `{ let ${name} = ${val}; ${body} }`
    }
    case 'use':
      return castExpr({ term: term.bod(term.val), dep, ctx, usage })
    case 'ref':
      return snakeCase(term.name)
    case 'var': {
      if (usage) {
        // Decrement usage count to track last-use for future
        // clone/move emission (requires type awareness to know
        // which types need .clone() vs are Copy)
        useVar({ name: term.name, usage })
      }
      return term.name
    }
    case 'num':
      return `${term.val}_u64`
    case 'txt':
      return `String::from(${JSON.stringify(term.val)})`
    case 'nat':
      return `${term.val}_u64`
    case 'con': {
      const formName = ctx.ctrToEnum.get(term.name)
      // Native optional: maybe → Option
      if (formName && isMaybe(formName)) {
        if (term.name === 'none') return 'None'
        if (term.name === 'some' && term.args.length > 0) {
          const val = castExpr({ term: term.args[0]![1], dep, ctx, usage })
          return `Some(${val})`
        }
      }
      const ctrName = pascalCase(term.name)
      const isStruct = formName ? ctx.structNames.has(formName) : false
      const qualifiedName = isStruct
        ? pascalCase(formName!)
        : formName
          ? `${pascalCase(formName)}::${ctrName}`
          : ctrName
      if (term.args.length === 0) return qualifiedName
      const fieldTypes = ctx.fieldTypeMap.get(term.name) ?? []
      const fields = term.args
        .map(([field, t], i) => {
          const val = castExpr({ term: t, dep, ctx, usage })
          const key = field ? snakeCase(field) : '_'
          const ft = fieldTypes[i]
          const needsBox = ft ? isBoxedField({ typ: ft.typ, ctx }) : true
          return `${key}: ${needsBox ? `Box::new(${val})` : val}`
        })
        .join(', ')
      return `${qualifiedName} { ${fields} }`
    }
    case 'op2': {
      const op = castOper(term.oper)
      const a = castExpr({ term: term.a, dep, ctx, usage })
      const b = castExpr({ term: term.b, dep, ctx, usage })
      return `(${a} ${op} ${b})`
    }
    case 'lst': {
      if (term.list.length === 0) return 'vec![]'
      const items = term.list.map(t => castExpr({ term: t, dep, ctx, usage }))
      return `vec![${items.join(', ')}]`
    }
    case 'log': {
      const msg = castExpr({ term: term.msg, dep, ctx, usage })
      const val = castExpr({ term: term.val, dep, ctx, usage })
      return `{ println!("{}", ${msg}); ${val} }`
    }
    case 'rst': {
      const val = castExpr({ term: term.val, dep, ctx, usage })
      return `{ /* breakpoint */ ${val} }`
    }
    case 'hlt': {
      const msg = castExpr({ term: term.msg, dep, ctx, usage })
      return `panic!("{}", ${msg})`
    }
    case 'nxt':
      return '() /* continue */'
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
    case 'rst':
      return hasHaltCall({ term: term.val, dep })
    case 'hlt':
      return false
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

function capitalize(name: string): string {
  if (!name) return name
  return name[0]!.toUpperCase() + name.slice(1)
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
