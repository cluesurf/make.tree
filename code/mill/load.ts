/**
 * Load mine/mint .note files from base.tree's mill directory.
 *
 * Reads the Tree AST for each .note file and parses them into
 * MineForm and MintForm rule trees. Resolves cross-file
 * imports (load/hook/find/take directives).
 */

import type { Tree } from '@/mill/tree'
import type { Site } from '@/kink/site'
import type { Kink } from '@/kink/form'
import type { MineForm, MineFile } from '@/mill/mine/form'
import type { MintForm, MintFile } from '@/mill/mint/form'
import { readMineFile } from '@/mill/mine/read'
import { readMintFile } from '@/mill/mint/read'

/** A parsed keyword definition with both mine and mint rules. */
export type MillWord = {
  name: string
  mine: Map<string, MineForm>
  mint: Map<string, MintForm>
}

/** The full loaded mill: all keyword definitions. */
export type Mill = {
  mine: Map<string, MineForm>
  mint: Map<string, MintForm>
  kink: Kink[]
}

/** Load callback: read a .note file path and return its Tree AST. */
export type ReadFn = (path: string) => Tree | undefined

/**
 * Load all mine/mint definitions from a base.tree mill directory.
 *
 * Given a readFn that loads .note file paths into Tree AST, this
 * function discovers and loads all mine.note/mint.note files,
 * parses them, and resolves cross-file imports.
 */
export function loadMill(input: {
  words: string[]
  basePath: string
  readFn: ReadFn
}): Mill {
  const { words, basePath, readFn } = input
  const allMine = new Map<string, MineForm>()
  const allMint = new Map<string, MintForm>()
  const kink: Kink[] = []

  for (const word of words) {
    const minePath = `${basePath}/code/mill/code/${word}/mine.note`
    const mintPath = `${basePath}/code/mill/code/${word}/mint.note`

    const mineTree = readFn(minePath)
    if (mineTree) {
      const mineFile = readMineFile({ tree: mineTree, file: minePath })
      resolveMineLoads(mineFile, basePath, readFn, allMine)
      for (const def of mineFile.formList) {
        allMine.set(def.name, def)
      }
    }

    const mintTree = readFn(mintPath)
    if (mintTree) {
      const mintFile = readMintFile({ tree: mintTree, file: mintPath })
      resolveMintLoads(mintFile, basePath, readFn, allMint)
      for (const def of mintFile.formList) {
        allMint.set(def.name, def)
      }
    }
  }

  return { mine: allMine, mint: allMint, kink }
}

/** Resolve load directives in a mine file. */
function resolveMineLoads(
  file: MineFile,
  basePath: string,
  readFn: ReadFn,
  allMine: Map<string, MineForm>,
): void {
  for (const load of file.load) {
    const resolved = resolvePath(load.path, basePath)
    const minePath = `${resolved}/mine.note`
    const tree = readFn(minePath)
    if (!tree) continue

    const loaded = readMineFile({ tree, file: minePath })

    // Recursively resolve nested loads
    resolveMineLoads(loaded, basePath, readFn, allMine)

    // Add definitions
    for (const def of loaded.formList) {
      allMine.set(def.name, def)
    }
  }
}

/** Resolve load directives in a mint file. */
function resolveMintLoads(
  file: MintFile,
  basePath: string,
  readFn: ReadFn,
  allMint: Map<string, MintForm>,
): void {
  for (const load of file.load) {
    const resolved = resolvePath(load.path, basePath)
    const mintPath = `${resolved}/mint.note`
    const tree = readFn(mintPath)
    if (!tree) continue

    const loaded = readMintFile({ tree, file: mintPath })

    // Recursively resolve nested loads
    resolveMintLoads(loaded, basePath, readFn, allMint)

    // Add definitions
    for (const def of loaded.formList) {
      allMint.set(def.name, def)
    }
  }
}

/** Resolve a relative path (../sift) against a base path. */
function resolvePath(path: string, basePath: string): string {
  // Remove angle brackets if present
  const clean = path.replace(/^<|>$/g, '')

  if (clean.startsWith('../') || clean.startsWith('./')) {
    // Relative path
    return `${basePath}/code/mill/code/${clean.replace(/^\.\.\//, '')}`
  }

  if (clean.startsWith('@')) {
    // Package reference (e.g., @cluesurf/crow)
    return clean
  }

  return `${basePath}/code/mill/code/${clean}`
}
