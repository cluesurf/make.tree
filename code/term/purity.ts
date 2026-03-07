/**
 * Purity analysis: classify each definition as pure, effectful, or boundary.
 *
 * Pure definitions can run on HVM interaction nets.
 * Effectful definitions must run on a native platform runtime.
 * Boundary definitions are effectful but contain pure subtrees
 * worth offloading to HVM for parallel reduction.
 *
 * A definition is effectful if it:
 *   - Contains Log, Rst, Hlt, or Nxt terms (side effects / control flow)
 *   - Contains a .wait call (async IO)
 *   - References a dock-loaded native module (e.g. node:fs)
 *   - References another effectful definition
 *
 * Propagation uses fixed-point iteration: if A calls B and B is
 * effectful, A becomes effectful too.
 */

import type { Term, Book } from '@/term/form'
import type { AsyncMeta } from '@/term/desugar'

export type Purity = 'pure' | 'effectful' | 'boundary'
export type PurityMap = Map<string, Purity>

/**
 * Analyze purity of every definition in a book.
 * Returns a map from definition name to 'pure', 'effectful', or 'boundary'.
 *
 * @param dockNames - Names of dock-loaded native modules (e.g. from `dock load`).
 *   Any ref to these names makes a definition effectful.
 * @param boundaryThreshold - Minimum number of pure call-graph refs
 *   for an effectful function to be classified as 'boundary'. Default 2.
 */
export function analyzePurity(input: {
  book: Book
  asyncMeta?: AsyncMeta
  dockNames?: Set<string>
  boundaryThreshold?: number
}): PurityMap {
  const { book } = input
  const asyncMeta = input.asyncMeta ?? new Map()
  const dockNames = input.dockNames ?? new Set()
  const boundaryThreshold = input.boundaryThreshold ?? 2

  // Phase 1: for each def, collect direct effectful markers and refs.
  const directEffectful = new Set<string>()
  const refs = new Map<string, Set<string>>()

  for (const [name, term] of book) {
    // Async defs are inherently effectful
    if (asyncMeta.get(name) === true) {
      directEffectful.add(name)
    }

    const info = walkTerm({ term, depth: 0, dockNames })
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

  // Phase 3: build result map with boundary detection.
  // A boundary definition is effectful but calls enough pure defs
  // that splitting them to HVM would be worthwhile.
  const result: PurityMap = new Map()
  for (const name of book.keys()) {
    if (!effectful.has(name)) {
      result.set(name, 'pure')
    } else {
      const depRefs = refs.get(name)
      if (depRefs) {
        let pureCallCount = 0
        for (const dep of depRefs) {
          if (book.has(dep) && !effectful.has(dep)) {
            pureCallCount++
          }
        }
        if (pureCallCount >= boundaryThreshold) {
          result.set(name, 'boundary')
        } else {
          result.set(name, 'effectful')
        }
      } else {
        result.set(name, 'effectful')
      }
    }
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
function walkTerm(input: { term: Term; depth: number; dockNames?: Set<string> }): WalkResult {
  const refs = new Set<string>()
  const dockNames = input.dockNames ?? new Set()
  let hasEffect = false

  function walk(term: Term, depth: number): void {
    switch (term.form) {
      case 'ref':
        refs.add(term.name)
        // Refs to dock-loaded native modules are effectful
        if (dockNames.has(term.name)) hasEffect = true
        break

      case 'log':
        hasEffect = true
        walk(term.msg, depth)
        walk(term.val, depth)
        break

      case 'rst':
        hasEffect = true
        walk(term.val, depth)
        break

      case 'hlt':
        hasEffect = true
        walk(term.msg, depth)
        break

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
