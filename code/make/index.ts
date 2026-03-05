/**
 * Compiler public API.
 *
 * Wires the full pipeline: parse -> read -> fuse -> desugar -> check -> codegen.
 * Returns compiled code along with any errors collected during type checking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard, type AsyncMeta } from '@/term/desugar'
import { check } from '@/term/check'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castHVM } from '@/cast/hvm'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import { loadBook } from '@/load'
import { renderInfoList } from '@/kink/render'
import { hashContent } from '@/cache/hash'
import { createStore, type CacheStore } from '@/cache/store'
import { createGraph, addEdge, getDirtySet, serializeGraph, deserializeGraph } from '@/cache/graph'
import type { Book, Info, Fill } from '@/term/form'
import type { Kink } from '@/kink/form'
import type { LoadEnv } from '@/load'
import type { SurfCard, SurfLoad } from '@/surf/form'
import type { DockLoad } from '@/cast/typescript'

export type Target = 'typescript' | 'rust' | 'kotlin' | 'swift' | 'hvm'

export type CompileResult = {
  code: string
  errors: Kink[]
  files: string[]
  book: Book
}

/**
 * Compile a multi-file project starting from an entry file.
 * Recursively resolves load/bear directives.
 */
export function compile(input: {
  file: string
  env: LoadEnv
  target: Target
}): CompileResult {
  const { file, env, target } = input

  const result = loadBook({ file, env })
  const { book, files } = result

  const errors = checkBook({ book })
  const code = generate({ book, target })

  return { code, errors, files, book }
}

/**
 * Compile a single .tree text without file resolution.
 * The parse callback must be provided to convert text to a parse tree.
 */
export function compileText(input: {
  text: string
  file: string
  target: Target
  parse: (input: { file: string; text: string }) => { tree: any } | null
}): CompileResult {
  const { text, file, target, parse } = input

  const lead = parse({ file, text })
  if (!lead || !lead.tree) {
    return { code: '', errors: [], files: [file], book: new Map() }
  }

  const rawCard = readCard({ tree: lead.tree, file })
  const card = expandFuse({ card: rawCard })
  const dock = extractDockLoads({ card })
  const { book, asyncMeta } = desugarCard({ card })

  const errors = checkBook({ book })
  const code = generate({ book, target, dock, asyncMeta })

  return { code, errors, files: [file], book }
}

/**
 * Incremental compile: only re-parse files whose content has changed.
 *
 * Uses content hashing and a dependency graph to determine the minimal
 * set of files to recompile. Caches SurfCards (Phase 0+1) on disk.
 * Always re-desugars from SurfCards (fast enough to skip caching).
 */
