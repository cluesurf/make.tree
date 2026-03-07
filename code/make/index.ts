/**
 * Compiler public API.
 *
 * Wires the full pipeline: parse -> read -> fuse -> desugar -> check -> codegen.
 * Returns compiled code along with any errors collected during type checking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readCard, readCardTolerant } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard, desugarCardTolerant, type AsyncMeta, type FirmSet } from '@/term/desugar'
import { check } from '@/term/check'
import { checkTotal } from '@/term/total'
import { castBook as castTS, castBookToFiles as castTSFiles } from '@/cast/typescript'
import { castBook as castHVM } from '@/cast/hvm'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import { loadBook, loadPackage, discoverFiles } from '@/load'
import { extractSkele } from '@/resolve/skeleton'
import { initResolver, resolveTemplates } from '@/resolve'
import { analyzePurity, type PurityMap } from '@/term/purity'
import { compileHybrid as castHybrid, type HybridResult, type NativeTarget } from '@/cast/hybrid'
import { discoverDeckEnv, createDeckLoadEnv } from '@/deck'
import { renderInfoList } from '@/kink/render'
import { makeKink } from '@/kink/form'
import { VOID_SITE } from '@/kink/site'
import { hashContent } from '@/cache/hash'
import { createStore, type CacheStore } from '@/cache/store'
import { createGraph, addEdge, getDirtySet, serializeGraph, deserializeGraph } from '@/cache/graph'
import { cardSignatures } from '@/cache/signature'
import type { Book, Info, Fill } from '@/term/form'
import type { Kink } from '@/kink/form'
import type { LoadEnv } from '@/load'
import type { Surf, SurfCard, SurfLoad } from '@/surf/form'
import type { DockLoad } from '@/load'

export type Target = 'typescript' | 'rust' | 'kotlin' | 'swift' | 'hvm'

export type CompileResult = {
  code: string
  errors: Kink[]
  files: string[]
  book: Book
  purityMap?: PurityMap
}

export type CompileFilesResult = {
  codeFiles: Map<string, string>
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
  const { book, files, firmSet, asyncMeta, dock } = result

  const dockNames = extractDockNames({ dock: dock ?? [] })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const errors = checkBook({ book, firmSet })
  const code = generate({ book, target, dock, asyncMeta })

  return { code, errors, files, book, purityMap }
}

/**
 * Compile a multi-file project to separate TS files with import/export.
 * Each .tree file produces one .ts file. Cross-file references become imports.
 */
export function compileToFiles(input: {
  file: string
  env: LoadEnv
}): CompileFilesResult {
  const { file, env } = input

  const result = loadBook({ file, env })
  const { book, files, fileMap, firmSet } = result

  const errors = checkBook({ book, firmSet })
  const codeFiles = castTSFiles({ book, fileMap })

  return { codeFiles, errors, files, book }
}

/**
 * Compile a multi-file package using skeleton-first resolution.
 * Handles circular references between files within the package,
 * including template-generated names.
 */
export function compilePackage(input: {
  file: string
  env: LoadEnv
  target: Target
}): CompileResult & { resolveErrors: import('@/resolve').ResolveError[] } {
  const { file, env, target } = input

  const result = loadPackage({ file, env })
  const { book, files, firmSet, asyncMeta, resolveErrors, dock } = result

  const dockNames = extractDockNames({ dock: dock ?? [] })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const errors = checkBook({ book, firmSet })
  const code = generate({ book, target, asyncMeta })

  return { code, errors, files, book, purityMap, resolveErrors }
}

/**
 * Compile a deck (package) by its root directory.
 * Uses the deck.tree package manager to resolve package imports.
 *
 * This is the primary entry point for compiling a full project.
 * It reads deck.tree, discovers workspaces, resolves package paths
 * through the link/ directory, and compiles everything.
 */
export function compileDeck(input: {
  root: string
  file: string
  target: Target
  parse: (input: { file: string; text: string }) => { tree: any } | null
}): CompileResult & { resolveErrors: import('@/resolve').ResolveError[] } {
  const { root, file, target, parse } = input

  const deckEnv = discoverDeckEnv({ root })
  const loadEnv = createDeckLoadEnv({ env: deckEnv, parse })

  return compilePackage({ file, env: loadEnv, target })
}

/**
 * Compile a package with hybrid HVM/native splitting.
 * Pure definitions are compiled to HVM interaction nets.
 * Effectful definitions are compiled to the native target.
 */
export function compilePackageHybrid(input: {
  file: string
  env: LoadEnv
  nativeTarget: NativeTarget
}): CompileResult & { hybrid: HybridResult; purityMap: PurityMap } {
  const { file, env, nativeTarget } = input

  const result = loadPackage({ file, env })
  const { book, files, firmSet, asyncMeta, dock } = result

  const dockNames = extractDockNames({ dock: dock ?? [] })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const errors = checkBook({ book, firmSet })
  const hybrid = castHybrid({
    book,
    purityMap,
    nativeTarget,
    asyncMeta,
  })

  const code = hybrid.nativeCode

  return { code, errors, files, book, hybrid, purityMap }
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
  const { book, asyncMeta, firmSet } = desugarCard({ card })

  const dockNames = extractDockNames({ dock })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const errors = checkBook({ book, firmSet })
  const code = generate({ book, target, dock, asyncMeta })

  return { code, errors, files: [file], book, purityMap }
}

