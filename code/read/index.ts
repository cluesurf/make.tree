/**
 * Read @cluesurf/tree parser output → Surface AST (SurfCard).
 *
 * Converts the Tree AST produced by the @cluesurf/tree parser
 * into Surface AST nodes for the Term compiler pipeline.
 *
 * Parser output structure:
 *   TreeLine → root, array of top-level TreeForks
 *   TreeFork → nest[0] is a Knit (keyword), nest[1+] are children
 *   TreeKnit → sequence of Cords (words) and Nicks (interpolations)
 *   TreeCord → plain word, leaf.text has the string
 *   TreeSize → integer literal, bond has the value
 *   TreeComb → float literal, bond has the value
 *   TreeText → <...> text literal, with Cords and Nicks
 *   TreeNick → {...} interpolation
 */

import type {
  Surf,
  SurfCard,
  SurfTask,
  SurfForm,
  SurfBase,
  SurfHead,
  SurfLink,
  SurfCaseArm,
  SurfCall,
  SurfMake,
  SurfBind,
  SurfSave,
  SurfBack,
  SurfFork,
  SurfWalk,
  SurfHook,
  SurfHost,
  SurfLoad,
  SurfFind,
  SurfTree,
  SurfTreeHook,
  SurfFuse,
  SurfWear,
  SurfMask,
  SurfSuit,
} from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

// -- Parser output types (subset of @cluesurf/tree) --

type PNode =
  | PFork
  | PKnit
  | PCord
  | PSize
  | PText
  | PNick
  | PComb
  | PCode

type PLine = {
  form: 'tree-line'
  nest: Array<PFork>
}

type PFork = {
  form: 'tree-fork'
  nest: Array<PNode>
  optional?: boolean
}

type PKnit = {
  form: 'tree-knit'
  nest: Array<PCord | PNick>
}

type PCord = {
  form: 'tree-cord'
  leaf: { text: string }
}

type PSize = {
  form: 'tree-size'
  bond: number
  leaf: { text: string }
}

type PComb = {
  form: 'tree-comb'
  bond: number
  leaf: { text: string }
}

type PCode = {
  form: 'tree-code'
  bond: number
  mold: string
  leaf: { text: string }
}

type PText = {
  form: 'tree-text'
  nest: Array<PCord | PNick>
}

type PNick = {
  form: 'tree-nick'
  size: number
  nest?: PFork
}

const site = VOID_SITE

// -- Public API --

export function readCard(input: { tree: PLine; file: string }): SurfCard {
  const list: Surf[] = []
  for (const fork of input.tree.nest) {
    const node = readTop(fork)
    if (node) list.push(node)
  }
  return { file: input.file, list }
}

// -- Tree navigation helpers --

/** Get keyword from a Fork's head Knit (nest[0] → Knit → Cord[0]) */
function headWord(fork: PFork): string | undefined {
  const knit = fork.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined
  const cord = knit.nest[0]
  if (!cord || cord.form !== 'tree-cord') return undefined
  return cord.leaf.text
}

/** Get word from a child Fork at index i (Fork.nest[i] → Fork → headWord) */
function childWord(fork: PFork, i: number): string | undefined {
  const child = fork.nest[i]
  if (!child || child.form !== 'tree-fork') return undefined
  return headWord(child)
}

/** Get child Fork at index i */
function childFork(fork: PFork, i: number): PFork | undefined {
  const child = fork.nest[i]
  if (!child || child.form !== 'tree-fork') return undefined
  return child
}

/** Get child node at index i (any type) */
function childNode(fork: PFork, i: number): PNode | undefined {
  return fork.nest[i]
}

/** Read a knit as a template string, preserving {nick} placeholders. */
function knitText(knit: PKnit): string {
  let text = ''
  for (const node of knit.nest) {
    if (node.form === 'tree-cord') {
      text += node.leaf.text
    } else if (node.form === 'tree-nick') {
      // Nick contains a nested fork with the interpolation variable
      if (node.nest) {
        const inner = headWord(node.nest)
        text += `{${inner ?? ''}}`
      }
    }
  }
  return text
}

/** Get the full template string from a child Fork's head knit. */
function childKnitText(fork: PFork, i: number): string | undefined {
  const child = fork.nest[i]
  if (!child || child.form !== 'tree-fork') return undefined
  const knit = child.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined
  return knitText(knit)
}

