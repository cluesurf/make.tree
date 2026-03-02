import { describe, it, expect } from 'vitest'
import { showTerm, showTermFull } from '@/term/show'
import type { Term } from '@/term/form'

describe('term/show', () => {
  it('shows Set as *', () => {
    expect(showTerm({ form: 'set' })).toBe('*')
  })

  it('shows U64 type', () => {
    expect(showTerm({ form: 'u64' })).toBe('U64')
  })

  it('shows F64 type', () => {
    expect(showTerm({ form: 'f64' })).toBe('F64')
  })

  it('shows Num value', () => {
    expect(showTerm({ form: 'num', val: 42 })).toBe('42')
  })

  it('shows Flt value', () => {
    expect(showTerm({ form: 'flt', val: 3.14 })).toBe('3.14')
  })

  it('shows Txt value', () => {
    expect(showTerm({ form: 'txt', val: 'hello' })).toBe('"hello"')
  })

  it('shows Ref', () => {
    expect(showTerm({ form: 'ref', name: 'add' })).toBe('add')
  })

  it('shows Var', () => {
    expect(showTerm({ form: 'var', name: 'x', idx: 0 })).toBe('x')
  })

  it('shows Hol', () => {
    expect(showTerm({ form: 'hol', name: 'goal', ctx: [] })).toBe('?goal')
  })

  it('shows Met', () => {
    expect(showTerm({ form: 'met', uid: 7, ctx: [] })).toBe('_7')
  })

  it('shows Nat sugar', () => {
    const zero: Term = { form: 'con', name: 'Zero', args: [] }
    expect(showTerm(zero)).toBe('#0')

    const two: Term = {
      form: 'con', name: 'Succ', args: [[null, {
        form: 'con', name: 'Succ', args: [[null, zero]],
      }]],
    }
    expect(showTerm(two)).toBe('#2')
  })

  it('shows Lam', () => {
    const lam: Term = {
      form: 'lam',
      name: 'x',
      bod: (x) => x,
    }
    expect(showTerm(lam)).toBe('λx x')
  })

  it('shows All (forall)', () => {
    const all: Term = {
      form: 'all',
      name: 'x',
      inp: { form: 'u64' },
      bod: (_x) => ({ form: 'u64' }),
    }
    expect(showTerm(all)).toBe('∀(x: U64) U64')
  })

  it('shows App', () => {
    const app: Term = {
      form: 'app',
      func: { form: 'ref', name: 'add' },
      argm: { form: 'num', val: 1 },
    }
    expect(showTerm(app)).toBe('(add 1)')
  })

  it('unwraps nested App', () => {
    const app: Term = {
      form: 'app',
      func: {
        form: 'app',
        func: { form: 'ref', name: 'add' },
        argm: { form: 'num', val: 1 },
      },
      argm: { form: 'num', val: 2 },
    }
    expect(showTerm(app)).toBe('(add 1 2)')
  })

  it('shows Let', () => {
    const let_: Term = {
      form: 'let',
      name: 'x',
      val: { form: 'num', val: 10 },
      bod: (x) => x,
    }
    expect(showTerm(let_)).toBe('let x = 10 x')
  })

  it('shows Op2', () => {
    const op: Term = {
      form: 'op2',
      oper: 'add',
      a: { form: 'var', name: 'x', idx: 0 },
      b: { form: 'var', name: 'y', idx: 1 },
    }
    expect(showTerm(op)).toBe('(+ x y)')
  })

  it('shows Mat', () => {
    const mat: Term = {
      form: 'mat',
      arms: [
        ['Zero', { form: 'num', val: 0 }],
        ['Succ', { form: 'num', val: 1 }],
      ],
    }
    expect(showTerm(mat)).toBe('λ{ #Zero: 0 #Succ: 1 }')
  })

  it('shows Ann in full mode only', () => {
    const ann: Term = {
      form: 'ann',
      done: false,
      val: { form: 'num', val: 42 },
      typ: { form: 'u64' },
    }
    expect(showTerm(ann)).toBe('42')
    expect(showTermFull(ann)).toBe('{42: U64}')
  })

  it('shows Slf', () => {
    const slf: Term = {
      form: 'slf',
      name: 'self',
      typ: { form: 'set' },
      bod: (x) => x,
    }
    expect(showTerm(slf)).toBe('$(self: *) self')
  })

  it('shows Ins', () => {
    const ins: Term = {
      form: 'ins',
      val: { form: 'var', name: 'x', idx: 0 },
    }
    expect(showTerm(ins)).toBe('~x')
  })

  it('shows Swi', () => {
    const swi: Term = {
      form: 'swi',
      zero: { form: 'num', val: 0 },
      succ: { form: 'var', name: 'p', idx: 0 },
    }
    expect(showTerm(swi)).toBe('λ{ 0: 0 _: p }')
  })

  it('shows Lst', () => {
    const lst: Term = {
      form: 'lst',
      list: [
        { form: 'num', val: 1 },
        { form: 'num', val: 2 },
        { form: 'num', val: 3 },
      ],
    }
    expect(showTerm(lst)).toBe('[1 2 3]')
  })
})
