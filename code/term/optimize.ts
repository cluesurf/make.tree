/**
 * Optimization passes for the Term IR.
 *
 * Runs after type-check, before codegen. Each pass is a pure
 * function (Book) -> Book. The top-level optimizeBook chains them.
 *
 * Pass order:
 *   1. Beta reduction (known applications)
 *   2. Constant folding (compile-time arithmetic)
 *   3. Dead let elimination (unused bindings)
 *   4. Inlining (small non-recursive defs)
 *   5. Repeat 1-3 (catch opportunities from inlining)
 *   6. Tree shaking (remove unreachable defs)
 */

import type { Term, Book, Oper, Tele } from '@/term/form'

/**
 * Run all optimization passes on a Book.
 * Returns a new Book with optimized definitions.
 */
export function optimizeBook(input: { book: Book; entries?: string[] }): Book {
  let book = input.book

  // Round 1: beta reduce, constant fold, dead let elim
  book = mapBook({ book, fn: betaReduce })
  book = mapBook({ book, fn: foldConstants })
  book = mapBook({ book, fn: eliminateDeadLets })

  // Round 2: inlining opens new opportunities
  book = inlineSmall({ book })
  book = mapBook({ book, fn: betaReduce })
  book = mapBook({ book, fn: foldConstants })
  book = mapBook({ book, fn: eliminateDeadLets })

  // Tree shake last (after inlining may have made defs unreachable)
  if (input.entries && input.entries.length > 0) {
    book = treeShake({ book, entries: input.entries })
  }

  return book
}

// ---- Generic term mapper ----

type TermTransform = (input: { term: Term; depth: number }) => Term

/**
 * Apply a transform to every definition in a Book.
 */
function mapBook(input: { book: Book; fn: TermTransform }): Book {
  const { book, fn } = input
  const result: Book = new Map()
  for (const [name, term] of book) {
    result.set(name, fn({ term, depth: 0 }))
  }
  return result
}

/**
 * Walk a term tree, applying a bottom-up transform at each node.
 * Handles all 26 term forms with correct HOAS depth tracking.
 */
