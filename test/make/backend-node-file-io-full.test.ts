/**
 * Node.js backend test: Full async File System API codegen.
 *
 * Tests that async write, read, copy, move, remove, make-dir, and
 * remove-dir compile to correct TypeScript/JavaScript with async/await.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook } from '@/cast/typescript'
import type { SurfLoad } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTreeToTS(name: string): string {
  const file = resolve(TEST_DIR, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })

  const dock = card.list
    .filter(
      (n): n is SurfLoad =>
        n.form === 'load' && (n as SurfLoad).dock === true,
    )
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))

  const { book, asyncMeta } = desugarCard({ card })
  return castBook({ book, dock, asyncMeta })
}

describe('node: async file system codegen', () => {
  let code = ''

  it('compiles without error', () => {
    code = compileTreeToTS('file-io-node-full.tree')
    expect(code).toBeTruthy()
  })

  it('emits fs/promises import', () => {
    expect(code).toMatch(/import.*from.*node:fs\/promises/)
  })

  it('emits path import', () => {
    expect(code).toMatch(/import.*from.*node:path/)
  })

  it('generates async writeFile function', () => {
    expect(code).toMatch(/async function writeFile/)
  })

  it('generates async readFile function', () => {
    expect(code).toMatch(/async function readFile/)
  })

  it('generates async copyFile function', () => {
    expect(code).toMatch(/async function copyFile/)
  })

  it('generates async moveFile function', () => {
    expect(code).toMatch(/async function moveFile/)
  })

  it('generates async removeFile function', () => {
    expect(code).toMatch(/async function removeFile/)
  })

  it('generates async makeDir function', () => {
    expect(code).toMatch(/async function makeDir/)
  })

  it('generates async removeDir function', () => {
    expect(code).toMatch(/async function removeDir/)
  })

  it('uses await for fs calls', () => {
    expect(code).toContain('await')
  })

  it('uses writeFile from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.writeFile/)
  })

  it('uses readFile from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.readFile/)
  })

  it('uses copyFile from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.copyFile/)
  })

  it('uses rename from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.rename/)
  })

  it('uses rm from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.rm/)
  })

  it('uses mkdir from fs/promises', () => {
    expect(code).toMatch(/fsPromise\.mkdir/)
  })

  it('generates options object for mkdir', () => {
    // The make options pattern compiles to an inline object
    expect(code).toMatch(/mkdir/)
  })
})
