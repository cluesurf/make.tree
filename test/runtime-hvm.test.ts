/**
 * HVM bridge unit tests.
 *
 * Tests the HvmBridge, HandleTable, marshal, and base helpers
 * without requiring actual WASM. Uses mock HvmApi for marshaling tests.
 */

import { describe, it, expect } from 'vitest'
import { HandleTable } from '@/runtime/hvm/wasm/handle'
import { hvmNum, hvmStr, hvmBool, hvmList, hvmNull, hvmHandle, hvmRecord } from '@/runtime/hvm/form'
import {
  termTag, termExt, termVal, termNew,
  NUM, ERA, C00, C02, C04, ERA_TERM,
  isCtr, ctrArity,
  OP_ADD, OP_SUB,
} from '@/runtime/hvm/base'
import { runIo, runIoAsync } from '@/runtime/hvm/wasm/loop'
import type { IoContext, NativePrimFn, AsyncNativePrimFn } from '@/runtime/hvm/wasm/loop'
import type { HvmApi } from '@/runtime/hvm/wasm/bind'
import type { MarshalContext } from '@/runtime/hvm/wasm/marshal'
import { registerBrowserPrims } from '@/runtime/hvm/wasm/prim'

describe('HandleTable', () => {
  it('registers and retrieves objects', () => {
    const table = new HandleTable()
    const obj = { name: 'test' }
    const id = table.register(obj)

    expect(table.has(id)).toBe(true)
    expect(table.get(id)).toBe(obj)
    expect(table.size).toBe(1)
  })

  it('assigns unique IDs', () => {
    const table = new HandleTable()
    const id1 = table.register('a')
    const id2 = table.register('b')

    expect(id1).not.toBe(id2)
    expect(table.get(id1)).toBe('a')
    expect(table.get(id2)).toBe('b')
  })

  it('releases handles', () => {
    const table = new HandleTable()
    const id = table.register('x')

    table.release(id)
    expect(table.has(id)).toBe(false)
    expect(table.get(id)).toBeUndefined()
    expect(table.size).toBe(0)
  })

  it('clears all handles', () => {
    const table = new HandleTable()
    table.register('a')
    table.register('b')
    table.register('c')

    table.clear()
    expect(table.size).toBe(0)
  })
})

describe('HVM value constructors', () => {
  it('creates num values', () => {
    const v = hvmNum(42)
    expect(v.kind).toBe('num')
    if (v.kind === 'num') expect(v.value).toBe(42)
  })

  it('creates str values', () => {
    const v = hvmStr('hello')
    expect(v.kind).toBe('str')
    if (v.kind === 'str') expect(v.value).toBe('hello')
  })

  it('creates bool values', () => {
    expect(hvmBool(true).kind).toBe('bool')
    expect(hvmBool(false).kind).toBe('bool')
    if (hvmBool(true).kind === 'bool') expect(hvmBool(true).value).toBe(true)
  })

  it('creates list values', () => {
    const v = hvmList([hvmNum(1), hvmNum(2)])
    expect(v.kind).toBe('list')
    if (v.kind === 'list') expect(v.value.length).toBe(2)
  })

  it('creates null values', () => {
    expect(hvmNull().kind).toBe('null')
  })

  it('creates handle values', () => {
    const v = hvmHandle(42)
    expect(v.kind).toBe('handle')
    if (v.kind === 'handle') expect(v.id).toBe(42)
  })
})

describe('HVM term helpers', () => {
  it('constructs and decodes NUM term', () => {
    const term = termNew({ tag: NUM, ext: 42, val: 0n })
    expect(termTag(term)).toBe(NUM)
    expect(termExt(term)).toBe(42)
  })

  it('constructs and decodes ERA term', () => {
    expect(termTag(ERA_TERM)).toBe(ERA)
    expect(termExt(ERA_TERM)).toBe(0)
    expect(termVal(ERA_TERM)).toBe(0n)
  })

  it('detects constructor tags', () => {
    expect(isCtr(C00)).toBe(true)
    expect(isCtr(C00 + 5)).toBe(true)
    expect(isCtr(NUM)).toBe(false)
    expect(isCtr(ERA)).toBe(false)
  })

  it('computes constructor arity', () => {
    expect(ctrArity(C00)).toBe(0)
    expect(ctrArity(C00 + 3)).toBe(3)
    expect(ctrArity(NUM)).toBe(-1)
  })

  it('preserves val field in term encoding', () => {
    const term = termNew({ tag: NUM, ext: 0, val: 12345n })
    expect(termVal(term)).toBe(12345n)
  })
})

