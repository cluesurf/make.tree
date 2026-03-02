/**
 * Mine walker: execute mine rules against source Tree AST.
 *
 * Given a MineRule tree and a TreeLink from the user's source,
 * the walker traverses the Tree AST according to the mine rules
 * and produces a TakeMap (bag of labeled values) that the mint
 * phase uses to construct Surface AST nodes.
 *
 * Each `take <name>` rule in the mine tree extracts the current
 * matched value and stores it under that label.
 */

import type { TreeLink, TreeTerm, TreeCord, TreeMark, TreeText } from '@/mill/tree'
import type { Site } from '@/kink/site'
import { VOID_SITE } from '@/kink/site'
import type { Kink } from '@/kink/form'
import { makeKink } from '@/kink/form'
import type {
  MineRule,
  MineForm,
  MineTerm,
  MineList,
  MineCase,
  MineFormRule,
  MineHead,
  MineRoom,
  MinePath,
  MineText,
  MineTake,
} from './form'

/**
 * The result of mining: a map of labeled values.
 * Values can be strings, numbers, arrays, or nested take-maps.
 */
export type TakeMap = Map<string, TakeVal>

export type TakeVal =
  | { form: 'text', val: string, site: Site }
  | { form: 'mark', val: number, site: Site }
  | { form: 'list', val: TakeMap[], site: Site }
  | { form: 'tree', val: TreeLink, site: Site }
  | { form: 'path', val: string[], site: Site }
  | { form: 'map', val: TakeMap, site: Site }

/** Context for mine walking. */
export type MineCtx = {
  /** All mine definitions (resolved from .note files). */
  formList: Map<string, MineForm>
  /** Accumulated errors. */
  kink: Kink[]
  /** Source file being mined. */
  file: string
}

/**
 * Walk a mine rule against a TreeLink from the user's source.
 * Returns a TakeMap of extracted values, or undefined if the
 * rule did not match.
 */
export function walkMine(input: {
  rule: MineRule
  link: TreeLink
  ctx: MineCtx
}): TakeMap | undefined {
  const { rule, link, ctx } = input
  const take = new Map<string, TakeVal>()
  const ok = walkRule(rule, link, link.list, 0, take, ctx)
  if (!ok.match) return undefined
  return take
}

type WalkResult = { match: boolean, next: number }

/** Walk a single mine rule, consuming tree children starting at `pos`. */
function walkRule(
  rule: MineRule,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  switch (rule.form) {
    case 'mine-term':
      return walkMineTerm(rule, parent, children, pos, take, ctx)
    case 'mine-list':
      return walkMineList(rule, parent, children, pos, take, ctx)
    case 'mine-case':
      return walkMineCase(rule, parent, children, pos, take, ctx)
    case 'mine-form':
      return walkMineForm(rule, parent, children, pos, take, ctx)
    case 'mine-head':
      return walkMineHead(rule, parent, children, pos, take, ctx)
    case 'mine-room':
      return walkMineRoom(rule, parent, children, pos, take, ctx)
    case 'mine-path':
      return walkMinePath(rule, parent, children, pos, take, ctx)
    case 'mine-text':
      return walkMineText(rule, parent, children, pos, take, ctx)
    case 'mine-take':
      return walkMineTake(rule, parent, children, pos, take, ctx)
    case 'mine-tree-rest': {
      const def = ctx.formList.get(rule.name)
      if (!def) {
        ctx.kink.push(makeKink({
          form: 'mill-bad-rule', rank: 'halt', site: rule.site,
          text: `unknown mine rule reference: ${rule.name}`,
          rest: { rule: rule.name },
        }))
        return { match: false, next: pos }
      }
      return walkRule(def.rule, parent, children, pos, take, ctx)
    }
    case 'mine-make-head':
      return walkMineHead(
        { form: 'mine-head', list: rule.list, site: rule.site },
        parent, children, pos, take, ctx,
      )
    case 'mine-make-case':
      return walkMineCase(
        { form: 'mine-case', list: rule.list, site: rule.site },
        parent, children, pos, take, ctx,
      )
    case 'mine-note':
      // Annotations don't affect matching
      return { match: true, next: pos }
    default:
      return { match: false, next: pos }
  }
}

