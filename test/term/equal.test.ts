import { describe, it, expect, beforeEach } from 'vitest'
import { equal } from '@/term/equal'
import { envRun, envInit, envResetMeta } from '@/term/env'
import type { Term, Book, State } from '@/term/form'

function state(): State {
  return envInit({ book: new Map() })
}

function checkEqual(a: Term, b: Term, dep = 0): boolean {
  const result = envRun({ env: equal({ a, b, dep }), state: state() })
  return result !== null && result.value === true
}

describe('term/equal', () => {
  beforeEach(() => {
    envResetMeta()
  })

  it('set equals set', () => {
    expect(checkEqual({ form: 'set' }, { form: 'set' })).toBe(true)
  })

  it('u64 equals u64', () => {
    expect(checkEqual({ form: 'u64' }, { form: 'u64' })).toBe(true)
  })

  it('f64 equals f64', () => {
    expect(checkEqual({ form: 'f64' }, { form: 'f64' })).toBe(true)
  })

  it('num equals same num', () => {
    expect(checkEqual(
      { form: 'num', val: 42 },
      { form: 'num', val: 42 },
    )).toBe(true)
  })

  it('num does not equal different num', () => {
    expect(checkEqual(
      { form: 'num', val: 42 },
      { form: 'num', val: 43 },
    )).toBe(false)
  })

  it('var equals same index', () => {
    expect(checkEqual(
      { form: 'var', name: 'x', idx: 0 },
      { form: 'var', name: 'y', idx: 0 },
    )).toBe(true)
  })

  it('var does not equal different index', () => {
    expect(checkEqual(
      { form: 'var', name: 'x', idx: 0 },
      { form: 'var', name: 'x', idx: 1 },
    )).toBe(false)
  })

  it('ref equals same name', () => {
    expect(checkEqual(
      { form: 'ref', name: 'add' },
      { form: 'ref', name: 'add' },
    )).toBe(true)
  })

  it('ref does not equal different name', () => {
    expect(checkEqual(
      { form: 'ref', name: 'add' },
      { form: 'ref', name: 'mul' },
    )).toBe(false)
  })

  it('different forms are not equal', () => {
    expect(checkEqual(
      { form: 'u64' },
      { form: 'f64' },
    )).toBe(false)
  })

  it('lam equal when bodies equal', () => {
    const a: Term = { form: 'lam', name: 'x', bod: (x) => x }
    const b: Term = { form: 'lam', name: 'y', bod: (y) => y }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('lam not equal when bodies differ', () => {
    const a: Term = { form: 'lam', name: 'x', bod: (_x) => ({ form: 'num', val: 1 }) }
    const b: Term = { form: 'lam', name: 'x', bod: (_x) => ({ form: 'num', val: 2 }) }
    expect(checkEqual(a, b)).toBe(false)
  })

  it('all equal when inp and bod match', () => {
    const a: Term = { form: 'all', name: 'x', inp: { form: 'u64' }, bod: (_x) => ({ form: 'u64' }) }
    const b: Term = { form: 'all', name: 'y', inp: { form: 'u64' }, bod: (_y) => ({ form: 'u64' }) }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('all not equal when inp differs', () => {
    const a: Term = { form: 'all', name: 'x', inp: { form: 'u64' }, bod: (_x) => ({ form: 'u64' }) }
    const b: Term = { form: 'all', name: 'x', inp: { form: 'f64' }, bod: (_x) => ({ form: 'u64' }) }
    expect(checkEqual(a, b)).toBe(false)
  })

  it('app equal when func and arg match', () => {
    const a: Term = { form: 'app', func: { form: 'ref', name: 'f' }, argm: { form: 'num', val: 1 } }
    const b: Term = { form: 'app', func: { form: 'ref', name: 'f' }, argm: { form: 'num', val: 1 } }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('op2 equal when oper and operands match', () => {
    const a: Term = { form: 'op2', oper: 'add', a: { form: 'num', val: 1 }, b: { form: 'num', val: 2 } }
    const b: Term = { form: 'op2', oper: 'add', a: { form: 'num', val: 1 }, b: { form: 'num', val: 2 } }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('con equal when name and args match', () => {
    const a: Term = { form: 'con', name: 'Succ', args: [[null, { form: 'num', val: 1 }]] }
    const b: Term = { form: 'con', name: 'Succ', args: [[null, { form: 'num', val: 1 }]] }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('con not equal when names differ', () => {
    const a: Term = { form: 'con', name: 'Zero', args: [] }
    const b: Term = { form: 'con', name: 'Succ', args: [] }
    expect(checkEqual(a, b)).toBe(false)
  })

  it('equality through reduction: let x = 5 in x == 5', () => {
    const a: Term = { form: 'let', name: 'x', val: { form: 'num', val: 5 }, bod: (x) => x }
    const b: Term = { form: 'num', val: 5 }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('equality through reduction: (+ 2 3) == 5', () => {
    const a: Term = { form: 'op2', oper: 'add', a: { form: 'num', val: 2 }, b: { form: 'num', val: 3 } }
    const b: Term = { form: 'num', val: 5 }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('metavar unification: ?X == 42 solves X to 42', () => {
    const meta: Term = { form: 'met', uid: 999, ctx: [] }
    const num: Term = { form: 'num', val: 42 }
    const s = state()
    const result = envRun({ env: equal({ a: meta, b: num, dep: 0 }), state: s })
    expect(result).not.toBeNull()
    expect(result!.value).toBe(true)
    expect(result!.state.fill.get(999)).toEqual(num)
  })

  it('swi equal when zero and succ match', () => {
    const a: Term = { form: 'swi', zero: { form: 'num', val: 0 }, succ: { form: 'num', val: 1 } }
    const b: Term = { form: 'swi', zero: { form: 'num', val: 0 }, succ: { form: 'num', val: 1 } }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('mat equal when arms match', () => {
    const a: Term = { form: 'mat', arms: [['Zero', { form: 'num', val: 0 }], ['Succ', { form: 'num', val: 1 }]] }
    const b: Term = { form: 'mat', arms: [['Zero', { form: 'num', val: 0 }], ['Succ', { form: 'num', val: 1 }]] }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('slf equal when type and body match', () => {
    const a: Term = { form: 'slf', name: 'self', typ: { form: 'set' }, bod: (x) => x }
    const b: Term = { form: 'slf', name: 's', typ: { form: 'set' }, bod: (x) => x }
    expect(checkEqual(a, b)).toBe(true)
  })

  it('txt equal when values match', () => {
    expect(checkEqual(
      { form: 'txt', val: 'hello' },
      { form: 'txt', val: 'hello' },
    )).toBe(true)
  })

  it('hol equal when names match', () => {
    expect(checkEqual(
      { form: 'hol', name: 'goal', ctx: [] },
      { form: 'hol', name: 'goal', ctx: [] },
    )).toBe(true)
  })
})