describe('operation codes', () => {
  it('has correct add/sub values', () => {
    expect(OP_ADD).toBe(0)
    expect(OP_SUB).toBe(1)
  })
})

// Mock HVM heap for IO loop tests.
// Simulates the term layout with magic field at offset 0.

const IO_DONE_ID = 1
const IO_CALL_ID = 2
const IO_BIND_ID = 3
const MAGIC = 0xD0CA11

function createMockHeap() {
  const heap = new Map<bigint, bigint>()
  let nextLoc = 100n

  function alloc(words: bigint): bigint {
    const loc = nextLoc
    nextLoc += words
    return loc
  }

  function set(input: { loc: bigint; term: bigint }): void {
    heap.set(input.loc, input.term)
  }

  function read(loc: bigint): bigint {
    return heap.get(loc) ?? 0n
  }

  // Build an IO.done term with magic field
  function makeDone(valueTerm: bigint): bigint {
    const loc = alloc(2n)
    // loc+0 = magic (NUM term)
    set({ loc, term: termNew({ tag: NUM, ext: MAGIC, val: 0n }) })
    // loc+1 = value
    set({ loc: loc + 1n, term: valueTerm })
    return termNew({ tag: C02, ext: IO_DONE_ID, val: loc })
  }

  // Build an IO.call term with magic field
  function makeCall(input: {
    funcNameTerm: bigint
    argTerm: bigint
    contTerm: bigint
  }): bigint {
    const loc = alloc(4n)
    set({ loc, term: termNew({ tag: NUM, ext: MAGIC, val: 0n }) })
    set({ loc: loc + 1n, term: input.funcNameTerm })
    set({ loc: loc + 2n, term: input.argTerm })
    set({ loc: loc + 3n, term: input.contTerm })
    return termNew({ tag: C04, ext: IO_CALL_ID, val: loc })
  }

  const api: HvmApi = {
    wnf: (term: bigint) => term,
    normalize: (term: bigint) => term,
    termTag: (term: bigint) => termTag(term),
    termExt: (term: bigint) => termExt(term),
    termVal: (term: bigint) => termVal(term),
    heapRead: read,
    heapSet: set,
    heapAlloc: alloc,
    termNewNum: (n: number) => termNew({ tag: NUM, ext: n, val: 0n }),
    termNewCtr: (input) =>
      termNew({
        tag: C00 + input.arity,
        ext: input.name,
        val: input.argsPtr,
      }),
    termNewApp: (input) => {
      // For the mock, applying cont to result just returns the result
      // since our mock continuations are identity (the result term itself)
      return input.x
    },
    termNewSup: () => 0n,
    termNewDup: () => 0n,
    termNewLam: () => 0n,
    termNewLamAt: () => 0n,
    termNewVar: () => 0n,
    termNewRef: () => 0n,
    tableFind: () => 0,
    primRegister: () => 0,
    init: () => {},
    free: () => {},
    prepare: () => 0,
    prepareText: () => 0,
    module: {} as any,
  }

  return { heap, api, alloc, set, read, makeDone, makeCall }
}

function createMockMarshalCtx(api: HvmApi): MarshalContext {
  return {
    api,
    handles: new HandleTable(),
    ids: {
      boolTrue: 10,
      boolFalse: 11,
      listCons: 12,
      listNil: 13,
      stringCons: 14,
      stringNil: 15,
    },
  }
}

