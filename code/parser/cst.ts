/**
 * CST (Concrete Syntax Tree) builder and utilities.
 *
 * The CstBuilder records tokens and tree structure during parsing
 * so that the resulting CST preserves every byte of the original
 * source. Trivia (whitespace, comments, newlines) is attached to
 * adjacent tokens per Roslyn conventions:
 *
 * - Leading trivia: whitespace/comments before a token
 * - Trailing trivia: whitespace after a token on the same line
 * - Newlines are leading trivia of the next token
 *
 * The CST supports round-tripping: cstToText(tree) === originalSource.
 */

import type {
  CstNode,
  CstTree,
  CstToken,
  CstTrivia,
  CstError,
  CstMissing,
  SourceRange,
  AstNode,
} from './form'

// ---- CstBuilder ----

type BuilderFrame = {
  form: string
  children: CstNode[]
  start: number
}

/**
 * Records CST nodes during parsing.
 *
 * Usage:
 *   builder.startNode('tree-block')
 *   builder.token('word', start, end)
 *   builder.finishNode()
 */
export class CstBuilder {
  private stack: BuilderFrame[] = []
  private root: CstNode[] = []
  private pendingTrivia: CstTrivia[] = []
  readonly source: string

  constructor(input: { source: string }) {
    this.source = input.source
  }

  /** Push a new tree node onto the stack. */
  startNode(input: { form: string, start: number }): void {
    this.stack.push({
      form: input.form,
      children: [],
      start: input.start,
    })
  }

  /** Pop the current tree node, finalize its range. */
  finishNode(input: { end: number }): CstTree {
    const frame = this.stack.pop()
    if (!frame) {
      throw new Error('CstBuilder: finishNode with no matching startNode')
    }
    const node: CstTree = {
      form: frame.form,
      children: frame.children,
      range: { start: frame.start, end: input.end },
    }
    this.addChild(node)
    return node
  }

  /** Add a leaf token with its source text. */
  token(input: { kind: string, start: number, end: number }): CstToken {
    const tok: CstToken = {
      form: 'token',
      kind: input.kind,
      text: this.source.slice(input.start, input.end),
      range: { start: input.start, end: input.end },
      lead: this.pendingTrivia,
      tail: [],
    }
    this.pendingTrivia = []
    this.addChild(tok)
    return tok
  }

  /** Record trivia (whitespace, comment, newline). */
  trivia(input: { form: 'whitespace' | 'comment' | 'newline', start: number, end: number }): void {
    this.pendingTrivia.push({
      form: input.form,
      text: this.source.slice(input.start, input.end),
      range: { start: input.start, end: input.end },
    })
  }

  /** Add an error node wrapping unparseable content. */
  error(input: { start: number, end: number, expected: string[] }): CstError {
    // Collect any tokens in the error range
    const errorChildren: CstNode[] = []

    // Add a token for the skipped text if there is any
    if (input.end > input.start) {
      const tok: CstToken = {
        form: 'token',
        kind: 'skipped',
        text: this.source.slice(input.start, input.end),
        range: { start: input.start, end: input.end },
        lead: this.pendingTrivia,
        tail: [],
      }
      this.pendingTrivia = []
      errorChildren.push(tok)
    }

    const node: CstError = {
      form: 'error',
      children: errorChildren,
      range: { start: input.start, end: input.end },
      expected: input.expected,
    }
    this.addChild(node)
    return node
  }

  /** Add a missing placeholder (zero-width). */
  missing(input: { expected: string, pos: number }): CstMissing {
    const node: CstMissing = {
      form: 'missing',
      expected: input.expected,
      range: { start: input.pos, end: input.pos },
    }
    this.addChild(node)
    return node
  }

  /** Abandon the current node (on backtrack). */
  abandonNode(): CstNode[] {
    const frame = this.stack.pop()
    return frame?.children ?? []
  }

  /** Get the current depth of the builder stack. */
  depth(): number {
    return this.stack.length
  }

  /** Get all root-level nodes. */
  roots(): CstNode[] {
    return this.root
  }

  /** Build the final CST tree. */
  build(input: { form: string }): CstTree {
    // Flush any remaining trivia to an EOF token
    if (this.pendingTrivia.length > 0) {
      const eofPos = this.source.length
      const tok: CstToken = {
        form: 'token',
        kind: 'eof',
        text: '',
        range: { start: eofPos, end: eofPos },
        lead: this.pendingTrivia,
        tail: [],
      }
      this.pendingTrivia = []
      this.root.push(tok)
    }

    return {
      form: input.form,
      children: this.root,
      range: { start: 0, end: this.source.length },
    }
  }

