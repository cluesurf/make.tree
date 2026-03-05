/**
 * Hot swap logic.
 *
 * Receives pre-compiled output for a changed file and updates the
 * runtime's merged book. Old definitions from the file are removed
 * and replaced with new ones. Supports signature diffing to
 * determine whether dependents need rechecking.
 */

import type { CardState, CompileOutput, SwapResult } from '@/runtime/form'
import type { DepGraph } from '@/cache/graph'
import { getDirtySet } from '@/cache/graph'

/**
 * Compute a simple hash of a definition's "signature" for firewall comparison.
 * For now, we use JSON.stringify which captures the full term structure.
 * A future optimization could hash only the type (pi-type spine).
 */
export function signatureHash(input: { term: unknown }): string {
  try {
    return JSON.stringify(input.term)
  } catch {
    return ''
  }
}

/**
 * Swap a file's definitions in the merged book.
 *
 * Steps:
 * 1. Remove old definitions (names from previous card state)
 * 2. Insert new definitions into the merged book
 * 3. Compare signatures to detect signature-level changes
 * 4. Update the card state
 * 5. Compute affected dependents if signatures changed
 */
export function swapFile(input: {
  file: string
  output: CompileOutput
  cards: Map<string, CardState>
  merged: Map<string, unknown>
  graph?: DepGraph
}): SwapResult {
  const { file, output, cards, merged, graph } = input

  const prev = cards.get(file)
  const prevNames = prev?.names ?? []
  const prevSigs = prev?.signatures ?? new Map()

  const newNames = Array.from(output.book.keys())
  const prevSet = new Set(prevNames)
  const newSet = new Set(newNames)

  const removed = prevNames.filter(n => !newSet.has(n))
  const added = newNames.filter(n => !prevSet.has(n))
  const kept = newNames.filter(n => prevSet.has(n))

  // Remove old definitions from merged book
  for (const name of removed) {
    merged.delete(name)
  }

  // Insert/update new definitions and compute new signatures
  const newSigs = new Map<string, string>()
  let signatureChanged = removed.length > 0 || added.length > 0

  for (const [name, term] of output.book) {
    merged.set(name, term)
    const sig = signatureHash({ term })
    newSigs.set(name, sig)

    if (!signatureChanged && prevSigs.has(name) && prevSigs.get(name) !== sig) {
      signatureChanged = true
    }
  }

  // Update card state
  cards.set(file, {
    file,
    code: output.code,
    names: newNames,
    deps: output.files.filter(f => f !== file),
    signatures: newSigs,
  })

  // Compute dependents that need rechecking
  let dependents: string[] = []
  if (signatureChanged && graph) {
    const dirty = getDirtySet({ graph, changed: new Set([file]) })
    dirty.delete(file)
    dependents = [...dirty]
  }

  return {
    file,
    changed: [...added, ...kept],
    removed,
    added,
    dependents,
    signatureChanged,
  }
}
