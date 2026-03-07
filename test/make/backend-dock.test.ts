/**
 * Tests for dock load (FFI) support across all backends,
 * and conditional platform resolution.
 */

import { describe, it, expect } from 'vitest'
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
import { rewritePlatformPath } from '@/deck'
import type { SurfLoad } from '@/surf/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileTree(text: string) {
  const lead = makeTree({ file: 'test.tree', text })
  const rawCard = readCard({ tree: lead.tree, file: 'test.tree' })
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

  const { book } = desugarCard({ card })
  return { book, dock }
}

describe('dock load extraction', () => {
  it('extracts dock loads from surface AST', () => {
    const { dock } = compileTree(`
dock
  load <node:fs/promises>, name fs-promise
`)
    expect(dock).toHaveLength(1)
    expect(dock[0]!.path).toBe('node:fs/promises')
    expect(dock[0]!.name).toBe('fs-promise')
  })

  it('extracts multiple dock loads', () => {
    const { dock } = compileTree(`
dock
  load <node:fs/promises>, name fs-promise
  load <node:path>, name node-path
`)
    expect(dock).toHaveLength(2)
    expect(dock[0]!.name).toBe('fs-promise')
    expect(dock[1]!.name).toBe('node-path')
  })
})

describe('dock load codegen - TypeScript', () => {
  it('emits import statement for dock module', () => {
    const { book, dock } = compileTree(`
dock
  load <node:fs/promises>, name fs-promise

task read-data
  take path, like text
  send back
    call fs-promise/read-file
      bind path, read path
`)
    const code = castTS({ book, dock })
    expect(code).toContain("import fsPromise from 'node:fs/promises'")
    expect(code).toContain('fsPromise.readFile')
  })
})

describe('dock load codegen - Rust', () => {
  it('emits use statement for dock module', () => {
    const { book, dock } = compileTree(`
dock
  load <std::fs>, name std-fs

task read-data
  take path, like text
  send back
    call std-fs/read-to-string
      bind path, read path
`)
    const code = castRust({ book, dock })
    expect(code).toContain('use std::fs')
    expect(code).toContain('std_fs::read_to_string')
  })
})

describe('dock load codegen - Kotlin', () => {
  it('emits import statement for dock module', () => {
    const { book, dock } = compileTree(`
dock
  load <java.io.File>, name java-file

task read-data
  take path, like text
  send back
    call java-file/read-text
      bind path, read path
`)
    const code = castKotlin({ book, dock })
    expect(code).toContain('import java.io.File')
    expect(code).toContain('javaFile.readText')
  })
})

describe('dock load codegen - Swift', () => {
  it('emits import statement for dock module', () => {
    const { book, dock } = compileTree(`
dock
  load <Foundation>, name foundation

task read-data
  take path, like text
  send back
    call foundation/contents-of-file
      bind path, read path
`)
    const code = castSwift({ book, dock })
    expect(code).toContain('import Foundation')
    expect(code).toContain('foundation.contentsOfFile')
  })
})

describe('conditional platform resolution', () => {
  it('rewrites native/node path for rust target', () => {
    const result = rewritePlatformPath({ rest: 'code/native/node/file', target: 'rust' })
    expect(result).toBe('code/native/rust/file')
  })

  it('rewrites native/rust path for typescript target', () => {
    const result = rewritePlatformPath({ rest: 'code/native/rust/file', target: 'typescript' })
    expect(result).toBe('code/native/node/file')
  })

  it('rewrites native/node path for kotlin target', () => {
    const result = rewritePlatformPath({ rest: 'code/native/node/process', target: 'kotlin' })
    expect(result).toBe('code/native/kotlin/process')
  })

  it('rewrites native/node path for swift target', () => {
    const result = rewritePlatformPath({ rest: 'code/native/node/file', target: 'swift' })
    expect(result).toBe('code/native/swift/file')
  })

  it('does not rewrite when target matches platform', () => {
    const result = rewritePlatformPath({ rest: 'code/native/node/file', target: 'typescript' })
    expect(result).toBeNull()
  })

  it('does not rewrite shared platform', () => {
    const result = rewritePlatformPath({ rest: 'code/native/shared/hash', target: 'rust' })
    expect(result).toBeNull()
  })

  it('does not rewrite paths without native segment', () => {
    const result = rewritePlatformPath({ rest: 'code/boolean', target: 'rust' })
    expect(result).toBeNull()
  })
})
