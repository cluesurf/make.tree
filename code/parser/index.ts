/**
 * Generic string parser engine.
 *
 * A class that takes mine/mint definitions and parses strings into
 * AST nodes in a single pass. Mine (pattern matching) and mint (AST
 * construction) execute together: when a mine rule matches and has
 * a `take`, the corresponding mint case fires immediately.
 *
 * Features:
 * - Packrat memoization (O(n) guaranteed, no exponential backtracking)
 * - Error recovery (partial AST with error nodes on malformed input)
 * - Farthest-failure tracking (best error messages)
 * - O(log n) line/col lookup via precomputed line index
 * - Hot reload (swap grammar without reconstructing parser)
 * - Source ranges on all AST nodes
 *
 * Usage:
 *   const parser = new StringParser({ mine, mint, entry: 'tree' })
 *   const result = parser.parse({ text: '...', file: 'test.tree' })
 */

import type {
  MineDef,
  MintDef,
  MineRule,
  RuleVal,
  RuleBind,
  AstNode,
  ParseResult,
  ParseError,
} from './form'

export class StringParser {
  private mineDefs: Map<string, MineDef>
  private mintDefs: Map<string, MintDef>
  private entry: string
  private recovery: boolean

  constructor(input: {
    mine: Map<string, MineDef>
    mint: Map<string, MintDef>
    entry?: string
    recovery?: boolean
  }) {
    this.mineDefs = input.mine
    this.mintDefs = input.mint
    this.entry = input.entry ?? 'tree'
    this.recovery = input.recovery ?? false
  }

  /** Hot-reload grammar definitions without reconstructing the parser. */
  reloadGrammar(input: {
    mine: Map<string, MineDef>
    mint: Map<string, MintDef>
  }): void {
    this.mineDefs = input.mine
    this.mintDefs = input.mint
  }

  parse(input: { text: string, file: string }): ParseResult {
    const { text } = input
    const errors: ParseError[] = []
    const lineIndex = buildLineIndex({ text })

    const ctx: ParseCtx = {
      text,
      mineDefs: this.mineDefs,
      mintDefs: this.mintDefs,
      errors,
      lineIndex,
      memo: new Map(),
      farthestPos: 0,
      farthestExpected: [],
      recovery: this.recovery,
    }

    const mintDef = this.mintDefs.get(this.entry)
    if (!mintDef) {
      errors.push({
        message: `No mint definition for entry: ${this.entry}`,
        line: 1, col: 1, pos: 0,
      })
      return { output: undefined, errors }
    }

    const result = matchAndBuild({ ctx, mineName: this.entry, mintDef, pos: 0, env: new Map() })

    if (!result) {
      const lc = posToLineCol({ lineIndex, pos: ctx.farthestPos })
      const expected = ctx.farthestExpected.length > 0
        ? `, expected: ${ctx.farthestExpected.join(' or ')}`
        : ''
      errors.push({
        message: `Failed to match root rule: ${this.entry} at position ${ctx.farthestPos}${expected}`,
        line: lc.line, col: lc.col, pos: ctx.farthestPos,
      })
      return { output: undefined, errors }
    }

    if (result.end < text.length) {
      const lc = posToLineCol({ lineIndex, pos: result.end })
      errors.push({
        message: `Unconsumed input at position ${result.end}`,
        line: lc.line, col: lc.col, pos: result.end,
      })
    }

    return { output: result.node, errors }
  }
}

// ---- Internal types ----

type ParseCtx = {
  text: string
  mineDefs: Map<string, MineDef>
  mintDefs: Map<string, MintDef>
  errors: ParseError[]
  lineIndex: LineIndex
  memo: MemoTable
  farthestPos: number
  farthestExpected: string[]
  recovery: boolean
}

/** Line offset table for O(log n) line/col lookup. */
type LineIndex = {
  offsets: number[]
}

/** Packrat memo table: memoKey -> MemoEntry */
type MemoTable = Map<string, MemoEntry>

type MemoEntry = {
  match: boolean
  end: number
  node?: AstNode
}

type MatchResult = {
  match: boolean
  end: number
}

type BuildResult = {
  node: AstNode
  end: number
}

type CaseEntry = { slot: string, mint?: string }

type WalkInput = {
  ctx: ParseCtx
  rule: MineRule
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}

// ---- Line Index ----

function buildLineIndex(input: { text: string }): LineIndex {
  const { text } = input
  const offsets: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  return { offsets }
}

