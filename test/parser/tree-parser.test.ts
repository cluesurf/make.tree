/**
 * Tests for TreeParser: error recovery, incremental reparsing,
 * streaming, and CST output.
 */

import { describe, it, expect } from 'vitest'
import { TreeParser } from '@/parser/tree'
import type { TreeCstItem, TreeCstError, TreeCstCard } from '@/parser/tree'
import type { Mill, MineDef, MintDef } from '@/mill/form'
import type { PFork, PLine } from '@/mill/mine'

// ---- Test helpers ----

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

function makeLine(input: { forks: PFork[] }): PLine {
  return { form: 'tree-line', nest: input.forks }
}

/**
 * Create a simple mill with rules for 'load' and 'task' keywords.
 */
function makeMill(): Mill {
  const mine = new Map<string, MineDef>()
  const mint = new Map<string, MintDef>()

  // load rule: extracts path from inline word
  mine.set('load', {
    form: 'mine-def',
    name: 'load',
    rule: {
      form: 'mine-term',
      term: 'load',
      list: [{ form: 'mine-take', name: 'path' }],
    },
  })
  mint.set('load', {
    form: 'mint-def',
    name: 'load',
    like: 'import',
    cases: [{ form: 'mint-case', name: 'path', slot: 'path' }],
    hook: {
      form: 'mint-hook-make',
      make: {
        form: 'mint-make',
        name: 'import',
        bind: [{ form: 'mint-bind', field: 'path', slot: 'path' }],
      },
    },
  })

  // task rule: extracts name from inline word
  mine.set('task', {
    form: 'mine-def',
    name: 'task',
    rule: {
      form: 'mine-term',
      term: 'task',
      list: [{ form: 'mine-take', name: 'name' }],
    },
  })
  mint.set('task', {
    form: 'mint-def',
    name: 'task',
    like: 'task',
    cases: [{ form: 'mint-case', name: 'name', slot: 'name' }],
    hook: {
      form: 'mint-hook-make',
      make: {
        form: 'mint-make',
        name: 'task',
        bind: [{ form: 'mint-bind', field: 'name', slot: 'name' }],
      },
    },
  })

  return { mine, mint }
}

// ---- Basic parse ----

describe('TreeParser.parse', () => {
  it('transforms a single fork', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@foo/bar'] })],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('import')
    expect((card.list[0] as any).path).toBe('@foo/bar')
  })

  it('transforms multiple forks', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(2)
    expect((card.list[0] as any).form).toBe('import')
    expect((card.list[1] as any).form).toBe('task')
  })
})

// ---- Error recovery ----

describe('TreeParser error recovery', () => {
  it('skips fork with unknown keyword and continues', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'bogus', inlineWords: ['???'] }),
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    // Should produce 2 valid nodes and 1 error
    expect(card.list.length).toBe(2)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('bogus')
  })

  it('reports error for fork with no keyword', () => {
    const parser = new TreeParser({ mill: makeMill() })
    // A fork with an empty knit (no keyword)
    const emptyFork: PFork = {
      form: 'tree-fork',
      nest: [{ form: 'tree-knit', nest: [] }],
    }
    const tree = makeLine({
      forks: [
        emptyFork,
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    expect(card.list.length).toBe(1)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('no keyword')
  })

  it('reports error when mine rule fails', () => {
    const mill = makeMill()
    // Override task mine to require a child 'take' fork that we won't provide
    mill.mine.set('task', {
      form: 'mine-def',
      name: 'task',
      rule: {
        form: 'mine-term',
        term: 'task',
        list: [
          { form: 'mine-take', name: 'name' },
          {
            form: 'mine-term',
            term: 'take',
            list: [{ form: 'mine-take', name: 'param' }],
          },
        ],
      },
    })

    const parser = new TreeParser({ mill })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
        // No 'take' child, mine will fail
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    // task fails, load succeeds
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('import')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('task')
  })

  it('reports error when mint rule is missing', () => {
    const mill = makeMill()
    // Remove mint for 'load' but keep mine
    mill.mint.delete('load')

    const parser = new TreeParser({ mill })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('task')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('no mint rule')
  })

  it('recovers from multiple errors', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'bad1' }),
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'bad2' }),
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
        makeFork({ keyword: 'bad3' }),
      ],
    })
    const { card, errors } = parser.parse({ tree, file: 'test.tree' })
    expect(card.list.length).toBe(2)
    expect(errors.length).toBe(3)
  })
})

// ---- CST output ----