export function compileIncremental(input: {
  file: string
  env: LoadEnv
  target: Target
  root: string
  version?: string
}): CompileResult & { cached: number; recompiled: number } {
  const { file, env, target, root, version = '1' } = input
  const store = createStore({ root })

  // Check cache validity
  const meta = store.getMeta()
  if (!meta || meta.version !== version) {
    store.clear()
    store.setMeta({ meta: { version, created: Date.now() } })
  }

  const oldIndex = store.getIndex()

  // Phase 1: discover all files by doing a full load pass to find file list.
  // We use loadBook to discover files, then selectively re-parse.
  const discovery = loadBook({ file, env })
  const allFiles = discovery.files

  // Phase 2: hash each file and determine which changed.
  const newIndex: Record<string, string> = {}
  const changed = new Set<string>()

  for (const f of allFiles) {
    let text: string
    try {
      text = env.readFile(f)
    } catch {
      continue
    }
    const hash = hashContent({ content: text })
    newIndex[f] = hash
    if (oldIndex.files[f] !== hash) {
      changed.add(f)
    }
  }

  // Phase 3: build dependency graph from SurfCards.
  // Load the old graph if we have one.
  const graphRaw = store.readRaw({ name: 'graph.json' })
  const graph = graphRaw ? deserializeGraph({ json: graphRaw }) : createGraph()

  // Phase 4: compute dirty set (changed + transitive dependents).
  const dirty = getDirtySet({ graph, changed })

  // Phase 5: for each file, load cached SurfCard or re-parse.
  const cards: SurfCard[] = []
  let cached = 0
  let recompiled = 0
  const freshGraph = createGraph()

  for (const f of allFiles) {
    const hash = newIndex[f]
    if (!hash) continue

    let card: SurfCard | null = null

    if (!dirty.has(f) && store.has({ hash, phase: 'card' })) {
      // Use cached SurfCard
      card = store.read({ hash, phase: 'card' }) as SurfCard | null
      cached++
    }

    if (!card) {
      // Re-parse this file
      let text: string
      try {
        text = env.readFile(f)
      } catch {
        continue
      }

      const lead = env.parse({ file: f, text })
      if (!lead || !lead.tree) continue

      const rawCard = readCard({ tree: lead.tree, file: f })
      card = expandFuse({ card: rawCard })

      // Cache the SurfCard
      store.write({ hash, phase: 'card', data: card })
      recompiled++
    }

    // Update dependency graph from load/bear directives
    for (const node of card.list) {
      if (node.form === 'load' || node.form === 'bear') {
        const loadPath = (node as SurfLoad).path.join('/')
        if (!loadPath.startsWith('@')) {
          const resolved = env.resolvePath(f, loadPath)
          if (resolved) {
            addEdge({ graph: freshGraph, from: f, to: resolved })
          }
        }
      }
    }

    cards.push(card)
  }

  // Phase 6: desugar all cards into a single Book.
  const book: Book = new Map()
  let asyncMeta: AsyncMeta | undefined
  const allDock: DockLoad[] = []

  for (const card of cards) {
    const dock = extractDockLoads({ card })
    allDock.push(...dock)
    const result = desugarCard({ card })
    for (const [name, term] of result.book) {
      book.set(name, term)
    }
    if (result.asyncMeta) {
      asyncMeta = { ...asyncMeta, ...result.asyncMeta }
    }
  }

  // Phase 7: type-check and generate code.
  const errors = checkBook({ book })
  const code = generate({ book, target, dock: allDock, asyncMeta })

  // Phase 8: persist cache.
  store.setIndex({ index: { files: newIndex } })
  store.writeRaw({ name: 'graph.json', data: serializeGraph({ graph: freshGraph }) })

  return { code, errors, files: allFiles, book, cached, recompiled }
}

/**
 * Type-check every definition in a book.
 * Returns Kink errors for any type mismatches.
 */
function checkBook(input: { book: Book }): Kink[] {
  const { book } = input
  const allErrors: Kink[] = []
  const names = [...book.keys()]

  for (const [name, term] of book) {
    const result = check({ term, book })
    if (result) {
      const errors = renderInfoList({
        logs: result.state.logs,
        fill: result.state.fill,
        names,
      })
      allErrors.push(...errors)
    } else {
      // check returned null = hard failure with no state
      // This shouldn't happen for well-formed terms, but handle gracefully
    }
  }

  return allErrors
}

/** Extract dock load entries from a SurfCard. */
function extractDockLoads(input: { card: { list: Array<{ form: string }> } }): DockLoad[] {
  return input.card.list
    .filter((n): n is SurfLoad => n.form === 'load' && (n as SurfLoad).dock === true)
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))
}

/** Generate code for the given target. */
function generate(input: { book: Book; target: Target; dock?: DockLoad[]; asyncMeta?: AsyncMeta }): string {
  const { book, target, dock, asyncMeta } = input
  switch (target) {
    case 'typescript':
      return castTS({ book, dock, asyncMeta })
    case 'rust':
      return castRust({ book, asyncMeta })
    case 'kotlin':
      return castKotlin({ book, asyncMeta })
    case 'swift':
      return castSwift({ book, asyncMeta })
    case 'hvm':
      return castHVM({ book })
  }
}
