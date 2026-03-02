/**
 * WHNF reduction for Core Terms.
 *
 * Modeled after Kind's Reduce.hs. Reduces a term to weak head normal
 * form (WHNF) by applying beta reduction, match reduction, reference
 * unfolding, metavar substitution, and numeric operations.
 *
 * Also provides full normalization (normal) and re-binding of quoted
 * terms back to HOAS (bind).
 */

import type { Term, Oper, Book, Fill } from '@/term/form'

/**
 * Reduce a term to WHNF.
 *
 * lv controls reference unfolding:
 *   0 = don't unfold refs
 *   1 = unfold refs once
 *   2 = unfold refs deeply
 */
export function reduce(input: {
  book: Book
  fill: Fill
  lv: number
  term: Term
}): Term {
  const { book, fill, lv } = input
  const term = input.term

  switch (term.form) {
    case 'app': {
      const func = reduce({ book, fill, lv, term: term.func })
      switch (func.form) {
        // Beta reduction: (lam x. body) arg → body[x := arg]
        case 'lam':
          return reduce({ book, fill, lv, term: func.bod(term.argm) })
        // Match application: (mat arms) (con name args) → arm(args)
        case 'mat': {
          const argm = reduce({ book, fill, lv, term: term.argm })
          if (argm.form === 'con') {
            for (const [name, bod] of func.arms) {
              if (name === argm.name) {
                let result: Term = bod
                for (const [, arg] of argm.args) {
                  result = reduce({
                    book,
                    fill,
                    lv,
                    term: { form: 'app', func: result, argm: arg },
                  })
                }
                return result
              }
            }
          }
          return { form: 'app', func, argm: term.argm }
        }
        // Switch application: (swi zero succ) num → zero or succ(num-1)
        case 'swi': {
          const argm = reduce({ book, fill, lv, term: term.argm })
          if (argm.form === 'num') {
            if (argm.val === 0) {
              return reduce({ book, fill, lv, term: func.zero })
            }
            return reduce({
              book,
              fill,
              lv,
              term: {
                form: 'app',
                func: func.succ,
                argm: { form: 'num', val: argm.val - 1 },
              },
            })
          }
          return { form: 'app', func, argm: term.argm }
        }
        default:
          return { form: 'app', func, argm: term.argm }
      }
    }

    case 'ann':
      return reduce({ book, fill, lv, term: term.val })

    case 'ins':
      return reduce({ book, fill, lv, term: term.val })

    case 'let':
      return reduce({ book, fill, lv, term: term.bod(term.val) })

    case 'use':
      return reduce({ book, fill, lv, term: term.bod(term.val) })

    case 'ref': {
      if (lv === 0) return term
      const def = book.get(term.name)
      if (def) return reduce({ book, fill, lv: lv - 1, term: def })
      return term
    }

    case 'met': {
      const solution = fill.get(term.uid)
      if (solution) {
        // Apply the context to the solution
        let result = solution
        for (const arg of term.ctx) {
          result = reduce({
            book,
            fill,
            lv,
            term: { form: 'app', func: result, argm: arg },
          })
        }
        return result
      }
      return term
    }

    case 'src':
      return reduce({ book, fill, lv, term: term.val })

    case 'log':
      return reduce({ book, fill, lv, term: term.val })

    case 'op2': {
      const a = reduce({ book, fill, lv, term: term.a })
      const b = reduce({ book, fill, lv, term: term.b })
      if (a.form === 'num' && b.form === 'num') {
        return {
          form: 'num',
          val: applyOp({ oper: term.oper, a: a.val, b: b.val }),
        }
      }
      if (a.form === 'flt' && b.form === 'flt') {
        return {
          form: 'flt',
          val: applyOpF({ oper: term.oper, a: a.val, b: b.val }),
        }
      }
      return { form: 'op2', oper: term.oper, a, b }
    }

    case 'txt': {
      if (term.val.length === 0) {
        return { form: 'con', name: 'Nil', args: [] }
      }
      const head = term.val.charCodeAt(0)
      const tail = term.val.slice(1)
      return reduce({
        book,
        fill,
        lv,
        term: {
          form: 'con',
          name: 'Cons',
          args: [
            [null, { form: 'num', val: head }],
            [null, { form: 'txt', val: tail }],
          ],
        },
      })
    }

    case 'lst': {
      if (term.list.length === 0) {
        return { form: 'con', name: 'Nil', args: [] }
      }
      const [head, ...tail] = term.list
      return reduce({
        book,
        fill,
        lv,
        term: {
          form: 'con',
          name: 'Cons',
          args: [
            [null, head!],
            [null, { form: 'lst', list: tail }],
          ],
        },
      })
    }

    case 'nat': {
      if (term.val === 0) {
        return { form: 'con', name: 'Zero', args: [] }
      }
      return reduce({
        book,
        fill,
        lv,
        term: {
          form: 'con',
          name: 'Succ',
          args: [[null, { form: 'nat', val: term.val - 1 }]],
        },
      })
    }

    default:
      return term
  }
}

