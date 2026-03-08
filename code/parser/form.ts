/**
 * Types for the generic string parser engine.
 *
 * The parser takes mine/mint definitions and compiles them into
 * a fused rule tree. Each match point knows which AST constructor
 * and slot to invoke, so matching and building happen together
 * in a single pass (no intermediate TakeMap).
 */

// ---- Source Mine/Mint Definitions (input to compilation) ----

/** A named mine definition (from .tree grammar files). */
export type MineDef = {
  name: string
  params: Array<{ name: string, type?: string }>
  rule: MineRule
}

/** Union of all mine rule types for string parsing. */
export type MineRule =
  | { form: 'literal', text: string }
  | { form: 'char-code', code: number }
  | { form: 'range', base: number, head: number }
  | { form: 'ref', name: string, bind?: Array<RuleBind>, take?: string }
  | { form: 'seq', list: Array<MineRule> }
  | { form: 'choice', list: Array<MineRule> }
  | { form: 'optional', rule: MineRule }
  | { form: 'not', rule: MineRule }
  | { form: 'repeat', rule: MineRule, min?: RuleVal, max?: RuleVal }
  | { form: 'take', name: string }
  | { form: 'save', name: string, value: RuleVal }

/** A parameter binding. */
export type RuleBind = {
  name: string
  value: RuleVal
}

/** A value expression. */
export type RuleVal =
  | { form: 'const', val: number }
  | { form: 'read', name: string }
  | { form: 'call', name: string, args: Array<RuleBind> }

/** A named mint definition (from .tree grammar files). */
export type MintDef = {
  name: string
  like: string
  cases: Array<MintCase>
  make: MintMake | undefined
}

/** Observe a take event. */
export type MintCase = {
  name: string
  mint?: string
  slot: string
}

/** Construct an AST node. */
export type MintMake = {
  type: string
  binds: Array<{ field: string, slot: string }>
}

// ---- Compiled Rule Tree (fused mine+mint) ----

/**
 * A compiled rule is a mine rule annotated with mint actions.
 * When the mine rule matches, the mint action fires immediately.
 */
export type CompiledRule = MineRule & {
  /** When this rule's take fires, which mint context handles it. */
  mintAction?: MintAction
}

/** What to do when a take event fires. */
export type MintAction = {
  /** Which slot to store the result in. */
  slot: string
  /** If set, delegate to this mint def to build a sub-node. */
  mint?: string
  /** The mint def to use for building. */
  mintDef?: MintDef
}

// ---- Parse Result ----

export type ParseResult = {
  output: AstNode | undefined
  errors: Array<ParseError>
}

export type ParseError = {
  message: string
  line: number
  col: number
  pos: number
}

// ---- AST Node (generic output) ----

export type AstNode = {
  form: string
  [key: string]: unknown
}

// ---- Text Edit (for incremental reparsing) ----

export type TextEdit = {
  start: number
  end: number
  newText: string
}

// ---- Source Range ----

export type SourceRange = {
  start: number
  end: number
}

// ---- CST (Concrete Syntax Tree) ----

/**
 * A CST node is either a tree (branch) or a token (leaf).
 * The CST preserves every byte of the original source.
 */
export type CstNode = CstTree | CstToken | CstError | CstMissing

/**
 * A branch node containing ordered children.
 * Its text is the concatenation of all descendant tokens.
 */
export type CstTree = {
  form: string
  children: CstNode[]
  range: SourceRange
}

/**
 * A leaf token with exact source text and optional trivia.
 * Leading trivia = whitespace/comments before this token.
 * Trailing trivia = whitespace after this token on the same line.
 */
export type CstToken = {
  form: 'token'
  kind: string
  text: string
  range: SourceRange
  lead: CstTrivia[]
  tail: CstTrivia[]
}

/**
 * Trivia: whitespace, comments, or newlines between tokens.
 * Attached to adjacent tokens per Roslyn conventions.
 */
export type CstTrivia = {
  form: 'whitespace' | 'comment' | 'newline'
  text: string
  range: SourceRange
}

/**
 * An error node wrapping tokens that could not be parsed.
 * Contains the actual tokens so no source text is lost.
 */
export type CstError = {
  form: 'error'
  children: CstNode[]
  range: SourceRange
  expected: string[]
}

/**
 * A zero-width placeholder for a required element that was missing.
 * Allows the rest of the tree to parse successfully.
 */
export type CstMissing = {
  form: 'missing'
  expected: string
  range: SourceRange
}
