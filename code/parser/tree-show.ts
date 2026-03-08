/**
 * Serialize a tree AST back to indented text.
 *
 * Produces output compatible with the existing test fixtures
 * in deck/tree/test/file/*.tree.
 */

import type { AstNode } from './form'

/**
 * Serialize a tree-document AST node to indented text.
 * Matches the output format of the old showTreeLine() function.
 */
export function showTree(node: AstNode | undefined): string {
  if (!node) return ''

  const lines: string[] = ['']
  const items = showNode(node, false, 0)
  for (const line of items) {
    lines.push(line)
  }
  lines.push('')
  return lines.join('\n')
}

function showNode(
  node: AstNode,
  flat: boolean,
  depth: number,
): string[] {
  const lines: string[] = []

  switch (node.form) {
    case 'tree-document': {
      const list = normalizeList(node.list)
      for (const child of list) {
        lines.push(...showNode(child, false, depth))
      }
      break
    }

    case 'tree-block': {
      const text = node.text as string | undefined
      const list = node.list as unknown | undefined

      if (flat) {
        // Inline mode: show head, children in parens
        const head = text ?? ''
        const children = normalizeList(list)
        if (children.length > 0) {
          const childLines: string[] = []
          for (const child of children) {
            childLines.push(...showNode(child, true, depth + 1))
          }
          const childText = childLines.join(', ').trim()
          if (childText) {
            lines.push(`${head}(${childText})`)
          } else {
            lines.push(head)
          }
        } else {
          lines.push(head)
        }
      } else {
        // Block mode: head on first line, children indented
        const head = text ?? ''
        if (head) {
          lines.push(head)
        }
        const children = normalizeList(list)
        for (const child of children) {
          const childLines = showNode(child, false, depth + 1)
          for (const line of childLines) {
            if (line) {
              lines.push(`  ${line}`)
            }
          }
        }
      }
      break
    }

    case 'tree-inline': {
      const list = normalizeList(node.list)
      if (flat) {
        const parts: string[] = []
        for (const child of list) {
          parts.push(...showNode(child, true, depth + 1))
        }
        lines.push(parts.join(', '))
      } else {
        for (const child of list) {
          lines.push(...showNode(child, false, depth))
        }
      }
      break
    }

    case 'tree-text': {
      const list = normalizeList(node.list)
      const parts: string[] = []
      for (const child of list) {
        parts.push(...showNode(child, true, depth + 1))
      }
      lines.push(`<${parts.join('')}>`)
      break
    }

    case 'tree-string': {
      const text = node.text as string | undefined
      lines.push(text ?? '')
      break
    }

    case 'tree-number': {
      const text = node.text as string | undefined
      lines.push(text ?? '0')
      break
    }

    case 'tree-interpolation': {
      const link = node.link as AstNode | undefined
      if (link) {
        const inner = showNode(link, true, depth + 1)
        lines.push(`{${inner.join('')}}`)
      }
      break
    }

    default: {
      // Unknown node: try to show as text
      if (typeof node.text === 'string') {
        lines.push(node.text)
      }
      break
    }
  }

  return lines
}

/** Normalize a list field that may be a single item, array, or raw string. */
function normalizeList(list: unknown): AstNode[] {
  if (!list) return []
  if (Array.isArray(list)) {
    return list.map(item =>
      typeof item === 'string' ? { form: 'raw-text', text: item } as AstNode : item as AstNode
    )
  }
  if (typeof list === 'string') {
    return [{ form: 'raw-text', text: list } as AstNode]
  }
  if (typeof list === 'object' && list !== null && 'form' in list) {
    return [list as AstNode]
  }
  return []
}
