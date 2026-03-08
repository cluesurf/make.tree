import { resolve } from 'path'
import { describe, it, beforeAll } from 'vitest'
import { StringParser } from '@/parser/index'
import { loadGrammar } from '@/parser/grammar-loader'
import { showTree } from '@/parser/tree-show'
import type { MineDef, MintDef } from '@/parser/form'

const GRAMMAR_DIR = resolve(__dirname, '../../../code.tree/code/tree')

let mine: Map<string, MineDef>
let mint: Map<string, MintDef>

beforeAll(() => {
  const grammar = loadGrammar({
    minePath: resolve(GRAMMAR_DIR, 'mine.tree'),
    mintPath: resolve(GRAMMAR_DIR, 'mint.tree'),
  })
  mine = grammar.mine
  mint = grammar.mint
})

function makeTreeParser() {
  return new StringParser({ mine, mint, entry: 'tree' })
}

describe('debug', () => {
  it('form two AST', () => {
    const parser = makeTreeParser()
    const result = parser.parse({ text: 'form two\n', file: 'test.tree' })
    console.log('AST:', JSON.stringify(result.output, null, 2))
    console.log('show:', showTree(result.output ?? undefined))
  })

  it('parent child AST', () => {
    const parser = makeTreeParser()
    const result = parser.parse({ text: 'parent\n  child\n', file: 'test.tree' })
    console.log('AST:', JSON.stringify(result.output, null, 2))
    console.log('show:', showTree(result.output ?? undefined))
  })

  it('a b c nesting AST', () => {
    const parser = makeTreeParser()
    const result = parser.parse({ text: 'a b c d\n  x y z\n', file: 'test.tree' })
    console.log('AST:', JSON.stringify(result.output, null, 2))
    console.log('show:', showTree(result.output ?? undefined))
  })
})
