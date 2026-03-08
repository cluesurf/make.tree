/**
 * Tests for the term mill mine walker.
 */

import { describe, it, expect } from 'vitest'
import { walkMine } from '@/mill/mine'
import type { MineRule, MineDef } from '@/mill/form'
import type { PFork, MineCtx } from '@/mill/mine'

function makeFork(input: {
  keyword: string
  inlineWords?: string[]
  children?: PFork[]
}): PFork {
  const knitNest: Array<{ form: 'tree-cord', leaf: { text: string } }> = [
    { form: 'tree-cord', leaf: { text: input.keyword } },
  ]
  if (input.inlineWords) {
    for (const w of input.inlineWords) {
      knitNest.push({ form: 'tree-cord', leaf: { text: w } })
    }
  }
  return {
    form: 'tree-fork',
    nest: [
      { form: 'tree-knit', nest: knitNest },
      ...(input.children ?? []),
    ],
  }
}

function makeCtx(input?: { defs?: Map<string, MineDef> }): MineCtx {
  return {
    defs: input?.defs ?? new Map(),
    errors: [],
  }
}

describe('mine walker', () => {
  it('matches a term by keyword', () => {
    const fork = makeFork({ keyword: 'load' })
    const rule: MineRule = { form: 'mine-term', term: 'load', list: [] }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
  })

  it('rejects mismatched keyword', () => {
    const fork = makeFork({ keyword: 'task' })
    const rule: MineRule = { form: 'mine-term', term: 'load', list: [] }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeUndefined()
  })

  it('extracts text with take', () => {
    // mine load
    //   mine term, term load
    //     take name
    const fork = makeFork({
      keyword: 'load',
      inlineWords: ['@foo/bar'],
    })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'load',
      list: [
        { form: 'mine-take', name: 'path' },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    const pathVal = result!.get('path')
    expect(pathVal).toBeDefined()
    expect(pathVal!.form).toBe('text')
    if (pathVal!.form === 'text') {
      expect(pathVal!.val).toBe('@foo/bar')
    }
  })

  it('matches nested children', () => {
    // form foo
    //   task bar
    const fork = makeFork({
      keyword: 'form',
      inlineWords: ['foo'],
      children: [
        makeFork({ keyword: 'task', inlineWords: ['bar'] }),
      ],
    })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'form',
      list: [
        { form: 'mine-take', name: 'name' },
        {
          form: 'mine-list',
          rule: {
            form: 'mine-term',
            term: 'task',
            list: [{ form: 'mine-take', name: 'task' }],
          },
        },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect(result!.get('name')?.form).toBe('text')
    if (result!.get('name')?.form === 'text') {
      expect(result!.get('name')!.val).toBe('foo')
    }
    expect(result!.get('task')?.form).toBe('list')
  })

  it('handles mine any (alternatives)', () => {
    const fork = makeFork({ keyword: 'read', inlineWords: ['x'] })
    const rule: MineRule = {
      form: 'mine-case',
      list: [
        {
          form: 'mine-term',
          term: 'text',
          list: [{ form: 'mine-take', name: 'text' }],
        },
        {
          form: 'mine-term',
          term: 'read',
          list: [{ form: 'mine-take', name: 'read' }],
        },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect(result!.has('read')).toBe(true)
    expect(result!.has('text')).toBe(false)
  })

  it('handles mine maybe (optional)', () => {
    const fork = makeFork({ keyword: 'task', inlineWords: ['foo'] })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'task',
      list: [
        { form: 'mine-take', name: 'name' },
        {
          form: 'mine-maybe',
          rule: {
            form: 'mine-term',
            term: 'head',
            list: [{ form: 'mine-take', name: 'head' }],
          },
        },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect(result!.get('name')?.form).toBe('text')
    expect(result!.has('head')).toBe(false) // optional, not present
  })

  it('handles mine form ref (delegation)', () => {
    const fork = makeFork({
      keyword: 'form',
      inlineWords: ['foo'],
      children: [
        makeFork({ keyword: 'link', inlineWords: ['bar'] }),
      ],
    })

    const linkRule: MineRule = {
      form: 'mine-term',
      term: 'link',
      list: [{ form: 'mine-take', name: 'link' }],
    }
    const linkDef: MineDef = { form: 'mine-def', name: 'link', rule: linkRule }

    const rule: MineRule = {
      form: 'mine-term',
      term: 'form',
      list: [
        { form: 'mine-take', name: 'name' },
        {
          form: 'mine-list',
          rule: { form: 'mine-form-ref', name: 'link' },
        },
      ],
    }

    const defs = new Map<string, MineDef>()
    defs.set('link', linkDef)
    const result = walkMine({ rule, fork, ctx: makeCtx({ defs }) })
    expect(result).toBeDefined()
    expect(result!.get('name')?.form).toBe('text')
    expect(result!.get('link')?.form).toBe('list')
  })

  it('handles mine text', () => {
    const fork = makeFork({ keyword: 'load', inlineWords: ['@foo/bar'] })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'load',
      list: [
        {
          form: 'mine-text',
          list: [{ form: 'mine-take', name: 'path' }],
        },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    expect(result!.get('path')?.form).toBe('text')
  })

  it('handles mine list with multiple children', () => {
    const fork = makeFork({
      keyword: 'form',
      inlineWords: ['foo'],
      children: [
        makeFork({ keyword: 'head', inlineWords: ['A'] }),
        makeFork({ keyword: 'head', inlineWords: ['B'] }),
        makeFork({ keyword: 'head', inlineWords: ['C'] }),
      ],
    })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'form',
      list: [
        { form: 'mine-take', name: 'name' },
        {
          form: 'mine-list',
          rule: {
            form: 'mine-term',
            term: 'head',
            list: [{ form: 'mine-take', name: 'head' }],
          },
        },
      ],
    }
    const result = walkMine({ rule, fork, ctx: makeCtx() })
    expect(result).toBeDefined()
    const headList = result!.get('head')
    expect(headList?.form).toBe('list')
    if (headList?.form === 'list') {
      expect(headList.val.length).toBe(3)
    }
  })

  it('reports error for unknown form ref', () => {
    const fork = makeFork({ keyword: 'form', inlineWords: ['foo'] })
    const rule: MineRule = {
      form: 'mine-term',
      term: 'form',
      list: [
        { form: 'mine-form-ref', name: 'nonexistent' },
      ],
    }
    const ctx = makeCtx()
    const result = walkMine({ rule, fork, ctx })
    expect(result).toBeUndefined()
    expect(ctx.errors.length).toBeGreaterThan(0)
  })
})
