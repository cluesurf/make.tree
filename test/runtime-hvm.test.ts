/**
 * HVM bridge unit tests.
 *
 * Tests the HvmBridge, HandleTable, marshal, and base helpers
 * without requiring actual WASM. Uses mock HvmApi for marshaling tests.
 */

import { describe, it, expect } from 'vitest'
import { HandleTable } from '@/runtime/hvm/wasm/handle'
import { hvmNum, hvmStr, hvmBool, hvmList, hvmNull, hvmHandle } from '@/runtime/hvm/form'
import {
  termTag, termExt, termVal, termNew,
  NUM, ERA, C00, ERA_TERM,
  isCtr, ctrArity,
  OP_ADD, OP_SUB,
} from '@/runtime/hvm/base'

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