/** Fully normalize a term (reduce under binders). */
export function normal(input: {
  book: Book
  fill: Fill
  lv: number
  dep: number
  term: Term
}): Term {
  const { book, fill, lv, dep } = input
  const term = reduce({ book, fill, lv, term: input.term })

  switch (term.form) {
    case 'all': {
      const inp = normal({ book, fill, lv, dep, term: term.inp })
      const bod = (x: Term) =>
        normal({ book, fill, lv, dep: dep + 1, term: term.bod(x) })
      const bodVal = bod({ form: 'var', name: term.name, idx: dep })
      return { form: 'all', name: term.name, inp, bod: () => bodVal }
    }
    case 'lam': {
      const bodVal = normal({
        book,
        fill,
        lv,
        dep: dep + 1,
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
      })
      return { form: 'lam', name: term.name, bod: () => bodVal }
    }
    case 'app': {
      const func = normal({ book, fill, lv, dep, term: term.func })
      const argm = normal({ book, fill, lv, dep, term: term.argm })
      return { form: 'app', func, argm }
    }
    case 'ann':
      return normal({ book, fill, lv, dep, term: term.val })
    case 'slf': {
      const typ = normal({ book, fill, lv, dep, term: term.typ })
      const bodVal = normal({
        book,
        fill,
        lv,
        dep: dep + 1,
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
      })
      return { form: 'slf', name: term.name, typ, bod: () => bodVal }
    }
    case 'ins':
      return normal({ book, fill, lv, dep, term: term.val })
    case 'con': {
      const args = term.args.map(
        ([field, t]): [string | null, Term] => [
          field,
          normal({ book, fill, lv, dep, term: t }),
        ],
      )
      return { form: 'con', name: term.name, args }
    }
    case 'mat': {
      const arms = term.arms.map(([name, bod]): [string, Term] => [
        name,
        normal({ book, fill, lv, dep, term: bod }),
      ])
      return { form: 'mat', arms }
    }
    case 'let': {
      const val = normal({ book, fill, lv, dep, term: term.val })
      const bodVal = normal({
        book,
        fill,
        lv,
        dep: dep + 1,
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
      })
      return { form: 'let', name: term.name, val, bod: () => bodVal }
    }
    case 'use': {
      const val = normal({ book, fill, lv, dep, term: term.val })
      const bodVal = normal({
        book,
        fill,
        lv,
        dep: dep + 1,
        term: term.bod({ form: 'var', name: term.name, idx: dep }),
      })
      return { form: 'use', name: term.name, val, bod: () => bodVal }
    }
    case 'op2': {
      const a = normal({ book, fill, lv, dep, term: term.a })
      const b = normal({ book, fill, lv, dep, term: term.b })
      return { form: 'op2', oper: term.oper, a, b }
    }
    case 'swi': {
      const zero = normal({ book, fill, lv, dep, term: term.zero })
      const succ = normal({ book, fill, lv, dep, term: term.succ })
      return { form: 'swi', zero, succ }
    }
    case 'lst': {
      const list = term.list.map(t =>
        normal({ book, fill, lv, dep, term: t }),
      )
      return { form: 'lst', list }
    }
    case 'src':
      return normal({ book, fill, lv, dep, term: term.val })
    case 'log': {
      const msg = normal({ book, fill, lv, dep, term: term.msg })
      const val = normal({ book, fill, lv, dep, term: term.val })
      return { form: 'log', msg, val }
    }
    default:
      return term
  }
}

/** Apply a u64 binary operation. */
function applyOp(input: { oper: Oper; a: number; b: number }): number {
  const { oper, a, b } = input
  switch (oper) {
    case 'add':
      return (a + b) >>> 0
    case 'sub':
      return (a - b) >>> 0
    case 'mul':
      return Math.imul(a, b) >>> 0
    case 'div':
      return b === 0 ? 0 : (a / b) >>> 0
    case 'mod':
      return b === 0 ? 0 : a % b
    case 'eq':
      return a === b ? 1 : 0
    case 'ne':
      return a !== b ? 1 : 0
    case 'lt':
      return a < b ? 1 : 0
    case 'gt':
      return a > b ? 1 : 0
    case 'lte':
      return a <= b ? 1 : 0
    case 'gte':
      return a >= b ? 1 : 0
    case 'and':
      return (a & b) >>> 0
    case 'or':
      return (a | b) >>> 0
    case 'xor':
      return (a ^ b) >>> 0
    case 'lsh':
      return (a << b) >>> 0
    case 'rsh':
      return (a >>> b) >>> 0
  }
}

/** Apply an f64 binary operation. */
function applyOpF(input: { oper: Oper; a: number; b: number }): number {
  const { oper, a, b } = input
  switch (oper) {
    case 'add':
      return a + b
    case 'sub':
      return a - b
    case 'mul':
      return a * b
    case 'div':
      return b === 0 ? 0 : a / b
    case 'mod':
      return b === 0 ? 0 : a % b
    case 'eq':
      return a === b ? 1 : 0
    case 'ne':
      return a !== b ? 1 : 0
    case 'lt':
      return a < b ? 1 : 0
    case 'gt':
      return a > b ? 1 : 0
    case 'lte':
      return a <= b ? 1 : 0
    case 'gte':
      return a >= b ? 1 : 0
    case 'and':
      return a & b
    case 'or':
      return a | b
    case 'xor':
      return a ^ b
    case 'lsh':
      return a << b
    case 'rsh':
      return a >> b
  }
}
