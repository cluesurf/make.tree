/**
 * Tree parser: Tree AST -> Surface AST.
 *
 * Transforms parsed .tree file output (PFork nodes) into typed
 * Surface AST nodes (SurfTask, SurfForm, SurfCall, etc.) using
 * the mine/mint mill system.
 *
 * Features:
 * - Error recovery: on mine/mint failure, wraps the fork in an
 *   error node and continues with the next fork. Never drops input.
 * - Incremental reparsing: when the tree changes, only
 *   re-transforms affected forks.
 * - Streaming: process forks as they arrive via feed/finish.
 * - CST output: produces a full-fidelity tree that preserves
 *   every input fork, including error and missing nodes.
 *
 * Usage (basic):
 *   const parser = new TreeParser({ mill })
 *   const { card, errors } = parser.parse({ tree, file: 'test.tree' })
 *
 * Usage (CST):
 *   const { cst, errors } = parser.parseCst({ tree, file: 'test.tree' })
 *
 * Usage (incremental):
 *   parser.parse({ tree: tree1, file: 'test.tree' })
 *   const { card, errors } = parser.applyEdit({
 *     tree: tree2, file: 'test.tree'
 *   })
 *
 * Usage (streaming):
 *   parser.feed({ forks: [fork1, fork2] })
 *   parser.feed({ forks: [fork3] })
 *   const { card, errors } = parser.finish({ file: 'test.tree' })
 */

import type { Surf, SurfCard } from '@/surf/form'
import type { Mill } from '@/mill/form'
import type { PFork, PLine, MineCtx } from '@/mill/mine'
import { walkMine, forkKeyword } from '@/mill/mine'
import { walkMint } from '@/mill/mint'
import type { MintCtx } from '@/mill/mint'

export { loadMill, loadMineDefs, loadMintDefs } from '@/mill/load'
export type { Mill } from '@/mill/form'
export type { PLine, PFork, PKnit, PCord, PSize, PText, PNick, PComb, PCode } from '@/mill/mine'

// ---- CST Types ----

/** A CST node from tree transformation. */
export type TreeCstNode = TreeCstCard | TreeCstItem | TreeCstError | TreeCstMissing

/** Root CST node containing all children. */
export type TreeCstCard = {
  form: 'tree-cst-card'
  file: string
  children: TreeCstNode[]
}

/** A successfully transformed fork. */
export type TreeCstItem = {
  form: 'tree-cst-item'
  keyword: string
  source: PFork
  output: Surf
}

/** A fork that failed to transform. */
export type TreeCstError = {
  form: 'tree-cst-error'
  keyword: string | undefined
  source: PFork
  message: string
}

/** A missing expected node (placeholder). */
export type TreeCstMissing = {
  form: 'tree-cst-missing'
  expected: string
}

// ---- Cached fork result ----

type ForkResult = {
  fork: PFork
  keyword: string | undefined
  node: Surf | undefined
  error: string | undefined
}

/**
 * Tree parser that transforms Tree AST into Surface AST
 * using declarative mine/mint rules.
 */
export class TreeParser {
  private mill: Mill

  // Incremental state
  private lastForks: PFork[] | undefined
  private lastResults: ForkResult[] | undefined
  private lastFile: string | undefined

  // Stream state
  private streamResults: ForkResult[]
  private streamErrors: string[]

  constructor(input: { mill: Mill }) {
    this.mill = input.mill
    this.streamResults = []
    this.streamErrors = []
  }

  /**
   * Parse a Tree AST (PLine) into a SurfCard.
   *
   * Error recovery: if a fork's mine rule fails, an error is
   * recorded and parsing continues with the next fork. No forks
   * are silently dropped.
   */
  parse(input: {
    tree: PLine
    file: string
  }): { card: SurfCard, errors: string[] } {
    const { tree, file } = input
    const results = this.transformForks({ forks: tree.nest })
    const errors = collectErrors({ results })

    // Cache for incremental
    this.lastForks = tree.nest.slice()
    this.lastResults = results
    this.lastFile = file

    return { card: buildCard({ file, results }), errors }
  }

  /**
   * Parse and produce a full-fidelity CST.
   *
   * The CST contains every fork from the input, including
   * forks that failed to transform (as error nodes).
   */
  parseCst(input: {
    tree: PLine
    file: string
  }): { cst: TreeCstCard, errors: string[] } {
    const { tree, file } = input
    const results = this.transformForks({ forks: tree.nest })
    const errors = collectErrors({ results })

    // Cache for incremental
    this.lastForks = tree.nest.slice()
    this.lastResults = results
    this.lastFile = file

    return { cst: buildCst({ file, results }), errors }
  }

  /**
   * Incremental re-transform after a tree edit.
   *
   * Compares the new forks against the cached forks.
   * Only forks that changed (by reference) are re-transformed.
   * Unchanged forks reuse their cached results.
   */
  applyEdit(input: {
    tree: PLine
    file: string
  }): { card: SurfCard, errors: string[] } {
    const { tree, file } = input
    const newForks = tree.nest

    if (!this.lastForks || !this.lastResults || this.lastFile !== file) {
      // No cache, do a full parse
      return this.parse(input)
    }

    const oldForks = this.lastForks
    const oldResults = this.lastResults
    const newResults: ForkResult[] = []

    // Find the first and last changed positions
    let firstChanged = 0
    while (
      firstChanged < oldForks.length &&
      firstChanged < newForks.length &&
      oldForks[firstChanged] === newForks[firstChanged]
    ) {
      firstChanged++
    }

    let oldEnd = oldForks.length
    let newEnd = newForks.length
    while (
      oldEnd > firstChanged &&
      newEnd > firstChanged &&
      oldForks[oldEnd - 1] === newForks[newEnd - 1]
    ) {
      oldEnd--
      newEnd--
    }

    // Reuse unchanged prefix
    for (let i = 0; i < firstChanged; i++) {
      newResults.push(oldResults[i]!)
    }

    // Re-transform changed region
    const changedForks = newForks.slice(firstChanged, newEnd)
    const changedResults = this.transformForks({ forks: changedForks })
    for (const r of changedResults) {
      newResults.push(r)
    }

    // Reuse unchanged suffix
    const suffixStart = oldEnd
    for (let i = suffixStart; i < oldForks.length; i++) {
      newResults.push(oldResults[i]!)
    }

    const errors = collectErrors({ results: newResults })

    // Update cache
    this.lastForks = newForks.slice()
    this.lastResults = newResults
    this.lastFile = file

    return { card: buildCard({ file, results: newResults }), errors }
  }

