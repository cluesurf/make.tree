/**
 * Multi-file TypeScript compilation tests.
 *
 * Verifies that castBookToFiles emits correct import/export statements
 * when definitions span multiple files.
 */

import { resolve, dirname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { loadBook } from '@/load'
import { castBookToFiles } from '@/cast/typescript'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function loadAndCompile(entryFile: string) {
  const file = resolve(TEST_DIR, entryFile)
  const result = loadBook({
    file,
    env: {
      readFile: p => readFileSync(p, 'utf8'),
      resolvePath: (fromFile, loadPath) => {
        const dir = dirname(fromFile)
        const direct = resolve(dir, loadPath + '.tree')
        if (existsSync(direct)) return direct
        return null
      },
      parse: input => makeTree(input),
    },
  })

  const files = castBookToFiles({
    book: result.book,
    fileMap: result.fileMap,
  })

  return { files, fileMap: result.fileMap, book: result.book }
}

describe('multi-file TS compilation: fileMap tracking', () => {
  it('tracks definitions per file for math/nat', () => {
    const { fileMap } = loadAndCompile('math.tree')

    let natDefs: string[] = []
    let mathDefs: string[] = []
    for (const [file, defs] of fileMap) {
      if (file.endsWith('nat.tree')) natDefs = defs
      if (file.endsWith('math.tree')) mathDefs = defs
    }

    expect(natDefs).toContain('nat')
    expect(natDefs).toContain('make-zero')
    expect(natDefs).toContain('make-succ')
    expect(mathDefs).toContain('fib')
    expect(mathDefs).toContain('fib-tail')
    expect(mathDefs).toContain('double')
  })

  it('returns fileMap with correct number of files', () => {
    const { fileMap } = loadAndCompile('math.tree')
    expect(fileMap.size).toBe(2)
  })
})

describe('multi-file TS compilation: import emission', () => {
  it('emits import for cross-file function calls', () => {
    const { files } = loadAndCompile('multi-a.tree')

    let aCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('multi-a.tree')) aCode = code
    }

    // multi-a.tree calls greet() from multi-b.tree
    expect(aCode).toContain('import { greet }')
    expect(aCode).toContain('multi-b')
  })

  it('does not import definitions from the same file', () => {
    const { files } = loadAndCompile('multi-a.tree')

    let bCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('multi-b.tree')) bCode = code
    }

    // multi-b.tree has no cross-file refs
    expect(bCode).not.toContain('import')
  })

  it('exports all definitions', () => {
    const { files } = loadAndCompile('multi-a.tree')

    let aCode = ''
    let bCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('multi-a.tree')) aCode = code
      if (file.endsWith('multi-b.tree')) bCode = code
    }

    expect(aCode).toContain('export function hello')
    expect(bCode).toContain('export function greet')
  })
})

describe('multi-file TS compilation: value + function imports', () => {
  it('imports function used cross-file', () => {
    const { files } = loadAndCompile('multi-d.tree')

    let dCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('multi-d.tree')) dCode = code
    }

    // multi-d uses colorName from multi-c
    expect(dCode).toContain('import { colorName }')
    expect(dCode).toContain('multi-c')
  })

  it('does not import ADT type when only function is used', () => {
    const { files } = loadAndCompile('multi-d.tree')

    let dCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('multi-d.tree')) dCode = code
    }

    // multi-d only uses color-name function, not the color ADT
    expect(dCode).not.toContain('import type')
  })
})

describe('multi-file TS compilation: ADT across files', () => {
  it('emits ADT type in defining file', () => {
    const { files } = loadAndCompile('math.tree')

    let natCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('nat.tree')) natCode = code
    }

    expect(natCode).toContain('export type Nat')
  })

  it('nat.tree emits constructor functions', () => {
    const { files } = loadAndCompile('math.tree')

    let natCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('nat.tree')) natCode = code
    }

    // make-zero has no params, becomes const
    expect(natCode).toContain('export const makeZero')
    expect(natCode).toContain('export function makeSucc')
  })

  it('inlines ADT tags so no runtime import needed', () => {
    const { files } = loadAndCompile('math.tree')

    let mathCode = ''
    for (const [file, code] of files) {
      if (file.endsWith('math.tree')) mathCode = code
    }

    // TS backend inlines tag numbers, so no runtime import of nat constructors
    // The pattern match uses n.$ === 0 directly
    expect(mathCode).toContain('.$ ===')
    expect(mathCode).toContain('export function fib')
  })
})
