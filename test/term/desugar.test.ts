import { describe, it, expect } from 'vitest'
import { desugarCard, desugarFlow, desugarSift } from '@/term/desugar'
import { showTerm } from '@/term/show'
import { reduce } from '@/term/reduce'
import { check } from '@/term/check'
import type { Term, Book, Fill } from '@/term/form'
import type { Surf, SurfCard, SurfTask, SurfForm, SurfCall, SurfMake, SurfFork, SurfHook } from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

/** Helper: desugar a single task and get its Core Term from the book. */
function desugarTask(task: SurfTask): Term | undefined {
  const card: SurfCard = { file: 'test.tree', list: [task] }
  const { book } = desugarCard({ card })
  return book.get(task.name)
}

/** Helper: desugar flow with empty scope. */
function flowToTerm(flow: Surf[]): Term {
  return desugarFlow({
    flow,
    ctx: { scope: new Map(), meta: { next: 2000 } },
  })
}

/** Helper: desugar sift with empty scope. */
function siftToTerm(sift: Surf): Term {
  return desugarSift({
    sift,
    ctx: { scope: new Map(), meta: { next: 3000 } },
  })
}

describe('term/desugar', () => {
  describe('sift values', () => {
    it('desugars sift-text to Txt', () => {
      const term = siftToTerm({ form: 'sift-text', val: 'hello', site })
      expect(term.form).toBe('txt')
      if (term.form === 'txt') expect(term.val).toBe('hello')
    })

    it('desugars sift-mark to Num', () => {
      const term = siftToTerm({ form: 'sift-mark', val: 42, site })
      expect(term.form).toBe('num')
      if (term.form === 'num') expect(term.val).toBe(42)
    })

    it('desugars sift-wave true to Ref .true', () => {
      const term = siftToTerm({ form: 'sift-wave', val: true, site })
      expect(term.form).toBe('ref')
      if (term.form === 'ref') expect(term.name).toBe('.true')
    })

    it('desugars sift-wave false to Ref .false', () => {
      const term = siftToTerm({ form: 'sift-wave', val: false, site })
      expect(term.form).toBe('ref')
      if (term.form === 'ref') expect(term.name).toBe('.false')
    })

    it('desugars sift-link to Ref for unknown name', () => {
      const term = siftToTerm({ form: 'sift-link', path: ['pi'], site })
      expect(term.form).toBe('ref')
      if (term.form === 'ref') expect(term.name).toBe('pi')
    })

    it('desugars sift-read to Ref for unknown name', () => {
      const term = siftToTerm({ form: 'sift-read', path: ['x'], site })
      expect(term.form).toBe('ref')
      if (term.form === 'ref') expect(term.name).toBe('x')
    })
  })

  describe('call', () => {
    it('desugars call with no args to Ref', () => {
      const call: SurfCall = {
        form: 'call', name: 'greet', bind: [], hook: {}, site,
      }
      const term = siftToTerm(call)
      expect(term.form).toBe('ref')
      if (term.form === 'ref') expect(term.name).toBe('greet')
    })

    it('desugars call with one arg to App(Ref, arg)', () => {
      const call: SurfCall = {
        form: 'call', name: 'not', bind: [
          { form: 'bind', name: 'x', sift: { form: 'sift-wave', val: true, site }, site },
        ], hook: {}, site,
      }
      const term = siftToTerm(call)
      expect(term.form).toBe('app')
      if (term.form === 'app') {
        expect(term.func.form).toBe('ref')
        expect(term.argm.form).toBe('ref')
      }
    })

    it('desugars call with two args to nested App', () => {
      const call: SurfCall = {
        form: 'call', name: 'add', bind: [
          { form: 'bind', name: 'a', sift: { form: 'sift-mark', val: 1, site }, site },
          { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
        ], hook: {}, site,
      }
      const term = siftToTerm(call)
      expect(showTerm(term)).toBe('(+ 1 2)')
    })
  })

  describe('make', () => {
    it('desugars make to Con', () => {
      const make: SurfMake = {
        form: 'make', name: 'succ', bind: [
          { form: 'bind', name: 'pred', sift: { form: 'sift-mark', val: 5, site }, site },
        ], site,
      }
      const term = siftToTerm(make)
      expect(term.form).toBe('con')
      if (term.form === 'con') {
        expect(term.name).toBe('succ')
        expect(term.args).toHaveLength(1)
        expect(term.args[0]![0]).toBe('pred')
      }
    })

    it('desugars make with no args to empty Con', () => {
      const make: SurfMake = {
        form: 'make', name: 'zero', bind: [], site,
      }
      const term = siftToTerm(make)
      expect(term.form).toBe('con')
      if (term.form === 'con') {
        expect(term.name).toBe('zero')
        expect(term.args).toHaveLength(0)
      }
    })
  })

  describe('flow', () => {
    it('desugars empty flow to Unit', () => {
      const term = flowToTerm([])
      expect(term.form).toBe('con')
      if (term.form === 'con') expect(term.name).toBe('Unit')
    })

    it('desugars single back to expression', () => {
      const term = flowToTerm([
        { form: 'back', sift: { form: 'sift-mark', val: 42, site }, site },
      ])
      expect(term.form).toBe('num')
      if (term.form === 'num') expect(term.val).toBe(42)
    })

    it('desugars save then back to Let', () => {
      const term = flowToTerm([
        { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 10, site }, site },
        { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
      ])
      expect(term.form).toBe('let')
      if (term.form === 'let') {
        expect(term.name).toBe('x')
        expect(term.val.form).toBe('num')
        // Body should resolve 'x' to the let-bound variable
        const body = term.bod({ form: 'var', name: 'x', idx: 0 })
        expect(body.form).toBe('var')
        if (body.form === 'var') expect(body.name).toBe('x')
      }
    })

    it('desugars host then back to Let', () => {
      const term = flowToTerm([
        { form: 'host', name: 'pi', sift: { form: 'sift-mark', val: 314, site }, site },
        { form: 'back', sift: { form: 'sift-read', path: ['pi'], site }, site },
      ])
      expect(term.form).toBe('let')
      if (term.form === 'let') {
        expect(term.name).toBe('pi')
        expect(term.val.form).toBe('num')
      }
    })

    it('chains multiple saves into nested Lets', () => {
      const term = flowToTerm([
        { form: 'save', path: ['a'], sift: { form: 'sift-mark', val: 1, site }, site },
        { form: 'save', path: ['b'], sift: { form: 'sift-mark', val: 2, site }, site },
        { form: 'back', sift: { form: 'sift-mark', val: 3, site }, site },
      ])
      expect(term.form).toBe('let')
      if (term.form === 'let') {
        expect(term.name).toBe('a')
        const inner = term.bod({ form: 'var', name: 'a', idx: 0 })
        expect(inner.form).toBe('let')
        if (inner.form === 'let') {
          expect(inner.name).toBe('b')
          const body = inner.bod({ form: 'var', name: 'b', idx: 1 })
          expect(body.form).toBe('num')
        }
      }
    })

    it('desugars call in flow as let-bound expression', () => {
      const term = flowToTerm([
        { form: 'call', name: 'print', bind: [
          { form: 'bind', name: 'msg', sift: { form: 'sift-text', val: 'hi', site }, site },
        ], hook: {}, site } as SurfCall,
        { form: 'back', sift: { form: 'sift-mark', val: 0, site }, site },
      ])
      expect(term.form).toBe('let')
      if (term.form === 'let') {
        expect(term.name).toBe('_')
        expect(term.val.form).toBe('app')
      }
    })

    it('desugars show to Log node', () => {
      const term = flowToTerm([
        { form: 'show', sift: { form: 'sift-text', val: 'debug', site }, site },
        { form: 'back', sift: { form: 'sift-mark', val: 0, site }, site },
      ])
      expect(term.form).toBe('log')
      if (term.form === 'log') {
        expect(term.msg.form).toBe('txt')
      }
    })
  })

  describe('fork', () => {
    it('desugars fork to Mat applied to scrutinee', () => {
      const fork: SurfFork = {
        form: 'fork', mode: 'case',
        sift: { form: 'sift-read', path: ['x'], site },
        hook: [
          { form: 'hook', name: 'zero', base: [], flow: [
            { form: 'back', sift: { form: 'sift-mark', val: 0, site }, site },
          ], site },
          { form: 'hook', name: 'succ', base: [], flow: [
            { form: 'back', sift: { form: 'sift-mark', val: 1, site }, site },
          ], site },
        ],
        site,
      }
      const term = flowToTerm([fork])
      expect(term.form).toBe('app')
      if (term.form === 'app') {
        expect(term.func.form).toBe('mat')
        if (term.func.form === 'mat') {
          expect(term.func.arms).toHaveLength(2)
          expect(term.func.arms[0]![0]).toBe('zero')
          expect(term.func.arms[1]![0]).toBe('succ')
        }
      }
    })

    it('desugars fork hook with base params to Lam-wrapped arms', () => {
      const fork: SurfFork = {
        form: 'fork', mode: 'case',
        sift: { form: 'sift-read', path: ['n'], site },
        hook: [
          { form: 'hook', name: 'zero', base: [], flow: [
            { form: 'back', sift: { form: 'sift-mark', val: 0, site }, site },
          ], site },
          { form: 'hook', name: 'succ', base: [
            { form: 'base', name: 'pred', site },
          ], flow: [
            { form: 'back', sift: { form: 'sift-read', path: ['pred'], site }, site },
          ], site },
        ],
        site,
      }
      const term = flowToTerm([fork])
      expect(term.form).toBe('app')
      if (term.form === 'app' && term.func.form === 'mat') {
        const succArm = term.func.arms[1]![1]
        // The succ arm should be a Lam wrapping the body
        expect(succArm.form).toBe('lam')
        if (succArm.form === 'lam') {
          expect(succArm.name).toBe('pred')
          // When given a var, body should resolve to that var
          const body = succArm.bod({ form: 'var', name: 'pred', idx: 0 })
          expect(body.form).toBe('var')
        }
      }
    })
  })

  describe('task', () => {
    it('desugars simple task to Ann(Lam, All)', () => {
      const task: SurfTask = {
        form: 'task', name: 'greet', head: [],
        base: [
          { form: 'base', name: 'name', like: { form: 'type-name', name: 'text' }, site },
        ],
        flow: [
          { form: 'back', sift: { form: 'sift-text', val: 'hello', site }, site },
        ],
        task: [], site,
      }
      const term = desugarTask(task)
      expect(term).toBeDefined()
      expect(term!.form).toBe('ann')
      if (term!.form === 'ann') {
        // Value should be a Lam
        expect(term!.val.form).toBe('lam')
        if (term!.val.form === 'lam') {
          expect(term!.val.name).toBe('name')
          // Body should return a Txt
          const body = term!.val.bod({ form: 'var', name: 'name', idx: 0 })
          expect(body.form).toBe('txt')
        }
        // Type should be an All
        expect(term!.typ.form).toBe('all')
        if (term!.typ.form === 'all') {
          expect(term!.typ.name).toBe('name')
          // Input type should be String ref
          expect(term!.typ.inp.form).toBe('ref')
        }
      }
    })

    it('desugars task with two params to nested Lam/All', () => {
      const task: SurfTask = {
        form: 'task', name: 'add', head: [],
        base: [
          { form: 'base', name: 'a', like: { form: 'type-name', name: 'u64' }, site },
          { form: 'base', name: 'b', like: { form: 'type-name', name: 'u64' }, site },
        ],
        flow: [
          { form: 'back', sift: {
            form: 'call', name: 'add-prim', bind: [
              { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['a'], site }, site },
              { form: 'bind', name: 'b', sift: { form: 'sift-read', path: ['b'], site }, site },
            ], hook: {}, site,
          } as SurfCall, site },
        ],
        task: [], site,
      }
      const term = desugarTask(task)
      expect(term).toBeDefined()
      if (term!.form === 'ann') {
        // Value: Lam "a" (Lam "b" (App (App (Ref "add-prim") a) b))
        expect(term!.val.form).toBe('lam')
        if (term!.val.form === 'lam') {
          expect(term!.val.name).toBe('a')
          const inner = term!.val.bod({ form: 'var', name: 'a', idx: 0 })
          expect(inner.form).toBe('lam')
          if (inner.form === 'lam') {
            expect(inner.name).toBe('b')
            const body = inner.bod({ form: 'var', name: 'b', idx: 1 })
            expect(body.form).toBe('app')
            // The call should resolve read a/b to the lambda vars
            if (body.form === 'app') {
              expect(body.func.form).toBe('app')
            }
          }
        }
        // Type: All "a" U64 (All "b" U64 ?met)
        expect(term!.typ.form).toBe('all')
        if (term!.typ.form === 'all') {
          expect(term!.typ.inp.form).toBe('int')
          const inner = term!.typ.bod({ form: 'var', name: 'a', idx: 0 })
          expect(inner.form).toBe('all')
          if (inner.form === 'all') {
            expect(inner.inp.form).toBe('int')
            const ret = inner.bod({ form: 'var', name: 'b', idx: 1 })
            expect(ret.form).toBe('met') // return type is a metavar
          }
        }
      }
    })

    it('desugars task with head (type) params', () => {
      const task: SurfTask = {
        form: 'task', name: 'id', head: [
          { form: 'head', name: 'T', site },
        ],
        base: [
          { form: 'base', name: 'x', like: 'T', site },
        ],
        flow: [
          { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
        ],
        task: [], site,
      }
      const term = desugarTask(task)
      expect(term).toBeDefined()
      if (term!.form === 'ann') {
        // Value: Lam "T" (Lam "x" x)
        expect(term!.val.form).toBe('lam')
        if (term!.val.form === 'lam') {
          expect(term!.val.name).toBe('T')
        }
        // Type: All "T" * (All "x" T ?ret)
        expect(term!.typ.form).toBe('all')
        if (term!.typ.form === 'all') {
          expect(term!.typ.name).toBe('T')
          expect(term!.typ.inp.form).toBe('set') // head type is Set
        }
      }
    })

    it('desugars task with save in flow', () => {
      const task: SurfTask = {
        form: 'task', name: 'double', head: [],
        base: [
          { form: 'base', name: 'x', like: { form: 'type-name', name: 'u64' }, site },
        ],
        flow: [
          { form: 'save', path: ['result'], sift: {
            form: 'call', name: 'mul', bind: [
              { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['x'], site }, site },
              { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
            ], hook: {}, site,
          } as SurfCall, site },
          { form: 'back', sift: { form: 'sift-read', path: ['result'], site }, site },
        ],
        task: [], site,
      }
      const term = desugarTask(task)
      expect(term).toBeDefined()
      if (term!.form === 'ann' && term!.val.form === 'lam') {
        const body = term!.val.bod({ form: 'var', name: 'x', idx: 0 })
        // Body should be: Let "result" (App (App (Ref "mul") x) 2) result
        expect(body.form).toBe('let')
        if (body.form === 'let') {
          expect(body.name).toBe('result')
          expect(body.val.form).toBe('op2') // call mul → Op2
          // The let body resolves 'result' to the let-bound var
          const letBody = body.bod({ form: 'var', name: 'result', idx: 1 })
          expect(letBody.form).toBe('var')
          if (letBody.form === 'var') expect(letBody.name).toBe('result')
        }
      }
    })
  })

  describe('form', () => {
    it('desugars simple enum form to ADT', () => {
      const form: SurfForm = {
        form: 'form', name: 'bool', head: [], link: [], bond: [], task: [], wear: [],
        case: [
          { form: 'case-arm', name: 'true', link: [], site },
          { form: 'case-arm', name: 'false', link: [], site },
        ],
        site,
      }
      const card: SurfCard = { file: 'test.tree', list: [form] }
      const { book } = desugarCard({ card })
      const term = book.get('bool')

      expect(term).toBeDefined()
      expect(term!.form).toBe('adt')
      if (term!.form === 'adt') {
        expect(term!.ctrs).toHaveLength(2)
        expect(term!.ctrs[0]!.name).toBe('true')
        expect(term!.ctrs[1]!.name).toBe('false')
        expect(term!.ctrs[0]!.tele.form).toBe('ret')
        expect(term!.ctrs[1]!.tele.form).toBe('ret')
      }
    })

    it('desugars form with fields to ADT with telescopes', () => {
      const form: SurfForm = {
        form: 'form', name: 'pair', head: [], link: [], bond: [], task: [], wear: [],
        case: [
          { form: 'case-arm', name: 'pair', link: [
            { form: 'link', name: 'fst', like: { form: 'type-name', name: 'u64' }, site },
            { form: 'link', name: 'snd', like: { form: 'type-name', name: 'u64' }, site },
          ], site },
        ],
        site,
      }
      const card: SurfCard = { file: 'test.tree', list: [form] }
      const { book } = desugarCard({ card })
      const term = book.get('pair')

      expect(term).toBeDefined()
      if (term!.form === 'adt') {
        expect(term!.ctrs).toHaveLength(1)
        const ctr = term!.ctrs[0]!
        expect(ctr.name).toBe('pair')
        expect(ctr.tele.form).toBe('ext')
        if (ctr.tele.form === 'ext') {
          expect(ctr.tele.name).toBe('fst')
          expect(ctr.tele.typ.form).toBe('int')
          const inner = ctr.tele.bod({ form: 'var', name: 'fst', idx: 0 })
          expect(inner.form).toBe('ext')
          if (inner.form === 'ext') {
            expect(inner.name).toBe('snd')
            expect(inner.typ.form).toBe('int')
            const ret = inner.bod({ form: 'var', name: 'snd', idx: 1 })
            expect(ret.form).toBe('ret')
          }
        }
      }
    })

    it('desugars form nat with recursive constructor', () => {
      const form: SurfForm = {
        form: 'form', name: 'nat', head: [], link: [], bond: [], task: [], wear: [],
        case: [
          { form: 'case-arm', name: 'zero', link: [], site },
          { form: 'case-arm', name: 'succ', link: [
            { form: 'link', name: 'pred', like: { form: 'type-name', name: 'nat' }, site },
          ], site },
        ],
        site,
      }
      const card: SurfCard = { file: 'test.tree', list: [form] }
      const { book } = desugarCard({ card })
      const term = book.get('nat')

      expect(term).toBeDefined()
      if (term!.form === 'adt') {
        expect(term!.ctrs).toHaveLength(2)
        expect(term!.ctrs[0]!.name).toBe('zero')
        expect(term!.ctrs[1]!.name).toBe('succ')
        // succ has a tele with pred: nat
        const succTele = term!.ctrs[1]!.tele
        expect(succTele.form).toBe('ext')
        if (succTele.form === 'ext') {
          expect(succTele.name).toBe('pred')
          expect(succTele.typ.form).toBe('ref')
          if (succTele.typ.form === 'ref') expect(succTele.typ.name).toBe('nat')
        }
      }
    })
  })

  describe('card', () => {
    it('desugars a card with multiple definitions', () => {
      const card: SurfCard = {
        file: 'test.tree',
        list: [
          {
            form: 'form', name: 'bool', head: [], link: [], bond: [], task: [], wear: [],
            case: [
              { form: 'case-arm', name: 'true', link: [], site },
              { form: 'case-arm', name: 'false', link: [], site },
            ],
            site,
          } as SurfForm,
          {
            form: 'task', name: 'not', head: [],
            base: [{ form: 'base', name: 'b', like: { form: 'type-name', name: 'bool' }, site }],
            flow: [
              {
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
              } as SurfFork,
            ],
            task: [], site,
          } as SurfTask,
        ],
      }
      const { book } = desugarCard({ card })
      expect(book.size).toBe(2)
      expect(book.has('bool')).toBe(true)
      expect(book.has('not')).toBe(true)

      // bool should be an ADT
      const boolDef = book.get('bool')!
      expect(boolDef.form).toBe('adt')

      // not should be Ann(Lam, All) with a fork in the body
      const notDef = book.get('not')!
      expect(notDef.form).toBe('ann')
      if (notDef.form === 'ann') {
        expect(notDef.val.form).toBe('lam')
        if (notDef.val.form === 'lam') {
          const body = notDef.val.bod({ form: 'var', name: 'b', idx: 0 })
          // Body should be App(Mat [...], Var "b")
          expect(body.form).toBe('app')
          if (body.form === 'app') {
            expect(body.func.form).toBe('mat')
            expect(body.argm.form).toBe('var')
          }
        }
      }
    })
  })

  describe('end-to-end: desugar + reduce', () => {
    it('desugared identity function reduces correctly', () => {
      const task: SurfTask = {
        form: 'task', name: 'id', head: [],
        base: [{ form: 'base', name: 'x', like: { form: 'type-name', name: 'u64' }, site }],
        flow: [
          { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
        ],
        task: [], site,
      }
      const card: SurfCard = { file: 'test.tree', list: [task] }
      const { book } = desugarCard({ card })
      const fill: Fill = new Map()

      // Get the value part (strip Ann)
      const def = book.get('id')!
      const val = def.form === 'ann' ? def.val : def

      // Apply the identity to 42 and reduce
      const app: Term = { form: 'app', func: val, argm: { form: 'num', val: 42 } }
      const result = reduce({ book, fill, lv: 2, term: app })

      expect(result.form).toBe('num')
      if (result.form === 'num') expect(result.val).toBe(42)
    })

    it('desugared constant function reduces correctly', () => {
      const task: SurfTask = {
        form: 'task', name: 'five', head: [],
        base: [],
        flow: [
          { form: 'back', sift: { form: 'sift-mark', val: 5, site }, site },
        ],
        task: [], site,
      }
      const card: SurfCard = { file: 'test.tree', list: [task] }
      const { book } = desugarCard({ card })
      const fill: Fill = new Map()

      const def = book.get('five')!
      const val = def.form === 'ann' ? def.val : def
      const result = reduce({ book, fill, lv: 2, term: val })

      expect(result.form).toBe('num')
      if (result.form === 'num') expect(result.val).toBe(5)
    })

    it('desugared task with save reduces through let', () => {
      const task: SurfTask = {
        form: 'task', name: 'ten', head: [],
        base: [],
        flow: [
          { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 10, site }, site },
          { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
        ],
        task: [], site,
      }
      const card: SurfCard = { file: 'test.tree', list: [task] }
      const { book } = desugarCard({ card })
      const fill: Fill = new Map()

      const def = book.get('ten')!
      const val = def.form === 'ann' ? def.val : def
      const result = reduce({ book, fill, lv: 2, term: val })

      expect(result.form).toBe('num')
      if (result.form === 'num') expect(result.val).toBe(10)
    })
  })

  describe('fold form → self-type encoding', () => {
    it('fold form produces self-type encoding (Ann Slf)', () => {
      const natForm: SurfForm = {
        form: 'form',
        name: 'nat',
        head: [],
        link: [],
        case: [
          { form: 'case-arm', name: 'zero', link: [], site },
          { form: 'case-arm', name: 'succ', link: [
            { form: 'link', name: 'pred', like: { form: 'type-name', name: 'nat' }, site },
          ], site },
        ],
        bond: [],
        task: [],
        wear: [],
        fold: true,
        site,
      }

      const card: SurfCard = { file: 'test.tree', list: [natForm] }
      const { book, foldSet } = desugarCard({ card })

      // Form name in fold set
      expect(foldSet.has('nat')).toBe(true)

      // Type definition is self-type (Ann with Slf val)
      const natDef = book.get('nat')
      expect(natDef).toBeDefined()
      expect(natDef!.form).toBe('ann')
      if (natDef!.form === 'ann') {
        expect(natDef!.val.form).toBe('slf')
        expect(natDef!.typ.form).toBe('set')
      }

      // Constructors are registered
      const zeroDef = book.get('zero')
      expect(zeroDef).toBeDefined()
      expect(zeroDef!.form).toBe('ann')

      const succDef = book.get('succ')
      expect(succDef).toBeDefined()
      expect(succDef!.form).toBe('ann')
    })

    it('fold form constructors type-check', () => {
      const natForm: SurfForm = {
        form: 'form',
        name: 'nat',
        head: [],
        link: [],
        case: [
          { form: 'case-arm', name: 'zero', link: [], site },
          { form: 'case-arm', name: 'succ', link: [
            { form: 'link', name: 'pred', like: { form: 'type-name', name: 'nat' }, site },
          ], site },
        ],
        bond: [],
        task: [],
        wear: [],
        fold: true,
        site,
      }

      const card: SurfCard = { file: 'test.tree', list: [natForm] }
      const { book } = desugarCard({ card })

      // Type-check zero
      const zeroResult = check({ term: { form: 'ref', name: 'zero' }, book })
      expect(zeroResult).not.toBeNull()

      // Type-check succ
      const succResult = check({ term: { form: 'ref', name: 'succ' }, book })
      expect(succResult).not.toBeNull()
    })

    it('non-fold form produces ADT encoding', () => {
      const boolForm: SurfForm = {
        form: 'form',
        name: 'bool',
        head: [],
        link: [],
        case: [
          { form: 'case-arm', name: 'true', link: [], site },
          { form: 'case-arm', name: 'false', link: [], site },
        ],
        bond: [],
        task: [],
        wear: [],
        site,
      }

      const card: SurfCard = { file: 'test.tree', list: [boolForm] }
      const { book } = desugarCard({ card })

      const boolDef = book.get('bool')
      expect(boolDef).toBeDefined()
      expect(boolDef!.form).toBe('adt')
    })
  })
})