/** Get all child Forks from index start onwards */
function childForks(fork: PFork, start: number): PFork[] {
  const result: PFork[] = []
  for (let i = start; i < fork.nest.length; i++) {
    const n = fork.nest[i]
    if (n && n.form === 'tree-fork') result.push(n)
  }
  return result
}

// -- Top-level definitions --

function readTop(fork: PFork): Surf | null {
  const word = headWord(fork)
  switch (word) {
    case 'form':
      return readForm(fork)
    case 'task':
      return readTask(fork)
    case 'host':
      return readHost(fork)
    case 'load':
      return readLoad(fork)
    case 'tree':
      return readTree(fork)
    case 'fuse':
      return readFuse(fork)
    case 'wear':
      return readWear(fork)
    case 'mask':
      return readMask(fork)
    case 'suit':
      return readSuit(fork)
    default:
      return null
  }
}

// -- form --

function readForm(fork: PFork): SurfForm {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const head: SurfHead[] = []
  const link: SurfLink[] = []
  const cases: SurfCaseArm[] = []
  const bond: Surf[] = []
  const task: SurfTask[] = []
  const wear: SurfWear[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    switch (kw) {
      case 'head':
        head.push(readHead(child))
        break
      case 'link':
        link.push(readLink(child))
        break
      case 'case':
        cases.push(readCaseArm(child))
        break
      case 'task':
        task.push(readTask(child))
        break
      case 'fuse':
        bond.push(readFuse(child))
        break
      case 'wear':
        wear.push(readWear(child))
        break
    }
  }

  return { form: 'form', name, head, link, case: cases, bond, task, wear, site }
}

// -- task --

function readTask(fork: PFork): SurfTask {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const head: SurfHead[] = []
  const base: SurfBase[] = []
  const flow: Surf[] = []
  const task: SurfTask[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    switch (kw) {
      case 'head':
        head.push(readHead(child))
        break
      case 'take':
      case 'base':
        base.push(readBase(child))
        break
      case 'task':
        task.push(readTask(child))
        break
      default: {
        const stmt = readStatement(child)
        if (stmt) flow.push(stmt)
        break
      }
    }
  }

  return { form: 'task', name, head, base, flow, task, site }
}

// -- Type annotation nodes --

function readHead(fork: PFork): SurfHead {
  const name = childWord(fork, 1) ?? ''
  let need: string | undefined

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'need') need = childWord(child, 1)
  }

  return { form: 'head', name, need, site }
}

function readBase(fork: PFork): SurfBase {
  const name = childWord(fork, 1) ?? ''
  let like: string | undefined

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'like') like = childWord(child, 1)
  }

  return { form: 'base', name, like, site }
}

function readLink(fork: PFork): SurfLink {
  const name = childWord(fork, 1) ?? ''
  let like: string | undefined

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'like') like = childWord(child, 1)
  }

  return { form: 'link', name, like, site }
}

function readCaseArm(fork: PFork): SurfCaseArm {
  const name = childWord(fork, 1) ?? ''
  const link: SurfLink[] = []

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'link') link.push(readLink(child))
  }

  return { form: 'case-arm', name, link, site }
}

// -- Statements --

function readStatement(fork: PFork): Surf | null {
  const kw = headWord(fork)
  switch (kw) {
    case 'back':
      return readBack(fork)
    case 'save':
      return readSave(fork)
    case 'fork':
      return readForkNode(fork)
    case 'walk':
      return readWalkNode(fork)
    case 'call':
      return readCall(fork, [])
    case 'make':
      return readMake(fork, [])
    case 'host':
      return readHost(fork)
    case 'show':
      return { form: 'show', sift: readSiftFromChild(fork), site }
    case 'dive':
      return { form: 'dive', sift: readSiftFromChild(fork), site }
    case 'halt':
      return { form: 'halt', site }
    case 'fuse':
      return readFuse(fork)
    default:
      return null
  }
}

// -- back --

function readBack(fork: PFork): SurfBack {
  const siftFork = childFork(fork, 1)
  if (!siftFork) return { form: 'back', site }

  const siftKw = headWord(siftFork)

  // back call <name> → collect binds from back-level children
  if (siftKw === 'call') {
    return {
      form: 'back',
      sift: readCall(siftFork, childForks(fork, 2)),
      site,
    }
  }

  // back make <name> → collect binds from back-level children
  if (siftKw === 'make') {
    return {
      form: 'back',
      sift: readMake(siftFork, childForks(fork, 2)),
      site,
    }
  }

  // back <sift-expr>
  return { form: 'back', sift: readSiftExpr(siftFork), site }
}

