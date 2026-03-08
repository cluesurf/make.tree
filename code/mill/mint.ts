/**
 * Term mill mint walker.
 *
 * Executes mint rules against a TakeMap (from the mine phase)
 * to construct Surface AST nodes. Uses the case/slot/hook-make
 * pattern from the canonical DSL.
 */

import type { Surf } from '@/surf/form'
import type {
  MintDef,
  MintCase,
  MintHookMake,
  MintMakeRule,
  MintBindRule,
} from './form'
import type { TakeMap, TakeVal } from './mine'

// ---- Context ----

export type MintCtx = {
  defs: Map<string, MintDef>
  errors: string[]
}

// ---- Public API ----

/**
 * Execute a mint definition against a TakeMap.
 * Returns a Surface AST node, or undefined if construction fails.
 */
export function walkMint(input: {
  def: MintDef
  take: TakeMap
  ctx: MintCtx
}): Surf | undefined {
  const { def, take, ctx } = input

  // Process case/slot pairs to build a slot map
  const slots = new Map<string, unknown>()

  for (const c of def.cases) {
    processCase({ mintCase: c, take, slots, ctx })
  }

  // Execute hook make if present
  if (def.hook) {
    return executeMake({ hook: def.hook, slots })
  }

  // No hook make: this is a passthrough mint (like sift dispatch).
  // Return whatever is in the first slot.
  for (const [, val] of slots) {
    if (val !== undefined) return val as Surf
  }

  return undefined
}

// ---- Internal ----

/**
 * Process a single case/slot pair.
 *
 * Looks up the case name in the TakeMap. If found:
 * - If the case delegates to a sub-mint, run that mint first
 * - Store the result in the named slot
 *
 * For list TakeVals, each item is processed and accumulated.
 */
function processCase(input: {
  mintCase: MintCase
  take: TakeMap
  slots: Map<string, unknown>
  ctx: MintCtx
}): void {
  const { mintCase, take, slots, ctx } = input
  const takeVal = take.get(mintCase.name)
  if (!takeVal) return

  if (mintCase.mint) {
    // Delegate to sub-mint
    const subDef = ctx.defs.get(mintCase.mint)
    if (!subDef) {
      ctx.errors.push(`unknown mint rule: ${mintCase.mint}`)
      return
    }

    if (takeVal.form === 'map') {
      // Single value: run sub-mint once
      const result = walkMint({ def: subDef, take: takeVal.val, ctx })
      storeSlot({ slots, name: mintCase.slot, value: result })
    } else if (takeVal.form === 'list') {
      // List of values: run sub-mint for each, accumulate
      for (const itemTake of takeVal.val) {
        const result = walkMint({ def: subDef, take: itemTake, ctx })
        if (result !== undefined) {
          accumulateSlot({ slots, name: mintCase.slot, value: result })
        }
      }
    } else {
      // Other forms: create a simple TakeMap and delegate
      const subTake: TakeMap = new Map()
      subTake.set('value', takeVal)
      const result = walkMint({ def: subDef, take: subTake, ctx })
      storeSlot({ slots, name: mintCase.slot, value: result })
    }
  } else {
    // Direct storage (no sub-mint delegation)
    const raw = takeValToRaw(takeVal)

    if (takeVal.form === 'list') {
      // List: store as array of raw values
      const items = takeVal.val.map(m => takeMapToObj(m))
      storeSlot({ slots, name: mintCase.slot, value: items })
    } else {
      storeSlot({ slots, name: mintCase.slot, value: raw })
    }
  }
}

/**
 * Store a value in a slot. Overwrites any previous value
 * (scalar semantics).
 */
function storeSlot(input: {
  slots: Map<string, unknown>
  name: string
  value: unknown
}): void {
  input.slots.set(input.name, input.value)
}

/**
 * Accumulate a value into a slot. If the slot already has
 * a value, converts to array and pushes.
 */
function accumulateSlot(input: {
  slots: Map<string, unknown>
  name: string
  value: unknown
}): void {
  const existing = input.slots.get(input.name)
  if (existing === undefined) {
    input.slots.set(input.name, [input.value])
  } else if (Array.isArray(existing)) {
    existing.push(input.value)
  } else {
    input.slots.set(input.name, [existing, input.value])
  }
}

/**
 * Execute a hook make to construct the final Surface AST node.
 */
function executeMake(input: {
  hook: MintHookMake
  slots: Map<string, unknown>
}): Surf | undefined {
  const { hook, slots } = input
  const make = hook.make

  const node: Record<string, unknown> = {
    form: make.name,
  }

  for (const bind of make.bind) {
    const val = slots.get(bind.slot)
    if (val !== undefined) {
      node[bind.field] = val
    }
  }

  return node as unknown as Surf
}

// ---- Helpers ----

/** Convert a TakeVal to a raw JS value. */
function takeValToRaw(val: TakeVal): unknown {
  switch (val.form) {
    case 'text': return val.val
    case 'mark': return val.val
    case 'bool': return val.val
    case 'path': return val.val
    case 'list': return val.val.map(m => takeMapToObj(m))
    case 'fork': return val.val
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
