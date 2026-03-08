/**
 * Tests for the term mill grammar loader and integration.
 *
 * Tests loading mine/mint definitions from PLine trees
 * (as if parsed from .tree files) and running the full
 * mine -> mint pipeline.
 */

import { describe, it, expect } from 'vitest'
import { loadMineDefs, loadMintDefs, loadMill } from '@/mill/load'
import { runMill } from '@/mill/index'
import type { PLine, PFork } from '@/mill/mine'

function makeLine(forks: PFork[]): PLine {
  return { form: 'tree-line', nest: forks }
}

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

describe('mine loader', () => {
  it('loads a simple mine definition', () => {
    // Simulates:
    //   mine load
    //     mine term, term load
    //       take path
    const tree = makeLine([
      makeFork({
        keyword: 'mine',
        inlineWords: ['load'],
        children: [
          makeFork({
            keyword: 'mine',
            inlineWords: ['term', 'term', 'load'],
            children: [
              makeFork({ keyword: 'take', inlineWords: ['path'] }),
            ],
          }),
        ],
      }),
    ])

    const defs = loadMineDefs({ tree })
    expect(defs.size).toBe(1)
    expect(defs.has('load')).toBe(true)
  })

  it('loads mine with list and form ref', () => {
    const tree = makeLine([
      makeFork({
        keyword: 'mine',
        inlineWords: ['form'],
        children: [
          makeFork({
            keyword: 'mine',
            inlineWords: ['term', 'term', 'form'],
            children: [
              makeFork({ keyword: 'take', inlineWords: ['name'] }),
              makeFork({
                keyword: 'mine',
                inlineWords: ['list'],
                children: [
                  makeFork({
                    keyword: 'mine',
                    inlineWords: ['form', 'form', 'head'],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])

    const defs = loadMineDefs({ tree })
    expect(defs.size).toBe(1)
    const formDef = defs.get('form')
    expect(formDef).toBeDefined()
  })
})

describe('mint loader', () => {
  it('loads a simple mint definition', () => {
    // Simulates:
    //   mint load, like import
    //     case path
    //       slot path
    //     hook make
    //       make import
    //         bind path, read path
    const tree = makeLine([
      makeFork({
        keyword: 'mint',
        inlineWords: ['load', 'like', 'import'],
        children: [
          makeFork({
            keyword: 'case',
            inlineWords: ['path'],
            children: [
              makeFork({ keyword: 'slot', inlineWords: ['path'] }),
            ],
          }),
          makeFork({
            keyword: 'hook',
            inlineWords: ['make'],
            children: [
              makeFork({
                keyword: 'make',
                inlineWords: ['import'],
                children: [
                  makeFork({ keyword: 'bind', inlineWords: ['path', 'read', 'path'] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])

    const defs = loadMintDefs({ tree })
    expect(defs.size).toBe(1)
    const loadDef = defs.get('load')
    expect(loadDef).toBeDefined()
    expect(loadDef!.like).toBe('import')
    expect(loadDef!.cases.length).toBe(1)
    expect(loadDef!.cases[0]!.name).toBe('path')
    expect(loadDef!.cases[0]!.slot).toBe('path')
    expect(loadDef!.hook).toBeDefined()
    expect(loadDef!.hook!.make.name).toBe('import')
    expect(loadDef!.hook!.make.bind.length).toBe(1)
  })

  it('loads mint with delegation', () => {
    const tree = makeLine([
      makeFork({
        keyword: 'mint',
        inlineWords: ['load', 'like', 'import'],
        children: [
          makeFork({
            keyword: 'case',
            inlineWords: ['path'],
            children: [
              makeFork({ keyword: 'slot', inlineWords: ['path'] }),
            ],
          }),
          makeFork({
            keyword: 'case',
            inlineWords: ['find', 'mint', 'reference'],
            children: [
              makeFork({ keyword: 'slot', inlineWords: ['reference'] }),
            ],
          }),
          makeFork({
            keyword: 'hook',
            inlineWords: ['make'],
            children: [
              makeFork({
                keyword: 'make',
                inlineWords: ['import'],
                children: [
                  makeFork({ keyword: 'bind', inlineWords: ['path', 'read', 'path'] }),
                  makeFork({ keyword: 'bind', inlineWords: ['reference', 'read', 'reference'] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])

    const defs = loadMintDefs({ tree })
    const loadDef = defs.get('load')
    expect(loadDef).toBeDefined()
    expect(loadDef!.cases.length).toBe(2)
    expect(loadDef!.cases[1]!.name).toBe('find')
    expect(loadDef!.cases[1]!.mint).toBe('reference')
    expect(loadDef!.cases[1]!.slot).toBe('reference')
  })
})

describe('full mill pipeline', () => {
  it('runs mine + mint to produce a surface node', () => {
    // Mine: mine load → mine term, term load → take path
    const mineTree = makeLine([
      makeFork({
        keyword: 'mine',
        inlineWords: ['load'],
        children: [
          makeFork({
            keyword: 'mine',
            inlineWords: ['term', 'term', 'load'],
            children: [
              makeFork({ keyword: 'take', inlineWords: ['path'] }),
            ],
          }),
        ],
      }),
    ])

    // Mint: mint load, like import → case path / slot path / hook make / make import / bind path, read path
    const mintTree = makeLine([
      makeFork({
        keyword: 'mint',
        inlineWords: ['load', 'like', 'import'],
        children: [
          makeFork({
            keyword: 'case',
            inlineWords: ['path'],
            children: [
              makeFork({ keyword: 'slot', inlineWords: ['path'] }),
            ],
          }),
          makeFork({
            keyword: 'hook',
            inlineWords: ['make'],
            children: [
              makeFork({
                keyword: 'make',
                inlineWords: ['import'],
                children: [
                  makeFork({ keyword: 'bind', inlineWords: ['path', 'read', 'path'] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])

    const mill = loadMill({ mineTree, mintTree })

    // Source: load @foo/bar
    const sourceTree = makeLine([
      makeFork({ keyword: 'load', inlineWords: ['@foo/bar'] }),
    ])

    const { card, errors } = runMill({ mill, tree: sourceTree, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('import')
    expect((card.list[0] as any).path).toBe('@foo/bar')
  })

  it('handles unknown keyword gracefully', () => {
    const mill = loadMill({
      mineTree: makeLine([]),
      mintTree: makeLine([]),
    })

    const sourceTree = makeLine([
      makeFork({ keyword: 'unknown' }),
    ])

    const { card, errors } = runMill({ mill, tree: sourceTree, file: 'test.tree' })
    expect(card.list.length).toBe(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('handles multiple top-level items', () => {
    const mineTree = makeLine([
      makeFork({
        keyword: 'mine',
        inlineWords: ['host'],
        children: [
          makeFork({
            keyword: 'mine',
            inlineWords: ['term', 'term', 'host'],
            children: [
              makeFork({ keyword: 'take', inlineWords: ['name'] }),
            ],
          }),
        ],
      }),
    ])

    const mintTree = makeLine([
      makeFork({
        keyword: 'mint',
        inlineWords: ['host', 'like', 'host'],
        children: [
          makeFork({
            keyword: 'case',
            inlineWords: ['name'],
            children: [
              makeFork({ keyword: 'slot', inlineWords: ['name'] }),
            ],
          }),
          makeFork({
            keyword: 'hook',
            inlineWords: ['make'],
            children: [
              makeFork({
                keyword: 'make',
                inlineWords: ['host'],
                children: [
                  makeFork({ keyword: 'bind', inlineWords: ['name', 'read', 'name'] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])

    const mill = loadMill({ mineTree, mintTree })

    const sourceTree = makeLine([
      makeFork({ keyword: 'host', inlineWords: ['x'] }),
      makeFork({ keyword: 'host', inlineWords: ['y'] }),
      makeFork({ keyword: 'host', inlineWords: ['z'] }),
    ])

    const { card, errors } = runMill({ mill, tree: sourceTree, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(3)
    expect((card.list[0] as any).name).toBe('x')
    expect((card.list[1] as any).name).toBe('y')
    expect((card.list[2] as any).name).toBe('z')
  })
})