/**
 * mine term [, term <name>]
 *
 * If `term` is set, match the next child only if it's a TreeLink
 * with matching text. Then walk nested rules against that link's
 * children. If no `term`, just walk nested rules against current
 * children in sequence.
 */
function walkMineTerm(
  rule: MineTerm,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  if (rule.term) {
    // Match a named TreeLink child
    const child = children[pos]
    if (!child || !isLink(child) || child.text !== rule.term) {
      return { match: false, next: pos }
    }

    // Walk nested rules against this child's children
    let childPos = 0
    for (const sub of rule.list) {
      const result = walkRule(sub, child, child.list, childPos, take, ctx)
      if (!result.match) return { match: false, next: pos }
      childPos = result.next
    }

    return { match: true, next: pos + 1 }
  }

  // No term filter: walk nested rules against current children
  let current = pos
  for (const sub of rule.list) {
    const result = walkRule(sub, parent, children, current, take, ctx)
    if (!result.match) return { match: false, next: pos }
    current = result.next
  }

  return { match: true, next: current }
}

/**
 * mine list
 *
 * Greedily match zero or more repetitions of the child rule.
 * Each match produces a TakeMap that's collected into a list.
 */
function walkMineList(
  rule: MineList,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  // Find the take name from the child rule (if it's a mine-form with a take)
  const items: TakeMap[] = []
  let current = pos

  while (current < children.length) {
    const itemTake = new Map<string, TakeVal>()
    const result = walkRule(rule.rule, parent, children, current, itemTake, ctx)
    if (!result.match) break
    items.push(itemTake)
    current = result.next
    if (current === pos) break // prevent infinite loop
  }

  // Store the list under the take name from the child rule
  const takeName = findTakeName(rule.rule)
  if (takeName) {
    const site =parent.code ? codeSite(parent, ctx.file) : VOID_SITE
    take.set(takeName, { form: 'list', val: items, site })
  }

  return { match: true, next: current }
}

/**
 * mine case
 *
 * Try each child in order. Use the first that matches.
 */
function walkMineCase(
  rule: MineCase,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  for (const alt of rule.list) {
    const altTake = new Map<string, TakeVal>()
    const result = walkRule(alt, parent, children, pos, altTake, ctx)
    if (result.match) {
      // Merge altTake into take
      for (const [k, v] of altTake) take.set(k, v)
      return result
    }
  }
  return { match: false, next: pos }
}

/**
 * mine form, form <name>
 *
 * Match the next child (a TreeLink) and extract via take.
 */
function walkMineForm(
  rule: MineFormRule,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  const child = children[pos]
  if (!child) return { match: false, next: pos }

  // If the child is a TreeLink, check if it matches the form name
  if (isLink(child)) {
    // Walk nested rules to extract values
    const formTake = new Map<string, TakeVal>()
    let childPos = 0
    for (const sub of rule.list) {
      const result = walkRule(sub, child, child.list, childPos, formTake, ctx)
      if (!result.match) return { match: false, next: pos }
      childPos = result.next
    }

    // If there's a take name, store the result
    const takeName = findTakeName(rule)
    if (takeName) {
      const site =codeSite(child, ctx.file)
      take.set(takeName, { form: 'map', val: formTake, site })
    } else {
      // Merge into parent take
      for (const [k, v] of formTake) take.set(k, v)
    }

    return { match: true, next: pos + 1 }
  }

  return { match: false, next: pos }
}

/**
 * mine head
 *
 * Pick the first child that matches any of the alternatives.
 */
function walkMineHead(
  rule: MineHead,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  for (const alt of rule.list) {
    const altTake = new Map<string, TakeVal>()
    const result = walkRule(alt, parent, children, pos, altTake, ctx)
    if (result.match) {
      for (const [k, v] of altTake) take.set(k, v)
      return result
    }
  }
  return { match: false, next: pos }
}

/**
 * mine room
 *
 * Optional: try the child rule. If it fails, succeed anyway.
 */
function walkMineRoom(
  rule: MineRoom,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  const result = walkRule(rule.rule, parent, children, pos, take, ctx)
  if (result.match) return result
  return { match: true, next: pos }
}

/**
 * mine path
 *
 * Extract a slash-separated path from the current position.
 */
