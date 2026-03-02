/**
 * Parse Tree AST from mine.note files into MineRule trees.
 *
 * A mine.note file is parsed by the Tree parser into a Tree AST.
 * This module walks that Tree AST and produces MineForm and MineLoad
 * structures that the mine walker can execute.
 */

import type { Tree, TreeLink, TreeTerm, TreeCord } from '@/mill/tree'
import type { Site } from '@/kink/site'
import { VOID_SITE } from '@/kink/site'
import type {
  MineForm,
  MineFile,
  MineLoad,
  MineLoadHook,
  MineLoadFind,
  MineLoadTake,
  MineRule,
} from './form'

/** Parse a mine.note Tree AST into a MineFile. */
export function readMineFile(input: { tree: Tree, file: string }): MineFile {
  const { tree, file } = input
  const load: MineLoad[] = []
  const formList: MineForm[] = []

  for (const link of tree.list) {
    const site =linkSite(link, file)
    if (link.text === 'load') {
      load.push(readMineLoad(link, file))
    } else if (link.text === 'mine') {
      formList.push(readMineForm(link, file))
    } else if (link.text === 'tree') {
      // tree rest -- inline named rule (treated as a def)
      formList.push(readMineTreeDef(link, file))
    }
  }

  return { load, formList }
}

/** Parse a `load` directive. */
function readMineLoad(link: TreeLink, file: string): MineLoad {
  const site =linkSite(link, file)
  const road = readFirstTermText(link) ?? readFirstText(link) ?? ''

  const hook: MineLoadHook[] = []
  const find: MineLoadFind[] = []
  const take: MineLoadTake[] = []

  for (const child of link.list) {
    if (!isLink(child)) continue
    const childSite =linkSite(child, file)

    if (child.text === 'hook') {
      const kind = readFirstTermText(child)
      const name = readSecondTermText(child) ?? readFirstTermText(child) ?? ''
      if (kind === 'mine') {
        hook.push({ form: 'mine-load-hook', kind: 'mine', name, site: childSite })
      }
    } else if (child.text === 'find') {
      const name = readFirstTermText(child) ?? ''
      find.push({ form: 'mine-load-find', name, site: childSite })
    } else if (child.text === 'take') {
      const kind = readFirstTermText(child) ?? 'mine'
      const name = readSecondTermText(child) ?? readFirstTermText(child) ?? ''
      take.push({ form: 'mine-load-take', kind: 'mine', name, site: childSite })
    }
  }

  return { form: 'mine-load', road, hook, find, take, site }
}

/** Parse a named `mine <name>` definition. */
function readMineForm(link: TreeLink, file: string): MineForm {
  const site =linkSite(link, file)
  const name = readLinkName(link)
  const rule = readMineBody(link, file)

  return { form: 'mine-def', name, rule, site }
}

/** Parse a `tree <name>` inline definition (e.g., `tree rest`). */
function readMineTreeDef(link: TreeLink, file: string): MineForm {
  const site =linkSite(link, file)
  const name = `tree-${readLinkName(link)}`
  const rule = readMineBody(link, file)

  return { form: 'mine-def', name, rule, site }
}

/**
 * Parse the body of a mine definition into a single MineRule.
 * A body is a sequence of child rules. If there's exactly one,
 * return it directly. If multiple, wrap in an implicit sequence
 * (represented as mine-term with no term filter).
 */
function readMineBody(link: TreeLink, file: string): MineRule {
  const rules: MineRule[] = []

  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMineRule(child, file)
    if (rule) rules.push(rule)
  }

  if (rules.length === 1) return rules[0]!

  return {
    form: 'mine-term',
    list: rules,
    site: linkSite(link, file),
  }
}

/** Parse a single mine rule from a TreeLink child. */
function readMineRule(link: TreeLink, file: string): MineRule | undefined {
  const site =linkSite(link, file)

  switch (link.text) {
    case 'mine': {
      return readMineKeyword(link, file)
    }
    case 'take': {
      const name = readLinkName(link)
      return { form: 'mine-take', name, site }
    }
    case 'make': {
      return readMineMake(link, file)
    }
    case 'tree': {
      const name = `tree-${readLinkName(link)}`
      return { form: 'mine-tree-rest', name, site }
    }
    case 'note': {
      const text = readFirstText(link) ?? ''
      return { form: 'mine-note', text, site }
    }
    default:
      return undefined
  }
}

