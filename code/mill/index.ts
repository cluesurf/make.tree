/**
 * Term mill engine.
 *
 * The mill engine powers the tree parser (parser/tree.ts).
 * This module provides the core pieces and a convenience runMill function.
 */

import type { Surf, SurfCard } from '@/surf/form'
import type { Mill } from './form'
import type { PLine, MineCtx } from './mine'
import { walkMine, forkKeyword } from './mine'
import { walkMint } from './mint'
import type { MintCtx } from './mint'

export { loadMill, loadMineDefs, loadMintDefs } from './load'
export { walkMine, forkKeyword, forkChildren } from './mine'
export { walkMint } from './mint'
export type { Mill } from './form'
export type { MineCtx, TakeMap, TakeVal, PLine, PFork, PKnit, PCord } from './mine'
export type { MintCtx } from './mint'

/**
 * Run the term mill on a parsed .tree file to produce a SurfCard.
 */
export function runMill(input: {
  mill: Mill
  tree: PLine
  file: string
}): { card: SurfCard, errors: string[] } {
  const { mill, tree, file } = input
  const list: Surf[] = []
  const errors: string[] = []

  const mineCtx: MineCtx = {
    defs: mill.mine,
    errors,
  }

  const mintCtx: MintCtx = {
    defs: mill.mint,
    errors,
  }

  for (const fork of tree.nest) {
    const keyword = forkKeyword(fork)
    if (!keyword) continue

    const mineDef = mill.mine.get(keyword)
    if (!mineDef) {
      errors.push(`unknown keyword: ${keyword}`)
      continue
    }

    const take = walkMine({ rule: mineDef.rule, fork, ctx: mineCtx })
    if (!take) {
      errors.push(`mine rule failed for keyword: ${keyword}`)
      continue
    }

    const mintDef = mill.mint.get(keyword)
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
