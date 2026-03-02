import { describe, it, expect } from 'vitest'
import {
  castBook,
  castTerm,
} from '@/cast/typescript'
import { desugarCard } from '@/term/desugar'
import type { Term, Book } from '@/term/form'
import type {
  SurfCard,
  SurfTask,
  SurfForm,
  SurfCall,
  SurfMake,
  SurfFork,
} from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

function cast(term: Term): string {
  return castTerm({ term, dep: 0 })
}

describe('cast/typescript', () => {
  describe('castTerm primitives', () => {
    it('casts Num', () => {
      expect(cast({ form: 'num', val: 42 })).toBe('42')
    })

    it('casts Flt', () => {
      expect(cast({ form: 'flt', val: 3.14 })).toBe('3.14')
    })

    it('casts Flt integer with .0', () => {
      expect(cast({ form: 'flt', val: 5 })).toBe('5.0')
    })

    it('casts Var', () => {
      expect(cast({ form: 'var', name: 'x', idx: 0 })).toBe('x')
    })

    it('casts Ref', () => {
      expect(cast({ form: 'ref', name: 'add' })).toBe('add')
    })

    it('casts Ref with slashes', () => {
      expect(cast({ form: 'ref', name: 'std/math' })).toBe('std_math')
    })

    it('casts Txt as JSON string', () => {
      expect(cast({ form: 'txt', val: 'hello' })).toBe('"hello"')
    })

    it('casts Txt with special chars', () => {
      expect(cast({ form: 'txt', val: 'say "hi"' })).toBe('"say \\"hi\\""')
    })

    it('casts Nat as number', () => {
      expect(cast({ form: 'nat', val: 7 })).toBe('7')
    })

    it('erases Set', () => {
      expect(cast({ form: 'set' })).toBe('undefined')
    })

    it('erases U64 type', () => {
      expect(cast({ form: 'u64' })).toBe('undefined')
    })

    it('erases F64 type', () => {
      expect(cast({ form: 'f64' })).toBe('undefined')
    })

    it('erases Ann', () => {
      expect(cast({
        form: 'ann', done: false,
        val: { form: 'num', val: 42 },
        typ: { form: 'u64' },
      })).toBe('42')
    })

    it('erases Ins', () => {
      expect(cast({
        form: 'ins',
        val: { form: 'num', val: 7 },
      })).toBe('7')
    })

    it('erases Src', () => {
      expect(cast({
        form: 'src',
        site: { form: 'brew-site' },
        val: { form: 'num', val: 7 },
      })).toBe('7')
    })
  })

  describe('castTerm lambda and application', () => {
    it('casts identity lambda', () => {
      const term: Term = { form: 'lam', name: 'x', bod: (x) => x }
      expect(cast(term)).toBe('(x) => x')
    })

    it('casts nested lambda as multi-param', () => {
      const term: Term = {
        form: 'lam', name: 'x',
        bod: (_x) => ({ form: 'lam', name: 'y', bod: (y) => y }),
      }
      expect(cast(term)).toBe('(x, y) => y')
    })

    it('casts simple application', () => {
      const term: Term = {
        form: 'app',
        func: { form: 'ref', name: 'f' },
        argm: { form: 'num', val: 1 },
      }
      expect(cast(term)).toBe('f(1)')
    })

    it('casts nested application as multi-arg call', () => {
      const term: Term = {
        form: 'app',
        func: {
          form: 'app',
          func: { form: 'ref', name: 'add' },
          argm: { form: 'num', val: 1 },
        },
        argm: { form: 'num', val: 2 },
      }
      expect(cast(term)).toBe('add(1, 2)')
    })
  })

  describe('castTerm let and op2', () => {
    it('casts let binding as IIFE in expression mode', () => {
      const term: Term = {
        form: 'let', name: 'x',
        val: { form: 'num', val: 10 },
        bod: (x) => x,
      }
      expect(cast(term)).toBe('(() => { const x = 10; return x; })()')
    })

    it('casts op2 add', () => {
      const term: Term = {
        form: 'op2', oper: 'add',
        a: { form: 'var', name: 'a', idx: 0 },
        b: { form: 'var', name: 'b', idx: 1 },
      }
      expect(cast(term)).toBe('(a + b)')
    })

    it('casts op2 eq with strict equality', () => {
      const term: Term = {
        form: 'op2', oper: 'eq',
        a: { form: 'num', val: 1 },
        b: { form: 'num', val: 2 },
      }
      expect(cast(term)).toBe('(1 === 2)')
    })

    it('casts op2 ne with strict inequality', () => {
      const term: Term = {
        form: 'op2', oper: 'ne',
        a: { form: 'num', val: 1 },
        b: { form: 'num', val: 2 },
      }
      expect(cast(term)).toBe('(1 !== 2)')
    })
  })

  describe('castTerm constructors and match (no ctx)', () => {
    it('casts Con with no args as string-tagged object', () => {
      expect(cast({ form: 'con', name: 'True', args: [] }))
        .toBe('({ tag: "True" })')
    })

    it('casts Con with named fields', () => {
      const term: Term = {
        form: 'con', name: 'Succ',
        args: [['pred', { form: 'num', val: 5 }]],
      }
      expect(cast(term)).toBe('({ tag: "Succ", pred: 5 })')
    })

    it('casts Con with positional args', () => {
      const term: Term = {
        form: 'con', name: 'Pair',
        args: [
          [null, { form: 'num', val: 1 }],
          [null, { form: 'num', val: 2 }],
        ],
      }
      expect(cast(term)).toBe('({ tag: "Pair", _0: 1, _1: 2 })')
    })

    it('casts standalone Mat as switch function', () => {
      const term: Term = {
        form: 'mat',
        arms: [
          ['Zero', { form: 'num', val: 0 }],
          ['Succ', { form: 'lam', name: 'p', bod: (p) => p }],
        ],
      }
      const result = cast(term)
      expect(result).toContain('switch ($$v.tag)')
      expect(result).toContain('case "Zero": return 0;')
      expect(result).toContain('case "Succ": return (p) => p;')
    })

    it('casts Swi as ternary function', () => {
      const term: Term = {
        form: 'swi',
        zero: { form: 'num', val: 100 },
        succ: { form: 'lam', name: 'p', bod: (p) => p },
      }
      const result = cast(term)
      expect(result).toContain('$$n === 0')
      expect(result).toContain('100')
      expect(result).toContain('$$n - 1')
    })
  })

  describe('castTerm sugar', () => {
    it('casts empty Lst as empty array', () => {
      expect(cast({ form: 'lst', list: [] })).toBe('[]')
    })

    it('casts Lst as array literal', () => {
      const term: Term = {
        form: 'lst',
        list: [
          { form: 'num', val: 1 },
          { form: 'num', val: 2 },
          { form: 'num', val: 3 },
        ],
      }
      expect(cast(term)).toBe('[1, 2, 3]')
    })
  })

  describe('castTerm misc', () => {
    it('casts Log as comma expression', () => {
      const term: Term = {
        form: 'log',
        msg: { form: 'txt', val: 'debug' },
        val: { form: 'num', val: 0 },
      }
      const result = cast(term)
      expect(result).toBe('(console.log("debug"), 0)')
    })

    it('casts Hol as throw', () => {
      const result = cast({ form: 'hol', name: 'goal', ctx: [] })
      expect(result).toContain('throw new Error')
      expect(result).toContain('hole: goal')
    })

    it('casts ADT as undefined', () => {
      expect(cast({
        form: 'adt',
        indx: [],
        ctrs: [],
        type: { form: 'set' },
      })).toBe('undefined')
    })
  })

  describe('castBook', () => {
    it('generates TS function for lam definition', () => {
      const book: Book = new Map([
        ['id', {
          form: 'ann', done: false,
          val: { form: 'lam', name: 'x', bod: (x: Term) => x },
          typ: {
            form: 'all', name: 'x',
            inp: { form: 'u64' },
            bod: () => ({ form: 'u64' }),
          },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export function id(x)')
      expect(result).toContain('return x;')
    })

    it('generates TS const for non-lam definition', () => {
      const book: Book = new Map([
        ['five', {
          form: 'ann', done: false,
          val: { form: 'num', val: 5 },
          typ: { form: 'u64' },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export const five = 5;')
    })

    it('erases type-only definitions', () => {
      const book: Book = new Map([
        ['Nat', {
          form: 'adt', indx: [], ctrs: [],
          type: { form: 'set' },
        } as Term],
        ['zero', { form: 'con', name: 'Zero', args: [] } as Term],
      ])

      const result = castBook({ book })
      expect(result).not.toContain('export const Nat')
      expect(result).toContain('export const zero')
    })

    it('sanitizes names with special chars', () => {
      const book: Book = new Map([
        ['std/math/pi', { form: 'flt', val: 3.14 } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export const std_math_pi = 3.14;')
    })

    it('uses numeric tags when ADTs are defined', () => {
      const book: Book = new Map([
        ['Bool', {
          form: 'adt', indx: [],
          ctrs: [
            { name: 'true', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
            { name: 'false', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
          ],
          type: { form: 'set' },
        } as Term],
        ['yes', { form: 'con', name: 'true', args: [] } as Term],
        ['no', { form: 'con', name: 'false', args: [] } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('{ $: 0 }')
      expect(result).toContain('{ $: 1 }')
      expect(result).not.toContain('tag:')
    })

    it('emits multi-param function for nested lam', () => {
      const book: Book = new Map([
        ['add', {
          form: 'ann', done: false,
          val: {
            form: 'lam', name: 'a',
            bod: (_a: Term) => ({
              form: 'lam', name: 'b',
              bod: (b: Term) => b,
            }),
          } as Term,
          typ: { form: 'set' },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export function add(a, b)')
      expect(result).toContain('return b;')
    })

    it('emits flat const for let in function body', () => {
      const book: Book = new Map([
        ['ten', {
          form: 'let', name: 'x',
          val: { form: 'num', val: 10 },
          bod: (x: Term) => x,
        } as Term],
      ])

      const result = castBook({ book })
      // Non-lam top-level, so emits as const with IIFE
      expect(result).toContain('export const ten')
    })
  })

  describe('castBook with match', () => {
    it('emits inline if/else for 2-arm match in function', () => {
      const book: Book = new Map([
        ['Bool', {
          form: 'adt', indx: [],
          ctrs: [
            { name: 'true', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
            { name: 'false', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
          ],
          type: { form: 'set' },
        } as Term],
        ['not', {
          form: 'ann', done: false,
          val: {
            form: 'lam', name: 'b',
            bod: (b: Term) => ({
              form: 'app',
              func: {
                form: 'mat',
                arms: [
                  ['true', { form: 'con', name: 'false', args: [] }],
                  ['false', { form: 'con', name: 'true', args: [] }],
                ],
              } as Term,
              argm: b,
            }),
          } as Term,
          typ: { form: 'set' },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export function not(b)')
      expect(result).toContain('$$m.$ === 0')
      expect(result).toContain('if (')
      expect(result).toContain('} else {')
      expect(result).not.toContain('switch')
    })

    it('emits switch for 3+ arm match in function', () => {
      const book: Book = new Map([
        ['Color', {
          form: 'adt', indx: [],
          ctrs: [
            { name: 'red', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
            { name: 'green', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
            { name: 'blue', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
          ],
          type: { form: 'set' },
        } as Term],
        ['toNum', {
          form: 'ann', done: false,
          val: {
            form: 'lam', name: 'c',
            bod: (c: Term) => ({
              form: 'app',
              func: {
                form: 'mat',
                arms: [
                  ['red', { form: 'num', val: 0 }],
                  ['green', { form: 'num', val: 1 }],
                  ['blue', { form: 'num', val: 2 }],
                ],
              } as Term,
              argm: c,
            }),
          } as Term,
          typ: { form: 'set' },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('export function toNum(c)')
      expect(result).toContain('switch ($$m.$)')
      expect(result).toContain('case 0:')
      expect(result).toContain('case 1:')
      expect(result).toContain('case 2:')
    })
  })

  describe('end-to-end: desugar then cast to TS', () => {
    it('generates TS for a desugared identity task', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'id', head: [],
          base: [{ form: 'base', name: 'x', like: 'u64', site }],
          flow: [
            { form: 'back', sift: { form: 'sift-loan', path: ['x'], site }, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const ts = castBook({ book })
      expect(ts).toContain('export function id(x)')
      expect(ts).toContain('return x;')
    })

    it('generates TS for a task with call', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'double', head: [],
          base: [{ form: 'base', name: 'n', like: 'u64', site }],
          flow: [
            { form: 'back', sift: {
              form: 'call', name: 'mul', bind: [
                { form: 'bind', name: 'a', sift: { form: 'sift-loan', path: ['n'], site }, site },
                { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
              ], hook: {}, site,
            } as SurfCall, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const ts = castBook({ book })
      expect(ts).toContain('export function double(n)')
      expect(ts).toContain('return mul(n, 2);')
    })

    it('generates TS for a task with save', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'ten', head: [],
          base: [],
          flow: [
            { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 10, site }, site },
            { form: 'back', sift: { form: 'sift-loan', path: ['x'], site }, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const ts = castBook({ book })
      // ten has no params, so it's a const, but the body is a Let
      // which in expression mode becomes IIFE
      expect(ts).toContain('export const ten')
      expect(ts).toContain('const x = 10')
    })

    it('generates TS for form + task with fork', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [
          {
            form: 'form', name: 'bool', head: [], link: [], bond: [], task: [],
            case: [
              { form: 'case-arm', name: 'true', link: [], site },
              { form: 'case-arm', name: 'false', link: [], site },
            ], site,
          } as SurfForm,
          {
            form: 'task', name: 'not', head: [],
            base: [{ form: 'base', name: 'b', like: 'bool', site }],
            flow: [{
              form: 'fork', mode: 'case',
              sift: { form: 'sift-loan', path: ['b'], site },
              hook: [
                { form: 'hook', name: 'true', base: [], flow: [
                  { form: 'back', sift: { form: 'make', name: 'false', bind: [], site } as SurfMake, site },
                ], site },
                { form: 'hook', name: 'false', base: [], flow: [
                  { form: 'back', sift: { form: 'make', name: 'true', bind: [], site } as SurfMake, site },
                ], site },
              ],
              site,
            } as SurfFork],
            task: [], site,
          } as SurfTask,
        ],
      }
      const book = desugarCard({ card })
      const ts = castBook({ book })
      // bool ADT should be erased
      expect(ts).not.toContain('export const bool')
      expect(ts).not.toContain('export function bool')
      // not should be a function with inline match
      expect(ts).toContain('export function not(b)')
      // Should use numeric tags since ADT is defined
      expect(ts).toContain('$')
    })
  })
})
