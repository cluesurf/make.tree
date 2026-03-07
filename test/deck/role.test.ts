/**
 * Tests for role-based mill resolution in the deck bridge.
 *
 * Verifies that:
 * - discoverDeckEnv reads role files from deck.tree manifests
 * - resolveMillName selects the correct mill based on role patterns
 * - Hardcoded defaults work (deck.tree -> deck, note.tree -> note)
 * - Path-based fallbacks work when no role config exists
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  discoverDeckEnv,
  resolveMillName,
  createDeckLoadEnv,
} from '@/deck'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deck-role-test-'))
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

describe('resolveMillName without role config', () => {
  it('returns deck for deck.tree', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'deck.tree'),
        env,
      }),
    ).toBe('deck')

    fs.rmSync(root, { recursive: true })
  })

  it('returns note for note.tree', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'note.tree'),
        env,
      }),
    ).toBe('note')

    fs.rmSync(root, { recursive: true })
  })

  it('defaults to code for code/ directory', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'code', 'base.tree'),
        env,
      }),
    ).toBe('code')

    fs.rmSync(root, { recursive: true })
  })

  it('defaults to book for book/ directory', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'book', 'intro.tree'),
        env,
      }),
    ).toBe('book')

    fs.rmSync(root, { recursive: true })
  })

  it('defaults to line for line/ directory', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'line', 'base.tree'),
        env,
      }),
    ).toBe('line')

    fs.rmSync(root, { recursive: true })
  })

  it('defaults to code for unknown paths', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'other', 'file.tree'),
        env,
      }),
    ).toBe('code')

    fs.rmSync(root, { recursive: true })
  })
})

describe('resolveMillName with role config', () => {
  it('reads role file from deck.tree manifest', () => {
    const root = makeTmpDir()

    writeFile(
      path.join(root, 'deck.tree'),
      `deck @test/my-app
  mark <0.0.1>
  role ./base/role
`,
    )

    writeFile(
      path.join(root, 'base', 'role.tree'),
      `role book
  take ~/book/**/*.tree

role code
  take ~/code/**/*.tree
`,
    )

    const env = discoverDeckEnv({ root })
    expect(env.role).toBeDefined()
    expect(env.role!.rules).toHaveLength(2)

    expect(
      resolveMillName({
        filePath: path.join(root, 'code', 'main.tree'),
        env,
      }),
    ).toBe('code')

    expect(
      resolveMillName({
        filePath: path.join(root, 'book', 'intro.tree'),
        env,
      }),
    ).toBe('book')

    fs.rmSync(root, { recursive: true })
  })

  it('role config overrides path-based defaults', () => {
    const root = makeTmpDir()

    writeFile(
      path.join(root, 'deck.tree'),
      `deck @test/my-app
  mark <0.0.1>
  role ./role
`,
    )

    // Map everything in code/special/ to a "special" mill
    writeFile(
      path.join(root, 'role.tree'),
      `role special
  take ~/code/special/**/*.tree

role code
  take ~/code/**/*.tree
`,
    )

    const env = discoverDeckEnv({ root })

    expect(
      resolveMillName({
        filePath: path.join(root, 'code', 'special', 'foo.tree'),
        env,
      }),
    ).toBe('special')

    expect(
      resolveMillName({
        filePath: path.join(root, 'code', 'normal.tree'),
        env,
      }),
    ).toBe('code')

    fs.rmSync(root, { recursive: true })
  })

  it('miss exclusions work in role matching', () => {
    const root = makeTmpDir()

    writeFile(
      path.join(root, 'deck.tree'),
      `deck @test/my-app
  mark <0.0.1>
  role ./role
`,
    )

    writeFile(
      path.join(root, 'role.tree'),
      `role book
  take ~/book/**/*.tree
    miss ~/book/**/code/**/*.tree

role code
  take ~/code/**/*.tree
  take ~/book/**/code/**/*.tree
`,
    )

    const env = discoverDeckEnv({ root })

    // Normal book file -> book mill
    expect(
      resolveMillName({
        filePath: path.join(root, 'book', 'chapter1.tree'),
        env,
      }),
    ).toBe('book')

    // Code inside book -> code mill (excluded from book, matched by code)
    expect(
      resolveMillName({
        filePath: path.join(root, 'book', 'examples', 'code', 'demo.tree'),
        env,
      }),
    ).toBe('code')

    fs.rmSync(root, { recursive: true })
  })

  it('deck.tree always returns deck regardless of role', () => {
    const root = makeTmpDir()

    writeFile(
      path.join(root, 'deck.tree'),
      `deck @test/my-app
  mark <0.0.1>
  role ./role
`,
    )

    writeFile(
      path.join(root, 'role.tree'),
      `role code
  take ~/**/*.tree
`,
    )

    const env = discoverDeckEnv({ root })

    // deck.tree is hardcoded, not affected by role
    expect(
      resolveMillName({
        filePath: path.join(root, 'deck.tree'),
        env,
      }),
    ).toBe('deck')

    fs.rmSync(root, { recursive: true })
  })
})

describe('createDeckLoadEnv includes resolveMillName', () => {
  it('exposes resolveMillName on the load env', () => {
    const root = makeTmpDir()
    const env = discoverDeckEnv({ root })
    const loadEnv = createDeckLoadEnv({
      env,
      parse: () => null,
    })

    expect(typeof loadEnv.resolveMillName).toBe('function')
    expect(
      loadEnv.resolveMillName(path.join(root, 'code', 'main.tree')),
    ).toBe('code')

    fs.rmSync(root, { recursive: true })
  })
})
