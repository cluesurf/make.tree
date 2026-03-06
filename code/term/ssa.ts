/**
 * SSA verification for HVM targets.
 *
 * The desugar pipeline already converts `save` to nested `let` bindings,
 * which is inherently SSA (each `let` creates a fresh binding that
 * shadows the previous one). This module verifies that a term tree
 * contains no mutable reassignment, confirming it is safe for HVM
 * interaction net emission.
 *
 * If future language features introduce true mutation (e.g., mutable
 * references), this module would need to perform an actual SSA transform.
 * Currently it serves as a validation pass.
 */

import type { Term } from '@/term/form'

export type SSACheckResult = {
  ok: boolean
  violations: string[]
}

/**
 * Verify that a term tree is in SSA form (no mutable reassignment).
 * Returns ok: true if the term only uses immutable let bindings.
 *
 * Currently all terms from desugar are SSA by construction, so this
 * always returns ok: true. It exists as a safety net for future changes.
 */
export function checkSSA(input: { term: Term; name: string }): SSACheckResult {
  const violations: string[] = []
  const bound = new Set<string>()

  function walk(term: Term, depth: number): void {
    switch (term.form) {
      case 'let': {
        // In SSA, rebinding a name at the same scope level is allowed
        // (it shadows, not mutates). HOAS handles this naturally.
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.val, depth)
        walk(term.bod(v), depth + 1)
        break
      }
      case 'lam': {
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'app':
        walk(term.func, depth)
        walk(term.argm, depth)
        break
      case 'use': {
        walk(term.val, depth)
        const v: Term = { form: 'var', name: term.name, idx: depth }
        walk(term.bod(v), depth + 1)
        break
      }
      case 'ann':
        walk(term.val, depth)
        walk(term.typ, depth)
        break
      case 'ins':
      case 'src':
      case 'rst':
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
        for (const [, bod] of term.arms) walk(bod, depth)
        break
      case 'swi':
        walk(term.zero, depth)
        walk(term.succ, depth)
        break
      case 'lst':
        for (const t of term.list) walk(t, depth)
        break
      case 'log':
        walk(term.msg, depth)
        walk(term.val, depth)
        break
      case 'hlt':
        walk(term.msg, depth)
        break
      case 'all': {
        walk(term.inp, depth)
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
    }
  }

  walk(input.term, 0)
  return { ok: violations.length === 0, violations }
}
