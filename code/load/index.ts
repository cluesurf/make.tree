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