/**
 * Error-tolerant compile: collects parse/read/desugar errors without throwing.
 * Always returns partial results. Used by the language server.
 */
export function compileTextTolerant(input: {
  text: string
  file: string
  target: Target
  parse: (input: { file: string; text: string }) => { tree: any } | null
}): CompileResult {
  const { text, file, target, parse } = input
  const allErrors: Kink[] = []

  const lead = parse({ file, text })
  if (!lead || !lead.tree) {
    return { code: '', errors: [], files: [file], book: new Map() }
  }

  const { card: rawCard, errors: readErrors } = readCardTolerant({ tree: lead.tree, file })
  allErrors.push(...readErrors)

  const card = expandFuse({ card: rawCard })
  const dock = extractDockLoads({ card })
  const { book, asyncMeta, firmSet, errors: desugarErrors } = desugarCardTolerant({ card })
  allErrors.push(...desugarErrors)

  const dockNames = extractDockNames({ dock })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const checkErrors = checkBook({ book, firmSet })
  allErrors.push(...checkErrors)

  const code = generate({ book, target, dock, asyncMeta })

  return { code, errors: allErrors, files: [file], book, purityMap }
}

/**
 * Incremental compile: only re-parse files whose content has changed.
 *
 * Uses content hashing, a dependency graph, and signature diffing to
 * determine the minimal set of files to recompile.
 *
 * Signature firewall: when a file changes, we compare old vs new
 * definition signatures. If only bodies changed (signature unchanged),
 * dependents are NOT re-desugared. This makes body-only edits fast
 * (<50ms target).
 *
 * Cache layers:
 *   - Per-file SurfCard cache (Phase 0+1: parse + fuse)
 *   - Per-file signature cache (for firewall comparison)
 *   - Dependency graph cache
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

  // Phase 1: discover all files via load/bear resolution (lightweight, no desugar).
  const visited = new Set<string>()
  const allFiles: string[] = []
  discoverFiles({ file, env, visited, files: allFiles })

  // Phase 2: hash each file and determine which changed.
  const newIndex: Record<string, string> = {}
  const contentChanged = new Set<string>()

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
      contentChanged.add(f)
    }
  }

  // Phase 3: load old graph and old signatures.
  const graphRaw = store.readRaw({ name: 'graph.json' })
  const oldGraph = graphRaw ? deserializeGraph({ json: graphRaw }) : createGraph()
  const oldSigsRaw = store.readRaw({ name: 'signatures.json' })
  const oldSigs: Record<string, Record<string, string>> = oldSigsRaw
    ? JSON.parse(oldSigsRaw)
    : {}

  // Phase 4: re-parse changed files, extract skeletons, resolve templates.
  const freshGraph = createGraph()
  const rawCards = new Map<string, SurfCard>()
  const newSigs: Record<string, Record<string, string>> = {}
  let cached = 0
  let recompiled = 0
  const signatureChanged = new Set<string>()

  for (const f of allFiles) {
    const hash = newIndex[f]
    if (!hash) continue

    let rawCard: SurfCard | null = null

    if (!contentChanged.has(f) && store.has({ hash, phase: 'rawcard' })) {
      rawCard = store.read({ hash, phase: 'rawcard' }) as SurfCard | null
      cached++
    }

    if (!rawCard) {
      let text: string
      try {
        text = env.readFile(f)
      } catch {
        continue
      }

      const lead = env.parse({ file: f, text })
      if (!lead || !lead.tree) continue

      rawCard = readCard({ tree: lead.tree, file: f })

      store.write({ hash, phase: 'rawcard', data: rawCard })
      recompiled++
    }

    rawCards.set(f, rawCard)

    // Update dependency graph from raw card
    for (const node of rawCard.list) {
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
  }

  // Phase 4b: skeleton-first template resolution across all files.
  const skeletons = new Map<string, import('@/resolve/skeleton').FileSkele>()
  for (const [f, rawCard] of rawCards) {
    skeletons.set(f, extractSkele({ card: rawCard }))
  }
  const resolverState = initResolver({ skeletons })
  resolveTemplates({ state: resolverState })

  // Collect package-wide tree templates for cross-file fuse expansion.
  const allTrees = new Map<string, import('@/surf/form').SurfTree>()
  for (const [, rawCard] of rawCards) {
    for (const node of rawCard.list) {
      if (node.form === 'tree') {
        allTrees.set(node.name, node as import('@/surf/form').SurfTree)
      }
    }
  }

  // Phase 4c: expand fuses with package-wide trees, compute signatures.
  const cards = new Map<string, SurfCard>()
  for (const [f, rawCard] of rawCards) {
    const card = expandFuse({ card: rawCard, externalTrees: allTrees })
    cards.set(f, card)

    // Compute signatures for this file
    const fileSigs = cardSignatures({ list: card.list })
    const fileSigsObj: Record<string, string> = {}
    for (const [name, sig] of fileSigs) {
      fileSigsObj[name] = sig
    }
    newSigs[f] = fileSigsObj

    // Compare with old signatures to detect signature-level changes
    if (contentChanged.has(f)) {
      const oldFileSigs = oldSigs[f]
      if (!oldFileSigs) {
        signatureChanged.add(f)
      } else {
        const oldKeys = new Set(Object.keys(oldFileSigs))
        const newKeys = new Set(Object.keys(fileSigsObj))

        // Check for added/removed definitions
        for (const k of newKeys) {
          if (!oldKeys.has(k)) { signatureChanged.add(f); break }
        }
        if (!signatureChanged.has(f)) {
          for (const k of oldKeys) {
            if (!newKeys.has(k)) { signatureChanged.add(f); break }
          }
        }
        // Check for changed signatures
        if (!signatureChanged.has(f)) {
          for (const k of newKeys) {
            if (fileSigsObj[k] !== oldFileSigs[k]) {
              signatureChanged.add(f)
              break
            }
          }
        }
      }
    }
  }

  // Phase 5: compute dirty set using signature-aware propagation.
  // Only files with signature changes propagate to dependents.
  const dirty = getDirtySet({ graph: freshGraph.rdeps.size > 0 ? freshGraph : oldGraph, changed: signatureChanged })
  // Also include all content-changed files (they need re-desugar regardless)
  for (const f of contentChanged) {
    dirty.add(f)
  }

  // Phase 6: desugar all cards into a single Book.
  // Core Terms use HOAS (functions) so they can't be JSON-cached.
  // We always re-desugar from cached SurfCards, which is fast enough.
  const book: Book = new Map()
  let asyncMeta: AsyncMeta | undefined
  const firmSet: FirmSet = new Set()
  const allDock: DockLoad[] = []

  for (const [f, card] of cards) {
    // Skip non-code files from desugaring
    if (env.resolveMillName) {
      const mill = env.resolveMillName(f)
      if (mill !== 'code') continue
    }

    const dock = extractDockLoads({ card })
    allDock.push(...dock)

    const result = desugarCardTolerant({ card })
    for (const [name, term] of result.book) {
      book.set(name, term)
    }
    if (result.asyncMeta.size > 0) {
      if (!asyncMeta) asyncMeta = new Map()
      for (const [name, val] of result.asyncMeta) {
        asyncMeta.set(name, val)
      }
    }
    for (const name of result.firmSet) {
      firmSet.add(name)
    }
  }

  // Phase 7: purity analysis, type-check, and generate code.
  const dockNames = extractDockNames({ dock: allDock })
  const purityMap = analyzePurity({ book, asyncMeta, dockNames })

  const errors = checkBook({ book, firmSet })
  const code = generate({ book, target, dock: allDock, asyncMeta })

  // Phase 8: persist cache.
  store.setIndex({ index: { files: newIndex } })
  store.writeRaw({ name: 'graph.json', data: serializeGraph({ graph: freshGraph }) })
  store.writeRaw({ name: 'signatures.json', data: JSON.stringify(newSigs) })

  return { code, errors, files: allFiles, book, purityMap, cached, recompiled }
}

/**
 * Type-check every definition in a book.
 * Also runs totality checking for definitions marked with `firm true`.
 * Returns Kink errors for any type mismatches or totality failures.
 */