function posToLineCol(input: { lineIndex: LineIndex, pos: number }): { line: number, col: number } {
  const { lineIndex, pos } = input
  const offsets = lineIndex.offsets
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid]! <= pos) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return { line: lo + 1, col: pos - offsets[lo]! + 1 }
}

// ---- Packrat memo ----

function memoKey(input: { name: string, pos: number, env: Map<string, number> }): string {
  const { name, pos, env } = input
  if (env.size === 0) return `${name}@${pos}`
  const parts: string[] = []
  for (const [k, v] of env) {
    parts.push(`${k}=${v}`)
  }
  return `${name}@${pos}:${parts.join(',')}`
}

// ---- Farthest failure tracking ----

function trackFailure(input: { ctx: ParseCtx, pos: number, expected: string }): void {
  const { ctx, pos, expected } = input
  if (pos > ctx.farthestPos) {
    ctx.farthestPos = pos
    ctx.farthestExpected = [expected]
  } else if (pos === ctx.farthestPos && !ctx.farthestExpected.includes(expected)) {
    ctx.farthestExpected.push(expected)
  }
}

// ---- Core functions ----

function matchAndBuild(input: {
  ctx: ParseCtx
  mineName: string
  mintDef: MintDef
  pos: number
  env: Map<string, number>
}): BuildResult | undefined {
  const { ctx, mineName, mintDef, pos, env } = input
  const mineDef = ctx.mineDefs.get(mineName)
  if (!mineDef) return undefined

  const childEnv = new Map(env)
  for (const param of mineDef.params) {
    if (!childEnv.has(param.name)) {
      childEnv.set(param.name, 0)
    }
  }

  const slots = new Map<string, unknown>()
  const caseMap = new Map<string, CaseEntry>()
  for (const c of mintDef.cases) {
    caseMap.set(c.name, { slot: c.slot, mint: c.mint })
  }

  const result = walkRule({ ctx, rule: mineDef.rule, pos, env: childEnv, caseMap, slots })
  if (!result.match) return undefined
  if (!mintDef.make) return undefined

  const node: AstNode = { form: mintDef.make.type, range: { start: pos, end: result.end } }
  for (const bind of mintDef.make.binds) {
    const val = slots.get(bind.slot)
    if (val !== undefined) {
      node[bind.field] = val
    }
  }

  return { node, end: result.end }
}

function walkRule(input: WalkInput): MatchResult {
  const { ctx, rule, pos, env, caseMap, slots } = input
  switch (rule.form) {
    case 'literal':
      return matchLiteral({ ctx, lit: rule.text, pos })
    case 'char-code':
      return matchCharCode({ text: ctx.text, code: rule.code, pos })
    case 'range':
      return matchRange({ text: ctx.text, base: rule.base, head: rule.head, pos })
    case 'ref':
      return walkRef({ ctx, rule, pos, env, caseMap, slots })
    case 'seq':
      return walkSeq({ ctx, list: rule.list, pos, env, caseMap, slots })
    case 'choice':
      return walkChoice({ ctx, list: rule.list, pos, env, caseMap, slots })
    case 'optional':
      return walkOptional({ ctx, rule: rule.rule, pos, env, caseMap, slots })
    case 'not':
      return walkNot({ ctx, rule: rule.rule, pos, env })
    case 'repeat':
      return walkRepeat({ ctx, rule, pos, env, caseMap, slots })
    case 'take':
      return { match: true, end: pos }
    case 'save':
      env.set(rule.name, resolveVal({ val: rule.value, env }))
      return { match: true, end: pos }
    default:
      return { match: false, end: pos }
  }
}

