/**
 * Mint walker: execute mint rules to produce Surface AST nodes.
 *
 * Given a MintRule tree and a TakeMap (from the mine phase),
 * the walker reads labeled values and constructs Surface AST
 * nodes (SurfTask, SurfForm, SurfCall, etc.).
 */

import type { Site } from '@/kink/site'
import { VOID_SITE } from '@/kink/site'
import type { Kink } from '@/kink/form'
import { makeKink } from '@/kink/form'
import type { Surf } from '@/surf/form'
import type { TakeMap, TakeVal } from '@/mill/mine/walk'
import type {
  MintRule,
  MintForm,
  MintNamed,
  MintSave,
  MintLine,
  MintKnit,
  MintMake,
  MintBind,
  MintTurnSeed,
  MintFormRule,
  MintBase,
  MintLink,
} from './form'

/** Build context for mint walking. */
export type MintCtx = {
  /** All mint definitions (resolved from .note files). */
  formList: Map<string, MintForm>
  /** Accumulated errors. */
  kink: Kink[]
  /** Source file being processed. */
  file: string
}

/** Variable scope for mint execution. */
export type MintScope = {
  /** Named variables (from `save` and `link`). */
  vars: Map<string, unknown>
  /** Array variables (from `line`). */
  lists: Map<string, unknown[]>
  /** Hash map variables (from `knit`). */
  maps: Map<string, Map<string, unknown>>
  /** The take-map from the mine phase. */
  take: TakeMap
  /** Source location for the current node. */
  site: Site
}

/**
 * Execute a mint rule tree against a TakeMap to produce
 * a Surface AST node.
 */
export function walkMint(input: {
  rule: MintRule
  take: TakeMap
  ctx: MintCtx
  site: Site
}): Surf | undefined {
  const scope = makeScope(input.take, input.site)
  return walkRule(input.rule, scope, input.ctx)
}

/** Create a fresh scope from a TakeMap. */
function makeScope(take: TakeMap, site: Site): MintScope {
  return {
    vars: new Map(),
    lists: new Map(),
    maps: new Map(),
    take,
    site,
  }
}

/** Walk a single mint rule, returning a Surf node or undefined. */
function walkRule(
  rule: MintRule,
  scope: MintScope,
  ctx: MintCtx,
): Surf | undefined {
  switch (rule.form) {
    case 'mint-named':
      return walkMintNamed(rule, scope, ctx)
    case 'mint-save':
      return walkMintSave(rule, scope, ctx)
    case 'mint-line':
      return walkMintLine(rule, scope, ctx)
    case 'mint-knit':
      return walkMintKnit(rule, scope, ctx)
    case 'mint-make':
      return walkMintMake(rule, scope, ctx)
    case 'mint-bind':
      walkMintBind(rule, scope, ctx)
      return undefined
    case 'mint-turn-seed':
      return walkMintTurnSeed(rule, scope, ctx)
    case 'mint-form':
      return walkMintForm(rule, scope, ctx)
    case 'mint-base':
      walkMintBase(rule, scope, ctx)
      return undefined
    case 'mint-link':
      return walkMintLink(rule, scope, ctx)
    default:
      return undefined
  }
}

/**
 * mint <name> [, save <var>] [, form <form>]
 *
 * Read from the take-map entry labeled `name`. If `save` is set,
 * store the value. If `delegateForm` is set, run that mint def.
 * Then execute children.
 */
function walkMintNamed(
  rule: MintNamed,
  scope: MintScope,
  ctx: MintCtx,
): Surf | undefined {
  const takeVal = scope.take.get(rule.name)

  // If delegateForm is set, delegate to another mint def
  if (rule.delegateForm) {
    const def = ctx.formList.get(rule.delegateForm)
    if (def && takeVal) {
      if (takeVal.form === 'map') {
        const childScope = makeScope(takeVal.val, takeVal.site)
        const result = walkRule(def.rule, childScope, ctx)
        if (result && rule.save) {
          scope.vars.set(rule.save, result)
        }
        return result
      }
      if (takeVal.form === 'list') {
        // Process each item in the list
        for (const item of takeVal.val) {
          const childScope = makeScope(item, takeVal.site)
          const result = walkRule(def.rule, childScope, ctx)
          if (result) {
            // Execute children (line, knit, etc.)
            for (const child of rule.list) {
              walkRuleWithResult(child, result, scope, ctx)
            }
          }
        }
        return undefined
      }
    }
  }

  // Save the value if requested
  if (rule.save && takeVal) {
    scope.vars.set(rule.save, takeValToRaw(takeVal))
  }

  // Execute children
  let lastResult: Surf | undefined
  for (const child of rule.list) {
    const result = walkRule(child, scope, ctx)
    if (result) lastResult = result
  }

  return lastResult
}

/**
 * save <name>
 *
 * Store the current value into a variable.
 */
function walkMintSave(
  rule: MintSave,
  scope: MintScope,
  _ctx: MintCtx,
): undefined {
  const takeVal = scope.take.get(rule.name)
  if (takeVal) {
    scope.vars.set(rule.name, takeValToRaw(takeVal))
  }
  return undefined
}

/**
 * line <name>
 *
 * Append a value to an array variable.
 */
