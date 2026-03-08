/**
 * Tests for the term mill mint walker.
 */

import { describe, it, expect } from 'vitest'
import { walkMint } from '@/mill/mint'
import type { MintDef } from '@/mill/form'
import type { TakeMap, TakeVal } from '@/mill/mine'
import type { MintCtx } from '@/mill/mint'

function makeCtx(input?: { defs?: Map<string, MintDef> }): MintCtx {
  return {
    defs: input?.defs ?? new Map(),
    errors: [],
  }
}

describe('mint walker', () => {
  it('constructs a simple node with hook make', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'load',
      like: 'import',
      cases: [
        { form: 'mint-case', name: 'path', slot: 'path' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'import',
          bind: [
            { form: 'mint-bind', field: 'path', slot: 'path' },
          ],
        },
      },
    }

    const take: TakeMap = new Map()
    take.set('path', { form: 'text', val: '@foo/bar' })

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('import')
    expect((result as any).path).toBe('@foo/bar')
  })

  it('constructs a node with multiple fields', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'task',
      like: 'task',
      cases: [
        { form: 'mint-case', name: 'name', slot: 'name' },
        { form: 'mint-case', name: 'head', slot: 'head' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'task',
          bind: [
            { form: 'mint-bind', field: 'name', slot: 'name' },
            { form: 'mint-bind', field: 'head', slot: 'head' },
          ],
        },
      },
    }

    const take: TakeMap = new Map()
    take.set('name', { form: 'text', val: 'foo' })
    take.set('head', { form: 'list', val: [] })

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('task')
    expect((result as any).name).toBe('foo')
    expect((result as any).head).toEqual([])
  })

  it('delegates to sub-mint via case', () => {
    const refDef: MintDef = {
      form: 'mint-def',
      name: 'reference',
      like: 'import-reference',
      cases: [
        { form: 'mint-case', name: 'text', slot: 'name' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'import-reference',
          bind: [
            { form: 'mint-bind', field: 'name', slot: 'name' },
          ],
        },
      },
    }

    const loadDef: MintDef = {
      form: 'mint-def',
      name: 'load',
      like: 'import',
      cases: [
        { form: 'mint-case', name: 'path', slot: 'path' },
        { form: 'mint-case', name: 'find', mint: 'reference', slot: 'reference' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'import',
          bind: [
            { form: 'mint-bind', field: 'path', slot: 'path' },
            { form: 'mint-bind', field: 'reference', slot: 'reference' },
          ],
        },
      },
    }

    const defs = new Map<string, MintDef>()
    defs.set('reference', refDef)
    defs.set('load', loadDef)

    // Simulate a TakeMap with a list of find items
    const findItem: TakeMap = new Map()
    findItem.set('text', { form: 'text', val: 'show' })

    const take: TakeMap = new Map()
    take.set('path', { form: 'text', val: '@foo/bar' })
    take.set('find', { form: 'list', val: [findItem] })

    const result = walkMint({ def: loadDef, take, ctx: makeCtx({ defs }) })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('import')
    expect((result as any).path).toBe('@foo/bar')
    expect((result as any).reference).toBeInstanceOf(Array)
    expect((result as any).reference.length).toBe(1)
    expect((result as any).reference[0].form).toBe('import-reference')
    expect((result as any).reference[0].name).toBe('show')
  })

  it('handles missing take values gracefully', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'task',
      like: 'task',
      cases: [
        { form: 'mint-case', name: 'name', slot: 'name' },
        { form: 'mint-case', name: 'head', slot: 'head' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'task',
          bind: [
            { form: 'mint-bind', field: 'name', slot: 'name' },
            { form: 'mint-bind', field: 'head', slot: 'head' },
          ],
        },
      },
    }

    const take: TakeMap = new Map()
    take.set('name', { form: 'text', val: 'foo' })
    // head is missing

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('task')
    expect((result as any).name).toBe('foo')
    expect((result as any).head).toBeUndefined()
  })

  it('handles passthrough mint (no hook make)', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'sift',
      like: 'sift',
      cases: [
        { form: 'mint-case', name: 'text', slot: 'value' },
        { form: 'mint-case', name: 'read', slot: 'value' },
      ],
    }

    const take: TakeMap = new Map()
    take.set('read', { form: 'text', val: 'x' })

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBe('x')
  })

  it('handles numeric take values', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'mark',
      like: 'sift-mark',
      cases: [
        { form: 'mint-case', name: 'value', slot: 'value' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'sift-mark',
          bind: [
            { form: 'mint-bind', field: 'value', slot: 'value' },
          ],
        },
      },
    }

    const take: TakeMap = new Map()
    take.set('value', { form: 'mark', val: 42 })

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('sift-mark')
    expect((result as any).value).toBe(42)
  })

  it('slot name can differ from case name', () => {
    const def: MintDef = {
      form: 'mint-def',
      name: 'find',
      like: 'find',
      cases: [
        { form: 'mint-case', name: 'text', slot: 'name' },
        { form: 'mint-case', name: 'name', slot: 'alias' },
      ],
      hook: {
        form: 'mint-hook-make',
        make: {
          form: 'mint-make',
          name: 'find',
          bind: [
            { form: 'mint-bind', field: 'name', slot: 'name' },
            { form: 'mint-bind', field: 'alias', slot: 'alias' },
          ],
        },
      },
    }

    const take: TakeMap = new Map()
    take.set('text', { form: 'text', val: 'show' })
    take.set('name', { form: 'text', val: 'display' })

    const result = walkMint({ def, take, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect((result as any).form).toBe('find')
    expect((result as any).name).toBe('show')
    expect((result as any).alias).toBe('display')
  })
})