describe('TreeParser.parseCst', () => {
  it('produces CST with items for valid forks', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    const { cst, errors } = parser.parseCst({ tree, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(cst.form).toBe('tree-cst-card')
    expect(cst.file).toBe('test.tree')
    expect(cst.children.length).toBe(1)
    const item = cst.children[0] as TreeCstItem
    expect(item.form).toBe('tree-cst-item')
    expect(item.keyword).toBe('load')
    expect(item.source).toBeDefined()
    expect(item.output).toBeDefined()
    expect((item.output as any).form).toBe('import')
  })

  it('produces CST with error nodes for failed forks', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'bogus' }),
        makeFork({ keyword: 'task', inlineWords: ['foo'] }),
      ],
    })
    const { cst, errors } = parser.parseCst({ tree, file: 'test.tree' })
    expect(errors.length).toBe(1)
    expect(cst.children.length).toBe(3)

    expect(cst.children[0]!.form).toBe('tree-cst-item')
    expect(cst.children[1]!.form).toBe('tree-cst-error')
    expect(cst.children[2]!.form).toBe('tree-cst-item')

    const errNode = cst.children[1] as TreeCstError
    expect(errNode.keyword).toBe('bogus')
    expect(errNode.source).toBeDefined()
    expect(errNode.message).toContain('bogus')
  })

  it('preserves all forks in CST even on errors', () => {
    const parser = new TreeParser({ mill: makeMill() })
    const tree = makeLine({
      forks: [
        makeFork({ keyword: 'bad1' }),
        makeFork({ keyword: 'bad2' }),
        makeFork({ keyword: 'bad3' }),
      ],
    })
    const { cst } = parser.parseCst({ tree, file: 'test.tree' })
    // All 3 forks are in the CST as error nodes
    expect(cst.children.length).toBe(3)
    for (const child of cst.children) {
      expect(child.form).toBe('tree-cst-error')
    }
  })
})

// ---- Incremental reparsing ----

describe('TreeParser.applyEdit', () => {
  it('reuses unchanged forks', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const fork1 = makeFork({ keyword: 'load', inlineWords: ['@a/b'] })
    const fork2 = makeFork({ keyword: 'task', inlineWords: ['foo'] })
    const fork3 = makeFork({ keyword: 'load', inlineWords: ['@c/d'] })

    const tree1 = makeLine({ forks: [fork1, fork2, fork3] })
    parser.parse({ tree: tree1, file: 'test.tree' })

    // Replace fork2 with a new fork, keep fork1 and fork3 the same
    const newFork2 = makeFork({ keyword: 'task', inlineWords: ['bar'] })
    const tree2 = makeLine({ forks: [fork1, newFork2, fork3] })

    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(3)
    expect((card.list[0] as any).path).toBe('@a/b')
    expect((card.list[1] as any).name).toBe('bar')
    expect((card.list[2] as any).path).toBe('@c/d')
  })

  it('handles added forks', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const fork1 = makeFork({ keyword: 'load', inlineWords: ['@a/b'] })
    const tree1 = makeLine({ forks: [fork1] })
    parser.parse({ tree: tree1, file: 'test.tree' })

    const fork2 = makeFork({ keyword: 'task', inlineWords: ['foo'] })
    const tree2 = makeLine({ forks: [fork1, fork2] })

    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(2)
  })

  it('handles removed forks', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const fork1 = makeFork({ keyword: 'load', inlineWords: ['@a/b'] })
    const fork2 = makeFork({ keyword: 'task', inlineWords: ['foo'] })
    const tree1 = makeLine({ forks: [fork1, fork2] })
    parser.parse({ tree: tree1, file: 'test.tree' })

    const tree2 = makeLine({ forks: [fork1] })
    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).path).toBe('@a/b')
  })

  it('handles all forks replaced', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const tree1 = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    parser.parse({ tree: tree1, file: 'test.tree' })

    const tree2 = makeLine({
      forks: [makeFork({ keyword: 'task', inlineWords: ['bar'] })],
    })
    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('task')
  })

  it('falls back to full parse on file change', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const tree1 = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    parser.parse({ tree: tree1, file: 'a.tree' })

    const tree2 = makeLine({
      forks: [makeFork({ keyword: 'task', inlineWords: ['foo'] })],
    })
    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'b.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(1)
    expect((card.list[0] as any).form).toBe('task')
  })

  it('handles empty tree after non-empty', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const tree1 = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    parser.parse({ tree: tree1, file: 'test.tree' })

    const tree2 = makeLine({ forks: [] })
    const { card, errors } = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(0)
  })

  it('preserves errors in unchanged forks', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const goodFork = makeFork({ keyword: 'load', inlineWords: ['@a/b'] })
    const badFork = makeFork({ keyword: 'bogus' })
    const tree1 = makeLine({ forks: [goodFork, badFork] })
    const r1 = parser.parse({ tree: tree1, file: 'test.tree' })
    expect(r1.errors.length).toBe(1)

    // Add a new fork at the end, badFork unchanged
    const newFork = makeFork({ keyword: 'task', inlineWords: ['foo'] })
    const tree2 = makeLine({ forks: [goodFork, badFork, newFork] })
    const r2 = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(r2.errors.length).toBe(1) // badFork error preserved
    expect(r2.card.list.length).toBe(2) // good + new
  })
})