/** Parse a `mine <kind>` keyword rule. */
function readMineKeyword(link: TreeLink, file: string): MineRule {
  const site = linkSite(link, file)
  const kind = readLinkName(link)

  // Check for inline parameters: mine term, term <name>
  const termParam = readLinkParam(link, 'term')
  const formParam = readLinkParam(link, 'form')
  const nameParam = readLinkParam(link, 'name')

  // Parse children
  const children: MineRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMineRule(child, file)
    if (rule) children.push(rule)
  }

  switch (kind) {
    case 'term':
      return {
        form: 'mine-term',
        term: termParam,
        list: children,
        site,
      }

    case 'list':
      return {
        form: 'mine-list',
        rule: children.length === 1
          ? children[0]!
          : { form: 'mine-term', list: children, site },
        site,
      }

    case 'case':
      return {
        form: 'mine-case',
        list: children,
        site,
      }

    case 'form':
      return {
        form: 'mine-form',
        name: formParam ?? '',
        list: children,
        site,
      }

    case 'head':
      return {
        form: 'mine-head',
        list: children,
        site,
      }

    case 'room':
      return {
        form: 'mine-room',
        rule: children.length === 1
          ? children[0]
          : { form: 'mine-term', list: children, site },
        site,
      }

    case 'road':
      return {
        form: 'mine-road',
        list: children,
        site,
      }

    case 'text':
      return {
        form: 'mine-text',
        list: children,
        site,
      }

    default:
      // Unknown mine kind. Treat as a named term match.
      return {
        form: 'mine-term',
        term: kind,
        list: children,
        site,
      }
  }
}

/** Parse a `make head` or `make case` rule. */
function readMineMake(link: TreeLink, file: string): MineRule {
  const site =linkSite(link, file)
  const kind = readLinkName(link)

  const children: MineRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMineRule(child, file)
    if (rule) children.push(rule)
  }

  if (kind === 'head') {
    return { form: 'mine-make-head', list: children, site }
  }
  if (kind === 'case') {
    return { form: 'mine-make-case', list: children, site }
  }

  // Default to make-head
  return { form: 'mine-make-head', list: children, site }
}

// ---- Helpers ----

/** Check if a tree child is a TreeLink. */
function isLink(child: unknown): child is TreeLink {
  return (child as TreeLink)?.form === 'link'
}

/** Extract the name from a link's first term child. */
function readLinkName(link: TreeLink): string {
  for (const child of link.list) {
    if ((child as TreeTerm).form === 'term') {
      const term = child as TreeTerm
      for (const part of term.list) {
        if ((part as TreeCord).form === 'cord') {
          return (part as TreeCord).text
        }
      }
    }
  }
  return ''
}

/** Read a named parameter from comma-separated terms in a link. */
function readLinkParam(link: TreeLink, name: string): string | undefined {
  for (const child of link.list) {
    if ((child as TreeTerm).form === 'term') {
      const term = child as TreeTerm
      const cords: string[] = []
      for (const part of term.list) {
        if ((part as TreeCord).form === 'cord') {
          cords.push((part as TreeCord).text)
        }
      }
      if (cords.length >= 2 && cords[0] === name) {
        return cords[1]
      }
    }
  }
  return undefined
}

/** Read the text from the first TreeTerm's first TreeCord. */
function readFirstTermText(link: TreeLink): string | undefined {
  for (const child of link.list) {
    if ((child as TreeTerm).form === 'term') {
      const term = child as TreeTerm
      for (const part of term.list) {
        if ((part as TreeCord).form === 'cord') {
          return (part as TreeCord).text
        }
      }
    }
  }
  return undefined
}

/** Read the text from the second TreeTerm's first TreeCord. */
function readSecondTermText(link: TreeLink): string | undefined {
  let count = 0
  for (const child of link.list) {
    if ((child as TreeTerm).form === 'term') {
      count++
      if (count === 2) {
        const term = child as TreeTerm
        for (const part of term.list) {
          if ((part as TreeCord).form === 'cord') {
            return (part as TreeCord).text
          }
        }
      }
    }
  }
  return undefined
}

/** Read text from a TreeText child (e.g., `<hello>`). */
function readFirstText(link: TreeLink): string | undefined {
  for (const child of link.list) {
    if ((child as TreeCord).form === 'cord') {
      return (child as TreeCord).text
    }
  }
  return undefined
}

/** Extract a Site from a TreeLink's code field. */
function linkSite(link: TreeLink, file: string): Site {
  if (link.code?.base && link.code?.head) {
    return {
      form: 'card-site',
      link: file,
      base: {
        line: link.code.base.band.base.line,
        mark: link.code.base.band.base.mark,
      },
      head: {
        line: link.code.head.band.head.line,
        mark: link.code.head.band.head.mark,
      },
    }
  }
  return { form: 'brew-site' }
}
