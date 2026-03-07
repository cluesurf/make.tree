import { describe, it, expect } from 'vitest'
import type { Term, Book } from '@/term/form'
import {
  optimizeBook,
  foldConstants,
  betaReduce,
  eliminateDeadLets,
  inlineSmall,
  treeShake,
  countNodes,
  isSelfRecursive,
} from '@/term/optimize'

// Helper to create a simple book
function makeBook(entries: [string, Term][]): Book {
  return new Map(entries)
}

describe('constant folding', () => {
  it('folds Op2 with two numeric literals', () => {
    const term: Term = {
      form: 'op2',
      oper: 'add',
      a: { form: 'num', val: 3 },
      b: { form: 'num', val: 4 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('num')
    if (result.form === 'num') {
      expect(result.val).toBe(7)
    }
  })

  it('folds nested Op2 recursively', () => {
    const term: Term = {
      form: 'op2',
      oper: 'mul',
      a: {
        form: 'op2',
        oper: 'add',
        a: { form: 'num', val: 2 },
        b: { form: 'num', val: 3 },
      },
      b: { form: 'num', val: 4 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('num')
    if (result.form === 'num') {
      expect(result.val).toBe(20)
    }
  })

  it('simplifies add x 0 to x', () => {
    const x: Term = { form: 'ref', name: 'x' }
    const term: Term = {
      form: 'op2',
      oper: 'add',
      a: x,
      b: { form: 'num', val: 0 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('ref')
    if (result.form === 'ref') {
      expect(result.name).toBe('x')
    }
  })

  it('simplifies add 0 x to x', () => {
    const x: Term = { form: 'ref', name: 'x' }
    const term: Term = {
      form: 'op2',
      oper: 'add',
      a: { form: 'num', val: 0 },
      b: x,
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('ref')
  })

  it('simplifies mul x 1 to x', () => {
    const x: Term = { form: 'ref', name: 'x' }
    const term: Term = {
      form: 'op2',
      oper: 'mul',
      a: x,
      b: { form: 'num', val: 1 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('ref')
  })

  it('simplifies mul x 0 to 0', () => {
    const x: Term = { form: 'ref', name: 'x' }
    const term: Term = {
      form: 'op2',
      oper: 'mul',
      a: x,
      b: { form: 'num', val: 0 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('num')
    if (result.form === 'num') {
      expect(result.val).toBe(0)
    }
  })

  it('preserves non-foldable Op2', () => {
    const term: Term = {
      form: 'op2',
      oper: 'add',
      a: { form: 'ref', name: 'x' },
      b: { form: 'ref', name: 'y' },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('op2')
  })

  it('folds inside lam body (HOAS)', () => {
    const term: Term = {
      form: 'lam',
      name: 'x',
      bod: () => ({
        form: 'op2',
        oper: 'add',
        a: { form: 'num', val: 1 },
        b: { form: 'num', val: 2 },
      }),
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('lam')
    if (result.form === 'lam') {
      const body = result.bod({ form: 'var', name: 'x', idx: 0 })
      expect(body.form).toBe('num')
      if (body.form === 'num') {
        expect(body.val).toBe(3)
      }
    }
  })

  it('simplifies sub x 0 to x', () => {
    const x: Term = { form: 'ref', name: 'x' }
    const term: Term = {
      form: 'op2',
      oper: 'sub',
      a: x,
      b: { form: 'num', val: 0 },
    }
    const result = foldConstants({ term, depth: 0 })
    expect(result.form).toBe('ref')
  })
})

describe('beta reduction', () => {
  it('reduces (lam x. x) 42 to 42', () => {
    const term: Term = {
      form: 'app',
      func: {
        form: 'lam',
        name: 'x',
        bod: (x: Term) => x,
      },
      argm: { form: 'num', val: 42 },
    }
    const result = betaReduce({ term, depth: 0 })
    expect(result.form).toBe('num')
    if (result.form === 'num') {
      expect(result.val).toBe(42)
    }
  })

  it('reduces (lam x. add x 1) with small arg', () => {
    const term: Term = {
      form: 'app',
      func: {
        form: 'lam',
        name: 'x',
        bod: (x: Term) => ({
          form: 'op2',
          oper: 'add',
          a: x,
          b: { form: 'num', val: 1 },
        }),
      },
      argm: { form: 'num', val: 5 },
    }
    const result = betaReduce({ term, depth: 0 })
    // After beta: op2(add, 5, 1)
    expect(result.form).toBe('op2')
    if (result.form === 'op2') {
      expect(result.a.form).toBe('num')
      if (result.a.form === 'num') expect(result.a.val).toBe(5)
    }
  })

  it('does NOT reduce with large arg', () => {
    const largeArg: Term = {
      form: 'app',
      func: { form: 'ref', name: 'f' },
      argm: { form: 'ref', name: 'g' },
    }
    const term: Term = {
      form: 'app',
      func: {
        form: 'lam',
        name: 'x',
        bod: (x: Term) => x,
      },
      argm: largeArg,
    }
    const result = betaReduce({ term, depth: 0 })
    expect(result.form).toBe('app')
  })
})

describe('dead let elimination', () => {
  it('eliminates unused let binding', () => {
    const term: Term = {
      form: 'let',
      name: 'x',
      val: { form: 'num', val: 42 },
      bod: () => ({ form: 'num', val: 100 }),
    }
    const result = eliminateDeadLets({ term, depth: 0 })
    expect(result.form).toBe('num')
    if (result.form === 'num') {
      expect(result.val).toBe(100)
    }
  })

  it('preserves used let binding', () => {
    const term: Term = {
      form: 'let',
      name: 'x',
      val: { form: 'num', val: 42 },
      bod: (x: Term) => x,
    }
    const result = eliminateDeadLets({ term, depth: 0 })
    expect(result.form).toBe('let')
  })

  it('preserves let with effectful val even if unused', () => {
    const term: Term = {
      form: 'let',
      name: 'x',
      val: { form: 'log', msg: { form: 'txt', val: 'hello' }, val: { form: 'num', val: 0 } },
      bod: () => ({ form: 'num', val: 100 }),
    }
    const result = eliminateDeadLets({ term, depth: 0 })
    expect(result.form).toBe('let')
  })
})

describe('inlining', () => {
  it('inlines small non-recursive function', () => {
    const book = makeBook([
      ['helper', { form: 'num', val: 42 }],
      ['main', { form: 'ref', name: 'helper' }],
    ])
    const result = inlineSmall({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('num')
    if (main!.form === 'num') {
      expect(main!.val).toBe(42)
    }
  })

  it('does NOT inline recursive function', () => {
    const book = makeBook([
      ['rec', {
        form: 'app',
        func: { form: 'ref', name: 'rec' },
        argm: { form: 'num', val: 1 },
      }],
      ['main', { form: 'ref', name: 'rec' }],
    ])
    const result = inlineSmall({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('ref')
  })

  it('does NOT inline function above size threshold', () => {
    // Build a term with >20 nodes
    let big: Term = { form: 'num', val: 0 }
    for (let i = 0; i < 25; i++) {
      big = { form: 'op2', oper: 'add', a: big, b: { form: 'num', val: 1 } }
    }
    const book = makeBook([
      ['big', big],
      ['main', { form: 'ref', name: 'big' }],
    ])
    const result = inlineSmall({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('ref')
  })
})

describe('tree shaking', () => {
  it('removes unreachable defs', () => {
    const book = makeBook([
      ['main', { form: 'ref', name: 'used' }],
      ['used', { form: 'num', val: 1 }],
      ['unused', { form: 'num', val: 2 }],
    ])
    const result = treeShake({ book, entries: ['main'] })
    expect(result.has('main')).toBe(true)
    expect(result.has('used')).toBe(true)
    expect(result.has('unused')).toBe(false)
  })

  it('preserves transitive deps', () => {
    const book = makeBook([
      ['main', { form: 'ref', name: 'a' }],
      ['a', { form: 'ref', name: 'b' }],
      ['b', { form: 'num', val: 1 }],
      ['orphan', { form: 'num', val: 2 }],
    ])
    const result = treeShake({ book, entries: ['main'] })
    expect(result.has('main')).toBe(true)
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(true)
    expect(result.has('orphan')).toBe(false)
  })

  it('keeps mutually recursive defs if either is reachable', () => {
    const book = makeBook([
      ['main', { form: 'ref', name: 'ping' }],
      ['ping', { form: 'ref', name: 'pong' }],
      ['pong', { form: 'ref', name: 'ping' }],
    ])
    const result = treeShake({ book, entries: ['main'] })
    expect(result.has('ping')).toBe(true)
    expect(result.has('pong')).toBe(true)
  })
})

describe('countNodes', () => {
  it('counts leaf as 1', () => {
    expect(countNodes({ term: { form: 'num', val: 42 }, depth: 0 })).toBe(1)
  })

  it('counts app as 1 + children', () => {
    const term: Term = {
      form: 'app',
      func: { form: 'ref', name: 'f' },
      argm: { form: 'num', val: 1 },
    }
    expect(countNodes({ term, depth: 0 })).toBe(3)
  })
})

describe('isSelfRecursive', () => {
  it('detects self-reference', () => {
    const term: Term = {
      form: 'app',
      func: { form: 'ref', name: 'foo' },
      argm: { form: 'num', val: 1 },
    }
    expect(isSelfRecursive({ term, name: 'foo', depth: 0 })).toBe(true)
  })

  it('returns false for non-recursive', () => {
    const term: Term = { form: 'num', val: 42 }
    expect(isSelfRecursive({ term, name: 'foo', depth: 0 })).toBe(false)
  })
})

describe('optimizeBook (integration)', () => {
  it('chains beta reduce + constant fold', () => {
    // (lam x. add x 3) 4  ->  beta: add 4 3  ->  fold: 7
    const book = makeBook([
      ['main', {
        form: 'app',
        func: {
          form: 'lam',
          name: 'x',
          bod: (x: Term) => ({
            form: 'op2',
            oper: 'add',
            a: x,
            b: { form: 'num', val: 3 },
          }),
        },
        argm: { form: 'num', val: 4 },
      }],
    ])
    const result = optimizeBook({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('num')
    if (main!.form === 'num') {
      expect(main!.val).toBe(7)
    }
  })

  it('chains inlining + constant fold', () => {
    const book = makeBook([
      ['SEVEN', { form: 'num', val: 7 }],
      ['main', {
        form: 'op2',
        oper: 'add',
        a: { form: 'ref', name: 'SEVEN' },
        b: { form: 'num', val: 3 },
      }],
    ])
    const result = optimizeBook({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('num')
    if (main!.form === 'num') {
      expect(main!.val).toBe(10)
    }
  })

  it('eliminates dead let after inlining', () => {
    const book = makeBook([
      ['val', { form: 'num', val: 5 }],
      ['main', {
        form: 'let',
        name: 'x',
        val: { form: 'ref', name: 'val' },
        bod: () => ({ form: 'num', val: 99 }),
      }],
    ])
    const result = optimizeBook({ book })
    const main = result.get('main')
    expect(main).toBeDefined()
    expect(main!.form).toBe('num')
    if (main!.form === 'num') {
      expect(main!.val).toBe(99)
    }
  })

  it('tree shakes with entries', () => {
    const book = makeBook([
      ['main', { form: 'num', val: 1 }],
      ['dead', { form: 'num', val: 2 }],
    ])
    const result = optimizeBook({ book, entries: ['main'] })
    expect(result.has('main')).toBe(true)
    expect(result.has('dead')).toBe(false)
  })
})
