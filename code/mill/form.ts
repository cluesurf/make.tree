/**
 * Term mill types.
 *
 * Defines the mine (pattern matching) and mint (AST building)
 * rule types for the term mill. The term mill transforms Tree AST
 * (PFork, PCord, etc.) into Surface AST (SurfTask, SurfForm, etc.)
 * using declarative mine/mint rules loaded from .tree files.
 */

// ---- Mine Rules ----

/**
 * A named mine definition.
 * e.g., `mine form` defines a rule named "form".
 */
export type MineDef = {
  form: 'mine-def'
  name: string
  rule: MineRule
}

/** Union of all mine rule types. */
export type MineRule =
  | MineTermRule
  | MineFormRef
  | MineCaseRule
  | MineListRule
  | MineMaybeRule
  | MineTextRule
  | MinePathRule
  | MineTakeRule

/**
 * mine term [, term X]
 *
 * Match a PFork whose keyword is X. If no term specified,
 * match the next child (any keyword). Children are nested
 * rules that match the PFork's children.
 */
export type MineTermRule = {
  form: 'mine-term'
  term?: string
  list: MineRule[]
}

/**
 * mine form, form X
 *
 * Delegate to another named mine rule.
 */
export type MineFormRef = {
  form: 'mine-form-ref'
  name: string
}

/**
 * mine case
 *
 * Try each child rule in order. Use the first that matches.
 */
export type MineCaseRule = {
  form: 'mine-case'
  list: MineRule[]
}

/**
 * mine list
 *
 * Match zero or more repetitions of the child rule.
 */
export type MineListRule = {
  form: 'mine-list'
  rule: MineRule
}

/**
 * mine maybe
 *
 * Optional match. If the child fails, succeed with nothing.
 */
export type MineMaybeRule = {
  form: 'mine-maybe'
  rule: MineRule
}

/**
 * mine text
 *
 * Match text content from a PCord, PText, or PKnit.
 * Children are take rules to extract the value.
 */
export type MineTextRule = {
  form: 'mine-text'
  list: MineRule[]
}

/**
 * mine path
 *
 * Match a slash-separated path. Children are take rules.
 */
export type MinePathRule = {
  form: 'mine-path'
  list: MineRule[]
}

/**
 * take X
 *
 * Extract current value and label it X.
 * This is how values flow from mine to mint.
 */
export type MineTakeRule = {
  form: 'mine-take'
  name: string
}

// ---- Mint Rules ----

/**
 * A named mint definition.
 * e.g., `mint form, like surf-form` defines a builder
 * named "form" that produces form "surf-form".
 */
export type MintDef = {
  form: 'mint-def'
  name: string
  like: string
  cases: MintCase[]
  hook?: MintHookMake
}

/**
 * case X [, mint Y]
 *
 * Watch for mine event named X. If mint Y is specified,
 * delegate the value to sub-mint Y before storing.
 */
export type MintCase = {
  form: 'mint-case'
  name: string
  mint?: string
  slot: string
}

/**
 * hook make
 *
 * Fires when mine finishes. Contains make/bind rules
 * to construct the final typed AST node.
 */
export type MintHookMake = {
  form: 'mint-hook-make'
  make: MintMakeRule
}

/**
 * make X
 *
 * Create an AST node with form X.
 * Children are bind rules.
 */
export type MintMakeRule = {
  form: 'mint-make'
  name: string
  bind: MintBindRule[]
}

/**
 * bind X, read Y
 *
 * Set field X on the constructed node to the value
 * stored in slot Y.
 */
export type MintBindRule = {
  form: 'mint-bind'
  field: string
  slot: string
}

// ---- Mill Definition ----

/** A complete mill: mine + mint definitions keyed by name. */
export type Mill = {
  mine: Map<string, MineDef>
  mint: Map<string, MintDef>
}
