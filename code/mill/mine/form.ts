/**
 * Mine rule types.
 *
 * Mine rules define how to match and extract values from Tree AST.
 * They are parsed from .note files in base.tree/code/mill/code/.
 *
 * A mine rule tree walks a Tree AST (TreeLink, TreeTerm, etc.) and
 * produces a bag of labeled values (take-map) for the mint phase.
 */

import type { Site } from '@/kink/site'

/** A named mine definition (e.g., `mine task`). */
export type MineForm = {
  form: 'mine-def'
  name: string
  rule: MineRule
  site: Site
}

/**
 * Union of all mine rule types.
 *
 * These correspond to the keywords found in mine.note files:
 *   mine term, mine list, mine case, mine form, mine head,
 *   mine room, mine path, mine text, take, make head, make case,
 *   tree rest, note
 */
export type MineRule =
  | MineTerm
  | MineList
  | MineCase
  | MineFormRule
  | MineHead
  | MineRoom
  | MinePath
  | MineText
  | MineTake
  | MineMakeHead
  | MineMakeCase
  | MineTreeRest
  | MineNote

/**
 * mine term [, term <name>]
 *
 * Match a Tree term node. If `term` is specified, only match when
 * the TreeLink's text equals that name. Children are nested rules
 * that match the term's children in sequence.
 */
export type MineTerm = {
  form: 'mine-term'
  term?: string
  list: MineRule[]
  site: Site
}

/**
 * mine list
 *
 * Match zero or more repetitions of the child rule.
 * The child is typically a `mine form` that tags each match.
 */
export type MineList = {
  form: 'mine-list'
  rule: MineRule
  site: Site
}

/**
 * mine case
 *
 * Try each child rule in order. Use the first that matches.
 * Used for discriminated unions (e.g., a sift that could be
 * text, link, move, read, loan, make, call, etc.).
 */
export type MineCase = {
  form: 'mine-case'
  list: MineRule[]
  site: Site
}

/**
 * mine form, form <name>
 *
 * Tag the match result with a form name and extract via `take`.
 * The `name` becomes the label in the take-map. Children run
 * inside this scope.
 */
export type MineFormRule = {
  form: 'mine-form'
  name: string
  take?: string
  list: MineRule[]
  site: Site
}

/**
 * mine head
 *
 * Pick the first matching child. Unlike `mine case` which tries
 * alternatives, `mine head` picks based on what's available in
 * the input (first-match semantics on actual tree children).
 */
export type MineHead = {
  form: 'mine-head'
  list: MineRule[]
  site: Site
}

/**
 * mine room
 *
 * Optional match. If the child rule fails, produce nothing
 * rather than failing the parent.
 */
export type MineRoom = {
  form: 'mine-room'
  rule: MineRule
  site: Site
}

/**
 * mine path
 *
 * Match a slash-separated path (e.g., `@cluesurf/base/code/show`).
 * Extracts the path segments.
 */
export type MinePath = {
  form: 'mine-path'
  list: MineRule[]
  site: Site
}

/**
 * mine text
 *
 * Match a text literal (TreeText / TreeCord content).
 */
export type MineText = {
  form: 'mine-text'
  list: MineRule[]
  site: Site
}

/**
 * take <name>
 *
 * Extract the current matched value and label it with `name`
 * in the take-map. This is how values flow from mine to mint.
 */
export type MineTake = {
  form: 'mine-take'
  name: string
  site: Site
}

/**
 * make head
 *
 * Create a head-scope for children. Used to group optional
 * fields that should be tried as a unit.
 */
export type MineMakeHead = {
  form: 'mine-make-head'
  list: MineRule[]
  site: Site
}

/**
 * make case
 *
 * Create a case-scope for children. Like make head but for
 * discriminated alternatives.
 */
export type MineMakeCase = {
  form: 'mine-make-case'
  list: MineRule[]
  site: Site
}

/**
 * tree rest
 *
 * Inline reference to another named mine rule tree.
 * Used for sharing common patterns (e.g., case/mine.note
 * defines `tree rest` which is referenced by `mine base`
 * and `mine head`).
 */
export type MineTreeRest = {
  form: 'mine-tree-rest'
  name: string
  site: Site
}

/**
 * note <text>
 *
 * Annotation on a mine rule. Does not affect matching.
 * Used for documentation (e.g., `note <Mutable>`).
 */
export type MineNote = {
  form: 'mine-note'
  text: string
  site: Site
}

/**
 * A load directive at the top of a mine.note file.
 *
 * load ../path
 *   hook mine <name>    -- import and merge a mine def
 *   find <name>         -- reference an external mine def
 *   take mine <name>    -- import a mine def into scope
 */
export type MineLoad = {
  form: 'mine-load'
  path: string
  hook: MineLoadHook[]
  find: MineLoadFind[]
  take: MineLoadTake[]
  site: Site
}

export type MineLoadHook = {
  form: 'mine-load-hook'
  kind: 'mine'
  name: string
  site: Site
}

export type MineLoadFind = {
  form: 'mine-load-find'
  name: string
  site: Site
}

export type MineLoadTake = {
  form: 'mine-load-take'
  kind: 'mine'
  name: string
  site: Site
}

/**
 * A complete mine.note file. Contains load directives
 * and named mine definitions.
 */
export type MineFile = {
  load: MineLoad[]
  formList: MineForm[]
}
