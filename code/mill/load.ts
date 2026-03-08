/**
 * Term mill grammar loader.
 *
 * Parses mine.tree and mint.tree files into TermMineRule and
 * TermMintRule structures that the mine/mint walkers execute.
 *
 * The mine/mint files are themselves .tree files, so we parse
 * them using the existing tree parser, then interpret the
 * resulting PFork tree as mine/mint definitions.
 */

import type {
  MineDef,
  MineRule,
  MintDef,
  MintCase,
  MintHookMake,
  MintMakeRule,
  MintBindRule,
  Mill,
} from './form'
import type { PFork, PLine, PNode, PKnit, PCord } from './mine'

// ---- Public API ----

/**
 * Load mine definitions from a parsed .tree file.
 * Each top-level `mine X` fork becomes a MineDef.
 */
export function loadMineDefs(input: { tree: PLine }): Map<string, MineDef> {
  const defs = new Map<string, MineDef>()

  for (const fork of input.tree.nest) {
    const kw = forkKeyword(fork)
    if (kw === 'mine') {
      const def = readMineDef(fork)
      if (def) defs.set(def.name, def)
    }
  }

  return defs
}

/**
 * Load mint definitions from a parsed .tree file.
 * Each top-level `mint X, like Y` fork becomes a MintDef.
 */
export function loadMintDefs(input: { tree: PLine }): Map<string, MintDef> {
  const defs = new Map<string, MintDef>()

  for (const fork of input.tree.nest) {
    const kw = forkKeyword(fork)
    if (kw === 'mint') {
      const def = readMintDef(fork)
      if (def) defs.set(def.name, def)
    }
  }

  return defs
}

/**
 * Load a complete mill (mine + mint) from parsed trees.
 */
export function loadMill(input: {
  mineTree: PLine
  mintTree: PLine
}): Mill {
  return {
    mine: loadMineDefs({ tree: input.mineTree }),
    mint: loadMintDefs({ tree: input.mintTree }),
  }
}

// ---- Mine loading ----

/** Read a top-level `mine X` fork into a MineDef. */
function readMineDef(fork: PFork): MineDef | undefined {
  const name = inlineWord(fork, 1)
  if (!name) return undefined

  const children = childForks(fork)
  const rules: MineRule[] = []
  for (const child of children) {
    const rule = readMineRule(child)
    if (rule) rules.push(rule)
  }

  // Wrap in a sequence if multiple rules, or use single rule
  const rule: MineRule = rules.length === 1
    ? rules[0]!
    : { form: 'mine-term', list: rules }

  return { form: 'mine-def', name, rule }
}

/** Read a nested mine rule from a PFork. */
function readMineRule(fork: PFork): MineRule | undefined {
  const kw = forkKeyword(fork)

  if (kw === 'mine') {
    return readMineKeyword(fork)
  }

  if (kw === 'take') {
    const name = inlineWord(fork, 1)
    if (!name) return undefined
    return { form: 'mine-take', name }
  }

  return undefined
}

/** Read a `mine X` rule (where X is the mine type keyword). */
function readMineKeyword(fork: PFork): MineRule | undefined {
  const mineType = inlineWord(fork, 1)

  if (mineType === 'term') {
    // mine term [, term X]
    const termName = inlineBindValue(fork, 'term')
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) list.push(rule)
    }
    return { form: 'mine-term', term: termName, list }
  }

  if (mineType === 'form') {
    // mine form, form X
    const formName = inlineBindValue(fork, 'form')
    if (!formName) return undefined
    return { form: 'mine-form-ref', name: formName }
  }

  if (mineType === 'any') {
    // mine any - alternatives (first match wins)
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) list.push(rule)
    }
    return { form: 'mine-any', list }
  }

  if (mineType === 'case') {
    // mine case - at-most-one-each, any order
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const kw = forkKeyword(child)
      if (kw === 'mine') {
        const innerType = inlineWord(child, 1)
        if (innerType === 'need') {
          // mine need - required child inside mine case
          const needChildren = childForks(child)
          const needRules: MineRule[] = []
          for (const nc of needChildren) {
            const r = readMineRule(nc)
            if (r) needRules.push(r)
          }
          const innerRule: MineRule = needRules.length === 1
            ? needRules[0]!
            : { form: 'mine-term', list: needRules }
          list.push({ form: 'mine-need', rule: innerRule })
        } else {
          const rule = readMineRule(child)
          if (rule) list.push(rule)
        }
      } else {
        const rule = readMineRule(child)
        if (rule) list.push(rule)
      }
    }
    return { form: 'mine-case', list }
  }

  if (mineType === 'list') {
    // mine list
    const children = childForks(fork)
    if (children.length === 0) return undefined
    // The list's child rule is all the nested rules combined
    const rules: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) rules.push(rule)
    }
    const rule: MineRule = rules.length === 1
      ? rules[0]!
      : { form: 'mine-term', list: rules }
    return { form: 'mine-list', rule }
  }

  if (mineType === 'maybe') {
    // mine maybe
    const children = childForks(fork)
    if (children.length === 0) return undefined
    const rules: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) rules.push(rule)
    }
    const rule: MineRule = rules.length === 1
      ? rules[0]!
      : { form: 'mine-term', list: rules }
    return { form: 'mine-maybe', rule }
  }

  if (mineType === 'text') {
    // mine text
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) list.push(rule)
    }
    return { form: 'mine-text', list }
  }

  if (mineType === 'path') {
    // mine path
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) list.push(rule)
    }
    return { form: 'mine-path', list }
  }

  // Unknown mine type: try treating as a top-level inline term match
  // e.g., `mine term` with no comma separator
  if (!mineType) {
    // Bare `mine` with children
    const children = childForks(fork)
    const list: MineRule[] = []
    for (const child of children) {
      const rule = readMineRule(child)
      if (rule) list.push(rule)
    }
    return { form: 'mine-term', list }
  }

  return undefined
}

