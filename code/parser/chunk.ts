/**
 * Chunked parser.
 *
 * Wraps StringParser to handle all non-trivial parsing modes:
 * - Large string input (split at block boundaries, parse chunks)
 * - Streaming input via feed/finish (parse eagerly as data arrives)
 * - Async iterable input (file streams, network)
 * - Incremental edits (reparse only affected region)
 * - File input (Node.js)
 *
 * For .tree files, top-level blocks are independent parse units.
 * A block boundary is a newline followed by a non-indented character.
 *
 * Usage (string):
 *   const p = new ChunkedParser({ mine, mint, entry: 'tree' })
 *   const result = p.parse({ text: hugeString, file: 'big.tree' })
 *
 * Usage (streaming):
 *   const p = new ChunkedParser({ mine, mint, entry: 'tree' })
 *   p.feed({ chunk: 'foo\n  bar\n' })
 *   p.feed({ chunk: 'baz\n' })
 *   const result = p.finish({ file: 'test.tree' })
 *
 * Usage (incremental):
 *   const p = new ChunkedParser({ mine, mint, entry: 'tree' })
 *   p.parse({ text: 'foo\nbar\n', file: 'test.tree' })
 *   const r2 = p.applyEdit({ edit: { start: 4, end: 7, newText: 'baz' } })
 */

import { StringParser } from './index'
import type {
  MineDef,
  MintDef,
  AstNode,
  ParseResult,
  ParseError,
  TextEdit,
  SourceRange,
} from './form'

export type ChunkedFeedResult = {
  nodesAdded: number
  totalNodes: number
}

export class ChunkedParser {
  private parser: StringParser
  private chunkSize: number
  private maxMemory: number

  // Stream state
  private buffer: string
  private streamNodes: AstNode[]
  private streamErrors: ParseError[]
  private streamOffset: number

  // Incremental state
  private lastText: string | undefined
  private lastResult: ParseResult | undefined

  constructor(input: {
    mine: Map<string, MineDef>
    mint: Map<string, MintDef>
    entry?: string
    recovery?: boolean
    chunkSize?: number
    maxMemory?: number
  }) {
    this.parser = new StringParser({
      mine: input.mine,
      mint: input.mint,
      entry: input.entry,
      recovery: input.recovery ?? true,
    })
    this.chunkSize = input.chunkSize ?? 256 * 1024
    this.maxMemory = input.maxMemory ?? 64 * 1024 * 1024
    this.buffer = ''
    this.streamNodes = []
    this.streamErrors = []
    this.streamOffset = 0
  }

  // ---- String parsing ----

  /** Parse a string. Automatically chunks if larger than chunkSize. */
  parse(input: { text: string, file: string }): ParseResult {
    const { text, file } = input

    // Store for incremental edits
    this.lastText = text

    if (text.length <= this.chunkSize) {
      this.lastResult = this.parser.parse({ text, file })
      return this.lastResult
    }

    this.lastResult = this.parseChunked({ text, file })
    return this.lastResult
  }

  // ---- Streaming ----

  /** Feed a chunk of input text. May trigger partial parsing. */
  feed(input: { chunk: string }): ChunkedFeedResult {
    this.buffer += input.chunk

    const completeBoundary = findLastBlockBoundary({ text: this.buffer })
    if (completeBoundary <= 0) {
      return { nodesAdded: 0, totalNodes: this.streamNodes.length }
    }

    const unparsed = this.buffer.slice(0, completeBoundary)
    if (unparsed.length === 0) {
      return { nodesAdded: 0, totalNodes: this.streamNodes.length }
    }

    const result = this.parser.parse({ text: unparsed, file: 'stream' })
    const newNodes = extractListChildren({ node: result.output })
    const added = newNodes.length

    for (const node of newNodes) {
      shiftNodeRanges({ node, delta: this.streamOffset })
      this.streamNodes.push(node)
    }

    for (const err of result.errors) {
      this.streamErrors.push({ ...err, pos: err.pos + this.streamOffset })
    }

    this.streamOffset += completeBoundary
    this.buffer = this.buffer.slice(completeBoundary)

    return { nodesAdded: added, totalNodes: this.streamNodes.length }
  }

