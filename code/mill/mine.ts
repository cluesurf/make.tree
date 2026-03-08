/**
 * Term mill mine walker.
 *
 * Executes mine rules against Tree AST (PFork nodes) to extract
 * labeled values into a TakeMap. The mint phase reads these values
 * to construct Surface AST nodes.
 */

import type {
  MineDef,
  MineRule,
  MineTermRule,
  MineFormRef,
  MineCaseRule,
  MineListRule,
  MineMaybeRule,
  MineTextRule,
  MinePathRule,
  MineTakeRule,
} from './form'

// ---- Tree AST types (from parser output) ----

export type PNode =
  | PFork
  | PKnit
  | PCord
  | PSize
  | PText
  | PNick
  | PComb
  | PCode

export type PFork = {
  form: 'tree-fork'
  nest: Array<PNode>
  optional?: boolean
}

export type PKnit = {
  form: 'tree-knit'
  nest: Array<PCord | PNick>
}

export type PCord = {
  form: 'tree-cord'
  leaf: { text: string }
}

export type PSize = {
  form: 'tree-size'
  bond: number
  leaf: { text: string }
}

export type PComb = {
  form: 'tree-comb'
  bond: number
  leaf: { text: string }
}

export type PCode = {
  form: 'tree-code'
  bond: number
  mold: string
  leaf: { text: string }
}

export type PText = {
  form: 'tree-text'
  nest: Array<PCord | PNick>
}

export type PNick = {
  form: 'tree-nick'
  size: number
  nest?: PFork
}

export type PLine = {
  form: 'tree-line'
  nest: Array<PFork>
}

// ---- TakeMap ----

export type TakeMap = Map<string, TakeVal>

export type TakeVal =
  | { form: 'text', val: string }
  | { form: 'mark', val: number }
  | { form: 'list', val: TakeMap[] }
  | { form: 'fork', val: PFork }
  | { form: 'path', val: string[] }
  | { form: 'map', val: TakeMap }
  | { form: 'bool', val: boolean }

// ---- Context ----

export type MineCtx = {
  defs: Map<string, MineDef>
  errors: string[]
}

// ---- Public API ----

/**
 * Walk a mine rule against a PFork. Returns a TakeMap of
 * extracted values, or undefined if the rule didn't match.
 *
 * The fork is presented as a single-element array so that
 * `mine term, term X` can match it by keyword.
 */
export function walkMine(input: {
  rule: MineRule
  fork: PFork
  ctx: MineCtx
}): TakeMap | undefined {
  const { rule, fork, ctx } = input
  const take: TakeMap = new Map()
  // Present the fork itself as a child to match against
  const result = walkRule({ rule, children: [fork], pos: 0, take, ctx })
  if (!result.match) return undefined
  return take
}

// ---- Internal ----

type WalkResult = { match: boolean, next: number }

