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
  SurfBear,
  SurfMeet,
  SurfType,
  SurfTest,
  SurfTime,
  SurfBook,
  SurfBeam,
  SurfHalt,
  SurfCaseType,
  SurfBust,
  SurfSendError,
} from '@/surf/form'
import { VOID_SITE } from '@/kink/site'
import type { Kink } from '@/kink/form'
import { makeKink } from '@/kink/form'

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
    if (headWord(fork) === 'dock') {
      list.push(...readDockLoads(fork))
    } else {
      const node = readTop(fork)
      if (node) list.push(node)
    }
  }
  return { file: input.file, list }
}

/**
 * Error-tolerant readCard: wraps each top-level node in try-catch.
 * Returns partial card + collected errors. Never throws.
 */
export function readCardTolerant(input: { tree: PLine; file: string }): { card: SurfCard; errors: Kink[] } {
  const list: Surf[] = []
  const errors: Kink[] = []

  for (const fork of input.tree.nest) {
    try {
      if (headWord(fork) === 'dock') {
        list.push(...readDockLoads(fork))
      } else {
        const node = readTop(fork)
        if (node) list.push(node)
      }
    } catch (e) {
      errors.push(
        makeKink({
          form: 'read-bad',
          rank: 'halt',
          site: VOID_SITE,
          text: `Failed to read node: ${headWord(fork) ?? 'unknown'}`,
          rest: { node: headWord(fork) ?? 'unknown' },
        }),
      )
    }
  }

  return { card: { file: input.file, list }, errors }
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
    case 'case':
      return readCaseType(fork)
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
    case 'bear':
      return readBear(fork)
    case 'test':
      return readTest(fork)
    case 'time':
      return readTime(fork)
    case 'book':
      return readBook(fork)
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
  let like: SurfType | undefined
  let hide: boolean | undefined
  let fold: boolean | undefined
  const hold: Surf[] = []

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
      case 'like':
        like = readType(child)
        break
      case 'mark': {
        const markVal = childWord(child, 1)
        if (markVal === 'private') hide = true
        break
      }
      case 'fold':
        fold = childWord(child, 1) === 'well'
        break
      case 'hold': {
        const holdSift = readSiftFromChild(child)
        if (holdSift) hold.push(holdSift)
        break
      }
      case 'slot':
        bond.push({ form: 'slot', name: childWord(child, 1) ?? '', site })
        break
      case 'beam':
        bond.push(readBeam(child))
        break
    }
  }

  const result: SurfForm = { form: 'form', name, head, link, case: cases, bond, task, wear, site }
  if (like) result.like = like
  if (hide) result.hide = hide
  if (fold) result.fold = fold
  if (hold.length > 0) result.hold = hold
  return result
}

function readCaseType(fork: PFork): SurfCaseType {
  const name = childWord(fork, 1) ?? ''
  const head: SurfHead[] = []
  const link: SurfLink[] = []
  const bind: SurfBind[] = []
  let like: SurfType | undefined
  let hide: boolean | undefined

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    switch (kw) {
      case 'like':
        if (!like) like = readType(child)
        break
      case 'head':
        head.push(readHead(child))
        break
      case 'link':
        link.push(readLink(child))
        break
      case 'bind':
        bind.push(readBind(child))
        break
      case 'mark': {
        const markVal = childWord(child, 1)
        if (markVal === 'private') hide = true
        break
      }
      default: {
        // Treat unknown keywords as prefilled values (head, code, hint, etc.)
        const val = readSiftFromChild(child)
        if (val && kw) {
          bind.push({ form: 'bind', name: kw, sift: val, site })
        }
        break
      }
    }
  }

  const result: SurfCaseType = {
    form: 'case-type',
    name,
    like: like ?? { form: 'type-name', name: '' },
    head,
    link,
    bind,
    site,
  }
  if (hide) result.hide = hide
  return result
}

// -- task --