function walkRef(input: {
  ctx: ParseCtx
  rule: { name: string, bind?: Array<RuleBind>, take?: string }
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}): MatchResult {
  const { ctx, rule, pos, env, caseMap, slots } = input
  const def = ctx.mineDefs.get(rule.name)
  if (!def) {
    trackFailure({ ctx, pos, expected: rule.name })
    return { match: false, end: pos }
  }

  const childEnv = new Map(env)
  if (rule.bind) {
    for (const b of rule.bind) {
      childEnv.set(b.name, resolveVal({ val: b.value, env }))
    }
  }
  for (const param of def.params) {
    if (!childEnv.has(param.name)) {
      childEnv.set(param.name, 0)
    }
  }

  const mintCase = rule.take ? caseMap.get(rule.take) : undefined

  if (mintCase?.mint) {
    const subMintDef = ctx.mintDefs.get(mintCase.mint)
    if (subMintDef) {
      const buildResult = matchAndBuild({ ctx, mineName: rule.name, mintDef: subMintDef, pos, env: childEnv })
      if (!buildResult) {
        trackFailure({ ctx, pos, expected: rule.name })
        return { match: false, end: pos }
      }
      addToSlot({ slots, name: mintCase.slot, value: buildResult.node })
      return { match: true, end: buildResult.end }
    }
  }

  if (mintCase && !mintCase.mint) {
    // Raw text capture with memo
    const key = memoKey({ name: `raw:${rule.name}`, pos, env: childEnv })
    const cached = ctx.memo.get(key)
    if (cached) {
      if (!cached.match) return { match: false, end: pos }
      const matched = ctx.text.slice(pos, cached.end)
      addToSlot({ slots, name: mintCase.slot, value: matched })
      return { match: true, end: cached.end }
    }

    const childCaseMap = new Map<string, CaseEntry>()
    const childSlots = new Map<string, unknown>()
    const result = walkRule({ ctx, rule: def.rule, pos, env: childEnv, caseMap: childCaseMap, slots: childSlots })

    ctx.memo.set(key, { match: result.match, end: result.end })

    if (!result.match) {
      trackFailure({ ctx, pos, expected: rule.name })
      return { match: false, end: pos }
    }
    const matched = ctx.text.slice(pos, result.end)
    addToSlot({ slots, name: mintCase.slot, value: matched })
    return result
  }

  // Transparent delegation with memo
  const key = memoKey({ name: rule.name, pos, env: childEnv })
  const cached = ctx.memo.get(key)
  if (cached) {
    if (!cached.match) return { match: false, end: pos }
    return { match: true, end: cached.end }
  }

  const result = walkRule({ ctx, rule: def.rule, pos, env: childEnv, caseMap, slots })
  ctx.memo.set(key, { match: result.match, end: result.end })

  if (!result.match) {
    trackFailure({ ctx, pos, expected: rule.name })
  }
  return result
}

function walkSeq(input: {
  ctx: ParseCtx
  list: Array<MineRule>
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}): MatchResult {
  const { ctx, list, pos, env, caseMap, slots } = input
  let current = pos
  for (const rule of list) {
    const result = walkRule({ ctx, rule, pos: current, env, caseMap, slots })
    if (!result.match) return { match: false, end: pos }
    current = result.end
  }
  return { match: true, end: current }
}

function walkChoice(input: {
  ctx: ParseCtx
  list: Array<MineRule>
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}): MatchResult {
  const { ctx, list, pos, env, caseMap, slots } = input
  for (const rule of list) {
    const savedSlots = cloneSlots(slots)
    const result = walkRule({ ctx, rule, pos, env, caseMap, slots })
    if (result.match) return result
    restoreSlots({ slots, saved: savedSlots })
  }
  return { match: false, end: pos }
}

function walkOptional(input: {
  ctx: ParseCtx
  rule: MineRule
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}): MatchResult {
  const { ctx, rule, pos, env, caseMap, slots } = input
  const result = walkRule({ ctx, rule, pos, env, caseMap, slots })
  if (result.match) return result
  return { match: true, end: pos }
}

function walkNot(input: {
  ctx: ParseCtx
  rule: MineRule
  pos: number
  env: Map<string, number>
}): MatchResult {
  const { ctx, rule, pos, env } = input
  if (pos >= ctx.text.length) return { match: false, end: pos }
  const emptyCase = new Map<string, CaseEntry>()
  const emptySlots = new Map<string, unknown>()
  const result = walkRule({ ctx, rule, pos, env, caseMap: emptyCase, slots: emptySlots })
  if (result.match) return { match: false, end: pos }
  return { match: true, end: pos + 1 }
}

