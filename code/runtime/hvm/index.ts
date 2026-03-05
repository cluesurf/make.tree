/**
 * HVM bridge manager.
 *
 * Integrates the HVM WASM runtime into the Runtime class.
 * Loads HVM code, provides eval/normalize, manages the handle
 * table and IO action loop.
 *
 * The HvmBridge is an optional component. When enabled, pure
 * definitions are loaded into HVM for evaluation. Effectful
 * definitions remain in the native runtime (TS/Rust/Kotlin/Swift).
 */

import type { HvmApi } from './wasm/bind'
import type { HvmValue } from './form'
import { HandleTable } from './wasm/handle'
import { toTerm, fromTerm } from './wasm/marshal'
import type { MarshalContext } from './wasm/marshal'
import { runIo } from './wasm/loop'
import type { NativePrimFn, IoContext } from './wasm/loop'

export type HvmBridgeConfig = {
  /** The loaded HVM WASM API. */
  api: HvmApi
  /** Number of threads (1 for browser WASM). */
  threads?: number
}

export class HvmBridge {
  private api: HvmApi
  private handles: HandleTable
  private marshalCtx: MarshalContext | null = null
  private ioCtx: IoContext | null = null
  private prims: Map<string, NativePrimFn> = new Map()
  private initialized = false

  constructor(config: HvmBridgeConfig) {
    this.api = config.api
    this.handles = new HandleTable()
  }

  /** Initialize the HVM runtime. Must be called before eval/normalize. */
  init(input?: { threads?: number }): void {
    if (this.initialized) return

    this.api.init({
      threads: input?.threads ?? 1,
      silent: 1,
    })

    // Resolve well-known constructor IDs for marshaling
    this.marshalCtx = {
      api: this.api,
      handles: this.handles,
      ids: {
        boolTrue: this.api.tableFind({ name: 'Bool.true', len: 9 }),
        boolFalse: this.api.tableFind({ name: 'Bool.false', len: 10 }),
        listCons: this.api.tableFind({ name: 'List.cons', len: 9 }),
        listNil: this.api.tableFind({ name: 'List.nil', len: 8 }),
        stringCons: this.api.tableFind({ name: 'String.cons', len: 11 }),
        stringNil: this.api.tableFind({ name: 'String.nil', len: 10 }),
      },
    }

    this.ioCtx = {
      marshal: this.marshalCtx,
      ids: {
        ioDone: this.api.tableFind({ name: 'IO.done', len: 7 }),
        ioCall: this.api.tableFind({ name: 'IO.call', len: 7 }),
        ioBind: this.api.tableFind({ name: 'IO.bind', len: 7 }),
      },
      prims: this.prims,
    }

    this.initialized = true
  }

  /** Load HVM source code into the runtime. */
  loadCode(input: { code: string; name?: string }): void {
    if (!this.initialized) this.init()

    const mainIdBuf = new ArrayBuffer(4)
    const mainIdView = new DataView(mainIdBuf)
    const mainIdPtr = this.api.module._malloc(4)

    this.api.prepareText({
      mainIdPtr,
      srcPath: input.name ?? '<runtime>',
      srcText: input.code,
    })

    this.api.module._free(mainIdPtr)
  }

  /** Register a native primitive function for IO callbacks. */
  registerPrim(input: { name: string; fn: NativePrimFn }): void {
    this.prims.set(input.name, input.fn)
  }

  /** Evaluate an HVM term to weak head normal form. */
  wnf(input: { term: bigint }): bigint {
    if (!this.initialized) throw new Error('HVM bridge not initialized')
    return this.api.wnf(input.term)
  }

  /** Normalize an HVM term to full normal form. */
  normalize(input: { term: bigint }): bigint {
    if (!this.initialized) throw new Error('HVM bridge not initialized')
    return this.api.normalize(input.term)
  }

  /** Create a reference term to a named definition. */
  ref(input: { name: string }): bigint {
    if (!this.initialized) throw new Error('HVM bridge not initialized')
    const id = this.api.tableFind({ name: input.name, len: input.name.length })
    return this.api.termNewRef(id)
  }

  /** Marshal a JS value to an HVM term. */
  toTerm(input: { value: HvmValue }): bigint {
    if (!this.marshalCtx) throw new Error('HVM bridge not initialized')
    return toTerm({ ctx: this.marshalCtx, value: input.value })
  }

  /** Marshal an HVM term back to a JS value. */
  fromTerm(input: { term: bigint }): HvmValue {
    if (!this.marshalCtx) throw new Error('HVM bridge not initialized')
    return fromTerm({ ctx: this.marshalCtx, term: input.term })
  }

  /** Run an IO action tree, dispatching native primitives. */
  runIo(input: { term: bigint }): HvmValue {
    if (!this.ioCtx) throw new Error('HVM bridge not initialized')
    return runIo({ ctx: this.ioCtx, term: input.term })
  }

  /** Register a JS object in the handle table. Returns its ID. */
  registerHandle(input: { obj: unknown }): number {
    return this.handles.register(input.obj)
  }

  /** Get a JS object from the handle table by ID. */
  getHandle(input: { id: number }): unknown {
    return this.handles.get(input.id)
  }

  /** Release a handle. */
  releaseHandle(input: { id: number }): void {
    this.handles.release(input.id)
  }

  /** Check if the bridge is initialized. */
  isInitialized(): boolean {
    return this.initialized
  }

  /** Release all resources. */
  close(): void {
    if (this.initialized) {
      this.api.free()
      this.initialized = false
    }
    this.handles.clear()
    this.prims.clear()
    this.marshalCtx = null
    this.ioCtx = null
  }
}