// -- save --

function readSave(fork: PFork): SurfSave {
  const name = childWord(fork, 1) ?? ''
  const children = childForks(fork, 2)

  let sift: Surf | undefined
  if (children.length > 0) {
    const first = children[0]!
    const kw = headWord(first)
    if (kw === 'call') {
      sift = readCall(first, children.slice(1))
    } else if (kw === 'make') {
      sift = readMake(first, children.slice(1))
    } else {
      sift = readSiftExpr(first)
    }
  }

  return { form: 'save', path: [name], sift, site }
}

// -- fork --

function readForkNode(fork: PFork): SurfFork {
  const mode = childWord(fork, 1) ?? 'case'
  const children = childForks(fork, 2)
  let sift: Surf | undefined
  const hooks: SurfHook[] = []

  for (const child of children) {
    const kw = headWord(child)
    if (
      kw === 'loan' ||
      kw === 'link' ||
      kw === 'move' ||
      kw === 'read'
    ) {
      sift = readSiftExpr(child)
    } else if (kw === 'hook') {
      hooks.push(readHook(child))
    }
  }

  return { form: 'fork', mode, sift, hook: hooks, site }
}

// -- walk --

function readWalkNode(fork: PFork): SurfWalk {
  const mode = childWord(fork, 1) ?? 'test'
  const children = childForks(fork, 2)
  let sift: Surf | undefined
  const hooks: SurfHook[] = []

  for (const child of children) {
    const kw = headWord(child)
    if (
      kw === 'loan' ||
      kw === 'link' ||
      kw === 'move' ||
      kw === 'read'
    ) {
      sift = readSiftExpr(child)
    } else if (kw === 'hook') {
      hooks.push(readHook(child))
    }
  }

  return { form: 'walk', mode, sift, hook: hooks, site }
}

// -- hook --

function readHook(fork: PFork): SurfHook {
  const name = childWord(fork, 1) ?? ''
  const children = childForks(fork, 2)
  const base: SurfBase[] = []
  const flow: Surf[] = []

  for (const child of children) {
    const kw = headWord(child)
    if (kw === 'base') {
      base.push(readBase(child))
    } else {
      const stmt = readStatement(child)
      if (stmt) flow.push(stmt)
    }
  }

  return { form: 'hook', name, base, flow, site }
}

// -- call --

function readCall(fork: PFork, extraChildren: PFork[]): SurfCall {
  const name = childWord(fork, 1) ?? ''
  const binds: SurfBind[] = []
  const hook: Record<string, SurfHook> = {}

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'bind') binds.push(readBind(child))
  }

  for (const child of extraChildren) {
    if (headWord(child) === 'bind') binds.push(readBind(child))
  }

  return { form: 'call', name, bind: binds, hook, site }
}

// -- make --

function readMake(fork: PFork, extraChildren: PFork[]): SurfMake {
  const name = childWord(fork, 1) ?? ''
  const binds: SurfBind[] = []

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'bind') binds.push(readBind(child))
  }

  for (const child of extraChildren) {
    if (headWord(child) === 'bind') binds.push(readBind(child))
  }

  return { form: 'make', name, bind: binds, site }
}

// -- bind --

function readBind(fork: PFork): SurfBind {
  const name = childWord(fork, 1) ?? ''
  const children = childForks(fork, 2)

  let sift: Surf | undefined
  if (children.length > 0) {
    const first = children[0]!
    const kw = headWord(first)
    if (kw === 'call') {
      sift = readCall(first, children.slice(1))
    } else if (kw === 'make') {
      sift = readMake(first, children.slice(1))
    } else {
      sift = readSiftExpr(first)
    }
  }

  return { form: 'bind', name, sift, site }
}

// -- host --

function readHost(fork: PFork): SurfHost {
  const name = childWord(fork, 1) ?? ''
  const children = childForks(fork, 2)

  let sift: Surf | undefined
  if (children.length > 0) {
    sift = readSiftExpr(children[0]!)
  }

  return { form: 'host', name, sift, site }
}

// -- load --

function readLoad(fork: PFork): SurfLoad {
  const pathStr = childWord(fork, 1) ?? ''
  const path = pathStr.split('/')
  const find: SurfFind[] = []
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'find') {
      find.push(readFind(child))
    }
  }
  return { form: 'load', path, find, hook: [], site }
}

