/**
 * Generic string parser engine.
 *
 * A class that takes mine/mint definitions and parses strings into
 * AST nodes in a single pass. Mine (pattern matching) and mint (AST
 * construction) execute together: when a mine rule matches and has
 * a `take`, the corresponding mint case fires immediately.
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

  constructor(input: {
    mine: Map<string, MineDef>
    mint: Map<string, MintDef>
    entry?: string
  }) {
    this.mineDefs = input.mine
    this.mintDefs = input.mint
    this.entry = input.entry ?? 'tree'
  }

  parse(input: { text: string, file: string }): ParseResult {
    const { text } = input
    const errors: ParseError[] = []

    const ctx: ParseCtx = {
      text,
      mineDefs: this.mineDefs,
      mintDefs: this.mintDefs,
      errors,
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
      errors.push({
        message: `Failed to match root rule: ${this.entry}`,
        line: 1, col: 1, pos: 0,
      })
      return { output: undefined, errors }
    }

    if (result.end < text.length) {
      const lc = posToLineCol({ text, pos: result.end })
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

  const node: AstNode = { form: mintDef.make.type }
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
      return matchLiteral({ text: ctx.text, lit: rule.text, pos })
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
  if (!def) return { match: false, end: pos }

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
      if (!buildResult) return { match: false, end: pos }
      addToSlot({ slots, name: mintCase.slot, value: buildResult.node })
      return { match: true, end: buildResult.end }
    }
  }

  if (mintCase && !mintCase.mint) {
    const childCaseMap = new Map<string, CaseEntry>()
    const childSlots = new Map<string, unknown>()
    const result = walkRule({ ctx, rule: def.rule, pos, env: childEnv, caseMap: childCaseMap, slots: childSlots })
    if (!result.match) return { match: false, end: pos }
    const matched = ctx.text.slice(pos, result.end)
    addToSlot({ slots, name: mintCase.slot, value: matched })
    return result
  }

  return walkRule({ ctx, rule: def.rule, pos, env: childEnv, caseMap, slots })
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

function matchLiteral(input: { text: string, lit: string, pos: number }): MatchResult {
  const { text, lit, pos } = input
  if (pos + lit.length > text.length) return { match: false, end: pos }
  for (let i = 0; i < lit.length; i++) {
    if (text[pos + i] !== lit[i]) return { match: false, end: pos }
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

function posToLineCol(input: { text: string, pos: number }): { line: number, col: number } {
  const { text, pos } = input
  let line = 1, col = 1
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') { line++; col = 1 } else { col++ }
  }
  return { line, col }
}

export type { MineDef, MintDef, MineRule, AstNode, ParseResult, ParseError } from './form'
