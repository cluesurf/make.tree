/**
 * Load bind.tree files and extract native name mappings.
 *
 * bind.tree files define the mapping from Seed kebab-case names
 * to native platform names via `task xxx, name <nativeName>`.
 *
 * This module parses those files and builds a lookup map so the
 * codegen backends can emit correct native method/function names.
 */

import { readFileSync } from 'fs'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import type { SurfTask } from '@/surf/form'

/**
 * Load a bind.tree file and return a map of seed names to native names.
 *
 * Example: `task read-file, name <readFile>` → { "read-file": "readFile" }
 */
export function loadBindNames(input: {
  file: string
  name: string
  makeTree: (input: { file: string; text: string }) => { tree: unknown }
}): Map<string, string> {
  const text = readFileSync(input.file, 'utf8')
  const lead = input.makeTree({ file: input.name, text })
  const rawCard = readCard({ tree: (lead as { tree: unknown }).tree, file: input.name })
  const card = expandFuse({ card: rawCard })

  const names = new Map<string, string>()

  for (const node of card.list) {
    if (node.form === 'task') {
      const task = node as SurfTask
      if (task.alias) {
        names.set(task.name, task.alias)
      }
    }
  }

  return names
}

/**
 * Build a combined native name map from multiple bind.tree files.
 * Merges all mappings into a single flat map.
 */
export function mergeBindNames(maps: Map<string, string>[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const map of maps) {
    for (const [k, v] of map) {
      result.set(k, v)
    }
  }
  return result
}