function walkMintLine(
  rule: MintLine,
  scope: MintScope,
  _ctx: MintCtx,
): undefined {
  if (!scope.lists.has(rule.name)) {
    scope.lists.set(rule.name, [])
  }
  // The value to append is the last computed result
  const list = scope.lists.get(rule.name)!
  const val = scope.vars.get('__result')
  if (val !== undefined) {
    list.push(val)
  }
  return undefined
}

/**
 * knit <name>, site <key>
 *
 * Add a value to a hash map keyed by another variable.
 */
function walkMintKnit(
  rule: MintKnit,
  scope: MintScope,
  _ctx: MintCtx,
): undefined {
  if (!scope.maps.has(rule.name)) {
    scope.maps.set(rule.name, new Map())
  }
  const map = scope.maps.get(rule.name)!
  const key = scope.vars.get(rule.site) as string | undefined
  const val = scope.vars.get('__result')
  if (key && val !== undefined) {
    map.set(key, val)
  }
  return undefined
}

/**
 * make <name>
 *
 * Construct a Surface AST node. Children are bind rules.
 */
function walkMintMake(
  rule: MintMake,
  scope: MintScope,
  ctx: MintCtx,
): Surf | undefined {
  const node: Record<string, unknown> = {
    form: rule.name,
    site: scope.site,
  }

  // Execute children (bind, base, turn seed)
  for (const child of rule.list) {
    if (child.form === 'mint-bind') {
      const val = resolveLink(child.link, scope)
      if (val !== undefined) {
        node[child.name] = val
      }
    } else if (child.form === 'mint-turn-seed') {
      // Finalize
      return node as unknown as Surf
    } else if (child.form === 'mint-base') {
      walkMintBase(child, scope, ctx)
    } else {
      walkRule(child, scope, ctx)
    }
  }

  return node as unknown as Surf
}

/**
 * bind <name>, link <var>
 *
 * Set a property on the node being constructed.
 */
function walkMintBind(
  rule: MintBind,
  scope: MintScope,
  _ctx: MintCtx,
): void {
  // This is handled inline by walkMintMake
}

/**
 * turn seed
 *
 * Finalize and return.
 */
function walkMintTurnSeed(
  rule: MintTurnSeed,
  scope: MintScope,
  ctx: MintCtx,
): Surf | undefined {
  if (rule.list.length === 0) {
    // Simple turn seed: return current result
    return scope.vars.get('__result') as Surf | undefined
  }

  // Execute children for configuration
  for (const child of rule.list) {
    walkRule(child, scope, ctx)
  }

  return scope.vars.get('__result') as Surf | undefined
}

/**
 * form <name>
 *
 * Delegate to another named mint rule.
 */
function walkMintForm(
  rule: MintFormRule,
  scope: MintScope,
  ctx: MintCtx,
): Surf | undefined {
  const def = ctx.formList.get(rule.name)
  if (!def) {
    ctx.kink.push(makeKink({
      form: 'mill-bad-rule', rank: 'halt', site: rule.site,
      text: `unknown mint rule reference: ${rule.name}`,
      rest: { rule: rule.name },
    }))
    return undefined
  }

  const result = walkRule(def.rule, scope, ctx)

  // Execute children
  for (const child of rule.list) {
    walkRule(child, scope, ctx)
  }

  return result
}

/**
 * base <name> [, term <val>]
 *
 * Reference a base value or set a property.
 */
function walkMintBase(
  rule: MintBase,
  scope: MintScope,
  ctx: MintCtx,
): void {
  if (rule.term) {
    scope.vars.set(rule.name, rule.term)
  }

  for (const child of rule.list) {
    walkRule(child, scope, ctx)
  }
}

/**
 * link <name>
 *
 * Read a variable from scope.
 */
function walkMintLink(
  rule: MintLink,
  scope: MintScope,
  _ctx: MintCtx,
): Surf | undefined {
  return scope.vars.get(rule.name) as Surf | undefined
}

// ---- Helpers ----

/** Resolve a link variable name to its value. */
function resolveLink(name: string, scope: MintScope): unknown {
  // Check vars first
  if (scope.vars.has(name)) return scope.vars.get(name)
  // Check lists
  if (scope.lists.has(name)) return scope.lists.get(name)
  // Check maps
  if (scope.maps.has(name)) {
    const map = scope.maps.get(name)!
    const obj: Record<string, unknown> = {}
    for (const [k, v] of map) obj[k] = v
    return obj
  }
  // Check take-map
  const takeVal = scope.take.get(name)
  if (takeVal) return takeValToRaw(takeVal)
  return undefined
}

/** Convert a TakeVal to a raw JS value. */
function takeValToRaw(val: TakeVal): unknown {
  switch (val.form) {
    case 'text': return val.val
    case 'mark': return val.val
    case 'path': return val.val
    case 'list': return val.val.map(m => takeMapToObj(m))
    case 'tree': return val.val
    case 'map': return takeMapToObj(val.val)
  }
}

/** Convert a TakeMap to a plain object. */
function takeMapToObj(map: TakeMap): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of map) {
    obj[k] = takeValToRaw(v)
  }
  return obj
}

/** Execute a rule with a pre-computed result value. */
function walkRuleWithResult(
  rule: MintRule,
  result: Surf,
  scope: MintScope,
  ctx: MintCtx,
): void {
  scope.vars.set('__result', result as unknown as string)
  walkRule(rule, scope, ctx)
}
