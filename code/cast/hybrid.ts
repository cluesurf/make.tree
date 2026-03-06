/**
 * Hybrid compilation: split a book by purity, emit HVM for pure defs
 * and native code for effectful defs, with bridge glue between them.
 *
 * Pure definitions run on HVM interaction nets for automatic
 * parallelism. Effectful definitions run on the native platform.
 * Bridge functions handle cross-boundary calls.
 */

import type { Book, Term } from '@/term/form'
import type { AsyncMeta } from '@/term/desugar'
import type { PurityMap } from '@/term/purity'
import { castBook as castHVM } from '@/cast/hvm'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import type { DockLoad } from '@/cast/typescript'

export type NativeTarget = 'typescript' | 'rust' | 'kotlin' | 'swift'

export type HybridResult = {
  hvmCode: string
  nativeCode: string
  bridgeNames: string[]
  pureDefs: string[]
  effectfulDefs: string[]
}

/**
 * Split a book by purity and compile each partition to its target.
 *
 * Pure defs go to HVM. Effectful defs go to the native target.
 * Bridge names are pure defs called from effectful code (need FFI).
 */
export function compileHybrid(input: {
  book: Book
  purityMap: PurityMap
  nativeTarget: NativeTarget
  asyncMeta?: AsyncMeta
  dock?: DockLoad[]
}): HybridResult {
  const { book, purityMap, nativeTarget, dock } = input
  const asyncMeta = input.asyncMeta ?? new Map()

  const pureBook: Book = new Map()
  const effectfulBook: Book = new Map()
  const pureDefs: string[] = []
  const effectfulDefs: string[] = []

  for (const [name, term] of book) {
    if (purityMap.get(name) === 'pure') {
      pureBook.set(name, term)
      pureDefs.push(name)
    } else {
      effectfulBook.set(name, term)
      effectfulDefs.push(name)
    }
  }

  // Find bridge names: pure defs referenced by effectful code.
  const bridgeNames = findBridgeNames({
    effectfulBook,
    pureDefs: new Set(pureDefs),
  })

  // Generate HVM code for pure partition.
  const hvmCode = pureBook.size > 0
    ? castHVM({ book: pureBook })
    : ''

  // Generate native code for effectful partition.
  // Include bridge stubs so effectful code can call pure defs.
  const nativeBookWithBridges = new Map(effectfulBook)
  for (const name of bridgeNames) {
    const term = book.get(name)
    if (term && !nativeBookWithBridges.has(name)) {
      nativeBookWithBridges.set(name, makeBridgeStub({ name }))
    }
  }

  const effectfulAsyncMeta: AsyncMeta = new Map()
  for (const [name, val] of asyncMeta) {
    if (effectfulBook.has(name)) {
      effectfulAsyncMeta.set(name, val)
    }
  }

  const nativeCode = nativeBookWithBridges.size > 0
    ? castNative({
        book: nativeBookWithBridges,
        target: nativeTarget,
        dock,
        asyncMeta: effectfulAsyncMeta,
      })
    : ''

  return { hvmCode, nativeCode, bridgeNames, pureDefs, effectfulDefs }
}

/**
 * Find pure defs that are referenced from effectful code.
 * These need bridge/FFI stubs in the native output.
 */
function findBridgeNames(input: {
  effectfulBook: Book
  pureDefs: Set<string>
}): string[] {
  const { effectfulBook, pureDefs } = input
  const needed = new Set<string>()

  for (const [, term] of effectfulBook) {
    collectRefs({ term, depth: 0, refs: needed })
  }

  return [...needed].filter(name => pureDefs.has(name))
}

function collectRefs(input: { term: Term; depth: number; refs: Set<string> }): void {
  const { term, depth, refs } = input

  switch (term.form) {
    case 'ref':
      refs.add(term.name)
      break
    case 'app':
      collectRefs({ term: term.func, depth, refs })
      collectRefs({ term: term.argm, depth, refs })
      break
    case 'lam': {
      const v: Term = { form: 'var', name: term.name, idx: depth }
      collectRefs({ term: term.bod(v), depth: depth + 1, refs })
      break
    }
    case 'let': {
      collectRefs({ term: term.val, depth, refs })
      const v: Term = { form: 'var', name: term.name, idx: depth }
      collectRefs({ term: term.bod(v), depth: depth + 1, refs })
      break
    }
    case 'use': {
      collectRefs({ term: term.val, depth, refs })
      const v: Term = { form: 'var', name: term.name, idx: depth }
      collectRefs({ term: term.bod(v), depth: depth + 1, refs })
      break
    }
    case 'ann':
      collectRefs({ term: term.val, depth, refs })
      collectRefs({ term: term.typ, depth, refs })
      break
    case 'ins':
    case 'src':
    case 'rst':
      collectRefs({ term: term.val, depth, refs })
      break
    case 'op2':
      collectRefs({ term: term.a, depth, refs })
      collectRefs({ term: term.b, depth, refs })
      break
    case 'con':
      for (const [, t] of term.args) {
        collectRefs({ term: t, depth, refs })
      }
      break
    case 'mat':
      for (const [, bod] of term.arms) {
        collectRefs({ term: bod, depth, refs })
      }
      break
    case 'swi':
      collectRefs({ term: term.zero, depth, refs })
      collectRefs({ term: term.succ, depth, refs })
      break
    case 'lst':
      for (const t of term.list) {
        collectRefs({ term: t, depth, refs })
      }
      break
    case 'log':
      collectRefs({ term: term.msg, depth, refs })
      collectRefs({ term: term.val, depth, refs })
      break
    case 'hlt':
      collectRefs({ term: term.msg, depth, refs })
      break
    case 'all': {
      collectRefs({ term: term.inp, depth, refs })
      const v: Term = { form: 'var', name: term.name, idx: depth }
      collectRefs({ term: term.bod(v), depth: depth + 1, refs })
      break
    }
    case 'slf': {
      collectRefs({ term: term.typ, depth, refs })
      const v: Term = { form: 'var', name: term.name, idx: depth }
      collectRefs({ term: term.bod(v), depth: depth + 1, refs })
      break
    }
  }
}

/**
 * Create a bridge stub term for a pure def.
 * In the native code, this becomes a function that calls into HVM.
 * The actual bridge implementation depends on the runtime.
 */
function makeBridgeStub(input: { name: string }): Term {
  return { form: 'ref', name: `__hvm_bridge_${input.name}` }
}

function castNative(input: {
  book: Book
  target: NativeTarget
  dock?: DockLoad[]
  asyncMeta?: AsyncMeta
}): string {
  const { book, target, dock, asyncMeta } = input
  switch (target) {
    case 'typescript':
      return castTS({ book, dock, asyncMeta })
    case 'rust':
      return castRust({ book, asyncMeta })
    case 'kotlin':
      return castKotlin({ book, asyncMeta })
    case 'swift':
      return castSwift({ book, asyncMeta })
  }
}
