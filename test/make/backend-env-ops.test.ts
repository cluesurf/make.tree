/**
 * Cross-backend tests for environment variable and working directory operations.
 *
 * Validates that env var get/set/remove/check and working directory
 * get/set compile through all backends.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import type { SurfLoad } from '@/surf/form'
import type { Book } from '@/term/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): { book: Book; dock: Array<{ path: string; name?: string }> } {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })

  const dock: Array<{ path: string; name?: string }> = []
  for (const node of card.list) {
    if (node.form === 'load') {
      const loadNode = node as SurfLoad
      if (loadNode.dock) {
        dock.push({ path: loadNode.path.join('/'), name: loadNode.name })
      }
    }
  }

  return { book: desugarCard({ card }).book, dock }
}

describe('env ops: TypeScript', () => {
  const { book, dock } = compileFile('env-ops.tree')
  const ts = castTS({ book, dock })

  it('emits import for process', () => {
    expect(ts).toContain("import process from 'node:process'")
  })

  it('generates getVar function', () => {
    expect(ts).toContain('export function getVar(')
  })

  it('generates setVar function', () => {
    expect(ts).toContain('export function setVar(')
  })

  it('generates checkVar function', () => {
    expect(ts).toContain('export function checkVar(')
  })

  it('generates removeVar function', () => {
    expect(ts).toContain('export function removeVar(')
  })

  it('generates getDirectory function', () => {
    expect(ts).toContain('getDirectory')
  })

  it('generates setDirectory function', () => {
    expect(ts).toContain('export function setDirectory(')
  })
})

describe('env ops: Rust', () => {
  const { book, dock } = compileFile('env-ops.tree')
  const rs = castRust({ book, dock })

  it('generates get_var function', () => {
    expect(rs).toContain('fn get_var(')
  })

  it('generates set_var function', () => {
    expect(rs).toContain('fn set_var(')
  })

  it('generates check_var function', () => {
    expect(rs).toContain('fn check_var(')
  })

  it('generates remove_var function', () => {
    expect(rs).toContain('fn remove_var(')
  })

  it('generates get_directory function', () => {
    expect(rs).toContain('get_directory')
  })

  it('generates set_directory function', () => {
    expect(rs).toContain('fn set_directory(')
  })
})

describe('env ops: Kotlin', () => {
  const { book, dock } = compileFile('env-ops.tree')
  const kt = castKotlin({ book, dock })

  it('generates getVar function', () => {
    expect(kt).toContain('fun getVar(')
  })

  it('generates setVar function', () => {
    expect(kt).toContain('fun setVar(')
  })

  it('generates checkVar function', () => {
    expect(kt).toContain('fun checkVar(')
  })

  it('generates removeVar function', () => {
    expect(kt).toContain('fun removeVar(')
  })

  it('generates getDirectory function', () => {
    expect(kt).toContain('getDirectory')
  })

  it('generates setDirectory function', () => {
    expect(kt).toContain('fun setDirectory(')
  })
})

describe('env ops: Swift', () => {
  const { book, dock } = compileFile('env-ops.tree')
  const sw = castSwift({ book, dock })

  it('generates getVar function', () => {
    expect(sw).toContain('func getVar(')
  })

  it('generates setVar function', () => {
    expect(sw).toContain('func setVar(')
  })

  it('generates checkVar function', () => {
    expect(sw).toContain('func checkVar(')
  })

  it('generates removeVar function', () => {
    expect(sw).toContain('func removeVar(')
  })

  it('generates getDirectory function', () => {
    expect(sw).toContain('getDirectory')
  })

  it('generates setDirectory function', () => {
    expect(sw).toContain('func setDirectory(')
  })
})