  /**
   * Feed forks for streaming mode. Transforms them immediately
   * and accumulates results. Call finish() to get the final card.
   */
  feed(input: { forks: PFork[] }): { nodesAdded: number } {
    const results = this.transformForks({ forks: input.forks })
    let added = 0
    for (const r of results) {
      this.streamResults.push(r)
      if (r.node) added++
      if (r.error) this.streamErrors.push(r.error)
    }
    return { nodesAdded: added }
  }

  /**
   * Finish streaming mode. Returns the accumulated card and
   * resets stream state.
   */
  finish(input: { file: string }): { card: SurfCard, errors: string[] } {
    const results = this.streamResults
    const errors = collectErrors({ results })
    const card = buildCard({ file: input.file, results })

    // Reset stream state
    this.streamResults = []
    this.streamErrors = []

    return { card, errors }
  }

  /**
   * Get partial results during streaming (before finish).
   */
  getPartialNodes(): Surf[] {
    const list: Surf[] = []
    for (const r of this.streamResults) {
      if (r.node) list.push(r.node)
    }
    return list
  }

  /**
   * Reset stream state without finishing.
   */
  resetStream(): void {
    this.streamResults = []
    this.streamErrors = []
  }

  /**
   * Reload the mill definitions (hot reload support).
   * Invalidates the incremental cache.
   */
  reloadMill(input: { mill: Mill }): void {
    this.mill = input.mill
    this.lastForks = undefined
    this.lastResults = undefined
    this.lastFile = undefined
  }

  // ---- Internal ----

  /**
   * Transform a list of forks into results.
   * Each fork is independently transformed with error recovery.
   */
  private transformForks(input: { forks: PFork[] }): ForkResult[] {
    const results: ForkResult[] = []
    const errors: string[] = []

    const mineCtx: MineCtx = {
      defs: this.mill.mine,
      errors,
    }

    const mintCtx: MintCtx = {
      defs: this.mill.mint,
      errors,
    }

    for (const fork of input.forks) {
      const keyword = forkKeyword(fork)

      if (!keyword) {
        results.push({
          fork,
          keyword: undefined,
          node: undefined,
          error: 'fork has no keyword',
        })
        continue
      }

      const mineDef = this.mill.mine.get(keyword)
      if (!mineDef) {
        results.push({
          fork,
          keyword,
          node: undefined,
          error: `unknown keyword: ${keyword}`,
        })
        continue
      }

      // Clear shared error array for this fork
      const preErrorCount = errors.length
      const take = walkMine({ rule: mineDef.rule, fork, ctx: mineCtx })

      if (!take) {
        const forkErrors = errors.splice(preErrorCount)
        const msg = forkErrors.length > 0
          ? `mine failed for '${keyword}': ${forkErrors.join(', ')}`
          : `mine rule failed for keyword: ${keyword}`
        results.push({
          fork,
          keyword,
          node: undefined,
          error: msg,
        })
        continue
      }

      const mintDef = this.mill.mint.get(keyword)
      if (!mintDef) {
        results.push({
          fork,
          keyword,
          node: undefined,
          error: `no mint rule for keyword: ${keyword}`,
        })
        continue
      }

      const preMintErrors = errors.length
      const node = walkMint({ def: mintDef, take, ctx: mintCtx })

      if (!node) {
        const mintErrors = errors.splice(preMintErrors)
        const msg = mintErrors.length > 0
          ? `mint failed for '${keyword}': ${mintErrors.join(', ')}`
          : `mint produced no output for keyword: ${keyword}`
        results.push({
          fork,
          keyword,
          node: undefined,
          error: msg,
        })
        continue
      }

      // Drain any non-fatal errors from mine/mint
      errors.splice(preErrorCount)

      results.push({
        fork,
        keyword,
        node,
        error: undefined,
      })
    }

    return results
  }
}

// ---- Helpers ----

function buildCard(input: {
  file: string
  results: ForkResult[]
}): SurfCard {
  const list: Surf[] = []
  for (const r of input.results) {
    if (r.node) list.push(r.node)
  }
  return { file: input.file, list }
}

function buildCst(input: {
  file: string
  results: ForkResult[]
}): TreeCstCard {
  const children: TreeCstNode[] = []
  for (const r of input.results) {
    if (r.node) {
      children.push({
        form: 'tree-cst-item',
        keyword: r.keyword!,
        source: r.fork,
        output: r.node,
      })
    } else {
      children.push({
        form: 'tree-cst-error',
        keyword: r.keyword,
        source: r.fork,
        message: r.error ?? 'unknown error',
      })
    }
  }
  return { form: 'tree-cst-card', file: input.file, children }
}

function collectErrors(input: { results: ForkResult[] }): string[] {
  const errors: string[] = []
  for (const r of input.results) {
    if (r.error) errors.push(r.error)
  }
  return errors
}