function readTask(fork: PFork): SurfTask {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const head: SurfHead[] = []
  const base: SurfBase[] = []
  const flow: Surf[] = []
  const task: SurfTask[] = []
  let like: SurfType | undefined
  let risk: boolean | undefined
  let wait: boolean | undefined
  let hide: boolean | undefined
  let fold: boolean | undefined
  let alias: string | undefined

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
      case 'like':
        like = readType(child)
        break
      case 'task':
        task.push(readTask(child))
        break
      case 'mark': {
        const markVal = childWord(child, 1)
        if (markVal === 'unsafe') risk = true
        else if (markVal === 'async') wait = true
        else if (markVal === 'private') hide = true
        break
      }
      case 'fold':
        fold = childWord(child, 1) === 'well'
        break
      case 'name':
        alias = childKnitText(child, 1) ?? childWord(child, 1)
        break
      default: {
        const stmt = readStatement(child)
        if (stmt) flow.push(stmt)
        break
      }
    }
  }

  const result: SurfTask = { form: 'task', name, head, base, flow, task, site }
  if (like) result.like = like
  if (risk) result.risk = risk
  if (wait) result.wait = wait
  if (hide) result.hide = hide
  if (fold) result.fold = fold
  if (alias) result.alias = alias
  return result
}

// -- Type annotation nodes --

function readHead(fork: PFork): SurfHead {
  const name = childWord(fork, 1) ?? ''
  let need: string | undefined
  let fall: Surf | undefined

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'need') need = childWord(child, 1)
    if (headWord(child) === 'base') fall = readSiftFromChild(child)
  }

  const result: SurfHead = { form: 'head', name, need, site }
  if (fall) result.fall = fall
  return result
}

function readBase(fork: PFork): SurfBase {
  const name = childWord(fork, 1) ?? ''
  let like: SurfType | undefined
  let fall: Surf | undefined

  const children = childForks(fork, 2)
  for (const child of children) {
    if (headWord(child) === 'like') like = readType(child)
    if (headWord(child) === 'base') fall = readSiftFromChild(child)
  }

  // If the type is `like task`, the take/back signature children are
  // siblings in this fork (not children of the `like task` fork).
  // Collect them here and rebuild the type-fn with proper params/ret.
  if (like && like.form === 'type-fn' && like.params.length === 0) {
    const params: SurfType[] = []
    let ret: SurfType | undefined
    for (const child of children) {
      const kw = headWord(child)
      if (kw === 'take') {
        let foundLike = false
        for (const sub of childForks(child, 2)) {
          if (headWord(sub) === 'like') {
            params.push(readType(sub))
            foundLike = true
          }
        }
        if (!foundLike) {
          params.push({ form: 'type-name', name: '' })
        }
      }
      if (kw === 'back') {
        for (const sub of childForks(child, 2)) {
          if (headWord(sub) === 'like') {
            ret = readType(sub)
          }
        }
        const backChild = childFork(child, 1)
        if (backChild && headWord(backChild) === 'like') {
          ret = readType(backChild)
        }
      }
    }
    if (params.length > 0 || ret) {
      like = { form: 'type-fn', params, ret }
    }
  }

  const result: SurfBase = { form: 'base', name, like, site }
  if (fall) result.fall = fall
  return result
}

function readLink(fork: PFork): SurfLink {
  const name = childWord(fork, 1) ?? ''
  let like: SurfType | undefined

  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'like') like = readType(child)
  }

  return { form: 'link', name, like, site }
}

function readType(fork: PFork): SurfType {
  // like or
  //   like integer-32
  //   like integer-grow
  const word = childWord(fork, 1)
  if (word === 'or') {
    const list: SurfType[] = []
    for (const child of childForks(fork, 2)) {
      if (headWord(child) === 'like') list.push(readType(child))
    }
    return { form: 'type-or', list }
  }
  // like and
  //   like readable
  //   like writable
  if (word === 'and') {
    const list: SurfType[] = []
    for (const child of childForks(fork, 2)) {
      if (headWord(child) === 'like') list.push(readType(child))
    }
    return { form: 'type-and', list }
  }
  // like task → function type with nested take/back signature
  if (word === 'task') {
    const params: SurfType[] = []
    let ret: SurfType | undefined
    for (const child of childForks(fork, 2)) {
      const kw = headWord(child)
      if (kw === 'take') {
        // Read the param's type from nested like
        let foundLike = false
        for (const sub of childForks(child, 2)) {
          if (headWord(sub) === 'like') {
            params.push(readType(sub))
            foundLike = true
          }
        }
        // If no like, use a generic type
        if (!foundLike) {
          params.push({ form: 'type-name', name: '' })
        }
      }
      if (kw === 'back') {
        // back like <type> (like is a child of back)
        for (const sub of childForks(child, 2)) {
          if (headWord(sub) === 'like') {
            ret = readType(sub)
          }
        }
        // Also check at position 1 in case of inline: back like u64
        const backChild = childFork(child, 1)
        if (backChild && headWord(backChild) === 'like') {
          ret = readType(backChild)
        }
      }
    }
    return { form: 'type-fn', params, ret }
  }
  // like integer-32
  // like list
  //   like u64
  const name = word ?? ''
  const args: SurfType[] = []
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'like') args.push(readType(child))
  }
  if (args.length > 0) {
    return { form: 'type-name', name, args }
  }
  return { form: 'type-name', name }
}

