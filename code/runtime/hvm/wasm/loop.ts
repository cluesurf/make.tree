// loop.ts - IO action interpreter for the browser.
//
// Reduces HVM IO actions to normal form, dispatches native
// primitives, and feeds results back as continuations.
//
// IO protocol:
//   IO.done(value)              -> return value
//   IO.call(prim_name, arg)     -> execute native, feed result to cont
//   IO.bind(action, cont)       -> run action, feed result to cont

import type { HvmValue } from '../form'
import { toTerm, fromTerm } from './marshal'
import type { MarshalContext } from './marshal'

export type NativePrimFn = (input: {
  ctx: MarshalContext
  name: string
  arg: bigint
}) => HvmValue

export type IoContext = {
  marshal: MarshalContext

  // Well-known IO constructor name IDs.
  ids: {
    ioDone: number
    ioCall: number
    ioBind: number
  }

  // Dispatch table for native primitives.
  prims: Map<string, NativePrimFn>
}

export function runIo(input: {
  ctx: IoContext
  term: bigint
}): HvmValue {
  const { ctx } = input
  const { marshal, ids, prims } = ctx
  const { api } = marshal

  let current = api.wnf(input.term)

  while (true) {
    const name = api.termExt(current)

    if (name === ids.ioDone) {
      const loc = api.termVal(current)
      const value = api.wnf(api.heapRead(loc))
      return fromTerm({ ctx: marshal, term: value })
    }

    if (name === ids.ioCall) {
      const loc = api.termVal(current)
      const primNameTerm = api.wnf(api.heapRead(loc))
      const primName = fromTerm({ ctx: marshal, term: primNameTerm })

      if (primName.kind !== 'str') {
        throw new Error(
          `IO.call: expected string prim name, got ${primName.kind}`,
        )
      }

      const arg = api.wnf(api.heapRead(loc + 1n))
      const cont = api.heapRead(loc + 2n)

      const handler = prims.get(primName.value)
      if (!handler) {
        throw new Error(`Unknown native primitive: ${primName.value}`)
      }

      const result = handler({
        ctx: marshal,
        name: primName.value,
        arg,
      })
      const hvmResult = toTerm({ ctx: marshal, value: result })

      current = api.wnf(api.termNewApp({ f: cont, x: hvmResult }))
      continue
    }

    if (name === ids.ioBind) {
      const loc = api.termVal(current)
      const action = api.heapRead(loc)
      const cont = api.heapRead(loc + 1n)

      const actionResult = runIo({ ctx, term: action })
      const hvmResult = toTerm({ ctx: marshal, value: actionResult })

      current = api.wnf(api.termNewApp({ f: cont, x: hvmResult }))
      continue
    }

    throw new Error(`Unknown IO action: ${name}`)
  }
}
