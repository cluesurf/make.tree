import { describe, it, expect, beforeEach } from 'vitest'
import { check, infer, verify } from '@/term/check'
import { envRun, envInit, envResetMeta } from '@/term/env'
import type { Term, Book, State } from '@/term/form'

function emptyBook(): Book {
  return new Map()
}

function bookWith(defs: Record<string, Term>): Book {
  return new Map(Object.entries(defs))
}

describe('term/check', () => {
  beforeEach(() => {
    envResetMeta()
  })

  it('infers Set : Set', () => {
    const result = check({ term: { form: 'set' }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('set')
      }
    }
  })

  it('infers U64 : Set', () => {
    const result = check({ term: { form: 'int', size: 64, sign: false }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('set')
      }
    }
  })

  it('infers F64 : Set', () => {
    const result = check({ term: { form: 'flt', size: 64 }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('set')
      }
    }
  })

  it('infers Num : U64', () => {
    const result = check({ term: { form: 'num', val: 42 }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('int')
      }
    }
  })

  it('infers Op2 add : U64 for u64 operands', () => {
    const term: Term = {
      form: 'op2', oper: 'add',
      a: { form: 'num', val: 1 },
      b: { form: 'num', val: 2 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers Op2 eq returns U64', () => {
    const term: Term = {
      form: 'op2', oper: 'eq',
      a: { form: 'num', val: 1 },
      b: { form: 'num', val: 2 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers Let : type of body', () => {
    const term: Term = {
      form: 'let', name: 'x',
      val: { form: 'num', val: 10 },
      bod: (x) => x,
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      // Body is x which has type U64
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers All : Set', () => {
    const term: Term = {
      form: 'all', name: 'x',
      inp: { form: 'int', size: 64, sign: false },
      bod: (_x) => ({ form: 'int', size: 64, sign: false }),
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('set')
    }
  })

  it('checks annotated term: (42 : U64)', () => {
    const term: Term = {
      form: 'ann', done: true,
      val: { form: 'num', val: 42 },
      typ: { form: 'int', size: 64, sign: false },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('checks lambda against pi type', () => {
    // (λx. x) : U64 → U64
    const lamTerm: Term = {
      form: 'lam', name: 'x',
      bod: (x) => x,
    }
    const piType: Term = {
      form: 'all', name: 'x',
      inp: { form: 'int', size: 64, sign: false },
      bod: (_x) => ({ form: 'int', size: 64, sign: false }),
    }
    const annotated: Term = { form: 'ann', done: true, val: lamTerm, typ: piType }
    const result = check({ term: annotated, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('infers application: (id 42) where id : U64 → U64', () => {
    const id: Term = {
      form: 'ann', done: false,
      val: { form: 'lam', name: 'x', bod: (x) => x },
      typ: { form: 'all', name: 'x', inp: { form: 'int', size: 64, sign: false }, bod: () => ({ form: 'int', size: 64, sign: false }) },
    }
    const book = bookWith({ id })
    const term: Term = {
      form: 'app',
      func: { form: 'ref', name: 'id' },
      argm: { form: 'num', val: 42 },
    }
    const result = check({ term, book })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('reports error for undefined reference', () => {
    const term: Term = { form: 'ref', name: 'nonexistent' }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    const errors = result!.state.logs.filter(l => l.form === 'error')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('reports error for unannotated lambda', () => {
    const state = envInit({ book: emptyBook() })
    const term: Term = { form: 'lam', name: 'x', bod: (x) => x }
    const result = envRun({
      env: infer({ sus: false, src: null, term, dep: 0 }),
      state,
    })
    expect(result).not.toBeNull()
    const errors = result!.state.logs.filter(l => l.form === 'error')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('infers reference type from book', () => {
    const book = bookWith({
      five: { form: 'ann', done: false, val: { form: 'num', val: 5 }, typ: { form: 'int', size: 64, sign: false } },
    })
    const result = check({ term: { form: 'ref', name: 'five' }, book })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('checks Slf : Set', () => {
    const term: Term = {
      form: 'slf', name: 'self',
      typ: { form: 'set' },
      bod: (_x) => ({ form: 'set' }),
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('set')
    }
  })

  it('infers Ins type through self-type', () => {
    // Self-type: $(self: *) *
    const slfType: Term = {
      form: 'slf', name: 'self',
      typ: { form: 'set' },
      bod: (_x) => ({ form: 'set' }),
    }
    const book = bookWith({
      mySlf: { form: 'ann', done: false, val: { form: 'set' }, typ: slfType },
    })
    const term: Term = { form: 'ins', val: { form: 'ref', name: 'mySlf' } }
    const result = check({ term, book })
    expect(result).not.toBeNull()
  })

  it('infers use binding', () => {
    const term: Term = {
      form: 'use', name: 'x',
      val: { form: 'num', val: 5 },
      bod: (x) => x,
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers log expression type from value', () => {
    const term: Term = {
      form: 'log',
      msg: { form: 'txt', val: 'debug' },
      val: { form: 'num', val: 42 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers rst type from inner value', () => {
    const term: Term = {
      form: 'rst',
      val: { form: 'num', val: 7 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('int')
    }
  })

  it('infers hlt with fresh metavar type', () => {
    const term: Term = {
      form: 'hlt',
      msg: { form: 'txt', val: 'error' },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('met')
    }
  })

  it('checks hlt against expected type (bottom adopts it)', () => {
    const hltTerm: Term = {
      form: 'hlt',
      msg: { form: 'txt', val: 'panic' },
    }
    const piType: Term = {
      form: 'all', name: 'x',
      inp: { form: 'int', size: 64, sign: false },
      bod: () => ({ form: 'int', size: 64, sign: false }),
    }
    const annotated: Term = { form: 'ann', done: false, val: hltTerm, typ: piType }
    const result = check({ term: annotated, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('infers nxt with fresh metavar type', () => {
    const term: Term = { form: 'nxt' }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('met')
    }
  })

  it('checks nxt against expected type (bottom adopts it)', () => {
    const nxtTerm: Term = { form: 'nxt' }
    const u64: Term = { form: 'int', size: 64, sign: false }
    const annotated: Term = { form: 'ann', done: false, val: nxtTerm, typ: u64 }
    const result = check({ term: annotated, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('collects multiple type errors in one definition', () => {
    // Two functions, both with type mismatches
    // f1: (42 : F64) - num is U64, not F64
    // f2: ("hi" : U64) - txt is String, not U64
    const book = bookWith({
      f1: {
        form: 'ann', done: true,
        val: { form: 'num', val: 42 },
        typ: { form: 'flt', size: 64 },
      },
      f2: {
        form: 'ann', done: true,
        val: { form: 'txt', val: 'hi' },
        typ: { form: 'int', size: 64, sign: false },
      },
    })
    // Check f1
    const r1 = check({ term: { form: 'ref', name: 'f1' }, book })
    expect(r1).not.toBeNull()
    const e1 = r1!.state.logs.filter(l => l.form === 'error')
    expect(e1.length).toBeGreaterThanOrEqual(1)

    // Check f2
    const r2 = check({ term: { form: 'ref', name: 'f2' }, book })
    expect(r2).not.toBeNull()
    const e2 = r2!.state.logs.filter(l => l.form === 'error')
    expect(e2.length).toBeGreaterThanOrEqual(1)
  })

  it('collects errors from nested expressions without stopping', () => {
    // A definition with two bad refs: both undefined
    const term: Term = {
      form: 'let', name: 'x',
      val: { form: 'ref', name: 'undefined1' },
      bod: () => ({ form: 'ref', name: 'undefined2' }),
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    const errors = result!.state.logs.filter(l => l.form === 'error')
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it('checks rst against expected type', () => {
    const rstTerm: Term = {
      form: 'rst',
      val: { form: 'num', val: 42 },
    }
    const u64: Term = { form: 'int', size: 64, sign: false }
    const annotated: Term = { form: 'ann', done: false, val: rstTerm, typ: u64 }
    const result = check({ term: annotated, book: emptyBook() })
    expect(result).not.toBeNull()
  })
})
