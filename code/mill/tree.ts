/**
 * Minimal Tree AST types needed by the mill engine.
 *
 * These mirror the types from @cluesurf/tree but are defined
 * locally to avoid a hard dependency. The Tree parser produces
 * these structures from .tree files.
 */

/** A parsed .tree file. */
export type Tree = {
  form: 'tree'
  list: Array<TreeLink>
}

/** A line/block in tree format: keyword + children. */
export type TreeLink = {
  form: 'link'
  text: string
  list: Array<TreeTerm | TreeLink | TreeCord | TreeMark>
  base?: TreeTerm | TreeBind
  code?: TreeCode
}

/** A comma-separated term (sequence of cords and binds). */
export type TreeTerm = {
  form: 'term'
  list: Array<TreeCord | TreeBind>
  base?: TreeTerm | TreeBind
  code?: TreeCode
}

/** A string interpolation binding. */
export type TreeBind = {
  form: 'bind'
  size: number
  link: TreeLink
  code?: TreeCode
}

/** A number literal. */
export type TreeMark = {
  form: 'mark'
  text: string
  code?: TreeCode
}

/** A plain text segment (word, identifier). */
export type TreeCord = {
  form: 'cord'
  text: string
  base?: TreeText | TreeBind
  code?: TreeCode
}

/** A text literal `<...>`. */
export type TreeText = {
  form: 'text'
  list: Array<TreeCord | TreeBind>
  code?: TreeCode
}

/** Source position info on a tree node. */
export type TreeCode = {
  base?: Leaf
  head?: Leaf
}

/** A lexer token with source position. */
export type Leaf = {
  band: LeafBand
  text: string
}

export type LeafBand = {
  base: LeafBandSlot
  head: LeafBandSlot
}

export type LeafBandSlot = {
  mark: number
  line: number
}

/** Any tree node. */
export type TreeSite =
  | TreeMark
  | TreeLink
  | TreeTerm
  | TreeBind
  | TreeCord
  | TreeText
  | Tree