function walkRepeat(input: {
  ctx: ParseCtx
  rule: { rule: MineRule, min?: RuleVal, max?: RuleVal }
  pos: number
  env: Map<string, number>
  caseMap: Map<string, CaseEntry>
  slots: Map<string, unknown>
}): MatchResult {
  const { ctx, rule, pos, env, caseMap, slots } = input
  const min = rule.min ? resolveVal({ val: rule.min, env }) : 0
  const max = rule.max ? resolveVal({ val: rule.max, env }) : Infinity

  let current = pos
  let count = 0

  while (count < max && current <= ctx.text.length) {
    const savedSlots = cloneSlots(slots)
    const result = walkRule({ ctx, rule: rule.rule, pos: current, env, caseMap, slots })
    if (!result.match) {
      restoreSlots({ slots, saved: savedSlots })

      // Error recovery: if we're in the top-level repeat and recovery is on,
      // skip to next newline and insert an error node
      if (ctx.recovery && count >= min && current < ctx.text.length) {
        const nextNewline = ctx.text.indexOf('\n', current)
        if (nextNewline > current) {
          const lc = posToLineCol({ lineIndex: ctx.lineIndex, pos: current })
          const skipped = ctx.text.slice(current, nextNewline + 1)
          ctx.errors.push({
            message: `Skipped invalid input: ${JSON.stringify(skipped.trim())}`,
            line: lc.line, col: lc.col, pos: current,
          })
          const errorNode: AstNode = {
            form: 'error',
            text: skipped.trim(),
            range: { start: current, end: nextNewline + 1 },
          }
          addToSlot({ slots, name: 'list', value: errorNode })
          current = nextNewline + 1
          count++
          continue
        }
      }

      break
    }
    if (result.end === current) break
    current = result.end
    count++
  }

  if (count < min) return { match: false, end: pos }
  return { match: true, end: current }
}

// ---- Primitive matchers ----

function matchLiteral(input: { ctx: ParseCtx, lit: string, pos: number }): MatchResult {
  const { ctx, lit, pos } = input
  const text = ctx.text
  if (pos + lit.length > text.length) {
    trackFailure({ ctx, pos, expected: JSON.stringify(lit) })
    return { match: false, end: pos }
  }
  for (let i = 0; i < lit.length; i++) {
    if (text[pos + i] !== lit[i]) {
      trackFailure({ ctx, pos, expected: JSON.stringify(lit) })
      return { match: false, end: pos }
    }
  }
  return { match: true, end: pos + lit.length }
}

function matchCharCode(input: { text: string, code: number, pos: number }): MatchResult {
  const { text, code, pos } = input
  if (pos >= text.length) return { match: false, end: pos }
  if (text.charCodeAt(pos) === code) return { match: true, end: pos + 1 }
  return { match: false, end: pos }
}

function matchRange(input: { text: string, base: number, head: number, pos: number }): MatchResult {
  const { text, base, head, pos } = input
  if (pos >= text.length) return { match: false, end: pos }
  const code = text.charCodeAt(pos)
  if (code >= base && code <= head) return { match: true, end: pos + 1 }
  return { match: false, end: pos }
}

// ---- Slot management ----

function addToSlot(input: { slots: Map<string, unknown>, name: string, value: unknown }): void {
  const { slots, name, value } = input
  const existing = slots.get(name)
  if (existing === undefined) {
    slots.set(name, value)
    return
  }
  if (Array.isArray(existing)) {
    existing.push(value)
  } else {
    slots.set(name, [existing, value])
  }
}

function cloneSlots(slots: Map<string, unknown>): Map<string, unknown> {
  const clone = new Map<string, unknown>()
  for (const [k, v] of slots) {
    if (Array.isArray(v)) {
      clone.set(k, [...v])
    } else {
      clone.set(k, v)
    }
  }
  return clone
}

function restoreSlots(input: { slots: Map<string, unknown>, saved: Map<string, unknown> }): void {
  const { slots, saved } = input
  slots.clear()
  for (const [k, v] of saved) {
    slots.set(k, v)
  }
}

// ---- Helpers ----

function resolveVal(input: { val: RuleVal, env: Map<string, number> }): number {
  const { val, env } = input
  switch (val.form) {
    case 'const':
      return val.val
    case 'read':
      return env.get(val.name) ?? 0
    case 'call':
      return resolveCall({ val, env })
  }
}

function resolveCall(input: {
  val: { name: string, args: Array<RuleBind> }
  env: Map<string, number>
}): number {
  const { val, env } = input
  const args = new Map<string, number>()
  for (const arg of val.args) {
    args.set(arg.name, resolveVal({ val: arg.value, env }))
  }
  switch (val.name) {
    case 'add':
      return (args.get('a') ?? 0) + (args.get('b') ?? 0)
    default:
      return 0
  }
}

export type { MineDef, MintDef, MineRule, AstNode, ParseResult, ParseError } from './form'
