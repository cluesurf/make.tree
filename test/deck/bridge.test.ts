/**
 * Tests for the compiler ↔ package manager bridge.
 *
 * Verifies that the deck bridge correctly:
 * - Discovers workspace packages from deck/ directories
 * - Resolves package imports through workspace → link/ → null
 * - Creates LoadEnv compatible with the compiler pipeline
 * - Handles various path resolution patterns
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  discoverDeckEnv,
  resolvePackageFile,
  createDeckLoadEnv,
  type DeckEnv,
} from '@/deck'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deck-bridge-test-'))
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

// -- discoverDeckEnv tests --

describe('discoverDeckEnv', () => {
  it('returns empty workspaces when no deck/ directory exists', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(env.root).toBe(root)
    expect(env.workspaces.size).toBe(0)
    expect(env.installed).toBe(false)

    fs.rmSync(root, { recursive: true })
  })

  it('discovers workspace packages in deck/ directory', () => {
    const root = makeTmpDir()

    // Create a workspace package with deck.tree manifest
    writeFile(
      path.join(root, 'deck', 'my-pkg', 'deck.tree'),
      'deck @test/my-pkg\n',
    )

    const env = discoverDeckEnv({ root })

    expect(env.workspaces.size).toBe(1)
    expect(env.workspaces.has('@test/my-pkg')).toBe(true)
    expect(env.workspaces.get('@test/my-pkg')).toBe(
      path.join(root, 'deck', 'my-pkg'),
    )

    fs.rmSync(root, { recursive: true })
  })

  it('discovers nested workspace packages', () => {
    const root = makeTmpDir()

    writeFile(
      path.join(root, 'deck', 'outer', 'deck.tree'),
      'deck @test/outer\n',
    )
    writeFile(
      path.join(root, 'deck', 'outer', 'inner', 'deck.tree'),
      'deck @test/inner\n',
    )

    const env = discoverDeckEnv({ root })

    expect(env.workspaces.size).toBe(2)
    expect(env.workspaces.has('@test/outer')).toBe(true)
    expect(env.workspaces.has('@test/inner')).toBe(true)

    fs.rmSync(root, { recursive: true })
  })

  it('detects installed state when link/ exists', () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'link'), { recursive: true })

    const env = discoverDeckEnv({ root })
    expect(env.installed).toBe(true)

    fs.rmSync(root, { recursive: true })
  })

  it('ignores directories without deck.tree manifests', () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'deck', 'no-manifest'), { recursive: true })

    const env = discoverDeckEnv({ root })
    expect(env.workspaces.size).toBe(0)

    fs.rmSync(root, { recursive: true })
  })
})

// -- resolvePackageFile tests --

describe('resolvePackageFile', () => {
  it('resolves workspace package with base.tree', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'base-pkg')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/base\n')
    writeFile(path.join(pkgDir, 'code', 'math', 'base.tree'), 'task add\n  like u64\n')

    const env = discoverDeckEnv({ root })
    const result = resolvePackageFile({
      loadPath: '@test/base/code/math',
      env,
    })

    expect(result).toBe(path.join(pkgDir, 'code', 'math', 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves workspace package with direct .tree file', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'base-pkg')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/base\n')
    writeFile(path.join(pkgDir, 'code', 'utils.tree'), 'task helper\n  like text\n')

    const env = discoverDeckEnv({ root })
    const result = resolvePackageFile({
      loadPath: '@test/base/code/utils',
      env,
    })

    expect(result).toBe(path.join(pkgDir, 'code', 'utils.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves package entry point (note.tree)', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'base-pkg')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/base\n')
    writeFile(path.join(pkgDir, 'note.tree'), 'load ./code/main\n')

    const env = discoverDeckEnv({ root })
    const result = resolvePackageFile({
      loadPath: '@test/base',
      env,
    })

    expect(result).toBe(path.join(pkgDir, 'note.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves package entry point (base.tree fallback)', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'base-pkg')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/base\n')
    writeFile(path.join(pkgDir, 'base.tree'), 'task main\n  like u64\n')

    const env = discoverDeckEnv({ root })
    const result = resolvePackageFile({
      loadPath: '@test/base',
      env,
    })

    expect(result).toBe(path.join(pkgDir, 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves from link/ directory for installed packages', () => {
    const root = makeTmpDir()
    const linkPkg = path.join(root, 'link', '@other', 'lib')
    writeFile(path.join(linkPkg, 'code', 'base.tree'), 'task foo\n  like u64\n')
    // link/ exists so installed = true
    const env: DeckEnv = {
      root,
      workspaces: new Map(),
      installed: true,
    }

    const result = resolvePackageFile({
      loadPath: '@other/lib/code',
      env,
    })

    expect(result).toBe(path.join(linkPkg, 'code', 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('prefers workspace over link/ directory', () => {
    const root = makeTmpDir()

    // Workspace version
    const wsDir = path.join(root, 'deck', 'my-lib')
    writeFile(path.join(wsDir, 'deck.tree'), 'deck @test/lib\n')
    writeFile(path.join(wsDir, 'code', 'base.tree'), 'task ws-version\n  like u64\n')

    // Link version
    const linkDir = path.join(root, 'link', '@test', 'lib')
    writeFile(path.join(linkDir, 'code', 'base.tree'), 'task link-version\n  like u64\n')

    const env = discoverDeckEnv({ root })

    const result = resolvePackageFile({
      loadPath: '@test/lib/code',
      env,
    })

    // Should resolve to workspace, not link/
    expect(result).toBe(path.join(wsDir, 'code', 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('returns null for non-package paths', () => {
    const root = makeTmpDir()
    const env: DeckEnv = { root, workspaces: new Map(), installed: false }

    expect(resolvePackageFile({ loadPath: 'relative/path', env })).toBeNull()
    expect(resolvePackageFile({ loadPath: './local', env })).toBeNull()

    fs.rmSync(root, { recursive: true })
  })

  it('returns null for unresolvable package', () => {
    const root = makeTmpDir()
    const env: DeckEnv = { root, workspaces: new Map(), installed: false }

    const result = resolvePackageFile({
      loadPath: '@unknown/pkg/code',
      env,
    })

    expect(result).toBeNull()

    fs.rmSync(root, { recursive: true })
  })

  it('resolves note.tree as submodule index', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'base-pkg')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/base\n')
    writeFile(path.join(pkgDir, 'code', 'math', 'note.tree'), 'load ./add\nload ./sub\n')

    const env = discoverDeckEnv({ root })
    const result = resolvePackageFile({
      loadPath: '@test/base/code/math',
      env,
    })

    expect(result).toBe(path.join(pkgDir, 'code', 'math', 'note.tree'))

    fs.rmSync(root, { recursive: true })
  })
})

// -- createDeckLoadEnv tests --

describe('createDeckLoadEnv', () => {
  it('reads files from disk', () => {
    const root = makeTmpDir()
    const filePath = path.join(root, 'test.tree')
    writeFile(filePath, 'task hello\n  like text\n')

    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    expect(loadEnv.readFile(filePath)).toBe('task hello\n  like text\n')

    fs.rmSync(root, { recursive: true })
  })

  it('resolves package imports through deck bridge', () => {
    const root = makeTmpDir()
    const pkgDir = path.join(root, 'deck', 'my-lib')
    writeFile(path.join(pkgDir, 'deck.tree'), 'deck @test/lib\n')
    writeFile(path.join(pkgDir, 'code', 'base.tree'), 'task foo\n  like u64\n')

    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    const result = loadEnv.resolvePath('/some/file.tree', '@test/lib/code')
    expect(result).toBe(path.join(pkgDir, 'code', 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves relative imports using filesystem', () => {
    const root = makeTmpDir()
    writeFile(path.join(root, 'code', 'main.tree'), 'load ./utils\n')
    writeFile(path.join(root, 'code', 'utils.tree'), 'task helper\n  like text\n')

    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    const result = loadEnv.resolvePath(
      path.join(root, 'code', 'main.tree'),
      './utils',
    )
    expect(result).toBe(path.join(root, 'code', 'utils.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('resolves relative imports with base.tree convention', () => {
    const root = makeTmpDir()
    writeFile(path.join(root, 'code', 'math', 'base.tree'), 'task add\n  like u64\n')

    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    const result = loadEnv.resolvePath(
      path.join(root, 'code', 'main.tree'),
      './math',
    )
    expect(result).toBe(path.join(root, 'code', 'math', 'base.tree'))

    fs.rmSync(root, { recursive: true })
  })

  it('returns null for unresolvable relative imports', () => {
    const root = makeTmpDir()

    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    const result = loadEnv.resolvePath(
      path.join(root, 'code', 'main.tree'),
      './nonexistent',
    )
    expect(result).toBeNull()

    fs.rmSync(root, { recursive: true })
  })

  it('passes parse function through', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    let parseCalled = false
    const loadEnv = createDeckLoadEnv({
      env,
      parse: (input) => {
        parseCalled = true
        return { tree: {} }
      },
    })

    loadEnv.parse({ file: 'test.tree', text: 'task foo\n' })
    expect(parseCalled).toBe(true)

    fs.rmSync(root, { recursive: true })
  })
})