  /** Signal end of input. Parse remaining buffer and return final result. */
  finish(input: { file: string }): ParseResult {
    if (this.buffer.length > 0) {
      const result = this.parser.parse({ text: this.buffer, file: input.file })
      const newNodes = extractListChildren({ node: result.output })

      for (const node of newNodes) {
        shiftNodeRanges({ node, delta: this.streamOffset })
        this.streamNodes.push(node)
      }

      for (const err of result.errors) {
        this.streamErrors.push({ ...err, pos: err.pos + this.streamOffset })
      }

      this.streamOffset += this.buffer.length
      this.buffer = ''
    }

    const result = buildMergedResult({
      nodes: this.streamNodes,
      errors: this.streamErrors,
      totalLength: this.streamOffset,
    })

    // Store for incremental edits
    this.lastResult = result

    return result
  }

  /** Reset stream state for reuse. */
  reset(): void {
    this.buffer = ''
    this.streamNodes = []
    this.streamErrors = []
    this.streamOffset = 0
  }

  /** Get nodes parsed so far (partial results during streaming). */
  getPartialNodes(): AstNode[] {
    return this.streamNodes
  }

  /** Get current buffer size. */
  getBufferSize(): number {
    return this.buffer.length
  }

  // ---- Async iterable ----

  /** Parse from an async iterable (file streams, network). */
  async parseStream(input: {
    stream: AsyncIterable<string | Buffer>
    file: string
  }): Promise<ParseResult> {
    const { stream, file } = input
    const allNodes: AstNode[] = []
    const allErrors: ParseError[] = []
    let buf = ''
    let offset = 0

    for await (const rawChunk of stream) {
      const chunk = typeof rawChunk === 'string' ? rawChunk : rawChunk.toString('utf-8')
      buf += chunk

      while (buf.length >= this.chunkSize) {
        const boundary = findBlockBoundaryNear({ text: buf, target: this.chunkSize })
        if (boundary <= 0) break

        const section = buf.slice(0, boundary)
        buf = buf.slice(boundary)

        this.collectChunkResult({
          text: section, file, offset, nodes: allNodes, errors: allErrors,
        })
        offset += section.length
      }

      if (buf.length > this.maxMemory) {
        allErrors.push({
          message: `Buffer exceeded max memory limit (${this.maxMemory} bytes)`,
          line: 0, col: 0, pos: offset,
        })
        break
      }
    }

    if (buf.length > 0) {
      this.collectChunkResult({
        text: buf, file, offset, nodes: allNodes, errors: allErrors,
      })
      offset += buf.length
    }

    return buildMergedResult({ nodes: allNodes, errors: allErrors, totalLength: offset })
  }

  /** Parse a file by reading it (Node.js only). */
  async parseFile(input: { path: string }): Promise<ParseResult> {
    const { readFile } = await import('fs/promises')
    const text = await readFile(input.path, 'utf-8')
    return this.parse({ text, file: input.path })
  }

  // ---- Incremental ----

