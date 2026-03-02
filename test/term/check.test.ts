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
    const result = check({ term: { form: 'u64' }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('set')
      }
    }
  })

  it('infers F64 : Set', () => {
    const result = check({ term: { form: 'f64' }, book: emptyBook() })
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
        expect(result.value.typ.form).toBe('u64')
      }
    }
  })

  it('infers Flt : F64', () => {
    const result = check({ term: { form: 'flt', val: 3.14 }, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.value.form).toBe('ann')
      if (result.value.form === 'ann') {
        expect(result.value.typ.form).toBe('f64')
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
      expect(result.value.typ.form).toBe('u64')
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
      expect(result.value.typ.form).toBe('u64')
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
      expect(result.value.typ.form).toBe('u64')
    }
  })

  it('infers All : Set', () => {
    const term: Term = {
      form: 'all', name: 'x',
      inp: { form: 'u64' },
      bod: (_x) => ({ form: 'u64' }),
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
      typ: { form: 'u64' },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('fails on type mismatch: (3.14 : U64)', () => {
    const term: Term = {
      form: 'ann', done: true,
      val: { form: 'flt', val: 3.14 },
      typ: { form: 'u64' },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).toBeNull()
  })

  it('checks lambda against pi type', () => {
    // (λx. x) : U64 → U64
    const lamTerm: Term = {
      form: 'lam', name: 'x',
      bod: (x) => x,
    }
    const piType: Term = {
      form: 'all', name: 'x',
      inp: { form: 'u64' },
      bod: (_x) => ({ form: 'u64' }),
    }
    const annotated: Term = { form: 'ann', done: true, val: lamTerm, typ: piType }
    const result = check({ term: annotated, book: emptyBook() })
    expect(result).not.toBeNull()
  })

  it('infers application: (id 42) where id : U64 → U64', () => {
    const id: Term = {
      form: 'ann', done: false,
      val: { form: 'lam', name: 'x', bod: (x) => x },
      typ: { form: 'all', name: 'x', inp: { form: 'u64' }, bod: () => ({ form: 'u64' }) },
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
      expect(result.value.typ.form).toBe('u64')
    }
  })

  it('fails on undefined reference', () => {
    const term: Term = { form: 'ref', name: 'nonexistent' }
    const result = check({ term, book: emptyBook() })
    expect(result).toBeNull()
  })

  it('fails inferring unannotated lambda', () => {
    const state = envInit({ book: emptyBook() })
    const term: Term = { form: 'lam', name: 'x', bod: (x) => x }
    const result = envRun({
      env: infer({ sus: false, src: null, term, dep: 0 }),
      state,
    })
    expect(result).toBeNull()
  })

  it('infers reference type from book', () => {
    const book = bookWith({
      five: { form: 'ann', done: false, val: { form: 'num', val: 5 }, typ: { form: 'u64' } },
    })
    const result = check({ term: { form: 'ref', name: 'five' }, book })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('u64')
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

  it('logs error info on type mismatch', () => {
    const state = envInit({ book: emptyBook() })
    // Try to check: 3.14 : U64 (should fail with error)
    const result = envRun({
      env: verify({ sus: false, src: null, term: { form: 'flt', val: 3.14 }, typx: { form: 'u64' }, dep: 0 }),
      state,
    })
    expect(result).toBeNull()
  })

  it('infers Op2 add on F64 operands', () => {
    const term: Term = {
      form: 'op2', oper: 'add',
      a: { form: 'flt', val: 1.5 },
      b: { form: 'flt', val: 2.5 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).not.toBeNull()
    if (result && result.value.form === 'ann') {
      expect(result.value.typ.form).toBe('f64')
    }
  })

  it('fails Op2 with mismatched types', () => {
    const term: Term = {
      form: 'op2', oper: 'add',
      a: { form: 'num', val: 1 },
      b: { form: 'flt', val: 2.5 },
    }
    const result = check({ term, book: emptyBook() })
    expect(result).toBeNull()
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
      expect(result.value.typ.form).toBe('u64')
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
      expect(result.value.typ.form).toBe('u64')
    }
  })
})
