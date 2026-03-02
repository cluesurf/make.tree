/**
 * Error types for all compiler phases.
 *
 * Every error carries a source location so the formatter can show
 * the exact line in the user's .tree file.
 */

import type { Site } from '@/kink/site'

/** Error severity levels. */
export type KinkRank = 'halt' | 'tell' | 'hint'

/** Base error shape. All errors extend this. */
export type KinkBase = {
  form: string
  rank: KinkRank
  site: Site
  text: string
}

// Phase 0: Tree parse errors
export type KinkTreeBadIndent = KinkBase & {
  form: 'tree-bad-indent'
}

export type KinkTreeBadChar = KinkBase & {
  form: 'tree-bad-char'
}

// Phase 1: Mill errors (mine/mint)
export type KinkMillBadKeyword = KinkBase & {
  form: 'mill-bad-keyword'
  name: string
}

export type KinkMillMissField = KinkBase & {
  form: 'mill-miss-field'
  need: string
  have: string
}

export type KinkMillBadSift = KinkBase & {
  form: 'mill-bad-sift'
}

export type KinkMillBadRule = KinkBase & {
  form: 'mill-bad-rule'
  rule: string
}

// Phase 2: Resolve errors
export type KinkNameMiss = KinkBase & {
  form: 'name-miss'
  name: string
}

export type KinkNameDouble = KinkBase & {
  form: 'name-double'
  name: string
  prev: Site
}

export type KinkLoadCircle = KinkBase & {
  form: 'load-circle'
  path: string[]
}

// Phase 3: Desugar errors
export type KinkDesugarBad = KinkBase & {
  form: 'desugar-bad'
  surf: string
}

// Phase 4: Type check errors
export type KinkTypeMismatch = KinkBase & {
  form: 'type-mismatch'
  need: string
  have: string
  term: string
}

export type KinkTypeMissArm = KinkBase & {
  form: 'type-miss-arm'
  name: string
  arms: string[]
}

export type KinkTypeHoleMiss = KinkBase & {
  form: 'type-hole-miss'
  name: string
  fill: string
}

export type KinkPureBad = KinkBase & {
  form: 'pure-bad'
  name: string
  call: string
}

// Phase 5: Generate errors
export type KinkEmitBad = KinkBase & {
  form: 'emit-bad'
  back: string
}

/** Union of all error types. */
export type Kink =
  | KinkTreeBadIndent
  | KinkTreeBadChar
  | KinkMillBadKeyword
  | KinkMillMissField
  | KinkMillBadSift
  | KinkMillBadRule
  | KinkNameMiss
  | KinkNameDouble
  | KinkLoadCircle
  | KinkDesugarBad
  | KinkTypeMismatch
  | KinkTypeMissArm
  | KinkTypeHoleMiss
  | KinkPureBad
  | KinkEmitBad

/** Create an error. */
export function makeKink(input: {
  form: Kink['form']
  rank: KinkRank
  site: Site
  text: string
  rest?: Record<string, unknown>
}): Kink {
  return { form: input.form, rank: input.rank, site: input.site, text: input.text, ...input.rest } as Kink
}
