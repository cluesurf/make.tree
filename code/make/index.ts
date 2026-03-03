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
import { loadBook } from '@/load'
import { renderInfoList } from '@/kink/render'
import type { Book, Info, Fill } from '@/term/form'
import type { Kink } from '@/kink/form'
import type { LoadEnv } from '@/load'
import type { SurfLoad } from '@/surf/form'
import type { DockLoad } from '@/cast/typescript'

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
  target: 'typescript' | 'hvm'
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
  target: 'typescript' | 'hvm'
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
 * Type-check every definition in a book.
 * Returns Kink errors for any type mismatches.
 */
function checkBook(input: { book: Book }): Kink[] {
  const { book } = input
  const allErrors: Kink[] = []

  for (const [name, term] of book) {
    const result = check({ term, book })
    if (result) {
      const errors = renderInfoList({
        logs: result.state.logs,
        fill: result.state.fill,
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
function generate(input: { book: Book; target: 'typescript' | 'hvm'; dock?: DockLoad[]; asyncMeta?: AsyncMeta }): string {
  const { book, target, dock, asyncMeta } = input
  switch (target) {
    case 'typescript':
      return castTS({ book, dock, asyncMeta })
    case 'hvm':
      return castHVM({ book })
  }
}