describe('IO loop - runIo', () => {
  it('handles IO.done with magic field offset', () => {
    const mock = createMockHeap()
    const valueTerm = termNew({ tag: NUM, ext: 42, val: 0n })
    const doneTerm = mock.makeDone(valueTerm)

    const marshalCtx = createMockMarshalCtx(mock.api)
    const ctx: IoContext = {
      marshal: marshalCtx,
      ids: { ioDone: IO_DONE_ID, ioCall: IO_CALL_ID, ioBind: IO_BIND_ID },
      prims: new Map(),
    }

    const result = runIo({ ctx, term: doneTerm })
    expect(result.kind).toBe('num')
    if (result.kind === 'num') expect(result.value).toBe(42)
  })

  it('handles IO.call with magic field offset', () => {
    const mock = createMockHeap()
    const marshalCtx = createMockMarshalCtx(mock.api)

    // Build a string "TEST" as a CTR (stringNil for simplicity)
    const funcNameTerm = termNew({
      tag: C00,
      ext: marshalCtx.ids.stringNil,
      val: 0n,
    })
    const argTerm = termNew({ tag: NUM, ext: 99, val: 0n })

    // The cont is unused since termNewApp returns x directly in mock
    const contTerm = termNew({ tag: NUM, ext: 0, val: 0n })

    // Build IO.call, then wrap result in IO.done
    // Since our mock termNewApp returns x (the prim result marshaled back),
    // and wnf is identity, we need the prim to return a value that when
    // converted to a term becomes an IO.done.

    // Simpler approach: make the prim return a num, and the cont application
    // should produce an IO.done term.

    // Actually, let's just test that the prim gets called with the right name.
    let calledWith = ''
    const prims = new Map<string, NativePrimFn>()
    prims.set('', (input) => {
      calledWith = input.name
      return hvmNum(7)
    })

    // After IO.call dispatches, it applies cont to result.
    // Mock termNewApp returns x, so result = toTerm(hvmNum(7)) = NUM term with ext=7.
    // Then wnf returns it, loop continues, and termExt gives 7 which is not an IO action.
    // So it will throw "Unknown IO action: 7".

    // To make the test work end-to-end, we need the call result to be an IO.done.
    // Let's make the prim build an IO.done.
    prims.set('', (input) => {
      calledWith = input.name
      // We can't easily return IO.done from a prim since it returns HvmValue.
      // Instead, let's override termNewApp to produce an IO.done term.
      return hvmNum(7)
    })

    // Override termNewApp to return an IO.done wrapping the result
    const origApi = mock.api
    const patchedApi: HvmApi = {
      ...origApi,
      termNewApp: (input) => {
        // After call: cont applied to result -> produce IO.done
        return mock.makeDone(input.x)
      },
    }

    const patchedMarshalCtx = createMockMarshalCtx(patchedApi)
    // Re-use same stringNil ID
    const funcNameTerm2 = termNew({
      tag: C00,
      ext: patchedMarshalCtx.ids.stringNil,
      val: 0n,
    })

    const callTerm = (() => {
      const loc = mock.alloc(4n)
      mock.set({ loc, term: termNew({ tag: NUM, ext: MAGIC, val: 0n }) })
      mock.set({ loc: loc + 1n, term: funcNameTerm2 })
      mock.set({ loc: loc + 2n, term: argTerm })
      mock.set({ loc: loc + 3n, term: contTerm })
      return termNew({ tag: C04, ext: IO_CALL_ID, val: loc })
    })()

    prims.delete('')
    prims.set('', (input) => {
      calledWith = input.name
      return hvmNum(7)
    })

    const ctx: IoContext = {
      marshal: patchedMarshalCtx,
      ids: { ioDone: IO_DONE_ID, ioCall: IO_CALL_ID, ioBind: IO_BIND_ID },
      prims,
    }

    const result = runIo({ ctx, term: callTerm })
    expect(calledWith).toBe('')
    expect(result.kind).toBe('num')
    if (result.kind === 'num') expect(result.value).toBe(7)
  })

  it('throws on unknown primitive', () => {
    const mock = createMockHeap()
    const marshalCtx = createMockMarshalCtx(mock.api)

    const funcNameTerm = termNew({
      tag: C00,
      ext: marshalCtx.ids.stringNil,
      val: 0n,
    })
    const argTerm = termNew({ tag: NUM, ext: 0, val: 0n })
    const contTerm = termNew({ tag: NUM, ext: 0, val: 0n })

    const callTerm = mock.makeCall({
      funcNameTerm,
      argTerm,
      contTerm,
    })

    const ctx: IoContext = {
      marshal: marshalCtx,
      ids: { ioDone: IO_DONE_ID, ioCall: IO_CALL_ID, ioBind: IO_BIND_ID },
      prims: new Map(),
    }

    expect(() => runIo({ ctx, term: callTerm })).toThrow(
      'Unknown native primitive',
    )
  })
})