// ---- Mint loading ----

/** Read a top-level `mint X, like Y` fork into a MintDef. */
function readMintDef(fork: PFork): MintDef | undefined {
  const name = inlineWord(fork, 1)
  if (!name) return undefined

  const like = inlineBindValue(fork, 'like') ?? name

  const cases: MintCase[] = []
  let hook: MintHookMake | undefined

  for (const child of childForks(fork)) {
    const kw = forkKeyword(child)

    if (kw === 'case') {
      const c = readMintCase(child)
      if (c) cases.push(c)
    } else if (kw === 'hook') {
      const hookType = inlineWord(child, 1)
      if (hookType === 'make') {
        hook = readHookMake(child)
      }
    }
  }

  return { form: 'mint-def', name, like, cases, hook }
}

/** Read a `case X [, mint Y]` + `slot Z` pair. */
function readMintCase(fork: PFork): MintCase | undefined {
  const name = inlineWord(fork, 1)
  if (!name) return undefined

  const mintRef = inlineBindValue(fork, 'mint')

  // Look for slot child
  let slot = name // default slot name = case name
  for (const child of childForks(fork)) {
    const kw = forkKeyword(child)
    if (kw === 'slot') {
      slot = inlineWord(child, 1) ?? name
    }
  }

  return { form: 'mint-case', name, mint: mintRef, slot }
}

/** Read a `hook make` block. */
function readHookMake(fork: PFork): MintHookMake | undefined {
  for (const child of childForks(fork)) {
    const kw = forkKeyword(child)
    if (kw === 'make') {
      const make = readMake(child)
      if (make) return { form: 'mint-hook-make', make }
    }
  }
  return undefined
}

/** Read a `make X` with `bind` children. */
function readMake(fork: PFork): MintMakeRule | undefined {
  const name = inlineWord(fork, 1)
  if (!name) return undefined

  const bind: MintBindRule[] = []
  for (const child of childForks(fork)) {
    const kw = forkKeyword(child)
    if (kw === 'bind') {
      const b = readBind(child)
      if (b) bind.push(b)
    }
  }

  return { form: 'mint-make', name, bind }
}

/** Read a `bind X, read Y` rule. */
function readBind(fork: PFork): MintBindRule | undefined {
  const field = inlineWord(fork, 1)
  if (!field) return undefined

  const slot = inlineBindValue(fork, 'read') ?? field

  return { form: 'mint-bind', field, slot }
}

// ---- Tree navigation helpers ----

/** Get keyword from a PFork (first cord in first knit). */
function forkKeyword(fork: PFork): string | undefined {
  const knit = fork.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined
  const cord = knit.nest[0]
  if (!cord || cord.form !== 'tree-cord') return undefined
  return cord.leaf.text
}

/**
 * Get an inline word at position i in the knit.
 * Position 0 = keyword, 1 = first inline value, etc.
 */
function inlineWord(fork: PFork, i: number): string | undefined {
  const knit = fork.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined
  const cord = knit.nest[i]
  if (!cord || cord.form !== 'tree-cord') return undefined
  return cord.leaf.text
}

/**
 * Get an inline bind value: `keyword X, key Y` returns Y when
 * looking for key. Scans the knit for comma-separated key-value pairs.
 *
 * In .tree syntax, `mine form, form sift` has a knit with:
 * [PCord("mine"), PCord("form"), PCord("form"), PCord("sift")]
 *
 * Actually in the parser output, comma-separated values in a knit
 * look like: [PCord("mine"), PCord("form"), PCord("form"), PCord("sift")]
 * where the second "form" is the key and "sift" is the value.
 *
 * We scan for the key word and return the next word.
 */
function inlineBindValue(fork: PFork, key: string): string | undefined {
  const knit = fork.nest[0]
  if (!knit || knit.form !== 'tree-knit') return undefined

  // Scan from index 2+ (skip keyword at 0 and first value at 1)
  // to find key-value bind pairs like `term load` or `like import`
  for (let i = 2; i < knit.nest.length; i++) {
    const node = knit.nest[i]
    if (node && node.form === 'tree-cord' && node.leaf.text === key) {
      const next = knit.nest[i + 1]
      if (next && next.form === 'tree-cord') {
        return next.leaf.text
      }
    }
  }

  return undefined
}

/** Get all child PForks (nest[1+] that are tree-fork). */
function childForks(fork: PFork): PFork[] {
  const result: PFork[] = []
  for (let i = 1; i < fork.nest.length; i++) {
    const n = fork.nest[i]
    if (n && n.form === 'tree-fork') result.push(n)
  }
  return result
}
