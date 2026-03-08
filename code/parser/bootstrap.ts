/**
 * Bootstrap .tree parser.
 *
 * A minimal hand-written parser that can read .tree files into a
 * generic tree structure. This is the seed that bootstraps the
 * mine/mint grammar system. Once the StringParser can parse .tree
 * files using loaded grammar definitions, this bootstrap is no
 * longer needed at runtime (but remains for initial loading).
 *
 * Only handles the subset of .tree syntax used in grammar files:
 * - Indented blocks with names
 * - Comma-separated terms on a line
 * - Angle bracket text literals (<...>)
 * - Numbers
 * - Character codes (#uXXXX)
 * - Comments (# ...)
 */

/** A node in the bootstrap tree. */
export type BootstrapNode = {
  /** The first word on the line (keyword). */
  name: string
  /** Comma-separated terms after the keyword. */
  terms: Array<BootstrapTerm>
  /** Indented child nodes. */
  children: Array<BootstrapNode>
}

/** A term value (word, text literal, number, or char code). */
export type BootstrapTerm =
  | { form: 'word', text: string }
  | { form: 'text', text: string }
  | { form: 'mark', value: number }
  | { form: 'code', text: string }

/** Parse a .tree file into a list of top-level nodes. */
export function parseBootstrapTree(input: { text: string }): Array<BootstrapNode> {
  const lines = splitLines(input.text)
  const parsed = parseLines(lines)
  return buildTree(parsed)
}

type RawLine = {
  indent: number
  content: string
}

function splitLines(text: string): Array<RawLine> {
  const result: Array<RawLine> = []
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('# ')) {
      continue
    }
    const stripped = line.replace(/^ */, '')
    const indent = line.length - stripped.length
    if (indent % 2 !== 0) {
      throw new Error(`Odd indentation: ${indent} spaces`)
    }
    result.push({ indent: indent / 2, content: stripped })
  }
  return result
}

type ParsedLine = {
  indent: number
  name: string
  terms: Array<BootstrapTerm>
}

function parseLines(lines: Array<RawLine>): Array<ParsedLine> {
  return lines.map(line => {
    const { name, rest } = splitFirst(line.content)
    const terms = rest ? parseTerms(rest) : []
    return { indent: line.indent, name, terms }
  })
}

function splitFirst(content: string): { name: string, rest: string } {
  // Handle special case: line starts with text literal
  if (content.startsWith('<')) {
    return { name: '', rest: content }
  }

  // Find first space or comma that separates name from rest
  let i = 0
  while (i < content.length && content[i] !== ' ' && content[i] !== ',') {
    i++
  }
  const name = content.slice(0, i)
  let rest = content.slice(i).trimStart()
  if (rest.startsWith(', ')) {
    rest = rest.slice(2)
  } else if (rest.startsWith(',')) {
    rest = rest.slice(1).trimStart()
  }
  return { name, rest }
}

function parseTerms(text: string): Array<BootstrapTerm> {
  const terms: Array<BootstrapTerm> = []
  let i = 0

  while (i < text.length) {
    // Skip whitespace
    while (i < text.length && text[i] === ' ') i++
    if (i >= text.length) break

    if (text[i] === '<') {
      // Text literal
      i++ // skip <
      let content = ''
      while (i < text.length && text[i] !== '>') {
        if (text[i] === '\\' && i + 1 < text.length) {
          content += text[i + 1]
          i += 2
        } else {
          content += text[i]
          i++
        }
      }
      if (i < text.length) i++ // skip >
      terms.push({ form: 'text', text: content })
    } else if (text[i] === '#' && i + 1 < text.length && text[i + 1] === 'u') {
      // Character code #uXXXX
      const start = i
      i += 2 // skip #u
      while (i < text.length && /[0-9a-fA-F]/.test(text[i]!)) i++
      terms.push({ form: 'code', text: text.slice(start, i) })
    } else if (/[0-9]/.test(text[i]!) || (text[i] === '-' && i + 1 < text.length && /[0-9]/.test(text[i + 1]!))) {
      // Number
      const start = i
      if (text[i] === '-') i++
      while (i < text.length && /[0-9.]/.test(text[i]!)) i++
      terms.push({ form: 'mark', value: Number(text.slice(start, i)) })
    } else {
      // Word (identifier, keyword, etc.)
      const start = i
      while (i < text.length && text[i] !== ',' && text[i] !== ' ') i++
      const word = text.slice(start, i)
      if (word) {
        terms.push({ form: 'word', text: word })
      }
    }

    // Skip comma separator
    while (i < text.length && text[i] === ' ') i++
    if (i < text.length && text[i] === ',') {
      i++
      while (i < text.length && text[i] === ' ') i++
    }
  }

  return terms
}

function buildTree(lines: Array<ParsedLine>): Array<BootstrapNode> {
  const root: Array<BootstrapNode> = []
  const stack: Array<{ node: BootstrapNode, indent: number }> = []

  for (const line of lines) {
    const node: BootstrapNode = {
      name: line.name,
      terms: line.terms,
      children: [],
    }

    // Pop stack until we find the parent
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= line.indent) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1]!.node.children.push(node)
    }

    stack.push({ node, indent: line.indent })
  }

  return root
}