function readCaseArm(fork: PFork): SurfCaseArm {
  const name = childWord(fork, 1) ?? ''
  const link: SurfLink[] = []
  const hold: SurfLink[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    if (kw === 'link') link.push(readLink(child))
    if (kw === 'hold') hold.push(readLink(child))
  }

  return { form: 'case-arm', name, link, hold, site }
}

// -- Statements --

function readStatement(fork: PFork): Surf | null {
  const kw = headWord(fork)
  switch (kw) {
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
    case 'hint':
      return { form: 'hint-log', sift: readSiftFromChild(fork), site }
    case 'tell':
      return { form: 'tell', sift: readSiftFromChild(fork), site }
    case 'kink':
      return { form: 'kink-log', sift: readSiftFromChild(fork), site }
    case 'bust':
      return readBustNode(fork)
    case 'halt':
      return readHaltNode(fork)
    case 'meet':
      return readMeet(fork)
    case 'fuse':
      return readFuse(fork)
    case 'send':
      if (childWord(fork, 1) === 'back') return readSendBack(fork)
      if (childWord(fork, 1) === 'error') return { form: 'send-error', site }
      return null
    case 'next':
      return { form: 'next', site }
    case 'turn':
      // turn next → continue
      if (childWord(fork, 1) === 'next') return { form: 'next', site }
      return null
    case 'slot':
      return { form: 'slot', name: childWord(fork, 1) ?? '', site }
    case 'beam':
      return readBeam(fork)
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

  // back meet and/or → logical operation
  if (siftKw === 'meet') {
    return { form: 'back', sift: readMeet(siftFork, childForks(fork, 2)), site }
  }

  // back <sift-expr>
  return { form: 'back', sift: readSiftExpr(siftFork), site }
}

// -- send back --

function readSendBack(fork: PFork): SurfBack {
  // send back, <sift> — position 1 is "back", position 2+ is the value
  const siftFork = childFork(fork, 2)
  if (!siftFork) return { form: 'back', site }

  const siftKw = headWord(siftFork)

  if (siftKw === 'call') {
    return {
      form: 'back',
      sift: readCall(siftFork, childForks(fork, 3)),
      site,
    }
  }

  if (siftKw === 'make') {
    return {
      form: 'back',
      sift: readMake(siftFork, childForks(fork, 3)),
      site,
    }
  }

  if (siftKw === 'meet') {
    return { form: 'back', sift: readMeet(siftFork, childForks(fork, 3)), site }
  }

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
    } else if (kw === 'fork') {
      sift = readForkNode(first)
    } else if (kw === 'walk') {
      sift = readWalkNode(first)
    } else {
      sift = readSiftExpr(first)
    }
  }

  return { form: 'save', path: [name], sift, site }
}

// -- meet --

function readMeet(fork: PFork, extraChildren?: PFork[]): SurfMeet {
  const mode = childWord(fork, 1) === 'or' ? 'or' : 'and'
  const list: Surf[] = []
  for (const child of childForks(fork, 2)) {
    const expr = readSiftExpr(child)
    if (expr) list.push(expr)
  }
  if (extraChildren) {
    for (const child of extraChildren) {
      const expr = readSiftExpr(child)
      if (expr) list.push(expr)
    }
  }
  return { form: 'meet', mode, list, site }
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
    } else if (kw === 'call') {
      sift = readCall(child, [])
    } else if (kw === 'hook') {
      hooks.push(readHook(child))
    } else if (kw === 'case') {
      // fork case with `case` keyword children (new syntax)
      hooks.push(readHook(child))
    }
  }

  return { form: 'fork', mode, sift, hook: hooks, site }
}