describe('IO loop - runIoAsync', () => {
  it('handles IO.done async', async () => {
    const mock = createMockHeap()
    const valueTerm = termNew({ tag: NUM, ext: 55, val: 0n })
    const doneTerm = mock.makeDone(valueTerm)

    const marshalCtx = createMockMarshalCtx(mock.api)
    const ctx: IoContext = {
      marshal: marshalCtx,
      ids: { ioDone: IO_DONE_ID, ioCall: IO_CALL_ID, ioBind: IO_BIND_ID },
      prims: new Map(),
      asyncPrims: new Map(),
    }

    const result = await runIoAsync({ ctx, term: doneTerm })
    expect(result.kind).toBe('num')
    if (result.kind === 'num') expect(result.value).toBe(55)
  })

  it('dispatches async prims before sync prims', async () => {
    const mock = createMockHeap()
    const marshalCtx = createMockMarshalCtx(mock.api)

    const patchedApi: HvmApi = {
      ...mock.api,
      termNewApp: (input) => mock.makeDone(input.x),
    }
    const patchedMarshalCtx = createMockMarshalCtx(patchedApi)

    const funcNameTerm = termNew({
      tag: C00,
      ext: patchedMarshalCtx.ids.stringNil,
      val: 0n,
    })
    const argTerm = termNew({ tag: NUM, ext: 0, val: 0n })
    const contTerm = termNew({ tag: NUM, ext: 0, val: 0n })

    const loc = mock.alloc(4n)
    mock.set({ loc, term: termNew({ tag: NUM, ext: MAGIC, val: 0n }) })
    mock.set({ loc: loc + 1n, term: funcNameTerm })
    mock.set({ loc: loc + 2n, term: argTerm })
    mock.set({ loc: loc + 3n, term: contTerm })
    const callTerm = termNew({ tag: C04, ext: IO_CALL_ID, val: loc })

    let asyncCalled = false
    const asyncPrims = new Map<string, AsyncNativePrimFn>()
    asyncPrims.set('', async () => {
      asyncCalled = true
      return hvmNum(123)
    })

    const syncPrims = new Map<string, NativePrimFn>()
    syncPrims.set('', () => hvmNum(999))

    const ctx: IoContext = {
      marshal: patchedMarshalCtx,
      ids: { ioDone: IO_DONE_ID, ioCall: IO_CALL_ID, ioBind: IO_BIND_ID },
      prims: syncPrims,
      asyncPrims,
    }

    const result = await runIoAsync({ ctx, term: callTerm })
    expect(asyncCalled).toBe(true)
    expect(result.kind).toBe('num')
    if (result.kind === 'num') expect(result.value).toBe(123)
  })
})

describe('registerBrowserPrims', () => {
  it('registers expected sync and async primitives', () => {
    const prims = new Map<string, NativePrimFn>()
    const asyncPrims = new Map<string, AsyncNativePrimFn>()

    registerBrowserPrims({ prims, asyncPrims })

    expect(prims.has('PRINT')).toBe(true)
    expect(prims.has('LOG')).toBe(true)
    expect(prims.has('GET_TIME')).toBe(true)
    expect(asyncPrims.has('SLEEP')).toBe(true)
    expect(asyncPrims.has('FETCH')).toBe(true)
  })
})

describe('HvmValue record', () => {
  it('creates record values', () => {
    const v = hvmRecord({ name: 42, fields: [hvmNum(1), hvmStr('x')] })
    expect(v.kind).toBe('record')
    if (v.kind === 'record') {
      expect(v.name).toBe(42)
      expect(v.fields.length).toBe(2)
    }
  })
})
