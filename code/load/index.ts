/**
 * Multi-file loader: recursively resolves `load` directives
 * and merges all definitions into a single Book.
 *
 * IO is kept out of this module. The caller provides readFile,
 * resolvePath, and parse callbacks so tests can use in-memory maps.
 */

import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard, type FirmSet } from '@/term/desugar'
import { resolveStdlib } from '@/stdlib'
import { extractSkele } from '@/resolve/skeleton'
import { initResolver, resolveTemplates, type ResolveError } from '@/resolve'
import type { FileSkele } from '@/resolve/skeleton'
import type { Book } from '@/term/form'
import type { SurfCard, SurfLoad } from '@/surf/form'

export type LoadEnv = {
  readFile: (path: string) => string
  resolvePath: (fromFile: string, loadPath: string) => string | null
  parse: (input: { file: string; text: string }) => { tree: any } | null
}

export type LoadResult = {
  book: Book
  files: string[]
  fileMap: Map<string, string[]>
  firmSet: FirmSet
}

export function loadBook(input: {
  file: string
  env: LoadEnv
}): LoadResult {
  const visited = new Set<string>()
  const book: Book = new Map()
  const files: string[] = []
  const fileMap = new Map<string, string[]>()
  const firmSet: FirmSet = new Set()

  loadFile({
    file: input.file,
    env: input.env,
    visited,
    book,
    files,
    fileMap,
    firmSet,
  })

  return { book, files, fileMap, firmSet }
}

function loadFile(input: {
  file: string
  env: LoadEnv
  visited: Set<string>
  book: Book
  files: string[]
  fileMap: Map<string, string[]>
  firmSet: FirmSet
}): void {
  const { file, env, visited, book, files, fileMap, firmSet } = input

  if (visited.has(file)) return
  visited.add(file)
  files.push(file)

  // Read and parse the file
  let text: string
  try {
    text = env.readFile(file)
  } catch {
    return
  }

  const lead = env.parse({ file, text })
  if (!lead || !lead.tree) return

  // Convert parse tree to Surface AST, then expand macros
  const rawCard: SurfCard = readCard({ tree: lead.tree, file })
  const card: SurfCard = expandFuse({ card: rawCard })

  // Process load and bear directives first (depth-first)
  for (const node of card.list) {
    if (node.form === 'load') {
      const loadPath = node.path.join('/')

      // Package imports: resolve from built-in stdlib or filesystem
      if (loadPath.startsWith('@')) {
        const stdCard = resolveStdlib({
          loadPath,
          parse: env.parse,
        })
        if (stdCard && !visited.has(loadPath)) {
          visited.add(loadPath)
          const stdResult = desugarCard({ card: stdCard })

          // If the load has `find` directives, only import named items
          const loadNode = node as SurfLoad
          if (loadNode.find && loadNode.find.length > 0) {
            const aliasMap = new Map<string, string>()
            for (const f of loadNode.find) {
              aliasMap.set(f.name, f.alias ?? f.name)
            }
            for (const [name, term] of stdResult.book) {
              if (aliasMap.has(name)) {
                book.set(aliasMap.get(name)!, term)
              }
            }
          } else {
            for (const [name, term] of stdResult.book) {
              book.set(name, term)
            }
          }
        }
        continue
      }

      const resolved = env.resolvePath(file, loadPath)
      if (resolved) {
        loadFile({ file: resolved, env, visited, book, files, fileMap, firmSet })
      }
    }

    if (node.form === 'bear') {
      const bearPath = node.path.join('/')
      const resolved = env.resolvePath(file, bearPath)
      if (resolved) {
        loadFile({ file: resolved, env, visited, book, files, fileMap, firmSet })
      }
    }
  }

  // Desugar this file and merge into the shared book
  const fileResult = desugarCard({ card })
  const fileNames: string[] = []
  for (const [name, term] of fileResult.book) {
    book.set(name, term)
    fileNames.push(name)
  }
  for (const name of fileResult.firmSet) {
    firmSet.add(name)
  }
  fileMap.set(file, fileNames)
}

export type LoadPackageResult = LoadResult & {
  resolveErrors: ResolveError[]
  skeletons: Map<string, FileSkele>
}

/**
 * Load a package using skeleton-first resolution.
 *
 * 1. Discover all files (depth-first from entrypoint).
 * 2. Parse each file and extract a skeleton.
 * 3. Run package-wide template resolution (fixed-point).
 * 4. Expand templates and desugar with all names known.
 *
 * This handles circular references between files within a package,
 * including template-generated names, because all skeletons are
 * collected before any desugaring occurs.
 */
