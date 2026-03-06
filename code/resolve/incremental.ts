/**
 * Incremental resolution: tracks file changes and minimizes
 * recompilation by diffing skeletons and propagating invalidation
 * through a reverse dependency map.
 */

import { extractSkele, type FileSkele, type NameSkele } from './skeleton'
import { initResolver, resolveTemplates, type ResolverState } from './index'
import type { Book, Term } from '@/term/form'
import type { FirmSet } from '@/term/desugar'

export type IncrementalState = {
  resolver: ResolverState
  fileHashes: Map<string, string>
  reverseDeps: Map<string, Set<string>>
  cachedBooks: Map<string, Map<string, Term>>
  book: Book
  firmSet: FirmSet
}

export function createIncrementalState(input: {
  resolver: ResolverState
}): IncrementalState {
  return {
    resolver: input.resolver,
    fileHashes: new Map(),
    reverseDeps: new Map(),
    cachedBooks: new Map(),
    book: new Map(),
    firmSet: new Set(),
  }
}

/**
 * Build a reverse dependency map from the book.
 * Maps each referenced name to the set of files that reference it.
 */
export function buildReverseDeps(input: {
  book: Book
  fileMap: Map<string, string[]>
}): Map<string, Set<string>> {
  const { book, fileMap } = input
  const reverseDeps = new Map<string, Set<string>>()

  for (const [file, names] of fileMap) {
    for (const name of names) {
      const term = book.get(name)
      if (!term) continue
      const refs = collectRefs({ term })
      for (const ref of refs) {
        let set = reverseDeps.get(ref)
        if (!set) {
          set = new Set()
          reverseDeps.set(ref, set)
        }
        set.add(file)
      }
    }
  }

  return reverseDeps
}

/**
 * Collect all name references from a Term tree.
 * Walks the Term structure and extracts names from Ref nodes.
 */
function collectRefs(input: { term: Term }): Set<string> {
  const refs = new Set<string>()
  walkTerm(input.term, refs)
  return refs
}

function walkTerm(term: Term, refs: Set<string>): void {
  switch (term.form) {
    case 'ref':
      refs.add(term.name)
      break
    case 'all':
      walkTerm(term.inp, refs)
      walkTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), refs)
      break
    case 'lam':
      walkTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), refs)
      break
    case 'app':
      walkTerm(term.func, refs)
      walkTerm(term.argm, refs)
      break
    case 'ann':
      walkTerm(term.val, refs)
      walkTerm(term.typ, refs)
      break
    case 'slf':
      walkTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), refs)
      break
    case 'ins':
      walkTerm(term.val, refs)
      break
    case 'let':
      walkTerm(term.val, refs)
      walkTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), refs)
      break
    case 'swi':
      walkTerm(term.val, refs)
      walkTerm(term.zero, refs)
      walkTerm(term.succ({ form: 'var', name: 'n-1', idx: 0 }), refs)
      break
    case 'mat':
      walkTerm(term.val, refs)
      for (const [, bod] of term.arms) {
        walkTerm(bod({ form: 'var', name: 'x', idx: 0 }), refs)
      }
      break
    case 'op2':
      walkTerm(term.left, refs)
      walkTerm(term.right, refs)
      break
    case 'ite':
      walkTerm(term.cond, refs)
      walkTerm(term.thenB, refs)
      walkTerm(term.elseB, refs)
      break
    // Leaf nodes: var, num, str, set, hol, met, u64, f64
    default:
      break
  }
}

/**
 * Compute which files are dirty given a set of changed names.
 * Uses the reverse dependency map to find transitively affected files.
 */
export function computeDirtyFiles(input: {
  changedNames: Set<string>
  reverseDeps: Map<string, Set<string>>
}): Set<string> {
  const { changedNames, reverseDeps } = input
  const dirty = new Set<string>()

  for (const name of changedNames) {
    const deps = reverseDeps.get(name)
    if (deps) {
      for (const file of deps) {
        dirty.add(file)
      }
    }
  }

  return dirty
}
