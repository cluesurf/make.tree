/**
 * Runtime class.
 *
 * Manages compiled definitions, provides fast definition lookup,
 * supports hot-swapping with signature firewall, and tracks
 * a dependency graph for propagation control.
 *
 * Usage:
 *   const rt = new Runtime()
 *   rt.load({ output })
 *   rt.loadFile({ file, output })
 *   rt.book()                       // merged book of all definitions
 *   rt.card({ file })               // per-file state
 *   rt.swap({ file, output })       // hot-swap with signature firewall
 *   rt.dependents({ file })         // files that depend on this file
 *   rt.close()
 */

import type {
  CompileOutput,
  CardState,
  SwapResult,
  RuntimeConfig,
} from '@/runtime/form'
import { swapFile, signatureHash } from '@/runtime/swap'
import type { DepGraph } from '@/cache/graph'
import { createGraph, addEdge } from '@/cache/graph'

export class Runtime {
  private cards: Map<string, CardState> = new Map()
  private merged: Map<string, unknown> = new Map()
  private graph: DepGraph = createGraph()
  private config: RuntimeConfig

  constructor(config?: RuntimeConfig) {
    this.config = config ?? {}
  }

  /** Load compiled output into the runtime (single compilation unit). */
  load(input: { output: CompileOutput }): void {
    const { output } = input

    this.merged = new Map(output.book)

    const names = Array.from(output.book.keys())
    const entry = output.files[0] ?? ''

    // Compute signatures for all definitions
    const signatures = new Map<string, string>()
    for (const [name, term] of output.book) {
      signatures.set(name, signatureHash({ term }))
    }

    // Create a card for the entry file
    this.cards.set(entry, {
      file: entry,
      code: output.code,
      names,
      deps: output.files.filter(f => f !== entry),
      signatures,
    })

    // Record all loaded files
    for (const file of output.files) {
      if (!this.cards.has(file)) {
        this.cards.set(file, {
          file,
          code: '',
          names: [],
          deps: [],
          signatures: new Map(),
        })
      }
    }

    // Build dependency graph: entry depends on all loaded files
    for (const dep of output.files) {
      if (dep !== entry) {
        addEdge({ graph: this.graph, from: entry, to: dep })
      }
    }
  }

  /** Load compiled output for a specific file (multi-file mode). */
  loadFile(input: { file: string; output: CompileOutput }): void {
    const { file, output } = input

    const names = Array.from(output.book.keys())

    // Compute signatures
    const signatures = new Map<string, string>()
    for (const [name, term] of output.book) {
      signatures.set(name, signatureHash({ term }))
      this.merged.set(name, term)
    }

    // Update card state
    this.cards.set(file, {
      file,
      code: output.code,
      names,
      deps: output.files.filter(f => f !== file),
      signatures,
    })

    // Update dependency graph
    for (const dep of output.files) {
      if (dep !== file) {
        addEdge({ graph: this.graph, from: file, to: dep })
      }
    }
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

  /** Get files that transitively depend on the given file. */
  dependents(input: { file: string }): string[] {
    const rdeps = this.graph.rdeps.get(input.file)
    return rdeps ? [...rdeps] : []
  }

  /** Get the dependency graph. */
  depGraph(): DepGraph {
    return this.graph
  }

  /**
   * Hot-swap a file's definitions with new compiled output.
   * Compares signatures to determine if dependents need rechecking.
   */
  swap(input: { file: string; output: CompileOutput }): SwapResult {
    return swapFile({
      file: input.file,
      output: input.output,
      cards: this.cards,
      merged: this.merged,
      graph: this.graph,
    })
  }

  /** Remove a file and its definitions from the runtime. */
  unload(input: { file: string }): void {
    const card = this.cards.get(input.file)
    if (card) {
      for (const name of card.names) {
        this.merged.delete(name)
      }
      this.cards.delete(input.file)
    }
  }

  /** Release resources. */
  close(): void {
    this.cards.clear()
    this.merged.clear()
    this.graph = createGraph()
  }
}
