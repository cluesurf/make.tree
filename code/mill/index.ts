/**
 * Mill engine: Tree AST -> Surface AST.
 *
 * This is Phase 1 of the Term compiler pipeline. It uses mine/mint
 * rules loaded from base.tree to transform user source (Tree AST)
 * into Surface AST nodes (SurfTask, SurfForm, SurfCall, etc.).
 *
 * Usage:
 *   const mill = loadMill(words, basePath, readFn)
 *   const card = runMill(mill, tree, file)
 */

import type { Tree, TreeLink } from '@/mill/tree'
import type { Site } from '@/kink/site'
import type { Kink } from '@/kink/form'
import { makeKink } from '@/kink/form'
import type { Surf, SurfCard } from '@/surf/form'
import type { Mill } from '@/mill/load'
import type { MineCtx } from '@/mill/mine/walk'
import type { MintCtx } from '@/mill/mint/walk'
import { walkMine } from '@/mill/mine/walk'
import { walkMint } from '@/mill/mint/walk'

export { loadMill } from '@/mill/load'
export type { Mill } from '@/mill/load'

/**
 * Run the mill engine on a source Tree AST to produce a SurfCard.
 *
 * For each top-level TreeLink in the source, find the matching
 * mine definition (by keyword), extract values, then run the
 * matching mint definition to produce a Surface AST node.
 */
export function runMill(input: { mill: Mill, tree: Tree, card: string }): SurfCard {
  const { mill, tree, card } = input
  const list: Surf[] = []
  const kink: Kink[] = []

  const mineCtx: MineCtx = {
    formList: mill.mine,
    kink,
    file: card,
  }

  const mintCtx: MintCtx = {
    formList: mill.mint,
    kink,
    file: card,
  }

  for (const link of tree.list) {
    const keyword = link.text

    // Find the mine definition for this keyword
    const mineDef = mill.mine.get(keyword)
    if (!mineDef) {
      const site = makeLinkSite(link, card)
      kink.push(makeKink({
        form: 'mill-bad-keyword', rank: 'halt', site,
        text: `unknown keyword: ${keyword}`,
        rest: { name: keyword },
      }))
      continue
    }

    // Run the mine phase: extract values from the tree
    const take = walkMine({ rule: mineDef.rule, link, ctx: mineCtx })
    if (!take) {
      const site = makeLinkSite(link, card)
      kink.push(makeKink({
        form: 'mill-bad-rule', rank: 'halt', site,
        text: `mine rule failed to match for keyword: ${keyword}`,
        rest: { rule: keyword },
      }))
      continue
    }

    // Find the mint definition for this keyword
    const mintDef = mill.mint.get(keyword)
    if (!mintDef) {
      const site = makeLinkSite(link, card)
      kink.push(makeKink({
        form: 'mill-bad-rule', rank: 'halt', site,
        text: `no mint rule for keyword: ${keyword}`,
        rest: { rule: keyword },
      }))
      continue
    }

    // Run the mint phase: construct the Surface AST node
    const site = makeLinkSite(link, card)
    const node = walkMint({ rule: mintDef.rule, take, ctx: mintCtx, site })
    if (node) {
      list.push(node)
    }
  }

  return { file: card, list }
}

/** Extract a Site from a TreeLink. */
function makeLinkSite(link: TreeLink, file: string): Site {
  if (link.code?.base && link.code?.head) {
    return {
      form: 'card-site',
      link: file,
      base: {
        line: link.code.base.band.base.line,
        mark: link.code.base.band.base.mark,
      },
      head: {
        line: link.code.head.band.head.line,
        mark: link.code.head.band.head.mark,
      },
    }
  }
  return { form: 'brew-site' }
}
