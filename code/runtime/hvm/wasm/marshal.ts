// marshal.ts - Convert between JS values and HVM terms.
//
// toTerm:   HvmValue -> bigint (HVM term)
// fromTerm: bigint (HVM term) -> HvmValue

import { NUM, ERA, C00, C16, ERA_TERM, isCtr, ctrArity } from '../base'
import type { HvmValue } from '../form'
import {
  hvmNum,
  hvmStr,
  hvmBool,
  hvmList,
  hvmRecord,
  hvmHandle,
  hvmNull,
} from '../form'
import type { HvmApi } from './bind'
import type { HandleTable } from './handle'

export type MarshalContext = {
  api: HvmApi
  handles: HandleTable

  // Well-known constructor name IDs. These are resolved at init
  // time via api.tableFind.
  ids: {
    boolTrue: number
    boolFalse: number
    listCons: number
    listNil: number
    stringCons: number
    stringNil: number
  }
}

export function toTerm(input: {
  ctx: MarshalContext
  value: HvmValue
}): bigint {
  const { ctx, value } = input
  const { api, handles, ids } = ctx

  switch (value.kind) {
    case 'num':
      return api.termNewNum(value.value)

    case 'str': {
      let term = api.termNewCtr({
        name: ids.stringNil,
        arity: 0,
        argsPtr: 0n,
      })
      for (let i = value.value.length - 1; i >= 0; i--) {
        const ch = api.termNewNum(value.value.charCodeAt(i))
        const loc = api.heapAlloc(2n)
        api.heapSet({ loc, term: ch })
        api.heapSet({ loc: loc + 1n, term })
        term = api.termNewCtr({
          name: ids.stringCons,
          arity: 2,
          argsPtr: loc,
        })
      }
      return term
    }

    case 'bool': {
      const name = value.value ? ids.boolTrue : ids.boolFalse
      return api.termNewCtr({ name, arity: 0, argsPtr: 0n })
    }

    case 'list': {
      let term = api.termNewCtr({
        name: ids.listNil,
        arity: 0,
        argsPtr: 0n,
      })
      for (let i = value.value.length - 1; i >= 0; i--) {
        const elem = toTerm({ ctx, value: value.value[i] })
        const loc = api.heapAlloc(2n)
        api.heapSet({ loc, term: elem })
        api.heapSet({ loc: loc + 1n, term })
        term = api.termNewCtr({
          name: ids.listCons,
          arity: 2,
          argsPtr: loc,
        })
      }
      return term
    }

    case 'record': {
      const arity = value.fields.length
      if (arity === 0) {
        return api.termNewCtr({ name: value.name, arity: 0, argsPtr: 0n })
      }
      const loc = api.heapAlloc(BigInt(arity))
      for (let i = 0; i < arity; i++) {
        const field = toTerm({ ctx, value: value.fields[i] })
        api.heapSet({ loc: loc + BigInt(i), term: field })
      }
      return api.termNewCtr({ name: value.name, arity, argsPtr: loc })
    }

    case 'handle': {
      return api.termNewNum(value.id)
    }

    case 'null':
      return ERA_TERM
  }
}

export function fromTerm(input: {
  ctx: MarshalContext
  term: bigint
}): HvmValue {
  const { ctx, term } = input
  const { api, ids } = ctx

  const tag = api.termTag(term)

  if (tag === NUM) {
    return hvmNum(api.termExt(term))
  }

  if (tag === ERA) {
    return hvmNull()
  }

  if (isCtr(tag)) {
    const name = api.termExt(term)
    const arity = ctrArity(tag)

    if (name === ids.boolTrue) return hvmBool(true)
    if (name === ids.boolFalse) return hvmBool(false)

    if (name === ids.stringCons) {
      return hvmStr(readString({ ctx, term }))
    }

    if (name === ids.stringNil) {
      return hvmStr('')
    }

    if (name === ids.listCons) {
      return hvmList(readList({ ctx, term }))
    }

    if (name === ids.listNil) {
      return hvmList([])
    }

    // Generic constructor: read fields into a record.
    const fields: HvmValue[] = []
    const loc = api.termVal(term)
    for (let i = 0; i < arity; i++) {
      const field = api.wnf(api.heapRead(loc + BigInt(i)))
      fields.push(fromTerm({ ctx, term: field }))
    }
    return hvmRecord({ name, fields })
  }

  return hvmNull()
}

function readString(input: {
  ctx: MarshalContext
  term: bigint
}): string {
  const { ctx } = input
  const { api, ids } = ctx
  const chars: string[] = []
  let current = input.term

  while (true) {
    const tag = api.termTag(current)
    if (!isCtr(tag)) break

    const name = api.termExt(current)
    if (name === ids.stringNil) break
    if (name !== ids.stringCons) break

    const loc = api.termVal(current)
    const ch = api.wnf(api.heapRead(loc))
    chars.push(String.fromCharCode(api.termExt(ch)))
    current = api.wnf(api.heapRead(loc + 1n))
  }

  return chars.join('')
}

function readList(input: {
  ctx: MarshalContext
  term: bigint
}): HvmValue[] {
  const { ctx } = input
  const { api, ids } = ctx
  const items: HvmValue[] = []
  let current = input.term

  while (true) {
    const tag = api.termTag(current)
    if (!isCtr(tag)) break

    const name = api.termExt(current)
    if (name === ids.listNil) break
    if (name !== ids.listCons) break

    const loc = api.termVal(current)
    const head = api.wnf(api.heapRead(loc))
    items.push(fromTerm({ ctx, term: head }))
    current = api.wnf(api.heapRead(loc + 1n))
  }

  return items
}
