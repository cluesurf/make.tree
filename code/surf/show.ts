/**
 * Surface AST pretty printer.
 *
 * Prints Surface AST nodes back to readable Term syntax.
 * Used for --show-surf debug flag and error messages.
 */

import type { Surf, SurfCard, SurfType } from '@/surf/form'

/** Print a Surf node to readable Term syntax. */
export function showSurf(node: Surf): string {
  return showNode(node, 0)
}

/** Print a SurfCard (file of nodes). */
export function showSurfCard(card: SurfCard): string {
  return card.list.map(n => showNode(n, 0)).join('\n\n')
}

function showNode(node: Surf, dep: number): string {
  const pad = '  '.repeat(dep)
  switch (node.form) {
    case 'task': {
      const parts = [`${pad}task ${node.name}`]
      for (const h of node.head) {
        parts.push(
          `${pad}  head ${h.name}${h.need ? `, need ${h.need}` : ''}`,
        )
      }
      for (const b of node.base) {
        parts.push(
          `${pad}  base ${b.name}${b.like ? `, like ${showType(b.like)}` : ''}`,
        )
      }
      for (const s of node.flow) {
        parts.push(showNode(s, dep + 1))
      }
      for (const t of node.task) {
        parts.push(showNode(t, dep + 1))
      }
      return parts.join('\n')
    }

    case 'form': {
      const parts = [`${pad}form ${node.name}`]
      for (const h of node.head) {
        parts.push(
          `${pad}  head ${h.name}${h.need ? `, need ${h.need}` : ''}`,
        )
      }
      for (const l of node.link) {
        parts.push(
          `${pad}  link ${l.name}${l.like ? `, like ${showType(l.like)}` : ''}`,
        )
      }
      for (const c of node.case) {
        const fields = c.link
          .map(l => `${l.name}${l.like ? `: ${showType(l.like)}` : ''}`)
          .join(', ')
        parts.push(
          `${pad}  case ${c.name}${fields ? `, ${fields}` : ''}`,
        )
      }
      for (const b of node.bond) {
        if (b.form === 'bond') {
          parts.push(`${pad}  bond ${b.name}`)
        }
      }
      for (const t of node.task) {
        parts.push(showNode(t, dep + 1))
      }
      return parts.join('\n')
    }

    case 'mask': {
      const parts = [`${pad}mask ${node.name}`]
      for (const t of node.task) {
        parts.push(showNode(t, dep + 1))
      }
      return parts.join('\n')
    }

    case 'suit': {
      const parts = [`${pad}suit ${node.name}`]
      for (const w of node.wear) {
        parts.push(`${pad}  wear ${w.name}`)
      }
      return parts.join('\n')
    }

    case 'test': {
      const parts = [`${pad}test <${node.name}>`]
      for (const s of node.flow) {
        parts.push(showNode(s, dep + 1))
      }
      return parts.join('\n')
    }

    case 'call': {
      const args = node.bind.map(b => showSift(b.sift)).join(', ')
      return `${pad}call ${node.name}${args ? `, ${args}` : ''}`
    }

    case 'make': {
      const parts = [`${pad}make ${node.name}`]
      for (const b of node.bind) {
        parts.push(
          `${pad}  bind ${b.name}${b.sift ? `, ${showSift(b.sift)}` : ''}`,
        )
      }
      return parts.join('\n')
    }

    case 'save': {
      const path = node.path.join('/')
      return `${pad}save ${path}${node.sift ? `, ${showSift(node.sift)}` : ''}`
    }

    case 'host': {
      return `${pad}host ${node.name}${node.sift ? `, ${showSift(node.sift)}` : ''}`
    }

    case 'back': {
      return `${pad}back${node.sift ? ` ${showSift(node.sift)}` : ''}`
    }

    case 'halt': {
      return `${pad}halt${node.term ? ` ${node.term}` : ''}`
    }

    case 'fork': {
      const parts = [
        `${pad}fork ${node.mode}${node.sift ? `, ${showSift(node.sift)}` : ''}`,
      ]
      for (const h of node.hook) {
        parts.push(`${pad}  hook ${h.name}`)
        for (const s of h.flow) {
          parts.push(showNode(s, dep + 2))
        }
      }
      return parts.join('\n')
    }

    case 'walk': {
      const parts = [
        `${pad}walk ${node.mode}${node.sift ? `, ${showSift(node.sift)}` : ''}`,
      ]
      for (const h of node.hook) {
        parts.push(`${pad}  hook ${h.name}`)
        for (const s of h.flow) {
          parts.push(showNode(s, dep + 2))
        }
      }
      return parts.join('\n')
    }

    case 'load': {
      const path = node.path.join('/')
      const parts = [`${pad}load ${path}`]
      for (const f of node.find) {
        const kindStr = f.kind ? `, like ${f.kind}` : ''
        parts.push(`${pad}  find ${f.name}${kindStr}`)
      }
      return parts.join('\n')
    }

    case 'bind': {
      return `${pad}bind ${node.name}${node.sift ? `, ${showSift(node.sift)}` : ''}`
    }

    case 'head': {
      return `${pad}head ${node.name}${node.need ? `, need ${node.need}` : ''}`
    }

    case 'base': {
      return `${pad}base ${node.name}${node.like ? `, like ${showType(node.like)}` : ''}`
    }

    case 'link': {
      return `${pad}link ${node.name}${node.like ? `, like ${showType(node.like)}` : ''}`
    }

    case 'hook': {
      const parts = [`${pad}hook ${node.name}`]
      for (const s of node.flow) {
        parts.push(showNode(s, dep + 1))
      }
      return parts.join('\n')
    }

    // Value expressions
    case 'sift-link':
      return `${pad}${node.path.join('/')}`
    case 'sift-read':
      return `${pad}read ${node.path.join('/')}`
    case 'sift-text':
      return `${pad}text <${node.val}>`
    case 'sift-mark':
      return `${pad}mark ${node.val}`
    case 'sift-comb':
      return `${pad}comb ${node.val}`
    case 'sift-wave':
      return `${pad}wave ${node.val}`

    // Logging
    case 'show':
      return `${pad}show${node.sift ? ` ${showSift(node.sift)}` : ''}`
    case 'dive':
      return `${pad}dive${node.sift ? ` ${showSift(node.sift)}` : ''}`
    case 'hint-log':
      return `${pad}hint${node.sift ? ` ${showSift(node.sift)}` : ''}`
    case 'tell':
      return `${pad}tell${node.sift ? ` ${showSift(node.sift)}` : ''}`
    case 'kink-log':
      return `${pad}kink${node.sift ? ` ${showSift(node.sift)}` : ''}`
    case 'bust':
      return `${pad}bust${node.sift ? ` ${showSift(node.sift)}` : ''}`

    default:
      return `${pad}<unknown: ${(node as any).form}>`
  }
}

/** Format a SurfType as readable text. */
function showType(typ: SurfType): string {
  if (typ.form === 'type-or') {
    return `or(${typ.list.map(showType).join(', ')})`
  }
  return typ.name
}

/** Format a sift expression inline. */
function showSift(node: Surf | undefined): string {
  if (!node) return ''
  switch (node.form) {
    case 'sift-link':
      return node.path.join('/')
    case 'sift-read':
      return `read ${node.path.join('/')}`
    case 'sift-text':
      return `text <${node.val}>`
    case 'sift-mark':
      return `mark ${node.val}`
    case 'sift-comb':
      return `comb ${node.val}`
    case 'sift-wave':
      return `wave ${node.val}`
    case 'call': {
      const args = node.bind.map(b => showSift(b.sift)).join(', ')
      return `call ${node.name}${args ? `, ${args}` : ''}`
    }
    default:
      return `<${node.form}>`
  }
}