  private addChild(node: CstNode): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1]!.children.push(node)
    } else {
      this.root.push(node)
    }
  }
}

// ---- CST Utilities ----

/**
 * Convert a CST back to source text. This is the round-trip guarantee:
 * cstToText(parse(text)) === text
 */
export function cstToText(node: CstNode): string {
  switch (node.form) {
    case 'token': {
      const tok = node as CstToken
      let text = ''
      for (const t of tok.lead) text += t.text
      text += tok.text
      for (const t of tok.tail) text += t.text
      return text
    }
    case 'missing':
      return ''
    case 'error': {
      const err = node as CstError
      return err.children.map(cstToText).join('')
    }
    default: {
      const tree = node as CstTree
      return tree.children.map(cstToText).join('')
    }
  }
}

/**
 * Get the source range of a CST node.
 */
export function cstRange(node: CstNode): SourceRange {
  if (node.form === 'token') return (node as CstToken).range
  if (node.form === 'missing') return (node as CstMissing).range
  if (node.form === 'error') return (node as CstError).range
  return (node as CstTree).range
}

/**
 * Collect all errors from a CST tree.
 */
export function cstErrors(node: CstNode): CstError[] {
  const errors: CstError[] = []
  walkCst({ node, visit: n => {
    if (n.form === 'error') errors.push(n as CstError)
  }})
  return errors
}

/**
 * Collect all missing nodes from a CST tree.
 */
export function cstMissing(node: CstNode): CstMissing[] {
  const missing: CstMissing[] = []
  walkCst({ node, visit: n => {
    if (n.form === 'missing') missing.push(n as CstMissing)
  }})
  return missing
}

/**
 * Walk all nodes in a CST tree (depth-first).
 */
export function walkCst(input: { node: CstNode, visit: (node: CstNode) => void }): void {
  const { node, visit } = input
  visit(node)
  if (node.form === 'token' || node.form === 'missing') return
  const children = node.form === 'error'
    ? (node as CstError).children
    : (node as CstTree).children
  for (const child of children) {
    walkCst({ node: child, visit })
  }
}

/**
 * Convert a CST tree to the existing AstNode format for backward
 * compatibility. Strips trivia and error/missing nodes.
 */
export function cstToAst(node: CstNode): AstNode | undefined {
  if (node.form === 'token' || node.form === 'missing') return undefined
  if (node.form === 'error') return { form: 'error', range: (node as CstError).range }

  const tree = node as CstTree
  const result: AstNode = {
    form: tree.form,
    range: tree.range,
  }

  // Collect non-trivia children as AST fields
  const childAsts: AstNode[] = []
  for (const child of tree.children) {
    if (child.form === 'token') {
      const tok = child as CstToken
      if (tok.kind !== 'eof') {
        childAsts.push({ form: tok.kind, text: tok.text, range: tok.range })
      }
    } else {
      const childAst = cstToAst(child)
      if (childAst) childAsts.push(childAst)
    }
  }

  if (childAsts.length > 0) {
    result.list = childAsts
  }

  return result
}

/**
 * Find the indentation level at a given position in the source.
 * Returns the number of leading spaces on the line containing pos.
 */
export function indentAtPos(input: { source: string, pos: number }): number {
  const { source, pos } = input
  // Find start of line
  let lineStart = pos
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--
  }
  // Count leading spaces
  let indent = 0
  while (lineStart + indent < source.length && source[lineStart + indent] === ' ') {
    indent++
  }
  return indent
}

/**
 * Find the next line at the same or lesser indentation level.
 * Used for error recovery in indentation-based syntax.
 *
 * Returns the byte position of the start of the recovery line,
 * or the end of the source if no such line exists.
 */
export function findRecoveryPoint(input: {
  source: string
  pos: number
  maxIndent: number
}): number {
  const { source, pos, maxIndent } = input
  let i = pos

  // Skip to end of current line first
  while (i < source.length && source[i] !== '\n') {
    i++
  }

  // Now scan line by line
  while (i < source.length) {
    if (source[i] === '\n') {
      i++ // skip the newline
      // Check indentation of this new line
      let indent = 0
      while (i + indent < source.length && source[i + indent] === ' ') {
        indent++
      }
      // Skip blank lines
      if (i + indent < source.length && source[i + indent] === '\n') {
        i = i + indent
        continue
      }
      // Found a line at same or lesser indent
      if (indent <= maxIndent) {
        return i
      }
      // Skip this line (deeper indent)
      i = i + indent
      while (i < source.length && source[i] !== '\n') {
        i++
      }
    } else {
      i++
    }
  }

  return source.length
}