// -- walk --

function readWalkNode(fork: PFork): SurfWalk {
  const rawMode = childWord(fork, 1) ?? 'test'
  // walk form → treat as walk site (iterator)
  const mode = rawMode === 'form' ? 'site' : rawMode
  const children = childForks(fork, 2)
  let sift: Surf | undefined
  const hooks: SurfHook[] = []
  const binds: SurfBind[] = []

  for (const child of children) {
    const kw = headWord(child)
    if (
      kw === 'loan' ||
      kw === 'link' ||
      kw === 'move' ||
      kw === 'read'
    ) {
      sift = readSiftExpr(child)
    } else if (kw === 'call') {
      sift = readCall(child, [])
    } else if (kw === 'hook') {
      hooks.push(readHook(child))
    } else if (kw === 'bind') {
      // walk size: bind base, 0 / bind head, 10
      binds.push(readBind(child))
    }
  }

  const result: SurfWalk = { form: 'walk', mode, sift, hook: hooks, site }
  if (binds.length > 0) result.bind = binds
  return result
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
      collectBases(child, base)
    } else if (kw === 'take') {
      // take site, name item → extract alias as base param for walk hooks
      const takeName = childWord(child, 1) ?? ''
      let aliasName = takeName
      for (const takeChild of childForks(child, 2)) {
        if (headWord(takeChild) === 'name') {
          aliasName = childWord(takeChild, 1) ?? takeName
        }
      }
      base.push({ form: 'base', name: aliasName, site })
    } else {
      const stmt = readStatement(child)
      if (stmt) flow.push(stmt)
    }
  }

  return { form: 'hook', name, base, flow, site }
}

/** Read a base param and any comma-chained base siblings nested inside. */
function collectBases(fork: PFork, out: SurfBase[]): void {
  out.push(readBase(fork))
  for (const child of childForks(fork, 2)) {
    if (headWord(child) === 'base') {
      collectBases(child, out)
    }
  }
}

// -- call --

function readCall(fork: PFork, extraChildren: PFork[]): SurfCall {
  const name = childWord(fork, 1) ?? ''
  const binds: SurfBind[] = []
  const hook: Record<string, SurfHook> = {}
  const chain: SurfCall[] = []
  const callbackBase: SurfBase[] = []
  const callbackFlow: Surf[] = []
  let halt = false
  let wait = false

  const allChildren = [...childForks(fork, 2), ...extraChildren]
  for (const child of allChildren) {
    const kw = headWord(child)
    if (kw === 'bind') binds.push(readBind(child))
    else if (kw === 'halt') halt = true
    else if (kw === 'mark' && childWord(child, 1) === 'async') wait = true
    else if (kw === 'take') {
      callbackBase.push(readBase(child))
    }
    else if (callbackBase.length > 0) {
      // Once we've seen 'take' params, remaining children are callback body
      const stmt = readStatement(child)
      if (stmt) callbackFlow.push(stmt)
    }
    else if (kw === 'call') chain.push(readCall(child, []))
    else if (kw === 'read' || kw === 'loan' || kw === 'move' || kw === 'cite' || kw === 'text' || kw === 'mark' || kw === 'wave') {
      binds.push({ form: 'bind', name: '', sift: readSiftExpr(child), site })
    }
  }

  // If we collected callback params, create a 'body' hook
  if (callbackBase.length > 0) {
    hook['body'] = { form: 'hook', name: 'body', base: callbackBase, flow: callbackFlow, site }
  }

  const result: SurfCall = { form: 'call', name, bind: binds, hook, site }
  if (halt) result.halt = true
  if (wait) result.wait = true
  if (chain.length > 0) result.chain = chain
  return result
}

// -- make --

