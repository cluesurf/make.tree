// prim.ts - Built-in browser primitives for the HVM WASM bridge.
//
// Opt-in. Call registerBrowserPrims to add these to an HvmBridge.
// Sync prims go in the prims map, async prims in the asyncPrims map.

import type { HvmValue } from '../form'
import { hvmNum, hvmStr, hvmNull } from '../form'
import { fromTerm } from './marshal'
import type { MarshalContext } from './marshal'
import type { NativePrimFn, AsyncNativePrimFn } from './loop'

export function registerBrowserPrims(input: {
  prims: Map<string, NativePrimFn>
  asyncPrims: Map<string, AsyncNativePrimFn>
}): void {
  const { prims, asyncPrims } = input

  prims.set('PRINT', (input) => {
    const str = fromTerm({ ctx: input.ctx, term: input.arg })
    if (str.kind === 'str') {
      console.log(str.value)
    }
    return hvmNull()
  })

  prims.set('LOG', (input) => {
    const value = fromTerm({ ctx: input.ctx, term: input.arg })
    console.log(value)
    return hvmNull()
  })

  prims.set('GET_TIME', () => {
    return hvmNum(performance.now())
  })

  asyncPrims.set('SLEEP', async (input) => {
    const ms = fromTerm({ ctx: input.ctx, term: input.arg })
    const duration = ms.kind === 'num' ? ms.value : 0
    await new Promise<void>((resolve) => setTimeout(resolve, duration))
    return hvmNull()
  })

  asyncPrims.set('FETCH', async (input) => {
    const url = fromTerm({ ctx: input.ctx, term: input.arg })
    if (url.kind !== 'str') {
      throw new Error('FETCH: expected string URL argument')
    }
    const response = await fetch(url.value)
    const text = await response.text()
    return hvmStr(text)
  })
}
