/**
 * Grammar loader.
 *
 * Reads mine.tree and mint.tree grammar files using the bootstrap
 * parser and converts them into MineDef/MintDef structures that
 * the generic StringParser can execute.
 */

import { readFileSync } from 'fs'
import { parseBootstrapTree } from './bootstrap'
import type { BootstrapNode, BootstrapTerm } from './bootstrap'
import type { MineDef, MintDef, MineRule, RuleVal, RuleBind, MintCase, MintMake } from './form'

/** Load a grammar from mine.tree and mint.tree files. */
export function loadGrammar(input: {
  minePath: string
  mintPath: string
}): { mine: Map<string, MineDef>, mint: Map<string, MintDef> } {
  const mineText = readFileSync(input.minePath, 'utf-8')
  const mintText = readFileSync(input.mintPath, 'utf-8')
  return loadGrammarFromText({ mineText, mintText })
}

/** Load a grammar from mine/mint text content. */
export function loadGrammarFromText(input: {
  mineText: string
  mintText: string
}): { mine: Map<string, MineDef>, mint: Map<string, MintDef> } {
  const mineNodes = parseBootstrapTree({ text: input.mineText })
  const mintNodes = parseBootstrapTree({ text: input.mintText })

  const mine = new Map<string, MineDef>()
  const mint = new Map<string, MintDef>()

  for (const node of mineNodes) {
    if (node.name === 'mine') {
      const def = readMineDef(node)
      if (def) mine.set(def.name, def)
    }
  }

  for (const node of mintNodes) {
    if (node.name === 'mint') {
      const def = readMintDef(node)
      if (def) mint.set(def.name, def)
    }
  }

  return { mine, mint }
}

// ---- Mine Definition Reader ----

function readMineDef(node: BootstrapNode): MineDef | undefined {
  const name = termWord(node.terms[0])
  if (!name) return undefined

  const params: Array<{ name: string }> = []
  const ruleChildren: Array<BootstrapNode> = []

  for (const child of node.children) {
    if (child.name === 'take') {
      // Parameter declaration: take <name>, like <type>
      const paramName = termWord(child.terms[0])
      if (paramName) params.push({ name: paramName })
    } else {
      ruleChildren.push(child)
    }
  }

  const rule = readMineRule(ruleChildren)
  if (!rule) return undefined

  return { name, params, rule }
}

function readMineRule(children: Array<BootstrapNode>): MineRule | undefined {
  if (children.length === 0) return undefined
  if (children.length === 1) return readMineRuleNode(children[0]!)
  // Multiple children = implicit sequence
  const list: Array<MineRule> = []
  for (const child of children) {
    const rule = readMineRuleNode(child)
    if (rule) list.push(rule)
  }
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]
  return { form: 'seq', list }
}

function readMineRuleNode(node: BootstrapNode): MineRule | undefined {
  if (node.name === 'mine') {
    return readMineDirective(node)
  }
  if (node.name === 'save') {
    return readMineSave(node)
  }
  return undefined
}

function readMineDirective(node: BootstrapNode): MineRule | undefined {
  const first = node.terms[0]
  if (!first) {
    // Bare `mine` with no terms - children define the rule
    return readMineRule(node.children)
  }

  // Text literal: mine <X>
  if (first.form === 'text') {
    return { form: 'literal', text: first.text }
  }

  // Character code: mine #uXXXX
  if (first.form === 'code') {
    const hex = first.text.slice(2) // remove #u
    return { form: 'char-code', code: parseInt(hex, 16) }
  }

  // Keyword directives
  if (first.form === 'word') {
    switch (first.text) {
      case 'list':
        return readMineList(node)
      case 'any':
        return readMineAny(node)
      case 'form':
        return readMineRef(node)
      case 'flow':
        return readMineFlow(node)
      case 'maybe':
        return readMineMaybe(node)
      case 'not':
        return readMineNot(node)
      case 'range':
        return readMineRange(node)
    }
  }

  return undefined
}

function readMineList(node: BootstrapNode): MineRule {
  const binds = extractBinds(node.children)
  const ruleChildren = node.children.filter(c => c.name !== 'bind')
  const inner = readMineRule(ruleChildren)
  if (!inner) return { form: 'repeat', rule: { form: 'literal', text: '' } }

  const min = binds.get('minimum')
  const max = binds.get('maximum')

  return {
    form: 'repeat',
    rule: inner,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  }
}

