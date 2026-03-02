/**
 * Parse Tree AST from mint.note files into MintRule trees.
 *
 * A mint.note file is parsed by the Tree parser into a Tree AST.
 * This module walks that Tree AST and produces MintForm and MintLoad
 * structures that the mint walker can execute.
 */

import type { Tree, TreeLink, TreeTerm, TreeCord } from '@/mill/tree'
import type { Site } from '@/kink/site'
import { VOID_SITE } from '@/kink/site'
import type {
  MintForm,
  MintFile,
  MintLoad,
  MintLoadHook,
  MintLoadFind,
  MintLoadTake,
  MintRule,
} from './form'

/** Parse a mint.note Tree AST into a MintFile. */
export function readMintFile(input: { tree: Tree, file: string }): MintFile {
  const { tree, file } = input
  const load: MintLoad[] = []
  const formList: MintForm[] = []

  for (const link of tree.list) {
    const site =linkSite(link, file)
    if (link.text === 'load') {
      load.push(readMintLoad(link, file))
    } else if (link.text === 'mint') {
      formList.push(readMintForm(link, file))
    }
  }

  return { load, formList }
}

/** Parse a `load` directive. */
function readMintLoad(link: TreeLink, file: string): MintLoad {
  const site =linkSite(link, file)
  const path = readFirstTermText(link) ?? readFirstText(link) ?? ''

  const hook: MintLoadHook[] = []
  const find: MintLoadFind[] = []
  const take: MintLoadTake[] = []

  for (const child of link.list) {
    if (!isLink(child)) continue
    const childSite =linkSite(child, file)

    if (child.text === 'hook') {
      const kind = readFirstTermText(child)
      const name = readSecondTermText(child) ?? readFirstTermText(child) ?? ''
      if (kind === 'mint') {
        hook.push({ form: 'mint-load-hook', kind: 'mint', name, site: childSite })
      }
    } else if (child.text === 'find') {
      const kind = readFirstTermText(child) ?? ''
      const name = readSecondTermText(child) ?? kind
      find.push({ form: 'mint-load-find', name, site: childSite })
    } else if (child.text === 'take') {
      const kind = readFirstTermText(child) ?? 'form'
      const name = readSecondTermText(child) ?? readFirstTermText(child) ?? ''
      take.push({ form: 'mint-load-take', kind, name, site: childSite })
    }
  }

  return { form: 'mint-load', path, hook, find, take, site }
}

/** Parse a named `mint <name>` definition. */
function readMintForm(link: TreeLink, file: string): MintForm {
  const site =linkSite(link, file)
  const name = readLinkName(link)
  const rule = readMintBody(link, file)

  return { form: 'mint-def', name, rule, site }
}

/**
 * Parse the body of a mint definition into a single MintRule.
 * A body is a sequence of child rules.
 */
function readMintBody(link: TreeLink, file: string): MintRule {
  const rules: MintRule[] = []

  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) rules.push(rule)
  }

  if (rules.length === 1) return rules[0]

  // Wrap in a named rule with the parent's name
  return {
    form: 'mint-named',
    name: readLinkName(link),
    list: rules,
    loc: linkSite(link, file),
  }
}

/** Parse a single mint rule from a TreeLink child. */
function readMintRule(link: TreeLink, file: string): MintRule | undefined {
  const site =linkSite(link, file)

  switch (link.text) {
    case 'mint': {
      return readMintKeyword(link, file)
    }
    case 'save': {
      const name = readLinkName(link)
      return { form: 'mint-save', name, site }
    }
    case 'line': {
      const name = readLinkName(link)
      return { form: 'mint-line', name, site }
    }
    case 'knit': {
      const name = readLinkName(link)
      const hook = readLinkParam(link, 'site') ?? ''
      return { form: 'mint-knit', name, hook, site }
    }
    case 'make': {
      return readMintMake(link, file)
    }
    case 'bind': {
      const name = readLinkName(link)
      const linkVar = readLinkParam(link, 'link') ?? ''
      return { form: 'mint-bind', name, link: linkVar, site }
    }
    case 'turn': {
      return readMintTurn(link, file)
    }
    case 'form': {
      return readMintFormRule(link, file)
    }
    case 'base': {
      return readMintBase(link, file)
    }
    case 'link': {
      const name = readLinkName(link)
      return { form: 'mint-link', name, site }
    }
    default:
      return undefined
  }
}

/** Parse a `mint <name> [, save <var>] [, form <form>]` rule. */
function readMintKeyword(link: TreeLink, file: string): MintRule {
  const site =linkSite(link, file)
  const name = readLinkName(link)
  const saveParam = readLinkParam(link, 'save')
  const formParam = readLinkParam(link, 'form')

  const children: MintRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) children.push(rule)
  }

  return {
    form: 'mint-named',
    name,
    save: saveParam,
    delegateForm: formParam,
    list: children,
    loc,
  }
}

/** Parse a `make <name>` rule with bind children. */
function readMintMake(link: TreeLink, file: string): MintRule {
  const site =linkSite(link, file)
  const name = readLinkName(link)

  const children: MintRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) children.push(rule)
  }

  return { form: 'mint-make', name, list: children, site }
}

/** Parse a `turn seed` or `turn seed` with children. */
function readMintTurn(link: TreeLink, file: string): MintRule {
  const site =linkSite(link, file)

  const children: MintRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) children.push(rule)
  }

  return { form: 'mint-turn-seed', list: children, site }
}

/** Parse a `form <name>` rule. */
function readMintFormRule(link: TreeLink, file: string): MintRule {
  const site =linkSite(link, file)
  const name = readLinkName(link)

  const children: MintRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) children.push(rule)
  }

  return { form: 'mint-form', name, list: children, site }
}

/** Parse a `base <name> [, term <val>]` rule. */
function readMintBase(link: TreeLink, file: string): MintRule {
  const site =linkSite(link, file)
  const name = readLinkName(link)
  const termParam = readLinkParam(link, 'term')

  const children: MintRule[] = []
  for (const child of link.list) {
    if (!isLink(child)) continue
    const rule = readMintRule(child, file)
    if (rule) children.push(rule)
  }

  return { form: 'mint-base', name, term: termParam, list: children, site }
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

/** Read text from a TreeCord child. */
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
