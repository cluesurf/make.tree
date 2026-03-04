/**
 * Standard library resolver.
 *
 * Resolves @cluesurf/base and @cluesurf/case package paths to real
 * .tree files on disk. Falls back to hardcoded SurfCard entries for
 * legacy @cluesurf/term imports.
 *
 * When loadBook encounters a package path (starts with @), it calls
 * resolveStdlib which:
 *   1. Checks the hardcoded legacy map
 *   2. Maps the package path to a filesystem path
 *   3. Reads, parses, and returns the SurfCard
 *   4. Caches the result for subsequent lookups
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import type { SurfCard, SurfTask } from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

export type ParseFn = (input: {
  file: string
  text: string
}) => { tree: any } | null

/** Cached parsed cards from filesystem. */
const cardCache = new Map<string, SurfCard | null>()

/** Registry of hardcoded legacy module paths. */
const legacy = new Map<string, SurfCard>()

// -- Legacy @cluesurf/term entries (kept for backwards compat) --

legacy.set('@cluesurf/term/code/file', {
  file: '@cluesurf/term/code/file',
  list: [
    {
      form: 'task',
      name: 'file/save',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
        { form: 'base', name: 'data', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
    {
      form: 'task',
      name: 'file/read',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

legacy.set('@cluesurf/term/code/file/stream/read', {
  file: '@cluesurf/term/code/file/stream/read',
  list: [
    {
      form: 'task',
      name: 'file-stream-read/make',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

legacy.set('@cluesurf/term/code/file/stream/write', {
  file: '@cluesurf/term/code/file/stream/write',
  list: [
    {
      form: 'task',
      name: 'file-stream-write/make',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

legacy.set('@cluesurf/term/code/folder', {
  file: '@cluesurf/term/code/folder',
  list: [
    {
      form: 'task',
      name: 'folder/save',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

/**
 * Default stdlib root: the deck/seed/deck/ directory containing
 * base.tree/ and case.tree/ packages.
 */
let stdlibRoot: string | null = null

/** Set the root directory where base.tree/ and case.tree/ live. */
export function setStdlibRoot(input: { root: string }): void {
  stdlibRoot = input.root
}

/** Get the current stdlib root (auto-detects if not set). */
export function getStdlibRoot(): string | null {
  if (stdlibRoot) return stdlibRoot

  // Auto-detect: walk up from this file to find deck/seed/deck/
  // This file is at deck/seed/deck/mesh.tree/code/stdlib/index.ts
  // We need deck/seed/deck/
  try {
    const thisFile = fileURLToPath(import.meta.url)
    const thisDir = path.dirname(thisFile)
    const meshTreeRoot = path.resolve(thisDir, '../..')
    const deckRoot = path.resolve(meshTreeRoot, '..')
    if (fs.existsSync(path.resolve(deckRoot, 'base.tree'))) {
      stdlibRoot = deckRoot
      return stdlibRoot
    }
  } catch {
    // import.meta.url may not be available in all contexts
  }

  return null
}

/** Clear the card cache (useful for tests and HMR). */
export function clearStdlibCache(): void {
  cardCache.clear()
}

/**
 * Resolve a package path to a filesystem path.
 *
 * Maps:
 *   @cluesurf/base/code/base/form/boolean -> base.tree/code/base/form/boolean/base.tree
 *   @cluesurf/case/code/node/fs           -> case.tree/code/node/fs/base.tree
 */
export function resolvePackagePath(input: {
  loadPath: string
  root: string
}): string | null {
  const { loadPath, root } = input

  // Match @cluesurf/<pkg>/code/<rest>
  const match = loadPath.match(/^@cluesurf\/(base|case)\/(.+)$/)
  if (!match) return null

  const [, pkg, rest] = match
  // Package directory: base.tree or case.tree
  const pkgDir = `${pkg}.tree`
  // The rest maps to a directory with base.tree inside
  const filePath = path.resolve(root, pkgDir, `${rest}/base.tree`)
  return filePath
}

/**
 * Look up a module by package path.
 *
 * Checks legacy hardcoded entries first, then tries filesystem loading.
 * The parse function is required for filesystem loading.
 */
export function resolveStdlib(input: {
  loadPath: string
  parse?: ParseFn
}): SurfCard | null {
  const { loadPath, parse } = input

  // 1. Check legacy hardcoded map
  const legacyCard = legacy.get(loadPath)
  if (legacyCard) return legacyCard

  // 2. Check cache
  if (cardCache.has(loadPath)) return cardCache.get(loadPath)!

  // 3. Need parse function for filesystem loading
  if (!parse) {
    return null
  }

  // 4. Resolve filesystem path
  const root = getStdlibRoot()
  if (!root) {
    cardCache.set(loadPath, null)
    return null
  }

  const filePath = resolvePackagePath({ loadPath, root })
  if (!filePath) {
    cardCache.set(loadPath, null)
    return null
  }

  // 5. Check file exists
  if (!fs.existsSync(filePath)) {
    // Try without the trailing /base.tree (maybe it's a direct file)
    const altPath = path.resolve(root, loadPath.replace(/^@cluesurf\/(base|case)\//, '$1.tree/') + '.tree')
    if (!fs.existsSync(altPath)) {
      cardCache.set(loadPath, null)
      return null
    }
    return loadFromFile({ filePath: altPath, loadPath, parse })
  }

  return loadFromFile({ filePath, loadPath, parse })
}

/** Read, parse, and cache a .tree file as a SurfCard. */
function loadFromFile(input: {
  filePath: string
  loadPath: string
  parse: ParseFn
}): SurfCard | null {
  const { filePath, loadPath, parse } = input

  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf-8')
  } catch {
    cardCache.set(loadPath, null)
    return null
  }

  const lead = parse({ file: filePath, text })
  if (!lead || !lead.tree) {
    cardCache.set(loadPath, null)
    return null
  }

  const rawCard = readCard({ tree: lead.tree, file: filePath })
  const card = expandFuse({ card: rawCard })

  cardCache.set(loadPath, card)
  return card
}