export function loadPackage(input: {
  file: string
  env: LoadEnv
}): LoadPackageResult {
  const { file, env } = input

  // Phase 1: Discover all files
  const visited = new Set<string>()
  const allFiles: string[] = []
  discoverFiles({ file, env, visited, files: allFiles })

  // Phase 2: Parse each file and extract skeletons
  const skeletons = new Map<string, FileSkele>()
  const cards = new Map<string, SurfCard>()

  for (const f of allFiles) {
    let text: string
    try {
      text = env.readFile(f)
    } catch {
      continue
    }

    const lead = env.parse({ file: f, text })
    if (!lead || !lead.tree) continue

    const rawCard = readCard({ tree: lead.tree, file: f })
    const skele = extractSkele({ card: rawCard })
    skeletons.set(f, skele)
    cards.set(f, rawCard)
  }

  // Phase 3: Resolve templates (fixed-point)
  const state = initResolver({ skeletons })
  const resolved = resolveTemplates({ state })

  // Phase 4: Collect all tree templates across the package
  const allTrees = new Map<string, import('@/surf/form').SurfTree>()
  for (const [, rawCard] of cards) {
    for (const node of rawCard.list) {
      if (node.form === 'tree') {
        allTrees.set(node.name, node as import('@/surf/form').SurfTree)
      }
    }
  }

  // Phase 5: Expand and desugar with all names and trees known
  const book: Book = new Map()
  const fileMap = new Map<string, string[]>()
  const firmSet: FirmSet = new Set()
  const processedStdlib = new Set<string>()

  for (const f of allFiles) {
    const rawCard = cards.get(f)
    if (!rawCard) continue

    // Expand templates with package-wide tree definitions
    const card = expandFuse({ card: rawCard, externalTrees: allTrees })

    // Process stdlib imports
    for (const node of card.list) {
      if (node.form === 'load') {
        const loadPath = node.path.join('/')
        if (loadPath.startsWith('@') && !processedStdlib.has(loadPath)) {
          processedStdlib.add(loadPath)
          const stdCard = resolveStdlib({ loadPath, parse: env.parse })
          if (stdCard) {
            const stdResult = desugarCard({ card: stdCard })
            const loadNode = node as SurfLoad
            if (loadNode.find && loadNode.find.length > 0) {
              const aliasMap = new Map<string, string>()
              for (const find of loadNode.find) {
                aliasMap.set(find.name, find.alias ?? find.name)
              }
              for (const [name, term] of stdResult.book) {
                if (aliasMap.has(name)) {
                  book.set(aliasMap.get(name)!, term)
                }
              }
            } else {
              for (const [name, term] of stdResult.book) {
                book.set(name, term)
              }
            }
          }
        }
      }
    }

    // Desugar and merge
    const fileResult = desugarCard({ card })
    const fileNames: string[] = []
    for (const [name, term] of fileResult.book) {
      book.set(name, term)
      fileNames.push(name)
    }
    for (const name of fileResult.firmSet) {
      firmSet.add(name)
    }
    fileMap.set(f, fileNames)
  }

  return {
    book,
    files: allFiles,
    fileMap,
    firmSet,
    resolveErrors: resolved.errors,
    skeletons,
  }
}

/**
 * Discover all files reachable from an entrypoint via load/bear.
 * Does NOT parse or desugar. Only reads files enough to find load paths.
 */
export function discoverFiles(input: {
  file: string
  env: LoadEnv
  visited: Set<string>
  files: string[]
}): void {
  const { file, env, visited, files } = input

  if (visited.has(file)) return
  visited.add(file)
  files.push(file)

  let text: string
  try {
    text = env.readFile(file)
  } catch {
    return
  }

  const lead = env.parse({ file, text })
  if (!lead || !lead.tree) return

  const card = readCard({ tree: lead.tree, file })

  for (const node of card.list) {
    if (node.form === 'load') {
      const loadPath = node.path.join('/')
      if (loadPath.startsWith('@')) continue
      const resolved = env.resolvePath(file, loadPath)
      if (resolved) {
        discoverFiles({ file: resolved, env, visited, files })
      }
    }
    if (node.form === 'bear') {
      const bearPath = node.path.join('/')
      const resolved = env.resolvePath(file, bearPath)
      if (resolved) {
        discoverFiles({ file: resolved, env, visited, files })
      }
    }
  }
}
