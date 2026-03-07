/**
 * Purity analysis: classify each definition as pure or effectful.
 *
 * Pure definitions can run on HVM interaction nets.
 * Effectful definitions must run on a native platform runtime.
 *
 * A definition is effectful if it:
 *   - Contains Log, Rst, Hlt, or Nxt terms (side effects / control flow)
 *   - Contains a .wait call (async IO)
 *   - References another effectful definition
 *
 * Propagation uses fixed-point iteration: if A calls B and B is
 * effectful, A becomes effectful too.
 */

import type { Term, Book } from '@/term/form'
import type { AsyncMeta } from '@/term/desugar'

export type Purity = 'pure' | 'effectful'
export type PurityMap = Map<string, Purity>

/**
 * Analyze purity of every definition in a book.
 * Returns a map from definition name to 'pure' or 'effectful'.
 */
export function analyzePurity(input: {
  book: Book
  asyncMeta?: AsyncMeta
}): PurityMap {
  const { book } = input
  const asyncMeta = input.asyncMeta ?? new Map()

  // Phase 1: for each def, collect direct effectful markers and refs.
  const directEffectful = new Set<string>()
  const refs = new Map<string, Set<string>>()

  for (const [name, term] of book) {
    // Async defs are inherently effectful
    if (asyncMeta.get(name) === true) {
      directEffectful.add(name)
    }

    const info = walkTerm({ term, depth: 0 })
    refs.set(name, info.refs)

    if (info.hasEffect) {
      directEffectful.add(name)
    }
  }

  // Phase 2: propagate effectfulness through refs (fixed-point).
  const effectful = new Set(directEffectful)
  let changed = true

  while (changed) {
    changed = false
    for (const [name, depRefs] of refs) {
      if (effectful.has(name)) continue
      for (const ref of depRefs) {
        if (effectful.has(ref)) {
          effectful.add(name)
          changed = true
          break
        }
      }
    }
  }

  // Phase 3: build result map.
  const result: PurityMap = new Map()
  for (const name of book.keys()) {
    result.set(name, effectful.has(name) ? 'effectful' : 'pure')
  }

  return result
}

type WalkResult = {
  refs: Set<string>
  hasEffect: boolean
}

/**
 * Walk a term tree, collecting referenced names and detecting
 * direct effectful nodes.
 *
 * HOAS bodies are instantiated with dummy Var terms to traverse.
 */
function walkTerm(input: { term: Term; depth: number }): WalkResult {
  const refs = new Set<string>()
  let hasEffect = false

  function walk(term: Term, depth: number): void {
    switch (term.form) {
      case 'ref':
        refs.add(term.name)
        break

      case 'log':
      case 'rst':
      case 'hlt':
      case 'nxt':
        hasEffect = true
        break

      case 'app': {
        // Detect .wait calls (async IO marker)
        if (term.func.form === 'ref' && term.func.name === '.wait') {
          hasEffect = true
        }
        walk(term.func, depth)
        walk(term.argm, depth)
        break
      }

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

      case 'ann':
        walk(term.val, depth)
        walk(term.typ, depth)
        break

      case 'ins':
        walk(term.val, depth)
        break

      case 'src':
        walk(term.val, depth)
        break

      case 'op2':
        walk(term.a, depth)
        walk(term.b, depth)
        break

      case 'con':
        for (const [, t] of term.args) {
          walk(t, depth)
        }
        break

      case 'mat':
        for (const [, bod] of term.arms) {
          walk(bod, depth)
        }
        break

      case 'swi':
        walk(term.zero, depth)
        walk(term.succ, depth)
        break

      case 'lst':
        for (const t of term.list) {
          walk(t, depth)
        }
        break

      case 'adt':
        for (const t of term.indx) {
          walk(t, depth)
        }
        walk(term.type, depth)
        for (const ctr of term.ctrs) {
          walkTele(ctr.tele, depth)
        }
        break

      case 'hol':
        for (const t of term.ctx) {
          walk(t, depth)
        }
        break

      case 'met':
        for (const t of term.ctx) {
          walk(t, depth)
        }
        break

      // Leaves: no children to walk
      case 'var':
      case 'num':
      case 'txt':
      case 'nat':
      case 'set':
      case 'int':
      case 'flt':
        break
    }
  }

  function walkTele(tele: import('@/term/form').Tele, depth: number): void {
    if (tele.form === 'ret') {
      walk(tele.term, depth)
    } else {
      walk(tele.typ, depth)
      const v: Term = { form: 'var', name: tele.name, idx: depth }
      walkTele(tele.bod(v), depth + 1)
    }
  }

  walk(input.term, input.depth)
  return { refs, hasEffect }
}