// ---- Streaming ----

describe('TreeParser streaming', () => {
  it('feeds forks incrementally', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const r1 = parser.feed({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    expect(r1.nodesAdded).toBe(1)

    const r2 = parser.feed({
      forks: [makeFork({ keyword: 'task', inlineWords: ['foo'] })],
    })
    expect(r2.nodesAdded).toBe(1)

    const { card, errors } = parser.finish({ file: 'test.tree' })
    expect(errors.length).toBe(0)
    expect(card.list.length).toBe(2)
    expect((card.list[0] as any).form).toBe('import')
    expect((card.list[1] as any).form).toBe('task')
  })

  it('handles errors during streaming', () => {
    const parser = new TreeParser({ mill: makeMill() })

    parser.feed({
      forks: [
        makeFork({ keyword: 'load', inlineWords: ['@a/b'] }),
        makeFork({ keyword: 'bad' }),
      ],
    })

    parser.feed({
      forks: [makeFork({ keyword: 'task', inlineWords: ['foo'] })],
    })

    const { card, errors } = parser.finish({ file: 'test.tree' })
    expect(card.list.length).toBe(2)
    expect(errors.length).toBe(1)
  })

  it('returns partial nodes before finish', () => {
    const parser = new TreeParser({ mill: makeMill() })

    parser.feed({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })

    const partial = parser.getPartialNodes()
    expect(partial.length).toBe(1)
    expect((partial[0] as any).form).toBe('import')
  })

  it('reset clears stream state', () => {
    const parser = new TreeParser({ mill: makeMill() })

    parser.feed({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })

    parser.resetStream()
    expect(parser.getPartialNodes().length).toBe(0)

    const { card } = parser.finish({ file: 'test.tree' })
    expect(card.list.length).toBe(0)
  })

  it('can stream then finish multiple times', () => {
    const parser = new TreeParser({ mill: makeMill() })

    parser.feed({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })
    const r1 = parser.finish({ file: 'a.tree' })
    expect(r1.card.list.length).toBe(1)

    // Second stream session
    parser.feed({
      forks: [makeFork({ keyword: 'task', inlineWords: ['foo'] })],
    })
    const r2 = parser.finish({ file: 'b.tree' })
    expect(r2.card.list.length).toBe(1)
    expect((r2.card.list[0] as any).form).toBe('task')
  })
})

// ---- Hot reload ----

describe('TreeParser hot reload', () => {
  it('reloadMill changes behavior', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const tree = makeLine({
      forks: [makeFork({ keyword: 'load', inlineWords: ['@a/b'] })],
    })

    // Parse with original mill
    const r1 = parser.parse({ tree, file: 'test.tree' })
    expect(r1.card.list.length).toBe(1)

    // Reload with empty mill
    parser.reloadMill({ mill: { mine: new Map(), mint: new Map() } })
    const r2 = parser.parse({ tree, file: 'test.tree' })
    expect(r2.card.list.length).toBe(0)
    expect(r2.errors.length).toBe(1)
  })

  it('reloadMill invalidates incremental cache', () => {
    const parser = new TreeParser({ mill: makeMill() })

    const fork1 = makeFork({ keyword: 'load', inlineWords: ['@a/b'] })
    const tree1 = makeLine({ forks: [fork1] })
    parser.parse({ tree: tree1, file: 'test.tree' })

    // Reload, then applyEdit should do full parse
    parser.reloadMill({ mill: makeMill() })
    const tree2 = makeLine({ forks: [fork1] })
    const r = parser.applyEdit({ tree: tree2, file: 'test.tree' })
    expect(r.card.list.length).toBe(1)
    expect(r.errors.length).toBe(0)
  })
})