function readMake(fork: PFork, extraChildren: PFork[]): SurfMake {
  const name = childWord(fork, 1) ?? ''
  const binds: SurfBind[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    if (kw === 'bind') {
      binds.push(readBind(child))
    } else if (kw === 'save') {
      // make list: save item, 1 → bind with name and value
      // make find: save a, <name> → bind with key and value
      const saveName = childWord(child, 1) ?? ''
      const siftFork = childFork(child, 2)
      const sift = siftFork ? readSiftExpr(siftFork) : undefined
      binds.push({ form: 'bind', name: saveName, sift, site })
    } else if (kw === 'mark' || kw === 'text' || kw === 'read' || kw === 'wave' || kw === 'comb') {
      // make list: bare values (1, 2, 3) → unnamed binds
      binds.push({ form: 'bind', name: '', sift: readSiftExpr(child), site })
    }
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
  const list: Surf[] = []

  for (const child of children) {
    const word = childWord(child, 0)
    if (word === 'term') {
      const termChildren = childForks(child, 1)
      if (termChildren.length > 0) {
        list.push(readSiftExpr(termChildren[0]!))
      }
    } else if (!sift) {
      sift = readSiftExpr(child)
    }
  }

  const result: SurfHost = { form: 'host', name, sift, site }
  if (list.length > 0) result.list = list
  return result
}

// -- load --

function readLoad(fork: PFork): SurfLoad {
  const pathNode = childNode(fork, 1)
  let pathStr = ''
  // Handle <node:fs> text literals and plain paths
  if (pathNode?.form === 'tree-text') {
    pathStr = pathNode.nest
      .filter((n): n is PCord => n.form === 'tree-cord')
      .map(n => n.leaf.text)
      .join('')
  } else {
    pathStr = childWord(fork, 1) ?? ''
  }
  const path = pathStr.split('/')
  const find: SurfFind[] = []
  let name: string | undefined
  let dock = false
  const nestedLoads: SurfLoad[] = []

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    if (kw === 'find') {
      find.push(readFind(child))
    } else if (kw === 'name') {
      name = childWord(child, 1)
    } else if (kw === 'mark' && childWord(child, 1) === 'native') {
      dock = true
    } else if (kw === 'load') {
      // Nested load: load /sub/path → resolves relative to parent
      nestedLoads.push(readLoad(child))
    }
  }

  const result: SurfLoad = { form: 'load', path, find, hook: [], site }
  if (name) result.name = name
  if (dock) result.dock = true
  return result
}

