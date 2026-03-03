import { describe, it, expect } from 'vitest'
import { loadBook } from '@/load'
import type { LoadEnv } from '@/load'
import type { SurfCard } from '@/surf/form'
import { readCard } from '@/read'
import { desugarCard } from '@/term/desugar'

/**
 * Build an in-memory LoadEnv from a map of file path to file text.
 * Uses the real @cluesurf/tree parser loaded via require.
 */
function makeMemoryEnv(input: {
  files: Record<string, string>
  parse: (input: { file: string; text: string }) => { tree: any } | null
}): LoadEnv {
  return {
    readFile: (path: string) => {
      const text = input.files[path]
      if (text === undefined) throw new Error(`File not found: ${path}`)
      return text
    },
    resolvePath: (fromFile: string, loadPath: string) => {
      // Simple resolution: strip last segment of fromFile, append loadPath + .tree
      const dir = fromFile.replace(/\/[^/]+$/, '')
      const normalized = loadPath.replace(/^\.\//, '')
      const resolved = dir + '/' + normalized + '.tree'
      if (resolved in input.files) return resolved
      return null
    },
    parse: input.parse,
  }
}

// Load the real tree parser for integration tests
let makeTree: ((input: { file: string; text: string }) => any) | null =
  null

try {
  // Navigate from test/load/ up to the tree parser
  const { createRequire } = await import('module')
  const { fileURLToPath } = await import('url')
  const path = await import('path')
  const require_ = createRequire(import.meta.url)
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const treeParsePath = path.resolve(
    __dirname,
    '../../../../../../deck/tree/host/code/index.js',
  )
  makeTree = require_(treeParsePath).default
} catch {
  // Parser not available, skip integration tests
}

describe('load/index', () => {
  describe('single file, no loads', () => {
    it('produces correct book from one file', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/main.tree': [
          'task double',
          '  take n, like u64',
          '  back call mul',
          '    bind a, loan n',
          '    bind b, mark 2',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/main.tree', env })

      expect(result.files).toEqual(['/src/main.tree'])
      expect(result.book.has('double')).toBe(true)
      expect(result.book.size).toBe(1)
    })
  })

  describe('two files with relative load', () => {
    it('merges definitions from both files', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/nat.tree': [
          'form nat',
          '  case zero',
          '  case succ',
          '    link pred',
        ].join('\n'),
        '/src/main.tree': [
          'load ./nat',
          '  find form nat',
          '',
          'task double',
          '  take n, like u64',
          '  back call mul',
          '    bind a, loan n',
          '    bind b, mark 2',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/main.tree', env })

      expect(result.files).toEqual(['/src/main.tree', '/src/nat.tree'])
      expect(result.book.has('nat')).toBe(true)
      expect(result.book.has('double')).toBe(true)
    })
  })

  describe('circular import', () => {
    it('does not loop and includes both files once', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/a.tree': [
          'load ./b',
          '',
          'task foo',
          '  back mark 1',
        ].join('\n'),
        '/src/b.tree': [
          'load ./a',
          '',
          'task bar',
          '  back mark 2',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/a.tree', env })

      expect(result.files).toEqual(['/src/a.tree', '/src/b.tree'])
      expect(result.book.has('foo')).toBe(true)
      expect(result.book.has('bar')).toBe(true)
    })
  })

  describe('transitive loads', () => {
    it('loads A -> B -> C and includes all definitions', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/c.tree': [
          'task baz',
          '  back mark 3',
        ].join('\n'),
        '/src/b.tree': [
          'load ./c',
          '',
          'task bar',
          '  back mark 2',
        ].join('\n'),
        '/src/a.tree': [
          'load ./b',
          '',
          'task foo',
          '  back mark 1',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/a.tree', env })

      expect(result.files).toEqual([
        '/src/a.tree',
        '/src/b.tree',
        '/src/c.tree',
      ])
      expect(result.book.has('foo')).toBe(true)
      expect(result.book.has('bar')).toBe(true)
      expect(result.book.has('baz')).toBe(true)
    })
  })

  describe('missing file', () => {
    it('gracefully skips missing imports', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/main.tree': [
          'load ./missing',
          '',
          'task foo',
          '  back mark 1',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/main.tree', env })

      expect(result.files).toEqual(['/src/main.tree'])
      expect(result.book.has('foo')).toBe(true)
    })
  })

  describe('load ordering', () => {
    it('imported definitions appear before importing file', () => {
      if (!makeTree) return

      const files: Record<string, string> = {
        '/src/dep.tree': [
          'task alpha',
          '  back mark 1',
        ].join('\n'),
        '/src/main.tree': [
          'load ./dep',
          '',
          'task beta',
          '  back mark 2',
        ].join('\n'),
      }

      const env = makeMemoryEnv({ files, parse: makeTree })
      const result = loadBook({ file: '/src/main.tree', env })

      const keys = [...result.book.keys()]
      const alphaIdx = keys.indexOf('alpha')
      const betaIdx = keys.indexOf('beta')
      expect(alphaIdx).toBeLessThan(betaIdx)
    })
  })
})