  /** Apply a text edit and incrementally reparse the affected region. */
  applyEdit(input: { edit: TextEdit, file?: string }): ParseResult {
    const { edit } = input
    const file = input.file ?? 'incremental'

    if (!this.lastText || !this.lastResult || !this.lastResult.output) {
      const newText = applyEditToText({ text: this.lastText ?? '', edit })
      return this.parse({ text: newText, file })
    }

    const oldText = this.lastText
    const newText = applyEditToText({ text: oldText, edit })
    const delta = edit.newText.length - (edit.end - edit.start)
    const oldTree = this.lastResult.output

    const children = extractListChildren({ node: oldTree })
    if (children.length === 0) {
      return this.parse({ text: newText, file })
    }

    const affected = findAffectedRange({ children, edit })

    if (affected.first === -1) {
      return this.parse({ text: newText, file })
    }

    const reparseStart = getRangeStart(children[affected.first]!)
    const reparseOldEnd = affected.last < children.length - 1
      ? getRangeStart(children[affected.last + 1]!)
      : oldText.length
    const reparseNewEnd = reparseOldEnd + delta

    const regionText = newText.slice(reparseStart, reparseNewEnd)
    const regionResult = this.parser.parse({ text: regionText, file })

    if (!regionResult.output) {
      return this.parse({ text: newText, file })
    }

    const newChildren: AstNode[] = []

    for (let i = 0; i < affected.first; i++) {
      newChildren.push(children[i]!)
    }

    const reparsedChildren = extractListChildren({ node: regionResult.output })
    for (const child of reparsedChildren) {
      shiftNodeRanges({ node: child, delta: reparseStart })
      newChildren.push(child)
    }

    for (let i = affected.last + 1; i < children.length; i++) {
      const shifted = deepCloneNode({ node: children[i]! })
      shiftNodeRanges({ node: shifted, delta })
      newChildren.push(shifted)
    }

    const newRoot: AstNode = {
      form: oldTree.form,
      range: { start: 0, end: newText.length },
      list: newChildren.length === 1 ? newChildren[0] : newChildren,
    }

    const newErrors: ParseError[] = []

    if (this.lastResult.errors) {
      for (const err of this.lastResult.errors) {
        if (err.pos < reparseStart) {
          newErrors.push(err)
        } else if (err.pos >= reparseOldEnd) {
          newErrors.push({ ...err, pos: err.pos + delta })
        }
      }
    }

    for (const err of regionResult.errors) {
      newErrors.push({ ...err, pos: err.pos + reparseStart })
    }

    this.lastText = newText
    this.lastResult = { output: newRoot, errors: newErrors }
    return this.lastResult
  }

  // ---- Hot reload ----

  /** Hot-reload grammar definitions. Invalidates incremental cache. */
  reloadGrammar(input: {
    mine: Map<string, MineDef>
    mint: Map<string, MintDef>
  }): void {
    this.parser.reloadGrammar(input)
    this.lastResult = undefined
  }

  // ---- Private ----

  private parseChunked(input: { text: string, file: string }): ParseResult {
    const { text, file } = input
    const allNodes: AstNode[] = []
    const allErrors: ParseError[] = []
    let pos = 0

    while (pos < text.length) {
      const chunkEnd = findBlockBoundaryNear({
        text: text.slice(pos),
        target: this.chunkSize,
      })

      const actualEnd = chunkEnd > 0 ? pos + chunkEnd : text.length
      const chunk = text.slice(pos, actualEnd)

      if (chunk.length === 0) break

      this.collectChunkResult({
        text: chunk, file, offset: pos, nodes: allNodes, errors: allErrors,
      })

      pos = actualEnd
    }

    return buildMergedResult({ nodes: allNodes, errors: allErrors, totalLength: text.length })
  }

  private collectChunkResult(input: {
    text: string
    file: string
    offset: number
    nodes: AstNode[]
    errors: ParseError[]
  }): void {
    const result = this.parser.parse({ text: input.text, file: input.file })
    const nodes = extractListChildren({ node: result.output })
    for (const node of nodes) {
      shiftNodeRanges({ node, delta: input.offset })
      input.nodes.push(node)
    }
    for (const err of result.errors) {
      input.errors.push({ ...err, pos: err.pos + input.offset })
    }
  }
}

// ---- Helpers ----

/**
 * Find the last position where a top-level block boundary occurs.
 * A boundary is after a newline where the next character is not a space.
 *
 * Does NOT treat newline at end of buffer as a boundary, because
 * more indented lines might follow in the next chunk.
 */
function findLastBlockBoundary(input: { text: string }): number {
  const { text } = input
  let lastBoundary = 0

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      const next = i + 1
      if (next < text.length && text[next] !== ' ' && text[next] !== '\t') {
        lastBoundary = next
      }
    }
  }

  return lastBoundary
}

/**
 * Find a block boundary near the target position.
 * Searches backward from target, then forward.
 */
function findBlockBoundaryNear(input: {
  text: string
  target: number
}): number {
  const { text, target } = input
  const searchLimit = Math.min(target, text.length)

  for (let i = searchLimit; i > 0; i--) {
    if (text[i - 1] === '\n' && i < text.length) {
      const next = text[i]
      if (next !== ' ' && next !== '\t' && next !== undefined) {
        return i
      }
    }
  }

  for (let i = searchLimit; i < text.length; i++) {
    if (text[i] === '\n' && i + 1 < text.length) {
      const next = text[i + 1]
      if (next !== ' ' && next !== '\t' && next !== undefined) {
        return i + 1
      }
    }
  }

  if (text.endsWith('\n')) return text.length

  return 0
}

