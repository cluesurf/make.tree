/**
 * Fixture-based tests for the string parser.
 *
 * Loads .tree fixture files (input + --- + expected output),
 * parses the input, serializes the output, and compares.
 * Fixtures are copied from deck/tree/test/file/.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { StringParser } from '@/parser/index'
import { loadGrammar } from '@/parser/grammar-loader'
import { showTree } from '@/parser/tree-show'
import type { MineDef, MintDef } from '@/parser/form'

const GRAMMAR_DIR = resolve(__dirname, '../../../code.tree/code/tree')
const FIXTURE_DIR = resolve(__dirname, 'file')

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

function loadFixture(name: string): { input: string, expected: string } {
  const content = readFileSync(resolve(FIXTURE_DIR, name), 'utf-8')
  const [input, expected] = content.split(/\n---\n/).map(s => s.trim())
  if (!input || !expected) {
    throw new Error(`Fixture ${name} missing input or expected section`)
  }
  return { input, expected }
}

function assertFixture(name: string) {
  const { input, expected } = loadFixture(name)
  const parser = new StringParser({ mine, mint, entry: 'tree' })
  const result = parser.parse({ text: input + '\n', file: name })
  expect(result.output).toBeTruthy()
  const output = showTree(result.output ?? undefined).trim()
  expect(output).toBe(expected)
}

describe('fixtures', () => {
  // ---- Working fixtures (basic grammar) ----

  it('all.tree', () => {
    assertFixture('all.tree')
  })

  it('line.tree', () => {
    assertFixture('line.tree')
  })

  it('nesting-basic.tree', () => {
    assertFixture('nesting-basic.tree')
  })

  it('nesting-basic-revert.tree', () => {
    assertFixture('nesting-basic-revert.tree')
  })

  // ---- Pending fixtures (need grammar extensions) ----
  // These fixtures use features not yet in the grammar.
  // Enable as the grammar grows.

  it.skip('values.tree (needs interpolation, bare paths)', () => {
    assertFixture('values.tree')
  })

  it.skip('text.tree (needs multiline text blocks)', () => {
    assertFixture('text.tree')
  })

  it.skip('text-lines.tree (needs multiline text blocks)', () => {
    assertFixture('text-lines.tree')
  })

  it.skip('text-multiline.tree (needs multiline text blocks)', () => {
    assertFixture('text-multiline.tree')
  })

  it.skip('deck.tree (needs interpolation, text blocks)', () => {
    assertFixture('deck.tree')
  })

  it.skip('index.tree (needs interpolation in paths)', () => {
    assertFixture('index.tree')
  })

  it.skip('path.tree (needs interpolation, absolute paths)', () => {
    assertFixture('path.tree')
  })

  it.skip('optional-path.tree (needs optional markers)', () => {
    assertFixture('optional-path.tree')
  })

  it.skip('interpolated-end.tree (needs interpolation)', () => {
    assertFixture('interpolated-end.tree')
  })

  it.skip('interpolated-prop.tree (needs interpolation)', () => {
    assertFixture('interpolated-prop.tree')
  })

  it.skip('interpolated-start-prop.tree (needs interpolation)', () => {
    assertFixture('interpolated-start-prop.tree')
  })

  it.skip('interpolation-nesting.tree (needs interpolation)', () => {
    assertFixture('interpolation-nesting.tree')
  })

  it.skip('interpolation-with-path.tree (needs interpolation)', () => {
    assertFixture('interpolation-with-path.tree')
  })

  it.skip('line-nick.tree (needs interpolation)', () => {
    assertFixture('line-nick.tree')
  })

  it.skip('nesting-ugly.tree (needs interpolation)', () => {
    assertFixture('nesting-ugly.tree')
  })

  it.skip('sink.tree (needs interpolation, multiline text)', () => {
    assertFixture('sink.tree')
  })

  it.skip('term-interpolation-complex.tree (needs interpolation)', () => {
    assertFixture('term-interpolation-complex.tree')
  })
})