function walkRule(input: {
  rule: MineRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input

  switch (rule.form) {
    case 'mine-term':
      return walkMineTerm({ rule, children, pos, take, ctx })
    case 'mine-form-ref':
      return walkMineFormRef({ rule, children, pos, take, ctx })
    case 'mine-case':
      return walkMineCase({ rule, children, pos, take, ctx })
    case 'mine-list':
      return walkMineList({ rule, children, pos, take, ctx })
    case 'mine-maybe':
      return walkMineMaybe({ rule, children, pos, take, ctx })
    case 'mine-text':
      return walkMineText({ rule, children, pos, take, ctx })
    case 'mine-path':
      return walkMinePath({ rule, children, pos, take, ctx })
    case 'mine-take':
      return walkMineTake({ rule, children, pos, take, ctx })
  }
}

/**
 * mine term [, term X]
 *
 * If term is specified, match a PFork child whose keyword equals X.
 * Then walk nested rules against that PFork's children.
 * If no term, match the next child regardless of keyword.
 */
function walkMineTerm(input: {
  rule: MineTermRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input
  const child = children[pos]

  if (!child) return { match: false, next: pos }

  if (rule.term) {
    // Must be a PFork with matching keyword
    if (child.form !== 'tree-fork') return { match: false, next: pos }
    const kw = forkKeyword(child)
    if (kw !== rule.term) return { match: false, next: pos }

    // Walk nested rules against this fork's children
    const innerChildren = forkChildren(child)
    let innerPos = 0
    for (const sub of rule.list) {
      const result = walkRule({ rule: sub, children: innerChildren, pos: innerPos, take, ctx })
      if (!result.match) return { match: false, next: pos }
      innerPos = result.next
    }
    return { match: true, next: pos + 1 }
  }

  // No term filter: match whatever is at pos
  if (child.form === 'tree-fork') {
    // Walk nested rules against this fork's children
    const innerChildren = forkChildren(child)
    let innerPos = 0
    for (const sub of rule.list) {
      const result = walkRule({ rule: sub, children: innerChildren, pos: innerPos, take, ctx })
      if (!result.match) return { match: false, next: pos }
      innerPos = result.next
    }
    return { match: true, next: pos + 1 }
  }

  // For non-fork nodes, just advance if no nested rules
  if (rule.list.length === 0) {
    return { match: true, next: pos + 1 }
  }

  return { match: false, next: pos }
}

/**
 * mine form, form X
 *
 * Delegate to a named mine rule.
 */
function walkMineFormRef(input: {
  rule: MineFormRef
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input
  const def = ctx.defs.get(rule.name)
  if (!def) {
    ctx.errors.push(`unknown mine rule: ${rule.name}`)
    return { match: false, next: pos }
  }
  return walkRule({ rule: def.rule, children, pos, take, ctx })
}

/**
 * mine case
 *
 * Try each child rule. First match wins.
 */
function walkMineCase(input: {
  rule: MineCaseRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input

  for (const alt of rule.list) {
    const altTake: TakeMap = new Map()
    const result = walkRule({ rule: alt, children, pos, take: altTake, ctx })
    if (result.match) {
      for (const [k, v] of altTake) take.set(k, v)
      return result
    }
  }
  return { match: false, next: pos }
}

/**
 * mine list
 *
 * Match zero or more repetitions. Each match produces
 * a sub-TakeMap collected into a list.
 */
function walkMineList(input: {
  rule: MineListRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input
  const items: TakeMap[] = []
  let current = pos

  while (current < children.length) {
    const itemTake: TakeMap = new Map()
    const result = walkRule({ rule: rule.rule, children, pos: current, take: itemTake, ctx })
    if (!result.match) break
    items.push(itemTake)
    if (result.next === current) break
    current = result.next
  }

  // Find take names from collected items and store as list.
  // First try the static approach (from rule structure).
  const takeName = findTakeName(rule.rule)
  if (takeName) {
    take.set(takeName, { form: 'list', val: items })
  } else if (items.length > 0) {
    // If the child rule is a form-ref, takes are inside the items.
    // Collect all unique take names from the first item and store
    // each as a list.
    const firstItem = items[0]!
    for (const [key] of firstItem) {
      const vals: TakeMap[] = items
      take.set(key, { form: 'list', val: vals })
      break // Only one list key per mine-list
    }
  }

  return { match: true, next: current }
}

/**
 * mine maybe
 *
 * Optional: try the child. If it fails, succeed anyway.
 */
function walkMineMaybe(input: {
  rule: MineMaybeRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take, ctx } = input
  const result = walkRule({ rule: rule.rule, children, pos, take, ctx })
  if (result.match) return result
  return { match: true, next: pos }
}

/**
 * mine text
 *
 * Match text content from the current child.
 * Extracts string from PCord, PKnit, or PText.
 */
function walkMineText(input: {
  rule: MineTextRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take } = input
  const child = children[pos]
  if (!child) return { match: false, next: pos }

  let text: string | undefined

  if (child.form === 'tree-cord') {
    text = child.leaf.text
  } else if (child.form === 'tree-knit') {
    text = knitToText(child)
  } else if (child.form === 'tree-text') {
    text = textToString(child)
  } else if (child.form === 'tree-fork') {
    // Extract text from the fork's keyword
    text = forkKeyword(child)
    // Also try the full knit text
    const knit = child.nest[0]
    if (knit && knit.form === 'tree-knit') {
      text = knitToText(knit)
    }
  }

  if (text === undefined) return { match: false, next: pos }

  // Execute child take rules
  for (const sub of rule.list) {
    if (sub.form === 'mine-take') {
      take.set(sub.name, { form: 'text', val: text })
    }
  }

  return { match: true, next: pos + 1 }
}

/**
 * mine path
 *
 * Match a slash-separated path from the current child.
 */
function walkMinePath(input: {
  rule: MinePathRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take } = input
  const child = children[pos]
  if (!child) return { match: false, next: pos }

  let pathText = ''

  if (child.form === 'tree-cord') {
    pathText = child.leaf.text
  } else if (child.form === 'tree-knit') {
    pathText = knitToText(child)
  } else if (child.form === 'tree-fork') {
    const knit = child.nest[0]
    if (knit && knit.form === 'tree-knit') {
      pathText = knitToText(knit)
    }
  }

  if (!pathText) return { match: false, next: pos }

  const segments = pathText.split('/')

  for (const sub of rule.list) {
    if (sub.form === 'mine-take') {
      take.set(sub.name, { form: 'path', val: segments })
    }
  }

  return { match: true, next: pos + 1 }
}

/**
 * take X
 *
 * Extract the current child and label it.
 */
function walkMineTake(input: {
  rule: MineTakeRule
  children: PNode[]
  pos: number
  take: TakeMap
  ctx: MineCtx
}): WalkResult {
  const { rule, children, pos, take } = input
  const child = children[pos]

  if (!child) {
    // No child to take, but this is valid (empty take)
    return { match: true, next: pos }
  }

  if (child.form === 'tree-cord') {
    take.set(rule.name, { form: 'text', val: child.leaf.text })
    return { match: true, next: pos + 1 }
  }

  if (child.form === 'tree-size') {
    take.set(rule.name, { form: 'mark', val: child.bond })
    return { match: true, next: pos + 1 }
  }

  if (child.form === 'tree-comb') {
    take.set(rule.name, { form: 'mark', val: child.bond })
    return { match: true, next: pos + 1 }
  }

  if (child.form === 'tree-fork') {
    // Extract keyword text as default
    const kw = forkKeyword(child)
    if (kw) {
      take.set(rule.name, { form: 'text', val: kw })
    } else {
      take.set(rule.name, { form: 'fork', val: child })
    }
    return { match: true, next: pos + 1 }
  }

  if (child.form === 'tree-knit') {
    take.set(rule.name, { form: 'text', val: knitToText(child) })
    return { match: true, next: pos + 1 }
  }

  if (child.form === 'tree-text') {
    take.set(rule.name, { form: 'text', val: textToString(child) })
    return { match: true, next: pos + 1 }
  }

  return { match: false, next: pos }
}

// ---- Helpers ----

/** Get the keyword (first cord text) from a PFork. */
export function forkKeyword(fork: PFork): string | undefined {
  const knit = fork.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined
  const cord = knit.nest[0]
  if (!cord || cord.form !== 'tree-cord') return undefined
  return cord.leaf.text
}

/**
 * Get the children of a PFork (everything after nest[0] which is the knit,
 * plus inline values from the knit after the keyword).
 *
 * A PFork's nest looks like: [PKnit, PFork?, PFork?, ...]
 * The PKnit contains [PCord(keyword), PCord?(inline1), PCord?(inline2), ...]
 *
 * We return: inline values from knit (after keyword) + child forks
 */
export function forkChildren(fork: PFork): PNode[] {
  const result: PNode[] = []
  const knit = fork.nest[0]

  // Inline values from the knit (words/text after the keyword)
  if (knit && knit.form === 'tree-knit') {
    for (let i = 1; i < knit.nest.length; i++) {
      result.push(knit.nest[i]!)
    }
  }

  // Child nodes (PForks and other nodes after the knit)
  for (let i = 1; i < fork.nest.length; i++) {
    result.push(fork.nest[i]!)
  }

  return result
}

/** Convert a PKnit to a plain string. */
function knitToText(knit: PKnit): string {
  let text = ''
  for (const node of knit.nest) {
    if (node.form === 'tree-cord') {
      text += node.leaf.text
    } else if (node.form === 'tree-nick' && node.nest) {
      const inner = forkKeyword(node.nest)
      text += `{${inner ?? ''}}`
    }
  }
  return text
}

/** Convert a PText to a plain string. */
function textToString(text: PText): string {
  let result = ''
  for (const node of text.nest) {
    if (node.form === 'tree-cord') {
      result += node.leaf.text
    }
  }
  return result
}

/** Find the take name from a mine rule (for list collection). */
function findTakeName(rule: MineRule): string | undefined {
  if (rule.form === 'mine-take') return rule.name
  if (rule.form === 'mine-term') {
    for (const sub of rule.list) {
      const name = findTakeName(sub)
      if (name) return name
    }
  }
  if (rule.form === 'mine-form-ref') return undefined
  if (rule.form === 'mine-text') {
    for (const sub of rule.list) {
      const name = findTakeName(sub)
      if (name) return name
    }
  }
  return undefined
}
