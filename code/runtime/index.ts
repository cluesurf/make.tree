/**
 * Runtime class.
 *
 * Manages compiled HVM definitions, provides fast definition lookup,
 * and supports hot-swapping updated definitions. The runtime receives
 * pre-compiled output. It does not compile or watch files.
 *
 * Usage:
 *   const rt = new Runtime()
 *   rt.load({ output })
 *   rt.book()                     // merged book of all definitions
 *   rt.card({ file })             // per-file state
 *   rt.swap({ file, output })     // hot-swap a file's definitions
 *   rt.close()
 */

import type {
  CompileOutput,
  CardState,
  SwapResult,
} from '@/runtime/form'
import { swapFile } from '@/runtime/swap'

export class Runtime {
  private cards: Map<string, CardState> = new Map()
  private merged: Map<string, unknown> = new Map()
  private deps: Map<string, Set<string>> = new Map()

  /** Load compiled output into the runtime. */
  load(input: { output: CompileOutput }): void {
    const { output } = input

    // Build the merged book
    this.merged = new Map(output.book)

    const names = Array.from(output.book.keys())
    const entry = output.files[0] ?? ''

    // Create a card for the entry file
    this.cards.set(entry, {
      file: entry,
      code: output.code,
      names,
    })

    // Record all loaded files
    for (const file of output.files) {
      if (!this.cards.has(file)) {
        this.cards.set(file, {
          file,
          code: '',
          names: [],
        })
      }
    }

    // Build dependency graph: entry depends on all loaded files
    const depSet = new Set(output.files.filter(f => f !== entry))
    this.deps.set(entry, depSet)
  }

  /** Get the merged definition book (all files). */
  book(): Map<string, unknown> {
    return this.merged
  }

  /** Get per-file state. Returns null if file not loaded. */
  card(input: { file: string }): CardState | null {
    return this.cards.get(input.file) ?? null
  }

  /** Get all loaded file paths. */
  files(): string[] {
    return Array.from(this.cards.keys())
  }

  /** Check if a file is loaded. */
  has(input: { file: string }): boolean {
    return this.cards.has(input.file)
  }

  /**
   * Hot-swap a file's definitions with new compiled output.
   * Removes old definitions and inserts new ones into the merged book.
   */
  swap(input: { file: string; output: CompileOutput }): SwapResult {
    return swapFile({
      file: input.file,
      output: input.output,
      cards: this.cards,
      merged: this.merged,
    })
  }

  /** Release resources. */
  close(): void {
    this.cards.clear()
    this.merged.clear()
    this.deps.clear()
  }
}
