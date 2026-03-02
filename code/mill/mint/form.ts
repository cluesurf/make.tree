/**
 * Mint rule types.
 *
 * Mint rules define how to construct Surface AST nodes from the
 * labeled values (take-map) produced by the mine phase. They are
 * parsed from .note files in base.tree/code/mill/code/.
 *
 * A mint rule tree reads from the take-map and builds Surface
 * AST nodes (SurfTask, SurfForm, SurfCall, etc.).
 */

import type { Site } from '@/kink/site'

/** A named mint definition (e.g., `mint task`). */
export type MintForm = {
  form: 'mint-def'
  name: string
  rule: MintRule
  site: Site
}

/**
 * Union of all mint rule types.
 *
 * These correspond to the keywords found in mint.note files:
 *   mint <name>, save, line, knit, make, bind, turn seed,
 *   form, base, link
 */
export type MintRule =
  | MintNamed
  | MintSave
  | MintLine
  | MintKnit
  | MintMake
  | MintBind
  | MintTurnSeed
  | MintFormRule
  | MintBase
  | MintLink

/**
 * mint <name> [, save <var>] [, form <form>]
 *
 * Named mint sub-rule. Reads from the take-map entry labeled
 * `name`. Optional `save` stores the result in a variable.
 * Optional `form` delegates to another named mint rule. Children
 * are nested rules that run in the sub-scope.
 */
export type MintNamed = {
  form: 'mint-named'
  name: string
  save?: string
  delegateForm?: string
  list: MintRule[]
  site: Site
}

/**
 * save <name>
 *
 * Store the current value into a named variable in the build
 * context. The variable can be referenced later by `link <name>`.
 */
export type MintSave = {
  form: 'mint-save'
  name: string
  site: Site
}

/**
 * line <name>
 *
 * Append the current value to an array variable named `name`
 * in the build context.
 */
export type MintLine = {
  form: 'mint-line'
  name: string
  site: Site
}

/**
 * knit <name>, site <key>
 *
 * Add the current value to a hash map variable named `name`,
 * keyed by the value of variable `key`.
 */
export type MintKnit = {
  form: 'mint-knit'
  name: string
  hook: string
  site: Site
}

/**
 * make <name>
 *
 * Construct a Surface AST node of type `name`. Children are
 * `bind` rules that set properties on the node. Ends with
 * `turn seed` to finalize and return the node.
 */
export type MintMake = {
  form: 'mint-make'
  name: string
  list: MintRule[]
  site: Site
}

/**
 * bind <name>, link <var>
 *
 * Set property `name` on the current node being constructed
 * (inside a `make` block) to the value of variable `var`.
 */
export type MintBind = {
  form: 'mint-bind'
  name: string
  link: string
  site: Site
}

/**
 * turn seed
 *
 * Finalize the current node and return it as the result.
 * Appears at the end of `make` blocks and as a standalone
 * statement to return results from mint sub-rules.
 *
 * When used standalone with children, those children configure
 * what to return (e.g., `form list` wraps in a list node).
 */
export type MintTurnSeed = {
  form: 'mint-turn-seed'
  list: MintRule[]
  site: Site
}

/**
 * form <name>
 *
 * Delegate to another named mint rule. Can appear as a child
 * of `turn seed` to wrap the result in a specific form.
 */
export type MintFormRule = {
  form: 'mint-form'
  name: string
  list: MintRule[]
  site: Site
}

/**
 * base <name> [, term <val>]
 *
 * Reference a base value. Used inside `make` blocks to set
 * properties from base definitions. The optional `term` is a
 * literal value. Can also have children (e.g., `link <var>`).
 */
export type MintBase = {
  form: 'mint-base'
  name: string
  term?: string
  list: MintRule[]
  site: Site
}

/**
 * link <name>
 *
 * Reference a variable from the build context. Used inside
 * `bind` and `base` rules to read stored values.
 */
export type MintLink = {
  form: 'mint-link'
  name: string
  site: Site
}

/**
 * A load directive at the top of a mint.note file.
 *
 * load ../path
 *   hook mint <name>    -- import and merge a mint def
 *   find <name>         -- reference an external mint def
 *   take form <name>    -- import a form mint def into scope
 */
export type MintLoad = {
  form: 'mint-load'
  road: string
  hook: MintLoadHook[]
  find: MintLoadFind[]
  take: MintLoadTake[]
  site: Site
}

export type MintLoadHook = {
  form: 'mint-load-hook'
  kind: 'mint'
  name: string
  site: Site
}

export type MintLoadFind = {
  form: 'mint-load-find'
  name: string
  site: Site
}

export type MintLoadTake = {
  form: 'mint-load-take'
  kind: string
  name: string
  site: Site
}

/**
 * A complete mint.note file. Contains load directives
 * and named mint definitions.
 */
export type MintFile = {
  load: MintLoad[]
  formList: MintForm[]
}