function walkMinePath(
  rule: MinePath,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  const child = children[pos]
  if (!child) return { match: false, next: pos }

  // A path is a text value like "@cluesurf/seed/code/show"
  // or a TreeCord with slash-separated segments
  let pathText = ''
  if (isCord(child)) {
    pathText = child.text
  } else if (isTerm(child)) {
    pathText = termText(child)
  }

  if (!pathText) return { match: false, next: pos }

  const segments = pathText.split('/')
  const site =codeSite(parent, ctx.file)

  // Walk child take rules
  for (const sub of rule.list) {
    if (sub.form === 'mine-take') {
      take.set(sub.name, { form: 'path', val: segments, site })
    }
  }

  return { match: true, next: pos + 1 }
}

/**
 * mine text
 *
 * Match a text literal (TreeText content or TreeCord).
 */
function walkMineText(
  rule: MineText,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  const child = children[pos]
  if (!child) return { match: false, next: pos }

  let text = ''
  if (isCord(child)) {
    text = child.text
  } else if (isTerm(child)) {
    text = termText(child)
  }

  const site =codeSite(parent, ctx.file)

  for (const sub of rule.list) {
    if (sub.form === 'mine-take') {
      take.set(sub.name, { form: 'text', val: text, site })
    }
  }

  return { match: true, next: pos + 1 }
}

/**
 * take <name>
 *
 * Extract the "current" value. In context, this means the
 * most recently matched tree node.
 */
function walkMineTake(
  rule: MineTake,
  parent: TreeLink,
  children: Array<TreeTerm | TreeLink | TreeCord | TreeMark>,
  pos: number,
  take: TakeMap,
  ctx: MineCtx,
): WalkResult {
  // When take appears as a direct child, extract the current child
  const child = children[pos]
  if (!child) {
    // Take from parent
    const site =codeSite(parent, ctx.file)
    take.set(rule.name, { form: 'tree', val: parent, site })
    return { match: true, next: pos }
  }

  const site =codeSite(parent, ctx.file)

  if (isCord(child)) {
    take.set(rule.name, { form: 'text', val: child.text, site })
    return { match: true, next: pos + 1 }
  }

  if (isMark(child)) {
    take.set(rule.name, { form: 'mark', val: parseFloat(child.text), site })
    return { match: true, next: pos + 1 }
  }

  if (isLink(child)) {
    take.set(rule.name, { form: 'tree', val: child, site })
    return { match: true, next: pos + 1 }
  }

  if (isTerm(child)) {
    take.set(rule.name, { form: 'text', val: termText(child), site })
    return { match: true, next: pos + 1 }
  }

  return { match: false, next: pos }
}

// ---- Helpers ----

function isLink(node: unknown): node is TreeLink {
  return (node as TreeLink)?.form === 'link'
}

function isCord(node: unknown): node is TreeCord {
  return (node as TreeCord)?.form === 'cord'
}

function isMark(node: unknown): node is TreeMark {
  return (node as TreeMark)?.form === 'mark'
}

function isTerm(node: unknown): node is TreeTerm {
  return (node as TreeTerm)?.form === 'term'
}

/** Extract text from a TreeTerm's cord children. */
function termText(term: TreeTerm): string {
  const parts: string[] = []
  for (const child of term.list) {
    if (isCord(child)) parts.push(child.text)
  }
  return parts.join(' ')
}

/** Find the take name from a mine rule (for list collection). */
function findTakeName(rule: MineRule): string | undefined {
  if (rule.form === 'mine-take') return rule.name
  if (rule.form === 'mine-form' && rule.list.length > 0) {
    for (const sub of rule.list) {
      const name = findTakeName(sub)
      if (name) return name
    }
  }
  if (rule.form === 'mine-term' && rule.list.length > 0) {
    for (const sub of rule.list) {
      const name = findTakeName(sub)
      if (name) return name
    }
  }
  return undefined
}

/** Extract a Site from a TreeLink. */
function codeSite(link: TreeLink, file: string): Site {
  if (link.code?.base && link.code?.head) {
    return {
      form: 'card-site',
      link: file,
      base: {
        line: link.code.base.band.base.line,
        mark: link.code.base.band.base.mark,
      },
      head: {
        line: link.code.head.band.head.line,
        mark: link.code.head.band.head.mark,
      },
    }
  }
  return { form: 'brew-site' }
}