function mapTerm(input: {
  term: Term
  depth: number
  fn: (input: { term: Term; depth: number }) => Term
}): Term {
  const { term, depth, fn } = input

  function go(term: Term, depth: number): Term {
    const mapped = mapChildren({ term, depth })
    return fn({ term: mapped, depth })
  }

  function mapChildren(input: { term: Term; depth: number }): Term {
    const { term, depth } = input
    switch (term.form) {
      case 'lam': {
        const v: Term = { form: 'var', name: term.name, idx: depth }
        const newBod = go(term.bod(v), depth + 1)
        return { form: 'lam', name: term.name, bod: () => newBod }
      }
      case 'all': {
        const newInp = go(term.inp, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        const newBod = go(term.bod(v), depth + 1)
        return { form: 'all', name: term.name, inp: newInp, bod: () => newBod }
      }
      case 'let': {
        const newVal = go(term.val, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        const newBod = go(term.bod(v), depth + 1)
        return { form: 'let', name: term.name, val: newVal, bod: () => newBod }
      }
      case 'use': {
        const newVal = go(term.val, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        const newBod = go(term.bod(v), depth + 1)
        return { form: 'use', name: term.name, val: newVal, bod: () => newBod }
      }
      case 'slf': {
        const newTyp = go(term.typ, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        const newBod = go(term.bod(v), depth + 1)
        return { form: 'slf', name: term.name, typ: newTyp, bod: () => newBod }
      }
      case 'app':
        return { form: 'app', func: go(term.func, depth), argm: go(term.argm, depth) }
      case 'ann':
        return { form: 'ann', done: term.done, val: go(term.val, depth), typ: go(term.typ, depth) }
      case 'ins':
        return { form: 'ins', val: go(term.val, depth) }
      case 'op2':
        return { form: 'op2', oper: term.oper, a: go(term.a, depth), b: go(term.b, depth) }
      case 'con':
        return { form: 'con', name: term.name, args: term.args.map(([n, t]) => [n, go(t, depth)] as [string | null, Term]) }
      case 'mat':
        return { form: 'mat', arms: term.arms.map(([n, t]) => [n, go(t, depth)] as [string, Term]) }
      case 'swi':
        return { form: 'swi', zero: go(term.zero, depth), succ: go(term.succ, depth) }
      case 'log':
        return { form: 'log', msg: go(term.msg, depth), val: go(term.val, depth) }
      case 'hlt':
        return { form: 'hlt', msg: go(term.msg, depth), term: term.term }
      case 'rst':
        return { form: 'rst', val: go(term.val, depth) }
      case 'src':
        return { form: 'src', site: term.site, val: go(term.val, depth) }
      case 'lst':
        return { form: 'lst', list: term.list.map(t => go(t, depth)) }
      case 'adt':
        return {
          form: 'adt',
          indx: term.indx.map(t => go(t, depth)),
          type: go(term.type, depth),
          ctrs: term.ctrs.map(c => ({ name: c.name, tele: mapTele(c.tele, depth) })),
        }
      case 'hol':
        return { form: 'hol', name: term.name, ctx: term.ctx.map(t => go(t, depth)) }
      case 'met':
        return { form: 'met', uid: term.uid, ctx: term.ctx.map(t => go(t, depth)) }
      // Leaves: no children
      case 'ref':
      case 'var':
      case 'num':
      case 'txt':
      case 'nat':
      case 'set':
      case 'int':
      case 'flt':
      case 'nxt':
        return term
    }
  }

  function mapTele(tele: Tele, depth: number): Tele {
    if (tele.form === 'ret') {
      return { form: 'ret', term: go(tele.term, depth) }
    }
    const newTyp = go(tele.typ, depth)
    const v: Term = { form: 'var', name: tele.name, idx: depth }
    const newBod = mapTele(tele.bod(v), depth + 1)
    return { form: 'ext', name: tele.name, typ: newTyp, bod: () => newBod }
  }

  return go(term, depth)
}

// ---- Pass 1: Constant Folding ----

/** Apply a u64 binary operation at compile time. */
function applyOp(input: { oper: Oper; a: number; b: number }): number {
  const { oper, a, b } = input
  switch (oper) {
    case 'add': return (a + b) >>> 0
    case 'sub': return (a - b) >>> 0
    case 'mul': return Math.imul(a, b) >>> 0
    case 'div': return b === 0 ? 0 : (a / b) >>> 0
    case 'mod': return b === 0 ? 0 : a % b
    case 'eq':  return a === b ? 1 : 0
    case 'ne':  return a !== b ? 1 : 0
    case 'lt':  return a < b ? 1 : 0
    case 'gt':  return a > b ? 1 : 0
    case 'lte': return a <= b ? 1 : 0
    case 'gte': return a >= b ? 1 : 0
    case 'and': return (a & b) >>> 0
    case 'or':  return (a | b) >>> 0
    case 'xor': return (a ^ b) >>> 0
    case 'lsh': return (a << b) >>> 0
    case 'rsh': return (a >>> b) >>> 0
  }
}

/**
 * Constant folding: evaluate compile-time-known arithmetic.
 *
 * - Op2(oper, Num(a), Num(b)) -> Num(applyOp(oper, a, b))
 * - Op2(add, x, Num(0)) -> x   (identity)
 * - Op2(add, Num(0), x) -> x
 * - Op2(mul, x, Num(1)) -> x   (identity)
 * - Op2(mul, Num(1), x) -> x
 * - Op2(mul, _, Num(0)) -> Num(0) (annihilator)
 * - Op2(mul, Num(0), _) -> Num(0)
 * - Op2(sub, x, Num(0)) -> x   (identity)
 */
function foldConstants(input: { term: Term; depth: number }): Term {
  return mapTerm({
    term: input.term,
    depth: input.depth,
    fn: ({ term }) => {
      if (term.form !== 'op2') return term

      const { oper, a, b } = term

      // Both operands known: full evaluation
      if (a.form === 'num' && b.form === 'num') {
        return { form: 'num', val: applyOp({ oper, a: a.val, b: b.val }) }
      }

      // Identity and annihilator rules
      if (oper === 'add') {
        if (b.form === 'num' && b.val === 0) return a
        if (a.form === 'num' && a.val === 0) return b
      }
      if (oper === 'sub') {
        if (b.form === 'num' && b.val === 0) return a
      }
      if (oper === 'mul') {
        if (b.form === 'num' && b.val === 1) return a
        if (a.form === 'num' && a.val === 1) return b
        if (b.form === 'num' && b.val === 0) return { form: 'num', val: 0 }
        if (a.form === 'num' && a.val === 0) return { form: 'num', val: 0 }
      }

      return term
    },
  })
}

// ---- Pass 2: Beta Reduction ----

/**
 * Beta reduction: reduce known applications.
 *
 * App(Lam(name, body), arg) -> body(arg) when arg is "small"
 * (literal, ref, or variable). Avoids code size explosion from
 * duplicating large arguments.
 *
 * Must check the app-lam pattern BEFORE descending into children,
 * because mapTerm opens HOAS closures with dummy vars, destroying
 * the original closure. So we do a top-down recursive walk here.
 */
function betaReduce(input: { term: Term; depth: number }): Term {
  const { term, depth } = input

  // Check for beta redex at the top level first (before opening HOAS)
  if (term.form === 'app' && term.func.form === 'lam' && isSmall(term.argm)) {
    const reduced = term.func.bod(betaReduce({ term: term.argm, depth }))
    return betaReduce({ term: reduced, depth })
  }

  // Otherwise, walk children normally
  return mapTerm({
    term,
    depth,
    fn: ({ term, depth: d }) => {
      if (term.form === 'app' && term.func.form === 'lam' && isSmall(term.argm)) {
        const reduced = term.func.bod(term.argm)
        return betaReduce({ term: reduced, depth: d })
      }
      return term
    },
  })
}

/** Check if a term is small enough to inline as a beta argument. */
function isSmall(term: Term): boolean {
  switch (term.form) {
    case 'num':
    case 'txt':
    case 'ref':
    case 'var':
    case 'set':
    case 'int':
    case 'flt':
      return true
    case 'ann':
      return isSmall(term.val)
    case 'src':
      return isSmall(term.val)
    default:
      return false
  }
}

// ---- Pass 3: Dead Let Elimination ----

/**
 * Eliminate unused let bindings.
 *
 * Let(x, val, body) -> body when x does not appear in body.
 * Preserves bindings whose val contains effects (log, hlt, rst).
 */
function eliminateDeadLets(input: { term: Term; depth: number }): Term {
  return mapTerm({
    term: input.term,
    depth: input.depth,
    fn: ({ term, depth }) => {
      if (term.form !== 'let') return term

      // Instantiate body with a marker var to check usage
      const marker: Term = { form: 'var', name: term.name, idx: depth }
      const body = term.bod(marker)

      if (usesVar({ term: body, name: term.name, idx: depth, depth: depth + 1 })) {
        return term
      }

      // Check if val has effects (must keep for side effects)
      if (hasEffects({ term: term.val })) {
        return term
      }

      // Safe to eliminate: return just the body
      return body
    },
  })
}

/**
 * Check if a variable (by name and de Bruijn index) appears in a term.
 */
function usesVar(input: { term: Term; name: string; idx: number; depth: number }): boolean {
  const { term, name, idx, depth } = input

  switch (term.form) {
    case 'var':
      return term.name === name && term.idx === idx
    case 'ref':
    case 'num':
    case 'txt':
    case 'nat':
    case 'set':
    case 'int':
    case 'flt':
    case 'nxt':
      return false
    case 'lam': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return usesVar({ term: term.bod(v), name, idx, depth: depth + 1 })
    }
    case 'all': {
      if (usesVar({ term: term.inp, name, idx, depth })) return true
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return usesVar({ term: term.bod(v), name, idx, depth: depth + 1 })
    }
    case 'let': {
      if (usesVar({ term: term.val, name, idx, depth })) return true
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return usesVar({ term: term.bod(v), name, idx, depth: depth + 1 })
    }
    case 'use': {
      if (usesVar({ term: term.val, name, idx, depth })) return true
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return usesVar({ term: term.bod(v), name, idx, depth: depth + 1 })
    }
    case 'slf': {
      if (usesVar({ term: term.typ, name, idx, depth })) return true
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return usesVar({ term: term.bod(v), name, idx, depth: depth + 1 })
    }
    case 'app':
      return usesVar({ term: term.func, name, idx, depth }) ||
             usesVar({ term: term.argm, name, idx, depth })
    case 'ann':
      return usesVar({ term: term.val, name, idx, depth }) ||
             usesVar({ term: term.typ, name, idx, depth })
    case 'ins':
      return usesVar({ term: term.val, name, idx, depth })
    case 'op2':
      return usesVar({ term: term.a, name, idx, depth }) ||
             usesVar({ term: term.b, name, idx, depth })
    case 'con':
      return term.args.some(([, t]) => usesVar({ term: t, name, idx, depth }))
    case 'mat':
      return term.arms.some(([, t]) => usesVar({ term: t, name, idx, depth }))
    case 'swi':
      return usesVar({ term: term.zero, name, idx, depth }) ||
             usesVar({ term: term.succ, name, idx, depth })
    case 'log':
      return usesVar({ term: term.msg, name, idx, depth }) ||
             usesVar({ term: term.val, name, idx, depth })
    case 'hlt':
      return usesVar({ term: term.msg, name, idx, depth })
    case 'rst':
      return usesVar({ term: term.val, name, idx, depth })
    case 'src':
      return usesVar({ term: term.val, name, idx, depth })
    case 'lst':
      return term.list.some(t => usesVar({ term: t, name, idx, depth }))
    case 'adt':
      return term.indx.some(t => usesVar({ term: t, name, idx, depth })) ||
             usesVar({ term: term.type, name, idx, depth })
    case 'hol':
      return term.ctx.some(t => usesVar({ term: t, name, idx, depth }))
    case 'met':
      return term.ctx.some(t => usesVar({ term: t, name, idx, depth }))
  }
}

/** Check if a term contains effectful nodes. */
function hasEffects(input: { term: Term }): boolean {
  const { term } = input
  switch (term.form) {
    case 'log':
    case 'hlt':
    case 'rst':
    case 'nxt':
      return true
    case 'app':
      // .wait calls are effectful
      if (term.func.form === 'ref' && term.func.name === '.wait') return true
      return hasEffects({ term: term.func }) || hasEffects({ term: term.argm })
    case 'let':
      return hasEffects({ term: term.val })
    case 'op2':
      return hasEffects({ term: term.a }) || hasEffects({ term: term.b })
    case 'ann':
      return hasEffects({ term: term.val })
    case 'ins':
      return hasEffects({ term: term.val })
    case 'src':
      return hasEffects({ term: term.val })
    case 'con':
      return term.args.some(([, t]) => hasEffects({ term: t }))
    default:
      return false
  }
}

// ---- Pass 4: Inlining ----

/**
 * Inline small non-recursive definitions at call sites.
 *
 * For each Ref(name) in the book, if the referenced definition is
 * under the size threshold and not recursive, replace the Ref with
 * a copy of the definition body.
 */
function inlineSmall(input: { book: Book; threshold?: number }): Book {
  const { book } = input
  const threshold = input.threshold ?? 20

  // Compute sizes and recursion status
  const sizes = new Map<string, number>()
  const recursive = new Set<string>()

  for (const [name, term] of book) {
    sizes.set(name, countNodes({ term, depth: 0 }))
    if (isSelfRecursive({ term, name, depth: 0 })) {
      recursive.add(name)
    }
  }

  // Build set of inlineable names
  const inlineable = new Set<string>()
  for (const [name, size] of sizes) {
    if (size <= threshold && !recursive.has(name)) {
      inlineable.add(name)
    }
  }

  if (inlineable.size === 0) return book

  // Apply inlining
  const result: Book = new Map()
  for (const [name, term] of book) {
    result.set(name, inlineRefs({ term, depth: 0, book, inlineable }))
  }
  return result
}

/** Count AST nodes in a term (for size-based inlining decisions). */
function countNodes(input: { term: Term; depth: number }): number {
  const { term, depth } = input

  switch (term.form) {
    case 'var':
    case 'ref':
    case 'num':
    case 'txt':
    case 'nat':
    case 'set':
    case 'int':
    case 'flt':
    case 'nxt':
      return 1
    case 'lam': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return 1 + countNodes({ term: term.bod(v), depth: depth + 1 })
    }
    case 'all': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return 1 + countNodes({ term: term.inp, depth }) + countNodes({ term: term.bod(v), depth: depth + 1 })
    }
    case 'let': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return 1 + countNodes({ term: term.val, depth }) + countNodes({ term: term.bod(v), depth: depth + 1 })
    }
    case 'use': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return 1 + countNodes({ term: term.val, depth }) + countNodes({ term: term.bod(v), depth: depth + 1 })
    }
    case 'slf': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return 1 + countNodes({ term: term.typ, depth }) + countNodes({ term: term.bod(v), depth: depth + 1 })
    }
    case 'app':
      return 1 + countNodes({ term: term.func, depth }) + countNodes({ term: term.argm, depth })
    case 'ann':
      return 1 + countNodes({ term: term.val, depth }) + countNodes({ term: term.typ, depth })
    case 'ins':
      return 1 + countNodes({ term: term.val, depth })
    case 'op2':
      return 1 + countNodes({ term: term.a, depth }) + countNodes({ term: term.b, depth })
    case 'con':
      return 1 + term.args.reduce((n, [, t]) => n + countNodes({ term: t, depth }), 0)
    case 'mat':
      return 1 + term.arms.reduce((n, [, t]) => n + countNodes({ term: t, depth }), 0)
    case 'swi':
      return 1 + countNodes({ term: term.zero, depth }) + countNodes({ term: term.succ, depth })
    case 'log':
      return 1 + countNodes({ term: term.msg, depth }) + countNodes({ term: term.val, depth })
    case 'hlt':
      return 1 + countNodes({ term: term.msg, depth })
    case 'rst':
      return 1 + countNodes({ term: term.val, depth })
    case 'src':
      return 1 + countNodes({ term: term.val, depth })
    case 'lst':
      return 1 + term.list.reduce((n, t) => n + countNodes({ term: t, depth }), 0)
    case 'adt':
      return 1 + term.indx.reduce((n, t) => n + countNodes({ term: t, depth }), 0) +
             countNodes({ term: term.type, depth })
    case 'hol':
      return 1
    case 'met':
      return 1
  }
}

