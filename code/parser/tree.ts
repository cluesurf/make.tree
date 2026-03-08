/**
 * Tree parser: Tree AST -> Surface AST.
 *
 * Transforms parsed .tree file output (PFork nodes) into typed
 * Surface AST nodes (SurfTask, SurfForm, SurfCall, etc.) using
 * the mine/mint mill system.
 *
 * The string parser (string.ts) parses raw text into Tree AST.
 * This tree parser takes that Tree AST and gives it semantic
 * meaning by matching keyword patterns and constructing typed nodes.
 *
 * Usage:
 *   import { TreeParser } from '@/parser/tree'
 *
 *   const parser = new TreeParser({ mill })
 *   const { card, errors } = parser.parse({ tree, file: 'test.tree' })
 */

import type { Surf, SurfCard } from '@/surf/form'
import type { Mill } from '@/mill/form'
import type { PLine, MineCtx } from '@/mill/mine'
import { walkMine, forkKeyword } from '@/mill/mine'
import { walkMint } from '@/mill/mint'
import type { MintCtx } from '@/mill/mint'

export { loadMill, loadMineDefs, loadMintDefs } from '@/mill/load'
export type { Mill } from '@/mill/form'
export type { PLine, PFork, PKnit, PCord, PSize, PText, PNick, PComb, PCode } from '@/mill/mine'

/**
 * Tree parser that transforms Tree AST into Surface AST
 * using declarative mine/mint rules.
 */
export class TreeParser {
  private mill: Mill

  constructor(input: { mill: Mill }) {
    this.mill = input.mill
  }

  /**
   * Parse a Tree AST (PLine) into a SurfCard.
   *
   * For each top-level PFork, finds matching mine/mint definitions
   * by keyword, runs mine to extract values, runs mint to construct
   * the Surface AST node.
   */
  parse(input: {
    tree: PLine
    file: string
  }): { card: SurfCard, errors: string[] } {
    const { tree, file } = input
    const list: Surf[] = []
    const errors: string[] = []

    const mineCtx: MineCtx = {
      defs: this.mill.mine,
      errors,
    }

    const mintCtx: MintCtx = {
      defs: this.mill.mint,
      errors,
    }

    for (const fork of tree.nest) {
      const keyword = forkKeyword(fork)
      if (!keyword) continue

      const mineDef = this.mill.mine.get(keyword)
      if (!mineDef) {
        errors.push(`unknown keyword: ${keyword}`)
        continue
      }

      const take = walkMine({ rule: mineDef.rule, fork, ctx: mineCtx })
      if (!take) {
        errors.push(`mine rule failed for keyword: ${keyword}`)
        continue
      }

      const mintDef = this.mill.mint.get(keyword)
      if (!mintDef) {
        errors.push(`no mint rule for keyword: ${keyword}`)
        continue
      }

      const node = walkMint({ def: mintDef, take, ctx: mintCtx })
      if (node) {
        list.push(node)
      }
    }

    return { card: { file, list }, errors }
  }

  /**
   * Reload the mill definitions (hot reload support).
   */
  reloadMill(input: { mill: Mill }): void {
    this.mill = input.mill
  }
}