function readFind(fork: PFork): SurfFind {
  const name = childWord(fork, 1) ?? ''
  let kind: string | undefined
  let alias: string | undefined

  for (const child of childForks(fork, 2)) {
    const kw = headWord(child)
    if (kw === 'like') {
      kind = childWord(child, 1) ?? undefined
    } else if (kw === 'name') {
      alias = childWord(child, 1) ?? undefined
    }
  }

  return { form: 'find', name, kind, alias, site }
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

// -- bear --

function readBear(fork: PFork): SurfBear {
  const pathStr = childWord(fork, 1) ?? ''
  const path = pathStr.split('/')
  return { form: 'bear', path, site }
}

// -- test --

function readTest(fork: PFork): SurfTest {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const flow: Surf[] = []
  for (const child of childForks(fork, 2)) {
    const stmt = readStatement(child)
    if (stmt) flow.push(stmt)
  }
  return { form: 'test', name, flow, site }
}

// -- time (benchmark) --

function readTime(fork: PFork): SurfTime {
  const name = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const head: SurfHead[] = []
  const flow: Surf[] = []
  for (const child of childForks(fork, 2)) {
    const word = headWord(child)
    if (word === 'head') {
      const h = readHead(child)
      if (h) head.push(h)
    } else {
      const stmt = readStatement(child)
      if (stmt) flow.push(stmt)
    }
  }
  return { form: 'time', name, head, flow, site }
}

// -- book --

function readBook(fork: PFork): SurfBook {
  const name = childWord(fork, 1) ?? ''
  const list: Surf[] = []
  for (const child of childForks(fork, 2)) {
    const node = readTop(child) ?? readStatement(child)
    if (node) list.push(node)
  }
  return { form: 'book', name, list, site }
}

// -- beam --

function readBeam(fork: PFork): SurfBeam {
  const name = childWord(fork, 1) ?? ''
  const flow: Surf[] = []
  for (const child of childForks(fork, 2)) {
    const node = readTop(child) ?? readStatement(child)
    if (node) flow.push(node)
  }
  return { form: 'beam', name, flow, site }
}

// -- halt --

function readHaltNode(fork: PFork): SurfHalt {
  const first = childWord(fork, 1)
  let term: 'code' | 'flow' | 'fork' | undefined
  let sift: Surf | undefined

  if (first === 'flow' || first === 'fork' || first === 'code') {
    term = first
    const siftFork = childFork(fork, 2)
    if (siftFork) sift = readSiftExpr(siftFork)
  } else {
    sift = readSiftFromChild(fork)
  }

  const result: SurfHalt = { form: 'halt', site }
  if (term) result.term = term
  if (sift) result.sift = sift
  return result
}

function readBustNode(fork: PFork): SurfBust {
  const first = childWord(fork, 1)
  const result: SurfBust = { form: 'bust', site }

  if (first) {
    // bust <message> (text literal) or bust error-name (named error)
    const sift = readSiftFromChild(fork)
    if (sift) {
      result.sift = sift
    } else {
      result.name = first
      // Read bind children for named errors
      const binds: SurfBind[] = []
      for (let i = 1; i < fork.nest.length; i++) {
        const child = fork.nest[i]
        if (!child || child.form !== 'fork') continue
        const kw = childWord(child as PFork, 0)
        if (kw === 'bind') {
          const b = readBind(child as PFork)
          if (b) binds.push(b)
        }
      }
      if (binds.length) result.bind = binds
    }
  }

  return result
}

// -- dock --

function readDockLoads(fork: PFork): SurfLoad[] {
  const loads: SurfLoad[] = []

  // dock can appear as "dock load\n  load ..." (old syntax, second word on same line)
  // or "dock\n  load ..." (new syntax, load is a direct child)
  // Distinguish by checking if nest[1] is a bare word (1 child) vs a full load directive (2+ children)
  const secondFork = childFork(fork, 1)
  const isOldSyntax = secondFork && headWord(secondFork) === 'load' && secondFork.nest.length === 1
  const startIdx = isOldSyntax ? 2 : 1
  for (const child of childForks(fork, startIdx)) {
    const kw = headWord(child)
    if (kw === 'load') {
      const pathNode = childNode(child, 1)
      let pathStr = ''
      if (pathNode?.form === 'tree-text') {
        pathStr = pathNode.nest
          .filter((n): n is PCord => n.form === 'tree-cord')
          .map(n => n.leaf.text)
          .join('')
      } else if (pathNode?.form === 'tree-fork') {
        pathStr = headWord(pathNode) ?? ''
      }

      let name: string | undefined
      for (const sub of childForks(child, 2)) {
        if (headWord(sub) === 'name') {
          name = childWord(sub, 1)
        }
      }

      loads.push({
        form: 'load',
        path: [pathStr],
        name,
        find: [],
        hook: [],
        dock: true,
        site,
      })
    }
  }

  return loads
}

// -- Sift expressions (value expressions) --

function readSiftExpr(fork: PFork): Surf {
  const kw = headWord(fork)
  switch (kw) {
    case 'loan':
    case 'move':
    case 'cite':
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
    case 'meet':
      return readMeet(fork)
    case 'term': {
      const termVal = childWord(fork, 1) ?? ''
      if (termVal === 'true' || termVal === 'false') {
        return { form: 'sift-wave', val: termVal === 'true', site }
      }
      return { form: 'sift-read', path: [termVal], site }
    }
    default:
      // Bare word treated as variable reference
      if (kw) return { form: 'sift-read', path: [kw], site }
      return { form: 'sift-mark', val: 0, site }
  }
}

function readSiftPath(
  fork: PFork,
  form: 'sift-read' | 'sift-link',
): Surf {
  const raw = childKnitText(fork, 1) ?? childWord(fork, 1) ?? ''
  const path = raw.split('/')
  const child = childFork(fork, 1)
  const safe = child?.optional === true
  if (safe) {
    return { form, path, safe, site }
  }
  return { form, path, site }
}

function readSiftMark(fork: PFork): Surf {
  const node = childNode(fork, 1)
  if (node?.form === 'tree-size') {
    return { form: 'sift-mark', val: node.bond, site }
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
