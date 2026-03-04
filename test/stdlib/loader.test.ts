/**
 * Tests for the filesystem-based stdlib loader.
 *
 * Verifies that @cluesurf/base and @cluesurf/case package paths
 * resolve to real .tree files on disk and produce valid SurfCards.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import {
  resolveStdlib,
  resolvePackagePath,
  setStdlibRoot,
  clearStdlibCache,
} from '@/stdlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load the tree parser
const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

// The stdlib root: deck/seed/deck/
const stdlibRoot = path.resolve(__dirname, '../../../')

const parse = (input: { file: string; text: string }) =>
  makeTree(input)

beforeEach(() => {
  clearStdlibCache()
  setStdlibRoot({ root: stdlibRoot })
})

describe('resolvePackagePath', () => {
  it('maps @cluesurf/base paths to filesystem', () => {
    const result = resolvePackagePath({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      root: stdlibRoot,
    })
    expect(result).toContain('base.tree/code/base/form/boolean/base.tree')
  })

  it('maps @cluesurf/bind paths to filesystem', () => {
    const result = resolvePackagePath({
      loadPath: '@cluesurf/bind/code/node/fs',
      root: stdlibRoot,
    })
    expect(result).toContain('bind.tree/code/node/fs/base.tree')
  })

  it('returns null for non-cluesurf paths', () => {
    const result = resolvePackagePath({
      loadPath: '@other/something',
      root: stdlibRoot,
    })
    expect(result).toBeNull()
  })

  it('returns null for @cluesurf/term paths', () => {
    const result = resolvePackagePath({
      loadPath: '@cluesurf/term/code/file',
      root: stdlibRoot,
    })
    expect(result).toBeNull()
  })
})

describe('resolveStdlib legacy', () => {
  it('resolves legacy @cluesurf/term/code/file', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/term/code/file',
    })
    expect(card).not.toBeNull()
    expect(card!.list.length).toBeGreaterThan(0)
  })

  it('resolves legacy @cluesurf/term/code/folder', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/term/code/folder',
    })
    expect(card).not.toBeNull()
  })
})

describe('resolveStdlib filesystem', () => {
  it('loads boolean form from base.tree', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      parse,
    })
    expect(card).not.toBeNull()
    expect(card!.list.length).toBeGreaterThan(0)
    // Should contain a form named 'boolean'
    const forms = card!.list.filter(n => n.form === 'form')
    expect(forms.length).toBeGreaterThan(0)
  })

  it('loads maybe form from base.tree', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/maybe',
      parse,
    })
    expect(card).not.toBeNull()
    const forms = card!.list.filter(n => n.form === 'form')
    expect(forms.length).toBeGreaterThan(0)
  })

  it('loads result form from base.tree', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/result',
      parse,
    })
    expect(card).not.toBeNull()
    const forms = card!.list.filter(n => n.form === 'form')
    expect(forms.length).toBeGreaterThan(0)
  })

  it('returns null for nonexistent path', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/nonexistent-type-xyz',
      parse,
    })
    expect(card).toBeNull()
  })

  it('caches results across calls', () => {
    const card1 = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      parse,
    })
    const card2 = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      parse,
    })
    // Should be the exact same object (cached)
    expect(card1).toBe(card2)
  })

  it('cache clears properly', () => {
    const card1 = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      parse,
    })
    clearStdlibCache()
    const card2 = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
      parse,
    })
    // Different object after cache clear
    expect(card1).not.toBe(card2)
    // But same content
    expect(card2).not.toBeNull()
  })
})

describe('resolveStdlib without parse', () => {
  it('returns null for filesystem paths when no parse provided', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/base/code/base/form/boolean',
    })
    expect(card).toBeNull()
  })

  it('still resolves legacy paths without parse', () => {
    const card = resolveStdlib({
      loadPath: '@cluesurf/term/code/file',
    })
    expect(card).not.toBeNull()
  })
})