function readMineAny(node: BootstrapNode): MineRule {
  const list: Array<MineRule> = []
  for (const child of node.children) {
    const rule = readMineRuleNode(child)
    if (rule) list.push(rule)
  }
  return { form: 'choice', list }
}

function readMineRef(node: BootstrapNode): MineRule {
  // mine form, form <name> → ref to named rule
  const second = node.terms[1]
  if (!second || second.form !== 'word') {
    return { form: 'literal', text: '' }
  }

  // The second term is "form <name>" — but our parser splits by comma
  // so terms[1] is "form <name>". We need the word after "form".
  // Actually in the bootstrap parser, "mine form, form indented-term"
  // would parse as terms: [{word: "form"}, {word: "form"}, {word: "indented-term"}]
  // Wait, let me reconsider. "form, form indented-term" splits by comma:
  // first segment: "form"
  // second segment: "form indented-term"
  // Then "form indented-term" splits by space into: "form" and "indented-term"
  // So terms would be: [{word: "form"}, {word: "form"}, {word: "indented-term"}]
  // Hmm, that's not right either. Let me think about how parseTerms works.
  //
  // For "form, form indented-term":
  // - Start: i=0, text[0]='f', it's a word → "form", then comma
  // - After comma: text = "form indented-term"
  // - i at 'f': word → "form", then space
  // - i at 'i': word → "indented-term"
  // So terms = [{word:"form"}, {word:"form"}, {word:"indented-term"}]
  //
  // We want the third term (the actual name).
  const name = termWord(node.terms[2]) ?? termWord(second)
  if (!name) return { form: 'literal', text: '' }

  // Extract bindings and takes from children
  const binds: Array<RuleBind> = []
  let take: string | undefined

  for (const child of node.children) {
    if (child.name === 'bind') {
      const bindName = termWord(child.terms[0])
      const bindVal = readRuleVal(child)
      if (bindName && bindVal) {
        binds.push({ name: bindName, value: bindVal })
      }
    } else if (child.name === 'take') {
      take = termWord(child.terms[0])
    }
  }

  return {
    form: 'ref',
    name,
    ...(binds.length > 0 ? { bind: binds } : {}),
    ...(take ? { take } : {}),
  }
}

function readMineFlow(node: BootstrapNode): MineRule {
  // mine flow = sequence of children
  const list: Array<MineRule> = []
  for (const child of node.children) {
    const rule = readMineRuleNode(child)
    if (rule) list.push(rule)
  }
  if (list.length === 1) return list[0]!
  return { form: 'seq', list }
}

function readMineMaybe(node: BootstrapNode): MineRule {
  const inner = readMineRule(node.children)
  if (!inner) return { form: 'literal', text: '' }
  return { form: 'optional', rule: inner }
}

function readMineNot(node: BootstrapNode): MineRule {
  const inner = readMineRule(node.children)
  if (!inner) return { form: 'literal', text: '' }
  return { form: 'not', rule: inner }
}

function readMineRange(node: BootstrapNode): MineRule {
  // mine range, <a>, <z>
  const baseTerm = node.terms[1]
  const headTerm = node.terms[2]
  if (!baseTerm || !headTerm || baseTerm.form !== 'text' || headTerm.form !== 'text') {
    return { form: 'literal', text: '' }
  }
  return {
    form: 'range',
    base: baseTerm.text.charCodeAt(0),
    head: headTerm.text.charCodeAt(0),
  }
}

function readMineSave(node: BootstrapNode): MineRule {
  const name = termWord(node.terms[0])
  if (!name) return { form: 'literal', text: '' }
  const value = readRuleValFromChildren(node.children)
  if (!value) return { form: 'literal', text: '' }
  return { form: 'save', name, value }
}

// ---- Mint Definition Reader ----