function readFind(fork: PFork): SurfFind {
  const kind = childWord(fork, 1) ?? ''
  const argFork = childFork(fork, 1)
  const name = argFork ? childWord(argFork, 1) ?? '' : ''
  return { form: 'find', kind, name, site }
}

// -- tree --

function readTree(fork: PFork): SurfTree {
  const name = childWord(fork, 1) ?? ''
  const base: SurfBase[] = []
  const hook: SurfTreeHook[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    if (kw === 'take') {
      base.push(readBase(child))
    } else if (kw === 'hook') {
      hook.push(readTreeHook(child))
    }
  }

  return { form: 'tree', name, base, hook, site }
}

function readTreeHook(fork: PFork): SurfTreeHook {
  const name = childWord(fork, 1) ?? ''
  const list: Surf[] = []

  for (const child of childForks(fork, 2)) {
    const node = readTop(child) ?? readStatement(child)
    if (node) list.push(node)
  }

  return { form: 'tree-hook', name, list, site }
}

// -- fuse --

function readFuse(fork: PFork): SurfFuse {
  const name = childWord(fork, 1) ?? ''
  const bind: SurfBind[] = []

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'bind') {
      bind.push(readBind(child))
    }
  }

  return { form: 'fuse', name, bind, site }
}

// -- wear / mask / suit --

function readWear(fork: PFork): SurfWear {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const task: SurfTask[] = []
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'task') {
      task.push(readTask(child))
    }
  }
  return { form: 'wear', name, task, site }
}

function readMask(fork: PFork): SurfMask {
  const name = childWord(fork, 1) ?? ''
  const task: SurfTask[] = []
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'task') {
      task.push(readTask(child))
    }
  }
  return { form: 'mask', name, task, site }
}

function readSuit(fork: PFork): SurfSuit {
  const name = childWord(fork, 1) ?? ''
  const wear: SurfWear[] = []
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'wear') {
      wear.push(readWear(child))
    }
  }
  return { form: 'suit', name, wear, site }
}

// -- Sift expressions (value expressions) --

function readSiftExpr(fork: PFork): Surf {
  const kw = headWord(fork)
  switch (kw) {
    case 'loan':
      return readSiftPath(fork, 'sift-loan')
    case 'move':
      return readSiftPath(fork, 'sift-move')
    case 'read':
      return readSiftPath(fork, 'sift-read')
    case 'link':
      return readSiftPath(fork, 'sift-link')
    case 'mark':
      return readSiftMark(fork)
    case 'text':
      return readSiftText(fork)
    case 'wave':
      return readSiftWave(fork)
    case 'call':
      return readCall(fork, [])
    case 'make':
      return readMake(fork, [])
    default:
      // Bare word treated as variable reference
      if (kw) return { form: 'sift-loan', path: [kw], site }
      return { form: 'sift-mark', val: 0, site }
  }
}

function readSiftPath(
  fork: PFork,
  form: 'sift-loan' | 'sift-move' | 'sift-read' | 'sift-link',
): Surf {
  const name = childWord(fork, 1) ?? ''
  const child = childFork(fork, 1)
  const safe = child?.optional === true
  if (safe) {
    return { form, path: [name], safe, site }
  }
  return { form, path: [name], site }
}

function readSiftMark(fork: PFork): Surf {
  const node = childNode(fork, 1)
  if (node?.form === 'tree-size') {
    return { form: 'sift-mark', val: node.bond, site }
  }
  if (node?.form === 'tree-comb') {
    return { form: 'sift-comb', val: node.bond, site }
  }
  // mark <word> → try parsing as number
  if (node?.form === 'tree-fork') {
    const w = headWord(node)
    if (w) {
      const n = Number(w)
      if (!isNaN(n)) return { form: 'sift-mark', val: n, site }
    }
  }
  return { form: 'sift-mark', val: 0, site }
}

function readSiftText(fork: PFork): Surf {
  const node = childNode(fork, 1)
  if (node?.form === 'tree-text') {
    const val = node.nest
      .filter((n): n is PCord => n.form === 'tree-cord')
      .map(n => n.leaf.text)
      .join('')
    return { form: 'sift-text', val, site }
  }
  return { form: 'sift-text', val: '', site }
}

function readSiftWave(fork: PFork): Surf {
  const word = childWord(fork, 1)
  return { form: 'sift-wave', val: word === 'true', site }
}

/** Read sift from first child Fork (for show, dive, etc.) */
function readSiftFromChild(fork: PFork): Surf | undefined {
  const child = childFork(fork, 1)
  if (!child) return undefined
  return readSiftExpr(child)
}