/** Check if a term references its own definition name. */
function isSelfRecursive(input: { term: Term; name: string; depth: number }): boolean {
  const { term, name, depth } = input
  switch (term.form) {
    case 'ref':
      return term.name === name
    case 'var':
    case 'num':
    case 'txt':
    case 'nat':
    case 'set':
    case 'int':
    case 'flt':
    case 'nxt':
      return false
    case 'lam': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return isSelfRecursive({ term: term.bod(v), name, depth: depth + 1 })
    }
    case 'all': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return isSelfRecursive({ term: term.inp, name, depth }) ||
             isSelfRecursive({ term: term.bod(v), name, depth: depth + 1 })
    }
    case 'let': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return isSelfRecursive({ term: term.val, name, depth }) ||
             isSelfRecursive({ term: term.bod(v), name, depth: depth + 1 })
    }
    case 'use': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return isSelfRecursive({ term: term.val, name, depth }) ||
             isSelfRecursive({ term: term.bod(v), name, depth: depth + 1 })
    }
    case 'slf': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      return isSelfRecursive({ term: term.typ, name, depth }) ||
             isSelfRecursive({ term: term.bod(v), name, depth: depth + 1 })
    }
    case 'app':
      return isSelfRecursive({ term: term.func, name, depth }) ||
             isSelfRecursive({ term: term.argm, name, depth })
    case 'ann':
      return isSelfRecursive({ term: term.val, name, depth }) ||
             isSelfRecursive({ term: term.typ, name, depth })
    case 'ins':
      return isSelfRecursive({ term: term.val, name, depth })
    case 'op2':
      return isSelfRecursive({ term: term.a, name, depth }) ||
             isSelfRecursive({ term: term.b, name, depth })
    case 'con':
      return term.args.some(([, t]) => isSelfRecursive({ term: t, name, depth }))
    case 'mat':
      return term.arms.some(([, t]) => isSelfRecursive({ term: t, name, depth }))
    case 'swi':
      return isSelfRecursive({ term: term.zero, name, depth }) ||
             isSelfRecursive({ term: term.succ, name, depth })
    case 'log':
      return isSelfRecursive({ term: term.msg, name, depth }) ||
             isSelfRecursive({ term: term.val, name, depth })
    case 'hlt':
      return isSelfRecursive({ term: term.msg, name, depth })
    case 'rst':
      return isSelfRecursive({ term: term.val, name, depth })
    case 'src':
      return isSelfRecursive({ term: term.val, name, depth })
    case 'lst':
      return term.list.some(t => isSelfRecursive({ term: t, name, depth }))
    case 'adt':
      return term.indx.some(t => isSelfRecursive({ term: t, name, depth })) ||
             isSelfRecursive({ term: term.type, name, depth })
    case 'hol':
    case 'met':
      return false
  }
}