function readMintDef(node: BootstrapNode): MintDef | undefined {
  // mint <name>, like <type>
  const name = termWord(node.terms[0])
  if (!name) return undefined

  const like = termWord(node.terms[2]) ?? termWord(node.terms[1]) ?? name

  const cases: Array<MintCase> = []
  let make: MintMake | undefined

  for (const child of node.children) {
    if (child.name === 'case') {
      const caseName = termWord(child.terms[0])
      if (!caseName) continue

      let mintRef: string | undefined
      let slot = ''

      // Look for "mint <name>" in terms
      for (let i = 1; i < child.terms.length; i++) {
        const t = child.terms[i]
        if (t && t.form === 'word' && t.text === 'mint' && i + 1 < child.terms.length) {
          mintRef = termWord(child.terms[i + 1])
        }
      }

      // Look for slot in children
      for (const cc of child.children) {
        if (cc.name === 'slot') {
          slot = termWord(cc.terms[0]) ?? ''
        }
      }

      cases.push({ name: caseName, ...(mintRef ? { mint: mintRef } : {}), slot })
    } else if (child.name === 'hook' && termWord(child.terms[0]) === 'make') {
      make = readMintMake(child)
    }
  }

  return { name, like, cases, make }
}

function readMintMake(hookNode: BootstrapNode): MintMake | undefined {
  // hook make
  //   make <type>
  //     bind <field>, read <slot>
  for (const child of hookNode.children) {
    if (child.name === 'make') {
      const type = termWord(child.terms[0])
      if (!type) continue

      const binds: Array<{ field: string, slot: string }> = []
      for (const bindChild of child.children) {
        if (bindChild.name === 'bind') {
          const field = termWord(bindChild.terms[0])
          // The value is "read <slot>" → terms[1]="read", terms[2]="<slot>"
          const slot = termWord(bindChild.terms[2]) ?? termWord(bindChild.terms[1])
          if (field && slot) {
            binds.push({ field, slot })
          }
        }
      }

      return { type, binds }
    }
  }
  return undefined
}

// ---- Helpers ----

function termWord(term: BootstrapTerm | undefined): string | undefined {
  if (!term) return undefined
  if (term.form === 'word') return term.text
  return undefined
}

function extractBinds(children: Array<BootstrapNode>): Map<string, RuleVal> {
  const binds = new Map<string, RuleVal>()
  for (const child of children) {
    if (child.name === 'bind') {
      const name = termWord(child.terms[0])
      const val = readRuleVal(child)
      if (name && val) binds.set(name, val)
    }
  }
  return binds
}

function readRuleVal(bindNode: BootstrapNode): RuleVal | undefined {
  // bind <name>, <value>
  // value can be: number, read <name>, or from children (call ...)
  const valTerm = bindNode.terms[1]

  if (valTerm) {
    if (valTerm.form === 'mark') {
      return { form: 'const', val: valTerm.value }
    }
    if (valTerm.form === 'word' && valTerm.text === 'read') {
      const readName = termWord(bindNode.terms[2])
      if (readName) return { form: 'read', name: readName }
    }
  }

  // Check children for call
  return readRuleValFromChildren(bindNode.children)
}

function readRuleValFromChildren(children: Array<BootstrapNode>): RuleVal | undefined {
  for (const child of children) {
    if (child.name === 'call') {
      return readCallVal(child)
    }
    if (child.name === 'read') {
      const name = termWord(child.terms[0])
      if (name) return { form: 'read', name }
    }
    // Check if it's a number
    if (child.terms.length > 0 && child.terms[0]?.form === 'mark') {
      return { form: 'const', val: child.terms[0].value }
    }
  }
  return undefined
}

function readCallVal(node: BootstrapNode): RuleVal {
  const fnName = termWord(node.terms[0]) ?? 'add'
  const args: Array<RuleBind> = []

  for (const child of node.children) {
    if (child.name === 'bind') {
      const argName = termWord(child.terms[0])
      const argVal = readRuleVal(child)
      if (argName && argVal) {
        args.push({ name: argName, value: argVal })
      }
    } else if (child.name === 'read') {
      // Positional arg: read <name>
      const readName = termWord(child.terms[0])
      if (readName) {
        args.push({ name: 'a', value: { form: 'read', name: readName } })
      }
    } else if (child.terms.length > 0 && child.terms[0]?.form === 'mark') {
      // Positional arg: number as term
      args.push({ name: 'b', value: { form: 'const', val: child.terms[0].value } })
    } else if (/^-?\d+(\.\d+)?$/.test(child.name)) {
      // Positional arg: bare number as node name
      args.push({ name: 'b', value: { form: 'const', val: Number(child.name) } })
    }
  }

  return { form: 'call', name: fnName, args }
}
