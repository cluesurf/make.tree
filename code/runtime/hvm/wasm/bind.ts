// bind.ts - Typed wrapper around the Emscripten WASM module.
//
// Wraps cwrap/ccall into typed TypeScript functions matching
// the 23 exported symbols from lib.c.

export type HvmModule = {
  cwrap: (
    name: string,
    returnType: string | null,
    argTypes: string[],
  ) => (...args: unknown[]) => unknown
  ccall: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
  ) => unknown
  HEAPU8: Uint8Array
  HEAPU32: Uint32Array
  _malloc: (size: number) => number
  _free: (ptr: number) => void
}

export type HvmApi = {
  // Lifecycle
  init: (input: {
    threads: number
    debug?: number
    silent?: number
    steps?: number
  }) => void
  free: () => void

  // Program loading
  prepare: (input: {
    mainIdPtr: number
    srcPath: string
    srcPtr: number
  }) => number
  prepareText: (input: {
    mainIdPtr: number
    srcPath: string
    srcText: string
  }) => number

  // Evaluation
  wnf: (term: bigint) => bigint
  normalize: (term: bigint) => bigint

  // Term constructors
  termNewNum: (n: number) => bigint
  termNewCtr: (input: {
    name: number
    arity: number
    argsPtr: bigint
  }) => bigint
  termNewSup: (input: { label: number; a: bigint; b: bigint }) => bigint
  termNewDup: (input: {
    label: number
    expr: bigint
    body: bigint
  }) => bigint
  termNewApp: (input: { f: bigint; x: bigint }) => bigint
  termNewLam: (body: bigint) => bigint
  termNewLamAt: (input: { loc: bigint; body: bigint }) => bigint
  termNewVar: (loc: bigint) => bigint
  termNewRef: (id: number) => bigint

  // Term accessors
  termTag: (term: bigint) => number
  termExt: (term: bigint) => number
  termVal: (term: bigint) => bigint

  // Heap
  heapRead: (loc: bigint) => bigint
  heapSet: (input: { loc: bigint; term: bigint }) => void
  heapAlloc: (words: bigint) => bigint

  // Symbol table
  tableFind: (input: { name: string; len: number }) => number

  // Primitives
  primRegister: (input: {
    name: string
    len: number
    arity: number
    fn: number
  }) => number

  // Raw module access
  module: HvmModule
}

export function createApi(input: { module: HvmModule }): HvmApi {
  const m = input.module

  const rawInit = m.cwrap('hvm_init', null, [
    'number',
    'number',
    'number',
    'number',
  ])
  const rawFree = m.cwrap('hvm_free', null, [])
  const rawWnf = m.cwrap('hvm_wnf', 'bigint', ['bigint'])
  const rawNormalize = m.cwrap('hvm_normalize', 'bigint', ['bigint'])
  const rawPrepare = m.cwrap('hvm_prepare', 'number', [
    'number',
    'string',
    'number',
  ])
  const rawPrepareText = m.cwrap('hvm_prepare_text', 'number', [
    'number',
    'string',
    'string',
  ])
  const rawTermNewNum = m.cwrap('hvm_term_new_num', 'bigint', [
    'number',
  ])
  const rawTermNewCtr = m.cwrap('hvm_term_new_ctr', 'bigint', [
    'number',
    'number',
    'bigint',
  ])
  const rawTermNewSup = m.cwrap('hvm_term_new_sup', 'bigint', [
    'number',
    'bigint',
    'bigint',
  ])
  const rawTermNewDup = m.cwrap('hvm_term_new_dup', 'bigint', [
    'number',
    'bigint',
    'bigint',
  ])
  const rawTermNewApp = m.cwrap('hvm_term_new_app', 'bigint', [
    'bigint',
    'bigint',
  ])
  const rawTermNewLam = m.cwrap('hvm_term_new_lam', 'bigint', [
    'bigint',
  ])
  const rawTermNewLamAt = m.cwrap('hvm_term_new_lam_at', 'bigint', [
    'bigint',
    'bigint',
  ])
  const rawTermNewVar = m.cwrap('hvm_term_new_var', 'bigint', [
    'bigint',
  ])
  const rawTermNewRef = m.cwrap('hvm_term_new_ref', 'bigint', [
    'number',
  ])
  const rawTermTag = m.cwrap('hvm_term_tag', 'number', ['bigint'])
  const rawTermExt = m.cwrap('hvm_term_ext', 'number', ['bigint'])
  const rawTermVal = m.cwrap('hvm_term_val', 'bigint', ['bigint'])
  const rawHeapRead = m.cwrap('hvm_heap_read', 'bigint', ['bigint'])
  const rawHeapSet = m.cwrap('hvm_heap_set', null, ['bigint', 'bigint'])
  const rawHeapAlloc = m.cwrap('hvm_heap_alloc', 'bigint', ['bigint'])
  const rawTableFind = m.cwrap('hvm_table_find', 'number', [
    'string',
    'number',
  ])
  const rawPrimRegister = m.cwrap('hvm_prim_register', 'number', [
    'string',
    'number',
    'number',
    'number',
  ])

  return {
    init(input) {
      rawInit(
        input.threads,
        input.debug ?? 0,
        input.silent ?? 1,
        input.steps ?? 0,
      )
    },
    free() {
      rawFree()
    },
    prepare(input) {
      return rawPrepare(
        input.mainIdPtr,
        input.srcPath,
        input.srcPtr,
      ) as number
    },
    prepareText(input) {
      return rawPrepareText(
        input.mainIdPtr,
        input.srcPath,
        input.srcText,
      ) as number
    },
    wnf(term) {
      return rawWnf(term) as bigint
    },
    normalize(term) {
      return rawNormalize(term) as bigint
    },
    termNewNum(n) {
      return rawTermNewNum(n) as bigint
    },
    termNewCtr(input) {
      return rawTermNewCtr(
        input.name,
        input.arity,
        input.argsPtr,
      ) as bigint
    },
    termNewSup(input) {
      return rawTermNewSup(input.label, input.a, input.b) as bigint
    },
    termNewDup(input) {
      return rawTermNewDup(
        input.label,
        input.expr,
        input.body,
      ) as bigint
    },
    termNewApp(input) {
      return rawTermNewApp(input.f, input.x) as bigint
    },
    termNewLam(body) {
      return rawTermNewLam(body) as bigint
    },
    termNewLamAt(input) {
      return rawTermNewLamAt(input.loc, input.body) as bigint
    },
    termNewVar(loc) {
      return rawTermNewVar(loc) as bigint
    },
    termNewRef(id) {
      return rawTermNewRef(id) as bigint
    },
    termTag(term) {
      return rawTermTag(term) as number
    },
    termExt(term) {
      return rawTermExt(term) as number
    },
    termVal(term) {
      return rawTermVal(term) as bigint
    },
    heapRead(loc) {
      return rawHeapRead(loc) as bigint
    },
    heapSet(input) {
      rawHeapSet(input.loc, input.term)
    },
    heapAlloc(words) {
      return rawHeapAlloc(words) as bigint
    },
    tableFind(input) {
      return rawTableFind(input.name, input.len) as number
    },
    primRegister(input) {
      return rawPrimRegister(
        input.name,
        input.len,
        input.arity,
        input.fn,
      ) as number
    },
    module: m,
  }
}