/** Replace Ref nodes with inlined definition bodies. */
function inlineRefs(input: {
  term: Term
  depth: number
  book: Book
  inlineable: Set<string>
}): Term {
  const { term, depth, book, inlineable } = input

  return mapTerm({
    term,
    depth,
    fn: ({ term }) => {
      if (term.form !== 'ref') return term
      if (!inlineable.has(term.name)) return term
      const def = book.get(term.name)
      if (!def) return term
      return def
    },
  })
}

// ---- Pass 5: Tree Shaking ----

/**
 * Remove definitions that are not reachable from entry points.
 */
function treeShake(input: { book: Book; entries: string[] }): Book {
  const { book, entries } = input
  const reachable = new Set<string>()
  const queue = [...entries]

  while (queue.length > 0) {
    const name = queue.pop()!
    if (reachable.has(name)) continue
    reachable.add(name)
    const term = book.get(name)
    if (term) {
      const refs = collectRefs({ term, depth: 0 })
      for (const ref of refs) {
        if (!reachable.has(ref)) queue.push(ref)
      }
    }
  }

  const result: Book = new Map()
  for (const [name, term] of book) {
    if (reachable.has(name)) result.set(name, term)
  }
  return result
}

/** Collect all Ref names from a term. */
function collectRefs(input: { term: Term; depth: number }): Set<string> {
  const refs = new Set<string>()

  function walk(term: Term, depth: number): void {
    switch (term.form) {
      case 'ref':
        refs.add(term.name)
        break
      case 'lam': {
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'all': {
        walk(term.inp, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'let': {
        walk(term.val, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'use': {
        walk(term.val, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'slf': {
        walk(term.typ, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'app':
        walk(term.func, depth)
        walk(term.argm, depth)
        break
      case 'ann':
        walk(term.val, depth)
        walk(term.typ, depth)
        break
      case 'ins':
        walk(term.val, depth)
        break
      case 'op2':
        walk(term.a, depth)
        walk(term.b, depth)
        break
      case 'con':
        for (const [, t] of term.args) walk(t, depth)
        break
      case 'mat':
        for (const [, t] of term.arms) walk(t, depth)
        break
      case 'swi':
        walk(term.zero, depth)
        walk(term.succ, depth)
        break
      case 'log':
        walk(term.msg, depth)
        walk(term.val, depth)
        break
      case 'hlt':
        walk(term.msg, depth)
        break
      case 'rst':
        walk(term.val, depth)
        break
      case 'src':
        walk(term.val, depth)
        break
      case 'lst':
        for (const t of term.list) walk(t, depth)
        break
      case 'adt':
        for (const t of term.indx) walk(t, depth)
        walk(term.type, depth)
        break
    }
  }

  walk(input.term, input.depth)
  return refs
}

// Exported for testing
export {
  foldConstants,
  betaReduce,
  eliminateDeadLets,
  inlineSmall,
  treeShake,
  countNodes,
  isSelfRecursive,
}
