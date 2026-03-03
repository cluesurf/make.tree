import { describe, it, expect } from 'vitest'
import { castBook, castTerm } from '@/cast/hvm'
import { desugarCard } from '@/term/desugar'
import type { Term, Book } from '@/term/form'
import type { SurfCard, SurfTask, SurfForm, SurfCall, SurfMake, SurfFork } from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

function cast(term: Term): string {
  return castTerm({ term, dep: 0 })
}

describe('cast/hvm', () => {
  describe('castTerm primitives', () => {
    it('casts Num', () => {
      expect(cast({ form: 'num', val: 42 })).toBe('42')
    })

    it('casts Flt', () => {
      expect(cast({ form: 'flt', val: 3.14 })).toBe('3.14')
    })

    it('casts Var', () => {
      expect(cast({ form: 'var', name: 'x', idx: 0 })).toBe('x')
    })

    it('casts Ref', () => {
      expect(cast({ form: 'ref', name: 'add' })).toBe('@add')
    })

    it('casts Ref with slashes', () => {
      expect(cast({ form: 'ref', name: 'std/math' })).toBe('@std_math')
    })

    it('erases Set', () => {
      expect(cast({ form: 'set' })).toBe('*')
    })

    it('erases U64 type', () => {
      expect(cast({ form: 'u64' })).toBe('*')
    })

    it('erases Ann', () => {
      expect(cast({
        form: 'ann', done: false,
        val: { form: 'num', val: 42 },
        typ: { form: 'u64' },
      })).toBe('42')
    })
  })

  describe('castTerm lambda and application', () => {
    it('casts identity lambda', () => {
      const term: Term = { form: 'lam', name: 'x', bod: (x) => x }
      expect(cast(term)).toBe('λx x')
    })

    it('casts nested lambda', () => {
      const term: Term = {
        form: 'lam', name: 'x',
        bod: (_x) => ({ form: 'lam', name: 'y', bod: (y) => y }),
      }
      expect(cast(term)).toBe('λx λy y')
    })

    it('casts simple application', () => {
      const term: Term = {
        form: 'app',
        func: { form: 'ref', name: 'f' },
        argm: { form: 'num', val: 1 },
      }
      expect(cast(term)).toBe('(@f 1)')
    })

    it('casts nested application (multi-arg)', () => {
      const term: Term = {
        form: 'app',
        func: {
          form: 'app',
          func: { form: 'ref', name: 'add' },
          argm: { form: 'num', val: 1 },
        },
        argm: { form: 'num', val: 2 },
      }
      expect(cast(term)).toBe('(@add 1 2)')
    })
  })

  describe('castTerm let and op2', () => {
    it('casts let binding', () => {
      const term: Term = {
        form: 'let', name: 'x',
        val: { form: 'num', val: 10 },
        bod: (x) => x,
      }
      expect(cast(term)).toBe('let x = 10; x')
    })

    it('casts op2 add', () => {
      const term: Term = {
        form: 'op2', oper: 'add',
        a: { form: 'var', name: 'a', idx: 0 },
        b: { form: 'var', name: 'b', idx: 1 },
      }
      expect(cast(term)).toBe('(+ a b)')
    })

    it('casts op2 eq', () => {
      const term: Term = {
        form: 'op2', oper: 'eq',
        a: { form: 'num', val: 1 },
        b: { form: 'num', val: 2 },
      }
      expect(cast(term)).toBe('(== 1 2)')
    })
  })

  describe('castTerm constructors and match', () => {
    it('casts Con with no args', () => {
      expect(cast({ form: 'con', name: 'True', args: [] })).toBe('#True')
    })

    it('casts Con with named fields', () => {
      const term: Term = {
        form: 'con', name: 'Succ',
        args: [['pred', { form: 'num', val: 5 }]],
      }
      expect(cast(term)).toBe('#Succ { pred: 5 }')
    })

    it('casts Con with positional args', () => {
      const term: Term = {
        form: 'con', name: 'Pair',
        args: [
          [null, { form: 'num', val: 1 }],
          [null, { form: 'num', val: 2 }],
        ],
      }
      expect(cast(term)).toBe('#Pair { 1 2 }')
    })

    it('casts Mat', () => {
      const term: Term = {
        form: 'mat',
        arms: [
          ['Zero', { form: 'num', val: 0 }],
          ['Succ', { form: 'lam', name: 'p', bod: (p) => p }],
        ],
      }
      const result = cast(term)
      expect(result).toContain('#Zero: 0')
      expect(result).toContain('#Succ: λp p')
    })

    it('casts Swi', () => {
      const term: Term = {
        form: 'swi',
        zero: { form: 'num', val: 100 },
        succ: { form: 'lam', name: 'p', bod: (p) => p },
      }
      const result = cast(term)
      expect(result).toContain('0: 100')
      expect(result).toContain('_: λp p')
    })
  })

  describe('castTerm sugar', () => {
    it('casts empty Txt to Nil', () => {
      expect(cast({ form: 'txt', val: '' })).toBe('#Nil')
    })

    it('casts Txt "hi" to Cons chain', () => {
      const result = cast({ form: 'txt', val: 'hi' })
      expect(result).toContain('#Cons')
      expect(result).toContain('104') // 'h'
      expect(result).toContain('105') // 'i'
      expect(result).toContain('#Nil')
    })

    it('casts empty Lst to Nil', () => {
      expect(cast({ form: 'lst', list: [] })).toBe('#Nil')
    })

    it('casts Lst [1, 2] to Cons chain', () => {
      const term: Term = {
        form: 'lst',
        list: [
          { form: 'num', val: 1 },
          { form: 'num', val: 2 },
        ],
      }
      const result = cast(term)
      expect(result).toContain('#Cons')
      expect(result).toContain('1')
      expect(result).toContain('2')
      expect(result).toContain('#Nil')
    })

    it('casts Nat 0 to Zero', () => {
      expect(cast({ form: 'nat', val: 0 })).toBe('#Zero')
    })

    it('casts Nat 3 to Succ chain', () => {
      const result = cast({ form: 'nat', val: 3 })
      expect(result).toContain('#Succ')
      expect(result).toContain('#Zero')
    })
  })

  describe('castTerm misc', () => {
    it('casts Log', () => {
      const term: Term = {
        form: 'log',
        msg: { form: 'txt', val: 'debug' },
        val: { form: 'num', val: 0 },
      }
      const result = cast(term)
      expect(result).toContain('log(')
      expect(result).toContain(') 0')
    })

    it('casts Hol', () => {
      expect(cast({ form: 'hol', name: 'goal', ctx: [] })).toBe('?goal')
    })

    it('casts Ins (erased wrapper)', () => {
      expect(cast({
        form: 'ins',
        val: { form: 'num', val: 7 },
      })).toBe('7')
    })

    it('casts Src (erased wrapper)', () => {
      expect(cast({
        form: 'src',
        site: { form: 'brew-site' },
        val: { form: 'num', val: 7 },
      })).toBe('7')
    })
  })

  describe('castBook', () => {
    it('generates HVM for a simple book', () => {
      const book: Book = new Map([
        ['five', { form: 'ann', done: false, val: { form: 'num', val: 5 }, typ: { form: 'u64' } } as Term],
        ['id', {
          form: 'ann', done: false,
          val: { form: 'lam', name: 'x', bod: (x: Term) => x },
          typ: { form: 'all', name: 'x', inp: { form: 'u64' }, bod: () => ({ form: 'u64' }) },
        } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('@five = 5')
      expect(result).toContain('@id = λx x')
    })

    it('erases type-only definitions', () => {
      const book: Book = new Map([
        ['Nat', { form: 'adt', indx: [], ctrs: [], type: { form: 'set' } } as Term],
        ['zero', { form: 'con', name: 'Zero', args: [] } as Term],
      ])

      const result = castBook({ book })
      expect(result).not.toContain('@Nat') // ADT erased
      expect(result).toContain('@zero = #Zero')
    })

    it('sanitizes names with special chars', () => {
      const book: Book = new Map([
        ['std/math/pi', { form: 'flt', val: 3.14 } as Term],
      ])

      const result = castBook({ book })
      expect(result).toContain('@std_math_pi = 3.14')
    })
  })

  describe('end-to-end: desugar → cast', () => {
    it('generates HVM for a desugared identity task', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'id', head: [],
          base: [{ form: 'base', name: 'x', like: { form: 'type-name', name: 'u64' }, site }],
          flow: [
            { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const hvm = castBook({ book })
      expect(hvm).toContain('@id = λx x')
    })

    it('generates HVM for a task with call', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'double', head: [],
          base: [{ form: 'base', name: 'n', like: { form: 'type-name', name: 'u64' }, site }],
          flow: [
            { form: 'back', sift: {
              form: 'call', name: 'mul', bind: [
                { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['n'], site }, site },
                { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
              ], hook: {}, site,
            } as SurfCall, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const hvm = castBook({ book })
      expect(hvm).toContain('@double = λn (* n 2)')
    })

    it('generates HVM for a task with save', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [{
          form: 'task', name: 'ten', head: [],
          base: [],
          flow: [
            { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 10, site }, site },
            { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
          ],
          task: [], site,
        } as SurfTask],
      }
      const book = desugarCard({ card })
      const hvm = castBook({ book })
      expect(hvm).toContain('@ten = let x = 10; x')
    })

    it('generates HVM for a form + task with fork', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [
          {
            form: 'form', name: 'bool', head: [], link: [], bond: [], task: [], wear: [],
            case: [
              { form: 'case-arm', name: 'true', link: [], site },
              { form: 'case-arm', name: 'false', link: [], site },
            ], site,
          } as SurfForm,
          {
            form: 'task', name: 'not', head: [],
            base: [{ form: 'base', name: 'b', like: { form: 'type-name', name: 'bool' }, site }],
            flow: [{
              form: 'fork', mode: 'case',
              sift: { form: 'sift-read', path: ['b'], site },
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
      const hvm = castBook({ book })
      // bool is an ADT, should be erased
      expect(hvm).not.toContain('@bool')
      // not should have a match
      expect(hvm).toContain('@not')
      expect(hvm).toContain('#true')
      expect(hvm).toContain('#false')
    })
  })
})
