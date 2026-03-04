/**
 * Hot swap logic.
 *
 * Receives pre-compiled output for a changed file and updates the
 * runtime's merged book. Old definitions from the file are removed
 * and replaced with new ones.
 */

import type { CardState, CompileOutput, SwapResult } from '@/runtime/form'

/**
 * Swap a file's definitions in the merged book.
 *
 * Steps:
 * 1. Remove old definitions (names from previous card state)
 * 2. Insert new definitions into the merged book
 * 3. Update the card state
 * 4. Return what changed
 */
export function swapFile(input: {
  file: string
  output: CompileOutput
  cards: Map<string, CardState>
  merged: Map<string, unknown>
}): SwapResult {
  const { file, output, cards, merged } = input

  // Get previous state
  const prev = cards.get(file)
  const prevNames = prev?.names ?? []

  const newNames = Array.from(output.book.keys())

  // Find what changed
  const prevSet = new Set(prevNames)
  const newSet = new Set(newNames)

  const removed = prevNames.filter(n => !newSet.has(n))
  const added = newNames.filter(n => !prevSet.has(n))
  const kept = newNames.filter(n => prevSet.has(n))

  // Remove old definitions from merged book
  for (const name of removed) {
    merged.delete(name)
  }

  // Insert/update new definitions
  for (const [name, term] of output.book) {
    merged.set(name, term)
  }

  // Update card state
  cards.set(file, {
    file,
    code: output.code,
    names: newNames,
  })

  return {
    file,
    changed: [...added, ...kept],
  }
}