function checkBook(input: { book: Book; firmSet?: FirmSet }): Kink[] {
  const { book, firmSet } = input
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
    }

    // Totality check for firm definitions
    if (firmSet?.has(name)) {
      const totalResult = checkTotal({ name, term, book })
      if (!totalResult.ok) {
        allErrors.push(
          makeKink({
            form: 'total-bad',
            rank: 'halt',
            site: VOID_SITE,
            text: totalResult.reason,
            rest: { name },
          }),
        )
      }
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

/** Extract the set of names introduced by dock loads (native module refs). */
function extractDockNames(input: { dock: DockLoad[] }): Set<string> {
  const names = new Set<string>()
  for (const d of input.dock) {
    if (d.name) names.add(d.name)
  }
  return names
}

/** Generate code for the given target. */
function generate(input: { book: Book; target: Target; dock?: DockLoad[]; asyncMeta?: AsyncMeta }): string {
  const { book, target, dock, asyncMeta } = input
  switch (target) {
    case 'typescript':
      return castTS({ book, dock, asyncMeta })
    case 'rust':
      return castRust({ book, dock, asyncMeta })
    case 'kotlin':
      return castKotlin({ book, dock, asyncMeta })
    case 'swift':
      return castSwift({ book, dock, asyncMeta })
    case 'hvm':
      return castHVM({ book, asyncMeta })
  }
}