function extractListChildren(input: { node: AstNode | undefined }): AstNode[] {
  const { node } = input
  if (!node) return []
  const list = node.list
  if (!list) return []
  if (Array.isArray(list)) return list as AstNode[]
  if (typeof list === 'object' && list !== null && 'form' in list) {
    return [list as AstNode]
  }
  return []
}

function shiftNodeRanges(input: { node: AstNode, delta: number }): void {
  const { node, delta } = input
  if (delta === 0) return

  const range = node.range as { start: number, end: number } | undefined
  if (range) {
    node.range = { start: range.start + delta, end: range.end + delta }
  }

  const list = node.list
  if (Array.isArray(list)) {
    for (const child of list) {
      if (typeof child === 'object' && child !== null && 'form' in child) {
        shiftNodeRanges({ node: child as AstNode, delta })
      }
    }
  } else if (typeof list === 'object' && list !== null && 'form' in list) {
    shiftNodeRanges({ node: list as AstNode, delta })
  }
}

function buildMergedResult(input: {
  nodes: AstNode[]
  errors: ParseError[]
  totalLength: number
}): ParseResult {
  const { nodes, errors, totalLength } = input

  if (nodes.length === 0) {
    return { output: undefined, errors }
  }

  const output: AstNode = {
    form: 'tree-document',
    range: { start: 0, end: totalLength },
    list: nodes.length === 1 ? nodes[0] : nodes,
  }

  return { output, errors }
}

function applyEditToText(input: { text: string, edit: TextEdit }): string {
  const { text, edit } = input
  return text.slice(0, edit.start) + edit.newText + text.slice(edit.end)
}

function getRangeStart(node: AstNode): number {
  const range = node.range as SourceRange | undefined
  return range ? range.start : 0
}

function getRangeEnd(node: AstNode): number {
  const range = node.range as SourceRange | undefined
  return range ? range.end : 0
}

function findAffectedRange(input: {
  children: AstNode[]
  edit: TextEdit
}): { first: number, last: number } {
  const { children, edit } = input
  let first = -1
  let last = -1

  for (let i = 0; i < children.length; i++) {
    const childEnd = getRangeEnd(children[i]!)
    const childStart = getRangeStart(children[i]!)

    if (childEnd > edit.start && childStart < edit.end) {
      if (first === -1) first = i
      last = i
    } else if (childStart >= edit.end && first !== -1) {
      break
    }
  }

  if (first === -1) {
    for (let i = 0; i < children.length; i++) {
      const childStart = getRangeStart(children[i]!)
      const childEnd = getRangeEnd(children[i]!)
      if (edit.start >= childStart && edit.start <= childEnd) {
        first = i
        last = i
        break
      }
    }
  }

  if (first === -1) {
    for (let i = 0; i < children.length; i++) {
      if (getRangeStart(children[i]!) > edit.start) {
        first = Math.max(0, i - 1)
        last = i
        break
      }
    }
  }

  if (last === -1 && first !== -1) last = first

  return { first, last }
}

function deepCloneNode(input: { node: AstNode }): AstNode {
  const { node } = input
  const clone: AstNode = { form: node.form }

  for (const key of Object.keys(node)) {
    if (key === 'form') continue
    const val = node[key]
    if (key === 'range' && typeof val === 'object' && val !== null) {
      const r = val as SourceRange
      clone.range = { start: r.start, end: r.end }
    } else if (key === 'list') {
      if (Array.isArray(val)) {
        clone.list = val.map(item =>
          typeof item === 'object' && item !== null && 'form' in item
            ? deepCloneNode({ node: item as AstNode })
            : item
        )
      } else if (typeof val === 'object' && val !== null && 'form' in val) {
        clone.list = deepCloneNode({ node: val as AstNode })
      } else {
        clone.list = val
      }
    } else {
      clone[key] = val
    }
  }

  return clone
}
